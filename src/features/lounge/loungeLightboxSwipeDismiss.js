import { useCallback, useEffect, useRef, useState } from 'react'

const DISMISS_DRAG_PX = 72
const TAP_SLOP_PX = 12
/** Wait this far before locking vertical dismiss vs horizontal carousel page. */
const AXIS_LOCK_PX = 10
/** Fling off-screen after release (was 280 … felt rushed). */
const FLING_MS = 520
const SNAP_BACK_MS = 280

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
 * Write transform/opacity on the gesture surface (avoids React re-render jank mid-drag).
 * @param {HTMLElement | null | undefined} el
 * @param {number} x
 * @param {number} y
 * @param {{ animate?: boolean, opacity?: number, durationMs?: number }} [opts]
 */
function applySurfaceVisual(el, x, y, opts = {}) {
  if (!(el instanceof HTMLElement)) return
  const animate = Boolean(opts.animate)
  const durationMs = opts.durationMs ?? (animate ? FLING_MS : 0)
  const opacity = typeof opts.opacity === 'number' ? opts.opacity : dragOpacity(x, y)
  el.style.willChange = 'transform, opacity'
  el.style.transition = animate
    ? `transform ${durationMs}ms cubic-bezier(0.33, 0.1, 0.25, 1), opacity ${durationMs}ms ease-out`
    : 'none'
  el.style.transform = `translate3d(${x}px, ${y}px, 0)`
  el.style.opacity = String(opacity)
}

/**
 * Vertical swipe (or drag) to dismiss fullscreen Lounge media.
 * Optional horizontal swipe when `onSwipeHorizontal` is set (e.g. carousel in image lightbox).
 * @param {boolean} [allowSwipeOnVideo] - when true, swipes starting on `<video>` count (fullscreen video lightbox).
 */
export function useLoungeLightboxSwipeDismiss({
  onClose,
  onSwipeHorizontal,
  /** Fired on pointer up when movement stayed within tap slop (e.g. play/pause on hero video). */
  onTap,
  className = '',
  allowSwipeOnVideo = false,
  /** When false, pointer handlers no-op (e.g. image lightbox while pinch-zoomed). */
  enabled = true,
  /** When true, horizontal drags are ignored (carousel handles them elsewhere). */
  verticalDismissOnly = false,
}) {
  const dragRef = useRef(null)
  const flingTimerRef = useRef(0)
  const [dragging, setDragging] = useState(false)

  const resetDrag = useCallback((clearVisual = true) => {
    const el = dragRef.current?.el
    dragRef.current = null
    setDragging(false)
    if (clearVisual) clearSurfaceVisual(el)
  }, [])

  /** Drop tracking without React state (keeps native carousel scroll alive). */
  const abandonDragQuietly = useCallback(() => {
    const el = dragRef.current?.el
    // Only clear if we had actually painted a dismiss transform.
    if (dragRef.current?.didPaint) clearSurfaceVisual(el)
    dragRef.current = null
  }, [])

  useEffect(() => {
    if (!enabled) resetDrag()
  }, [enabled, resetDrag])

  useEffect(
    () => () => {
      try {
        window.clearTimeout(flingTimerRef.current)
      } catch {
        // ignore
      }
      flingTimerRef.current = 0
    },
    [],
  )

  const onPointerDown = useCallback(
    (e) => {
      if (!enabled) return
      if (dragRef.current?.flinging) return
      if (e.button !== 0 && e.pointerType === 'mouse') return
      if (shouldIgnoreSwipeTarget(e.target, { allowSwipeOnVideo })) return

      // Multi-image: start on the snap carousel without capturing / transforming yet so
      // horizontal paging stays native. Capture + paint only after vertical lock.
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
        flinging: false,
        didPaint: false,
        el,
      }

      // Do not setDragging / apply transform yet on carousel starts … that was breaking side-swipe
      // (parent transform + re-render mid-gesture kills native overflow scroll).
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
      if (!drag || drag.flinging || drag.pointerId !== e.pointerId) return
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
          // Horizontal page … drop quietly so scroll-snap carousel owns the gesture.
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
        drag.didPaint = true
        applySurfaceVisual(drag.el, 0, dy)
        return
      }

      if (verticalDismissOnly) return

      if (drag.axis === 'x' && onSwipeHorizontal) {
        drag.didPaint = true
        applySurfaceVisual(drag.el, dx, 0)
      } else if (Math.abs(dy) >= Math.abs(dx)) {
        drag.didPaint = true
        applySurfaceVisual(drag.el, 0, dy)
      } else if (onSwipeHorizontal) {
        drag.didPaint = true
        applySurfaceVisual(drag.el, dx, 0)
      } else {
        drag.didPaint = true
        applySurfaceVisual(drag.el, 0, dy)
      }
    },
    [onSwipeHorizontal, enabled, verticalDismissOnly, abandonDragQuietly],
  )

  const finishDrag = useCallback(
    (e) => {
      if (!enabled) return
      const drag = dragRef.current
      if (!drag || drag.flinging || drag.pointerId !== e.pointerId) return
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
        drag.flinging = true
        drag.didPaint = true
        const dir = dy >= 0 ? 1 : -1
        const viewportH =
          typeof window !== 'undefined' ? window.innerHeight || 800 : 800
        const flingY = dir * Math.max(viewportH * 1.05, Math.abs(dy) + 160)
        applySurfaceVisual(drag.el, 0, flingY, {
          animate: true,
          opacity: 0,
          durationMs: FLING_MS,
        })
        try {
          window.clearTimeout(flingTimerRef.current)
        } catch {
          // ignore
        }
        flingTimerRef.current = window.setTimeout(() => {
          flingTimerRef.current = 0
          onClose()
          resetDrag(true)
        }, FLING_MS)
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

      // Never locked vertical (e.g. abandoned-to-carousel already, or tiny move).
      if (!drag.didPaint && axis !== 'y') {
        abandonDragQuietly()
        setDragging(false)
        return
      }

      // Snap back smoothly when dismiss threshold was not met.
      applySurfaceVisual(drag.el, 0, 0, {
        animate: true,
        opacity: 1,
        durationMs: SNAP_BACK_MS,
      })
      drag.flinging = true
      try {
        window.clearTimeout(flingTimerRef.current)
      } catch {
        // ignore
      }
      flingTimerRef.current = window.setTimeout(() => {
        flingTimerRef.current = 0
        resetDrag(true)
      }, SNAP_BACK_MS)
    },
    [onClose, onSwipeHorizontal, onTap, resetDrag, enabled, verticalDismissOnly, abandonDragQuietly],
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
      if (!drag || drag.pointerId !== e.pointerId || drag.flinging) return
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
      drag.flinging = true
      try {
        window.clearTimeout(flingTimerRef.current)
      } catch {
        // ignore
      }
      flingTimerRef.current = window.setTimeout(() => {
        flingTimerRef.current = 0
        resetDrag(true)
      }, SNAP_BACK_MS)
    },
    [resetDrag, abandonDragQuietly],
  )

  /** Video lightbox: keep touch-action none so vertical dismiss is not eaten by pan-y. */
  const touchClass = dragging || allowSwipeOnVideo ? 'touch-none' : 'touch-pan-y'
  const mergedClass = [className, touchClass].filter(Boolean).join(' ')

  return {
    swipeSurfaceProps: {
      onPointerDown,
      onPointerMove,
      onPointerUp,
      onPointerCancel,
      // Visuals are applied on the gesture element via DOM (smooth); do not fight with React style.
      style: undefined,
      className: mergedClass,
    },
  }
}
