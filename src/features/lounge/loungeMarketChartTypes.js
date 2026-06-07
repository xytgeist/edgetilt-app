/**
 * Modal chart display types (feed minis stay sparkline-only).
 */

import { AreaSeries, CandlestickSeries, LineSeries } from 'lightweight-charts'
import { loungeMarketBarsToSeries } from './loungeMarketChartTheme.js'
import { marketBarHasOhlc } from '../../utils/marketBarOhlc.js'

export const LOUNGE_MARKET_CHART_TYPE_STORAGE_KEY = 'loungeMarketChartType:v1'

/** @typedef {'area' | 'line' | 'candle' | 'hollow' | 'heikin'} MarketModalChartTypeId */

/** @type {Array<{ id: MarketModalChartTypeId, label: string }>} */
export const MARKET_MODAL_CHART_TYPES = [
  { id: 'area', label: 'Area' },
  { id: 'line', label: 'Line' },
  { id: 'candle', label: 'Candles' },
  { id: 'hollow', label: 'Hollow candles' },
  { id: 'heikin', label: 'Heikin Ashi' },
]

const CHART_TYPE_BY_ID = Object.fromEntries(MARKET_MODAL_CHART_TYPES.map((row) => [row.id, row]))
const OHLC_CHART_TYPES = new Set(['candle', 'hollow', 'heikin'])

/** @param {MarketModalChartTypeId | string} chartType */
export function marketModalChartTypeUsesOhlc(chartType) {
  return OHLC_CHART_TYPES.has(chartType)
}

/** @param {MarketModalChartTypeId | string} chartType */
export function marketModalChartTypeUsesLineMarkers(chartType) {
  return chartType === 'area' || chartType === 'line'
}

/** @returns {MarketModalChartTypeId} */
export function readStoredMarketChartType() {
  if (typeof window === 'undefined') return 'area'
  try {
    const raw = window.localStorage.getItem(LOUNGE_MARKET_CHART_TYPE_STORAGE_KEY)
    const id = String(raw || '').trim()
    return CHART_TYPE_BY_ID[id] ? /** @type {MarketModalChartTypeId} */ (id) : 'area'
  } catch {
    return 'area'
  }
}

/** @param {MarketModalChartTypeId} chartType */
export function writeStoredMarketChartType(chartType) {
  if (typeof window === 'undefined') return
  if (!CHART_TYPE_BY_ID[chartType]) return
  try {
    window.localStorage.setItem(LOUNGE_MARKET_CHART_TYPE_STORAGE_KEY, chartType)
  } catch {
    /* ignore quota / private mode */
  }
}

/** @param {MarketModalChartTypeId | string} chartType */
export function marketModalChartTypeLabel(chartType) {
  return CHART_TYPE_BY_ID[chartType]?.label || 'Area'
}

/** Real OHLC when present on bars; otherwise close-only → synthetic wickless candles. */
export function loungeMarketBarsToCandlestickSeries(bars) {
  if (!Array.isArray(bars) || !bars.length) return []

  const sorted = bars
    .filter((b) => Number.isFinite(b?.t) && Number.isFinite(b?.c))
    .map((b) => ({
      t: Math.floor(b.t > 1e12 ? b.t / 1000 : b.t),
      c: b.c,
      o: b.o,
      h: b.h,
      l: b.l,
    }))
    .sort((a, b) => a.t - b.t)

  /** @type {Array<{ time: number, open: number, high: number, low: number, close: number }>} */
  const out = []
  let prevClose = sorted[0]?.c

  for (const row of sorted) {
    const time = row.t
    const last = out[out.length - 1]
    if (last && last.time === time) {
      if (marketBarHasOhlc(row)) {
        last.open = row.o
        last.high = row.h
        last.low = row.l
        last.close = row.c
      } else {
        last.close = row.c
        last.high = Math.max(last.open, row.c)
        last.low = Math.min(last.open, row.c)
      }
      prevClose = row.c
      continue
    }

    if (marketBarHasOhlc(row)) {
      out.push({
        time,
        open: row.o,
        high: row.h,
        low: row.l,
        close: row.c,
      })
      prevClose = row.c
      continue
    }

    const close = row.c
    const open = prevClose == null ? close : prevClose
    out.push({
      time,
      open,
      high: Math.max(open, close),
      low: Math.min(open, close),
      close,
    })
    prevClose = close
  }

  return out
}

