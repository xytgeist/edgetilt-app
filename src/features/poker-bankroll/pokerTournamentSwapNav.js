/**
 * @param {string} pathname
 * @param {string} search
 * @returns {{ token: string } | null}
 */
export function parsePokerSwapClaimFromLocation(pathname, search = '') {
  const path = String(pathname || '')
  if (path !== '/poker-swap-claim' && path !== '/poker-swap-claim/') return null
  const params = new URLSearchParams(search.startsWith('?') ? search : `?${search}`)
  const token = String(params.get('token') || '').trim()
  return { token }
}
