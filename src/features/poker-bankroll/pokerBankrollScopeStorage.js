const STORAGE_PREFIX = 'poker-bankroll-hero-scope:'

/** @param {string | null | undefined} userId */
function storageKey(userId) {
  const id = String(userId || '').trim()
  return id ? `${STORAGE_PREFIX}${id}` : null
}

/**
 * Last hero carousel card: `personal` or a stake deal id.
 * Written when the player selects a card (and on session start as fallback).
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

/**
 * Prefer stored hero scope when it is still on the carousel; else last session's deal
 * (or personal). Sessions should be newest-first.
 * @param {string | null | undefined} userId
 * @param {Array<{ id: string }>} carouselDeals
 * @param {Array<{ deal_id?: string | null }> | null | undefined} sessionsNewestFirst
 * @returns {'personal' | string}
 */
export function resolvePokerBankrollScopeToRestore(
  userId,
  carouselDeals = [],
  sessionsNewestFirst = [],
) {
  const dealIds = new Set(
    (carouselDeals || []).map((d) => d?.id).filter(Boolean).map(String),
  )
  const stored = readStoredPokerBankrollScope(userId)
  if (stored === 'personal') return 'personal'
  if (dealIds.has(stored)) return stored

  for (const s of sessionsNewestFirst || []) {
    const dealId = s?.deal_id == null ? 'personal' : String(s.deal_id).trim()
    if (!dealId || dealId === 'personal') return 'personal'
    if (dealIds.has(dealId)) return dealId
  }
  return 'personal'
}
