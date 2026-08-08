/**
 * Finnhub market data helpers (server-side only — FINNHUB_API_KEY in Edge secrets).
 * Crypto logos: CoinGecko via coingeckoMarket.ts (optional COINGECKO_API_KEY).
 */

import {
  aggregateMarketBarsToBucketSec,
  mergeMarketBarSameTime,
  normalizeMarketBarPoint,
  type MarketBarOhlc,
} from './marketBarOhlc.ts'
import {
  coingeckoBatchPickerQuotes,
  coingeckoCryptoCandles,
  coingeckoCryptoProfile,
  coingeckoCryptoLogo,
  coingeckoMarketCapUsd,
  coingeckoCryptoUniverse,
  coingeckoMarketSearch,
} from './coingeckoMarket.ts'
import {
  isUsableStockIntradayBars,
  isUsEquityRegularSessionOpen,
  lastRegularSessionBounds,
  lastRegularSessionLabel,
  regularSessionDaysBack,
} from './usEquityMarketSession.ts'
import { yahooFxRateToUsd, yahooIntervalForWindow, yahooLatestNews, yahooResolveUsEquityCashtag, yahooStockAllTimeCandles, yahooStockCandles, yahooStockPickerRow, yahooStockProfile, yahooStockQuote, yahooStockMonthlyTwoHourCandles, yahooStockQuarterlyDailyCandles, yahooStockWeeklyIntradayCandles } from './yahooMarket.ts'
import { fmpStockLogoUrl } from './fmpMarket.ts'
import { coingeckoCoinIdForTicker } from './marketCashtagCrypto.ts'
import {
  coingeckoLogoUrlForCoinId,
  isGuessedFinnhubStockLogoUrl,
  isSpdrMarketInstrument,
  spdrIssuerLogoUrl,
  withCashtagRowLogo,
} from './marketCashtagLogos.ts'

export type MarketProfile = {
  name: string
  exchange: string
  logo: string
  marketCapitalization: number | null
  currency: string
  coinId?: string
}

export type MarketBar = MarketBarOhlc
export type MarketAssetClass = 'stock' | 'crypto'
export type MarketEmbedKind = 'rolling' | 'historical'
export type MarketWindowKey =
  | '1h'
  | '24h'
  | '3d'
  | '1w'
  | '1m'
  | '2m'
  | '3m'
  | '6m'
  | '1y'
  | 'ytd'
  | 'all'

export type MarketEmbed = {
  symbol: string
  display_symbol: string
  asset_class: MarketAssetClass
  name: string
  exchange: string
  logo_url: string
  market_cap: number | null
  currency: string
  kind: MarketEmbedKind
  window_key: MarketWindowKey
  window_label: string
  quote: {
    price: number
    change_pct: number
    change: number
    as_of: string
  }
  bars: MarketBar[]
  og_image_url: string
  /** CoinGecko id — crypto only; avoids `/search` on rolling/modal candles. */
  coin_id?: string
  /** ISO timestamp when name/logo/mcap were last resolved. */
  metadata_as_of?: string
}

const FINNHUB_BASE = 'https://finnhub.io/api/v1'

export const MARKET_EMBED_MAX = 12
export const MARKET_CACHE_TTL_MS = 90_000
const PICKER_ENRICH_CACHE_TTL_MS = 45_000

export function finnhubToken(): string {
  return String(Deno.env.get('FINNHUB_API_KEY') || '').trim()
}

export function normalizeDisplaySymbol(raw: string, assetClass: MarketAssetClass): string {
  const s = String(raw || '').trim().toUpperCase()
  if (!s) return ''
  if (assetClass === 'crypto') {
    const m = s.match(/:([A-Z0-9]+)/)
    if (m) {
      const pair = m[1]
      if (pair.endsWith('USDT')) return pair.slice(0, -4)
      if (pair.endsWith('USD')) return pair.slice(0, -3)
      return pair
    }
    return s.replace(/^BINANCE:/, '').replace(/USDT$/, '').replace(/USD$/, '')
  }
  return s
}

export function finnhubSymbolForAsset(symbol: string, assetClass: MarketAssetClass): string {
  const s = String(symbol || '').trim().toUpperCase()
  if (!s) return ''
  if (assetClass === 'crypto') {
    if (s.includes(':')) return s
    return `BINANCE:${s}USDT`
  }
  return s
}

export function detectAssetClassFromSymbol(symbol: string): MarketAssetClass {
  const s = String(symbol || '').trim().toUpperCase()
  if (s.startsWith('BINANCE:') || s.includes('USDT')) return 'crypto'
  return 'stock'
}

const CASHTAG_RE = /\$([A-Za-z][A-Za-z0-9.-]{0,14})\b/g

/** Cashtags in caption order (deduped). */
export function extractCashtagsFromCaption(caption: string): string[] {
  const text = String(caption || '')
  const out: string[] = []
  const seen = new Set<string>()
  CASHTAG_RE.lastIndex = 0
  let m: RegExpExecArray | null
  while ((m = CASHTAG_RE.exec(text)) !== null) {
    const sym = String(m[1] || '').trim().toUpperCase()
    if (!sym || seen.has(sym)) continue
    seen.add(sym)
    out.push(sym)
  }
  return out
}

function attachDedupeKey(symbol: string, assetClass: MarketAssetClass): string {
  return `${assetClass}:${finnhubSymbolForAsset(symbol, assetClass)}`.toLowerCase()
}

export async function resolveCashtagTicker(
  tag: string,
): Promise<{ symbol: string; asset_class: MarketAssetClass } | null> {
  const upper = String(tag || '').trim().toUpperCase()
  if (!upper) return null

  if (isCommonCryptoCashtag(upper)) {
    return { symbol: finnhubSymbolForAsset(upper, 'crypto'), asset_class: 'crypto' }
  }

  const direct = await yahooResolveUsEquityCashtag(upper).catch(() => null)
  if (direct) return direct

  const results = await marketSearch(upper)
  if (!results.length) return null
  const enriched = await enrichSearchResultsForPicker(results.slice(0, 8))
  const pick = pickBestCashtagSearchResult(upper, enriched)
  return { symbol: pick.symbol, asset_class: pick.asset_class }
}

export type MarketAttachPickerRow = {
  symbol: string
  asset_class: MarketAssetClass
  display_symbol?: string
}

/** Caption cashtags (auto) + explicit picker rows; picker wins per ticker; max 12. */
export async function resolveMarketSymbolsForAttach(
  caption: string,
  pickerSymbols: MarketAttachPickerRow[],
): Promise<Array<{ symbol: string; asset_class: MarketAssetClass }>> {
  const cashtags = extractCashtagsFromCaption(caption)
  const pickerByTag = new Map<string, MarketAttachPickerRow>()
  for (const row of pickerSymbols) {
    const tag =
      String(row.display_symbol || '').trim().toUpperCase() ||
      normalizeDisplaySymbol(finnhubSymbolForAsset(row.symbol, row.asset_class), row.asset_class)
    if (tag) pickerByTag.set(tag, row)
  }

  const out: Array<{ symbol: string; asset_class: MarketAssetClass }> = []
  const seen = new Set<string>()

  const push = (row: { symbol: string; asset_class: MarketAssetClass }) => {
    if (out.length >= MARKET_EMBED_MAX) return
    const key = attachDedupeKey(row.symbol, row.asset_class)
    if (seen.has(key)) return
    seen.add(key)
    out.push({ symbol: row.symbol, asset_class: row.asset_class })
  }

  for (const tag of cashtags) {
    if (out.length >= MARKET_EMBED_MAX) break
    const picked = pickerByTag.get(tag)
    if (picked) {
      push(picked)
      continue
    }
    const resolved = await resolveCashtagTicker(tag)
    if (resolved) push(resolved)
  }

  for (const row of pickerSymbols) {
    if (out.length >= MARKET_EMBED_MAX) break
    push(row)
  }

  return out
}

/** Parse caption for a historical window; null → rolling 24h default. */
const CAPTION_MONTH_WORDS: Record<string, number> = {
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  eleven: 11,
  twelve: 12,
}

const CAPTION_MONTH_TOKEN = '(\\d+|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)'

function parseCaptionMonthCountToken(raw: string): number | null {
  const t = String(raw || '').trim().toLowerCase()
  if (!t) return null
  if (/^\d+$/.test(t)) return Math.max(1, parseInt(t, 10) || 1)
  return CAPTION_MONTH_WORDS[t] ?? null
}

function monthCountToWindowKey(n: number): MarketWindowKey {
  if (n >= 6) return '6m'
  if (n >= 3) return '3m'
  if (n >= 2) return '2m'
  return '1m'
}

const CAPTION_MONTH_NAME_RE =
  'january|jan|february|feb|march|mar|april|apr|may|june|jun|july|jul|august|aug|september|sept?|october|oct|november|nov|december|dec'

const CAPTION_MONTH_NAME_INDEX: Record<string, number> = {
  january: 0,
  jan: 0,
  february: 1,
  feb: 1,
  march: 2,
  mar: 2,
  april: 3,
  apr: 3,
  may: 4,
  june: 5,
  jun: 5,
  july: 6,
  jul: 6,
  august: 7,
  aug: 7,
  september: 8,
  sept: 8,
  sep: 8,
  october: 9,
  oct: 9,
  november: 10,
  nov: 10,
  december: 11,
  dec: 11,
}

function lookbackDaysToWindowKey(days: number): MarketWindowKey {
  const d = Math.max(1, Math.ceil(days))
  if (d <= 1) return '24h'
  if (d <= 3) return '3d'
  if (d <= 7) return '1w'
  if (d <= 30) return '1m'
  if (d <= 60) return '2m'
  if (d <= 90) return '3m'
  if (d <= 183) return '6m'
  if (d <= 366) return '1y'
  return 'all'
}

/**
 * "since January" / "since mid-April" / "since April 15, 2025" → UTC fromSec.
 * Future calendar dates roll back one year (e.g. "since December" in August).
 */
function parseCaptionSinceMonthAnchor(text: string): { fromSec: number; monthIndex: number; day: number; year: number } | null {
  const m = text.match(
    new RegExp(
      `\\bsince\\s+(?:(early|mid|late)[\\s-]*)?(${CAPTION_MONTH_NAME_RE})(?:\\s+(\\d{1,2}))?(?:,?\\s*((?:19|20)\\d{2}))?\\b`,
    ),
  )
  if (!m) return null
  const phase = String(m[1] || '').trim()
  const monthIndex = CAPTION_MONTH_NAME_INDEX[String(m[2] || '').trim()]
  if (monthIndex == null) return null
  let day = 1
  if (m[3]) {
    day = Math.max(1, Math.min(31, parseInt(m[3], 10) || 1))
  } else if (phase === 'mid') {
    day = 15
  } else if (phase === 'late') {
    day = 21
  } else {
    day = 1 // early / bare month
  }
  const now = new Date()
  const currentYear = now.getUTCFullYear()
  let year = m[4] ? parseInt(m[4], 10) : currentYear
  if (!Number.isFinite(year) || year < 1990 || year > currentYear + 1) year = currentYear

  let fromMs = Date.UTC(year, monthIndex, day)
  const nowMs = Date.now()
  if (fromMs > nowMs) {
    year -= 1
    fromMs = Date.UTC(year, monthIndex, day)
  }
  if (fromMs > nowMs) return null
  return { fromSec: Math.floor(fromMs / 1000), monthIndex, day, year }
}

