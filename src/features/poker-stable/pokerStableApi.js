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

/** Player created via Bankroll + Stake (`staker_user_id` null on v2 deals). */
export function isPlayerInitiatedBackingDeal(deal) {
  return Boolean(deal?.stakee_user_id) && deal?.staker_user_id == null
}

/** Viewer is a backer on this deal (lead staker or slice participant). */
export function isViewerBackingDeal(deal, userId, slicesByDeal = {}) {
  if (!deal || !userId) return false
  if (deal.staker_user_id === userId) return true
  return (slicesByDeal[deal.id] || []).some(
    (s) => s.staker_user_id === userId && s.status !== 'declined',
  )
}

/** @param {string} raw */
export function normalizeHandleInput(raw) {
  return String(raw || '')
    .trim()
    .replace(/^@+/, '')
    .toLowerCase()
}

const DEAL_SELECT =
  'id, staker_user_id, stakee_user_id, stakee_guest_label, stakee_guest_phone, stakee_guest_email, status, deal_type, venue_kind, label, notes, baseline_bankroll, starting_roll, is_migration, stake_wide_starting_pl, lifetime_pl_display, manifest_edit_mode, currency, linked_session_id, settled_at, created_at, updated_at, responded_at, pending_terms_json, stakee_terms_ack_required, terms_revised_at, terms_revised_by'

