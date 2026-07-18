/**
 * OpenAI compose step for wire bot posts (Market Edge + Crypto Edge).
 * Decides link + synopsis length in one call; RSS excerpt fallback when API unavailable.
 */

import { decodeHtmlEntities } from './decodeHtmlEntities.ts'
import { sanitizeWireProse } from './wireBotProse.ts'
import type { NewsProfile } from './loungeBotNewsProfile.ts'

const SYNOPSIS_MAX = 380
const OPENAI_TIMEOUT_MS = 12000

const PERSONA: Record<NewsProfile, string> = {
  market:
    'Market Edge wire ... terse Financial Juice / Walter Bloomberg style. Lead with fact and numbers; use $TICKER when company-specific. When headline is a 1:1 source duplicate it is already prefixed "Source: headline". No JUST IN prefix. Third person only. Never use em dashes or en dashes.',
  crypto:
    'Crypto Edge wire ... Watcher.Guru speed for digital assets. Lead with $BTC/$ETH/$SOL and big $ figures (liquidations, reclaims, hacks). Optional dry degen humor ONLY when the headline is already ironic ... one short line max, never forced memes. No wagmi/lfg/nfa/shill/moon spam. No JUST IN on every post. Third person. Never em dashes or en dashes.',
}

const CRYPTO_VOICE_RULES =
  `Crypto voice extras:\n` +
  `- Headline is fixed and already shown; synopsis must add new detail only (never restate the headline).\n` +
  `- Liquidations, depegs, exchange halts, ETF/reg enforcement = straight wire, no jokes.\n` +
  `- Never sound like a shill account or paid promo.\n\n`

export type WirePostComposeInput = {
  headline: string
  originalTitle?: string
  summary?: string
  sourceLabel: string
  newsProfile?: NewsProfile
}

export type WirePostComposeResult = {
  /** Caption body without URL (headline, optional blank line + synopsis). */
  caption: string
  /** Attach source URL + link preview card when true. */
  includeLink: boolean
}

