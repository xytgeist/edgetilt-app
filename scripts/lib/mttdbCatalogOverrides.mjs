/**
 * Manual corrections after MTTDB scrape → catalog one_off.
 * Use when MTTDB buy-in + fee split (or title) does not match the room.
 *
 * Prefer name rules when the same series gets new mttdb:live ids for later flights.
 */

/** @type {Record<string, { buy_in?: number, display_name?: string }>} */
export const MTTDB_CATALOG_OVERRIDES_BY_EXTERNAL_ID = {
  // 2026 Arizona State Poker Championship (Talking Stick) Day 1A–1D
  'mttdb:live:73604': { buy_in: 1100 },
  'mttdb:live:73605': { buy_in: 1100 },
  'mttdb:live:73606': { buy_in: 1100 },
  'mttdb:live:73607': { buy_in: 1100 },
}

/**
 * @type {Array<{
 *   test: (displayName: string) => boolean,
 *   apply: (row: object) => { buy_in?: number, display_name?: string },
 * }>}
 */
export const MTTDB_CATALOG_OVERRIDES_BY_NAME = [
  {
    // Venue/PokerNews: $1,100. MTTDB lists $1,000 + $110 = $1,110.
    test: (displayName) => /arizona state poker championship/i.test(displayName),
    apply: (row) => ({
      buy_in: 1100,
      display_name: rewriteBuyInInTitle(row.display_name, 1110, 1100),
    }),
  },
]

/**
 * @param {string | null | undefined} title
 * @param {number} fromAmount
 * @param {number} toAmount
 */
export function rewriteBuyInInTitle(title, fromAmount, toAmount) {
  const raw = String(title || '')
  if (!raw) return raw
  const fromPlain = String(Math.round(fromAmount))
  const toPlain = String(Math.round(toAmount))
  const fromComma = fromPlain.replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  const toComma = toPlain.replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  return raw
    .replace(new RegExp(`\\$${fromComma}\\b`, 'g'), `$${toComma}`)
    .replace(new RegExp(`\\$${fromPlain}\\b`, 'g'), `$${toComma}`)
}

/**
 * @param {object | null | undefined} catalogRow
 * @returns {object | null | undefined}
 */
export function applyMttdbCatalogOverrides(catalogRow) {
  if (!catalogRow) return catalogRow
  let next = { ...catalogRow }

  const byId = MTTDB_CATALOG_OVERRIDES_BY_EXTERNAL_ID[String(next.external_id || '')]
  if (byId) next = { ...next, ...byId }

  const displayName = String(next.display_name || '')
  for (const rule of MTTDB_CATALOG_OVERRIDES_BY_NAME) {
    if (!rule.test(displayName)) continue
    next = { ...next, ...rule.apply(next) }
  }

  return next
}
