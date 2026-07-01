/**
 * Slots Edge list prices (USD) — product spec in docs/access-tiers.md §5.1.
 * Stripe Price IDs live in Supabase Edge secrets, not here.
 */

export const SLOTS_EDGE_STARTER_MONTHLY_USD = 14
export const SLOTS_EDGE_FULL_MONTHLY_USD = 42
export const SLOTS_EDGE_FULL_ANNUAL_USD = 420

/** Early subscriber promo: 10% off first 12 billing months (Stripe coupon). */
export const SLOTS_EDGE_EARLY_BIRD_PERCENT_OFF = 10
export const SLOTS_EDGE_EARLY_BIRD_DURATION_MONTHS = 12

/** @param {number} listUsd @param {number} [percentOff] */
export function applyPercentOff(listUsd, percentOff = SLOTS_EDGE_EARLY_BIRD_PERCENT_OFF) {
  const n = Number(listUsd)
  if (!Number.isFinite(n) || n <= 0) return 0
  const pct = Number(percentOff)
  if (!Number.isFinite(pct) || pct <= 0) return n
  return Math.round(n * (1 - pct / 100) * 100) / 100
}

export const SLOTS_EDGE_EARLY_BIRD = {
  starterMonthlyUsd: applyPercentOff(SLOTS_EDGE_STARTER_MONTHLY_USD),
  fullMonthlyUsd: applyPercentOff(SLOTS_EDGE_FULL_MONTHLY_USD),
  fullAnnualUsd: applyPercentOff(SLOTS_EDGE_FULL_ANNUAL_USD),
}

/** @param {number} usd */
export function formatUsdMonthly(usd) {
  const n = Number(usd)
  if (!Number.isFinite(n)) return ''
  return n % 1 === 0 ? `$${n}/mo` : `$${n.toFixed(2)}/mo`
}

/** @param {number} usd */
export function formatUsdAnnual(usd) {
  const n = Number(usd)
  if (!Number.isFinite(n)) return ''
  return n % 1 === 0 ? `$${n}/yr` : `$${n.toFixed(2)}/yr`
}
