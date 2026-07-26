import { useEffect } from 'react'

const AXIS_LOCK_PX = 6
/** Horizontal wins on modest diagonal; vertical must be clearly dominant to scroll the feed. */
const HORIZONTAL_VS_VERTICAL = 0.82
const VERTICAL_VS_HORIZONTAL = 1.2
const VERTICAL_MIN_PX = 8
/** px/ms — light flick commits. */
const FLICK_VELOCITY_PX_MS = 0.16
/** Fraction of slide span — ~20% net drag advances (not half the slide). */
const COMMIT_PROGRESS = 0.2

/**
 * Feed carousel axis lock: horizontal swipes move the carousel; vertical swipes scroll the feed.
 *
 * @param {React.RefObject<HTMLElement|null>} scrollerRef
 * @param {boolean} enabled
 */
export function useLoungeFeedCarouselAxisLock(scrollerRef, enabled) {
  useEffect(() => {
    if (!enabled) return undefined
    const el = scrollerRef.current
    if (!el) return undefined

    /** @type {{
     *   startX: number,
     *   startY: number,
     *   lastX: number,
     *   lastT: number,
     *   velocityX: number,
     *   startScrollLeft: number,
     *   axis: 'x' | 'y' | null,
     * }} */
    let gesture = {
      startX: 0,
      startY: 0,
      lastX: 0,
      lastT: 0,
      velocityX: 0,
      startScrollLeft: 0,
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

    const slideIndexForScrollLeft = (scrollLeft, offsets) => {
      let idx = 0
      for (let i = 0; i < offsets.length; i += 1) {
        if (offsets[i] <= scrollLeft + 0.5) idx = i
      }
      return idx
    }

    const resetGesture = () => {
      gesture = {
        startX: 0,
        startY: 0,
        lastX: 0,
        lastT: 0,
        velocityX: 0,
        startScrollLeft: 0,
        axis: null,
      }
    }

    /**
     * Commit using net drag from gesture start — avoids treating a partial swipe-back from slide 2
     * as "20% forward from slide 0" and leaving scrollLeft stuck between snaps.
     */
    const resolveTargetLeft = (scrollLeft, velocityX, startScrollLeft, offsets) => {
      const n = offsets.length
      if (!n) return 0

      const startIdx = slideIndexForScrollLeft(startScrollLeft, offsets)
      const netDelta = scrollLeft - startScrollLeft
      const spanForward = startIdx < n - 1 ? offsets[startIdx + 1] - offsets[startIdx] : 0
      const spanBack = startIdx > 0 ? offsets[startIdx] - offsets[startIdx - 1] : 0

      if (
        velocityX > FLICK_VELOCITY_PX_MS ||
        (netDelta > 0 && spanForward > 0 && netDelta >= spanForward * COMMIT_PROGRESS)
      ) {
        return offsets[Math.min(startIdx + 1, n - 1)]
      }
      if (
        velocityX < -FLICK_VELOCITY_PX_MS ||
        (netDelta < 0 && spanBack > 0 && -netDelta >= spanBack * COMMIT_PROGRESS)
      ) {
        return offsets[Math.max(startIdx - 1, 0)]
      }

      return offsets[startIdx] ?? 0
    }

    const finishHorizontalGesture = (velocityX, startScrollLeft) => {
      const offsets = slideOffsets()
      const targetLeft = resolveTargetLeft(el.scrollLeft, velocityX, startScrollLeft, offsets)

      el.style.scrollSnapType = 'none'
      el.scrollLeft = targetLeft
      el.style.scrollSnapType = ''
      el.style.touchAction = ''
      el.removeAttribute('data-lounge-carousel-dragging')
    }

    const onTouchStart = (e) => {
      if (e.touches.length !== 1) {
        resetGesture()
        return
      }
      const t = e.touches[0]
      const now = performance.now()
      gesture = {
        startX: t.clientX,
        startY: t.clientY,
        lastX: t.clientX,
        lastT: now,
        velocityX: 0,
        startScrollLeft: el.scrollLeft,
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
          gesture.startScrollLeft = el.scrollLeft
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
        finishHorizontalGesture(gesture.velocityX, gesture.startScrollLeft)
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
      el.style.scrollSnapType = ''
      el.style.touchAction = ''
      el.removeAttribute('data-lounge-carousel-dragging')
    }
  }, [enabled, scrollerRef])

  return {}
}
