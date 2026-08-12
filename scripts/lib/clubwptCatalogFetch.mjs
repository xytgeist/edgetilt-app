/**
 * ClubWPT lobby scrape → catalog one_off rows.
 * Guest login (form-urlencoded) + lobbydata/tourns/full lists (VIP TP + free PLAY).
 *
 * ClubWPT Gold (sweeps client at clubwptgold.com) uses a separate Cocos game shell with
 * no public tournament list API yet … that path is stubbed for a follow-up.
 */

import { isoDateLocal } from './pokerTournamentCatalog.mjs'
import { inferTournamentGameVariantFromText } from './pokerTournamentGameVariant.mjs'

export const CLUBWPT_LOBBY_ORIGIN = 'https://lobby.clubwpt.com'
export const CLUBWPT_WEBSERVICES_URL = 'https://webservices.clubwpt.com'
export const CLUBWPT_CLIENTAPP = 'WPTWeb-DEV'
export const CLUBWPT_FETCH_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'

/** Align with MTTDB online horizon. */
export const CLUBWPT_HORIZON_DAYS = 7

/** Venue labels must match POKER_ONLINE_SITES. */
export const CLUBWPT_VENUE_LABEL = 'ClubWPT'
export const CLUBWPT_GOLD_VENUE_LABEL = 'ClubWPT Gold'

/**
 * Keyword action_param paths that return scheduled MTTs (not SnG / cash).
 * VIP/TP → ClubWPT; PLAY freerolls → ClubWPT (same product, free seat).
 */
export const CLUBWPT_TOURN_LIST_PATHS = [
  {
    venue: CLUBWPT_VENUE_LABEL,
    path: 'wptlobbyapi/lobbydata/tourns/full?startCondition=scheduled&category=poker&currencyType=TP&limit=100&datePeriod=200',
  },
  {
    venue: CLUBWPT_VENUE_LABEL,
    path: 'lobbyapi/lobbydata/tourns/full?startCondition=scheduled&category=poker&currencyType=PLAY&limit=100&datePeriod=200',
  },
]

/**
 * @param {typeof fetch} [fetchImpl]
 * @returns {Promise<{ sessionToken: string, customerId: string | number }>}
 */
export async function clubwptGuestLogin(fetchImpl = fetch) {
  const uuid = `${Date.now()}-${Math.floor(1e6 * Math.random())}`
  const res = await fetchImpl(`${CLUBWPT_WEBSERVICES_URL}/authentication/login-guest`, {
    method: 'POST',
    headers: {
      'User-Agent': CLUBWPT_FETCH_UA,
      Accept: 'application/json',
      'Content-Type': 'application/x-www-form-urlencoded',
      Referer: `${CLUBWPT_LOBBY_ORIGIN}/`,
      Origin: CLUBWPT_LOBBY_ORIGIN,
    },
    body: new URLSearchParams({ uuid, clientapp: CLUBWPT_CLIENTAPP }).toString(),
  })
  if (!res.ok) throw new Error(`ClubWPT guest login HTTP ${res.status}`)
  const json = await res.json()
  const sessionToken = json?.payload?.sessionToken
  const customerId = json?.payload?.customerId
  if (!sessionToken) {
    throw new Error(`ClubWPT guest login failed: ${json?.code || json?.message || 'no sessionToken'}`)
  }
  return { sessionToken, customerId }
}

/**
 * @param {string} path
 * @param {string} sessionToken
 * @param {typeof fetch} [fetchImpl]
 */
