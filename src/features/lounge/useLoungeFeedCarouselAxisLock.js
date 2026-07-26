import { useEffect } from 'react'

const SETTLE_CLAMP_MS = 340

/**
 * Multi-slide feed carousel: native horizontal scroll (momentum + scroll-snap) with a post-gesture
 * clamp to the nearest slide. Custom drag + commit fought CSS snap and left slide 0 misaligned
 * (scrollLeft stuck > 0 after swiping back).
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
    let touchActive = false

    const slideOffsets = () => {
      const children = el.children
      const offsets = []
      for (let i = 0; i < children.length; i += 1) {
        offsets.push(/** @type {HTMLElement} */ (children[i]).offsetLeft)
      }
      return offsets
    }

    /** Snap column for scrollLeft (midpoint tie-break toward the next slide). */
    const nearestSlideLeft = (scrollLeft) => {
      const offsets = slideOffsets()
      if (!offsets.length) return 0

      let idx = 0
      for (let i = 0; i < offsets.length; i += 1) {
        if (offsets[i] <= scrollLeft + 0.5) idx = i
      }

      if (idx < offsets.length - 1) {
        const mid = (offsets[idx] + offsets[idx + 1]) / 2
        if (scrollLeft >= mid) return offsets[idx + 1]
      }
      return offsets[idx] ?? 0
    }

    const hardClampToNearest = () => {
      const targetLeft = nearestSlideLeft(el.scrollLeft)
      el.scrollLeft = targetLeft
    }

    const finishTouchGesture = () => {
      const targetLeft = nearestSlideLeft(el.scrollLeft)
      if (Math.abs(el.scrollLeft - targetLeft) > 1) {
        try {
          el.scrollTo({ left: targetLeft, behavior: 'smooth' })
        } catch {
          el.scrollLeft = targetLeft
        }
      } else {
        el.scrollLeft = targetLeft
      }

      if (settleTimer) window.clearTimeout(settleTimer)
      settleTimer = window.setTimeout(() => {
        settleTimer = 0
        hardClampToNearest()
      }, SETTLE_CLAMP_MS)
    }

    const onTouchStart = () => {
      touchActive = true
      if (settleTimer) {
        window.clearTimeout(settleTimer)
        settleTimer = 0
      }
      el.setAttribute('data-lounge-carousel-dragging', 'true')
    }

    const onTouchEnd = () => {
      if (!touchActive) return
      touchActive = false
      el.removeAttribute('data-lounge-carousel-dragging')
      window.requestAnimationFrame(() => {
        finishTouchGesture()
      })
    }

    el.addEventListener('touchstart', onTouchStart, { passive: true })
    el.addEventListener('touchend', onTouchEnd, { passive: true })
    el.addEventListener('touchcancel', onTouchEnd, { passive: true })

    return () => {
      el.removeEventListener('touchstart', onTouchStart)
      el.removeEventListener('touchend', onTouchEnd)
      el.removeEventListener('touchcancel', onTouchEnd)
      if (settleTimer) window.clearTimeout(settleTimer)
      touchActive = false
      el.removeAttribute('data-lounge-carousel-dragging')
    }
  }, [enabled, scrollerRef])

  return {}
}
