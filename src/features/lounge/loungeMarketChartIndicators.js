/**
 * Attach indicators to Advanced market charts; storage + legend.
 * @typedef {{ time: number, value: number }} ChartPoint
 */

import { HistogramSeries, LineSeries, LineStyle, createSeriesMarkers } from 'lightweight-charts'
import { applyMarketChartSubPanePriceScale } from './loungeMarketChartViewMode.js'
import {
  INDICATOR_BY_ID,
  MARKET_CHART_INDICATOR_CATEGORIES,
  MARKET_CHART_INDICATORS,
  listMarketChartIndicatorsByCategory,
} from './loungeMarketChartIndicatorCatalog.js'
import {
  buildOhlcvPoints,
  collectOverlayIndicatorLines,
  computeAccumulationDistributionSeries,
  computeAdxSeries,
  computeAtrBandsSeries,
  computeBollingerSeries,
  computeCciSeries,
  computeDonchianSeries,
  computeEmaSeries,
  computeHmaSeries,
  computeIchimokuSeries,
  computeKeltnerSeries,
  computeMacdSeries,
  computeObvSeries,
  computePsarPoints,
  computeRocSeries,
  computeRsiSeries,
  computeSmaSeries,
  computeStochasticSeries,
  computeSupertrendSeries,
  computeVolumeProfilePocSeries,
  computeVwmaSeries,
  computeWmaSeries,
} from './loungeMarketChartIndicatorMath.js'

export {
  INDICATOR_BY_ID,
  MARKET_CHART_INDICATOR_CATEGORIES,
  MARKET_CHART_INDICATORS,
  listMarketChartIndicatorsByCategory,
} from './loungeMarketChartIndicatorCatalog.js'

export const LOUNGE_MARKET_CHART_INDICATORS_STORAGE_KEY = 'loungeMarketChartIndicators:v1'

/** @returns {Set<string>} */
export function readStoredMarketChartIndicators() {
  if (typeof window === 'undefined') return new Set()
  try {
    const raw = window.localStorage.getItem(LOUNGE_MARKET_CHART_INDICATORS_STORAGE_KEY)
    const parsed = JSON.parse(String(raw || '[]'))
    if (!Array.isArray(parsed)) return new Set()
    return new Set(parsed.filter((id) => typeof id === 'string' && INDICATOR_BY_ID[id]))
  } catch {
    return new Set()
  }
}

/** @param {Set<string>|string[]} active */
export function writeStoredMarketChartIndicators(active) {
  if (typeof window === 'undefined') return
  try {
    const ids = [...active].filter((id) => INDICATOR_BY_ID[id]).sort()
    window.localStorage.setItem(LOUNGE_MARKET_CHART_INDICATORS_STORAGE_KEY, JSON.stringify(ids))
  } catch {
    /* ignore quota / private mode */
  }
}

/**
 * @param {ChartPoint[]} barPoints
 * @param {Array<{ t: number, c: number, o?: number, h?: number, l?: number, v?: number }>} rawBars
 * @param {Set<string>|string[]} activeIds
 */
export function computeMarketChartOverlayLines(barPoints, rawBars, activeIds) {
  return collectOverlayIndicatorLines(barPoints, rawBars || [], activeIds)
}

/** @param {import('lightweight-charts').ISeriesApi} series @param {number[]} levels @param {boolean} [isLight] */
function addOscillatorRefLines(series, levels, isLight = false) {
  const color = isLight ? 'rgba(113, 113, 122, 0.35)' : 'rgba(161, 161, 170, 0.35)'
  for (const price of levels) {
    series.createPriceLine({
      price,
      color,
      lineWidth: 1,
      lineStyle: LineStyle.Dashed,
      lineVisible: true,
      axisLabelVisible: true,
      title: '',
    })
  }
}

