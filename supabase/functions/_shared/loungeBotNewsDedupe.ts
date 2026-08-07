/**
 * Cross-source near-dupe for Market Edge / Crypto Edge wire posts.
 * Exact title hash already lives on lounge_news_raw_items; this catches
 * CoinDesk vs Cointelegraph rewrites of the same story.
 */

import type { SupabaseClient } from 'npm:@supabase/supabase-js@2'

export const NEWS_NEAR_DUPE_LOOKBACK = 10

const STOPWORDS = new Set([
  'the',
  'a',
  'an',
  'and',
  'or',
  'of',
  'to',
  'in',
  'on',
  'for',
  'with',
  'from',
  'by',
  'as',
  'at',
  'is',
  'are',
  'was',
  'were',
  'be',
  'been',
  'being',
  'has',
  'have',
  'had',
  'its',
  'their',
  'this',
  'that',
  'these',
  'those',
  'into',
  'over',
  'under',
  'about',
  'after',
  'before',
  'per',
  'via',
  'vs',
  'amid',
  'after',
  'says',
  'said',
  'new',
  'report',
  'reports',
])

/** Strip source credit lines so we compare the story, not the outlet. */
export function stripNewsCreditNoise(text: string): string {
  let s = String(text || '').trim()
  if (!s) return ''
  // "CoinDesk: …"
  s = s.replace(/^[^:\n]{2,40}:\s+/u, '')
  // "…, per Cointelegraph." / "… - CoinDesk"
  s = s.replace(/,\s*per\s+[^.!?]+[.!?]?\s*$/iu, '')
  s = s.replace(/\s[-–—]\s+[A-Za-z0-9 .&'!-]{2,40}\s*$/u, '')
  return s.trim()
}

export function normalizeNewsDedupeText(text: string): string {
  let s = stripNewsCreditNoise(text).toLowerCase()
  s = s
    .replace(/\bu\.?\s*s\.?\b/g, 'us')
    .replace(/\bu\.?\s*k\.?\b/g, 'uk')
    .replace(/\be\.?\s*u\.?\b/g, 'eu')
  s = s.replace(/[^\w\s$]/g, ' ')
  s = s
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOPWORDS.has(w))
    .join(' ')
  return s.trim()
}

function significantTokens(text: string): string[] {
  const n = normalizeNewsDedupeText(text)
  if (!n) return []
  return n.split(/\s+/).filter(Boolean)
}

/** True when two headlines/captions are likely the same wire story. */
export function newsTitlesNearDuplicate(a: string, b: string): boolean {
  const tokensA = significantTokens(a)
  const tokensB = significantTokens(b)
  if (tokensA.length < 3 || tokensB.length < 3) return false

  const setA = new Set(tokensA)
  const setB = new Set(tokensB)
  let shared = 0
  for (const t of setA) if (setB.has(t)) shared += 1
  if (shared < 4) return false

  const shorter = Math.min(setA.size, setB.size)
  const union = setA.size + setB.size - shared
  const overlapRatio = shared / shorter
  const jaccard = shared / Math.max(1, union)
  return overlapRatio >= 0.55 || jaccard >= 0.42
}

export function newsTextNearDuplicateOfAny(candidate: string, recent: string[]): boolean {
  const c = String(candidate || '').trim()
  if (!c || !recent.length) return false
  return recent.some((r) => newsTitlesNearDuplicate(c, r))
}

/** First line of a published wire caption (headline). */
export function headlineFromWireCaption(caption: string): string {
  const line = String(caption || '').split(/\n/)[0] || ''
  return stripNewsCreditNoise(line)
}

/** Last N published wire captions/headlines for this bot. */
export async function loadRecentPublishedWireHeadlines(
  admin: SupabaseClient,
  botUserId: string,
  limit = NEWS_NEAR_DUPE_LOOKBACK,
): Promise<string[]> {
  const { data, error } = await admin
    .from('lounge_bot_publish_log')
    .select('caption')
    .eq('bot_user_id', botUserId)
    .eq('status', 'published')
    .order('created_at', { ascending: false })
    .limit(Math.max(1, Math.min(50, Math.floor(limit) || NEWS_NEAR_DUPE_LOOKBACK)))

  if (error || !Array.isArray(data)) return []

  const out: string[] = []
  for (const row of data) {
    const h = headlineFromWireCaption(String(row?.caption || ''))
    if (h) out.push(h)
  }
  return out
}
