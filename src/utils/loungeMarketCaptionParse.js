/** @typedef {'stock'|'crypto'} MarketAssetClass */
/** @typedef {'rolling'|'historical'} MarketEmbedKind */

import { isUsableStockIntradayBars } from './usEquityMarketSession.js'

/**
 * @typedef {Object} MarketBar
 * @property {number} t
 * @property {number} c
 * @property {number} [o]
 * @property {number} [h]
 * @property {number} [l]
 * @property {number} [v]
 */

/**
 * @typedef {Object} MarketEmbed
 * @property {string} symbol
 * @property {string} display_symbol
 * @property {MarketAssetClass} asset_class
 * @property {string} name
 * @property {string} exchange
 * @property {string} logo_url
 * @property {number|null} market_cap
 * @property {string} currency
 * @property {MarketEmbedKind} kind
 * @property {string} window_key
 * @property {string} window_label
 * @property {{ price: number, change_pct: number, change: number, as_of: string }} quote
 * @property {MarketBar[]} bars
 * @property {string} [og_image_url]
 * @property {string} [coin_id] CoinGecko id (crypto) - skips search on rolling/modal candles
 * @property {string} [metadata_as_of] ISO timestamp when name/logo/mcap were resolved
 */

export const LOUNGE_MARKET_EMBED_MAX = 12

/** Must match `lounge_search_cashtag_posts` tag validation. */
export const MARKET_CASHTAG_RPC_RE = /^[A-Z][A-Z0-9.-]{0,14}$/

const CASHTAG_RE = /\$([A-Za-z][A-Za-z0-9.-]{0,14})\b/g

/**
 * Ticker for `lounge_search_cashtag_posts` from a market embed row.
 * @param {object | null | undefined} embed
 */
export function marketEmbedSearchCashtag(embed) {
  const display = String(embed?.display_symbol || '').trim().toUpperCase()
  if (MARKET_CASHTAG_RPC_RE.test(display)) return display
  const sym = String(embed?.symbol || '').trim().toUpperCase()
  if (MARKET_CASHTAG_RPC_RE.test(sym)) return sym
  if (embed?.asset_class === 'crypto' || sym.includes(':')) {
    const m = sym.match(/:([A-Z0-9]+)/)
    if (m) {
      let pair = m[1]
      if (pair.endsWith('USDT')) pair = pair.slice(0, -4)
      else if (pair.endsWith('USD')) pair = pair.slice(0, -3)
      if (MARKET_CASHTAG_RPC_RE.test(pair)) return pair
    }
    const stripped = sym.replace(/^BINANCE:/, '').replace(/USDT$/, '').replace(/USD$/, '')
    if (MARKET_CASHTAG_RPC_RE.test(stripped)) return stripped
  }
  return display
}

/** Match server `finnhubSymbolForAsset` for batch cache keys. */
export function cashtagFinnhubSymbol(ticker, assetClass = 'stock') {
  const s = String(ticker || '').trim().toUpperCase()
  if (!s) return ''
  if (assetClass === 'crypto') {
    if (s.includes(':')) return s
    return `BINANCE:${s}USDT`
  }
  return s
}

export function cashtagMarketCacheKey(ticker, assetClass = 'stock') {
  const sym = cashtagFinnhubSymbol(ticker, assetClass)
  if (!sym) return ''
  return `${assetClass}:${sym}`.toLowerCase()
}

const COMMON_CRYPTO_CASHTAGS = new Set([
  'BTC', 'ETH', 'SOL', 'DOGE', 'XRP', 'ADA', 'AVAX', 'LINK', 'BNB', 'LTC', 'DOT', 'MATIC', 'SHIB',
  'UNI', 'ATOM', 'BCH', 'XLM', 'ETC', 'FIL', 'NEAR', 'APT', 'ARB', 'OP', 'PEPE', 'WIF', 'BONK',
  'HBAR', 'ICP', 'VET', 'ALGO', 'AAVE', 'MKR', 'CRO', 'STX', 'INJ', 'RUNE', 'SEI', 'TIA', 'SUI',
  'TAO', 'FET', 'RENDER', 'WLD', 'TRX', 'USDT', 'USDC',
])
// Keep in sync with `supabase/functions/_shared/marketCashtagCrypto.ts`.

