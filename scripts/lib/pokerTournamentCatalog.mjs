/**
 * Shared helpers for tournament catalog seed + fetch scripts (multi-region).
 */

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { normalizeTournamentGameVariantId } from './pokerTournamentGameVariant.mjs'
import { resolveCatalogCurrency } from './pokerTournamentCurrency.mjs'
import { buildTournamentFingerprintKey } from '../../src/features/poker-bankroll/pokerTournamentEventKeys.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
export const repoRootFromCatalogLib = path.resolve(__dirname, '..', '..')
export const CATALOG_SEED_DIR = path.join(repoRootFromCatalogLib, 'supabase', 'seed')
export const CATALOG_FILE_RE = /^poker_tournament_catalog_.+\.json$/i

/** @type {Record<string, string>} */
export const VENUE_ALIASES = {
  // Nevada
  'bellagio hotel & casino': 'Bellagio',
  'bellagio las vegas': 'Bellagio',
  'aria casino': 'Aria',
  'aria resort & casino': 'Aria',
  'the venetian': 'The Venetian',
  'venetian hotel and casino': 'The Venetian',
  'venetian las vegas': 'The Venetian',
  'the venetian las vegas': 'The Venetian',
  'wynn las vegas': 'Wynn Las Vegas',
  'wynn las vegas casino': 'Wynn Las Vegas',
  'wynn las vegas poker room': 'Wynn Las Vegas',
  'encore at wynn': 'Encore at Wynn',
  'caesars palace las vegas': 'Caesars Palace',
  'paris las vegas hotel & casino': 'Paris Las Vegas',
  'planet hollywood resort & casino': 'Planet Hollywood',
  'horseshoe las vegas hotel – casino': 'Horseshoe Las Vegas',
  'horseshoe las vegas hotel - casino': 'Horseshoe Las Vegas',
  'horseshoe las vegas': 'Horseshoe Las Vegas',
  'the orleans': 'The Orleans',
  'orleans hotel & casino': 'The Orleans',
  'the orleans hotel & casino': 'The Orleans',
  'live! casino pittsburgh': 'Live! Casino Pittsburgh',
  'live casino pittsburgh': 'Live! Casino Pittsburgh',
  // California
  'commerce casino': 'Commerce Casino',
  'the commerce casino': 'Commerce Casino',
  'bicycle hotel & casino': 'Bicycle Casino',
  'the bicycle hotel & casino': 'Bicycle Casino',
  'bicycle casino': 'Bicycle Casino',
  'hollywood park casino': 'Hollywood Park Casino',
  'yaamava resort & casino': "Yaamava' Resort & Casino",
  'san manuel casino': "Yaamava' Resort & Casino",
  'pechanga resort & casino': 'Pechanga Resort Casino',
  'thunder valley casino resort': 'Thunder Valley Casino Resort',
  'morongo casino resort & spa': 'Morongo Casino Resort & Spa',
  // Florida
  'seminole hard rock hotel & casino tampa': 'Seminole Hard Rock Hotel & Casino',
  'hard rock hotel & casino tampa': 'Seminole Hard Rock Hotel & Casino',
  'seminole hard rock hotel & casino hollywood': 'Seminole Hard Rock Hollywood',
  'hard rock hotel & casino hollywood': 'Seminole Hard Rock Hollywood',
  // Pennsylvania
  'parx casino and racing': 'Parx Casino',
  'wind creek bethlehem': 'Wind Creek Bethlehem',
  'rivers casino philadelphia': 'Rivers Casino',
  // New Jersey
  'borgata hotel casino & spa': 'Borgata Hotel Casino & Spa',
  'borgata': 'Borgata Hotel Casino & Spa',
  // Connecticut
  'foxwoods resort casino': 'Foxwoods Resort Casino',
  'mohegan sun': 'Mohegan Sun',
  // Oklahoma
  'choctaw casino & resort durant': 'Choctaw Casino & Resort',
  'winstar world casino and resort': 'WinStar World Casino',
  // Arizona
  'talking stick resort': 'Talking Stick Resort',
  'arena poker room at talking stick resort': 'Talking Stick Resort',
  'lone butte casino': 'Lone Butte Casino',
  'gila river casino - lone butte': 'Lone Butte Casino',
  'gila river casinos lone butte': 'Lone Butte Casino',
  'desert diamond casino': 'Desert Diamond Casino',
  'desert diamond casino tucson': 'Desert Diamond Casino',
  'desert diamond west valley': 'Desert Diamond West Valley',
  'desert diamond casino west valley': 'Desert Diamond West Valley',
  'casino del sol': 'Casino Del Sol',
  // Gulf Coast (MS)
  'beau rivage resort & casino': 'Beau Rivage Resort & Casino',
  'beau rivage': 'Beau Rivage Resort & Casino',
  // DC / Maryland
  'live! casino & hotel': 'Live! Casino & Hotel',
  'live casino & hotel': 'Live! Casino & Hotel',
  'maryland live!': 'Live! Casino & Hotel',
  'maryland live': 'Live! Casino & Hotel',
  'live! casino hotel maryland': 'Live! Casino & Hotel',
  'mgm national harbor': 'MGM National Harbor',
  'mgm national harbor poker room': 'MGM National Harbor',
  // Chicagoland
  'horseshoe casino': 'Horseshoe Casino',
  'horseshoe casino hammond': 'Horseshoe Casino',
  'horseshoe hammond': 'Horseshoe Casino',
  'rivers casino des plaines': 'Rivers Casino Des Plaines',
  'rivers des plaines': 'Rivers Casino Des Plaines',
  'grand victoria casino': 'Grand Victoria Casino',
  'grand victoria elgin': 'Grand Victoria Casino',
  // Midwest / tribal (recurring dailies)
  'canterbury park': 'Canterbury Park',
  'running aces casino': 'Running Aces Casino',
  'running aces casino & racetrack': 'Running Aces Casino',
  'running aces': 'Running Aces Casino',
  'firekeepers casino': 'FireKeepers Casino',
  'firekeepers casino hotel': 'FireKeepers Casino',
  // Indiana
  'caesars southern indiana': 'Caesars Southern Indiana',
  'horseshoe indianapolis': 'Horseshoe Indianapolis',
  'horseshoe indy': 'Horseshoe Indianapolis',
  // Wisconsin
  'potawatomi casino hotel': 'Potawatomi Casino Hotel',
  'potawatomi hotel & casino': 'Potawatomi Casino Hotel',
  'potawatomi casino': 'Potawatomi Casino Hotel',
  'potawatomi casino i hotel': 'Potawatomi Casino Hotel',
  // MSPT homepage venue strings
  'rivers casino – chicago, il': 'Rivers Casino Des Plaines',
  'rivers casino - chicago, il': 'Rivers Casino Des Plaines',
  'ameristar east chicago – east chicago, indiana': 'Ameristar East Chicago',
  'ameristar east chicago - east chicago, indiana': 'Ameristar East Chicago',
  'ameristar casino st. charles – st. louis, missouri': 'Ameristar Casino St. Charles',
  'ameristar casino st. charles - st. louis, missouri': 'Ameristar Casino St. Charles',
  'firekeepers casino – battle creek, michigan': 'FireKeepers Casino',
  'firekeepers casino - battle creek, michigan': 'FireKeepers Casino',
  'running aces casino – columbus, minnesota': 'Running Aces Casino',
  'running aces casino - columbus, minnesota': 'Running Aces Casino',
  'the venetian – las vegas, nevada': 'The Venetian',
  'the venetian - las vegas, nevada': 'The Venetian',
  'seminole hard rock – hollywood, florida': 'Seminole Hard Rock Hollywood',
  'seminole hard rock - hollywood, florida': 'Seminole Hard Rock Hollywood',
  'sycuan casino resort – san diego, california': 'Sycuan Casino Resort',
  'sycuan casino resort - san diego, california': 'Sycuan Casino Resort',
  'riverside casino – riverside, iowa': 'Riverside Casino',
  'riverside casino - riverside, iowa': 'Riverside Casino',
  'grand falls casino – larchwood, iowa': 'Grand Falls Casino',
  'grand falls casino - larchwood, iowa': 'Grand Falls Casino',
  "bally's black hawk casino – black hawk, colorado": "Bally's Black Hawk Casino",
  "bally's black hawk casino - black hawk, colorado": "Bally's Black Hawk Casino",
  'jack cleveland casino – cleveland, ohio': 'JACK Cleveland Casino',
  'jack cleveland casino - cleveland, ohio': 'JACK Cleveland Casino',
  // MTTDB venue strings (live lobby)
  'red rock casino resort & spa': 'Red Rock Casino Resort & Spa',
  'stones gambling hall': 'Stones Gambling Hall',
  'chinook winds casino resort': 'Chinook Winds Casino Resort',
  'atlantis casino resort': 'Atlantis Casino Resort',
  'grand sierra resort and casino': 'Grand Sierra Resort and Casino',
  'grand sierra resort & casino': 'Grand Sierra Resort and Casino',
  "bally's twin river lincoln casino": "Bally's Twin River Lincoln Casino",
  'twin river casino': "Bally's Twin River Lincoln Casino",
  "king's resort": "King's Resort",
  'bestbet st. augustine': 'Bestbet St. Augustine',
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

export const DEFAULT_CATALOG_TIMEZONE = 'America/Los_Angeles'

/** Seed may store weeks ahead; the Live picker only shows today + ~24h. */
export const CATALOG_SEED_HORIZON_DAYS = 14

export const CATALOG_SEED_GLOB = 'poker_tournament_catalog_*.json'

export function isoDateLocal(d) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function addDays(date, days) {
  const d = new Date(date.getTime())
  d.setDate(d.getDate() + days)
  return d
}

/**
 * UTC offset in minutes for a calendar date in an IANA timezone (DST-aware).
 * @param {string} timezone
 * @param {string} eventDate YYYY-MM-DD
 */
export function timezoneOffsetMinutes(timezone, eventDate) {
  const tz = String(timezone || DEFAULT_CATALOG_TIMEZONE).trim() || DEFAULT_CATALOG_TIMEZONE
  if (!/^\d{4}-\d{2}-\d{2}$/.test(eventDate)) return -420
  const [y, mo, d] = eventDate.split('-').map(Number)
  const utcMs = Date.UTC(y, mo - 1, d, 12, 0, 0)
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    timeZoneName: 'shortOffset',
  }).formatToParts(new Date(utcMs))
  const tzPart = parts.find((p) => p.type === 'timeZoneName')?.value || ''
  const m = tzPart.match(/GMT([+-])(\d{1,2})(?::(\d{2}))?/)
  if (!m) return -420
  const sign = m[1] === '+' ? 1 : -1
  return sign * (Number(m[2]) * 60 + Number(m[3] || 0))
}