const SLICE_SELECT =
  'id, deal_id, slice_index, counterparty_kind, staker_user_id, guest_label, guest_phone, guest_email, action_pct, pricing_mode, player_profit_pct, markup_rate, rakeback_mode, rakeback_player_pct, starting_pl, status, responded_at, label, created_at'

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
  if (sErr && !isMissingStableTableError(sErr)) return { deals: direct || [], error: sErr }

  const sliceDealIds = [...new Set((sliceRows || []).map((r) => r.deal_id))]
  let sliceDeals = []
  if (sliceDealIds.length) {
    const { data, error } = await supabase
      .from('poker_stable_deals')
      .select(DEAL_SELECT)
      .in('id', sliceDealIds)
    if (error && !isMissingStableTableError(error)) return { deals: direct || [], error }
    sliceDeals = data || []
  }

  const byId = new Map()
  for (const d of [...(direct || []), ...sliceDeals]) byId.set(d.id, d)
  const deals = [...byId.values()].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
  )
  return { deals, error: null }
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
    if (d.stakee_user_id === selfUserId && d.staker_user_id) ids.add(d.staker_user_id)
    if (d.staker_user_id === selfUserId) ids.add(d.stakee_user_id)
    if (d.stakee_user_id === selfUserId) {
      for (const s of slicesByDeal[d.id] || []) {
        if (s.staker_user_id) ids.add(s.staker_user_id)
      }
    }
    for (const s of slicesByDeal[d.id] || []) {
      if (s.staker_user_id === selfUserId) ids.add(d.stakee_user_id)
    }
  }
  if (ids.size === 0) return { byId: {}, error: null }
  const { data, error } = await supabase
    .from('profiles')
    .select('user_id, handle, display_name, avatar_url')
    .in('user_id', [...ids])
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

  const actionTotal = sumSliceActionPct(slices)
  if (actionTotal > 100.001) {
    return { deal: null, error: new Error('Total action sold cannot exceed 100%.') }
  }
  if (!slices.length) {
    return { deal: null, error: new Error('Add at least one backer slice.') }
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
      responded_at: activate ? new Date().toISOString() : null,
    })
    .select(DEAL_SELECT)
    .single()
  if (dErr) return { deal: null, error: dErr }

  const sliceRows = slices.map((sl, idx) => ({
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

function sliceToTermsJson(sl) {
  const counterpartyKind = sl.counterpartyKind || sl.counterparty_kind || 'guest'
  return {
    ...(sl.sliceId ? { id: sl.sliceId } : {}),
    counterparty_kind: counterpartyKind,
    staker_user_id: sl.stakerUserId || sl.staker_user_id || null,
    guest_label: sl.guestLabel || sl.guest_label || null,
    guest_phone: sl.guestPhone || sl.guest_phone || null,
    guest_email: sl.guestEmail || sl.guest_email || null,
    action_pct: sl.actionPct ?? sl.action_pct,
    pricing_mode: sl.pricingMode || sl.pricing_mode,
    player_profit_pct:
      sl.playerProfitPct != null
        ? sl.playerProfitPct
        : sl.player_profit_pct != null
          ? sl.player_profit_pct
          : null,
    markup_rate:
      sl.markupRate != null ? sl.markupRate : sl.markup_rate != null ? sl.markup_rate : null,
    rakeback_mode: sl.rakebackMode || sl.rakeback_mode || 'disabled',
    rakeback_player_pct:
      sl.rakebackPlayerPct != null
        ? sl.rakebackPlayerPct
        : sl.rakeback_player_pct != null
          ? sl.rakeback_player_pct
          : null,
    label: sl.label || null,
  }
}

/**
 * Apply deal + slice terms (stakee only). Pending deals replace slices; active guest-only deals update in place.
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 */
export async function applyStakeeDealTerms(supabase, args) {
  const { dealId, stakeeUserId, dealFields, slices, clearProposal = true } = args
  const actionTotal = sumSliceActionPct(slices)
  if (actionTotal > 100.001) {
    return { deal: null, error: new Error('Total action sold cannot exceed 100%.') }
  }

  const dealPayload = {
    label: dealFields.label?.trim() || null,
    baseline_bankroll: roundMoney(dealFields.baselineBankroll),
    starting_roll: roundMoney(dealFields.startingRoll ?? dealFields.baselineBankroll),
    is_migration: Boolean(dealFields.isMigration),
    stake_wide_starting_pl: dealFields.stakeWideStartingPl ?? null,
    lifetime_pl_display: dealFields.lifetimePlDisplay ?? null,
  }

  const { error } = await supabase.rpc('poker_stable_apply_stakee_terms', {
    p_deal_id: dealId,
    p_deal: dealPayload,
    p_slices: slices.map(sliceToTermsJson),
    p_clear_proposal: clearProposal,
  })
  if (error) return { deal: null, error }

  const { data: deal, error: loadErr } = await supabase
    .from('poker_stable_deals')
    .select(DEAL_SELECT)
    .eq('id', dealId)
    .eq('stakee_user_id', stakeeUserId)
    .maybeSingle()
  return { deal, error: loadErr }
}

/** @deprecated name kept for callers — delegates to applyStakeeDealTerms */
export async function applyPendingDealTerms(supabase, args) {
  return applyStakeeDealTerms(supabase, args)
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

/** Stakee deletes a stake before any Edge backer has accepted. Removes stake sessions too. */
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

/** Backer proposes revised terms; stakee must accept before they apply. */
export async function proposePendingDealTerms(supabase, dealId, backerUserId, termsPayload) {
  const { error } = await supabase.rpc('poker_stable_propose_terms', {
    p_deal_id: dealId,
    p_terms: termsPayload,
  })
  if (error) return { error }
  const { data: deal, error: loadErr } = await supabase
    .from('poker_stable_deals')
    .select(DEAL_SELECT)
    .eq('id', dealId)
    .maybeSingle()
  return { deal, error: loadErr }
}

/** Stakee accepts backer-proposed terms (applies pending_terms_json). */
export async function acceptProposedDealTerms(supabase, dealId, stakeeUserId) {
  const { data: row, error: loadErr } = await supabase
    .from('poker_stable_deals')
    .select(DEAL_SELECT)
    .eq('id', dealId)
    .eq('stakee_user_id', stakeeUserId)
    .eq('status', 'pending')
    .maybeSingle()
  if (loadErr) return { deal: null, error: loadErr }
  if (!row?.stakee_terms_ack_required || !row.pending_terms_json) {
    return { deal: null, error: new Error('No proposed terms to accept.') }
  }

  const payload = row.pending_terms_json
  const dealPart = payload.deal || {}
  const slices = Array.isArray(payload.slices) ? payload.slices : []

  return applyPendingDealTerms(supabase, {
    dealId,
    stakeeUserId,
    dealFields: {
      label: dealPart.label,
      baselineBankroll: dealPart.baseline_bankroll,
      startingRoll: dealPart.starting_roll,
      isMigration: dealPart.is_migration,
      stakeWideStartingPl: dealPart.stake_wide_starting_pl,
      lifetimePlDisplay: dealPart.lifetime_pl_display,
    },
    slices: slices.map((sl) => ({
      counterpartyKind: sl.counterpartyKind || sl.counterparty_kind,
      stakerUserId: sl.stakerUserId || sl.staker_user_id,
      guestLabel: sl.guestLabel || sl.guest_label,
      guestPhone: sl.guestPhone || sl.guest_phone,
      guestEmail: sl.guestEmail || sl.guest_email,
      actionPct: Number(sl.actionPct ?? sl.action_pct),
      pricingMode: sl.pricingMode || sl.pricing_mode,
      playerProfitPct:
        sl.playerProfitPct != null
          ? Number(sl.playerProfitPct)
          : sl.player_profit_pct != null
            ? Number(sl.player_profit_pct)
            : null,
      markupRate:
        sl.markupRate != null
          ? Number(sl.markupRate)
          : sl.markup_rate != null
            ? Number(sl.markup_rate)
            : null,
      rakebackMode: sl.rakebackMode || sl.rakeback_mode || 'disabled',
      rakebackPlayerPct:
        sl.rakebackPlayerPct != null
          ? Number(sl.rakebackPlayerPct)
          : sl.rakeback_player_pct != null
            ? Number(sl.rakeback_player_pct)
            : null,
      label: sl.label,
    })),
    clearProposal: true,
  })
}

/** Stakee or proposing backer clears a pending terms revision without applying. */
export async function declineProposedDealTerms(supabase, dealId) {
  const { error } = await supabase.rpc('poker_stable_clear_proposed_terms', {
    p_deal_id: dealId,
  })
  if (error) return { error }
  const { data: deal, error: loadErr } = await supabase
    .from('poker_stable_deals')
    .select(DEAL_SELECT)
    .eq('id', dealId)
    .maybeSingle()
  return { deal, error: loadErr }
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
    status: 'pending',
    label: label?.trim() || null,
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
  const leadSlice = slices.find((s) => s.stakerUserId === stakerUserId)
  if (!leadSlice) {
    return { deal: null, error: new Error('Your backing slice is required.') }
  }

  const actionTotal = sumSliceActionPct(slices)
  if (actionTotal > 100.001) {
    return { deal: null, error: new Error('Total action sold cannot exceed 100%.') }
  }

  if (stakeeUserId) {
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
        return {
          deal: null,
          error: new Error('You already have a pending or active deal with this player.'),
        }
      }
    }
  } else {
    const { data: guestDeals } = await supabase
      .from('poker_stable_deals')
      .select('id, status')
      .eq('staker_user_id', stakerUserId)
      .is('stakee_user_id', null)
      .ilike('stakee_guest_label', guestLabel)
      .in('status', ['pending', 'active'])
    if (guestDeals?.length) {
      const existing = guestDeals[0]
      const msg =
        existing.status === 'pending'
          ? 'You already have a pending request for this guest player.'
          : 'You already have an active deal with this guest player.'
      return { deal: null, error: new Error(msg) }
    }
  }

  const baseline = roundMoney(baselineBankroll)

  const { data: deal, error: dErr } = await supabase
    .from('poker_stable_deals')
    .insert({
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
    })
    .select(DEAL_SELECT)
    .single()
  if (dErr) return { deal: null, error: dErr }

  const sliceRows = slices.map((sl, idx) => ({
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
    status: 'pending',
    label: sl.label?.trim() || null,
  }))

  const { error: slErr } = await supabase.from('poker_stable_deal_slices').insert(sliceRows)
  if (slErr) return { deal, error: slErr }

  return { deal, error: null }
}

/** Sum completed session P/L for a deal (used when bootstrapping roll on accept). */
async function sumCompletedDealSessionProfit(supabase, dealId) {
  const { data, error } = await supabase
    .from('poker_bankroll_sessions')
    .select('buy_in, rebuy_amount, addon_amount, cash_out, bounty_winnings, status')
    .eq('deal_id', dealId)
    .eq('status', 'completed')
  if (error) throw error
  let profit = 0
  for (const s of data || []) {
    const wl = pokerSessionWinLoss(s)
    if (wl != null) profit += wl
  }
  return roundMoney(profit)
}

async function bootstrapDealBankrollProfile(supabase, dealId, startingRoll) {
  const base = roundMoney(startingRoll)
  let sessionProfit = 0
  try {
    sessionProfit = await sumCompletedDealSessionProfit(supabase, dealId)
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

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} dealId
 * @param {string} stakeeUserId
 * @param {number} [startingRoll]
 */
export async function acceptHorseDeal(supabase, dealId, stakeeUserId, startingRoll = 0) {
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
    if (/single json object/i.test(msg)) {
      return {
        slice: null,
        error: new Error('Could not accept slice. It may already be accepted or you lack access.'),
      }
    }
    return { slice: null, error }
  }

  const { data: slices } = await supabase
    .from('poker_stable_deal_slices')
    .select('status')
    .eq('deal_id', data.deal_id)
  const allActive = (slices || []).every((s) => s.status === 'active' || s.status === 'declined')
  const anyActive = (slices || []).some((s) => s.status === 'active')
  if (allActive && anyActive) {
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
  const { data, error } = await supabase
    .from('poker_stable_deal_slices')
    .update({ status: 'declined', responded_at: new Date().toISOString() })
    .eq('id', sliceId)
    .eq('staker_user_id', stakerUserId)
    .eq('status', 'pending')
    .select('*')
    .single()
  return { slice: data || null, error }
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

  const { data: remainingActive, error: remainErr } = await supabase
    .from('poker_stable_deal_slices')
    .select('id')
    .eq('deal_id', dealId)
    .eq('status', 'active')
  if (remainErr) return { deal: null, error: remainErr }

  if ((remainingActive || []).length > 0) {
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

async function loadSettlementBundle(supabase, settlementId) {
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
 * @param {{ sliceIds?: string[]; kind?: 'offer' | 'deleted' | 'terms_edited'; termsEdit?: { before: object; after: object } }} [opts]
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
  } else if (opts.kind === 'offer') body.kind = 'offer'

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
