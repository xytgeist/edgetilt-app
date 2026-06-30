/** Horizontal + vertical pan and history prefetch for Advanced market charts. */

/** Map viewport pointer position into element-local coordinates (handles CSS rotation). */
export function marketChartClientToLocal(el, clientX, clientY) {
  const rect = el.getBoundingClientRect()
  const width = el.offsetWidth
  const height = el.offsetHeight
  if (!rect.width || !rect.height || !width || !height) {
    return { x: clientX - rect.left, y: clientY - rect.top }
  }
  return {
    x: ((clientX - rect.left) / rect.width) * width,
    y: ((clientY - rect.top) / rect.height) * height,
  }
}

/** Shift visible range by horizontal drag delta (px). */
export function scrollMarketChartByPixels(chart, deltaPx) {
  if (!chart || !Number.isFinite(deltaPx) || deltaPx === 0) return
  const ts = chart.timeScale()
  const range = ts.getVisibleLogicalRange()
  if (!range) {
    marketChartPanDebug('scroll skip no range')
    return
  }

  const span = range.to - range.from
  if (!Number.isFinite(span) || span === 0) {
    marketChartPanDebug('scroll skip zero span')
    return
  }

  // logicalToCoordinate(undefined) when range.from is negative (panned past bar 0).
  const anchorLogical = Math.max(0, Math.floor(range.from))
  const coord0 = ts.logicalToCoordinate(anchorLogical)
  const coord1 = ts.logicalToCoordinate(anchorLogical + 1)
  let barShift = null
  if (coord0 != null && coord1 != null) {
    const barWidthPx = coord1 - coord0
    if (Number.isFinite(barWidthPx) && barWidthPx !== 0) {
      barShift = deltaPx / barWidthPx
    }
  }

  if (barShift == null) {
    const width = ts.width()
    if (!width) {
      marketChartPanDebug('scroll skip no width', { from: range.from, to: range.to })
      return
    }
    barShift = (deltaPx / width) * span
  }

  ts.setVisibleLogicalRange({
    from: range.from - barShift,
    to: range.to - barShift,
  })
}

/**
 * Shift main price scale so plot content follows vertical drag (pull down → chart moves down).
 * @param {import('lightweight-charts').ISeriesApi} mainSeries
 * @param {number} lastLocalY
 * @param {number} currentLocalY
 * @param {number} [plotBottomLocalY] skip when both points are below the main price plot
 */
export function scrollMarketChartPriceByPixels(mainSeries, lastLocalY, currentLocalY, plotBottomLocalY) {
  if (!mainSeries || lastLocalY == null || !Number.isFinite(currentLocalY) || !Number.isFinite(lastLocalY)) {
    return false
  }
  if (currentLocalY === lastLocalY) return false
  if (
    plotBottomLocalY != null &&
    Number.isFinite(plotBottomLocalY) &&
    lastLocalY > plotBottomLocalY &&
    currentLocalY > plotBottomLocalY
  ) {
    return false
  }

  const yLast = plotBottomLocalY != null ? Math.min(lastLocalY, plotBottomLocalY) : lastLocalY
  const yCur = plotBottomLocalY != null ? Math.min(currentLocalY, plotBottomLocalY) : currentLocalY
  const pLast = mainSeries.coordinateToPrice(yLast)
  const pCur = mainSeries.coordinateToPrice(yCur)
  if (!Number.isFinite(pLast) || !Number.isFinite(pCur)) return false

  const shift = pLast - pCur
  if (shift === 0) return false

  const scale = mainSeries.priceScale()
  const range = scale.getVisibleRange()
  if (!range) return false

  scale.applyOptions({ autoScale: false })
  scale.setVisibleRange({
    from: range.from + shift,
    to: range.to + shift,
  })
  return true
}

const PAN_GESTURE_SLOP_PX = 6
const HISTORY_LOAD_DEBOUNCE_MS = 220

/** Pan/history traces - captured in Settings → Admin utils → Console log. */
export function marketChartPanDebug(...args) {
  console.log('[marketChartPan]', ...args)
}

/** Stable fingerprint for bar arrays - skip redundant Advanced chart refreshes. */
export function marketChartBarsSignature(bars) {
  if (!bars?.length) return ''
  const first = bars[0]?.t
  const last = bars[bars.length - 1]?.t
  return `${bars.length}:${first}:${last}`
}

/**
 * Drag on the plot pans time (horizontal) and price (vertical). Advanced view.
 * @param {HTMLElement} el
 * @param {import('lightweight-charts').IChartApi} chart
 * @param {{
 *   mainSeries?: import('lightweight-charts').ISeriesApi,
 *   mainPlotBottomLocalY?: () => number | null,
 *   plotBottomExcludeFraction?: number,
 *   priceAxisHit?: (clientX: number, clientY?: number) => boolean,
 *   onUserPricePan?: () => void,
 *   onPanActiveChange?: (active: boolean) => void,
 * }} [opts]
 */
