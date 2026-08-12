/**
 * ClubWPT lobby scrape → catalog one_off rows.
 * Guest login (form-urlencoded) + lobbydata/tourns/full lists (VIP TP + free PLAY).
 *
 * ClubWPT Gold (clubwptgold.com Cocos client):
 *   url_config → mttapi.clubwptgold.com/api/mtt/tournamentList?token=…
 *   Token comes from an authenticated game session (no public guest login).
 *   Set CLUBWPT_GOLD_MTT_TOKEN (or pass opts.token) to ingest.
 */

import { isoDateLocal } from './pokerTournamentCatalog.mjs'
import {
  inferTournamentGameVariantFromText,
  isKnownTournamentGameVariantId,
} from './pokerTournamentGameVariant.mjs'

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

/** Gold MTT HTTP API (from url_config apiMtt). */
export const CLUBWPT_GOLD_MTT_API_ORIGIN = 'https://mttapi.clubwptgold.com'
/** Bootstrap host that serves /mtt/appfile/url_config. */
export const CLUBWPT_GOLD_MTT_FRONT_ORIGIN = 'https://v88mttfront.clubwptgold.com'
export const CLUBWPT_GOLD_TOKEN_ENV = 'CLUBWPT_GOLD_MTT_TOKEN'

/**
 * Minimal protobuf reader for Gold MTT list responses.
 * @param {Uint8Array} bytes
 */
export function createClubwptGoldProtobufReader(bytes) {
  let pos = 0
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes)
  const eof = () => pos >= view.length
  const uint32 = () => {
    let result = 0
    let shift = 0
    while (pos < view.length) {
      const b = view[pos++]
      result |= (b & 0x7f) << shift
      if (!(b & 0x80)) return result >>> 0
      shift += 7
      if (shift > 35) throw new Error('varint overflow')
    }
    throw new Error('truncated varint')
  }
  const int32 = () => uint32() | 0
  const int64 = () => {
    // Enough for epoch seconds; ignore high bits beyond JS safe integer.
    let result = 0n
    let shift = 0n
    while (pos < view.length) {
      const b = BigInt(view[pos++])
      result |= (b & 0x7fn) << shift
      if (!(b & 0x80n)) {
        const asNum = Number(result)
        return Number.isSafeInteger(asNum) ? asNum : Number(result & 0xffffffffn)
      }
      shift += 7n
      if (shift > 70n) throw new Error('int64 overflow')
    }
    throw new Error('truncated int64')
  }
  const bool = () => uint32() !== 0
  const skip = (wireType) => {
    switch (wireType) {
      case 0:
        uint32()
        return
      case 1:
        pos += 8
        return
      case 2: {
        const len = uint32()
        pos += len
        return
      }
      case 5:
        pos += 4
        return
      default:
        throw new Error(`unsupported wire type ${wireType}`)
    }
  }
  const bytesField = () => {
    const len = uint32()
    const start = pos
    pos += len
    return view.subarray(start, pos)
  }
  const string = () => new TextDecoder().decode(bytesField())
  const double = () => {
    const start = pos
    pos += 8
    return new DataView(view.buffer, view.byteOffset + start, 8).getFloat64(0, true)
  }
  return { eof, pos: () => pos, uint32, int32, int64, bool, skip, bytesField, string, double }
}

/**
 * @param {Uint8Array} bytes
 * @returns {{ seconds: number, nanos: number } | null}
 */
export function decodeClubwptGoldTimestamp(bytes) {
  const r = createClubwptGoldProtobufReader(bytes)
  let seconds = 0
  let nanos = 0
  while (!r.eof()) {
    const tag = r.uint32()
    const field = tag >>> 3
    const wire = tag & 7
    if (field === 1 && wire === 0) seconds = r.int64()
    else if (field === 2 && wire === 0) nanos = r.int32()
    else r.skip(wire)
  }
  return { seconds, nanos }
}

/**
 * @param {Uint8Array} bytes
 */
