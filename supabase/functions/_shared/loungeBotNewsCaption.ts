/**
 * Market Edge caption builder — clean, fast, neutral-to-sharp (<= 500 chars).
 * Walter Bloomberg / Financial Juice style: lead with fact + tickers when present.
 * Dry humor is rare and only when headline already has a wry hook (no forced jokes).
 */

import { decodeHtmlEntities } from './decodeHtmlEntities.ts'
import { extractTickers, type NewsCandidate } from './loungeBotNewsScore.ts'

const CAPTION_MAX = 500

const FLUFF_PREFIX_RE = /^(breaking|just in|update|alert|exclusive)[:\s-]+/i

/** Publisher/editorial voice — bot must not repost as its own take. */
const FIRST_PERSON_RE =
  /\b(here are|here'?s|what we'?re|we'?re|we'?ve|we'?ll|\bwe\b|\bour\b|\bus\b|\bi'?m|\bi'?ve|\bmy\b|\bi\b)\b/i

function cleanHeadline(raw: string): string {
  let s = decodeHtmlEntities(String(raw || ''))
    .replace(/\s+/g, ' ')
    .trim()
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

function sourceLabel(item: NewsCandidate): string {
  const fromName = String(item.sourceName || '').trim()
  if (fromName) return fromName.replace(/\s+rss$/i, '').trim()
  const url = String(item.url || '').trim()
  if (!url) return 'Report'
  try {
    return new URL(url).hostname.replace(/^www\./i, '')
  } catch {
    return 'Report'
  }
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

  const lead = label && label !== 'Report' ? `${label} — ` : 'Report — '
  return `${lead}${t.charAt(0).toUpperCase()}${t.slice(1)}`
}

function wireHeadline(item: NewsCandidate): string {
  const title = cleanHeadline(item.title)
  if (!headlineUsesFirstPerson(item.title || '')) return title
  return rewriteFirstPersonHeadline(item.title || '', sourceLabel(item))
}

/**
 * Build Lounge caption from a news candidate.
 * Voice: factual wire rewrite; sparing dry humor only if source headline is already punchy.
 */
export function buildFinancialWireCaption(item: NewsCandidate): string {
  const title = wireHeadline(item)
  const tickers = item.tickers?.length
    ? item.tickers.map((t) => t.toUpperCase())
    : extractTickers(`${item.title} ${item.summary || ''}`)

  const lead = tickers.length > 0
    ? tickers.slice(0, 3).map((t) => `$${t}`).join(' ')
    : ''

  let body = bodyWithoutTickerDup(title, tickers)
  if (lead) body = `${lead} ${body}`.trim()

  return shorten(body, CAPTION_MAX)
}

/** @deprecated alias */
export const buildMarketEdgeCaption = buildFinancialWireCaption
