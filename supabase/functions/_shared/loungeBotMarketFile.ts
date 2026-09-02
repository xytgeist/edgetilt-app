/**
 * Syndicate market file — durable open / current / close lines per Odds API event.
 * Auto-updated from lounge-odds-poll. Prefer sharp books; fall back to consensus median.
 */
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2'
import {
  DEFAULT_ODDS_WINDOW_HOURS,
  filterOddsEventsByWindow,
  filterOddsEventsForNextFootballSlate,
  type OddsEvent,
} from './loungeBotOddsCaption.ts'

/** Lock close once kickoff is within this window (or already started). */
export const MARKET_FILE_CLOSE_LOCK_BEFORE_MS = 5 * 60 * 1000
/** Keep recently tipped games in the update set so close can lock. */
export const MARKET_FILE_RECENT_STARTED_MS = 6 * 60 * 60 * 1000

const SHARP_BOOK_KEYS = ['pinnacle', 'circa', 'lowvig', 'betonlineag'] as const

type OutcomeLike = { name?: string; price?: number; point?: number }
type MarketLike = { key?: string; outcomes?: OutcomeLike[] }
type BookLike = { key?: string; title?: string; markets?: MarketLike[] }

export type MarketFileQuote = {
  spreadHome: number | null
  spreadHomePrice: number | null
  spreadAwayPrice: number | null
  spreadSource: string | null
  total: number | null
  overPrice: number | null
  underPrice: number | null
  totalSource: string | null
}

export type MarketFileRow = {
  event_id: string
  sport_key: string
  home_team: string
  away_team: string
  commence_time: string
  open_spread_home: number | null
  open_spread_home_price: number | null
  open_spread_away_price: number | null
  open_spread_at: string | null
  open_spread_source: string | null
  current_spread_home: number | null
  current_spread_home_price: number | null
  current_spread_away_price: number | null
  current_spread_at: string | null
  current_spread_source: string | null
  close_spread_home: number | null
  close_spread_home_price: number | null
  close_spread_away_price: number | null
  close_spread_at: string | null
  close_spread_source: string | null
  close_locked: boolean
  open_total: number | null
  open_over_price: number | null
  open_under_price: number | null
  open_total_at: string | null
  open_total_source: string | null
  current_total: number | null
  current_over_price: number | null
  current_under_price: number | null
  current_total_at: string | null
  current_total_source: string | null
  close_total: number | null
  close_over_price: number | null
  close_under_price: number | null
  close_total_at: string | null
  close_total_source: string | null
  updated_at: string
}

function median(nums: number[]): number | null {
  const sorted = nums.filter((n) => Number.isFinite(n)).sort((a, b) => a - b)
  if (!sorted.length) return null
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0
    ? (sorted[mid - 1]! + sorted[mid]!) / 2
    : sorted[mid]!
}

function roundHalf(n: number): number {
  return Math.round(n * 2) / 2
}

function isFootballSportKey(sportKey: string): boolean {
  const k = sportKey.toLowerCase()
  return k.includes('ncaaf') || k.includes('nfl') || k.startsWith('americanfootball_')
}

/** Events the poll should refresh into the market file. */
export function eventsForMarketFile(sportKey: string, raw: OddsEvent[]): OddsEvent[] {
  const upcoming = isFootballSportKey(sportKey)
    ? filterOddsEventsForNextFootballSlate(raw)
    : filterOddsEventsByWindow(raw, DEFAULT_ODDS_WINDOW_HOURS)

  const now = Date.now()
  const recentlyStarted = raw.filter((ev) => {
    const t = Date.parse(String(ev.commence_time || ''))
    return Number.isFinite(t) && t <= now && t >= now - MARKET_FILE_RECENT_STARTED_MS
  })

  const byId = new Map<string, OddsEvent>()
  for (const ev of [...upcoming, ...recentlyStarted]) {
    const id = String(ev.id || '').trim()
    if (id) byId.set(id, ev)
  }
  return [...byId.values()]
}

function bookMarket(book: BookLike, marketKey: string): MarketLike | null {
  return (book.markets || []).find((m) => m.key === marketKey) || null
}

