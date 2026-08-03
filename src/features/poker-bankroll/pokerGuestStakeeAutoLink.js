import { guestStakeeClaimByEmail } from '../poker-stable/pokerStableApi.js'
import { navigateAfterStakeClaim } from './pokerStableStakeClaimNav.js'
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
