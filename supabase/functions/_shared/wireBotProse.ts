/**
 * Bot caption prose — Ryan rule: never em/en dashes in published copy.
 * Prose breaks → middle dot (·); numeric ranges → hyphen without spaces.
 */

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
