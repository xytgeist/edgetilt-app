import { useEffect } from 'react'

const AXIS_LOCK_PX = 6
const HORIZONTAL_VS_VERTICAL = 0.82
const VERTICAL_VS_HORIZONTAL = 1.2
const VERTICAL_MIN_PX = 8
/** Per ~16ms frame during momentum (higher = longer glide). */
const MOMENTUM_FRICTION = 0.965
const MIN_VELOCITY_PX_MS = 0.012
const SLOW_DRAG_VELOCITY_PX_MS = 0.06
const VELOCITY_SAMPLE_MS = 100

/**
 * Feed carousel axis lock with optional momentum glide on release.
 * Horizontal swipes move the carousel; vertical swipes scroll the feed.
 * Rest position is wherever the user leaves the strip (no snap-to-slide).
 *
 * @param {React.RefObject<HTMLElement|null>} scrollerRef
 * @param {boolean} enabled
 */
export function useLoungeFeedCarouselAxisLock(scrollerRef, enabled) {
  useEffect(() => {
    if (!enabled) return undefined
    const el = scrollerRef.current
    if (!el) return undefined

    let momentumRaf = 0
    /** @type {{ v: number, t: number }[]} */
    let velocitySamples = []

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

    const maxScrollLeft = () => Math.max(0, el.scrollWidth - el.clientWidth)

    const clampScroll = (left) => Math.max(0, Math.min(maxScrollLeft(), left))

    const cancelAnimations = () => {
      if (momentumRaf) {
        cancelAnimationFrame(momentumRaf)
        momentumRaf = 0
      }
    }

    const clearInteractionStyles = () => {
      el.style.touchAction = ''
      el.removeAttribute('data-lounge-carousel-dragging')
    }

    const finalizeGesture = () => {
      cancelAnimations()
      el.scrollLeft = clampScroll(el.scrollLeft)
      clearInteractionStyles()
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
      velocitySamples = []
    }

    const releaseVelocity = () => {
      const now = performance.now()
      const recent = velocitySamples.filter((s) => now - s.t <= VELOCITY_SAMPLE_MS)
      if (!recent.length) return gesture.velocityX
      return recent.reduce((sum, s) => sum + s.v, 0) / recent.length
    }

    const runMomentum = (initialVelocity) => {
      let velocity = initialVelocity
      let lastT = performance.now()

      const step = (now) => {
        const dt = Math.min(Math.max(now - lastT, 1), 24)
        lastT = now
        el.scrollLeft = clampScroll(el.scrollLeft + velocity * dt)
        velocity *= MOMENTUM_FRICTION ** (dt / 16)

        if (Math.abs(velocity) > MIN_VELOCITY_PX_MS) {
          momentumRaf = requestAnimationFrame(step)
          return
        }

        momentumRaf = 0
        finalizeGesture()
      }

      momentumRaf = requestAnimationFrame(step)
    }

    const finishHorizontalGesture = () => {
      el.setAttribute('data-lounge-carousel-dragging', 'true')
      const releaseVel = releaseVelocity()

      if (Math.abs(releaseVel) >= SLOW_DRAG_VELOCITY_PX_MS) {
        runMomentum(releaseVel)
        return
      }

      finalizeGesture()
    }

    const onTouchStart = (e) => {
      if (e.touches.length !== 1) {
        resetGesture()
        return
      }
      cancelAnimations()
      clearInteractionStyles()
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
      velocitySamples = []
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
      const sampleV = (gesture.lastX - t.clientX) / dt
      gesture.velocityX = sampleV
      velocitySamples.push({ v: sampleV, t: now })
      if (velocitySamples.length > 8) velocitySamples.shift()

      el.scrollLeft = clampScroll(el.scrollLeft - (t.clientX - gesture.lastX))
      gesture.lastX = t.clientX
      gesture.lastT = now
    }

    const onTouchEnd = () => {
      if (gesture.axis === 'x') {
        finishHorizontalGesture()
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
      cancelAnimations()
      resetGesture()
      clearInteractionStyles()
    }
  }, [enabled, scrollerRef])

  return {}
}
