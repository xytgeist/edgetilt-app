/**
 * Yahoo Finance chart API fallback for US stock candles, quotes, and FX.
 * Finnhub free tier often blocks `/stock/candle`, `/quote`, and `/forex/rates`; Yahoo needs no API key.
 */

const YAHOO_CHART = 'https://query1.finance.yahoo.com/v8/finance/chart'
const YAHOO_SEARCH = 'https://query1.finance.yahoo.com/v1/finance/search'
const MAX_BARS = 120

export type YahooBar = { t: number; c: number }

export type YahooStockProfile = {
  name: string
  exchange: string
  logo: string
  marketCapitalization: number | null
  currency: string
}

export type YahooStockQuote = {
  price: number
  change: number
  change_pct: number
  as_of: string
}

export type YahooPickerRow = {
  name: string
  exchange: string
  logo: string
  price: number | null
  change_pct: number | null
  market_cap: number | null
  currency: string
}

function yahooTicker(symbol: string): string {
  const bare = String(symbol || '').trim().toUpperCase()
  const dot = bare.indexOf('.')
  if (dot > 0) return bare.slice(0, dot)
  return bare.replace(/^BINANCE:/, '').replace(/USDT$/, '').replace(/USD$/, '')
}

const YAHOO_HEADERS = {
  Accept: 'application/json',
  'User-Agent': 'Mozilla/5.0 (compatible; LVSlotPro/1.0; +https://lvslotpro.com)',
}

async function yahooChartMetaRaw(ticker: string): Promise<Record<string, unknown> | null> {
  const sym = String(ticker || '').trim()
  if (!sym) return null

  const url = new URL(`${YAHOO_CHART}/${encodeURIComponent(sym)}`)
  url.searchParams.set('range', '1d')
  url.searchParams.set('interval', '1d')
  url.searchParams.set('includePrePost', 'false')

  try {
    const res = await fetch(url.toString(), { headers: YAHOO_HEADERS })
    if (!res.ok) return null
    const data = await res.json()
    const meta = data?.chart?.result?.[0]?.meta
    return meta && typeof meta === 'object' ? (meta as Record<string, unknown>) : null
  } catch {
    return null
  }
}

async function yahooChartMeta(symbol: string): Promise<Record<string, unknown> | null> {
  const ticker = yahooTicker(symbol)
  if (!ticker) return null
  return yahooChartMetaRaw(ticker)
}

/** Full symbol first (e.g. SFTB.NE), then US-root fallback — for picker rows. */
async function yahooChartMetaPicker(symbol: string): Promise<Record<string, unknown> | null> {
  const bare = String(symbol || '').trim().toUpperCase()
  if (!bare) return null
  let meta = await yahooChartMetaRaw(bare)
  if (meta) return meta
  const stripped = yahooTicker(bare)
  if (stripped !== bare) meta = await yahooChartMetaRaw(stripped)
  return meta
}

function yahooExchangeLabel(meta: Record<string, unknown>): string {
  const full = String(meta.fullExchangeName || '').trim()
  if (full) return full
  const short = String(meta.exchangeName || '').trim()
  if (short === 'NYQ') return 'NYSE'
  if (short === 'NMS' || short === 'NGM' || short === 'NCM') return 'NASDAQ'
  return short || 'US'
}

function yahooPickerChangePct(meta: Record<string, unknown>, price: number): number | null {
  let changePct = Number(meta.regularMarketChangePercent)
  if (Number.isFinite(changePct)) {
    // Some responses use a ratio (0.012) instead of percent (1.2).
    if (price > 0 && Math.abs(changePct) > 0 && Math.abs(changePct) < 0.5) {
      changePct *= 100
    }
    return changePct
  }
  const prev = Number(meta.chartPreviousClose ?? meta.previousClose)
  if (Number.isFinite(price) && Number.isFinite(prev) && prev > 0) {
    return ((price - prev) / prev) * 100
  }
  return null
}

/** Headline quote when Finnhub `/quote` returns 403 or empty. */
export async function yahooStockQuote(symbol: string): Promise<YahooStockQuote | null> {
  const meta = await yahooChartMeta(symbol)
  if (!meta) return null
  const price = Number(meta.regularMarketPrice)
  const change = Number(meta.regularMarketChange)
  const changePct = Number(meta.regularMarketChangePercent)
  if (!Number.isFinite(price) || price <= 0) return null
  return {
    price,
    change: Number.isFinite(change) ? change : 0,
    change_pct: Number.isFinite(changePct) ? changePct : 0,
    as_of: new Date().toISOString(),
  }
}

/** Picker/search row — one chart call for name, exchange, logo, price, change, mcap. */
export async function yahooStockPickerRow(symbol: string): Promise<YahooPickerRow | null> {
  const bare = String(symbol || '').trim().toUpperCase()
  const meta = await yahooChartMetaPicker(symbol)
  if (!meta) return null
  const name =
    String(meta.longName || meta.shortName || yahooTicker(symbol)).trim() || yahooTicker(symbol)
  const currency = String(meta.currency || 'USD').trim().toUpperCase() || 'USD'
  const price = Number(meta.regularMarketPrice)
  const changePct = yahooPickerChangePct(meta, price)
  const cap = Number(meta.marketCap)
  let logo = String(meta.logoUrl || meta.companyLogoUrl || '').trim()
  if (!logo) {
    const root = yahooTicker(bare)
    if (root && root !== bare) {
      const rootMeta = await yahooChartMetaRaw(root)
      if (rootMeta) {
        logo = String(rootMeta.logoUrl || rootMeta.companyLogoUrl || '').trim()
      }
    }
  }
  return {
    name,
    exchange: yahooExchangeLabel(meta),
    logo,
    price: Number.isFinite(price) && price > 0 ? price : null,
    change_pct: changePct,
    market_cap: Number.isFinite(cap) && cap > 0 ? cap : null,
    currency,
  }
}

