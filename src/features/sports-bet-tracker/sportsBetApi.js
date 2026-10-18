import {
  buildBetSummaryLabel,
  profitUnitsForBet,
  profitUnitsForStatus,
} from './sportsBetMath.js'
import { normalizeSportsBetSource } from './sportsBetSources.js'
import { resolveSportsBetSport } from './sportsBetSports.js'
import {
  isParlayDraft,
  normalizeParlayLegs,
  sortLegsOnBet,
} from './sportsBetParlay.js'

const SELECT = `
  id, user_id, event_id, sport_key, sport_label, home_team, away_team, commence_time,
  book, market, side, selection_label, line, odds, stake_units, stake_dollars, unit_size_dollars,
  to_win_dollars, to_collect_dollars,
  status, result_at, profit_units, close_line, close_odds, clv_pts, clv_graded_at,
  notes, tags, source, confirmed, player_name, prop_stat, created_at, updated_at
`.replace(/\s+/g, ' ').trim()

const LEG_SELECT = `
  id, bet_id, user_id, leg_index, event_id, sport_key, sport_label, home_team, away_team,
  commence_time, market, side, selection_label, line, odds, player_name, prop_stat, status,
  created_at, updated_at
`.replace(/\s+/g, ' ').trim()

function moneyOrNull(value) {
  if (value == null || value === '') return null
  const n = Number(value)
  return Number.isFinite(n) && n >= 0 ? n : null
}

function draftToRow(userId, draft) {
  const market = String(draft.market || 'spread')
  const side = draft.side ? String(draft.side) : null
  const oddsRaw = draft.odds == null || draft.odds === '' ? null : Number(draft.odds)
  const odds = Number.isFinite(oddsRaw) && oddsRaw !== 0 ? Math.round(oddsRaw) : null
  const to_win_dollars = moneyOrNull(draft.to_win_dollars)
  const to_collect_dollars = moneyOrNull(draft.to_collect_dollars)
  const stakeUnits = Number(draft.stake_units ?? 1)
  if (odds == null && to_win_dollars == null && to_collect_dollars == null) {
    return { error: 'Odds or To win / To collect required' }
  }
  if (!Number.isFinite(stakeUnits) || stakeUnits <= 0) return { error: 'Stake units required' }
  const sport = resolveSportsBetSport(draft.sport_key, draft.sport_label)
  const legs = market === 'parlay' ? normalizeParlayLegs(draft.legs || draft.sports_bet_legs) : []
  if (market === 'parlay' && legs.length < 2) {
    return { error: 'Parlay needs at least 2 legs' }
  }
  const selection_label = draft.label_manual && String(draft.selection_label || '').trim()
    ? String(draft.selection_label).trim()
    : buildBetSummaryLabel({
      ...draft,
      market,
      side,
      legs,
    })
  const direct = draft.stake_dollars == null || draft.stake_dollars === ''
    ? null
    : Number(draft.stake_dollars)
  const unitSize = draft.unit_size_dollars == null || draft.unit_size_dollars === ''
    ? null
    : Number(draft.unit_size_dollars)
  let stake_dollars = Number.isFinite(direct) && direct >= 0 ? direct : null
  if (stake_dollars == null && Number.isFinite(unitSize) && unitSize > 0) {
    stake_dollars = stakeUnits * unitSize
  }
  return {
    row: {
      ...(userId ? { user_id: userId } : {}),
      event_id: market === 'parlay' ? null : (draft.event_id ? String(draft.event_id) : null),
      sport_key: sport.key || null,
      sport_label: market === 'parlay'
        ? (sport.label || 'Parlay')
        : (sport.label || null),
      home_team: market === 'parlay' ? null : (draft.home_team ? String(draft.home_team) : null),
      away_team: market === 'parlay' ? null : (draft.away_team ? String(draft.away_team) : null),
      commence_time: draft.commence_time || null,
      book: draft.book ? String(draft.book).trim() : null,
      market,
      side: market === 'parlay' ? null : side,
      selection_label,
      player_name: market === 'parlay' ? null : (draft.player_name ? String(draft.player_name).trim() : null),
      prop_stat: market === 'parlay' ? null : (draft.prop_stat ? String(draft.prop_stat).trim() : null),
      line: market === 'parlay' || draft.line == null || draft.line === ''
        ? null
        : Number(draft.line),
      odds,
      stake_units: stakeUnits,
      stake_dollars,
      unit_size_dollars: Number.isFinite(unitSize) ? unitSize : null,
      to_win_dollars,
      to_collect_dollars,
      notes: draft.notes ? String(draft.notes).trim() : null,
      tags: Array.isArray(draft.tags) ? draft.tags : [],
      source: normalizeSportsBetSource(draft.source, 'manual'),
      confirmed: draft.confirmed === false ? false : true,
    },
    legs,
  }
}

