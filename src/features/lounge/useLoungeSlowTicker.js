import { useEffect } from 'react'

/**
 * Slow horizontal marquee for overflow strips (hub game pills, multi score cards).
 * Pauses on pointer/touch/wheel; resumes after idle. Honors prefers-reduced-motion.
 *
 * `rebindKey`: change it whenever the scroll element remounts so the ticker binds to the new node.
 *
 * @param {React.RefObject<HTMLElement | null>} scrollRef
 * @param {{ enabled?: boolean, speedPxPerSec?: number, resumeMs?: number, loop?: boolean, rebindKey?: string }} opts
 */
export function useLoungeSlowTicker(
  scrollRef,
  { enabled = true, speedPxPerSec = 26, resumeMs = 2400, loop = true, rebindKey = '' } = {},
) {
  useEffect(() => {
    if (!enabled) return undefined
    const el = scrollRef.current
    if (!el) return undefined
    if (typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      return undefined
    }

    let raf = 0
    let last = performance.now()
    let resumeTimer = 0
    let userPaused = false
    // Float position … browsers can round sub-pixel scrollLeft steps (~0.4px/frame) back to 0.
    let pos = el.scrollLeft
    // Scroll events land async, so our own writes are recognized by position, not a sync flag.
    let lastWritten = el.scrollLeft

    const canScroll = () => el.scrollWidth > el.clientWidth + 4

    const pauseForUser = () => {
      userPaused = true
      window.clearTimeout(resumeTimer)
      resumeTimer = window.setTimeout(() => {
        userPaused = false
        last = performance.now()
        pos = el.scrollLeft
      }, resumeMs)
    }

    const tick = (now) => {
      const dt = Math.min(0.048, (now - last) / 1000)
      last = now
      if (!userPaused && canScroll()) {
        pos += speedPxPerSec * dt
        if (loop) {
          const half = el.scrollWidth / 2
          if (half > el.clientWidth && pos >= half - 1) pos -= half
        } else if (pos + el.clientWidth >= el.scrollWidth - 2) {
          pos = 0
        }
        el.scrollLeft = pos
        lastWritten = el.scrollLeft
      }
      raf = requestAnimationFrame(tick)
    }

    raf = requestAnimationFrame(tick)

    const onPointerDown = () => pauseForUser()
    const onWheel = () => pauseForUser()
    const onScroll = () => {
      if (Math.abs(el.scrollLeft - lastWritten) > 2) pauseForUser()
    }

    el.addEventListener('pointerdown', onPointerDown)
    el.addEventListener('touchstart', onPointerDown, { passive: true })
    el.addEventListener('wheel', onWheel, { passive: true })
    el.addEventListener('scroll', onScroll, { passive: true })

    return () => {
      cancelAnimationFrame(raf)
      window.clearTimeout(resumeTimer)
      el.removeEventListener('pointerdown', onPointerDown)
      el.removeEventListener('touchstart', onPointerDown)
      el.removeEventListener('wheel', onWheel)
      el.removeEventListener('scroll', onScroll)
    }
  }, [enabled, loop, rebindKey, resumeMs, scrollRef, speedPxPerSec])
}
