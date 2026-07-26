import { useEffect } from 'react'

const AXIS_LOCK_PX = 6
/** Horizontal wins on modest diagonal; vertical must be clearly dominant to scroll the feed. */
const HORIZONTAL_VS_VERTICAL = 0.82
const VERTICAL_VS_HORIZONTAL = 1.2
const VERTICAL_MIN_PX = 8
/** px/ms — light flick commits. */
const FLICK_VELOCITY_PX_MS = 0.16
/** Fraction of slide span — ~20% drag advances (not half the slide). */
const COMMIT_PROGRESS = 0.2
const SETTLE_CLAMP_MS = 300

/**
 * Feed carousel axis lock: horizontal swipes move the carousel; vertical swipes scroll the feed.
 * Uses non-passive touchmove so horizontal gestures can block feed scroll without touch-pan-x.
 *
 * @param {React.RefObject<HTMLElement|null>} scrollerRef
 * @param {boolean} enabled
 */
export function useLoungeFeedCarouselAxisLock(scrollerRef, enabled) {
  useEffect(() => {
    if (!enabled) return undefined
    const el = scrollerRef.current
    if (!el) return undefined

    let settleTimer = 0
    /** @type {{ startX: number, startY: number, lastX: number, lastT: number, velocityX: number, axis: 'x' | 'y' | null }} */
    let gesture = {
      startX: 0,
      startY: 0,
      lastX: 0,
      lastT: 0,
      velocityX: 0,
      axis: null,
    }

    const slideOffsets = () => {
      const children = el.children
      const offsets = []
      for (let i = 0; i < children.length; i += 1) {
        offsets.push(/** @type {HTMLElement} */ (children[i]).offsetLeft)
      }
      return offsets
    }

    const resetGesture = () => {
      gesture = {
        startX: 0,
        startY: 0,
        lastX: 0,
        lastT: 0,
        velocityX: 0,
        axis: null,
      }
    }

    const resolveTargetLeft = (scrollLeft, velocityX, offsets) => {
      const n = offsets.length
      if (!n) return 0

      let nearestIdx = 0
      let bestDist = Infinity
      for (let i = 0; i < n; i += 1) {
        const d = Math.abs(offsets[i] - scrollLeft)
        if (d < bestDist) {
          bestDist = d
          nearestIdx = i
        }
      }

      if (velocityX > FLICK_VELOCITY_PX_MS) {
        return offsets[Math.min(nearestIdx + 1, n - 1)]
      }
      if (velocityX < -FLICK_VELOCITY_PX_MS) {
        return offsets[Math.max(nearestIdx - 1, 0)]
      }

      if (nearestIdx < n - 1) {
        const span = offsets[nearestIdx + 1] - offsets[nearestIdx]
        const progress = span > 0 ? (scrollLeft - offsets[nearestIdx]) / span : 0
        if (progress >= COMMIT_PROGRESS) {
          return offsets[nearestIdx + 1]
        }
      }
      if (nearestIdx > 0) {
        const span = offsets[nearestIdx] - offsets[nearestIdx - 1]
        const progressBack = span > 0 ? (offsets[nearestIdx] - scrollLeft) / span : 0
        if (progressBack >= COMMIT_PROGRESS) {
          return offsets[nearestIdx - 1]
        }
      }

      return offsets[nearestIdx] ?? 0
    }

    const clearSettleTimer = () => {
      if (settleTimer) {
        window.clearTimeout(settleTimer)
        settleTimer = 0
      }
    }

    const finishHorizontalGesture = (velocityX) => {
      const offsets = slideOffsets()
      const targetLeft = resolveTargetLeft(el.scrollLeft, velocityX, offsets)
      el.style.scrollSnapType = 'none'

      let finalized = false
      const finalize = () => {
        if (finalized) return
        finalized = true
        clearSettleTimer()
        el.scrollLeft = targetLeft
        el.style.scrollSnapType = ''
        el.style.touchAction = ''
        el.removeAttribute('data-lounge-carousel-dragging')
      }

      if (Math.abs(el.scrollLeft - targetLeft) <= 1) {
        finalize()
        return
      }

      try {
        el.scrollTo({ left: targetLeft, behavior: 'smooth' })
      } catch {
        el.scrollLeft = targetLeft
        finalize()
        return
      }

      el.addEventListener('scrollend', finalize, { once: true })
      settleTimer = window.setTimeout(finalize, SETTLE_CLAMP_MS)
    }

    const onTouchStart = (e) => {
      if (e.touches.length !== 1) {
        resetGesture()
        return
      }
      clearSettleTimer()
      const t = e.touches[0]
      const now = performance.now()
      gesture = {
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
      const t = e.touches[0]
      const now = performance.now()
      const dx = t.clientX - gesture.startX
      const dy = t.clientY - gesture.startY

      if (!gesture.axis) {
        if (Math.abs(dx) < AXIS_LOCK_PX && Math.abs(dy) < AXIS_LOCK_PX) return
        if (Math.abs(dx) >= AXIS_LOCK_PX && Math.abs(dx) >= Math.abs(dy) * HORIZONTAL_VS_VERTICAL) {
          gesture.axis = 'x'
          el.setAttribute('data-lounge-carousel-dragging', 'true')
          el.style.scrollSnapType = 'none'
          el.style.touchAction = 'none'
        } else if (
          Math.abs(dy) >= VERTICAL_MIN_PX &&
          Math.abs(dy) >= Math.abs(dx) * VERTICAL_VS_HORIZONTAL
        ) {
          gesture.axis = 'y'
          return
        } else {
          return
        }
      }

      if (gesture.axis === 'y') return

      e.preventDefault()
      const dt = Math.max(now - gesture.lastT, 1)
      gesture.velocityX = (gesture.lastX - t.clientX) / dt
      el.scrollLeft -= t.clientX - gesture.lastX
      gesture.lastX = t.clientX
      gesture.lastT = now
    }

    const onTouchEnd = () => {
      if (gesture.axis === 'x') {
        finishHorizontalGesture(gesture.velocityX)
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
      clearSettleTimer()
      resetGesture()
      el.style.scrollSnapType = ''
      el.style.touchAction = ''
      el.removeAttribute('data-lounge-carousel-dragging')
    }
  }, [enabled, scrollerRef])

  return {}
}