const COINGECKO_COIN_ID_BY_TICKER = {
  BTC: 'bitcoin',
  ETH: 'ethereum',
  SOL: 'solana',
  DOGE: 'dogecoin',
  XRP: 'ripple',
  ADA: 'cardano',
  AVAX: 'avalanche-2',
  LINK: 'chainlink',
  BNB: 'binancecoin',
  LTC: 'litecoin',
  DOT: 'polkadot',
  MATIC: 'matic-network',
  SHIB: 'shiba-inu',
  UNI: 'uniswap',
  ATOM: 'cosmos',
  BCH: 'bitcoin-cash',
  XLM: 'stellar',
  ETC: 'ethereum-classic',
  FIL: 'filecoin',
  NEAR: 'near',
  APT: 'aptos',
  ARB: 'arbitrum',
  OP: 'optimism',
  PEPE: 'pepe',
  WIF: 'dogwifcoin',
  BONK: 'bonk',
  HBAR: 'hedera-hashgraph',
  ICP: 'internet-computer',
  VET: 'vechain',
  ALGO: 'algorand',
  AAVE: 'aave',
  MKR: 'maker',
  CRO: 'crypto-com-chain',
  STX: 'blockstack',
  INJ: 'injective-protocol',
  RUNE: 'thorchain',
  SEI: 'sei-network',
  TIA: 'celestia',
  SUI: 'sui',
  TAO: 'bittensor',
  FET: 'fetch-ai',
  RENDER: 'render-token',
  WLD: 'worldcoin-wld',
  TRX: 'tron',
  USDT: 'tether',
  USDC: 'usd-coin',
}

/** @param {string} ticker */
export function coingeckoCoinIdForTicker(ticker) {
  const s = String(ticker || '').trim().toUpperCase()
  return s ? String(COINGECKO_COIN_ID_BY_TICKER[s] || '').trim() : ''
}

/** @param {object} embed */
function reconcileMarketEmbedAssetClass(embed) {
  const ticker = String(embed.display_symbol || embed.symbol || '').trim().toUpperCase()
  if (!ticker) return embed
  let next = embed
  if (embed.asset_class !== 'crypto' && COMMON_CRYPTO_CASHTAGS.has(ticker)) {
    next = {
      ...next,
      asset_class: 'crypto',
      display_symbol: ticker,
      symbol: cashtagFinnhubSymbol(ticker, 'crypto'),
    }
  }
  if (next.asset_class === 'crypto' && !String(next.coin_id || '').trim()) {
    const coinId = coingeckoCoinIdForTicker(ticker)
    if (coinId) next = { ...next, coin_id: coinId }
  }
  return next
}

/** @param {string} ticker @param {Map<string, string>} [embedClassByTicker] */
export function guessCashtagAssetClass(ticker, embedClassByTicker) {
  const s = String(ticker || '').trim().toUpperCase()
  if (!s) return 'stock'
  if (embedClassByTicker?.get(s)) return embedClassByTicker.get(s)
  if (s.startsWith('BINANCE:') || s.includes('USDT')) return 'crypto'
  if (COMMON_CRYPTO_CASHTAGS.has(s)) return 'crypto'
  return 'stock'
}

/** Cashtag color from 1D % change - neutral cyan when quote unknown. */
export function marketCashtagColorClass(changePct) {
  const v = Number(changePct)
  if (!Number.isFinite(v)) return 'font-semibold text-cyan-400'
  if (v > 0) return 'font-semibold text-lv-green'
  if (v < 0) return 'font-semibold text-lv-red'
  return 'font-semibold text-zinc-400'
}

