/**
 * Guest claim tokens on signup `user_metadata` so email-confirm in the IPA
 * (a new WebView) can still attach swap / stake / slice invites.
 */

import {
  stashPokerStakeClaimToken,
} from './pokerStableStakeClaimNav.js'
import {
  stashPokerSwapClaimToken,
} from './pokerTournamentSwapNav.js'
import {
  markPokerStableClaimFlowPending,
  stashPokerStableClaimToken,
} from '../poker-stable/pokerStableBackerClaimNav.js'

export const POKER_SWAP_CLAIM_META_KEY = 'poker_swap_claim_token'
export const POKER_STAKE_CLAIM_META_KEY = 'poker_stake_claim_token'
export const POKER_STABLE_CLAIM_META_KEY = 'poker_stable_claim_token'

function trimToken(value) {
  const t = String(value || '').trim()
  return t.length >= 16 ? t : ''
}

/**
 * @param {{ user_metadata?: Record<string, unknown> } | null | undefined} user
 */
export function readPokerClaimTokensFromUser(user) {
  const meta = user?.user_metadata && typeof user.user_metadata === 'object' ? user.user_metadata : {}
  return {
    swap: trimToken(meta[POKER_SWAP_CLAIM_META_KEY]),
    stake: trimToken(meta[POKER_STAKE_CLAIM_META_KEY]),
    stable: trimToken(meta[POKER_STABLE_CLAIM_META_KEY]),
  }
}

/**
 * Merge into `signUp({ options: { data } })` alongside affiliate / military stamps.
 *
 * @param {{ swapToken?: string | null, stakeToken?: string | null, stableToken?: string | null }} tokens
 */
export function pokerClaimSignupMetadata(tokens = {}) {
  const data = {}
  const swap = trimToken(tokens.swapToken)
  const stake = trimToken(tokens.stakeToken)
  const stable = trimToken(tokens.stableToken)
  if (swap) data[POKER_SWAP_CLAIM_META_KEY] = swap
  if (stake) data[POKER_STAKE_CLAIM_META_KEY] = stake
  if (stable) data[POKER_STABLE_CLAIM_META_KEY] = stable
  return data
}

/**
 * Copy metadata tokens into the same local stash the claim pages already use.
 * @returns {{ swap: string, stake: string, stable: string }}
 */
export function hydratePokerClaimStashFromUser(user) {
  const tokens = readPokerClaimTokensFromUser(user)
  if (tokens.swap) stashPokerSwapClaimToken(tokens.swap)
  if (tokens.stake) stashPokerStakeClaimToken(tokens.stake)
  if (tokens.stable) {
    stashPokerStableClaimToken(tokens.stable)
    markPokerStableClaimFlowPending()
  }
  return tokens
}

export function pokerClaimTokensPresent(tokens) {
  return Boolean(tokens?.swap || tokens?.stake || tokens?.stable)
}

/**
 * Strip claim tokens from metadata after we have copied them to local stash.
 * Merge-safe: empty string so later reads miss.
 *
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 */
export async function clearPokerClaimTokensFromUserMetadata(supabase) {
  if (!supabase?.auth?.updateUser) return
  try {
    await supabase.auth.updateUser({
      data: {
        [POKER_SWAP_CLAIM_META_KEY]: '',
        [POKER_STAKE_CLAIM_META_KEY]: '',
        [POKER_STABLE_CLAIM_META_KEY]: '',
      },
    })
  } catch {
    // attach still works from stash / URL
  }
}
