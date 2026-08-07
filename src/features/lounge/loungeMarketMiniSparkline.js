/**
 * Apple Stocks-style mini sparkline helpers:
 * - dashed line at session/window open (tint = open vs previous close)
 * - BaselineSeries: green above open / red below, fill toward open
 */

/** @param {Array<{ t: number, c: number, o?: number }> | null | undefined} bars */
export function sortMarketBarsForMini(bars) {
  if (!Array.isArray(bars) || !bars.length) return []
  return bars
    .filter((b) => Number.isFinite(b?.t) && Number.isFinite(b?.c))
    .map((b) => ({
      ...b,
      t: Math.floor(b.t > 1e12 ? b.t / 1000 : b.t),
    }))
    .sort((a, b) => a.t - b.t)
}

/**
 * Previous regular-session close from quote day-change fields.
 * @param {{ price?: number, change?: number, change_pct?: number } | null | undefined} quote
 */
export function previousCloseFromQuote(quote) {
  const price = Number(quote?.price)
  const change = Number(quote?.change)
  if (Number.isFinite(price) && Number.isFinite(change)) return price - change
  const pct = Number(quote?.change_pct)
  if (Number.isFinite(price) && Number.isFinite(pct) && pct !== -100) {
    return price / (1 + pct / 100)
  }
  return null
}

/**
 * @param {Array<{ t: number, c: number, o?: number }> | null | undefined} bars
 * @param {{ price?: number, change?: number, change_pct?: number } | null | undefined} quote
 * @param {{ compareMode?: boolean, assetClass?: string }} [opts]
 */
export function resolveMiniSparklineStyle(bars, quote, opts = {}) {
  const sorted = sortMarketBarsForMini(bars)
  if (sorted.length < 2) {
    return {
      openPrice: null,
      sparkUp: true,
      openUp: true,
      fromSec: null,
      toSec: null,
    }
  }

  const first = sorted[0]
  const last = sorted[sorted.length - 1]
  const openPrice = Number.isFinite(first.o) ? Number(first.o) : Number(first.c)
  const lastClose = Number(last.c)
  const quotePrice = Number(quote?.price)
  const current = Number.isFinite(quotePrice) ? quotePrice : lastClose
  const prevClose = previousCloseFromQuote(quote)
  const openUp = Number.isFinite(prevClose) ? openPrice >= prevClose : true
  const sparkUp = opts.compareMode ? current >= openPrice || lastClose >= openPrice : current >= openPrice

  const fromSec = first.t
  const sessionSpanSec = opts.assetClass === 'crypto' ? 86400 : Math.floor(6.5 * 3600)
  const toSec = Math.max(last.t + 1, fromSec + sessionSpanSec)

  return {
    openPrice: Number.isFinite(openPrice) ? openPrice : null,
    /** Price-line level in series units (0 for % compare mode). */
    openLinePrice: opts.compareMode ? 0 : Number.isFinite(openPrice) ? openPrice : null,
    sparkUp,
    openUp,
    fromSec,
    toSec,
  }
}

/** @param {boolean} up @param {boolean} isLight @param {'line' | 'top' | 'bottom' | 'dash'} part */
export function miniSparklineColor(up, isLight, part) {
  if (part === 'dash') {
    if (up) return isLight ? 'rgba(22, 163, 74, 0.85)' : 'rgba(34, 197, 94, 0.9)'
    return isLight ? 'rgba(220, 38, 38, 0.85)' : 'rgba(239, 68, 68, 0.9)'
  }
  if (part === 'line') {
    return up ? (isLight ? '#16a34a' : '#22c55e') : isLight ? '#dc2626' : '#ef4444'
  }
  if (part === 'top') {
    if (up) return isLight ? 'rgba(22, 163, 74, 0.22)' : 'rgba(34, 197, 94, 0.28)'
    return isLight ? 'rgba(220, 38, 38, 0.22)' : 'rgba(239, 68, 68, 0.28)'
  }
  if (up) return isLight ? 'rgba(22, 163, 74, 0)' : 'rgba(34, 197, 94, 0)'
  return isLight ? 'rgba(220, 38, 38, 0)' : 'rgba(239, 68, 68, 0)'
}

/**
 * BaselineSeries options: green above `basePrice`, red below; fills toward the open.
 * @param {boolean} isLight
 * @param {number} basePrice
 */
export function miniBaselineSeriesOptions(isLight, basePrice) {
  const green = isLight ? '#16a34a' : '#22c55e'
  const red = isLight ? '#dc2626' : '#ef4444'
  return {
    baseValue: { type: 'price', price: basePrice },
    topLineColor: green,
    topFillColor1: isLight ? 'rgba(22, 163, 74, 0.30)' : 'rgba(34, 197, 94, 0.34)',
    topFillColor2: isLight ? 'rgba(22, 163, 74, 0.02)' : 'rgba(34, 197, 94, 0.02)',
    bottomLineColor: red,
    bottomFillColor1: isLight ? 'rgba(220, 38, 38, 0.02)' : 'rgba(239, 68, 68, 0.02)',
    bottomFillColor2: isLight ? 'rgba(220, 38, 38, 0.30)' : 'rgba(239, 68, 68, 0.34)',
    lineWidth: 2,
    priceLineVisible: false,
    lastValueVisible: false,
    crosshairMarkerVisible: false,
  }
}