function normalizeCompareText(text: string): string {
  return String(text || '')
    .toLowerCase()
    .replace(/[^\w\s$']/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function headlineBodiesForCompare(headline: string, originalTitle?: string): string[] {
  const out = new Set<string>()
  const h = String(headline || '').trim()
  if (h) out.add(h)
  const credited = h.match(/^[^:]+:\s*(.+)$/i)
  if (credited?.[1]?.trim()) out.add(credited[1].trim())
  const orig = String(originalTitle || '').trim()
  if (orig) out.add(orig)
  return [...out]
}

function textsAreNearDuplicate(a: string, b: string): boolean {
  const na = normalizeCompareText(a)
  const nb = normalizeCompareText(b)
  if (!na || !nb) return false
  if (na === nb) return true

  const shorter = na.length <= nb.length ? na : nb
  const longer = na.length <= nb.length ? nb : na
  if (longer.includes(shorter) && shorter.length / longer.length >= 0.55) return true

  const tokensA = shorter.split(' ').filter((w) => w.length > 2)
  const tokensB = new Set(longer.split(' ').filter((w) => w.length > 2))
  if (tokensA.length < 3 || tokensB.size < 3) return false
  let overlap = 0
  for (const t of tokensA) if (tokensB.has(t)) overlap += 1
  return overlap / tokensA.length >= 0.65
}

function sentenceRedundantWithHeadline(sentence: string, headlines: string[]): boolean {
  const s = String(sentence || '').trim()
  if (!s) return true
  return headlines.some((h) => textsAreNearDuplicate(s, h))
}

/** Drop synopsis sentences that only restate the headline (title is already shown above). */
function filterSynopsisRedundancy(
  synopsis: string,
  headline: string,
  originalTitle?: string,
): string {
  const raw = String(synopsis || '').trim()
  if (!raw) return ''

  const refs = headlineBodiesForCompare(headline, originalTitle)
  const parts = raw.match(/[^.!?]+[.!?]+(?:\s|$)/g)
  if (!parts?.length) {
    return sentenceRedundantWithHeadline(raw, refs) ? '' : sanitizeWireProse(raw)
  }

  const kept: string[] = []
  for (const part of parts) {
    const s = part.trim()
    if (!s || sentenceRedundantWithHeadline(s, refs)) continue
    kept.push(s)
  }
  return sanitizeWireProse(kept.join(' ').trim())
}

function splitSummarySentences(summary: string): string[] {
  const t = sanitizeWireProse(
    decodeHtmlEntities(String(summary || ''))
      .replace(/\s+/g, ' ')
      .trim(),
  )
  if (!t || t.length < 48) return []
  if (/^(read more|click here|view article)/i.test(t)) return []
  return t.match(/[^.!?]+[.!?]+(?:\s|$)/g)?.map((s) => s.trim()).filter(Boolean) ?? [t]
}

function clipFeedSummary(
  summary: string,
  maxSentences: 1 | 2,
  headline: string,
  originalTitle?: string,
): string {
  const refs = headlineBodiesForCompare(headline, originalTitle)
  const kept: string[] = []
  for (const sentence of splitSummarySentences(summary)) {
    if (sentenceRedundantWithHeadline(sentence, refs)) continue
    kept.push(sentence)
    if (kept.length >= maxSentences) break
  }
  const joined = kept.join(' ').trim()
  return joined ? joined.slice(0, SYNOPSIS_MAX) : ''
}

function headlineLooksSelfContained(headline: string): boolean {
  const h = String(headline || '').trim()
  if (h.length < 72) return false
  const hasActor =
    /\b(SEC|Fed|CPI|GDP|FOMC|Treasury|CFTC|Apple|Microsoft|Nvidia|Tesla|Sberbank|Bitcoin|Ethereum)\b/i.test(h)
    || /\$[A-Z]{1,5}\b/.test(h)
  const hasFact = /\d|%|\b(billion|million|bps|basis points|rate cut|rate hike)\b/i.test(h)
  return hasActor && hasFact && h.length >= 85
}

function fallbackCompose(input: WirePostComposeInput): WirePostComposeResult {
  const headline = String(input.headline || '').trim()
  const summary = String(input.summary || '').trim()
  const selfContained = headlineLooksSelfContained(headline)

  if (selfContained && summary.length < 80) {
    return { caption: sanitizeWireProse(headline), includeLink: false }
  }

  const synopsis = clipFeedSummary(summary, selfContained ? 1 : 2, headline, input.originalTitle)
  if (!synopsis) {
    return {
      caption: sanitizeWireProse(headline),
      includeLink: !selfContained && Boolean(summary || input.originalTitle),
    }
  }

  return {
    caption: sanitizeWireProse(`${headline}\n\n${synopsis}`),
    includeLink: !selfContained,
  }
}

function parseComposeJson(raw: string): { includeLink: boolean; synopsis: string } | null {
  try {
    const parsed = JSON.parse(raw) as { include_link?: unknown; synopsis?: unknown }
    const includeLink = parsed.include_link === true
    const synopsis = String(parsed.synopsis || '')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, SYNOPSIS_MAX)
    return { includeLink, synopsis: sanitizeWireProse(synopsis) }
  } catch {
    return null
  }
}

/** @deprecated use composeWirePost */
export async function generateWireSynopsis(opts: WirePostComposeInput): Promise<string> {
  const result = await composeWirePost(opts)
  const parts = result.caption.split('\n\n')
  return parts.length > 1 ? parts.slice(1).join('\n\n') : ''
}

export async function composeWirePost(opts: WirePostComposeInput): Promise<WirePostComposeResult> {
  const headline = String(opts.headline || '').trim()
  const summary = String(opts.summary || '').trim()
  const source = String(opts.sourceLabel || 'Report').trim()
  const profile = opts.newsProfile === 'crypto' ? 'crypto' : 'market'
  const voiceExtras = profile === 'crypto' ? CRYPTO_VOICE_RULES : ''

  if (!headline) return { caption: '', includeLink: false }

  const key = Deno.env.get('OPENAI_API_KEY')?.trim()
  if (key) {
    try {
      const ctrl = new AbortController()
      const timer = setTimeout(() => ctrl.abort(), OPENAI_TIMEOUT_MS)
      const res = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        signal: ctrl.signal,
        headers: {
          Authorization: `Bearer ${key}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: Deno.env.get('OPENAI_CHAT_MODEL') || 'gpt-4o-mini',
          temperature: 0.3,
          max_tokens: 220,
          response_format: { type: 'json_object' },
          messages: [
            {
              role: 'system',
              content:
                `Compose a Lounge wire post under a fixed headline. ${PERSONA[profile]} ` +
                `Return JSON only: {"include_link":boolean,"synopsis":string}\n\n` +
                `Voice:\n` +
                `- Default: headline stands alone as one tight wire line.\n` +
                `- Never write SEC filing notices or "Company filed 10-Q/10-K" style posts.\n` +
                (profile === 'market'
                  ? `- Trump/political lines only if market-linked; keep factual, not editorial.\n`
                  : '') +
                voiceExtras +
                `include_link:\n` +
                `- false when the headline alone is fully self-explanatory (clear who did what, with key facts).\n` +
                `- true when readers need the source for context, nuance, names, or follow-up.\n\n` +
                `synopsis:\n` +
                `- "" (empty) when no extra context is needed under the headline.\n` +
                `- ONE short sentence when a little context helps.\n` +
                `- TWO sentences when the story needs more setup (use the minimum that works).\n` +
                `- Must ADD facts not already in the headline (who, how, impact, next step). Never restate or lightly rephrase the headline.\n` +
                `- If the feed excerpt only repeats the headline, skip it and pull a later detail or return "".\n` +
                `- Third person only ... no we/our/us/I. No investment advice.\n` +
                `- NEVER use em dashes or en dashes. Use commas, " · ", or "-" for breaks.\n` +
                `- Max ${SYNOPSIS_MAX} characters in synopsis.`,
            },
            {
              role: 'user',
              content:
                `Source: ${source}\n` +
                `Headline: ${headline}\n` +
                (opts.originalTitle && opts.originalTitle !== headline
                  ? `Original headline: ${opts.originalTitle}\n`
                  : '') +
                `Feed excerpt: ${summary || '(none provided)'}`,
            },
          ],
        }),
      })
      clearTimeout(timer)
      if (res.ok) {
        const json = await res.json()
        const parsed = parseComposeJson(String(json?.choices?.[0]?.message?.content || ''))
        if (parsed) {
          const synopsis = filterSynopsisRedundancy(
            sanitizeWireProse(parsed.synopsis),
            headline,
            opts.originalTitle,
          )
          const caption = synopsis
            ? sanitizeWireProse(`${headline}\n\n${synopsis}`)
            : sanitizeWireProse(headline)
          return { caption, includeLink: parsed.includeLink }
        }
      }
    } catch {
      /* fallback */
    }
  }

  return fallbackCompose({ ...opts, headline: sanitizeWireProse(headline) })
}
