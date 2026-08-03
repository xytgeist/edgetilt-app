/**
 * When OAuth fails, Supabase redirects back with error / error_code in the query or hash (not the signInWithOAuth return value).
 */
export function readAuthCallbackParams() {
  const { search, hash } = window.location
  const fromSearch = new URLSearchParams(search && search.startsWith('?') ? search.slice(1) : search)
  const fromHash = new URLSearchParams((hash && hash.startsWith('#') ? hash.slice(1) : hash) || '')
  const get = (k) => fromHash.get(k) ?? fromSearch.get(k)
  let errorDescription = get('error_description') || ''
  try {
    errorDescription = decodeURIComponent(errorDescription.replace(/\+/g, ' '))
  } catch {
    // keep raw
  }
  return {
    error: get('error') || '',
    errorCode: get('error_code') || '',
    errorDescription,
  }
}

/** Implicit (hash) or PKCE (code) tokens from Supabase auth landing URLs. */
export function readAuthTokensFromLocation() {
  if (typeof window === 'undefined') {
    return { type: '', accessToken: '', refreshToken: '', code: '' }
  }
  const hashParams = new URLSearchParams((window.location.hash || '').replace(/^#/, ''))
  const searchParams = new URLSearchParams((window.location.search || '').replace(/^\?/, ''))
  const get = (k) => hashParams.get(k) ?? searchParams.get(k)
  return {
    type: get('type') || '',
    accessToken: get('access_token') || '',
    refreshToken: get('refresh_token') || '',
    code: get('code') || '',
  }
}

export function isEmailVerificationType(type) {
  const t = String(type || '').toLowerCase()
  return t === 'signup' || t === 'email' || t === 'confirmation'
}

export function hasAuthSuccessTokens(tokens) {
  return Boolean(tokens?.accessToken && tokens?.refreshToken) || Boolean(tokens?.code)
}

export function replaceUrlPreservingQuery(pathAndSearch) {
  if (typeof window === 'undefined') return
  window.history.replaceState({}, document.title, pathAndSearch || '/')
}

/** True when the URL looks like a Google/OAuth callback (not email confirm). */
export function hasOAuthProviderCallbackInLocation() {
  if (typeof window === 'undefined') return false
  const combined = `${window.location.hash || ''}${window.location.search || ''}`
  return combined.includes('provider_token')
}

export function getOAuthCallbackMessage(error, errorCode, errorDescription) {
  if (!error && !errorCode && !errorDescription) return ''
  const raw = `${error} ${errorCode} ${errorDescription}`.toLowerCase()
  if (
    raw.includes('redirect') &&
    (raw.includes('not allowed') ||
      raw.includes('invalid') ||
      raw.includes('mismatch') ||
      raw.includes('url'))
  ) {
    return 'That confirmation link could not finish. Please request a new confirmation email or try signing in again.'
  }
  if (error === 'access_denied' || raw.includes('access_denied')) {
    if (!hasOAuthProviderCallbackInLocation()) {
      return 'That confirmation link could not finish. Please request a new confirmation email or try signing in again.'
    }
    return 'Sign-in with Google was cancelled. You can try again or use your email and password.'
  }
  if (
    raw.includes('identity_already_exists') ||
    raw.includes('user_already_exists') ||
    raw.includes('email address is already registered') ||
    raw.includes('already been registered') ||
    raw.includes('user already registered') ||
    (raw.includes('already') && raw.includes('register'))
  ) {
    return 'This email already has an account. Please sign in with your email and password, or use Forgot password if you need to reset it.'
  }
  return errorDescription || 'Sign-in with Google could not be completed. Please try again or use your email and password.'
}
