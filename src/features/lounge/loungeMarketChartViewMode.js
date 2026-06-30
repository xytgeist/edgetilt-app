/** Modal chart density - Quick (sparkline) vs Advanced (grid, axes, indicators). */

import {
  formatMarketChartAxisTickForResolution,
  marketChartResolutionShowsTimeAxis,
  marketChartTimeToDate,
} from './loungeMarketChartTimeAxis.js'

export const LOUNGE_MARKET_CHART_VIEW_MODE_STORAGE_KEY = 'loungeMarketChartViewMode:v1'

/** @typedef {'quick' | 'advanced'} MarketChartViewModeId */

/** @type {Array<{ id: MarketChartViewModeId, label: string, description: string }>} */
export const MARKET_CHART_VIEW_MODES = [
  { id: 'quick', label: 'Quick', description: 'Price + sparkline' },
  { id: 'advanced', label: 'Advanced', description: 'Grid, axes, indicators' },
]

const VIEW_MODE_BY_ID = Object.fromEntries(MARKET_CHART_VIEW_MODES.map((row) => [row.id, row]))

/** @returns {MarketChartViewModeId} */
export function readStoredMarketChartViewMode() {
  if (typeof window === 'undefined') return 'quick'
  try {
    const raw = window.localStorage.getItem(LOUNGE_MARKET_CHART_VIEW_MODE_STORAGE_KEY)
    const id = String(raw || '').trim()
    if (id === 'analysis') return 'advanced'
    return VIEW_MODE_BY_ID[id] ? /** @type {MarketChartViewModeId} */ (id) : 'quick'
  } catch {
    return 'quick'
  }
}

/** @param {MarketChartViewModeId} mode */
export function writeStoredMarketChartViewMode(mode) {
  if (typeof window === 'undefined') return
  if (!VIEW_MODE_BY_ID[mode]) return
  try {
    window.localStorage.setItem(LOUNGE_MARKET_CHART_VIEW_MODE_STORAGE_KEY, mode)
  } catch {
    /* ignore quota / private mode */
  }
}

/** @param {MarketChartViewModeId | string} mode */
export function isMarketChartAdvancedView(mode) {
  return mode === 'advanced'
}

/** @param {boolean} [isLight] */
export function marketChartAnalysisGrid(isLight = false) {
  const color = chartAxisBorderColor(isLight)
  return {
    vertLines: { visible: true, color },
    horzLines: { visible: true, color },
  }
}

function chartAxisBorderColor(isLight = false) {
  return isLight ? 'rgba(113, 113, 122, 0.28)' : 'rgba(63, 63, 70, 0.55)'
}

/** @param {number | import('lightweight-charts').UTCTimestamp | import('lightweight-charts').BusinessDay} time */
function marketChartTimeToDateQuick(time) {
  return marketChartTimeToDate(time)
}

/** @param {number | import('lightweight-charts').UTCTimestamp | import('lightweight-charts').BusinessDay} time @param {string} timeframeLabel */
function formatMarketChartAxisTime(time, timeframeLabel) {
  const d = marketChartTimeToDateQuick(time)
  if (!d || Number.isNaN(d.getTime())) return ''
  switch (timeframeLabel) {
    case '1H':
      return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
    case '1D':
      return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
    case '1W':
      return d.toLocaleDateString(undefined, { weekday: 'short' })
    case '1M':
    case '3M':
      return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
    case '1Y':
      return d.toLocaleDateString(undefined, { month: 'short' })
    case 'ALL':
      return d.toLocaleDateString(undefined, { month: 'short', year: '2-digit' })
    default:
      return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
  }
}

/** @param {number | import('lightweight-charts').UTCTimestamp | import('lightweight-charts').BusinessDay} time @param {string} timeframeLabel */
function formatMarketChartCrosshairTime(time, timeframeLabel) {
  const d = marketChartTimeToDateQuick(time)
  if (!d || Number.isNaN(d.getTime())) return ''
  switch (timeframeLabel) {
    case '1H':
      return d.toLocaleString(undefined, {
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
      })
    case '1D':
      return d.toLocaleString(undefined, {
        weekday: 'short',
        hour: 'numeric',
        minute: '2-digit',
      })
    case '1W':
      return d.toLocaleString(undefined, {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
      })
    case '1M':
    case '3M':
      return d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })
    case '1Y':
      return d.toLocaleDateString(undefined, { month: 'short', year: 'numeric' })
    case 'ALL':
      return d.toLocaleDateString(undefined, { month: 'short', year: 'numeric' })
    default:
      return d.toLocaleString(undefined)
  }
}

