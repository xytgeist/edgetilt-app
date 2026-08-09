import {
  isBackerInitiatedBackingDeal,
  loadDealSlices,
  loadMyStableDeals,
} from './pokerStableApi.js'

/** Dispatched after Accept/Decline so AppShell can refresh pending offer ids. */
export const POKER_OFFER_ATTENTION_CHANGED_EVENT = 'poker-offer-attention-changed'

/** localStorage: per-user breadcrumb / pulse acks keyed by attention offer id. */
export const POKER_OFFER_ATTENTION_ACK_STORAGE_KEY = 'edgetilt.pokerOfferAttentionAck.v1'

/**
 * @typedef {{
 *   hamburger: string[],
 *   poker: string[],
 *   bankroll: string[],
 *   stable: string[],
 *   pulsedBankroll: string[],
 *   pulsedStable: string[],
 * }} PokerOfferAttentionAckBucket
 */

const EMPTY_ACK_BUCKET = () => ({
  hamburger: [],
  poker: [],
  bankroll: [],
  stable: [],
  pulsedBankroll: [],
  pulsedStable: [],
})

export function notifyPokerOfferAttentionChanged() {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent(POKER_OFFER_ATTENTION_CHANGED_EVENT))
}

/**
 * Bankroll Manager: viewer is player on a backer Create Stake offer awaiting Accept/Decline.
 * Matches `pendingBackerOffer` in PokerBankrollTracker.
 *
 * @param {object[]} deals
 * @param {string} userId
 */
export function viewerHasPendingBankrollOfferAttention(deals, userId) {
  return listPendingBankrollOfferAttentionIds(deals, userId).length > 0
}

/**
 * @param {object[]} deals
 * @param {string} userId
 * @returns {string[]}
 */
export function listPendingBankrollOfferAttentionIds(deals, userId) {
  if (!userId) return []
  const out = []
  for (const deal of deals || []) {
    if (
      deal?.stakee_user_id === userId &&
      deal?.status === 'pending' &&
      isBackerInitiatedBackingDeal(deal) &&
      !deal?.staker_terms_ack_required &&
      !deal?.stakee_terms_ack_required &&
      deal?.id
    ) {
      out.push(`br:${deal.id}`)
    }
  }
  return out
}

/**
 * Stable Manager: pending slice invite (Accept/Decline) or counter-proposal for the lead backer.
 *
 * @param {object[]} deals
 * @param {Record<string, object[]>} slicesByDeal
 * @param {string} userId
 */
export function viewerHasPendingStableOfferAttention(deals, slicesByDeal, userId) {
  return listPendingStableOfferAttentionIds(deals, slicesByDeal, userId).length > 0
}

/**
 * @param {object[]} deals
 * @param {Record<string, object[]>} slicesByDeal
 * @param {string} userId
 * @returns {string[]}
 */
export function listPendingStableOfferAttentionIds(deals, slicesByDeal, userId) {
  if (!userId) return []
  const out = []
  for (const deal of deals || []) {
    if (!deal?.id) continue
    if (deal.status === 'revoked' || deal.status === 'declined') continue

    if (
      deal.staker_user_id === userId &&
      deal.status === 'pending' &&
      deal.staker_terms_ack_required
    ) {
      out.push(`st:deal:${deal.id}`)
    }

    const slices = slicesByDeal?.[deal.id] || []
    for (const slice of slices) {
      // Same as PokerStableHorseCarousel `isPendingSyndicateInvite`
      if (
        slice?.status === 'pending' &&
        slice?.staker_user_id === userId &&
        deal.staker_user_id !== userId &&
        slice?.id
      ) {
        out.push(`st:slice:${slice.id}`)
      }
    }
  }
  return out
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient | null | undefined} supabase
 * @param {string | null | undefined} userId
 * @returns {Promise<{
 *   bankroll: boolean,
 *   stable: boolean,
 *   poker: boolean,
 *   bankrollIds: string[],
 *   stableIds: string[],
 *   pendingIds: string[],
 *   error: Error | null,
 * }>}
 */