/**
 * @param {string} eventDate YYYY-MM-DD
 * @param {string} startsAtLocal HH:MM local wall time
 * @param {string} [timezone] IANA timezone
 */
export function catalogStartsAtIso(eventDate, startsAtLocal, timezone = DEFAULT_CATALOG_TIMEZONE) {
  const t = String(startsAtLocal || '').trim()
  if (!t || !/^\d{4}-\d{2}-\d{2}$/.test(eventDate)) return null
  const m = t.match(/^(\d{1,2}):(\d{2})$/)
  if (!m) return null
  const hh = String(Number(m[1])).padStart(2, '0')
  const mm = m[2]
  const offsetMinutes = timezoneOffsetMinutes(timezone, eventDate)
  const sign = offsetMinutes <= 0 ? '-' : '+'
  const abs = Math.abs(offsetMinutes)
  const oh = String(Math.floor(abs / 60)).padStart(2, '0')
  const om = String(abs % 60).padStart(2, '0')
  return `${eventDate}T${hh}:${mm}:00${sign}${oh}:${om}`
}

/** @param {string} raw */
export function normalizeCatalogVenueName(raw) {
  const trimmed = String(raw || '').trim()
  if (!trimmed) return trimmed
  const key = trimmed.toLowerCase().replace(/\s+/g, ' ')
  return VENUE_ALIASES[key] || trimmed
}

