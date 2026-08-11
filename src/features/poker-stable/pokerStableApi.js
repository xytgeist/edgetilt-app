import { pokerSessionWinLoss } from '../poker-bankroll/pokerBankrollMath.js'
import { roundMoney, stableNum, sumSliceActionPct } from './pokerStableMath.js'

/**
 * Poker Stable API. Graceful when migration not yet applied on the env.
 * See docs/poker-stable-spec.md
 */

export function isMissingStableTableError(err) {
  const msg = String(err?.message || err?.details || '')
  const code = String(err?.code || '')
  return (
    code === '42P01' ||
    code === 'PGRST205' ||
    /poker_stable_deals|poker_deal_bankroll|poker_stable_deal_slices/i.test(msg) ||
    /Could not find the table/i.test(msg) ||
    /relation .* does not exist/i.test(msg)
  )
}

/** Player deleted/cancelled the pending offer while the backer still had it on screen. */
export const STABLE_OFFER_WITHDRAWN_CODE = 'STABLE_OFFER_WITHDRAWN'

export function isStableOfferWithdrawnError(err) {
  if (!err) return false
  if (err.code === STABLE_OFFER_WITHDRAWN_CODE) return true
  return /stake offer was (withdrawn|deleted)/i.test(String(err.message || ''))
}

function stableOfferWithdrawnError(message = 'This stake offer was withdrawn.') {
  const err = new Error(message)
  err.code = STABLE_OFFER_WITHDRAWN_CODE
  return err
}

/** Terms edit used to rebuild slice ids … Accept on a stale id is not a withdraw. */
export const STABLE_OFFER_REFRESH_CODE = 'STABLE_OFFER_REFRESH'

export function isStableOfferRefreshError(err) {
  if (!err) return false
  if (err.code === STABLE_OFFER_REFRESH_CODE) return true
  return /offer was updated/i.test(String(err.message || ''))
}

function stableOfferRefreshError(message = 'This offer was updated. Refreshing…') {
  const err = new Error(message)
  err.code = STABLE_OFFER_REFRESH_CODE
  return err
}

/** True when the slice row is gone (deal cancel cascades) or no longer pending for this backer. */
async function diagnoseMissingPendingSlice(supabase, sliceId, stakerUserId) {
  const { data: slice, error } = await supabase
    .from('poker_stable_deal_slices')
    .select('id, deal_id, status, staker_user_id')
    .eq('id', sliceId)
    .maybeSingle()
  if (error && !isMissingStableTableError(error)) return error
  if (!slice) {
    // Slice id churn (terms edit) … still pending for this backer on some deal.
    const { data: stillPending, error: pendErr } = await supabase
      .from('poker_stable_deal_slices')
      .select('id')
      .eq('staker_user_id', stakerUserId)
      .eq('status', 'pending')
      .limit(1)
    if (pendErr && !isMissingStableTableError(pendErr)) return pendErr
    if ((stillPending || []).length > 0) return stableOfferRefreshError()
    return stableOfferWithdrawnError()
  }
  if (slice.staker_user_id !== stakerUserId) {
    return new Error('Could not update slice. You lack access.')
  }
  if (slice.status !== 'pending') {
    return new Error(
      slice.status === 'active'
        ? 'This slice is already accepted.'
        : 'This slice is no longer pending.',
    )
  }
  const { data: deal } = await supabase
    .from('poker_stable_deals')
    .select('id, status')
    .eq('id', slice.deal_id)
    .maybeSingle()
  if (!deal) return stableOfferWithdrawnError()
  return new Error('Could not update slice. It may already be accepted or you lack access.')
}

/** Player created via Bankroll + Stake (`staker_user_id` null on v2 deals). */
export function isPlayerInitiatedBackingDeal(deal) {
  return Boolean(deal?.stakee_user_id) && deal?.staker_user_id == null
}

/** Backer Create Stake or legacy staker → horse request (`staker_user_id` set). */
export function isBackerInitiatedBackingDeal(deal) {
  return Boolean(deal?.staker_user_id)
}

/** Viewer is a backer on this deal (lead staker or slice participant). */
export function isViewerBackingDeal(deal, userId, slicesByDeal = {}) {
  if (!deal || !userId) return false
  if (deal.staker_user_id === userId) return true
  return (slicesByDeal[deal.id] || []).some(
    (s) => s.staker_user_id === userId && s.status !== 'declined',
  )
}

/**
 * Manage-tab slice list privacy.
 * Player and stake-initiating backer (`deal.staker_user_id`) see the full syndicate.
 * Co-backers (and all backers on player-initiated deals) only see their own slice(s).
 * @param {object | null | undefined} deal
 * @param {object[]} [slices]
 * @param {string | null | undefined} userId
 */
export function slicesVisibleOnManageTab(deal, slices = [], userId) {
  const rows = slices || []
  if (!userId) return []
  if (deal?.stakee_user_id === userId) return rows
  if (deal?.staker_user_id === userId) return rows
  return rows.filter((s) => s.staker_user_id === userId)
}

/** Viewer has accepted their backing slice (active row). */
export function viewerHasAcceptedBackingSlice(deal, slicesByDeal, userId) {
  if (!deal || !userId) return false
  return (slicesByDeal[deal.id] || []).some(
    (s) => s.staker_user_id === userId && s.status === 'active',
  )
}

/**
 * Deal ids where THIS backer accepted their slice — roll, stats, and session history.
 * Pending co-backers on an otherwise-active deal stay blind until they accept.
 */
export function dealIdsForAcceptedBackerVisibility(deals, slicesByDeal, userId) {
  if (!userId) return []
  const ids = []
  for (const deal of deals) {
    if (!viewerHasAcceptedBackingSlice(deal, slicesByDeal, userId)) continue
    if (['pending', 'active', 'settled', 'closed', 'revoked', 'declined'].includes(deal.status)) {
      ids.push(deal.id)
    }
  }
  return ids
}

/** @param {string} raw */
export function normalizeHandleInput(raw) {
  return String(raw || '')
    .trim()
    .replace(/^@+/, '')
    .toLowerCase()
}

const DEAL_SELECT =
  'id, staker_user_id, stakee_user_id, stakee_guest_label, stakee_guest_phone, stakee_guest_email, status, deal_type, venue_kind, label, notes, baseline_bankroll, starting_roll, is_migration, stake_wide_starting_pl, lifetime_pl_display, manifest_edit_mode, currency, linked_session_id, settled_at, created_at, updated_at, responded_at, pending_terms_json, stakee_terms_ack_required, staker_terms_ack_required, terms_revised_at, terms_revised_by, stakee_bankroll_archived_at, markup_rate'

const SLICE_SELECT =
  'id, deal_id, slice_index, counterparty_kind, staker_user_id, guest_label, guest_phone, guest_email, action_pct, pricing_mode, player_profit_pct, markup_rate, rakeback_mode, rakeback_player_pct, starting_pl, status, responded_at, label, created_at, stable_archived_at, stable_hidden_at'

/**
 * Cash backing never uses markup. Tournament markup is deal-level (same rate on every slice).
 * @param {string} dealType
 * @param {object[]} slices
 */
function normalizeDealPricing(dealType, slices = []) {
  if (dealType !== 'tournament_package') {
    return {
      dealMarkupRate: null,
      slices: slices.map((sl) => ({
        ...sl,
        pricingMode: 'profit_split',
        markupRate: undefined,
        playerProfitPct: sl.playerProfitPct,
      })),
    }
  }
  const modes = slices.map((sl) => sl.pricingMode || 'profit_split')
  const anyMarkup = modes.some((m) => m === 'markup')
  const anySplit = modes.some((m) => m !== 'markup')
  // Mixed modes on one stake are not supported … prefer the first slice's mode.
  const mode = anyMarkup && !anySplit ? 'markup' : anyMarkup ? slices[0]?.pricingMode || 'markup' : 'profit_split'
  if (mode === 'markup') {
    const rate = Number(
      slices.find((sl) => sl.pricingMode === 'markup')?.markupRate ?? slices[0]?.markupRate,
    )
    return {
      dealMarkupRate: Number.isFinite(rate) && rate >= 1 ? rate : null,
      slices: slices.map((sl) => ({
        ...sl,
        pricingMode: 'markup',
        markupRate: Number.isFinite(rate) && rate >= 1 ? rate : sl.markupRate,
        playerProfitPct: undefined,
      })),
    }
  }
  return {
    dealMarkupRate: null,
    slices: slices.map((sl) => ({
      ...sl,
      pricingMode: 'profit_split',
      markupRate: undefined,
      playerProfitPct: sl.playerProfitPct,
    })),
  }
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} handle
 */
