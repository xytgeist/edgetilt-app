import { pokerSessionWinLoss } from '../poker-bankroll/pokerBankrollMath.js'
import { computeDealSettlement, roundMoney, stableNum, sumSliceActionPct } from './pokerStableMath.js'

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
  'id, staker_user_id, stakee_user_id, status, deal_type, label, notes, baseline_bankroll, starting_roll, is_migration, stake_wide_starting_pl, lifetime_pl_display, manifest_edit_mode, currency, linked_session_id, settled_at, created_at, updated_at, responded_at, pending_terms_json, stakee_terms_ack_required, terms_revised_at, terms_revised_by'

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

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} dealId
 */
export async function loadPaymentClaims(supabase, dealId) {
  const { data, error } = await supabase
    .from('poker_stable_payment_claims')
    .select('*')
    .eq('deal_id', dealId)
    .order('created_at', { ascending: false })
  return { claims: data || [], error }
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

  const { data: deal, error: dErr } = await supabase
    .from('poker_stable_deals')
    .insert({
      stakee_user_id: stakeeUserId,
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
 * @param {{ stakerUserId: string, stakeeUserId: string, label?: string, notes?: string, baselineBankroll?: number, slices?: object[] }} args
 */
export async function requestBackingDeal(supabase, args) {
  const {
    stakerUserId,
    stakeeUserId,
    label,
    notes,
    baselineBankroll = 0,
    slices = [],
  } = args
  if (stakerUserId === stakeeUserId) {
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

  const baseline = roundMoney(baselineBankroll)

  const { data: deal, error: dErr } = await supabase
    .from('poker_stable_deals')
    .insert({
      staker_user_id: stakerUserId,
      stakee_user_id: stakeeUserId,
      deal_type: 'cash_backing',
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
  if (error) return { slice: null, error }

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
    await supabase
      .from('poker_stable_deals')
      .update({ status: 'active', responded_at: new Date().toISOString() })
      .eq('id', data.deal_id)
      .in('status', ['pending', 'draft'])
    if (dealRow?.status !== 'active') {
      await bootstrapDealBankrollProfile(supabase, data.deal_id, roll)
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
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} dealId
 * @param {string} stakerUserId
 */
export async function revokeHorseDeal(supabase, dealId, stakerUserId) {
  const { data, error } = await supabase
    .from('poker_stable_deals')
    .update({ status: 'revoked', responded_at: new Date().toISOString() })
    .eq('id', dealId)
    .eq('staker_user_id', stakerUserId)
    .in('status', ['pending', 'active'])
    .select(DEAL_SELECT)
    .single()
  return { deal: data || null, error }
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {object} args
 */
export async function recordDealTopup(supabase, args) {
  const { dealId, stakeeUserId, amount, fundedBySliceId, fundingMode = 'deal_wide', note } = args
  const amt = roundMoney(amount)
  if (amt <= 0) return { topup: null, error: new Error('Enter a positive amount.') }

  const { data: deal, error: dErr } = await supabase
    .from('poker_stable_deals')
    .select('id, baseline_bankroll, status')
    .eq('id', dealId)
    .eq('stakee_user_id', stakeeUserId)
    .eq('status', 'active')
    .single()
  if (dErr) return { topup: null, error: dErr }

  const { data: profile, error: pErr } = await supabase
    .from('poker_deal_bankroll_profiles')
    .select('overall_bankroll')
    .eq('deal_id', dealId)
    .single()
  if (pErr) return { topup: null, error: pErr }

  const baselineBefore = stableNum(deal.baseline_bankroll)
  const rollBefore = stableNum(profile.overall_bankroll)
  const baselineAfter = roundMoney(baselineBefore + amt)
  const rollAfter = roundMoney(rollBefore + amt)

  const { data: topup, error: tErr } = await supabase
    .from('poker_stable_deal_topups')
    .insert({
      deal_id: dealId,
      amount: amt,
      funded_by_slice_id: fundedBySliceId || null,
      funding_mode: fundingMode,
      baseline_before: baselineBefore,
      baseline_after: baselineAfter,
      roll_before: rollBefore,
      roll_after: rollAfter,
      logged_by_user_id: stakeeUserId,
      note: note?.trim() || null,
    })
    .select('*')
    .single()
  if (tErr) return { topup: null, error: tErr }

  const { error: uDeal } = await supabase
    .from('poker_stable_deals')
    .update({ baseline_bankroll: baselineAfter })
    .eq('id', dealId)
  if (uDeal) return { topup, error: uDeal }

  const { error: uRoll } = await supabase
    .from('poker_deal_bankroll_profiles')
    .update({ overall_bankroll: rollAfter })
    .eq('deal_id', dealId)
  return { topup, error: uRoll }
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {object} args
 */
export async function settleBackingDeal(supabase, args) {
  const { dealId, stakeeUserId, rakebackTotal = 0, note } = args

  const { data: deal, error: dErr } = await supabase
    .from('poker_stable_deals')
    .select(`${DEAL_SELECT}, poker_deal_bankroll_profiles(overall_bankroll)`)
    .eq('id', dealId)
    .eq('stakee_user_id', stakeeUserId)
    .eq('status', 'active')
    .single()
  if (dErr) return { settlement: null, error: dErr }

  const { data: slices, error: sErr } = await supabase
    .from('poker_stable_deal_slices')
    .select(SLICE_SELECT)
    .eq('deal_id', dealId)
    .eq('status', 'active')
  if (sErr) return { settlement: null, error: sErr }

  const profile = deal.poker_deal_bankroll_profiles
  const roll = stableNum(
    Array.isArray(profile) ? profile[0]?.overall_bankroll : profile?.overall_bankroll,
  )
  const calc = computeDealSettlement(
    { baseline_bankroll: deal.baseline_bankroll, roll },
    slices || [],
    rakebackTotal,
  )

  const { data: settlement, error: stErr } = await supabase
    .from('poker_stable_deal_settlements')
    .insert({
      deal_id: dealId,
      baseline_at_settle: calc.baseline_at_settle,
      roll_at_settle: calc.roll_at_settle,
      profit_above_baseline: calc.profit_above_baseline,
      makeup_at_settle: calc.makeup_at_settle,
      rakeback_total: calc.rakeback_total,
      settled_by_user_id: stakeeUserId,
      note: note?.trim() || null,
    })
    .select('*')
    .single()
  if (stErr) return { settlement: null, error: stErr }

  const lineRows = calc.lines.map((l) => ({
    settlement_id: settlement.id,
    slice_id: l.slice_id,
    profit_share: l.profitShare,
    rakeback_share: l.rakebackShare,
    total_owed: l.total_owed,
    direction: l.direction,
  }))
  const { error: lErr } = await supabase.from('poker_stable_deal_settlement_lines').insert(lineRows)
  if (lErr) return { settlement, error: lErr }

  const baseline = calc.baseline_at_settle
  await supabase.from('poker_deal_bankroll_profiles').update({ overall_bankroll: baseline }).eq('deal_id', dealId)
  await supabase
    .from('poker_stable_deals')
    .update({ settled_at: new Date().toISOString(), status: 'settled' })
    .eq('id', dealId)

  return { settlement, lines: lineRows, calc, error: null }
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {object} args
 */
export async function createPaymentClaim(supabase, args) {
  const { dealId, sliceId, actorUserId, amount, claimKind, settlementId, note } = args
  const amt = roundMoney(amount)
  if (amt <= 0) return { claim: null, error: new Error('Enter a positive amount.') }

  const { data, error } = await supabase
    .from('poker_stable_payment_claims')
    .insert({
      deal_id: dealId,
      slice_id: sliceId,
      settlement_id: settlementId || null,
      actor_user_id: actorUserId,
      amount: amt,
      claim_kind: claimKind,
      status: 'pending',
      note: note?.trim() || null,
    })
    .select('*')
    .single()
  return { claim: data || null, error }
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {object} args
 */
export async function respondToPaymentClaim(supabase, args) {
  const { claimId, responderUserId, response, respondNote } = args
  if (response !== 'confirmed' && response !== 'disputed') {
    return { claim: null, error: new Error('Invalid response.') }
  }
  const { data, error } = await supabase
    .from('poker_stable_payment_claims')
    .update({
      status: response,
      responded_by_user_id: responderUserId,
      responded_at: new Date().toISOString(),
      respond_note: respondNote?.trim() || null,
    })
    .eq('id', claimId)
    .eq('status', 'pending')
    .select('*')
    .single()
  return { claim: data || null, error }
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
 * @param {{ sliceIds?: string[]; kind?: 'offer' | 'deleted' }} [opts]
 */
export async function notifyStableStakeGuests(supabase, dealId, opts = {}) {
  const body = { deal_id: dealId }
  if (opts.sliceIds?.length) body.slice_ids = opts.sliceIds
  if (opts.kind === 'deleted') body.kind = 'deleted'
  const { data, error, response } = await supabase.functions.invoke('poker-stable-notify', { body })
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
