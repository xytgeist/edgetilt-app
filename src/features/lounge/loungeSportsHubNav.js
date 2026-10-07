/** Pending Sports Hub / NFL Hub open from AppShell hamburger (Lounge provider may not be mounted yet). */

export const LOUNGE_SPORTS_HUB_OPEN_EVENT = 'lounge:sports-hub-open'
export const LOUNGE_SPORTS_HUB_PENDING_KEY = 'loungeSportsHubPending:v1'

/** All sports on the current slate. */
export const LOUNGE_SPORTS_HUB_FILTER_ALL = 'all'
/** NFL week window (same filter as per-game hub sibling pills). */
export const LOUNGE_SPORTS_HUB_FILTER_NFL = 'americanfootball_nfl'
/** CFB week window (Thu–Mon; no Fantasy tab in the per-game hub). */
export const LOUNGE_SPORTS_HUB_FILTER_CFB = 'americanfootball_ncaaf'
/** NHL short slate (yesterday + today + tomorrow PT). */
export const LOUNGE_SPORTS_HUB_FILTER_NHL = 'icehockey_nhl'
/** NBA short slate (yesterday + today + tomorrow PT). */
export const LOUNGE_SPORTS_HUB_FILTER_NBA = 'basketball_nba'
/** MLB short slate (yesterday + today + tomorrow PT). */
export const LOUNGE_SPORTS_HUB_FILTER_MLB = 'baseball_mlb'
/** MLS short slate (yesterday + today + tomorrow PT). */
export const LOUNGE_SPORTS_HUB_FILTER_MLS = 'soccer_usa_mls'
/** Golf Tour tournaments (ESPN cards … not Odds matchups). */
export const LOUNGE_SPORTS_HUB_FILTER_PGA = 'golf_pga'

/**
 * @param {string} [filter]
 * @returns {string}
 */
export function normalizeLoungeSportsHubFilter(filter) {
  const raw = String(filter || '').trim().toLowerCase()
  if (!raw || raw === LOUNGE_SPORTS_HUB_FILTER_ALL) return LOUNGE_SPORTS_HUB_FILTER_ALL
  // ncaaf before nfl … "americanfootball_ncaaf" must not be treated as NFL.
  if (raw === 'cfb' || raw === 'ncaaf' || raw.includes('ncaaf')) return LOUNGE_SPORTS_HUB_FILTER_CFB
  if (raw === 'nfl' || raw.includes('nfl')) return LOUNGE_SPORTS_HUB_FILTER_NFL
  if (raw === 'nhl' || raw.includes('icehockey_nhl') || raw.includes('hockey')) {
    return LOUNGE_SPORTS_HUB_FILTER_NHL
  }
  if (raw === 'nba' || raw.includes('basketball_nba')) return LOUNGE_SPORTS_HUB_FILTER_NBA
  if (raw === 'mlb' || raw.includes('baseball_mlb')) return LOUNGE_SPORTS_HUB_FILTER_MLB
  if (raw === 'mls' || raw.includes('soccer_usa_mls')) return LOUNGE_SPORTS_HUB_FILTER_MLS
  if (raw === 'pga' || raw === 'golf' || raw.startsWith('golf_') || (raw.includes('golf') && raw.includes('pga'))) {
    return LOUNGE_SPORTS_HUB_FILTER_PGA
  }
  return String(filter || '').trim()
}

/**
 * Queue + broadcast open. AppShell calls this after `setTab('home')`.
 * @param {string} [filter]
 */
export function requestLoungeSportsHubOpen(filter = LOUNGE_SPORTS_HUB_FILTER_ALL) {
  const next = normalizeLoungeSportsHubFilter(filter)
  try {
    if (typeof sessionStorage !== 'undefined') {
      sessionStorage.setItem(LOUNGE_SPORTS_HUB_PENDING_KEY, next)
    }
  } catch {
    /* ignore */
  }
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(LOUNGE_SPORTS_HUB_OPEN_EVENT, { detail: { filter: next } }))
  }
}

/** Shared game link: `/?tab=home&game=<event id>` opens that game's hub. */
export const LOUNGE_SPORTS_GAME_PARAM = 'game'
export const LOUNGE_SPORTS_GAME_OPEN_EVENT = 'lounge:sports-game-open'
export const LOUNGE_SPORTS_GAME_PENDING_KEY = 'loungeSportsGamePending:v1'

/**
 * @param {{ id?: string|number } | null} game
 * @param {string} origin
 */
export function loungeSportsGameShareUrl(game, origin) {
  const id = String(game?.id || '').trim()
  if (!id) return `${origin}/?tab=home`
  // `/lounge/g/:id` is a Vercel OG page (live scoreboard card) that forwards to the SPA; Vite dev has no route.
  if (/\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(origin)) {
    return `${origin}/?tab=home&${LOUNGE_SPORTS_GAME_PARAM}=${encodeURIComponent(id)}`
  }
  return `${origin}/lounge/g/${encodeURIComponent(id)}`
}

