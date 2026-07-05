/**
 * Line movement detection for Scott Sharpe — compare poll snapshots vs stored lines.
 */
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2'
import {
  formatAmericanOdds,
  formatBookDisplayName,
  formatOddsCommenceTimeShort,
  type OddsEvent,
} from './loungeBotOddsCaption.ts'

export type LineMovementKind = 'sharp_move' | 'steam' | 'line_movement' | 'rlm'

function ptTodayDate(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Los_Angeles',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date())
}

export type EventLineRow = {
  eventId: string
  sportKey: string
  homeTeam: string
  awayTeam: string
  commenceTime: string
  marketKey: 'h2h' | 'spreads' | 'totals'
  outcomeName: string
  linePoint: number | null
  consensusPrice: number
  bestPrice: number
  bestBookKey: string
  bestBookTitle: string
  capturedAt?: string
}

/** Poll interval is 15 min — only compare when prior snapshot is in this window. */
export const SNAPSHOT_COMPARE_MIN_MS = 8 * 60 * 1000
export const SNAPSHOT_COMPARE_MAX_MS = 22 * 60 * 1000

export type LineMovementAlert = {
  kind: LineMovementKind
  eventId: string
  sportKey: string
  homeTeam: string
  awayTeam: string
  commenceTime: string
  marketKey: 'h2h' | 'spreads' | 'totals'
  outcomeName: string
  oldPoint: number | null
  newPoint: number | null
  oldPrice: number
  newPrice: number
  pointDelta: number
  priceDelta: number
  leadingBooks: string[]
  meaning: string
}

export type LineMovementConfig = {
  minSpreadMovePts: number
  minTotalMovePts: number
  minMlMovePts: number
}

const ALERT_HEADERS: Record<LineMovementKind, string> = {
  sharp_move: '🔥 Sharp Move Alert',
  steam: '🔥 Steam Coming In',
  rlm: '📈 Reverse Line Movement',
  line_movement: '📈 Line Movement',
}

function median(nums: number[]): number | null {
  const sorted = nums.filter((n) => Number.isFinite(n)).sort((a, b) => a - b)
  if (!sorted.length) return null
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0
    ? (sorted[mid - 1]! + sorted[mid]!) / 2
    : sorted[mid]!
}

function roundPoint(n: number): number {
  return Math.round(n * 2) / 2
}

function shortName(name: string): string {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean)
  return parts.length <= 1 ? (parts[0] || '') : parts[parts.length - 1]!
}

function formatSpreadLine(point: number, price: number): string {
  const pt = point > 0 ? `+${point}` : String(point)
  const juice = formatAmericanOdds(price)
  return juice ? `${pt} (${juice})` : pt
}

function formatMarketMoveLabel(
  marketKey: string,
  outcomeName: string,
  oldPoint: number | null,
  newPoint: number | null,
  oldPrice: number,
  newPrice: number,
): string {
  const label = shortName(outcomeName)
  if (marketKey === 'spreads') {
    const from = oldPoint != null ? formatSpreadLine(oldPoint, oldPrice) : formatAmericanOdds(oldPrice)
    const to = newPoint != null ? formatSpreadLine(newPoint, newPrice) : formatAmericanOdds(newPrice)
    return `${label} spread ${from} → ${to}`
  }
  if (marketKey === 'totals') {
    const fromPt = oldPoint != null ? String(oldPoint) : '?'
    const toPt = newPoint != null ? String(newPoint) : '?'
    return `${label} ${fromPt} → ${toPt} (${formatAmericanOdds(oldPrice)} → ${formatAmericanOdds(newPrice)})`
  }
  return `${label} ML ${formatAmericanOdds(oldPrice)} → ${formatAmericanOdds(newPrice)}`
}

