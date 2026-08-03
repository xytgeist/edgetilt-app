/**
 * @param {string} pathname
 * @param {string} search
 * @returns {{ token: string } | null}
 */
export function parsePokerStakeClaimFromLocation(pathname, search = '') {
  const path = String(pathname || '')
  if (path !== '/poker-stake-claim' && path !== '/poker-stake-claim/') return null
  const params = new URLSearchParams(search.startsWith('?') ? search : `?${search}`)
  const token = String(params.get('token') || '').trim()
  if (!token) return null
  return { token }
}

/** Supabase signup/OAuth redirect: preserve claim token on confirm; else home. */
export function authRedirectBaseForCurrentLocation() {
  if (typeof window === 'undefined') return '/'
  const origin = window.location.origin
  const claim = parsePokerStakeClaimFromLocation(
    window.location.pathname || '/',
    window.location.search || '',
  )
  if (claim?.token) {
    return `${origin}/poker-stake-claim?token=${encodeURIComponent(claim.token)}`
  }
  return `${origin}/`
}
