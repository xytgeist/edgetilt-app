import {
  buildTournamentSwapBankrollUrl,
  navigateAfterSwapClaim,
} from './pokerTournamentSwapNav.js'
import { guestSwapClaimByEmail } from './pokerTournamentSwapApi.js'

/**
 * After sign-in / email confirm, link guest tournament swaps invited to this account's email
 * and send the player to Poker Bankroll when a pending offer was linked.
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @returns {Promise<boolean>} true when navigation was triggered
 */
export async function tryAutoLinkGuestSwapOffers(supabase) {
  const { result, error } = await guestSwapClaimByEmail(supabase)
  if (error) return false
  const swapIds = Array.isArray(result?.swap_ids) ? result.swap_ids : []
  if (!swapIds.length) return false
  const redirect =
    typeof result?.redirect === 'string' && result.redirect.trim()
      ? result.redirect.trim()
      : buildTournamentSwapBankrollUrl(swapIds[0])
  navigateAfterSwapClaim(redirect)
  return true
}
