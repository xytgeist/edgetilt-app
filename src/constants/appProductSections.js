/** Canonical product areas for app section visit analytics (Monitor + AppShell tracking). */

/** @typedef {{ id: string, label: string, sort: number }} AppProductSection */

/** @type {readonly AppProductSection[]} */
export const APP_PRODUCT_SECTIONS = Object.freeze([
  { id: 'lounge', label: 'Lounge', sort: 1 },
  { id: 'chat', label: 'Chat', sort: 2 },
  { id: 'slots-hub', label: 'Slots hub', sort: 3 },
  { id: 'guides', label: 'Guides', sort: 4 },
  { id: 'calculators', label: 'Calculators', sort: 5 },
  { id: 'bankroll', label: 'Bankroll', sort: 6 },
  { id: 'play-logbook', label: 'Play Logbook', sort: 7 },
  { id: 'offers', label: 'Offers', sort: 8 },
  { id: 'poker-hub', label: 'Poker hub', sort: 9 },
  { id: 'poker-bankroll', label: 'Poker Bankroll', sort: 10 },
  { id: 'poker-stable', label: 'Poker Stable', sort: 11 },
  { id: 'affiliates', label: 'Affiliates', sort: 12 },
  { id: 'creator', label: 'Creator portal', sort: 13 },
])

/** @type {Readonly<Record<string, string>>} */
const TAB_TO_SECTION = Object.freeze({
  home: 'lounge',
  chat: 'chat',
  slots: 'slots-hub',
  poker: 'poker-hub',
  guides: 'guides',
  calculators: 'calculators',
  bankroll: 'bankroll',
  logbook: 'play-logbook',
  offers: 'offers',
  'poker-bankroll': 'poker-bankroll',
  'poker-stable': 'poker-stable',
  affiliates: 'affiliates',
  creator: 'creator',
})

/** @param {string | null | undefined} tab */
export function tabToAppProductSectionId(tab) {
  return TAB_TO_SECTION[String(tab || '').trim()] || null
}

/** @param {string | null | undefined} sectionId */
export function appProductSectionLabel(sectionId) {
  const id = String(sectionId || '').trim()
  return APP_PRODUCT_SECTIONS.find((row) => row.id === id)?.label || id || 'Unknown'
}

/** Ordered ids for Monitor charts (includes sections with zero visits). */
export function appProductSectionIdsOrdered() {
  return APP_PRODUCT_SECTIONS.map((row) => row.id)
}
