/** Sellable Edge vertical slugs - stable internal IDs (`{vertical}-edge`). */
export const PRODUCT_SLOTS_EDGE = 'slots-edge'
/** Weekly guide drop + starter pack; see docs/access-tiers.md §5.2 */
export const PRODUCT_SLOTS_EDGE_STARTER = 'slots-edge-starter'
export const PRODUCT_SPORTS_EDGE = 'sports-edge'
export const PRODUCT_CRYPTO_EDGE = 'crypto-edge'

/** Plans that grant full guide library + tool unlocks (legacy `slots-edge` slug). */
export const SLOTS_EDGE_FULL_PLAN_SLUGS = new Set([PRODUCT_SLOTS_EDGE])

export const EDGE_PRODUCTS = [
  {
    slug: PRODUCT_SLOTS_EDGE_STARTER,
    displayName: 'Slots Edge Starter',
    description: 'Starter guide pack plus a new random premium guide drop every week.',
    billingRole: 'starter',
  },
  {
    slug: PRODUCT_SLOTS_EDGE,
    displayName: 'Slots Edge',
    description: 'Full AP guide library, all calculators, bankroll, logbook, and calendar OCR.',
    billingRole: 'full',
  },
  {
    slug: PRODUCT_SPORTS_EDGE,
    displayName: 'Sports Edge',
    description: 'Sports betting intel (coming soon).',
  },
  {
    slug: PRODUCT_CRYPTO_EDGE,
    displayName: 'Crypto Edge',
    description: 'Crypto insider intel (coming soon).',
  },
]

/** @param {Record<string, { active?: boolean }> | null | undefined} entitlements */
export function hasEntitlement(entitlements, productSlug) {
  if (!productSlug || !entitlements) return false
  return Boolean(entitlements[productSlug]?.active)
}

/** @param {Record<string, { active?: boolean }> | null | undefined} entitlements */
export function hasSlotsEdge(entitlements) {
  return hasEntitlement(entitlements, PRODUCT_SLOTS_EDGE)
}

/** @param {Record<string, { active?: boolean }> | null | undefined} entitlements */
export function hasSlotsEdgeStarter(entitlements) {
  return hasEntitlement(entitlements, PRODUCT_SLOTS_EDGE_STARTER)
}

export function productDisplayName(slug) {
  return EDGE_PRODUCTS.find((p) => p.slug === slug)?.displayName || slug
}