export function decodeClubwptGoldTournamentDetail(bytes) {
  const r = createClubwptGoldProtobufReader(bytes)
  /** @type {Record<string, any>} */
  const d = {}
  while (!r.eof()) {
    const tag = r.uint32()
    const field = tag >>> 3
    const wire = tag & 7
    if (field === 1 && wire === 0) d.Id = r.uint32()
    else if (field === 2 && wire === 2) d.TournamentName = r.string()
    else if (field === 5 && wire === 2) d.StartingTime = decodeClubwptGoldTimestamp(r.bytesField())
    else if (field === 10 && wire === 1) d.RegFee = r.double()
    else if (field === 11 && wire === 1) d.SrvFee = r.double()
    else if (field === 12 && wire === 0) d.Status = r.int32()
    else if (field === 29 && wire === 2) d.DisplayCurrency = r.string()
    else if (field === 30 && wire === 0) d.GameMode = r.uint32()
    else r.skip(wire)
  }
  return d
}

/**
 * @param {Uint8Array} bytes
 */
export function decodeClubwptGoldTournamentInfo(bytes) {
  const r = createClubwptGoldProtobufReader(bytes)
  /** @type {Record<string, any>} */
  const info = { TimeLeftSec: 0 }
  while (!r.eof()) {
    const tag = r.uint32()
    const field = tag >>> 3
    const wire = tag & 7
    if (field === 1 && wire === 2) info.Detail = decodeClubwptGoldTournamentDetail(r.bytesField())
    else if (field === 5 && wire === 0) info.TimeLeftSec = r.int32()
    else r.skip(wire)
  }
  return info
}

/**
 * @param {Uint8Array} bytes
 * @returns {{ ErrorCode: number, TournamentInfos: object[] }}
 */
export function decodeClubwptGoldTournamentListResponse(bytes) {
  const r = createClubwptGoldProtobufReader(bytes)
  /** @type {{ ErrorCode: number, TournamentInfos: object[] }} */
  const out = { ErrorCode: 0, TournamentInfos: [] }
  while (!r.eof()) {
    const tag = r.uint32()
    const field = tag >>> 3
    const wire = tag & 7
    if (field === 1 && wire === 0) out.ErrorCode = r.int32()
    else if (field === 2 && wire === 2) out.TournamentInfos.push(decodeClubwptGoldTournamentInfo(r.bytesField()))
    else r.skip(wire)
  }
  return out
}

/** Encode Mtt_Tournament_List_Request { platForm }. */
export function encodeClubwptGoldTournamentListRequest(platForm = 0) {
  if (!platForm) return new Uint8Array([0x08, 0x00])
  const out = [0x08]
  let n = platForm >>> 0
  while (n >= 0x80) {
    out.push((n & 0x7f) | 0x80)
    n >>>= 7
  }
  out.push(n)
  return new Uint8Array(out)
}

/**
 * @param {typeof fetch} [fetchImpl]
 * @returns {Promise<{ apiMtt: string }>}
 */
export async function clubwptGoldLoadUrlConfig(fetchImpl = fetch) {
  const url = `${CLUBWPT_GOLD_MTT_FRONT_ORIGIN}/mtt/appfile/url_config`
  const res = await fetchImpl(url, {
    headers: {
      'User-Agent': CLUBWPT_FETCH_UA,
      Accept: 'application/json',
      Referer: 'https://clubwptgold.com/game/',
      Origin: 'https://clubwptgold.com',
    },
  })
  if (!res.ok) throw new Error(`ClubWPT Gold url_config HTTP ${res.status}`)
  const json = await res.json()
  const apiMtt = Array.isArray(json?.apiMtt) && json.apiMtt[0] ? String(json.apiMtt[0]) : 'mttapi.clubwptgold.com'
  return { apiMtt }
}

/**
 * @param {string} token
 * @param {{ fetchImpl?: typeof fetch, apiHost?: string, platForm?: number }} [opts]
 */
export async function clubwptGoldFetchTournamentList(token, opts = {}) {
  const { fetchImpl = fetch, platForm = 0 } = opts
  let apiHost = opts.apiHost
  if (!apiHost) {
    const cfg = await clubwptGoldLoadUrlConfig(fetchImpl)
    apiHost = cfg.apiMtt
  }
  const origin = apiHost.startsWith('http') ? apiHost.replace(/\/$/, '') : `https://${apiHost}`
  const url = `${origin}/api/mtt/tournamentList?token=${encodeURIComponent(token)}`
  const res = await fetchImpl(url, {
    method: 'POST',
    headers: {
      'User-Agent': CLUBWPT_FETCH_UA,
      Accept: '*/*',
      'Content-Type': 'application/octet-stream',
      Referer: 'https://clubwptgold.com/game/',
      Origin: 'https://clubwptgold.com',
    },
    body: encodeClubwptGoldTournamentListRequest(platForm),
  })
  if (!res.ok) throw new Error(`ClubWPT Gold tournamentList HTTP ${res.status}`)
  const buf = new Uint8Array(await res.arrayBuffer())
  return decodeClubwptGoldTournamentListResponse(buf)
}

