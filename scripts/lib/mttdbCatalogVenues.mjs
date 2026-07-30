/**
 * Resolve MTTDB venue_title → catalog casino name + optional geocode upsert.
 */

import { normalizeCatalogVenueName } from './pokerTournamentCatalog.mjs'

const NOMINATIM_URL = 'https://nominatim.openstreetmap.org/search'
const GEOCODE_UA = 'LVSlotPro/1.0 (poker catalog sync; contact@edgetilt.com)'

/** @type {Record<string, string>} */
export const MTTDB_VENUE_ALIASES = {
  'commerce casino & hotel': 'Commerce Casino',
  'the orleans hotel & casino': 'The Orleans',
  'horseshoe casino indianapolis': 'Horseshoe Indianapolis',
  'seminole hard rock hotel & casino - hollywood': 'Seminole Hard Rock Hollywood',
  'seminole hard rock hotel & casino hollywood': 'Seminole Hard Rock Hollywood',
  'the venetian resort': 'The Venetian',
  'south point casino hotel & spa': 'South Point Casino Hotel & Spa',
  'potawatomi casino': 'Potawatomi Casino Hotel',
  'running aces casino & racetrack': 'Running Aces Casino',
  'jackpot junction casino & hotel': 'Jackpot Junction Casino & Hotel',
  'south point': 'South Point Casino Hotel & Spa',
  'red rock casino resort & spa': 'Red Rock Casino Resort & Spa',
  'beau rivage hotel & casino': 'Beau Rivage Resort & Casino',
  'westgate las vegas resort & casino': 'Westgate Las Vegas Resort & Casino',
  'peppermill reno': 'Peppermill Resort Spa Casino',
  'river spirit casino': 'River Spirit Casino',
  'the gardens casino': 'Hollywood Park Casino',
  'stones gambling hall': 'Stones Gambling Hall',
  'lucky chances casino': 'Lucky Chances Casino',
  'bay 101 casino': 'Bay 101 Casino',
  'graton resort & casino': 'Graton Resort Casino',
  'chinook winds casino resort': 'Chinook Winds Casino Resort',
  'horseshoe council bluffs': 'Horseshoe Council Bluffs',
  'hard rock casino cincinnati': 'Hard Rock Casino Cincinnati',
  'hard rock casino': 'Hard Rock Casino Cincinnati',
  'atlantis casino resort': 'Atlantis Casino Resort',
  'grand sierra resort and casino': 'Grand Sierra Resort and Casino',
  'grand sierra resort & casino': 'Grand Sierra Resort and Casino',
  'ballys twin river lincoln casino': "Bally's Twin River Lincoln Casino",
  "bally's twin river lincoln casino": "Bally's Twin River Lincoln Casino",
  'twin river casino': "Bally's Twin River Lincoln Casino",
  'king\'s resort': "King's Resort",
  'kings resort': "King's Resort",
  'bestbet st. augustine': 'Bestbet St. Augustine',
  'bestbet st augustine': 'Bestbet St. Augustine',
  'the og clubhouse': 'The OG Clubhouse',
  'royal casino joa cannes': 'Royal Casino JOA Cannes',
  'lodge card club': 'Lodge Card Club',
  'the lodge card club': 'Lodge Card Club',
  'lilac club casino': 'Lilac Club Casino',
  'tgt poker & racebook': 'TGT Poker & Racebook',
  'portomaso casino': 'Portomaso Casino',
  'grand casino hotel & resort': 'Grand Casino Hotel & Resort',
  'bestbet orange park': 'Bestbet Orange Park',
  'orange city racing & card club': 'Orange City Racing & Card Club',
  'dragonara casino': 'Dragonara Casino',
  'bestbet jacksonville': 'Bestbet Jacksonville',
  'pearl river resort': 'Pearl River Resort',
  'pure casino yellowhead': 'Pure Casino Yellowhead',
  'terre haute casino': 'Terre Haute Casino',
  'casino schenefeld': 'Casino Schenefeld',
}

