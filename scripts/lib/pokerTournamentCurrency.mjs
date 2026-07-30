/**
 * Tournament catalog + session currency from venue location (country / region / online site).
 * Currency ids must stay in sync with POKER_CURRENCIES in pokerCurrencies.js
 */

const KNOWN_CURRENCY_IDS = new Set([
  'USD', 'EUR', 'GBP', 'CAD', 'AUD', 'NZD', 'MXN', 'BRL', 'JPY', 'KRW', 'CNY', 'HKD', 'SGD',
  'INR', 'PHP', 'THB', 'VND', 'CZK', 'PLN', 'SEK', 'NOK', 'DKK', 'CHF', 'TRY', 'ZAR', 'RUB',
  'UAH', 'ILS', 'AED', 'SAR',
])

/** ISO 3166-1 alpha-2 → ISO 4217 */
const COUNTRY_CODE_TO_CURRENCY = {
  US: 'USD', PR: 'USD', GU: 'USD', VI: 'USD', AS: 'USD', MP: 'USD',
  CA: 'CAD', MX: 'MXN', GB: 'GBP', UK: 'GBP',
  IE: 'EUR', FR: 'EUR', DE: 'EUR', ES: 'EUR', IT: 'EUR', PT: 'EUR', NL: 'EUR', BE: 'EUR',
  AT: 'EUR', FI: 'EUR', GR: 'EUR', LU: 'EUR', MT: 'EUR', CY: 'EUR', EE: 'EUR', LV: 'EUR',
  LT: 'EUR', SK: 'EUR', SI: 'EUR', HR: 'EUR', MC: 'EUR',
  AU: 'AUD', NZ: 'NZD', BR: 'BRL', JP: 'JPY', KR: 'KRW', CN: 'CNY', HK: 'HKD', SG: 'SGD',
  IN: 'INR', PH: 'PHP', TH: 'THB', VN: 'VND', CZ: 'CZK', PL: 'PLN', SE: 'SEK', NO: 'NOK',
  DK: 'DKK', CH: 'CHF', TR: 'TRY', ZA: 'ZAR', RU: 'RUB', UA: 'UAH', IL: 'ILS', AE: 'AED', SA: 'SAR',
}

/** @type {Record<string, string>} normalized country name → ISO alpha-2 */
const COUNTRY_NAME_TO_CODE = {
  'united states': 'US',
  usa: 'US',
  'u.s.': 'US',
  'u.s.a.': 'US',
  canada: 'CA',
  'united kingdom': 'GB',
  uk: 'GB',
  england: 'GB',
  scotland: 'GB',
  wales: 'GB',
  ireland: 'IE',
  france: 'FR',
  germany: 'DE',
  spain: 'ES',
  italy: 'IT',
  portugal: 'PT',
  netherlands: 'NL',
  belgium: 'BE',
  austria: 'AT',
  finland: 'FI',
  greece: 'GR',
  luxembourg: 'LU',
  malta: 'MT',
  cyprus: 'CY',
  'czech republic': 'CZ',
  czechia: 'CZ',
  poland: 'PL',
  sweden: 'SE',
  norway: 'NO',
  denmark: 'DK',
  switzerland: 'CH',
  monaco: 'MC',
  australia: 'AU',
  'new zealand': 'NZ',
  mexico: 'MX',
  brazil: 'BR',
  japan: 'JP',
  'south korea': 'KR',
  korea: 'KR',
  china: 'CN',
  'hong kong': 'HK',
  singapore: 'SG',
  india: 'IN',
  philippines: 'PH',
  thailand: 'TH',
  vietnam: 'VN',
  turkey: 'TR',
  'south africa': 'ZA',
  russia: 'RU',
  ukraine: 'UA',
  israel: 'IL',
  'united arab emirates': 'AE',
  uae: 'AE',
  'saudi arabia': 'SA',
}

/** Catalog region slug → default currency (US-heavy seeds). */
const CATALOG_REGION_CURRENCY = {
  'las-vegas': 'USD',
  lv: 'USD',
  ca: 'USD',
  az: 'USD',
  fl: 'USD',
  pa: 'USD',
  nj: 'USD',
  ct: 'USD',
  ok: 'USD',
  gulf: 'USD',
  md: 'USD',
  chi: 'USD',
  midwest: 'USD',
  in: 'USD',
  wi: 'USD',
  mttdb: 'USD',
}

