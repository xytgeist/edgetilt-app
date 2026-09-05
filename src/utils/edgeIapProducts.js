/**
 * App Store product ids. Must match App Store Connect + `EdgeStoreKitManager.swift`.
 * Fan tiers are one SKU per price, not per creator.
 */

import {
  PRODUCT_EDGE_PRO,
  PRODUCT_SLOTS_EDGE,
  PRODUCT_SLOTS_EDGE_LIFETIME,
  PRODUCT_SLOTS_EDGE_STARTER,
} from '../features/billing/edgeProducts.js'
import { CREATOR_FAN_TIER_KEYS } from '../features/creatorFanSubs/fanSubTiers.js'

/** @typedef {'monthly' | 'annual'} IapPriceInterval */

export const EDGE_IAP_PLATFORM_PRODUCT_IDS = {
  [`${PRODUCT_SLOTS_EDGE_STARTER}:monthly`]: 'com.edgetilt.app.slots_edge_starter.monthly',
  [`${PRODUCT_SLOTS_EDGE_STARTER}:annual`]: 'com.edgetilt.app.slots_edge_starter.annual',
  [`${PRODUCT_SLOTS_EDGE}:monthly`]: 'com.edgetilt.app.slots_edge.monthly',
  [`${PRODUCT_SLOTS_EDGE}:annual`]: 'com.edgetilt.app.slots_edge.annual',
  [PRODUCT_SLOTS_EDGE_LIFETIME]: 'com.edgetilt.app.slots_edge_lifetime',
  [`${PRODUCT_EDGE_PRO}:monthly`]: 'com.edgetilt.app.edge_pro.monthly',
}

/** @type {Record<string, string>} */
export const EDGE_IAP_FAN_TIER_PRODUCT_IDS = Object.fromEntries(
  CREATOR_FAN_TIER_KEYS.map((tierKey) => [
    tierKey,
    `com.edgetilt.app.${tierKey.replace(/-/g, '_')}.monthly`,
  ]),
)

/** Legacy alias used by older callers. */
export const EDGE_IAP_PRODUCT_IDS = EDGE_IAP_PLATFORM_PRODUCT_IDS

/**
 * @param {string} productSlug
 * @param {IapPriceInterval} [priceInterval]
 * @returns {string | null}
 */
export function iapProductIdForPlan(productSlug, priceInterval = 'monthly') {
  if (productSlug === PRODUCT_SLOTS_EDGE_LIFETIME) {
    return EDGE_IAP_PLATFORM_PRODUCT_IDS[PRODUCT_SLOTS_EDGE_LIFETIME] || null
  }
  return EDGE_IAP_PLATFORM_PRODUCT_IDS[`${productSlug}:${priceInterval}`] || null
}

/** @param {string} fanTierKey */
export function iapProductIdForFanTier(fanTierKey) {
  return EDGE_IAP_FAN_TIER_PRODUCT_IDS[String(fanTierKey || '').trim()] || null
}

export function allKnownIapProductIds() {
  return [
    ...Object.values(EDGE_IAP_PLATFORM_PRODUCT_IDS),
    ...Object.values(EDGE_IAP_FAN_TIER_PRODUCT_IDS),
  ]
}

/**
 * @param {Array<{ id?: string, displayPrice?: string }>} products
 * @returns {Map<string, { id: string, displayPrice: string }>}
 */
export function indexStoreProductsById(products) {
  const map = new Map()
  for (const row of products || []) {
    const id = String(row?.id || '').trim()
    if (!id) continue
    map.set(id, {
      id,
      displayPrice: String(row?.displayPrice || '').trim(),
    })
  }
  return map
}