/**
 * @param {object} info decoded MttTournamentInfo
 * @param {Date} now
 * @param {string} horizonIso
 */
export function clubwptGoldInfoToCatalogOneOff(info, now, horizonIso) {
  const detail = info?.Detail
  if (!detail?.Id || !detail.TournamentName) return null

  // Finished / cancelled style statuses seen in client (numeric; keep future-looking only).
  const status = Number(detail.Status) || 0
  if (status >= 5) return null

  const seconds = Number(detail.StartingTime?.seconds)
  if (!Number.isFinite(seconds) || seconds <= 0) return null
  const startsAt = new Date(seconds * 1000)
  if (Number.isNaN(startsAt.getTime())) return null
  const eventDate = startsAt.toISOString().slice(0, 10)
  const today = isoDateLocal(now)
  if (eventDate < today || eventDate > horizonIso) return null

  const reg = Number(detail.RegFee)
  const srv = Number(detail.SrvFee)
  const buyIn =
    (Number.isFinite(reg) ? reg : 0) + (Number.isFinite(srv) ? srv : 0)

  const name = String(detail.TournamentName).trim()
  if (!name) return null

  const game = inferTournamentGameVariantFromText(name)
  const gameVariant = isKnownTournamentGameVariantId(game) ? game : undefined

  return {
    external_id: `clubwptgold:online:${detail.Id}`,
    venue_name: CLUBWPT_GOLD_VENUE_LABEL,
    event_date: eventDate,
    starts_at: startsAt.toISOString(),
    buy_in: buyIn,
    currency: 'USD',
    display_name: name,
    game_variant: gameVariant,
    timezone: 'America/Los_Angeles',
    catalog_scope: 'online',
  }
}

/**
 * ClubWPT Gold MTT list → catalog one_off rows.
 * Requires a live game session token (CLUBWPT_GOLD_MTT_TOKEN).
 *
 * @param {{
 *   now?: Date,
 *   fetchImpl?: typeof fetch,
 *   token?: string | null,
 * }} [opts]
 * @returns {Promise<{ oneOff: object[], stats: object, skippedReason?: string }>}
 */
export async function fetchClubwptGoldCatalogOneOffs(opts = {}) {
  const { now = new Date(), fetchImpl = fetch } = opts
  const token = String(opts.token ?? process.env[CLUBWPT_GOLD_TOKEN_ENV] ?? '').trim()
  if (!token) {
    return {
      oneOff: [],
      stats: { parsed: 0, ingested: 0 },
      skippedReason:
        `ClubWPT Gold needs ${CLUBWPT_GOLD_TOKEN_ENV} (authenticated mttapi tournamentList token from clubwptgold.com/game). No public guest list.`,
    }
  }

  const horizon = new Date(now.getTime())
  horizon.setDate(horizon.getDate() + CLUBWPT_HORIZON_DAYS)
  const horizonIso = isoDateLocal(horizon)

  const list = await clubwptGoldFetchTournamentList(token, { fetchImpl })
  if (list.ErrorCode) {
    throw new Error(`ClubWPT Gold tournamentList ErrorCode=${list.ErrorCode} (token expired or invalid)`)
  }

  /** @type {Map<string, object>} */
  const byExternal = new Map()
  let parsed = 0
  let skippedDate = 0
  let skippedStatus = 0

  for (const info of list.TournamentInfos || []) {
    parsed++
    const status = Number(info?.Detail?.Status) || 0
    if (status >= 5) {
      skippedStatus++
      continue
    }
    const one = clubwptGoldInfoToCatalogOneOff(info, now, horizonIso)
    if (!one) {
      skippedDate++
      continue
    }
    byExternal.set(one.external_id, one)
  }

  return {
    oneOff: [...byExternal.values()],
    stats: {
      parsed,
      ingested: byExternal.size,
      skippedDate,
      skippedStatus,
    },
  }
}
