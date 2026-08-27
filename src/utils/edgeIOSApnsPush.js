/**
 * Shared EdgeiOS APNs token path (Lounge Settings + Offers reminders).
 * One hex token row per device in `apns_device_tokens`.
 */
import {
  deleteMyApnsDeviceToken,
  upsertMyApnsDeviceToken,
} from './apnsDeviceTokenApi.js'
import {
  getEdgeiOSPushPermissionStatus,
  getEdgeiOSPushToken,
  isEdgeiOSShell,
  openEdgeAppSettings,
  requestEdgeiOSPushPermission,
} from './edgeNative.js'
import { writePushOptInIntent } from './pushOptInIntent.js'

const EDGE_PUSH_DENIED_SETTINGS_MESSAGE =
  'Notifications are off in iPhone Settings. Turn on Allow Notifications for Edge, then return here and try again.'

/**
 * Read native permission + whether this device token is saved (no upsert).
 * @returns {Promise<{ status: 'granted' | 'denied' | 'prompt', token: string | null, serverRegistered: boolean }>}
 */
export async function syncEdgeIOSApnsPushState(supabaseClient) {
  if (!isEdgeiOSShell()) {
    return { status: 'prompt', token: null, serverRegistered: false }
  }
  const [{ status }, { token }] = await Promise.all([
    getEdgeiOSPushPermissionStatus(),
    getEdgeiOSPushToken(),
  ])
  if (status !== 'granted' || !token || !supabaseClient) {
    return { status, token, serverRegistered: false }
  }
  const normalized = token.trim().toLowerCase()
  const { data, error } = await supabaseClient
    .from('apns_device_tokens')
    .select('id')
    .eq('token', normalized)
    .maybeSingle()
  if (error) return { status, token, serverRegistered: false }
  return { status, token, serverRegistered: Boolean(data?.id) }
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabaseClient
 * @returns {Promise<{ ok: boolean, status: 'granted' | 'denied' | 'prompt', message: string }>}
 */
export async function enableEdgeIOSApnsPush(supabaseClient) {
  if (!isEdgeiOSShell()) {
    return { ok: false, status: 'prompt', message: 'Native push is only available in the Edge app.' }
  }

  const { status: currentStatus } = await getEdgeiOSPushPermissionStatus()
  if (currentStatus === 'denied') {
    await openEdgeAppSettings()
    return {
      ok: false,
      status: 'denied',
      message: EDGE_PUSH_DENIED_SETTINGS_MESSAGE,
      openedSettings: true,
    }
  }

  const { status, via } = await requestEdgeiOSPushPermission()
  if (status !== 'granted') {
    if (status === 'denied') {
      await openEdgeAppSettings()
      return {
        ok: false,
        status: 'denied',
        message: EDGE_PUSH_DENIED_SETTINGS_MESSAGE,
        openedSettings: true,
      }
    }
    const message =
      via === 'error'
        ? 'Could not reach the native push bridge.'
        : 'Notification permission is still pending.'
    return { ok: false, status, message }
  }
  let token = (await getEdgeiOSPushToken()).token
  if (!token) {
    for (let i = 0; i < 8; i += 1) {
      await new Promise((r) => setTimeout(r, 500))
      token = (await getEdgeiOSPushToken()).token
      if (token) break
    }
  }
  if (!token) {
    return {
      ok: false,
      status: 'granted',
      message: 'Permission granted. Waiting for device token…',
    }
  }
  if (!supabaseClient) {
    return { ok: false, status: 'granted', message: 'Sign in to enable push on this device.' }
  }
  const saved = await upsertMyApnsDeviceToken(supabaseClient, token)
  if (!saved.ok) {
    return {
      ok: false,
      status: 'granted',
      message: 'Permission granted, but this iPhone was not saved for alerts.',
    }
  }
  try {
    const {
      data: { user },
    } = await supabaseClient.auth.getUser()
    if (user?.id) writePushOptInIntent(user.id, true)
  } catch {
    // best-effort
  }
  return { ok: true, status: 'granted', message: 'Native alerts enabled on this device.' }
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabaseClient
 * @param {string | null | undefined} token
 */
export async function disableEdgeIOSApnsPush(supabaseClient, token) {
  if (!isEdgeiOSShell()) return { ok: false, message: 'Not in Edge app shell.' }
  try {
    const {
      data: { user },
    } = await supabaseClient.auth.getUser()
    if (user?.id) writePushOptInIntent(user.id, false)
  } catch {
    // best-effort
  }
  if (token && supabaseClient) {
    await deleteMyApnsDeviceToken(supabaseClient, token)
  }
  return { ok: true, message: 'Native alerts disabled on this device.' }
}
