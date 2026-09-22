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

/** Left rail under Settings. Its own list, not the phone list. */
export const QUICK_LINK_MAX_IPAD = 6

/**
 * Same gate as `useIpadAuthStage`. Tall tablet only (auth column, portrait screen titles).
 * Phone landscape uses the rail / split gates below, not this.
 */
export const IPAD_SHELL_QUERY = '(min-width: 768px) and (min-height: 700px) and (pointer: coarse)'

/** Tall iPad landscape only. Unused in app code … prefer `SLOTS_LANDSCAPE_SPLIT_QUERY`. */
export const IPAD_LANDSCAPE_QUERY =
  '(orientation: landscape) and (min-width: 768px) and (min-height: 700px) and (pointer: coarse)'

/**
 * Slots / Poker / Lounge / Chat two-column split. Includes phone landscape (short height).
 * Keeps pointer:coarse so desktop mouse layouts stay phone/desktop column.
 */
export const SLOTS_LANDSCAPE_SPLIT_QUERY =
  '(orientation: landscape) and (min-width: 640px) and (pointer: coarse)'

/**
 * Left Lounge rail (Home / Search / Chat / …).
 * iPad shell, or any landscape phone/tablet that passes the slots landscape gate.
 * Auth stage stays on `IPAD_SHELL_QUERY` so short phones keep the card auth layout.
 */
export const IPAD_NAV_RAIL_QUERY = `${IPAD_SHELL_QUERY}, ${SLOTS_LANDSCAPE_SPLIT_QUERY}`

/** Short landscape ... shrink tools cards. iPad height stays roomy. */
export const SLOTS_LANDSCAPE_COMPACT_QUERY =
  '(orientation: landscape) and (max-height: 520px) and (pointer: coarse)'

/** True when the left nav rail is up (iPad shell or phone/tablet landscape). */
export function isNavRailLayout() {
  return typeof window !== 'undefined' && window.matchMedia(IPAD_NAV_RAIL_QUERY).matches
}

export function quickLinkCap() {
  // Rail layouts get the tablet pin cap (phone landscape included). Portrait phone stays at 2.
  if (isNavRailLayout()) return QUICK_LINK_MAX_IPAD
  return QUICK_LINK_MAX
}

export const QUICK_LINKS_STORAGE_KEY = 'lvsp:quickLinks:v1'

/** Rail layouts (iPad + phone landscape). Portrait phone title-bar pins stay on the phone key. */
export const QUICK_LINKS_STORAGE_KEY_IPAD = 'lvsp:quickLinks:ipad:v1'

/** @param {string | null | undefined} id */
export function isQuickLinkId(id) {
  return Boolean(id && QUICK_LINK_BY_ID[/** @type {QuickLinkId} */ (id)])
}
