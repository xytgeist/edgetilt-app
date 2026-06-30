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

  /** iOS PWA first-run prompt grants OS permission - register Lounge push on this device. */
  useEffect(() => {
    if (!viewerUserId || iosPwaInstallRequired() || isBusy) return
    if (!consumePwaNotifEnablePending(viewerUserId)) return
    writeLoungePushNotificationsEnabled(true)
    void enable()
  }, [viewerUserId, enable, isBusy])

  /** Pref off but device still subscribed (e.g. stale state) - tear down subscription. */
  useEffect(() => {
    if (!viewerUserId || !isSubscribed || pushPrefEnabled || isBusy || syncingPrefRef.current) return
    void disable()
  }, [viewerUserId, isSubscribed, pushPrefEnabled, isBusy, disable])

  const onPushToggle = useCallback(
    async (nextEnabled) => {
      if (nextEnabled && iosPwaInstallRequired()) return
      writeLoungePushNotificationsEnabled(nextEnabled)
      if (!viewerUserId) return
      syncingPrefRef.current = true
      try {
        if (nextEnabled) {
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