export async function lookupProfileByHandle(supabase, handle, opts = {}) {
  const h = normalizeHandleInput(handle)
  if (!h) return { profile: null, error: new Error('Enter a handle.') }
  const { excludeUserId } = opts
  const { data, error } = await supabase
    .from('profiles')
    .select('user_id, handle, display_name, avatar_url')
    .ilike('handle', h)
    .maybeSingle()
  if (error) return { profile: null, error }
  if (!data) return { profile: null, error: new Error(`No Edge user @${h}.`) }
  if (excludeUserId && data.user_id === excludeUserId) {
    return { profile: null, error: new Error('You cannot add yourself as a backer.') }
  }
  return { profile: data, error: null }
}

/**
 * Prefix search for Edge profiles by @handle or display name (Stable typeahead).
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} query
 * @param {{ excludeUserId?: string, limit?: number }} [opts]
 */
export async function searchEdgeProfilesByHandle(supabase, query, opts = {}) {
  const q = normalizeHandleInput(query)
  if (!q) return { profiles: [], error: null }
  const { excludeUserId, limit = 8 } = opts
  let req = supabase
    .from('profiles')
    .select('user_id, handle, display_name, avatar_url')
    .not('handle', 'is', null)
    .is('banned_at', null)
    .or('is_bot.is.null,is_bot.eq.false')
    .or(`handle.ilike.${q}%,display_name.ilike.${q}%`)
    .order('display_name', { ascending: true, nullsFirst: false })
    .order('handle', { ascending: true })
    .limit(limit)
  if (excludeUserId) req = req.neq('user_id', excludeUserId)
  const { data, error } = await req
  if (error) return { profiles: [], error }
  const profiles = (data || []).filter((p) => !excludeUserId || p.user_id !== excludeUserId)
  return { profiles, error: null }
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} userId
 */
export async function loadMyStableDeals(supabase, userId) {
  const { data: direct, error: dErr } = await supabase
    .from('poker_stable_deals')
    .select(DEAL_SELECT)
    .or(`staker_user_id.eq.${userId},stakee_user_id.eq.${userId}`)
    .order('created_at', { ascending: false })
  if (dErr) return { deals: [], error: dErr }

  const { data: sliceRows, error: sErr } = await supabase
    .from('poker_stable_deal_slices')
    .select('deal_id')
    .eq('staker_user_id', userId)
  // Slice-only backers (player-initiated invites) have no direct deal rows.
  // Surface the slice probe error but still merge whatever we can.
  if (sErr && !isMissingStableTableError(sErr) && !(direct || []).length) {
    return { deals: [], error: sErr }
  }

  const sliceDealIds = [...new Set((sliceRows || []).map((r) => r.deal_id))]
  let sliceDeals = []
  let sliceDealErr = sErr && !isMissingStableTableError(sErr) ? sErr : null
  if (sliceDealIds.length) {
    const { data, error } = await supabase
      .from('poker_stable_deals')
      .select(DEAL_SELECT)
      .in('id', sliceDealIds)
    if (error && !isMissingStableTableError(error)) {
      if (!(direct || []).length) return { deals: [], error }
      sliceDealErr = error
    } else {
      sliceDeals = data || []
    }
  }

  const byId = new Map()
  for (const d of [...(direct || []), ...sliceDeals]) byId.set(d.id, d)
  const deals = [...byId.values()].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
  )
  return { deals, error: sliceDealErr }
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string[]} dealIds
 */
export async function loadDealSlices(supabase, dealIds) {
  /** @type {Record<string, object[]>} */
  const byDeal = {}
  if (!dealIds.length) return { byDeal, error: null }
  const { data, error } = await supabase
    .from('poker_stable_deal_slices')
    .select(SLICE_SELECT)
    .in('deal_id', dealIds)
    .order('slice_index', { ascending: true })
  if (error) return { byDeal, error }
  for (const id of dealIds) byDeal[id] = []
  for (const row of data || []) {
    if (!byDeal[row.deal_id]) byDeal[row.deal_id] = []
    byDeal[row.deal_id].push(row)
  }
  return { byDeal, error: null }
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string[]} dealIds
 */