function outcomeFor(
  market: MarketLike | null,
  name: string,
): { price: number; point: number | null } | null {
  if (!market) return null
  const out = (market.outcomes || []).find((o) => String(o.name || '').trim() === name)
  if (!out) return null
  const price = Number(out.price)
  if (!Number.isFinite(price)) return null
  const point = out.point != null ? Number(out.point) : null
  return {
    price,
    point: point != null && Number.isFinite(point) ? point : null,
  }
}

function extractSharpQuote(
  books: BookLike[],
  home: string,
  away: string,
): MarketFileQuote | null {
  for (const want of SHARP_BOOK_KEYS) {
    const book = books.find((b) => String(b.key || '').toLowerCase() === want)
    if (!book) continue
    const spreads = bookMarket(book, 'spreads')
    const totals = bookMarket(book, 'totals')
    const homeOut = outcomeFor(spreads, home)
    const awayOut = outcomeFor(spreads, away)
    const overOut = outcomeFor(totals, 'Over')
    const underOut = outcomeFor(totals, 'Under')

    const hasSpread = homeOut?.point != null && awayOut != null
    const hasTotal = overOut?.point != null && underOut != null
    if (!hasSpread && !hasTotal) continue

    return {
      spreadHome: hasSpread ? roundHalf(homeOut!.point!) : null,
      spreadHomePrice: hasSpread ? homeOut!.price : null,
      spreadAwayPrice: hasSpread ? awayOut!.price : null,
      spreadSource: hasSpread ? want : null,
      total: hasTotal ? roundHalf(overOut!.point!) : null,
      overPrice: hasTotal ? overOut!.price : null,
      underPrice: hasTotal ? underOut!.price : null,
      totalSource: hasTotal ? want : null,
    }
  }
  return null
}

function extractConsensusQuote(
  books: BookLike[],
  home: string,
  away: string,
): MarketFileQuote {
  const homePts: number[] = []
  const homePrices: number[] = []
  const awayPrices: number[] = []
  const totals: number[] = []
  const overPrices: number[] = []
  const underPrices: number[] = []

  for (const book of books) {
    const spreads = bookMarket(book, 'spreads')
    const totalsM = bookMarket(book, 'totals')
    const homeOut = outcomeFor(spreads, home)
    const awayOut = outcomeFor(spreads, away)
    const overOut = outcomeFor(totalsM, 'Over')
    const underOut = outcomeFor(totalsM, 'Under')
    if (homeOut?.point != null) {
      homePts.push(homeOut.point)
      homePrices.push(homeOut.price)
    }
    if (awayOut) awayPrices.push(awayOut.price)
    if (overOut?.point != null) {
      totals.push(overOut.point)
      overPrices.push(overOut.price)
    }
    if (underOut) underPrices.push(underOut.price)
  }

  const spreadHome = median(homePts)
  const total = median(totals)
  return {
    spreadHome: spreadHome != null ? roundHalf(spreadHome) : null,
    spreadHomePrice: median(homePrices),
    spreadAwayPrice: median(awayPrices),
    spreadSource: spreadHome != null ? 'consensus' : null,
    total: total != null ? roundHalf(total) : null,
    overPrice: median(overPrices),
    underPrice: median(underPrices),
    totalSource: total != null ? 'consensus' : null,
  }
}

/** Prefer pinnacle/circa/lowvig; else multi-book consensus median. */
export function extractMarketFileQuote(event: OddsEvent): MarketFileQuote | null {
  const home = String(event.home_team || '').trim()
  const away = String(event.away_team || '').trim()
  if (!home || !away) return null
  const books = (event.bookmakers || []) as BookLike[]
  if (!books.length) return null

  const sharp = extractSharpQuote(books, home, away)
  const consensus = extractConsensusQuote(books, home, away)

  if (!sharp) {
    if (consensus.spreadHome == null && consensus.total == null) return null
    return consensus
  }

  return {
    spreadHome: sharp.spreadHome ?? consensus.spreadHome,
    spreadHomePrice: sharp.spreadHomePrice ?? consensus.spreadHomePrice,
    spreadAwayPrice: sharp.spreadAwayPrice ?? consensus.spreadAwayPrice,
    spreadSource: sharp.spreadSource ?? consensus.spreadSource,
    total: sharp.total ?? consensus.total,
    overPrice: sharp.overPrice ?? consensus.overPrice,
    underPrice: sharp.underPrice ?? consensus.underPrice,
    totalSource: sharp.totalSource ?? consensus.totalSource,
  }
}

