/** Advanced main-pane Y scale - visible-window candle OHLC only (no overlays). */

import { getMarketChartResolution } from './loungeMarketChartResolution.js'
import { loungeMarketBarsToSeries } from './loungeMarketChartTheme.js'
import { formatMarketChartTimeLabelForResolution } from './loungeMarketChartViewMode.js'
import { computeMarketChartVisibleWindowQuoteFromChart, marketModalChartHighLow } from './loungeMarketChartTypes.js'

function barUnixSec(t) {
  return Math.floor(t > 1e12 ? t / 1000 : t)
}

const ADVANCED_CANDLE_PRICE_SCALE_MARGINS = { top: 0.06, bottom: 0.04 }

/**
 * @param {Array<{ t: number, c: number, o?: number, h?: number, l?: number }>} rawBars
 * @param {{ from: number, to: number } | null | undefined} logicalRange
 */
export function sliceMarketBarsForLogicalRange(rawBars, logicalRange) {
  if (!Array.isArray(rawBars) || !rawBars.length) return []
  if (!logicalRange || !Number.isFinite(logicalRange.from) || !Number.isFinite(logicalRange.to)) {
    return rawBars
  }
  const fromIdx = Math.max(0, Math.floor(logicalRange.from))
  const toIdx = Math.min(rawBars.length - 1, Math.ceil(logicalRange.to))
  if (fromIdx > toIdx) return []
  return rawBars.slice(fromIdx, toIdx + 1)
}

/**
 * Min/max price from candle OHLC (or displayed heikin/hollow series) in the visible window.
 * @param {Array<{ t: number, c: number, o?: number, h?: number, l?: number }>} rawBars
 * @param {string} chartType
 * @param {{ from: number, to: number } | null | undefined} logicalRange
 * @returns {{ from: number, to: number } | null}
 */
export function computeVisibleCandlePriceExtents(rawBars, chartType, logicalRange) {
  const visibleBars = sliceMarketBarsForLogicalRange(rawBars, logicalRange)
  if (!visibleBars.length) return null

  const barPoints = loungeMarketBarsToSeries(visibleBars)
  const { high, low } = marketModalChartHighLow(chartType, barPoints, visibleBars)
  if (!Number.isFinite(high?.value) || !Number.isFinite(low?.value)) return null

  return {
    from: Math.min(low.value, high.value),
    to: Math.max(low.value, high.value),
  }
}

/**
 * Fit the main price pane to visible candle OHLC. Ignores overlay indicators.
 * @param {import('lightweight-charts').ISeriesApi} mainSeries
 * @param {import('lightweight-charts').IChartApi} chart
 * @param {Array<{ t: number, c: number, o?: number, h?: number, l?: number }>} rawBars
 * @param {string} chartType
 * @param {{ keepMargins?: boolean }} [opts]
 */
export function applyVisibleCandlePriceRange(mainSeries, chart, rawBars, chartType, opts = {}) {
  if (!mainSeries || !chart || !rawBars?.length) return

  const logicalRange = chart.timeScale().getVisibleLogicalRange()
  const extents = computeVisibleCandlePriceExtents(rawBars, chartType, logicalRange)
  if (!extents) return

  const keepMargins = opts.keepMargins === true
  const { from, to } = extents

  if (from === to) {
    mainSeries.priceScale().applyOptions({
      autoScale: true,
      ...(keepMargins ? {} : { scaleMargins: ADVANCED_CANDLE_PRICE_SCALE_MARGINS }),
    })
    return
  }

  mainSeries.priceScale().applyOptions({
    autoScale: false,
    ...(keepMargins ? {} : { scaleMargins: ADVANCED_CANDLE_PRICE_SCALE_MARGINS }),
  })
  mainSeries.priceScale().setVisibleRange({ from, to })
}