function legToRow(userId, betId, leg, index) {
  const market = String(leg.market || 'h2h')
  const oddsRaw = leg.odds == null || leg.odds === '' ? null : Number(leg.odds)
  const odds = Number.isFinite(oddsRaw) && oddsRaw !== 0 ? Math.round(oddsRaw) : null
  const selection_label = String(leg.selection_label || '').trim() || `Leg ${index + 1}`
  return {
    user_id: userId,
    bet_id: betId,
    leg_index: index,
    event_id: leg.event_id ? String(leg.event_id) : null,
    sport_key: leg.sport_key ? String(leg.sport_key) : null,
    sport_label: leg.sport_label ? String(leg.sport_label) : null,
    home_team: leg.home_team ? String(leg.home_team) : null,
    away_team: leg.away_team ? String(leg.away_team) : null,
    commence_time: leg.commence_time || null,
    market,
    side: leg.side ? String(leg.side) : null,
    selection_label,
    line: leg.line == null || leg.line === '' ? null : Number(leg.line),
    odds,
    player_name: leg.player_name ? String(leg.player_name).trim() : null,
    prop_stat: leg.prop_stat ? String(leg.prop_stat).trim() : null,
    status: leg.status && leg.status !== 'open' ? String(leg.status) : 'open',
  }
}

async function replaceLegs(supabaseClient, userId, betId, legs) {
  const { error: delErr } = await supabaseClient
    .from('sports_bet_legs')
    .delete()
    .eq('bet_id', betId)
  if (delErr) return delErr.message
  if (!legs.length) return null
  const rows = legs.map((leg, i) => legToRow(userId, betId, leg, i))
  const { error: insErr } = await supabaseClient.from('sports_bet_legs').insert(rows)
  return insErr?.message || null
}

export async function listSportsBets(supabaseClient, { limit = 200 } = {}) {
  if (!supabaseClient) return { bets: [], error: 'No client' }
  const { data, error } = await supabaseClient
    .from('sports_bets')
    .select(`${SELECT}, sports_bet_legs (${LEG_SELECT})`)
    .order('created_at', { ascending: false })
    .limit(limit)
  if (error) {
    // Older DBs without legs table: fall back so tracker still loads.
    if (/sports_bet_legs|schema cache/i.test(error.message || '')) {
      const plain = await supabaseClient
        .from('sports_bets')
        .select(SELECT)
        .order('created_at', { ascending: false })
        .limit(limit)
      if (plain.error) return { bets: [], error: plain.error.message }
      return { bets: (plain.data || []).map((b) => sortLegsOnBet({ ...b, sports_bet_legs: [] })), error: null }
    }
    return { bets: [], error: error.message }
  }
  return { bets: (data || []).map((b) => sortLegsOnBet(b)), error: null }
}