export async function loadDealBankrollProfiles(supabase, dealIds) {
  /** @type {Record<string, { deal_id: string, overall_bankroll: number }>} */
  const byDeal = {}
  if (!dealIds.length) return { byDeal, error: null }
  const { data, error } = await supabase
    .from('poker_deal_bankroll_profiles')
    .select('deal_id, overall_bankroll')
    .in('deal_id', dealIds)
  if (error) return { byDeal, error }
  for (const row of data || []) byDeal[row.deal_id] = row
  return { byDeal, error: null }
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {Array<{ staker_user_id?: string, stakee_user_id: string }>} deals
 * @param {Record<string, object[]>} slicesByDeal
 * @param {string} selfUserId
 */
export async function loadDealCounterpartyProfiles(supabase, deals, selfUserId, slicesByDeal = {}) {
  const ids = new Set()
  for (const d of deals || []) {
    if (d.stakee_user_id && d.stakee_user_id !== selfUserId) ids.add(d.stakee_user_id)
    if (d.staker_user_id && d.staker_user_id !== selfUserId) ids.add(d.staker_user_id)
    for (const s of slicesByDeal[d.id] || []) {
      if (s.staker_user_id && s.staker_user_id !== selfUserId) ids.add(s.staker_user_id)
    }
  }
  const profileIds = [...ids].filter(Boolean)
  if (profileIds.length === 0) return { byId: {}, error: null }
  const { data, error } = await supabase
    .from('profiles')
    .select('user_id, handle, display_name, avatar_url')
    .in('user_id', profileIds)
  if (error) return { byId: {}, error }
  /** @type {Record<string, object>} */
  const byId = {}
  for (const p of data || []) byId[p.user_id] = p
  return { byId, error: null }
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string[]} dealIds
 */
export async function loadDealSessionStats(supabase, dealIds) {
  /** @type {Record<string, { sessions: number, profit: number }>} */
  const byDeal = {}
  for (const id of dealIds) byDeal[id] = { sessions: 0, profit: 0 }
  if (!dealIds.length) return { byDeal, error: null }

  const { data, error } = await supabase
    .from('poker_bankroll_sessions')
    .select('deal_id, buy_in, rebuy_amount, addon_amount, cash_out, bounty_winnings, status')
    .in('deal_id', dealIds)
    .eq('status', 'completed')
    .limit(2000)
  if (error) return { byDeal, error }

  for (const s of data || []) {
    const id = s.deal_id
    if (!id || !byDeal[id]) continue
    const wl = pokerSessionWinLoss(s)
    if (wl == null) continue
    byDeal[id].sessions += 1
    byDeal[id].profit += wl
  }
  return { byDeal, error: null }
}

/** @param {import('@supabase/supabase-js').SupabaseClient} supabase */
export async function loadBackerBankroll(supabase) {
  const { data, error } = await supabase.rpc('poker_stable_get_backer_bankroll')
  if (error) return { profile: null, error }
  return {
    profile: {
      bankroll_balance: Number(data?.bankroll_balance) || 0,
      realized_backing_pl: Number(data?.realized_backing_pl) || 0,
      has_profile: Boolean(data?.has_profile),
    },
    error: null,
  }
}

/** @param {import('@supabase/supabase-js').SupabaseClient} supabase */
export async function loadBackerBankrollAdjustments(supabase) {
  const { data, error } = await supabase
    .from('poker_stable_backer_bankroll_adjustments')
    .select('id, amount, balance_after, occurred_at, created_at')
    .order('occurred_at', { ascending: true })
  return { adjustments: data || [], error }
}

/** @param {import('@supabase/supabase-js').SupabaseClient} supabase @param {number} amount */
export async function depositBackerBankroll(supabase, amount) {
  const { data, error } = await supabase.rpc('poker_stable_backer_deposit', {
    p_amount: roundMoney(amount),
  })
  if (error) return { profile: null, error }
  return {
    profile: {
      bankroll_balance: Number(data?.bankroll_balance) || 0,
      has_profile: true,
    },
    error: null,
  }
}

/** @param {import('@supabase/supabase-js').SupabaseClient} supabase @param {number} amount */
export async function withdrawBackerBankroll(supabase, amount) {
  const { data, error } = await supabase.rpc('poker_stable_backer_withdraw', {
    p_amount: roundMoney(amount),
  })
  if (error) return { profile: null, error }
  return {
    profile: {
      bankroll_balance: Number(data?.bankroll_balance) || 0,
      has_profile: true,
    },
    error: null,
  }
}

/** @deprecated Prefer depositBackerBankroll / withdrawBackerBankroll for manual capital moves. */
export async function setBackerBankroll(supabase, amount) {
  const { data, error } = await supabase.rpc('poker_stable_set_backer_bankroll', {
    p_amount: roundMoney(amount),
  })
  if (error) return { profile: null, error }
  return {
    profile: {
      bankroll_balance: Number(data?.bankroll_balance) || 0,
      has_profile: true,
    },
    error: null,
  }
}

/** @param {import('@supabase/supabase-js').SupabaseClient} supabase @param {string[]} dealIds */
export async function loadDealSessionsForStable(supabase, dealIds) {
  if (!dealIds.length) return { sessions: [], error: null }
  const { data, error } = await supabase
    .from('poker_bankroll_sessions')
    .select(
      'id, deal_id, user_id, start_at, end_at, venue_name, venue_kind, session_type, game_variant, small_blind, big_blind, tournament_name, status, buy_in, rebuy_amount, addon_amount, cash_out, bounty_winnings, reentries, tables_count',
    )
    .in('deal_id', dealIds)
    .eq('status', 'completed')
    .order('start_at', { ascending: true })
  return { sessions: data || [], error }
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} dealId
 */
export async function loadDealTopups(supabase, dealId) {
  const { data, error } = await supabase
    .from('poker_stable_deal_topups')
    .select('*')
    .eq('deal_id', dealId)
    .order('created_at', { ascending: false })
  return { topups: data || [], error }
}

/** @param {import('@supabase/supabase-js').SupabaseClient} supabase @param {string} dealId */
export async function loadDealReductions(supabase, dealId) {
  const { data, error } = await supabase
    .from('poker_stable_deal_reductions')
    .select('*')
    .eq('deal_id', dealId)
    .order('created_at', { ascending: false })
  return { reductions: data || [], error }
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} dealId
 */
export async function loadDealSettlements(supabase, dealId) {
  const { data, error } = await supabase
    .from('poker_stable_deal_settlements')
    .select('*')
    .eq('deal_id', dealId)
    .order('created_at', { ascending: false })
  return { settlements: data || [], error }
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} dealId
 */
export async function loadLatestSettlement(supabase, dealId) {
  const { data: settlements, error: sErr } = await supabase
    .from('poker_stable_deal_settlements')
    .select('*')
    .eq('deal_id', dealId)
    .order('created_at', { ascending: false })
    .limit(1)
  if (sErr) return { settlement: null, lines: [], error: sErr }
  const settlement = settlements?.[0] || null
  if (!settlement) return { settlement: null, lines: [], error: null }
  const { data: lines, error: lErr } = await supabase
    .from('poker_stable_deal_settlement_lines')
    .select('*')
    .eq('settlement_id', settlement.id)
  return { settlement, lines: lines || [], error: lErr }
}

/** @deprecated Payment claims removed — use settlement sync ledger entries. */
export async function loadPaymentClaims(supabase, dealId) {
  void supabase
  void dealId
  return { claims: [], error: null }
}

/**
 * Player creates a cash backing deal with slices.
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {object} args
 */
export async function createBackingDeal(supabase, args) {
  const {
    stakeeUserId,
    dealType = 'cash_backing',
    label,
    notes,
    baselineBankroll,
    startingRoll,
    isMigration = false,
    stakeWideStartingPl,
    lifetimePlDisplay,
    manifestEditMode = 'locked',
    venueKind = 'live',
    slices = [],
    activate = false,
  } = args

  const { dealMarkupRate, slices: pricedSlices } = normalizeDealPricing(dealType, slices)

  const actionTotal = sumSliceActionPct(pricedSlices)
  if (actionTotal > 100.001) {
    return { deal: null, error: new Error('Total action sold cannot exceed 100%.') }
  }
  if (!pricedSlices.length) {
    return { deal: null, error: new Error('Add at least one backer slice.') }
  }
  if (dealType === 'tournament_package' && pricedSlices[0]?.pricingMode === 'markup') {
    if (!(Number(dealMarkupRate) >= 1)) {
      return { deal: null, error: new Error('Tournament markup needs a rate of 1.0 or higher.') }
    }
  }

  const baseline = roundMoney(baselineBankroll)
  const roll = roundMoney(startingRoll ?? baseline)

  const { data: authData, error: authErr } = await supabase.auth.getUser()
  if (authErr) return { deal: null, error: authErr }
  const authUserId = authData?.user?.id
  if (!authUserId) {
    return { deal: null, error: new Error('Sign in to create a stake.') }
  }
  if (stakeeUserId && stakeeUserId !== authUserId) {
    return { deal: null, error: new Error('Session mismatch — refresh and try again.') }
  }

  const { data: deal, error: dErr } = await supabase
    .from('poker_stable_deals')
    .insert({
      stakee_user_id: authUserId,
      staker_user_id: null,
      deal_type: dealType,
      status: activate ? 'active' : 'pending',
      label: label?.trim() || null,
      notes: notes?.trim() || null,
      baseline_bankroll: baseline,
      starting_roll: roll,
      is_migration: isMigration,
      stake_wide_starting_pl: stakeWideStartingPl ?? null,
      lifetime_pl_display: lifetimePlDisplay ?? null,
      manifest_edit_mode: manifestEditMode,
      venue_kind: venueKind,
      markup_rate: dealMarkupRate,
      responded_at: activate ? new Date().toISOString() : null,
    })
    .select(DEAL_SELECT)
    .single()
  if (dErr) return { deal: null, error: dErr }

  const sliceRows = pricedSlices.map((sl, idx) => ({
    deal_id: deal.id,
    slice_index: idx,
    counterparty_kind: sl.counterpartyKind || 'user',
    staker_user_id: sl.stakerUserId || null,
    guest_label: sl.guestLabel?.trim() || null,
    guest_phone: sl.guestPhone?.trim() || null,
    guest_email: sl.guestEmail?.trim()?.toLowerCase() || null,
    action_pct: sl.actionPct,
    pricing_mode: sl.pricingMode,
    player_profit_pct: sl.pricingMode === 'profit_split' ? sl.playerProfitPct : null,
    markup_rate: sl.pricingMode === 'markup' ? sl.markupRate : null,
    rakeback_mode: sl.rakebackMode || 'disabled',
    rakeback_player_pct: sl.rakebackMode === 'custom' ? sl.rakebackPlayerPct : null,
    starting_pl: sl.startingPl ?? null,
    status: sl.counterpartyKind === 'guest' || activate ? 'active' : 'pending',
    label: sl.label?.trim() || null,
    responded_at: sl.counterpartyKind === 'guest' || activate ? new Date().toISOString() : null,
  }))

  const { error: slErr } = await supabase.from('poker_stable_deal_slices').insert(sliceRows)
  if (slErr) return { deal, error: slErr }

  if (activate) {
    const { error: pErr } = await supabase.from('poker_deal_bankroll_profiles').upsert(
      { deal_id: deal.id, overall_bankroll: roll },
      { onConflict: 'deal_id' },
    )
    if (pErr) return { deal, error: pErr }
  }

  return { deal, error: null }
}

function sliceRowsFromTerms(dealId, slices) {
  return slices.map((sl, idx) => ({
    deal_id: dealId,
    slice_index: idx,
    counterparty_kind: sl.counterpartyKind || 'user',
    staker_user_id: sl.stakerUserId || null,
    guest_label: sl.guestLabel?.trim() || null,
    guest_phone: sl.guestPhone?.trim() || null,
    guest_email: sl.guestEmail?.trim()?.toLowerCase() || null,
    action_pct: sl.actionPct,
    pricing_mode: sl.pricingMode,
    player_profit_pct: sl.pricingMode === 'profit_split' ? sl.playerProfitPct : null,
    markup_rate: sl.pricingMode === 'markup' ? sl.markupRate : null,
    rakeback_mode: sl.rakebackMode || 'disabled',
    rakeback_player_pct: sl.rakebackMode === 'custom' ? sl.rakebackPlayerPct : null,
    status: sl.counterpartyKind === 'guest' ? 'active' : 'pending',
    label: sl.label?.trim() || null,
    responded_at: sl.counterpartyKind === 'guest' ? new Date().toISOString() : null,
  }))
}

async function replacePendingDealSlices(supabase, dealId, slices) {
  const { error: delErr } = await supabase
    .from('poker_stable_deal_slices')
    .delete()
    .eq('deal_id', dealId)
  if (delErr) return { error: delErr }
  if (!slices.length) return { error: new Error('Add at least one backer slice.') }
  const { error: insErr } = await supabase
    .from('poker_stable_deal_slices')
    .insert(sliceRowsFromTerms(dealId, slices))
  return { error: insErr }
}

/** Link a guest backer slice to an Edge user (slice invite pending accept in Stable). */
export async function reassignGuestSliceToUser(supabase, { sliceId, stakerUserId }) {
  const { error } = await supabase.rpc('poker_stable_reassign_guest_slice', {
    p_slice_id: sliceId,
    p_staker_user_id: stakerUserId,
  })
  if (error) return { error }
  const { data: slice, error: loadErr } = await supabase
    .from('poker_stable_deal_slices')
    .select(SLICE_SELECT)
    .eq('id', sliceId)
    .maybeSingle()
  return { slice, error: loadErr }
}

/** Stakee cancels an unsettled stake (unwinds accepted capital + markup fees, then deletes). */
export async function cancelStakeDeal(supabase, dealId, stakeeUserId) {
  const { error: notifyErr, notifiedCount, data: notifyData } = await notifyStableStakeGuests(
    supabase,
    dealId,
    { kind: 'deleted' },
  )
  let notifyWarning = null
  if (notifyErr) {
    notifyWarning = notifyErr.message || 'Guest notify failed.'
    console.warn('[poker-stable] guest delete notify failed', notifyWarning)
  } else if (notifiedCount === 0) {
    const sliceResults = notifyData?.slices || []
    const contactMissingOnly = sliceResults.every(
      (s) =>
        s.email?.reason === 'no guest email' &&
        s.sms?.reason === 'no guest phone',
    )
    if (sliceResults.length && !contactMissingOnly) {
      notifyWarning = 'Guest notify did not send.'
    }
  }

  const { error } = await supabase.rpc('poker_stable_cancel_stake_deal', {
    p_deal_id: dealId,
  })
  if (error) return { error, notifyWarning: null }
  return { error: null, notifyWarning }
}

/**
 * Legacy staker → horse request (creates deal + single slice).
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {{ stakerUserId: string, stakeeUserId: string, label?: string, notes?: string, playerProfitPct?: number, actionPct?: number }} args
 */
export async function requestHorseDeal(supabase, args) {
  const {
    stakerUserId,
    stakeeUserId,
    label,
    notes,
    playerProfitPct = 50,
    actionPct = 100,
  } = args
  if (stakerUserId === stakeeUserId) {
    return { deal: null, error: new Error('You cannot stake yourself.') }
  }

  const { data: legacyDeals } = await supabase
    .from('poker_stable_deals')
    .select('id, status')
    .eq('staker_user_id', stakerUserId)
    .eq('stakee_user_id', stakeeUserId)
    .in('status', ['pending', 'active'])
  if (legacyDeals?.length) {
    const legacy = legacyDeals[0]
    const msg =
      legacy.status === 'pending'
        ? 'You already have a pending request with this player.'
        : 'You already have an active deal with this player.'
    return { deal: null, error: new Error(msg) }
  }

  const { data: sliceDeals } = await supabase
    .from('poker_stable_deal_slices')
    .select('id, status, deal_id')
    .eq('staker_user_id', stakerUserId)
    .in('status', ['pending', 'active'])
  if (sliceDeals?.length) {
    const dealIds = sliceDeals.map((s) => s.deal_id)
    const { data: matched } = await supabase
      .from('poker_stable_deals')
      .select('id')
      .in('id', dealIds)
      .eq('stakee_user_id', stakeeUserId)
      .maybeSingle()
    if (matched) {
      return { deal: null, error: new Error('You already have a pending or active deal with this player.') }
    }
  }

  const { data: deal, error: dErr } = await supabase
    .from('poker_stable_deals')
    .insert({
      staker_user_id: stakerUserId,
      stakee_user_id: stakeeUserId,
      deal_type: 'cash_backing',
      status: 'pending',
      label: label?.trim() || null,
      notes: notes?.trim() || null,
      baseline_bankroll: 0,
      starting_roll: 0,
    })
    .select(DEAL_SELECT)
    .single()
  if (dErr) return { deal: null, error: dErr }

  const { error: slErr } = await supabase.from('poker_stable_deal_slices').insert({
    deal_id: deal.id,
    slice_index: 0,
    counterparty_kind: 'user',
    staker_user_id: stakerUserId,
    action_pct: actionPct,
    pricing_mode: 'profit_split',
    player_profit_pct: playerProfitPct,
    rakeback_mode: 'all_to_stake',
    status: 'active',
    label: label?.trim() || null,
    responded_at: new Date().toISOString(),
  })
  if (slErr) return { deal, error: slErr }

  return { deal, error: null }
}

/**
 * Backer proposes a horse deal with one or more slices (lead + optional syndicate).
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {{ stakerUserId: string, stakeeUserId?: string, stakeeGuest?: { label: string, phone?: string, email?: string }, dealType?: string, venueKind?: string, label?: string, notes?: string, baselineBankroll?: number, slices?: object[] }} args
 */
export async function requestBackingDeal(supabase, args) {
  const {
    stakerUserId,
    stakeeUserId = null,
    stakeeGuest = null,
    dealType = 'cash_backing',
    venueKind = 'live',
    label,
    notes,
    baselineBankroll = 0,
    slices = [],
  } = args
  const guestLabel = stakeeGuest?.label?.trim() || ''
  if (!stakeeUserId && !guestLabel) {
    return { deal: null, error: new Error('Pick a player or enter a guest name.') }
  }
  if (stakeeUserId && stakerUserId === stakeeUserId) {
    return { deal: null, error: new Error('You cannot stake yourself.') }
  }
  if (!slices.length) {
    return { deal: null, error: new Error('Add at least one backing slice.') }
  }
  const { dealMarkupRate, slices: pricedSlices } = normalizeDealPricing(dealType, slices)
  const leadSlice = pricedSlices.find((s) => s.stakerUserId === stakerUserId)
  if (!leadSlice) {
    return { deal: null, error: new Error('Your backing slice is required.') }
  }

  const actionTotal = sumSliceActionPct(pricedSlices)
  if (actionTotal > 100.001) {
    return { deal: null, error: new Error('Total action sold cannot exceed 100%.') }
  }
  if (dealType === 'tournament_package' && pricedSlices[0]?.pricingMode === 'markup') {
    if (!(Number(dealMarkupRate) >= 1)) {
      return { deal: null, error: new Error('Tournament markup needs a rate of 1.0 or higher.') }
    }
  }

  if (!stakeeUserId) {
    const { data: guestDeals } = await supabase
      .from('poker_stable_deals')
      .select('id, status')
      .eq('staker_user_id', stakerUserId)
      .is('stakee_user_id', null)
      .ilike('stakee_guest_label', guestLabel)
      .in('status', ['pending', 'active'])
    if (guestDeals?.length) {
      const existing = guestDeals[0]
      const { count: sliceCount, error: countErr } = await supabase
        .from('poker_stable_deal_slices')
        .select('id', { count: 'exact', head: true })
        .eq('deal_id', existing.id)
      if (countErr) return { deal: null, error: countErr }
      if (!(sliceCount === 0 && existing.status === 'pending')) {
        const msg =
          existing.status === 'pending'
            ? 'You already have a pending request for this guest player.'
            : 'You already have an active deal with this guest player.'
        return { deal: null, error: new Error(msg) }
      }
    }
  }

  const baseline = roundMoney(baselineBankroll)
  const dealFields = {
    staker_user_id: stakerUserId,
    stakee_user_id: stakeeUserId || null,
    stakee_guest_label: guestLabel || null,
    stakee_guest_phone: stakeeGuest?.phone?.trim() || null,
    stakee_guest_email: stakeeGuest?.email?.trim()?.toLowerCase() || null,
    deal_type: dealType,
    venue_kind: venueKind,
    status: 'pending',
    label: label?.trim() || null,
    notes: notes?.trim() || null,
    baseline_bankroll: baseline,
    starting_roll: 0,
    markup_rate: dealMarkupRate,
  }

  /** @type {object | null} */
  let deal = null
  if (!stakeeUserId) {
    const { data: orphanDeals } = await supabase
      .from('poker_stable_deals')
      .select('id, status')
      .eq('staker_user_id', stakerUserId)
      .is('stakee_user_id', null)
      .ilike('stakee_guest_label', guestLabel)
      .eq('status', 'pending')
      .limit(1)
    const orphan = orphanDeals?.[0]
    if (orphan?.id) {
      const { count: orphanSliceCount, error: orphanCountErr } = await supabase
        .from('poker_stable_deal_slices')
        .select('id', { count: 'exact', head: true })
        .eq('deal_id', orphan.id)
      if (orphanCountErr) return { deal: null, error: orphanCountErr }
      if (orphanSliceCount === 0) {
        const { data: reused, error: reuseErr } = await supabase
          .from('poker_stable_deals')
          .update(dealFields)
          .eq('id', orphan.id)
          .select(DEAL_SELECT)
          .single()
        if (reuseErr) return { deal: null, error: reuseErr }
        deal = reused
      }
    }
  }

  if (!deal) {
    let revokedQuery = supabase
      .from('poker_stable_deals')
      .select('id')
      .eq('staker_user_id', stakerUserId)
      .eq('status', 'revoked')
      .order('updated_at', { ascending: false })
      .limit(1)
    if (stakeeUserId) {
      revokedQuery = revokedQuery.eq('stakee_user_id', stakeeUserId)
    } else {
      revokedQuery = revokedQuery.is('stakee_user_id', null).ilike('stakee_guest_label', guestLabel)
    }
    const trimmedLabel = label?.trim() || ''
    if (trimmedLabel) {
      revokedQuery = revokedQuery.ilike('label', trimmedLabel)
    }
    const { data: revokedRows, error: revokedFindErr } = await revokedQuery
    if (revokedFindErr) return { deal: null, error: revokedFindErr }
    const revokedId = revokedRows?.[0]?.id
    if (revokedId) {
      const { data: reused, error: reuseErr } = await supabase
        .from('poker_stable_deals')
        .update({
          ...dealFields,
          status: 'pending',
          responded_at: null,
        })
        .eq('id', revokedId)
        .select(DEAL_SELECT)
        .single()
      if (reuseErr) return { deal: null, error: reuseErr }
      const { error: delErr } = await supabase
        .from('poker_stable_deal_slices')
        .delete()
        .eq('deal_id', revokedId)
      if (delErr) return { deal: null, error: delErr }
      deal = reused
    }
  }

  if (!deal) {
    const { data: inserted, error: dErr } = await supabase
      .from('poker_stable_deals')
      .insert(dealFields)
      .select(DEAL_SELECT)
      .single()
    if (dErr) return { deal: null, error: dErr }
    deal = inserted
  }

  const sliceRows = pricedSlices.map((sl, idx) => ({
    deal_id: deal.id,
    slice_index: idx,
    counterparty_kind: sl.counterpartyKind || 'user',
    staker_user_id: sl.stakerUserId || null,
    guest_label: sl.guestLabel?.trim() || null,
    guest_phone: sl.guestPhone?.trim() || null,
    guest_email: sl.guestEmail?.trim()?.toLowerCase() || null,
    action_pct: sl.actionPct,
    pricing_mode: sl.pricingMode,
    player_profit_pct: sl.pricingMode === 'profit_split' ? sl.playerProfitPct : null,
    markup_rate: sl.pricingMode === 'markup' ? sl.markupRate : null,
    rakeback_mode: sl.rakebackMode || 'disabled',
    rakeback_player_pct: sl.rakebackMode === 'custom' ? sl.rakebackPlayerPct : null,
    status: sl.stakerUserId === stakerUserId ? 'active' : 'pending',
    label: sl.label?.trim() || null,
    responded_at: sl.stakerUserId === stakerUserId ? new Date().toISOString() : null,
  }))

  const { error: slErr } = await supabase.from('poker_stable_deal_slices').insert(sliceRows)
  if (slErr) {
    await supabase.from('poker_stable_deals').delete().eq('id', deal.id)
    return { deal: null, error: slErr }
  }

  return { deal, error: null }
}

/** Sum completed session P/L for a deal (used when bootstrapping roll on accept). */
async function sumDealSessionRollDelta(supabase, dealId) {
  const { data, error } = await supabase
    .from('poker_bankroll_sessions')
    .select('buy_in, rebuy_amount, addon_amount, cash_out, bounty_winnings, status')
    .eq('deal_id', dealId)
    .in('status', ['completed', 'active'])
  if (error) throw error
  let profit = 0
  for (const s of data || []) {
    const buyIn = Number(s.buy_in) || 0
    const rebuy = Number(s.rebuy_amount) || 0
    const addon = Number(s.addon_amount) || 0
    const cost = buyIn + rebuy + addon
    if (s.status === 'active') {
      profit = roundMoney(profit - cost)
      continue
    }
    const wl = pokerSessionWinLoss(s)
    if (wl != null) profit = roundMoney(profit + wl)
  }
  return roundMoney(profit)
}

async function bootstrapDealBankrollProfile(supabase, dealId, startingRoll) {
  const base = roundMoney(startingRoll)
  let sessionProfit = 0
  try {
    sessionProfit = await sumDealSessionRollDelta(supabase, dealId)
  } catch {
    sessionProfit = 0
  }
  const overallBankroll = roundMoney(base + sessionProfit)
  const { error } = await supabase.from('poker_deal_bankroll_profiles').upsert(
    { deal_id: dealId, overall_bankroll: overallBankroll },
    { onConflict: 'deal_id' },
  )
  return { overallBankroll, error }
}

/** Guest stakee claim preview (anon + auth). */
export async function guestStakeeClaimPreview(supabase, token) {
  const { data, error } = await supabase.rpc('poker_stable_guest_stakee_claim_preview', {
    p_token: token,
  })
  return { preview: data, error }
}

/** Link signed-in Edge account to a guest stakee deal via email claim token. */
export async function guestStakeeClaimLink(supabase, token) {
  const { data, error } = await supabase.rpc('poker_stable_guest_stakee_claim_link', {
    p_token: token,
  })
  return { result: data, error }
}

/** Link guest stakes whose invitation email matches the signed-in account. */
export async function guestStakeeClaimByEmail(supabase) {
  const { data, error } = await supabase.rpc('poker_stable_guest_stakee_claim_by_email')
  return { result: data, error }
}

/** Guest backer claim preview (anon + auth). */
export async function guestBackerClaimPreview(supabase, token) {
  const { data, error } = await supabase.rpc('poker_stable_guest_backer_claim_preview', {
    p_token: token,
  })
  return { preview: data, error }
}

/** Link signed-in Edge account to a guest backer slice via email claim token. */
export async function guestBackerClaimLink(supabase, token) {
  const { data, error } = await supabase.rpc('poker_stable_guest_backer_claim_link', {
    p_token: token,
  })
  return { result: data, error }
}

/** Link guest backer slices whose invitation email matches the signed-in account. */
export async function guestBackerClaimByEmail(supabase) {
  const { data, error } = await supabase.rpc('poker_stable_guest_backer_claim_by_email')
  return { result: data, error }
}

/** Stakee accepts a backer-initiated offer (activates deal). */
export async function stakeeAcceptBackerOffer(supabase, dealId) {
  const { data, error } = await supabase.rpc('poker_stable_stakee_accept_backer_offer', {
    p_deal_id: dealId,
  })
  if (error) return { deal: null, error }
  const { data: deal, error: loadErr } = await supabase
    .from('poker_stable_deals')
    .select(DEAL_SELECT)
    .eq('id', dealId)
    .maybeSingle()
  return { deal: deal || data, error: loadErr }
}

/** Stakee declines a backer-initiated offer (kills deal for everyone). */
export async function stakeeDeclineBackerOffer(supabase, dealId) {
  const { data, error } = await supabase.rpc('poker_stable_stakee_decline_backer_offer', {
    p_deal_id: dealId,
  })
  if (error) return { deal: null, error }
  const { data: deal, error: loadErr } = await supabase
    .from('poker_stable_deals')
    .select(DEAL_SELECT)
    .eq('id', dealId)
    .maybeSingle()
  return { deal: deal || data, error: loadErr }
}

/** Hard-delete a fully declined stake (initiator Delete, or decliner Propose new terms). */
export async function deleteDeclinedStakeDeal(supabase, dealId) {
  const { error } = await supabase.rpc('poker_stable_delete_declined_deal', {
    p_deal_id: dealId,
  })
  return { error }
}

/** Stakee moves a closed stake from Bankroll carousel into Archive. */
export async function archiveStakeeBankrollDeal(supabase, dealId) {
  const { data, error } = await supabase.rpc('poker_stable_stakee_archive_bankroll_deal', {
    p_deal_id: dealId,
  })
  if (error) return { deal: null, error }
  const { data: deal, error: loadErr } = await supabase
    .from('poker_stable_deals')
    .select(DEAL_SELECT)
    .eq('id', dealId)
    .maybeSingle()
  return { deal, error: loadErr, result: data }
}

/** Backer moves a closed horse stake from carousel into Closed stakes history. */
export async function archiveBackerStableDeal(supabase, dealId) {
  const { data, error } = await supabase.rpc('poker_stable_backer_archive_stable_deal', {
    p_deal_id: dealId,
  })
  if (error) return { deal: null, error }
  const { data: deal, error: loadErr } = await supabase
    .from('poker_stable_deals')
    .select(DEAL_SELECT)
    .eq('id', dealId)
    .maybeSingle()
  return { deal, error: loadErr, result: data }
}

/** Backer soft-deletes a closed stake from their Stable Closed stakes (and carousel). */
export async function hideBackerStableDeal(supabase, dealId) {
  const { data, error } = await supabase.rpc('poker_stable_backer_hide_stable_deal', {
    p_deal_id: dealId,
  })
  if (error) return { deal: null, error }
  const { data: deal, error: loadErr } = await supabase
    .from('poker_stable_deals')
    .select(DEAL_SELECT)
    .eq('id', dealId)
    .maybeSingle()
  return { deal, error: loadErr, result: data }
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} dealId
 * @param {string} stakeeUserId
 * @param {number} [startingRoll]
 */
export async function acceptHorseDeal(supabase, dealId, stakeeUserId, startingRoll = 0) {
  const { data: peek, error: peekErr } = await supabase
    .from('poker_stable_deals')
    .select('staker_user_id')
    .eq('id', dealId)
    .maybeSingle()
  if (peekErr) return { deal: null, error: peekErr }
  if (peek?.staker_user_id) {
    return stakeeAcceptBackerOffer(supabase, dealId)
  }

  const roll = roundMoney(startingRoll)
  const { data: deal, error: uErr } = await supabase
    .from('poker_stable_deals')
    .update({
      status: 'active',
      responded_at: new Date().toISOString(),
      baseline_bankroll: roll,
      starting_roll: roll,
    })
    .eq('id', dealId)
    .eq('stakee_user_id', stakeeUserId)
    .eq('status', 'pending')
    .select(DEAL_SELECT)
    .single()
  if (uErr) return { deal: null, error: uErr }

  let sliceQuery = supabase
    .from('poker_stable_deal_slices')
    .update({ status: 'active', responded_at: new Date().toISOString() })
    .eq('deal_id', dealId)
    .eq('status', 'pending')
  if (deal.staker_user_id) {
    sliceQuery = sliceQuery.eq('staker_user_id', deal.staker_user_id)
  }
  await sliceQuery

  const { error: pErr } = await bootstrapDealBankrollProfile(supabase, dealId, roll)
  if (pErr) return { deal, error: pErr }
  return { deal, error: null }
}

/** Staker accepts their slice on a player-created deal. */
export async function acceptSliceAsStaker(supabase, sliceId, stakerUserId) {
  const { data, error } = await supabase
    .from('poker_stable_deal_slices')
    .update({ status: 'active', responded_at: new Date().toISOString() })
    .eq('id', sliceId)
    .eq('staker_user_id', stakerUserId)
    .eq('status', 'pending')
    .select('*')
    .single()
  if (error) {
    const msg = String(error.message || '')
    const code = String(error.code || '')
    // 0-row update → .single() (PGRST116): slice deleted with the deal, or already resolved.
    if (code === 'PGRST116' || /single json object|0 rows/i.test(msg)) {
      return {
        slice: null,
        error: await diagnoseMissingPendingSlice(supabase, sliceId, stakerUserId),
      }
    }
    return { slice: null, error }
  }

  const { data: slices } = await supabase
    .from('poker_stable_deal_slices')
    .select('status')
    .eq('deal_id', data.deal_id)
  const anyActive = (slices || []).some((s) => s.status === 'active')
  if (anyActive) {
    const { data: dealRow } = await supabase
      .from('poker_stable_deals')
      .select('starting_roll, baseline_bankroll, status')
      .eq('id', data.deal_id)
      .single()
    const roll = roundMoney(dealRow?.starting_roll ?? dealRow?.baseline_bankroll ?? 0)
    const { error: dealActivateErr } = await supabase
      .from('poker_stable_deals')
      .update({ status: 'active', responded_at: new Date().toISOString() })
      .eq('id', data.deal_id)
      .in('status', ['pending', 'draft'])
    if (dealActivateErr) {
      return { slice: data, error: dealActivateErr }
    }
    if (dealRow?.status !== 'active') {
      const { error: pErr } = await bootstrapDealBankrollProfile(supabase, data.deal_id, roll)
      if (pErr) return { slice: data, error: pErr }
    }
  }
  return { slice: data, error: null }
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} dealId
 * @param {string} stakeeUserId
 */
export async function declineHorseDeal(supabase, dealId, stakeeUserId) {
  const { data: peek, error: peekErr } = await supabase
    .from('poker_stable_deals')
    .select('staker_user_id')
    .eq('id', dealId)
    .maybeSingle()
  if (peekErr) return { deal: null, error: peekErr }
  if (peek?.staker_user_id) {
    return stakeeDeclineBackerOffer(supabase, dealId)
  }

  const { data, error } = await supabase
    .from('poker_stable_deals')
    .update({
      status: 'declined',
      responded_at: new Date().toISOString(),
    })
    .eq('id', dealId)
    .eq('stakee_user_id', stakeeUserId)
    .eq('status', 'pending')
    .select(DEAL_SELECT)
    .single()
  if (!error) {
    await supabase
      .from('poker_stable_deal_slices')
      .update({ status: 'declined', responded_at: new Date().toISOString() })
      .eq('deal_id', dealId)
  }
  return { deal: data || null, error }
}

export async function declineSliceAsStaker(supabase, sliceId, stakerUserId) {
  const { data, error } = await supabase.rpc('poker_stable_decline_backer_slice', {
    p_slice_id: sliceId,
  })
  if (!error) {
    return { slice: { id: sliceId, status: 'declined', staker_user_id: stakerUserId }, error: null, result: data }
  }
  // Fallback when RPC not applied yet (local/dev lag).
  const { data: slice, error: updErr } = await supabase
    .from('poker_stable_deal_slices')
    .update({ status: 'declined', responded_at: new Date().toISOString() })
    .eq('id', sliceId)
    .eq('staker_user_id', stakerUserId)
    .eq('status', 'pending')
    .select('*')
    .single()
  if (!updErr && slice) {
    return { slice, error: null, result: data }
  }
  const missMsg = String(updErr?.message || error?.message || '')
  const missCode = String(updErr?.code || error?.code || '')
  if (
    missCode === 'PGRST116' ||
    /single json object|0 rows|not found|does not exist/i.test(missMsg)
  ) {
    return {
      slice: null,
      error: await diagnoseMissingPendingSlice(supabase, sliceId, stakerUserId),
    }
  }
  return { slice: slice || null, error: updErr || error }
}

/**
 * Lead staker (legacy request) or slice backer revokes an active/pending deal.
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} dealId
 * @param {string} stakerUserId
 */
export async function revokeHorseDeal(supabase, dealId, stakerUserId) {
  const { data: deal, error: loadErr } = await supabase
    .from('poker_stable_deals')
    .select(DEAL_SELECT)
    .eq('id', dealId)
    .in('status', ['pending', 'active'])
    .maybeSingle()
  if (loadErr) return { deal: null, error: loadErr }
  if (!deal) {
    return { deal: null, error: new Error('Deal not found or already closed.') }
  }

  const isLeadStaker = deal.staker_user_id === stakerUserId
  let canRevoke = isLeadStaker
  if (!canRevoke) {
    const { data: slices, error: sliceErr } = await supabase
      .from('poker_stable_deal_slices')
      .select('id')
      .eq('deal_id', dealId)
      .eq('staker_user_id', stakerUserId)
      .neq('status', 'declined')
    if (sliceErr) return { deal: null, error: sliceErr }
    canRevoke = (slices || []).length > 0
  }
  if (!canRevoke) {
    return { deal: null, error: new Error('You cannot revoke this deal.') }
  }

  const respondedAt = new Date().toISOString()
  const { error: sliceErr } = await supabase
    .from('poker_stable_deal_slices')
    .update({ status: 'declined', responded_at: respondedAt })
    .eq('deal_id', dealId)
    .eq('staker_user_id', stakerUserId)
    .in('status', ['pending', 'active'])
  if (sliceErr) return { deal: null, error: sliceErr }

  const { data: remainingOpen, error: remainErr } = await supabase
    .from('poker_stable_deal_slices')
    .select('id, status')
    .eq('deal_id', dealId)
    .in('status', ['pending', 'active'])
  if (remainErr) return { deal: null, error: remainErr }

  if ((remainingOpen || []).length > 0) {
    const { data: partialDeal, error: partialErr } = await supabase
      .from('poker_stable_deals')
      .select(DEAL_SELECT)
      .eq('id', dealId)
      .maybeSingle()
    return { deal: partialDeal || null, error: partialErr }
  }

  const { data, error } = await supabase
    .from('poker_stable_deals')
    .update({ status: 'revoked', responded_at: respondedAt })
    .eq('id', dealId)
    .in('status', ['pending', 'active'])
    .select(DEAL_SELECT)
    .single()
  if (error) {
    const msg = String(error.message || '')
    if (/single json object/i.test(msg)) {
      return {
        deal: null,
        error: new Error('Could not revoke this deal. It may already be closed.'),
      }
    }
    return { deal: null, error }
  }
  // Detach pending-play sessions to personal (trigger also runs when RPC applied).
  try {
    await supabase.rpc('poker_stable_detach_stake_sessions_to_personal', { p_deal_id: dealId })
  } catch {
    // ignore if migration not applied yet
  }
  return { deal: data, error: null }
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {object} args
 */
export async function recordDealTopup(supabase, args) {
  const { dealId, amount, note } = args
  const amt = roundMoney(amount)
  if (amt <= 0) return { topup: null, error: new Error('Enter a positive amount.') }

  const { data: topupId, error } = await supabase.rpc('poker_stable_record_topup', {
    p_deal_id: dealId,
    p_amount: amt,
    p_note: note?.trim() || null,
  })
  if (error) return { topup: null, error }

  const { data: topup, error: loadErr } = await supabase
    .from('poker_stable_deal_topups')
    .select('*')
    .eq('id', topupId)
    .maybeSingle()
  return { topup: topup || null, error: loadErr }
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {object} args
 */
export async function recordDealReduction(supabase, args) {
  const { dealId, amount, note } = args
  const amt = roundMoney(amount)
  if (amt <= 0) return { reduction: null, error: new Error('Enter a positive amount.') }

  const { data: reductionId, error } = await supabase.rpc('poker_stable_record_reduction', {
    p_deal_id: dealId,
    p_amount: amt,
    p_note: note?.trim() || null,
  })
  if (error) return { reduction: null, error }

  const { data: reduction, error: loadErr } = await supabase
    .from('poker_stable_deal_reductions')
    .select('*')
    .eq('id', reductionId)
    .maybeSingle()
  return { reduction: reduction || null, error: loadErr }
}

export async function loadSettlementBundle(supabase, settlementId) {
  const { data: settlement, error: stErr } = await supabase
    .from('poker_stable_deal_settlements')
    .select('*')
    .eq('id', settlementId)
    .maybeSingle()
  if (stErr) return { settlement: null, lines: [], calc: null, error: stErr }
  if (!settlement) return { settlement: null, lines: [], calc: null, error: new Error('Settlement not found.') }

  const { data: lines, error: lErr } = await supabase
    .from('poker_stable_deal_settlement_lines')
    .select('*')
    .eq('settlement_id', settlementId)
  if (lErr) return { settlement, lines: [], calc: null, error: lErr }

  const calc = {
    baseline_at_settle: stableNum(settlement.baseline_at_settle),
    roll_at_settle: stableNum(settlement.roll_at_settle),
    profit_above_baseline: stableNum(settlement.profit_above_baseline),
    makeup_at_settle: stableNum(settlement.makeup_at_settle),
    rakeback_total: stableNum(settlement.rakeback_total),
    lines: (lines || []).map((l) => ({
      slice_id: l.slice_id,
      profitShare: stableNum(l.profit_share),
      rakebackShare: stableNum(l.rakeback_share),
      total_owed: stableNum(l.total_owed),
      direction: l.direction,
    })),
    player_net: roundMoney(
      stableNum(settlement.profit_above_baseline) -
        (lines || []).reduce(
          (sum, l) =>
            sum +
            (l.direction === 'player_to_staker'
              ? stableNum(l.total_owed)
              : -stableNum(l.total_owed)),
          0,
        ),
    ),
  }

  return { settlement, lines: lines || [], calc, error: null }
}

/**
 * Periodic settle: roll → baseline, credit player personal bankroll, deal stays active.
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {object} args
 */
/**
 * Record periodic settle or close. Updates recorder's books immediately; others sync via commit.
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {object} args
 */
export async function proposeSettlement(supabase, args) {
  const { dealId, finalize = false, rakebackTotal = 0, stakeReductionTotal = 0, note } = args
  const { data, error } = await supabase.rpc('poker_stable_record_settlement', {
    p_deal_id: dealId,
    p_finalize: finalize,
    p_rakeback_total: roundMoney(rakebackTotal),
    p_note: note?.trim() || null,
    p_stake_reduction_total: roundMoney(stakeReductionTotal),
  })
  if (error) {
    return {
      immediate: false,
      settlement: null,
      commitId: null,
      requestId: null,
      lines: [],
      calc: null,
      error,
    }
  }
  const settlementId = data?.settlement_id || null
  const commitId = data?.commit_id || null
  if (settlementId) {
    const bundle = await loadSettlementBundle(supabase, settlementId)
    return {
      immediate: true,
      commitId,
      requestId: null,
      ...bundle,
      error: bundle.error,
    }
  }
  return {
    immediate: false,
    settlement: null,
    commitId,
    requestId: null,
    lines: [],
    calc: null,
    error: null,
  }
}

/**
 * Sync a counterparty-recorded stake commit onto the viewer's books.
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} commitId
 */
export async function syncDealCommit(supabase, commitId) {
  const { data, error } = await supabase.rpc('poker_stable_sync_commit', {
    p_commit_id: commitId,
  })
  if (error) return { status: null, error }
  return { status: data?.status || 'synced', error: null }
}

/** @param {import('@supabase/supabase-js').SupabaseClient} supabase @param {string | null} [dealId] */
export async function loadPendingCommits(supabase, dealId = null) {
  const { data, error } = await supabase.rpc('poker_stable_pending_commits', {
    p_deal_id: dealId || null,
  })
  return { commits: data || [], error }
}

/** @param {import('@supabase/supabase-js').SupabaseClient} supabase @param {string} commitId */
export async function loadDealCommit(supabase, commitId) {
  const { data, error } = await supabase
    .from('poker_stable_deal_commits')
    .select('*')
    .eq('id', commitId)
    .maybeSingle()
  return { commit: data || null, error }
}

/**
 * Whether the viewer still needs to Commit this deal commit (Alerts / push deep links).
 * Already synced, own recording, or missing → needsSync false (do not open Commit UI).
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} commitId
 * @param {string} userId
 */
export async function viewerNeedsDealCommitSync(supabase, commitId, userId) {
  const id = String(commitId || '').trim()
  const uid = String(userId || '').trim()
  if (!supabase || !id || !uid) {
    return { needsSync: false, commit: null, error: null }
  }
  const { commit, error } = await loadDealCommit(supabase, id)
  if (error) return { needsSync: true, commit: null, error }
  if (!commit) return { needsSync: false, commit: null, error: null }
  if (commit.recorded_by_user_id === uid) {
    return { needsSync: false, commit, error: null }
  }
  const { data: syncRow, error: syncErr } = await supabase
    .from('poker_stable_commit_syncs')
    .select('commit_id')
    .eq('commit_id', id)
    .eq('user_id', uid)
    .maybeSingle()
  if (syncErr) return { needsSync: true, commit, error: syncErr }
  return { needsSync: !syncRow, commit, error: null }
}

/** @deprecated Settlement votes retired — use loadPendingCommits + syncDealCommit. */
export async function loadPendingSettlementRequest(supabase, dealId) {
  const { commits, error } = await loadPendingCommits(supabase, dealId)
  return { request: commits?.[0] || null, error }
}

/** @deprecated Use syncDealCommit. */
export async function respondToSettlementRequest(_supabase, _args) {
  return {
    status: null,
    settlement: null,
    lines: [],
    calc: null,
    error: new Error('Settlement votes are retired — tap Sync on the stake commit alert.'),
  }
}

/** @param {import('@supabase/supabase-js').SupabaseClient} supabase @param {string} dealId */
export async function loadLedgerEntries(supabase, dealId) {
  const { data, error } = await supabase
    .from('poker_stable_ledger_entries')
    .select('*')
    .eq('deal_id', dealId)
    .order('created_at', { ascending: false })
  return { entries: data || [], error }
}

/** Stakee deletes a stake-scoped session; durable P/L audit line is written server-side. */
export async function deleteStakeSessionWithAudit(supabase, sessionId) {
  const { data, error } = await supabase.rpc('poker_stable_delete_stake_session', {
    p_session_id: sessionId,
  })
  return { result: data || null, error }
}

/** @deprecated Use loadDealCommit. */
export async function loadSettlementRequest(supabase, requestId) {
  return loadDealCommit(supabase, requestId)
}

/**
 * Periodic settle: proposes settlement (immediate when guest-only backers).
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {object} args
 */
export async function periodicSettleBackingDeal(supabase, args) {
  const { dealId, rakebackTotal = 0, stakeReductionTotal = 0, note } = args
  return proposeSettlement(supabase, {
    dealId,
    finalize: false,
    rakebackTotal,
    stakeReductionTotal,
    note,
  })
}

/**
 * Close/end stake: proposes final settle (immediate when guest-only backers).
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {object} args
 */
export async function closeBackingDeal(supabase, args) {
  const { dealId, rakebackTotal = 0, stakeReductionTotal = 0, note } = args
  return proposeSettlement(supabase, {
    dealId,
    finalize: true,
    rakebackTotal,
    stakeReductionTotal,
    note,
  })
}

/**
 * @deprecated Prefer periodicSettleBackingDeal or closeBackingDeal.
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {object} args
 */
export async function settleBackingDeal(supabase, args) {
  const { dealId, rakebackTotal = 0, note } = args
  return closeBackingDeal(supabase, { dealId, rakebackTotal, note })
}

/** @deprecated Payment claims removed — use settlement sync. */
export async function createPaymentClaim(_supabase, _args) {
  return { claim: null, error: new Error('Payment claims are no longer supported.') }
}

/** @deprecated Payment claims removed — use respondToSettlementRequest. */
export async function respondToPaymentClaim(_supabase, _args) {
  return { claim: null, error: new Error('Payment claims are no longer supported.') }
}

/** Slice display name for UI. */
export function sliceDisplayName(slice, profilesById = {}) {
  if (slice.counterparty_kind === 'guest') return slice.guest_label || 'Guest'
  const p = profilesById[slice.staker_user_id]
  return p?.display_name || (p?.handle ? `@${p.handle}` : 'Backer')
}

async function messageFromStableNotifyInvoke(error, response) {
  const fallback = String(error?.message || 'Guest notify failed.').trim() || 'Guest notify failed.'
  const res =
    response && typeof response === 'object' && typeof response.status === 'number'
      ? response
      : error?.context && typeof error.context === 'object' && typeof error.context.status === 'number'
        ? error.context
        : null
  if (!res) return fallback
  try {
    const body = await res.clone().json()
    if (body?.error) return String(body.error)
  } catch {
    try {
      const text = await res.clone().text()
      if (text?.trim()) return text.trim().slice(0, 500)
    } catch {
      /* ignore */
    }
  }
  if (res.status === 404) {
    return 'Guest notify service is not deployed on this environment.'
  }
  if (res.status === 401) {
    return 'Sign in again, then retry (session expired).'
  }
  return fallback
}

function parseStableNotifyPayload(data) {
  if (!data) return null
  if (typeof data === 'string') {
    try {
      return JSON.parse(data)
    } catch {
      return null
    }
  }
  return data
}

/**
 * Notify guest backers (Twilio SMS + Resend email) via Edge Function.
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} dealId
 * @param {{ sliceIds?: string[]; kind?: 'offer' | 'deleted' | 'terms_edited' | 'slice_nudge'; termsEdit?: { before: object; after: object } }} [opts]
 */
export async function notifyStableStakeGuests(supabase, dealId, opts = {}) {
  let {
    data: { session },
  } = await supabase.auth.getSession()
  if (!session?.access_token) {
    return { data: null, error: new Error('Sign in again, then retry.'), notifiedCount: 0 }
  }

  const nowSecs = Math.floor(Date.now() / 1000)
  if (!session.expires_at || session.expires_at - nowSecs < 60) {
    const { data: refreshed } = await supabase.auth.refreshSession()
    if (refreshed?.session?.access_token) session = refreshed.session
  }

  const body = { deal_id: dealId }
  if (opts.sliceIds?.length) body.slice_ids = opts.sliceIds
  if (opts.kind === 'deleted') body.kind = 'deleted'
  else if (opts.kind === 'terms_edited') {
    body.kind = 'terms_edited'
    body.terms_edit = opts.termsEdit
  }   else if (opts.kind === 'offer') body.kind = 'offer'
  else if (opts.kind === 'slice_nudge') body.kind = 'slice_nudge'

  const { data, error, response } = await supabase.functions.invoke('poker-stable-notify', {
    body,
    headers: { Authorization: `Bearer ${session.access_token}` },
  })
  if (error) {
    const msg = await messageFromStableNotifyInvoke(error, response)
    return { data: null, error: new Error(msg), notifiedCount: 0 }
  }
  const payload = parseStableNotifyPayload(data)
  if (payload?.error) {
    return { data: payload, error: new Error(payload.error), notifiedCount: 0 }
  }
  const notifiedCount = Number(payload?.notified_count) || 0
  return { data: payload, error: null, notifiedCount }
}

/**
 * Notify guest syndicate co-backers when a lead backer creates a stake with friend slices.
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} dealId
 * @param {{ sliceIds?: string[] }} [opts]
 */
export async function notifyStableGuestSyndicateBackers(supabase, dealId, opts = {}) {
  let {
    data: { session },
  } = await supabase.auth.getSession()
  if (!session?.access_token) {
    return { data: null, error: new Error('Sign in again, then retry.'), notifiedCount: 0 }
  }

  const nowSecs = Math.floor(Date.now() / 1000)
  if (!session.expires_at || session.expires_at - nowSecs < 60) {
    const { data: refreshed } = await supabase.auth.refreshSession()
    if (refreshed?.session?.access_token) session = refreshed.session
  }

  const body = { deal_id: dealId, kind: 'guest_syndicate_backer_offer' }
  if (opts.sliceIds?.length) body.slice_ids = opts.sliceIds

  const { data, error, response } = await supabase.functions.invoke('poker-stable-notify', {
    body,
    headers: { Authorization: `Bearer ${session.access_token}` },
  })
  if (error) {
    const msg = await messageFromStableNotifyInvoke(error, response)
    return { data: null, error: new Error(msg), notifiedCount: 0 }
  }
  const payload = parseStableNotifyPayload(data)
  if (payload?.error) {
    return { data: payload, error: new Error(payload.error), notifiedCount: 0 }
  }
  const notifiedCount = Number(payload?.notified_count) || 0
  return { data: payload, error: null, notifiedCount }
}

/**
 * Notify a guest player (not on Edge) when a backer creates a stake for them.
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} dealId
 */
export async function notifyStableGuestStakee(supabase, dealId) {
  let {
    data: { session },
  } = await supabase.auth.getSession()
  if (!session?.access_token) {
    return { data: null, error: new Error('Sign in again, then retry.'), notifiedCount: 0 }
  }

  const nowSecs = Math.floor(Date.now() / 1000)
  if (!session.expires_at || session.expires_at - nowSecs < 60) {
    const { data: refreshed } = await supabase.auth.refreshSession()
    if (refreshed?.session?.access_token) session = refreshed.session
  }

  const { data, error, response } = await supabase.functions.invoke('poker-stable-notify', {
    body: { deal_id: dealId, kind: 'guest_stakee_offer' },
    headers: { Authorization: `Bearer ${session.access_token}` },
  })
  if (error) {
    const msg = await messageFromStableNotifyInvoke(error, response)
    return { data: null, error: new Error(msg), notifiedCount: 0 }
  }
  const payload = parseStableNotifyPayload(data)
  if (payload?.error) {
    return { data: payload, error: new Error(payload.error), notifiedCount: 0 }
  }
  const notifiedCount = Number(payload?.notified_count) || 0
  return { data: payload, error: null, notifiedCount }
}

/**
 * Notify guest backers when a stake session is completed (Resend email + Twilio SMS).
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} dealId
 * @param {string} sessionId
 */
export async function notifyStableSessionComplete(supabase, dealId, sessionId) {
  let {
    data: { session },
  } = await supabase.auth.getSession()
  if (!session?.access_token) {
    return { data: null, error: new Error('Sign in again, then retry.'), notifiedCount: 0 }
  }

  const nowSecs = Math.floor(Date.now() / 1000)
  if (!session.expires_at || session.expires_at - nowSecs < 60) {
    const { data: refreshed } = await supabase.auth.refreshSession()
    if (refreshed?.session?.access_token) session = refreshed.session
  }

  const { data, error, response } = await supabase.functions.invoke('poker-stable-notify', {
    body: {
      deal_id: dealId,
      session_id: sessionId,
      kind: 'session_complete',
    },
    headers: { Authorization: `Bearer ${session.access_token}` },
  })
  if (error) {
    const msg = await messageFromStableNotifyInvoke(error, response)
    return { data: null, error: new Error(msg), notifiedCount: 0 }
  }
  const payload = parseStableNotifyPayload(data)
  if (payload?.error) {
    return { data: payload, error: new Error(payload.error), notifiedCount: 0 }
  }
  const notifiedCount = Number(payload?.notified_count) || 0
  return { data: payload, error: null, notifiedCount }
}

/**
 * Remind a pending backer to accept their slice (Edge activity + guest email/SMS).
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} dealId
 * @param {string} sliceId
 */
export async function nudgeBackerSliceAcceptance(supabase, dealId, sliceId) {
  const { data, error } = await supabase.rpc('poker_stable_nudge_backer_slice', {
    p_slice_id: sliceId,
  })
  if (error) return { error }

  if (data?.counterparty_kind === 'guest') {
    const { error: notifyErr } = await notifyStableStakeGuests(supabase, dealId, {
      sliceIds: [sliceId],
      kind: 'slice_nudge',
    })
    if (notifyErr) return { error: notifyErr }
  }

  return { error: null }
}