/** @param {string} caption */
export function extractCashtagsFromCaption(caption) {
  const text = String(caption || '')
  const out = []
  const seen = new Set()
  let m
  CASHTAG_RE.lastIndex = 0
  while ((m = CASHTAG_RE.exec(text)) !== null) {
    const sym = String(m[1] || '').trim().toUpperCase()
    if (!sym || seen.has(sym)) continue
    seen.add(sym)
    out.push(sym)
  }
  return out
}

/** Uppercase `$TICKER` symbols in caption text (display + storage). */
export function normalizeCashtagsInCaption(caption) {
  const text = String(caption ?? '')
  if (!text) return text
  CASHTAG_RE.lastIndex = 0
  return text.replace(CASHTAG_RE, (match, ticker) => {
    const upper = String(ticker || '').trim().toUpperCase()
    return upper ? `$${upper}` : match
  })
}

/** Mirror server `windowRange` for client date labels. @param {string} windowKey */
export function marketWindowRangeSec(windowKey) {
  const now = Math.floor(Date.now() / 1000)
  const day = 86400
  switch (windowKey) {
    case '1h':
      return { fromSec: now - 3600, toSec: now }
    case '24h':
      return { fromSec: now - day, toSec: now }
    case '3d':
      return { fromSec: now - 3 * day, toSec: now }
    case '1w':
      return { fromSec: now - 7 * day, toSec: now }
    case '1m':
      return { fromSec: now - 30 * day, toSec: now }
    case '3m':
      return { fromSec: now - 90 * day, toSec: now }
    case '6m':
      return { fromSec: now - 183 * day, toSec: now }
    case '1y':
      return { fromSec: now - 365 * day, toSec: now }
    case 'ytd': {
      const y = new Date().getUTCFullYear()
      return { fromSec: Math.floor(Date.UTC(y, 0, 1) / 1000), toSec: now }
    }
    default:
      return { fromSec: now - day, toSec: now }
  }
}

/** @param {number} t */
function barUnixSec(t) {
  return Math.floor(Number(t) > 1e12 ? Number(t) / 1000 : Number(t))
}

/** @param {number} sec Unix seconds */
function utcStartOfDay(sec) {
  const d = new Date(sec * 1000)
  return Math.floor(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) / 1000)
}

