/** In-memory + sessionStorage queue so hub → tracker survives the hub close remount. */

import { normalizeSportsBetSource } from './sportsBetSources.js'

const PENDING_KEY = 'edge.sportsBetLog.pending.v1'
const OPEN_EVENT = 'edge-sports-bet-log'
const TTL_MS = 15 * 60 * 1000

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
  const row = {
    ...(prefill && typeof prefill === 'object' ? prefill : {}),
    source: normalizeSportsBetSource(prefill?.source, 'game_hub'),
    at: Date.now(),
  }
  try {
    if (typeof sessionStorage !== 'undefined') {
      sessionStorage.setItem(PENDING_KEY, JSON.stringify(row))
    }
  } catch {
    /* ignore */
  }
  if (typeof window !== 'undefined') {
    const url = new URL(window.location.href)
    url.searchParams.set('tab', 'sports-bets')
    url.searchParams.set('logBet', '1')
    if (row.event_id) url.searchParams.set('event', String(row.event_id))
    window.history.pushState({}, '', `${url.pathname}${url.search}${url.hash}`)
    window.dispatchEvent(new CustomEvent(OPEN_EVENT, { detail: row }))
    window.dispatchEvent(new PopStateEvent('popstate'))
  }
}

/** @returns {SportsBetPrefill | null} */
export function consumeSportsBetLogPending() {
  try {
    if (typeof sessionStorage === 'undefined') return null
    const raw = sessionStorage.getItem(PENDING_KEY)
    if (!raw) return null
    sessionStorage.removeItem(PENDING_KEY)
    const row = JSON.parse(raw)
    if (!(Date.now() - Number(row?.at) < TTL_MS)) return null
    const { at: _at, ...prefill } = row
    return prefill
  } catch {
    return null
  }
}

export function sportsBetLogOpenEventName() {
  return OPEN_EVENT
}

/** Prefill from URL query (share / reload). */
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