function windowFromSinceAnchor(anchor: {
  fromSec: number
  monthIndex: number
  day: number
  year: number
}): { kind: MarketEmbedKind; windowKey: MarketWindowKey; windowLabel: string } {
  const nowSec = Math.floor(Date.now() / 1000)
  const currentYear = new Date().getUTCFullYear()
  // Bare / early January this year ≈ YTD (common "drought since January" phrasing).
  const useYtd = anchor.year === currentYear && anchor.monthIndex === 0 && anchor.day <= 7
  const windowKey = useYtd
    ? 'ytd'
    : lookbackDaysToWindowKey((nowSec - anchor.fromSec) / 86400)
  return {
    kind: 'historical',
    windowKey,
    windowLabel: formatUtcDateRange(anchor.fromSec, nowSec) || windowKey.toUpperCase(),
  }
}

export function parseCaptionMarketWindow(caption: string): {
  kind: MarketEmbedKind
  windowKey: MarketWindowKey
  windowLabel: string
} {
  const text = String(caption || '').toLowerCase()
  if (!text.trim()) {
    return { kind: 'rolling', windowKey: '24h', windowLabel: '24h' }
  }

  // Lookback headlines: "first time in two months", "first signs of life in two months",
  // "first green day in 3 months". Avoid bare "first product in two months" (often future).
  const firstInMonth = text.match(
    new RegExp(
      `\\b(?:for\\s+the\\s+)?first\\s+(?:` +
        `time|` +
        `signs?(?:\\s+of\\s+[a-z]+){1,3}|` +
        `(?:[a-z0-9%.'-]+\\s+){0,3}(?:day|week|close|print|candle|session|bounce|rally|breakout|high|low)` +
        `)\\s+in\\s+${CAPTION_MONTH_TOKEN}\\s*months?\\b`,
    ),
  )
  if (firstInMonth) {
    const n = parseCaptionMonthCountToken(firstInMonth[1])
    if (n != null) {
      const windowKey = monthCountToWindowKey(n)
      return { kind: 'historical', windowKey, windowLabel: `${n}M` }
    }
  }

  const sinceAnchor = parseCaptionSinceMonthAnchor(text)
  if (sinceAnchor) {
    return windowFromSinceAnchor(sinceAnchor)
  }

  const monthMatch = text.match(
    new RegExp(
      `\\b(?:last|past|over the last|in the last|in the past)\\s+${CAPTION_MONTH_TOKEN}\\s*months?\\b`,
    ),
  )
  if (monthMatch) {
    const n = parseCaptionMonthCountToken(monthMatch[1])
    if (n != null) {
      const windowKey = monthCountToWindowKey(n)
      return { kind: 'historical', windowKey, windowLabel: `${n}M` }
    }
  }

  const dayMatch = text.match(/\b(?:last|past|over the last|in the last)\s+(\d+)\s*days?\b/)
  if (dayMatch) {
    const n = Math.max(1, parseInt(dayMatch[1], 10) || 1)
    if (n <= 1) return { kind: 'historical', windowKey: '24h', windowLabel: '24h' }
    if (n <= 3) return { kind: 'historical', windowKey: '3d', windowLabel: `${n}D` }
    if (n <= 7) return { kind: 'historical', windowKey: '1w', windowLabel: `${n}D` }
    return { kind: 'historical', windowKey: '1m', windowLabel: `${n}D` }
  }

  if (/\b(?:last|past)\s+6\s+months?\b/.test(text)) {
    return { kind: 'historical', windowKey: '6m', windowLabel: '6M' }
  }
  if (/\b(?:last|past)\s+3\s+months?\b|\b(?:last|past)\s+quarter\b/.test(text)) {
    return { kind: 'historical', windowKey: '3m', windowLabel: '3M' }
  }
  if (/\b(?:last|past)\s+two\s+months?\b/.test(text)) {
    return { kind: 'historical', windowKey: '2m', windowLabel: '2M' }
  }
  if (/\b(?:last|past)\s+month\b|\bthis\s+month\b/.test(text)) {
    return { kind: 'historical', windowKey: '1m', windowLabel: '1M' }
  }
  if (/\b(?:last|past|this\s+last)\s+week\b|\bthis\s+week\b/.test(text)) {
    return { kind: 'historical', windowKey: '1w', windowLabel: '1W' }
  }
  if (/\b(?:last|past)\s+year\b|\bthis\s+year\b|\b1\s+year\b/.test(text)) {
    return { kind: 'historical', windowKey: '1y', windowLabel: '1Y' }
  }
  if (/\bytd\b|\byear\s+to\s+date\b/.test(text)) {
    return { kind: 'historical', windowKey: 'ytd', windowLabel: 'YTD' }
  }

  return { kind: 'rolling', windowKey: '24h', windowLabel: '24h' }
}

const MARKET_HISTORY_MAX_LOOKBACK_SEC = 20 * 365 * 86400

export function windowSpanSec(windowKey: MarketWindowKey): number {
  const { fromSec, toSec } = windowRange(windowKey)
  return Math.max(3600, toSec - fromSec)
}

/** Same span/resolution as `windowRange`, anchored so `toSec` ends at `endSec`. */
export function windowRangeAtEnd(windowKey: MarketWindowKey, endSec: number): {
  fromSec: number
  toSec: number
  resolution: string
} {
  const end = Math.floor(endSec)
  const span = windowSpanSec(windowKey)
  const { resolution } = windowRange(windowKey)
  return { fromSec: end - span, toSec: end, resolution }
}

export function windowRange(windowKey: MarketWindowKey): {
  fromSec: number
  toSec: number
  resolution: string
} {
  const now = Math.floor(Date.now() / 1000)
  const day = 86400
  switch (windowKey) {
    case '1h':
      return { fromSec: now - 3600, toSec: now, resolution: '1' }
    case '24h':
      return { fromSec: now - day, toSec: now, resolution: '5' }
    case '3d':
      return { fromSec: now - 3 * day, toSec: now, resolution: '15' }
    case '1w':
      return { fromSec: now - 7 * day, toSec: now, resolution: '15' }
    case '1m':
      return { fromSec: now - 30 * day, toSec: now, resolution: '60' }
    case '2m':
      return { fromSec: now - 60 * day, toSec: now, resolution: 'D' }
    case '3m':
      return { fromSec: now - 90 * day, toSec: now, resolution: 'D' }
    case '6m':
      return { fromSec: now - 183 * day, toSec: now, resolution: 'D' }
    case '1y':
      return { fromSec: now - 365 * day, toSec: now, resolution: 'D' }
    case 'all':
      return { fromSec: now - MARKET_HISTORY_MAX_LOOKBACK_SEC, toSec: now, resolution: 'W' }
    case 'ytd': {
      const y = new Date().getUTCFullYear()
      return { fromSec: Math.floor(Date.UTC(y, 0, 1) / 1000), toSec: now, resolution: 'D' }
    }
    default:
      return { fromSec: now - day, toSec: now, resolution: '5' }
  }
}

function barUnixSec(t: number): number {
  return Math.floor(t > 1e12 ? t / 1000 : t)
}

function utcStartOfDay(sec: number): number {
  const d = new Date(sec * 1000)
  return Math.floor(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) / 1000)
}

/** Compact UTC date range for historical mini-chart labels, e.g. `May 24 – 30`. */
export function formatUtcDateRange(fromSec: number, toSec: number): string {
  if (!Number.isFinite(fromSec) || !Number.isFinite(toSec)) return ''
  let fromDay = utcStartOfDay(fromSec)
  let toDay = utcStartOfDay(toSec)
  if (fromDay > toDay) [fromDay, toDay] = [toDay, fromDay]

  const from = new Date(fromDay * 1000)
  const to = new Date(toDay * 1000)
  const monthDay: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric', timeZone: 'UTC' }
  const dayOnly: Intl.DateTimeFormatOptions = { day: 'numeric', timeZone: 'UTC' }

  if (fromDay === toDay) {
    return from.toLocaleDateString('en-US', monthDay)
  }

  const fromYear = from.getUTCFullYear()
  const fromMonth = from.getUTCMonth()
  const toYear = to.getUTCFullYear()
  const toMonth = to.getUTCMonth()

  if (fromYear === toYear && fromMonth === toMonth) {
    const fromStr = from.toLocaleDateString('en-US', monthDay)
    const toDayStr = to.toLocaleDateString('en-US', dayOnly)
    return `${fromStr} – ${toDayStr}`
  }

  if (fromYear === toYear) {
    return `${from.toLocaleDateString('en-US', monthDay)} – ${to.toLocaleDateString('en-US', monthDay)}`
  }

  const withYear: Intl.DateTimeFormatOptions = {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  }
  return `${from.toLocaleDateString('en-US', withYear)} – ${to.toLocaleDateString('en-US', withYear)}`
}

/** Historical embed label from bar span (preferred) or window range fallback. */
export function formatMarketWindowDateLabel(windowKey: MarketWindowKey, bars: MarketBar[]): string {
  const windowSpan = windowRange(windowKey)
  let fromSec = windowSpan.fromSec
  let toSec = windowSpan.toSec

  if (bars.length >= 2) {
    const barFrom = barUnixSec(bars[0].t)
    const barTo = barUnixSec(bars[bars.length - 1].t)
    const fromDay = utcStartOfDay(barFrom)
    const toDay = utcStartOfDay(barTo)
    if (fromDay < toDay) {
      fromSec = barFrom
      toSec = barTo
    }
  }

  if (fromSec > toSec) [fromSec, toSec] = [toSec, fromSec]
  return formatUtcDateRange(fromSec, toSec)
}

const RESOLUTION_FALLBACKS: Record<MarketWindowKey, string[]> = {
  '1h': ['1', '5', '15'],
  '24h': ['5', '15', '30', '60', 'D'],
  '3d': ['15', '30', '60', 'D'],
  '1w': ['15', '30', '60'],
  '1m': ['60', '30'],
  '2m': ['D', '60'],
  '3m': ['D'],
  '6m': ['D'],
  '1y': ['D'],
  'ytd': ['D'],
  all: ['W', 'D'],
}

