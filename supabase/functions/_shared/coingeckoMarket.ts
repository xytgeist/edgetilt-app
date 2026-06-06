/**
 * CoinGecko helpers for crypto search, logos, market cap, and candle fallback.
 * Prices/quotes stay on Finnhub; CoinGecko supplies identity, logo, and USD market cap.
 */

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

async function coingeckoFetch(path: string, params: Record<string, string> = {}) {
  const url = new URL(`${COINGECKO_DEMO_BASE}${path}`)
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v)
  const headers: Record<string, string> = { Accept: 'application/json' }
  const key = coingeckoApiKey()
  if (key) headers['x-cg-demo-api-key'] = key
  const res = await fetch(url.toString(), { headers })
  if (!res.ok) throw new Error(`CoinGecko HTTP ${res.status}`)
  return res.json()
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
    const data = await coingeckoFetch('/simple/price', {
      ids: ids.join(','),
      vs_currencies: 'usd',
      include_market_cap: 'true',
      include_24hr_change: 'true',
    })
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

async function coingeckoMarketCapUsd(coinId: string): Promise<number | null> {
  const id = String(coinId || '').trim()
  if (!id) return null
  try {
    const data = await coingeckoFetch('/simple/price', {
      ids: id,
      vs_currencies: 'usd',
      include_market_cap: 'true',
    })
    const row = data?.[id] as { usd_market_cap?: number } | undefined
    const cap = Number(row?.usd_market_cap)
    return Number.isFinite(cap) && cap > 0 ? cap : null
  } catch {
    return null
  }
}

export async function coingeckoResolveCoinId(symbol: string): Promise<string> {
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
    return {
      name: cached.name,
      logo: cached.logo,
      coinId: cached.coinId,
      marketCapUsd: cached.marketCapUsd,
    }
  }

  try {
    const data = await coingeckoFetch('/search', { query: base.toLowerCase() })
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

/** CoinGecko `market_chart` days param for a window key. */
export function coingeckoDaysForWindow(windowKey: string): number {
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
    case 'ytd': {
      const y = new Date().getUTCFullYear()
      const start = Date.UTC(y, 0, 1)
      return Math.max(1, Math.ceil((Date.now() - start) / 86_400_000))
    }
    default:
      return 1
  }
}

/** Crypto sparkline fallback when Finnhub candles are empty. */
export async function coingeckoCryptoCandles(
  symbol: string,
  windowKey: string,
): Promise<Array<{ t: number; c: number }>> {
  const coinId = await coingeckoResolveCoinId(symbol)
  if (!coinId) return []

  try {
    const data = await coingeckoFetch(`/coins/${coinId}/market_chart`, {
      vs_currency: 'usd',
      days: String(coingeckoDaysForWindow(windowKey)),
    })
    const prices = Array.isArray(data?.prices) ? data.prices : []
    const bars: Array<{ t: number; c: number }> = []
    for (const row of prices) {
      if (!Array.isArray(row) || row.length < 2) continue
      const t = Number(row[0])
      const c = Number(row[1])
      if (!Number.isFinite(t) || !Number.isFinite(c)) continue
      bars.push({ t: Math.floor(t / 1000), c })
    }
    if (bars.length <= 120) return bars
    const step = Math.ceil(bars.length / 120)
    return bars.filter((_, i) => i % step === 0 || i === bars.length - 1)
  } catch {
    return []
  }
}

/** Finnhub `/search` rarely returns crypto — use CoinGecko for cashtag/picker discovery. */
export async function coingeckoMarketSearch(query: string): Promise<CoingeckoSearchRow[]> {
  const q = String(query || '').trim()
  if (q.length < 1) return []

  try {
    const data = await coingeckoFetch('/search', { query: q.toLowerCase() })
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