/** Heikin Ashi OHLC derived from regular candlestick bars. */
export function loungeMarketBarsToHeikinAshiSeries(bars) {
  const candles = loungeMarketBarsToCandlestickSeries(bars)
  if (!candles.length) return []

  /** @type {Array<{ time: number, open: number, high: number, low: number, close: number }>} */
  const out = []
  let prevHaOpen = null
  let prevHaClose = null

  for (const row of candles) {
    const haClose = (row.open + row.high + row.low + row.close) / 4
    const haOpen = prevHaOpen == null ? (row.open + row.close) / 2 : (prevHaOpen + prevHaClose) / 2
    const haHigh = Math.max(row.high, haOpen, haClose)
    const haLow = Math.min(row.low, haOpen, haClose)
    out.push({
      time: row.time,
      open: haOpen,
      high: haHigh,
      low: haLow,
      close: haClose,
    })
    prevHaOpen = haOpen
    prevHaClose = haClose
  }

  return out
}

function ohlcSeriesForChartType(chartType, rawBars) {
  if (chartType === 'heikin') return loungeMarketBarsToHeikinAshiSeries(rawBars)
  if (marketModalChartTypeUsesOhlc(chartType)) return loungeMarketBarsToCandlestickSeries(rawBars)
  return null
}

/**
 * Header/snapshot quote from the visible chart window:
 * price = close of the rightmost visible candle (at the price axis);
 * change = vs open of the leftmost visible candle.
 * @param {Array<{ t: number, c: number, o?: number }>} rawBars
 * @param {{ from: number, to: number } | null | undefined} logicalRange
 * @param {MarketModalChartTypeId | string} [chartType]
 * @returns {{ price: number, change: number, change_pct: number } | null}
 */
export function computeMarketChartVisibleWindowQuote(rawBars, logicalRange, chartType = 'candle') {
  if (!Array.isArray(rawBars) || !rawBars.length || !logicalRange) return null
  if (!Number.isFinite(logicalRange.from) || !Number.isFinite(logicalRange.to)) return null

  const fromIdx = Math.max(0, Math.floor(logicalRange.from))
  const toIdx = Math.min(rawBars.length - 1, Math.ceil(logicalRange.to))
  if (fromIdx > toIdx) return null

  let openBaseline = NaN
  let closePrice = NaN

  if (marketModalChartTypeUsesOhlc(chartType)) {
    const prefix = rawBars.slice(0, toIdx + 1)
    const ohlc = ohlcSeriesForChartType(chartType, prefix)
    if (!ohlc?.length) return null
    const first = ohlc[fromIdx]
    const last = ohlc[Math.min(toIdx, ohlc.length - 1)]
    openBaseline = Number(first?.open)
    closePrice = Number(last?.close)
  } else {
    const firstBar = rawBars[fromIdx]
    const lastBar = rawBars[toIdx]
    openBaseline = Number(firstBar?.o ?? firstBar?.c)
    closePrice = Number(lastBar?.c)
  }

  if (!Number.isFinite(openBaseline) || !Number.isFinite(closePrice) || openBaseline <= 0) return null

  const change = closePrice - openBaseline
  const change_pct = (change / openBaseline) * 100
  return { price: closePrice, change, change_pct }
}

/**
 * @param {import('lightweight-charts').IChartApi | null | undefined} chart
 * @param {Array<{ t: number, c: number, o?: number }>} rawBars
 * @param {MarketModalChartTypeId | string} [chartType]
 */
export function computeMarketChartVisibleWindowQuoteFromChart(chart, rawBars, chartType = 'candle') {
  if (!chart || !rawBars?.length) return null
  return computeMarketChartVisibleWindowQuote(rawBars, chart.timeScale().getVisibleLogicalRange(), chartType)
}

/**
 * @param {MarketModalChartTypeId | string} chartType
 * @param {Array<{ t: number, c: number }>} rawBars
 * @param {Array<{ time: number, value: number }>} barPoints
 */
