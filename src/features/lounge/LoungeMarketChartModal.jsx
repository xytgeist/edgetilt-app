import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { AreaSeries, createChart, createSeriesMarkers } from 'lightweight-charts'
import { feedPostDisplayCaption } from '../../utils/communityFeedPost.js'
import {
  formatMarketCap,
  formatMarketChangeLine,
  formatMarketPrice,
  marketEmbedSearchCashtag,
  MARKET_MODAL_DEFAULT_TIMEFRAME_IDX,
  MARKET_MODAL_TIMEFRAMES,
} from '../../utils/loungeMarketCaptionParse.js'
import { loungeMarketModalNews, loungeMarketModalSeries } from '../../utils/loungeMarketApi.js'
import { isUsEquityRegularSessionOpen } from '../../utils/usEquityMarketSession.js'
import { formatLoungeSearchError, loungeSearchCashtagPosts, LOUNGE_SEARCH_SORT } from './loungeSearchApi.js'
import { loungeMarketBarsToSeries, loungeMarketChartIsLight, loungeMarketChartTheme, TRADINGVIEW_CHART_ATTRIBUTION_URL } from './loungeMarketChartTheme.js'

const SHEET_DISMISS_PX = 88
const SHEET_DISMISS_VEL = 0.45
/** Chart canvas stops above this band — timeframe pills sit in the gap. */
const MARKET_CHART_TIMEFRAME_BAND_PX = 24
const MARKET_CHART_MODAL_HEIGHT = '90dvh'
const MARKET_CHART_HEIGHT_PX = 360
const MARKET_CHART_PRICE_SCALE_FONT_SIZE = 10
const MARKET_CHART_PRICE_AXIS_GUTTER_PX = 56
const MARKET_CHART_PRICE_AXIS_LABEL_MIN_GAP_PX = 14
const MARKET_CHART_PRICE_SCALE_MARGINS = { top: 0.06, bottom: 0.06 }
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

