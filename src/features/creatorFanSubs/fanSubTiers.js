/** Preset creator fan sub tiers — docs/entitlements-matrix.md §5 */

/** EdgeTilt Connect application_fee_percent on fan checkout (must match Edge `fanSubTiers.ts`). */
export const CREATOR_FAN_PLATFORM_FEE_PERCENT = 20
export const CREATOR_FAN_CREATOR_SHARE_PERCENT = 100 - CREATOR_FAN_PLATFORM_FEE_PERCENT

export const CREATOR_FAN_TIER_KEYS = [
  'fan-tier-499',
  'fan-tier-999',
  'fan-tier-1999',
  'fan-tier-4999',
  'fan-tier-9999',
  'fan-tier-14999',
  'fan-tier-24999',
]

/**
 * App Store US list = web MSRP × 1.15, then the next Apple price point
 * (same rule as Edge Pro $9.99 → $11.49). Product ids stay on web cents.
 */
export function fanTierIapUsdFromWeb(webUsd) {
  const n = Number(webUsd)
  if (!Number.isFinite(n) || n <= 0) return 0
  return Math.round(n * 1.15 * 100) / 100
}

/** @type {Record<string, { msrpCents: number, iapUsd: number, label: string, iapLabel: string }>} */
export const CREATOR_FAN_TIER_DISPLAY = {
  'fan-tier-499': { msrpCents: 499, iapUsd: 5.79, label: '$4.99/mo', iapLabel: '$5.79' },
  'fan-tier-999': { msrpCents: 999, iapUsd: 11.49, label: '$9.99/mo', iapLabel: '$11.49' },
  'fan-tier-1999': { msrpCents: 1999, iapUsd: 22.99, label: '$19.99/mo', iapLabel: '$22.99' },
  'fan-tier-4999': { msrpCents: 4999, iapUsd: 57.99, label: '$49.99/mo', iapLabel: '$57.99' },
  'fan-tier-9999': { msrpCents: 9999, iapUsd: 114.99, label: '$99.99/mo', iapLabel: '$114.99' },
  'fan-tier-14999': { msrpCents: 14999, iapUsd: 172.99, label: '$149.99/mo', iapLabel: '$172.99' },
  'fan-tier-24999': { msrpCents: 24999, iapUsd: 289.99, label: '$249.99/mo', iapLabel: '$289.99' },
}

export function formatFanTierLabel(tierKey) {
  return CREATOR_FAN_TIER_DISPLAY[tierKey]?.label ?? tierKey
}
