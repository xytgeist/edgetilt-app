/** @typedef {'calculators' | 'offers' | 'bankroll' | 'logbook' | 'w2g-scanner' | 'guides' | 'poker-stable' | 'poker-bankroll'} QuickLinkId */

/** @typedef {QuickLinkId} QuickLinkDestinationId */

/**
 * @typedef {{
 *   id: QuickLinkId,
 *   label: string,
 *   tab: string,
 *   requiresSlotsEdge?: boolean,
 *   guidesTabGate?: boolean,
 * }} QuickLinkDestination
 */

/** @type {QuickLinkDestination[]} */
export const QUICK_LINK_DESTINATIONS = [
  {
    id: 'guides',
    label: 'AP Guides',
    tab: 'guides',
    guidesTabGate: true,
  },
  {
    id: 'bankroll',
    label: 'Bankroll Manager',
    tab: 'bankroll',
  },
  {
    id: 'calculators',
    label: 'Calcs',
    tab: 'calculators',
  },
  {
    id: 'offers',
    label: 'Calendar',
    tab: 'offers',
  },
  {
    id: 'logbook',
    label: 'Logbook',
    tab: 'logbook',
  },
  {
    id: 'w2g-scanner',
    label: 'W-2G Scanner',
    tab: 'w2g-scanner',
  },
  {
    id: 'poker-stable',
    label: 'Stable Manager',
    tab: 'poker-stable',
  },
  {
    id: 'poker-bankroll',
    label: 'Poker Bankroll',
    tab: 'poker-bankroll',
  },
]

/** @type {Record<QuickLinkId, QuickLinkDestination>} */
export const QUICK_LINK_BY_ID = Object.fromEntries(
  QUICK_LINK_DESTINATIONS.map(d => [d.id, d]),
)

/** Phone title bar. iPad rail uses `QUICK_LINK_MAX_IPAD`. */
export const QUICK_LINK_MAX = 2

/** Left rail under Settings. Storage keeps this many so a phone session does not drop them. */
export const QUICK_LINK_MAX_IPAD = 6

/**
 * Same gate as `useIpadAuthStage`. Landscape iPhone is wide but short, so it stays on the phone cap.
 */
export const IPAD_SHELL_QUERY = '(min-width: 768px) and (min-height: 700px) and (pointer: coarse)'

export function quickLinkCap() {
  if (typeof window !== 'undefined' && window.matchMedia(IPAD_SHELL_QUERY).matches) {
    return QUICK_LINK_MAX_IPAD
  }
  return QUICK_LINK_MAX
}

export const QUICK_LINKS_STORAGE_KEY = 'lvsp:quickLinks:v1'

/** @param {string | null | undefined} id */
export function isQuickLinkId(id) {
  return Boolean(id && QUICK_LINK_BY_ID[/** @type {QuickLinkId} */ (id)])
}
