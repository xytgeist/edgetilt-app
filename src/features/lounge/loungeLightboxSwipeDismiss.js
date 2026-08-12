import { useCallback, useEffect, useRef, useState } from 'react'

const DISMISS_DRAG_PX = 72
const TAP_SLOP_PX = 12
/** Wait this far before locking vertical dismiss vs horizontal carousel page. */
const AXIS_LOCK_PX = 10
const SNAP_BACK_MS = 220

function shouldIgnoreSwipeTarget(target, { allowSwipeOnVideo = false } = {}) {
  if (!(target instanceof Element)) return true
  const blockers = ['button', 'a', 'input', 'textarea', 'select', 'iframe', '[data-lounge-lightbox-no-swipe]']
  if (!allowSwipeOnVideo) blockers.push('video')
  return Boolean(target.closest(blockers.join(', ')))
}

function dragOpacity(x, y) {
  return 1 - Math.min(0.45, (Math.abs(y) + Math.abs(x) * 0.35) / 420)
}

function clearSurfaceVisual(el) {
  if (!(el instanceof HTMLElement)) return
  el.style.transition = ''
  el.style.transform = ''
  el.style.opacity = ''
  el.style.willChange = ''
}

/**
 * @param {HTMLElement | null | undefined} el
 * @param {number} x
 * @param {number} y
 * @param {{ animate?: boolean, opacity?: number, durationMs?: number }} [opts]
 */
function applySurfaceVisual(el, x, y, opts = {}) {
  if (!(el instanceof HTMLElement)) return
  const animate = Boolean(opts.animate)
  const durationMs = opts.durationMs ?? (animate ? SNAP_BACK_MS : 0)
  const opacity = typeof opts.opacity === 'number' ? opts.opacity : dragOpacity(x, y)
  el.style.willChange = 'transform, opacity'
  el.style.transition = animate
    ? `transform ${durationMs}ms cubic-bezier(0.33, 0.1, 0.25, 1), opacity ${durationMs}ms ease-out`
    : 'none'
  el.style.transform = `translate3d(${x}px, ${y}px, 0)`
  el.style.opacity = String(opacity)
}

function progressFromOffset(x, y) {
  const dist = Math.hypot(x, y)
  return Math.max(0, Math.min(1, dist / (DISMISS_DRAG_PX * 1.35)))
}

/**
 * Vertical-ish swipe (or drag) to dismiss fullscreen Lounge media.
 * Parent owns close animation (FLIP shrink) … this hook only tracks the gesture.
 */
