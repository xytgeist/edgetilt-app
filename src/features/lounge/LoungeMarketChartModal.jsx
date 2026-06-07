import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { createChart, createSeriesMarkers } from 'lightweight-charts'
import { feedPostDisplayCaption } from '../../utils/communityFeedPost.js'
import {
  formatMarketCap,
  formatMarketChangeLine,
  formatMarketPrice,
  marketEmbedCacheKey,
  marketEmbedSearchCashtag,
  pickRollingMarketPayload,
  MARKET_MODAL_DEFAULT_TIMEFRAME_IDX,
  MARKET_MODAL_TIMEFRAMES,
} from '../../utils/loungeMarketCaptionParse.js'
import { loungeMarketModalNews, loungeMarketModalSeries, loungeMarketModalSeriesBefore, mergeMarketBarsOlder } from '../../utils/loungeMarketApi.js'
import { isUsableStockIntradayBars, isUsEquityRegularSessionOpen } from '../../utils/usEquityMarketSession.js'
import { formatLoungeSearchError, loungeSearchCashtagPosts, LOUNGE_SEARCH_SORT } from './loungeSearchApi.js'
import { useLoungeMarketFeedQuotes } from './LoungeMarketFeedContext.jsx'
import { loungeMarketBarsToSeries, loungeMarketChartCrosshairOptions, loungeMarketChartIsLight, loungeMarketChartTheme } from './loungeMarketChartTheme.js'
import {
  attachMarketChartIndicators,
  computeMarketChartOverlayLines,
  MARKET_CHART_INDICATORS,
  listActiveIndicatorLegend,
  marketIndicatorLegendItems,
  readStoredMarketChartIndicators,
  writeStoredMarketChartIndicators,
} from './loungeMarketChartIndicators.js'
import {
  attachModalMainChartSeries,
  loungeMarketBarsToCandlestickSeries,
  marketModalChartHighLow,
  marketModalChartTypeLabel,
  MARKET_MODAL_CHART_TYPES,
  readStoredMarketChartType,
  writeStoredMarketChartType,
} from './loungeMarketChartTypes.js'
import {
  attachMarketChartVolumePane,
  MARKET_CHART_VOLUME_PANE_FRACTION,
  marketChartMainBottomMarginWithVolume,
} from './loungeMarketChartVolume.js'
import {
  isMarketChartPortraitViewport,
  lockMarketChartLandscapeOrientation,
  marketChartAdvancedFullscreenShellStyle,
  marketChartAdvancedPlotWrapStyle,
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
  scrollMarketChartByPixels,
  shiftMarketChartLogicalRange,
} from './loungeMarketChartPan.js'
import { refreshAdvancedMarketChartData } from './loungeMarketChartDataSync.js'
import {
  marketChartAdvancedHandleScaleOptions,
  marketChartAdvancedLocalization,
  marketChartAdvancedPriceScaleOptions,
  marketChartAdvancedTimeScaleOptions,
  marketChartAnalysisGrid,
  writeStoredMarketChartViewMode,
} from './loungeMarketChartViewMode.js'

