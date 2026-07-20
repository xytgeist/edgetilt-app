/** Preset creator fan sub tiers — docs/entitlements-matrix.md §5 */

export const CREATOR_FAN_PLATFORM_FEE_PERCENT = 30

export const CREATOR_FAN_TIER_KEYS = [
  'fan-tier-499',
  'fan-tier-999',
  'fan-tier-1999',
  'fan-tier-4999',
  'fan-tier-9999',
] as const

export type CreatorFanTierKey = (typeof CREATOR_FAN_TIER_KEYS)[number]

const MSRP_CENTS: Record<CreatorFanTierKey, number> = {
  'fan-tier-499': 499,
  'fan-tier-999': 999,
  'fan-tier-1999': 1999,
  'fan-tier-4999': 4999,
  'fan-tier-9999': 9999,
}

export function isCreatorFanTierKey(value: string): value is CreatorFanTierKey {
  return (CREATOR_FAN_TIER_KEYS as readonly string[]).includes(value)
}

/** Edge secret: STRIPE_PRICE_FAN_TIER_499, etc. */
export function stripePriceSecretForFanTier(tierKey: CreatorFanTierKey): string {
  const suffix = tierKey.replace(/^fan-tier-/, '').toUpperCase()
  const envKey = `STRIPE_PRICE_FAN_TIER_${suffix}`
  const priceId = Deno.env.get(envKey)?.trim()
  if (!priceId) {
    throw new Error(`Missing Edge secret ${envKey} for tier "${tierKey}".`)
  }
  return priceId
}

export function msrpCentsForFanTier(tierKey: CreatorFanTierKey): number {
  return MSRP_CENTS[tierKey]
}

export const CREATOR_FAN_BILLING_KIND = 'creator_fan_sub'
