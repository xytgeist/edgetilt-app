/**
 * lvslotpro.com is a private sandbox. Public Login / Create account → edgetilt.com.
 * Bypass for Ryan/Theo smoke: visit `https://lvslotpro.com/?sandbox_auth=1` once per tab.
 * Localhost / Vite never redirect.
 */

const SANDBOX_AUTH_BYPASS_KEY = 'lvslotpro-sandbox-auth:v1'

function prodAppOrigin() {
  return String(import.meta.env.VITE_PROD_APP_ORIGIN || 'https://edgetilt.com').replace(/\/+$/, '')
}

/** Public Vercel test host only … not localhost, not preview deploys. */
export function isPublicSandboxHost(hostname) {
  const host = String(
    hostname ?? (typeof window !== 'undefined' ? window.location.hostname : ''),
  )
    .trim()
    .toLowerCase()
  return host === 'lvslotpro.com' || host === 'www.lvslotpro.com'
}

export function hasSandboxAuthBypass() {
  if (typeof window === 'undefined') return false
  try {
    return window.sessionStorage.getItem(SANDBOX_AUTH_BYPASS_KEY) === '1'
  } catch {
    return false
  }
}

/** Call once on boot. `?sandbox_auth=1` unlocks sandbox Login for this tab. */
export function consumeSandboxAuthBypassFromLocation() {
  if (typeof window === 'undefined') return false
  try {
    const u = new URL(window.location.href)
    const raw = String(u.searchParams.get('sandbox_auth') || '').trim().toLowerCase()
    if (raw !== '1' && raw !== 'true' && raw !== 'yes') return false
    window.sessionStorage.setItem(SANDBOX_AUTH_BYPASS_KEY, '1')
    u.searchParams.delete('sandbox_auth')
    const qs = u.searchParams.toString()
    const next = `${u.pathname}${qs ? `?${qs}` : ''}${u.hash || ''}`
    window.history.replaceState({}, '', next || '/')
    return true
  } catch {
    return false
  }
}

export function shouldRedirectSandboxAuthToProd() {
  if (typeof window === 'undefined') return false
  // Consume `?sandbox_auth=1` before any redirect decision (spaAuthLocked can race boot).
  consumeSandboxAuthBypassFromLocation()
  if (!isPublicSandboxHost()) return false
  if (hasSandboxAuthBypass()) return false
  return true
}

/**
 * @param {'login' | 'create' | 'join' | string} [mode]
 * @returns {boolean} true if navigation was started
 */
export function redirectSandboxAuthToProd(mode = 'login') {
  if (typeof window === 'undefined') return false
  const create = mode === 'create' || mode === 'join'
  const auth = create ? 'join' : 'login'
  window.location.assign(`${prodAppOrigin()}/?auth=${auth}`)
  return true
}