function parseFinnhubCandlePayload(data: unknown): MarketBar[] {
  const row = data as {
    s?: string
    o?: number[]
    h?: number[]
    l?: number[]
    c?: number[]
    t?: number[]
    v?: number[]
  }
  if (row?.s !== 'ok' || !Array.isArray(row?.c)) return []
  const out: MarketBar[] = []
  for (let i = 0; i < row.c.length; i += 1) {
    const c = Number(row.c[i])
    const t = Number(row.t?.[i])
    const o = Number(row.o?.[i])
    const h = Number(row.h?.[i])
    const l = Number(row.l?.[i])
    const v = row.v != null ? Number(row.v[i]) : undefined
    if (!Number.isFinite(c) || !Number.isFinite(t)) continue
    out.push({
      t,
      c,
      ...(Number.isFinite(o) ? { o } : {}),
      ...(Number.isFinite(h) ? { h } : {}),
      ...(Number.isFinite(l) ? { l } : {}),
      ...(Number.isFinite(v) ? { v } : {}),
    })
  }
  return out
}

export async function fetchFinnhubCandlesAtResolution(
  finnhubSym: string,
  assetClass: MarketAssetClass,
  fromSec: number,
  toSec: number,
  resolution: string,
): Promise<MarketBar[]> {
  try {
    const path = assetClass === 'crypto' ? '/crypto/candle' : '/stock/candle'
    const data = await finnhubFetch(path, {
      symbol: finnhubSym,
      resolution,
      from: String(fromSec),
      to: String(toSec),
    })
    return parseFinnhubCandlePayload(data)
  } catch {
    return []
  }
}

/** Approximate trend line from headline quote when candle APIs return nothing. */
export function synthesizeBarsFromQuote(
  quote: { price: number; change_pct: number },
  windowKey: MarketWindowKey,
  points = 32,
): MarketBar[] {
  const end = Number(quote.price)
  if (!Number.isFinite(end) || end <= 0) return []
  const pct = Number(quote.change_pct)
  const start = Number.isFinite(pct) ? end / (1 + pct / 100) : end * 0.995
  const now = Math.floor(Date.now() / 1000)
  const { fromSec } = windowRange(windowKey)
  const span = Math.max(3600, now - fromSec)
  const out: MarketBar[] = []
  for (let i = 0; i < points; i += 1) {
    const t = fromSec + Math.floor((span * i) / Math.max(1, points - 1))
    const ratio = i / Math.max(1, points - 1)
    out.push({ t, c: start + (end - start) * ratio })
  }
  return out
}

/** Finnhub → Yahoo (stocks) / CoinGecko (crypto). Stocks never use synthetic diagonal fallback. */
async function resolveStockIntradayBars(
  symbol: string,
  windowKey: MarketWindowKey,
): Promise<MarketBar[]> {
  const interval = yahooIntervalForWindow(windowKey)

  // Open session: fetch RTH window only. Calendar `windowRange('24h')` returns ~24h of
  // bars (prior close + today) which the client rejects via `isUsableStockIntradayBars`
  // (span must be ≤ 8h) … leaving blank sparklines / 1D charts.
  if (isUsEquityRegularSessionOpen()) {
    const session = lastRegularSessionBounds()
    const { fromSec: winFrom, toSec: winTo } = windowRange(windowKey)
    let fromSec = Math.max(session.fromSec, winFrom)
    let toSec = Math.min(session.toSec + 60, Math.max(winTo, session.toSec + 60))
    if (toSec <= fromSec) {
      fromSec = session.fromSec
      toSec = session.toSec + 60
    }

    let bars = normalizeMarketBars(await finnhubCandles(symbol, 'stock', windowKey))
    if (isUsableStockIntradayBars(bars)) return bars

    bars = normalizeMarketBars(await yahooStockCandles(symbol, fromSec, toSec, interval))
    if (isUsableStockIntradayBars(bars)) return bars
  }

  const intervals = windowKey === '1h' ? ['1m', '5m'] : ['5m', '1m']
  for (const session of regularSessionDaysBack()) {
    for (const step of intervals) {
      const sessionBars = await yahooStockCandles(
        symbol,
        session.fromSec,
        session.toSec + 60,
        step,
      )
      if (sessionBars.length >= 2 && isUsableStockIntradayBars(sessionBars)) {
        return normalizeMarketBars(sessionBars)
      }
    }
  }
  return []
}

/** Modal 1W chart: 15m RTH candles (Yahoo `range=7d`, Finnhub `15`). */
const MIN_1W_INTRADAY_BARS = 16
const MAX_1W_MEDIAN_GAP_SEC = 6 * 3600

/** Modal 1M chart: 2h candles aggregated from 1h/30m source bars. */
const TWO_HOUR_BUCKET_SEC = 7200
const MIN_1M_TWO_HOUR_BARS = 24
const MAX_1M_MEDIAN_GAP_SEC = 12 * 3600

/** Modal 3M chart: daily candles (Yahoo `range=3mo`, Finnhub `D`). */
const MIN_3M_DAILY_BARS = 20
const MIN_DAILY_MEDIAN_GAP_SEC = 12 * 3600
const MAX_DAILY_MEDIAN_GAP_SEC = 7 * 86400

function medianBarGapSec(bars: MarketBar[]): number {
  if (bars.length < 2) return Number.POSITIVE_INFINITY
  const gaps: number[] = []
  for (let i = 1; i < bars.length; i += 1) {
    gaps.push(Math.abs(barUnixSec(bars[i].t) - barUnixSec(bars[i - 1].t)))
  }
  gaps.sort((a, b) => a - b)
  return gaps[Math.floor(gaps.length / 2)] ?? Number.POSITIVE_INFINITY
}

/** Reject ~5 daily candles masquerading as a weekly intraday chart. */
export function isUsableWeeklyHourlyBars(bars: MarketBar[]): boolean {
  if (!Array.isArray(bars) || bars.length < MIN_1W_INTRADAY_BARS) return false
  return medianBarGapSec(bars) <= MAX_1W_MEDIAN_GAP_SEC
}

function aggregateBarsToBucketSec(bars: MarketBar[], bucketSec: number): MarketBar[] {
  const normalized = bars.map((bar) => ({
    ...bar,
    t: barUnixSec(bar.t),
  }))
  return aggregateMarketBarsToBucketSec(normalized, bucketSec)
}

function aggregateMarketBarsToTwoHour(bars: MarketBar[]): MarketBar[] {
  return aggregateBarsToBucketSec(bars, TWO_HOUR_BUCKET_SEC)
}

/** Reject ~22 daily candles masquerading as a monthly 2h chart. */
function isUsableMonthlyTwoHourBars(bars: MarketBar[]): boolean {
  if (!Array.isArray(bars) || bars.length < MIN_1M_TWO_HOUR_BARS) return false
  return medianBarGapSec(bars) <= MAX_1M_MEDIAN_GAP_SEC
}

/** Reject sparse intraday or weekly buckets on a 3M daily chart. */
function isUsableQuarterlyDailyBars(bars: MarketBar[]): boolean {
  if (!Array.isArray(bars) || bars.length < MIN_3M_DAILY_BARS) return false
  const median = medianBarGapSec(bars)
  return median >= MIN_DAILY_MEDIAN_GAP_SEC && median <= MAX_DAILY_MEDIAN_GAP_SEC
}

/** Locked modal 1W path — do not fall back to daily for US equities. */
async function resolveStockWeeklyBars(symbol: string): Promise<MarketBar[]> {
  const yahoo = await yahooStockWeeklyIntradayCandles(symbol)
  if (isUsableWeeklyHourlyBars(yahoo)) return normalizeMarketBars(yahoo)

  const { fromSec, toSec } = windowRange('1w')
  for (const interval of ['15m', '30m', '1h']) {
    const bars = await yahooStockCandles(symbol, fromSec, toSec, interval)
    if (isUsableWeeklyHourlyBars(bars)) return normalizeMarketBars(bars)
  }

  const finnhub = await finnhubCandles(symbol, 'stock', '1w')
  if (isUsableWeeklyHourlyBars(finnhub)) return normalizeMarketBars(finnhub)
  return []
}

/** Locked modal 1M path — 2h candles, not daily. */
async function resolveStockMonthlyBars(symbol: string): Promise<MarketBar[]> {
  const yahoo = await yahooStockMonthlyTwoHourCandles(symbol)
  if (isUsableMonthlyTwoHourBars(yahoo)) return normalizeMarketBars(yahoo)

  const { fromSec, toSec } = windowRange('1m')
  for (const interval of ['1h', '30m']) {
    const raw = await yahooStockCandles(symbol, fromSec, toSec, interval)
    const bars = aggregateMarketBarsToTwoHour(raw)
    if (isUsableMonthlyTwoHourBars(bars)) return normalizeMarketBars(bars)
  }

  const finnhub = aggregateMarketBarsToTwoHour(await finnhubCandles(symbol, 'stock', '1m'))
  if (isUsableMonthlyTwoHourBars(finnhub)) return normalizeMarketBars(finnhub)
  return []
}

/** Locked modal 3M path — daily candles. */
async function resolveStockQuarterlyBars(symbol: string): Promise<MarketBar[]> {
  const yahoo = await yahooStockQuarterlyDailyCandles(symbol)
  if (isUsableQuarterlyDailyBars(yahoo)) return normalizeMarketBars(yahoo)

  const { fromSec, toSec } = windowRange('3m')
  const bars = await yahooStockCandles(symbol, fromSec, toSec, '1d')
  if (isUsableQuarterlyDailyBars(bars)) return normalizeMarketBars(bars)

  const finnhub = await finnhubCandles(symbol, 'stock', '3m')
  if (isUsableQuarterlyDailyBars(finnhub)) return normalizeMarketBars(finnhub)
  return []
}

/** Modal ALL path — max available history (weekly/monthly), not 1Y daily. */
async function resolveStockAllTimeBars(symbol: string): Promise<MarketBar[]> {
  const yahoo = await yahooStockAllTimeCandles(symbol)
  if (yahoo.length >= 12) return normalizeMarketBars(yahoo)

  const { fromSec, toSec } = windowRange('all')
  const bars = await yahooStockCandles(symbol, fromSec, toSec, '1wk')
  if (bars.length >= 12) return normalizeMarketBars(bars)

  const finnhub = await finnhubCandles(symbol, 'stock', 'all')
  if (finnhub.length >= 12) return normalizeMarketBars(finnhub)
  return []
}

