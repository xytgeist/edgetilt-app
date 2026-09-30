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

/** Fired once both system prompts are answered so held-back first-run onboarding can start. */
export const NATIVE_STARTUP_PERMISSIONS_DONE_EVENT = 'edge-native-startup-permissions-done'

const ASKED_KEY_PREFIX = 'edge_native_startup_permissions:v1:'

let askingUserId = ''

function wasAsked(userId) {
  try {
    return Boolean(window.localStorage.getItem(`${ASKED_KEY_PREFIX}${userId}`))
  } catch {
    return true
  }
}

/** True in a store shell until this member has answered the push + location prompts on this device. */
export function nativeStartupPermissionsPending(userId) {
  if (typeof window === 'undefined' || !userId) return false
  if (!isEdgeAndroidShell() && !isEdgeiOSShell()) return false
  return askingUserId === userId || !wasAsked(userId)
}

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
  askingUserId = userId
  try {
    const push = android ? await requestEdgeAndroidPushPermission() : await requestEdgeiOSPushPermission()
    window.dispatchEvent(new CustomEvent(NATIVE_PUSH_CHANGED_EVENT, { detail: { status: push.status } }))
    if (android) {
      await requestEdgeAndroidLocationPermission()
    } else {
      await requestEdgeiOSLocationPermission()
    }
  } finally {
    askingUserId = ''
    window.dispatchEvent(new Event(NATIVE_STARTUP_PERMISSIONS_DONE_EVENT))
  }
}
