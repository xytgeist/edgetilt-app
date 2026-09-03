/**
 * Syndicate Ops entry: /desk, /desk/, /ops/, or ?ops=1
 * Note: bare /ops (no trailing slash) is 308→/ on sharpesyndicate.com
 * (Cloudflare Redirect Rule or cached permanent redirect). Prefer /desk.
 */
export function isSyndicateOpsRoute(pathname = window.location.pathname, search = window.location.search) {
  const path = String(pathname || '').replace(/\/+$/, '').toLowerCase() || '/'
  if (path === '/desk' || path === '/ops') return true
  try {
    const q = new URLSearchParams(search || '')
    const v = String(q.get('ops') || '').trim().toLowerCase()
    return v === '1' || v === 'true' || v === 'yes'
  } catch {
    return false
  }
}

export const SYNDICATE_OPS_URL = 'https://sharpesyndicate.com/desk'
