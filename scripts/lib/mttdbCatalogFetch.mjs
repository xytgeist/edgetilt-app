/**
 * MTTDB live + online lobby scrape → catalog one_off rows.
 * Live: https://mttdb.com/live-poker/tournaments/
 * Online: https://mttdb.com/online-poker/
 */

import { isoDateLocal } from './pokerTournamentCatalog.mjs'
import { inferTournamentGameVariantFromText } from './pokerTournamentGameVariant.mjs'
import { resolveCatalogCurrency } from './pokerTournamentCurrency.mjs'

export const MTTDB_LIVE_LOBBY_URL = 'https://mttdb.com/live-poker/tournaments/'
export const MTTDB_ONLINE_LOBBY_URL = 'https://mttdb.com/online-poker/'
export const MTTDB_FETCH_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'

/** Ingest window aligned with MTTDB lobby (next 7 days). */
export const MTTDB_LIVE_HORIZON_DAYS = 7
export const MTTDB_ONLINE_HORIZON_DAYS = 7

/** MTTDB online start_date values are UTC (no tz field on row). */
export const MTTDB_ONLINE_TIMEZONE = 'UTC'

/**
 * Extract tournament JSON objects embedded in lobby HTML.
 * @param {string} html
 * @param {{ kind?: 'live' | 'online' | 'any' }} [opts]
 */
export function parseMttdbEmbeddedTournaments(html, opts = {}) {
  const kind = opts.kind || 'any'
  /** @type {object[]} */
  const rows = []
  /** @type {Set<number>} */
  const seenIds = new Set()
  const needle = '{"id":'
  let pos = 0

  while (pos < html.length) {
    const start = html.indexOf(needle, pos)
    if (start < 0) break

    let depth = 0
    let inString = false
    let escape = false
    let parsed = null

    for (let i = start; i < html.length; i++) {
      const c = html[i]
      if (inString) {
        if (escape) escape = false
        else if (c === '\\') escape = true
        else if (c === '"') inString = false
        continue
      }
      if (c === '"') {
        inString = true
        continue
      }
      if (c === '{') depth++
      else if (c === '}') {
        depth--
        if (depth === 0) {
          try {
            parsed = JSON.parse(html.slice(start, i + 1))
          } catch {
            parsed = null
          }
          pos = i + 1
          break
        }
      }
    }

    if (!parsed?.id || !parsed.start_date || !parsed.name) {
      pos = start + needle.length
      continue
    }
    if (kind === 'live' && !parsed.venue_title) {
      pos = start + needle.length
      continue
    }
    if (kind === 'online' && !parsed.site_name) {
      pos = start + needle.length
      continue
    }
    if (kind === 'any' && !parsed.venue_title && !parsed.site_name) {
      pos = start + needle.length
      continue
    }
    if (seenIds.has(parsed.id)) continue
    seenIds.add(parsed.id)
    rows.push(parsed)
  }

  return rows
}

function inferGameVariant(gameType, variant, name) {
  return inferTournamentGameVariantFromText(gameType, variant, name)
}

function totalBuyIn(row) {
  const prize = Number(row.buyin_amount)
  const fee = Number(row.entry_fee)
  const bounty = Number(row.bounty_fee)
  let total = 0
  if (Number.isFinite(prize)) total += prize
  if (Number.isFinite(fee)) total += fee
  if (Number.isFinite(bounty)) total += bounty
  return total > 0 ? total : null
}

/**
 * @param {object} row MTTDB tournament object
 * @param {string} venueName resolved catalog casino name
 */
export function mttdbRowToCatalogOneOff(row, venueName) {
  const buyIn = totalBuyIn(row)
  if (buyIn == null) return null

  const startsAt = String(row.start_date || '').trim()
  const eventDate = startsAt.slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(eventDate)) return null

  const timezone = String(row.venue_tz_name || 'America/Los_Angeles').trim()
  const name = String(row.name || '').trim()

  return {
    external_id: `mttdb:live:${row.id}`,
    venue_name: venueName,
    event_date: eventDate,
    starts_at: startsAt,
    buy_in: buyIn,
    currency: resolveCatalogCurrency({
      buyinCurrency: row.buyin_currency,
      countryName: row.country_name,
    }),
    game_variant: inferGameVariant(row.game_type, row.variant, name),
    display_name: name,
    timezone,
    catalog_scope: 'live',
  }
}