export function marketModalMainSeriesData(chartType, rawBars, barPoints) {
  const ohlc = ohlcSeriesForChartType(chartType, rawBars)
  if (ohlc) return ohlc
  return barPoints
}

function candleHighLow(candles) {
  let high = null
  let low = null
  for (const row of candles) {
    if (!Number.isFinite(row.high) || !Number.isFinite(row.low)) continue
    if (!high || row.high > high.value) high = { time: row.time, value: row.high }
    if (!low || row.low < low.value) low = { time: row.time, value: row.low }
  }
  return { high, low }
}

/**
 * @param {MarketModalChartTypeId | string} chartType
 * @param {Array<{ time: number, value: number }>} barPoints
 * @param {Array<{ t: number, c: number }>} [rawBars]
 */
export function marketModalChartHighLow(chartType, barPoints, rawBars = []) {
  const ohlc = ohlcSeriesForChartType(chartType, rawBars)
  if (ohlc?.length) return candleHighLow(ohlc)

  let high = null
  let low = null
  for (const point of barPoints || []) {
    const value = Number(point?.value)
    if (!Number.isFinite(value)) continue
    if (!high || value > high.value) high = { time: point.time, value }
    if (!low || value < low.value) low = { time: point.time, value }
  }
  return { high, low }
}

/**
 * @param {import('lightweight-charts').IChartApi} chart
 * @param {MarketModalChartTypeId | string} chartType
 * @param {{
 *   barPoints: Array<{ time: number, value: number }>,
 *   rawBars?: Array<{ t: number, c: number }>,
 *   lineColor: string,
 *   chartUp: boolean,
 *   isLight?: boolean,
 * }} opts
 */
export function attachModalMainChartSeries(chart, chartType, opts) {
  const { barPoints, rawBars = [], lineColor, chartUp, isLight = false } = opts
  const priceFormat = { type: 'price', precision: 2, minMove: 0.01 }
  const common = {
    priceLineVisible: false,
    lastValueVisible: false,
    priceFormat,
  }
  const up = isLight ? '#16a34a' : '#22c55e'
  const down = isLight ? '#dc2626' : '#ef4444'

  if (chartType === 'line') {
    const series = chart.addSeries(LineSeries, {
      color: lineColor,
      lineWidth: 2,
      ...common,
    })
    series.setData(barPoints)
    return series
  }

  if (chartType === 'hollow') {
    const series = chart.addSeries(CandlestickSeries, {
      upColor: 'transparent',
      downColor: 'transparent',
      borderVisible: true,
      borderUpColor: up,
      borderDownColor: down,
      wickUpColor: up,
      wickDownColor: down,
      ...common,
    })
    series.setData(loungeMarketBarsToCandlestickSeries(rawBars))
    return series
  }

  if (chartType === 'heikin') {
    const series = chart.addSeries(CandlestickSeries, {
      upColor: up,
      downColor: down,
      borderVisible: false,
      wickUpColor: up,
      wickDownColor: down,
      ...common,
    })
    series.setData(loungeMarketBarsToHeikinAshiSeries(rawBars))
    return series
  }

  if (chartType === 'candle') {
    const series = chart.addSeries(CandlestickSeries, {
      upColor: up,
      downColor: down,
      borderVisible: false,
      wickUpColor: up,
      wickDownColor: down,
      ...common,
    })
    series.setData(loungeMarketBarsToCandlestickSeries(rawBars))
    return series
  }

  const series = chart.addSeries(AreaSeries, {
    lineColor,
    topColor: chartUp ? 'rgba(34, 197, 94, 0.28)' : 'rgba(239, 68, 68, 0.28)',
    bottomColor: chartUp ? 'rgba(34, 197, 94, 0)' : 'rgba(239, 68, 68, 0)',
    lineWidth: 2,
    ...common,
  })
  if (isLight) {
    series.applyOptions({
      topColor: chartUp ? 'rgba(22, 163, 74, 0.22)' : 'rgba(220, 38, 38, 0.22)',
      bottomColor: chartUp ? 'rgba(22, 163, 74, 0)' : 'rgba(220, 38, 38, 0)',
    })
  }
  series.setData(barPoints)
  return series
}
