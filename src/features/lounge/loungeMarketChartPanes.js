/** TradingView-style multi-pane layout for Advanced market charts (LWC v5). */

import { INDICATOR_BY_ID, listActiveOscillatorIndicators } from './loungeMarketChartIndicatorCatalog.js'
import { MARKET_CHART_VOLUME_PANE_FRACTION } from './loungeMarketChartVolume.js'

/** Height fraction per oscillator pane (RSI, MACD, …). */
export const MARKET_CHART_OSCILLATOR_PANE_FRACTION = 0.14

/** Approximate shared time-axis strip at the bottom of the chart. */
const MARKET_CHART_TIME_AXIS_RESERVE_PX = 34
const MIN_PANE_HEIGHT_PX = 30
/** Separator between stacked panes (matches LWC default). */
const MARKET_CHART_PANE_SEPARATOR_PX = 1

/**
 * @typedef {Object} MarketChartSubPaneAxisTitle
 * @property {string} id
 * @property {string} text
 * @property {number} topPx
 * @property {number} paneIndex
 */

/**
 * @typedef {Object} MarketChartSubPaneAxisTitles
 * @property {number} width
 * @property {MarketChartSubPaneAxisTitle[]} rows
 */

/**
 * @typedef {Object} MarketChartPanePlan
 * @property {number} volumePaneIndex
 * @property {Array<{ id: string, paneIndex: number }>} oscillatorPanes
 * @property {number} oscillatorCount
 */

/** @param {Set<string>|string[]} activeIds */
export function computeMarketChartPanePlan(activeIds) {
  const oscillators = listActiveOscillatorIndicators(activeIds)
  let nextPane = 2
  /** @type {MarketChartPanePlan} */
  const plan = {
    volumePaneIndex: 1,
    oscillatorPanes: oscillators.map((row) => ({
      id: row.id,
      paneIndex: nextPane++,
    })),
    oscillatorCount: oscillators.length,
  }
  return plan
}

/**
 * @param {import('lightweight-charts').IChartApi} chart
 * @param {number} totalHeightPx
 * @param {MarketChartPanePlan} plan
 */
export function applyMarketChartPaneHeights(chart, totalHeightPx, plan) {
  if (!chart || !Number.isFinite(totalHeightPx) || totalHeightPx <= 0) return

  /** @type {number[]} */
  const subHeights = []
  subHeights.push(Math.max(MIN_PANE_HEIGHT_PX, Math.round(totalHeightPx * MARKET_CHART_VOLUME_PANE_FRACTION)))
  const oscFraction =
    plan.oscillatorCount > 0
      ? Math.min(
          MARKET_CHART_OSCILLATOR_PANE_FRACTION,
          0.42 / Math.max(1, plan.oscillatorCount),
        )
      : 0
  for (let i = 0; i < plan.oscillatorCount; i += 1) {
    subHeights.push(Math.max(MIN_PANE_HEIGHT_PX, Math.round(totalHeightPx * oscFraction)))
  }

  const subTotal = subHeights.reduce((sum, h) => sum + h, 0)
  const mainHeight = Math.max(
    MIN_PANE_HEIGHT_PX,
    Math.round(totalHeightPx - subTotal - MARKET_CHART_TIME_AXIS_RESERVE_PX),
  )

  const panes = chart.panes?.() ?? []
  if (panes[0]) panes[0].setHeight(mainHeight)
  for (let i = 0; i < subHeights.length; i += 1) {
    const pane = panes[i + 1]
    if (pane) pane.setHeight(subHeights[i])
  }
}

/**
 * Bottom Y (element-local) of the main price pane plot - for main-axis hit tests and vertical pan.
 * @param {import('lightweight-charts').ISeriesApi | null | undefined} mainSeries
 * @param {HTMLElement | null | undefined} el
 */
export function marketChartMainPanePlotBottomLocalY(mainSeries, el) {
  if (!mainSeries) return el?.offsetHeight ?? null
  try {
    const pane = mainSeries.getPane?.()
    const h = pane?.getHeight?.()
    if (Number.isFinite(h) && h > 0) return h
  } catch {
    /* ignore */
  }
  return el?.offsetHeight ?? null
}

/** @param {readonly import('lightweight-charts').IPaneApi[]} panes @param {number} paneIndex */
function marketChartPaneTopPx(panes, paneIndex) {
  let top = 0
  for (let i = 0; i < paneIndex; i += 1) {
    top += panes[i]?.getHeight?.() ?? 0
    top += MARKET_CHART_PANE_SEPARATOR_PX
  }
  return top
}

/**
 * Position compact Y-axis titles for volume / oscillator panes (TradingView-style).
 * @param {import('lightweight-charts').IChartApi} chart
 * @param {MarketChartPanePlan} plan
 * @returns {MarketChartSubPaneAxisTitles}
 */
export function measureMarketChartSubPaneAxisTitles(chart, plan) {
  const empty = /** @type {MarketChartSubPaneAxisTitles} */ ({ width: 52, rows: [] })
  if (!chart || !plan) return empty

  const panes = chart.panes?.() ?? []
  if (panes.length < 2) return empty

  const width =
    chart.priceScale('right', plan.volumePaneIndex)?.width?.() ||
    chart.priceScale('right')?.width?.() ||
    52

  /** @type {MarketChartSubPaneAxisTitle[]} */
  const rows = [
    {
      id: 'volume',
      text: 'Volume',
      paneIndex: plan.volumePaneIndex,
      topPx: marketChartPaneTopPx(panes, plan.volumePaneIndex) + 4,
    },
  ]

  for (const osc of plan.oscillatorPanes) {
    const def = INDICATOR_BY_ID[osc.id]
    rows.push({
      id: osc.id,
      text: def?.label ?? osc.id,
      paneIndex: osc.paneIndex,
      topPx: marketChartPaneTopPx(panes, osc.paneIndex) + 4,
    })
  }

  return { width, rows }
}