/**
 * @param {import('lightweight-charts').IChartApi} chart
 * @param {import('lightweight-charts').ISeriesApi} mainSeries
 * @param {ChartPoint[]} barPoints
 * @param {Array<{ t: number, c: number, o?: number, h?: number, l?: number, v?: number }>} rawBars
 * @param {Set<string>|string[]} activeIds
 * @param {{ isLight?: boolean, panePlan?: import('./loungeMarketChartPanes.js').MarketChartPanePlan }} [opts]
 */
export function attachMarketChartIndicators(chart, mainSeries, barPoints, rawBars, activeIds, opts = {}) {
  const ids = new Set(activeIds)
  /** @type {import('lightweight-charts').ISeriesApi[]} */
  const created = []
  if (!barPoints.length) return created

  const ohlcv = buildOhlcvPoints(rawBars, barPoints)
  const oscPaneById = new Map((opts.panePlan?.oscillatorPanes ?? []).map((row) => [row.id, row.paneIndex]))
  const isLight = opts.isLight ?? false

  const addOverlayLine = (data, color, lineWidth = 1, lineStyle = LineStyle.Solid) => {
    if (!data.length) return
    const series = chart.addSeries(LineSeries, {
      color,
      lineWidth,
      lineStyle,
      priceLineVisible: false,
      lastValueVisible: false,
      crosshairMarkerVisible: false,
      priceFormat: { type: 'price', precision: 2, minMove: 0.01 },
    })
    series.setData(data)
    created.push(series)
  }

  const addOverlayBand = (band, midColor, edgeColor) => {
    addOverlayLine(band.middle, midColor, 1)
    addOverlayLine(band.upper, edgeColor, 1, LineStyle.Dashed)
    addOverlayLine(band.lower, edgeColor, 1, LineStyle.Dashed)
  }

  const attachOscLine = (id, data, color, precision = 2, refLines = []) => {
    const paneIndex = oscPaneById.get(id) ?? 2
    const series = chart.addSeries(
      LineSeries,
      {
        color,
        lineWidth: 1,
        priceLineVisible: false,
        lastValueVisible: true,
        crosshairMarkerVisible: false,
        priceFormat: { type: 'price', precision, minMove: precision === 0 ? 1 : 0.01 },
      },
      paneIndex,
    )
    series.setData(data)
    applyMarketChartSubPanePriceScale(chart, paneIndex, isLight)
    if (refLines.length) addOscillatorRefLines(series, refLines, isLight)
    created.push(series)
    return series
  }

  // MAs
  if (ids.has('sma20')) addOverlayLine(computeSmaSeries(barPoints, 20), '#f59e0b', 1)
  if (ids.has('sma50')) addOverlayLine(computeSmaSeries(barPoints, 50), '#3b82f6', 1)
  if (ids.has('sma200')) addOverlayLine(computeSmaSeries(barPoints, 200), '#a855f7', 1)
  if (ids.has('ema9')) addOverlayLine(computeEmaSeries(barPoints, 9), '#06b6d4', 1)
  if (ids.has('ema21')) addOverlayLine(computeEmaSeries(barPoints, 21), '#ec4899', 1)
  if (ids.has('wma20')) addOverlayLine(computeWmaSeries(barPoints, 20), '#eab308', 1)
  if (ids.has('hma20')) addOverlayLine(computeHmaSeries(barPoints, 20), '#14b8a6', 1)
  if (ids.has('vwma20')) addOverlayLine(computeVwmaSeries(ohlcv, 20), '#8b5cf6', 1)

  // Volatility
  if (ids.has('bb20')) addOverlayBand(computeBollingerSeries(barPoints, 20, 2), '#94a3b8', '#64748b')
  if (ids.has('keltner20')) addOverlayBand(computeKeltnerSeries(ohlcv, 20, 2), '#64748b', '#475569')
  if (ids.has('donchian20')) addOverlayBand(computeDonchianSeries(ohlcv, 20), '#78716c', '#57534e')
  if (ids.has('atrBands20')) addOverlayBand(computeAtrBandsSeries(ohlcv, 20, 2), '#a8a29e', '#78716c')

  // Volume overlay
  if (ids.has('volProfile50')) {
    addOverlayLine(computeVolumeProfilePocSeries(ohlcv, 50), '#ca8a04', 2)
  }

  // Trend overlays
  if (ids.has('ichimoku')) {
    const ichi = computeIchimokuSeries(ohlcv)
    addOverlayLine(ichi.tenkan, '#6366f1', 1)
    addOverlayLine(ichi.kijun, '#818cf8', 1)
    addOverlayLine(ichi.senkouA, '#a5b4fc', 1, LineStyle.Dashed)
    addOverlayLine(ichi.senkouB, '#c7d2fe', 1, LineStyle.Dashed)
  }
  if (ids.has('psar')) {
    const pts = computePsarPoints(ohlcv)
    if (pts.length) {
      const series = chart.addSeries(LineSeries, {
        color: '#0ea5e9',
        lineVisible: false,
        pointMarkersVisible: false,
        priceLineVisible: false,
        lastValueVisible: false,
        crosshairMarkerVisible: false,
      })
      series.setData(pts.map((p) => ({ time: p.time, value: p.value })))
      createSeriesMarkers(
        series,
        pts.map((p) => ({
          time: p.time,
          position: p.position,
          color: '#0ea5e9',
          shape: 'circle',
          size: 0.5,
        })),
      )
      created.push(series)
    }
  }
  if (ids.has('supertrend10')) {
    addOverlayLine(computeSupertrendSeries(ohlcv, 10, 3), '#10b981', 2)
  }

  // Momentum oscillators
  if (ids.has('rsi14')) {
    attachOscLine('rsi14', computeRsiSeries(barPoints, 14), '#c084fc', 0, [70, 30])
  }
  if (ids.has('stoch14')) {
    const paneIndex = oscPaneById.get('stoch14') ?? 2
    const { kLine, dLine } = computeStochasticSeries(ohlcv, 14, 3, 3)
    const k = chart.addSeries(
      LineSeries,
      {
        color: '#f472b6',
        lineWidth: 1,
        priceLineVisible: false,
        lastValueVisible: true,
        crosshairMarkerVisible: false,
        priceFormat: { type: 'price', precision: 0, minMove: 1 },
      },
      paneIndex,
    )
    k.setData(kLine)
    created.push(k)
    const d = chart.addSeries(
      LineSeries,
      {
        color: '#fb7185',
        lineWidth: 1,
        priceLineVisible: false,
        lastValueVisible: false,
        crosshairMarkerVisible: false,
        priceFormat: { type: 'price', precision: 0, minMove: 1 },
      },
      paneIndex,
    )
    d.setData(dLine)
    created.push(d)
    applyMarketChartSubPanePriceScale(chart, paneIndex, isLight)
    addOscillatorRefLines(k, [80, 20], isLight)
  }
  if (ids.has('macd')) {
    const paneIndex = oscPaneById.get('macd') ?? 2
    const { macdLine, signalLine, histogram } = computeMacdSeries(barPoints)
    const upColor = isLight ? '#16a34a' : '#22c55e'
    const downColor = isLight ? '#dc2626' : '#ef4444'
    const hist = chart.addSeries(HistogramSeries, { priceLineVisible: false, lastValueVisible: false, base: 0 }, paneIndex)
    hist.setData(
      histogram.map((p) => ({
        time: p.time,
        value: p.value,
        color: p.value >= 0 ? upColor : downColor,
      })),
    )
    created.push(hist)
    applyMarketChartSubPanePriceScale(chart, paneIndex, isLight)
    const macd = chart.addSeries(
      LineSeries,
      {
        color: '#38bdf8',
        lineWidth: 1,
        priceLineVisible: false,
        lastValueVisible: true,
        crosshairMarkerVisible: false,
        priceFormat: { type: 'price', precision: 2, minMove: 0.01 },
      },
      paneIndex,
    )
    macd.setData(macdLine)
    created.push(macd)
    const signal = chart.addSeries(
      LineSeries,
      {
        color: '#fb923c',
        lineWidth: 1,
        priceLineVisible: false,
        lastValueVisible: false,
        crosshairMarkerVisible: false,
        priceFormat: { type: 'price', precision: 2, minMove: 0.01 },
      },
      paneIndex,
    )
    signal.setData(signalLine)
    created.push(signal)
  }
  if (ids.has('cci20')) attachOscLine('cci20', computeCciSeries(ohlcv, 20), '#fb7185', 0, [100, -100])
  if (ids.has('roc12')) attachOscLine('roc12', computeRocSeries(barPoints, 12), '#2dd4bf', 2, [0])

  // Volume oscillators
  if (ids.has('obv')) attachOscLine('obv', computeObvSeries(ohlcv), '#84cc16', 0)
  if (ids.has('ad')) attachOscLine('ad', computeAccumulationDistributionSeries(ohlcv), '#65a30d', 0)

  // Trend oscillators
  if (ids.has('adx14')) attachOscLine('adx14', computeAdxSeries(ohlcv, 14), '#f97316', 0, [25])

  return created
}

