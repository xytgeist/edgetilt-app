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
      '8-k',
      '10-q',
      '10-k',
      'sec filing',
      'edgar',
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
]

/** Routine EDGAR 8-K filings — not Lounge-worthy wire posts. */
export function isBlockedNewsItem(item: NewsCandidate & { raw?: Record<string, unknown> }): boolean {
  const title = String(item.title || '').trim().toLowerCase()
  const source = String(item.sourceName || '').trim().toLowerCase()
  const filingType = String(item.raw?.filingType || item.raw?.filing_type || '').trim().toUpperCase()

  if (filingType === '8-K') return true
  if (source.includes('edgar 8-k') || source === 'sec edgar 8-k') return true
  if (/^8-k\b/i.test(title) || /\b8-k filing:/i.test(title)) return true
  return false
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

  const { matchedTiers, tierBonus } = matchTopicTiers(blob)

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
  if (source.includes('sec edgar') || source.includes('sec press')) score += 8
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
