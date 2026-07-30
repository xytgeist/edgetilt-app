/**
 * Map MTTDB online site_slug / site_name → POKER_ONLINE_SITES venue_name labels.
 * Keep labels in sync with src/features/poker-bankroll/pokerSessionLabels.js
 */

/** @type {Record<string, string>} slug → canonical venue_name label */
export const MTTDB_SITE_SLUG_TO_LABEL = {
  pokerstars: 'PokerStars',
  'pokerstars-eu': 'PokerStars',
  'pokerstars-com': 'PokerStars',
  ggpoker: 'GGPoker',
  'ggpoker-ca': 'GGPoker',
  partypoker: 'partypoker',
  '888poker': '888poker',
  unibet: 'Unibet',
  winamax: 'Winamax',
  wsop: 'WSOP.com',
  'wsop-com': 'WSOP.com',
  acr: 'ACR',
  'americas-cardroom': 'ACR',
  ignition: 'Ignition',
  bovada: 'Bovada',
  betonline: 'BetOnline',
  betmgm: 'BetMGM Poker',
  draftkings: 'DraftKings Poker',
  fanduel: 'FanDuel Poker',
  coinpoker: 'CoinPoker',
  clubwpt: 'ClubWPT',
  'clubwpt-gold': 'ClubWPT Gold',
  'wpt-global': 'WPT Global',
  'global-poker': 'Global Poker',
  tigergaming: 'TigerGaming',
  blackchip: 'BlackChip Poker',
  juicystakes: 'Juicy Stakes',
  intertops: 'Intertops',
  ipoker: 'iPoker',
  pmupoker: 'PMU Poker',
  svenskaspel: 'Svenska Spel',
  revolution: 'Revolution',
  swc: 'SwC Poker',
  clubgg: 'ClubGG',
  pppoker: 'PPPoker',
  pokerbros: 'PokerBROS',
  upoker: 'Upoker',
  kkpoker: 'KKPoker',
  xpoker: 'X-Poker',
  luxon: 'Luxon Poker',
}

/** @type {Record<string, string>} normalized site_name → canonical label */
export const MTTDB_SITE_NAME_TO_LABEL = {
  pokerstars: 'PokerStars',
  'pokerstars eu': 'PokerStars',
  'pokerstars.com': 'PokerStars',
  ggpoker: 'GGPoker',
  'ggpoker.ca': 'GGPoker',
  partypoker: 'partypoker',
  '888poker': '888poker',
  unibet: 'Unibet',
  winamax: 'Winamax',
  'wsop.com': 'WSOP.com',
  wsop: 'WSOP.com',
  acr: 'ACR',
  'americas cardroom': 'ACR',
  ignition: 'Ignition',
  bovada: 'Bovada',
  betonline: 'BetOnline',
  'betmgm poker': 'BetMGM Poker',
  'draftkings poker': 'DraftKings Poker',
  'fanduel poker': 'FanDuel Poker',
  coinpoker: 'CoinPoker',
  clubwpt: 'ClubWPT',
  'clubwpt gold': 'ClubWPT Gold',
  'wpt global': 'WPT Global',
  'global poker': 'Global Poker',
  tigergaming: 'TigerGaming',
  'blackchip poker': 'BlackChip Poker',
  'juicy stakes': 'Juicy Stakes',
  intertops: 'Intertops',
  ipoker: 'iPoker',
  'pmu poker': 'PMU Poker',
  'svenska spel': 'Svenska Spel',
  revolution: 'Revolution',
  'swc poker': 'SwC Poker',
  clubgg: 'ClubGG',
  pppoker: 'PPPoker',
  pokerbros: 'PokerBROS',
  upoker: 'Upoker',
  kkpoker: 'KKPoker',
  'x-poker': 'X-Poker',
  'luxon poker': 'Luxon Poker',
}

function normKey(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/['']/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * @param {string} siteName
 * @param {string} [siteSlug]
 * @returns {string | null}
 */
export function resolveMttdbOnlineSiteLabel(siteName, siteSlug = '') {
  const slug = normKey(siteSlug).replace(/\s+/g, '-')
  if (slug && MTTDB_SITE_SLUG_TO_LABEL[slug]) return MTTDB_SITE_SLUG_TO_LABEL[slug]

  const nameKey = normKey(siteName)
  if (nameKey && MTTDB_SITE_NAME_TO_LABEL[nameKey]) return MTTDB_SITE_NAME_TO_LABEL[nameKey]

  return null
}

/**
 * @returns {{ resolve: (siteName: string, siteSlug?: string) => string | null, unmappedSites: () => object[] }}
 */
export function createMttdbSiteResolver() {
  /** @type {Map<string, { site_name: string, site_slug: string }>} */
  const unmapped = new Map()

  /**
   * @param {string} siteName
   * @param {string} [siteSlug]
   */
  function resolve(siteName, siteSlug = '') {
    const label = resolveMttdbOnlineSiteLabel(siteName, siteSlug)
    if (label) return label

    const missKey = `${normKey(siteSlug)}|${normKey(siteName)}`
    unmapped.set(missKey, {
      site_name: String(siteName || '').trim(),
      site_slug: String(siteSlug || '').trim(),
    })
    return null
  }

  return {
    resolve,
    unmappedSites: () => [...unmapped.values()],
  }
}
