/** In-memory + sessionStorage queue so hub → tracker survives the hub close remount. */

import { normalizeSportsBetSource } from './sportsBetSources.js'
import {
  LOUNGE_SPORTS_GAME_PARAM,
  clearLoungeSportsGamePending,
  normalizeLoungeSportsHubFilter,
  readLoungeSportsGameIdFromLocation,
  requestLoungeSportsGameOpen,
  requestLoungeSportsHubOpen,
} from '../lounge/loungeSportsHubNav.js'

const PENDING_KEY = 'edge.sportsBetLog.pending.v1'
const RETURN_KEY = 'edge.sportsBetTracker.return.v1'
const OPEN_EVENT = 'edge-sports-bet-log'
const TTL_MS = 15 * 60 * 1000

/** Survives hub unmount even if sessionStorage is blocked. */
let memoryPending = null

function stripPendingMeta(row) {
  if (!row || typeof row !== 'object') return null
  if (!(Date.now() - Number(row.at) < TTL_MS)) return null
  const { at: _at, ...prefill } = row
  return prefill
}

/** Page to reopen when Bet Tracker back / X is pressed (Sports Hub, game hub, …). */
let memoryReturn = null

function writeReturn(row) {
  memoryReturn = row
  try {
    if (typeof sessionStorage !== 'undefined') {
      sessionStorage.setItem(RETURN_KEY, JSON.stringify(row))
    }
  } catch {
    /* ignore */
  }
}

function readStoredReturn() {
  try {
    if (typeof sessionStorage === 'undefined') return null
    const raw = sessionStorage.getItem(RETURN_KEY)
    if (!raw) return null
    return JSON.parse(raw)
  } catch {
    return null
  }
}

function consumeSportsBetReturn() {
  const mem = memoryReturn
  memoryReturn = null
  const stored = readStoredReturn()
  try {
    if (typeof sessionStorage !== 'undefined') sessionStorage.removeItem(RETURN_KEY)
  } catch {
    /* ignore */
  }
  const row = mem && typeof mem === 'object' ? mem : stored
  if (!row || typeof row !== 'object') return null
  if (!(Date.now() - Number(row.at) < TTL_MS)) return null
  return row
}

/**
 * Snapshot the current SPA page before `tab=sports-bets` so close can restore it.
 * @param {{ hubFilter?: string, gameId?: string }} [extra]
 */
export function rememberSportsBetReturn(extra = {}) {
  if (typeof window === 'undefined') return
  const url = new URL(window.location.href)
  if ((url.searchParams.get('tab') || '').trim() === 'sports-bets') return
  const gameId = String(extra.gameId || readLoungeSportsGameIdFromLocation() || '').trim()
  const hubRaw = String(extra.hubFilter || '').trim()
  writeReturn({
    href: `${url.pathname}${url.search}${url.hash}`,
    tab: (url.searchParams.get('tab') || '').trim() || 'home',
    hubFilter: hubRaw ? normalizeLoungeSportsHubFilter(hubRaw) : null,
    gameId: gameId || null,
    at: Date.now(),
  })
}

function applySportsBetReturn(row) {
  const url = new URL(window.location.href)
  try {
    const ret = new URL(String(row.href || '/'), window.location.origin)
    if (ret.origin === window.location.origin) {
      url.pathname = ret.pathname || '/'
      url.search = ret.search || ''
      url.hash = ret.hash || ''
    }
  } catch {
    /* keep current origin */
  }
  url.searchParams.delete('logBet')
  url.searchParams.delete('betTools')
  const tab = String(row.tab || '').trim()
  if ((url.searchParams.get('tab') || '').trim() === 'sports-bets') {
    if (tab && tab !== 'sports-bets') url.searchParams.set('tab', tab)
    else url.searchParams.delete('tab')
  }
  if (row.gameId) url.searchParams.set(LOUNGE_SPORTS_GAME_PARAM, row.gameId)
  window.history.pushState({}, '', `${url.pathname}${url.search}${url.hash}`)
  if (row.hubFilter) requestLoungeSportsHubOpen(row.hubFilter)
  else if (row.gameId) requestLoungeSportsGameOpen(row.gameId)
  window.dispatchEvent(new PopStateEvent('popstate'))
}

function writePending(row) {
  memoryPending = row
  try {
    if (typeof sessionStorage !== 'undefined') {
      sessionStorage.setItem(PENDING_KEY, JSON.stringify(row))
    }
  } catch {
    /* ignore */
  }
}

function readStoredPending() {
  try {
    if (typeof sessionStorage === 'undefined') return null
    const raw = sessionStorage.getItem(PENDING_KEY)
    if (!raw) return null
    return JSON.parse(raw)
  } catch {
    return null
  }
}

/**
 * @typedef {{
 *   event_id?: string,
 *   sport_key?: string,
 *   sport_label?: string,
 *   home_team?: string,
 *   away_team?: string,
 *   commence_time?: string,
 *   book?: string,
 *   market?: string,
 *   side?: string,
 *   line?: number | string | null,
 *   odds?: number | string | null,
 *   selection_label?: string,
 *   source?: 'manual' | 'game_hub' | 'odds_cell' | 'slip' | 'csv',
 * }} SportsBetPrefill
 */

