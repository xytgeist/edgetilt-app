/** Sellable Edge vertical slugs - stable internal IDs (`{vertical}-edge`). */
export const PRODUCT_SLOTS_EDGE = 'slots-edge'
export const PRODUCT_SPORTS_EDGE = 'sports-edge'
export const PRODUCT_CRYPTO_EDGE = 'crypto-edge'

export const EDGE_PRODUCTS = [
  {
    slug: PRODUCT_SLOTS_EDGE,
    displayName: 'Slots Edge',
    description: 'AP calculators, guides, bankroll, and calendar OCR.',
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

export function productDisplayName(slug) {
  return EDGE_PRODUCTS.find((p) => p.slug === slug)?.displayName || slug
}
