import { useEffect, useRef } from 'react'
import {
  LOUNGE_PULL_AXIS_LOCK_PX,
  LOUNGE_PULL_FINGER_GAIN,
  LOUNGE_PULL_HORIZONTAL_SURFACE_VERTICAL_RATIO,
  LOUNGE_PULL_HORIZONTAL_VS_VERTICAL,
  LOUNGE_PULL_INDICATOR_BASE_PX,
  LOUNGE_PULL_INDICATOR_MAX_PX,
  LOUNGE_PULL_MAX_VISUAL_PX,
  LOUNGE_PULL_REFRESH_THRESHOLD_PX,
  LOUNGE_PULL_SNAP_MS,
  LOUNGE_PULL_VERTICAL_MIN_PX,
  LOUNGE_PULL_VERTICAL_VS_HORIZONTAL,
  loungePullIsHorizontalGestureSurface,
  loungePullVisualOffsetPx,
} from '../../utils/loungePullRefresh.js'

/**
 * Touch pull-to-refresh for a scroll root + posts zone below a header row.
 * Updates indicator DOM via refs (no per-frame React re-renders).
 *
 * Axis-locks before engaging: horizontal carousel / chart swipes win until
 * the gesture is clearly vertical, so PTR stays intentional at scrollTop 0.
 */
