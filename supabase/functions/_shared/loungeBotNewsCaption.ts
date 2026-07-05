/**
 * Market Edge caption builder — clean, fast, neutral-to-sharp (<= 500 chars).
 * Walter Bloomberg / Financial Juice style: lead with fact + tickers when present.
 * Dry humor is rare and only when headline already has a wry hook (no forced jokes).
 */

import { decodeHtmlEntities } from './decodeHtmlEntities.ts'
import { extractTickers, type NewsCandidate } from './loungeBotNewsScore.ts'

const CAPTION_MAX = 500

const FLUFF_PREFIX_RE = /^(breaking|just in|update|alert|exclusive)[:\s-]+/i

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

/**
 * Build Lounge caption from a news candidate.
 * Voice: factual wire rewrite; sparing dry humor only if source headline is already punchy.
 */
export function buildFinancialWireCaption(item: NewsCandidate): string {
  const title = cleanHeadline(item.title)
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
