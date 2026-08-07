/**
 * Financial Modeling Prep public stock/ETF logo URLs.
 * Used when Finnhub + Yahoo omit logos (common for SPDR ETFs like GLD).
 */

function rootTicker(symbol: string): string {
  const raw = String(symbol || '').trim().toUpperCase()
  if (!raw) return ''
  // BINANCE:BTCUSDT / AAPL.TO / BRK.B → take primary equity root
  const noVenue = raw.includes(':') ? raw.split(':').pop() || raw : raw
  const base = noVenue.split('.')[0] || noVenue
  return /^[A-Z][A-Z0-9-]{0,11}$/.test(base) ? base : ''
}

/** Sync URL guess — caller should verify before trusting for unknown tickers. */
export function fmpStockLogoUrlGuess(symbol: string): string {
  const ticker = rootTicker(symbol)
  return ticker ? `https://financialmodelingprep.com/image-stock/${ticker}.png` : ''
}

const fmpLogoCache = new Map<string, { logo: string; expires: number }>()
const FMP_LOGO_CACHE_TTL_MS = 6 * 60 * 60 * 1000

/** HEAD-check FMP logo; returns URL or ''. */
export async function fmpStockLogoUrl(symbol: string): Promise<string> {
  const url = fmpStockLogoUrlGuess(symbol)
  if (!url) return ''
  const cacheKey = rootTicker(symbol).toLowerCase()
  const cached = fmpLogoCache.get(cacheKey)
  if (cached && cached.expires > Date.now()) return cached.logo

  let logo = ''
  try {
    const res = await fetch(url, { method: 'HEAD', redirect: 'follow' })
    const ct = String(res.headers.get('content-type') || '')
    if (res.ok && ct.startsWith('image/')) logo = url
  } catch {
    logo = ''
  }

  fmpLogoCache.set(cacheKey, { logo, expires: Date.now() + FMP_LOGO_CACHE_TTL_MS })
  return logo
}
