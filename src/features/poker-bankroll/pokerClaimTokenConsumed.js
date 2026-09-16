/**
 * Guest claim tokens also live on signup JWT user_metadata until refresh.
 * After a successful attach, remember the token locally so hydrate cannot
 * bounce the player back to the invite page.
 */

const CONSUMED_KEY = 'poker_claim_tokens_consumed_v1'
const MAX_TOKENS = 24

function readConsumed() {
  if (typeof window === 'undefined') return []
  try {
    const raw = window.localStorage.getItem(CONSUMED_KEY)
    const list = raw ? JSON.parse(raw) : []
    if (!Array.isArray(list)) return []
    return list.map((item) => String(item || '').trim()).filter(Boolean)
  } catch {
    return []
  }
}

export function isPokerClaimTokenConsumed(token) {
  const t = String(token || '').trim()
  if (!t) return false
  return readConsumed().includes(t)
}

export function markPokerClaimTokenConsumed(token) {
  const t = String(token || '').trim()
  if (!t || typeof window === 'undefined') return
  try {
    const next = readConsumed().filter((item) => item !== t)
    next.push(t)
    window.localStorage.setItem(CONSUMED_KEY, JSON.stringify(next.slice(-MAX_TOKENS)))
  } catch {
    // ignore
  }
}