/** MTTDB / Site dropdown slug → default session currency when buy-in currency missing. */
const ONLINE_SITE_CURRENCY = {
  pokerstars: 'USD',
  'pokerstars-com': 'USD',
  'pokerstars-eu': 'EUR',
  ggpoker: 'USD',
  'ggpoker-ca': 'CAD',
  partypoker: 'GBP',
  '888poker': 'EUR',
  unibet: 'EUR',
  winamax: 'EUR',
  wsop: 'USD',
  'wsop-com': 'USD',
  acr: 'USD',
  'americas-cardroom': 'USD',
  ignition: 'USD',
  bovada: 'USD',
  betonline: 'USD',
  betmgm: 'USD',
  draftkings: 'USD',
  fanduel: 'USD',
  coinpoker: 'USD',
  clubwpt: 'USD',
  'clubwpt-gold': 'USD',
  'wpt-global': 'USD',
  'global-poker': 'USD',
  tigergaming: 'USD',
  blackchip: 'USD',
  juicystakes: 'USD',
  intertops: 'USD',
  ipoker: 'EUR',
  pmupoker: 'EUR',
  svenskaspel: 'SEK',
  revolution: 'USD',
  swc: 'USD',
  clubgg: 'USD',
  pppoker: 'USD',
  pokerbros: 'USD',
  upoker: 'USD',
  kkpoker: 'USD',
  xpoker: 'USD',
  luxon: 'EUR',
}

function normCountryName(s) {
  return String(s || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
}

/**
 * @param {string | null | undefined} code
 * @returns {string | null}
 */
export function normalizeCurrencyCode(code) {
  const c = String(code || '')
    .trim()
    .toUpperCase()
  if (!c) return null
  return KNOWN_CURRENCY_IDS.has(c) ? c : null
}

/**
 * @param {string | null | undefined} code
 * @returns {string}
 */
export function currencyFromCountryCode(code) {
  const c = String(code || '')
    .trim()
    .toUpperCase()
  if (!c) return 'USD'
  const mapped = COUNTRY_CODE_TO_CURRENCY[c]
  if (mapped && KNOWN_CURRENCY_IDS.has(mapped)) return mapped
  return 'USD'
}

/**
 * @param {string | null | undefined} countryName
 * @returns {string}
 */
export function currencyFromCountryName(countryName) {
  const key = normCountryName(countryName)
  if (!key) return 'USD'
  const code = COUNTRY_NAME_TO_CODE[key]
  return code ? currencyFromCountryCode(code) : 'USD'
}

/**
 * @param {string | null | undefined} siteIdOrSlug
 * @returns {string | null}
 */
export function currencyFromOnlineSiteId(siteIdOrSlug) {
  const slug = String(siteIdOrSlug || '')
    .trim()
    .toLowerCase()
  if (!slug) return null
  const hit = ONLINE_SITE_CURRENCY[slug]
  return hit && KNOWN_CURRENCY_IDS.has(hit) ? hit : null
}

/**
 * @param {string | null | undefined} region
 * @returns {string | null}
 */
export function currencyFromCatalogRegion(region) {
  const key = String(region || '')
    .trim()
    .toLowerCase()
  if (!key) return null
  const hit = CATALOG_REGION_CURRENCY[key]
  return hit && KNOWN_CURRENCY_IDS.has(hit) ? hit : null
}

/**
 * @param {{ country?: string | null, state?: string | null, countryCode?: string | null }} loc
 * @returns {string}
 */
export function currencyFromCasinoLocation(loc = {}) {
  const fromCode = loc.countryCode ? currencyFromCountryCode(loc.countryCode) : null
  if (fromCode && fromCode !== 'USD') return fromCode
  const fromName = currencyFromCountryName(loc.country)
  if (fromName !== 'USD') return fromName
  if (fromCode) return fromCode
  const state = String(loc.state || '').trim()
  if (state) return 'USD'
  const country = normCountryName(loc.country)
  if (country.includes('united states') || country === 'usa') return 'USD'
  return fromName
}

/**
 * @param {{
 *   buyinCurrency?: string | null,
 *   countryName?: string | null,
 *   countryCode?: string | null,
 *   state?: string | null,
 *   onlineSiteSlug?: string | null,
 *   onlineSiteId?: string | null,
 *   region?: string | null,
 * }} opts
 * @returns {string}
 */
export function resolveCatalogCurrency(opts = {}) {
  const buyin = normalizeCurrencyCode(opts.buyinCurrency)
  if (buyin) return buyin

  const fromSite =
    currencyFromOnlineSiteId(opts.onlineSiteSlug) ||
    currencyFromOnlineSiteId(opts.onlineSiteId)
  if (fromSite) return fromSite

  const fromLocation = currencyFromCasinoLocation({
    country: opts.countryName,
    state: opts.state,
    countryCode: opts.countryCode,
  })
  if (fromLocation !== 'USD' || normCountryName(opts.countryName).includes('united states')) {
    if (fromLocation) return fromLocation
  }

  const fromRegion = currencyFromCatalogRegion(opts.region)
  if (fromRegion) return fromRegion

  return fromLocation || 'USD'
}

/**
 * @param {string | null | undefined} venueName
 * @param {Array<{ name?: string, country?: string, state?: string }>} casinos
 * @returns {string | null}
 */
export function currencyFromNearbyCasinoName(venueName, casinos = []) {
  const key = String(venueName || '')
    .trim()
    .toLowerCase()
  if (!key) return null

  for (const c of casinos || []) {
    const name = String(c?.name || '').trim()
    if (!name) continue
    const nk = name.toLowerCase()
    if (nk === key || nk.includes(key) || key.includes(nk)) {
      return currencyFromCasinoLocation({ country: c.country, state: c.state })
    }
  }
  return null
}
