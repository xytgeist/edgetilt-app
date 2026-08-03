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

/** After guest stakee claim links the account, hard-navigate so Bankroll deep link bootstraps cleanly. */
export function navigateAfterStakeClaim(redirect) {
  if (typeof window === 'undefined') return
  const dest = redirect || '/?tab=poker-bankroll'
  try {
    const url = new URL(dest, window.location.origin)
    window.location.assign(`${url.pathname}${url.search}`)
  } catch {
    window.location.assign('/?tab=poker-bankroll')
  }
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
