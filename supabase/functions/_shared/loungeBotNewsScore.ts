import { scoreCryptoNewsCandidateDetailed } from './loungeBotCryptoNewsScore.ts'
import type { NewsProfile } from './loungeBotNewsProfile.ts'

/**
 * Topic-tier scoring for Market Edge (0–100).
 * Prioritizes market-moving world news — not a fixed ticker watchlist.
 */

/** Tier weights: first match per tier only (no keyword stacking spam). */
const TOPIC_TIERS: Array<{ id: string; weight: number; keywords: string[] }> = [
  {
    id: 'economic_data',
    weight: 16,
    keywords: [
      'cpi',
      'consumer price index',
      'ppi',
      'producer price',
      'jobs report',
      'nonfarm',
      'non-farm',
      'unemployment',
      'jobless claims',
      'adp employment',
      'gdp',
      'retail sales',
      'ism manufacturing',
      'ism services',
      'pmi',
      'durable goods',
      'housing starts',
      'building permits',
      'consumer confidence',
      'michigan sentiment',
      'trade balance',
      'import prices',
      'export prices',
      'bill auction',
      'treasury auction',
      'bid-to-cover',
      'auction high',
      '3-month bill',
      '10-year note',
      'strategic petroleum reserve',
    ],
  },
  {
    id: 'fed_central_bank',
    weight: 15,
    keywords: [
      'fomc',
      'federal reserve',
      'fed chair',
      'fed governor',
      'fed minutes',
      'fed speaker',
      'rate cut',
      'rate hike',
      'interest rate',
      'powell',
      'ecb',
      'european central bank',
      'bank of england',
      'bank of japan',
      'boj',
      'central bank',
      'treasury secretary',
      'yellen',
      'bessent',
      'yield curve',
      'dot plot',
    ],
  },
  {
    id: 'earnings_guidance',
    weight: 14,
    keywords: [
      'earnings',
      'guidance',
      'beats estimates',
      'misses estimates',
      'beats ',
      'misses ',
      'revenue',
      'profit warning',
      'outlook cut',
      'outlook raise',
      'eps',
      'same-store sales',
      'preliminary results',
      'after hours',
      'after-hours',
      'premarket',
      'pre-market',
    ],
  },
  {
    id: 'geopolitical',
    weight: 14,
    keywords: [
      'geopolit',
      'sanctions',
      'ceasefire',
      'invasion',
      'airstrike',
      'missile',
      'middle east',
      'ukraine',
      'russia',
      'china taiwan',
      'strait',
      'opec',
      'supply disruption',
      'embargo',
      'trade war',
      'tariff',
      'tariffs',
    ],
  },
  {
    id: 'regulatory',
    weight: 13,
    keywords: [
      'sec ',
      'securities and exchange',
      'antitrust',
      'doj ',
      'department of justice',
      'cftc',
      'crypto regul',
      'bitcoin etf',
      'stablecoin',
      'executive order',
      'fda approv',
      'fda reject',
      'ftc ',
    ],
  },
  {
    id: 'ma_distress_activist',
    weight: 12,
    keywords: [
      'merger',
      'acquisition',
      'm&a',
      'takeover',
      'buyout',
      'bankruptcy',
      'chapter 11',
      'restructuring',
      'activist investor',
      'activist ',
      'proxy fight',
      'ipo',
      'spac',
      'goes public',
      'delisting',
      'downgrade',
      'upgrade',
    ],
  },
  {
    id: 'prediction_markets',
    weight: 13,
    keywords: [
      'polymarket',
      'kalshi',
      'prediction market',
      'prediction markets',
      'betting odds',
      'chance of advancing',
      'odds of advancing',
    ],
  },
  {
    id: 'commodities',
    weight: 12,
    keywords: [
      'crude oil',
      'oil prices',
      'wti',
      'brent',
      'natural gas',
      'gold prices',
      'gold futures',
      'silver',
      'copper',
      'commodity',
      'commodities',
      'grain',
      'wheat',
      'inventory draw',
      'inventory build',
      'strategic petroleum',
    ],
  },
  {
    id: 'crypto_risk',
    weight: 10,
    keywords: [
      'bitcoin',
      'btc',
      'ethereum',
      'eth ',
      'crypto',
      'digital asset',
      'defi',
      'exchange hack',
      'stablecoin',
    ],
  },
  {
    id: 'options_flow',
    weight: 9,
    keywords: [
      'unusual options',
      'options activity',
      'options flow',
      'whale',
      'block trade',
      'sweep',
      'open interest',
      'gamma',
      'put/call',
    ],
  },
  {
    id: 'macro_risk',
    weight: 8,
    keywords: [
      'inflation',
      'recession',
      'stagflation',
      'risk-off',
      'risk on',
      'volatility',
      'vix',
      'credit spread',
      'default',
      'liquidity',
      'stimulus',
      'fiscal',
    ],
  },
]

