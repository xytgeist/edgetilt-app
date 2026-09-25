/** Pending Sports Hub / NFL Hub open from AppShell hamburger (Lounge provider may not be mounted yet). */

export const LOUNGE_SPORTS_HUB_OPEN_EVENT = 'lounge:sports-hub-open'
export const LOUNGE_SPORTS_HUB_PENDING_KEY = 'loungeSportsHubPending:v1'

/** All sports on the current slate. */
export const LOUNGE_SPORTS_HUB_FILTER_ALL = 'all'
/** NFL week window (same filter as per-game hub sibling pills). */
export const LOUNGE_SPORTS_HUB_FILTER_NFL = 'americanfootball_nfl'
/** CFB week window (Thu–Mon; no Fantasy tab in the per-game hub). */
export const LOUNGE_SPORTS_HUB_FILTER_CFB = 'americanfootball_ncaaf'

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
