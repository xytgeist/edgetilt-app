/**
 * Betting Splits … ticket % (public) vs handle % (money).
 *
 * Real path: human paste from Action PRO / VSiN into syndicate_betting_splits.
 * Synthetic path: heuristic only for captions … never a Chedda vote reason.
 *
 * Labels:
 * - Fade the public / sharp split = tickets one way, money the other (or handle≥15 vs tickets).
 * - RLM = the spread moved against the ticket-heavy side (needs open → current). Never from splits alone.
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
  /** Tickets heavy one way, money the other. Not RLM. */
  isFadePublic: boolean
  /** True only when open→current spread walked against the public ticket side. */
  isRlm: boolean
  summaryLine: string
  /** True when sourced from syndicate_betting_splits paste (Action/VSiN/manual). */
  isPasted?: boolean
  source?: string | null
  /** Home spread open used for RLM (when known). */
  openSpreadHome?: number | null
  /** Home spread current used for RLM (when known). */
  currentSpreadHome?: number | null
}

const DIVERGENCE_MIN = 15
export const FADE_PUBLIC_TICKET_MIN = 65
export const FADE_PUBLIC_HANDLE_MIN = 55
/** Half-point minimum for open→current to count as reverse line movement. */
export const RLM_MIN_SPREAD_MOVE = 0.5

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

function fmtHomeSpread(n: number): string {
  if (!Number.isFinite(n)) return '?'
  if (n > 0) return `+${n}`
  return String(n)
}

function publicTicketSide(summary: Pick<BettingSplitSummary, 'homeTicketPct' | 'awayTicketPct'>): 'home' | 'away' | null {
  const home = Number(summary.homeTicketPct) || 0
  const away = Number(summary.awayTicketPct) || 0
  if (home >= 55 && home > away) return 'home'
  if (away >= 55 && away > home) return 'away'
  return null
}

function buildSplitSummaryLine(
  summary: Omit<BettingSplitSummary, 'summaryLine'>,
): string {
  const homeTeam = summary.homeTeam
  const awayTeam = summary.awayTeam
  if (summary.isRlm && summary.openSpreadHome != null && summary.currentSpreadHome != null) {
    const pub = publicTicketSide(summary)
    const publicName = pub === 'home'
      ? shortDisplayName(homeTeam)
      : pub === 'away'
        ? shortDisplayName(awayTeam)
        : 'public'
    const publicPct = pub === 'home'
      ? summary.homeTicketPct
      : pub === 'away'
        ? summary.awayTicketPct
        : Math.max(summary.homeTicketPct, summary.awayTicketPct)
    return `RLM · ${fmtHomeSpread(summary.openSpreadHome)}→${fmtHomeSpread(summary.currentSpreadHome)} against ${Math.round(publicPct)}% tickets on ${publicName}`
  }
  if (summary.isSharpDivergence && summary.sharpFavoredSide) {
    const sharpSideName = summary.sharpFavoredSide === 'home'
      ? shortDisplayName(homeTeam)
      : shortDisplayName(awayTeam)
    const fadeSideName = summary.sharpFavoredSide === 'home'
      ? shortDisplayName(awayTeam)
      : shortDisplayName(homeTeam)
    const sharpHandle = summary.sharpFavoredSide === 'home'
      ? summary.homeHandlePct
      : summary.awayHandlePct
    const publicTickets = summary.sharpFavoredSide === 'home'
      ? summary.awayTicketPct
      : summary.homeTicketPct
    if (summary.isFadePublic) {
      return `Fade public · ${Math.round(sharpHandle)}% money on ${sharpSideName} despite ${Math.round(publicTickets)}% tickets on ${fadeSideName}`
    }
    return `${Math.round(sharpHandle)}% handle on ${sharpSideName} (+${Math.round(summary.divergencePts)} vs tickets)`
  }
  if (summary.isPasted) {
    const homeShort = shortDisplayName(homeTeam)
    const awayShort = shortDisplayName(awayTeam)
    return `${homeShort} ${Math.round(summary.homeTicketPct)}% bets / ${Math.round(summary.homeHandlePct)}% money · ${awayShort} ${Math.round(summary.awayTicketPct)}% / ${Math.round(summary.awayHandlePct)}%`
  }
  return ''
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

  // Fade the public: tickets heavy one way, money the other. Not RLM.
  let isFadePublic = false
  if (homeTicketPct >= FADE_PUBLIC_TICKET_MIN && awayHandlePct >= FADE_PUBLIC_HANDLE_MIN) {
    isFadePublic = true
    if (!sharpFavoredSide) {
      sharpFavoredSide = 'away'
      divergencePts = Math.max(divergencePts, awayHandlePct - awayTicketPct)
    }
  }
  if (awayTicketPct >= FADE_PUBLIC_TICKET_MIN && homeHandlePct >= FADE_PUBLIC_HANDLE_MIN) {
    isFadePublic = true
    if (!sharpFavoredSide) {
      sharpFavoredSide = 'home'
      divergencePts = Math.max(divergencePts, homeHandlePct - homeTicketPct)
    }
  }

  const isSharpDivergence = divergencePts >= DIVERGENCE_MIN || isFadePublic
  const draft: Omit<BettingSplitSummary, 'summaryLine'> = {
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
    isFadePublic,
    isRlm: false,
    isPasted: opts?.isPasted === true,
    source: opts?.source || null,
    openSpreadHome: null,
    currentSpreadHome: null,
  }

  return {
    ...draft,
    summaryLine: buildSplitSummaryLine(draft),
  }
}

