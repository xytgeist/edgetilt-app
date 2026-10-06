import { buildSelectionLabel, profitUnitsForStatus } from './sportsBetMath.js'
import { normalizeSportsBetSource } from './sportsBetSources.js'
import { resolveSportsBetSport } from './sportsBetSports.js'

const SELECT = `
  id, user_id, event_id, sport_key, sport_label, home_team, away_team, commence_time,
  book, market, side, selection_label, line, odds, stake_units, stake_dollars, unit_size_dollars,
  status, result_at, profit_units, close_line, close_odds, clv_pts, clv_graded_at,
  notes, tags, source, confirmed, player_name, prop_stat, created_at, updated_at
`.replace(/\s+/g, ' ').trim()

function draftToRow(userId, draft) {
  const market = String(draft.market || 'spread')
  const side = draft.side ? String(draft.side) : null
  const odds = Number(draft.odds)
  const stakeUnits = Number(draft.stake_units ?? 1)
  if (!Number.isFinite(odds) || odds === 0) return { error: 'Odds required' }
  if (!Number.isFinite(stakeUnits) || stakeUnits <= 0) return { error: 'Stake units required' }
  const sport = resolveSportsBetSport(draft.sport_key, draft.sport_label)
  const selection_label = buildSelectionLabel({
    market,
    side,
    homeTeam: draft.home_team,
    awayTeam: draft.away_team,
    line: draft.line,
    selectionLabel: draft.selection_label,
    playerName: draft.player_name,
    propStat: draft.prop_stat,
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
      event_id: draft.event_id ? String(draft.event_id) : null,
      sport_key: sport.key || null,
      sport_label: sport.label || null,
      home_team: draft.home_team ? String(draft.home_team) : null,
      away_team: draft.away_team ? String(draft.away_team) : null,
      commence_time: draft.commence_time || null,
      book: draft.book ? String(draft.book).trim() : null,
      market,
      side,
      selection_label,
      player_name: draft.player_name ? String(draft.player_name).trim() : null,
      prop_stat: draft.prop_stat ? String(draft.prop_stat).trim() : null,
      line: draft.line == null || draft.line === '' ? null : Number(draft.line),
      odds: Math.round(odds),
      stake_units: stakeUnits,
      stake_dollars,
      unit_size_dollars: Number.isFinite(unitSize) ? unitSize : null,
      notes: draft.notes ? String(draft.notes).trim() : null,
      tags: Array.isArray(draft.tags) ? draft.tags : [],
      source: normalizeSportsBetSource(draft.source, 'manual'),
      confirmed: draft.confirmed === false ? false : true,
    },
  }
}

export async function listSportsBets(supabaseClient, { limit = 200 } = {}) {
  if (!supabaseClient) return { bets: [], error: 'No client' }
  const { data, error } = await supabaseClient
    .from('sports_bets')
    .select(SELECT)
    .order('created_at', { ascending: false })
    .limit(limit)
  if (error) return { bets: [], error: error.message }
  return { bets: data || [], error: null }
}

export async function insertSportsBet(supabaseClient, userId, draft) {
  if (!supabaseClient || !userId) return { bet: null, error: 'Not signed in' }
  const built = draftToRow(userId, draft)
  if (built.error) return { bet: null, error: built.error }
  const row = { ...built.row, status: 'open' }
  const { data, error } = await supabaseClient
    .from('sports_bets')
    .insert(row)
    .select(SELECT)
    .single()
  if (error) return { bet: null, error: error.message }
  return { bet: data, error: null }
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
  return { bet: data, error: null }
}

export async function confirmSportsBet(supabaseClient, betId) {
  if (!supabaseClient || !betId) return { bet: null, error: 'Missing bet' }
  const { data, error } = await supabaseClient
    .from('sports_bets')
    .update({ confirmed: true })
    .eq('id', betId)
    .select(SELECT)
    .single()
  if (error) return { bet: null, error: error.message }
  return { bet: data, error: null }
}

export async function settleSportsBet(supabaseClient, betId, status) {
  if (!supabaseClient || !betId) return { bet: null, error: 'Missing bet' }
  const next = String(status || '')
  if (!['won', 'lost', 'push', 'void', 'open'].includes(next)) {
    return { bet: null, error: 'Bad status' }
  }

  const { data: existing, error: readErr } = await supabaseClient
    .from('sports_bets')
    .select('id, stake_units, odds, status')
    .eq('id', betId)
    .maybeSingle()
  if (readErr) return { bet: null, error: readErr.message }
  if (!existing) return { bet: null, error: 'Bet not found' }

  const profit_units = next === 'open'
    ? null
    : profitUnitsForStatus(next, existing.stake_units, existing.odds)

  const { data, error } = await supabaseClient
    .from('sports_bets')
    .update({
      status: next,
      result_at: next === 'open' ? null : new Date().toISOString(),
      profit_units,
      ...(next === 'open' ? {} : { confirmed: true }),
    })
    .eq('id', betId)
    .select(SELECT)
    .single()
  if (error) return { bet: null, error: error.message }
  return { bet: data, error: null }
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