/** Company metadata when Finnhub `/stock/profile2` returns 403 or empty. */
export async function yahooStockProfile(symbol: string): Promise<YahooStockProfile | null> {
  const meta = await yahooChartMeta(symbol)
  if (!meta) return null
  const name =
    String(meta.longName || meta.shortName || yahooTicker(symbol)).trim() || yahooTicker(symbol)
  const currency = String(meta.currency || 'USD').trim().toUpperCase() || 'USD'
  const cap = Number(meta.marketCap)
  return {
    name,
    exchange: yahooExchangeLabel(meta),
    logo: String(meta.logoUrl || meta.companyLogoUrl || '').trim(),
    marketCapitalization: Number.isFinite(cap) && cap > 0 ? cap : null,
    currency,
  }
}

/** USD per one unit of `currency` (USD → 1). */
export async function yahooFxRateToUsd(currency: string): Promise<number | null> {
  const ccy = String(currency || 'USD').trim().toUpperCase()
  if (!ccy || ccy === 'USD') return 1

  const direct = await yahooChartMeta(`${ccy}USD=X`)
  const directPx = Number(direct?.regularMarketPrice)
  if (Number.isFinite(directPx) && directPx > 0) return directPx

  const inverse = await yahooChartMeta(`USD${ccy}=X`)
  const inversePx = Number(inverse?.regularMarketPrice)
  if (Number.isFinite(inversePx) && inversePx > 0) return 1 / inversePx

  const alt = await yahooChartMeta(`${ccy}=X`)
  const altPx = Number(alt?.regularMarketPrice)
  if (Number.isFinite(altPx) && altPx > 0) return 1 / altPx

  return null
}

export type YahooNewsItem = {
  headline: string
  source: string
  url: string
  datetime: number
}

/** Headline when Finnhub `/company-news` is empty or forbidden. */
export async function yahooLatestNews(symbol: string): Promise<YahooNewsItem | null> {
  const ticker = yahooTicker(symbol)
  if (!ticker) return null

  const url = new URL(YAHOO_SEARCH)
  url.searchParams.set('q', ticker)
  url.searchParams.set('newsCount', '10')

  try {
    const res = await fetch(url.toString(), { headers: YAHOO_HEADERS })
    if (!res.ok) return null
    const data = await res.json()
    const rows = Array.isArray(data?.news) ? data.news : []
    const needle = ticker.toUpperCase()
    const withHeadline = rows.filter(
      (row) => row && typeof row === 'object' && String(row.title || '').trim(),
    )
    const match =
      withHeadline.find((row) => {
        const related = Array.isArray(row.relatedTickers) ? row.relatedTickers : []
        return related.some((tag: unknown) => String(tag || '').toUpperCase() === needle)
      }) ||
      withHeadline[0] ||
      null
    if (!match || typeof match !== 'object') return null
    return {
      headline: String(match.title || '').trim(),
      source: String(match.publisher || 'Yahoo Finance').trim() || 'Yahoo Finance',
      url: String(match.link || '').trim(),
      datetime: Number(match.providerPublishTime) || 0,
    }
  } catch {
    return null
  }
}

export function yahooIntervalForWindow(windowKey: string): string {
  switch (windowKey) {
    case '1h':
      return '1m'
    case '24h':
      return '5m'
    case '3d':
      return '30m'
    case '1w':
      return '1d'
    default:
      return '1d'
  }
}

function downsampleBars(bars: YahooBar[], max = MAX_BARS): YahooBar[] {
  if (bars.length <= max) return bars
  const step = Math.ceil(bars.length / max)
  return bars.filter((_, i) => i % step === 0 || i === bars.length - 1)
}

/** Daily/intraday OHLCV closes for a stock ticker and window. */
export async function yahooStockCandles(
  symbol: string,
  fromSec: number,
  toSec: number,
  interval: string,
): Promise<YahooBar[]> {
  const ticker = yahooTicker(symbol)
  if (!ticker || !Number.isFinite(fromSec) || !Number.isFinite(toSec)) return []

  const url = new URL(`${YAHOO_CHART}/${encodeURIComponent(ticker)}`)
  url.searchParams.set('period1', String(Math.floor(fromSec)))
  url.searchParams.set('period2', String(Math.floor(toSec)))
  url.searchParams.set('interval', interval)
  url.searchParams.set('includePrePost', 'false')

  try {
    const res = await fetch(url.toString(), { headers: YAHOO_HEADERS })
    if (!res.ok) return []
    const data = await res.json()
    const result = data?.chart?.result?.[0]
    const timestamps = Array.isArray(result?.timestamp) ? result.timestamp : []
    const closes = result?.indicators?.quote?.[0]?.close
    if (!Array.isArray(closes) || !timestamps.length) return []

    const bars: YahooBar[] = []
    for (let i = 0; i < timestamps.length; i += 1) {
      const t = Number(timestamps[i])
      const c = Number(closes[i])
      if (!Number.isFinite(t) || !Number.isFinite(c)) continue
      bars.push({ t, c })
    }
    return downsampleBars(bars)
  } catch {
    return []
  }
}
