/** Guest backer first-run onboarding (slice offer modal on Stable after claim link). */

export const POKER_STABLE_BACKER_ONBOARDING_SLICE_KEY = 'poker_stable_backer_onboarding_slice_id'
export const POKER_STABLE_BACKER_ONBOARDING_DEAL_KEY = 'poker_stable_backer_onboarding_deal_id'

export function stashPokerStableBackerOnboarding(sliceId, dealId) {
  const slice = String(sliceId || '').trim()
  const deal = String(dealId || '').trim()
  if (typeof window === 'undefined') return
  try {
    if (slice) sessionStorage.setItem(POKER_STABLE_BACKER_ONBOARDING_SLICE_KEY, slice)
    if (deal) sessionStorage.setItem(POKER_STABLE_BACKER_ONBOARDING_DEAL_KEY, deal)
  } catch {
    // ignore
  }
}

export function readPokerStableBackerOnboardingSliceId() {
  if (typeof window === 'undefined') return null
  try {
    const id = sessionStorage.getItem(POKER_STABLE_BACKER_ONBOARDING_SLICE_KEY)
    return id ? String(id).trim() : null
  } catch {
    return null
  }
}

export function readPokerStableBackerOnboardingDealId() {
  if (typeof window === 'undefined') return null
  try {
    const id = sessionStorage.getItem(POKER_STABLE_BACKER_ONBOARDING_DEAL_KEY)
    return id ? String(id).trim() : null
  } catch {
    return null
  }
}

export function clearPokerStableBackerOnboarding() {
  if (typeof window === 'undefined') return
  try {
    sessionStorage.removeItem(POKER_STABLE_BACKER_ONBOARDING_SLICE_KEY)
    sessionStorage.removeItem(POKER_STABLE_BACKER_ONBOARDING_DEAL_KEY)
  } catch {
    // ignore
  }
}

/** @param {string} dealId @param {string} [sliceId] */
export function buildStableBackerOnboardingUrl(dealId, sliceId) {
  const deal = String(dealId || '').trim()
  if (!deal) return '/?tab=poker-stable&backerSliceOnboarding=1'
  const params = new URLSearchParams({
    tab: 'poker-stable',
    stableDeal: deal,
    backerSliceOnboarding: '1',
  })
  const slice = String(sliceId || '').trim()
  if (slice) params.set('stableSlice', slice)
  return `/?${params.toString()}`
}

/**
 * Read onboarding flags from URL and stash ids when present.
 * @param {string} [search]
 * @returns {{ dealId: string | null, sliceId: string | null }}
 */
export function consumeBackerSliceOnboardingFromSearch(search = '') {
  if (typeof window === 'undefined') {
    return { dealId: null, sliceId: null }
  }
  const params = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search)
  if (params.get('backerSliceOnboarding') !== '1') {
    return {
      dealId: readPokerStableBackerOnboardingDealId(),
      sliceId: readPokerStableBackerOnboardingSliceId(),
    }
  }
  const dealId = String(params.get('stableDeal') || '').trim()
  const sliceId = String(params.get('stableSlice') || '').trim()
  if (dealId || sliceId) stashPokerStableBackerOnboarding(sliceId, dealId)
  return {
    dealId: dealId || readPokerStableBackerOnboardingDealId(),
    sliceId: sliceId || readPokerStableBackerOnboardingSliceId(),
  }
}