/**
 * Visible chart window as a snapshot header label (resolution + formatted start/end).
 * @param {import('lightweight-charts').IChartApi | null | undefined} chart
 * @param {Array<{ t: number, c: number }>} rawBars
 * @param {string} resolutionId
 * @returns {string}
 */
export function formatMarketChartVisibleTimeRangeLabel(chart, rawBars, resolutionId) {
  if (!chart || !rawBars?.length) return ''

  const visibleBars = sliceMarketBarsForLogicalRange(
    rawBars,
    chart.timeScale().getVisibleLogicalRange(),
  )
  if (!visibleBars.length) return ''

  const startSec = barUnixSec(visibleBars[0].t)
  const endSec = barUnixSec(visibleBars[visibleBars.length - 1].t)
  const startLabel = formatMarketChartTimeLabelForResolution(startSec, resolutionId)
  const endLabel = formatMarketChartTimeLabelForResolution(endSec, resolutionId)
  if (!startLabel) return ''

  const resolutionLabel = getMarketChartResolution(resolutionId).label
  if (!endLabel || startLabel === endLabel) {
    return resolutionLabel ? `${resolutionLabel} · ${startLabel}` : startLabel
  }
  return resolutionLabel
    ? `${resolutionLabel} · ${startLabel} – ${endLabel}`
    : `${startLabel} – ${endLabel}`
}

/**
 * Apply visible candle Y scale after chart layout (setData / fitContent).
 * @param {import('lightweight-charts').ISeriesApi} mainSeries
 * @param {import('lightweight-charts').IChartApi} chart
 * @param {Array<{ t: number, c: number, o?: number, h?: number, l?: number }>} rawBars
 * @param {string} chartType
 * @param {{ keepMargins?: boolean, fitTimeScale?: boolean }} [opts]
 */
export function scheduleVisibleCandlePriceRange(mainSeries, chart, rawBars, chartType, opts = {}) {
  if (!mainSeries || !chart || !rawBars?.length) return

  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      if (opts.fitTimeScale !== false) {
        chart.timeScale().fitContent()
      }
      applyVisibleCandlePriceRange(mainSeries, chart, rawBars, chartType, opts)
    })
  })
}

/**
 * Re-fit main-pane Y scale when the visible time window changes (horizontal pan/zoom).
 * @param {import('lightweight-charts').IChartApi} chart
 * @param {() => { mainSeries: import('lightweight-charts').ISeriesApi | null, rawBars: object[], chartType: string } | null} getContext
 * @param {{ isPinned?: () => boolean, isPanning?: () => boolean, keepMargins?: boolean, onQuote?: (quote: { price: number, change: number, change_pct: number } | null) => void }} [opts]
 */
export function bindVisibleCandlePriceRangeFit(chart, getContext, opts = {}) {
  const isPinned = () => opts.isPinned?.() === true
  const isPanning = () => opts.isPanning?.() === true

  let raf = 0
  const run = () => {
    cancelAnimationFrame(raf)
    raf = requestAnimationFrame(() => {
      const ctx = getContext()
      if (!ctx?.rawBars?.length) return
      if (!isPanning() && !isPinned() && ctx.mainSeries) {
        applyVisibleCandlePriceRange(ctx.mainSeries, chart, ctx.rawBars, ctx.chartType, {
          keepMargins: opts.keepMargins !== false,
        })
      }
      if (typeof opts.onQuote === 'function') {
        opts.onQuote(computeMarketChartVisibleWindowQuoteFromChart(chart, ctx.rawBars, ctx.chartType))
      }
    })
  }

  const handler = () => run()
  const ts = chart.timeScale()
  ts.subscribeVisibleLogicalRangeChange(handler)
  run()

  const unbind = () => {
    cancelAnimationFrame(raf)
    ts.unsubscribeVisibleLogicalRangeChange(handler)
  }

  /** Recompute header quote (e.g. after pan release when the last range RAF ran while still dragging). */
  const refreshQuote = () => run()

  return { unbind, refreshQuote }
}
