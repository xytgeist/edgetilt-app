import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { isEdgeiOSShell } from '../../../utils/edgeNative.js'
import {
  disableEdgeIOSApnsPush,
  enableEdgeIOSApnsPush,
  syncEdgeIOSApnsPushState,
} from '../../../utils/edgeIOSApnsPush.js'
import { writePushOptInIntent } from '../../../utils/pushOptInIntent.js'

/** Registration that owns our push-sw.js worker (avoid mixing with unrelated SW registrations). */
async function getPushServiceWorkerRegistration() {
  if (!('serviceWorker' in navigator)) return null
  const registrations = await navigator.serviceWorker.getRegistrations()
  return (
    registrations.find((r) => r.active?.scriptURL?.includes('push-sw.js')) ||
    registrations.find((r) => r.waiting?.scriptURL?.includes('push-sw.js')) ||
    registrations.find((r) => r.installing?.scriptURL?.includes('push-sw.js')) ||
    null
  )
}

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
  const isIpaShell = typeof window !== 'undefined' && isEdgeiOSShell()
  const [nativeStatus, setNativeStatus] = useState(/** @type {'granted' | 'denied' | 'prompt'} */ ('prompt'))
  const [nativeToken, setNativeToken] = useState(/** @type {string | null} */ (null))
  const [nativeServerRegistered, setNativeServerRegistered] = useState(
    /** @type {boolean | null} */ (null),
  )
  const uploadedTokenRef = useRef('')

  const [isSupported, setIsSupported] = useState(false)
  const [permission, setPermission] = useState('default')
  const [isBusy, setIsBusy] = useState(false)
  const [statusMessage, setStatusMessage] = useState('')
  const [isSubscribed, setIsSubscribed] = useState(false)
  /** null = not checked yet; true/false = push_subscriptions row for this device endpoint. */
  const [isServerRegistered, setIsServerRegistered] = useState(/** @type {boolean | null} */ (null))
  const [fetchedPublicKey, setFetchedPublicKey] = useState('')

  const envPublicKey = (import.meta.env.VITE_WEB_PUSH_PUBLIC_KEY || '').trim()

  const canEnable = useMemo(() => {
    if (isIpaShell) {
      const alreadyActive = nativeStatus === 'granted' && nativeServerRegistered === true
      return !alreadyActive && !isBusy
    }
    return isSupported && !isSubscribed && !isBusy
  }, [isIpaShell, nativeStatus, nativeServerRegistered, isBusy, isSupported, isSubscribed])
  const canDisable = useMemo(() => {
    if (isIpaShell) {
      return nativeStatus === 'granted' && nativeServerRegistered === true && !isBusy
    }
    return isSupported && isSubscribed && !isBusy
  }, [isIpaShell, nativeStatus, nativeServerRegistered, isBusy, isSupported, isSubscribed])

  const syncNativeState = useCallback(async () => {
    if (!isIpaShell || !supabaseClient) return
    const next = await syncEdgeIOSApnsPushState(supabaseClient)
    setNativeStatus(next.status)
    setNativeToken(next.token)
    setNativeServerRegistered(next.serverRegistered)
    if (next.token && next.serverRegistered) uploadedTokenRef.current = next.token
  }, [isIpaShell, supabaseClient])

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
      // RPC reclaim-by-endpoint: direct upsert fails RLS when Android reuses an
      // endpoint row still owned by another user_id (unique on endpoint).
      const { error } = await supabaseClient.rpc('upsert_my_push_subscription', {
        p_endpoint: subscription.endpoint,
        p_p256dh: keys.p256dh,
        p_auth: keys.auth,
        p_expiration_time: subscription.expirationTime ?? null,
        p_user_agent: navigator.userAgent,
      })
      if (error) throw error
    },
    [supabaseClient],
  )

  const verifyOrRepairServerRegistration = useCallback(
    async (subscription) => {
      if (!subscription || !supabaseClient) {
        setIsServerRegistered(false)
        return false
      }
      const {
        data: { user },
        error: userErr,
      } = await supabaseClient.auth.getUser()
      if (userErr || !user) {
        setIsServerRegistered(false)
        return false
      }
      const { data, error } = await supabaseClient
        .from('push_subscriptions')
        .select('id')
        .eq('endpoint', subscription.endpoint)
        .maybeSingle()
      if (error) {
        setIsServerRegistered(false)
        return false
      }
      if (data?.id) {
        setIsServerRegistered(true)
        return true
      }
      try {
        await upsertSubscriptionRow(subscription)
        setIsServerRegistered(true)
        return true
      } catch {
        setIsServerRegistered(false)
        return false
      }
    },
    [supabaseClient, upsertSubscriptionRow],
  )

  const syncLocalState = useCallback(async () => {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) return
    const registration = await getPushServiceWorkerRegistration()
    const subscription = registration ? await registration.pushManager.getSubscription() : null
    setIsSubscribed(Boolean(subscription))
    setPermission(Notification.permission)
    if (subscription) {
      await verifyOrRepairServerRegistration(subscription)
    } else {
      setIsServerRegistered(false)
    }
  }, [verifyOrRepairServerRegistration])

  useEffect(() => {
    if (typeof window !== 'undefined' && isIpaShell) {
      setIsSupported(true)
      void syncNativeState()
      const onFocus = () => {
        void syncNativeState()
      }
      window.addEventListener('focus', onFocus)
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') onFocus()
      })
      return () => {
        window.removeEventListener('focus', onFocus)
      }
    }
    const supported =
      typeof window !== 'undefined' &&
      'serviceWorker' in navigator &&
      'PushManager' in window &&
      'Notification' in window
    setIsSupported(supported)
    if (!supported) {
      setStatusMessage('Push notifications are not supported on this browser.')
      return
    }
    void syncLocalState()

    const onFocusOrVisible = () => {
      void syncLocalState()
    }
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') onFocusOrVisible()
    }
    window.addEventListener('focus', onFocusOrVisible)
    document.addEventListener('visibilitychange', onVisibilityChange)
    return () => {
      window.removeEventListener('focus', onFocusOrVisible)
      document.removeEventListener('visibilitychange', onVisibilityChange)
    }
  }, [syncLocalState, isIpaShell, syncNativeState])

  useEffect(() => {
    if (!isIpaShell || !supabaseClient) return
    if (nativeStatus !== 'granted' || !nativeToken) return
    if (uploadedTokenRef.current === nativeToken && nativeServerRegistered === true) return
    let cancelled = false
    void (async () => {
      const next = await syncEdgeIOSApnsPushState(supabaseClient)
      if (cancelled) return
      setNativeServerRegistered(next.serverRegistered)
      if (next.token && next.serverRegistered) uploadedTokenRef.current = next.token
    })()
    return () => {
      cancelled = true
    }
  }, [isIpaShell, supabaseClient, nativeStatus, nativeToken, nativeServerRegistered])

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

  /**
   * @param {{ silent?: boolean }} [opts]
   * silent: do not prompt the OS if permission is not already granted (for quiet repair).
   */
  const enable = useCallback(async (opts = {}) => {
    const silent = opts?.silent === true
    if (isIpaShell) {
      if (silent) return nativeStatus === 'granted' && nativeServerRegistered === true
      setIsBusy(true)
      setStatusMessage('')
      const result = await enableEdgeIOSApnsPush(supabaseClient)
      setNativeStatus(result.status)
      if (result.ok) {
        const { token } = await syncEdgeIOSApnsPushState(supabaseClient)
        setNativeToken(token)
        setNativeServerRegistered(true)
        if (token) uploadedTokenRef.current = token
        setIsSubscribed(true)
        setIsServerRegistered(true)
      } else {
        setNativeServerRegistered(false)
        setIsSubscribed(false)
        setIsServerRegistered(false)
      }
      setStatusMessage(result.message)
      setIsBusy(false)
      return result.ok
    }
    if (!isSupported) return false
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
      return false
    }
    try {
      let permissionResult = Notification.permission
      if (permissionResult === 'denied') {
        setStatusMessage(
          'Notifications are blocked in browser settings. Open site settings for this page and allow notifications, then try again.',
        )
        setIsSubscribed(false)
        return false
      }
      if (permissionResult !== 'granted') {
        if (silent) {
          setStatusMessage('Notification permission is not granted.')
          setIsSubscribed(false)
          return false
        }
        permissionResult = await Notification.requestPermission()
      }
      setPermission(permissionResult)
      if (permissionResult !== 'granted') {
        setStatusMessage('Notification permission was not granted.')
        setIsSubscribed(false)
        return false
      }
      const registration = await navigator.serviceWorker.register('/push-sw.js')
      await registration.update().catch(() => {})
      const existing = await registration.pushManager.getSubscription()
      const subscription =
        existing ||
        (await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: base64UrlToUint8Array(vapidKey),
        }))
      await upsertSubscriptionRow(subscription)
      setIsSubscribed(true)
      setIsServerRegistered(true)
      setStatusMessage('Push notifications enabled on this device.')
      try {
        const {
          data: { user },
        } = await supabaseClient.auth.getUser()
        if (user?.id) writePushOptInIntent(user.id, true)
      } catch {
        // intent is best-effort
      }
      return true
    } catch (error) {
      setStatusMessage(error?.message || 'Could not enable push notifications.')
      return false
    } finally {
      setIsBusy(false)
    }
  }, [isSupported, resolveVapidPublicKey, upsertSubscriptionRow, supabaseClient, isIpaShell, nativeStatus, nativeServerRegistered, syncNativeState])

  const disable = useCallback(async () => {
    if (isIpaShell) {
      setIsBusy(true)
      setStatusMessage('')
      const result = await disableEdgeIOSApnsPush(supabaseClient, nativeToken || uploadedTokenRef.current)
      uploadedTokenRef.current = ''
      setNativeToken(null)
      setNativeServerRegistered(false)
      setIsSubscribed(false)
      setIsServerRegistered(false)
      setStatusMessage(result.message || 'Native alerts disabled on this device.')
      setIsBusy(false)
      return
    }
    if (!isSupported) return
    setIsBusy(true)
    setStatusMessage('')
    try {
      try {
        const {
          data: { user },
        } = await supabaseClient.auth.getUser()
        if (user?.id) writePushOptInIntent(user.id, false)
      } catch {
        // intent is best-effort
      }
      const registration = await getPushServiceWorkerRegistration()
      if (!registration) {
        setIsSubscribed(false)
        setIsServerRegistered(false)
        setStatusMessage('Push was already disabled.')
        return
      }
      const subscription = await registration.pushManager.getSubscription()
      if (!subscription) {
        setIsSubscribed(false)
        setIsServerRegistered(false)
        setStatusMessage('Push was already disabled.')
        return
      }
      const endpoint = subscription.endpoint
      await subscription.unsubscribe()
      await removeSubscriptionRow(endpoint)
      setIsSubscribed(false)
      setIsServerRegistered(false)
      setStatusMessage('Push notifications disabled on this device.')
    } catch (error) {
      setStatusMessage(error?.message || 'Could not disable push notifications.')
    } finally {
      setIsBusy(false)
    }
  }, [isSupported, removeSubscriptionRow, supabaseClient, isIpaShell, nativeToken])

  const shellSubscribed = isIpaShell && nativeStatus === 'granted' && nativeServerRegistered === true
  const isRegistered = shellSubscribed || (isSubscribed && isServerRegistered === true)

  return {
    isSupported: isIpaShell ? true : isSupported,
    permission: isIpaShell ? nativeStatus : permission,
    isBusy,
    statusMessage,
    isSubscribed: isIpaShell ? shellSubscribed : isSubscribed,
    isServerRegistered: isIpaShell ? nativeServerRegistered : isServerRegistered,
    isRegistered,
    syncLocalState,
    canEnable,
    canDisable,
    enable,
    disable,
  }
}
