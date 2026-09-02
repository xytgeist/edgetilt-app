/**
 * Bot caption prose — Ryan rule: no em/en dashes or middle dots (·) in published copy.
 * Prose breaks → ellipses (...); numeric ranges → hyphen without spaces.
 */

const PROSE_BREAK = ' ... '

/** Private-use placeholders — mask dots that are not sentence terminators. */
const WIRE_DECIMAL_DOT = '\uE000'
const WIRE_DOMAIN_DOT = '\uE001'
const WIRE_ABBREV_DOT = '\uE002'

/** Common public suffixes for brand / publisher domains in wire copy. */
const WIRE_BARE_DOMAIN_TLD =
  'com|org|net|io|co|uk|edu|gov|info|xyz|app|ai|gg|fm|tv|me|so|dev|news|media|finance'

const WIRE_BARE_DOMAIN_RE = new RegExp(
  `\\b[a-z0-9][a-z0-9-]*(?:\\.[a-z0-9-]+)*\\.(?:${WIRE_BARE_DOMAIN_TLD})\\b`,
  'gi',
)

/** Inc. / Ltd. / Mr. … — trailing period is not end-of-sentence in wire copy. */
const WIRE_WORD_ABBREV_RE =
  /\b(Inc|Ltd|Corp|Co|Jr|Sr|Mr|Mrs|Ms|Dr|Prof|vs|etc|approx|Dept|Gov|Gen|Rep|Sen|No|St|Ave|Blvd)\./gi

function maskDecimalPoints(text: string): string {
  return String(text || '').replace(/(\d)\.(\d)/g, `$1${WIRE_DECIMAL_DOT}$2`)
}

/** Keep Crypto.com / cointelegraph.com intact when splitting on `.` */
function maskBareDomainDots(text: string): string {
  return String(text || '').replace(WIRE_BARE_DOMAIN_RE, (match) => match.replace(/\./g, WIRE_DOMAIN_DOT))
}

/**
 * Keep U.S. / U.K. / E.U. / D.C. / A.I. (and Inc./Ltd./…) intact.
 * Without this, "U.S. Treasury…" splits to orphan "S. Treasury…".
 */
function maskAbbreviationDots(text: string): string {
  let s = String(text || '')
  // Multi single-letter: U.S. U.S.A. E.U. D.C. N.Y. A.I.
  // Each letter must keep its own trailing dot (do not eat the next word's capital).
  s = s.replace(/\b(?:[A-Za-z]\.){2,}(?:[A-Za-z]\.)?/g, (match) => match.replace(/\./g, WIRE_ABBREV_DOT))
  s = s.replace(WIRE_WORD_ABBREV_RE, (match) => match.replace(/\./g, WIRE_ABBREV_DOT))
  return s
}

function unmaskSentenceSplitDots(text: string): string {
  return String(text || '')
    .replaceAll(WIRE_DECIMAL_DOT, '.')
    .replaceAll(WIRE_DOMAIN_DOT, '.')
    .replaceAll(WIRE_ABBREV_DOT, '.')
}

/** Split wire prose into sentences without breaking decimals, domains, or abbreviations. */
export function splitWireSentences(text: string): string[] {
  const raw = String(text || '').trim()
  if (!raw) return []

  const masked = maskAbbreviationDots(maskBareDomainDots(maskDecimalPoints(raw)))
  const parts = masked.match(/[^.!?]+[.!?]+(?:\s|$)/g)
  if (!parts?.length) return [unmaskSentenceSplitDots(raw)]

  return parts.map((part) => unmaskSentenceSplitDots(part).trim()).filter(Boolean)
}

function isMarkdownDialectCaption(text: string): boolean {
  const t = String(text || '').trim()
  return /^#\s/m.test(t) && (/\[gold\]/.test(t) || /# 🔥/.test(t) || /# 🎯/.test(t))
}

function sanitizeWireProseLine(text: string, opts?: { preserveMiddleDots?: boolean }): string {
  let s = String(text || '')

  // Numeric ranges: 2024–2026, $955–968 → hyphen without spaces
  s = s.replace(/(\d)\s*[\u2013\u2014]\s*(\d)/g, '$1-$2')

  // Prose breaks → ellipses (Scott + wire bots; never em/en dash or middle dot)
  s = s.replace(/\s*[\u2014\u2013]\s*/g, PROSE_BREAK)
  s = s.replace(/\s--\s/g, PROSE_BREAK)
  if (!opts?.preserveMiddleDots) {
    s = s.replace(/\s·\s/g, PROSE_BREAK)
    s = s.replace(/·/g, PROSE_BREAK)
  }

  return s
    .replace(/(?: \.\.\. ){2,}/g, PROSE_BREAK)
    .replace(/\.{4,}/g, '...')
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
  const preserveMiddleDots = isMarkdownDialectCaption(raw)

  if (!raw.includes('\n')) return sanitizeWireProseLine(raw, { preserveMiddleDots })

  if (preserveMiddleDots) {
    return raw
      .split('\n')
      .map((line) => (line.trim() ? sanitizeWireProseLine(line, { preserveMiddleDots: true }) : line))
      .join('\n')
      .trim()
  }

  return raw
    .split(/\n\n+/)
    .map((para) => sanitizeWireProseLine(para))
    .filter(Boolean)
    .join('\n\n')
}

/** Alias — all Lounge bots share the same dash scrub at publish time. */
export const sanitizeBotProse = sanitizeWireProse
