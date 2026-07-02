/**
 * Slots Edge MSRP list prices (USD) — product spec in docs/access-tiers.md §5.1.
 * Stripe Price IDs live in Supabase Edge secrets, not here.
 */

export const SLOTS_EDGE_STARTER_MONTHLY_USD = 19.99
export const SLOTS_EDGE_STARTER_ANNUAL_USD = 219.99
export const SLOTS_EDGE_FULL_MONTHLY_USD = 59.99
export const SLOTS_EDGE_FULL_ANNUAL_USD = 660
export const SLOTS_EDGE_LIFETIME_USD = 1699

/** Founding member promo: 25% off (monthly subs × 12 months; annual + lifetime once at checkout). */
export const SLOTS_EDGE_FOUNDING_PERCENT_OFF = 25
export const SLOTS_EDGE_FOUNDING_MONTHLY_DURATION_MONTHS = 12

/** @deprecated use SLOTS_EDGE_FOUNDING_PERCENT_OFF */
export const SLOTS_EDGE_EARLY_BIRD_PERCENT_OFF = SLOTS_EDGE_FOUNDING_PERCENT_OFF

/** @deprecated use SLOTS_EDGE_FOUNDING_MONTHLY_DURATION_MONTHS */
export const SLOTS_EDGE_EARLY_BIRD_DURATION_MONTHS = SLOTS_EDGE_FOUNDING_MONTHLY_DURATION_MONTHS

/** @param {number} listUsd @param {number} [percentOff] */
export function applyPercentOff(listUsd, percentOff = SLOTS_EDGE_FOUNDING_PERCENT_OFF) {
  const n = Number(listUsd)
  if (!Number.isFinite(n) || n <= 0) return 0
  const pct = Number(percentOff)
  if (!Number.isFinite(pct) || pct <= 0) return n
  return Math.round(n * (1 - pct / 100) * 100) / 100
}

export const SLOTS_EDGE_FOUNDING = {
  starterMonthlyUsd: applyPercentOff(SLOTS_EDGE_STARTER_MONTHLY_USD),
  starterAnnualUsd: applyPercentOff(SLOTS_EDGE_STARTER_ANNUAL_USD),
  fullMonthlyUsd: applyPercentOff(SLOTS_EDGE_FULL_MONTHLY_USD),
  fullAnnualUsd: applyPercentOff(SLOTS_EDGE_FULL_ANNUAL_USD),
  lifetimeUsd: applyPercentOff(SLOTS_EDGE_LIFETIME_USD),
}

/** @deprecated use SLOTS_EDGE_FOUNDING */
export const SLOTS_EDGE_EARLY_BIRD = SLOTS_EDGE_FOUNDING

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

/** @param {number} usd */
export function formatUsdOneTime(usd) {
  const n = Number(usd)
  if (!Number.isFinite(n)) return ''
  return n % 1 === 0 ? `$${n}` : `$${n.toFixed(2)}`
}
