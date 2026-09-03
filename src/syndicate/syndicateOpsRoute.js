/**
 * Syndicate Ops entry: /ops, /ops/, or ?ops=1
 */
export function isSyndicateOpsRoute(pathname = window.location.pathname, search = window.location.search) {
  const path = String(pathname || '').replace(/\/+$/, '') || '/'
  if (path === '/ops') return true
  try {
    const q = new URLSearchParams(search || '')
    const v = String(q.get('ops') || '').trim().toLowerCase()
    return v === '1' || v === 'true' || v === 'yes'
  } catch {
    return false
  }
}
