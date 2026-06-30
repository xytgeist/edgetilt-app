import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  Activity,
  Camera,
  ChartArea,
  ChartLine,
  Check,
  Eraser,
  Loader2,
  PenLine,
  PencilLine,
  Type,
  Undo2,
} from 'lucide-react'
import { createChart, createSeriesMarkers } from 'lightweight-charts'
import { feedPostDisplayCaption } from '../../utils/communityFeedPost.js'
import {
  formatMarketCap,
  formatMarketChangeLine,
  formatMarketPrice,
  marketEmbedCacheKey,
  marketEmbedSearchCashtag,
  coingeckoCoinIdForTicker,
  pickRollingMarketPayload,
  MARKET_MODAL_DEFAULT_TIMEFRAME_IDX,
  MARKET_MODAL_TIMEFRAMES,
} from '../../utils/loungeMarketCaptionParse.js'
import { loungeMarketModalNews, loungeMarketModalSeries, loungeMarketModalSeriesBefore, filterMarketBarsStrictlyBefore, mergeMarketBarsOlder } from '../../utils/loungeMarketApi.js'
import { marketBarRowFields } from '../../utils/marketBarOhlc.js'
import { isUsableStockIntradayBars, isUsEquityRegularSessionOpen } from '../../utils/usEquityMarketSession.js'
import { formatLoungeSearchError, loungeSearchCashtagPosts, LOUNGE_SEARCH_SORT } from './loungeSearchApi.js'
import { useLoungeMarketFeedQuotes } from './LoungeMarketFeedContext.jsx'
import {
  isLoungeMarketPollAllowed,
  markLoungeUserActivity,
  useLoungeMarketPollOnResume,
} from './loungeMarketPollActivity.js'
import { loungeMarketBarsToSeries, loungeMarketChartCrosshairOptions, loungeMarketChartIsLight, loungeMarketChartTheme } from './loungeMarketChartTheme.js'
import {
  attachMarketChartIndicators,
  MARKET_CHART_INDICATOR_CATEGORIES,
  listActiveIndicatorLegend,
  listMarketChartIndicatorsByCategory,
  marketIndicatorLegendItems,
  readStoredMarketChartIndicators,
  writeStoredMarketChartIndicators,
} from './loungeMarketChartIndicators.js'
import {
  attachModalMainChartSeries,
  marketModalChartHighLow,
  marketModalChartTypeLabel,
  marketModalChartTypeUsesLineMarkers,
  marketModalChartTypeUsesOhlc,
  marketModalMainSeriesData,
  MARKET_MODAL_CHART_TYPES,
  readStoredMarketChartType,
  writeStoredMarketChartType,
} from './loungeMarketChartTypes.js'
import { attachMarketChartVolumePane } from './loungeMarketChartVolume.js'
import {
  applyMarketChartPaneHeights,
  computeMarketChartPanePlan,
  marketChartMainPanePlotBottomLocalY,
  measureMarketChartSubPaneAxisTitles,
} from './loungeMarketChartPanes.js'
import {
  isMarketChartPortraitViewport,
  lockMarketChartLandscapeOrientation,
  marketChartAdvancedFullscreenShellStyle,
  unlockMarketChartLandscapeOrientation,
} from './loungeMarketChartAdvancedFullscreen.js'
import {
  bindMarketChartPriceAxisZoom,
  marketChartPriceAxisHit,
} from './loungeMarketChartPriceAxisZoom.js'
import {
  bindMarketChartHistoryLoader,
  bindMarketChartPanPointer,
  marketChartBarsSignature,
  marketChartPanDebug,
  scrollMarketChartByPixels,
  shiftMarketChartLogicalRange,
} from './loungeMarketChartPan.js'
import { refreshAdvancedMarketChartData } from './loungeMarketChartDataSync.js'
import {
  applyVisibleCandlePriceRange,
  bindVisibleCandlePriceRangeFit,
  scheduleVisibleCandlePriceRange,
} from './loungeMarketChartPriceRange.js'
import {
  captureMarketChartPngFile,
  marketChartSnapshotBrandingFromCapture,
  marketChartSnapshotBrandingFromEmbed,
  marketChartSnapshotFilename,
  marketChartSnapshotSaveMenuLabel,
  saveMarketChartScreenshot,
} from './loungeMarketChartSnapshot.js'
import LoungeMarketChartAnnotationOverlay from './LoungeMarketChartAnnotationOverlay.jsx'
import {
  marketChartAdvancedHandleScaleOptions,
  marketChartAdvancedLayoutPanesOptions,
  marketChartAdvancedLocalizationForResolution,
  marketChartAdvancedPriceScaleOptions,
  marketChartAdvancedTimeScaleOptionsForResolution,
  marketChartAnalysisGrid,
  writeStoredMarketChartViewMode,
} from './loungeMarketChartViewMode.js'
import {
  advancedMarketSeriesScopeKey,
  DEFAULT_MARKET_CHART_RESOLUTION_ID,
  getMarketChartResolution,
  MARKET_CHART_RESOLUTIONS,
  readStoredMarketChartResolution,
  writeStoredMarketChartResolution,
} from './loungeMarketChartResolution.js'

const SHEET_DISMISS_PX = 88
const SHEET_DISMISS_VEL = 0.45
/** Chart canvas stops above this band - timeframe pills sit in the gap. */
const MARKET_CHART_TIMEFRAME_BAND_PX = 24
const MARKET_CHART_MODAL_HEIGHT = '90dvh'
const MARKET_CHART_HEIGHT_PX = 320
const MARKET_CHART_PRICE_SCALE_FONT_SIZE = 10
const MARKET_CHART_PRICE_AXIS_GUTTER_PX = 56
const MARKET_CHART_PRICE_AXIS_LABEL_MIN_GAP_PX = 14
const MARKET_CHART_PRICE_SCALE_MARGINS = { top: 0.06, bottom: 0.06 }
/** Hold still this long, then drag pans the chart (scrub stays tap/slide). */
const MARKET_CHART_LONG_PRESS_MS = 450
const MARKET_CHART_GESTURE_SLOP_PX = 12
function setChartLineMarkers(series, barPoints, lineColor) {
  const last = barPoints[barPoints.length - 1]
  if (!last) return null
  return createSeriesMarkers(series, [
    {
      time: last.time,
      position: 'inBar',
      shape: 'circle',
      color: lineColor,
      size: 0.75,
    },
  ])
}

/** Pin Y scale to timeframe high/low (+ optional overlay lines). */
function applyMarketChartPriceRange(mainSeries, barPoints, overlayLines = [], opts = {}) {
  const keepMargins = opts.keepMargins === true
  let from = Infinity
  let to = -Infinity
  const consider = (value) => {
    const v = Number(value)
    if (!Number.isFinite(v)) return
    from = Math.min(from, v)
    to = Math.max(to, v)
  }
  for (const point of barPoints || []) consider(point?.value)
  if (marketModalChartTypeUsesOhlc(opts.chartType) && opts.rawBars?.length) {
    const { high, low } = marketModalChartHighLow('candle', barPoints, opts.rawBars)
    consider(high?.value)
    consider(low?.value)
  }
  for (const line of overlayLines || []) {
    for (const point of line || []) consider(point?.value)
  }
  if (!Number.isFinite(from) || !Number.isFinite(to)) return
  if (from === to) {
    mainSeries.priceScale().applyOptions({
      autoScale: true,
      ...(keepMargins ? {} : { scaleMargins: MARKET_CHART_PRICE_SCALE_MARGINS }),
    })
    return
  }
  mainSeries.priceScale().applyOptions({
    autoScale: false,
    ...(keepMargins ? {} : { scaleMargins: MARKET_CHART_PRICE_SCALE_MARGINS }),
  })
  mainSeries.priceScale().setVisibleRange({ from, to })
}

/** High / low in the active timeframe series (close line or candle OHLC). */
function barSeriesHighLow(barPoints, chartType = 'area', rawBars = []) {
  return marketModalChartHighLow(chartType, barPoints, rawBars)
}

/** HOD / current / LOD on the right gutter (modal quick view). */
function buildPriceAxisLabels(mainSeries, barPoints, chartType = 'area', rawBars = []) {
  const { high, low } = barSeriesHighLow(barPoints, chartType, rawBars)
  const last = barPoints?.[barPoints.length - 1]
  const currentPrice = Number(last?.value)
  if (!high || !low || !Number.isFinite(currentPrice)) {
    return { high: null, current: null, low: null }
  }

  const lowPrice = Math.min(low.value, high.value)
  const highPrice = Math.max(low.value, high.value)

  const toRow = (id, price) => {
    const y = mainSeries.priceToCoordinate(price)
    if (y == null) return null
    return { id, price, y: Math.round(y) }
  }

  const rows = [toRow('high', highPrice), toRow('current', currentPrice), toRow('low', lowPrice)].filter(Boolean)

  rows.sort((a, b) => a.y - b.y)
  for (let i = 1; i < rows.length; i += 1) {
    if (rows[i].y - rows[i - 1].y < MARKET_CHART_PRICE_AXIS_LABEL_MIN_GAP_PX) {
      rows[i].y = rows[i - 1].y + MARKET_CHART_PRICE_AXIS_LABEL_MIN_GAP_PX
    }
  }

  const byId = Object.fromEntries(rows.map((row) => [row.id, row]))
  return {
    high: byId.high ? { price: highPrice, y: byId.high.y } : null,
    current: byId.current ? { price: currentPrice, y: byId.current.y } : null,
    low: byId.low ? { price: lowPrice, y: byId.low.y } : null,
  }
}

function priceAxisLabelsEqual(a, b) {
  if (a === b) return true
  if (!a || !b) return false
  const samePoint = (p, q) =>
    (p == null && q == null) ||
    (p != null && q != null && p.price === q.price && p.y === q.y)
  return samePoint(a.high, b.high) && samePoint(a.current, b.current) && samePoint(a.low, b.low)
}

function MarketIndicatorLegendLine({ color, dashed = false, className = '' }) {
  if (dashed) {
    return (
      <span
        className={`inline-block w-3 shrink-0 border-t border-dashed ${className}`}
        style={{ borderColor: color }}
        aria-hidden="true"
      />
    )
  }
  return (
    <span
      className={`inline-block h-0.5 w-3 shrink-0 rounded-full ${className}`}
      style={{ backgroundColor: color }}
      aria-hidden="true"
    />
  )
}

function MarketIndicatorLegendSwatches({ items, className = '' }) {
  if (!items?.length) return null
  return (
    <span className={`inline-flex items-center gap-1 ${className}`}>
      {items.map((item) => (
        <MarketIndicatorLegendLine key={item.label} color={item.color} dashed={item.dashed} />
      ))}
    </span>
  )
}

