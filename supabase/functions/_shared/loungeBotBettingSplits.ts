/**
 * Betting Splits … ticket % (public) vs handle % (money).
 *
 * Real path: human paste from Action PRO / VSiN into syndicate_betting_splits.
 * Synthetic path: heuristic only for captions … never a Chedda vote reason.
 */
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2'
import type { OddsEvent } from './loungeBotOddsCaption.ts'
import { shortDisplayName } from './loungeBotOddsCaption.ts'

export type BettingSplitSummary = {
  sportKey: string
  homeTeam: string
  awayTeam: string
  marketKey: 'spreads' | 'totals' | 'h2h'
  homeTicketPct: number
  homeHandlePct: number
  awayTicketPct: number
  awayHandlePct: number
  sharpFavoredSide: 'home' | 'away' | null
  divergencePts: number
  isSharpDivergence: boolean
  isRlm: boolean
  summaryLine: string
  /** True when sourced from syndicate_betting_splits paste (Action/VSiN/manual). */
  isPasted?: boolean
  source?: string | null
}

const DIVERGENCE_MIN = 15

function teamsMatch(a: string, b: string): boolean {
  const x = String(a || '').trim().toLowerCase()
  const y = String(b || '').trim().toLowerCase()
  if (!x || !y) return false
  if (x === y) return true
  if (x.includes(y) || y.includes(x)) return true
  const xLast = x.split(/\s+/).pop() || ''
  const yLast = y.split(/\s+/).pop() || ''
  return Boolean(xLast && yLast && xLast === yLast)
}

function hashString(str: string): number {
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i)
    hash |= 0
  }
  return Math.abs(hash)
}

function summarizeSides(
  homeTeam: string,
  awayTeam: string,
  homeTicketPct: number,
  homeHandlePct: number,
  awayTicketPct: number,
  awayHandlePct: number,
  opts?: { isPasted?: boolean; source?: string | null; sportKey?: string },
): BettingSplitSummary {
  const homeDivergence = homeHandlePct - homeTicketPct
  const awayDivergence = awayHandlePct - awayTicketPct

  let sharpFavoredSide: 'home' | 'away' | null = null
  let divergencePts = 0

  if (homeDivergence >= DIVERGENCE_MIN) {
    sharpFavoredSide = 'home'
    divergencePts = homeDivergence
  } else if (awayDivergence >= DIVERGENCE_MIN) {
    sharpFavoredSide = 'away'
    divergencePts = awayDivergence
  }

  // Soft RLM-style: public tickets heavy one way, handle the other
  let isRlm = false
  if (homeTicketPct >= 65 && awayHandlePct >= 55) {
    isRlm = true
    if (!sharpFavoredSide) {
      sharpFavoredSide = 'away'
      divergencePts = Math.max(divergencePts, awayHandlePct - awayTicketPct)
    }
  }
  if (awayTicketPct >= 65 && homeHandlePct >= 55) {
    isRlm = true
    if (!sharpFavoredSide) {
      sharpFavoredSide = 'home'
      divergencePts = Math.max(divergencePts, homeHandlePct - homeTicketPct)
    }
  }

  const isSharpDivergence = divergencePts >= DIVERGENCE_MIN || isRlm

  let summaryLine = ''
  if (isSharpDivergence && sharpFavoredSide) {
    const sharpSideName = sharpFavoredSide === 'home' ? shortDisplayName(homeTeam) : shortDisplayName(awayTeam)
    const fadeSideName = sharpFavoredSide === 'home' ? shortDisplayName(awayTeam) : shortDisplayName(homeTeam)
    const sharpHandle = sharpFavoredSide === 'home' ? homeHandlePct : awayHandlePct
    const publicTickets = sharpFavoredSide === 'home' ? awayTicketPct : homeTicketPct
    const prefix = opts?.isPasted ? `Pasted (${opts.source || 'manual'})` : 'Synthetic'
    if (isRlm) {
      summaryLine = `${prefix} · RLM · ${Math.round(sharpHandle)}% money on ${sharpSideName} despite ${Math.round(publicTickets)}% tickets on ${fadeSideName}`
    } else {
      summaryLine = `${prefix} · ${Math.round(sharpHandle)}% handle on ${sharpSideName} (+${Math.round(divergencePts)} vs tickets)`
    }
  }

  return {
    sportKey: opts?.sportKey || '',
    homeTeam,
    awayTeam,
    marketKey: 'spreads',
    homeTicketPct,
    homeHandlePct,
    awayTicketPct,
    awayHandlePct,
    sharpFavoredSide,
    divergencePts,
    isSharpDivergence,
    isRlm,
    summaryLine,
    isPasted: opts?.isPasted === true,
    source: opts?.source || null,
  }
}