function shouldLockClose(commenceTimeIso: string, nowMs = Date.now()): boolean {
  const t = Date.parse(commenceTimeIso)
  if (!Number.isFinite(t)) return false
  return nowMs >= t - MARKET_FILE_CLOSE_LOCK_BEFORE_MS
}

function intOrNull(n: number | null | undefined): number | null {
  if (n == null || !Number.isFinite(n)) return null
  return Math.round(n)
}

export function mergeMarketFileRow(args: {
  existing: MarketFileRow | null
  sportKey: string
  event: OddsEvent
  quote: MarketFileQuote
  nowIso?: string
}): MarketFileRow | null {
  const eventId = String(args.event.id || '').trim()
  const home = String(args.event.home_team || '').trim()
  const away = String(args.event.away_team || '').trim()
  const commence = String(args.event.commence_time || '').trim()
  if (!eventId || !home || !away || !commence) return null

  const nowIso = args.nowIso || new Date().toISOString()
  const prev = args.existing
  const locked = prev?.close_locked === true

  const openSpreadHome = prev?.open_spread_home ?? args.quote.spreadHome
  const openSpreadHomePrice = prev?.open_spread_home_price ?? intOrNull(args.quote.spreadHomePrice)
  const openSpreadAwayPrice = prev?.open_spread_away_price ?? intOrNull(args.quote.spreadAwayPrice)
  const openSpreadAt = prev?.open_spread_at ?? (args.quote.spreadHome != null ? nowIso : null)
  const openSpreadSource = prev?.open_spread_source ?? args.quote.spreadSource

  const openTotal = prev?.open_total ?? args.quote.total
  const openOverPrice = prev?.open_over_price ?? intOrNull(args.quote.overPrice)
  const openUnderPrice = prev?.open_under_price ?? intOrNull(args.quote.underPrice)
  const openTotalAt = prev?.open_total_at ?? (args.quote.total != null ? nowIso : null)
  const openTotalSource = prev?.open_total_source ?? args.quote.totalSource

  let currentSpreadHome = args.quote.spreadHome ?? prev?.current_spread_home ?? null
  let currentSpreadHomePrice = intOrNull(args.quote.spreadHomePrice) ?? prev?.current_spread_home_price ?? null
  let currentSpreadAwayPrice = intOrNull(args.quote.spreadAwayPrice) ?? prev?.current_spread_away_price ?? null
  let currentSpreadAt = args.quote.spreadHome != null ? nowIso : prev?.current_spread_at ?? null
  let currentSpreadSource = args.quote.spreadSource ?? prev?.current_spread_source ?? null

  let currentTotal = args.quote.total ?? prev?.current_total ?? null
  let currentOverPrice = intOrNull(args.quote.overPrice) ?? prev?.current_over_price ?? null
  let currentUnderPrice = intOrNull(args.quote.underPrice) ?? prev?.current_under_price ?? null
  let currentTotalAt = args.quote.total != null ? nowIso : prev?.current_total_at ?? null
  let currentTotalSource = args.quote.totalSource ?? prev?.current_total_source ?? null

  // Once locked, freeze current as the last pre-lock quote for grading clarity.
  if (locked) {
    currentSpreadHome = prev?.current_spread_home ?? currentSpreadHome
    currentSpreadHomePrice = prev?.current_spread_home_price ?? currentSpreadHomePrice
    currentSpreadAwayPrice = prev?.current_spread_away_price ?? currentSpreadAwayPrice
    currentSpreadAt = prev?.current_spread_at ?? currentSpreadAt
    currentSpreadSource = prev?.current_spread_source ?? currentSpreadSource
    currentTotal = prev?.current_total ?? currentTotal
    currentOverPrice = prev?.current_over_price ?? currentOverPrice
    currentUnderPrice = prev?.current_under_price ?? currentUnderPrice
    currentTotalAt = prev?.current_total_at ?? currentTotalAt
    currentTotalSource = prev?.current_total_source ?? currentTotalSource
  }

  let closeSpreadHome = prev?.close_spread_home ?? null
  let closeSpreadHomePrice = prev?.close_spread_home_price ?? null
  let closeSpreadAwayPrice = prev?.close_spread_away_price ?? null
  let closeSpreadAt = prev?.close_spread_at ?? null
  let closeSpreadSource = prev?.close_spread_source ?? null
  let closeTotal = prev?.close_total ?? null
  let closeOverPrice = prev?.close_over_price ?? null
  let closeUnderPrice = prev?.close_under_price ?? null
  let closeTotalAt = prev?.close_total_at ?? null
  let closeTotalSource = prev?.close_total_source ?? null
  let closeLocked = locked

  if (!closeLocked && shouldLockClose(commence)) {
    closeLocked = true
    closeSpreadHome = currentSpreadHome
    closeSpreadHomePrice = currentSpreadHomePrice
    closeSpreadAwayPrice = currentSpreadAwayPrice
    closeSpreadAt = currentSpreadAt || nowIso
    closeSpreadSource = currentSpreadSource
    closeTotal = currentTotal
    closeOverPrice = currentOverPrice
    closeUnderPrice = currentUnderPrice
    closeTotalAt = currentTotalAt || nowIso
    closeTotalSource = currentTotalSource
  }

  return {
    event_id: eventId,
    sport_key: args.sportKey,
    home_team: home,
    away_team: away,
    commence_time: commence,
    open_spread_home: openSpreadHome,
    open_spread_home_price: openSpreadHomePrice,
    open_spread_away_price: openSpreadAwayPrice,
    open_spread_at: openSpreadAt,
    open_spread_source: openSpreadSource,
    current_spread_home: currentSpreadHome,
    current_spread_home_price: currentSpreadHomePrice,
    current_spread_away_price: currentSpreadAwayPrice,
    current_spread_at: currentSpreadAt,
    current_spread_source: currentSpreadSource,
    close_spread_home: closeSpreadHome,
    close_spread_home_price: closeSpreadHomePrice,
    close_spread_away_price: closeSpreadAwayPrice,
    close_spread_at: closeSpreadAt,
    close_spread_source: closeSpreadSource,
    close_locked: closeLocked,
    open_total: openTotal,
    open_over_price: openOverPrice,
    open_under_price: openUnderPrice,
    open_total_at: openTotalAt,
    open_total_source: openTotalSource,
    current_total: currentTotal,
    current_over_price: currentOverPrice,
    current_under_price: currentUnderPrice,
    current_total_at: currentTotalAt,
    current_total_source: currentTotalSource,
    close_total: closeTotal,
    close_over_price: closeOverPrice,
    close_under_price: closeUnderPrice,
    close_total_at: closeTotalAt,
    close_total_source: closeTotalSource,
    updated_at: nowIso,
  }
}