/**
 * Stamp real RLM when the spread walked against the ticket-heavy public side.
 * Open/current are home-team spread points (Odds API convention).
 */
export function applyReverseLineMovement(
  summary: BettingSplitSummary,
  openSpreadHome: number | null | undefined,
  currentSpreadHome: number | null | undefined,
  minMovePts = RLM_MIN_SPREAD_MOVE,
): BettingSplitSummary {
  const open = openSpreadHome != null && Number.isFinite(Number(openSpreadHome))
    ? Number(openSpreadHome)
    : null
  const current = currentSpreadHome != null && Number.isFinite(Number(currentSpreadHome))
    ? Number(currentSpreadHome)
    : null

  const base: BettingSplitSummary = {
    ...summary,
    isRlm: false,
    openSpreadHome: open,
    currentSpreadHome: current,
  }

  if (open == null || current == null) {
    return { ...base, summaryLine: buildSplitSummaryLine(base) }
  }

  const delta = current - open
  if (Math.abs(delta) < minMovePts) {
    return { ...base, summaryLine: buildSplitSummaryLine(base) }
  }

  const pub = publicTicketSide(summary)
  if (!pub) {
    return { ...base, summaryLine: buildSplitSummaryLine(base) }
  }

  // Home point up (e.g. -3 → -1.5) = against home tickets. Home point down = against away tickets.
  const againstPublic =
    (pub === 'home' && delta > 0) ||
    (pub === 'away' && delta < 0)

  if (!againstPublic) {
    return { ...base, summaryLine: buildSplitSummaryLine(base) }
  }

  const withRlm: BettingSplitSummary = {
    ...base,
    isRlm: true,
  }
  return {
    ...withRlm,
    summaryLine: buildSplitSummaryLine(withRlm),
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
    const key = String(b.key || '').toLowerCase()
    const sm = b.markets.find((m) => m.key === 'spreads')
    if (!sm) continue
    const homeOut = sm.outcomes?.find((o) => o.name === homeTeam)
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
  const awayTicketPct = 100 - homeTicketPct

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

export type PastedSplitsBoard = {
  /** Chedda vote … latest / strongest single board. */
  primaryByEventId: Map<string, BettingSplitSummary>
  /** Tank street collation … Action + VSiN + manual can all live. */
  allByEventId: Map<string, BettingSplitSummary[]>
}

function splitPrimaryRank(summary: BettingSplitSummary, createdAt: string | null): number {
  const src = String(summary.source || '').toLowerCase()
  const srcBoost = src.includes('vsin') || src.includes('action') ? 20 : src.includes('manual') ? 5 : 10
  const created = createdAt ? Date.parse(createdAt) : 0
  const recency = Number.isFinite(created) ? created / 1e13 : 0
  return (summary.isSharpDivergence ? 100 : 0) + Number(summary.divergencePts || 0) + srcBoost + recency
}

function pushSplitForEvent(
  board: PastedSplitsBoard,
  eventId: string,
  summary: BettingSplitSummary,
  createdAt: string | null,
  ranks: Map<string, number>,
) {
  if (!eventId) return
  const list = board.allByEventId.get(eventId) || []
  list.push(summary)
  board.allByEventId.set(eventId, list)
  const rank = splitPrimaryRank(summary, createdAt)
  const prev = ranks.get(eventId)
  if (prev == null || rank >= prev) {
    ranks.set(eventId, rank)
    board.primaryByEventId.set(eventId, summary)
  }
}

/**
 * Load active pasted splits for a sport and map onto slate event ids.
 * Keeps every source (Action + VSiN) so Tank can weight the street board.
 */
export async function loadPastedBettingSplitsBoardForSlate(
  admin: SupabaseClient,
  sportKey: string,
  events: Array<SlateEventLike>,
): Promise<PastedSplitsBoard> {
  const board: PastedSplitsBoard = {
    primaryByEventId: new Map(),
    allByEventId: new Map(),
  }
  if (!events.length) return board

  const eventIds = events.map((e) => String(e.id || '').trim()).filter(Boolean)
  const ranks = new Map<string, number>()
  const { data, error } = await admin
    .from('syndicate_betting_splits')
    .select('*')
    .eq('sport_key', sportKey)
    .eq('active', true)

  if (error) {
    console.warn('syndicate_betting_splits load:', error.message)
    return board
  }

  for (const row of data || []) {
    const summary = summaryFromPastedRow(row)
    const createdAt = row.created_at != null ? String(row.created_at) : row.updated_at != null ? String(row.updated_at) : null
    const rowEventId = row.event_id != null ? String(row.event_id).trim() : ''
    if (rowEventId && eventIds.includes(rowEventId)) {
      pushSplitForEvent(board, rowEventId, summary, createdAt, ranks)
      continue
    }
    for (const ev of events) {
      const id = String(ev.id || '').trim()
      if (!id) continue
      if (
        teamsMatch(String(row.home_team || ''), String(ev.home_team || '')) &&
        teamsMatch(String(row.away_team || ''), String(ev.away_team || ''))
      ) {
        pushSplitForEvent(board, id, summary, createdAt, ranks)
      }
    }
  }

  return board
}

export async function loadPastedBettingSplitsForSlate(
  admin: SupabaseClient,
  sportKey: string,
  events: Array<SlateEventLike>,
): Promise<Map<string, BettingSplitSummary>> {
  const board = await loadPastedBettingSplitsBoardForSlate(admin, sportKey, events)
  return board.primaryByEventId
}
