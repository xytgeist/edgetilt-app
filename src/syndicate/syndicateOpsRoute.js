/**
 * Syndicate Ops entry: /ops, /ops/, or ?ops=1
 * (/desk kept as a harmless alias from an earlier workaround.)
 */
export function isSyndicateOpsRoute(pathname = window.location.pathname, search = window.location.search) {
  const path = String(pathname || '').replace(/\/+$/, '').toLowerCase() || '/'
  if (path === '/ops' || path === '/desk') return true
  try {
    const q = new URLSearchParams(search || '')
    const v = String(q.get('ops') || '').trim().toLowerCase()
    return v === '1' || v === 'true' || v === 'yes'
  } catch {
    return false
  }
}

export const SYNDICATE_OPS_URL = 'https://sharpesyndicate.com/ops'