/** Extract consensus + best line per market/outcome for one event. */
export function extractEventLines(event: OddsEvent, sportKey: string): EventLineRow[] {
  const home = String(event.home_team || '').trim()
  const away = String(event.away_team || '').trim()
  const commenceTime = String(event.commence_time || '').trim()
  const eventId = String(event.id || `${home}-${away}-${commenceTime}`).trim()
  if (!home || !away || !commenceTime || !eventId) return []

  const rows: EventLineRow[] = []

  for (const marketKey of ['h2h', 'spreads', 'totals'] as const) {
    const pointsByOutcome = new Map<string, number[]>()
    const pricesByOutcome = new Map<string, number[]>()
    const bestByOutcome = new Map<string, { price: number; bookKey: string; bookTitle: string }>()

    for (const book of event.bookmakers || []) {
      const market = (book.markets || []).find((m) => m.key === marketKey)
      if (!market) continue
      const bookKey = String(book.key || '').trim()
      const bookTitle = formatBookDisplayName(String(book.title || ''), book.key)

      for (const out of market.outcomes || []) {
        const name = String(out.name || '').trim()
        const price = Number(out.price)
        const point = out.point != null ? Number(out.point) : null
        if (!name || !Number.isFinite(price)) continue

        if (!pricesByOutcome.has(name)) pricesByOutcome.set(name, [])
        pricesByOutcome.get(name)!.push(price)

        if (point != null && Number.isFinite(point)) {
          if (!pointsByOutcome.has(name)) pointsByOutcome.set(name, [])
          pointsByOutcome.get(name)!.push(point)
        }

        const cur = bestByOutcome.get(name)
        if (!cur || price > cur.price) {
          bestByOutcome.set(name, { price, bookKey, bookTitle })
        }
      }
    }

    for (const [outcomeName, prices] of pricesByOutcome) {
      const consensusPrice = median(prices)
      const best = bestByOutcome.get(outcomeName)
      if (consensusPrice == null || !best) continue

      const pts = pointsByOutcome.get(outcomeName) || []
      const consensusPoint = pts.length ? median(pts) : null

      rows.push({
        eventId,
        sportKey,
        homeTeam: home,
        awayTeam: away,
        commenceTime,
        marketKey,
        outcomeName,
        linePoint: consensusPoint != null ? roundPoint(consensusPoint) : null,
        consensusPrice: Math.round(consensusPrice),
        bestPrice: best.price,
        bestBookKey: best.bookKey,
        bestBookTitle: best.bookTitle,
      })
    }
  }

  return rows
}

function booksLeadingMove(
  event: OddsEvent,
  marketKey: string,
  outcomeName: string,
  direction: 'point_up' | 'point_down' | 'price_up' | 'price_down',
): string[] {
  const books: { title: string; score: number }[] = []

  for (const book of event.bookmakers || []) {
    const market = (book.markets || []).find((m) => m.key === marketKey)
    if (!market) continue
    const out = (market.outcomes || []).find((o) => String(o.name || '').trim() === outcomeName)
    if (!out) continue
    const price = Number(out.price)
    const point = out.point != null ? Number(out.point) : null
    const title = formatBookDisplayName(String(book.title || ''), book.key)
    let score = 0
    if (direction === 'price_up') score = price
    if (direction === 'price_down') score = -price
    if (direction === 'point_up' && point != null) score = point
    if (direction === 'point_down' && point != null) score = -point
    books.push({ title, score })
  }

  books.sort((a, b) => b.score - a.score)
  const top = books.slice(0, 3).map((b) => b.title)
  return [...new Set(top)].slice(0, 3)
}

function classifyMovement(
  marketKey: string,
  pointDelta: number,
  priceDelta: number,
  cfg: LineMovementConfig,
  pairedMlDelta?: number,
): LineMovementKind {
  const absPoint = Math.abs(pointDelta)
  const absPrice = Math.abs(priceDelta)

  if (marketKey === 'spreads' || marketKey === 'totals') {
    if (pairedMlDelta != null && Math.sign(pointDelta) !== 0 && Math.sign(pairedMlDelta) !== 0
      && Math.sign(pointDelta) !== Math.sign(pairedMlDelta)) {
      return 'rlm'
    }
    const minMove = marketKey === 'totals' ? cfg.minTotalMovePts : cfg.minSpreadMovePts
    if (absPoint >= 1) return 'sharp_move'
    if (absPoint >= minMove) return 'steam'
    return 'line_movement'
  }

  if (absPrice >= 35) return 'sharp_move'
  if (absPrice >= Math.max(cfg.minMlMovePts, 25)) return 'steam'
  return 'line_movement'
}

