import { guestBackerClaimByEmail } from '../poker-stable/pokerStableApi.js'
import { navigateAfterStableClaim } from '../poker-stable/pokerStableBackerClaimNav.js'

/**
 * After sign-in / email confirm, link guest backer slices invited to this account's email
 * and send the backer to Stable Manager when a pending slice was linked.
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @returns {Promise<boolean>} true when navigation was triggered
 */
export async function tryAutoLinkGuestBackerOffers(supabase) {
  const { result, error } = await guestBackerClaimByEmail(supabase)
  if (error) return false
  const sliceIds = Array.isArray(result?.slice_ids) ? result.slice_ids : []
  if (!sliceIds.length) return false
  const redirect =
    typeof result?.redirect === 'string' && result.redirect.trim()
      ? result.redirect.trim()
      : '/?tab=poker-stable'
  navigateAfterStableClaim(redirect)
  return true
}
