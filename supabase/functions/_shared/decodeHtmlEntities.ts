/** Decode HTML/XML entities so wire headlines render as plain text in Lounge captions. */

const NAMED_ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  rsquo: '\u2019',
  lsquo: '\u2018',
  rdquo: '\u201D',
  ldquo: '\u201C',
  hellip: '\u2026',
  ndash: '\u2013',
  mdash: '\u2014',
}

function decodeHtmlEntitiesOnce(raw: string): string {
  return String(raw || '')
    .replace(/&([a-z]+);/gi, (match, name: string) => NAMED_ENTITIES[name.toLowerCase()] ?? match)
    .replace(/&#0*(\d+);/g, (match, n: string) => {
      const code = Number(n)
      return Number.isFinite(code) && code > 0 && code <= 0x10ffff
        ? String.fromCodePoint(code)
        : match
    })
    .replace(/&#x([0-9a-f]+);/gi, (match, hex: string) => {
      const code = parseInt(hex, 16)
      return Number.isFinite(code) && code > 0 && code <= 0x10ffff
        ? String.fromCodePoint(code)
        : match
    })
}

/** Decode entities; repeat for double-encoded feeds (e.g. `&amp;#8217;`). */
export function decodeHtmlEntities(raw: string): string {
  let s = String(raw || '')
  for (let i = 0; i < 3; i++) {
    const next = decodeHtmlEntitiesOnce(s)
    if (next === s) break
    s = next
  }
  return s
}
