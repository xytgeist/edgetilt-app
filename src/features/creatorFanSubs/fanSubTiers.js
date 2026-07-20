/** Preset creator fan sub tiers — docs/entitlements-matrix.md §5 */

export const CREATOR_FAN_TIER_KEYS = [
  'fan-tier-499',
  'fan-tier-999',
  'fan-tier-1999',
  'fan-tier-4999',
  'fan-tier-9999',
]

/** @type {Record<string, { msrpCents: number, label: string }>} */
export const CREATOR_FAN_TIER_DISPLAY = {
  'fan-tier-499': { msrpCents: 499, label: '$4.99/mo' },
  'fan-tier-999': { msrpCents: 999, label: '$9.99/mo' },
  'fan-tier-1999': { msrpCents: 1999, label: '$19.99/mo' },
  'fan-tier-4999': { msrpCents: 4999, label: '$49.99/mo' },
  'fan-tier-9999': { msrpCents: 9999, label: '$99.99/mo' },
}

export function formatFanTierLabel(tierKey) {
  return CREATOR_FAN_TIER_DISPLAY[tierKey]?.label ?? tierKey
}
