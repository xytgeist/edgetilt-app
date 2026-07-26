import { useEffect } from 'react'

const AXIS_LOCK_PX = 6
const HORIZONTAL_VS_VERTICAL = 0.82
const VERTICAL_VS_HORIZONTAL = 1.2
const VERTICAL_MIN_PX = 8
const FLICK_VELOCITY_PX_MS = 0.14
const COMMIT_PROGRESS = 0.2
/** Per ~16ms frame during momentum (higher = longer glide). */
const MOMENTUM_FRICTION = 0.965
const MIN_VELOCITY_PX_MS = 0.012
const SNAP_ANIM_MS = 300
const SLOW_DRAG_VELOCITY_PX_MS = 0.06
const VELOCITY_SAMPLE_MS = 100

/**
 * Feed carousel axis lock with X-style momentum glide + eased snap.
 * Horizontal swipes move the carousel; vertical swipes scroll the feed.
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
    let snapRaf = 0
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

    const cancelAnimations = () => {
      if (momentumRaf) {
        cancelAnimationFrame(momentumRaf)
        momentumRaf = 0
      }
      if (snapRaf) {
        cancelAnimationFrame(snapRaf)
        snapRaf = 0
      }
    }

    const clearInteractionStyles = () => {
      el.style.scrollSnapType = ''
      el.style.touchAction = ''
      el.removeAttribute('data-lounge-carousel-dragging')
    }

    const finalizeAt = (targetLeft) => {
      cancelAnimations()
      el.scrollLeft = clampScroll(targetLeft)
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

    /** Slow drags: net delta from gesture start (fixes partial swipe-back misalignment). */
    const resolveTargetFromDrag = (scrollLeft, velocityX, startScrollLeft, offsets) => {
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

    /** After momentum: nearest slide with flick bias + midpoint tie-break. */
    const resolveTargetAfterFling = (scrollLeft, velocityX, offsets) => {
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

      if (velocityX > FLICK_VELOCITY_PX_MS * 0.65) {
        return offsets[Math.min(nearestIdx + 1, n - 1)]
      }
      if (velocityX < -FLICK_VELOCITY_PX_MS * 0.65) {
        return offsets[Math.max(nearestIdx - 1, 0)]
      }

      if (nearestIdx < n - 1) {
        const mid = (offsets[nearestIdx] + offsets[nearestIdx + 1]) / 2
        if (scrollLeft >= mid) return offsets[nearestIdx + 1]
      }
      return offsets[nearestIdx] ?? 0
    }

    const releaseVelocity = () => {
      const now = performance.now()
      const recent = velocitySamples.filter((s) => now - s.t <= VELOCITY_SAMPLE_MS)
      if (!recent.length) return gesture.velocityX
      return recent.reduce((sum, s) => sum + s.v, 0) / recent.length
    }

    const animateScrollTo = (targetLeft, durationMs, onComplete) => {
      const start = el.scrollLeft
      const delta = targetLeft - start
      if (Math.abs(delta) < 0.75) {
        onComplete(targetLeft)
        return
      }
      const t0 = performance.now()
      const tick = (now) => {
        const t = Math.min(1, (now - t0) / durationMs)
        const eased = 1 - (1 - t) ** 3
        el.scrollLeft = clampScroll(start + delta * eased)
        if (t < 1) {
          snapRaf = requestAnimationFrame(tick)
        } else {
          snapRaf = 0
          onComplete(targetLeft)
        }
      }
      snapRaf = requestAnimationFrame(tick)
    }

    const runMomentumThenSnap = (initialVelocity, startScrollLeft) => {
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
        const offsets = slideOffsets()
        const target = resolveTargetAfterFling(el.scrollLeft, initialVelocity, offsets)
        animateScrollTo(target, SNAP_ANIM_MS, finalizeAt)
      }

      momentumRaf = requestAnimationFrame(step)
    }

    const finishHorizontalGesture = (startScrollLeft) => {
      const releaseVel = releaseVelocity()
      el.style.scrollSnapType = 'none'
      el.setAttribute('data-lounge-carousel-dragging', 'true')

      if (Math.abs(releaseVel) >= SLOW_DRAG_VELOCITY_PX_MS) {
        runMomentumThenSnap(releaseVel, startScrollLeft)
        return
      }

      const offsets = slideOffsets()
      const target = resolveTargetFromDrag(el.scrollLeft, releaseVel, startScrollLeft, offsets)
      animateScrollTo(target, SNAP_ANIM_MS * 0.85, finalizeAt)
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
        finishHorizontalGesture(gesture.startScrollLeft)
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
