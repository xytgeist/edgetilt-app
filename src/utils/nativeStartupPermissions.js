/**
 * Store shells ask for push + location after sign-in / account creation, not at app launch.
 * Once per member per device; the OS itself never re-shows a decided prompt.
 */
import {
  isEdgeAndroidShell,
  requestEdgeAndroidLocationPermission,
  requestEdgeAndroidPushPermission,
} from './edgeAndroid.js'
import { isEdgeiOSShell, requestEdgeiOSLocationPermission, requestEdgeiOSPushPermission } from './edgeNative.js'

/** Fired after the push prompt resolves so `useLoungePushNotifications` re-reads status and uploads the token. */
export const NATIVE_PUSH_CHANGED_EVENT = 'edge-native-push-changed'

const ASKED_KEY_PREFIX = 'edge_native_startup_permissions:v1:'

export async function requestNativeStartupPermissionsOnce(userId) {
  if (typeof window === 'undefined' || !userId) return
  const android = isEdgeAndroidShell()
  if (!android && !isEdgeiOSShell()) return
  const key = `${ASKED_KEY_PREFIX}${userId}`
  try {
    if (window.localStorage.getItem(key)) return
    window.localStorage.setItem(key, '1')
  } catch {
    return
  }
  const push = android ? await requestEdgeAndroidPushPermission() : await requestEdgeiOSPushPermission()
  window.dispatchEvent(new CustomEvent(NATIVE_PUSH_CHANGED_EVENT, { detail: { status: push.status } }))
  if (android) {
    await requestEdgeAndroidLocationPermission()
  } else {
    await requestEdgeiOSLocationPermission()
  }
}
