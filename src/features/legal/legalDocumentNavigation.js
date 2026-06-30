const RETURN_AUTH_STORAGE_KEY = 'lvslotpro-legal-return-auth:v1'

/** @param {'signin' | 'join'} [tab] */
export function markLegalReturnToAuth(tab = 'join') {
  try {
    window.sessionStorage.setItem(
      RETURN_AUTH_STORAGE_KEY,
      JSON.stringify({ tab: tab === 'signin' ? 'signin' : 'join' }),
    )
  } catch {
    // ignore
  }
}

/** @returns {{ tab: 'signin' | 'join' } | null} */
export function readLegalReturnToAuth() {
  try {
    const raw = window.sessionStorage.getItem(RETURN_AUTH_STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object') return null
    return { tab: parsed.tab === 'signin' ? 'signin' : 'join' }
  } catch {
    return null
  }
}

export function clearLegalReturnToAuth() {
  try {
    window.sessionStorage.removeItem(RETURN_AUTH_STORAGE_KEY)
  } catch {
    // ignore
  }
}

export function isLegalFromAuthUrl(search) {
  if (typeof window === 'undefined') return false
  try {
    const qs = search ?? window.location.search
    return new URLSearchParams(qs).get('from') === 'auth'
  } catch {
    return false
  }
}

/** @param {'terms' | 'privacy' | 'guidelines'} slug */
export function shouldReturnLegalToAuth(slug) {
  if (slug !== 'terms' && slug !== 'privacy') return false
  return isLegalFromAuthUrl() || Boolean(readLegalReturnToAuth())
}

/** @param {'terms' | 'privacy'} slug */
export function legalDocumentPathFromAuth(slug) {
  return `/${slug}?from=auth`
}
