import { useCallback, useEffect, useMemo, useState } from 'react'

function base64UrlToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const normalized = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = window.atob(normalized)
  const outputArray = new Uint8Array(rawData.length)
  for (let i = 0; i < rawData.length; i += 1) {
    outputArray[i] = rawData.charCodeAt(i)
  }
  return outputArray
}

function readSubscriptionKeys(subscription) {
  const p256dh = subscription.getKey('p256dh')
  const auth = subscription.getKey('auth')
  const toBase64 = (key) => {
    if (!key) return null
    const bytes = new Uint8Array(key)
    let binary = ''
    for (const byte of bytes) binary += String.fromCharCode(byte)
    return window.btoa(binary)
  }
  return {
    p256dh: toBase64(p256dh),
    auth: toBase64(auth),
  }
}

export default function useWebPushNotifications({ supabaseClient }) {
  const [isSupported, setIsSupported] = useState(false)
  const [permission, setPermission] = useState('default')
  const [isBusy, setIsBusy] = useState(false)
  const [statusMessage, setStatusMessage] = useState('')
  const [isSubscribed, setIsSubscribed] = useState(false)
  const [fetchedPublicKey, setFetchedPublicKey] = useState('')

  const envPublicKey = (import.meta.env.VITE_WEB_PUSH_PUBLIC_KEY || '').trim()

  const canEnable = useMemo(
    () => isSupported && permission !== 'denied' && !isSubscribed && !isBusy,
    [isSupported, permission, isSubscribed, isBusy]
  )
  const canDisable = useMemo(() => isSupported && isSubscribed && !isBusy, [isSupported, isSubscribed, isBusy])

  const syncLocalState = useCallback(async () => {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) return
    const registration = await navigator.serviceWorker.getRegistration('/push-sw.js')
    const subscription = registration ? await registration.pushManager.getSubscription() : null
    setIsSubscribed(Boolean(subscription))
    setPermission(Notification.permission)
  }, [])

  useEffect(() => {
    const supported = typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window
    setIsSupported(supported)
    if (!supported) {
      setStatusMessage('Push notifications are not supported on this browser.')
      return
    }
    void syncLocalState()
  }, [syncLocalState])

  /** Production / PWA builds often omit VITE_WEB_PUSH_PUBLIC_KEY; load public key from Edge Function. */
  useEffect(() => {
    if (!isSupported || envPublicKey || !supabaseClient) return
    let cancelled = false
    ;(async () => {
      try {
        const { data, error } = await supabaseClient.functions.invoke('get-web-push-config')
        if (cancelled) return
        if (error) {
          setStatusMessage('Could not load push config. Deploy get-web-push-config and set WEB_PUSH_PUBLIC_KEY in Supabase secrets.')
          return
        }
        const key = typeof data?.publicKey === 'string' ? data.publicKey.trim() : ''
        if (key) setFetchedPublicKey(key)
        else setStatusMessage('Push config returned no public key.')
      } catch {
        if (!cancelled) {
          setStatusMessage('Could not load push config. Check network and Supabase function deployment.')
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [isSupported, envPublicKey, supabaseClient])

  const upsertSubscriptionRow = useCallback(
    async (subscription) => {
      const {
        data: { user },
        error: userErr,
      } = await supabaseClient.auth.getUser()
      if (userErr || !user) {
        throw new Error('Sign in is required before enabling push notifications.')
      }
      const keys = readSubscriptionKeys(subscription)
      const payload = {
        user_id: user.id,
        endpoint: subscription.endpoint,
        p256dh: keys.p256dh,
        auth: keys.auth,
        expiration_time: subscription.expirationTime,
        user_agent: navigator.userAgent,
      }
      const { error } = await supabaseClient.from('push_subscriptions').upsert(payload, { onConflict: 'endpoint' })
      if (error) throw error
    },
    [supabaseClient]
  )

  const removeSubscriptionRow = useCallback(
    async (endpoint) => {
      if (!endpoint) return
      const { error } = await supabaseClient.from('push_subscriptions').delete().eq('endpoint', endpoint)
      if (error) throw error
    },
    [supabaseClient]
  )

  const resolveVapidPublicKey = useCallback(async () => {
    const fromEnv = (import.meta.env.VITE_WEB_PUSH_PUBLIC_KEY || '').trim()
    if (fromEnv) return fromEnv
    if (fetchedPublicKey.trim()) return fetchedPublicKey.trim()
    const { data, error } = await supabaseClient.functions.invoke('get-web-push-config')
    if (error) throw new Error(error.message || 'Could not load push configuration.')
    const key = typeof data?.publicKey === 'string' ? data.publicKey.trim() : ''
    if (!key) throw new Error('Push is not configured (missing WEB_PUSH_PUBLIC_KEY on server).')
    setFetchedPublicKey(key)
    return key
  }, [supabaseClient, fetchedPublicKey])

  const enable = useCallback(async () => {
    if (!isSupported) return
    setIsBusy(true)
    setStatusMessage('')
    let vapidKey
    try {
      vapidKey = await resolveVapidPublicKey()
    } catch (err) {
      setStatusMessage(
        err?.message ||
          'Missing push public key. Set VITE_WEB_PUSH_PUBLIC_KEY in Vercel or deploy Supabase function get-web-push-config with WEB_PUSH_PUBLIC_KEY.'
      )
      setIsBusy(false)
      return
    }
    try {
      const permissionResult = await Notification.requestPermission()
      setPermission(permissionResult)
      if (permissionResult !== 'granted') {
        setStatusMessage('Notification permission was not granted.')
        setIsSubscribed(false)
        return
      }
      await navigator.serviceWorker.register('/push-sw.js')
      const registration = await navigator.serviceWorker.ready
      const existing = await registration.pushManager.getSubscription()
      const subscription =
        existing ||
        (await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: base64UrlToUint8Array(vapidKey),
        }))
      await upsertSubscriptionRow(subscription)
      setIsSubscribed(true)
      setStatusMessage('Push notifications enabled on this device.')
    } catch (error) {
      setStatusMessage(error?.message || 'Could not enable push notifications.')
    } finally {
      setIsBusy(false)
    }
  }, [isSupported, resolveVapidPublicKey, upsertSubscriptionRow])

  const disable = useCallback(async () => {
    if (!isSupported) return
    setIsBusy(true)
    setStatusMessage('')
    try {
      const registration = await navigator.serviceWorker.getRegistration('/push-sw.js')
      if (!registration) {
        setIsSubscribed(false)
        setStatusMessage('Push was already disabled.')
        return
      }
      const subscription = await registration.pushManager.getSubscription()
      if (!subscription) {
        setIsSubscribed(false)
        setStatusMessage('Push was already disabled.')
        return
      }
      const endpoint = subscription.endpoint
      await subscription.unsubscribe()
      await removeSubscriptionRow(endpoint)
      setIsSubscribed(false)
      setStatusMessage('Push notifications disabled on this device.')
    } catch (error) {
      setStatusMessage(error?.message || 'Could not disable push notifications.')
    } finally {
      setIsBusy(false)
    }
  }, [isSupported, removeSubscriptionRow])

  return {
    isSupported,
    permission,
    isBusy,
    statusMessage,
    isSubscribed,
    canEnable,
    canDisable,
    enable,
    disable,
  }
}