export async function fetchPokerPendingOfferAttention(supabase, userId) {
  const empty = {
    bankroll: false,
    stable: false,
    poker: false,
    bankrollIds: /** @type {string[]} */ ([]),
    stableIds: /** @type {string[]} */ ([]),
    pendingIds: /** @type {string[]} */ ([]),
    error: null,
  }
  const uid = String(userId || '').trim()
  if (!supabase || !uid) return empty

  const { deals, error: dealErr } = await loadMyStableDeals(supabase, uid)
  if (dealErr) {
    return { ...empty, error: dealErr }
  }

  const bankrollIds = listPendingBankrollOfferAttentionIds(deals, uid)
  const dealIds = (deals || []).map((d) => d.id).filter(Boolean)
  if (!dealIds.length) {
    return {
      bankroll: bankrollIds.length > 0,
      stable: false,
      poker: bankrollIds.length > 0,
      bankrollIds,
      stableIds: [],
      pendingIds: [...bankrollIds],
      error: null,
    }
  }

  const { byDeal, error: sliceErr } = await loadDealSlices(supabase, dealIds)
  if (sliceErr) {
    return {
      bankroll: bankrollIds.length > 0,
      stable: false,
      poker: bankrollIds.length > 0,
      bankrollIds,
      stableIds: [],
      pendingIds: [...bankrollIds],
      error: sliceErr,
    }
  }

  const stableIds = listPendingStableOfferAttentionIds(deals, byDeal, uid)
  const pendingIds = [...bankrollIds, ...stableIds]
  return {
    bankroll: bankrollIds.length > 0,
    stable: stableIds.length > 0,
    poker: pendingIds.length > 0,
    bankrollIds,
    stableIds,
    pendingIds,
    error: null,
  }
}

function readAckRoot() {
  if (typeof window === 'undefined') return {}
  try {
    const raw = window.localStorage.getItem(POKER_OFFER_ATTENTION_ACK_STORAGE_KEY)
    if (!raw) return {}
    const o = JSON.parse(raw)
    return o && typeof o === 'object' ? o : {}
  } catch {
    return {}
  }
}

function writeAckRoot(root) {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(POKER_OFFER_ATTENTION_ACK_STORAGE_KEY, JSON.stringify(root))
  } catch {
    // ignore quota / private mode
  }
}

/**
 * @param {string | null | undefined} userId
 * @returns {PokerOfferAttentionAckBucket}
 */
export function readPokerOfferAttentionAcks(userId) {
  const uid = String(userId || '').trim()
  if (!uid) return EMPTY_ACK_BUCKET()
  const root = readAckRoot()
  const bucket = root[uid]
  if (!bucket || typeof bucket !== 'object') return EMPTY_ACK_BUCKET()
  const asIds = (v) => (Array.isArray(v) ? v.map(String).filter(Boolean) : [])
  return {
    hamburger: asIds(bucket.hamburger),
    poker: asIds(bucket.poker),
    bankroll: asIds(bucket.bankroll),
    stable: asIds(bucket.stable),
    pulsedBankroll: asIds(bucket.pulsedBankroll),
    pulsedStable: asIds(bucket.pulsedStable),
  }
}

/**
 * @param {string | null | undefined} userId
 * @param {PokerOfferAttentionAckBucket} bucket
 */
export function writePokerOfferAttentionAcks(userId, bucket) {
  const uid = String(userId || '').trim()
  if (!uid) return
  const root = readAckRoot()
  root[uid] = {
    hamburger: [...new Set(bucket.hamburger || [])],
    poker: [...new Set(bucket.poker || [])],
    bankroll: [...new Set(bucket.bankroll || [])],
    stable: [...new Set(bucket.stable || [])],
    pulsedBankroll: [...new Set(bucket.pulsedBankroll || [])],
    pulsedStable: [...new Set(bucket.pulsedStable || [])],
  }
  writeAckRoot(root)
}

/**
 * Drop resolved offer ids so the ack map stays small. Keep only still-pending keys.
 * @param {PokerOfferAttentionAckBucket} bucket
 * @param {string[]} pendingIds
 * @returns {PokerOfferAttentionAckBucket}
 */
export function prunePokerOfferAttentionAcks(bucket, pendingIds) {
  const live = new Set(pendingIds || [])
  const keep = (ids) => (ids || []).filter((id) => live.has(id))
  return {
    hamburger: keep(bucket.hamburger),
    poker: keep(bucket.poker),
    bankroll: keep(bucket.bankroll),
    stable: keep(bucket.stable),
    pulsedBankroll: keep(bucket.pulsedBankroll),
    pulsedStable: keep(bucket.pulsedStable),
  }
}

/**
 * @param {string[]} pendingIds
 * @param {string[]} ackedIds
 */
export function hasUnaackedAttentionIds(pendingIds, ackedIds) {
  if (!pendingIds?.length) return false
  const acked = new Set(ackedIds || [])
  return pendingIds.some((id) => !acked.has(id))
}

/**
 * @param {string[]} existing
 * @param {string[]} addIds
 */
export function mergeAttentionAckIds(existing, addIds) {
  return [...new Set([...(existing || []), ...(addIds || [])])]
}