function movementMeaning(kind: LineMovementKind, marketKey: string, outcomeName: string, priceDelta: number): string {
  const label = shortName(outcomeName)
  if (kind === 'rlm') {
    return `Line moved toward ${label} while moneyline odds moved the other way ... classic reverse line movement (sharp money signal).`
  }
  if (kind === 'sharp_move' || kind === 'steam') {
    if (marketKey === 'spreads') {
      return priceDelta < 0
        ? `Steam shortening juice on ${label} ... books adjusting fast.`
        : `Sharp action shifting the ${label} spread.`
    }
    if (marketKey === 'totals') {
      return `Steam moving the ${label.toLowerCase()} total.`
    }
    return priceDelta > 0
      ? `${label} odds lengthening ... value opening on the dog side.`
      : `${label} ML shortening ... money coming in.`
  }
  return `Notable line shift on ${label} across books.`
}

export function detectLineMovements(
  events: OddsEvent[],
  sportKey: string,
  previous: EventLineRow[],
  cfg: LineMovementConfig,
): LineMovementAlert[] {
  const prevByKey = new Map(
    previous.map((r) => [`${r.eventId}:${r.marketKey}:${r.outcomeName}`, r]),
  )
  const current = events.flatMap((ev) => extractEventLines(ev, sportKey))
  const eventById = new Map(events.map((ev) => [String(ev.id || ''), ev]))
  const alerts: LineMovementAlert[] = []

  const mlDeltasByEvent = new Map<string, Map<string, number>>()

  for (const row of current) {
    const key = `${row.eventId}:${row.marketKey}:${row.outcomeName}`
    const prev = prevByKey.get(key)
    if (!prev) continue

    const priceDelta = row.consensusPrice - prev.consensusPrice
    const pointDelta = (row.linePoint ?? 0) - (prev.linePoint ?? 0)

    if (row.marketKey === 'h2h' && Math.abs(priceDelta) < cfg.minMlMovePts) continue
    if (row.marketKey === 'spreads' && Math.abs(pointDelta) < cfg.minSpreadMovePts) continue
    if (row.marketKey === 'totals' && Math.abs(pointDelta) < cfg.minTotalMovePts) continue

    if (row.marketKey === 'h2h') {
      if (!mlDeltasByEvent.has(row.eventId)) mlDeltasByEvent.set(row.eventId, new Map())
      mlDeltasByEvent.get(row.eventId)!.set(row.outcomeName, priceDelta)
    }
  }

  for (const row of current) {
    const key = `${row.eventId}:${row.marketKey}:${row.outcomeName}`
    const prev = prevByKey.get(key)
    if (!prev) continue

    const priceDelta = row.consensusPrice - prev.consensusPrice
    const pointDelta = row.linePoint != null && prev.linePoint != null
      ? row.linePoint - prev.linePoint
      : 0

    if (row.marketKey === 'h2h' && Math.abs(priceDelta) < cfg.minMlMovePts) continue
    if (row.marketKey === 'spreads' && Math.abs(pointDelta) < cfg.minSpreadMovePts) continue
    if (row.marketKey === 'totals' && Math.abs(pointDelta) < cfg.minTotalMovePts) continue

    let pairedMlDelta: number | undefined
    if (row.marketKey === 'spreads') {
      const mlMap = mlDeltasByEvent.get(row.eventId)
      pairedMlDelta = mlMap?.get(row.outcomeName)
    }

    const kind = classifyMovement(row.marketKey, pointDelta, priceDelta, cfg, pairedMlDelta)
    const ev = eventById.get(row.eventId)
    const direction = row.marketKey === 'h2h'
      ? (priceDelta >= 0 ? 'price_up' : 'price_down')
      : (pointDelta >= 0 ? 'point_up' : 'point_down')
    const leadingBooks = ev
      ? booksLeadingMove(ev, row.marketKey, row.outcomeName, direction)
      : [row.bestBookTitle].filter(Boolean)

    alerts.push({
      kind,
      eventId: row.eventId,
      sportKey: row.sportKey,
      homeTeam: row.homeTeam,
      awayTeam: row.awayTeam,
      commenceTime: row.commenceTime,
      marketKey: row.marketKey,
      outcomeName: row.outcomeName,
      oldPoint: prev.linePoint,
      newPoint: row.linePoint,
      oldPrice: prev.consensusPrice,
      newPrice: row.consensusPrice,
      pointDelta,
      priceDelta,
      leadingBooks,
      meaning: movementMeaning(kind, row.marketKey, row.outcomeName, priceDelta),
    })
  }

  alerts.sort((a, b) => {
    const score = (x: LineMovementAlert) =>
      Math.abs(x.pointDelta) * 10 + Math.abs(x.priceDelta)
    return score(b) - score(a)
  })

  return alerts
}