export async function resolveMarketBars(
  symbol: string,
  assetClass: MarketAssetClass,
  windowKey: MarketWindowKey,
  quote: { price: number; change_pct: number },
  opts?: { coinId?: string },
): Promise<MarketBar[]> {
  if (assetClass === 'stock' && (windowKey === '24h' || windowKey === '1h')) {
    return resolveStockIntradayBars(symbol, windowKey)
  }
  if (assetClass === 'stock' && windowKey === '1w') {
    return resolveStockWeeklyBars(symbol)
  }
  if (assetClass === 'stock' && windowKey === '1m') {
    return resolveStockMonthlyBars(symbol)
  }
  if (assetClass === 'stock' && windowKey === '3m') {
    return resolveStockQuarterlyBars(symbol)
  }
  if (assetClass === 'stock' && windowKey === 'all') {
    return resolveStockAllTimeBars(symbol)
  }

  let bars = await finnhubCandles(symbol, assetClass, windowKey)
  const finnhubSparseWeekly = windowKey === '1w' && bars.length > 0 && !isUsableWeeklyHourlyBars(bars)
  const finnhubSparseMonthly =
    windowKey === '1m' && bars.length > 0 && !isUsableMonthlyTwoHourBars(aggregateMarketBarsToTwoHour(bars))
  const finnhubSparseQuarterly = windowKey === '3m' && bars.length > 0 && !isUsableQuarterlyDailyBars(bars)
  if (bars.length >= 2 && !finnhubSparseWeekly && !finnhubSparseMonthly && !finnhubSparseQuarterly) {
    return normalizeMarketBars(bars)
  }

  const { fromSec, toSec } = windowRange(windowKey)

  if (assetClass === 'stock') {
    bars = await yahooStockCandles(symbol, fromSec, toSec, yahooIntervalForWindow(windowKey))
    if (bars.length >= 2) return normalizeMarketBars(bars)
    return []
  }

  if (assetClass === 'crypto') {
    bars = await coingeckoCryptoCandles(symbol, windowKey, opts?.coinId)
    if (bars.length >= 2) {
      bars = bars.filter((b) => {
        const t = Math.floor(b.t > 1e12 ? b.t / 1000 : b.t)
        return t >= fromSec
      })
      if (bars.length >= 2) return normalizeMarketBars(bars)
    }
  }

  return normalizeMarketBars(synthesizeBarsFromQuote(quote, windowKey))
}

/** Prior regular session(s) before `beforeSec` — stocks 1H/1D modal pan-back. */
async function resolveStockIntradayBarsBefore(
  symbol: string,
  windowKey: MarketWindowKey,
  beforeSec: number,
): Promise<{ bars: MarketBar[]; hasMore: boolean }> {
  const anchor = Math.floor(beforeSec)
  if (!Number.isFinite(anchor) || anchor <= 0) return { bars: [], hasMore: false }

  const minFrom = Math.floor(Date.now() / 1000) - MARKET_HISTORY_MAX_LOOKBACK_SEC
  const intervals = windowKey === '1h' ? ['1m', '5m'] : ['5m', '1m']

  for (const session of regularSessionDaysBack()) {
    if (session.toSec >= anchor) continue
    for (const step of intervals) {
      const sessionBars = await yahooStockCandles(
        symbol,
        session.fromSec,
        session.toSec + 60,
        step,
      )
      const bars = normalizeMarketBars(sessionBars).filter((b) => barUnixSec(b.t) < anchor)
      if (bars.length >= 2 && isUsableStockIntradayBars(bars)) {
        return { bars, hasMore: session.fromSec > minFrom }
      }
    }
  }

  return { bars: [], hasMore: false }
}

/** Older bars ending strictly before `beforeSec` — used when panning back on modal charts. */
export async function resolveMarketBarsBefore(
  symbol: string,
  assetClass: MarketAssetClass,
  windowKey: MarketWindowKey,
  beforeSec: number,
): Promise<{ bars: MarketBar[]; hasMore: boolean }> {
  const anchor = Math.floor(beforeSec)
  if (!Number.isFinite(anchor) || anchor <= 0) return { bars: [], hasMore: false }

  if (assetClass === 'stock' && (windowKey === '24h' || windowKey === '1h')) {
    return resolveStockIntradayBarsBefore(symbol, windowKey, anchor)
  }

  const endSec = anchor - 1
  const { fromSec, toSec, resolution } = windowRangeAtEnd(windowKey, endSec)
  const minFrom = Math.floor(Date.now() / 1000) - MARKET_HISTORY_MAX_LOOKBACK_SEC
  if (fromSec < minFrom) return { bars: [], hasMore: false }

  const finnhubSym = finnhubSymbolForAsset(symbol, assetClass)
  const interval = yahooIntervalForWindow(windowKey)
  let bars: MarketBar[] = []

  const candidates = [resolution, ...(RESOLUTION_FALLBACKS[windowKey] || [])]
  const seen = new Set<string>()
  for (const res of candidates) {
    if (seen.has(res)) continue
    seen.add(res)
    bars = await fetchFinnhubCandlesAtResolution(finnhubSym, assetClass, fromSec, toSec, res)
    if (bars.length >= 2) break
  }

  if (bars.length < 2 && assetClass === 'stock') {
    bars = await yahooStockCandles(symbol, fromSec, toSec, interval)
  }

  bars = normalizeMarketBars(bars).filter((b) => barUnixSec(b.t) < anchor)
  const hasMore = bars.length >= 2 && fromSec > minFrom
  return { bars, hasMore }
}

/** Strictly ascending unique timestamps for chart libraries + embed storage. */
export function normalizeMarketBars(bars: MarketBar[]): MarketBar[] {
  const sorted = bars
    .filter((b) => Number.isFinite(b.t) && Number.isFinite(b.c))
    .map((b) => normalizeMarketBarPoint(b))
    .sort((a, b) => a.t - b.t)

  const out: MarketBar[] = []
  for (const bar of sorted) {
    const last = out[out.length - 1]
    if (last && last.t === bar.t) {
      mergeMarketBarSameTime(last, bar)
    } else {
      out.push({ ...bar })
    }
  }
  return out
}

async function finnhubFetch(path: string, params: Record<string, string>) {
  const token = finnhubToken()
  if (!token) throw new Error('FINNHUB_API_KEY is not configured on the server.')
  const url = new URL(`${FINNHUB_BASE}${path}`)
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v)
  url.searchParams.set('token', token)
  const res = await fetch(url.toString())
  if (!res.ok) throw new Error(`Finnhub HTTP ${res.status}`)
  return res.json()
}

export async function finnhubSearch(query: string) {
  const q = String(query || '').trim()
  if (q.length < 1) return []
  const data = await finnhubFetch('/search', { q })
  const results = Array.isArray(data?.result) ? data.result : []
  return results.slice(0, 20).map((row: Record<string, unknown>) => ({
    symbol: String(row.symbol || ''),
    display_symbol: String(row.displaySymbol || row.symbol || ''),
    description: String(row.description || ''),
    type: String(row.type || ''),
    asset_class: detectAssetClassFromSymbol(String(row.symbol || '')),
  }))
}

/** Finnhub search is stock-heavy; merge CoinGecko crypto rows for `$BTC`-style queries. */
const MARKET_SEARCH_TOKENIZED_RE =
  /ondo|tokenized|xstock|wrapped|dinari|mirrored|\s+on\b|\s+x\b|\.d\b|xstock/i

function cashtagRowMatchesTicker(
  tag: string,
  row: { symbol: string; display_symbol?: string; asset_class: MarketAssetClass },
): boolean {
  const display = marketSearchRowDisplay(row)
  const root = display.includes('.') ? display.split('.')[0] : display
  return display === tag || root === tag
}

function isTokenizedMarketSearchRow(row: {
  symbol: string
  display_symbol?: string
  description?: string
  asset_class: MarketAssetClass
}): boolean {
  const display = marketSearchRowDisplay(row)
  const desc = String(row.description || '').toLowerCase()
  const hay = `${display} ${desc} ${row.symbol}`.toLowerCase()
  return (
    MARKET_SEARCH_TOKENIZED_RE.test(hay) ||
    (row.asset_class === 'crypto' && /stock|equity|etf/i.test(desc))
  )
}

/** Deprioritize illiquid / micro-cap crypto when a large-cap stock shares the cashtag. */
const MICRO_CAP_CRYPTO_USD = 25_000_000
const LARGE_CAP_STOCK_USD = 500_000_000
export const CASHTAG_SCORE_AMBIGUITY_DELTA = 20

function cashtagAttachSortScore(
  tag: string,
  row: {
    symbol: string
    display_symbol?: string
    description?: string
    asset_class: MarketAssetClass
    type?: string
    market_cap?: number | null
  },
): number {
  let score = marketSearchRelevanceScore(tag, row)
  const cap = Number(row.market_cap)
  if (row.asset_class === 'crypto') {
    if (Number.isFinite(cap) && cap > 0 && cap < MICRO_CAP_CRYPTO_USD) {
      score += 200
    } else if (!Number.isFinite(cap) || cap <= 0) {
      score += 140
    }
  }
  if (row.asset_class === 'stock' && Number.isFinite(cap) && cap >= LARGE_CAP_STOCK_USD) {
    score -= 35
  }
  return score
}

function pickBestCashtagSearchResult<
  T extends {
    symbol: string
    display_symbol?: string
    description?: string
    asset_class: MarketAssetClass
    type?: string
    market_cap?: number | null
  },
>(tag: string, results: T[]): T {
  const matching = results.filter((row) => cashtagRowMatchesTicker(tag, row))
  const pool = matching.length ? matching : results

  let best = pool[0]
  let bestScore = cashtagAttachSortScore(tag, best)

  for (let i = 1; i < pool.length; i++) {
    const row = pool[i]
    const score = cashtagAttachSortScore(tag, row)
    if (score < bestScore) {
      best = row
      bestScore = score
      continue
    }
    if (score > bestScore) continue

    const bestTok = isTokenizedMarketSearchRow(best)
    const rowTok = isTokenizedMarketSearchRow(row)
    if (bestTok && !rowTok) {
      best = row
      continue
    }
    if (!bestTok && rowTok) continue

    if (row.asset_class === 'stock' && best.asset_class !== 'stock') {
      best = row
      continue
    }

    const ca = Number(best.market_cap)
    const cb = Number(row.market_cap)
    if (Number.isFinite(cb) && Number.isFinite(ca) && cb > ca) best = row
  }

  return best
}

function marketSearchQueryNorm(query: string): string {
  return String(query || '').trim().toUpperCase().replace(/^\$/, '')
}

function marketSearchRowDisplay(row: {
  symbol: string
  display_symbol?: string
  asset_class: MarketAssetClass
}): string {
  return String(
    row.display_symbol ||
      normalizeDisplaySymbol(finnhubSymbolForAsset(row.symbol, row.asset_class), row.asset_class),
  ).toUpperCase()
}