/** Floating on-chart legend (compact vertical list). */
function MarketChartFloatingIndicatorLegend({ rows, mutedClass }) {
  if (!rows?.length) return null
  return (
    <div
      className="pointer-events-none absolute left-2 top-2 z-10 max-w-[min(calc(100%-1rem),14rem)] rounded-md border border-zinc-700/70 bg-zinc-950/85 px-2 py-1.5 backdrop-blur-[2px]"
      style={{ marginLeft: 'max(0.5rem, env(safe-area-inset-left, 0px))' }}
      aria-label="Indicator legend"
    >
      <div className={`mb-1 text-[9px] font-semibold uppercase tracking-wide ${mutedClass}`}>Legend</div>
      <ul className="flex flex-col gap-1">
        {rows.map((row) => (
          <li
            key={row.key}
            className="flex items-center gap-1.5 text-[10px] leading-none text-zinc-200"
          >
            <MarketIndicatorLegendLine color={row.color} dashed={row.dashed} />
            <span className="truncate">{row.label}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

const ADVANCED_CHART_TOOLBAR_MENU_PANEL =
  'z-[60] rounded-lg border border-zinc-700/90 bg-zinc-900 py-1 shadow-2xl'

/** Bottom toolbar: menus open upward. */
const ADVANCED_CHART_TOOLBAR_MENU_ANCHOR = 'absolute bottom-full left-0 mb-1'

const ADVANCED_CHART_TOOLBAR_MENU_ANCHOR_RIGHT = 'absolute bottom-full right-0 mb-1'

const ADVANCED_CHART_TOOLBAR_BTN =
  'inline-flex h-9 shrink-0 items-center justify-center rounded-md px-2 text-[0px] leading-none touch-manipulation'

const ADVANCED_CHART_TOOLBAR_ICON = 'h-5 w-5 shrink-0'

const ADVANCED_CHART_TOOLBAR_LEADING_SLOT =
  'relative inline-flex h-5 w-5 shrink-0 items-center justify-center'

/** Snapshot camera reads small at 20px - give it a slightly larger slot. */
const ADVANCED_CHART_TOOLBAR_SNAPSHOT_SLOT =
  'relative inline-flex h-6 w-6 shrink-0 items-center justify-center'

const ADVANCED_CHART_TOOLBAR_SNAPSHOT_ICON = 'h-6 w-6 shrink-0'

/** Resolution label (1D, 1H, …) - slightly taller than icon row for legibility. */
const ADVANCED_CHART_TOOLBAR_RESOLUTION_LABEL =
  'inline-flex h-6 min-w-[1.75rem] shrink-0 items-center justify-center px-0.5 text-lg font-semibold leading-none tabular-nums -translate-y-0.5'

/** Filled candlesticks - no axis “L”. */
function MarketChartFilledCandlestickToolbarIcon({ className }) {
  return (
    <svg
      className={className}
      viewBox="0 0 16 16"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
    >
      <line x1="2.5" y1="2" x2="2.5" y2="14" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" />
      <rect x="1" y="5.5" width="3" height="5" rx="0.35" fill="currentColor" />
      <line x1="8" y1="1.5" x2="8" y2="14.5" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" />
      <rect x="6.5" y="4" width="3" height="7.5" rx="0.35" fill="currentColor" />
      <line x1="13.5" y1="3" x2="13.5" y2="13" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" />
      <rect x="12" y="7" width="3" height="4.5" rx="0.35" fill="currentColor" />
    </svg>
  )
}

/** Outline bodies + split wicks (no fill, no wick through the body). */
function MarketChartHollowCandlestickToolbarIcon({ className }) {
  const wick = { stroke: 'currentColor', strokeWidth: 1.25, strokeLinecap: 'round' }
  const box = { fill: 'none', stroke: 'currentColor', strokeWidth: 1 }
  return (
    <svg
      className={className}
      viewBox="0 0 16 16"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
    >
      <line x1="2.5" y1="2" x2="2.5" y2="5.5" {...wick} />
      <rect x="1" y="5.5" width="3" height="5" {...box} />
      <line x1="2.5" y1="10.5" x2="2.5" y2="14" {...wick} />
      <line x1="8" y1="1.5" x2="8" y2="4" {...wick} />
      <rect x="6.5" y="4" width="3" height="7.5" {...box} />
      <line x1="8" y1="11.5" x2="8" y2="14.5" {...wick} />
      <line x1="13.5" y1="3" x2="13.5" y2="7" {...wick} />
      <rect x="12" y="7" width="3" height="4.5" {...box} />
      <line x1="13.5" y1="11.5" x2="13.5" y2="13" {...wick} />
    </svg>
  )
}

/** @param {{ chartType: string }} props */
function MarketChartTypeToolbarIcon({ chartType }) {
  if (chartType === 'line') return <ChartLine className={ADVANCED_CHART_TOOLBAR_ICON} aria-hidden />
  if (chartType === 'area') return <ChartArea className={ADVANCED_CHART_TOOLBAR_ICON} aria-hidden />
  if (chartType === 'hollow') {
    return <MarketChartHollowCandlestickToolbarIcon className={ADVANCED_CHART_TOOLBAR_ICON} />
  }
  return <MarketChartFilledCandlestickToolbarIcon className={ADVANCED_CHART_TOOLBAR_ICON} />
}

function advancedChartToolbarBtnTone(active, mutedClass) {
  return active ? 'text-cyan-300 hover:text-cyan-200' : `${mutedClass} hover:text-zinc-300`
}

/** Compact Indicators ▾ picker; active legend floats on the chart. */
function MarketChartIndicatorsControl({
  menuRef,
  menuOpen,
  onToggleMenu,
  activeIndicatorCount,
  mutedClass,
  isLight,
  activeIndicators,
  toggleIndicator,
}) {
  return (
    <div className="relative shrink-0" ref={menuRef}>
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={menuOpen}
        aria-label={
          activeIndicatorCount
            ? `Chart indicators, ${activeIndicatorCount} active`
            : 'Chart indicators'
        }
        onClick={(e) => {
          e.stopPropagation()
          onToggleMenu()
        }}
        className={`${ADVANCED_CHART_TOOLBAR_BTN} ${advancedChartToolbarBtnTone(
          activeIndicatorCount > 0,
          mutedClass,
        )}`}
      >
        <span className={ADVANCED_CHART_TOOLBAR_LEADING_SLOT}>
          <Activity className={ADVANCED_CHART_TOOLBAR_ICON} aria-hidden />
          {activeIndicatorCount ? (
            <span
              className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-cyan-400"
              aria-hidden
            />
          ) : null}
        </span>
      </button>
      {menuOpen ? (
        <div
          role="listbox"
          aria-label="Chart indicators"
          className={`${ADVANCED_CHART_TOOLBAR_MENU_ANCHOR} ${ADVANCED_CHART_TOOLBAR_MENU_PANEL} max-h-[min(20rem,45dvh)] min-w-[12rem] overflow-y-auto overscroll-contain`}
          onClick={(e) => e.stopPropagation()}
        >
          {MARKET_CHART_INDICATOR_CATEGORIES.map((cat) => (
            <div key={cat.id}>
              <div
                className={`sticky top-0 z-[1] border-b border-zinc-800/80 bg-zinc-900 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wide ${mutedClass}`}
              >
                {cat.label}
              </div>
              {listMarketChartIndicatorsByCategory(cat.id).map((ind) => {
                const on = activeIndicators.has(ind.id)
                const legendItems = marketIndicatorLegendItems(ind.id, isLight)
                return (
                  <button
                    key={ind.id}
                    type="button"
                    role="option"
                    aria-selected={on}
                    onClick={(e) => {
                      e.stopPropagation()
                      toggleIndicator(ind.id)
                    }}
                    className={`flex w-full items-center gap-2 px-3 py-2 text-left text-[12px] touch-manipulation hover:bg-zinc-800 active:bg-zinc-800/90 ${
                      on ? 'text-cyan-200' : 'text-zinc-200'
                    }`}
                  >
                    <span
                      className={`inline-flex h-3.5 w-3.5 shrink-0 items-center justify-center text-[11px] ${
                        on ? 'text-cyan-400' : 'text-transparent'
                      }`}
                      aria-hidden="true"
                    >
                      ✓
                    </span>
                    <span className="min-w-0 flex-1 truncate">{ind.label}</span>
                    <MarketIndicatorLegendSwatches items={legendItems} />
                  </button>
                )
              })}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  )
}

function MarketChartSnapshotButton({
  menuRef,
  menuOpen,
  onToggleMenu,
  disabled = false,
  busy = false,
  status = '',
  canInsert = false,
  onSave,
  onInsert,
  mutedClass,
}) {
  return (
    <div className="relative inline-flex shrink-0 items-center" ref={menuRef}>
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={menuOpen}
        aria-label={busy ? 'Saving snapshot' : 'Snapshot'}
        disabled={disabled || busy}
        onClick={(e) => {
          e.stopPropagation()
          onToggleMenu()
        }}
        className={`${ADVANCED_CHART_TOOLBAR_BTN} disabled:opacity-40 ${advancedChartToolbarBtnTone(
          menuOpen,
          mutedClass,
        )}`}
      >
        <span className={ADVANCED_CHART_TOOLBAR_SNAPSHOT_SLOT}>
          {busy ? (
            <Loader2 className={`${ADVANCED_CHART_TOOLBAR_SNAPSHOT_ICON} animate-spin`} aria-hidden />
          ) : (
            <Camera className={ADVANCED_CHART_TOOLBAR_SNAPSHOT_ICON} aria-hidden />
          )}
        </span>
      </button>
      {status ? (
        <span
          className="pointer-events-none absolute bottom-full left-0 z-40 mb-2 whitespace-nowrap rounded border border-zinc-700/80 bg-zinc-950/95 px-2 py-1 text-[10px] font-medium text-cyan-200 shadow-lg"
          aria-live="polite"
        >
          {status}
        </span>
      ) : null}
      {menuOpen ? (
        <div
          role="menu"
          aria-label="Snapshot"
          className={`${ADVANCED_CHART_TOOLBAR_MENU_ANCHOR_RIGHT} ${ADVANCED_CHART_TOOLBAR_MENU_PANEL} min-w-[10.5rem] overflow-hidden`}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            type="button"
            role="menuitem"
            onClick={(e) => {
              e.stopPropagation()
              onSave()
            }}
            className="flex w-full px-3 py-2 text-left text-[12px] text-zinc-200 touch-manipulation hover:bg-zinc-800 active:bg-zinc-800/90"
          >
            {marketChartSnapshotSaveMenuLabel()}
          </button>
          {canInsert ? (
            <button
              type="button"
              role="menuitem"
              onClick={(e) => {
                e.stopPropagation()
                onInsert()
              }}
              className="flex w-full px-3 py-2 text-left text-[12px] text-zinc-200 touch-manipulation hover:bg-zinc-800 active:bg-zinc-800/90"
            >
              Add to post
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}

/** Fit series to width; Advanced keeps the right edge free so pan-back works. */
function fitMarketChartTimeScale(chart, { fixRightEdge = true } = {}) {
  chart.timeScale().applyOptions({ rightOffset: 0, rightOffsetPixels: 0 })
  chart.timeScale().fitContent()
  chart.timeScale().applyOptions({ rightOffset: 0, rightOffsetPixels: 0, fixRightEdge })
}

/** Last series value at or before crosshair time. */
function priceAtSeriesTime(barPoints, time) {
  if (!barPoints?.length || time == null) return null
  const ts = typeof time === 'number' ? time : null
  if (ts == null) return null
  let match = barPoints[0]
  for (const point of barPoints) {
    if (point.time <= ts) match = point
    else break
  }
  return Number(match.value)
}

/** Scrub quote vs first bar in the active timeframe. */
function scrubQuoteFromBarPoints(barPoints, price) {
  if (!Number.isFinite(price)) return null
  const firstPrice = Number(barPoints[0]?.value)
  if (Number.isFinite(firstPrice) && firstPrice > 0) {
    const change = price - firstPrice
    return { price, change, change_pct: (change / firstPrice) * 100 }
  }
  return { price }
}

/**
 * Scrub on tap/slide; long-press (~450ms) then drag pans the time scale (modal quick view only).
 * @param {HTMLElement} el
 * @param {import('lightweight-charts').IChartApi} chart
 * @param {import('lightweight-charts').ISeriesApi} mainSeries
 * @param {Array<{ time: number, value: number }>} barPoints
 * @param {(quote: object | null) => void} onScrub
 * @param {{ panEnabled?: boolean, priceAxisHit?: (clientX: number, clientY?: number) => boolean }} [opts]
 */
function bindMarketChartScrubPointer(el, chart, mainSeries, barPoints, onScrub, gestureOpts = {}) {
  const panEnabled = gestureOpts.panEnabled !== false
  /** Quick sheet: let vertical swipes bubble to the modal dismiss handler (Android). */
  const sheetDismissPassthrough = panEnabled === false
  const priceAxisHit =
    typeof gestureOpts.priceAxisHit === 'function' ? gestureOpts.priceAxisHit : null
  const clearScrub = () => {
    chart.clearCrosshairPosition()
    onScrub(null)
  }

  const applyScrubAt = (clientX, clientY) => {
    const rect = el.getBoundingClientRect()
    const x = clientX - rect.left
    const y = clientY - rect.top
    if (x < 0 || y < 0 || x > rect.width || y > rect.height) {
      clearScrub()
      return
    }
    const time = chart.timeScale().coordinateToTime(x)
    const crosshairTime = time ?? barPoints[barPoints.length - 1]?.time
    let crosshairPrice = mainSeries.coordinateToPrice(y)
    if (crosshairPrice == null || !Number.isFinite(crosshairPrice)) {
      crosshairPrice = priceAtSeriesTime(barPoints, crosshairTime)
    }
    if (!Number.isFinite(crosshairPrice) && barPoints.length) {
      crosshairPrice =
        x <= 0
          ? Number(barPoints[0].value)
          : Number(barPoints[barPoints.length - 1].value)
    }
    if (!Number.isFinite(crosshairPrice)) {
      clearScrub()
      return
    }
    if (crosshairTime != null) {
      chart.setCrosshairPosition(crosshairPrice, crosshairTime, mainSeries)
    }
    const seriesPrice = priceAtSeriesTime(barPoints, crosshairTime)
    const headerPrice = Number.isFinite(seriesPrice) ? seriesPrice : crosshairPrice
    onScrub(scrubQuoteFromBarPoints(barPoints, headerPrice))
  }

  /** @type {'pending' | 'scrub' | 'pan' | null} */
  let mode = null
  let activePointerId = null
  let startX = 0
  let startY = 0
  let lastPanX = null
  let longPressTimer = null

  const clearLongPressTimer = () => {
    if (longPressTimer != null) {
      window.clearTimeout(longPressTimer)
      longPressTimer = null
    }
  }

  const releaseCapture = (pointerId) => {
    if (!el.hasPointerCapture(pointerId)) return
    try {
      el.releasePointerCapture(pointerId)
    } catch {
      /* ignore */
    }
  }

  const resetGesture = () => {
    clearLongPressTimer()
    mode = null
    activePointerId = null
    lastPanX = null
  }

  const enterScrubMode = (e) => {
    clearLongPressTimer()
    mode = 'scrub'
    el.setPointerCapture(e.pointerId)
    applyScrubAt(e.clientX, e.clientY)
  }

  const onPointerDown = (e) => {
    if (priceAxisHit?.(e.clientX, e.clientY)) return
    if (e.button !== 0 && e.pointerType === 'mouse') return
    if (!sheetDismissPassthrough) e.stopPropagation()
    resetGesture()
    mode = 'pending'
    activePointerId = e.pointerId
    startX = e.clientX
    startY = e.clientY
    if (!sheetDismissPassthrough) applyScrubAt(e.clientX, e.clientY)
    if (!panEnabled) return
    longPressTimer = window.setTimeout(() => {
      longPressTimer = null
      if (mode !== 'pending' || activePointerId !== e.pointerId) return
      mode = 'pan'
      clearScrub()
      chart.timeScale().applyOptions({ fixRightEdge: false })
      el.setPointerCapture(e.pointerId)
      lastPanX = e.clientX
    }, MARKET_CHART_LONG_PRESS_MS)
  }

  const onPointerMove = (e) => {
    if (e.pointerType === 'mouse' && e.buttons === 0 && mode == null) {
      if (priceAxisHit?.(e.clientX, e.clientY)) {
        clearScrub()
        return
      }
      applyScrubAt(e.clientX, e.clientY)
      return
    }

    if (activePointerId == null || e.pointerId !== activePointerId) return

    if (mode === 'pending') {
      const dx = e.clientX - startX
      const dy = e.clientY - startY
      if (
        sheetDismissPassthrough &&
        dy > MARKET_CHART_GESTURE_SLOP_PX &&
        dy > Math.abs(dx)
      ) {
        resetGesture()
        return
      }
      if (dx * dx + dy * dy >= MARKET_CHART_GESTURE_SLOP_PX * MARKET_CHART_GESTURE_SLOP_PX) {
        if (sheetDismissPassthrough) e.stopPropagation()
        enterScrubMode(e)
        return
      }
      return
    }

    if (mode === 'scrub') {
      e.stopPropagation()
      applyScrubAt(e.clientX, e.clientY)
      return
    }

    if (mode === 'pan') {
      e.stopPropagation()
      if (lastPanX != null) {
        scrollMarketChartByPixels(chart, e.clientX - lastPanX)
      }
      lastPanX = e.clientX
    }
  }

  const onPointerEnd = (e) => {
    if (activePointerId == null || e.pointerId !== activePointerId) return
    releaseCapture(e.pointerId)
    if (mode === 'scrub' || mode === 'pending') {
      clearScrub()
    }
    resetGesture()
  }

  const onPointerLeave = (e) => {
    if (e.pointerType === 'mouse' && mode == null) {
      clearScrub()
    }
  }

  const opts = { capture: !sheetDismissPassthrough }
  el.addEventListener('pointerdown', onPointerDown, opts)
  el.addEventListener('pointermove', onPointerMove, opts)
  el.addEventListener('pointerup', onPointerEnd, opts)
  el.addEventListener('pointercancel', onPointerEnd, opts)
  el.addEventListener('pointerleave', onPointerLeave, opts)

  return () => {
    clearLongPressTimer()
    el.removeEventListener('pointerdown', onPointerDown, opts)
    el.removeEventListener('pointermove', onPointerMove, opts)
    el.removeEventListener('pointerup', onPointerEnd, opts)
    el.removeEventListener('pointercancel', onPointerEnd, opts)
    el.removeEventListener('pointerleave', onPointerLeave, opts)
  }
}

function shouldIgnoreSheetDragTarget(target) {
  if (!(target instanceof Element)) return true
  return Boolean(target.closest('button, a, input, textarea, select, [data-market-sheet-no-drag]'))
}

function modalCoinIdForEmbed(embed) {
  if (!embed) return undefined
  const fromEmbed = String(embed.coin_id || '').trim()
  if (fromEmbed) return fromEmbed
  if (embed.asset_class === 'crypto') {
    const mapped = coingeckoCoinIdForTicker(embed.display_symbol || embed.symbol)
    return mapped || undefined
  }
  return undefined
}

/** Match fetched modal series to active embed + timeframe pill. */
function modalSeriesScopeKey(active, timeframeIdx) {
  if (!active) return ''
  const tf = MARKET_MODAL_TIMEFRAMES[timeframeIdx] || MARKET_MODAL_TIMEFRAMES[0]
  return `${active.asset_class}:${String(active.symbol || '').toLowerCase()}:${tf.kind}:${tf.windowKey}`
}

function formatNewsAge(unixSec) {
  const ts = Number(unixSec)
  if (!Number.isFinite(ts) || ts <= 0) return ''
  const diffMs = Date.now() - ts * 1000
  const mins = Math.floor(diffMs / 60000)
  if (mins < 1) return 'Just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 48) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  return `${days}d ago`
}

function formatPostAge(createdAt) {
  if (!createdAt) return ''
  const diffMs = Date.now() - new Date(createdAt).getTime()
  const mins = Math.floor(diffMs / 60000)
  if (mins < 1) return 'now'
  if (mins < 60) return `${mins}m`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h`
  const days = Math.floor(hrs / 24)
  if (days < 7) return `${days}d`
  return new Date(createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

/** Company logo for market embed headers - no crossOrigin (breaks most Finnhub/Yahoo hosts in UI). */
function MarketEmbedLogo({ embed, imgClass, fallbackClass }) {
  const logo = String(embed?.logo_url || embed?.logo || '').trim()
  const initial = (embed?.display_symbol || embed?.symbol || '?').slice(0, 1)
  const [imgOk, setImgOk] = useState(Boolean(logo))

  useEffect(() => {
    setImgOk(Boolean(logo))
  }, [logo, embed?.display_symbol, embed?.symbol])

  if (logo && imgOk) {
    return (
      <img
        src={logo}
        alt=""
        className={imgClass}
        onError={() => setImgOk(false)}
      />
    )
  }

  return <div className={fallbackClass}>{initial}</div>
}

/**
 * @param {{
 *   open: boolean,
 *   embeds: object[],
 *   focusSymbol?: string | null,
 *   supabaseClient: import('@supabase/supabase-js').SupabaseClient,
 *   onClose: () => void,
 *   hydratePosts?: (rows: object[]) => Promise<object[]>,
 *   onOpenPost?: (post: object) => void,
 *   onInsertSnapshot?: (file: File, ctx?: { embed?: object | null, symbol?: string | null }) => boolean,
 * }} props
 */
export default function LoungeMarketChartModal({
  open,
  embeds,
  focusSymbol = null,
  supabaseClient,
  onClose,
  hydratePosts,
  onOpenPost,
  onInsertSnapshot,
}) {
  const chartHostRef = useRef(null)
  const advancedChartHostRef = useRef(null)
  const advancedFullscreenRootRef = useRef(null)
  const chartRef = useRef(null)
  const mainSeriesRef = useRef(null)
  const indicatorMenuRef = useRef(null)
  const chartTypeMenuRef = useRef(null)
  const timeframeMenuRef = useRef(null)
  const resolutionMenuRef = useRef(null)
  const snapshotMenuRef = useRef(null)
  const postsScrollRef = useRef(null)
  const sheetDragRef = useRef(null)
  const [sheetDragY, setSheetDragY] = useState(0)
  const [sheetDragging, setSheetDragging] = useState(false)
  const [sheetClosing, setSheetClosing] = useState(false)
  const [activeIdx, setActiveIdx] = useState(0)
  const [timeframeIdx, setTimeframeIdx] = useState(0)
  const [series, setSeries] = useState(/** @type {{ quote?: object, bars?: object[], window_label?: string } | null} */ (null))
  const [seriesScope, setSeriesScope] = useState('')
  const [liveMarketCap, setLiveMarketCap] = useState(/** @type {number | null} */ (null))
  const loadSeriesGenRef = useRef(0)
  const loadAdvancedSeriesGenRef = useRef(0)
  const [historyBars, setHistoryBars] = useState(/** @type {object[]} */ ([]))
  const [historyHasMore, setHistoryHasMore] = useState(true)
  const historyLoadingRef = useRef(false)
  const historyHasMoreRef = useRef(true)
  const loadMoreHistoryRef = useRef(/** @type {(beforeSec: number) => void} */ (() => {}))
  const historyFlushPendingRef = useRef(/** @type {(() => void) | null} */ (null))
  const historyAckBarsRef = useRef(/** @type {(() => void) | null} */ (null))
  const historyResetAnchorRef = useRef(/** @type {(() => void) | null} */ (null))
  const historyCheckEdgeAfterPanRef = useRef(/** @type {(() => void) | null} */ (null))
  const advancedUserPannedRef = useRef(false)
  const chartPanningRef = useRef(false)
  const pendingHistoryApplyRef = useRef(/** @type {(() => void) | null} */ (null))
  const advancedBarsSignatureRef = useRef('')
  /** True after user picks a resolution this Advanced session - keeps choice across ticker switches. */
  const advancedResolutionSessionPickedRef = useRef(false)
  const volumeSeriesRef = useRef(null)
  const indicatorSeriesRef = useRef(/** @type {import('lightweight-charts').ISeriesApi[]} */ ([]))
  const chartSeriesRef = useRef(null)
  const allBarsRef = useRef(/** @type {object[]} */ ([]))
  const priceScaleUserPinnedRef = useRef(false)
  const [loading, setLoading] = useState(false)
  const [advancedLoading, setAdvancedLoading] = useState(false)
  const [advancedResolutionId, setAdvancedResolutionId] = useState(() => readStoredMarketChartResolution())
  const [advancedSeries, setAdvancedSeries] = useState(
    /** @type {{ quote?: object, bars?: object[], window_label?: string, has_more?: boolean } | null} */ (null),
  )
  const [advancedSeriesScope, setAdvancedSeriesScope] = useState('')
  const [news, setNews] = useState(/** @type {object | null} */ (null))
  const [newsLoading, setNewsLoading] = useState(false)
  const [postSort, setPostSort] = useState(LOUNGE_SEARCH_SORT.ENGAGEMENT)
  const [posts, setPosts] = useState(/** @type {object[]} */ ([]))
  const [postsLoading, setPostsLoading] = useState(false)
  const [postsErr, setPostsErr] = useState('')
  const [activeIndicators, setActiveIndicators] = useState(() => readStoredMarketChartIndicators())
  const [chartType, setChartType] = useState(() => readStoredMarketChartType())
  const [advancedFullscreenOpen, setAdvancedFullscreenOpen] = useState(false)
  const [indicatorMenuOpen, setIndicatorMenuOpen] = useState(false)
  const [chartTypeMenuOpen, setChartTypeMenuOpen] = useState(false)
  const [timeframeMenuOpen, setTimeframeMenuOpen] = useState(false)
  const [resolutionMenuOpen, setResolutionMenuOpen] = useState(false)
  const [snapshotMenuOpen, setSnapshotMenuOpen] = useState(false)
  const [snapshotBusy, setSnapshotBusy] = useState(false)
  const [snapshotFlash, setSnapshotFlash] = useState('')
  const [annotateMode, setAnnotateMode] = useState(false)
  const [annotationTool, setAnnotationTool] = useState(/** @type {'pen' | 'text'} */ ('pen'))
  const [chartAnnotations, setChartAnnotations] = useState(
    /** @type {import('./loungeMarketChartAnnotation.js').MarketChartAnnotationItem[]} */ ([]),
  )
  const annotateModeRef = useRef(false)
  const chartAnnotationsRef = useRef(chartAnnotations)
  chartAnnotationsRef.current = chartAnnotations
  annotateModeRef.current = annotateMode
  /** Crosshair scrub overrides header quote until pointer leaves the chart. */
  const [scrubQuote, setScrubQuote] = useState(/** @type {{ price: number, change?: number, change_pct?: number } | null} */ (null))
  const [visibleWindowQuote, setVisibleWindowQuote] = useState(
    /** @type {{ price: number, change: number, change_pct: number } | null} */ (null),
  )
  const displayQuoteRef = useRef(/** @type {{ price?: number, change?: number, change_pct?: number } | null} */ (null))
  const [scrubAxisCurrent, setScrubAxisCurrent] = useState(/** @type {{ price: number, y: number } | null} */ (null))
  const [priceAxisLabels, setPriceAxisLabels] = useState(
    /** @type {{ high: { price: number, y: number } | null, current: { price: number, y: number } | null, low: { price: number, y: number } | null }} */ ({
      high: null,
      current: null,
      low: null,
    }),
  )
  const priceAxisLabelsRef = useRef(
    /** @type {{ high: { price: number, y: number } | null, current: { price: number, y: number } | null, low: { price: number, y: number } | null }} */ ({
      high: null,
      current: null,
      low: null,
    }),
  )
  const [subPaneAxisTitles, setSubPaneAxisTitles] = useState(
    /** @type {{ width: number, rows: Array<{ id: string, text: string, topPx: number, paneIndex: number }> }} */ ({
      width: 52,
      rows: [],
    }),
  )

  const isLight = loungeMarketChartIsLight()
  const { quotes: feedQuotes } = useLoungeMarketFeedQuotes()
  const list = useMemo(() => (Array.isArray(embeds) ? embeds.filter(Boolean) : []), [embeds])
  const timeframe = MARKET_MODAL_TIMEFRAMES[timeframeIdx] || MARKET_MODAL_TIMEFRAMES[0]
  const advancedResolution = getMarketChartResolution(advancedResolutionId)

  useEffect(() => {
    if (!open || !list.length) return
    const idx = focusSymbol
      ? Math.max(0, list.findIndex((e) => e.display_symbol === focusSymbol || e.symbol === focusSymbol))
      : 0
    setActiveIdx(idx >= 0 ? idx : 0)
    setTimeframeIdx(MARKET_MODAL_DEFAULT_TIMEFRAME_IDX >= 0 ? MARKET_MODAL_DEFAULT_TIMEFRAME_IDX : 0)
    setPostSort(LOUNGE_SEARCH_SORT.ENGAGEMENT)
  }, [open, focusSymbol, list])

  useEffect(() => {
    setChartAnnotations([])
    setAnnotateMode(false)
    setAnnotationTool('pen')
  }, [activeIdx, advancedResolutionId])

  const active = list[activeIdx] || null
  const activeAdvancedSeriesScope = useMemo(() => {
    if (!active) return ''
    return advancedMarketSeriesScopeKey({
      symbol: active.symbol,
      asset_class: active.asset_class,
      resolutionId: advancedResolutionId,
    })
  }, [active, advancedResolutionId])
  const scopedAdvancedSeries =
    advancedSeriesScope === activeAdvancedSeriesScope ? advancedSeries : null
  const activeSeriesScope = modalSeriesScopeKey(active, timeframeIdx)
  const fetchedSeries = seriesScope === activeSeriesScope ? series : null
  const activeIndicatorKey = useMemo(
    () => [...activeIndicators].sort().join(','),
    [activeIndicators],
  )

  const toggleIndicator = useCallback((id) => {
    setActiveIndicators((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      writeStoredMarketChartIndicators(next)
      return next
    })
  }, [])

  const activeIndicatorCount = activeIndicators.size
  const activeIndicatorLegend = useMemo(
    () => listActiveIndicatorLegend(activeIndicators, isLight),
    [activeIndicators, isLight],
  )

  useEffect(() => {
    if (!open) {
      setIndicatorMenuOpen(false)
      setChartTypeMenuOpen(false)
      setTimeframeMenuOpen(false)
      setResolutionMenuOpen(false)
      setSnapshotMenuOpen(false)
      setSnapshotFlash('')
      setAnnotateMode(false)
      setChartAnnotations([])
      setAdvancedFullscreenOpen(false)
    }
  }, [open])

  useEffect(() => {
    if (!advancedFullscreenOpen) return undefined
    return () => {
      unlockMarketChartLandscapeOrientation()
    }
  }, [advancedFullscreenOpen])

  useLayoutEffect(() => {
    if (!advancedFullscreenOpen) return
    if (!isMarketChartPortraitViewport()) return
    void lockMarketChartLandscapeOrientation(advancedFullscreenRootRef.current)
  }, [advancedFullscreenOpen])

  useEffect(() => {
    if (!indicatorMenuOpen && !chartTypeMenuOpen && !timeframeMenuOpen && !resolutionMenuOpen && !snapshotMenuOpen) {
      return undefined
    }
    const onPointerDown = (e) => {
      if (indicatorMenuRef.current?.contains(e.target)) return
      if (chartTypeMenuRef.current?.contains(e.target)) return
      if (timeframeMenuRef.current?.contains(e.target)) return
      if (resolutionMenuRef.current?.contains(e.target)) return
      if (snapshotMenuRef.current?.contains(e.target)) return
      setIndicatorMenuOpen(false)
      setChartTypeMenuOpen(false)
      setTimeframeMenuOpen(false)
      setResolutionMenuOpen(false)
      setSnapshotMenuOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown, true)
    return () => document.removeEventListener('pointerdown', onPointerDown, true)
  }, [chartTypeMenuOpen, indicatorMenuOpen, resolutionMenuOpen, snapshotMenuOpen, timeframeMenuOpen])

  const snapshotDisabled = advancedLoading || annotateMode

  const runMarketChartSnapshot = useCallback(
    async (mode) => {
      const chart = chartRef.current
      if (!chart || snapshotBusy || advancedLoading) return
      setSnapshotBusy(true)
      setSnapshotMenuOpen(false)
      try {
        const filename = marketChartSnapshotFilename(active?.display_symbol || active?.symbol)
        const branding = marketChartSnapshotBrandingFromCapture({
          embed: active,
          isLight,
          legendRows: activeIndicatorLegend,
          chart,
          rawBars: allBarsRef.current,
          chartType: advancedFullscreenOpen ? chartType : 'candle',
          supabase: supabaseClient,
        })
        if (mode === 'save') {
          const result = await saveMarketChartScreenshot(
            chart,
            branding,
            chartAnnotationsRef.current,
            filename,
          )
          setSnapshotFlash(result === 'download' ? 'Image downloaded' : 'Image saved')
        } else if (mode === 'insert') {
          if (typeof onInsertSnapshot !== 'function') {
            setSnapshotFlash('Add to post unavailable')
          } else {
            const file = await captureMarketChartPngFile(
              chart,
              filename,
              branding,
              chartAnnotationsRef.current,
            )
            const ok = onInsertSnapshot(file, {
              embed: active,
              symbol: active?.display_symbol || active?.symbol || null,
            })
            if (!ok) setSnapshotFlash('Could not add image')
          }
        }
      } catch (err) {
        if (err && typeof err === 'object' && err.name === 'AbortError') return
        setSnapshotFlash(err instanceof Error ? err.message : 'Snapshot failed')
      } finally {
        setSnapshotBusy(false)
        window.setTimeout(() => setSnapshotFlash(''), 2400)
      }
    },
    [active, activeIndicatorLegend, advancedFullscreenOpen, advancedLoading, chartType, isLight, onInsertSnapshot, snapshotBusy, supabaseClient],
  )

  const undoChartAnnotation = useCallback(() => {
    setChartAnnotations((prev) => (prev.length ? prev.slice(0, -1) : prev))
  }, [])

  const clearChartAnnotations = useCallback(() => {
    setChartAnnotations([])
  }, [])

  const toggleSnapshotMenu = useCallback(() => {
    if (annotateModeRef.current) return
    setSnapshotMenuOpen((openNow) => {
      if (!openNow) {
        setIndicatorMenuOpen(false)
        setChartTypeMenuOpen(false)
        setResolutionMenuOpen(false)
        setTimeframeMenuOpen(false)
      }
      return !openNow
    })
  }, [])

  const selectChartType = useCallback((id) => {
    setChartType(id)
    writeStoredMarketChartType(id)
    setChartTypeMenuOpen(false)
  }, [])

  const selectTimeframeIdx = useCallback((idx) => {
    setTimeframeIdx(idx)
    setTimeframeMenuOpen(false)
  }, [])

  const selectAdvancedResolutionId = useCallback((id) => {
    advancedResolutionSessionPickedRef.current = true
    setAdvancedResolutionId(id)
    writeStoredMarketChartResolution(id)
    setResolutionMenuOpen(false)
  }, [])

  const closeAnnotateMenus = useCallback(() => {
    setIndicatorMenuOpen(false)
    setChartTypeMenuOpen(false)
    setResolutionMenuOpen(false)
    setTimeframeMenuOpen(false)
    setSnapshotMenuOpen(false)
  }, [])

  const enterAnnotateMode = useCallback(() => {
    closeAnnotateMenus()
    setAnnotationTool('pen')
    setAnnotateMode(true)
  }, [closeAnnotateMenus])

  const exitAnnotateMode = useCallback(() => {
    setAnnotateMode(false)
  }, [])

  const openAdvancedFullscreen = useCallback(() => {
    closeAnnotateMenus()
    setAnnotateMode(false)
    setChartAnnotations([])
    setChartType('candle')
    if (!advancedResolutionSessionPickedRef.current) {
      setAdvancedResolutionId(DEFAULT_MARKET_CHART_RESOLUTION_ID)
    }
    void lockMarketChartLandscapeOrientation()
    setAdvancedFullscreenOpen(true)
  }, [closeAnnotateMenus])

  const closeAdvancedFullscreen = useCallback(() => {
    advancedResolutionSessionPickedRef.current = false
    setAdvancedFullscreenOpen(false)
    closeAnnotateMenus()
    setAnnotateMode(false)
    setChartAnnotations([])
    setScrubQuote(null)
    setVisibleWindowQuote(null)
    setHistoryBars([])
    setHistoryHasMore(true)
    historyLoadingRef.current = false
    advancedBarsSignatureRef.current = ''
    chartPanningRef.current = false
    pendingHistoryApplyRef.current = null
    advancedUserPannedRef.current = false
    historyResetAnchorRef.current?.()
    writeStoredMarketChartViewMode('quick')
  }, [closeAnnotateMenus])

  useEffect(() => {
    if (!advancedFullscreenOpen || !chartRef.current) return
    chartRef.current.applyOptions({
      handleScale: annotateMode ? false : marketChartAdvancedHandleScaleOptions(),
    })
  }, [annotateMode, advancedFullscreenOpen])

  const isAdvancedView = advancedFullscreenOpen
  /** Quick-sheet series fetches must not remount the Advanced chart when `seriesScope` updates. */
  const chartMountScopeKey = advancedFullscreenOpen ? 'advanced' : seriesScope
  /** Modal sheet stays on gradient area; advanced fullscreen uses stored chart type. */
  const effectiveChartType = isAdvancedView ? chartType : 'area'

  /** Same live rolling payload as feed mini charts (`LoungeMarketChartStrip`). */
  const rollingLive = useMemo(() => {
    if (!active || active.kind !== 'rolling') return null
    const key = marketEmbedCacheKey(active)
    const live = feedQuotes[key]
    return live && typeof live === 'object' ? live : null
  }, [active, feedQuotes])

  const resetSheetDrag = useCallback(() => {
    sheetDragRef.current = null
    setSheetDragging(false)
    setSheetDragY(0)
  }, [])

  const dismissSheet = useCallback(() => {
    setSheetClosing(true)
    setSheetDragY(typeof window !== 'undefined' ? window.innerHeight : 800)
    window.setTimeout(() => {
      setSheetClosing(false)
      resetSheetDrag()
      onClose()
    }, 220)
  }, [onClose, resetSheetDrag])

  const canStartSheetDrag = useCallback((target) => {
    if (shouldIgnoreSheetDragTarget(target)) return false
    if (target instanceof Element && target.closest('[data-market-sheet-drag]')) return true
    if (target instanceof Element && target.closest('[data-lounge-market-chart-area]')) return true
    const scroll = postsScrollRef.current
    if (scroll && scroll.contains(target) && scroll.scrollTop <= 0) return true
    return false
  }, [])

  const onSheetPointerDown = useCallback(
    (e) => {
      if (sheetClosing) return
      if (e.button !== 0 && e.pointerType === 'mouse') return
      if (!canStartSheetDrag(e.target)) return
      const fromChart =
        e.target instanceof Element && Boolean(e.target.closest('[data-lounge-market-chart-area]'))
      sheetDragRef.current = {
        pointerId: e.pointerId,
        startX: e.clientX,
        startY: e.clientY,
        startMs: Date.now(),
        captured: !fromChart,
        fromChart,
      }
      setSheetDragging(true)
      setSheetDragY(0)
      if (!fromChart) e.currentTarget.setPointerCapture(e.pointerId)
    },
    [canStartSheetDrag, sheetClosing],
  )

  const onSheetPointerMove = useCallback((e) => {
    const drag = sheetDragRef.current
    if (!drag || drag.pointerId !== e.pointerId) return
    const dy = e.clientY - drag.startY
    const dx = e.clientX - drag.startX
    if (!drag.captured) {
      const dist2 = dx * dx + dy * dy
      if (dist2 < MARKET_CHART_GESTURE_SLOP_PX * MARKET_CHART_GESTURE_SLOP_PX) return
      if (drag.fromChart && Math.abs(dx) >= dy) {
        sheetDragRef.current = null
        setSheetDragging(false)
        setSheetDragY(0)
        return
      }
      if (dy <= 0) {
        sheetDragRef.current = null
        setSheetDragging(false)
        setSheetDragY(0)
        return
      }
      drag.captured = true
      try {
        e.currentTarget.setPointerCapture(e.pointerId)
      } catch {
        /* ignore */
      }
    }
    if (dy <= 0) return
    e.preventDefault()
    setSheetDragY(dy)
  }, [])

  const onSheetPointerEnd = useCallback(
    (e) => {
      const drag = sheetDragRef.current
      if (!drag || drag.pointerId !== e.pointerId) return
      try {
        e.currentTarget.releasePointerCapture(e.pointerId)
      } catch {
        /* ignore */
      }
      const dy = Math.max(0, e.clientY - drag.startY)
      const dt = Math.max(1, Date.now() - drag.startMs)
      const vel = dy / dt
      sheetDragRef.current = null
      setSheetDragging(false)
      if (dy >= SHEET_DISMISS_PX || vel >= SHEET_DISMISS_VEL) {
        dismissSheet()
        return
      }
      setSheetDragY(0)
    },
    [dismissSheet],
  )

  const onSheetPointerCancel = useCallback((e) => {
    if (sheetDragRef.current?.pointerId === e.pointerId) resetSheetDrag()
  }, [resetSheetDrag])

  useEffect(() => {
    if (!open) resetSheetDrag()
  }, [open, resetSheetDrag])

  useEffect(() => {
    if (!open) advancedResolutionSessionPickedRef.current = false
  }, [open])

  useEffect(() => {
    loadSeriesGenRef.current += 1
    setSeries(null)
    setSeriesScope('')
    setLiveMarketCap(null)
    setHistoryBars([])
    setHistoryHasMore(true)
    historyLoadingRef.current = false
    advancedBarsSignatureRef.current = ''
    advancedUserPannedRef.current = false
    historyResetAnchorRef.current?.()
  }, [active?.asset_class, active?.symbol, activeIdx, timeframeIdx])

  useEffect(() => {
    loadAdvancedSeriesGenRef.current += 1
    setAdvancedSeries(null)
    setAdvancedSeriesScope('')
    setHistoryBars([])
    setHistoryHasMore(true)
    historyLoadingRef.current = false
    advancedBarsSignatureRef.current = ''
    advancedUserPannedRef.current = false
    historyResetAnchorRef.current?.()
    priceScaleUserPinnedRef.current = false
    if (advancedFullscreenOpen) setAdvancedLoading(true)
  }, [active?.asset_class, active?.symbol, activeIdx, advancedFullscreenOpen, advancedResolutionId])

  const loadAdvancedSeries = useCallback(async () => {
    if (!advancedFullscreenOpen || !active || !supabaseClient) return
    const scope = advancedMarketSeriesScopeKey({
      symbol: active.symbol,
      asset_class: active.asset_class,
      resolutionId: advancedResolutionId,
    })
    const gen = loadAdvancedSeriesGenRef.current
    const resolution = getMarketChartResolution(advancedResolutionId)
    setAdvancedLoading(true)
    try {
      const data = await loungeMarketModalSeries(supabaseClient, {
        symbol: active.symbol,
        asset_class: active.asset_class,
        resolution: advancedResolutionId,
        bar_limit: resolution.initialBars,
        coin_id: modalCoinIdForEmbed(active),
      })
      if (gen !== loadAdvancedSeriesGenRef.current) return
      if (data) {
        setAdvancedSeries({
          quote: data.quote,
          bars: data.bars,
          window_label: data.window_label,
          has_more: data.has_more !== false,
        })
        setAdvancedSeriesScope(scope)
        setHistoryHasMore(data.has_more !== false)
        if (data.market_cap != null && Number.isFinite(Number(data.market_cap))) {
          setLiveMarketCap(Number(data.market_cap))
        }
      }
    } finally {
      if (gen === loadAdvancedSeriesGenRef.current) setAdvancedLoading(false)
    }
  }, [active, advancedFullscreenOpen, advancedResolutionId, supabaseClient])

  useEffect(() => {
    if (!advancedFullscreenOpen) return
    void loadAdvancedSeries()
  }, [advancedFullscreenOpen, loadAdvancedSeries])

  const loadSeries = useCallback(async () => {
    if (!open || !active || !supabaseClient) return
    const scope = modalSeriesScopeKey(active, timeframeIdx)
    const gen = loadSeriesGenRef.current
    setLoading(true)
    try {
      const tf = MARKET_MODAL_TIMEFRAMES[timeframeIdx] || MARKET_MODAL_TIMEFRAMES[0]
      const data = await loungeMarketModalSeries(supabaseClient, {
        symbol: active.symbol,
        asset_class: active.asset_class,
        kind: tf.kind,
        window_key: tf.windowKey,
        coin_id: modalCoinIdForEmbed(active),
      })
      if (gen !== loadSeriesGenRef.current) return
      if (data) {
        setSeries({
          quote: data.quote,
          bars: data.bars,
          window_label: data.window_label,
        })
        setSeriesScope(scope)
        if (data.market_cap != null && Number.isFinite(Number(data.market_cap))) {
          setLiveMarketCap(Number(data.market_cap))
        }
      }
    } finally {
      if (gen === loadSeriesGenRef.current) setLoading(false)
    }
  }, [active, open, supabaseClient, timeframeIdx])

  const pollModalSeriesIfAllowed = useCallback(() => {
    if (!open || timeframe.kind !== 'rolling') return
    if (active?.asset_class === 'stock' && !isUsEquityRegularSessionOpen()) return
    if (!isLoungeMarketPollAllowed()) return
    void loadSeries()
  }, [active?.asset_class, loadSeries, open, timeframe.kind])

  useLoungeMarketPollOnResume(() => pollModalSeriesIfAllowed(), { enabled: open && timeframe.kind === 'rolling' })

  useEffect(() => {
    if (!open) return undefined
    markLoungeUserActivity()
    void loadSeries()
    if (timeframe.kind !== 'rolling') return undefined
    if (active?.asset_class === 'stock' && !isUsEquityRegularSessionOpen()) return undefined
    const id = window.setInterval(() => pollModalSeriesIfAllowed(), 60_000)
    return () => window.clearInterval(id)
  }, [active?.asset_class, loadSeries, open, pollModalSeriesIfAllowed, timeframe.kind])

  useEffect(() => {
    if (!open || !active || !supabaseClient) {
      setNews(null)
      return undefined
    }
    let cancelled = false
    setNewsLoading(true)
    void loungeMarketModalNews(supabaseClient, {
      symbol: active.symbol,
      asset_class: active.asset_class,
    })
      .then((row) => {
        if (!cancelled) setNews(row)
      })
      .finally(() => {
        if (!cancelled) setNewsLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [active?.asset_class, active?.symbol, open, supabaseClient])

  const cashtag = useMemo(() => marketEmbedSearchCashtag(active), [active])

  useEffect(() => {
    if (!open || !supabaseClient || !cashtag) {
      setPosts([])
      setPostsErr('')
      setPostsLoading(false)
      return undefined
    }
    let cancelled = false
    setPostsLoading(true)
    setPostsErr('')
    void loungeSearchCashtagPosts(supabaseClient, cashtag, {
      sort: postSort,
      limit: 12,
    })
      .then(async (result) => {
        if (cancelled) return
        const raw = Array.isArray(result.posts) ? result.posts : []
        const hydrated = hydratePosts ? await hydratePosts(raw) : raw
        if (!cancelled) setPosts(hydrated)
      })
      .catch((err) => {
        if (cancelled) return
        console.warn('LoungeMarketChartModal cashtag posts:', err)
        setPosts([])
        setPostsErr(formatLoungeSearchError(err))
      })
      .finally(() => {
        if (!cancelled) setPostsLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [cashtag, hydratePosts, open, postSort, supabaseClient])

  useEffect(() => {
    setScrubQuote(null)
    setScrubAxisCurrent(null)
  }, [activeIdx, timeframeIdx, series, rollingLive])

  useEffect(() => {
    if (!open) {
      setScrubQuote(null)
      setScrubAxisCurrent(null)
    }
  }, [open])

  /** Rolling 1D: same source priority as feed minis; never reuse another ticker's fetched series. */
  const chartSeries = useMemo(() => {
    if (timeframe.kind !== 'rolling') return fetchedSeries

    const live = pickRollingMarketPayload(active, rollingLive)

    if (active?.asset_class === 'stock') {
      if (isUsableStockIntradayBars(live?.bars)) return live
      if (isUsableStockIntradayBars(fetchedSeries?.bars)) return fetchedSeries
      if (isUsableStockIntradayBars(active?.bars)) {
        return {
          quote: active.quote,
          bars: active.bars,
          window_label: active.window_label,
        }
      }
      return {
        quote: live?.quote || active?.quote,
        bars: live?.bars || [],
        window_label: live?.window_label || active?.window_label,
      }
    }

    if (live?.bars?.length >= 2) return live
    if (fetchedSeries?.bars?.length >= 2) return fetchedSeries
    return fetchedSeries || live
  }, [active, fetchedSeries, rollingLive, timeframe.kind])

  const allBars = useMemo(() => {
    if (isAdvancedView) {
      const base = scopedAdvancedSeries?.bars || []
      return mergeMarketBarsOlder(base, historyBars)
    }
    return chartSeries?.bars || []
  }, [scopedAdvancedSeries?.bars, chartSeries?.bars, historyBars, isAdvancedView])

  chartSeriesRef.current = chartSeries
  allBarsRef.current = allBars

  const applyAdvancedHistoryBars = useCallback(
    (nextAll, added) => {
      const chart = chartRef.current
      const mainSeries = mainSeriesRef.current
      if (!chart || !mainSeries || added <= 0) {
        marketChartPanDebug('history apply skipped', { added })
        historyAckBarsRef.current?.()
        return
      }

      const run = () => {
        if (!chartRef.current || !mainSeriesRef.current) return
        const chart = chartRef.current
        const mainSeries = mainSeriesRef.current
        const ts = chart.timeScale()
        const logicalRange = ts.getVisibleLogicalRange()
        const priceScale = mainSeries.priceScale()
        const priceRange = priceScale.getVisibleRange()
        const panePlan = computeMarketChartPanePlan(activeIndicators)
        const host = advancedChartHostRef.current
        const refreshed = refreshAdvancedMarketChartData({
          chart,
          mainSeries,
          volumeSeries: volumeSeriesRef.current,
          indicatorSeries: indicatorSeriesRef.current,
          rawBars: nextAll,
          chartType: effectiveChartType,
          activeIndicators,
          isLight,
          panePlan,
          // Prepend only - never re-fit Y/time to the full merged series.
          applyPriceRange: undefined,
        })
        volumeSeriesRef.current = refreshed.volumeSeries
        indicatorSeriesRef.current = refreshed.indicatorSeries
        if (logicalRange && Number.isFinite(logicalRange.from) && Number.isFinite(logicalRange.to)) {
          ts.setVisibleLogicalRange({
            from: logicalRange.from + added,
            to: logicalRange.to + added,
          })
        } else {
          shiftMarketChartLogicalRange(chart, added)
        }
        if (priceScaleUserPinnedRef.current) {
          if (priceRange && Number.isFinite(priceRange.from) && Number.isFinite(priceRange.to)) {
            priceScale.applyOptions({ autoScale: false })
            priceScale.setVisibleRange(priceRange)
          }
        } else {
          applyVisibleCandlePriceRange(mainSeries, chart, nextAll, effectiveChartType, {
            keepMargins: true,
          })
        }
        if (host && panePlan) {
          applyMarketChartPaneHeights(chart, host.clientHeight, panePlan)
          setSubPaneAxisTitles(measureMarketChartSubPaneAxisTitles(chart, panePlan))
        }
        advancedBarsSignatureRef.current = marketChartBarsSignature(nextAll)
        historyAckBarsRef.current?.()
      }

      if (chartPanningRef.current) {
        pendingHistoryApplyRef.current = run
        return
      }
      requestAnimationFrame(run)
    },
    [activeIndicators, effectiveChartType, isLight],
  )

  const loadMoreHistory = useCallback(
    async (beforeSec) => {
      if (
        !advancedFullscreenOpen ||
        !historyHasMore ||
        historyLoadingRef.current ||
        !supabaseClient ||
        !active
      ) {
        return
      }
      historyLoadingRef.current = true
      marketChartPanDebug('history fetch start', { beforeSec })
      try {
        const resolution = getMarketChartResolution(advancedResolutionId)
        const data = await loungeMarketModalSeriesBefore(supabaseClient, {
          symbol: active.symbol,
          asset_class: active.asset_class,
          resolution: advancedResolutionId,
          bar_limit: resolution.chunkBars,
          before_sec: beforeSec,
          coin_id: modalCoinIdForEmbed(active),
        })
        if (!data) {
          marketChartPanDebug('history empty response')
          historyAckBarsRef.current?.()
          return
        }
        if (!data.bars?.length) {
          marketChartPanDebug('history no bars')
          setHistoryHasMore(false)
          historyAckBarsRef.current?.()
          return
        }
        const prevAll = allBarsRef.current || []
        const oldestT = prevAll.length
          ? marketBarRowFields(prevAll[0]).t
          : Math.floor(beforeSec)
        const incoming = filterMarketBarsStrictlyBefore(data.bars, oldestT)
        if (!incoming.length) {
          marketChartPanDebug('history overlap exhausted', {
            beforeSec,
            oldestT,
            raw: data.bars.length,
          })
          setHistoryHasMore(false)
          historyAckBarsRef.current?.()
          return
        }
        const nextAll = mergeMarketBarsOlder(prevAll, incoming)
        const added = nextAll.length - prevAll.length
        setHistoryBars((prev) => mergeMarketBarsOlder(prev, incoming))
        allBarsRef.current = nextAll
        advancedBarsSignatureRef.current = marketChartBarsSignature(nextAll)
        marketChartPanDebug('history got bars', { incoming: incoming.length, added, oldestT })
        applyAdvancedHistoryBars(nextAll, added)
        if (data.has_more === false) setHistoryHasMore(false)
      } finally {
        historyLoadingRef.current = false
      }
    },
    [
      active,
      advancedFullscreenOpen,
      advancedResolutionId,
      applyAdvancedHistoryBars,
      historyHasMore,
      supabaseClient,
    ],
  )

  historyHasMoreRef.current = historyHasMore
  loadMoreHistoryRef.current = loadMoreHistory

  const quote = isAdvancedView
    ? advancedSeries?.quote || active?.quote
    : chartSeries?.quote || active?.quote
  const displayQuote = scrubQuote ?? (isAdvancedView ? visibleWindowQuote : null) ?? quote
  displayQuoteRef.current = displayQuote
  const displayChangePct = Number(displayQuote?.change_pct)
  const displayUp = Number.isFinite(displayChangePct) ? displayChangePct >= 0 : true
  const chartChangePct = Number(quote?.change_pct)
  const chartUp = Number.isFinite(chartChangePct) ? chartChangePct >= 0 : true
  const theme = useMemo(
    () => loungeMarketChartTheme(isLight, { attributionLogo: isAdvancedView }),
    [isAdvancedView, isLight],
  )

  useEffect(() => {
    if (!open) return undefined
    const onKey = (e) => {
      if (e.key === 'Escape') {
        if (chartTypeMenuOpen) {
          e.stopPropagation()
          setChartTypeMenuOpen(false)
          return
        }
        if (indicatorMenuOpen) {
          e.stopPropagation()
          setIndicatorMenuOpen(false)
          return
        }
        if (resolutionMenuOpen) {
          e.stopPropagation()
          setResolutionMenuOpen(false)
          return
        }
        if (timeframeMenuOpen) {
          e.stopPropagation()
          setTimeframeMenuOpen(false)
          return
        }
        if (snapshotMenuOpen) {
          e.stopPropagation()
          setSnapshotMenuOpen(false)
          return
        }
        if (annotateMode) {
          e.stopPropagation()
          setAnnotateMode(false)
          return
        }
        if (advancedFullscreenOpen) {
          e.stopPropagation()
          closeAdvancedFullscreen()
          return
        }
        dismissSheet()
      }
    }
    window.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
      window.removeEventListener('keydown', onKey)
    }
  }, [advancedFullscreenOpen, annotateMode, chartTypeMenuOpen, closeAdvancedFullscreen, dismissSheet, indicatorMenuOpen, open, resolutionMenuOpen, snapshotMenuOpen, timeframeMenuOpen])

  useEffect(() => {
    const el = advancedFullscreenOpen ? advancedChartHostRef.current : chartHostRef.current
    if (!open || !el) return undefined
    const lineColor = chartUp ? theme.upColor : theme.downColor
    const chart = createChart(el, {
      ...(isAdvancedView
        ? { autoSize: true }
        : { width: el.clientWidth, height: el.clientHeight }),
      layout: {
        ...theme.layout,
        fontSize: MARKET_CHART_PRICE_SCALE_FONT_SIZE,
        ...(isAdvancedView ? marketChartAdvancedLayoutPanesOptions(isLight) : {}),
      },
      localization: isAdvancedView
        ? marketChartAdvancedLocalizationForResolution(advancedResolutionId)
        : undefined,
      grid: isAdvancedView ? marketChartAnalysisGrid(isLight) : theme.grid,
      rightPriceScale: isAdvancedView
        ? marketChartAdvancedPriceScaleOptions(isLight)
        : { visible: false },
      leftPriceScale: { visible: false },
      handleScroll: isAdvancedView
        ? {
            mouseWheel: false,
            pressedMouseMove: false,
            horzTouchDrag: false,
            vertTouchDrag: false,
          }
        : false,
      handleScale: isAdvancedView ? marketChartAdvancedHandleScaleOptions() : false,
      timeScale: isAdvancedView
        ? marketChartAdvancedTimeScaleOptionsForResolution(advancedResolutionId, isLight)
        : {
            visible: false,
            borderVisible: false,
            rightOffset: 0,
            rightOffsetPixels: 0,
            fixRightEdge: true,
          },
      crosshair: loungeMarketChartCrosshairOptions(isAdvancedView, isLight),
    })
    const rawBars = isAdvancedView
      ? allBarsRef.current || []
      : allBarsRef.current?.length
        ? allBarsRef.current
        : chartSeries?.bars || []
    const barPoints = loungeMarketBarsToSeries(rawBars)
    const mainSeries = attachModalMainChartSeries(chart, effectiveChartType, {
      barPoints,
      rawBars,
      lineColor,
      chartUp,
      isLight,
    })
    mainSeriesRef.current = mainSeries
    volumeSeriesRef.current = null
    indicatorSeriesRef.current = []
    const panePlan = isAdvancedView ? computeMarketChartPanePlan(activeIndicators) : null
    if (isAdvancedView && panePlan) {
      mainSeries.priceScale().applyOptions({
        scaleMargins: { top: 0.06, bottom: 0.04 },
      })
      volumeSeriesRef.current = attachMarketChartVolumePane(chart, rawBars, {
        isLight,
        paneIndex: panePlan.volumePaneIndex,
      })
      indicatorSeriesRef.current = attachMarketChartIndicators(chart, mainSeries, barPoints, rawBars, activeIndicators, {
        isLight,
        panePlan,
      })
      applyMarketChartPaneHeights(chart, el.offsetHeight || el.clientHeight, panePlan)
      setSubPaneAxisTitles(measureMarketChartSubPaneAxisTitles(chart, panePlan))
    }
    if (isAdvancedView) {
      /* Y scale fits visible candle OHLC after time scale is set (see refreshChartOverlays). */
    } else {
      applyMarketChartPriceRange(mainSeries, barPoints, [], {
        chartType: effectiveChartType,
        rawBars,
      })
    }
    if (marketModalChartTypeUsesLineMarkers(effectiveChartType)) {
      setChartLineMarkers(mainSeries, barPoints, lineColor)
    }
    fitMarketChartTimeScale(chart, { fixRightEdge: !isAdvancedView })

    const publishPriceAxisLabels = (next) => {
      if (priceAxisLabelsEqual(priceAxisLabelsRef.current, next)) return
      priceAxisLabelsRef.current = next
      setPriceAxisLabels(next)
    }

    let priceScaleUserPinned = false
    priceScaleUserPinnedRef.current = false
    const mainPlotBottomLocalY = () => marketChartMainPanePlotBottomLocalY(mainSeries, el)
    const fitAdvancedPriceToVisibleCandles = (series = mainSeries, liveChart = chart, opts = {}) => {
      if (!isAdvancedView || priceScaleUserPinnedRef.current) return
      const bars = allBarsRef.current?.length ? allBarsRef.current : rawBars
      if (!bars?.length) return
      if (opts.immediate) {
        applyVisibleCandlePriceRange(series, liveChart, bars, effectiveChartType, { keepMargins: true })
        return
      }
      scheduleVisibleCandlePriceRange(series, liveChart, bars, effectiveChartType, {
        keepMargins: true,
        fitTimeScale: opts.fitTimeScale !== false,
      })
    }
    const resetPriceScaleToData = () => {
      priceScaleUserPinned = false
      priceScaleUserPinnedRef.current = false
      if (!isAdvancedView) return
      fitAdvancedPriceToVisibleCandles()
    }
    const priceAxisHit = (clientX, clientY) =>
      isAdvancedView &&
      marketChartPriceAxisHit(
        clientX,
        clientY ?? 0,
        el.getBoundingClientRect(),
        chart.priceScale('right').width() || 52,
        mainPlotBottomLocalY() ?? el.offsetHeight,
      )

    const refreshChartOverlays = () => {
      if (isAdvancedView) {
        fitAdvancedPriceToVisibleCandles()
        return
      }
      applyMarketChartPriceRange(mainSeries, barPoints, [], {
        chartType: effectiveChartType,
        rawBars,
      })
      publishPriceAxisLabels(buildPriceAxisLabels(mainSeries, barPoints, effectiveChartType, rawBars))
    }
    refreshChartOverlays()
    requestAnimationFrame(refreshChartOverlays)

    const unbindPriceAxisZoom = isAdvancedView
      ? bindMarketChartPriceAxisZoom(el, chart, mainSeries, {
          maxPlotLocalY: mainPlotBottomLocalY,
          onUserZoom: () => {
            priceScaleUserPinned = true
            priceScaleUserPinnedRef.current = true
          },
          onReset: resetPriceScaleToData,
        })
      : () => {}

    const unbindPan = isAdvancedView
      ? bindMarketChartPanPointer(el, chart, {
          mainSeries,
          mainPlotBottomLocalY,
          priceAxisHit,
          onUserPricePan: () => {
            priceScaleUserPinned = true
            priceScaleUserPinnedRef.current = true
          },
          onPanActiveChange: (active) => {
            chartPanningRef.current = active
            if (active) {
              advancedUserPannedRef.current = true
              return
            }
            requestAnimationFrame(() => {
              if (chartPanningRef.current) return
              historyCheckEdgeAfterPanRef.current?.()
              historyFlushPendingRef.current?.()
              const pending = pendingHistoryApplyRef.current
              pendingHistoryApplyRef.current = null
              if (pending) requestAnimationFrame(pending)
              fitAdvancedPriceToVisibleCandles(mainSeriesRef.current, chartRef.current, {
                fitTimeScale: false,
              })
              unbindVisiblePriceFit?.refreshQuote?.()
            })
          },
        })
      : () => {}

    const unbindVisiblePriceFit = isAdvancedView
      ? bindVisibleCandlePriceRangeFit(chart, () => {
          const ms = mainSeriesRef.current
          const bars = allBarsRef.current
          if (!ms || !bars?.length) return null
          return { mainSeries: ms, rawBars: bars, chartType: effectiveChartType }
        }, {
          isPinned: () => priceScaleUserPinnedRef.current,
          isPanning: () => chartPanningRef.current,
          keepMargins: true,
          onQuote: (next) => setVisibleWindowQuote(next),
        })
      : null

    const historyLoader = isAdvancedView
      ? bindMarketChartHistoryLoader(
          chart,
          () => allBarsRef.current,
          (beforeSec) => {
            void loadMoreHistoryRef.current(beforeSec)
          },
          {
            canLoad: () =>
              historyHasMoreRef.current &&
              !historyLoadingRef.current &&
              advancedUserPannedRef.current,
            isPanning: () => chartPanningRef.current,
          },
        )
      : null
    historyFlushPendingRef.current = historyLoader?.flushPending ?? null
    historyAckBarsRef.current = historyLoader?.acknowledgeBars ?? null
    historyResetAnchorRef.current = historyLoader?.resetAnchor ?? null
    historyCheckEdgeAfterPanRef.current = historyLoader?.checkEdgeAfterPan ?? null
    const unbindHistory = historyLoader?.unbind ?? (() => {})

    const unbindScrub = isAdvancedView
      ? () => {}
      : bindMarketChartScrubPointer(
          el,
          chart,
          mainSeries,
          barPoints,
          (quoteAtPoint) => {
            setScrubQuote(quoteAtPoint)
            if (quoteAtPoint?.price != null) {
              const axisY = mainSeries.priceToCoordinate(quoteAtPoint.price)
              setScrubAxisCurrent(
                axisY != null ? { price: quoteAtPoint.price, y: Math.round(axisY) } : null,
              )
            } else {
              setScrubAxisCurrent(null)
            }
          },
          { panEnabled: false, priceAxisHit },
        )

    chartRef.current = chart
    let resizeRaf = 0
    const ro = new ResizeObserver(() => {
      const host = advancedFullscreenOpen ? advancedChartHostRef.current : chartHostRef.current
      if (!host || !chartRef.current || !mainSeriesRef.current) return
      cancelAnimationFrame(resizeRaf)
      resizeRaf = requestAnimationFrame(() => {
        const liveHost = advancedFullscreenOpen ? advancedChartHostRef.current : chartHostRef.current
        if (!liveHost || !chartRef.current || !mainSeriesRef.current) return
        if (isAdvancedView && panePlan) {
          applyMarketChartPaneHeights(chartRef.current, liveHost.clientHeight, panePlan)
          setSubPaneAxisTitles(
            measureMarketChartSubPaneAxisTitles(chartRef.current, panePlan),
          )
        } else if (!isAdvancedView) {
          chartRef.current.applyOptions({
            width: liveHost.clientWidth,
            height: liveHost.clientHeight,
          })
          fitMarketChartTimeScale(chartRef.current, { fixRightEdge: true })
          refreshChartOverlays()
        }
      })
    })
    ro.observe(el)
    if (isAdvancedView && rawBars.length > 0) {
      advancedBarsSignatureRef.current = marketChartBarsSignature(rawBars)
    }
    if (isAdvancedView && rawBars.length === 0) {
      requestAnimationFrame(() => {
        const pending = allBarsRef.current
        if (!pending?.length || !chartRef.current || !mainSeriesRef.current) return
        const signature = marketChartBarsSignature(pending)
        if (signature === advancedBarsSignatureRef.current) return
        advancedBarsSignatureRef.current = signature
        const barPoints = loungeMarketBarsToSeries(pending)
        const lineColor = chartUp ? theme.upColor : theme.downColor
        const panePlan = computeMarketChartPanePlan(activeIndicators)
        const refreshed = refreshAdvancedMarketChartData({
          chart: chartRef.current,
          mainSeries: mainSeriesRef.current,
          volumeSeries: volumeSeriesRef.current,
          indicatorSeries: indicatorSeriesRef.current,
          rawBars: pending,
          chartType: effectiveChartType,
          activeIndicators,
          isLight,
          panePlan,
          applyPriceRange: priceScaleUserPinnedRef.current
            ? undefined
            : () => {
                scheduleVisibleCandlePriceRange(
                  mainSeriesRef.current,
                  chartRef.current,
                  pending,
                  effectiveChartType,
                  { keepMargins: true },
                )
              },
        })
        volumeSeriesRef.current = refreshed.volumeSeries
        indicatorSeriesRef.current = refreshed.indicatorSeries
        if (marketModalChartTypeUsesLineMarkers(effectiveChartType)) {
          setChartLineMarkers(mainSeriesRef.current, barPoints, lineColor)
        }
        chartRef.current.timeScale().fitContent()
        if (!priceScaleUserPinnedRef.current) {
          scheduleVisibleCandlePriceRange(
            mainSeriesRef.current,
            chartRef.current,
            pending,
            effectiveChartType,
            { keepMargins: true, fitTimeScale: false },
          )
        }
      })
    }
    if (isAdvancedView && rawBars.length > 0) {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          if (!chartRef.current || !el.isConnected || !panePlan) return
          chartRef.current.timeScale().fitContent()
          setSubPaneAxisTitles(measureMarketChartSubPaneAxisTitles(chartRef.current, panePlan))
        })
      })
    }
    return () => {
      cancelAnimationFrame(resizeRaf)
      historyFlushPendingRef.current = null
      historyAckBarsRef.current = null
      historyResetAnchorRef.current = null
      historyCheckEdgeAfterPanRef.current = null
      advancedUserPannedRef.current = false
      chartPanningRef.current = false
      pendingHistoryApplyRef.current = null
      unbindPriceAxisZoom()
      unbindVisiblePriceFit?.unbind?.()
      unbindPan()
      unbindHistory()
      unbindScrub()
      ro.disconnect()
      chart.remove()
      chartRef.current = null
      mainSeriesRef.current = null
      volumeSeriesRef.current = null
      indicatorSeriesRef.current = []
      priceAxisLabelsRef.current = { high: null, current: null, low: null }
      setPriceAxisLabels({ high: null, current: null, low: null })
      setSubPaneAxisTitles({ width: 52, rows: [] })
      setScrubQuote(null)
      setScrubAxisCurrent(null)
    }
  }, [
    active?.symbol,
    activeIndicatorKey,
    advancedFullscreenOpen,
    advancedResolutionId,
    effectiveChartType,
    isLight,
    open,
    chartMountScopeKey,
  ])

  /** Quick sheet: refresh bars in place when live series updates. */
  useEffect(() => {
    if (!open || advancedFullscreenOpen || isAdvancedView) return
    const chart = chartRef.current
    const mainSeries = mainSeriesRef.current
    if (!chart || !mainSeries) return
    const rawBars = chartSeries?.bars || []
    const barPoints = loungeMarketBarsToSeries(rawBars)
    if (!barPoints.length) return
    const lineColor = chartUp ? theme.upColor : theme.downColor
    mainSeries.setData(marketModalMainSeriesData(effectiveChartType, rawBars, barPoints))
    if (marketModalChartTypeUsesLineMarkers(effectiveChartType)) {
      setChartLineMarkers(mainSeries, barPoints, lineColor)
    }
    applyMarketChartPriceRange(mainSeries, barPoints, [], {
      chartType: effectiveChartType,
      rawBars,
    })
    const nextLabels = buildPriceAxisLabels(mainSeries, barPoints, effectiveChartType, rawBars)
    if (!priceAxisLabelsEqual(priceAxisLabelsRef.current, nextLabels)) {
      priceAxisLabelsRef.current = nextLabels
      setPriceAxisLabels(nextLabels)
    }
  }, [
    open,
    advancedFullscreenOpen,
    isAdvancedView,
    chartSeries?.bars,
    effectiveChartType,
    chartUp,
    theme.upColor,
    theme.downColor,
  ])

  /** Advanced: refresh series in place on live bar updates - avoid remounting the chart. */
  useEffect(() => {
    if (!open || !advancedFullscreenOpen || !isAdvancedView) return
    if (chartPanningRef.current || annotateModeRef.current) return
    const chart = chartRef.current
    const mainSeries = mainSeriesRef.current
    if (!chart || !mainSeries) return
    const rawBars = allBarsRef.current
    if (!rawBars?.length) return
    const signature = marketChartBarsSignature(rawBars)
    if (signature === advancedBarsSignatureRef.current) return
    advancedBarsSignatureRef.current = signature
    const barPoints = loungeMarketBarsToSeries(rawBars)
    const lineColor = chartUp ? theme.upColor : theme.downColor
    const panePlan = computeMarketChartPanePlan(activeIndicators)
    const refreshed = refreshAdvancedMarketChartData({
      chart,
      mainSeries,
      volumeSeries: volumeSeriesRef.current,
      indicatorSeries: indicatorSeriesRef.current,
      rawBars,
      chartType: effectiveChartType,
      activeIndicators,
      isLight,
      panePlan,
      applyPriceRange: priceScaleUserPinnedRef.current
        ? undefined
        : () => {
            scheduleVisibleCandlePriceRange(mainSeries, chart, rawBars, effectiveChartType, {
              keepMargins: true,
            })
          },
    })
    volumeSeriesRef.current = refreshed.volumeSeries
    indicatorSeriesRef.current = refreshed.indicatorSeries
    if (marketModalChartTypeUsesLineMarkers(effectiveChartType)) {
      setChartLineMarkers(mainSeries, barPoints, lineColor)
    }
  }, [
    open,
    advancedFullscreenOpen,
    isAdvancedView,
    advancedSeries?.bars,
    effectiveChartType,
    activeIndicatorKey,
    isLight,
    chartUp,
    theme.upColor,
    theme.downColor,
  ])

  /** Advanced: re-fit Y to visible candles when scoped series lands (ticker / resolution change). */
  useEffect(() => {
    if (!open || !advancedFullscreenOpen || !isAdvancedView) return
    if (priceScaleUserPinnedRef.current) return
    if (advancedSeriesScope !== activeAdvancedSeriesScope) return
    const bars = allBarsRef.current
    if (!bars?.length) return
    const chart = chartRef.current
    const mainSeries = mainSeriesRef.current
    if (!chart || !mainSeries) return

    scheduleVisibleCandlePriceRange(mainSeries, chart, bars, effectiveChartType, { keepMargins: true })
  }, [
    open,
    advancedFullscreenOpen,
    isAdvancedView,
    activeAdvancedSeriesScope,
    advancedSeriesScope,
    advancedSeries?.bars,
    effectiveChartType,
  ])

  if (!open || !list.length) return null

  const shellClass = 'border-zinc-700/80 bg-zinc-950 text-zinc-50'
  const mutedClass = 'text-zinc-400'
  const borderClass = 'border-zinc-800'
  const pillIdleClass = 'bg-zinc-800/80 text-zinc-300 hover:bg-zinc-700'
  const pillActiveClass = 'bg-zinc-700 text-zinc-50'
  const tabActiveClass = 'border-cyan-400 text-zinc-50'
  const tabIdleClass = 'border-transparent text-zinc-500'
  const backdropOpacity = sheetClosing ? 0 : Math.max(0, 0.55 - sheetDragY / 700)
  const sheetTransform = sheetClosing || sheetDragY > 0 ? `translate3d(0, ${sheetDragY}px, 0)` : undefined
  const sheetTransition =
    sheetClosing || (!sheetDragging && sheetDragY === 0) ? 'transform 0.22s ease' : 'none'
  const axisCurrentLabel = !advancedFullscreenOpen ? (scrubAxisCurrent ?? priceAxisLabels.current) : null

  const advancedFullscreenShellStyle = marketChartAdvancedFullscreenShellStyle()

  const advancedFullscreenPortal =
    advancedFullscreenOpen && open
      ? createPortal(
          <div
            className="fixed inset-0 z-[106] overflow-hidden bg-black touch-none"
            role="dialog"
            aria-modal="true"
            aria-label={`${active?.display_symbol || 'Market'} advanced chart`}
          >
            <div
              ref={advancedFullscreenRootRef}
              className={`flex flex-col ${shellClass}`}
              style={advancedFullscreenShellStyle}
              data-lounge-market-chart-advanced-fullscreen
            >
              <div
                className={`flex shrink-0 items-center gap-3 border-b px-3 py-2 ${borderClass}`}
                style={{
                  paddingTop: 'max(0.5rem, env(safe-area-inset-top, 0px))',
                  paddingLeft: 'max(0.75rem, env(safe-area-inset-left, 0px))',
                  paddingRight: 'max(0.75rem, env(safe-area-inset-right, 0px))',
                }}
              >
                <MarketEmbedLogo
                  embed={active}
                  imgClass="h-8 w-8 shrink-0 rounded-full object-cover"
                  fallbackClass="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-zinc-800 text-xs font-bold text-zinc-300"
                />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[15px] font-bold leading-tight">
                    {active?.name || active?.display_symbol}
                  </div>
                  <div className={`truncate text-[12px] leading-snug ${mutedClass}`}>
                    ${active?.display_symbol}
                  </div>
                </div>
                <div className="shrink-0 text-right">
                  <div className="text-[18px] font-bold leading-none tabular-nums tracking-tight">
                    {formatMarketPrice(displayQuote?.price)}
                  </div>
                  <div
                    className={`mt-0.5 text-[12px] font-semibold tabular-nums ${displayUp ? 'text-lv-green' : 'text-lv-red'}`}
                  >
                    {formatMarketChangeLine(displayQuote?.change, displayChangePct)}
                  </div>
                </div>
                <button
                  type="button"
                  aria-label="Close advanced chart"
                  onClick={closeAdvancedFullscreen}
                  className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-zinc-800/90 text-lg leading-none text-zinc-200 touch-manipulation hover:bg-zinc-700"
                >
                  ×
                </button>
              </div>

              {list.length > 1 ? (
                <div
                  className={`flex shrink-0 gap-2 overflow-x-auto border-b px-3 py-1.5 ${borderClass}`}
                  style={{ paddingLeft: 'max(0.75rem, env(safe-area-inset-left, 0px))' }}
                >
                  {list.map((embed, i) => (
                    <button
                      key={`${embed.symbol}-${embed.kind}-fs`}
                      type="button"
                      onClick={() => {
                        setActiveIdx(i)
                        setTimeframeIdx(
                          MARKET_MODAL_DEFAULT_TIMEFRAME_IDX >= 0 ? MARKET_MODAL_DEFAULT_TIMEFRAME_IDX : 0,
                        )
                      }}
                      className={`shrink-0 rounded-full px-2.5 py-0.5 text-[11px] font-semibold touch-manipulation ${
                        i === activeIdx ? 'bg-cyan-500/20 text-cyan-300' : pillIdleClass
                      }`}
                    >
                      ${embed.display_symbol}
                    </button>
                  ))}
                </div>
              ) : null}

              <div className="relative flex min-h-0 flex-1 flex-col">
                <div className="relative min-h-0 flex-1 overflow-hidden">
                  <div
                    ref={advancedChartHostRef}
                    className={`absolute inset-0 touch-none select-none ${annotateMode ? 'pointer-events-none' : ''}`}
                  />
                  <LoungeMarketChartAnnotationOverlay
                    hostRef={advancedChartHostRef}
                    active={annotateMode}
                    visible={annotateMode || chartAnnotations.length > 0}
                    tool={annotationTool}
                    items={chartAnnotations}
                    onItemsChange={setChartAnnotations}
                  />
                  {!annotateMode ? (
                    <MarketChartFloatingIndicatorLegend
                      rows={activeIndicatorLegend}
                      mutedClass={mutedClass}
                    />
                  ) : null}
                  {subPaneAxisTitles.rows.length ? (
                    <div
                      className="pointer-events-none absolute inset-y-0 right-0 z-10"
                      style={{ width: subPaneAxisTitles.width }}
                    >
                      {subPaneAxisTitles.rows.map((row) => (
                        <div
                          key={row.id}
                          className={`absolute right-0 max-w-full truncate pr-0.5 text-right text-[9px] font-semibold uppercase tracking-wide ${mutedClass}`}
                          style={{ top: row.topPx }}
                        >
                          {row.text}
                        </div>
                      ))}
                    </div>
                  ) : null}
                  {advancedLoading ? (
                    <div className={`absolute inset-0 z-[1] grid place-items-center text-sm ${mutedClass}`}>
                      Loading…
                    </div>
                  ) : null}
                </div>
                <div className="relative z-30 shrink-0 overflow-visible">
                  <div
                    className={`relative flex w-full shrink-0 items-center gap-4 border-t ${borderClass} bg-zinc-950/90 px-4 py-2 backdrop-blur-[2px]`}
                    style={{
                      paddingLeft: 'max(1rem, env(safe-area-inset-left, 0px))',
                      paddingRight: 'max(1rem, env(safe-area-inset-right, 0px))',
                      paddingBottom: 'max(0.5rem, env(safe-area-inset-bottom, 0px))',
                    }}
                  >
                      {annotateMode ? (
                        <>
                          <div className="flex min-w-0 flex-1 items-center gap-4">
                          <button
                            type="button"
                            aria-pressed={annotationTool === 'pen'}
                            aria-label="Pen"
                            onClick={(e) => {
                              e.stopPropagation()
                              setAnnotationTool('pen')
                            }}
                            className={`${ADVANCED_CHART_TOOLBAR_BTN} ${advancedChartToolbarBtnTone(
                              annotationTool === 'pen',
                              mutedClass,
                            )}`}
                          >
                            <span className={ADVANCED_CHART_TOOLBAR_LEADING_SLOT}>
                              <PenLine className={ADVANCED_CHART_TOOLBAR_ICON} aria-hidden />
                            </span>
                          </button>
                          <button
                            type="button"
                            aria-pressed={annotationTool === 'text'}
                            aria-label="Text"
                            onClick={(e) => {
                              e.stopPropagation()
                              setAnnotationTool('text')
                            }}
                            className={`${ADVANCED_CHART_TOOLBAR_BTN} ${advancedChartToolbarBtnTone(
                              annotationTool === 'text',
                              mutedClass,
                            )}`}
                          >
                            <span className={ADVANCED_CHART_TOOLBAR_LEADING_SLOT}>
                              <Type className={ADVANCED_CHART_TOOLBAR_ICON} aria-hidden />
                            </span>
                          </button>
                          <button
                            type="button"
                            aria-label="Undo"
                            disabled={!chartAnnotations.length}
                            onClick={(e) => {
                              e.stopPropagation()
                              undoChartAnnotation()
                            }}
                            className={`${ADVANCED_CHART_TOOLBAR_BTN} disabled:opacity-40 ${advancedChartToolbarBtnTone(false, mutedClass)}`}
                          >
                            <span className={ADVANCED_CHART_TOOLBAR_LEADING_SLOT}>
                              <Undo2 className={ADVANCED_CHART_TOOLBAR_ICON} aria-hidden />
                            </span>
                          </button>
                          <button
                            type="button"
                            aria-label="Clear annotations"
                            disabled={!chartAnnotations.length}
                            onClick={(e) => {
                              e.stopPropagation()
                              clearChartAnnotations()
                            }}
                            className={`${ADVANCED_CHART_TOOLBAR_BTN} disabled:opacity-40 ${advancedChartToolbarBtnTone(false, mutedClass)}`}
                          >
                            <span className={ADVANCED_CHART_TOOLBAR_LEADING_SLOT}>
                              <Eraser className={ADVANCED_CHART_TOOLBAR_ICON} aria-hidden />
                            </span>
                          </button>
                          </div>
                          <div className="ml-auto flex shrink-0 items-center gap-4">
                          <button
                            type="button"
                            aria-label="Done annotating"
                            onClick={(e) => {
                              e.stopPropagation()
                              exitAnnotateMode()
                            }}
                            className={`${ADVANCED_CHART_TOOLBAR_BTN} text-cyan-300 hover:text-cyan-200`}
                          >
                            <span className={ADVANCED_CHART_TOOLBAR_LEADING_SLOT}>
                              <Check className={ADVANCED_CHART_TOOLBAR_ICON} aria-hidden />
                            </span>
                          </button>
                          </div>
                        </>
                      ) : (
                        <>
                      <div className="flex min-w-0 flex-1 items-center gap-4">
                      <div className="relative shrink-0" ref={chartTypeMenuRef}>
                        <button
                          type="button"
                          aria-haspopup="listbox"
                          aria-expanded={chartTypeMenuOpen}
                          aria-label={`Chart type, ${marketModalChartTypeLabel(chartType)}`}
                          onClick={(e) => {
                            e.stopPropagation()
                            setChartTypeMenuOpen((openNow) => {
                              if (!openNow) {
                                setIndicatorMenuOpen(false)
                                setResolutionMenuOpen(false)
                                setTimeframeMenuOpen(false)
                              }
                              return !openNow
                            })
                          }}
                          className={`${ADVANCED_CHART_TOOLBAR_BTN} ${advancedChartToolbarBtnTone(
                            chartType !== 'candle',
                            mutedClass,
                          )}`}
                        >
                          <span className={ADVANCED_CHART_TOOLBAR_LEADING_SLOT}>
                            <MarketChartTypeToolbarIcon chartType={chartType} />
                          </span>
                        </button>
                        {chartTypeMenuOpen ? (
                          <div
                            role="listbox"
                            aria-label="Chart type"
                            className={`${ADVANCED_CHART_TOOLBAR_MENU_ANCHOR} ${ADVANCED_CHART_TOOLBAR_MENU_PANEL} min-w-[10.5rem] overflow-hidden`}
                            onClick={(e) => e.stopPropagation()}
                          >
                            {MARKET_MODAL_CHART_TYPES.map((row) => {
                              const on = chartType === row.id
                              return (
                                <button
                                  key={row.id}
                                  type="button"
                                  role="option"
                                  aria-selected={on}
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    selectChartType(row.id)
                                  }}
                                  className={`flex w-full items-center gap-2 px-3 py-2 text-left text-[12px] touch-manipulation hover:bg-zinc-800 active:bg-zinc-800/90 ${
                                    on ? 'text-cyan-200' : 'text-zinc-200'
                                  }`}
                                >
                                  <span
                                    className={`inline-flex h-3.5 w-3.5 shrink-0 items-center justify-center text-[11px] ${
                                      on ? 'text-cyan-400' : 'text-transparent'
                                    }`}
                                    aria-hidden="true"
                                  >
                                    ✓
                                  </span>
                                  {row.label}
                                </button>
                              )
                            })}
                          </div>
                        ) : null}
                      </div>
                      <MarketChartIndicatorsControl
                        menuRef={indicatorMenuRef}
                        menuOpen={indicatorMenuOpen}
                        onToggleMenu={() => {
                          setIndicatorMenuOpen((openNow) => {
                            if (!openNow) {
                              setChartTypeMenuOpen(false)
                              setResolutionMenuOpen(false)
                              setTimeframeMenuOpen(false)
                            }
                            return !openNow
                          })
                        }}
                        activeIndicatorCount={activeIndicatorCount}
                        mutedClass={mutedClass}
                        isLight={isLight}
                        activeIndicators={activeIndicators}
                        toggleIndicator={toggleIndicator}
                      />
                      <div className="relative shrink-0" ref={resolutionMenuRef}>
                        <button
                          type="button"
                          aria-haspopup="listbox"
                          aria-expanded={resolutionMenuOpen}
                          aria-label={`Chart resolution, ${advancedResolution.label}`}
                          onClick={(e) => {
                            e.stopPropagation()
                            setResolutionMenuOpen((openNow) => {
                              if (!openNow) {
                                setChartTypeMenuOpen(false)
                                setIndicatorMenuOpen(false)
                              }
                              return !openNow
                            })
                          }}
                          className={`${ADVANCED_CHART_TOOLBAR_BTN} ${advancedChartToolbarBtnTone(
                            advancedResolutionId !== DEFAULT_MARKET_CHART_RESOLUTION_ID,
                            mutedClass,
                          )}`}
                        >
                          <span className={ADVANCED_CHART_TOOLBAR_RESOLUTION_LABEL}>
                            {advancedResolution.label}
                          </span>
                        </button>
                        {resolutionMenuOpen ? (
                          <div
                            role="listbox"
                            aria-label="Chart resolution"
                            className={`${ADVANCED_CHART_TOOLBAR_MENU_ANCHOR} ${ADVANCED_CHART_TOOLBAR_MENU_PANEL} max-h-[min(16rem,50vh)] min-w-[5.5rem] overflow-y-auto`}
                            onClick={(e) => e.stopPropagation()}
                          >
                            {MARKET_CHART_RESOLUTIONS.map((row) => {
                              const on = row.id === advancedResolutionId
                              return (
                                <button
                                  key={row.id}
                                  type="button"
                                  role="option"
                                  aria-selected={on}
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    selectAdvancedResolutionId(row.id)
                                  }}
                                  className={`flex w-full items-center gap-2 px-3 py-2 text-left text-[12px] touch-manipulation hover:bg-zinc-800 active:bg-zinc-800/90 ${
                                    on ? 'text-cyan-200' : 'text-zinc-200'
                                  }`}
                                >
                                  <span
                                    className={`inline-flex h-3.5 w-3.5 shrink-0 items-center justify-center text-[11px] ${
                                      on ? 'text-cyan-400' : 'text-transparent'
                                    }`}
                                    aria-hidden="true"
                                  >
                                    ✓
                                  </span>
                                  {row.label}
                                </button>
                              )
                            })}
                          </div>
                        ) : null}
                      </div>
                      </div>
                      <div className="ml-auto flex shrink-0 items-center gap-4">
                      <button
                        type="button"
                        aria-label="Annotate chart"
                        onClick={(e) => {
                          e.stopPropagation()
                          enterAnnotateMode()
                        }}
                        className={`${ADVANCED_CHART_TOOLBAR_BTN} ${advancedChartToolbarBtnTone(false, mutedClass)} hover:text-cyan-300`}
                      >
                        <span className={ADVANCED_CHART_TOOLBAR_LEADING_SLOT}>
                          <PencilLine className={ADVANCED_CHART_TOOLBAR_ICON} aria-hidden />
                        </span>
                      </button>
                      <MarketChartSnapshotButton
                        menuRef={snapshotMenuRef}
                        menuOpen={snapshotMenuOpen}
                        onToggleMenu={toggleSnapshotMenu}
                        disabled={snapshotDisabled}
                        busy={snapshotBusy}
                        status={snapshotFlash}
                        canInsert={typeof onInsertSnapshot === 'function'}
                        onSave={() => void runMarketChartSnapshot('save')}
                        onInsert={() => void runMarketChartSnapshot('insert')}
                        mutedClass={mutedClass}
                      />
                      </div>
                        </>
                      )}
                  </div>
                </div>
              </div>
            </div>
          </div>,
          document.body,
        )
      : null

  return (
    <>
      {createPortal(
    <div
      className="fixed inset-0 z-[105] flex flex-col justify-end backdrop-blur-[2px] transition-[background-color] duration-200 motion-reduce:transition-none"
      style={{ backgroundColor: `rgba(0,0,0,${backdropOpacity})` }}
      role="dialog"
      aria-modal="true"
      aria-label={`${active?.display_symbol || 'Market'} chart`}
    >
      <button
        type="button"
        className="absolute inset-0 cursor-default"
        aria-label="Close chart"
        onClick={dismissSheet}
      />
      <div
        className={`relative z-10 flex w-full max-w-none shrink-0 flex-col rounded-none border-x-0 border-b-0 border-t shadow-2xl will-change-transform motion-reduce:transition-none ${shellClass} ${
          sheetDragging ? 'touch-none' : ''
        }`}
        data-lounge-market-chart-modal
        style={{
          height: MARKET_CHART_MODAL_HEIGHT,
          maxHeight: MARKET_CHART_MODAL_HEIGHT,
          transform: sheetTransform,
          transition: sheetTransition,
        }}
        onClick={(e) => e.stopPropagation()}
        onPointerDown={onSheetPointerDown}
        onPointerMove={onSheetPointerMove}
        onPointerUp={onSheetPointerEnd}
        onPointerCancel={onSheetPointerCancel}
      >
        <div
          className={`flex shrink-0 justify-center px-4 pb-1 pt-2 ${borderClass}`}
          data-market-sheet-drag
        >
          <div className="h-1 w-10 rounded-full bg-zinc-500/35" aria-hidden />
        </div>

        <div className="shrink-0 px-4 pb-1 pt-0" data-market-sheet-drag>
          <div className="flex items-start gap-3">
            <MarketEmbedLogo
              embed={active}
              imgClass="h-10 w-10 shrink-0 rounded-full object-cover"
              fallbackClass="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-zinc-800 text-sm font-bold text-zinc-300"
            />
            <div className="min-w-0 flex-1">
              <div className="truncate text-[17px] font-bold leading-tight">
                {active?.name || active?.display_symbol}
              </div>
              <div className={`truncate text-[13px] leading-snug ${mutedClass}`}>
                ${active?.display_symbol}
                {(liveMarketCap ?? active?.market_cap) != null
                  ? ` · ${formatMarketCap(liveMarketCap ?? active.market_cap)} MC`
                  : ''}
              </div>
            </div>
            <div className="shrink-0 text-right">
              <div className="text-[22px] font-bold leading-none tabular-nums tracking-tight">
                {formatMarketPrice(displayQuote?.price)}
              </div>
              <div
                className={`mt-0.5 text-[13px] font-semibold tabular-nums ${displayUp ? 'text-lv-green' : 'text-lv-red'}`}
              >
                {formatMarketChangeLine(displayQuote?.change, displayChangePct)}
              </div>
            </div>
          </div>
          {list.length > 1 ? (
            <div className="mt-2 flex gap-2 overflow-x-auto pb-0.5">
              {list.map((embed, i) => (
                <button
                  key={`${embed.symbol}-${embed.kind}`}
                  type="button"
                  onClick={() => {
                    setActiveIdx(i)
                    setTimeframeIdx(
                      MARKET_MODAL_DEFAULT_TIMEFRAME_IDX >= 0 ? MARKET_MODAL_DEFAULT_TIMEFRAME_IDX : 0,
                    )
                  }}
                  className={`shrink-0 rounded-full px-3 py-1 text-sm font-semibold touch-manipulation ${
                    i === activeIdx ? 'bg-cyan-500/20 text-cyan-300' : pillIdleClass
                  }`}
                >
                  ${embed.display_symbol}
                </button>
              ))}
            </div>
          ) : null}
        </div>

        <div
          className="relative w-full shrink-0 overflow-hidden"
          style={{ height: MARKET_CHART_HEIGHT_PX }}
          data-lounge-market-chart-area
        >
          <div
            className="absolute inset-x-0 top-0"
            style={{ bottom: MARKET_CHART_TIMEFRAME_BAND_PX }}
          >
            <div ref={chartHostRef} className="absolute inset-0 touch-none select-none" />
            {!advancedFullscreenOpen ? (
            <div
              className="pointer-events-none absolute inset-y-0 right-0 z-10"
              style={{ width: MARKET_CHART_PRICE_AXIS_GUTTER_PX }}
            >
              {priceAxisLabels.high ? (
                <div
                  className={`absolute right-0 -translate-y-1/2 whitespace-nowrap pr-0.5 text-[10px] font-bold tabular-nums ${mutedClass}`}
                  style={{ top: priceAxisLabels.high.y }}
                >
                  {formatMarketPrice(priceAxisLabels.high.price)}
                </div>
              ) : null}
              {axisCurrentLabel ? (
                <div
                  className={`absolute right-0 -translate-y-1/2 whitespace-nowrap pr-0.5 text-[10px] font-semibold tabular-nums ${displayUp ? 'text-lv-green' : 'text-lv-red'}`}
                  style={{ top: axisCurrentLabel.y }}
                >
                  {formatMarketPrice(axisCurrentLabel.price)}
                </div>
              ) : null}
              {priceAxisLabels.low ? (
                <div
                  className={`absolute right-0 -translate-y-1/2 whitespace-nowrap pr-0.5 text-[10px] font-bold tabular-nums ${mutedClass}`}
                  style={{ top: priceAxisLabels.low.y }}
                >
                  {formatMarketPrice(priceAxisLabels.low.price)}
                </div>
              ) : null}
            </div>
            ) : null}
          </div>

          <div
            className="absolute inset-x-3 bottom-0.5 z-10 flex items-end gap-2"
            data-market-sheet-no-drag
          >
            <button
              type="button"
              aria-label="Open advanced chart fullscreen"
              title="Fullscreen landscape chart with grid, axes, and indicators"
              onClick={(e) => {
                e.stopPropagation()
                openAdvancedFullscreen()
              }}
              className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold leading-none touch-manipulation ${mutedClass} hover:text-cyan-300`}
            >
              Advanced
            </button>
            <div className="flex min-w-0 flex-1 justify-between gap-0.5">
              {MARKET_MODAL_TIMEFRAMES.map((tf, i) => (
                <button
                  key={tf.label}
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation()
                    setTimeframeIdx(i)
                  }}
                  className={`min-w-0 flex-1 rounded-sm bg-transparent px-0.5 py-0.5 text-center text-[10px] leading-none touch-manipulation border-b ${
                    i === timeframeIdx
                      ? 'border-zinc-50 font-bold text-zinc-50'
                      : 'border-transparent font-medium text-zinc-400 hover:text-zinc-300'
                  }`}
                >
                  {tf.label}
                </button>
              ))}
            </div>
          </div>
          {loading ? (
            <div className={`absolute inset-0 z-[1] grid place-items-center text-sm ${mutedClass}`}>
              Loading…
            </div>
          ) : null}
        </div>

        <div className={`min-h-[5.5rem] shrink-0 border-t px-4 py-3 ${borderClass}`} data-market-sheet-drag>
          {newsLoading ? (
            <div className={`text-[13px] ${mutedClass}`}>Loading latest news…</div>
          ) : news?.headline ? (
            news.url ? (
              <a
                href={news.url}
                target="_blank"
                rel="noopener noreferrer"
                className="group block touch-manipulation hover:text-zinc-200"
                onClick={(e) => e.stopPropagation()}
              >
                <div className={`text-[11px] font-semibold uppercase tracking-wide ${mutedClass}`}>Latest</div>
                <div className="mt-0.5 line-clamp-2 text-[14px] font-medium leading-snug group-hover:underline">
                  {news.headline}
                </div>
                <div className={`mt-1 text-[12px] ${mutedClass}`}>
                  {[news.source, formatNewsAge(news.datetime)].filter(Boolean).join(' · ')}
                </div>
              </a>
            ) : (
              <div>
                <div className={`text-[11px] font-semibold uppercase tracking-wide ${mutedClass}`}>Latest</div>
                <div className="mt-0.5 line-clamp-2 text-[14px] font-medium leading-snug">{news.headline}</div>
                <div className={`mt-1 text-[12px] ${mutedClass}`}>
                  {[news.source, formatNewsAge(news.datetime)].filter(Boolean).join(' · ')}
                </div>
              </div>
            )
          ) : (
            <div className={`text-[13px] ${mutedClass}`}>No recent headlines for ${active?.display_symbol}.</div>
          )}
        </div>

        <div className={`flex shrink-0 gap-6 border-b px-4 ${borderClass}`} data-market-sheet-drag>
          {[
            { id: LOUNGE_SEARCH_SORT.ENGAGEMENT, label: 'Top' },
            { id: LOUNGE_SEARCH_SORT.RECENT, label: 'Latest' },
          ].map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setPostSort(tab.id)}
              className={`-mb-px border-b-2 pb-2.5 pt-1 text-[15px] font-semibold touch-manipulation ${
                postSort === tab.id ? tabActiveClass : tabIdleClass
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-[max(1rem,env(safe-area-inset-bottom))]" ref={postsScrollRef}>
          {postsLoading ? (
            <div className={`py-8 text-center text-sm ${mutedClass}`}>Loading posts…</div>
          ) : postsErr ? (
            <div className="py-8 text-center text-sm text-lv-red">{postsErr}</div>
          ) : posts.length === 0 ? (
            <div className={`py-8 text-center text-sm ${mutedClass}`}>
              No Lounge posts mentioning ${active?.display_symbol} yet.
            </div>
          ) : (
            <ul className={`divide-y ${borderClass}`}>
              {posts.map((post) => {
                const profile = post.author_profile
                const caption = feedPostDisplayCaption(post)
                return (
                  <li key={post.id}>
                    <button
                      type="button"
                      className="flex w-full gap-3 py-3 text-left touch-manipulation hover:bg-zinc-900/60 active:opacity-90"
                      onClick={() => {
                        onOpenPost?.(post)
                        dismissSheet()
                      }}
                    >
                      {profile?.avatar_url ? (
                        <img src={profile.avatar_url} alt="" className="h-9 w-9 shrink-0 rounded-full object-cover" />
                      ) : (
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-zinc-800 text-xs font-bold text-zinc-300">
                          {(profile?.display_name || profile?.handle || '?').slice(0, 1).toUpperCase()}
                        </div>
                      )}
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-baseline gap-x-1.5 gap-y-0.5">
                          <span className="truncate text-[14px] font-bold">
                            {profile?.display_name || profile?.handle || 'Member'}
                          </span>
                          {profile?.handle ? (
                            <span className={`truncate text-[13px] ${mutedClass}`}>@{profile.handle}</span>
                          ) : null}
                          <span className={`text-[13px] ${mutedClass}`}>· {formatPostAge(post.created_at)}</span>
                        </div>
                        {caption ? (
                          <p className={`mt-1 line-clamp-3 whitespace-pre-wrap break-words text-[14px] leading-snug ${mutedClass}`}>
                            {caption}
                          </p>
                        ) : null}
                      </div>
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      </div>
    </div>,
    document.body,
      )}
      {advancedFullscreenPortal}
    </>
  )
}
