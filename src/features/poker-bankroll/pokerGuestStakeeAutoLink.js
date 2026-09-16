import { guestStakeeClaimByEmail, guestStakeeClaimLink } from '../poker-stable/pokerStableApi.js'
import { isPokerClaimTokenConsumed } from './pokerClaimTokenConsumed.js'
import {
  clearStashedPokerStakeClaimToken,
  navigateAfterStakeClaim,
} from './pokerStableStakeClaimNav.js'
import { buildStakeOnboardingBankrollUrl } from './pokerStakeeOnboarding.js'

/**
 * After sign-in / email confirm, link guest stakes invited to this account's email
 * and send the player to Poker Bankroll when a pending offer was linked.
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @returns {Promise<boolean>} true when navigation was triggered
 */
export async function tryAutoLinkGuestStakeeOffers(supabase) {
  const { result, error } = await guestStakeeClaimByEmail(supabase)
  if (error) return false
  const dealIds = Array.isArray(result?.deal_ids) ? result.deal_ids : []
  if (!dealIds.length) return false
  const redirect =
    typeof result?.redirect === 'string' && result.redirect.trim()
      ? result.redirect.trim()
      : buildStakeOnboardingBankrollUrl(dealIds[0])
  navigateAfterStakeClaim(redirect)
  return true
}

/**
 * Attach via the invite token without bouncing through /poker-stake-claim.
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} token
 * @returns {Promise<boolean>} true when navigation was triggered
 */
export async function tryLinkGuestStakeFromToken(supabase, token) {
  const t = String(token || '').trim()
  if (!t) return false
  if (isPokerClaimTokenConsumed(t)) {
    clearStashedPokerStakeClaimToken()
    return false
  }
  const { result, error } = await guestStakeeClaimLink(supabase, t)
  if (!error) {
    navigateAfterStakeClaim(result?.redirect || buildStakeOnboardingBankrollUrl(result?.deal_id))
    return true
  }
  const byEmail = await guestStakeeClaimByEmail(supabase)
  if (!byEmail.error && Array.isArray(byEmail.result?.deal_ids) && byEmail.result.deal_ids.length) {
    navigateAfterStakeClaim(
      byEmail.result?.redirect || buildStakeOnboardingBankrollUrl(byEmail.result.deal_ids[0]),
    )
    return true
  }
  return false
}