/** Lower score = higher in picker. Exact US stock ticker first; tokenized crypto last. */
export function marketSearchRelevanceScore(
  query: string,
  row: {
    symbol: string
    display_symbol?: string
    description?: string
    asset_class: MarketAssetClass
    type?: string
  },
): number {
  const q = marketSearchQueryNorm(query)
  if (!q) return 9999

  const display = marketSearchRowDisplay(row)
  const root = display.includes('.') ? display.split('.')[0] : display

  let score = 500

  if (display === q) {
    score = row.asset_class === 'stock' ? 0 : 25
  } else if (root === q && row.asset_class === 'stock') {
    score = 35
  } else if (display.startsWith(`${q} `) || display.startsWith(`${q}.`)) {
    score = row.asset_class === 'stock' ? 120 : 280
  } else if (root.startsWith(q)) {
    score = row.asset_class === 'stock' ? 200 : 320
  } else if (display.startsWith(q)) {
    score = row.asset_class === 'stock' ? 250 : 340
  }

  if (isTokenizedMarketSearchRow(row)) {
    score += 650
  }

  if (row.asset_class === 'stock' && display.includes('.') && root === q) {
    score += 25
  }

  return score
}

export function sortMarketSearchResults<
  T extends {
    symbol: string
    display_symbol?: string
    description?: string
    asset_class: MarketAssetClass
    type?: string
    market_cap?: number | null
  },
>(query: string, results: T[]): T[] {
  return [...results].sort((a, b) => {
    const sa = marketSearchRelevanceScore(query, a)
    const sb = marketSearchRelevanceScore(query, b)
    if (sa !== sb) return sa - sb
    const ca = Number(a.market_cap)
    const cb = Number(b.market_cap)
    if (Number.isFinite(ca) && Number.isFinite(cb) && ca !== cb) return cb - ca
    return marketSearchRowDisplay(a).length - marketSearchRowDisplay(b).length
  })
}

/** Cap foreign listing spam (AAPL.TO, AAPL.NE, …) — keep US exact + one alternate. */
export function dedupeMarketSearchRoots<
  T extends { symbol: string; display_symbol?: string; asset_class: MarketAssetClass },
>(results: T[]): T[] {
  const rootCounts = new Map<string, number>()
  const out: T[] = []
  for (const row of results) {
    if (row.asset_class === 'crypto') {
      out.push(row)
      continue
    }
    const display = marketSearchRowDisplay(row)
    const root = display.includes('.') ? display.split('.')[0] : display
    const count = rootCounts.get(root) || 0
    if (count >= 2) continue
    rootCounts.set(root, count + 1)
    out.push(row)
  }
  return out
}

export async function marketSearch(query: string) {
  const q = String(query || '').trim()
  if (q.length < 1) return []

  const [stocks, cryptos] = await Promise.all([
    finnhubSearch(q).catch(() => [] as Awaited<ReturnType<typeof finnhubSearch>>),
    coingeckoMarketSearch(q).catch(() => []),
  ])

  const seen = new Set<string>()
  const out: Array<(typeof stocks)[number] | (typeof cryptos)[number]> = []
  for (const row of [...stocks, ...cryptos]) {
    const key = `${row.asset_class}:${row.symbol}`.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(row)
  }
  return dedupeMarketSearchRoots(sortMarketSearchResults(q, out)).slice(0, 20)
}

export type MarketSymbolUniverseRow = {
  symbol: string
  display_symbol: string
  asset_class: MarketAssetClass
  name: string
  exchange: string
  coin_id?: string
  logo_url?: string
}

let symbolUniverseCache: {
  rows: MarketSymbolUniverseRow[]
  updated_at: string
  expires: number
} | null = null

const SYMBOL_UNIVERSE_TTL_MS = 24 * 60 * 60 * 1000

export async function finnhubUsStockUniverse(): Promise<MarketSymbolUniverseRow[]> {
  const data = await finnhubFetch('/stock/symbol', { exchange: 'US' })
  const list = Array.isArray(data) ? data : []
  const out: MarketSymbolUniverseRow[] = []
  const seen = new Set<string>()

  for (const row of list) {
    const sym = String(row?.symbol || '').trim().toUpperCase()
    if (!sym || seen.has(sym)) continue
    const type = String(row?.type || '').trim()
    if (type && !/common stock|etf|adr|reit/i.test(type)) continue
    seen.add(sym)
    const display = String(row?.displaySymbol || sym).trim().toUpperCase() || sym
    out.push({
      symbol: sym,
      display_symbol: display,
      asset_class: 'stock',
      name: String(row?.description || display).trim(),
      exchange: 'US',
    })
  }

  return out
}

/** US equities + top crypto — cached 24h for client-side cashtag search (no per-keystroke API). */
export async function marketSymbolUniverse(): Promise<{
  updated_at: string
  rows: MarketSymbolUniverseRow[]
}> {
  if (symbolUniverseCache && symbolUniverseCache.expires > Date.now()) {
    return { updated_at: symbolUniverseCache.updated_at, rows: symbolUniverseCache.rows }
  }

  const [stocks, cryptos] = await Promise.all([
    finnhubUsStockUniverse().catch(() => [] as MarketSymbolUniverseRow[]),
    coingeckoCryptoUniverse().catch(() => []),
  ])

  const rows: MarketSymbolUniverseRow[] = [
    ...stocks,
    ...cryptos.map((row) => ({
      symbol: row.symbol,
      display_symbol: row.display_symbol,
      asset_class: 'crypto' as const,
      name: row.description,
      exchange: 'Crypto',
      coin_id: row.coin_id || undefined,
      logo_url: row.logo_url || undefined,
    })),
  ].map((row) => withCashtagRowLogo(row))

  const updated_at = new Date().toISOString()
  symbolUniverseCache = { rows, updated_at, expires: Date.now() + SYMBOL_UNIVERSE_TTL_MS }
  return { updated_at, rows }
}

/** Prefer US root ticker for logo lookup (AAPL.TO → AAPL). */
export function logoProfileSymbol(symbol: string, assetClass: MarketAssetClass): string {
  if (assetClass === 'crypto') return finnhubSymbolForAsset(symbol, assetClass)
  const bare = String(symbol || '').trim().toUpperCase()
  const dot = bare.indexOf('.')
  if (dot > 0) return bare.slice(0, dot)
  return finnhubSymbolForAsset(symbol, assetClass)
}

/** Cashtag picker enrich — Finnhub quote/profile first; Yahoo bundled row as fallback. */
type PickerEnrichFields = {
  logo_url: string
  name: string
  exchange: string
  market_cap: number | null
  price: number | null
  change_pct: number | null
  currency: string
}

const pickerEnrichCache = new Map<string, PickerEnrichFields & { expires: number }>()
const stockLogoCache = new Map<string, { logo: string; expires: number }>()

function pickerEnrichCacheKey(assetClass: MarketAssetClass, symbol: string): string {
  return `${assetClass}:${symbol}`.toLowerCase()
}

/** Finnhub profile2 logo — deduped per US root (AAPL.TO → AAPL). Yahoo chart often omits logos. */
export async function finnhubStockLogoUrl(symbol: string): Promise<string> {
  const lookup = logoProfileSymbol(symbol, 'stock')
  const cacheKey = lookup.toLowerCase()
  const cached = stockLogoCache.get(cacheKey)
  if (cached && cached.expires > Date.now()) return cached.logo

  let logo = ''
  try {
    const profile = await finnhubProfile(lookup, 'stock')
    logo = String(profile.logo || '')
  } catch {
    logo = ''
  }

  stockLogoCache.set(cacheKey, { logo, expires: Date.now() + PICKER_ENRICH_CACHE_TTL_MS })
  return logo
}

async function enrichStockPickerFieldsFromYahoo(
  symbol: string,
  logo_url: string,
): Promise<PickerEnrichFields | null> {
  const row = await yahooStockPickerRow(symbol)
  if (!row) return null

  const rate = (await yahooFxRateToUsd(row.currency).catch(() => null)) ?? 1
  const toUsd = (n: number | null) => {
    if (n == null || !Number.isFinite(n)) return null
    if (row.currency === 'USD' || rate === 1) return n
    return n * rate
  }

  let resolvedLogo = logo_url
  if (!resolvedLogo) resolvedLogo = row.logo
  if (!resolvedLogo) resolvedLogo = await finnhubStockLogoUrl(symbol)

  return {
    logo_url: resolvedLogo,
    name: row.name,
    exchange: row.exchange,
    market_cap: toUsd(row.market_cap),
    price: toUsd(row.price),
    change_pct: row.change_pct,
    currency: 'USD',
  }
}

async function enrichStockPickerFields(
  symbol: string,
  opts?: { logo_url?: string },
): Promise<PickerEnrichFields | null> {
  const cacheKey = pickerEnrichCacheKey('stock', symbol)
  const cached = pickerEnrichCache.get(cacheKey)
  if (cached && cached.expires > Date.now()) {
    const { expires: _e, ...fields } = cached
    return fields
  }

  let logo_url = String(opts?.logo_url || '').trim()
  let fields: PickerEnrichFields | null = null

  try {
    const [profile, quote] = await Promise.all([
      finnhubProfile(symbol, 'stock'),
      finnhubQuote(symbol, 'stock'),
    ])
    const currency = embedQuoteCurrency(profile.exchange, profile.currency)
    const [quoteUsd, marketCapUsd] = await Promise.all([
      normalizeMarketQuoteToUsd(quote, currency),
      normalizeMarketCapToUsd(profile.marketCapitalization, currency),
    ])
    const price = quoteUsd.price != null && Number.isFinite(quoteUsd.price) && quoteUsd.price > 0
      ? quoteUsd.price
      : null

    if (price != null) {
      if (!logo_url) logo_url = String(profile.logo || '').trim()
      if (!logo_url) logo_url = await finnhubStockLogoUrl(symbol)
      fields = {
        logo_url,
        name: profile.name,
        exchange: profile.exchange,
        market_cap: marketCapUsd,
        price,
        change_pct: quote.change_pct,
        currency: 'USD',
      }
    }
  } catch {
    fields = null
  }

  if (!fields?.price) {
    fields = await enrichStockPickerFieldsFromYahoo(symbol, logo_url)
  }

  if (!fields) return null

  pickerEnrichCache.set(cacheKey, { ...fields, expires: Date.now() + PICKER_ENRICH_CACHE_TTL_MS })
  return fields
}

/** Logo-only enrich for cashtag typeahead — registry/R2 first; Finnhub logo, then Yahoo. */
export async function enrichSearchResultsLogosOnly<
  T extends {
    symbol: string
    asset_class: MarketAssetClass
    logo_url?: string
    coin_id?: string
    display_symbol?: string
  },
