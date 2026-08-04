/**
 * Helpers for Supabase email-confirm landing URLs (guest claim flows + generic verify).
 */

import { isPokerStableClaimFlowPending } from '../poker-stable/pokerStableBackerClaimNav.js'

/** @param {import('@supabase/supabase-js').SupabaseClient} supabase */
export async function waitForSupabaseSession(supabase, maxMs = 3000) {
  const start = Date.now()
  while (Date.now() - start < maxMs) {
    const { data: { session } } = await supabase.auth.getSession()
    if (session?.user) return session
    await new Promise((resolve) => setTimeout(resolve, 100))
  }
  return null
}

/**
 * After email confirm (or error recovery when a session exists), route guest claim flows.
 * @returns {Promise<boolean>} true when navigation was triggered or claim view should stay put
 */
export async function routeAfterGuestClaimEmailConfirm(supabase, {
  pathname,
  search,
  parsePokerStakeClaimFromLocation,
  parsePokerStableClaimFromLocation,
  readStashedPokerStakeClaimToken,
  readStashedPokerStableClaimToken,
  navigateToStakeClaimPage,
  navigateToStableClaimPage,
  tryAutoLinkGuestStakeeOffers,
  tryAutoLinkGuestBackerOffers,
  tryOpenPendingBackerSliceOnboarding,
  resumeStableBackerClaimAfterConfirm,
  recoverStaleStableBackerClaim,
  replaceUrlPreservingQuery,
}) {
  const stakeClaimReturn = parsePokerStakeClaimFromLocation(pathname, search)
  const stableClaimReturn = parsePokerStableClaimFromLocation(pathname, search)
  const stashedClaimToken = readStashedPokerStakeClaimToken()
  const stashedStableClaimToken = readStashedPokerStableClaimToken()
  const stableClaimFlowPending = isPokerStableClaimFlowPending()

  if (stakeClaimReturn) {
    replaceUrlPreservingQuery(`${pathname}${search}`)
    return true
  }
  if (stableClaimReturn) {
    replaceUrlPreservingQuery(`${pathname}${search}`)
    return true
  }

  const onHomeAfterConfirm = pathname === '/' || pathname === ''
  if (onHomeAfterConfirm) {
    await waitForSupabaseSession(supabase)
    const linkedStakee = await tryAutoLinkGuestStakeeOffers(supabase)
    if (linkedStakee) return true
    const linkedBacker = await tryAutoLinkGuestBackerOffers(supabase)
    if (linkedBacker) return true
  }

  if (stashedClaimToken) {
    replaceUrlPreservingQuery(pathname || '/')
    navigateToStakeClaimPage(stashedClaimToken)
    return true
  }
  if (stashedStableClaimToken) {
    replaceUrlPreservingQuery(pathname || '/')
    const resumed = await resumeStableBackerClaimAfterConfirm(supabase, stashedStableClaimToken)
    if (resumed) return true
  }

  if (onHomeAfterConfirm) {
    const opened = await tryOpenPendingBackerSliceOnboarding(supabase, { force: true })
    if (opened) return true
    if (stableClaimFlowPending || stashedStableClaimToken) {
      const recovered = await recoverStaleStableBackerClaim(supabase)
      if (recovered) return true
    }
  }

  if (!onHomeAfterConfirm) {
    await waitForSupabaseSession(supabase)
    const linkedStakee = await tryAutoLinkGuestStakeeOffers(supabase)
    if (linkedStakee) return true
    const linkedBacker = await tryAutoLinkGuestBackerOffers(supabase)
    if (linkedBacker) return true
    const opened = await tryOpenPendingBackerSliceOnboarding(supabase)
    if (opened) return true
  }

  return false
}