export function lineMovementDedupeKey(alert: LineMovementAlert, ptDate = ptTodayDate()): string {
  const dir = alert.marketKey === 'h2h'
    ? (alert.priceDelta >= 0 ? 'up' : 'down')
    : (alert.pointDelta >= 0 ? 'up' : 'down')
  return `line:${alert.kind}:${alert.eventId}:${alert.marketKey}:${alert.outcomeName}:${dir}:${ptDate}`
}

export function buildLineMovementCaption(
  alert: LineMovementAlert,
  opts?: { categoryLabel?: string },
): string {
  const away = shortName(alert.awayTeam)
  const home = shortName(alert.homeTeam)
  const when = formatOddsCommenceTimeShort(alert.commenceTime)
  const event = opts?.categoryLabel?.trim()
  const head = event
    ? `${event}: ${away} vs ${home} (${when})`
    : `${away} vs ${home} (${when})`

  const moveLine = formatMarketMoveLabel(
    alert.marketKey,
    alert.outcomeName,
    alert.oldPoint,
    alert.newPoint,
    alert.oldPrice,
    alert.newPrice,
  )
  const books = alert.leadingBooks.length
    ? alert.leadingBooks.join(', ')
    : 'multiple books'

  const ts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Los_Angeles',
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short',
  }).format(new Date())

  const header = ALERT_HEADERS[alert.kind]

  return [
    header,
    head,
    '',
    moveLine,
    `Books leading move: ${books}`,
    alert.meaning,
    '',
    `Updated ${ts}`,
  ].join('\n')
}

export async function loadStoredEventLines(
  admin: SupabaseClient,
  botUserId: string,
  eventIds: string[],
): Promise<{ lines: EventLineRow[]; snapshotAgeMs: number | null }> {
  if (!eventIds.length) return { lines: [], snapshotAgeMs: null }
  const { data, error } = await admin
    .from('lounge_odds_event_lines')
    .select('*')
    .eq('bot_user_id', botUserId)
    .in('event_id', eventIds)

  if (error) throw new Error(error.message)

  const rows = data || []
  let oldestMs: number | null = null
  const now = Date.now()

  const lines = rows.map((row) => {
    const capturedAt = String(row.updated_at || '')
    const t = Date.parse(capturedAt)
    if (Number.isFinite(t)) {
      const age = now - t
      if (oldestMs == null || age > oldestMs) oldestMs = age
    }
    return {
      eventId: String(row.event_id),
      sportKey: String(row.sport_key),
      homeTeam: '',
      awayTeam: '',
      commenceTime: '',
      marketKey: row.market_key as EventLineRow['marketKey'],
      outcomeName: String(row.outcome_name),
      linePoint: row.line_point != null ? Number(row.line_point) : null,
      consensusPrice: Number(row.consensus_price),
      bestPrice: Number(row.best_price),
      bestBookKey: String(row.best_book_key || ''),
      bestBookTitle: String(row.best_book_title || ''),
      capturedAt,
    }
  })

  return { lines, snapshotAgeMs: oldestMs }
}

export async function upsertEventLines(
  admin: SupabaseClient,
  botUserId: string,
  lines: EventLineRow[],
): Promise<void> {
  if (!lines.length) return
  const rows = lines.map((line) => ({
    bot_user_id: botUserId,
    event_id: line.eventId,
    sport_key: line.sportKey,
    market_key: line.marketKey,
    outcome_name: line.outcomeName,
    line_point: line.linePoint,
    consensus_price: line.consensusPrice,
    best_price: line.bestPrice,
    best_book_key: line.bestBookKey || null,
    best_book_title: line.bestBookTitle || null,
    updated_at: new Date().toISOString(),
  }))

  const { error } = await admin
    .from('lounge_odds_event_lines')
    .upsert(rows, { onConflict: 'bot_user_id,event_id,market_key,outcome_name' })

  if (error) throw new Error(error.message)
}
