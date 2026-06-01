/** @typedef {'calculators' | 'offers' | 'bankroll' | 'logbook' | 'guides' | 'chat'} QuickLinkId */

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
    requiresSlotsEdge: true,
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
    requiresSlotsEdge: true,
  },
  {
    id: 'chat',
    label: 'Chat',
    tab: 'chat',
  },
]

/** @type {Record<QuickLinkId, QuickLinkDestination>} */
export const QUICK_LINK_BY_ID = Object.fromEntries(
  QUICK_LINK_DESTINATIONS.map(d => [d.id, d]),
)

export const QUICK_LINK_MAX = 2

export const QUICK_LINKS_STORAGE_KEY = 'lvsp:quickLinks:v1'

/** @param {string | null | undefined} id */
export function isQuickLinkId(id) {
  return Boolean(id && QUICK_LINK_BY_ID[/** @type {QuickLinkId} */ (id)])
}