/**
 * @param {string} name
 * @param {string} [description]
 */
export function parseBuyInFromText(name, description = '') {
  const blob = `${name} ${description}`
  const m = blob.match(/\$\s*([\d,]+(?:\.\d{1,2})?)/)
  if (!m) return null
  const n = Number(m[1].replace(/,/g, ''))
  return Number.isFinite(n) ? n : null
}

/**
 * Merge multiple region seed payloads into one upsert batch.
 * @param {object[]} payloads
 */
export function mergeCatalogPayloads(payloads) {
  /** @type {object[]} */
  const recurring = []
  /** @type {object[]} */
  const oneOff = []
  /** @type {string[]} */
  const regions = []

  for (const payload of payloads || []) {
    const region = String(payload?._meta?.region || '').trim()
    if (region) regions.push(region)
    recurring.push(...(payload?.recurring || []))
    oneOff.push(...(payload?.one_off || []))
  }

  return {
    _meta: {
      regions,
      merged: true,
    },
    recurring,
    one_off: dedupeCatalogRows(oneOff),
  }
}

/**
 * Expand recurring + one_off catalog templates into dated upsert rows.
 * @param {object} payload
 * @param {Date} [now]
 * @param {number} [horizonDays]
 */
export function buildCatalogUpsertRows(payload, now = new Date(), horizonDays = CATALOG_SEED_HORIZON_DAYS) {
  const timezone = String(payload?._meta?.timezone || DEFAULT_CATALOG_TIMEZONE).trim() || DEFAULT_CATALOG_TIMEZONE
  /** @type {Array<Record<string, unknown>>} */
  const rows = []

  for (const template of payload?.recurring || []) {
    const days = Array.isArray(template.days_of_week) ? template.days_of_week : null
    const baseId = String(template.external_id || '').trim()
    if (!baseId) continue
    const templateTz = String(template.timezone || timezone).trim() || timezone

    for (let offset = 0; offset <= horizonDays; offset += 1) {
      const d = addDays(now, offset)
      if (days && days.length && !days.includes(d.getDay())) continue
      const eventDate = isoDateLocal(d)
      rows.push(rowFromTemplate(template, `${baseId}:${eventDate}`, eventDate, templateTz, payload?._meta))
    }
  }

  const today = isoDateLocal(now)
  for (const ev of payload?.one_off || []) {
    const offset = Number(ev.event_date_offset)
    const eventDate = Number.isFinite(offset)
      ? isoDateLocal(addDays(now, offset))
      : String(ev.event_date || '').slice(0, 10)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(eventDate)) continue
    if (Number.isFinite(offset)) {
      if (offset < 0 || offset > 90) continue
    } else {
      const ahead = Math.round(
        (new Date(`${eventDate}T12:00:00Z`).getTime() - new Date(`${today}T12:00:00Z`).getTime()) /
          86400000,
      )
      if (ahead < 0 || ahead > 90) continue
    }
    const extId = String(ev.external_id || '').trim() || `one-off:${eventDate}:${ev.venue_name}:${ev.buy_in}`
    const templateTz = String(ev.timezone || timezone).trim() || timezone
    rows.push(rowFromTemplate(ev, extId, eventDate, templateTz, payload?._meta))
  }

  return rows.filter((r) => r.external_id && r.venue_name && Number.isFinite(r.buy_in))
}

