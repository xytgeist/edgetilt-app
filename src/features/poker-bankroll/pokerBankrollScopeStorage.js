const STORAGE_PREFIX = 'poker-bankroll-hero-scope:'

/** Same-tab memory so remount restore does not depend on a raced localStorage write. */
const memoryScopeByUser = Object.create(null)

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
  const id = String(userId || '').trim()
  if (!id) return 'personal'
  if (memoryScopeByUser[id]) return memoryScopeByUser[id]
  const key = storageKey(id)
  if (!key || typeof window === 'undefined') return 'personal'
  try {
    const raw = window.localStorage.getItem(key)
    const scope = String(raw || '').trim()
    if (scope) {
      memoryScopeByUser[id] = scope
      return scope
    }
    return 'personal'
  } catch {
    return 'personal'
  }
}

/**
 * @param {string | null | undefined} userId
 * @param {'personal' | string} scopeId
 */
export function writeStoredPokerBankrollScope(userId, scopeId) {
  const id = String(userId || '').trim()
  if (!id) return
  const next = scopeId === 'personal' ? 'personal' : String(scopeId || '').trim()
  if (!next) return
  memoryScopeByUser[id] = next
  const key = storageKey(id)
  if (!key || typeof window === 'undefined') return
  try {
    window.localStorage.setItem(key, next)
  } catch {
    /* ignore quota / private mode — memory cache still holds for this tab */
  }
}

/**
 * Prefer stored hero scope when it is still on the carousel; else last session's deal
 * (or personal). Sessions should be newest-first.
 *
 * Important: if the carousel list is still empty, keep a non-personal stored id so an
 * early restore cannot clobber a valid stake card before deals finish loading.
 *
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
  // Deals not loaded yet ... keep stored stake id (caller should wait for load).
  if (dealIds.size === 0) return stored

  // Stored id left the carousel (archived). Only follow a session's deal_id when that
  // deal is still a carousel card ... skip archived deal_ids and keep scanning.
  for (const s of sessionsNewestFirst || []) {
    const dealId = s?.deal_id == null ? 'personal' : String(s.deal_id).trim()
    if (!dealId || dealId === 'personal') return 'personal'
    if (dealIds.has(dealId)) return dealId
  }
  return 'personal'
}
