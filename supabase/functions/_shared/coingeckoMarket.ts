/**
 * CoinGecko helpers for crypto search, logos, market cap, and candle fallback.
 * Prices/quotes stay on Finnhub; CoinGecko supplies identity, logo, USD market cap, and OHLC candles.
 * Network calls are recorded via `coingeckoUsageLog.ts` when a `lounge-market-data` scope is active.
 */

import type { MarketBarOhlc } from './marketBarOhlc.ts'
import { coingeckoCoinIdForTicker } from './marketCashtagCrypto.ts'
import { recordCoingeckoCall } from './coingeckoUsageLog.ts'

const COINGECKO_DEMO_BASE = 'https://api.coingecko.com/api/v3'
const LOGO_CACHE_TTL_MS = 86_400_000

export type CoingeckoSearchRow = {
  symbol: string
  display_symbol: string
  description: string
  type: string
  asset_class: 'crypto'
  logo_url: string
  coin_id: string
}

export type CoingeckoPickerQuote = {
  price: number | null
  market_cap: number | null
  change_pct: number | null
}

type LogoCacheEntry = {
  logo: string
  name: string
  coinId: string
  marketCapUsd: number | null
  expires: number
}
const logoCache = new Map<string, LogoCacheEntry>()

export function coingeckoApiKey(): string {
  return String(Deno.env.get('COINGECKO_API_KEY') || '').trim()
}

/** BINANCE:BTCUSDT → BTC (matches Finnhub display normalization). */
export function cryptoBaseTicker(raw: string): string {
  const s = String(raw || '').trim().toUpperCase()
  if (!s) return ''
  const m = s.match(/:([A-Z0-9]+)/)
  if (m) {
    const pair = m[1]
    if (pair.endsWith('USDT')) return pair.slice(0, -4)
    if (pair.endsWith('USD')) return pair.slice(0, -3)
    return pair
  }
  return s.replace(/^BINANCE:/, '').replace(/USDT$/, '').replace(/USD$/, '')
}

/** Bare ticker → Finnhub crypto pair (quotes/candles). */
export function finnhubCryptoSymbol(ticker: string): string {
  const t = String(ticker || '').trim().toUpperCase()
  if (!t) return ''
  if (t.includes(':')) return t
  return `BINANCE:${t}USDT`
}

async function coingeckoFetch(
  path: string,
  params: Record<string, string> = {},
  reason = 'unknown',
) {
  const started = Date.now()
  const url = new URL(`${COINGECKO_DEMO_BASE}${path}`)
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v)
  const headers: Record<string, string> = { Accept: 'application/json' }
  const key = coingeckoApiKey()
  if (key) headers['x-cg-demo-api-key'] = key
  try {
    const res = await fetch(url.toString(), { headers })
    if (!res.ok) {
      recordCoingeckoCall({
        endpoint: path,
        reason,
        params,
        ms: Date.now() - started,
        ok: false,
        error: `HTTP ${res.status}`,
      })
      throw new Error(`CoinGecko HTTP ${res.status}`)
    }
    recordCoingeckoCall({
      endpoint: path,
      reason,
      params,
      ms: Date.now() - started,
      ok: true,
    })
    return res.json()
  } catch (e) {
    if (!(e instanceof Error && /^CoinGecko HTTP/.test(e.message))) {
      recordCoingeckoCall({
        endpoint: path,
        reason,
        params,
        ms: Date.now() - started,
        ok: false,
        error: e instanceof Error ? e.message : 'fetch failed',
      })
    }
    throw e
  }
}

function pickBestCoin(
  coins: Array<{
    id?: string
    symbol?: string
    name?: string
    market_cap_rank?: number | null
    large?: string
    thumb?: string
  }>,
  baseTicker: string,
) {
  const baseUpper = baseTicker.toUpperCase()
  const exact = coins.filter((c) => String(c?.symbol || '').toUpperCase() === baseUpper)
  const pool = exact.length ? exact : coins
  return pool.sort((a, b) => {
    const ra = a.market_cap_rank ?? 999_999
    const rb = b.market_cap_rank ?? 999_999
    return ra - rb
  })[0]
}

