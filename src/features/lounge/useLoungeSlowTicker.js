import { useEffect } from 'react'

/**
 * Slow horizontal marquee for overflow strips (hub game pills, multi score cards).
 * Pauses on pointer/touch/wheel; resumes after idle. Honors prefers-reduced-motion.
 *
 * @param {React.RefObject<HTMLElement | null>} scrollRef
 * @param {{ enabled?: boolean, speedPxPerSec?: number, resumeMs?: number, loop?: boolean }} opts
 */
export function useLoungeSlowTicker(
  scrollRef,
  { enabled = true, speedPxPerSec = 26, resumeMs = 2400, loop = true } = {},
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
    let selfScroll = false

    const canScroll = () => el.scrollWidth > el.clientWidth + 4

    const pauseForUser = () => {
      userPaused = true
      window.clearTimeout(resumeTimer)
      resumeTimer = window.setTimeout(() => {
        userPaused = false
        last = performance.now()
      }, resumeMs)
    }

    const tick = (now) => {
      const dt = Math.min(0.048, (now - last) / 1000)
      last = now
      if (!userPaused && canScroll()) {
        selfScroll = true
        el.scrollLeft += speedPxPerSec * dt
        if (loop) {
          const half = el.scrollWidth / 2
          if (half > el.clientWidth && el.scrollLeft >= half - 1) {
            el.scrollLeft -= half
          }
        } else if (el.scrollLeft + el.clientWidth >= el.scrollWidth - 2) {
          el.scrollLeft = 0
        }
        selfScroll = false
      }
      raf = requestAnimationFrame(tick)
    }

    raf = requestAnimationFrame(tick)

    const onPointerDown = () => pauseForUser()
    const onWheel = () => pauseForUser()
    const onScroll = () => {
      if (!selfScroll) pauseForUser()
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
  }, [enabled, loop, resumeMs, scrollRef, speedPxPerSec])
}
