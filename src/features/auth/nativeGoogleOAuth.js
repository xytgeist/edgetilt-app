/**
 * Google OAuth via native auth sheet (EdgeAndroid Chrome Custom Tabs).
 * Keeps Google out of the embedded WebView (Google Error 400 / malformed request).
 */

import { canStartEdgeWebAuthSession, startEdgeWebAuthSession } from '../../utils/edgeNative.js'
import { isEdgeAndroidShell } from '../../utils/edgeAndroid.js'
import { authRedirectUrlWithPromoStamps } from '../billing/militaryPromoStamp.js'

/** Supabase redirect allowlisted on test + prod (custom scheme → app). */
export const EDGE_NATIVE_GOOGLE_OAUTH_REDIRECT = 'edgetilt://auth-callback'

/** Always show the Google account list (Custom Tabs / Chrome otherwise SSO the last account). */
export const GOOGLE_OAUTH_QUERY_PARAMS = { prompt: 'select_account' }

export function canNativeGoogleOAuth() {
  return isEdgeAndroidShell() && canStartEdgeWebAuthSession()
}

/**
 * Build redirectTo for native Google OAuth: edgetilt://auth-callback + promo query stamps.
 * Claim tokens stay in sessionStorage via existing stash helpers before OAuth starts.
 */
export function nativeGoogleOAuthRedirectTo(httpsRedirectBase) {
  const origin = typeof window !== 'undefined' ? window.location.origin : 'https://edgetilt.com'
  const stamped = authRedirectUrlWithPromoStamps(httpsRedirectBase || `${origin}/`)
  try {
    const https = new URL(stamped, origin)
    const cb = new URL(EDGE_NATIVE_GOOGLE_OAUTH_REDIRECT)
    https.searchParams.forEach((value, key) => {
      if (value != null && String(value).length) cb.searchParams.set(key, value)
    })
    return cb.toString()
  } catch {
    return EDGE_NATIVE_GOOGLE_OAUTH_REDIRECT
  }
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {{ redirectTo: string, mode?: 'signIn' | 'link' }} opts
 * @returns {Promise<{ cancelled: boolean, data?: { user?: unknown, session?: unknown } }>}
 */
export async function runNativeGoogleOAuth(supabase, { redirectTo, mode = 'signIn' }) {
  if (!canNativeGoogleOAuth()) {
    throw new Error('Native Google OAuth is not available in this app build.')
  }
  const options = {
    redirectTo,
    skipBrowserRedirect: true,
    queryParams: GOOGLE_OAUTH_QUERY_PARAMS,
  }
  const started =
    mode === 'link'
      ? await supabase.auth.linkIdentity({ provider: 'google', options })
      : await supabase.auth.signInWithOAuth({ provider: 'google', options })
  if (started.error) throw started.error
  const url = started.data?.url
  if (!url) throw new Error('Google sign-in did not return an authorize URL.')

  const result = await startEdgeWebAuthSession(url, { callbackScheme: 'edgetilt' })
  if (result?.cancelled) return { cancelled: true }
  if (!result?.ok) {
    throw new Error(result?.error || 'Google sign-in did not finish.')
  }

  const cbUrl = String(result.url || '')
  let code = ''
  let accessToken = ''
  let refreshToken = ''
  try {
    const u = new URL(cbUrl)
    code = (u.searchParams.get('code') || '').trim()
    accessToken = (u.searchParams.get('access_token') || '').trim()
    refreshToken = (u.searchParams.get('refresh_token') || '').trim()
    if ((!accessToken || !refreshToken) && u.hash) {
      const hash = new URLSearchParams(u.hash.replace(/^#/, ''))
      accessToken = accessToken || (hash.get('access_token') || '').trim()
      refreshToken = refreshToken || (hash.get('refresh_token') || '').trim()
      code = code || (hash.get('code') || '').trim()
    }
  } catch {
    throw new Error('Google sign-in returned a bad callback URL.')
  }

  if (code) {
    const { data, error } = await supabase.auth.exchangeCodeForSession(code)
    if (error) throw error
    return { cancelled: false, data }
  }
  if (accessToken && refreshToken) {
    const { data, error } = await supabase.auth.setSession({
      access_token: accessToken,
      refresh_token: refreshToken,
    })
    if (error) throw error
    return { cancelled: false, data }
  }

  const { data: sessionData } = await supabase.auth.getSession()
  if (sessionData?.session) return { cancelled: false, data: sessionData }
  throw new Error('Google sign-in finished without a session.')
}