const DROP_KEYWORDS = [
  'how to',
  'top 10',
  'best stocks',
  'crypto giveaway',
  'sponsored',
  'advertisement',
  'quiz',
  'celebrity',
  'horoscope',
  'recipe',
  'watch live',
  'must step aside',
  'among ipo underwriters',
  'ipo underwriter',
  'rose garden club',
  '10-q filing',
  '10-k filing',
  '8-k filing',
  'sec edgar',
]

/** SEC EDGAR filing notices — not Lounge-worthy wire posts. */
export function isBlockedNewsItem(item: NewsCandidate & { raw?: Record<string, unknown> }): boolean {
  const title = String(item.title || '').trim().toLowerCase()
  const source = String(item.sourceName || '').trim().toLowerCase()
  const filingType = String(item.raw?.filingType || item.raw?.filing_type || '').trim().toUpperCase()

  if (item.raw?.edgar === true) return true
  if (filingType === '8-K' || filingType === '10-Q' || filingType === '10-K') return true
  if (source.includes('sec edgar') || (source.includes('edgar') && source.includes('sec'))) return true
  if (/^(8-k|10-q|10-k)\b/i.test(title) || /\b(8-k|10-q|10-k) filing:/i.test(title)) return true
  return false
}

const TRUMP_RE = /\b(trump|donald trump|president trump)\b/i

const TRUMP_MARKET_CONTEXT = [
  'tariff',
  'tariffs',
  'stock',
  'stocks',
  'market',
  'fed',
  'trade',
  'dollar',
  'bond',
  'yield',
  'inflation',
  'oil',
  'crypto',
  'bitcoin',
  'semiconductor',
  'invest',
  'economy',
  'gdp',
  'treasury',
  'earnings',
  'rate',
  'sanction',
  'china',
  'iran',
  'tax',
  'import',
  'export',
  'wall street',
  'nasdaq',
  'dow',
  's&p',
  'circuit',
  'ipo',
  'merger',
  'antitrust',
  'sec ',
  'account',
  'computer',
  'chip',
  'ai ',
  'bubble',
  'jpmorgan',
  'nvidia',
  'dell',
  'polymarket',
  'kalshi',
]

/**
 * Market Edge may still post crypto when it is macro-relevant / major.
 * Keep this list tight ... bare "exchange" / "binance" / "coinbase" used to
 * let routine Degentics wire through as Market Edge doubles.
 */
const MAJOR_CRYPTO_SIGNALS = [
  'bitcoin etf',
  'ether etf',
  'ethereum etf',
  'spot etf',
  ' etf',
  'etf ',
  'sec approv',
  'sec reject',
  'sec ',
  'regulat',
  'crypto regul',
  'hack',
  'exploit',
  'breach',
  'liquidat',
  'all-time high',
  'all time high',
  ' ath',
  'record high',
  'circuit breaker',
  'blackrock',
  'fidelity',
  'depeg',
  'stablecoin',
  'custody',
  'micar',
  'mica ',
  'microstrategy',
  'saylor',
  'trillion',
  'billion',
]

/** Tiers that make a crypto-flavored headline a real Market Edge story. */
const CRYPTO_MACRO_COMPANION_TIERS = new Set([
  'economic_data',
  'fed_central_bank',
  'regulatory',
  'geopolitical',
  'earnings_guidance',
  'commodities',
  'ma_distress_activist',
])

function isNonMarketTrumpStory(blob: string): boolean {
  if (!TRUMP_RE.test(blob)) return false
  return !TRUMP_MARKET_CONTEXT.some((kw) => blob.includes(kw))
}

function hasMajorCryptoSignal(blob: string): boolean {
  if (MAJOR_CRYPTO_SIGNALS.some((kw) => blob.includes(kw))) return true
  if (/\$\d{2,}[,\d]*|\d+\s*(billion|million)\b|\d+\s*m liquidat/i.test(blob)) return true
  return false
}

/**
 * True when Market Edge should leave this to Crypto Edge (Degentics):
 * crypto-flavored, not a major signal, and no strong macro companion tier.
 */
function shouldDeferCryptoToCryptoEdge(blob: string, matchedTiers: string[]): boolean {
  if (!matchedTiers.includes('crypto_risk')) return false
  if (hasMajorCryptoSignal(blob)) return false
  if (matchedTiers.some((t) => t !== 'crypto_risk' && CRYPTO_MACRO_COMPANION_TIERS.has(t))) {
    return false
  }
  return true
}

/** Title/summary looks like crypto wire (for cross-bot near-dupe). */
export function looksLikeCryptoWireStory(title: string, summary = ''): boolean {
  const blob = `${title} ${summary}`.toLowerCase()
  if (!blob.trim()) return false
  return (
    blob.includes('bitcoin') ||
    blob.includes('btc') ||
    blob.includes('ethereum') ||
    blob.includes(' eth ') ||
    blob.includes('crypto') ||
    blob.includes('digital asset') ||
    blob.includes('defi') ||
    blob.includes('stablecoin') ||
    blob.includes('solana') ||
    blob.includes('$btc') ||
    blob.includes('$eth') ||
    blob.includes('$sol')
  )
}

