/**
 * SEO hub CTAs use `?auth=join` (or `?auth=login`) so the SPA opens Join / Sign in.
 * Logged-in visits ignore it after the param is stripped.
 */

/**
 * @param {string} [search]
 * @returns {'create' | 'login' | null}
 */
export function parseAuthPanelFromSearch(search) {
  const raw = String(search || '')
  const params = new URLSearchParams(raw.startsWith('?') ? raw.slice(1) : raw)
  const value = String(params.get('auth') || '').trim().toLowerCase()
  if (value === 'login' || value === 'signin') return 'login'
  if (value === 'join' || value === 'create' || value === 'signup' || value === '1') return 'create'
  return null
}

export function stripAuthPanelQueryParam() {
  if (typeof window === 'undefined') return
  try {
    const u = new URL(window.location.href)
    if (!u.searchParams.has('auth')) return
    u.searchParams.delete('auth')
    const qs = u.searchParams.toString()
    const next = `${u.pathname}${qs ? `?${qs}` : ''}${u.hash || ''}`
    window.history.replaceState({}, '', next || '/')
  } catch {
    // ignore
  }
}
