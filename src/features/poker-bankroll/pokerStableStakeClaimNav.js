import { buildStakeOnboardingBankrollUrl, stashPokerStakeOnboardingDeal } from './pokerStakeeOnboarding.js'
import {
  parsePokerStableClaimFromLocation,
  stableClaimSignupEmailRedirectUrl,
  stashPokerStableClaimToken,
} from '../poker-stable/pokerStableBackerClaimNav.js'

export const POKER_STAKE_CLAIM_RETURN_PATH = '/poker-stake-claim'
const STAKE_CLAIM_TOKEN_STORAGE_KEY = 'poker_stake_claim_return_token'

export function stashPokerStakeClaimToken(token) {
  const t = String(token || '').trim()
  if (!t || typeof window === 'undefined') return
  try {
    sessionStorage.setItem(STAKE_CLAIM_TOKEN_STORAGE_KEY, t)
  } catch {
    // ignore
  }
}

export function readStashedPokerStakeClaimToken() {
  if (typeof window === 'undefined') return null
  try {
    const t = sessionStorage.getItem(STAKE_CLAIM_TOKEN_STORAGE_KEY)
    return t ? String(t).trim() : null
  } catch {
    return null
  }
}

export function clearStashedPokerStakeClaimToken() {
  if (typeof window === 'undefined') return
  try {
    sessionStorage.removeItem(STAKE_CLAIM_TOKEN_STORAGE_KEY)
  } catch {
    // ignore
  }
}

/**
 * @param {string} pathname
 * @param {string} search
 * @returns {{ token: string } | null}
 */
export function parsePokerStakeClaimFromLocation(pathname, search = '') {
  const path = String(pathname || '')
  if (path !== POKER_STAKE_CLAIM_RETURN_PATH && path !== `${POKER_STAKE_CLAIM_RETURN_PATH}/`) {
    return null
  }
  const params = new URLSearchParams(search.startsWith('?') ? search : `?${search}`)
  const urlToken = String(params.get('token') || '').trim()
  if (urlToken) {
    stashPokerStakeClaimToken(urlToken)
    return { token: urlToken }
  }
  const stashed = readStashedPokerStakeClaimToken()
  if (stashed) return { token: stashed }
  return null
}

/** Site URL confirm redirect (always allow-listed); claim token stays in sessionStorage. */
export function stakeClaimSignupEmailRedirectUrl() {
  if (typeof window === 'undefined') return '/'
  return `${window.location.origin}/`
}

export function navigateToStakeClaimPage(token) {
  const t = String(token || '').trim()
  if (!t || typeof window === 'undefined') return
  window.location.assign(
    `${POKER_STAKE_CLAIM_RETURN_PATH}?token=${encodeURIComponent(t)}`,
  )
}

/** After guest stakee claim links the account, hard-navigate so Bankroll deep link bootstraps cleanly. */
export function navigateAfterStakeClaim(redirect) {
  if (typeof window === 'undefined') return
  clearStashedPokerStakeClaimToken()
  let dest = redirect || '/?tab=poker-bankroll'
  try {
    const url = new URL(dest, window.location.origin)
    const stableDeal = String(url.searchParams.get('stableDeal') || '').trim()
    if (stableDeal) {
      stashPokerStakeOnboardingDeal(stableDeal)
      if (url.searchParams.get('stakeOnboarding') !== '1') {
        dest = buildStakeOnboardingBankrollUrl(stableDeal)
      }
    }
    const finalUrl = new URL(dest, window.location.origin)
    window.location.assign(`${finalUrl.pathname}${finalUrl.search}`)
  } catch {
    window.location.assign('/?tab=poker-bankroll&stakeOnboarding=1')
  }
}

/** Supabase signup/OAuth redirect: preserve claim token in sessionStorage; redirect URL stays exact. */
export function authRedirectBaseForCurrentLocation() {
  if (typeof window === 'undefined') return '/'
  const origin = window.location.origin
  const claim = parsePokerStakeClaimFromLocation(
    window.location.pathname || '/',
    window.location.search || '',
  )
  if (claim?.token) {
    stashPokerStakeClaimToken(claim.token)
    return stakeClaimSignupEmailRedirectUrl()
  }
  const stableClaim = parsePokerStableClaimFromLocation(
    window.location.pathname || '/',
    window.location.search || '',
  )
  if (stableClaim?.token) {
    stashPokerStableClaimToken(stableClaim.token)
    return stableClaimSignupEmailRedirectUrl()
  }
  return `${origin}/`
}