/**
 * Expand multiple region payloads (each with its own `_meta.timezone`).
 * @param {object[]} payloads
 * @param {Date} [now]
 * @param {number} [horizonDays]
 */
export function buildCatalogUpsertRowsFromPayloads(payloads, now = new Date(), horizonDays = CATALOG_SEED_HORIZON_DAYS) {
  /** @type {Array<Record<string, unknown>>} */
  const rows = []
  for (const payload of payloads || []) {
    rows.push(...buildCatalogUpsertRows(payload, now, horizonDays))
  }
  return dedupeCatalogRowsByFingerprint(rows)
}

/**
 * @param {object} template
 * @param {string} externalId
 * @param {string} eventDate
 * @param {string} timezone
 * @param {object} [catalogMeta]
 */
function rowFromTemplate(template, externalId, eventDate, timezone, catalogMeta = {}) {
  const startsAtRaw = template.starts_at ? String(template.starts_at).trim() : ''
  return {
    external_id: externalId,
    venue_name: normalizeCatalogVenueName(template.venue_name),
    event_date: eventDate,
    buy_in: Number(template.buy_in),
    game_variant: template.game_variant
      ? normalizeTournamentGameVariantId(String(template.game_variant))
      : null,
    currency: resolveCatalogCurrency({
      buyinCurrency: template.currency,
      region: catalogMeta?.region,
      countryName: template.country,
    }),
    display_name: template.display_name ? String(template.display_name) : null,
    starts_at: startsAtRaw || catalogStartsAtIso(eventDate, template.starts_at_local, timezone),
  }
}

