/** American ↔ implied probability helpers (mirrors loungeBotOddsCaption.ts). */

export function americanToImplied(price) {
  const p = Number(price)
  if (!Number.isFinite(p) || p === 0) return 0
  if (p > 0) return 100 / (p + 100)
  return Math.abs(p) / (Math.abs(p) + 100)
}

export function impliedToAmerican(prob) {
  const p = Number(prob)
  if (!Number.isFinite(p) || p <= 0 || p >= 1) return 0
  if (p >= 0.5) return Math.round((-100 * p) / (1 - p))
  return Math.round((100 * (1 - p)) / p)
}

export function calcNetUnits(price, won) {
  if (!won) return -1
  const p = Number(price)
  if (!Number.isFinite(p)) return -1
  if (p > 0) return Math.round((p / 100) * 100) / 100
  return Math.round((100 / Math.abs(p)) * 100) / 100
}
