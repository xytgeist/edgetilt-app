/**
 * Parlay ticket helpers (parent sports_bets + sports_bet_legs).
 */

import { parlayFromOdds } from './sportsBetCalcMath.js'

export function isParlayDraft(draft) {
  return String(draft?.market || '') === 'parlay'
}

export function normalizeParlayLegs(legs) {
  const list = Array.isArray(legs) ? legs : []
  return list
    .map((leg, i) => ({
      leg_index: Number.isFinite(Number(leg?.leg_index)) ? Number(leg.leg_index) : i,
      event_id: leg?.event_id ? String(leg.event_id) : '',
      sport_key: leg?.sport_key ? String(leg.sport_key) : '',
      sport_label: leg?.sport_label ? String(leg.sport_label) : '',
      home_team: leg?.home_team ? String(leg.home_team) : '',
      away_team: leg?.away_team ? String(leg.away_team) : '',
      commence_time: leg?.commence_time ? String(leg.commence_time) : '',
      market: leg?.market ? String(leg.market) : 'h2h',
      side: leg?.side ? String(leg.side) : '',
      selection_label: String(leg?.selection_label || '').trim() || `Leg ${i + 1}`,
      line: leg?.line != null && leg.line !== '' ? String(leg.line) : '',
      odds: leg?.odds != null && leg.odds !== '' ? String(leg.odds) : '',
      player_name: leg?.player_name ? String(leg.player_name) : '',
      prop_stat: leg?.prop_stat ? String(leg.prop_stat) : '',
      status: leg?.status ? String(leg.status) : 'open',
    }))
    .sort((a, b) => a.leg_index - b.leg_index)
}

export function parlaySelectionLabel(legs, custom = '') {
  const c = String(custom || '').trim()
  if (c && !/^parlay\b/i.test(c)) return c
  const n = normalizeParlayLegs(legs).length
  if (c) return c
  return n ? `Parlay (${n} leg${n === 1 ? '' : 's'})` : 'Parlay'
}

/** Combined American odds from leg juices when ticket total is missing. */
export function combinedOddsFromLegs(legs) {
  const odds = normalizeParlayLegs(legs)
    .map((l) => Number(l.odds))
    .filter((n) => Number.isFinite(n) && n !== 0)
  const pack = parlayFromOdds(odds)
  return pack?.american ?? null
}

/**
 * Roll parent status from settled legs.
 * any lost → lost; any open → open; all won → won; only push/void(+won) → push.
 */
export function rollupParlayStatus(legs) {
  const list = normalizeParlayLegs(legs)
  if (!list.length) return 'open'
  let won = 0
  let lost = 0
  let push = 0
  let voided = 0
  let open = 0
  for (const leg of list) {
    const s = String(leg.status || 'open')
    if (s === 'open') open += 1
    else if (s === 'won') won += 1
    else if (s === 'lost') lost += 1
    else if (s === 'push') push += 1
    else if (s === 'void') voided += 1
    else open += 1
  }
  if (lost > 0) return 'lost'
  if (open > 0) return 'open'
  if (won > 0 && push === 0 && voided === 0) return 'won'
  if (won === 0 && push === 0 && voided > 0) return 'void'
  return 'push'
}

export function sortLegsOnBet(bet) {
  if (!bet) return bet
  const legs = bet.sports_bet_legs || bet.legs
  if (!Array.isArray(legs)) return { ...bet, legs: [], sports_bet_legs: [] }
  const sorted = [...legs].sort((a, b) => (a.leg_index ?? 0) - (b.leg_index ?? 0))
  return { ...bet, legs: sorted, sports_bet_legs: sorted }
}