/** @param {number | import('lightweight-charts').UTCTimestamp | import('lightweight-charts').BusinessDay} time @param {import('./loungeMarketChartResolution.js').MarketChartResolutionId | string} resolutionId */
export function formatMarketChartTimeLabelForResolution(time, resolutionId) {
  const d = marketChartTimeToDateQuick(time)
  if (!d || Number.isNaN(d.getTime())) return ''
  switch (resolutionId) {
    case '1':
      return d.toLocaleString(undefined, {
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        second: '2-digit',
      })
    case '5':
    case '15':
    case '60':
      return d.toLocaleString(undefined, {
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
      })
    case '120':
    case '240':
      return d.toLocaleString(undefined, {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
      })
    case 'D':
      return d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })
    case 'W':
      return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
    default:
      return d.toLocaleString(undefined)
  }
}

/** @param {boolean} [isLight] */
export function marketChartAdvancedPriceScaleOptions(isLight = false) {
  return {
    visible: true,
    borderVisible: true,
    borderColor: chartAxisBorderColor(isLight),
    alignLabels: true,
    minimumWidth: 52,
    ticksVisible: true,
    textColor: isLight ? '#71717a' : '#a1a1aa',
  }
}

/** Pane separator styling for Advanced multi-pane charts. */
export function marketChartAdvancedLayoutPanesOptions(isLight = false) {
  return {
    panes: {
      separatorColor: chartAxisBorderColor(isLight),
      separatorHoverColor: isLight ? 'rgba(113, 113, 122, 0.45)' : 'rgba(161, 161, 170, 0.45)',
      enableResize: true,
    },
  }
}

/** Visible right price scale for volume / RSI / MACD panes. */
export function marketChartSubPanePriceScaleOptions(isLight = false) {
  return {
    visible: true,
    borderVisible: true,
    borderColor: chartAxisBorderColor(isLight),
    alignLabels: true,
    minimumWidth: 52,
    ticksVisible: true,
    textColor: isLight ? '#71717a' : '#a1a1aa',
    scaleMargins: { top: 0.1, bottom: 0.1 },
  }
}

/**
 * Configure the dedicated right price scale on a sub-pane (volume / oscillator).
 * @param {import('lightweight-charts').IChartApi} chart
 * @param {number} paneIndex
 * @param {boolean} [isLight]
 */
export function applyMarketChartSubPanePriceScale(chart, paneIndex, isLight = false) {
  chart.priceScale('right', paneIndex).applyOptions(marketChartSubPanePriceScaleOptions(isLight))
}

/** Pinch / double-tap scale for Advanced fullscreen (time axis only; price uses custom axis zoom). */
export function marketChartAdvancedHandleScaleOptions() {
  return {
    mouseWheel: false,
    pinch: true,
    axisPressedMouseMove: {
      time: false,
      price: false,
    },
    axisDoubleClickReset: {
      time: true,
      price: false,
    },
  }
}

/** @param {string} timeframeLabel @param {boolean} [isLight] */
export function marketChartAdvancedTimeScaleOptions(timeframeLabel, isLight = false) {
  return {
    visible: true,
    borderVisible: true,
    borderColor: chartAxisBorderColor(isLight),
    rightOffset: 0,
    rightOffsetPixels: 0,
    fixRightEdge: false,
    timeVisible: timeframeLabel === '1H' || timeframeLabel === '1D' || timeframeLabel === '1W',
    secondsVisible: timeframeLabel === '1H',
    tickMarkFormatter: (time) => formatMarketChartAxisTime(time, timeframeLabel),
  }
}

/** @param {import('./loungeMarketChartResolution.js').MarketChartResolutionId | string} resolutionId @param {boolean} [isLight] */
export function marketChartAdvancedTimeScaleOptionsForResolution(resolutionId, isLight = false) {
  const id = String(resolutionId || '')
  return {
    visible: true,
    borderVisible: true,
    borderColor: chartAxisBorderColor(isLight),
    rightOffset: 0,
    rightOffsetPixels: 0,
    fixRightEdge: false,
    timeVisible: marketChartResolutionShowsTimeAxis(id),
    secondsVisible: false,
    tickMarkFormatter: (time, tickMarkType) => formatMarketChartAxisTickForResolution(time, tickMarkType, id),
  }
}

/** @param {string} timeframeLabel */
export function marketChartAdvancedLocalization(timeframeLabel) {
  return {
    timeFormatter: (time) => formatMarketChartCrosshairTime(time, timeframeLabel),
  }
}

/** @param {import('./loungeMarketChartResolution.js').MarketChartResolutionId | string} resolutionId */
export function marketChartAdvancedLocalizationForResolution(resolutionId) {
  const id = String(resolutionId || '')
  return {
    timeFormatter: (time) => formatMarketChartTimeLabelForResolution(time, id),
  }
}
