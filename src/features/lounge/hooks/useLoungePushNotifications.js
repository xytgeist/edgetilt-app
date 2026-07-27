import { useCallback, useEffect, useMemo, useRef, useSyncExternalStore } from 'react'
import useWebPushNotifications from '../../offers/hooks/useWebPushNotifications.js'
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
 * Lounge Settings push toggle - local opt-in pref + shared device subscription (`push_subscriptions`).
 */
export default function useLoungePushNotifications({ supabaseClient, viewerUserId }) {
  const pushPrefEnabled = useSyncExternalStore(
    subscribeLoungePushNotificationsEnabled,
    readLoungePushNotificationsEnabled,
    () => true,
  )
  const syncingPrefRef = useRef(false)
  const quietRepairInFlightRef = useRef(false)
  /** One quiet-repair attempt per signed-in session unless registration recovers. */
  const quietRepairAttemptedForUserRef = useRef('')

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

  /** Toggle + hint reflect pref + browser subscription + push_subscriptions row. */
  const pushActive = pushPrefEnabled && isRegistered

  const pushStatusHint = useMemo(() => {
    if (!viewerUserId) return 'Sign in to enable push on this device.'
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
  }, [viewerUserId, isSupported, permission, pushPrefEnabled, isSubscribed, isServerRegistered, pushActive])

  /** Re-check server row after sign-in (browser sub may predate auth). */
  useEffect(() => {
    if (!viewerUserId) return
    void syncLocalState()
  }, [viewerUserId, syncLocalState])

  /** Migrate: OS already granted + no stored intent → user previously opted in. */
  useEffect(() => {
    if (!viewerUserId || !isSupported) return
    bootstrapPushOptInIntentIfNeeded(viewerUserId, { permission })
  }, [viewerUserId, isSupported, permission])

  /** Installed PWA first-run prompt grants OS permission — register Lounge push on this device. */
  useEffect(() => {
    if (!viewerUserId || iosPwaInstallRequired() || isBusy) return
    if (!consumePwaNotifEnablePending(viewerUserId)) return
    writeLoungePushNotificationsEnabled(true)
    writePushOptInIntent(viewerUserId, true)
    void enable()
  }, [viewerUserId, enable, isBusy])

  /**
   * Quiet repair: intent on + OS granted, but PushManager / server row missing
   * (common after iOS kills the subscription). No UI unless subscribe fails.
   */
  useEffect(() => {
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
    if (!viewerUserId) return
    const onReenable = () => {
      if (iosPwaInstallRequired() || isBusy) return
      writeLoungePushNotificationsEnabled(true)
      writePushOptInIntent(viewerUserId, true)
      quietRepairAttemptedForUserRef.current = ''
      void enable()
    }
    window.addEventListener('edge-push-reenable', onReenable)
    return () => window.removeEventListener('edge-push-reenable', onReenable)
  }, [viewerUserId, enable, isBusy])

  /** Pref off but device still subscribed (e.g. stale state) - tear down subscription. */
  useEffect(() => {
    if (!viewerUserId || !isSubscribed || pushPrefEnabled || isBusy || syncingPrefRef.current) return
    /** Prefer Settings toggle path for intent; this cleanup still clears intent via disable(). */
    void disable()
  }, [viewerUserId, isSubscribed, pushPrefEnabled, isBusy, disable])

  const onPushToggle = useCallback(
    async (nextEnabled) => {
      if (nextEnabled && iosPwaInstallRequired()) return
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
    [viewerUserId, enable, disable],
  )

  return {
    pushPrefEnabled,
    pushActive,
    pushSupported: isSupported,
    pushPermission: permission,
    pushBusy: isBusy,
    pushStatusMessage: statusMessage,
    pushSubscribed: isRegistered,
    pushStatusHint,
    onPushToggle,
  }
}