>(results: T[]): Promise<Array<T & { logo_url: string }>> {
  return Promise.all(
    results.map(async (row) => {
      let logo_url = String(row.logo_url || '').trim()
      if (isGuessedFinnhubStockLogoUrl(logo_url)) logo_url = ''
      if (logo_url) return { ...row, logo_url }

      if (row.asset_class === 'crypto') {
        logo_url = coingeckoLogoUrlForCoinId(String(row.coin_id || ''))
        if (!logo_url) logo_url = await coingeckoCryptoLogo(row.symbol)
        return { ...row, logo_url: logo_url || '' }
      }

      if (
        isSpdrMarketInstrument({
          asset_class: 'stock',
          name: String(row.description || row.display_symbol || row.symbol || ''),
          display_symbol: row.display_symbol,
          symbol: row.symbol,
        })
      ) {
        return { ...row, logo_url: spdrIssuerLogoUrl() }
      }
      logo_url = await finnhubStockLogoUrl(row.symbol)
      if (!logo_url) {
        const yahoo = await yahooStockPickerRow(row.symbol).catch(() => null)
        logo_url = String(yahoo?.logo || '').trim()
      }
      if (!logo_url) {
        logo_url = String(await fmpStockLogoUrl(row.symbol).catch(() => '')).trim()
      }
      return { ...row, logo_url: logo_url || '' }
    }),
  )
}

export async function enrichSearchResultsForPicker<
  T extends {
    symbol: string
    asset_class: MarketAssetClass
    display_symbol?: string
    description?: string
    type?: string
    logo_url?: string
    coin_id?: string
  },
>(
  results: T[],
): Promise<
  Array<
    T & {
      logo_url: string
      name: string
      exchange: string
      market_cap: number | null
      price: number | null
      change_pct: number | null
      currency: string
    }
  >
> {
  const cryptoRows = results.filter((r) => r.asset_class === 'crypto')
  const stockRows = results.filter((r) => r.asset_class !== 'crypto')

  const cryptoCoinIds: string[] = []
  const cryptoIdByKey = new Map<string, string>()
  for (const row of cryptoRows) {
    const key = pickerEnrichCacheKey(row.asset_class, row.symbol)
    const cached = pickerEnrichCache.get(key)
    if (cached && cached.expires > Date.now()) continue

    let coinId = String(row.coin_id || '').trim()
    if (!coinId) {
      try {
        coinId = (await coingeckoCryptoProfile(row.symbol)).coinId
      } catch {
        coinId = ''
      }
    }
    if (coinId) {
      cryptoCoinIds.push(coinId)
      cryptoIdByKey.set(key, coinId)
    }
  }

  const batchQuotes = await coingeckoBatchPickerQuotes(cryptoCoinIds)

  const stockFieldsByKey = new Map<string, PickerEnrichFields | null>()
  await Promise.all(
    stockRows.map(async (row) => {
      const key = pickerEnrichCacheKey(row.asset_class, row.symbol)
      const cached = pickerEnrichCache.get(key)
      if (cached && cached.expires > Date.now()) {
        const { expires: _e, ...fields } = cached
        stockFieldsByKey.set(key, fields)
        return
      }
      const registryLogo = String(row.logo_url || '').trim()
      stockFieldsByKey.set(key, await enrichStockPickerFields(row.symbol, { logo_url: registryLogo }))
    }),
  )

  return results.map((row) => {
    const key = pickerEnrichCacheKey(row.asset_class, row.symbol)
    const baseLogo = String(row.logo_url || '').trim()
    const fallbackName = String(row.description || row.display_symbol || row.symbol)
    const fallbackExchange = String(row.type || row.asset_class || '')

    const cached = pickerEnrichCache.get(key)
    if (cached && cached.expires > Date.now()) {
      const { expires: _e, ...fields } = cached
      return {
        ...row,
        ...fields,
        logo_url: fields.logo_url || baseLogo,
        name: fields.name || fallbackName,
        exchange: fields.exchange || fallbackExchange,
      }
    }

    if (row.asset_class === 'crypto') {
      const coinId = cryptoIdByKey.get(key) || String(row.coin_id || '').trim()
      const quote = coinId ? batchQuotes.get(coinId) : undefined
      const fields: PickerEnrichFields = {
        logo_url: baseLogo,
        name: fallbackName,
        exchange: 'Crypto',
        market_cap: quote?.market_cap ?? null,
        price: quote?.price ?? null,
        change_pct: quote?.change_pct ?? null,
        currency: 'USD',
      }
      pickerEnrichCache.set(key, { ...fields, expires: Date.now() + PICKER_ENRICH_CACHE_TTL_MS })
      return { ...row, ...fields }
    }

    const stockFields = stockFieldsByKey.get(key)
    if (stockFields) {
      return {
        ...row,
        ...stockFields,
        logo_url: stockFields.logo_url || baseLogo,
        name: stockFields.name || fallbackName,
        exchange: stockFields.exchange || fallbackExchange,
      }
    }

    return {
      ...row,
      logo_url: baseLogo,
      name: fallbackName,
      exchange: fallbackExchange,
      market_cap: null,
      price: null,
      change_pct: null,
      currency: 'USD',
    }
  })
}

/** @deprecated Prefer enrichSearchResultsForPicker. */
export async function enrichSearchResultsWithLogos<
  T extends { symbol: string; asset_class: MarketAssetClass; logo_url?: string },
>(results: T[]): Promise<Array<T & { logo_url: string }>> {
  const enriched = await enrichSearchResultsForPicker(results)
  return enriched
}

export async function finnhubProfile(symbol: string, assetClass: MarketAssetClass): Promise<MarketProfile> {
  const finnhubSym = finnhubSymbolForAsset(symbol, assetClass)
  if (assetClass === 'crypto') {
    const cg = await coingeckoCryptoProfile(finnhubSym)
    const display = normalizeDisplaySymbol(finnhubSym, assetClass)
    return {
      name: cg.name || display,
      exchange: 'Crypto',
      logo: cg.logo,
      marketCapitalization: cg.marketCapUsd,
      currency: 'USD',
      coinId: cg.coinId || coingeckoCoinIdForTicker(display) || undefined,
    }
  }
  try {
    const data = await finnhubFetch('/stock/profile2', { symbol: finnhubSym })
    const display = normalizeDisplaySymbol(finnhubSym, 'stock')
    let name = String(data?.name || '').trim()
    let logo = String(data?.logo || '').trim()
    if (isGuessedFinnhubStockLogoUrl(logo)) logo = ''
    let exchange = String(data?.exchange || '').trim()
    let currency = String(data?.currency || 'USD').trim() || 'USD'
    let marketCapitalization =
      data?.marketCapitalization != null ? Number(data.marketCapitalization) * 1_000_000 : null

    const nameWeak =
      !name ||
      name.toUpperCase() === display.toUpperCase() ||
      name.toUpperCase() === String(finnhubSym).toUpperCase()
    const mcapWeak =
      marketCapitalization == null || !Number.isFinite(marketCapitalization) || marketCapitalization <= 0

    // Finnhub often returns empty/weak ETF profiles (GLD → name=GLD, no logo).
    // Yahoo fills longName/mcap; logos are often missing for SPDR ETFs — FMP has them.
    if (nameWeak || !logo || mcapWeak || !exchange) {
      const yahoo = await yahooStockProfile(symbol).catch(() => null)
      if (yahoo) {
        if (nameWeak && yahoo.name) name = String(yahoo.name).trim()
        if (!logo && yahoo.logo) logo = String(yahoo.logo).trim()
        if (!exchange && yahoo.exchange) exchange = String(yahoo.exchange).trim()
        if (mcapWeak && yahoo.marketCapitalization != null && yahoo.marketCapitalization > 0) {
          marketCapitalization = yahoo.marketCapitalization
        }
        if (yahoo.currency) currency = String(yahoo.currency).trim() || currency
      }
    }
    if (!logo) {
      logo = String(await fmpStockLogoUrl(display || finnhubSym).catch(() => '')).trim()
    }
    const resolvedName = name || display || finnhubSym
    if (
      isSpdrMarketInstrument({
        asset_class: 'stock',
        name: resolvedName,
        display_symbol: display,
        symbol: finnhubSym,
      })
    ) {
      logo = spdrIssuerLogoUrl()
    }

    return {
      name: resolvedName,
      exchange,
      logo,
      marketCapitalization,
      currency,
    }
  } catch {
    const yahoo = await yahooStockProfile(symbol).catch(() => null)
    if (yahoo) {
      let logo = String(yahoo.logo || '').trim()
      if (!logo) {
        logo = String(await fmpStockLogoUrl(symbol).catch(() => '')).trim()
      }
      const resolvedName = String(yahoo.name || symbol).trim()
      if (
        isSpdrMarketInstrument({
          asset_class: 'stock',
          name: resolvedName,
          display_symbol: normalizeDisplaySymbol(finnhubSym, 'stock'),
          symbol: finnhubSym,
        })
      ) {
        logo = spdrIssuerLogoUrl()
      }
      return { ...yahoo, name: resolvedName || yahoo.name, logo }
    }
    throw new Error(`Profile unavailable for ${finnhubSym}`)
  }
}

/** Fresh USD market cap for modal header — not served from registry cold cache. */
export async function fetchLiveMarketCapUsd(
  symbol: string,
  assetClass: MarketAssetClass,
  coinId?: string,
): Promise<number | null> {
  if (assetClass === 'crypto') {
    const finnhubSym = finnhubSymbolForAsset(symbol, assetClass)
    const display = normalizeDisplaySymbol(finnhubSym, assetClass)
    const id = String(coinId || '').trim() || coingeckoCoinIdForTicker(display)
    if (!id) return null
    return coingeckoMarketCapUsd(id)
  }
  const yahoo = await yahooStockProfile(symbol)
  if (yahoo?.marketCapitalization != null && yahoo.marketCapitalization > 0) {
    return yahoo.marketCapitalization
  }
  return null
}

export async function finnhubQuote(symbol: string, assetClass: MarketAssetClass) {
  const finnhubSym = finnhubSymbolForAsset(symbol, assetClass)
  if (assetClass === 'crypto') {
    const data = await finnhubFetch('/quote', { symbol: finnhubSym })
    const price = Number(data?.c)
    const change = Number(data?.d)
    const changePct = Number(data?.dp)
    return {
      price: Number.isFinite(price) ? price : 0,
      change: Number.isFinite(change) ? change : 0,
      change_pct: Number.isFinite(changePct) ? changePct : 0,
      as_of: new Date().toISOString(),
    }
  }
  try {
    const data = await finnhubFetch('/quote', { symbol: finnhubSym })
    const price = Number(data?.c)
    const change = Number(data?.d)
    const changePct = Number(data?.dp)
    return {
      price: Number.isFinite(price) ? price : 0,
      change: Number.isFinite(change) ? change : 0,
      change_pct: Number.isFinite(changePct) ? changePct : 0,
      as_of: new Date().toISOString(),
    }
  } catch {
    const yahoo = await yahooStockQuote(symbol)
    if (yahoo) return yahoo
    throw new Error(`Quote unavailable for ${finnhubSym}`)
  }
}