function normKey(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/['']/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {{ dryRun?: boolean, geocode?: boolean }} [opts]
 */
export async function createMttdbVenueResolver(supabase, opts = {}) {
  const dryRun = Boolean(opts.dryRun)
  const geocode = opts.geocode !== false

  const { data, error } = await supabase
    .from('casinos')
    .select('name, city, state, country, lat, lng, aliases')
    .not('lat', 'is', null)
    .not('lng', 'is', null)

  if (error) throw new Error(`casinos load failed: ${error.message}`)

  /** @type {Map<string, { name: string, lat: number, lng: number }>} */
  const byKey = new Map()
  for (const row of data || []) {
    const name = String(row.name || '').trim()
    if (!name) continue
    const lat = Number(row.lat)
    const lng = Number(row.lng)
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue
    const entry = { name, lat, lng }
    byKey.set(normKey(name), entry)
    for (const alias of row.aliases || []) {
      const ak = normKey(alias)
      if (ak) byKey.set(ak, entry)
    }
  }

  /** @type {Map<string, true>} */
  const geocodeAttempted = new Map()
  /** @type {Map<string, { venue_title: string, venue_city: string, country_name: string }>} */
  const unmapped = new Map()

  /**
   * @param {string} venueTitle
   * @param {string} [venueCity]
   * @param {string} [countryName]
   */
  async function resolve(venueTitle, venueCity = '', countryName = '') {
    const raw = String(venueTitle || '').trim()
    if (!raw) return null

    const aliased = MTTDB_VENUE_ALIASES[normKey(raw)] || normalizeCatalogVenueName(raw)
    const keysToTry = [normKey(aliased), normKey(raw)]
    for (const key of keysToTry) {
      if (byKey.has(key)) return byKey.get(key).name
    }

    for (const [key, entry] of byKey) {
      if (key.length < 6) continue
      if (keysToTry.some((k) => k.includes(key) || key.includes(k))) return entry.name
    }

    const missKey = `${normKey(raw)}|${normKey(venueCity)}|${normKey(countryName)}`
    unmapped.set(missKey, {
      venue_title: raw,
      venue_city: String(venueCity || '').trim(),
      country_name: String(countryName || '').trim(),
    })

    if (!geocode || dryRun || geocodeAttempted.has(missKey)) return null
    geocodeAttempted.set(missKey, true)

    const coords = await geocodeVenue(raw, venueCity, countryName)
    if (!coords) return null

    const insertName = aliased || raw
    if (!dryRun) {
      const { error: insertErr } = await supabase.from('casinos').insert({
        name: insertName,
        source: 'seed',
        city: venueCity || null,
        state: null,
        country: countryName || null,
        lat: coords.lat,
        lng: coords.lng,
      })
      if (insertErr && /duplicate|unique/i.test(insertErr.message)) {
        const linked = await linkVenueAlias(supabase, {
          byKey,
          insertName,
          rawTitle: raw,
          coords,
          venueCity,
          countryName,
        })
        if (linked) {
          unmapped.delete(missKey)
          console.log(`[mttdb:venues] linked alias: ${raw} → ${linked}`)
          return linked
        }
        console.warn('[mttdb:venues] duplicate casino, could not link alias:', insertName, insertErr.message)
        return null
      }
      if (insertErr) {
        console.warn('[mttdb:venues] insert failed:', insertName, insertErr.message)
        return null
      }
    }

    byKey.set(normKey(insertName), { name: insertName, lat: coords.lat, lng: coords.lng })
    unmapped.delete(missKey)
    console.log(`[mttdb:venues] ${dryRun ? 'would add' : 'added'} casino: ${insertName} (${coords.lat}, ${coords.lng})`)
    return insertName
  }

  return {
    resolve,
    unmappedVenues: () => [...unmapped.values()],
  }
}

async function geocodeVenue(venueTitle, venueCity, countryName) {
  const queries = [
    [venueTitle, venueCity, countryName],
    [venueTitle, venueCity],
    [venueTitle, countryName],
    [venueTitle],
  ]
  for (const parts of queries) {
    const q = parts.filter(Boolean).join(', ')
    if (!q) continue
    const coords = await geocodeQuery(q)
    if (coords) return coords
  }
  return null
}

async function geocodeQuery(q) {
  await sleep(1100)
  const url = `${NOMINATIM_URL}?${new URLSearchParams({
    q,
    format: 'json',
    limit: '1',
  })}`
  try {
    const res = await fetch(url, { headers: { 'User-Agent': GEOCODE_UA } })
    if (!res.ok) return null
    const data = await res.json()
    const hit = data?.[0]
    const lat = Number(hit?.lat)
    const lng = Number(hit?.lon)
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null
    return { lat, lng }
  } catch {
    return null
  }
}

/**
 * When geocode insert hits duplicate name, attach MTTDB title as alias on existing row.
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {{
 *   byKey: Map<string, { name: string, lat: number, lng: number }>,
 *   insertName: string,
 *   rawTitle: string,
 *   coords: { lat: number, lng: number },
 *   venueCity: string,
 *   countryName: string,
 * }} opts
 */
async function linkVenueAlias(supabase, opts) {
  const { byKey, insertName, rawTitle, coords, venueCity, countryName } = opts
  const keys = [normKey(insertName), normKey(rawTitle)]
  for (const key of keys) {
    if (byKey.has(key)) return byKey.get(key).name
  }

  const { data: byName } = await supabase
    .from('casinos')
    .select('name, lat, lng, aliases, city, country')
    .ilike('name', insertName)
    .limit(1)

  let best = byName?.[0] || null
  if (!best) {
    const { data: byRaw } = await supabase
      .from('casinos')
      .select('name, lat, lng, aliases, city, country')
      .ilike('name', rawTitle)
      .limit(1)
    best = byRaw?.[0] || null
  }
  if (!best && venueCity) {
    const { data: cityRows } = await supabase
      .from('casinos')
      .select('name, lat, lng, aliases, city, country')
      .ilike('city', `%${venueCity}%`)
      .limit(10)
    best =
      (cityRows || []).find((row) => normKey(row.country || '') === normKey(countryName)) ||
      cityRows?.[0] ||
      null
  }

  if (!best?.name) return null

  const aliasSet = new Set([...(best.aliases || []), rawTitle, insertName].filter(Boolean))
  const aliases = [...aliasSet]
  await supabase
    .from('casinos')
    .update({ aliases })
    .eq('name', best.name)

  const lat = Number(best.lat) || coords.lat
  const lng = Number(best.lng) || coords.lng
  const entry = { name: best.name, lat, lng }
  byKey.set(normKey(best.name), entry)
  for (const alias of aliases) {
    const ak = normKey(alias)
    if (ak) byKey.set(ak, entry)
  }
  return best.name
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms))
}
