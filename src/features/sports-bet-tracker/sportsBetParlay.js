/**
 * Parlay ticket helpers (parent sports_bets + sports_bet_legs).
 */

import { parlayFromOdds } from './sportsBetCalcMath.js'
import { americanOddsInputString } from './sportsBetMath.js'

export function isParlayDraft(draft) {
  return String(draft?.market || '') === 'parlay'
}

function cleanRetailMoneyLineSelection(sel) {
  const s = String(sel || '').trim()
  const m = /^(?:\d{3,5}\s+)?(.+?)\s+money\s*line(?:\s*ft)?\s*$/i.exec(s)
  if (!m) return s
  const team = m[1].trim().replace(/\s+/g, ' ')
  if (!team) return s
  // Title-ish: keep simple … "Creighton Bluejays Money Line Ft" → "Creighton Bluejays ML"
  const titled = team.replace(/\b\w/g, (ch) => ch.toUpperCase())
  return `${titled} ML`
}

/** Open betslip ticket chrome … never a real pick ("3 Leg Parlay", "Parlay (4)"). */
export function isParlayTicketChromeSelection(sel) {
  const s = String(sel || '').trim()
  if (!s) return false
  if (/^\d+\s*-?\s*(?:legs?|picks?)\s+pa[ry]lay\b/i.test(s)) return true
  if (/^parlay\s*\(\s*\d+/i.test(s)) return true
  if (/^pa[ry]lay\s*$/i.test(s)) return true
  // DK nested SGPx group headers: "2 PICKS SGP" / "2PICKS SGP +4500"
  if (/^\d+\s*picks?\s*sgp\b/i.test(s)) return true
  if (/^sgpx?\b/i.test(s) && s.length < 24) return true
  return false
}

export function normalizeParlayLegs(legs) {
  const list = Array.isArray(legs) ? legs : []
  return list
    .filter((leg) => !isParlayTicketChromeSelection(leg?.selection_label))
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
      selection_label: cleanRetailMoneyLineSelection(
        String(leg?.selection_label || '').trim() || `Leg ${i + 1}`,
      ),
      line: leg?.line != null && leg.line !== '' ? String(leg.line) : '',
      odds: leg?.odds != null && leg.odds !== ''
        ? (americanOddsInputString(leg.odds) || String(leg.odds))
        : '',
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