/** Batch USD price, mcap, and 24h change for picker/search rows. */
export async function coingeckoBatchPickerQuotes(
  coinIds: string[],
): Promise<Map<string, CoingeckoPickerQuote>> {
  const ids = [...new Set(coinIds.map((id) => String(id || '').trim()).filter(Boolean))]
  const out = new Map<string, CoingeckoPickerQuote>()
  if (!ids.length) return out

  try {
    const data = await coingeckoFetch(
      '/simple/price',
      {
        ids: ids.join(','),
        vs_currencies: 'usd',
        include_market_cap: 'true',
        include_24hr_change: 'true',
      },
      'picker_batch_price',
    )
    for (const id of ids) {
      const row = data?.[id] as { usd?: number; usd_market_cap?: number; usd_24h_change?: number } | undefined
      const price = Number(row?.usd)
      const cap = Number(row?.usd_market_cap)
      const changePct = Number(row?.usd_24h_change)
      out.set(id, {
        price: Number.isFinite(price) && price > 0 ? price : null,
        market_cap: Number.isFinite(cap) && cap > 0 ? cap : null,
        change_pct: Number.isFinite(changePct) ? changePct : null,
      })
    }
  } catch {
    // leave map empty — caller keeps identity fields
  }
  return out
}

/** Live USD market cap for one CoinGecko coin id (no /search). */
export async function coingeckoMarketCapUsd(coinId: string): Promise<number | null> {
  const id = String(coinId || '').trim()
  if (!id) return null
  try {
    const data = await coingeckoFetch(
      '/simple/price',
      {
        ids: id,
        vs_currencies: 'usd',
        include_market_cap: 'true',
      },
      'crypto_profile_mcap',
    )
    const row = data?.[id] as { usd_market_cap?: number } | undefined
    const cap = Number(row?.usd_market_cap)
    return Number.isFinite(cap) && cap > 0 ? cap : null
  } catch {
    return null
  }
}

export async function coingeckoResolveCoinId(symbol: string, coinIdHint?: string): Promise<string> {
  const hinted = String(coinIdHint || '').trim()
  if (hinted) return hinted
  const fromMap = coingeckoCoinIdForTicker(cryptoBaseTicker(symbol))
  if (fromMap) return fromMap
  const profile = await coingeckoCryptoProfile(symbol)
  return profile.coinId
}

export async function coingeckoCryptoProfile(
  symbol: string,
): Promise<{ name: string; logo: string; coinId: string; marketCapUsd: number | null }> {
  const base = cryptoBaseTicker(symbol)
  if (!base) return { name: '', logo: '', coinId: '', marketCapUsd: null }

  const cacheKey = base.toUpperCase()
  const cached = logoCache.get(cacheKey)
  if (cached && cached.expires > Date.now()) {
    recordCoingeckoCall({
      endpoint: '(memory_cache)',
      reason: 'crypto_profile',
      cache_hit: true,
      ms: 0,
      ok: true,
    })
    return {
      name: cached.name,
      logo: cached.logo,
      coinId: cached.coinId,
      marketCapUsd: cached.marketCapUsd,
    }
  }

  try {
    const data = await coingeckoFetch('/search', { query: base.toLowerCase() }, 'crypto_profile_search')
    const coins = Array.isArray(data?.coins) ? data.coins : []
    const pick = pickBestCoin(coins, base)
    const logo = String(pick?.large || pick?.thumb || '')
    const name = String(pick?.name || base)
    const coinId = String(pick?.id || '')
    const marketCapUsd = coinId ? await coingeckoMarketCapUsd(coinId) : null
    logoCache.set(cacheKey, { logo, name, coinId, marketCapUsd, expires: Date.now() + LOGO_CACHE_TTL_MS })
    return { name, logo, coinId, marketCapUsd }
  } catch {
    return { name: base, logo: '', coinId: '', marketCapUsd: null }
  }
}

export async function coingeckoCryptoLogo(symbol: string): Promise<string> {
  const profile = await coingeckoCryptoProfile(symbol)
  return profile.logo
}

/** CoinGecko `/ohlc` only accepts these `days` values. */
export function coingeckoOhlcDaysForWindow(windowKey: string): '1' | '7' | '14' | '30' | '90' | '180' | '365' {
  switch (windowKey) {
    case '1h':
    case '24h':
      return '1'
    case '3d':
      return '7'
    case '1w':
      return '7'
    case '1m':
      return '30'
    case '2m':
      return '90'
    case '3m':
      return '90'
    case '6m':
      return '180'
    case '1y':
    case 'ytd':
      return '365'
    case 'all':
      return '365'
    default:
      return '1'
  }
}

/** Pick the smallest CoinGecko `/ohlc` `days` bucket that covers a lookback span. */
export function coingeckoOhlcDaysForLookbackDays(lookbackDays: number): '1' | '7' | '14' | '30' | '90' | '180' | '365' {
  const d = Math.max(1, Math.ceil(lookbackDays))
  if (d <= 1) return '1'
  if (d <= 7) return '7'
  if (d <= 14) return '14'
  if (d <= 30) return '30'
  if (d <= 90) return '90'
  if (d <= 180) return '180'
  return '365'
}

