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
 * Uses pointer events + coalesced move samples so scroll tracks the finger
 * at ~1px steps (touchmove-only scrollLeft updates feel chunky on mobile).
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
    /** @type {number | null} */
    let activePointerId = null

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
      const pointerId = activePointerId
      activePointerId = null
      try {
        if (pointerId != null) el.releasePointerCapture(pointerId)
      } catch {
        // ignore
      }
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

    const noteVelocity = (clientX, t) => {
      const dt = Math.max(t - gesture.lastT, 1)
      const sampleV = (gesture.lastX - clientX) / dt
      gesture.velocityX = sampleV
      velocitySamples.push({ v: sampleV, t })
      if (velocitySamples.length > 8) velocitySamples.shift()
      gesture.lastX = clientX
      gesture.lastT = t
    }

    const applyHorizontalScroll = (clientX) => {
      el.scrollLeft = clampScroll(gesture.startScrollLeft + (gesture.startX - clientX))
    }

    const lockHorizontalAxis = (pointerId) => {
      gesture.axis = 'x'
      gesture.startScrollLeft = el.scrollLeft
      activePointerId = pointerId
      el.setAttribute('data-lounge-carousel-dragging', 'true')
      el.style.touchAction = 'none'
      try {
        el.setPointerCapture(pointerId)
      } catch {
        // ignore
      }
    }

    const onPointerDown = (e) => {
      if (e.pointerType === 'mouse' && e.button !== 0) return
      if (activePointerId != null && e.pointerId !== activePointerId) return
      cancelAnimations()
      clearInteractionStyles()
      const now = e.timeStamp || performance.now()
      gesture = {
        startX: e.clientX,
        startY: e.clientY,
        lastX: e.clientX,
        lastT: now,
        velocityX: 0,
        startScrollLeft: el.scrollLeft,
        axis: null,
      }
      velocitySamples = []
      activePointerId = e.pointerId
    }

    const onPointerMove = (e) => {
      if (activePointerId == null || e.pointerId !== activePointerId) return
      const dx = e.clientX - gesture.startX
      const dy = e.clientY - gesture.startY

      if (!gesture.axis) {
        if (Math.abs(dx) < AXIS_LOCK_PX && Math.abs(dy) < AXIS_LOCK_PX) return
        if (Math.abs(dx) >= AXIS_LOCK_PX && Math.abs(dx) >= Math.abs(dy) * HORIZONTAL_VS_VERTICAL) {
          lockHorizontalAxis(e.pointerId)
        } else if (
          Math.abs(dy) >= VERTICAL_MIN_PX &&
          Math.abs(dy) >= Math.abs(dx) * VERTICAL_VS_HORIZONTAL
        ) {
          gesture.axis = 'y'
          activePointerId = null
          return
        } else {
          return
        }
      }

      if (gesture.axis === 'y') return

      e.preventDefault()
      const coalesced =
        typeof e.getCoalescedEvents === 'function' ? e.getCoalescedEvents() : [e]
      for (const pe of coalesced) {
        if (pe.pointerId !== activePointerId) continue
        applyHorizontalScroll(pe.clientX)
        noteVelocity(pe.clientX, pe.timeStamp || performance.now())
      }
    }

    const onPointerUp = (e) => {
      if (activePointerId == null || e.pointerId !== activePointerId) return
      const wasHorizontal = gesture.axis === 'x'
      try {
        el.releasePointerCapture(e.pointerId)
      } catch {
        // ignore
      }
      if (wasHorizontal) {
        applyHorizontalScroll(e.clientX)
        finishHorizontalGesture()
      } else {
        clearInteractionStyles()
      }
      activePointerId = null
      resetGesture()
    }

    el.addEventListener('pointerdown', onPointerDown, { passive: true })
    el.addEventListener('pointermove', onPointerMove, { passive: false })
    el.addEventListener('pointerup', onPointerUp, { passive: true })
    el.addEventListener('pointercancel', onPointerUp, { passive: true })

    return () => {
      el.removeEventListener('pointerdown', onPointerDown)
      el.removeEventListener('pointermove', onPointerMove)
      el.removeEventListener('pointerup', onPointerUp)
      el.removeEventListener('pointercancel', onPointerUp)
      cancelAnimations()
      resetGesture()
      clearInteractionStyles()
      activePointerId = null
    }
  }, [enabled, scrollerRef])

  return {}
}
