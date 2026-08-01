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

/** @param {string} raw */
export function normalizeHandleInput(raw) {
  return String(raw || '')
    .trim()
    .replace(/^@+/, '')
    .toLowerCase()
}

const DEAL_SELECT =
  'id, staker_user_id, stakee_user_id, status, deal_type, label, notes, baseline_bankroll, starting_roll, is_migration, stake_wide_starting_pl, lifetime_pl_display, manifest_edit_mode, currency, linked_session_id, settled_at, created_at, updated_at, responded_at'

const SLICE_SELECT =
  'id, deal_id, slice_index, counterparty_kind, staker_user_id, guest_label, guest_email, action_pct, pricing_mode, player_profit_pct, markup_rate, rakeback_mode, rakeback_player_pct, starting_pl, status, responded_at, label, created_at'

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} handle
 */
export async function lookupProfileByHandle(supabase, handle) {
  const h = normalizeHandleInput(handle)
  if (!h) return { profile: null, error: new Error('Enter a handle.') }
  const { data, error } = await supabase
    .from('profiles')
    .select('user_id, handle, display_name, avatar_url')
    .ilike('handle', h)
    .maybeSingle()
  if (error) return { profile: null, error }
  if (!data) return { profile: null, error: new Error(`No Edge user @${h}.`) }
  return { profile: data, error: null }
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
    guest_email: sl.guestEmail?.trim() || null,
    action_pct: sl.actionPct,
    pricing_mode: sl.pricingMode,
    player_profit_pct: sl.pricingMode === 'profit_split' ? sl.playerProfitPct : null,
    markup_rate: sl.pricingMode === 'markup' ? sl.markupRate : null,
    rakeback_mode: sl.rakebackMode || 'all_to_stake',
    rakeback_player_pct: sl.rakebackMode === 'custom' ? sl.rakebackPlayerPct : null,
    starting_pl: sl.startingPl ?? null,
    status: sl.counterpartyKind === 'guest' || activate ? 'active' : 'pending',
    label: sl.label?.trim() || null,
    responded_at: sl.counterpartyKind === 'guest' || activate ? new Date().toISOString() : null,
  }))

  const { error: slErr } = await supabase.from('poker_stable_deal_slices').insert(sliceRows)
  if (slErr) return { deal, error: slErr }

  if (activate || dealType === 'cash_backing') {
    const { error: pErr } = await supabase.from('poker_deal_bankroll_profiles').upsert(
      { deal_id: deal.id, overall_bankroll: roll },
      { onConflict: 'deal_id' },
    )
    if (pErr) return { deal, error: pErr }
  }

  return { deal, error: null }
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

  await supabase
    .from('poker_stable_deal_slices')
    .update({ status: 'active', responded_at: new Date().toISOString() })
    .eq('deal_id', dealId)
    .eq('status', 'pending')

  const { error: pErr } = await supabase.from('poker_deal_bankroll_profiles').upsert(
    { deal_id: dealId, overall_bankroll: roll },
    { onConflict: 'deal_id' },
  )
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
      await supabase.from('poker_deal_bankroll_profiles').upsert(
        { deal_id: data.deal_id, overall_bankroll: roll },
        { onConflict: 'deal_id' },
      )
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