export async function finnhubCandles(
  symbol: string,
  assetClass: MarketAssetClass,
  windowKey: MarketWindowKey,
): Promise<MarketBar[]> {
  try {
    const finnhubSym = finnhubSymbolForAsset(symbol, assetClass)
    const { fromSec, toSec, resolution } = windowRange(windowKey)
    const candidates = [resolution, ...(RESOLUTION_FALLBACKS[windowKey] || [])]
    const seen = new Set<string>()
    for (const res of candidates) {
      if (seen.has(res)) continue
      seen.add(res)
      const bars = await fetchFinnhubCandlesAtResolution(
        finnhubSym,
        assetClass,
        fromSec,
        toSec,
        res,
      )
      if (bars.length >= 2) return bars
    }
    return []
  } catch {
    return []
  }
}

function escapeXml(s: string) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

export function barsToSparklinePath(bars: MarketBar[], width: number, height: number): string {
  if (!bars.length) return ''
  const closes = bars.map((b) => b.c)
  const min = Math.min(...closes)
  const max = Math.max(...closes)
  const span = max - min || 1
  const pad = 4
  const w = width - pad * 2
  const h = height - pad * 2
  return closes
    .map((c, i) => {
      const x = pad + (i / Math.max(1, closes.length - 1)) * w
      const y = pad + h - ((c - min) / span) * h
      return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`
    })
    .join(' ')
}

function normalizeFxCurrency(raw: string): string {
  const c = String(raw || 'USD').trim().toUpperCase()
  return c || 'USD'
}

/** NYSE/NASDAQ listings are quoted in USD on Yahoo even when Finnhub profile currency differs. */
export function isUsListing(exchange: string): boolean {
  const e = String(exchange || '').trim().toUpperCase()
  if (!e) return false
  return (
    e === 'NYSE' ||
    e === 'NASDAQ' ||
    e === 'AMEX' ||
    e === 'BATS' ||
    e === 'NYQ' ||
    e === 'NMS' ||
    e === 'NGM' ||
    e === 'NCM' ||
    e.includes('NEW YORK') ||
    e.includes('NASDAQ')
  )
}

export function embedQuoteCurrency(exchange: string, profileCurrency: string): string {
  if (isUsListing(exchange)) return 'USD'
  return normalizeFxCurrency(profileCurrency)
}

const fxToUsdCache = new Map<string, { rate: number; at: number }>()
const FX_TO_USD_TTL_MS = 15 * 60 * 1000

/** USD per one unit of `currency` (USD → 1). */
export async function fxRateToUsd(currency: string): Promise<number> {
  const ccy = normalizeFxCurrency(currency)
  if (ccy === 'USD') return 1

  const hit = fxToUsdCache.get(ccy)
  if (hit && Date.now() - hit.at < FX_TO_USD_TTL_MS) return hit.rate

  let rate = Number.NaN
  try {
    const local = await finnhubFetch('/forex/rates', { base: ccy })
    rate = Number((local as { quote?: Record<string, number> })?.quote?.USD)
  } catch {
    /* fallback below */
  }
  if (!Number.isFinite(rate) || rate <= 0) {
    try {
      const usd = await finnhubFetch('/forex/rates', { base: 'USD' })
      const perUsd = Number((usd as { quote?: Record<string, number> })?.quote?.[ccy])
      if (Number.isFinite(perUsd) && perUsd > 0) rate = 1 / perUsd
    } catch {
      /* fallback below */
    }
  }
  if (!Number.isFinite(rate) || rate <= 0) {
    const yahoo = await yahooFxRateToUsd(ccy)
    if (yahoo != null && yahoo > 0) rate = yahoo
  }
  if (!Number.isFinite(rate) || rate <= 0) {
    throw new Error(`FX rate unavailable for ${ccy}`)
  }

  fxToUsdCache.set(ccy, { rate, at: Date.now() })
  return rate
}

type MarketQuote = MarketEmbed['quote']

export async function normalizeMarketQuoteToUsd(quote: MarketQuote, currency: string): Promise<MarketQuote> {
  const rate = await fxRateToUsd(currency)
  if (rate === 1) return quote
  return {
    ...quote,
    price: quote.price * rate,
    change: quote.change * rate,
  }
}

export async function normalizeMarketBarsToUsd(bars: MarketBar[], currency: string): Promise<MarketBar[]> {
  const rate = await fxRateToUsd(currency)
  if (rate === 1) return bars
  return bars.map((b) => ({ ...b, c: b.c * rate }))
}

export async function normalizeMarketCapToUsd(
  cap: number | null,
  currency: string,
): Promise<number | null> {
  if (cap == null || !Number.isFinite(cap)) return cap
  const rate = await fxRateToUsd(currency)
  return cap * rate
}

export async function normalizeMarketSeriesToUsd(
  quote: MarketQuote,
  bars: MarketBar[],
  currency: string,
): Promise<{ quote: MarketQuote; bars: MarketBar[] }> {
  const ccy = normalizeFxCurrency(currency)
  if (ccy === 'USD') return { quote, bars }
  const [quoteUsd, barsUsd] = await Promise.all([
    normalizeMarketQuoteToUsd(quote, ccy),
    normalizeMarketBarsToUsd(bars, ccy),
  ])
  return { quote: quoteUsd, bars: barsUsd }
}

export function buildMarketOgSvg(embed: MarketEmbed): string {
  const up = embed.quote.change_pct >= 0
  const color = up ? '#22c55e' : '#ef4444'
  const path = barsToSparklinePath(
    embed.bars.length ? embed.bars : [{ t: 0, c: embed.quote.price }, { t: 1, c: embed.quote.price }],
    600,
    280,
  )
  const price = embed.quote.price.toLocaleString(undefined, { maximumFractionDigits: 2 })
  const pct = `${embed.quote.change_pct >= 0 ? '+' : ''}${embed.quote.change_pct.toFixed(2)}%`
  const title = `${embed.display_symbol} · ${embed.window_label}`
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <rect width="1200" height="630" fill="#09090b"/>
  <text x="64" y="120" fill="#fafafa" font-family="system-ui,sans-serif" font-size="56" font-weight="700">${escapeXml(title)}</text>
  <text x="64" y="190" fill="#a1a1aa" font-family="system-ui,sans-serif" font-size="32">${escapeXml(embed.name)}</text>
  <text x="64" y="280" fill="#fafafa" font-family="system-ui,sans-serif" font-size="72" font-weight="700">$${escapeXml(price)}</text>
  <text x="64" y="340" fill="${color}" font-family="system-ui,sans-serif" font-size="40" font-weight="600">${escapeXml(pct)}</text>
  <path d="${path}" fill="none" stroke="${color}" stroke-width="4" transform="translate(64,380) scale(1.8,1)"/>
</svg>`
}

export async function buildMarketEmbed(
  symbol: string,
  assetClass: MarketAssetClass,
  caption: string,
): Promise<MarketEmbed> {
  const window = parseCaptionMarketWindow(caption)
  const candleWindow = window.kind === 'historical' ? window.windowKey : '24h'
  const [profile, quote] = await Promise.all([
    finnhubProfile(symbol, assetClass),
    finnhubQuote(symbol, assetClass),
  ])
  const bars = await resolveMarketBars(symbol, assetClass, candleWindow, quote, {
    coinId: assetClass === 'crypto' ? profile.coinId : undefined,
  })
  let quoteOut = {
    price: quote.price,
    change_pct: quote.change_pct,
    change: quote.change,
    as_of: quote.as_of,
  }
  if (bars.length >= 2) {
    const first = bars[0].c
    const last = bars[bars.length - 1].c
    if (first > 0) {
      const changePct = ((last - first) / first) * 100
      quoteOut = {
        price: last,
        change_pct: changePct,
        change: last - first,
        as_of: quote.as_of,
      }
    }
  }
  const display = normalizeDisplaySymbol(finnhubSymbolForAsset(symbol, assetClass), assetClass)
  const currency = embedQuoteCurrency(profile.exchange, profile.currency)
  const [quoteUsd, barsUsd, marketCapUsd] = await Promise.all([
    normalizeMarketQuoteToUsd(quoteOut, currency),
    normalizeMarketBarsToUsd(bars, currency),
    normalizeMarketCapToUsd(profile.marketCapitalization, currency),
  ])
  const windowLabel =
    window.kind === 'historical'
      ? formatMarketWindowDateLabel(window.windowKey, barsUsd)
      : window.windowLabel
  return {
    symbol: finnhubSymbolForAsset(symbol, assetClass),
    display_symbol: display,
    asset_class: assetClass,
    name: profile.name,
    exchange: profile.exchange,
    logo_url: profile.logo,
    market_cap: marketCapUsd,
    currency: 'USD',
    kind: window.kind,
    window_key: window.windowKey,
    window_label: windowLabel,
    quote: quoteUsd,
    bars: barsUsd,
    og_image_url: '',
    ...(assetClass === 'crypto' && profile.coinId ? { coin_id: profile.coinId } : {}),
    metadata_as_of: new Date().toISOString(),
  }
}

export async function buildRollingBatchPayload(
  symbol: string,
  assetClass: MarketAssetClass,
  opts?: { coinId?: string },
): Promise<{ quote: MarketEmbed['quote']; bars: MarketBar[]; window_label: string }> {
  // Rolling poll: quote + mini-chart only — name/logo/mcap/currency come from attach embed.
  const currency = 'USD'
  const quote = await finnhubQuote(symbol, assetClass)
  const bars = await resolveMarketBars(symbol, assetClass, '24h', quote, { coinId: opts?.coinId })
  let changePct = quote.change_pct
  let quoteOut: MarketEmbed['quote'] = { ...quote }
  if (bars.length >= 2) {
    const first = bars[0].c
    const last = bars[bars.length - 1].c
    if (first > 0) {
      changePct = ((last - first) / first) * 100
      quoteOut = {
        price: last,
        change_pct: changePct,
        change: last - first,
        as_of: quote.as_of,
      }
    } else {
      quoteOut = { ...quote, change_pct: changePct }
    }
  }
  const normalized = await normalizeMarketSeriesToUsd(quoteOut, bars, currency)
  const windowLabel =
    assetClass === 'stock'
      ? isUsEquityRegularSessionOpen()
        ? 'Today'
        : lastRegularSessionLabel()
      : '24h'
  return {
    window_label: windowLabel,
    quote: normalized.quote,
    bars: normalized.bars,
  }
}

export type MarketNewsItem = {
  headline: string
  source: string
  url: string
  datetime: number
  summary?: string
}

const COMPANY_NEWS_LOOKBACK_DAYS = 30

function parseFinnhubNewsRow(row: unknown): MarketNewsItem | null {
  if (!row || typeof row !== 'object') return null
  const r = row as Record<string, unknown>
  const headline = String(r.headline || '').trim()
  if (!headline) return null
  return {
    headline,
    source: String(r.source || r.category || 'News').trim() || 'News',
    url: String(r.url || r.link || '').trim(),
    datetime: Number(r.datetime) || 0,
    summary: r.summary ? String(r.summary).trim() : undefined,
  }
}

async function finnhubStockCompanyNews(symbol: string): Promise<MarketNewsItem | null> {
  const finnhubSym = logoProfileSymbol(symbol, 'stock')
  const now = new Date()
  const from = new Date(now.getTime() - COMPANY_NEWS_LOOKBACK_DAYS * 86400000)
  try {
    const data = await finnhubFetch('/company-news', {
      symbol: finnhubSym,
      from: from.toISOString().slice(0, 10),
      to: now.toISOString().slice(0, 10),
    })
    const rows = (Array.isArray(data) ? data : [])
      .map(parseFinnhubNewsRow)
      .filter(Boolean) as MarketNewsItem[]
    rows.sort((a, b) => b.datetime - a.datetime)
    return rows[0] || null
  } catch {
    return null
  }
}

async function finnhubCryptoCategoryNews(display: string): Promise<MarketNewsItem | null> {
  try {
    const data = await finnhubFetch('/news', { category: 'crypto' })
    const rows = Array.isArray(data) ? data : []
    const needle = display.toLowerCase()
    const match =
      rows.find((row) => {
        if (!row || typeof row !== 'object') return false
        const h = String((row as Record<string, unknown>).headline || '').toLowerCase()
        const s = String((row as Record<string, unknown>).summary || '').toLowerCase()
        return (
          h.includes(`$${needle}`) ||
          h.includes(needle) ||
          s.includes(`$${needle}`) ||
          s.includes(needle)
        )
      }) || null
    return parseFinnhubNewsRow(match)
  } catch {
    return null
  }
}

/** Latest headline for modal news bullet — Finnhub first, Yahoo fallback when empty/forbidden. */
export async function finnhubLatestNews(
  symbol: string,
  assetClass: MarketAssetClass,
): Promise<MarketNewsItem | null> {
  const display = normalizeDisplaySymbol(finnhubSymbolForAsset(symbol, assetClass), assetClass)
  if (!display) return null

  if (assetClass === 'stock') {
    const finnhub = await finnhubStockCompanyNews(symbol)
    if (finnhub) return finnhub
    const yahoo = await yahooLatestNews(symbol)
    if (!yahoo) return null
    return {
      headline: yahoo.headline,
      source: yahoo.source,
      url: yahoo.url,
      datetime: yahoo.datetime,
    }
  }

  const finnhub = await finnhubCryptoCategoryNews(display)
  if (finnhub) return finnhub
  const yahoo = await yahooLatestNews(display)
  if (!yahoo) return null
  return {
    headline: yahoo.headline,
    source: yahoo.source,
    url: yahoo.url,
    datetime: yahoo.datetime,
  }
}

const MARKET_CASHTAG_ATTACH_RE = /^[A-Z][A-Z0-9.-]{0,14}$/

export type CashtagDisambiguationCandidate = {
  symbol: string
  asset_class: MarketAssetClass
  display_symbol: string
  name: string
  exchange: string
  market_cap: number | null
  logo_url: string
  price: number | null
  change_pct: number | null
  currency: string
}

export type CashtagDisambiguationResult = {
  tag: string
  ambiguous: boolean
  suggested: { symbol: string; asset_class: MarketAssetClass; display_symbol: string } | null
  candidates: CashtagDisambiguationCandidate[]
}

function mapEnrichedToCashtagCandidate(
  row: Awaited<ReturnType<typeof enrichSearchResultsForPicker>>[number],
): CashtagDisambiguationCandidate {
  return {
    symbol: row.symbol,
    asset_class: row.asset_class,
    display_symbol: marketSearchRowDisplay(row),
    name: String(row.name || row.description || row.display_symbol || row.symbol),
    exchange: String(row.exchange || row.type || row.asset_class || ''),
    market_cap: row.market_cap ?? null,
    logo_url: String(row.logo_url || ''),
    price: row.price ?? null,
    change_pct: row.change_pct ?? null,
    currency: String(row.currency || 'USD'),
  }
}

function dedupeAttachCandidates<
  T extends { symbol: string; asset_class: MarketAssetClass },
>(rows: T[]): T[] {
  const seen = new Set<string>()
  const out: T[] = []
  for (const row of rows) {
    const key = attachDedupeKey(row.symbol, row.asset_class)
    if (seen.has(key)) continue
    seen.add(key)
    out.push(row)
  }
  return out
}

function countExactCashtagTickerMatches(
  tag: string,
  rows: Array<{ symbol: string; asset_class: MarketAssetClass; display_symbol?: string }>,
): number {
  return rows.filter((row) => cashtagRowMatchesTicker(tag, row)).length
}

function evaluateCashtagAmbiguity(
  tag: string,
  sorted: Array<{ symbol: string; asset_class: MarketAssetClass; market_cap?: number | null } & Record<string, unknown>>,
  suggested: { symbol: string; asset_class: MarketAssetClass } | null,
): boolean {
  if (sorted.length <= 1) return false

  const distinct = dedupeAttachCandidates(sorted)
  if (distinct.length <= 1) return false

  const hasStock = distinct.some((r) => r.asset_class === 'stock')
  const hasCrypto = distinct.some((r) => r.asset_class === 'crypto')
  if (hasStock && hasCrypto) return true

  if (countExactCashtagTickerMatches(tag, distinct) >= 2) return true

  const s0 = cashtagAttachSortScore(tag, distinct[0])
  const s1 = cashtagAttachSortScore(tag, distinct[1])
  if (s1 - s0 <= CASHTAG_SCORE_AMBIGUITY_DELTA) return true

  if (suggested?.asset_class === 'crypto') {
    const largeStock = distinct.find(
      (r) => r.asset_class === 'stock' && Number(r.market_cap) >= LARGE_CAP_STOCK_USD,
    )
    const suggestedRow = distinct.find((r) => r.symbol === suggested.symbol && r.asset_class === 'crypto')
    const cryptoCap = Number(suggestedRow?.market_cap)
    if (largeStock && (!Number.isFinite(cryptoCap) || cryptoCap < MICRO_CAP_CRYPTO_USD)) return true
  }

  return false
}

type CashtagPoolRow = {
  symbol: string
  asset_class: MarketAssetClass
  display_symbol?: string
  description?: string
  type?: string
}

function mergeCashtagPoolRow(pool: CashtagPoolRow[], row: CashtagPoolRow | null | undefined): void {
  if (!row?.symbol) return
  const key = attachDedupeKey(row.symbol, row.asset_class)
  if (pool.some((p) => attachDedupeKey(p.symbol, p.asset_class) === key)) return
  pool.push(row)
}

/** Merge exact ticker hits, Yahoo equity, top stock + top crypto from search (compose disambiguation). */
function buildCashtagDisambiguationPool(
  tag: string,
  results: CashtagPoolRow[],
  yahooEquity: { symbol: string; asset_class: 'stock' } | null,
): CashtagPoolRow[] {
  const pool: CashtagPoolRow[] = []

  for (const row of results) {
    if (isTokenizedMarketSearchRow(row)) continue
    if (cashtagRowMatchesTicker(tag, row)) mergeCashtagPoolRow(pool, row)
  }

  if (yahooEquity) {
    mergeCashtagPoolRow(pool, {
      symbol: yahooEquity.symbol,
      asset_class: 'stock',
      display_symbol: tag,
      description: '',
      type: 'EQUITY',
    })
  }

  const topStock = results.find((row) => row.asset_class === 'stock' && !isTokenizedMarketSearchRow(row))
  const topCrypto = results.find((row) => row.asset_class === 'crypto' && !isTokenizedMarketSearchRow(row))
  mergeCashtagPoolRow(pool, topStock)
  mergeCashtagPoolRow(pool, topCrypto)

  if (isCommonCryptoCashtag(tag)) {
    mergeCashtagPoolRow(pool, {
      symbol: finnhubSymbolForAsset(tag, 'crypto'),
      asset_class: 'crypto',
      display_symbol: tag,
      description: 'Cryptocurrency',
      type: 'crypto',
    })
  }

  if (pool.length) return pool.slice(0, 10)

  return results.filter((row) => !isTokenizedMarketSearchRow(row)).slice(0, 8)
}

/** Compose-time cashtag resolution: candidates + ambiguity flag (picker overrides attach). */
export async function resolveCashtagDisambiguation(tag: string): Promise<CashtagDisambiguationResult> {
  const upper = String(tag || '').trim().toUpperCase()
  if (!upper || !MARKET_CASHTAG_ATTACH_RE.test(upper)) {
    return { tag: upper, ambiguous: false, suggested: null, candidates: [] }
  }

  const [yahooEquity, results] = await Promise.all([
    yahooResolveUsEquityCashtag(upper).catch(() => null),
    marketSearch(upper),
  ])

  const pool = buildCashtagDisambiguationPool(upper, results, yahooEquity)

  if (!pool.length) {
    const resolved = await resolveCashtagTicker(upper)
    return {
      tag: upper,
      ambiguous: false,
      suggested: resolved ? { ...resolved, display_symbol: upper } : null,
      candidates: [],
    }
  }

  const enriched = await enrichSearchResultsForPicker(pool.slice(0, 10))
  const sorted = [...enriched]
    .filter((row) => !isTokenizedMarketSearchRow(row))
    .sort((a, b) => cashtagAttachSortScore(upper, a) - cashtagAttachSortScore(upper, b))
  const viable = dedupeAttachCandidates(sorted)

  const best = viable[0]
  const suggested = best
    ? {
        symbol: best.symbol,
        asset_class: best.asset_class,
        display_symbol: upper,
      }
    : null
  const ambiguous = evaluateCashtagAmbiguity(upper, viable, suggested)

  return {
    tag: upper,
    ambiguous,
    suggested,
    candidates: viable.slice(0, 6).map(mapEnrichedToCashtagCandidate),
  }
}

export async function resolveCashtagsDisambiguationBatch(
  tags: string[],
): Promise<Record<string, CashtagDisambiguationResult>> {
  const seen = new Set<string>()
  const unique: string[] = []
  for (const raw of tags) {
    const t = String(raw || '').trim().toUpperCase()
    if (!t || seen.has(t)) continue
    seen.add(t)
    unique.push(t)
  }
  const out: Record<string, CashtagDisambiguationResult> = {}
  for (const tag of unique.slice(0, MARKET_EMBED_MAX)) {
    out[tag] = await resolveCashtagDisambiguation(tag)
  }
  return out
}
