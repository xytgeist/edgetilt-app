/**
 * Guest tournament swap claim: /poker-swap-claim?token=…
 * Token stash + post-link Bankroll navigation (mirrors stake claim nav).
 */

import {
  isPokerClaimTokenConsumed,
  markPokerClaimTokenConsumed,
} from './pokerClaimTokenConsumed.js'

export const POKER_SWAP_CLAIM_RETURN_PATH = '/poker-swap-claim'
const SWAP_CLAIM_TOKEN_STORAGE_KEY = 'poker_swap_claim_return_token'
const SWAP_CLAIM_TOKEN_LOCAL_KEY = 'poker_swap_claim_return_token_v1'

function consumeSwapClaimToken(token) {
  const t = String(token || '').trim()
  if (t) markPokerClaimTokenConsumed(t)
}

export function stashPokerSwapClaimToken(token) {
  const t = String(token || '').trim()
  if (!t || typeof window === 'undefined') return
  if (isPokerClaimTokenConsumed(t)) return
  try {
    sessionStorage.setItem(SWAP_CLAIM_TOKEN_STORAGE_KEY, t)
    localStorage.setItem(SWAP_CLAIM_TOKEN_LOCAL_KEY, t)
  } catch {
    // ignore
  }
}

export function readStashedPokerSwapClaimToken() {
  if (typeof window === 'undefined') return null
  try {
    const fromLocal = localStorage.getItem(SWAP_CLAIM_TOKEN_LOCAL_KEY)
    const fromSession = sessionStorage.getItem(SWAP_CLAIM_TOKEN_STORAGE_KEY)
    const local = fromLocal ? String(fromLocal).trim() : ''
    const session = fromSession ? String(fromSession).trim() : ''
    const token = local && session && local !== session ? local : session || local || null
    if (token && isPokerClaimTokenConsumed(token)) {
      clearStashedPokerSwapClaimToken()
      return null
    }
    return token
  } catch {
    return null
  }
}

export function clearStashedPokerSwapClaimToken() {
  if (typeof window === 'undefined') return
  try {
    sessionStorage.removeItem(SWAP_CLAIM_TOKEN_STORAGE_KEY)
    localStorage.removeItem(SWAP_CLAIM_TOKEN_LOCAL_KEY)
  } catch {
    // ignore
  }
}

/**
 * @param {string} pathname
 * @param {string} search
 * @returns {{ token: string } | null}
 */
export function parsePokerSwapClaimFromLocation(pathname, search = '') {
  const path = String(pathname || '')
  if (path !== POKER_SWAP_CLAIM_RETURN_PATH && path !== `${POKER_SWAP_CLAIM_RETURN_PATH}/`) {
    return null
  }
  const params = new URLSearchParams(search.startsWith('?') ? search : `?${search}`)
  const urlToken = String(params.get('token') || '').trim()
  if (urlToken) {
    stashPokerSwapClaimToken(urlToken)
    return { token: urlToken }
  }
  const stashed = readStashedPokerSwapClaimToken()
  if (stashed) return { token: stashed }
  return null
}

/** Site URL confirm redirect (always allow-listed); claim token stays in sessionStorage. */
export function swapClaimSignupEmailRedirectUrl() {
  if (typeof window === 'undefined') return '/'
  return `${window.location.origin}/`
}

export function navigateToSwapClaimPage(token) {
  const t = String(token || '').trim()
  if (!t || typeof window === 'undefined') return
  if (isPokerClaimTokenConsumed(t)) return
  window.location.assign(
    `${POKER_SWAP_CLAIM_RETURN_PATH}?token=${encodeURIComponent(t)}`,
  )
}

export function buildTournamentSwapBankrollUrl(swapId) {
  const id = String(swapId || '').trim()
  if (!id) return '/?tab=poker-bankroll'
  return `/?tab=poker-bankroll&tournamentSwap=${encodeURIComponent(id)}`
}

/** After guest swap claim links the account, hard-navigate so Bankroll deep link bootstraps cleanly. */
export function navigateAfterSwapClaim(redirect) {
  if (typeof window === 'undefined') return
  consumeSwapClaimToken(readStashedPokerSwapClaimToken())
  try {
    const urlToken = new URLSearchParams(window.location.search || '').get('token')
    consumeSwapClaimToken(urlToken)
  } catch {
    // ignore
  }
  clearStashedPokerSwapClaimToken()
  let dest = redirect || '/?tab=poker-bankroll'
  try {
    const finalUrl = new URL(dest, window.location.origin)
    if (!finalUrl.searchParams.get('tab')) {
      finalUrl.searchParams.set('tab', 'poker-bankroll')
    }
    const next = `${finalUrl.pathname}${finalUrl.search}`
    const here = `${window.location.pathname}${window.location.search}`
    const destSwap = finalUrl.searchParams.get('tournamentSwap')
    const hereSwap = new URLSearchParams(window.location.search || '').get('tournamentSwap')
    if (here === next || (destSwap && hereSwap === destSwap)) return
    window.location.assign(next)
  } catch {
    window.location.assign('/?tab=poker-bankroll')
  }
}
