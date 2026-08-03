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
