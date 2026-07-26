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
/** Max rubber-band travel past scroll limits (px). */
const RUBBER_BAND_LIMIT_PX = 80
const SPRING_BACK_MS = 320

/**
 * Diminishing resistance past scroll limits (iOS-style).
 * @param {number} overscroll
 * @param {number} [limit]
 */
function rubberBandDistance(overscroll, limit = RUBBER_BAND_LIMIT_PX) {
  const o = Math.max(0, overscroll)
  if (o <= 0) return 0
  return limit * (1 - 1 / (o / limit + 1))
}

/**
 * @param {number} rawLeft
 * @param {number} min
 * @param {number} max
 */
function rubberBandScrollLeft(rawLeft, min, max) {
  if (rawLeft < min) return min - rubberBandDistance(min - rawLeft)
  if (rawLeft > max) return max + rubberBandDistance(rawLeft - max)
  return rawLeft
}

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
    let springRaf = 0
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

    const getTrack = () => el.querySelector('[data-lounge-feed-carousel-track]')

    const maxScrollLeft = () => Math.max(0, el.scrollWidth - el.clientWidth)

    const clampScroll = (left) => Math.max(0, Math.min(maxScrollLeft(), left))

    const readTrackTranslateX = () => {
      const track = getTrack()
      if (!track) return 0
      const raw = track.style.transform
      if (!raw) return 0
      const match = raw.match(/translate3d\(([-\d.]+)px/)
      return match ? parseFloat(match[1]) || 0 : 0
    }

    const setTrackTranslateX = (x) => {
      const track = getTrack()
      if (!track) return
      if (!x || Math.abs(x) < 0.5) {
        track.style.transform = ''
        return
      }
      track.style.transform = `translate3d(${x}px,0,0)`
    }

    const cancelAnimations = () => {
      if (momentumRaf) {
        cancelAnimationFrame(momentumRaf)
        momentumRaf = 0
      }
      if (springRaf) {
        cancelAnimationFrame(springRaf)
        springRaf = 0
      }
    }

    const clearInteractionStyles = () => {
      el.style.touchAction = ''
      el.removeAttribute('data-lounge-carousel-dragging')
      setTrackTranslateX(0)
    }

    /**
     * @param {(() => void) | undefined} [onComplete]
     */
    const springBackTrack = (onComplete) => {
      const from = readTrackTranslateX()
      if (Math.abs(from) < 0.5) {
        setTrackTranslateX(0)
        onComplete?.()
        return
      }
      const start = performance.now()
      const step = (now) => {
        const t = Math.min(1, (now - start) / SPRING_BACK_MS)
        const eased = 1 - (1 - t) ** 3
        const x = from * (1 - eased)
        if (t >= 1 || Math.abs(x) < 0.5) {
          setTrackTranslateX(0)
          springRaf = 0
          onComplete?.()
          return
        }
        setTrackTranslateX(x)
        springRaf = requestAnimationFrame(step)
      }
      springRaf = requestAnimationFrame(step)
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
      springBackTrack(clearInteractionStyles)
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

    const applyRubberBandScroll = (rawLeft) => {
      const max = maxScrollLeft()
      const visualLeft = rubberBandScrollLeft(rawLeft, 0, max)
      const clamped = Math.max(0, Math.min(max, visualLeft))
      const overscroll = visualLeft - clamped
      el.scrollLeft = clamped
      setTrackTranslateX(-overscroll)
    }

    const runMomentum = (initialVelocity) => {
      let velocity = initialVelocity
      let lastT = performance.now()

      const finishMomentum = () => {
        momentumRaf = 0
        el.scrollLeft = clampScroll(el.scrollLeft)
        springBackTrack(clearInteractionStyles)
      }

      const step = (now) => {
        const dt = Math.min(Math.max(now - lastT, 1), 24)
        lastT = now
        const max = maxScrollLeft()
        const next = el.scrollLeft + velocity * dt

        if (next < 0) {
          el.scrollLeft = 0
          setTrackTranslateX(rubberBandDistance(-next))
          finishMomentum()
          return
        }
        if (next > max) {
          el.scrollLeft = max
          setTrackTranslateX(-rubberBandDistance(next - max))
          finishMomentum()
          return
        }

        el.scrollLeft = next
        velocity *= MOMENTUM_FRICTION ** (dt / 16)

        if (Math.abs(velocity) > MIN_VELOCITY_PX_MS) {
          momentumRaf = requestAnimationFrame(step)
          return
        }

        finishMomentum()
      }

      momentumRaf = requestAnimationFrame(step)
    }

    const finishHorizontalGesture = () => {
      el.setAttribute('data-lounge-carousel-dragging', 'true')
      const releaseVel = releaseVelocity()
      const hasOverscroll = Math.abs(readTrackTranslateX()) >= 0.5

      if (hasOverscroll) {
        cancelAnimations()
        el.scrollLeft = clampScroll(el.scrollLeft)
        springBackTrack(clearInteractionStyles)
        return
      }

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
      el.scrollTop = 0
      applyRubberBandScroll(gesture.startScrollLeft + (gesture.startX - clientX))
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
      setTrackTranslateX(0)
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
