/**
 * EdgeAndroid FCM token path (Lounge Settings + Offers reminders). Same shape as `edgeIOSApnsPush.js`.
 * One row per device in `fcm_device_tokens`.
 */
import {
  getEdgeAndroidPushPermissionStatus,
  getEdgeAndroidPushToken,
  isEdgeAndroidShell,
  openEdgeAndroidAppSettings,
  readEdgeAndroidAppId,
  requestEdgeAndroidPushPermission,
} from './edgeAndroid.js'
import { writePushOptInIntent } from './pushOptInIntent.js'

const DENIED_MESSAGE =
  'Notifications are off for Edge in Android settings. Turn them on, then return here and try again.'

export async function upsertMyFcmDeviceToken(supabaseClient, token) {
  const tok = String(token || '').trim()
  if (!supabaseClient || !tok) return { ok: false, reason: 'invalid' }
  const { error } = await supabaseClient.rpc('upsert_my_fcm_device_token', {
    p_token: tok,
    p_app_id: readEdgeAndroidAppId(),
    p_user_agent: typeof navigator !== 'undefined' ? navigator.userAgent : null,
  })
  if (error) return { ok: false, reason: error.message || 'rpc' }
  return { ok: true, token: tok }
}

export async function deleteMyFcmDeviceToken(supabaseClient, token) {
  const tok = String(token || '').trim()
  if (!supabaseClient || !tok) return { ok: false }
  const { error } = await supabaseClient.rpc('delete_my_fcm_device_token', { p_token: tok })
  return { ok: !error }
}

/** @returns {Promise<{ status: 'granted' | 'denied' | 'prompt', token: string | null, serverRegistered: boolean }>} */
export async function syncEdgeAndroidFcmPushState(supabaseClient) {
  if (!isEdgeAndroidShell()) return { status: 'prompt', token: null, serverRegistered: false }
  const [{ status }, { token }] = await Promise.all([
    getEdgeAndroidPushPermissionStatus(),
    getEdgeAndroidPushToken(),
  ])
  if (status !== 'granted' || !token || !supabaseClient) {
    return { status, token, serverRegistered: false }
  }
  const { data, error } = await supabaseClient
    .from('fcm_device_tokens')
    .select('id')
    .eq('token', token)
    .maybeSingle()
  if (error) return { status, token, serverRegistered: false }
  return { status, token, serverRegistered: Boolean(data?.id) }
}

export async function enableEdgeAndroidFcmPush(supabaseClient) {
  if (!isEdgeAndroidShell()) {
    return { ok: false, status: 'prompt', message: 'Native push is only available in the Edge app.' }
  }
  const { status: current } = await getEdgeAndroidPushPermissionStatus()
  if (current === 'denied') {
    await openEdgeAndroidAppSettings()
    return { ok: false, status: 'denied', message: DENIED_MESSAGE, openedSettings: true }
  }
  const { status, via } = current === 'granted' ? { status: 'granted', via: 'bridge' } : await requestEdgeAndroidPushPermission()
  if (status !== 'granted') {
    if (status === 'denied') {
      return { ok: false, status: 'denied', message: DENIED_MESSAGE }
    }
    return {
      ok: false,
      status,
      message: via === 'error' ? 'Could not reach the native push bridge.' : 'Notification permission is still pending.',
    }
  }
  let token = (await getEdgeAndroidPushToken()).token
  for (let i = 0; !token && i < 10; i += 1) {
    await new Promise((r) => setTimeout(r, 500))
    token = (await getEdgeAndroidPushToken()).token
  }
  if (!token) {
    return { ok: false, status: 'granted', message: 'Permission granted. Waiting for device token…' }
  }
  if (!supabaseClient) {
    return { ok: false, status: 'granted', message: 'Sign in to enable push on this device.' }
  }
  const saved = await upsertMyFcmDeviceToken(supabaseClient, token)
  if (!saved.ok) {
    return { ok: false, status: 'granted', message: 'Permission granted, but this phone was not saved for alerts.' }
  }
  try {
    const { data: { user } } = await supabaseClient.auth.getUser()
    if (user?.id) writePushOptInIntent(user.id, true)
  } catch {
    // best-effort
  }
  return { ok: true, status: 'granted', message: 'Native alerts enabled on this device.' }
}

export async function disableEdgeAndroidFcmPush(supabaseClient, token) {
  if (!isEdgeAndroidShell()) return { ok: false, message: 'Not in Edge app shell.' }
  try {
    const { data: { user } } = await supabaseClient.auth.getUser()
    if (user?.id) writePushOptInIntent(user.id, false)
  } catch {
    // best-effort
  }
  if (token && supabaseClient) await deleteMyFcmDeviceToken(supabaseClient, token)
  return { ok: true, message: 'Native alerts disabled on this device.' }
}
