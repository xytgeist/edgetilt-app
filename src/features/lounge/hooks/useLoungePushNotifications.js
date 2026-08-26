import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import useWebPushNotifications from '../../offers/hooks/useWebPushNotifications.js'
import {
  getEdgeiOSPushPermissionStatus,
  getEdgeiOSPushToken,
  isEdgeiOSShell,
  requestEdgeiOSPushPermission,
} from '../../../utils/edgeNative.js'
import {
  consumePwaNotifEnablePending,
  iosPwaInstallRequired,
} from '../../../utils/pwaNotificationPrompt.js'
import {
  readLoungePushNotificationsEnabled,
  subscribeLoungePushNotificationsEnabled,
  writeLoungePushNotificationsEnabled,
} from '../../../utils/loungePushNotificationsPref.js'
import {
  bootstrapPushOptInIntentIfNeeded,
  readPushOptInIntent,
  setPushReenablePromptPending,
  writePushOptInIntent,
} from '../../../utils/pushOptInIntent.js'

/**
 * Lounge Settings push toggle.
 * EdgeiOS → native APNs permission + device token (server upload/send still pending).
 * Everywhere else → web push + `push_subscriptions`.
 */
export default function useLoungePushNotifications({ supabaseClient, viewerUserId }) {
  const isIpaShell = typeof window !== 'undefined' && isEdgeiOSShell()

  const pushPrefEnabled = useSyncExternalStore(
    subscribeLoungePushNotificationsEnabled,
    readLoungePushNotificationsEnabled,
    () => true,
  )
  const syncingPrefRef = useRef(false)
  const quietRepairInFlightRef = useRef(false)
  /** One quiet-repair attempt per signed-in session unless registration recovers. */
  const quietRepairAttemptedForUserRef = useRef('')

  const [nativeStatus, setNativeStatus] = useState(/** @type {'granted' | 'denied' | 'prompt'} */ ('prompt'))
  const [nativeToken, setNativeToken] = useState(/** @type {string | null} */ (null))
  const [nativeBusy, setNativeBusy] = useState(false)
  const [nativeStatusMessage, setNativeStatusMessage] = useState('')

  const {
    isSupported,
    permission,
    isBusy,
    statusMessage,
    isSubscribed,
    isServerRegistered,
    isRegistered,
    syncLocalState,
    enable,
    disable,
  } = useWebPushNotifications({ supabaseClient })

  /** Refresh native permission + token without prompting. */
  const syncNativePushState = useCallback(async () => {
    if (!isIpaShell) return
    const [{ status }, { token }] = await Promise.all([
      getEdgeiOSPushPermissionStatus(),
      getEdgeiOSPushToken(),
    ])
    setNativeStatus(status)
    setNativeToken(token)
  }, [isIpaShell])

  useEffect(() => {
    if (!isIpaShell) return
    void syncNativePushState()
  }, [isIpaShell, syncNativePushState, viewerUserId])

  /** After grant, token often lands a beat later. */
  useEffect(() => {
    if (!isIpaShell || !pushPrefEnabled || nativeStatus !== 'granted' || nativeToken) return
    let cancelled = false
    let attempts = 0
    const tick = async () => {
      if (cancelled || attempts >= 8) return
      attempts += 1
      const { token } = await getEdgeiOSPushToken()
      if (cancelled) return
      if (token) {
        setNativeToken(token)
        return
      }
      window.setTimeout(() => {
        void tick()
      }, 500)
    }
    void tick()
    return () => {
      cancelled = true
    }
  }, [isIpaShell, pushPrefEnabled, nativeStatus, nativeToken])

  const pushActive = isIpaShell
    ? pushPrefEnabled && nativeStatus === 'granted'
    : pushPrefEnabled && isRegistered

  const pushStatusHint = useMemo(() => {
    if (!viewerUserId) return 'Sign in to enable push on this device.'
    if (isIpaShell) {
      if (nativeStatus === 'denied') {
        return 'Notifications are blocked in iOS Settings for Edge.'
      }
      if (pushActive) {
        return nativeToken
          ? 'Native alerts enabled on this device. Server delivery coming soon.'
          : 'Permission granted. Waiting for device token…'
      }
      return 'Turn on to allow Edge alerts on this iPhone (native push).'
    }
    if (iosPwaInstallRequired()) {
      return 'Add Edge to your Home Screen, then open from the icon to enable push here.'
    }
    if (!isSupported) return 'This browser does not support web push here.'
    if (permission === 'denied') return 'Notifications are blocked in browser settings.'
    if (pushPrefEnabled && isSubscribed && isServerRegistered === null) {
      return 'Checking alert registration on this device…'
    }
    if (pushPrefEnabled && isSubscribed && isServerRegistered === false) {
      return 'Alerts not saved on this device - turn off, then on again.'
    }
    if (pushActive) return 'Alerts enabled on this device.'
    if (pushPrefEnabled && !isSubscribed) {
      return 'Allow browser notifications when you turn this on.'
    }
    return 'Push alerts are off on this device.'
  }, [
    viewerUserId,
    isIpaShell,
    nativeStatus,
    pushActive,
    nativeToken,
    isSupported,
    permission,
    pushPrefEnabled,
    isSubscribed,
    isServerRegistered,
  ])

  /** Re-check server row after sign-in (browser sub may predate auth). Skip EdgeiOS. */
  useEffect(() => {
    if (!viewerUserId || isIpaShell) return
    void syncLocalState()
  }, [viewerUserId, syncLocalState, isIpaShell])

  /** Migrate: OS already granted + no stored intent → user previously opted in. */
  useEffect(() => {
    if (!viewerUserId || !isSupported || isIpaShell) return
    bootstrapPushOptInIntentIfNeeded(viewerUserId, { permission })
  }, [viewerUserId, isSupported, permission, isIpaShell])

  /** Installed PWA first-run prompt grants OS permission — register Lounge push on this device. */
  useEffect(() => {
    if (isIpaShell) return
    if (!viewerUserId || iosPwaInstallRequired() || isBusy) return
    if (!consumePwaNotifEnablePending(viewerUserId)) return
    writeLoungePushNotificationsEnabled(true)
    writePushOptInIntent(viewerUserId, true)
    void enable()
  }, [viewerUserId, enable, isBusy, isIpaShell])

  /**
   * Quiet repair: intent on + OS granted, but PushManager / server row missing
   * (common after iOS kills the subscription). No UI unless subscribe fails.
   */
  useEffect(() => {
    if (isIpaShell) return
    if (!viewerUserId || !isSupported || isBusy || quietRepairInFlightRef.current) return
    if (iosPwaInstallRequired()) return
    if (syncingPrefRef.current) return
    if (isServerRegistered === null) return

    if (isRegistered) {
      quietRepairAttemptedForUserRef.current = ''
      return
    }

    const intent = readPushOptInIntent(viewerUserId)
    if (intent !== 'on') return
    if (permission !== 'granted') return
    if (quietRepairAttemptedForUserRef.current === viewerUserId) return

    quietRepairAttemptedForUserRef.current = viewerUserId
    quietRepairInFlightRef.current = true
    void (async () => {
      try {
        writeLoungePushNotificationsEnabled(true)
        const ok = await enable({ silent: true })
        if (!ok) setPushReenablePromptPending(viewerUserId)
      } catch {
        setPushReenablePromptPending(viewerUserId)
      } finally {
        quietRepairInFlightRef.current = false
      }
    })()
  }, [
    isIpaShell,
    viewerUserId,
    isSupported,
    isBusy,
    permission,
    isRegistered,
    isServerRegistered,
    enable,
  ])

  /** Repair sheet Enable (AppShell) → non-silent subscribe (gesture already happened). */
  useEffect(() => {
    if (!viewerUserId || isIpaShell) return
    const onReenable = () => {
      if (iosPwaInstallRequired() || isBusy) return
      writeLoungePushNotificationsEnabled(true)
      writePushOptInIntent(viewerUserId, true)
      quietRepairAttemptedForUserRef.current = ''
      void enable()
    }
    window.addEventListener('edge-push-reenable', onReenable)
    return () => window.removeEventListener('edge-push-reenable', onReenable)
  }, [viewerUserId, enable, isBusy, isIpaShell])

  /** Pref off but device still subscribed (e.g. stale state) - tear down subscription. */
  useEffect(() => {
    if (isIpaShell) return
    if (!viewerUserId || !isSubscribed || pushPrefEnabled || isBusy || syncingPrefRef.current) return
    /** Prefer Settings toggle path for intent; this cleanup still clears intent via disable(). */
    void disable()
  }, [viewerUserId, isSubscribed, pushPrefEnabled, isBusy, disable, isIpaShell])

  const onPushToggle = useCallback(
    async (nextEnabled) => {
      if (nextEnabled && iosPwaInstallRequired()) return

      if (isIpaShell) {
        if (!viewerUserId) return
        setNativeBusy(true)
        setNativeStatusMessage('')
        syncingPrefRef.current = true
        try {
          if (nextEnabled) {
            const { status, via } = await requestEdgeiOSPushPermission()
            setNativeStatus(status)
            if (status !== 'granted') {
              writeLoungePushNotificationsEnabled(false)
              writePushOptInIntent(viewerUserId, false)
              setNativeStatusMessage(
                via === 'error'
                  ? 'Could not reach the native push bridge.'
                  : status === 'denied'
                    ? 'Notification permission was not granted.'
                    : 'Notification permission is still pending.',
              )
              return
            }
            writeLoungePushNotificationsEnabled(true)
            writePushOptInIntent(viewerUserId, true)
            const { token } = await getEdgeiOSPushToken()
            setNativeToken(token)
            setNativeStatusMessage(
              token
                ? 'Native push ready on this device. Alerts will work after server delivery ships.'
                : 'Permission granted. Waiting for device token…',
            )
          } else {
            writeLoungePushNotificationsEnabled(false)
            writePushOptInIntent(viewerUserId, false)
            setNativeStatusMessage('')
          }
        } finally {
          syncingPrefRef.current = false
          setNativeBusy(false)
        }
        return
      }

      writeLoungePushNotificationsEnabled(nextEnabled)
      if (viewerUserId) writePushOptInIntent(viewerUserId, nextEnabled)
      if (!viewerUserId) return
      syncingPrefRef.current = true
      try {
        if (nextEnabled) {
          quietRepairAttemptedForUserRef.current = ''
          await enable()
        } else {
          await disable()
        }
      } finally {
        syncingPrefRef.current = false
      }
    },
    [viewerUserId, enable, disable, isIpaShell],
  )

  return {
    pushPrefEnabled,
    pushActive,
    pushSupported: isIpaShell ? true : isSupported,
    pushPermission: isIpaShell ? nativeStatus : permission,
    pushBusy: isIpaShell ? nativeBusy : isBusy,
    pushStatusMessage: isIpaShell ? nativeStatusMessage : statusMessage,
    pushSubscribed: isIpaShell ? pushActive : isRegistered,
    pushStatusHint,
    onPushToggle,
  }
}