function downsampleCoingeckoBars(bars: MarketBarOhlc[], max = 120): MarketBarOhlc[] {
  if (bars.length <= max) return bars
  const step = Math.ceil(bars.length / max)
  return bars.filter((_, i) => i % step === 0 || i === bars.length - 1)
}

function parseCoingeckoOhlcPayload(data: unknown): MarketBarOhlc[] {
  if (!Array.isArray(data)) return []
  const bars: MarketBarOhlc[] = []
  for (const row of data) {
    if (!Array.isArray(row) || row.length < 5) continue
    const tMs = Number(row[0])
    const o = Number(row[1])
    const h = Number(row[2])
    const l = Number(row[3])
    const c = Number(row[4])
    if (!Number.isFinite(tMs) || !Number.isFinite(c)) continue
    if (!Number.isFinite(o) || !Number.isFinite(h) || !Number.isFinite(l)) continue
    bars.push({
      t: Math.floor(tMs / 1000),
      o,
      h,
      l,
      c,
    })
  }
  return bars
}

async function coingeckoCryptoOhlcCandles(coinId: string, windowKey: string): Promise<MarketBarOhlc[]> {
  const id = String(coinId || '').trim()
  if (!id) return []

  const days = coingeckoOhlcDaysForWindow(windowKey)
  const params: Record<string, string> = {
    vs_currency: 'usd',
    days,
  }
  const key = coingeckoApiKey()
  // CoinGecko rejects `interval=hourly` with `days=1` (400) — use default granularity for 24h mini charts.
  if (
    key &&
    days !== '1' &&
    (windowKey === '1h' ||
      windowKey === '24h' ||
      windowKey === '3d' ||
      windowKey === '1w' ||
      windowKey === '1m')
  ) {
    params.interval = 'hourly'
  }

  try {
    const data = await coingeckoFetch(`/coins/${id}/ohlc`, params, 'candles_ohlc')
    const bars = parseCoingeckoOhlcPayload(data)
    if (bars.length >= 2) return downsampleCoingeckoBars(bars)
  } catch {
    if (params.interval) {
      try {
        const data = await coingeckoFetch(
          `/coins/${id}/ohlc`,
          {
            vs_currency: 'usd',
            days,
          },
          'candles_ohlc_retry',
        )
        const bars = parseCoingeckoOhlcPayload(data)
        if (bars.length >= 2) return downsampleCoingeckoBars(bars)
      } catch {
        /* fall through to close-only chart */
      }
    }
  }
  return []
}

/** Close-only fallback when `/ohlc` is unavailable. */
async function coingeckoCryptoCloseCandles(coinId: string, windowKey: string): Promise<MarketBarOhlc[]> {
  const id = String(coinId || '').trim()
  if (!id) return []

  try {
    const data = await coingeckoFetch(
      `/coins/${id}/market_chart`,
      {
        vs_currency: 'usd',
        days: String(coingeckoDaysForWindow(windowKey)),
      },
      'candles_market_chart',
    )
    const prices = Array.isArray(data?.prices) ? data.prices : []
    const bars: MarketBarOhlc[] = []
    for (const row of prices) {
      if (!Array.isArray(row) || row.length < 2) continue
      const t = Number(row[0])
      const c = Number(row[1])
      if (!Number.isFinite(t) || !Number.isFinite(c)) continue
      bars.push({ t: Math.floor(t / 1000), c })
    }
    return downsampleCoingeckoBars(bars)
  } catch {
    return []
  }
}

/** CoinGecko `market_chart` days param for a window key. */
export function coingeckoDaysForWindow(windowKey: string): number | 'max' {
  switch (windowKey) {
    case '1h':
    case '24h':
      return 1
    case '3d':
      return 3
    case '1w':
      return 7
    case '1m':
      return 30
    case '3m':
      return 90
    case '6m':
      return 180
    case '1y':
      return 365
    case 'all':
      return 'max'
    case 'ytd': {
      const y = new Date().getUTCFullYear()
      const start = Date.UTC(y, 0, 1)
      return Math.max(1, Math.ceil((Date.now() - start) / 86_400_000))
    }
    default:
      return 1
  }
}