export async function clubwptFetchTournList(path, sessionToken, fetchImpl = fetch) {
  const clean = String(path || '').replace(/^\//, '')
  const url = new URL(`${CLUBWPT_WEBSERVICES_URL}/${clean}`)
  url.searchParams.set('session_token', sessionToken)
  url.searchParams.set('clientapp', CLUBWPT_CLIENTAPP)
  const res = await fetchImpl(url, {
    headers: {
      'User-Agent': CLUBWPT_FETCH_UA,
      Accept: 'application/json',
      Referer: `${CLUBWPT_LOBBY_ORIGIN}/`,
      Origin: CLUBWPT_LOBBY_ORIGIN,
    },
  })
  if (!res.ok) throw new Error(`ClubWPT tourn list HTTP ${res.status} (${clean.slice(0, 60)})`)
  const json = await res.json()
  const rows = Array.isArray(json?.rows) ? json.rows : []
  return rows
}

/**
 * @param {unknown} ms
 * @returns {{ eventDate: string, startsAt: string } | null}
 */
export function clubwptStartFromMs(ms) {
  const n = Number(ms)
  if (!Number.isFinite(n) || n <= 0) return null
  const d = new Date(n)
  if (Number.isNaN(d.getTime())) return null
  return { eventDate: d.toISOString().slice(0, 10), startsAt: d.toISOString() }
}

/**
 * @param {object} value TournLaunchLobbyData
 * @returns {number | null}
 */
export function clubwptBuyInAmount(value) {
  const details = Array.isArray(value?.buyin_details) ? value.buyin_details : []
  const def = details.find((d) => d?.is_default) || details[0]
  if (def && Number.isFinite(Number(def.buyin_amount))) {
    return Number(def.buyin_amount) + (Number(def.buyin_fee) || 0)
  }
  const raw = String(value?.buyin || '').trim()
  if (!raw || /^freeroll$/i.test(raw)) return 0
  const n = Number(raw.replace(/,/g, ''))
  return Number.isFinite(n) ? n : null
}

/**
 * @param {object} row { id, value }
 * @param {string} venueLabel
 * @param {Date} now
 * @param {string} horizonIso
 */
export function clubwptRowToCatalogOneOff(row, venueLabel, now, horizonIso) {
  const id = row?.id
  const value = row?.value
  if (id == null || !value || typeof value !== 'object') return null

  const status = String(value.status || '').toUpperCase()
  // Skip finished / cancelled noise; keep announced + open + late-reg playing.
  if (status === 'FINISHED' || status === 'CANCELLED' || status === 'COMPLETED') return null

  const start = clubwptStartFromMs(value.tourn_start)
  if (!start) return null
  const today = isoDateLocal(now)
  if (start.eventDate < today || start.eventDate > horizonIso) return null

  const buyIn = clubwptBuyInAmount(value)
  if (buyIn == null) return null

  const name = String(value.tourn_name || '').trim()
  if (!name) return null

  const game = inferTournamentGameVariantFromText(value.game_type, value.game_name, name)

  return {
    external_id: `clubwpt:online:${id}`,
    venue_name: venueLabel,
    event_date: start.eventDate,
    starts_at: start.startsAt,
    buy_in: buyIn,
    currency: 'USD',
    display_name: name,
    game_variant: game || undefined,
    timezone: 'America/New_York',
    catalog_scope: 'online',
  }
}

/**
 * @param {{
 *   now?: Date,
 *   fetchImpl?: typeof fetch,
 *   listPaths?: typeof CLUBWPT_TOURN_LIST_PATHS,
 * }} [opts]
 */
export async function fetchClubwptCatalogOneOffs(opts = {}) {
  const { now = new Date(), fetchImpl = fetch, listPaths = CLUBWPT_TOURN_LIST_PATHS } = opts
  const horizon = new Date(now.getTime())
  horizon.setDate(horizon.getDate() + CLUBWPT_HORIZON_DAYS)
  const horizonIso = isoDateLocal(horizon)

  const { sessionToken } = await clubwptGuestLogin(fetchImpl)

  /** @type {Map<string, object>} */
  const byExternal = new Map()
  let parsed = 0
  let skippedDate = 0
  let skippedStatus = 0

  for (const { venue, path } of listPaths) {
    const rows = await clubwptFetchTournList(path, sessionToken, fetchImpl)
    for (const row of rows) {
      parsed++
      const status = String(row?.value?.status || '').toUpperCase()
      if (status === 'FINISHED' || status === 'CANCELLED' || status === 'COMPLETED') {
        skippedStatus++
        continue
      }
      const start = clubwptStartFromMs(row?.value?.tourn_start)
      if (!start || start.eventDate < isoDateLocal(now) || start.eventDate > horizonIso) {
        skippedDate++
        continue
      }
      const one = clubwptRowToCatalogOneOff(row, venue, now, horizonIso)
      if (!one) continue
      byExternal.set(one.external_id, one)
    }
  }

  return {
    oneOff: [...byExternal.values()],
    stats: {
      parsed,
      ingested: byExternal.size,
      skippedDate,
      skippedStatus,
      lists: listPaths.length,
    },
  }
}

/**
 * Placeholder until ClubWPT Gold Cocos lobby protocol is mapped.
 * @returns {Promise<{ oneOff: object[], stats: object, skippedReason: string }>}
 */
export async function fetchClubwptGoldCatalogOneOffs() {
  return {
    oneOff: [],
    stats: { parsed: 0, ingested: 0 },
    skippedReason:
      'ClubWPT Gold daily MTTs live in the authenticated Cocos game client (clubwptgold.com) with no public lobbydata API yet.',
  }
}
