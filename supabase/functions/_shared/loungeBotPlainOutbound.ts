/**
 * Plain-text outbound for surfaces that do not render Lounge markdown.
 *
 * Destinations:
 * - Lounge feed / VIP Lounge posts: keep the markdown dialect.
 * - Chat rooms: never markdown (chat renders body as plain text).
 * - X.com: never markdown (when auto-post lands, call toPlainOutboundText).
 *
 * Strip at the publish choke point. Do not maintain a second slate formatter.
 */

import { sanitizeBotProse } from './wireBotProse.ts'
import { stripXTwitterUrlsFromText } from './loungeBotXTweetUrl.ts'

const COLOR_NAMES = 'green|red|gold|blue|purple'

function colorPairRe(): RegExp {
  return new RegExp(`\\[(${COLOR_NAMES})\\]([\\s\\S]*?)\\[\\/(?:${COLOR_NAMES})\\]`, 'gi')
}

function colorTagRe(): RegExp {
  return new RegExp(`\\[\\/?(?:${COLOR_NAMES})\\]`, 'gi')
}

function stripFencedCode(text: string): string {
  return String(text || '').replace(/```[\w-]*\r?\n?([\s\S]*?)```/g, '$1')
}

function stripInlineMarkdown(text: string): string {
  let s = String(text || '')
  for (let i = 0; i < 8; i++) {
    const next = s.replace(colorPairRe(), '$2')
    if (next === s) break
    s = next
  }
  s = s.replace(colorTagRe(), '')
  s = s.replace(/`([^`]+)`/g, '$1')
  s = s.replace(/\*\*([^*]+)\*\*/g, '$1')
  s = s.replace(/__([^_]+)__/g, '$1')
  s = s.replace(/~~([^~]+)~~/g, '$1')
  s = s.replace(/==([^=]+)==/g, '$1')
  s = s.replace(/\|\|([^|]+)\|\|/g, '$1')
  s = s.replace(/\*([^*\n]+)\*/g, '$1')
  s = s.replace(/(^|[\s(])_([^_\n]+)_(?=[\s).,!?:;-]|$)/g, '$1$2')
  return s
}

function stripLineMarkers(line: string): string {
  const trimmed = String(line || '')
  if (/^\s*([*\-_])(\s*\1){2,}\s*$/.test(trimmed)) return ''
  let t = trimmed.replace(/^\s*#{1,6}\s+/, '')
  t = t.replace(/^>\s?/, '')
  t = t.replace(/^\s*[-*]\s+(?:\[[ xX]\]\s+)?/, '')
  t = t.replace(/^\s*\d+\.\s+/, '')
  return stripInlineMarkdown(t)
}

/** Drop Lounge markdown chrome, keep the words (picks, desks, matchups). */
export function stripLoungeMarkdownToPlain(raw: string): string {
  const source = stripFencedCode(String(raw || ''))
  const lines = source.split(/\r?\n/).map(stripLineMarkers)
  return lines.join('\n').replace(/\n{3,}/g, '\n\n').trim()
}

function middleDotsToHyphen(text: string): string {
  return String(text || '')
    .split('\n')
    .map((line) => {
      const withoutLead = line.replace(/^[ \t]*·[ \t]*/, '')
      return withoutLead.replace(/[ \t]*·[ \t]*/g, ' - ').replace(/·/g, ' - ')
    })
    .join('\n')
}

/**
 * Caption/body for chat or X. Lounge publish must NOT use this.
 * Middle dots become ` - ` so chat/X do not show ` ... ` between matchup bits.
 */
export function toPlainOutboundText(raw: string): string {
  const stripped = stripLoungeMarkdownToPlain(raw)
  const spaced = middleDotsToHyphen(stripped)
  return stripXTwitterUrlsFromText(sanitizeBotProse(spaced)).trim()
}