/**
 * @param {{
 *   resolveVenue: (title: string, city?: string, country?: string) => Promise<string | null>,
 *   now?: Date,
 *   fetchImpl?: typeof fetch,
 * }} opts
 */
export async function fetchMttdbLiveCatalogOneOffs(opts) {
  const { resolveVenue, now = new Date(), fetchImpl = fetch } = opts
  const today = isoDateLocal(now)
  const horizon = new Date(now.getTime())
  horizon.setDate(horizon.getDate() + MTTDB_LIVE_HORIZON_DAYS)
  const horizonIso = isoDateLocal(horizon)

  const res = await fetchImpl(MTTDB_LIVE_LOBBY_URL, { headers: { 'User-Agent': MTTDB_FETCH_UA } })
  if (!res.ok) throw new Error(`MTTDB live lobby fetch failed: HTTP ${res.status}`)
  const html = await res.text()
  const parsed = parseMttdbEmbeddedTournaments(html, { kind: 'live' })

  /** @type {object[]} */
  const oneOff = []
  let skippedVenue = 0
  let skippedDate = 0

  for (const row of parsed) {
    const eventDate = String(row.start_date || '').slice(0, 10)
    if (eventDate < today || eventDate > horizonIso) {
      skippedDate++
      continue
    }

    const venueName = await resolveVenue(
      row.venue_title,
      row.venue_city,
      row.country_name,
    )
    if (!venueName) {
      skippedVenue++
      continue
    }

    const catalogRow = mttdbRowToCatalogOneOff(row, venueName)
    if (catalogRow) oneOff.push(catalogRow)
  }

  return {
    oneOff,
    stats: {
      parsed: parsed.length,
      ingested: oneOff.length,
      skippedVenue,
      skippedDate,
    },
  }
}

/**
 * @param {object} row MTTDB online tournament object
 * @param {string} siteLabel resolved POKER_ONLINE_SITES label (venue_name)
 */
export function mttdbOnlineRowToCatalogOneOff(row, siteLabel) {
  const buyIn = totalBuyIn(row)
  if (buyIn == null) return null

  const startsAtRaw = String(row.start_date || '').trim()
  const eventDate = startsAtRaw.slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(eventDate)) return null

  const name = String(row.name || '').trim()

  return {
    external_id: `mttdb:online:${row.id}`,
    venue_name: siteLabel,
    event_date: eventDate,
    starts_at: startsAtRaw,
    buy_in: buyIn,
    currency: resolveCatalogCurrency({
      buyinCurrency: row.buyin_currency,
      onlineSiteSlug: row.site_slug,
      onlineSiteId: row.site_slug,
    }),
    display_name: name,
    timezone: MTTDB_ONLINE_TIMEZONE,
    catalog_scope: 'online',
  }
}

/**
 * @param {{
 *   resolveSite: (siteName: string, siteSlug?: string) => string | null,
 *   now?: Date,
 *   fetchImpl?: typeof fetch,
 * }} opts
 */
export async function fetchMttdbOnlineCatalogOneOffs(opts) {
  const { resolveSite, now = new Date(), fetchImpl = fetch } = opts
  const today = isoDateLocal(now)
  const horizon = new Date(now.getTime())
  horizon.setDate(horizon.getDate() + MTTDB_ONLINE_HORIZON_DAYS)
  const horizonIso = isoDateLocal(horizon)

  const res = await fetchImpl(MTTDB_ONLINE_LOBBY_URL, { headers: { 'User-Agent': MTTDB_FETCH_UA } })
  if (!res.ok) throw new Error(`MTTDB online lobby fetch failed: HTTP ${res.status}`)
  const html = await res.text()
  const parsed = parseMttdbEmbeddedTournaments(html, { kind: 'online' })

  /** @type {object[]} */
  const oneOff = []
  let skippedSite = 0
  let skippedDate = 0

  for (const row of parsed) {
    const eventDate = String(row.start_date || '').slice(0, 10)
    if (eventDate < today || eventDate > horizonIso) {
      skippedDate++
      continue
    }

    const siteLabel = resolveSite(row.site_name, row.site_slug)
    if (!siteLabel) {
      skippedSite++
      continue
    }

    const catalogRow = mttdbOnlineRowToCatalogOneOff(row, siteLabel)
    if (catalogRow) oneOff.push(catalogRow)
  }

  return {
    oneOff,
    stats: {
      parsed: parsed.length,
      ingested: oneOff.length,
      skippedSite,
      skippedDate,
    },
  }
}
