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

/** Remove two-way book vig so model fair prob compares to normalized market. */
export function devigTwoWay(impA, impB) {
  const a = Number(impA)
  const b = Number(impB)
  const sum = a + b
  if (!Number.isFinite(sum) || sum <= 0) return { impA: 0.5, impB: 0.5 }
  return { impA: a / sum, impB: b / sum }
}

export function devigAmericanTwoWay(oddsA, oddsB) {
  return devigTwoWay(americanToImplied(oddsA), americanToImplied(oddsB))
}

/** Parse American / decimal ML prices from CSV (Kaggle scarekrow f_*_odds). */
export function parseMarketOdds(raw) {
  const text = String(raw ?? '').trim()
  if (!text) return null

  if (/^[+-]?\d+(\.\d+)?$/.test(text)) {
    const n = Number(text)
    if (!Number.isFinite(n) || n === 0) return null
    // Decimal prices (e.g. 1.91, 2.50)
    if (Math.abs(n) > 0 && Math.abs(n) < 20 && !String(text).startsWith('+') && !String(text).startsWith('-')) {
      if (n <= 1) return null
      const prob = 1 / n
      return impliedToAmerican(prob)
    }
    return Math.round(n)
  }

  return null
}
