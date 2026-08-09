import {
  isBackerInitiatedBackingDeal,
  loadDealSlices,
  loadMyStableDeals,
} from './pokerStableApi.js'

/** Dispatched after Accept/Decline so AppShell can clear breadcrumb dots. */
export const POKER_OFFER_ATTENTION_CHANGED_EVENT = 'poker-offer-attention-changed'

export function notifyPokerOfferAttentionChanged() {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent(POKER_OFFER_ATTENTION_CHANGED_EVENT))
}

/**
 * Bankroll Manager: viewer is player on a backer Create Stake offer awaiting Accept/Decline.
 * Matches `pendingBackerOffer` in PokerBankrollTracker.
 *
 * @param {object[]} deals
 * @param {string} userId
 */
export function viewerHasPendingBankrollOfferAttention(deals, userId) {
  if (!userId) return false
  return (deals || []).some(
    (deal) =>
      deal?.stakee_user_id === userId &&
      deal?.status === 'pending' &&
      isBackerInitiatedBackingDeal(deal) &&
      !deal?.staker_terms_ack_required &&
      !deal?.stakee_terms_ack_required,
  )
}

/**
 * Stable Manager: pending slice invite (Accept/Decline) or counter-proposal for the lead backer.
 *
 * @param {object[]} deals
 * @param {Record<string, object[]>} slicesByDeal
 * @param {string} userId
 */
export function viewerHasPendingStableOfferAttention(deals, slicesByDeal, userId) {
  if (!userId) return false
  for (const deal of deals || []) {
    if (!deal?.id) continue
    if (deal.status === 'revoked' || deal.status === 'declined') continue

    if (
      deal.staker_user_id === userId &&
      deal.status === 'pending' &&
      deal.staker_terms_ack_required
    ) {
      return true
    }

    const slices = slicesByDeal?.[deal.id] || []
    for (const slice of slices) {
      // Same as PokerStableHorseCarousel `isPendingSyndicateInvite`
      if (slice?.status === 'pending' && slice?.staker_user_id === userId && deal.staker_user_id !== userId) {
        return true
      }
    }
  }
  return false
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient | null | undefined} supabase
 * @param {string | null | undefined} userId
 * @returns {Promise<{ bankroll: boolean, stable: boolean, poker: boolean, error: Error | null }>}
 */
export async function fetchPokerPendingOfferAttention(supabase, userId) {
  const uid = String(userId || '').trim()
  if (!supabase || !uid) {
    return { bankroll: false, stable: false, poker: false, error: null }
  }

  const { deals, error: dealErr } = await loadMyStableDeals(supabase, uid)
  if (dealErr) {
    return { bankroll: false, stable: false, poker: false, error: dealErr }
  }

  const bankroll = viewerHasPendingBankrollOfferAttention(deals, uid)
  const dealIds = (deals || []).map((d) => d.id).filter(Boolean)
  if (!dealIds.length) {
    return { bankroll, stable: false, poker: bankroll, error: null }
  }

  const { byDeal, error: sliceErr } = await loadDealSlices(supabase, dealIds)
  if (sliceErr) {
    return { bankroll, stable: false, poker: bankroll, error: sliceErr }
  }

  const stable = viewerHasPendingStableOfferAttention(deals, byDeal, uid)
  return { bankroll, stable, poker: bankroll || stable, error: null }
}