export async function insertSportsBet(supabaseClient, userId, draft) {
  if (!supabaseClient || !userId) return { bet: null, error: 'Not signed in' }
  const built = draftToRow(userId, draft)
  if (built.error) return { bet: null, error: built.error }
  const slipStatus = ['won', 'lost', 'push', 'void'].includes(String(draft.status || ''))
    ? String(draft.status)
    : 'open'
  const row = {
    ...built.row,
    status: slipStatus,
    ...(slipStatus !== 'open'
      ? {
        result_at: new Date().toISOString(),
        profit_units: profitUnitsForBet({ ...built.row, status: slipStatus }),
      }
      : {}),
  }
  const { data, error } = await supabaseClient
    .from('sports_bets')
    .insert(row)
    .select(SELECT)
    .single()
  if (error) return { bet: null, error: error.message }
  let bet = sortLegsOnBet({ ...data, sports_bet_legs: [] })
  if (isParlayDraft(draft) && built.legs.length) {
    // Won ticket … mark open legs won, but keep Void/Push from OCR (e.g. postponed ML)
    const legsForInsert = slipStatus === 'won'
      ? built.legs.map((l) => {
        const s = String(l.status || 'open')
        if (s === 'void' || s === 'push' || s === 'lost') return l
        return { ...l, status: 'won' }
      })
      : built.legs
    const legErr = await replaceLegs(supabaseClient, userId, data.id, legsForInsert)
    if (legErr) {
      await supabaseClient.from('sports_bets').delete().eq('id', data.id)
      return { bet: null, error: legErr }
    }
    const { data: withLegs, error: reloadErr } = await supabaseClient
      .from('sports_bets')
      .select(`${SELECT}, sports_bet_legs (${LEG_SELECT})`)
      .eq('id', data.id)
      .single()
    if (!reloadErr && withLegs) bet = sortLegsOnBet(withLegs)
    else bet = sortLegsOnBet({ ...data, sports_bet_legs: built.legs })
  }
  return { bet, error: null }
}

export async function updateSportsBet(supabaseClient, betId, draft) {
  if (!supabaseClient || !betId) return { bet: null, error: 'Missing bet' }
  const built = draftToRow(null, { ...draft, confirmed: true })
  if (built.error) return { bet: null, error: built.error }
  const { user_id: _uid, ...patch } = built.row
  const { data, error } = await supabaseClient
    .from('sports_bets')
    .update(patch)
    .eq('id', betId)
    .select(SELECT)
    .single()
  if (error) return { bet: null, error: error.message }

  const userId = data.user_id
  if (String(patch.market) === 'parlay') {
    const legErr = await replaceLegs(supabaseClient, userId, betId, built.legs)
    if (legErr) return { bet: null, error: legErr }
  } else {
    await supabaseClient.from('sports_bet_legs').delete().eq('bet_id', betId)
  }

  const { data: withLegs, error: reloadErr } = await supabaseClient
    .from('sports_bets')
    .select(`${SELECT}, sports_bet_legs (${LEG_SELECT})`)
    .eq('id', betId)
    .single()
  if (!reloadErr && withLegs) return { bet: sortLegsOnBet(withLegs), error: null }
  return { bet: sortLegsOnBet({ ...data, sports_bet_legs: built.legs }), error: null }
}

export async function confirmSportsBet(supabaseClient, betId) {
  if (!supabaseClient || !betId) return { bet: null, error: 'Missing bet' }
  const { data, error } = await supabaseClient
    .from('sports_bets')
    .update({ confirmed: true })
    .eq('id', betId)
    .select(`${SELECT}, sports_bet_legs (${LEG_SELECT})`)
    .single()
  if (error) return { bet: null, error: error.message }
  return { bet: sortLegsOnBet(data), error: null }
}

export async function settleSportsBet(supabaseClient, betId, status) {
  if (!supabaseClient || !betId) return { bet: null, error: 'Missing bet' }
  const next = String(status || '')
  if (!['won', 'lost', 'push', 'void', 'open'].includes(next)) {
    return { bet: null, error: 'Bad status' }
  }

  const { data: existing, error: readErr } = await supabaseClient
    .from('sports_bets')
    .select('id, stake_units, odds, status, to_win_dollars, to_collect_dollars, unit_size_dollars, stake_dollars')
    .eq('id', betId)
    .maybeSingle()
  if (readErr) return { bet: null, error: readErr.message }
  if (!existing) return { bet: null, error: 'Bet not found' }

  const profit_units = next === 'open'
    ? null
    : profitUnitsForBet({ ...existing, status: next })
      ?? profitUnitsForStatus(next, existing.stake_units, existing.odds)

  const { data, error } = await supabaseClient
    .from('sports_bets')
    .update({
      status: next,
      result_at: next === 'open' ? null : new Date().toISOString(),
      profit_units,
      ...(next === 'open' ? {} : { confirmed: true }),
    })
    .eq('id', betId)
    .select(`${SELECT}, sports_bet_legs (${LEG_SELECT})`)
    .single()
  if (error) return { bet: null, error: error.message }
  return { bet: sortLegsOnBet(data), error: null }
}