export function bindMarketChartPanPointer(el, chart, opts = {}) {
  const mainSeries = opts.mainSeries ?? null
  const plotBottomExcludeFraction = Number(opts.plotBottomExcludeFraction) || 0
  const priceAxisHit =
    typeof opts.priceAxisHit === 'function' ? opts.priceAxisHit : null
  const onUserPricePan = typeof opts.onUserPricePan === 'function' ? opts.onUserPricePan : null
  const onPanActiveChange =
    typeof opts.onPanActiveChange === 'function' ? opts.onPanActiveChange : null

  const plotBottomLocalY = () => {
    if (typeof opts.mainPlotBottomLocalY === 'function') {
      const y = opts.mainPlotBottomLocalY()
      if (Number.isFinite(y)) return y
    }
    const h = el.offsetHeight
    if (!h) return null
    return h * (1 - plotBottomExcludeFraction)
  }

  /** @type {'pending' | 'pan' | null} */
  let mode = null
  let activePointerId = null
  let startLocalX = 0
  let startLocalY = 0
  let lastLocalX = null
  let lastLocalY = null
  /** @type {Map<number, { x: number, y: number }>} */
  const activePointers = new Map()
  let panRaf = 0
  let pendingDeltaPx = 0

  const releaseCapture = (pointerId) => {
    if (!el.hasPointerCapture(pointerId)) return
    try {
      el.releasePointerCapture(pointerId)
    } catch {
      /* ignore */
    }
  }

  const resetGesture = () => {
    const wasPanning = mode === 'pan'
    mode = null
    activePointerId = null
    lastLocalX = null
    lastLocalY = null
    if (wasPanning) {
      marketChartPanDebug('pan end')
      onPanActiveChange?.(false)
    }
  }

  const startPan = (e, localX, localY) => {
    mode = 'pan'
    lastLocalX = localX
    lastLocalY = localY
    marketChartPanDebug('pan start', { pointerId: e.pointerId })
    onPanActiveChange?.(true)
    try {
      el.setPointerCapture(e.pointerId)
    } catch {
      /* ignore */
    }
    e.preventDefault()
  }

  const applyPricePanStep = (fromY, toY) => {
    if (!mainSeries || fromY == null) return
    if (
      scrollMarketChartPriceByPixels(mainSeries, fromY, toY, plotBottomLocalY())
    ) {
      onUserPricePan?.()
    }
  }

  const applyPanStep = (local) => {
    if (lastLocalX != null) queuePanDelta(local.x - lastLocalX)
    if (lastLocalY != null) applyPricePanStep(lastLocalY, local.y)
    lastLocalX = local.x
    lastLocalY = local.y
  }

  const flushPan = () => {
    panRaf = 0
    if (!pendingDeltaPx) return
    scrollMarketChartByPixels(chart, pendingDeltaPx)
    pendingDeltaPx = 0
  }

  const queuePanDelta = (deltaPx) => {
    if (!Number.isFinite(deltaPx) || deltaPx === 0) return
    pendingDeltaPx += deltaPx
    if (!panRaf) panRaf = requestAnimationFrame(flushPan)
  }

  const onPointerDown = (e) => {
    if (priceAxisHit?.(e.clientX, e.clientY)) return
    if (e.button !== 0 && e.pointerType === 'mouse') return

    activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY })
    if (activePointers.size >= 2) {
      if (activePointerId != null) releaseCapture(activePointerId)
      resetGesture()
      return
    }

    resetGesture()
    mode = 'pending'
    activePointerId = e.pointerId
    const local = marketChartClientToLocal(el, e.clientX, e.clientY)
    startLocalX = local.x
    startLocalY = local.y
  }

  const onPointerMove = (e) => {
    if (activePointers.size >= 2) return
    if (activePointerId == null || e.pointerId !== activePointerId) return
    const local = marketChartClientToLocal(el, e.clientX, e.clientY)

    if (mode === 'pending') {
      const ldx = local.x - startLocalX
      const ldy = local.y - startLocalY
      if (Math.hypot(ldx, ldy) < PAN_GESTURE_SLOP_PX) return
      startPan(e, local.x, local.y)
      queuePanDelta(ldx)
      applyPricePanStep(startLocalY, local.y)
      lastLocalX = local.x
      lastLocalY = local.y
      return
    }

    if (mode === 'pan') {
      e.preventDefault()
      applyPanStep(local)
    }
  }

  const onPointerEnd = (e) => {
    activePointers.delete(e.pointerId)
    if (activePointerId == null || e.pointerId !== activePointerId) return
    releaseCapture(e.pointerId)
    if (panRaf) {
      cancelAnimationFrame(panRaf)
      flushPan()
    }
    resetGesture()
  }

  const capture = { capture: true }
  el.addEventListener('pointerdown', onPointerDown, capture)
  el.addEventListener('pointermove', onPointerMove, capture)
  el.addEventListener('pointerup', onPointerEnd, capture)
  el.addEventListener('pointercancel', onPointerEnd, capture)

  return () => {
    if (panRaf) cancelAnimationFrame(panRaf)
    el.removeEventListener('pointerdown', onPointerDown, capture)
    el.removeEventListener('pointermove', onPointerMove, capture)
    el.removeEventListener('pointerup', onPointerEnd, capture)
    el.removeEventListener('pointercancel', onPointerEnd, capture)
  }
}

