import { useCallback, useRef } from 'react'

const AXIS_LOCK_PX = 8
/** Horizontal movement must exceed vertical by this ratio to claim the gesture. */
const HORIZONTAL_DOMINANCE = 1.12
const VERTICAL_DOMINANCE = 1.12

/**
 * Nested feed scroll + horizontal carousel: lock axis after a small move so diagonal swipes
 * reliably hit the carousel instead of the feed scroller.
 *
 * @param {React.RefObject<HTMLElement|null>} scrollerRef
 * @param {boolean} enabled
 */
export function useLoungeFeedCarouselAxisLock(scrollerRef, enabled) {
  const gestureRef = useRef(/** @type {{
    pointerId: number | null,
    startX: number,
    startY: number,
    lastX: number,
    axis: 'x' | 'y' | null,
  }} */ ({
    pointerId: null,
    startX: 0,
    startY: 0,
    lastX: 0,
    axis: null,
  }))

  const resetGesture = useCallback(() => {
    gestureRef.current = {
      pointerId: null,
      startX: 0,
      startY: 0,
      lastX: 0,
      axis: null,
    }
  }, [])

  const onPointerDown = useCallback(
    (e) => {
      if (!enabled) return
      if (e.pointerType === 'mouse' && e.button !== 0) return
      gestureRef.current = {
        pointerId: e.pointerId,
        startX: e.clientX,
        startY: e.clientY,
        lastX: e.clientX,
        axis: null,
      }
    },
    [enabled],
  )

  const onPointerMove = useCallback(
    (e) => {
      if (!enabled) return
      const g = gestureRef.current
      if (g.pointerId == null || e.pointerId !== g.pointerId) return
      if (e.pointerType === 'mouse' && e.buttons === 0) return

      const dx = e.clientX - g.startX
      const dy = e.clientY - g.startY

      if (!g.axis) {
        if (Math.abs(dx) < AXIS_LOCK_PX && Math.abs(dy) < AXIS_LOCK_PX) return
        if (Math.abs(dx) >= AXIS_LOCK_PX && Math.abs(dx) >= Math.abs(dy) * HORIZONTAL_DOMINANCE) {
          g.axis = 'x'
          try {
            e.currentTarget.setPointerCapture(e.pointerId)
          } catch {
            // ignore
          }
        } else if (Math.abs(dy) >= AXIS_LOCK_PX && Math.abs(dy) >= Math.abs(dx) * VERTICAL_DOMINANCE) {
          resetGesture()
          return
        } else {
          return
        }
      }

      if (g.axis !== 'x') return

      e.preventDefault()
      const el = scrollerRef.current
      if (el) {
        el.scrollLeft -= e.clientX - g.lastX
      }
      g.lastX = e.clientX
    },
    [enabled, resetGesture, scrollerRef],
  )

  const onPointerUp = useCallback(
    (e) => {
      if (!enabled) return
      const g = gestureRef.current
      if (g.pointerId == null || e.pointerId !== g.pointerId) return
      try {
        if (e.currentTarget.hasPointerCapture?.(e.pointerId)) {
          e.currentTarget.releasePointerCapture(e.pointerId)
        }
      } catch {
        // ignore
      }
      resetGesture()
    },
    [enabled, resetGesture],
  )

  return enabled
    ? {
        onPointerDown,
        onPointerMove,
        onPointerUp,
        onPointerCancel: onPointerUp,
      }
    : {}
}
