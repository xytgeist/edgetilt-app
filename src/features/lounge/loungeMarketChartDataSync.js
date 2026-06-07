/** In-place Advanced chart data refresh after prepending history. */

import { loungeMarketBarsToSeries } from './loungeMarketChartTheme.js'
import {
  attachMarketChartIndicators,
  computeMarketChartOverlayLines,
} from './loungeMarketChartIndicators.js'
import {
  attachMarketChartVolumePane,
  loungeMarketBarsToVolumeSeries,
} from './loungeMarketChartVolume.js'
import { loungeMarketBarsToCandlestickSeries } from './loungeMarketChartTypes.js'

/**
 * @param {{
 *   chart: import('lightweight-charts').IChartApi,
 *   mainSeries: import('lightweight-charts').ISeriesApi,
 *   volumeSeries: import('lightweight-charts').ISeriesApi | null,
 *   indicatorSeries: import('lightweight-charts').ISeriesApi[],
 *   rawBars: Array<{ t: number, c: number, v?: number }>,
 *   chartType: string,
 *   activeIndicators: Set<string>,
 *   isLight?: boolean,
 *   panePlan?: import('./loungeMarketChartPanes.js').MarketChartPanePlan,
 *   applyPriceRange?: (barPoints: Array<{ time: number, value: number }>, overlayLines: unknown[]) => void,
 * }} ctx
 * @returns {{ volumeSeries: import('lightweight-charts').ISeriesApi | null, indicatorSeries: import('lightweight-charts').ISeriesApi[] }}
 */
export function refreshAdvancedMarketChartData(ctx) {
  const {
    chart,
    mainSeries,
    indicatorSeries,
    rawBars,
    chartType,
    activeIndicators,
    isLight = false,
    panePlan,
    applyPriceRange,
  } = ctx
  let { volumeSeries } = ctx

  const barPoints = loungeMarketBarsToSeries(rawBars)
  if (chartType === 'candle') {
    mainSeries.setData(loungeMarketBarsToCandlestickSeries(rawBars))
  } else {
    mainSeries.setData(barPoints)
  }

  if (volumeSeries) {
    volumeSeries.setData(loungeMarketBarsToVolumeSeries(rawBars, isLight))
  } else if (panePlan) {
    volumeSeries = attachMarketChartVolumePane(chart, rawBars, {
      isLight,
      paneIndex: panePlan.volumePaneIndex,
    })
  }

  for (const series of indicatorSeries) {
    try {
      chart.removeSeries(series)
    } catch {
      /* ignore */
    }
  }
  const nextIndicators = attachMarketChartIndicators(chart, mainSeries, barPoints, rawBars, activeIndicators, {
    isLight,
    panePlan,
  })

  if (typeof applyPriceRange === 'function') {
    const overlayLines = computeMarketChartOverlayLines(barPoints, rawBars, activeIndicators)
    applyPriceRange(barPoints, overlayLines)
  }

  return { volumeSeries, indicatorSeries: nextIndicators }
}
