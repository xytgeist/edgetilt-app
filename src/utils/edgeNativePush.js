/**
 * Native push for the store shells: EdgeiOS → APNs (`apns_device_tokens`), EdgeAndroid → FCM
 * (`fcm_device_tokens`). Web / PWA keep web push in `useWebPushNotifications`.
 */
import { isEdgeAndroidShell, getEdgeAndroidPushPermissionStatus, getEdgeAndroidPushToken } from './edgeAndroid.js'
import {
  disableEdgeAndroidFcmPush,
  enableEdgeAndroidFcmPush,
  syncEdgeAndroidFcmPushState,
  upsertMyFcmDeviceToken,
} from './edgeAndroidFcmPush.js'
import { disableEdgeIOSApnsPush, enableEdgeIOSApnsPush, syncEdgeIOSApnsPushState } from './edgeIOSApnsPush.js'
import { upsertMyApnsDeviceToken } from './apnsDeviceTokenApi.js'
import { getEdgeiOSPushPermissionStatus, getEdgeiOSPushToken, isEdgeiOSShell } from './edgeNative.js'

export function isNativePushShell() {
  return isEdgeiOSShell() || isEdgeAndroidShell()
}

/** "iPhone" / "phone" for status copy. */
export function nativePushDeviceLabel() {
  return isEdgeAndroidShell() ? 'phone' : 'iPhone'
}

export function getNativePushPermissionStatus() {
  return isEdgeAndroidShell() ? getEdgeAndroidPushPermissionStatus() : getEdgeiOSPushPermissionStatus()
}

export function getNativePushToken() {
  return isEdgeAndroidShell() ? getEdgeAndroidPushToken() : getEdgeiOSPushToken()
}

export function syncNativePushState(supabaseClient) {
  return isEdgeAndroidShell() ? syncEdgeAndroidFcmPushState(supabaseClient) : syncEdgeIOSApnsPushState(supabaseClient)
}

export function enableNativePush(supabaseClient) {
  return isEdgeAndroidShell() ? enableEdgeAndroidFcmPush(supabaseClient) : enableEdgeIOSApnsPush(supabaseClient)
}

export function disableNativePush(supabaseClient, token) {
  return isEdgeAndroidShell()
    ? disableEdgeAndroidFcmPush(supabaseClient, token)
    : disableEdgeIOSApnsPush(supabaseClient, token)
}

export function upsertNativePushToken(supabaseClient, token) {
  return isEdgeAndroidShell() ? upsertMyFcmDeviceToken(supabaseClient, token) : upsertMyApnsDeviceToken(supabaseClient, token)
}
