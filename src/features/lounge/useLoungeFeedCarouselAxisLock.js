import { useEffect, useRef } from 'react'

const AXIS_LOCK_PX = 4
/** Horizontal wins unless vertical movement is clearly dominant. */
const HORIZONTAL_VS_VERTICAL = 0.72
const VERTICAL_VS_HORIZONTAL = 1.35
const VERTICAL_MIN_PX = 7
/** px/ms — quick flick commits to next/prev slide. */
const FLICK_VELOCITY_PX_MS = 0.22
/** Fraction of slide width — lower = less drag needed to advance. */
const COMMIT_PROGRESS = 0.12
const SNAP_SETTLE_MS = 280

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
    lastT: number,
    velocityX: number,
    axis: 'x' | 'y' | null,
  }} */ ({
    startX: 0,
    startY: 0,
    lastX: 0,
    lastT: 0,
    velocityX: 0,
    axis: null,
  }))

  useEffect(() => {
    if (!enabled) return undefined
    const el = scrollerRef.current
    if (!el) return undefined

    let settleTimer = 0

    const clearCarouselInteraction = () => {
      el.removeAttribute('data-lounge-carousel-dragging')
      el.style.scrollSnapType = ''
      el.style.touchAction = ''
    }

    const resetGesture = () => {
      gestureRef.current = {
        startX: 0,
        startY: 0,
        lastX: 0,
        lastT: 0,
        velocityX: 0,
        axis: null,
      }
    }

    const slideOffsets = () => {
      const children = el.children
      const offsets = []
      for (let i = 0; i < children.length; i += 1) {
        offsets.push(/** @type {HTMLElement} */ (children[i]).offsetLeft)
      }
      return offsets
    }

    const commitTargetLeft = (scrollLeft, velocityX) => {
      const offsets = slideOffsets()
      if (!offsets.length) return 0

      let idx = 0
      for (let i = 0; i < offsets.length; i += 1) {
        if (offsets[i] <= scrollLeft + 1) idx = i
      }

      const nextOffset = offsets[idx + 1]
      const span =
        nextOffset != null
          ? nextOffset - offsets[idx]
          : Math.max(el.clientWidth * 0.6, offsets[idx] - (offsets[idx - 1] ?? 0))
      const progress = span > 0 ? (scrollLeft - offsets[idx]) / span : 0

      let targetIdx = idx
      if (velocityX > FLICK_VELOCITY_PX_MS || progress >= COMMIT_PROGRESS) {
        targetIdx = Math.min(idx + 1, offsets.length - 1)
      } else if (velocityX < -FLICK_VELOCITY_PX_MS) {
        targetIdx = Math.max(idx - 1, 0)
      }

      return offsets[targetIdx] ?? 0
    }

    const finishHorizontalGesture = (velocityX) => {
      const targetLeft = commitTargetLeft(el.scrollLeft, velocityX)
      el.style.scrollSnapType = 'none'

      let released = false
      const releaseSnap = () => {
        if (released) return
        released = true
        if (settleTimer) {
          window.clearTimeout(settleTimer)
          settleTimer = 0
        }
        clearCarouselInteraction()
      }

      try {
        el.scrollTo({ left: targetLeft, behavior: 'smooth' })
      } catch {
        el.scrollLeft = targetLeft
      }

      el.addEventListener('scrollend', releaseSnap, { once: true })
      settleTimer = window.setTimeout(releaseSnap, SNAP_SETTLE_MS)
    }

    const onTouchStart = (e) => {
      if (e.touches.length !== 1) {
        resetGesture()
        return
      }
      if (settleTimer) {
        window.clearTimeout(settleTimer)
        settleTimer = 0
        clearCarouselInteraction()
      }
      const t = e.touches[0]
      const now = performance.now()
      gestureRef.current = {
        startX: t.clientX,
        startY: t.clientY,
        lastX: t.clientX,
        lastT: now,
        velocityX: 0,
        axis: null,
      }
    }

    const onTouchMove = (e) => {
      if (e.touches.length !== 1) return
      const g = gestureRef.current
      const t = e.touches[0]
      const now = performance.now()
      const dx = t.clientX - g.startX
      const dy = t.clientY - g.startY

      if (!g.axis) {
        if (Math.abs(dx) < AXIS_LOCK_PX && Math.abs(dy) < AXIS_LOCK_PX) return
        if (Math.abs(dx) >= AXIS_LOCK_PX && Math.abs(dx) >= Math.abs(dy) * HORIZONTAL_VS_VERTICAL) {
          g.axis = 'x'
          el.setAttribute('data-lounge-carousel-dragging', 'true')
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
      const dt = Math.max(now - g.lastT, 1)
      g.velocityX = (g.lastX - t.clientX) / dt
      el.scrollLeft -= t.clientX - g.lastX
      g.lastX = t.clientX
      g.lastT = now
    }

    const onTouchEnd = () => {
      const g = gestureRef.current
      if (g.axis === 'x') {
        finishHorizontalGesture(g.velocityX)
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
      if (settleTimer) window.clearTimeout(settleTimer)
      resetGesture()
      clearCarouselInteraction()
    }
  }, [enabled, scrollerRef])

  return {}
}