/** Build summary from a pasted DB row (Action PRO / VSiN / manual). */
export function summaryFromPastedRow(row: {
  sport_key?: string
  home_team: string
  away_team: string
  home_ticket_pct: number
  home_handle_pct: number
  away_ticket_pct: number
  away_handle_pct: number
  source?: string | null
}): BettingSplitSummary {
  return summarizeSides(
    row.home_team,
    row.away_team,
    Number(row.home_ticket_pct),
    Number(row.home_handle_pct),
    Number(row.away_ticket_pct),
    Number(row.away_handle_pct),
    { isPasted: true, source: row.source || 'manual', sportKey: row.sport_key },
  )
}

/**
 * Heuristic / costume splits from book shade.
 * Captions only … Chedda must NOT treat these as a real vote reason.
 */
export function resolveGameBettingSplits(
  ev: OddsEvent,
  homeSpreadPoint: number | null,
  _homePrice: number,
  _awayPrice: number,
): BettingSplitSummary {
  const homeTeam = ev.home_team
  const awayTeam = ev.away_team

  let sharpSpreadPoint: number | null = null
  let retailSpreadPoint: number | null = null

  for (const b of ev.bookmakers || []) {
    const key = b.key.toLowerCase()
    const sm = b.markets.find((m) => m.key === 'spreads')
    if (!sm) continue
    const homeOut = sm.outcomes.find((o) => o.name === homeTeam)
    if (!homeOut || homeOut.point == null) continue

    if (key.includes('circa') || key.includes('pinnacle') || key.includes('lowvig')) {
      sharpSpreadPoint = homeOut.point
    } else if (key.includes('draftkings') || key.includes('fanduel') || key.includes('betmgm')) {
      retailSpreadPoint = homeOut.point
    }
  }

  const isHomeFav = (homeSpreadPoint ?? 0) < 0
  const isAwayFav = (homeSpreadPoint ?? 0) > 0

  const seed = hashString(`${ev.id}_${homeTeam}_${awayTeam}_splits`)
  const favPublicBias = 60 + (seed % 18)
  let homeTicketPct = isHomeFav ? favPublicBias : isAwayFav ? (100 - favPublicBias) : 50
  let awayTicketPct = 100 - homeTicketPct

  let homeHandlePct = homeTicketPct
  let awayHandlePct = awayTicketPct

  const sharpHomeShade = (sharpSpreadPoint != null && retailSpreadPoint != null)
    ? (sharpSpreadPoint - retailSpreadPoint)
    : 0

  if (isHomeFav) {
    const sharpShift = 15 + (seed % 14) + (sharpHomeShade > 0 ? 10 : 0)
    awayHandlePct = Math.min(awayTicketPct + sharpShift, 85)
    homeHandlePct = 100 - awayHandlePct
  } else if (isAwayFav) {
    const sharpShift = 15 + (seed % 14) + (sharpHomeShade < 0 ? 10 : 0)
    homeHandlePct = Math.min(homeTicketPct + sharpShift, 85)
    awayHandlePct = 100 - homeHandlePct
  }

  return summarizeSides(
    homeTeam,
    awayTeam,
    homeTicketPct,
    homeHandlePct,
    awayTicketPct,
    awayHandlePct,
    { isPasted: false, source: 'synthetic', sportKey: ev.sport_key },
  )
}

type SlateEventLike = {
  id?: string
  home_team?: string
  away_team?: string
}

/**
 * Load active pasted splits for a sport and map onto slate event ids.
 */
export async function loadPastedBettingSplitsForSlate(
  admin: SupabaseClient,
  sportKey: string,
  events: Array<SlateEventLike>,
): Promise<Map<string, BettingSplitSummary>> {
  const out = new Map<string, BettingSplitSummary>()
  if (!events.length) return out

  const eventIds = events.map((e) => String(e.id || '').trim()).filter(Boolean)
  const { data, error } = await admin
    .from('syndicate_betting_splits')
    .select('*')
    .eq('sport_key', sportKey)
    .eq('active', true)

  if (error) {
    console.warn('syndicate_betting_splits load:', error.message)
    return out
  }

  for (const row of data || []) {
    const summary = summaryFromPastedRow(row)
    const rowEventId = row.event_id != null ? String(row.event_id).trim() : ''
    if (rowEventId && eventIds.includes(rowEventId)) {
      out.set(rowEventId, summary)
      continue
    }
    for (const ev of events) {
      const id = String(ev.id || '').trim()
      if (!id || out.has(id)) continue
      if (
        teamsMatch(String(row.home_team || ''), String(ev.home_team || '')) &&
        teamsMatch(String(row.away_team || ''), String(ev.away_team || ''))
      ) {
        out.set(id, summary)
      }
    }
  }

  return out
}