/** Advanced crypto chart fallback when Finnhub `/crypto/candle` returns nothing. */
export async function coingeckoCryptoCandlesForAdvanced(
  symbol: string,
  lookbackDays: number,
  maxBars = 500,
  coinIdHint?: string,
): Promise<MarketBarOhlc[]> {
  const coinId = await coingeckoResolveCoinId(symbol, coinIdHint)
  if (!coinId) return []

  const days = coingeckoOhlcDaysForLookbackDays(lookbackDays)
  try {
    const params: Record<string, string> = { vs_currency: 'usd', days }
    const key = coingeckoApiKey()
    if (key && days !== '1' && (days === '7' || days === '14' || days === '30' || days === '90')) {
      params.interval = 'hourly'
    }
    const data = await coingeckoFetch(`/coins/${coinId}/ohlc`, params, 'candles_advanced_ohlc')
    const bars = parseCoingeckoOhlcPayload(data)
    if (bars.length >= 2) return downsampleCoingeckoBars(bars, maxBars)
  } catch {
    if (days !== '1') {
      try {
        const data = await coingeckoFetch(
          `/coins/${coinId}/ohlc`,
          { vs_currency: 'usd', days },
          'candles_advanced_ohlc_retry',
        )
        const bars = parseCoingeckoOhlcPayload(data)
        if (bars.length >= 2) return downsampleCoingeckoBars(bars, maxBars)
      } catch {
        /* fall through to close-only */
      }
    }
  }

  const windowKey =
    lookbackDays <= 1
      ? '24h'
      : lookbackDays <= 7
        ? '1w'
        : lookbackDays <= 30
          ? '1m'
          : lookbackDays <= 90
            ? '3m'
            : lookbackDays <= 180
              ? '6m'
              : '1y'
  const closeOnly = await coingeckoCryptoCloseCandles(coinId, windowKey)
  return downsampleCoingeckoBars(closeOnly, maxBars)
}

/** Crypto candle fallback when Finnhub candles are empty — OHLC via `/ohlc`, then close-only `market_chart`. */
export async function coingeckoCryptoCandles(
  symbol: string,
  windowKey: string,
  coinIdHint?: string,
): Promise<MarketBarOhlc[]> {
  const coinId = await coingeckoResolveCoinId(symbol, coinIdHint)
  if (!coinId) return []

  if (windowKey === 'all') {
    return coingeckoCryptoCloseCandles(coinId, 'all')
  }

  const ohlc = await coingeckoCryptoOhlcCandles(coinId, windowKey)
  if (ohlc.length >= 2) return ohlc

  return coingeckoCryptoCloseCandles(coinId, windowKey)
}

/** Finnhub `/search` rarely returns crypto — use CoinGecko for cashtag/picker discovery. */
export async function coingeckoMarketSearch(query: string): Promise<CoingeckoSearchRow[]> {
  const q = String(query || '').trim()
  if (q.length < 1) return []

  try {
    const data = await coingeckoFetch('/search', { query: q.toLowerCase() }, 'market_search')
    const coins = Array.isArray(data?.coins) ? data.coins : []
    const qUpper = q.toUpperCase()
    const sorted = [...coins].sort((a, b) => {
      const aExact = String(a?.symbol || '').toUpperCase() === qUpper ? 0 : 1
      const bExact = String(b?.symbol || '').toUpperCase() === qUpper ? 0 : 1
      if (aExact !== bExact) return aExact - bExact
      const ra = a?.market_cap_rank ?? 999_999
      const rb = b?.market_cap_rank ?? 999_999
      return ra - rb
    })

    const out: CoingeckoSearchRow[] = []
    const seen = new Set<string>()
    for (const coin of sorted) {
      const sym = String(coin?.symbol || '').trim().toUpperCase()
      if (!sym || seen.has(sym)) continue
      seen.add(sym)
      out.push({
        symbol: finnhubCryptoSymbol(sym),
        display_symbol: sym,
        description: String(coin?.name || sym),
        type: 'Crypto',
        asset_class: 'crypto',
        logo_url: String(coin?.large || coin?.thumb || ''),
        coin_id: String(coin?.id || ''),
      })
      if (out.length >= 8) break
    }
    return out
  } catch {
    return []
  }
}

/** Top crypto by market cap for client symbol universe (refreshed daily on Edge). */
export async function coingeckoCryptoUniverse(maxPages = 2): Promise<CoingeckoSearchRow[]> {
  const out: CoingeckoSearchRow[] = []
  const seen = new Set<string>()

  for (let page = 1; page <= maxPages; page += 1) {
    const data = await coingeckoFetch(
      '/coins/markets',
      {
        vs_currency: 'usd',
        order: 'market_cap_desc',
        per_page: '250',
        page: String(page),
        sparkline: 'false',
      },
      'universe_crypto',
    )
    const coins = Array.isArray(data) ? data : []
    for (const coin of coins) {
      const sym = String(coin?.symbol || '').trim().toUpperCase()
      if (!sym || seen.has(sym)) continue
      seen.add(sym)
      out.push({
        symbol: finnhubCryptoSymbol(sym),
        display_symbol: sym,
        description: String(coin?.name || sym),
        type: 'Crypto',
        asset_class: 'crypto',
        logo_url: String(coin?.image || ''),
        coin_id: String(coin?.id || ''),
      })
    }
  }

  return out
}
