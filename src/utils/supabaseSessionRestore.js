/** Refresh when access token expires within this window (seconds). */
const REFRESH_BEFORE_EXPIRY_SEC = 120

/** Single-flight restore so iOS/PWA resume + SIGNED_OUT recovery don't pile up auth locks. */
let restoreInFlight = null

/**
 * @returns {boolean} True when Supabase auth JSON is still in localStorage.
 */
export function hasStoredSupabaseAuthToken() {
  if (typeof window === 'undefined') return false
  try {
    for (let i = 0; i < window.localStorage.length; i++) {
      const key = window.localStorage.key(i) || ''
      if (key.startsWith('sb-') && key.endsWith('-auth-token')) return true
    }
  } catch {
    // ignore
  }
  return false
}

/**
 * Restore or refresh the caller session — important for iOS PWA cold boot / resume
 * when background timers did not run and `getSession()` can briefly return null.
 * Concurrent callers share one in-flight attempt (avoids auth-token lock storms).
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 */
export async function restoreSupabaseSession(supabase) {
  if (restoreInFlight) return restoreInFlight

  restoreInFlight = (async () => {
    const {
      data: { session },
    } = await supabase.auth.getSession()

    if (session?.access_token) {
      const nowSecs = Math.floor(Date.now() / 1000)
      const expiresAt = session.expires_at ?? 0
      const nearExpiry = !expiresAt || expiresAt - nowSecs < REFRESH_BEFORE_EXPIRY_SEC
      if (!nearExpiry) return session

      const { data: refreshed, error } = await supabase.auth.refreshSession()
      if (!error && refreshed?.session?.access_token) return refreshed.session
      return session
    }

    if (!hasStoredSupabaseAuthToken()) return null

    const { data: refreshed, error } = await supabase.auth.refreshSession()
    if (error || !refreshed?.session?.access_token) return null
    return refreshed.session
  })().finally(() => {
    restoreInFlight = null
  })

  return restoreInFlight
}
