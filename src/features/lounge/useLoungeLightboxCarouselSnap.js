import { useEffect } from 'react'

/** Fallback when `scrollend` is missing (older WebViews). */
const SCROLL_SETTLE_MS = 90

/**
 * Full-bleed lightbox pager: native scroll-snap between slides, index sync on settle.
 * Do not sync React index on every scroll frame … that re-renders mid-swipe and hitches.
 *
 * @param {React.RefObject<HTMLElement|null>} scrollerRef
 * @param {boolean} enabled
 * @param {number} slideCount
 * @param {(index: number) => void} onIndexChange
 */
export function useLoungeLightboxCarouselSnap(scrollerRef, enabled, slideCount, onIndexChange) {
  useEffect(() => {
    if (!enabled || slideCount <= 1) return undefined
    const el = scrollerRef.current
    if (!el) return undefined

    let settleTimer = 0

    const readIndex = () => {
      const w = el.clientWidth
      if (!w) return 0
      return Math.max(0, Math.min(slideCount - 1, Math.round(el.scrollLeft / w)))
    }

    const syncIndex = () => {
      onIndexChange(readIndex())
    }

    const onScroll = () => {
      // Debounced settle only … avoid React work while the finger is still moving.
      try {
        window.clearTimeout(settleTimer)
      } catch {
        // ignore
      }
      settleTimer = window.setTimeout(() => {
        settleTimer = 0
        syncIndex()
      }, SCROLL_SETTLE_MS)
    }

    const onScrollEnd = () => {
      try {
        window.clearTimeout(settleTimer)
      } catch {
        // ignore
      }
      settleTimer = 0
      syncIndex()
    }

    const onResize = () => {
      const i = readIndex()
      const w = el.clientWidth
      if (w) el.scrollLeft = i * w
      syncIndex()
    }

    el.addEventListener('scroll', onScroll, { passive: true })
    el.addEventListener('scrollend', onScrollEnd, { passive: true })
    window.addEventListener('resize', onResize, { passive: true })

    syncIndex()

    return () => {
      el.removeEventListener('scroll', onScroll)
      el.removeEventListener('scrollend', onScrollEnd)
      window.removeEventListener('resize', onResize)
      try {
        window.clearTimeout(settleTimer)
      } catch {
        // ignore
      }
    }
  }, [enabled, onIndexChange, scrollerRef, slideCount])
}
