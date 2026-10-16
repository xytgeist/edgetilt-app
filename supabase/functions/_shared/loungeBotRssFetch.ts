/**
 * Allowlisted RSS/Atom fetch for Market Edge (headline + link only).
 */

import { decodeHtmlEntities } from './decodeHtmlEntities.ts'
import { extractTickers, normalizeTitleHash, type NewsCandidate } from './loungeBotNewsScore.ts'

export type NormalizedNewsItem = NewsCandidate & {
  externalId: string
  contentHash: string
  publishedAtIso: string | null
  raw: Record<string, unknown>
}

const DEFAULT_RSS_USER_AGENT =
  'Mozilla/5.0 (compatible; EdgeTilt/1.0; +https://edgetilt.com)'

function decodeXmlText(raw: string): string {
  // Decode entities *before* tag strip so &lt;ul&gt;…&lt;/ul&gt; does not survive as HTML.
  let s = decodeHtmlEntities(
    String(raw || '').replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1'),
  )
  s = decodeHtmlEntities(s) // second pass for double-encoded feeds
  s = s
    .replace(/<\s*br\s*\/?\s*>/gi, ' ')
    .replace(/<\s*\/\s*p\s*>/gi, ' ')
    .replace(/<\s*p\b[^>]*>/gi, ' ')
    .replace(/<\s*\/\s*li\s*>/gi, ' ')
    .replace(/<\s*li\b[^>]*>/gi, ' • ')
    .replace(/<[^>]+>/g, ' ')
  return s.replace(/\s+/g, ' ').trim()
}

function parseRssItemBlocks(xml: string, sourceName: string): NormalizedNewsItem[] {
  const items: NormalizedNewsItem[] = []
  const blocks = xml.match(/<item[\s\S]*?<\/item>/gi) || []
  for (const block of blocks.slice(0, 40)) {
    const title = decodeXmlText(block.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || '')
    if (!title) continue
    const link = decodeXmlText(block.match(/<link[^>]*>([\s\S]*?)<\/link>/i)?.[1] || '')
    const guid = decodeXmlText(
      block.match(/<guid[^>]*>([\s\S]*?)<\/guid>/i)?.[1] || link || title,
    )
    const pubRaw = decodeXmlText(block.match(/<pubDate[^>]*>([\s\S]*?)<\/pubDate>/i)?.[1] || '')
    const desc = decodeXmlText(block.match(/<description[^>]*>([\s\S]*?)<\/description>/i)?.[1] || '')
    const publishedAtIso = pubRaw ? safeIso(pubRaw) : null
    items.push(normalizeItem({
      title,
      summary: desc,
      url: link,
      publishedAtIso,
      guid,
      sourceName,
    }))
  }
  return items
}

function parseAtomEntries(xml: string, sourceName: string): NormalizedNewsItem[] {
  const items: NormalizedNewsItem[] = []
  const blocks = xml.match(/<entry[\s\S]*?<\/entry>/gi) || []
  for (const block of blocks.slice(0, 40)) {
    const title = decodeXmlText(block.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || '')
    if (!title) continue
    const link =
      block.match(/<link[^>]*href=["']([^"']+)["']/i)?.[1]
      || decodeXmlText(block.match(/<link[^>]*>([\s\S]*?)<\/link>/i)?.[1] || '')
    const id = decodeXmlText(block.match(/<id[^>]*>([\s\S]*?)<\/id>/i)?.[1] || link || title)
    const pubRaw = decodeXmlText(
      block.match(/<updated[^>]*>([\s\S]*?)<\/updated>/i)?.[1]
        || block.match(/<published[^>]*>([\s\S]*?)<\/published>/i)?.[1]
        || '',
    )
    const summary = decodeXmlText(
      block.match(/<summary[^>]*>([\s\S]*?)<\/summary>/i)?.[1]
        || block.match(/<content[^>]*>([\s\S]*?)<\/content>/i)?.[1]
        || '',
    )
    const publishedAtIso = pubRaw ? safeIso(pubRaw) : null
    items.push(normalizeItem({
      title,
      summary,
      url: link,
      publishedAtIso,
      guid: id,
      sourceName,
    }))
  }
  return items
}

function safeIso(raw: string): string | null {
  const d = new Date(raw)
  return Number.isFinite(d.getTime()) ? d.toISOString() : null
}

function normalizeItem(input: {
  title: string
  summary?: string
  url?: string
  publishedAtIso: string | null
  guid: string
  sourceName: string
}): NormalizedNewsItem {
  const title = String(input.title || '').trim()
  const summary = String(input.summary || '').trim()
  return {
    title,
    summary: summary || undefined,
    url: String(input.url || '').trim() || undefined,
    publishedAt: input.publishedAtIso,
    tickers: extractTickers(`${title} ${summary}`),
    sourceName: input.sourceName,
    externalId: String(input.guid || title).slice(0, 240),
    contentHash: normalizeTitleHash(title),
    publishedAtIso: input.publishedAtIso,
    raw: {
      title,
      url: input.url,
      guid: input.guid,
      sourceName: input.sourceName,
    },
  }
}

export function parseFeedXml(xml: string, sourceName: string): NormalizedNewsItem[] {
  const trimmed = String(xml || '').trim()
  if (!trimmed) return []
  if (/<feed[\s>]/i.test(trimmed) || /<entry[\s>]/i.test(trimmed)) {
    return parseAtomEntries(trimmed, sourceName)
  }
  return parseRssItemBlocks(trimmed, sourceName)
}

export async function fetchAllowlistedFeed(
  url: string,
  sourceName: string,
  headers: Record<string, string> = {},
): Promise<NormalizedNewsItem[]> {
  const res = await fetch(url, {
    headers: {
      Accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml',
      'User-Agent': DEFAULT_RSS_USER_AGENT,
      ...headers,
    },
  })
  if (!res.ok) throw new Error(`${sourceName} fetch ${res.status}`)
  const xml = await res.text()
  return parseFeedXml(xml, sourceName)
}
