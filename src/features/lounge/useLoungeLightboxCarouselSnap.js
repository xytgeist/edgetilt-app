import { useEffect } from 'react'

/**
 * Full-bleed lightbox pager: native scroll-snap between slides, index sync on scroll/resize.
 * Unlike feed carousels, rest position always lands on a whole slide (no free scroll).
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

    let raf = 0

    const readIndex = () => {
      const w = el.clientWidth
      if (!w) return 0
      return Math.max(0, Math.min(slideCount - 1, Math.round(el.scrollLeft / w)))
    }

    const syncIndex = () => {
      onIndexChange(readIndex())
    }

    const scheduleSync = () => {
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(syncIndex)
    }

    const onScroll = () => scheduleSync()
    const onScrollEnd = () => syncIndex()
    const onResize = () => {
      const i = readIndex()
      const w = el.clientWidth
      if (w) el.scrollLeft = i * w
      syncIndex()
    }

    el.addEventListener('scroll', onScroll, { passive: true })
    el.addEventListener('scrollend', onScrollEnd, { passive: true })
    window.addEventListener('resize', onResize, { passive: true })

    scheduleSync()

    return () => {
      el.removeEventListener('scroll', onScroll)
      el.removeEventListener('scrollend', onScrollEnd)
      window.removeEventListener('resize', onResize)
      cancelAnimationFrame(raf)
    }
  }, [enabled, onIndexChange, scrollerRef, slideCount])
}
