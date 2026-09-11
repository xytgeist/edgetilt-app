/**
 * Helpers for Supabase email-confirm landing URLs (guest claim flows + generic verify).
 */

import { isPokerStableClaimFlowPending } from '../poker-stable/pokerStableBackerClaimNav.js'

/** First-party confirm path. Email templates use token_hash here so Universal Links can open the IPA. */
export const AUTH_CONFIRM_PATH = '/auth/confirm'

/** Custom scheme already on the store IPA. Opens the app; path is ignored until a new binary. */
export function edgeAppOpenSchemeUrl() {
  return 'edgetilt://open'
}

/**
 * Next-IPA path. Native maps this to `https://…/auth/confirm?…` in the WKWebView.
 * Do not use after the browser has already consumed the hash.
 */
export function edgeAppAuthConfirmSchemeUrl(parsed) {
  const tokenHash = String(parsed?.tokenHash || '').trim()
  const type = String(parsed?.type || '').trim()
  if (!tokenHash || !type) return edgeAppOpenSchemeUrl()
  const q = new URLSearchParams()
  q.set('token_hash', tokenHash)
  q.set('type', type)
  return `edgetilt://auth/confirm?${q.toString()}`
}

const AUTH_CONFIRM_OTP_TYPES = new Set([
  'signup',
  'invite',
  'magiclink',
  'recovery',
  'email_change',
  'email',
])

/**
 * @param {string} pathname
 * @param {string} [search]
 * @returns {{ tokenHash: string, type: string, next: string } | null}
 */
export function parseAuthConfirmFromLocation(pathname, search = '') {
  const path = String(pathname || '').replace(/\/+$/, '') || '/'
  if (path !== AUTH_CONFIRM_PATH) return null
  const params = new URLSearchParams(search.startsWith('?') ? search : `?${search}`)
  return {
    tokenHash: String(params.get('token_hash') || '').trim(),
    type: String(params.get('type') || '').trim().toLowerCase(),
    next: String(params.get('next') || '').trim(),
  }
}

export function isAuthConfirmRecovery(parsed) {
  if (!parsed) return false
  if (parsed.type === 'recovery') return true
  const next = String(parsed.next || '')
  return next === '/reset-password' || next.startsWith('/reset-password?')
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {{ tokenHash?: string, type?: string } | null} parsed
 */
export async function verifyAuthConfirmOtp(supabase, parsed) {
  const tokenHash = String(parsed?.tokenHash || '').trim()
  const type = String(parsed?.type || '').trim().toLowerCase()
  if (!tokenHash || !AUTH_CONFIRM_OTP_TYPES.has(type)) {
    return {
      data: { user: null, session: null },
      error: new Error('That confirmation link is missing a token.'),
    }
  }
  return supabase.auth.verifyOtp({
    token_hash: tokenHash,
    type,
  })
}

export function mapAuthConfirmError(error) {
  const code = String(error?.code || error?.name || '')
  const message = String(error?.message || '')
  const raw = `${code} ${message}`.toLowerCase()
  if (
    raw.includes('otp_expired') ||
    raw.includes('email link is invalid') ||
    raw.includes('link is invalid or has expired') ||
    (raw.includes('expired') && raw.includes('link'))
  ) {
    return 'That confirmation link expired or was already used. Sign in if you already confirmed, or request a new email.'
  }
  if (raw.includes('missing a token')) {
    return 'That confirmation link is missing a token. Request a new email.'
  }
  if (raw.includes('invalid') || raw.includes('token')) {
    return 'That confirmation link is invalid or was already used. Sign in if you already confirmed, or request a new email.'
  }
  return message || 'That confirmation link could not finish. Request a new email or try signing in.'
}

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
  parsePokerSwapClaimFromLocation,
  readStashedPokerStakeClaimToken,
  readStashedPokerStableClaimToken,
  readStashedPokerSwapClaimToken,
  navigateToStakeClaimPage,
  navigateToSwapClaimPage,
  tryAutoLinkGuestStakeeOffers,
  tryAutoLinkGuestBackerOffers,
  tryAutoLinkGuestSwapOffers,
  tryOpenPendingBackerSliceOnboarding,
  resumeStableBackerClaimAfterConfirm,
  recoverStaleStableBackerClaim,
  replaceUrlPreservingQuery,
}) {
  const stakeClaimReturn = parsePokerStakeClaimFromLocation(pathname, search)
  const stableClaimReturn = parsePokerStableClaimFromLocation(pathname, search)
  const swapClaimReturn = parsePokerSwapClaimFromLocation?.(pathname, search) || null
  const stashedClaimToken = readStashedPokerStakeClaimToken()
  const stashedStableClaimToken = readStashedPokerStableClaimToken()
  const stashedSwapClaimToken = readStashedPokerSwapClaimToken?.() || null
  const stableClaimFlowPending = isPokerStableClaimFlowPending()

  if (stakeClaimReturn) {
    replaceUrlPreservingQuery(`${pathname}${search}`)
    return true
  }
  if (stableClaimReturn) {
    replaceUrlPreservingQuery(`${pathname}${search}`)
    return true
  }
  if (swapClaimReturn) {
    replaceUrlPreservingQuery(`${pathname}${search}`)
    return true
  }

  const onHomeAfterConfirm = pathname === '/' || pathname === ''
  if (onHomeAfterConfirm) {
    await waitForSupabaseSession(supabase)
    const linkedSwap = await tryAutoLinkGuestSwapOffers?.(supabase)
    if (linkedSwap) return true
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
  if (stashedSwapClaimToken) {
    replaceUrlPreservingQuery(pathname || '/')
    navigateToSwapClaimPage?.(stashedSwapClaimToken)
    return true
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
    const linkedSwap = await tryAutoLinkGuestSwapOffers?.(supabase)
    if (linkedSwap) return true
    const linkedStakee = await tryAutoLinkGuestStakeeOffers(supabase)
    if (linkedStakee) return true
    const linkedBacker = await tryAutoLinkGuestBackerOffers(supabase)
    if (linkedBacker) return true
    const opened = await tryOpenPendingBackerSliceOnboarding(supabase)
    if (opened) return true
  }

  return false
}
