/**
 * Push the Supabase session into the EdgeiOS Keychain so lock-screen CallKit
 * answer can POST `chat-calls` without waiting for WKWebView.
 * Contract: `docs/ios-native-bridge.md` `setAuthSession`.
 */
import { edgeNativeInvoke, isEdgeiOSShell } from './edgeNative.js'

/**
 * @param {import('@supabase/supabase-js').Session | null | undefined} session
 */
export async function syncEdgeNativeAuthSession(session) {
  if (typeof window === 'undefined' || !isEdgeiOSShell()) {
    return { ok: false, via: 'noop' }
  }
  const accessToken = String(session?.access_token || '').trim()
  const refreshToken = String(session?.refresh_token || '').trim()
  const supabaseUrl = String(import.meta.env.VITE_SUPABASE_URL || '').trim()
  const anonKey = String(import.meta.env.VITE_SUPABASE_ANON_KEY || '').trim()
  if (!accessToken || !refreshToken || !supabaseUrl || !anonKey) {
    return clearEdgeNativeAuthSession()
  }
  const expiresAt = Number(session?.expires_at)
  try {
    const result = await edgeNativeInvoke('setAuthSession', {
      accessToken,
      refreshToken,
      expiresAt: Number.isFinite(expiresAt) ? expiresAt : 0,
      supabaseUrl,
      anonKey,
    })
    return { ok: result?.ok !== false, via: 'bridge' }
  } catch {
    return { ok: false, via: 'error' }
  }
}

export async function clearEdgeNativeAuthSession() {
  if (typeof window === 'undefined' || !isEdgeiOSShell()) {
    return { ok: false, via: 'noop' }
  }
  try {
    const result = await edgeNativeInvoke('clearAuthSession')
    return { ok: result?.ok !== false, via: 'bridge' }
  } catch {
    return { ok: false, via: 'error' }
  }
}
