/**
 * Auto-grade open `sports_bets` (spread / ML / total) from ESPN completed boards, plus NFL player props
 * from ESPN box scores (`sportsBetsPropGrade.ts`). Other props stay manual.
 * Piggybacks on `grade_picks` cron + JWT `sports-bets-grade`.
 */
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2'
import {
  espnDateKeysFromCommence,
  espnFallbackCoversMarket,
  fetchEspnCompletedScoreboard,
  matchEspnFinalScore,
  type EspnCompletedEvent,
} from './loungeBotEspnSummary.ts'
import { gradeNflPropRows, loadOpenNflPropRows } from './sportsBetsPropGrade.ts'

type SportsBetRow = {
  id: string
  user_id: string
  sport_key: string | null
  home_team: string | null
  away_team: string | null
  commence_time: string | null
  market: string
  side: string | null
  selection_label: string
  line: number | null
  odds: number
  stake_units: number
  status: string
}

function normName(value: string): string {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

function isTeamMatch(a: string, b: string): boolean {
  const x = normName(a)
  const y = normName(b)
  if (!x || !y) return false
  if (x === y) return true
  if (x.includes(y) || y.includes(x)) return true
  const xs = x.split(' ').filter(Boolean)
  const ys = y.split(' ').filter(Boolean)
  if (xs.length && ys.length && xs[xs.length - 1] === ys[ys.length - 1] && xs[xs.length - 1].length >= 4) {
    return true
  }
  return false
}

function americanProfitMultiple(odds: number): number | null {
  if (!Number.isFinite(odds) || odds === 0) return null
  if (odds > 0) return odds / 100
  return 100 / Math.abs(odds)
}

export function profitUnitsForSportsBetStatus(
  status: 'won' | 'lost' | 'push' | 'void',
  stakeUnits: number,
  odds: number,
): number | null {
  const stake = Number(stakeUnits)
  if (!Number.isFinite(stake) || stake <= 0) return null
  if (status === 'push' || status === 'void') return 0
  if (status === 'lost') return -stake
  const mult = americanProfitMultiple(Number(odds))
  if (mult == null) return null
  return stake * mult
}

/** Map tracker market → Odds/ESPN market key used by espnFallbackCoversMarket. */
function espnMarketKey(market: string): string {
  const m = String(market || '')
  if (m === 'spread') return 'spreads'
  if (m === 'total') return 'totals'
  return m
}

/** Markets/sports ESPN boards can settle. Boxing has no scoreboard path. UFC/MMA: h2h only. */
export function sportsBetIsAutoGradeable(bet: {
  market?: string | null
  sport_key?: string | null
  sport_label?: string | null
}): boolean {
  const m = String(bet?.market || '')
  if (m !== 'spread' && m !== 'h2h' && m !== 'total') return false
  const sk = `${bet?.sport_key || ''} ${bet?.sport_label || ''}`.toLowerCase()
  if (/\bboxing\b/.test(sk)) return false
  if (/\bufc\b|\bmma\b|mma_mixed/.test(sk)) return m === 'h2h'
  return true
}

function sideIsHome(bet: SportsBetRow): boolean | null {
  if (bet.side === 'home') return true
  if (bet.side === 'away') return false
  if (bet.home_team && isTeamMatch(bet.selection_label, bet.home_team)) return true
  if (bet.away_team && isTeamMatch(bet.selection_label, bet.away_team)) return false
  return null
}

function sideIsOver(bet: SportsBetRow): boolean | null {
  if (bet.side === 'over') return true
  if (bet.side === 'under') return false
  if (/^over\b/i.test(bet.selection_label)) return true
  if (/^under\b/i.test(bet.selection_label)) return false
  return null
}

/**
 * Grade one tracker bet against final scores. Null = cannot auto-grade.
 */
export function gradeSportsBetOutcome(
  bet: SportsBetRow,
  homeScore: number,
  awayScore: number,
): { status: 'won' | 'lost' | 'push'; profit_units: number | null } | null {
  if (!sportsBetIsAutoGradeable(bet)) return null
  const market = String(bet.market || '')

  if (market === 'h2h') {
    const home = sideIsHome(bet)
    if (home == null) return null
    if (homeScore === awayScore) {
      return { status: 'push', profit_units: profitUnitsForSportsBetStatus('push', bet.stake_units, bet.odds) }
    }
    const won = home ? homeScore > awayScore : awayScore > homeScore
    const status = won ? 'won' : 'lost'
    return { status, profit_units: profitUnitsForSportsBetStatus(status, bet.stake_units, bet.odds) }
  }

  if (market === 'spread') {
    const home = sideIsHome(bet)
    if (home == null) return null
    const line = Number(bet.line)
    if (!Number.isFinite(line)) return null
    const diff = home ? (homeScore + line) - awayScore : (awayScore + line) - homeScore
    const status: 'won' | 'lost' | 'push' = diff > 0 ? 'won' : diff < 0 ? 'lost' : 'push'
    return { status, profit_units: profitUnitsForSportsBetStatus(status, bet.stake_units, bet.odds) }
  }

  if (market === 'total') {
    const over = sideIsOver(bet)
    if (over == null) return null
    const line = Number(bet.line)
    if (!Number.isFinite(line)) return null
    const total = homeScore + awayScore
    const status: 'won' | 'lost' | 'push' = total === line
      ? 'push'
      : (over ? total > line : total < line)
        ? 'won'
        : 'lost'
    return { status, profit_units: profitUnitsForSportsBetStatus(status, bet.stake_units, bet.odds) }
  }

  return null
}

const SELECT = `
  id, user_id, sport_key, home_team, away_team, commence_time,
  market, side, selection_label, line, odds, stake_units, status
`.replace(/\s+/g, ' ').trim()

const LEG_SELECT = `
  id, bet_id, user_id, sport_key, home_team, away_team, commence_time,
  market, side, selection_label, line, odds, status
`.replace(/\s+/g, ' ').trim()

type SportsBetLegRow = {
  id: string
  bet_id: string
  user_id: string
  sport_key: string | null
  home_team: string | null
  away_team: string | null
  commence_time: string | null
  market: string
  side: string | null
  selection_label: string
  line: number | null
  odds: number | null
  status: string
}

function rollupParlayStatusFromLegs(
  legs: { status?: string | null }[],
): 'open' | 'won' | 'lost' | 'push' | 'void' {
  let won = 0
  let lost = 0
  let push = 0
  let voided = 0
  let open = 0
  for (const leg of legs) {
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

export async function gradeOpenSportsBets(
  admin: SupabaseClient,
  opts: { userId?: string } = {},
): Promise<{ resolved: number; scanned: number; errors: string[] }> {
  const errors: string[] = []
  let q = admin
    .from('sports_bets')
    .select(SELECT)
    .eq('status', 'open')
    .in('market', ['spread', 'h2h', 'total'])
    .not('home_team', 'is', null)
    .not('away_team', 'is', null)
    .limit(500)

  if (opts.userId) q = q.eq('user_id', opts.userId)

  const { data, error } = await q
  if (error) return { resolved: 0, scanned: 0, errors: [error.message] }
  const bets = (data || []) as SportsBetRow[]

  let legQ = admin
    .from('sports_bet_legs')
    .select(LEG_SELECT)
    .eq('status', 'open')
    .in('market', ['spread', 'h2h', 'total'])
    .not('home_team', 'is', null)
    .not('away_team', 'is', null)
    .limit(500)
  if (opts.userId) legQ = legQ.eq('user_id', opts.userId)

  const { data: legData, error: legErr } = await legQ
  // Missing table on older envs … skip legs, still grade straights.
  const legs = (!legErr && legData ? legData : []) as SportsBetLegRow[]
  if (legErr && !/relation|schema cache|does not exist/i.test(legErr.message || '')) {
    errors.push(`legs: ${legErr.message}`)
  }

  const props = await loadOpenNflPropRows(admin, opts)
  errors.push(...props.errors)

  if (!bets.length && !legs.length && !props.bets.length && !props.legs.length) {
    return { resolved: 0, scanned: 0, errors }
  }

  const datesBySport = new Map<string, Set<string>>()
  const rememberDates = (sportKey: string, commence: string | null | undefined) => {
    const sk = String(sportKey || '').trim() || 'unknown'
    let set = datesBySport.get(sk)
    if (!set) {
      set = new Set<string>()
      datesBySport.set(sk, set)
    }
    for (const d of espnDateKeysFromCommence(commence)) set.add(d)
  }
  for (const bet of bets) rememberDates(bet.sport_key, bet.commence_time)
  for (const leg of legs) rememberDates(leg.sport_key, leg.commence_time)

  const boards = new Map<string, EspnCompletedEvent[]>()
  const loadBoard = async (sportKey: string) => {
    if (boards.has(sportKey)) return boards.get(sportKey) || []
    const dates = [...(datesBySport.get(sportKey) || [])]
    try {
      const board = await fetchEspnCompletedScoreboard(sportKey, { dates })
      boards.set(sportKey, board)
      return board
    } catch (err: unknown) {
      boards.set(sportKey, [])
      const msg = err instanceof Error ? err.message : String(err)
      errors.push(`ESPN ${sportKey}: ${msg}`)
      return []
    }
  }

  let resolved = 0
  const nowIso = new Date().toISOString()
  const touchedParlayIds = new Set<string>()

  const bySport = new Map<string, SportsBetRow[]>()
  for (const bet of bets) {
    const sk = String(bet.sport_key || '').trim() || 'unknown'
    const list = bySport.get(sk) || []
    list.push(bet)
    bySport.set(sk, list)
  }

  for (const [sportKey, list] of bySport.entries()) {
    const board = await loadBoard(sportKey)
    if (!board.length) continue

    for (const bet of list) {
      const mk = espnMarketKey(bet.market)
      if (!espnFallbackCoversMarket(sportKey, mk)) continue
      const scores = matchEspnFinalScore(board, String(bet.home_team), String(bet.away_team))
      if (!scores) continue
      const grade = gradeSportsBetOutcome(bet, scores.homeScore, scores.awayScore)
      if (!grade) continue

      const { error: upErr } = await admin
        .from('sports_bets')
        .update({
          status: grade.status,
          result_at: nowIso,
          profit_units: grade.profit_units,
          confirmed: true,
        })
        .eq('id', bet.id)
        .eq('status', 'open')

      if (upErr) {
        errors.push(`${bet.id}: ${upErr.message}`)
        continue
      }
      resolved += 1
    }
  }

  const legsBySport = new Map<string, SportsBetLegRow[]>()
  for (const leg of legs) {
    const sk = String(leg.sport_key || '').trim() || 'unknown'
    const list = legsBySport.get(sk) || []
    list.push(leg)
    legsBySport.set(sk, list)
  }

  for (const [sportKey, list] of legsBySport.entries()) {
    const board = await loadBoard(sportKey)
    if (!board.length) continue

    for (const leg of list) {
      const mk = espnMarketKey(leg.market)
      if (!espnFallbackCoversMarket(sportKey, mk)) continue
      const scores = matchEspnFinalScore(board, String(leg.home_team), String(leg.away_team))
      if (!scores) continue
      const asBet: SportsBetRow = {
        id: leg.id,
        user_id: leg.user_id,
        sport_key: leg.sport_key,
        home_team: leg.home_team,
        away_team: leg.away_team,
        commence_time: leg.commence_time,
        market: leg.market,
        side: leg.side,
        selection_label: leg.selection_label,
        line: leg.line,
        odds: Number(leg.odds) || -110,
        stake_units: 1,
        status: leg.status,
      }
      const grade = gradeSportsBetOutcome(asBet, scores.homeScore, scores.awayScore)
      if (!grade) continue

      const { error: upErr } = await admin
        .from('sports_bet_legs')
        .update({ status: grade.status })
        .eq('id', leg.id)
        .eq('status', 'open')

      if (upErr) {
        errors.push(`leg ${leg.id}: ${upErr.message}`)
        continue
      }
      touchedParlayIds.add(leg.bet_id)
      resolved += 1
    }
  }

  if (props.bets.length || props.legs.length) {
    const { graded, errors: propErrors } = await gradeNflPropRows([...props.bets, ...props.legs])
    errors.push(...propErrors)
    for (const bet of props.bets) {
      const status = graded.get(bet.id)
      if (!status) continue
      const { error: upErr } = await admin
        .from('sports_bets')
        .update({
          status,
          result_at: nowIso,
          profit_units: profitUnitsForSportsBetStatus(status, bet.stake_units, bet.odds),
          confirmed: true,
        })
        .eq('id', bet.id)
        .eq('status', 'open')
      if (upErr) {
        errors.push(`${bet.id}: ${upErr.message}`)
        continue
      }
      resolved += 1
    }
    for (const leg of props.legs) {
      const status = graded.get(leg.id)
      if (!status) continue
      const { error: upErr } = await admin
        .from('sports_bet_legs')
        .update({ status })
        .eq('id', leg.id)
        .eq('status', 'open')
      if (upErr) {
        errors.push(`leg ${leg.id}: ${upErr.message}`)
        continue
      }
      touchedParlayIds.add(leg.bet_id)
      resolved += 1
    }
  }

  for (const betId of touchedParlayIds) {
    const { data: allLegs, error: loadErr } = await admin
      .from('sports_bet_legs')
      .select('status')
      .eq('bet_id', betId)
    if (loadErr || !allLegs?.length) {
      if (loadErr) errors.push(`rollup ${betId}: ${loadErr.message}`)
      continue
    }
    const next = rollupParlayStatusFromLegs(allLegs)
    if (next === 'open') continue

    const { data: parent, error: parentErr } = await admin
      .from('sports_bets')
      .select('id, stake_units, odds, status')
      .eq('id', betId)
      .eq('status', 'open')
      .eq('market', 'parlay')
      .maybeSingle()
    if (parentErr || !parent) continue

    const profit_units = profitUnitsForSportsBetStatus(
      next,
      Number(parent.stake_units),
      Number(parent.odds),
    )
    const { error: upParent } = await admin
      .from('sports_bets')
      .update({
        status: next,
        result_at: nowIso,
        profit_units,
        confirmed: true,
      })
      .eq('id', betId)
      .eq('status', 'open')
    if (upParent) errors.push(`parlay ${betId}: ${upParent.message}`)
  }

  return { resolved, scanned: bets.length + legs.length + props.bets.length + props.legs.length, errors }
}