const CASHTAG_RE = /\$([A-Za-z][A-Za-z0-9.-]{0,14})\b/g

export type NewsCandidate = {
  title: string
  summary?: string
  url?: string
  publishedAt?: string | null
  tickers?: string[]
  sourceName?: string
}

export type TopicScoreResult = {
  score: number
  matchedTiers: string[]
}

export function extractTickers(text: string): string[] {
  const out: string[] = []
  const seen = new Set<string>()
  CASHTAG_RE.lastIndex = 0
  let m: RegExpExecArray | null
  while ((m = CASHTAG_RE.exec(text)) !== null) {
    const sym = String(m[1] || '').toUpperCase()
    if (sym && !seen.has(sym)) {
      seen.add(sym)
      out.push(sym)
    }
  }
  return out
}

/** Normalize title for dedupe clustering. */
export function normalizeTitleHash(title: string): string {
  return String(title || '')
    .toLowerCase()
    .replace(/[^\w\s$]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 240)
}

function matchTopicTiers(blob: string): { matchedTiers: string[]; tierBonus: number } {
  const matchedTiers: string[] = []
  let tierBonus = 0
  for (const tier of TOPIC_TIERS) {
    if (tier.keywords.some((kw) => blob.includes(kw))) {
      matchedTiers.push(tier.id)
      tierBonus += tier.weight
    }
  }
  return { matchedTiers, tierBonus }
}

export type NewsScoreOpts = {
  watchlistTickers?: string[]
  minTitleLength?: number
  newsProfile?: NewsProfile
}

export function scoreNewsCandidate(item: NewsCandidate, opts: NewsScoreOpts = {}): number {
  return scoreNewsCandidateDetailed(item, opts).score
}

export function scoreNewsCandidateDetailed(
  item: NewsCandidate,
  opts: NewsScoreOpts = {},
): TopicScoreResult {
  if (isBlockedNewsItem(item)) {
    return { score: 0, matchedTiers: [] }
  }
  if (opts.newsProfile === 'crypto') {
    return scoreCryptoNewsCandidateDetailed(item, opts)
  }
  const title = String(item.title || '').trim()
  const summary = String(item.summary || '').trim()
  const blob = `${title} ${summary}`.toLowerCase()
  if (!title || title.length < (opts.minTitleLength ?? 12)) {
    return { score: 0, matchedTiers: [] }
  }

  for (const bad of DROP_KEYWORDS) {
    if (blob.includes(bad)) return { score: 0, matchedTiers: [] }
  }

  if (isNonMarketTrumpStory(blob)) {
    return { score: 0, matchedTiers: [] }
  }

  const { matchedTiers, tierBonus } = matchTopicTiers(blob)

  if (shouldDeferCryptoToCryptoEdge(blob, matchedTiers)) {
    // Below default publish threshold (55) ... Degentics owns routine crypto wire.
    return { score: Math.min(44, 28 + Math.min(tierBonus, 10)), matchedTiers }
  }

  // Off-topic general news stays below default publish threshold (55).
  if (!matchedTiers.length) {
    return { score: Math.min(40, 20 + (title.length > 40 ? 5 : 0)), matchedTiers: [] }
  }

  let score = 28 + tierBonus

  const tickers = item.tickers?.length
    ? item.tickers
    : extractTickers(`${title} ${summary}`)
  if (tickers.length > 0) score += 6
  if (tickers.length > 2) score += 3

  const source = String(item.sourceName || '').toLowerCase()
  if (source.includes('sec press')) score += 8
  if (source.includes('federal reserve') || source.includes('treasury') || source.includes('cftc')) score += 6
  if (source.includes('eia')) score += 5

  // Optional admin override tickers — small nudge only, not primary filter.
  const watch = new Set((opts.watchlistTickers || []).map((t) => t.toUpperCase()).filter(Boolean))
  if (watch.size > 0 && tickers.some((t) => watch.has(t.toUpperCase()))) {
    score += 5
  }

  const ageMs = item.publishedAt ? Date.now() - new Date(item.publishedAt).getTime() : null
  if (ageMs != null && Number.isFinite(ageMs)) {
    if (ageMs < 30 * 60_000) score += 10
    else if (ageMs < 2 * 3600_000) score += 6
    else if (ageMs < 6 * 3600_000) score += 3
    else if (ageMs > 48 * 3600_000) score -= 18
  }

  if (title.length > 180) score -= 4

  return {
    score: Math.max(0, Math.min(100, Math.round(score))),
    matchedTiers,
  }
}