/** @typedef {{ label: string, color: string, dashed?: boolean }} MarketIndicatorLegendItem */

/** Colors/lines drawn on chart for one indicator (for selector legend). */
export function marketIndicatorLegendItems(indId, isLight = false) {
  const upColor = isLight ? '#16a34a' : '#22c55e'
  const downColor = isLight ? '#dc2626' : '#ef4444'
  switch (indId) {
    case 'bb20':
    case 'keltner20':
    case 'donchian20':
    case 'atrBands20':
      return /** @type {MarketIndicatorLegendItem[]} */ ([
        { label: 'Mid', color: '#94a3b8' },
        { label: 'Bands', color: '#64748b', dashed: true },
      ])
    case 'ichimoku':
      return /** @type {MarketIndicatorLegendItem[]} */ ([
        { label: 'Tenkan', color: '#6366f1' },
        { label: 'Kijun', color: '#818cf8' },
        { label: 'Span A/B', color: '#a5b4fc', dashed: true },
      ])
    case 'stoch14':
      return /** @type {MarketIndicatorLegendItem[]} */ ([
        { label: '%K', color: '#f472b6' },
        { label: '%D', color: '#fb7185' },
      ])
    case 'macd':
      return /** @type {MarketIndicatorLegendItem[]} */ ([
        { label: 'MACD', color: '#38bdf8' },
        { label: 'Signal', color: '#fb923c' },
        { label: 'Hist +', color: upColor },
        { label: 'Hist −', color: downColor },
      ])
    default: {
      const ind = INDICATOR_BY_ID[indId]
      if (!ind) return []
      return [{ label: ind.label, color: ind.color || '#94a3b8' }]
    }
  }
}

/** Flat legend rows for all active indicators (dropdown + on-chart legend). */
export function listActiveIndicatorLegend(activeIds, isLight = false) {
  const order = new Map(MARKET_CHART_INDICATORS.map((row, i) => [row.id, i]))
  const ids = [...activeIds].sort((a, b) => (order.get(a) ?? 99) - (order.get(b) ?? 99))
  /** @type {Array<MarketIndicatorLegendItem & { key: string }>} */
  const out = []
  for (const id of ids) {
    const def = INDICATOR_BY_ID[id]
    if (!def) continue
    const items = marketIndicatorLegendItems(id, isLight)
    if (items.length === 1 && items[0].label === def.label) {
      out.push({ key: id, ...items[0] })
      continue
    }
    for (const item of items) {
      out.push({ key: `${id}-${item.label}`, label: `${def.label} ${item.label}`, ...item })
    }
  }
  return out
}