/**
 * When the visible window nears the oldest loaded bar, request older history.
 * @param {import('lightweight-charts').IChartApi} chart
 * @param {() => Array<{ t: number }>} getBars
 * @param {(beforeSec: number) => void} onNeedHistory
 * @param {{ edgeBars?: number, canLoad?: () => boolean, isPanning?: () => boolean, debounceMs?: number }} [opts]
 * @returns {() => void}
 */
export function bindMarketChartHistoryLoader(chart, getBars, onNeedHistory, opts = {}) {
  const edgeBars = Number(opts.edgeBars) || 10
  const canLoad = typeof opts.canLoad === 'function' ? opts.canLoad : () => true
  const isPanning = typeof opts.isPanning === 'function' ? opts.isPanning : () => false
  const debounceMs = Number(opts.debounceMs) || HISTORY_LOAD_DEBOUNCE_MS
  let lastBeforeSec = null
  let pendingBeforeSec = null
  let debounceTimer = 0

  const clearPending = () => {
    pendingBeforeSec = null
    if (debounceTimer) {
      clearTimeout(debounceTimer)
      debounceTimer = 0
    }
  }

  const flushPending = () => {
    debounceTimer = 0
    if (pendingBeforeSec == null || isPanning() || !canLoad()) return
    const beforeSec = pendingBeforeSec
    pendingBeforeSec = null
    marketChartPanDebug('history load', { beforeSec })
    onNeedHistory(beforeSec)
  }

  const schedulePending = () => {
    if (debounceTimer) clearTimeout(debounceTimer)
    debounceTimer = setTimeout(flushPending, debounceMs)
  }

  const tryScheduleFromRange = (range) => {
    if (isPanning()) return

    if (!range || range.from > edgeBars) {
      clearPending()
      return
    }
    if (!canLoad()) {
      marketChartPanDebug('history skip canLoad', { from: range?.from })
      return
    }
    const bars = getBars()
    if (!bars?.length) return
    const oldest = bars[0]
    const beforeSec = Math.floor(oldest.t > 1e12 ? oldest.t / 1000 : oldest.t)
    if (!Number.isFinite(beforeSec) || beforeSec <= 0) return
    if (lastBeforeSec === beforeSec) {
      marketChartPanDebug('history skip same anchor', { beforeSec })
      return
    }
    lastBeforeSec = beforeSec
    pendingBeforeSec = beforeSec
    schedulePending()
  }

  const handler = (range) => {
    tryScheduleFromRange(range)
  }

  const ts = chart.timeScale()
  ts.subscribeVisibleLogicalRangeChange(handler)
  return {
    unbind: () => {
      clearPending()
      ts.unsubscribeVisibleLogicalRangeChange(handler)
    },
    flushPending: () => {
      if (pendingBeforeSec == null || isPanning() || !canLoad()) return
      if (debounceTimer) clearTimeout(debounceTimer)
      flushPending()
    },
    /** After pan release - range updates while dragging are ignored. */
    checkEdgeAfterPan: () => {
      tryScheduleFromRange(ts.getVisibleLogicalRange())
    },
    /** After prepending bars - prevent immediate re-fetch on the new oldest anchor. */
    acknowledgeBars: () => {
      const bars = getBars()
      if (!bars?.length) {
        lastBeforeSec = null
        clearPending()
        return
      }
      const oldest = bars[0]
      const beforeSec = Math.floor(oldest.t > 1e12 ? oldest.t / 1000 : oldest.t)
      if (Number.isFinite(beforeSec) && beforeSec > 0) {
        lastBeforeSec = beforeSec
        marketChartPanDebug('history ack', { beforeSec, count: bars.length })
      }
      clearPending()
    },
    resetAnchor: () => {
      lastBeforeSec = null
      clearPending()
    },
  }
}

/** Preserve viewport when prepending `added` bars to the series. */
export function shiftMarketChartLogicalRange(chart, added) {
  if (!chart || !added) return
  const ts = chart.timeScale()
  const range = ts.getVisibleLogicalRange()
  if (!range) return
  ts.setVisibleLogicalRange({
    from: range.from + added,
    to: range.to + added,
  })
}
