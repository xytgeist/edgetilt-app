/** Sellable Edge vertical slugs - stable internal IDs (`{vertical}-edge`). */
export const PRODUCT_SLOTS_EDGE = 'slots-edge'
/** Weekly guide drop + starter pack; see docs/access-tiers.md §5.2 */
export const PRODUCT_SLOTS_EDGE_STARTER = 'slots-edge-starter'
/** One-time founding pass; see docs/access-tiers.md §5.3.1 */
export const PRODUCT_SLOTS_EDGE_LIFETIME = 'slots-edge-lifetime'
export const PRODUCT_SPORTS_EDGE = 'sports-edge'
export const PRODUCT_CRYPTO_EDGE = 'crypto-edge'

/** Plans that grant full guide library + tool unlocks (subscription or lifetime). */
export const SLOTS_EDGE_FULL_PLAN_SLUGS = new Set([PRODUCT_SLOTS_EDGE, PRODUCT_SLOTS_EDGE_LIFETIME])

export const EDGE_PRODUCTS = [
  {
    slug: PRODUCT_SLOTS_EDGE_STARTER,
    displayName: 'Slots Edge',
    description: 'Starter guide pack plus a new random premium guide drop every week.',
    billingRole: 'starter',
  },
  {
    slug: PRODUCT_SLOTS_EDGE,
    displayName: 'Slots Edge Pro',
    description: 'Full AP guide library, all calculators, bankroll, logbook, and calendar OCR.',
    billingRole: 'full',
  },
  {
    slug: PRODUCT_SLOTS_EDGE_LIFETIME,
    displayName: 'Slots Edge Lifetime',
    description: 'One-time payment for full Slots access today and future Slots Edge tools we ship.',
    billingRole: 'lifetime',
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
  return (
    hasEntitlement(entitlements, PRODUCT_SLOTS_EDGE) ||
    hasEntitlement(entitlements, PRODUCT_SLOTS_EDGE_LIFETIME)
  )
}

/** @param {Record<string, { active?: boolean }> | null | undefined} entitlements */
export function hasSlotsEdgeLifetime(entitlements) {
  return hasEntitlement(entitlements, PRODUCT_SLOTS_EDGE_LIFETIME)
}

/** @param {Record<string, { active?: boolean }> | null | undefined} entitlements */
export function hasSlotsEdgeStarter(entitlements) {
  return hasEntitlement(entitlements, PRODUCT_SLOTS_EDGE_STARTER)
}

/** Active recurring Pro subscription (`slots-edge`), not lifetime. */
export function hasSlotsEdgePro(entitlements) {
  return hasEntitlement(entitlements, PRODUCT_SLOTS_EDGE)
}

/** @param {Record<string, { price_interval?: string }> | null | undefined} entitlements @param {string} productSlug @returns {'monthly' | 'annual' | null} */
export function entitlementPriceInterval(entitlements, productSlug) {
  const raw = entitlements?.[productSlug]?.price_interval
  return raw === 'monthly' || raw === 'annual' ? raw : null
}

/**
 * When a plan is active but Stripe metadata has not synced yet, assume monthly
 * so subscribe UI can lock the current cadence and pre-select the switch target.
 *
 * @param {'monthly' | 'annual' | null | undefined} interval
 * @param {boolean} planActive
 * @returns {'monthly' | 'annual' | null}
 */
export function resolvedEntitlementBillingInterval(interval, planActive) {
  if (!planActive) return null
  if (interval === 'monthly' || interval === 'annual') return interval
  return 'monthly'
}

export function productDisplayName(slug) {
  return EDGE_PRODUCTS.find((p) => p.slug === slug)?.displayName || slug
}
