import { isPokerClaimTokenConsumed, markPokerClaimTokenConsumed } from './pokerClaimTokenConsumed.js'
import {
  buildTournamentSwapBankrollUrl,
  clearStashedPokerSwapClaimToken,
  navigateAfterSwapClaim,
} from './pokerTournamentSwapNav.js'
import { guestSwapClaimByEmail, guestSwapClaimLink } from './pokerTournamentSwapApi.js'

function swapClaimErrorIsDeadInvite(error) {
  const msg = String(error?.message || '').toLowerCase()
  return (
    msg.includes('this swap was cancelled') ||
    msg.includes('swap not found') ||
    msg.includes('invalid or expired') ||
    msg.includes('claim link expired')
  )
}

function forgetSwapClaimToken(token) {
  const t = String(token || '').trim()
  if (t) markPokerClaimTokenConsumed(t)
  clearStashedPokerSwapClaimToken()
}

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

/**
 * Attach via the invite token without bouncing through /poker-swap-claim.
 * Terms were already reviewed before signup.
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} token
 * @returns {Promise<boolean>} true when navigation was triggered
 */
export async function tryLinkGuestSwapFromToken(supabase, token) {
  const t = String(token || '').trim()
  if (!t) return false
  if (isPokerClaimTokenConsumed(t)) {
    clearStashedPokerSwapClaimToken()
    return false
  }
  const { result, error } = await guestSwapClaimLink(supabase, t)
  if (!error) {
    navigateAfterSwapClaim(
      result?.redirect || buildTournamentSwapBankrollUrl(result?.swap_id),
    )
    return true
  }
  const byEmail = await guestSwapClaimByEmail(supabase)
  if (!byEmail.error && Array.isArray(byEmail.result?.swap_ids) && byEmail.result.swap_ids.length) {
    forgetSwapClaimToken(t)
    navigateAfterSwapClaim(
      byEmail.result?.redirect || buildTournamentSwapBankrollUrl(byEmail.result.swap_ids[0]),
    )
    return true
  }
  if (swapClaimErrorIsDeadInvite(error)) {
    forgetSwapClaimToken(t)
  }
  return false
}
