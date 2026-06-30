/** Shown at top of suggestions (casino / community hubs + major metros). */
export const PROFILE_LOCATION_QUICK_PICKS = [
  'Las Vegas, NV',
  'Henderson, NV',
  'Atlantic City, NJ',
  'Biloxi, MS',
  'Reno, NV',
  'London, United Kingdom',
  'Manila, Philippines',
  'Singapore, Singapore',
  'Macau, China',
  'Sydney, Australia',
  'Toronto, Canada',
  'Dubai, United Arab Emirates',
]

export const PROFILE_LOCATION_MAX_LEN = 80

/**
 * @typedef {{ labels: string[], keys: string[] }} GlobalCityLocationIndex
 */

/** @type {GlobalCityLocationIndex | null} */
let globalCityIndexCache = null
/** @type {Promise<GlobalCityLocationIndex> | null} */
let globalCityIndexLoadPromise = null

/**
 * @param {{ name: string, countryCode: string, stateCode?: string }} city
 * @param {Map<string, string>} countryNameByCode
 */
function formatGlobalCityLabel(city, countryNameByCode) {
  const name = String(city.name || '').trim()
  if (!name) return ''
  const cc = String(city.countryCode || '').trim()
  const country = countryNameByCode.get(cc) || cc
  const state = String(city.stateCode || '').trim()
  let label
  if (cc === 'US' && state) {
    label = `${name}, ${state}`
  } else if (state && name.toLowerCase() !== country.toLowerCase()) {
    // Region/state disambiguates duplicate place names (e.g. many "Norashen, Armenia").
    label = `${name}, ${state}, ${country}`
  } else {
    label = `${name}, ${country}`
  }
  return label.length > PROFILE_LOCATION_MAX_LEN ? label.slice(0, PROFILE_LOCATION_MAX_LEN) : label
}

/** ~148k cities worldwide - lazy-loaded (separate chunk, built once per session). */
export function ensureGlobalCityLocationIndex() {
  if (globalCityIndexCache) return Promise.resolve(globalCityIndexCache)
  if (!globalCityIndexLoadPromise) {
    globalCityIndexLoadPromise = import('country-state-city')
      .then(({ City, Country }) => {
        const countryNameByCode = new Map(
          (Country.getAllCountries() || []).map((c) => [c.isoCode, c.name]),
        )
        const cities = City.getAllCities() || []
        const labels = []
        const keys = []
        const seenLabelKeys = new Set()
        for (let i = 0; i < cities.length; i += 1) {
          const label = formatGlobalCityLabel(cities[i], countryNameByCode)
          if (!label) continue
          const key = label.toLowerCase()
          if (seenLabelKeys.has(key)) continue
          seenLabelKeys.add(key)
          labels.push(label)
          keys.push(key)
        }
        globalCityIndexCache = { labels, keys }
        return globalCityIndexCache
      })
      .catch((e) => {
        globalCityIndexLoadPromise = null
        throw e
      })
  }
  return globalCityIndexLoadPromise
}

/** @deprecated Use {@link ensureGlobalCityLocationIndex}. */
export function ensureUsCityLocationLabels() {
  return ensureGlobalCityLocationIndex().then((idx) => idx.labels)
}

/**
 * @param {string} query
 * @param {GlobalCityLocationIndex | null} index
 * @param {{ limit?: number }} [opts]
 */
export function filterLocationSuggestions(query, index, { limit = 48 } = {}) {
  const typed = normalizeProfileLocation(query)
  const q = typed.toLowerCase()
  const quick = PROFILE_LOCATION_QUICK_PICKS.filter((p) => !q || p.toLowerCase().includes(q))

  if (q.length < 2 || !index) {
    return { quick, matches: [], useTyped: typed.length >= 2 ? typed : null }
  }

  const quickSet = new Set(quick)
  const matches = []
  const matchKeys = new Set()
  const { labels, keys } = index
  for (let i = 0; i < labels.length && matches.length < limit; i += 1) {
    const label = labels[i]
    if (quickSet.has(label)) continue
    if (!keys[i].includes(q)) continue
    const mk = keys[i]
    if (matchKeys.has(mk)) continue
    matchKeys.add(mk)
    matches.push(label)
  }

  const exact = keys.some((key) => key === q)
  const useTyped = typed && !exact && !quickSet.has(typed) ? typed : null
  return { quick, matches, useTyped }
}

/** @param {string | null | undefined} raw */
export function normalizeProfileLocation(raw) {
  return String(raw || '')
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .trim()
    .slice(0, PROFILE_LOCATION_MAX_LEN)
}
