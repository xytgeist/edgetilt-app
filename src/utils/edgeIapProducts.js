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
 * Founding IAP points (web founding × 1.15, next Apple price).
 * StoreKit 2 often omits `introductoryOffer` until the catalog syncs, or when
 * Apple thinks the Apple ID already used the group intro. The card still
 * prints these so we do not sit on list ($22.99) for two hours.
 */
export const SLOTS_EDGE_FOUNDING_IAP_INTROS = {
  'com.edgetilt.app.slots_edge_starter.monthly': {
    introDisplayPrice: '$16.99',
    introPeriodCount: 12,
    introPeriodUnit: 'month',
    introPaymentMode: 'payAsYouGo',
  },
  'com.edgetilt.app.slots_edge_starter.annual': {
    introDisplayPrice: '$189.99',
    introPeriodCount: 1,
    introPeriodUnit: 'year',
    introPaymentMode: 'payAsYouGo',
  },
  'com.edgetilt.app.slots_edge.monthly': {
    introDisplayPrice: '$51.99',
    introPeriodCount: 12,
    introPeriodUnit: 'month',
    introPaymentMode: 'payAsYouGo',
  },
  'com.edgetilt.app.slots_edge.annual': {
    introDisplayPrice: '$569.99',
    introPeriodCount: 1,
    introPeriodUnit: 'year',
    introPaymentMode: 'payAsYouGo',
  },
}

function isTruthyFlag(value) {
  if (value === true) return true
  if (value === 1 || value === '1') return true
  if (typeof value === 'string' && value.trim().toLowerCase() === 'true') return true
  return false
}

function foundingIntroFallback(productId) {
  return SLOTS_EDGE_FOUNDING_IAP_INTROS[String(productId || '').trim()] || null
}

/**
 * @param {Array<{ id?: string, displayPrice?: string }>} products
 * @returns {Map<string, {
 *   id: string,
 *   displayPrice: string,
 *   introDisplayPrice: string,
 *   introFromStoreKit: boolean,
 *   introEligible: boolean,
 *   introPaymentMode: string,
 *   introPeriodUnit: string,
 *   introPeriodCount: number,
 *   introSource: string,
 * }>}
 */
export function indexStoreProductsById(products) {
  const map = new Map()
  for (const row of products || []) {
    const id = String(row?.id || '').trim()
    if (!id) continue
    const storeKitIntro = String(row?.introDisplayPrice || '').trim()
    const fallback = storeKitIntro ? null : foundingIntroFallback(id)
    map.set(id, {
      id,
      displayPrice: String(row?.displayPrice || '').trim(),
      introDisplayPrice: storeKitIntro || fallback?.introDisplayPrice || '',
      introFromStoreKit: Boolean(storeKitIntro),
      introEligible: isTruthyFlag(row?.introEligible),
      introPaymentMode: String(row?.introPaymentMode || fallback?.introPaymentMode || '').trim(),
      introPeriodUnit: String(row?.introPeriodUnit || fallback?.introPeriodUnit || '').trim(),
      introPeriodCount: Number(row?.introPeriodCount) || fallback?.introPeriodCount || 0,
      introSource: String(row?.introSource || (fallback ? 'foundingFallback' : '')).trim(),
    })
  }
  return map
}

function introPrice(product) {
  return String(product?.introDisplayPrice || '').trim()
}

/** StoreKit intro, else founding fallback, else list. Card + iPhone CTA. */
export function iapMarketingStorePrice(product) {
  return introPrice(product) || String(product?.displayPrice || '').trim()
}

/** Same as marketing. Apple's pay sheet is the eligibility source of truth. */
export function iapCustomerDisplayPrice(product) {
  return iapMarketingStorePrice(product)
}

function iapIntroDurationLabel(product) {
  if (!introPrice(product)) return ''
  const mode = String(product.introPaymentMode || '')
  const unit = String(product.introPeriodUnit || '')
  const count = Number(product.introPeriodCount) || 0
  if (mode === 'freeTrial') return 'trial'
  if (unit === 'month') return count > 0 ? `${count} mo` : ''
  if (unit === 'year') return count > 1 ? `${count} yr` : '1 yr'
  if (count > 0 && unit) {
    const plural = count === 1 ? unit : `${unit}s`
    return `${count} ${plural}`
  }
  return ''
}

export function iapIntroStoreLabel(product) {
  if (introPrice(product) && String(product.introPaymentMode || '') === 'freeTrial') {
    return 'App Store · trial'
  }
  return 'App Store'
}

export function iapThenPriceNote(product) {
  const intro = introPrice(product)
  const list = String(product?.displayPrice || '').trim()
  if (!intro || !list || intro === list) return ''
  const duration = iapIntroDurationLabel(product)
  return duration ? `${duration} then ${list}` : `Then ${list}`
}