export function useLoungePullToRefresh({
  scrollRootRef,
  pullZoneRef,
  pullPostsWrapRef,
  pullIndicatorOverlayRef,
  pullIndicatorWrapRef,
  pullArrowRef,
  pullSpinnerRef,
  pullAriaRef,
  onRefresh,
  enabled = true,
  pullRefreshing = false,
  setPullRefreshing,
}) {
  const pullStartYRef = useRef(null)
  const pullStartXRef = useRef(null)
  /** @type {import('react').MutableRefObject<null | 'y' | 'abort'>} */
  const pullAxisRef = useRef(null)
  const pullFromHorizontalSurfaceRef = useRef(false)
  const pullDistanceRef = useRef(0)
  const pullTriggeredRef = useRef(false)
  const pullVisualRafRef = useRef(0)

  useEffect(() => {
    if (!enabled || typeof window === 'undefined') return undefined
    const zone = scrollRootRef?.current
    const pullZone = pullZoneRef?.current
    if (!zone || !pullZone) return undefined

    const thresholdPx = LOUNGE_PULL_REFRESH_THRESHOLD_PX
    const visualCapPx = LOUNGE_PULL_INDICATOR_MAX_PX
    const refreshIndicatorPx = LOUNGE_PULL_INDICATOR_BASE_PX

    const applyPullVisual = (visualPx, { animate = false } = {}) => {
      const posts = pullPostsWrapRef?.current
      const overlay = pullIndicatorOverlayRef?.current
      const transformTransition = animate ? `transform ${LOUNGE_PULL_SNAP_MS}` : 'none'
      const overlayTransition = animate ? `height ${LOUNGE_PULL_SNAP_MS}, opacity 180ms ease` : 'none'
      if (posts) {
        posts.style.transition = transformTransition
        posts.style.transform = visualPx > 0 ? `translate3d(0, ${visualPx}px, 0)` : ''
      }
      if (overlay) {
        overlay.style.transition = overlayTransition
        overlay.style.height = `${visualPx}px`
        overlay.style.opacity = visualPx > 0 ? '1' : '0'
      }
    }

    const setPullIndicator = (rawDistance, refreshing = false) => {
      const wrap = pullIndicatorWrapRef?.current
      const arrow = pullArrowRef?.current
      const spinner = pullSpinnerRef?.current
      const aria = pullAriaRef?.current
      if (!wrap || !arrow || !spinner) return

      if (refreshing) {
        arrow.classList.add('hidden')
        spinner.classList.remove('hidden')
        wrap.setAttribute('aria-label', 'Refreshing')
        if (aria) aria.textContent = 'Refreshing'
        return
      }

      spinner.classList.add('hidden')
      arrow.classList.remove('hidden')

      if (rawDistance <= 0) {
        arrow.style.transform = 'rotate(0deg)'
        wrap.setAttribute('aria-label', 'Pull down to refresh')
        if (aria) aria.textContent = 'Pull down to refresh'
        return
      }

      if (rawDistance >= thresholdPx) {
        arrow.style.transform = 'rotate(180deg)'
        wrap.setAttribute('aria-label', 'Release to refresh')
        if (aria) aria.textContent = 'Release to refresh'
      } else {
        arrow.style.transform = 'rotate(0deg)'
        wrap.setAttribute('aria-label', 'Pull down to refresh')
        if (aria) aria.textContent = 'Pull down to refresh'
      }
    }

    const flushPullVisual = (rawDistance, { animate = false } = {}) => {
      const visual = loungePullVisualOffsetPx(rawDistance, visualCapPx)
      applyPullVisual(visual, { animate })
      setPullIndicator(rawDistance, false)
    }

    const schedulePullVisual = (rawDistance) => {
      pullDistanceRef.current = rawDistance
      if (pullVisualRafRef.current) return
      pullVisualRafRef.current = window.requestAnimationFrame(() => {
        pullVisualRafRef.current = 0
        flushPullVisual(rawDistance, { animate: false })
      })
    }

    const resetPullTracking = () => {
      pullStartYRef.current = null
      pullStartXRef.current = null
      pullAxisRef.current = null
      pullFromHorizontalSurfaceRef.current = false
      pullDistanceRef.current = 0
    }

    const abortPullGesture = () => {
      resetPullTracking()
      pullAxisRef.current = 'abort'
      if (pullVisualRafRef.current) {
        window.cancelAnimationFrame(pullVisualRafRef.current)
        pullVisualRafRef.current = 0
      }
      applyPullVisual(0, { animate: true })
      setPullIndicator(0, false)
    }

    const onTouchStart = (e) => {
      if (zone.scrollTop > 0) {
        resetPullTracking()
        return
      }
      const touch = e.touches?.[0]
      if (!touch) {
        resetPullTracking()
        return
      }
      pullStartYRef.current = touch.clientY
      pullStartXRef.current = touch.clientX
      pullAxisRef.current = null
      pullDistanceRef.current = 0
      pullTriggeredRef.current = false
      pullFromHorizontalSurfaceRef.current = loungePullIsHorizontalGestureSurface(e.target)
    }

    const onTouchMove = (e) => {
      if (pullRefreshing) return
      if (pullAxisRef.current === 'abort') return
      const startY = pullStartYRef.current
      const startX = pullStartXRef.current
      if (startY == null || startX == null) return
      if (zone.scrollTop > 0) {
        abortPullGesture()
        return
      }

      const touch = e.touches?.[0]
      if (!touch) return
      const dx = touch.clientX - startX
      const dy = touch.clientY - startY
      const absDx = Math.abs(dx)
      const absDy = Math.abs(dy)

      if (pullAxisRef.current == null) {
        if (absDx < LOUNGE_PULL_AXIS_LOCK_PX && absDy < LOUNGE_PULL_AXIS_LOCK_PX) return

        // Horizontal wins first → leave the gesture to carousels / chart strips.
        if (absDx >= LOUNGE_PULL_AXIS_LOCK_PX && absDx >= absDy * LOUNGE_PULL_HORIZONTAL_VS_VERTICAL) {
          abortPullGesture()
          return
        }

        const verticalRatio = pullFromHorizontalSurfaceRef.current
          ? LOUNGE_PULL_HORIZONTAL_SURFACE_VERTICAL_RATIO
          : LOUNGE_PULL_VERTICAL_VS_HORIZONTAL
        if (dy > 0 && absDy >= LOUNGE_PULL_VERTICAL_MIN_PX && absDy >= absDx * verticalRatio) {
          pullAxisRef.current = 'y'
        } else if (dy <= 0 && absDy >= LOUNGE_PULL_VERTICAL_MIN_PX) {
          // Scrolling the feed down from top — not a pull.
          abortPullGesture()
          return
        } else {
          return
        }
      }

      if (pullAxisRef.current !== 'y') return

      if (dy <= 0) {
        schedulePullVisual(0)
        return
      }
      e.preventDefault()
      const raw = Math.min(LOUNGE_PULL_MAX_VISUAL_PX, Math.floor(dy * LOUNGE_PULL_FINGER_GAIN))
      schedulePullVisual(raw)
    }

    const onTouchEnd = async () => {
      const distance = pullDistanceRef.current
      const axis = pullAxisRef.current
      resetPullTracking()
      const shouldRefresh = axis === 'y' && distance >= thresholdPx && !pullTriggeredRef.current
      if (!shouldRefresh) {
        applyPullVisual(0, { animate: true })
        setPullIndicator(0, false)
        return
      }
      pullTriggeredRef.current = true
      setPullRefreshing?.(true)
      applyPullVisual(refreshIndicatorPx, { animate: true })
      setPullIndicator(0, true)
      try {
        await onRefresh?.()
      } finally {
        setPullRefreshing?.(false)
        pullTriggeredRef.current = false
        applyPullVisual(0, { animate: true })
        setPullIndicator(0, false)
      }
    }

    pullZone.addEventListener('touchstart', onTouchStart, { passive: true })
    zone.addEventListener('touchmove', onTouchMove, { passive: false, capture: true })
    zone.addEventListener('touchend', onTouchEnd, { passive: true, capture: true })
    zone.addEventListener('touchcancel', onTouchEnd, { passive: true, capture: true })

    return () => {
      if (pullVisualRafRef.current) {
        window.cancelAnimationFrame(pullVisualRafRef.current)
        pullVisualRafRef.current = 0
      }
      pullZone.removeEventListener('touchstart', onTouchStart)
      zone.removeEventListener('touchmove', onTouchMove, { capture: true })
      zone.removeEventListener('touchend', onTouchEnd, { capture: true })
      zone.removeEventListener('touchcancel', onTouchEnd, { capture: true })
    }
  }, [
    enabled,
    onRefresh,
    pullArrowRef,
    pullAriaRef,
    pullIndicatorOverlayRef,
    pullIndicatorWrapRef,
    pullPostsWrapRef,
    pullRefreshing,
    pullSpinnerRef,
    pullZoneRef,
    scrollRootRef,
    setPullRefreshing,
  ])
}