/** @param {number} fromSec @param {number} toSec */
export function formatUtcDateRange(fromSec, toSec) {
  if (!Number.isFinite(fromSec) || !Number.isFinite(toSec)) return ''
  let fromDay = utcStartOfDay(fromSec)
  let toDay = utcStartOfDay(toSec)
  if (fromDay > toDay) [fromDay, toDay] = [toDay, fromDay]

  const from = new Date(fromDay * 1000)
  const to = new Date(toDay * 1000)
  const monthDay = { month: 'short', day: 'numeric', timeZone: 'UTC' }
  const dayOnly = { day: 'numeric', timeZone: 'UTC' }

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

  const withYear = { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' }
  return `${from.toLocaleDateString('en-US', withYear)} – ${to.toLocaleDateString('en-US', withYear)}`
}

/**
 * Historical mini-chart label from stored bars or window key fallback.
 * @param {string} windowKey
 * @param {Array<{ t: number }>} [bars]
 */
export function formatMarketWindowDateLabel(windowKey, bars) {
  const windowSpan = marketWindowRangeSec(windowKey)
  let fromSec = windowSpan.fromSec
  let toSec = windowSpan.toSec

  if (Array.isArray(bars) && bars.length >= 2) {
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

/**
 * Label under ticker on feed mini charts.
 * @param {MarketEmbed} embed
 * @param {{ window_label?: string } | null} [rollingLive]
 */
export function formatMarketEmbedWindowLabel(embed, rollingLive = null) {
  if (!embed) return ''
  if (embed.kind === 'rolling') {
    return rollingLive?.window_label || embed.window_label || '24h'
  }
  const key = String(embed.window_key || '').trim()
  if (key) {
    const fromBars = formatMarketWindowDateLabel(key, embed.bars)
    if (fromBars) return fromBars
  }
  return embed.window_label || ''
}

/** Mirror server parse for composer preview labels. @param {string} caption */
export function parseCaptionMarketWindowClient(caption) {
  const text = String(caption || '').toLowerCase()
  if (!text.trim()) return { kind: 'rolling', windowKey: '24h', windowLabel: '24h' }

  const monthMatch = text.match(/\b(?:last|past|over the last|in the last)\s+(\d+)\s*months?\b/)
  if (monthMatch) {
    const n = Math.max(1, parseInt(monthMatch[1], 10) || 1)
    const windowKey = n >= 6 ? '6m' : n >= 3 ? '3m' : '1m'
    return {
      kind: 'historical',
      windowKey,
      windowLabel: formatMarketWindowDateLabel(windowKey, []),
    }
  }
  const dayMatch = text.match(/\b(?:last|past|over the last|in the last)\s+(\d+)\s*days?\b/)
  if (dayMatch) {
    const n = Math.max(1, parseInt(dayMatch[1], 10) || 1)
    const windowKey = n <= 1 ? '24h' : n <= 3 ? '3d' : n <= 7 ? '1w' : '1m'
    return {
      kind: 'historical',
      windowKey,
      windowLabel: formatMarketWindowDateLabel(windowKey, []),
    }
  }
  if (/\b(?:last|past)\s+6\s+months?\b/.test(text)) {
    return { kind: 'historical', windowKey: '6m', windowLabel: formatMarketWindowDateLabel('6m', []) }
  }
  if (/\b(?:last|past)\s+3\s+months?\b/.test(text)) {
    return { kind: 'historical', windowKey: '3m', windowLabel: formatMarketWindowDateLabel('3m', []) }
  }
  if (/\b(?:last|past)\s+month\b/.test(text)) {
    return { kind: 'historical', windowKey: '1m', windowLabel: formatMarketWindowDateLabel('1m', []) }
  }
  if (/\b(?:last|past)\s+week\b|\bthis\s+last\s+week\b|\bthis\s+week\b/.test(text)) {
    return { kind: 'historical', windowKey: '1w', windowLabel: formatMarketWindowDateLabel('1w', []) }
  }
  if (/\b(?:last|past)\s+year\b/.test(text)) {
    return { kind: 'historical', windowKey: '1y', windowLabel: formatMarketWindowDateLabel('1y', []) }
  }
  if (/\bytd\b/.test(text)) {
    return { kind: 'historical', windowKey: 'ytd', windowLabel: formatMarketWindowDateLabel('ytd', []) }
  }
  return { kind: 'rolling', windowKey: '24h', windowLabel: '24h' }
}

/** @param {unknown} raw */
export function normalizeMarketEmbeds(raw) {
  if (!raw) return []
  let arr = raw
  if (typeof raw === 'string') {
    try {
      arr = JSON.parse(raw)
    } catch {
      return []
    }
  }
  if (!Array.isArray(arr)) return []
  return arr
    .filter((row) => row && typeof row === 'object' && String(row.display_symbol || row.symbol || '').trim())
    .map(reconcileMarketEmbedAssetClass)
}

/** @param {MarketEmbed} embed */
export function marketEmbedCacheKey(embed) {
  return `${embed.asset_class}:${embed.symbol}`.toLowerCase()
}

/** @param {number|null|undefined} n */
export function formatMarketCap(n) {
  const v = Number(n)
  if (!Number.isFinite(v) || v <= 0) return '-'
  if (v >= 1e12) return `$${(v / 1e12).toFixed(2)}T`
  if (v >= 1e9) return `$${(v / 1e9).toFixed(2)}B`
  if (v >= 1e6) return `$${(v / 1e6).toFixed(2)}M`
  return `$${Math.round(v).toLocaleString()}`
}

/** Lounge market prices always display in USD to the cent. @param {number} price */
export function formatMarketPrice(price) {
  const v = Number(price)
  if (!Number.isFinite(v)) return '-'
  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(v)
  } catch {
    return `$${v.toFixed(2)}`
  }
}

/** Whole-dollar USD for compact chart axis ticks. @param {number} price */
export function formatMarketPriceWhole(price) {
  const v = Number(price)
  if (!Number.isFinite(v)) return '-'
  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(v)
  } catch {
    return `$${Math.round(v).toLocaleString()}`
  }
}

/** @param {number} pct */
export function formatMarketChangePct(pct) {
  const v = Number(pct)
  if (!Number.isFinite(v)) return '-'
  const sign = v > 0 ? '+' : ''
  return `${sign}${v.toFixed(2)}%`
}

/** @param {number|null|undefined} change @param {number|null|undefined} changePct */
export function formatMarketChangeLine(change, changePct) {
  const pct = Number(changePct)
  const ch = Number(change)
  const up = Number.isFinite(pct) ? pct >= 0 : Number.isFinite(ch) ? ch >= 0 : true
  const arrow = up ? '↑' : '↓'
  const parts = [arrow]
  if (Number.isFinite(ch) && ch !== 0) {
    parts.push(formatMarketPrice(Math.abs(ch)))
  }
  if (Number.isFinite(pct)) {
    const sign = pct > 0 ? '+' : pct < 0 ? '-' : ''
    parts.push(`(${sign}${Math.abs(pct).toFixed(2)}%)`)
  }
  return parts.join(' ')
}

/**
 * Pick rolling quote/bars for feed minis - reject synthetic calendar-24h diagonals on stocks.
 * @param {MarketEmbed | object | null | undefined} embed
 * @param {object | null | undefined} rollingLive
 */
export function pickRollingMarketPayload(embed, rollingLive) {
  if (!embed || embed.kind !== 'rolling') {
    return {
      quote: embed?.quote,
      bars: embed?.bars,
      window_label: embed?.window_label,
    }
  }

  if (embed.asset_class === 'stock') {
    if (isUsableStockIntradayBars(rollingLive?.bars)) {
      return {
        quote: rollingLive.quote,
        bars: rollingLive.bars,
        window_label: rollingLive.window_label,
      }
    }
    if (isUsableStockIntradayBars(embed?.bars)) {
      return {
        quote: embed.quote,
        bars: embed.bars,
        window_label: embed.window_label,
      }
    }
    return {
      quote: rollingLive?.quote || embed?.quote,
      bars: [],
      window_label: rollingLive?.window_label || embed?.window_label,
    }
  }

  const bars = rollingLive?.bars?.length >= 2 ? rollingLive.bars : embed?.bars
  return {
    quote: rollingLive?.quote || embed?.quote,
    bars,
    window_label: rollingLive?.window_label || embed?.window_label,
  }
}

/** Modal chart timeframe pills → Edge `window_key` + series kind. */
export const MARKET_MODAL_TIMEFRAMES = [
  { label: '1H', windowKey: '1h', kind: 'historical' },
  { label: '1D', windowKey: '24h', kind: 'rolling' },
  { label: '1W', windowKey: '1w', kind: 'historical' },
  { label: '1M', windowKey: '1m', kind: 'historical' },
  { label: '3M', windowKey: '3m', kind: 'historical' },
  { label: '1Y', windowKey: '1y', kind: 'historical' },
  { label: 'ALL', windowKey: '1y', kind: 'historical' },
]

/** Default modal tab on open - `1D`. */
export const MARKET_MODAL_DEFAULT_TIMEFRAME_IDX = MARKET_MODAL_TIMEFRAMES.findIndex((tf) => tf.label === '1D')

/** @param {MarketEmbed[]} embeds */
export function collectRollingMarketSymbols(embeds) {
  const out = []
  const seen = new Set()
  for (const embed of embeds || []) {
    if (!embed || embed.kind !== 'rolling') continue
    const key = marketEmbedCacheKey(embed)
    if (seen.has(key)) continue
    seen.add(key)
    out.push({ symbol: embed.symbol, asset_class: embed.asset_class })
  }
  return out
}