/**
 * @param {object[]} rows
 */
export function dedupeCatalogRows(rows) {
  /** @type {Map<string, object>} */
  const byExternal = new Map()
  for (const row of rows || []) {
    const key = String(row.external_id || '')
    if (key) byExternal.set(key, row)
  }
  return [...byExternal.values()]
}

/**
 * When regional recurring seeds overlap MTTDB rows on the same fingerprint, keep MTTDB
 * (live scrape with starts_at). Same-fingerprint MTTDB flights stay separate for RPC siblings.
 * @param {object[]} rows
 */
export function dedupeCatalogRowsByFingerprint(rows) {
  /** @type {Map<string, object[]>} */
  const groups = new Map()
  /** @type {object[]} */
  const noFingerprint = []

  for (const row of rows || []) {
    const fp = buildTournamentFingerprintKey(row)
    if (!fp) {
      noFingerprint.push(row)
      continue
    }
    const group = groups.get(fp) || []
    group.push(row)
    groups.set(fp, group)
  }

  /** @type {object[]} */
  const out = [...noFingerprint]
  for (const group of groups.values()) {
    if (group.length === 1) {
      out.push(group[0])
      continue
    }

    const mttdbRows = group.filter((r) => String(r.external_id || '').startsWith('mttdb:'))
    const otherRows = group.filter((r) => !String(r.external_id || '').startsWith('mttdb:'))
    if (mttdbRows.length && otherRows.length) {
      out.push(...mttdbRows)
      continue
    }

    out.push(...group)
  }

  return out
}

/**
 * @param {string | null} [singleFile]
 * @param {string} [seedDir]
 * @returns {{ paths: string[], payloads: object[] }}
 */
export function loadCatalogSeedFiles(singleFile = null, seedDir = CATALOG_SEED_DIR) {
  const paths = singleFile
    ? [singleFile]
    : fs
        .readdirSync(seedDir)
        .filter((name) => CATALOG_FILE_RE.test(name))
        .sort()
        .map((name) => path.join(seedDir, name))

  const payloads = []
  for (const filePath of paths) {
    if (!fs.existsSync(filePath)) {
      throw new Error(`Catalog file not found: ${filePath}`)
    }
    payloads.push(JSON.parse(fs.readFileSync(filePath, 'utf8')))
  }
  return { paths, payloads }
}