export async function deleteSportsBet(supabaseClient, betId) {
  if (!supabaseClient || !betId) return { error: 'Missing bet' }
  const { error } = await supabaseClient.from('sports_bets').delete().eq('id', betId)
  return { error: error?.message || null }
}

export async function refreshSportsBetClv(supabaseClient) {
  if (!supabaseClient) return { graded: 0, error: 'No client' }
  const { data, error } = await supabaseClient.rpc('sports_bets_refresh_clv')
  if (error) return { graded: 0, error: error.message }
  return { graded: Number(data) || 0, error: null }
}

/** Auto-settle open spread / ML / total bets vs ESPN finals (Edge `sports-bets-grade`). */
export async function gradeOpenSportsBets(supabaseClient) {
  if (!supabaseClient) return { resolved: 0, error: 'No client' }
  const { data, error } = await supabaseClient.functions.invoke('sports-bets-grade', { body: {} })
  if (error) return { resolved: 0, error: error.message || 'Grade failed' }
  if (data?.error) return { resolved: 0, error: String(data.error) }
  return { resolved: Number(data?.resolved) || 0, error: null }
}

/** Same reading as Edge `propStatKey` (sportsBetsPropGrade.ts) … keep the two in step. */
export function sportsBetPropStatKey(text) {
  const t = String(text || '').toLowerCase()
  if (!t) return null
  if (/rush(ing)?\s*(and|\+|&)\s*rec/.test(t) || /scrim(mage)?\s*(yds|yards)/.test(t)) return 'rr_yds'
  if (/long(est)?\s*rec/.test(t)) return 'rec_lng'
  if (/fantasy|fpts/.test(t)) return null
  if (/pass(ing)?\s*(yds|yards)/.test(t)) return 'pass_yds'
  if (/pass(ing)?\s*(td|touchdown)/.test(t)) return 'pass_td'
  if (/\bint(erception)?s?\b/.test(t)) return 'pass_int'
  if (/comp(letion)?s?\b/.test(t)) return 'pass_cmp'
  if (/pass(ing)?\s*att/.test(t)) return 'pass_att'
  if (/rush(ing)?\s*(yds|yards)/.test(t)) return 'rush_yds'
  if (/rush(ing)?\s*att|carries/.test(t)) return 'rush_att'
  if (/rec(eiving)?\s*(yds|yards)/.test(t)) return 'rec_yds'
  if (/\brec(eption)?s?\b/.test(t)) return 'rec'
  if (/\btd\b|touchdown/.test(t)) return 'td'
  return null
}

/**
 * Markets/sports the Edge grader can actually settle via ESPN boards.
 * Boxing has no scoreboard path … never promise auto-grade.
 * UFC/MMA: moneyline only (1-0 person boards).
 * Props: NFL only, with a player, a line, and a stat the box score carries.
 */
export function sportsBetIsAutoGradeable(bet) {
  const m = String(bet?.market || '')
  if (m === 'prop') {
    const sk = `${bet?.sport_key || ''} ${bet?.sport_label || ''}`.toLowerCase()
    const nfl = sk.includes('americanfootball_nfl') || /\bnfl\b/.test(sk)
    const line = bet?.line
    return nfl && Boolean(String(bet?.player_name || '').trim()) && line != null && line !== '' &&
      Number.isFinite(Number(line)) && Boolean(sportsBetPropStatKey(bet?.prop_stat))
  }
  if (m !== 'spread' && m !== 'h2h' && m !== 'total') return false
  const sk = `${bet?.sport_key || ''} ${bet?.sport_label || ''}`.toLowerCase()
  if (/\bboxing\b/.test(sk)) return false
  if (/\bufc\b|\bmma\b|mma_mixed/.test(sk)) return m === 'h2h'
  // Team sports with ESPN boards (NFL/CFB/NBA/MLB/NHL …)
  return true
}

/** Open auto-gradeable bet whose event time is already well in the past. */
export function sportsBetAutoGradeLooksStale(bet, nowMs = Date.now()) {
  if (!sportsBetIsAutoGradeable(bet)) return false
  if (String(bet?.status || 'open') !== 'open') return false
  const t = bet?.commence_time ? new Date(bet.commence_time).getTime() : NaN
  if (!Number.isFinite(t)) return false
  return t < nowMs - 36 * 3600_000
}