export function useLoungeLightboxSwipeDismiss({
  onClose,
  onSwipeHorizontal,
  /** Fired on pointer up when movement stayed within tap slop (e.g. play/pause on hero video). */
  onTap,
  /** Live dismiss drag progress for scrim fade etc. */
  onDismissProgress,
  className = '',
  allowSwipeOnVideo = false,
  /** When false, pointer handlers no-op (e.g. image lightbox while pinch-zoomed). */
  enabled = true,
  /** When true, horizontal drags are ignored (carousel handles them elsewhere). */
  verticalDismissOnly = false,
}) {
  const dragRef = useRef(null)
  const snapTimerRef = useRef(0)
  const progressRef = useRef(onDismissProgress)
  progressRef.current = onDismissProgress
  const [dragging, setDragging] = useState(false)

  const emitProgress = useCallback((x, y, active) => {
    const cb = progressRef.current
    if (typeof cb !== 'function') return
    cb({
      x,
      y,
      p: active ? progressFromOffset(x, y) : 0,
      active: Boolean(active),
    })
  }, [])

  const resetDrag = useCallback(
    (clearVisual = true) => {
      const el = dragRef.current?.el
      dragRef.current = null
      setDragging(false)
      if (clearVisual) clearSurfaceVisual(el)
      emitProgress(0, 0, false)
    },
    [emitProgress],
  )

  /** Drop tracking without React state (keeps native carousel scroll alive). */
  const abandonDragQuietly = useCallback(() => {
    const el = dragRef.current?.el
    if (dragRef.current?.didPaint) clearSurfaceVisual(el)
    dragRef.current = null
    emitProgress(0, 0, false)
  }, [emitProgress])

  useEffect(() => {
    if (!enabled) resetDrag()
  }, [enabled, resetDrag])

  useEffect(
    () => () => {
      try {
        window.clearTimeout(snapTimerRef.current)
      } catch {
        // ignore
      }
      snapTimerRef.current = 0
    },
    [],
  )

  const onPointerDown = useCallback(
    (e) => {
      if (!enabled) return
      if (dragRef.current?.settling) return
      if (e.button !== 0 && e.pointerType === 'mouse') return
      if (shouldIgnoreSwipeTarget(e.target, { allowSwipeOnVideo })) return

      const fromCarousel =
        verticalDismissOnly &&
        e.target instanceof Element &&
        Boolean(e.target.closest('[data-lounge-lightbox-carousel]'))

      const el = e.currentTarget instanceof HTMLElement ? e.currentTarget : null
      dragRef.current = {
        pointerId: e.pointerId,
        startX: e.clientX,
        startY: e.clientY,
        /** @type {null | 'x' | 'y'} */
        axis: null,
        captured: false,
        deferCapture: fromCarousel,
        settling: false,
        didPaint: false,
        el,
      }

      if (!fromCarousel) {
        setDragging(true)
        if (el) {
          el.setPointerCapture(e.pointerId)
          dragRef.current.captured = true
        }
      }
    },
    [allowSwipeOnVideo, enabled, verticalDismissOnly],
  )

  const onPointerMove = useCallback(
    (e) => {
      if (!enabled) return
      const drag = dragRef.current
      if (!drag || drag.settling || drag.pointerId !== e.pointerId) return
      const dx = e.clientX - drag.startX
      const dy = e.clientY - drag.startY

      if (!drag.axis) {
        if (Math.abs(dx) < AXIS_LOCK_PX && Math.abs(dy) < AXIS_LOCK_PX) return
        if (Math.abs(dy) >= Math.abs(dx)) {
          drag.axis = 'y'
          if (drag.deferCapture) setDragging(true)
          if (!drag.captured && drag.el) {
            try {
              drag.el.setPointerCapture(e.pointerId)
              drag.captured = true
            } catch {
              // ignore
            }
          }
        } else if (verticalDismissOnly) {
          abandonDragQuietly()
          return
        } else {
          drag.axis = 'x'
          if (!drag.captured && drag.el) {
            try {
              drag.el.setPointerCapture(e.pointerId)
              drag.captured = true
            } catch {
              // ignore
            }
          }
        }
      }

      if (drag.axis === 'y') {
        try {
          e.preventDefault()
        } catch {
          // ignore
        }
        // Follow finger on both axes once dismiss lock wins (natural diagonal).
        drag.didPaint = true
        applySurfaceVisual(drag.el, dx, dy)
        emitProgress(dx, dy, true)
        return
      }

      if (verticalDismissOnly) return

      if (drag.axis === 'x' && onSwipeHorizontal) {
        drag.didPaint = true
        applySurfaceVisual(drag.el, dx, 0)
        emitProgress(dx, 0, true)
      } else if (Math.abs(dy) >= Math.abs(dx)) {
        drag.didPaint = true
        applySurfaceVisual(drag.el, dx, dy)
        emitProgress(dx, dy, true)
      } else if (onSwipeHorizontal) {
        drag.didPaint = true
        applySurfaceVisual(drag.el, dx, 0)
        emitProgress(dx, 0, true)
      } else {
        drag.didPaint = true
        applySurfaceVisual(drag.el, dx, dy)
        emitProgress(dx, dy, true)
      }
    },
    [onSwipeHorizontal, enabled, verticalDismissOnly, abandonDragQuietly, emitProgress],
  )

  const finishDrag = useCallback(
    (e) => {
      if (!enabled) return
      const drag = dragRef.current
      if (!drag || drag.settling || drag.pointerId !== e.pointerId) return
      if (drag.captured && drag.el) {
        try {
          drag.el.releasePointerCapture(e.pointerId)
        } catch {
          // ignore
        }
      }
      const dx = e.clientX - drag.startX
      const dy = e.clientY - drag.startY
      const axis = drag.axis
      const shouldDismiss =
        (axis === 'y' || (axis == null && Math.abs(dy) >= Math.abs(dx))) &&
        Math.abs(dy) >= DISMISS_DRAG_PX

      if (shouldDismiss) {
        // Parent owns FLIP shrink / hero close … clear drag paint then close immediately.
        clearSurfaceVisual(drag.el)
        resetDrag(false)
        onClose()
        return
      }

      const shouldPage =
        !verticalDismissOnly &&
        onSwipeHorizontal &&
        (axis === 'x' || (axis == null && Math.abs(dx) > Math.abs(dy))) &&
        Math.abs(dx) >= DISMISS_DRAG_PX

      if (shouldPage) {
        clearSurfaceVisual(drag.el)
        resetDrag(false)
        onSwipeHorizontal(dx < 0 ? 1 : -1)
        return
      }

      if (onTap && Math.abs(dx) <= TAP_SLOP_PX && Math.abs(dy) <= TAP_SLOP_PX) {
        clearSurfaceVisual(drag.el)
        resetDrag(false)
        onTap(e)
        return
      }

      if (!drag.didPaint && axis !== 'y') {
        abandonDragQuietly()
        setDragging(false)
        return
      }

      applySurfaceVisual(drag.el, 0, 0, {
        animate: true,
        opacity: 1,
        durationMs: SNAP_BACK_MS,
      })
      emitProgress(0, 0, false)
      drag.settling = true
      try {
        window.clearTimeout(snapTimerRef.current)
      } catch {
        // ignore
      }
      snapTimerRef.current = window.setTimeout(() => {
        snapTimerRef.current = 0
        resetDrag(true)
      }, SNAP_BACK_MS)
    },
    [
      onClose,
      onSwipeHorizontal,
      onTap,
      resetDrag,
      enabled,
      verticalDismissOnly,
      abandonDragQuietly,
      emitProgress,
    ],
  )

  const onPointerUp = useCallback(
    (e) => {
      finishDrag(e)
    },
    [finishDrag],
  )

  const onPointerCancel = useCallback(
    (e) => {
      const drag = dragRef.current
      if (!drag || drag.pointerId !== e.pointerId || drag.settling) return
      if (!drag.didPaint) {
        abandonDragQuietly()
        setDragging(false)
        return
      }
      applySurfaceVisual(drag.el, 0, 0, {
        animate: true,
        opacity: 1,
        durationMs: SNAP_BACK_MS,
      })
      emitProgress(0, 0, false)
      drag.settling = true
      try {
        window.clearTimeout(snapTimerRef.current)
      } catch {
        // ignore
      }
      snapTimerRef.current = window.setTimeout(() => {
        snapTimerRef.current = 0
        resetDrag(true)
      }, SNAP_BACK_MS)
    },
    [resetDrag, abandonDragQuietly, emitProgress],
  )

  // Parent `touch-pan-y` ∩ child carousel `pan-x` resolves to none and kills side-swipe.
  // Multi-image (verticalDismissOnly): leave touch-action auto until vertical dismiss locks.
  const touchClass = dragging || allowSwipeOnVideo
    ? 'touch-none'
    : verticalDismissOnly
      ? 'touch-auto'
      : 'touch-pan-y'
  const mergedClass = [className, touchClass].filter(Boolean).join(' ')

  return {
    swipeSurfaceProps: {
      onPointerDown,
      onPointerMove,
      onPointerUp,
      onPointerCancel,
      style: undefined,
      className: mergedClass,
    },
  }
}