function rowFromDb(row: Record<string, unknown>): MarketFileRow {
  return {
    event_id: String(row.event_id),
    sport_key: String(row.sport_key),
    home_team: String(row.home_team),
    away_team: String(row.away_team),
    commence_time: String(row.commence_time),
    open_spread_home: row.open_spread_home != null ? Number(row.open_spread_home) : null,
    open_spread_home_price: row.open_spread_home_price != null ? Number(row.open_spread_home_price) : null,
    open_spread_away_price: row.open_spread_away_price != null ? Number(row.open_spread_away_price) : null,
    open_spread_at: row.open_spread_at != null ? String(row.open_spread_at) : null,
    open_spread_source: row.open_spread_source != null ? String(row.open_spread_source) : null,
    current_spread_home: row.current_spread_home != null ? Number(row.current_spread_home) : null,
    current_spread_home_price: row.current_spread_home_price != null ? Number(row.current_spread_home_price) : null,
    current_spread_away_price: row.current_spread_away_price != null ? Number(row.current_spread_away_price) : null,
    current_spread_at: row.current_spread_at != null ? String(row.current_spread_at) : null,
    current_spread_source: row.current_spread_source != null ? String(row.current_spread_source) : null,
    close_spread_home: row.close_spread_home != null ? Number(row.close_spread_home) : null,
    close_spread_home_price: row.close_spread_home_price != null ? Number(row.close_spread_home_price) : null,
    close_spread_away_price: row.close_spread_away_price != null ? Number(row.close_spread_away_price) : null,
    close_spread_at: row.close_spread_at != null ? String(row.close_spread_at) : null,
    close_spread_source: row.close_spread_source != null ? String(row.close_spread_source) : null,
    close_locked: row.close_locked === true,
    open_total: row.open_total != null ? Number(row.open_total) : null,
    open_over_price: row.open_over_price != null ? Number(row.open_over_price) : null,
    open_under_price: row.open_under_price != null ? Number(row.open_under_price) : null,
    open_total_at: row.open_total_at != null ? String(row.open_total_at) : null,
    open_total_source: row.open_total_source != null ? String(row.open_total_source) : null,
    current_total: row.current_total != null ? Number(row.current_total) : null,
    current_over_price: row.current_over_price != null ? Number(row.current_over_price) : null,
    current_under_price: row.current_under_price != null ? Number(row.current_under_price) : null,
    current_total_at: row.current_total_at != null ? String(row.current_total_at) : null,
    current_total_source: row.current_total_source != null ? String(row.current_total_source) : null,
    close_total: row.close_total != null ? Number(row.close_total) : null,
    close_over_price: row.close_over_price != null ? Number(row.close_over_price) : null,
    close_under_price: row.close_under_price != null ? Number(row.close_under_price) : null,
    close_total_at: row.close_total_at != null ? String(row.close_total_at) : null,
    close_total_source: row.close_total_source != null ? String(row.close_total_source) : null,
    updated_at: String(row.updated_at || ''),
  }
}

