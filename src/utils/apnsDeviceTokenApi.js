import { edgeNativeInvoke, isEdgeiOSShell } from './edgeNative.js'

const TOKEN_RE = /^[0-9a-f]{64,}$/i
const DEFAULT_BUNDLE_ID = 'com.edgetilt.app'

/**
 * @param {unknown} raw
 * @returns {string | null}
 */
export function normalizeApnsDeviceToken(raw) {
  const token = String(raw || '').trim().toLowerCase().replace(/\s+/g, '')
  if (!TOKEN_RE.test(token) || token.length % 2 !== 0) return null
  return token
}

/**
 * Hint only. Send path retries the other APNs host on BadDeviceToken /
 * BadEnvironmentKeyInToken (dev-signed IPA still gets sandbox device tokens
 * even when AppConfig.environment is prod / edgetilt.com).
 *
 * @param {unknown} [infoEnvironment]
 * @param {unknown} [apsEnvironment] native entitlements aps-environment when present
 * @returns {'sandbox' | 'production'}
 */
export function inferApnsEnvironment(infoEnvironment, apsEnvironment) {
  const aps = String(apsEnvironment || '').trim().toLowerCase()
  if (aps === 'development' || aps === 'sandbox') return 'sandbox'
  if (aps === 'production') return 'production'

  const env = String(infoEnvironment || '').trim().toLowerCase()
  if (env === 'test' || env === 'sandbox' || env === 'development') return 'sandbox'
  // AppConfig "prod" means live-site host, not APNs production. Entitlements are
  // still development until App Store / production aps-environment ships.
  if (isEdgeiOSShell()) return 'sandbox'
  if (env === 'prod' || env === 'production') return 'production'
  try {
    const host = String(window.location.hostname || '')
    if (/(^|\.)lvslotpro\.com$|^localhost$|^127\.0\.0\.1$/.test(host)) return 'sandbox'
  } catch {
    // ignore
  }
  return 'production'
}

async function readShellEnvironmentHint() {
  if (!isEdgeiOSShell()) return { environment: null, apsEnvironment: null }
  try {
    const info = await edgeNativeInvoke('getInfo')
    return {
      environment: info?.environment ?? null,
      apsEnvironment: info?.apsEnvironment ?? null,
    }
  } catch {
    return { environment: null, apsEnvironment: null }
  }
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabaseClient
 * @param {string} token
 */
export async function upsertMyApnsDeviceToken(supabaseClient, token) {
  const normalized = normalizeApnsDeviceToken(token)
  if (!supabaseClient || !normalized) return { ok: false, reason: 'invalid' }
  const hint = await readShellEnvironmentHint()
  const { error } = await supabaseClient.rpc('upsert_my_apns_device_token', {
    p_token: normalized,
    p_environment: inferApnsEnvironment(hint.environment, hint.apsEnvironment),
    p_bundle_id: DEFAULT_BUNDLE_ID,
    p_user_agent: typeof navigator !== 'undefined' ? navigator.userAgent : null,
  })
  if (error) return { ok: false, reason: error.message || 'rpc' }
  return { ok: true, token: normalized }
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabaseClient
 * @param {string} token
 */
export async function deleteMyApnsDeviceToken(supabaseClient, token) {
  const normalized = normalizeApnsDeviceToken(token)
  if (!supabaseClient || !normalized) return { ok: false }
  const { error } = await supabaseClient.rpc('delete_my_apns_device_token', {
    p_token: normalized,
  })
  if (error) return { ok: false }
  return { ok: true }
}
