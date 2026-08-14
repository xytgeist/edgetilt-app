/**
 * Multi-flight tournament series (Day 1A/B/C … Day 2).
 * Sessions stay one-per-flight. Bankroll stays on the session that spent it.
 * Swaps count series bullets from a watermark (current bullet forward).
 */

import { normalizeTournamentGameVariantId } from '../../../scripts/lib/pokerTournamentGameVariant.mjs'
import { normalizeTournamentVenue } from './pokerTournamentEventKeys.js'
import { swapBulletCount } from './pokerTournamentSwapMath.js'

export const TOURNAMENT_SERIES_WINDOW_DAYS = 21

/** @param {unknown} name */
export function normalizeTournamentSeriesName(name) {
  let s = String(name || '')
    .toLowerCase()
    .replace(/\$[\d,]+(?:\.\d+)?/g, ' ')
    .replace(/\bday\s*1\s*[a-z]\b/g, ' ')
    .replace(/\bday\s*[2-9][a-z0-9]*\b/g, ' ')
    .replace(/\bfinal\s*day\b/g, ' ')
    .replace(/\bflight\s*[a-z0-9]+\b/g, ' ')
    .replace(/\bday\s*1\b/g, ' ')
    .replace(/\bday\s*one\b/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  return s
}

/**
 * @param {unknown} name
 * @returns {'day1' | 'later' | 'single'}
 */
export function tournamentFlightKind(name) {
  const s = String(name || '').toLowerCase()
  if (
    /\bday\s*1\s*[a-z]\b/.test(s) ||
    /\bflight\s*[a-z0-9]+\b/.test(s) ||
    /\bday\s*1\b/.test(s) ||
    /\bday\s*one\b/.test(s)
  ) {
    return 'day1'
  }
  if (/\bday\s*[2-9]/.test(s) || /\bfinal\s*day\b/.test(s)) return 'later'
  return 'single'
}

/** @param {unknown} iso */
export function seriesEventDate(iso) {
  if (!iso) return ''
  const raw = String(iso).trim()
  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) return raw.slice(0, 10)
  const d = new Date(raw)
  if (Number.isNaN(d.getTime())) return ''
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/** @param {string} a @param {string} b @param {number} [days] */
export function datesWithinSeriesWindow(a, b, days = TOURNAMENT_SERIES_WINDOW_DAYS) {
  const left = seriesEventDate(a)
  const right = seriesEventDate(b)
  if (!left || !right) return false
  const ms = Math.abs(new Date(`${left}T00:00:00`).getTime() - new Date(`${right}T00:00:00`).getTime())
  if (Number.isNaN(ms)) return false
  return ms <= days * 86400000
}

/**
 * @param {{
 *   venue_name?: string | null,
 *   buy_in?: number | string | null,
 *   game_variant?: string | null,
 *   currency?: string | null,
 *   display_name?: string | null,
 *   tournament_name?: string | null,
 * }} parts
 */
export function buildTournamentSeriesKey(parts = {}) {
  const venue = normalizeTournamentVenue(parts.venue_name)
  const buyIn = Number(parts.buy_in)
  const buyinCents = Number.isFinite(buyIn) && buyIn > 0 ? Math.round(buyIn * 100) : NaN
  const game = normalizeTournamentGameVariantId(String(parts.game_variant || ''))
    .toLowerCase()
    .replace(/\s+/g, ' ')
  const currency =
    String(parts.currency || 'USD')
      .trim()
      .toUpperCase() || 'USD'
  const stem = normalizeTournamentSeriesName(parts.display_name || parts.tournament_name)
  if (!venue || !Number.isFinite(buyinCents) || !stem) return null
  return `${venue}|${buyinCents}|${game}|${currency}|${stem}`
}

/**
 * @param {object | null | undefined} session
 * @param {Record<string, object>} [eventsById]
 */
export function seriesPartsFromSession(session, eventsById = {}) {
  if (!session) return null
  const ev = session.tournament_event_id ? eventsById[session.tournament_event_id] : null
  const buyIn = Number(session.buy_in) || Number(ev?.buy_in) || 0
  return {
    venue_name: session.venue_name || ev?.venue_name || '',
    buy_in: buyIn,
    game_variant: session.game_variant || ev?.game_variant || null,
    currency: session.currency || ev?.currency || 'USD',
    display_name: session.tournament_name || ev?.display_name || null,
    tournament_name: session.tournament_name || ev?.display_name || null,
    event_date: seriesEventDate(session.start_at) || seriesEventDate(ev?.event_date),
  }
}

/** @param {object | null | undefined} event */
export function seriesPartsFromEvent(event) {
  if (!event) return null
  return {
    venue_name: event.venue_name || '',
    buy_in: Number(event.buy_in) || 0,
    game_variant: event.game_variant || null,
    currency: event.currency || 'USD',
    display_name: event.display_name || null,
    tournament_name: event.display_name || null,
    event_date: seriesEventDate(event.event_date),
  }
}

/**
 * @param {object | null | undefined} session
 * @param {Record<string, object>} [eventsById]
 */
export function seriesKeyFromSession(session, eventsById = {}) {
  const parts = seriesPartsFromSession(session, eventsById)
  return parts ? buildTournamentSeriesKey(parts) : null
}

/**
 * @param {object | null | undefined} a
 * @param {object | null | undefined} b
 * @param {Record<string, object>} [eventsById]
 */
export function sessionsInSameSeries(a, b, eventsById = {}) {
  if (!a || !b) return false
  if (a.id && b.id && a.id === b.id) return true
  const pa = seriesPartsFromSession(a, eventsById)
  const pb = seriesPartsFromSession(b, eventsById)
  if (!pa || !pb) return false
  const ka = buildTournamentSeriesKey(pa)
  const kb = buildTournamentSeriesKey(pb)
  if (!ka || !kb || ka !== kb) return false
  return datesWithinSeriesWindow(pa.event_date, pb.event_date)
}

/**
 * @param {object | null | undefined} session
 * @param {object | null | undefined} event
 * @param {Record<string, object>} [eventsById]
 */
export function sessionInSameSeriesAsEvent(session, event, eventsById = {}) {
  if (!session || !event) return false
  if (session.tournament_event_id && session.tournament_event_id === event.id) return true
  const pa = seriesPartsFromSession(session, eventsById)
  const pb = seriesPartsFromEvent(event)
  if (!pa || !pb) return false
  const ka = buildTournamentSeriesKey(pa)
  const kb = buildTournamentSeriesKey(pb)
  if (!ka || !kb || ka !== kb) return false
  return datesWithinSeriesWindow(pa.event_date, pb.event_date)
}

/**
 * Day 2+ continuation does not add a bullet. Day 1 / unlabeled MTT does.
 * @param {object | null | undefined} session
 * @param {Record<string, object>} [eventsById]
 */
export function sessionCountsSeriesBullets(session, eventsById = {}) {
  if (!session || (session.session_type && session.session_type !== 'tournament')) return false
  const parts = seriesPartsFromSession(session, eventsById)
  const kind = tournamentFlightKind(parts?.display_name || parts?.tournament_name)
  if (kind === 'later') return false
  const buyIn = Number(session.buy_in) || 0
  const reentries = Number(session.reentries) || 0
  return buyIn > 0.005 || reentries > 0
}

/**
 * @param {object | null | undefined} session
 * @param {Record<string, object>} [eventsById]
 */
export function sessionSeriesBulletCount(session, eventsById = {}) {
  if (!sessionCountsSeriesBullets(session, eventsById)) return 0
  return swapBulletCount({
    bullets: session.bullets,
    reentries: session.reentries,
    totalBuyIn: session.buy_in,
    faceBuyIn: session.buy_in,
  })
}

/**
 * @param {object | null | undefined} anchor
 * @param {object[]} sessions
 * @param {Record<string, object>} [eventsById]
 */
export function seriesSessionsFor(anchor, sessions, eventsById = {}) {
  if (!anchor) return []
  const list = Array.isArray(sessions) ? sessions : []
  return list.filter(
    (s) =>
      s &&
      s.session_type === 'tournament' &&
      s.status !== 'cancelled' &&
      sessionsInSameSeries(anchor, s, eventsById),
  )
}

/**
 * Bullets already fired in other flights of this event (not this session).
 * @param {object | null | undefined} anchor
 * @param {object[]} sessions
 * @param {Record<string, object>} [eventsById]
 */
export function priorSeriesBulletCount(anchor, sessions, eventsById = {}) {
  const anchorId = anchor?.id || null
  return seriesSessionsFor(anchor, sessions, eventsById)
    .filter((s) => !anchorId || s.id !== anchorId)
    .reduce((n, s) => n + sessionSeriesBulletCount(s, eventsById), 0)
}

/**
 * Total Day-1-style bullets across the series, including this session.
 * @param {object | null | undefined} anchor
 * @param {object[]} sessions
 * @param {Record<string, object>} [eventsById]
 */
export function seriesTotalBulletCount(anchor, sessions, eventsById = {}) {
  return seriesSessionsFor(anchor, sessions, eventsById).reduce(
    (n, s) => n + sessionSeriesBulletCount(s, eventsById),
    0,
  )
}

/**
 * Already-fired bullets that a new swap should skip (current bullet stays in).
 * Always this-bullet-forward … no include-previous option.
 * @param {object | null | undefined} anchor
 * @param {object[]} sessions
 * @param {Record<string, object>} [eventsById]
 */
export function defaultExcludePriorBullets(anchor, sessions, eventsById = {}) {
  const priorOther = priorSeriesBulletCount(anchor, sessions, eventsById)
  const firedThis = sessionSeriesBulletCount(anchor, eventsById)
  const priorThis = Math.max(0, firedThis - 1)
  return priorOther + priorThis
}

/**
 * Day 1 bust is not a final series result … they may fire another flight.
 * @param {object | null | undefined} session
 * @param {Record<string, object>} [eventsById]
 */
export function seriesResultReadyAfterSession(session, eventsById = {}) {
  if (!session) return false
  if (session.cash_out == null || session.cash_out === '') return false
  const prize = (Number(session.cash_out) || 0) + (Number(session.bounty_winnings) || 0)
  const parts = seriesPartsFromSession(session, eventsById)
  const kind = tournamentFlightKind(parts?.display_name || parts?.tournament_name)
  if (kind === 'day1' && prize <= 0) return false
  return true
}

/**
 * Best series result for swap settle (sum prizes, best finish, any cash).
 * @param {object[]} seriesSessions
 */
export function aggregateSeriesSwapResult(seriesSessions) {
  const list = Array.isArray(seriesSessions) ? seriesSessions : []
  let buyIn = 0
  let prize = 0
  let face = 0
  let finish = null
  let tableSize = null
  let cashed = false
  for (const s of list) {
    if (!s || s.cash_out == null || s.cash_out === '') continue
    buyIn += Number(s.buy_in) || 0
    buyIn += Number(s.rebuy_amount) || 0
    buyIn += Number(s.addon_amount) || 0
    const p = (Number(s.cash_out) || 0) + (Number(s.bounty_winnings) || 0)
    prize += p
    if (p > 0) cashed = true
    const f = Number(s.buy_in)
    if (!face && Number.isFinite(f) && f > 0) face = f
    const place = Number(s.finish_place)
    if (Number.isFinite(place) && place > 0 && (finish == null || place < finish)) {
      finish = place
      tableSize = s.table_size || tableSize
    }
    if (!tableSize) tableSize = s.table_size || null
  }
  return {
    buyIn,
    prize,
    faceBuyIn: face || buyIn,
    cashed,
    finishPlace: finish,
    tableSize,
    bullets: list.reduce((n, s) => n + sessionSeriesBulletCount(s), 0),
  }
}

/**
 * @param {object} swap
 * @param {object[]} sessions
 * @param {Record<string, object>} [eventsById]
 */
export function swapSeriesAnchorSession(swap, sessions, eventsById = {}) {
  const list = Array.isArray(sessions) ? sessions : []
  const creator = list.find((s) => s.id === swap?.creator_session_id)
  if (creator) return creator
  const cp = list.find((s) => s.id === swap?.counterparty_session_id)
  if (cp) return cp
  const ev = swap?.tournament_event_id ? eventsById[swap.tournament_event_id] : null
  if (!ev) return null
  return {
    id: `event:${ev.id}`,
    session_type: 'tournament',
    venue_name: ev.venue_name,
    buy_in: ev.buy_in,
    game_variant: ev.game_variant,
    currency: ev.currency,
    tournament_name: ev.display_name,
    tournament_event_id: ev.id,
    start_at: ev.event_date ? `${ev.event_date}T12:00:00` : null,
  }
}

/**
 * Active series swap belongs on this live/history session even if it was opened on an earlier flight.
 * @param {object} swap
 * @param {object | null | undefined} session
 * @param {object[]} sessions
 * @param {Record<string, object>} [eventsById]
 * @param {string} [userId]
 */
export function swapBelongsOnSession(swap, session, sessions, eventsById = {}, userId = '') {
  if (!swap || !session || swap.status === 'cancelled') return false
  if (swap.creator_session_id === session.id || swap.counterparty_session_id === session.id) {
    return true
  }
  if (userId && swap.creator_user_id !== userId && swap.counterparty_user_id !== userId) {
    return false
  }
  const anchor = swapSeriesAnchorSession(swap, sessions, eventsById)
  if (!anchor) return false
  return sessionsInSameSeries(session, anchor, eventsById)
}
