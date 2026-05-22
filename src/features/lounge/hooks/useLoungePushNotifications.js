import { useCallback, useEffect, useMemo, useRef, useSyncExternalStore } from 'react'
import useWebPushNotifications from '../../offers/hooks/useWebPushNotifications.js'
import { iosPwaInstallRequired } from '../../../utils/pwaNotificationPrompt.js'
import {
  readLoungePushNotificationsEnabled,
  subscribeLoungePushNotificationsEnabled,
  writeLoungePushNotificationsEnabled,
} from '../../../utils/loungePushNotificationsPref.js'

/**
 * Lounge Settings push toggle — local opt-in pref + shared device subscription (`push_subscriptions`).
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
    enable,
    disable,
  } = useWebPushNotifications({ supabaseClient })

  const pushStatusHint = useMemo(() => {
    if (!viewerUserId) return 'Sign in to enable push on this device.'
    if (iosPwaInstallRequired()) {
      return 'Add Edge to your Home Screen, then open from the icon to enable push here.'
    }
    if (!isSupported) return 'This browser does not support web push here.'
    if (permission === 'denied') return 'Notifications are blocked in browser settings.'
    if (pushPrefEnabled && isSubscribed) return 'Alerts enabled on this device.'
    if (pushPrefEnabled && !isSubscribed) {
      return 'Allow browser notifications when you turn this on.'
    }
    return 'Push alerts are off on this device.'
  }, [viewerUserId, isSupported, permission, pushPrefEnabled, isSubscribed])

  /** Pref off but device still subscribed (e.g. stale state) — tear down subscription. */
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
    pushSupported: isSupported,
    pushPermission: permission,
    pushBusy: isBusy,
    pushStatusMessage: statusMessage,
    pushSubscribed: isSubscribed,
    pushStatusHint,
    onPushToggle,
  }
}