/** A shared game link waits this long for sign-in / sign-up (email confirm can land in another tab). */
const LOUNGE_SPORTS_GAME_PENDING_TTL_MS = 6 * 60 * 60 * 1000

/**
 * Queue a game hub open + broadcast to a mounted Lounge. localStorage (not session) so it survives the
 * sign-in sheet, a new account's email-confirm tab, and the app remount after auth.
 * @param {string} eventId
 */
export function requestLoungeSportsGameOpen(eventId) {
  const id = String(eventId || '').trim()
  if (!id) return
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(LOUNGE_SPORTS_GAME_PENDING_KEY, JSON.stringify({ id, at: Date.now() }))
    }
  } catch {
    /* ignore */
  }
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(LOUNGE_SPORTS_GAME_OPEN_EVENT, { detail: { eventId: id } }))
  }
}

/** Pending shared-game id (kept until a signed-in hub actually opens), or null once expired. */
export function peekLoungeSportsGamePending() {
  try {
    if (typeof localStorage === 'undefined') return null
    const raw = localStorage.getItem(LOUNGE_SPORTS_GAME_PENDING_KEY)
    if (!raw) return null
    const row = JSON.parse(raw)
    const id = String(row?.id || '').trim()
    if (!id || !(Date.now() - Number(row?.at) < LOUNGE_SPORTS_GAME_PENDING_TTL_MS)) {
      localStorage.removeItem(LOUNGE_SPORTS_GAME_PENDING_KEY)
      return null
    }
    return id
  } catch {
    return null
  }
}

export function clearLoungeSportsGamePending() {
  try {
    if (typeof localStorage !== 'undefined') localStorage.removeItem(LOUNGE_SPORTS_GAME_PENDING_KEY)
  } catch {
    /* ignore */
  }
}

/**
 * Read + clear pending filter. Returns null when none.
 * @returns {string | null}
 */
export function consumeLoungeSportsHubPending() {
  try {
    if (typeof sessionStorage === 'undefined') return null
    const raw = sessionStorage.getItem(LOUNGE_SPORTS_HUB_PENDING_KEY)
    if (!raw) return null
    sessionStorage.removeItem(LOUNGE_SPORTS_HUB_PENDING_KEY)
    return normalizeLoungeSportsHubFilter(raw)
  } catch {
    return null
  }
}

/** Currently-open game hub … survives WKWebView process death (URL + localStorage). */
export const LOUNGE_SPORTS_GAME_OPEN_KEY = 'loungeSportsGameOpen:v1'

export function readLoungeSportsGameIdFromLocation() {
  try {
    if (typeof window === 'undefined') return null
    const id = new URLSearchParams(window.location.search || '').get(LOUNGE_SPORTS_GAME_PARAM)
    return String(id || '').trim() || null
  } catch {
    return null
  }
}

export function peekRememberedLoungeSportsGameOpen() {
  try {
    if (typeof localStorage === 'undefined') return null
    const raw = localStorage.getItem(LOUNGE_SPORTS_GAME_OPEN_KEY)
    if (!raw) return null
    const row = JSON.parse(raw)
    const id = String(row?.id || '').trim()
    if (!id) {
      localStorage.removeItem(LOUNGE_SPORTS_GAME_OPEN_KEY)
      return null
    }
    return id
  } catch {
    return null
  }
}

/**
 * Keep `?tab=home&game=` on the SPA URL while a hub is open so a WKWebView
 * restore / process-kill reload reopens the same game instead of Lounge home.
 */
export function syncOpenLoungeSportsGame(eventId) {
  const id = String(eventId || '').trim()
  try {
    if (typeof localStorage !== 'undefined') {
      if (id) localStorage.setItem(LOUNGE_SPORTS_GAME_OPEN_KEY, JSON.stringify({ id, at: Date.now() }))
      else localStorage.removeItem(LOUNGE_SPORTS_GAME_OPEN_KEY)
    }
  } catch {
    /* ignore */
  }
  if (typeof window === 'undefined') return
  try {
    const u = new URL(window.location.href)
    if (id) {
      if (!u.searchParams.get('tab')) u.searchParams.set('tab', 'home')
      u.searchParams.set(LOUNGE_SPORTS_GAME_PARAM, id)
    } else {
      u.searchParams.delete(LOUNGE_SPORTS_GAME_PARAM)
    }
    const next = `${u.pathname}${u.search}${u.hash}`
    const cur = `${window.location.pathname}${window.location.search}${window.location.hash}`
    if (next !== cur) window.history.replaceState(window.history.state, '', next)
  } catch {
    /* ignore */
  }
}
