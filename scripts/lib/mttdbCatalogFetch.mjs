/**
 * MTTDB live + online lobby scrape → catalog one_off rows.
 * Live: https://mttdb.com/live-poker/tournaments/
 * Online: https://mttdb.com/online-poker/
 */

import { isoDateLocal } from './pokerTournamentCatalog.mjs'
import { inferTournamentGameVariantFromText } from './pokerTournamentGameVariant.mjs'
import { resolveCatalogCurrency } from './pokerTournamentCurrency.mjs'

export const MTTDB_ORIGIN = 'https://mttdb.com'
export const MTTDB_LIVE_LOBBY_URL = 'https://mttdb.com/live-poker/tournaments/'
export const MTTDB_ONLINE_LOBBY_URL = 'https://mttdb.com/online-poker/'
export const MTTDB_FETCH_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'

/** Ingest window aligned with MTTDB lobby (next 7 days). */
export const MTTDB_LIVE_HORIZON_DAYS = 7
export const MTTDB_ONLINE_HORIZON_DAYS = 7

/** MTTDB online start_date values are UTC (no tz field on row). */
export const MTTDB_ONLINE_TIMEZONE = 'UTC'

const MTTDB_FETCH_RETRIES = 3
const MTTDB_RETRY_BASE_MS = 800

function mttdbBrowserHeaders(extra = {}) {
  return {
    'User-Agent': MTTDB_FETCH_UA,
    Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.9',
    'Cache-Control': 'no-cache',
    Pragma: 'no-cache',
    'Upgrade-Insecure-Requests': '1',
    'Sec-Fetch-Dest': 'document',
    'Sec-Fetch-Mode': 'navigate',
    'Sec-Fetch-Site': 'same-origin',
    'Sec-Fetch-User': '?1',
    ...extra,
  }
}

function mergeSetCookie(existing, setCookieHeader) {
  /** @type {Map<string, string>} */
  const jar = new Map()
  for (const part of String(existing || '')
    .split(';')
    .map((s) => s.trim())
    .filter(Boolean)) {
    const eq = part.indexOf('=')
    if (eq > 0) jar.set(part.slice(0, eq), part.slice(eq + 1))
  }
  const raw = setCookieHeader
  const list = Array.isArray(raw) ? raw : raw ? [raw] : []
  for (const line of list) {
    const first = String(line).split(';')[0] || ''
    const eq = first.indexOf('=')
    if (eq > 0) jar.set(first.slice(0, eq).trim(), first.slice(eq + 1).trim())
  }
  return [...jar.entries()].map(([k, v]) => `${k}=${v}`).join('; ')
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * Fetch MTTDB lobby HTML with browser-like headers, PHPSESSID warm-up, and 403/429 retries.
 * GitHub Actions egress is often CF-blocked; warm-up + retries help some challenges, not hard IP bans.
 * @param {string} url
 * @param {{ fetchImpl?: typeof fetch, label?: string }} [opts]
 */
export async function fetchMttdbLobbyHtml(url, opts = {}) {
  const fetchImpl = opts.fetchImpl || fetch
  const label = opts.label || 'lobby'

  let cookie = ''
  try {
    const warm = await fetchImpl(`${MTTDB_ORIGIN}/`, {
      headers: mttdbBrowserHeaders({ 'Sec-Fetch-Site': 'none' }),
      redirect: 'follow',
    })
    cookie = mergeSetCookie(cookie, warm.headers.getSetCookie?.() || warm.headers.get('set-cookie'))
  } catch {
    // Warm-up is best-effort … continue to the lobby URL.
  }

  let lastStatus = 0
  let lastSnippet = ''
  for (let attempt = 1; attempt <= MTTDB_FETCH_RETRIES; attempt++) {
    const headers = mttdbBrowserHeaders({
      Referer: `${MTTDB_ORIGIN}/`,
      ...(cookie ? { Cookie: cookie } : {}),
    })
    const res = await fetchImpl(url, { headers, redirect: 'follow' })
    cookie = mergeSetCookie(cookie, res.headers.getSetCookie?.() || res.headers.get('set-cookie'))
    const html = await res.text()
    lastStatus = res.status
    lastSnippet = html.replace(/\s+/g, ' ').slice(0, 160)

    const challenge = /just a moment|cf-browser-verification|attention required|enable javascript/i.test(html)
    if (res.ok && !challenge && html.includes('{"id":')) return html

    if (attempt < MTTDB_FETCH_RETRIES && (res.status === 403 || res.status === 429 || challenge || !res.ok)) {
      await sleep(MTTDB_RETRY_BASE_MS * attempt)
      continue
    }

    if (!res.ok) {
      throw new Error(`MTTDB ${label} fetch failed: HTTP ${res.status}`)
    }
    if (challenge) {
      throw new Error(`MTTDB ${label} fetch failed: Cloudflare challenge (${lastStatus || 'ok'})`)
    }
    if (!html.includes('{"id":')) {
      throw new Error(`MTTDB ${label} fetch failed: no embedded tournaments (${lastSnippet || 'empty body'})`)
    }
    return html
  }

  throw new Error(`MTTDB ${label} fetch failed: HTTP ${lastStatus || 'unknown'}`)
}

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

  const html = await fetchMttdbLobbyHtml(MTTDB_LIVE_LOBBY_URL, { fetchImpl, label: 'live lobby' })
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

  const html = await fetchMttdbLobbyHtml(MTTDB_ONLINE_LOBBY_URL, { fetchImpl, label: 'online lobby' })
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
