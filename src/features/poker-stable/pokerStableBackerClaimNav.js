import {
  buildStableBackerOnboardingUrl,
  stashPokerStableBackerOnboarding,
} from './pokerStableBackerOnboarding.js'

const STABLE_CLAIM_TOKEN_STORAGE_KEY = 'poker_stable_claim_return_token'
const STABLE_CLAIM_TOKEN_LOCAL_KEY = 'poker_stable_claim_return_token_v1'
const STABLE_CLAIM_FLOW_PENDING_KEY = 'poker_stable_claim_flow_pending'

export const POKER_STABLE_CLAIM_RETURN_PATH = '/poker-stable-claim'

function parseStashedClaimTokenEntry(raw) {
  const value = String(raw || '').trim()
  if (!value) return null
  if (value.startsWith('{')) {
    try {
      const parsed = JSON.parse(value)
      const token = String(parsed?.token || '').trim()
      const savedAt = Number(parsed?.savedAt) || 0
      if (!token) return null
      return { token, savedAt }
    } catch {
      // fall through — legacy plain token string
    }
  }
  return { token: value, savedAt: 0 }
}

function serializeStashedClaimTokenEntry(token) {
  return JSON.stringify({ token, savedAt: Date.now() })
}

export function stashPokerStableClaimToken(token) {
  const t = String(token || '').trim()
  if (!t || typeof window === 'undefined') return
  try {
    const payload = serializeStashedClaimTokenEntry(t)
    sessionStorage.setItem(STABLE_CLAIM_TOKEN_STORAGE_KEY, payload)
    localStorage.setItem(STABLE_CLAIM_TOKEN_LOCAL_KEY, payload)
  } catch {
    // ignore
  }
}

export function readStashedPokerStableClaimToken() {
  if (typeof window === 'undefined') return null
  try {
    const localEntry = parseStashedClaimTokenEntry(localStorage.getItem(STABLE_CLAIM_TOKEN_LOCAL_KEY))
    const sessionEntry = parseStashedClaimTokenEntry(
      sessionStorage.getItem(STABLE_CLAIM_TOKEN_STORAGE_KEY),
    )
    if (localEntry?.token && sessionEntry?.token && localEntry.token !== sessionEntry.token) {
      // Prefer the most recently stashed token (new invite beats an old localStorage copy).
      return (localEntry.savedAt >= sessionEntry.savedAt ? localEntry : sessionEntry).token
    }
    return sessionEntry?.token || localEntry?.token || null
  } catch {
    return null
  }
}

export function clearStashedPokerStableClaimToken() {
  if (typeof window === 'undefined') return
  try {
    sessionStorage.removeItem(STABLE_CLAIM_TOKEN_STORAGE_KEY)
    localStorage.removeItem(STABLE_CLAIM_TOKEN_LOCAL_KEY)
  } catch {
    // ignore
  }
}

/**
 * @param {string} pathname
 * @param {string} search
 * @returns {{ token: string } | null}
 */
export function parsePokerStableClaimFromLocation(pathname, search = '') {
  const path = String(pathname || '')
  if (path !== POKER_STABLE_CLAIM_RETURN_PATH && path !== `${POKER_STABLE_CLAIM_RETURN_PATH}/`) {
    return null
  }
  const params = new URLSearchParams(search.startsWith('?') ? search : `?${search}`)
  const urlToken = String(params.get('token') || '').trim()
  if (urlToken) {
    stashPokerStableClaimToken(urlToken)
    markPokerStableClaimFlowPending()
    return { token: urlToken }
  }
  const stashed = readStashedPokerStableClaimToken()
  if (stashed) return { token: stashed }
  return null
}

export function markPokerStableClaimFlowPending() {
  if (typeof window === 'undefined') return
  try {
    sessionStorage.setItem(STABLE_CLAIM_FLOW_PENDING_KEY, '1')
  } catch {
    // ignore
  }
}

export function consumePokerStableClaimFlowPending() {
  if (typeof window === 'undefined') return false
  try {
    const pending = sessionStorage.getItem(STABLE_CLAIM_FLOW_PENDING_KEY) === '1'
    if (pending) sessionStorage.removeItem(STABLE_CLAIM_FLOW_PENDING_KEY)
    return pending
  } catch {
    return false
  }
}

export function clearPokerStableClaimFlowPending() {
  if (typeof window === 'undefined') return
  try {
    sessionStorage.removeItem(STABLE_CLAIM_FLOW_PENDING_KEY)
  } catch {
    // ignore
  }
}

export function isPokerStableClaimFlowPending() {
  if (typeof window === 'undefined') return false
  try {
    return sessionStorage.getItem(STABLE_CLAIM_FLOW_PENDING_KEY) === '1'
  } catch {
    return false
  }
}

export function stableClaimSignupEmailRedirectUrl() {
  if (typeof window === 'undefined') return '/'
  return `${window.location.origin}/`
}

export function navigateToStableClaimPage(token) {
  const t = String(token || '').trim()
  if (!t || typeof window === 'undefined') return
  window.location.assign(
    `${POKER_STABLE_CLAIM_RETURN_PATH}?token=${encodeURIComponent(t)}`,
  )
}

/**
 * After guest backer claim links the account, hard-navigate so Stable opens with slice onboarding.
 * @param {string} [redirect]
 * @param {{ dealId?: string, sliceId?: string }} [opts]
 */
export function navigateAfterStableClaim(redirect, opts = {}) {
  if (typeof window === 'undefined') return
  clearStashedPokerStableClaimToken()
  clearPokerStableClaimFlowPending()
  let dest = redirect || '/?tab=poker-stable'
  try {
    const url = new URL(dest, window.location.origin)
    const dealId = String(opts.dealId || url.searchParams.get('stableDeal') || '').trim()
    const sliceId = String(opts.sliceId || url.searchParams.get('stableSlice') || '').trim()
    if (dealId) {
      stashPokerStableBackerOnboarding(sliceId, dealId)
      if (url.searchParams.get('backerSliceOnboarding') !== '1') {
        dest = buildStableBackerOnboardingUrl(dealId, sliceId)
      }
    }
    const finalUrl = new URL(dest, window.location.origin)
    window.location.assign(`${finalUrl.pathname}${finalUrl.search}`)
  } catch {
    window.location.assign('/?tab=poker-stable&backerSliceOnboarding=1')
  }
}

/** Supabase signup/OAuth redirect: preserve claim token in sessionStorage; redirect URL stays exact. */
export function authRedirectBaseForStableClaimLocation() {
  if (typeof window === 'undefined') return '/'
  const origin = window.location.origin
  const claim = parsePokerStableClaimFromLocation(
    window.location.pathname || '/',
    window.location.search || '',
  )
  if (claim?.token) {
    stashPokerStableClaimToken(claim.token)
    return stableClaimSignupEmailRedirectUrl()
  }
  return `${origin}/`
}
