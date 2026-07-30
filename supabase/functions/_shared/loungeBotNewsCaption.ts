/**
 * Market Edge caption builder — clean, fast, neutral-to-sharp (<= 2000 chars for bots).
 * Walter Bloomberg / Financial Juice style: lead with fact + tickers when present.
 * Dry humor is rare and only when headline already has a wry hook (no forced jokes).
 */

import { decodeHtmlEntities } from './decodeHtmlEntities.ts'
import { sanitizeWireProse } from './wireBotProse.ts'
import { extractTickers, type NewsCandidate } from './loungeBotNewsScore.ts'
import type { NewsProfile } from './loungeBotNewsProfile.ts'
import { LOUNGE_BOT_CAPTION_MAX } from './loungeBotCaptionLimits.ts'
import { composeWirePost, type WirePostComposeResult } from './loungeBotNewsSynopsis.ts'

const FLUFF_PREFIX_RE = /^(breaking|just in|update|alert|exclusive)[:\s-]+/i

/** Publisher/editorial voice — bot must not repost as its own take. */
const FIRST_PERSON_RE =
  /\b(here are|here'?s|what we'?re|we'?re|we'?ve|we'?ll|\bwe\b|\bour\b|\bus\b|\bi'?m|\bi'?ve|\bmy\b|\bi\b)\b/i

function cleanHeadline(raw: string): string {
  let s = sanitizeWireProse(
    decodeHtmlEntities(String(raw || ''))
      .replace(/\s+/g, ' ')
      .trim(),
  )
  s = s.replace(FLUFF_PREFIX_RE, '')
  s = s.replace(/\.\.\.$/, '.')
  if (s && !/[.!?]$/.test(s)) s += '.'
  return s
}

function shorten(text: string, max: number): string {
  const t = String(text || '').trim()
  if (t.length <= max) return t
  return `${t.slice(0, max - 1).trim()}…`
}

/** Strip duplicate ticker tokens already in the lead line. */
function bodyWithoutTickerDup(body: string, tickers: string[]): string {
  if (!tickers.length) return body
  const escaped = tickers.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')
  const stripped = body.replace(new RegExp(`\\$?(${escaped})\\b`, 'gi'), '').replace(/\s+/g, ' ').trim()
  return stripped.length > 24 ? stripped : body
}

const GENERIC_SOURCE_LABELS = new Set(['rss', 'feed', 'xml', 'atom'])

/** Known publisher display names (hostname or config label → brand). */
const SOURCE_BRAND_BY_HOST: Record<string, string> = {
  'finance.yahoo.com': 'Yahoo! Finance',
  'yahoo.com': 'Yahoo! Finance',
  'marketwatch.com': 'MarketWatch',
  'www.marketwatch.com': 'MarketWatch',
}

const SOURCE_BRAND_BY_LABEL: Record<string, string> = {
  'yahoo finance': 'Yahoo! Finance',
  marketwatch: 'MarketWatch',
}

function isGenericSourceLabel(name: string): boolean {
  return GENERIC_SOURCE_LABELS.has(String(name || '').trim().toLowerCase())
}

function brandFromHostname(host: string): string | null {
  const h = String(host || '').trim().toLowerCase().replace(/^www\./, '')
  if (!h) return null
  return SOURCE_BRAND_BY_HOST[h] || SOURCE_BRAND_BY_HOST[`www.${h}`] || null
}

function brandFromConfigLabel(label: string): string | null {
  const key = String(label || '').trim().toLowerCase()
  return SOURCE_BRAND_BY_LABEL[key] || null
}

function sourceLabel(item: NewsCandidate): string {
  const fromName = String(item.sourceName || '').trim()
  if (fromName && !isGenericSourceLabel(fromName)) {
    return fromName.replace(/\s+rss$/i, '').trim()
  }
  const url = String(item.url || '').trim()
  if (url) {
    try {
      const host = new URL(url).hostname.replace(/^www\./i, '')
      const brand = brandFromHostname(host)
      if (brand) return brand
      return host
    } catch {
      /* fall through */
    }
  }
  if (fromName) {
    const brand = brandFromConfigLabel(fromName)
    if (brand) return brand
  }
  return 'Report'
}

/** CoinDesk, not coindesk.com — for `Source: headline` credit lines. */
function sourceDisplayName(item: NewsCandidate): string {
  const fromName = String(item.sourceName || '').trim()
  if (fromName && !isGenericSourceLabel(fromName)) {
    const cleaned = fromName.replace(/\s+rss$/i, '').trim()
    return brandFromConfigLabel(cleaned) || cleaned
  }

  const url = String(item.url || '').trim()
  if (url) {
    try {
      const host = new URL(url).hostname.replace(/^www\./i, '')
      const brand = brandFromHostname(host)
      if (brand) return brand
    } catch {
      /* fall through */
    }
  }

  const host = sourceLabel(item)
  if (host === 'Report') return 'Report'

  const base = host.replace(/\.(com|org|net|io|co|uk)$/i, '')
  if (!base.includes('.')) {
    if (base === 'coindesk') return 'CoinDesk'
    if (base === 'bbc') return 'BBC'
    if (base === 'npr') return 'NPR'
    return `${base.charAt(0).toUpperCase()}${base.slice(1)}`
  }
  return host
}

function normalizeHeadlineCompare(text: string): string {
  return String(text || '')
    .toLowerCase()
    .replace(/[^\w\s$']/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\.$/, '')
}

function headlinesAreDuplicate(wireTitle: string, originalTitle: string): boolean {
  const a = normalizeHeadlineCompare(wireTitle)
  const b = normalizeHeadlineCompare(originalTitle)
  if (!a || !b) return false
  return a === b
}

/** 1:1 feed headline → `CoinDesk: …` credit (optional $TICKER lead stays first). */
function creditSourceIfDuplicateHeadline(
  headlineLine: string,
  item: NewsCandidate,
  wireTitle: string,
): string {
  const label = sourceDisplayName(item)
  if (label === 'Report') return headlineLine
  if (!headlinesAreDuplicate(wireTitle, String(item.title || ''))) return headlineLine
  if (new RegExp(`^${label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}:`, 'i').test(headlineLine)) {
    return headlineLine
  }

  const tickerLead = headlineLine.match(/^((?:\$[A-Z][A-Za-z0-9.-]{0,14}\s+)+)/)?.[1]?.trim() || ''
  const body = tickerLead ? headlineLine.slice(tickerLead.length).trim() : headlineLine
  const credited = `${label}: ${body}`
  return tickerLead ? `${tickerLead} ${credited}` : credited
}

function headlineUsesFirstPerson(title: string): boolean {
  return FIRST_PERSON_RE.test(String(title || ''))
}

/** Reframe publisher "we/our" headlines as third-person wire with attribution. */
function rewriteFirstPersonHeadline(title: string, label: string): string {
  let t = cleanHeadline(title).replace(/[.!?]+$/, '').trim()

  t = t.replace(/^here are (?:the )?/i, '')
  t = t.replace(/^here'?s (?:the )?/i, '')
  t = t.replace(/^what we'?re (?:watching|tracking|following)[:\s-]*/i, '')
  t = t.replace(/\bwe'?re watching\b/gi, 'worth watching')
  t = t.replace(/\bwe'?re tracking\b/gi, 'in focus')
  t = t.replace(/\bwe'?re following\b/gi, 'on the radar')
  t = t.replace(/\bwe'?re\b/gi, '')
  t = t.replace(/\bwe'?ve\b/gi, '')
  t = t.replace(/\bwe'?ll\b/gi, '')
  t = t.replace(/\bour\b/gi, 'the')
  t = t.replace(/\b(i am|i'?m|i'?ve)\b/gi, '')
  t = t.replace(/\bmy\b/gi, 'the')
  t = t.replace(/\s+/g, ' ').trim()

  if (t && !/[.!?]$/.test(t)) t += '.'

  const body = `${t.charAt(0).toUpperCase()}${t.slice(1)}`
  if (label && label !== 'Report') {
    return sanitizeWireProse(`${body.replace(/[.!?]+$/, '')}, per ${label}.`)
  }
  return sanitizeWireProse(body)
}

function wireHeadline(item: NewsCandidate): string {
  const title = cleanHeadline(item.title)
  if (!headlineUsesFirstPerson(item.title || '')) return title
  return rewriteFirstPersonHeadline(item.title || '', sourceLabel(item))
}

const CRYPTO_ASSET_LEADS: Array<{ re: RegExp; sym: string }> = [
  { re: /\bbitcoin\b|\bbtc\b/i, sym: 'BTC' },
  { re: /\bethereum\b|\beth\b/i, sym: 'ETH' },
  { re: /\bsolana\b/i, sym: 'SOL' },
  { re: /\bxrp\b|\bripple\b/i, sym: 'XRP' },
  { re: /\bdogecoin\b|\bdoge\b/i, sym: 'DOGE' },
]

function cryptoLeadSymbols(text: string, existing: string[]): string[] {
  const out: string[] = []
  const seen = new Set(existing.map((t) => t.toUpperCase()))
  for (const { re, sym } of CRYPTO_ASSET_LEADS) {
    if (re.test(text) && !seen.has(sym)) {
      seen.add(sym)
      out.push(sym)
    }
  }
  return out.slice(0, 3)
}

function buildHeadlineLine(item: NewsCandidate, opts: { newsProfile?: NewsProfile } = {}): string {
  const wireTitle = wireHeadline(item)
  let tickers = item.tickers?.length
    ? item.tickers.map((t) => t.toUpperCase())
    : extractTickers(`${item.title} ${item.summary || ''}`)

  if (opts.newsProfile === 'crypto') {
    tickers = [...new Set([...cryptoLeadSymbols(`${item.title} ${item.summary || ''}`, tickers), ...tickers])].slice(0, 3)
  }

  const lead = tickers.length > 0
    ? tickers.slice(0, 3).map((t) => `$${t}`).join(' ')
    : ''

  let body = bodyWithoutTickerDup(wireTitle, tickers)
  if (lead) body = `${lead} ${body}`.trim()
  return creditSourceIfDuplicateHeadline(body, item, wireTitle)
}

/**
 * Build Lounge caption from a news candidate (headline only — skip logs / dry fallback).
 */
export function buildFinancialWireCaption(item: NewsCandidate): string {
  return shorten(sanitizeWireProse(buildHeadlineLine(item)), LOUNGE_BOT_CAPTION_MAX)
}

/** Headline + OpenAI compose (synopsis length + link decision) for published wire posts. */
export async function buildFinancialWirePostAsync(
  item: NewsCandidate,
  opts: { newsProfile?: NewsProfile } = {},
): Promise<WirePostComposeResult> {
  const headlineLine = buildHeadlineLine(item, opts)
  const composed = await composeWirePost({
    headline: headlineLine,
    originalTitle: item.title,
    summary: item.summary,
    sourceLabel: sourceLabel(item),
    newsProfile: opts.newsProfile,
  })

  return {
    caption: shorten(sanitizeWireProse(composed.caption || headlineLine), LOUNGE_BOT_CAPTION_MAX),
    includeLink: Boolean(item.url)
      && (opts.newsProfile === 'crypto' ? true : composed.includeLink),
  }
}

/** @deprecated use buildFinancialWirePostAsync */
export async function buildFinancialWireCaptionAsync(
  item: NewsCandidate,
  opts: { newsProfile?: NewsProfile } = {},
): Promise<string> {
  const { caption } = await buildFinancialWirePostAsync(item, opts)
  return caption
}

/** @deprecated alias */
export const buildMarketEdgeCaption = buildFinancialWireCaption
