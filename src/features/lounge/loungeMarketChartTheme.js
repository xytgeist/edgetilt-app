/** Light/dark colors for TradingView Lightweight Charts in Lounge. */

import { ColorType, CrosshairMode, LineStyle } from 'lightweight-charts'

export function loungeMarketChartIsLight() {
  return typeof document !== 'undefined' && document.documentElement.classList.contains('light')
}

/**
 * Custom LWC color parser. Newer Chromium returns `color(srgb …)` from
 * getComputedStyle, so the library's built-in rgb()/rgba() match fails and
 * throws `Failed to parse color: #a1a1aa` (and similar hex). Parsers receive
 * the original color string.
 *
 * @param {string} color
 * @returns {[number, number, number, number] | null}
 */
export function loungeMarketChartColorParser(color) {
  if (typeof color !== 'string') return null
  const value = color.trim()
  if (!value || value === 'transparent') return null

  const hex8 = /^#([0-9a-f]{8})$/i.exec(value)
  if (hex8) {
    const n = parseInt(hex8[1], 16)
    return [(n >> 24) & 255, (n >> 16) & 255, (n >> 8) & 255, ((n & 255) / 255)]
  }
  const hex6 = /^#([0-9a-f]{6})$/i.exec(value)
  if (hex6) {
    const n = parseInt(hex6[1], 16)
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255, 1]
  }
  const hex3 = /^#([0-9a-f]{3})$/i.exec(value)
  if (hex3) {
    const [r, g, b] = hex3[1].split('')
    return [parseInt(r + r, 16), parseInt(g + g, 16), parseInt(b + b, 16), 1]
  }

  const rgb = /^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)(?:\s*,\s*([\d.]+))?\s*\)$/i.exec(value)
  if (rgb) {
    return [
      Math.round(Number(rgb[1])),
      Math.round(Number(rgb[2])),
      Math.round(Number(rgb[3])),
      rgb[4] != null ? Number(rgb[4]) : 1,
    ]
  }

  const srgb = /^color\(\s*srgb\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)(?:\s*\/\s*([\d.]+))?\s*\)$/i.exec(value)
  if (srgb) {
    return [
      Math.round(Number(srgb[1]) * 255),
      Math.round(Number(srgb[2]) * 255),
      Math.round(Number(srgb[3]) * 255),
      srgb[4] != null ? Number(srgb[4]) : 1,
    ]
  }

  return null
}

/** @param {boolean} [isLight] @param {{ attributionLogo?: boolean }} [opts] */
export function loungeMarketChartTheme(isLight = loungeMarketChartIsLight(), { attributionLogo = false } = {}) {
  // Tailwind zinc-* is remapped under html.light (see index.css). Use the same
  // surface/text class tokens as dark mode - they invert to readable light UI.
  return {
    layout: {
      background: { type: ColorType.Solid, color: 'transparent' },
      textColor: isLight ? '#71717a' : '#a1a1aa',
      attributionLogo,
      colorParsers: [loungeMarketChartColorParser],
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

/** Normalize closes to % change from the first bar (for multi-symbol strip compare). */
export function loungeMarketBarsToPercentSeries(bars) {
  if (!Array.isArray(bars) || !bars.length) return []
  const sorted = bars
    .filter((b) => Number.isFinite(b?.t) && Number.isFinite(b?.c))
    .slice()
    .sort((a, b) => a.t - b.t)
  const base = sorted[0]?.c
  if (!Number.isFinite(base) || base === 0) return loungeMarketBarsToSeries(bars)

  const mapped = sorted.map((b) => ({
    time: Math.floor(b.t > 1e12 ? b.t / 1000 : b.t),
    value: ((b.c - base) / base) * 100,
  }))

  const out = []
  for (const point of mapped) {
    const last = out[out.length - 1]
    if (last && last.time === point.time) {
      last.value = point.value
    } else {
      out.push(point)
    }
  }
  return out
}

/** Crosshair - both axes; labels only in advanced modal. */
export function loungeMarketChartCrosshairOptions(isAdvancedView = false, isLight = loungeMarketChartIsLight()) {
  const color = isLight ? 'rgba(113, 113, 122, 0.55)' : 'rgba(161, 161, 170, 0.55)'
  const labelBackgroundColor = isLight ? '#fafafa' : '#18181b'
  const line = {
    color,
    width: 1,
    style: LineStyle.Dashed,
    labelBackgroundColor,
  }
  return {
    mode: CrosshairMode.Normal,
    vertLine: { visible: true, labelVisible: isAdvancedView, ...line },
    horzLine: { visible: true, labelVisible: isAdvancedView, ...line },
  }
}
