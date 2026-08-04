import { guestBackerClaimByEmail, guestBackerClaimPreview } from './pokerStableApi.js'
import {
  clearPokerStableClaimFlowPending,
  clearStashedPokerStableClaimToken,
  isPokerStableClaimFlowPending,
  navigateAfterStableClaim,
  navigateToStableClaimPage,
} from './pokerStableBackerClaimNav.js'

function stableClaimRedirectPayload(result, fallbackDealId = '', fallbackSliceId = '') {
  let dealId = fallbackDealId
  try {
    dealId =
      String(
        new URL(result?.redirect || '/?tab=poker-stable', window.location.origin).searchParams.get(
          'stableDeal',
        ) || '',
      ).trim() || dealId
  } catch {
    // ignore
  }
  return {
    redirect: result?.redirect || undefined,
    dealId: dealId || undefined,
    sliceId: result?.slice_ids?.[0] || fallbackSliceId || undefined,
  }
}

/**
 * Stale stored claim token or consumed invite → autolink by email or open pending slice onboarding.
 * @returns {Promise<boolean>}
 */
export async function recoverStaleStableBackerClaim(supabase) {
  clearStashedPokerStableClaimToken()

  const { result, error } = await guestBackerClaimByEmail(supabase)
  if (!error && Array.isArray(result?.slice_ids) && result.slice_ids.length) {
    const payload = stableClaimRedirectPayload(result)
    navigateAfterStableClaim(payload.redirect, { dealId: payload.dealId, sliceId: payload.sliceId })
    return true
  }

  return tryOpenPendingBackerSliceOnboarding(supabase, { force: true })
}

/**
 * After email confirm, only return to the claim page when the stashed token still previews.
 * @returns {Promise<boolean>}
 */
export async function resumeStableBackerClaimAfterConfirm(supabase, stashedToken) {
  const token = String(stashedToken || '').trim()
  if (!token) return false

  const { error } = await guestBackerClaimPreview(supabase, token)
  if (!error) {
    navigateToStableClaimPage(token)
    return true
  }

  return recoverStaleStableBackerClaim(supabase)
}

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
  let dealId = ''
  try {
    dealId = String(new URL(redirect, window.location.origin).searchParams.get('stableDeal') || '').trim()
  } catch {
    // ignore
  }
  navigateAfterStableClaim(redirect, { dealId, sliceId: sliceIds[0] })
  return true
}

/**
 * Slice already linked to this account but still pending accept → Stable onboarding modal.
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {{ force?: boolean }} [opts] pass force after email confirm on Site URL
 * @returns {Promise<boolean>}
 */
export async function tryOpenPendingBackerSliceOnboarding(supabase, opts = {}) {
  const force = Boolean(opts.force)
  if (!force && !isPokerStableClaimFlowPending()) return false
  clearPokerStableClaimFlowPending()

  const {
    data: { session },
  } = await supabase.auth.getSession()
  const userId = session?.user?.id
  if (!userId) return false

  const { data: slices, error: sliceErr } = await supabase
    .from('poker_stable_deal_slices')
    .select('id, deal_id, status')
    .eq('staker_user_id', userId)
    .eq('status', 'pending')
    .order('created_at', { ascending: true })
    .limit(8)
  if (sliceErr || !slices?.length) return false

  const dealIds = [...new Set(slices.map((s) => s.deal_id).filter(Boolean))]
  const { data: deals, error: dealErr } = await supabase
    .from('poker_stable_deals')
    .select('id, status, stakee_user_id, stakee_terms_ack_required')
    .in('id', dealIds)
  if (dealErr || !deals?.length) return false

  const dealById = Object.fromEntries(deals.map((d) => [d.id, d]))
  for (const slice of slices) {
    const deal = dealById[slice.deal_id]
    if (!deal) continue
    if (deal.stakee_user_id === userId) continue
    if (!['pending', 'active', 'draft'].includes(deal.status)) continue
    if (deal.stakee_terms_ack_required) continue
    navigateAfterStableClaim(`/?tab=poker-stable&stableDeal=${slice.deal_id}`, {
      dealId: slice.deal_id,
      sliceId: slice.id,
    })
    return true
  }
  return false
}
