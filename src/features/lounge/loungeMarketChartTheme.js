/** Light/dark colors for TradingView Lightweight Charts in Lounge. */

import { ColorType } from 'lightweight-charts'

/** Required when `layout.attributionLogo` is false — see Lightweight Charts NOTICE / license. */
export const TRADINGVIEW_CHART_ATTRIBUTION_URL = 'https://www.tradingview.com/'

export function loungeMarketChartIsLight() {
  return typeof document !== 'undefined' && document.documentElement.classList.contains('light')
}

/** @param {boolean} [isLight] */
export function loungeMarketChartTheme(isLight = loungeMarketChartIsLight()) {
  // Tailwind zinc-* is remapped under html.light (see index.css). Use the same
  // surface/text class tokens as dark mode — they invert to readable light UI.
  return {
    layout: {
      background: { type: ColorType.Solid, color: 'transparent' },
      textColor: isLight ? '#71717a' : '#a1a1aa',
      attributionLogo: false,
    },
    grid: {
      vertLines: { visible: false },
      horzLines: { visible: false },
    },
    upColor: isLight ? '#16a34a' : '#22c55e',
    downColor: isLight ? '#dc2626' : '#ef4444',
    cardBg: 'bg-zinc-900/80',
    cardBorder: 'border-zinc-700/60',
    mutedText: 'text-zinc-400',
    priceText: 'text-zinc-50',
  }
}

/** @param {Array<{ t: number, c: number }>} bars */
export function loungeMarketBarsToSeries(bars) {
  if (!Array.isArray(bars) || !bars.length) return []
  const mapped = bars
    .filter((b) => Number.isFinite(b?.t) && Number.isFinite(b?.c))
    .map((b) => ({
      time: Math.floor(b.t > 1e12 ? b.t / 1000 : b.t),
      value: b.c,
    }))
    .sort((a, b) => a.time - b.time)

  /** Lightweight Charts requires strictly ascending unique times. */
  const out = []
  for (const point of mapped) {
    const last = out[out.length - 1]
    if (last && last.time === point.time) {
      last.value = point.value
    } else {
      out.push({ time: point.time, value: point.value })
    }
  }
  return out
}
