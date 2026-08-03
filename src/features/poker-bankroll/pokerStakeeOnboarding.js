/** Guest stakee first-run onboarding (stake offer modal + bankroll carousel coach). */

export const POKER_STAKE_ONBOARDING_DEAL_KEY = 'poker_stakee_onboarding_deal_id'
const POKER_STAKE_CAROUSEL_COACH_ACK_KEY = 'lvslotpro_poker_stake_carousel_coach_ack_v1'

export function stashPokerStakeOnboardingDeal(dealId) {
  const id = String(dealId || '').trim()
  if (!id || typeof window === 'undefined') return
  try {
    sessionStorage.setItem(POKER_STAKE_ONBOARDING_DEAL_KEY, id)
  } catch {
    // ignore
  }
}

export function readPokerStakeOnboardingDeal() {
  if (typeof window === 'undefined') return null
  try {
    const id = sessionStorage.getItem(POKER_STAKE_ONBOARDING_DEAL_KEY)
    return id ? String(id).trim() : null
  } catch {
    return null
  }
}

export function clearPokerStakeOnboardingDeal() {
  if (typeof window === 'undefined') return
  try {
    sessionStorage.removeItem(POKER_STAKE_ONBOARDING_DEAL_KEY)
  } catch {
    // ignore
  }
}

export function isPokerStakeOnboardingActive() {
  return Boolean(readPokerStakeOnboardingDeal())
}

/** @param {string} dealId */
export function buildStakeOnboardingBankrollUrl(dealId) {
  const id = String(dealId || '').trim()
  if (!id) return '/?tab=poker-bankroll&stakeOnboarding=1'
  return `/?tab=poker-bankroll&stableDeal=${encodeURIComponent(id)}&stakeOnboarding=1`
}

/**
 * Read `stakeOnboarding=1` from URL and stash deal id when present.
 * @param {string} [search]
 * @returns {string | null} deal id when onboarding flag is set
 */
export function consumeStakeOnboardingFromSearch(search = '') {
  if (typeof window === 'undefined') return null
  const params = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search)
  if (params.get('stakeOnboarding') !== '1') return null
  const dealId = String(params.get('stableDeal') || '').trim()
  if (dealId) stashPokerStakeOnboardingDeal(dealId)
  return dealId || readPokerStakeOnboardingDeal()
}

export function readPokerStakeCarouselCoachAck(uid) {
  if (!uid || typeof window === 'undefined') return false
  try {
    const raw = window.localStorage.getItem(POKER_STAKE_CAROUSEL_COACH_ACK_KEY)
    if (!raw) return false
    const o = JSON.parse(raw)
    return Boolean(o && typeof o === 'object' && o[uid])
  } catch {
    return false
  }
}

export function writePokerStakeCarouselCoachAck(uid) {
  if (!uid || typeof window === 'undefined') return
  try {
    const raw = window.localStorage.getItem(POKER_STAKE_CAROUSEL_COACH_ACK_KEY)
    const o = raw ? JSON.parse(raw) : {}
    const next = o && typeof o === 'object' ? { ...o } : {}
    next[uid] = true
    window.localStorage.setItem(POKER_STAKE_CAROUSEL_COACH_ACK_KEY, JSON.stringify(next))
  } catch {
    // ignore
  }
}

export function venueKindLabel(venueKind) {
  if (venueKind === 'online') return 'Online'
  if (venueKind === 'club') return 'Club app'
  return 'Live'
}
