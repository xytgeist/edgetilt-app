const STORAGE_PREFIX = 'poker-bankroll-hero-scope:'

/** @param {string | null | undefined} userId */
function storageKey(userId) {
  const id = String(userId || '').trim()
  return id ? `${STORAGE_PREFIX}${id}` : null
}

/**
 * Last hero carousel card: `personal` or an active/pending stake deal id.
 * @param {string | null | undefined} userId
 * @returns {'personal' | string}
 */
export function readStoredPokerBankrollScope(userId) {
  const key = storageKey(userId)
  if (!key || typeof window === 'undefined') return 'personal'
  try {
    const raw = window.localStorage.getItem(key)
    const scope = String(raw || '').trim()
    return scope || 'personal'
  } catch {
    return 'personal'
  }
}

/**
 * @param {string | null | undefined} userId
 * @param {'personal' | string} scopeId
 */
export function writeStoredPokerBankrollScope(userId, scopeId) {
  const key = storageKey(userId)
  if (!key || typeof window === 'undefined') return
  const next = scopeId === 'personal' ? 'personal' : String(scopeId || '').trim()
  if (!next) return
  try {
    window.localStorage.setItem(key, next)
  } catch {
    /* ignore quota / private mode */
  }
}
