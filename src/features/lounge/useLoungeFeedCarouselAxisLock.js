import { useEffect, useRef } from 'react'

const AXIS_LOCK_PX = 4
/** Horizontal wins unless vertical movement is clearly dominant. */
const HORIZONTAL_VS_VERTICAL = 0.72
const VERTICAL_VS_HORIZONTAL = 1.35
const VERTICAL_MIN_PX = 7

/**
 * Nested feed scroll + horizontal carousel on touch devices.
 * Uses non-passive touch listeners (React pointer handlers cannot preventDefault feed scroll on iOS/Android).
 *
 * @param {React.RefObject<HTMLElement|null>} scrollerRef
 * @param {boolean} enabled
 */
export function useLoungeFeedCarouselAxisLock(scrollerRef, enabled) {
  const gestureRef = useRef(/** @type {{
    startX: number,
    startY: number,
    lastX: number,
    axis: 'x' | 'y' | null,
    snapType: string,
  }} */ ({
    startX: 0,
    startY: 0,
    lastX: 0,
    axis: null,
    snapType: '',
  }))

  useEffect(() => {
    if (!enabled) return undefined
    const el = scrollerRef.current
    if (!el) return undefined

    const resetGesture = () => {
      const g = gestureRef.current
      if (g.axis === 'x' && g.snapType) {
        el.style.scrollSnapType = g.snapType
      }
      gestureRef.current = {
        startX: 0,
        startY: 0,
        lastX: 0,
        axis: null,
        snapType: '',
      }
    }

    const snapToNearest = () => {
      const children = el.children
      if (!children.length) return
      const left = el.scrollLeft
      let nearest = 0
      let nearestDist = Infinity
      for (let i = 0; i < children.length; i += 1) {
        const slideLeft = /** @type {HTMLElement} */ (children[i]).offsetLeft
        const dist = Math.abs(slideLeft - left)
        if (dist < nearestDist) {
          nearestDist = dist
          nearest = slideLeft
        }
      }
      try {
        el.scrollTo({ left: nearest, behavior: 'smooth' })
      } catch {
        el.scrollLeft = nearest
      }
    }

    const onTouchStart = (e) => {
      if (e.touches.length !== 1) {
        resetGesture()
        return
      }
      const t = e.touches[0]
      gestureRef.current = {
        startX: t.clientX,
        startY: t.clientY,
        lastX: t.clientX,
        axis: null,
        snapType: '',
      }
    }

    const onTouchMove = (e) => {
      if (e.touches.length !== 1) return
      const g = gestureRef.current
      const t = e.touches[0]
      const dx = t.clientX - g.startX
      const dy = t.clientY - g.startY

      if (!g.axis) {
        if (Math.abs(dx) < AXIS_LOCK_PX && Math.abs(dy) < AXIS_LOCK_PX) return
        if (Math.abs(dx) >= AXIS_LOCK_PX && Math.abs(dx) >= Math.abs(dy) * HORIZONTAL_VS_VERTICAL) {
          g.axis = 'x'
          g.snapType = el.style.scrollSnapType || ''
          el.style.scrollSnapType = 'none'
          el.style.touchAction = 'none'
        } else if (
          Math.abs(dy) >= VERTICAL_MIN_PX &&
          Math.abs(dy) >= Math.abs(dx) * VERTICAL_VS_HORIZONTAL
        ) {
          g.axis = 'y'
          return
        } else {
          return
        }
      }

      if (g.axis === 'y') return

      e.preventDefault()
      el.scrollLeft -= t.clientX - g.lastX
      g.lastX = t.clientX
    }

    const onTouchEnd = () => {
      const g = gestureRef.current
      const wasHorizontal = g.axis === 'x'
      if (wasHorizontal) {
        el.style.scrollSnapType = g.snapType || ''
        el.style.touchAction = ''
        snapToNearest()
      }
      resetGesture()
    }

    el.addEventListener('touchstart', onTouchStart, { passive: true })
    el.addEventListener('touchmove', onTouchMove, { passive: false, capture: true })
    el.addEventListener('touchend', onTouchEnd, { passive: true })
    el.addEventListener('touchcancel', onTouchEnd, { passive: true })

    return () => {
      el.removeEventListener('touchstart', onTouchStart)
      el.removeEventListener('touchmove', onTouchMove, { capture: true })
      el.removeEventListener('touchend', onTouchEnd)
      el.removeEventListener('touchcancel', onTouchEnd)
      resetGesture()
      el.style.touchAction = ''
    }
  }, [enabled, scrollerRef])

  return {}
}