const SHEET_DISMISS_PX = 88
const SHEET_DISMISS_VEL = 0.45
/** Chart canvas stops above this band — timeframe pills sit in the gap. */
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
  if (opts.chartType === 'candle' && opts.rawBars?.length) {
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
    e.stopPropagation()
    resetGesture()
    mode = 'pending'
    activePointerId = e.pointerId
    startX = e.clientX
    startY = e.clientY
    applyScrubAt(e.clientX, e.clientY)
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
      if (dx * dx + dy * dy >= MARKET_CHART_GESTURE_SLOP_PX * MARKET_CHART_GESTURE_SLOP_PX) {
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

  const opts = { capture: true }
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

/**
 * @param {{
 *   open: boolean,
 *   embeds: object[],
 *   focusSymbol?: string | null,
 *   supabaseClient: import('@supabase/supabase-js').SupabaseClient,
 *   onClose: () => void,
 *   hydratePosts?: (rows: object[]) => Promise<object[]>,
 *   onOpenPost?: (post: object) => void,
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
}) {
  const chartHostRef = useRef(null)
  const advancedChartHostRef = useRef(null)
  const advancedFullscreenRootRef = useRef(null)
  const chartRef = useRef(null)
  const mainSeriesRef = useRef(null)
  const indicatorMenuRef = useRef(null)
  const chartTypeMenuRef = useRef(null)
  const timeframeMenuRef = useRef(null)
  const postsScrollRef = useRef(null)
  const sheetDragRef = useRef(null)
  const [sheetDragY, setSheetDragY] = useState(0)
  const [sheetDragging, setSheetDragging] = useState(false)
  const [sheetClosing, setSheetClosing] = useState(false)
  const [activeIdx, setActiveIdx] = useState(0)
  const [timeframeIdx, setTimeframeIdx] = useState(0)
  const [series, setSeries] = useState(/** @type {{ quote?: object, bars?: object[], window_label?: string } | null} */ (null))
  const [seriesScope, setSeriesScope] = useState('')
  const loadSeriesGenRef = useRef(0)
  const [historyBars, setHistoryBars] = useState(/** @type {object[]} */ ([]))
  const [historyHasMore, setHistoryHasMore] = useState(true)
  const historyLoadingRef = useRef(false)
  const historyHasMoreRef = useRef(true)
  const loadMoreHistoryRef = useRef(/** @type {(beforeSec: number) => void} */ (() => {}))
  const historyFlushPendingRef = useRef(/** @type {(() => void) | null} */ (null))
  const historyAckBarsRef = useRef(/** @type {(() => void) | null} */ (null))
  const historyResetAnchorRef = useRef(/** @type {(() => void) | null} */ (null))
  const chartPanningRef = useRef(false)
  const pendingHistoryApplyRef = useRef(/** @type {(() => void) | null} */ (null))
  const advancedBarsSignatureRef = useRef('')
  const volumeSeriesRef = useRef(null)
  const indicatorSeriesRef = useRef(/** @type {import('lightweight-charts').ISeriesApi[]} */ ([]))
  const chartSeriesRef = useRef(null)
  const allBarsRef = useRef(/** @type {object[]} */ ([]))
  const priceScaleUserPinnedRef = useRef(false)
  const [loading, setLoading] = useState(false)
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
  /** Crosshair scrub overrides header quote until pointer leaves the chart. */
  const [scrubQuote, setScrubQuote] = useState(/** @type {{ price: number, change?: number, change_pct?: number } | null} */ (null))
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

  const isLight = loungeMarketChartIsLight()
  const { quotes: feedQuotes } = useLoungeMarketFeedQuotes()
  const list = useMemo(() => (Array.isArray(embeds) ? embeds.filter(Boolean) : []), [embeds])
  const timeframe = MARKET_MODAL_TIMEFRAMES[timeframeIdx] || MARKET_MODAL_TIMEFRAMES[0]

  useEffect(() => {
    if (!open || !list.length) return
    const idx = focusSymbol
      ? Math.max(0, list.findIndex((e) => e.display_symbol === focusSymbol || e.symbol === focusSymbol))
      : 0
    setActiveIdx(idx >= 0 ? idx : 0)
    setTimeframeIdx(MARKET_MODAL_DEFAULT_TIMEFRAME_IDX >= 0 ? MARKET_MODAL_DEFAULT_TIMEFRAME_IDX : 0)
    setPostSort(LOUNGE_SEARCH_SORT.ENGAGEMENT)
  }, [open, focusSymbol, list])

  const active = list[activeIdx] || null
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
    if (!indicatorMenuOpen && !chartTypeMenuOpen && !timeframeMenuOpen) return undefined
    const onPointerDown = (e) => {
      if (indicatorMenuRef.current?.contains(e.target)) return
      if (chartTypeMenuRef.current?.contains(e.target)) return
      if (timeframeMenuRef.current?.contains(e.target)) return
      setIndicatorMenuOpen(false)
      setChartTypeMenuOpen(false)
      setTimeframeMenuOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown, true)
    return () => document.removeEventListener('pointerdown', onPointerDown, true)
  }, [chartTypeMenuOpen, indicatorMenuOpen, timeframeMenuOpen])

  const selectChartType = useCallback((id) => {
    setChartType(id)
    writeStoredMarketChartType(id)
    setChartTypeMenuOpen(false)
  }, [])

  const selectTimeframeIdx = useCallback((idx) => {
    setTimeframeIdx(idx)
    setTimeframeMenuOpen(false)
  }, [])

  const openAdvancedFullscreen = useCallback(() => {
    setIndicatorMenuOpen(false)
    setChartTypeMenuOpen(false)
    setTimeframeMenuOpen(false)
    setChartType('candle')
    void lockMarketChartLandscapeOrientation()
    setAdvancedFullscreenOpen(true)
  }, [])

  const closeAdvancedFullscreen = useCallback(() => {
    setAdvancedFullscreenOpen(false)
    setIndicatorMenuOpen(false)
    setChartTypeMenuOpen(false)
    setTimeframeMenuOpen(false)
    setScrubQuote(null)
    setHistoryBars([])
    setHistoryHasMore(true)
    historyLoadingRef.current = false
    advancedBarsSignatureRef.current = ''
    chartPanningRef.current = false
    pendingHistoryApplyRef.current = null
    historyResetAnchorRef.current?.()
    writeStoredMarketChartViewMode('quick')
  }, [])

  const isAdvancedView = advancedFullscreenOpen
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
    const scroll = postsScrollRef.current
    if (scroll && scroll.contains(target) && scroll.scrollTop <= 0) return true
    return false
  }, [])

  const onSheetPointerDown = useCallback(
    (e) => {
      if (sheetClosing) return
      if (e.button !== 0 && e.pointerType === 'mouse') return
      if (!canStartSheetDrag(e.target)) return
      sheetDragRef.current = {
        pointerId: e.pointerId,
        startY: e.clientY,
        startMs: Date.now(),
      }
      setSheetDragging(true)
      setSheetDragY(0)
      e.currentTarget.setPointerCapture(e.pointerId)
    },
    [canStartSheetDrag, sheetClosing],
  )

  const onSheetPointerMove = useCallback((e) => {
    const drag = sheetDragRef.current
    if (!drag || drag.pointerId !== e.pointerId) return
    const dy = Math.max(0, e.clientY - drag.startY)
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
    loadSeriesGenRef.current += 1
    setSeries(null)
    setSeriesScope('')
    setHistoryBars([])
    setHistoryHasMore(true)
    historyLoadingRef.current = false
    advancedBarsSignatureRef.current = ''
    historyResetAnchorRef.current?.()
  }, [active?.asset_class, active?.symbol, activeIdx, timeframeIdx])

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
      })
      if (gen !== loadSeriesGenRef.current) return
      if (data) {
        setSeries({
          quote: data.quote,
          bars: data.bars,
          window_label: data.window_label,
        })
        setSeriesScope(scope)
      }
    } finally {
      if (gen === loadSeriesGenRef.current) setLoading(false)
    }
  }, [active, open, supabaseClient, timeframeIdx])

  useEffect(() => {
    void loadSeries()
    if (!open || timeframe.kind !== 'rolling') return undefined
    if (active?.asset_class === 'stock' && !isUsEquityRegularSessionOpen()) return undefined
    const id = window.setInterval(() => void loadSeries(), 60_000)
    return () => window.clearInterval(id)
  }, [active?.asset_class, loadSeries, open, timeframe.kind])

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
    const base = chartSeries?.bars || []
    return mergeMarketBarsOlder(base, historyBars)
  }, [chartSeries?.bars, historyBars])

  chartSeriesRef.current = chartSeries
  allBarsRef.current = allBars

  const applyAdvancedHistoryBars = useCallback(
    (nextAll, added) => {
      const chart = chartRef.current
      const mainSeries = mainSeriesRef.current
      if (!chart || !mainSeries || added <= 0) return

      const run = () => {
        if (!chartRef.current || !mainSeriesRef.current) return
        const barPoints = loungeMarketBarsToSeries(nextAll)
        const overlayLines = computeMarketChartOverlayLines(barPoints, activeIndicators)
        const refreshed = refreshAdvancedMarketChartData({
          chart: chartRef.current,
          mainSeries: mainSeriesRef.current,
          volumeSeries: volumeSeriesRef.current,
          indicatorSeries: indicatorSeriesRef.current,
          rawBars: nextAll,
          chartType: effectiveChartType,
          activeIndicators,
          isLight,
          volumePaneFraction: MARKET_CHART_VOLUME_PANE_FRACTION,
          applyPriceRange: priceScaleUserPinnedRef.current
            ? undefined
            : () => {
                applyMarketChartPriceRange(mainSeriesRef.current, barPoints, overlayLines, {
                  keepMargins: true,
                  chartType: effectiveChartType,
                  rawBars: nextAll,
                })
              },
        })
        volumeSeriesRef.current = refreshed.volumeSeries
        indicatorSeriesRef.current = refreshed.indicatorSeries
        shiftMarketChartLogicalRange(chartRef.current, added)
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
      try {
        const tf = MARKET_MODAL_TIMEFRAMES[timeframeIdx] || MARKET_MODAL_TIMEFRAMES[0]
        const data = await loungeMarketModalSeriesBefore(supabaseClient, {
          symbol: active.symbol,
          asset_class: active.asset_class,
          kind: tf.kind,
          window_key: tf.windowKey,
          before_sec: beforeSec,
        })
        if (!data) return
        if (!data.bars?.length) {
          setHistoryHasMore(false)
          return
        }
        let nextAll = /** @type {object[]} */ ([])
        let added = 0
        setHistoryBars((prev) => {
          const nextHistory = mergeMarketBarsOlder(prev, data.bars)
          const base = chartSeriesRef.current?.bars || []
          const prevAll = mergeMarketBarsOlder(base, prev)
          nextAll = mergeMarketBarsOlder(base, nextHistory)
          added = nextAll.length - prevAll.length
          return nextHistory
        })
        allBarsRef.current = nextAll
        applyAdvancedHistoryBars(nextAll, added)
        if (data.has_more === false) setHistoryHasMore(false)
      } finally {
        historyLoadingRef.current = false
      }
    },
    [
      active,
      advancedFullscreenOpen,
      applyAdvancedHistoryBars,
      historyHasMore,
      supabaseClient,
      timeframeIdx,
    ],
  )

  historyHasMoreRef.current = historyHasMore
  loadMoreHistoryRef.current = loadMoreHistory

  const quote = chartSeries?.quote || active?.quote
  const displayQuote = scrubQuote ?? quote
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
        if (advancedFullscreenOpen) {
          e.stopPropagation()
          closeAdvancedFullscreen()
          return
        }
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
        if (timeframeMenuOpen) {
          e.stopPropagation()
          setTimeframeMenuOpen(false)
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
  }, [advancedFullscreenOpen, chartTypeMenuOpen, closeAdvancedFullscreen, dismissSheet, indicatorMenuOpen, open, timeframeMenuOpen])

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
      },
      localization: isAdvancedView ? marketChartAdvancedLocalization(timeframe.label) : undefined,
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
        ? marketChartAdvancedTimeScaleOptions(timeframe.label, isLight)
        : {
            visible: false,
            borderVisible: false,
            rightOffset: 0,
            rightOffsetPixels: 0,
            fixRightEdge: true,
          },
      crosshair: loungeMarketChartCrosshairOptions(isAdvancedView, isLight),
    })
    const rawBars = allBarsRef.current?.length ? allBarsRef.current : chartSeries?.bars || []
    const barPoints = loungeMarketBarsToSeries(rawBars)
    const overlayLines = isAdvancedView
      ? computeMarketChartOverlayLines(barPoints, activeIndicators)
      : []
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
    const hasOscillatorPane =
      isAdvancedView &&
      MARKET_CHART_INDICATORS.some((row) => row.kind === 'oscillator' && activeIndicators.has(row.id))
    const oscillatorCount = isAdvancedView
      ? MARKET_CHART_INDICATORS.filter((row) => row.kind === 'oscillator' && activeIndicators.has(row.id)).length
      : 0
    if (isAdvancedView) {
      indicatorSeriesRef.current = attachMarketChartIndicators(chart, mainSeries, barPoints, activeIndicators, {
        isLight,
        volumePaneFraction: MARKET_CHART_VOLUME_PANE_FRACTION,
      })
      volumeSeriesRef.current = attachMarketChartVolumePane(chart, rawBars, { isLight })
      mainSeries.priceScale().applyOptions({
        scaleMargins: {
          top: 0.06,
          bottom: marketChartMainBottomMarginWithVolume(hasOscillatorPane, oscillatorCount),
        },
      })
    }
    if (isAdvancedView) {
      applyMarketChartPriceRange(mainSeries, barPoints, overlayLines, {
        keepMargins: true,
        chartType: effectiveChartType,
        rawBars,
      })
    } else {
      applyMarketChartPriceRange(mainSeries, barPoints, [], {
        chartType: effectiveChartType,
        rawBars,
      })
    }
    if (effectiveChartType !== 'candle') {
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
    const priceAxisBottomExclude = marketChartMainBottomMarginWithVolume(hasOscillatorPane, oscillatorCount)
    const resetPriceScaleToData = () => {
      priceScaleUserPinned = false
      priceScaleUserPinnedRef.current = false
      if (!isAdvancedView) return
      applyMarketChartPriceRange(mainSeries, barPoints, overlayLines, {
        keepMargins: true,
        chartType: effectiveChartType,
        rawBars,
      })
    }
    const priceAxisHit = (clientX, clientY) =>
      isAdvancedView &&
      marketChartPriceAxisHit(
        clientX,
        clientY ?? 0,
        el.getBoundingClientRect(),
        chart.priceScale('right').width() || 52,
        priceAxisBottomExclude,
      )

    const refreshChartOverlays = () => {
      if (isAdvancedView) {
        if (!priceScaleUserPinned) {
          applyMarketChartPriceRange(mainSeries, barPoints, overlayLines, {
            keepMargins: true,
            chartType: effectiveChartType,
            rawBars,
          })
        }
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
          bottomExcludeFraction: priceAxisBottomExclude,
          onUserZoom: () => {
            priceScaleUserPinned = true
            priceScaleUserPinnedRef.current = true
          },
          onReset: resetPriceScaleToData,
        })
      : () => {}

    const unbindPan = isAdvancedView
      ? bindMarketChartPanPointer(el, chart, {
          priceAxisHit,
          onPanActiveChange: (active) => {
            chartPanningRef.current = active
            if (active) return
            requestAnimationFrame(() => {
              if (chartPanningRef.current) return
              historyFlushPendingRef.current?.()
              const pending = pendingHistoryApplyRef.current
              pendingHistoryApplyRef.current = null
              if (pending) requestAnimationFrame(pending)
            })
          },
        })
      : () => {}

    const historyLoader = isAdvancedView
      ? bindMarketChartHistoryLoader(
          chart,
          () => allBarsRef.current,
          (beforeSec) => {
            void loadMoreHistoryRef.current(beforeSec)
          },
          {
            canLoad: () => historyHasMoreRef.current && !historyLoadingRef.current,
            isPanning: () => chartPanningRef.current,
          },
        )
      : null
    historyFlushPendingRef.current = historyLoader?.flushPending ?? null
    historyAckBarsRef.current = historyLoader?.acknowledgeBars ?? null
    historyResetAnchorRef.current = historyLoader?.resetAnchor ?? null
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
        if (!isAdvancedView) {
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
    if (isAdvancedView) {
      advancedBarsSignatureRef.current = marketChartBarsSignature(rawBars)
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          if (!chartRef.current || !el.isConnected) return
          chartRef.current.timeScale().fitContent()
        })
      })
    }
    return () => {
      cancelAnimationFrame(resizeRaf)
      historyFlushPendingRef.current = null
      historyAckBarsRef.current = null
      historyResetAnchorRef.current = null
      chartPanningRef.current = false
      pendingHistoryApplyRef.current = null
      unbindPriceAxisZoom()
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
      setScrubQuote(null)
      setScrubAxisCurrent(null)
    }
  }, [
    active?.symbol,
    activeIndicatorKey,
    advancedFullscreenOpen,
    effectiveChartType,
    isLight,
    open,
    seriesScope,
    timeframe.label,
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
    if (effectiveChartType === 'candle') {
      mainSeries.setData(loungeMarketBarsToCandlestickSeries(rawBars))
    } else {
      mainSeries.setData(barPoints)
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

  /** Advanced: refresh series in place on live bar updates — avoid remounting the chart. */
  useEffect(() => {
    if (!open || !advancedFullscreenOpen || !isAdvancedView) return
    if (chartPanningRef.current) return
    const chart = chartRef.current
    const mainSeries = mainSeriesRef.current
    if (!chart || !mainSeries) return
    const rawBars = allBarsRef.current
    if (!rawBars?.length) return
    const signature = marketChartBarsSignature(rawBars)
    if (signature === advancedBarsSignatureRef.current) return
    advancedBarsSignatureRef.current = signature
    const barPoints = loungeMarketBarsToSeries(rawBars)
    const overlayLines = computeMarketChartOverlayLines(barPoints, activeIndicators)
    const lineColor = chartUp ? theme.upColor : theme.downColor
    const hasOscillatorPane = MARKET_CHART_INDICATORS.some(
      (row) => row.kind === 'oscillator' && activeIndicators.has(row.id),
    )
    const oscillatorCount = MARKET_CHART_INDICATORS.filter(
      (row) => row.kind === 'oscillator' && activeIndicators.has(row.id),
    ).length
    const refreshed = refreshAdvancedMarketChartData({
      chart,
      mainSeries,
      volumeSeries: volumeSeriesRef.current,
      indicatorSeries: indicatorSeriesRef.current,
      rawBars,
      chartType: effectiveChartType,
      activeIndicators,
      isLight,
      volumePaneFraction: MARKET_CHART_VOLUME_PANE_FRACTION,
      applyPriceRange: priceScaleUserPinnedRef.current
        ? undefined
        : () => {
            applyMarketChartPriceRange(mainSeries, barPoints, overlayLines, {
              keepMargins: true,
              chartType: effectiveChartType,
              rawBars,
            })
          },
    })
    volumeSeriesRef.current = refreshed.volumeSeries
    indicatorSeriesRef.current = refreshed.indicatorSeries
    if (effectiveChartType !== 'candle') {
      setChartLineMarkers(mainSeries, barPoints, lineColor)
    }
    mainSeries.priceScale().applyOptions({
      scaleMargins: {
        top: 0.06,
        bottom: marketChartMainBottomMarginWithVolume(hasOscillatorPane, oscillatorCount),
      },
    })
  }, [
    open,
    advancedFullscreenOpen,
    isAdvancedView,
    chartSeries?.bars,
    effectiveChartType,
    activeIndicatorKey,
    isLight,
    chartUp,
    theme.upColor,
    theme.downColor,
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
  const advancedPlotWrapStyle = marketChartAdvancedPlotWrapStyle()

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
                {active?.logo_url ? (
                  <img src={active.logo_url} alt="" className="h-8 w-8 shrink-0 rounded-full object-cover" />
                ) : (
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-zinc-800 text-xs font-bold text-zinc-300">
                    {(active?.display_symbol || '?').slice(0, 1)}
                  </div>
                )}
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

              <div className="relative min-h-0 flex-1 overflow-hidden">
                <div style={advancedPlotWrapStyle}>
                  <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
                <div
                  className="relative min-h-0 flex-1 overflow-hidden"
                >
                  <div ref={advancedChartHostRef} className="absolute inset-0 touch-none select-none" />
                  {activeIndicatorLegend.length ? (
                    <div
                      className="pointer-events-none absolute left-2 top-2 z-10 max-w-[min(100%,14rem)] rounded-md border border-zinc-700/70 bg-zinc-950/85 px-2 py-1.5 backdrop-blur-[2px]"
                      aria-label="Indicator legend"
                    >
                      <div className={`mb-1 text-[9px] font-semibold uppercase tracking-wide ${mutedClass}`}>
                        Legend
                      </div>
                      <ul className="flex flex-col gap-1">
                        {activeIndicatorLegend.map((row) => (
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
                  ) : null}
                </div>

                <div
                  className="relative z-10 flex shrink-0 items-end gap-2 px-3 pb-0.5"
                  style={{
                    paddingBottom: 'max(0.125rem, env(safe-area-inset-bottom, 0px))',
                    paddingLeft: 'max(0.75rem, env(safe-area-inset-left, 0px))',
                    paddingRight: 'max(0.75rem, env(safe-area-inset-right, 0px))',
                  }}
                >
                  <div className="relative shrink-0" ref={chartTypeMenuRef}>
                    <button
                      type="button"
                      aria-haspopup="listbox"
                      aria-expanded={chartTypeMenuOpen}
                      aria-label="Chart type"
                      onClick={(e) => {
                        e.stopPropagation()
                        setChartTypeMenuOpen((openNow) => {
                          if (!openNow) {
                            setIndicatorMenuOpen(false)
                            setTimeframeMenuOpen(false)
                          }
                          return !openNow
                        })
                      }}
                      className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold leading-none touch-manipulation ${
                        chartType !== 'candle'
                          ? 'text-cyan-300 hover:text-cyan-200'
                          : `${mutedClass} hover:text-zinc-300`
                      }`}
                    >
                      {marketModalChartTypeLabel(chartType)}
                      <span aria-hidden="true">{chartTypeMenuOpen ? ' ▴' : ' ▾'}</span>
                    </button>
                    {chartTypeMenuOpen ? (
                      <div
                        role="listbox"
                        aria-label="Chart type"
                        className="absolute bottom-full left-0 z-20 mb-1 min-w-[7.5rem] overflow-hidden rounded-lg border border-zinc-700/90 bg-zinc-900 py-1 shadow-2xl"
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
                  <div className="relative shrink-0" ref={indicatorMenuRef}>
                    <button
                      type="button"
                      aria-haspopup="listbox"
                      aria-expanded={indicatorMenuOpen}
                      aria-label="Chart indicators"
                      onClick={(e) => {
                        e.stopPropagation()
                        setIndicatorMenuOpen((openNow) => {
                          if (!openNow) {
                            setChartTypeMenuOpen(false)
                            setTimeframeMenuOpen(false)
                          }
                          return !openNow
                        })
                      }}
                      className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold leading-none touch-manipulation ${
                        activeIndicatorCount
                          ? 'text-cyan-300 hover:text-cyan-200'
                          : `${mutedClass} hover:text-zinc-300`
                      }`}
                    >
                      Indicators
                      {activeIndicatorCount ? ` · ${activeIndicatorCount}` : ''}
                      <span aria-hidden="true">{indicatorMenuOpen ? ' ▴' : ' ▾'}</span>
                    </button>
                    {indicatorMenuOpen ? (
                      <div
                        role="listbox"
                        aria-label="Chart indicators"
                        className="absolute bottom-full left-0 z-20 mb-1 max-h-[min(20rem,45dvh)] min-w-[12rem] overflow-y-auto overscroll-contain rounded-lg border border-zinc-700/90 bg-zinc-900 py-1 shadow-2xl"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {activeIndicatorLegend.length ? (
                          <div className="border-b border-zinc-800 px-3 py-2">
                            <div className={`mb-1.5 text-[10px] font-semibold uppercase tracking-wide ${mutedClass}`}>
                              Legend
                            </div>
                            <ul className="flex flex-col gap-1.5">
                              {activeIndicatorLegend.map((row) => (
                                <li
                                  key={row.key}
                                  className="flex items-center gap-2 text-[11px] leading-none text-zinc-200"
                                >
                                  <MarketIndicatorLegendLine color={row.color} dashed={row.dashed} />
                                  <span>{row.label}</span>
                                </li>
                              ))}
                            </ul>
                          </div>
                        ) : (
                          <div className={`border-b border-zinc-800 px-3 py-2 text-[11px] ${mutedClass}`}>
                            Select indicators to show on chart
                          </div>
                        )}
                        {MARKET_CHART_INDICATORS.map((ind) => {
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
                    ) : null}
                  </div>
                  <div className="relative shrink-0" ref={timeframeMenuRef}>
                    <button
                      type="button"
                      aria-haspopup="listbox"
                      aria-expanded={timeframeMenuOpen}
                      aria-label="Chart timeframe"
                      onClick={(e) => {
                        e.stopPropagation()
                        setTimeframeMenuOpen((openNow) => {
                          if (!openNow) {
                            setChartTypeMenuOpen(false)
                            setIndicatorMenuOpen(false)
                          }
                          return !openNow
                        })
                      }}
                      className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold leading-none touch-manipulation ${
                        timeframeIdx !== MARKET_MODAL_DEFAULT_TIMEFRAME_IDX
                          ? 'text-cyan-300 hover:text-cyan-200'
                          : `${mutedClass} hover:text-zinc-300`
                      }`}
                    >
                      {timeframe.label}
                      <span aria-hidden="true">{timeframeMenuOpen ? ' ▴' : ' ▾'}</span>
                    </button>
                    {timeframeMenuOpen ? (
                      <div
                        role="listbox"
                        aria-label="Chart timeframe"
                        className="absolute bottom-full left-0 z-20 mb-1 min-w-[5.5rem] overflow-hidden rounded-lg border border-zinc-700/90 bg-zinc-900 py-1 shadow-2xl"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {MARKET_MODAL_TIMEFRAMES.map((tf, i) => {
                          const on = i === timeframeIdx
                          return (
                            <button
                              key={tf.label}
                              type="button"
                              role="option"
                              aria-selected={on}
                              onClick={(e) => {
                                e.stopPropagation()
                                selectTimeframeIdx(i)
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
                              {tf.label}
                            </button>
                          )
                        })}
                      </div>
                    ) : null}
                  </div>
                </div>

                {loading ? (
                  <div className={`absolute inset-0 z-[1] grid place-items-center text-sm ${mutedClass}`}>
                    Loading…
                  </div>
                ) : null}
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
      <div className="absolute inset-0 cursor-default" aria-hidden />
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
            {active?.logo_url ? (
              <img src={active.logo_url} alt="" className="h-10 w-10 shrink-0 rounded-full object-cover" />
            ) : (
              <div
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-zinc-800 text-sm font-bold text-zinc-300"
              >
                {(active?.display_symbol || '?').slice(0, 1)}
              </div>
            )}
            <div className="min-w-0 flex-1">
              <div className="truncate text-[17px] font-bold leading-tight">
                {active?.name || active?.display_symbol}
              </div>
              <div className={`truncate text-[13px] leading-snug ${mutedClass}`}>
                ${active?.display_symbol}
                {active?.market_cap != null ? ` · ${formatMarketCap(active.market_cap)} MC` : ''}
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
          data-market-sheet-no-drag
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
