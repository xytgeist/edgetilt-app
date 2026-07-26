/**
 * Bot caption prose — Ryan rule: never em/en dashes in published copy.
 * Prose breaks → middle dot (·); numeric ranges → hyphen without spaces.
 */

/** Private-use placeholder — mask decimal points before sentence splitting on `.` */
const WIRE_DECIMAL_DOT = '\uE000'

function maskDecimalPoints(text: string): string {
  return String(text || '').replace(/(\d)\.(\d)/g, `$1${WIRE_DECIMAL_DOT}$2`)
}

function unmaskDecimalPoints(text: string): string {
  return String(text || '').replaceAll(WIRE_DECIMAL_DOT, '.')
}

/** Split wire prose into sentences without breaking decimals (49.8, 52.2 vs 50.5). */
export function splitWireSentences(text: string): string[] {
  const raw = String(text || '').trim()
  if (!raw) return []

  const masked = maskDecimalPoints(raw)
  const parts = masked.match(/[^.!?]+[.!?]+(?:\s|$)/g)
  if (!parts?.length) return [unmaskDecimalPoints(raw)]

  return parts.map((part) => unmaskDecimalPoints(part).trim()).filter(Boolean)
}

function sanitizeWireProseLine(text: string): string {
  let s = String(text || '')

  // Numeric ranges: 2024–2026, $955–968 → hyphen without spaces
  s = s.replace(/(\d)\s*[\u2013\u2014]\s*(\d)/g, '$1-$2')

  // Prose breaks → · (Scott + wire bots; never em/en dash)
  s = s.replace(/\s*[\u2014\u2013]\s*/g, ' · ')
  s = s.replace(/\s--\s/g, ' · ')

  return s
    .replace(/(?: · ){2,}/g, ' · ')
    .replace(/[ \t]+/g, ' ')
    .trim()
}

/** Strip URLs / bare domains from RSS excerpts before synopsis compose (headlines keep Crypto.com, etc.). */
export function cleanWireFeedExcerpt(text: string): string {
  let s = String(text || '')
  s = s.replace(/https?:\/\/[^\s<>"']+/gi, ' ')
  s = s.replace(/\bwww\.[^\s<>"']+/gi, ' ')
  s = s.replace(
    /\b[a-z0-9][a-z0-9-]*(?:\.[a-z0-9-]+)+\.(?:com|org|net|io|co|uk|edu|gov|info|xyz|app)\b/gi,
    ' ',
  )
  return s.replace(/\s+/g, ' ').trim()
}

/** Sanitize one line or multi-paragraph caption (preserves blank lines between headline + synopsis). */
export function sanitizeWireProse(text: string): string {
  const raw = String(text || '')
  if (!raw.includes('\n')) return sanitizeWireProseLine(raw)

  return raw
    .split(/\n\n+/)
    .map((para) => sanitizeWireProseLine(para))
    .filter(Boolean)
    .join('\n\n')
}

/** Alias — all Lounge bots share the same dash scrub at publish time. */
export const sanitizeBotProse = sanitizeWireProse