/**
 * Upsert open/current/close for events in this poll.
 * Safe no-op when dryRun or no usable quotes.
 */
export async function upsertMarketFilesFromEvents(
  admin: SupabaseClient,
  sportKey: string,
  events: OddsEvent[],
  opts: { dryRun?: boolean } = {},
): Promise<{ upserted: number; locked: number }> {
  if (opts.dryRun || !events.length) return { upserted: 0, locked: 0 }

  const eventIds = events.map((ev) => String(ev.id || '').trim()).filter(Boolean)
  if (!eventIds.length) return { upserted: 0, locked: 0 }

  const { data: existingRows, error: loadErr } = await admin
    .from('lounge_market_files')
    .select('*')
    .in('event_id', eventIds)

  if (loadErr) throw new Error(`lounge_market_files load: ${loadErr.message}`)

  const existingById = new Map<string, MarketFileRow>()
  for (const row of existingRows || []) {
    const parsed = rowFromDb(row as Record<string, unknown>)
    existingById.set(parsed.event_id, parsed)
  }

  const nowIso = new Date().toISOString()
  const rows: MarketFileRow[] = []
  let locked = 0

  for (const event of events) {
    const quote = extractMarketFileQuote(event)
    if (!quote) continue
    if (quote.spreadHome == null && quote.total == null) continue
    const merged = mergeMarketFileRow({
      existing: existingById.get(String(event.id || '').trim()) || null,
      sportKey,
      event,
      quote,
      nowIso,
    })
    if (!merged) continue
    if (merged.close_locked) locked += 1
    rows.push(merged)
  }

  if (!rows.length) return { upserted: 0, locked: 0 }

  const { error } = await admin.from('lounge_market_files').upsert(rows, { onConflict: 'event_id' })
  if (error) throw new Error(`lounge_market_files upsert: ${error.message}`)

  return { upserted: rows.length, locked }
}

export async function loadMarketFilesByEventIds(
  admin: SupabaseClient,
  eventIds: string[],
): Promise<Map<string, MarketFileRow>> {
  const out = new Map<string, MarketFileRow>()
  if (!eventIds.length) return out
  const { data, error } = await admin.from('lounge_market_files').select('*').in('event_id', eventIds)
  if (error) throw new Error(`lounge_market_files load: ${error.message}`)
  for (const row of data || []) {
    const parsed = rowFromDb(row as Record<string, unknown>)
    out.set(parsed.event_id, parsed)
  }
  return out
}