/** @param {SportsBetPrefill | null | undefined} prefill */
export function requestSportsBetLog(prefill) {
  const incoming = prefill && typeof prefill === 'object' ? prefill : {}
  const { hub_filter: hubFilterFromPrefill, hubFilter, ...rest } = incoming
  const row = {
    ...rest,
    source: normalizeSportsBetSource(incoming.source, 'game_hub'),
    at: Date.now(),
  }
  rememberSportsBetReturn({
    gameId: row.event_id,
    hubFilter: hubFilterFromPrefill || hubFilter,
  })
  writePending(row)
  clearLoungeSportsGamePending()
  if (typeof window !== 'undefined') {
    const url = new URL(window.location.href)
    url.searchParams.set('tab', 'sports-bets')
    url.searchParams.set('logBet', '1')
    // Keep event_id in sessionStorage. `?game=` would reopen Sports Hub; `?event=` is unused chrome.
    url.searchParams.delete(LOUNGE_SPORTS_GAME_PARAM)
    url.searchParams.delete('event')
    window.history.pushState({}, '', `${url.pathname}${url.search}${url.hash}`)
    window.dispatchEvent(new CustomEvent(OPEN_EVENT, { detail: row }))
    window.dispatchEvent(new PopStateEvent('popstate'))
  }
}

export function clearSportsBetLogPending() {
  memoryPending = null
  try {
    if (typeof sessionStorage !== 'undefined') sessionStorage.removeItem(PENDING_KEY)
  } catch {
    /* ignore */
  }
}

/** Open the tracker tab without a log composer (Sports Hub door). */
export function openSportsBetTracker(opts = {}) {
  if (typeof window === 'undefined') return
  rememberSportsBetReturn(opts)
  clearSportsBetLogPending()
  const url = new URL(window.location.href)
  url.searchParams.set('tab', 'sports-bets')
  url.searchParams.delete('logBet')
  url.searchParams.delete('betTools')
  url.searchParams.delete(LOUNGE_SPORTS_GAME_PARAM)
  url.searchParams.delete('event')
  window.history.pushState({}, '', `${url.pathname}${url.search}${url.hash}`)
  window.dispatchEvent(new PopStateEvent('popstate'))
}

/** Open tracker with the Tools sheet (`betTools=1` or a tool id). */
export function openSportsBetTools(tool = '1', opts = {}) {
  if (typeof window === 'undefined') return
  rememberSportsBetReturn(opts)
  clearSportsBetLogPending()
  const url = new URL(window.location.href)
  url.searchParams.set('tab', 'sports-bets')
  url.searchParams.set('betTools', String(tool || '1').trim() || '1')
  url.searchParams.delete('logBet')
  url.searchParams.delete(LOUNGE_SPORTS_GAME_PARAM)
  url.searchParams.delete('event')
  window.history.pushState({}, '', `${url.pathname}${url.search}${url.hash}`)
  window.dispatchEvent(new PopStateEvent('popstate'))
}

export function sportsBetToolsFromSearch(params) {
  if (!params || typeof params.get !== 'function') return ''
  return String(params.get('betTools') || '').trim()
}

export function closeSportsBetTracker() {
  if (typeof window === 'undefined') return
  clearSportsBetLogPending()
  const ret = consumeSportsBetReturn()
  if (ret) {
    applySportsBetReturn(ret)
    return
  }
  const url = new URL(window.location.href)
  url.searchParams.delete('tab')
  url.searchParams.delete('logBet')
  url.searchParams.delete('betTools')
  url.searchParams.delete(LOUNGE_SPORTS_GAME_PARAM)
  url.searchParams.delete('event')
  window.history.pushState({}, '', `${url.pathname}${url.search}${url.hash}`)
  window.dispatchEvent(new PopStateEvent('popstate'))
}

export function isSportsBetTrackerSearch(params) {
  if (!params || typeof params.get !== 'function') return false
  const tab = (params.get('tab') || '').trim()
  return tab === 'sports-bets' || Boolean((params.get('logBet') || '').trim())
}

/** @returns {SportsBetPrefill | null} */
export function consumeSportsBetLogPending() {
  const mem = memoryPending
  memoryPending = null
  const stored = readStoredPending()
  try {
    if (typeof sessionStorage !== 'undefined') sessionStorage.removeItem(PENDING_KEY)
  } catch {
    /* ignore */
  }
  return stripPendingMeta(mem) || stripPendingMeta(stored)
}

export function sportsBetLogOpenEventName() {
  return OPEN_EVENT
}

/** Prefill from URL query (share / reload). */
export function isUsefulSportsBetPrefill(prefill) {
  if (!prefill || typeof prefill !== 'object') return false
  return Boolean(
    (prefill.book && String(prefill.book).trim())
    || (prefill.odds != null && String(prefill.odds).trim() !== '')
    || (prefill.line != null && String(prefill.line).trim() !== '')
    || (prefill.selection_label && String(prefill.selection_label).trim())
    || (prefill.market && String(prefill.market) !== 'spread')
    || (prefill.side && String(prefill.side) !== 'home'),
  )
}

export function sportsBetPrefillFromSearchParams(params) {
  if (!params || typeof params.get !== 'function') return null
  if (!params.get('logBet')) return null
  return {
    event_id: (params.get('event') || '').trim() || undefined,
    sport_key: (params.get('sport') || '').trim() || undefined,
    sport_label: (params.get('sportLabel') || '').trim() || undefined,
    home_team: (params.get('home') || '').trim() || undefined,
    away_team: (params.get('away') || '').trim() || undefined,
    commence_time: (params.get('commence') || '').trim() || undefined,
    book: (params.get('book') || '').trim() || undefined,
    market: (params.get('market') || '').trim() || undefined,
    side: (params.get('side') || '').trim() || undefined,
    line: params.get('line') != null && params.get('line') !== '' ? params.get('line') : undefined,
    odds: params.get('odds') != null && params.get('odds') !== '' ? params.get('odds') : undefined,
    selection_label: (params.get('selection') || '').trim() || undefined,
    source: 'game_hub',
  }
}
