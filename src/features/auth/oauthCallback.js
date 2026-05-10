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
    errorDescription
  }
}

export function getOAuthCallbackMessage(error, errorCode, errorDescription) {
  if (!error && !errorCode && !errorDescription) return ''
  const raw = `${error} ${errorCode} ${errorDescription}`.toLowerCase()
  if (error === 'access_denied' || raw.includes('access_denied')) {
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