/** High / low bar in the active timeframe series. */
function barSeriesHighLow(barPoints) {
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

/** Pin Y scale to timeframe high/low so HOD / CURRENT / LOD align with price levels. */
function applyMarketChartPriceRange(area, barPoints) {
  const { high, low } = barSeriesHighLow(barPoints)
  if (!high || !low) return
  const from = Math.min(low.value, high.value)
  const to = Math.max(low.value, high.value)
  if (from === to) {
    area.priceScale().applyOptions({ autoScale: true, scaleMargins: MARKET_CHART_PRICE_SCALE_MARGINS })
    return
  }
  area.priceScale().applyOptions({ autoScale: false, scaleMargins: MARKET_CHART_PRICE_SCALE_MARGINS })
  area.priceScale().setVisibleRange({ from, to })
}

/** HOD / current / LOD price values on the right gutter (three ticks only). */
function buildPriceAxisLabels(area, barPoints) {
  const { high, low } = barSeriesHighLow(barPoints)
  const last = barPoints?.[barPoints.length - 1]
  const currentPrice = Number(last?.value)
  if (!high || !low || !Number.isFinite(currentPrice)) {
    return { high: null, current: null, low: null }
  }

  const lowPrice = Math.min(low.value, high.value)
  const highPrice = Math.max(low.value, high.value)

  const toRow = (id, price) => {
    const y = area.priceToCoordinate(price)
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

/** Fit series to width with the last bar flush to the plot's right edge. */
function fitMarketChartTimeScale(chart) {
  chart.timeScale().applyOptions({ rightOffset: 0, rightOffsetPixels: 0 })
  chart.timeScale().fitContent()
  chart.timeScale().applyOptions({ rightOffset: 0, rightOffsetPixels: 0, fixRightEdge: true })
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

/** Pointer scrub on the plot — no pan/zoom; updates header quote from series data. */
function bindMarketChartScrubPointer(el, chart, area, barPoints, onScrub) {
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
    let price = priceAtSeriesTime(barPoints, time)
    if (!Number.isFinite(price) && barPoints.length) {
      price =
        x <= 0
          ? Number(barPoints[0].value)
          : Number(barPoints[barPoints.length - 1].value)
    }
    if (!Number.isFinite(price)) {
      clearScrub()
      return
    }
    const crosshairTime = time ?? barPoints[barPoints.length - 1]?.time
    if (crosshairTime != null) {
      chart.setCrosshairPosition(price, crosshairTime, area)
    }
    onScrub(scrubQuoteFromBarPoints(barPoints, price))
  }

  const onPointerDown = (e) => {
    e.stopPropagation()
    el.setPointerCapture(e.pointerId)
    applyScrubAt(e.clientX, e.clientY)
  }

  const onPointerMove = (e) => {
    if (el.hasPointerCapture(e.pointerId)) {
      e.stopPropagation()
      applyScrubAt(e.clientX, e.clientY)
      return
    }
    if (e.pointerType === 'mouse' && e.buttons === 0) {
      applyScrubAt(e.clientX, e.clientY)
    }
  }

  const onPointerEnd = (e) => {
    if (el.hasPointerCapture(e.pointerId)) {
      try {
        el.releasePointerCapture(e.pointerId)
      } catch {
        /* ignore */
      }
    }
    clearScrub()
  }

  const onPointerLeave = (e) => {
    if (e.pointerType === 'mouse' && !el.hasPointerCapture(e.pointerId)) {
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
  const chartRef = useRef(null)
  const areaRef = useRef(null)
  const postsScrollRef = useRef(null)
  const sheetDragRef = useRef(null)
  const [sheetDragY, setSheetDragY] = useState(0)
  const [sheetDragging, setSheetDragging] = useState(false)
  const [sheetClosing, setSheetClosing] = useState(false)
  const [activeIdx, setActiveIdx] = useState(0)
  const [timeframeIdx, setTimeframeIdx] = useState(0)
  const [series, setSeries] = useState(/** @type {{ quote?: object, bars?: object[], window_label?: string } | null} */ (null))
  const [loading, setLoading] = useState(false)
  const [news, setNews] = useState(/** @type {object | null} */ (null))
  const [newsLoading, setNewsLoading] = useState(false)
  const [postSort, setPostSort] = useState(LOUNGE_SEARCH_SORT.ENGAGEMENT)
  const [posts, setPosts] = useState(/** @type {object[]} */ ([]))
  const [postsLoading, setPostsLoading] = useState(false)
  const [postsErr, setPostsErr] = useState('')
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

  const loadSeries = useCallback(async () => {
    if (!open || !active || !supabaseClient) return
    setLoading(true)
    try {
      const tf = MARKET_MODAL_TIMEFRAMES[timeframeIdx] || MARKET_MODAL_TIMEFRAMES[0]
      const embedCurrency = String(active.currency || 'USD').trim().toUpperCase() || 'USD'
      if (
        embedCurrency === 'USD' &&
        tf.kind === 'historical' &&
        active.kind === 'historical' &&
        active.bars?.length &&
        tf.windowKey === active.window_key
      ) {
        setSeries({
          quote: active.quote,
          bars: active.bars,
          window_label: active.window_label,
        })
        return
      }
      const data = await loungeMarketModalSeries(supabaseClient, {
        symbol: active.symbol,
        asset_class: active.asset_class,
        kind: tf.kind,
        window_key: tf.windowKey,
      })
      if (data) {
        setSeries({
          quote: data.quote,
          bars: data.bars,
          window_label: data.window_label,
        })
      }
    } finally {
      setLoading(false)
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
  }, [activeIdx, timeframeIdx, series])

  useEffect(() => {
    if (!open) {
      setScrubQuote(null)
      setScrubAxisCurrent(null)
    }
  }, [open])

  const quote = series?.quote || active?.quote
  const displayQuote = scrubQuote ?? quote
  const displayChangePct = Number(displayQuote?.change_pct)
  const displayUp = Number.isFinite(displayChangePct) ? displayChangePct >= 0 : true
  const chartChangePct = Number(quote?.change_pct)
  const chartUp = Number.isFinite(chartChangePct) ? chartChangePct >= 0 : true
  const theme = useMemo(() => loungeMarketChartTheme(isLight), [isLight])

  useEffect(() => {
    if (!open) return undefined
    const onKey = (e) => {
      if (e.key === 'Escape') dismissSheet()
    }
    window.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
      window.removeEventListener('keydown', onKey)
    }
  }, [dismissSheet, open])

  useEffect(() => {
    const el = chartHostRef.current
    if (!open || !el) return undefined
    const lineColor = chartUp ? theme.upColor : theme.downColor
    const chart = createChart(el, {
      width: el.clientWidth,
      height: el.clientHeight,
      layout: {
        ...theme.layout,
        fontSize: MARKET_CHART_PRICE_SCALE_FONT_SIZE,
      },
      grid: theme.grid,
      rightPriceScale: { visible: false },
      leftPriceScale: { visible: false },
      handleScroll: false,
      handleScale: false,
      timeScale: {
        visible: false,
        borderVisible: false,
        rightOffset: 0,
        rightOffsetPixels: 0,
        fixRightEdge: true,
      },
      crosshair: {
        vertLine: { visible: true, labelVisible: false },
        horzLine: { visible: false, labelVisible: false },
      },
    })
    const barPoints = loungeMarketBarsToSeries(series?.bars || active?.bars || [])
    const area = chart.addSeries(AreaSeries, {
      lineColor,
      topColor: chartUp ? 'rgba(34, 197, 94, 0.28)' : 'rgba(239, 68, 68, 0.28)',
      bottomColor: chartUp ? 'rgba(34, 197, 94, 0)' : 'rgba(239, 68, 68, 0)',
      lineWidth: 2,
      priceLineVisible: false,
      lastValueVisible: false,
      priceFormat: { type: 'price', precision: 2, minMove: 0.01 },
    })
    if (isLight) {
      area.applyOptions({
        topColor: chartUp ? 'rgba(22, 163, 74, 0.22)' : 'rgba(220, 38, 38, 0.22)',
        bottomColor: chartUp ? 'rgba(22, 163, 74, 0)' : 'rgba(220, 38, 38, 0)',
      })
    }
    area.setData(barPoints)
    areaRef.current = area
    applyMarketChartPriceRange(area, barPoints)
    setChartLineMarkers(area, barPoints, lineColor)
    fitMarketChartTimeScale(chart)

    const publishPriceAxisLabels = (next) => {
      if (priceAxisLabelsEqual(priceAxisLabelsRef.current, next)) return
      priceAxisLabelsRef.current = next
      setPriceAxisLabels(next)
    }

    const refreshChartOverlays = () => {
      applyMarketChartPriceRange(area, barPoints)
      publishPriceAxisLabels(buildPriceAxisLabels(area, barPoints))
    }
    refreshChartOverlays()
    requestAnimationFrame(refreshChartOverlays)

    const unbindScrub = bindMarketChartScrubPointer(el, chart, area, barPoints, (quoteAtPoint) => {
      setScrubQuote(quoteAtPoint)
      if (quoteAtPoint?.price != null) {
        const axisY = area.priceToCoordinate(quoteAtPoint.price)
        setScrubAxisCurrent(
          axisY != null ? { price: quoteAtPoint.price, y: Math.round(axisY) } : null,
        )
      } else {
        setScrubAxisCurrent(null)
      }
    })

    chartRef.current = chart
    let resizeRaf = 0
    const ro = new ResizeObserver(() => {
      if (!chartHostRef.current || !chartRef.current || !areaRef.current) return
      cancelAnimationFrame(resizeRaf)
      resizeRaf = requestAnimationFrame(() => {
        if (!chartHostRef.current || !chartRef.current || !areaRef.current) return
        chartRef.current.applyOptions({
          width: chartHostRef.current.clientWidth,
          height: chartHostRef.current.clientHeight,
        })
        fitMarketChartTimeScale(chartRef.current)
        refreshChartOverlays()
      })
    })
    ro.observe(el)
    return () => {
      cancelAnimationFrame(resizeRaf)
      unbindScrub()
      ro.disconnect()
      chart.remove()
      chartRef.current = null
      areaRef.current = null
      priceAxisLabelsRef.current = { high: null, current: null, low: null }
      setPriceAxisLabels({ high: null, current: null, low: null })
      setScrubQuote(null)
      setScrubAxisCurrent(null)
    }
  }, [open, series, chartUp, isLight, active?.symbol])

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
  const axisCurrentLabel = scrubAxisCurrent ?? priceAxisLabels.current

  return createPortal(
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
          </div>

          <div
            className="absolute inset-x-3 bottom-0.5 z-10 flex items-end gap-2"
            data-market-sheet-no-drag
          >
            <a
              href={TRADINGVIEW_CHART_ATTRIBUTION_URL}
              target="_blank"
              rel="noopener noreferrer"
              className={`shrink-0 pb-0.5 text-[9px] font-medium leading-none ${mutedClass} hover:text-zinc-300 touch-manipulation`}
              onClick={(e) => e.stopPropagation()}
            >
              Charts by TradingView
            </a>
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
  )
}
