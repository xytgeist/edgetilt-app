import { useEffect, useRef, useState } from 'react'

/** Approximate iOS software-keyboard slide duration (ms). */
export const LOUNGE_IOS_KEYBOARD_SMOOTH_MS = 135

export const LOUNGE_IOS =
  typeof navigator !== 'undefined' && /iPhone|iPad|iPod/i.test(navigator.userAgent)

/** Read home-indicator padding for closed-state lounge footers (px). */
export function readLoungeIosSafeBottomPx() {
  if (typeof document === 'undefined') return 10
  const probe = document.createElement('div')
  probe.style.cssText =
    'position:fixed;visibility:hidden;padding-bottom:max(0.625rem, max(env(safe-area-inset-bottom, 0px), var(--edge-sab, 0px)))'
  document.body.appendChild(probe)
  const px = parseFloat(getComputedStyle(probe).paddingBottom)
  document.body.removeChild(probe)
  return Number.isFinite(px) && px > 0 ? px : 10
}

/** Footer host padding - iOS uses px + safe-area floor to avoid dismiss rebound. */
export function loungeComposerFooterPaddingBottom(overlapPx, safeBottomPx, { ios = LOUNGE_IOS } = {}) {
  if (ios) return `${Math.round(Math.max(overlapPx, safeBottomPx))}px`
  if (overlapPx > 0.5) return `${Math.round(overlapPx)}px`
  return 'max(0.625rem, max(env(safe-area-inset-bottom, 0px), var(--edge-sab, 0px)))'
}

export function useLoungeIosSafeBottomPx(active = LOUNGE_IOS) {
  const [px, setPx] = useState(10)
  useEffect(() => {
    if (!active) return undefined
    setPx(readLoungeIosSafeBottomPx())
    return undefined
  }, [active])
  return px
}

/**
 * visualViewport keyboard overlap - same formula as Lounge post-detail reply composer.
 *
 * @param {boolean} active
 * @returns {{ overlapPx: number, targetPx: number, displayPx: number }}
 *   overlapPx - use for footer padding (smoothed on iOS when smooth is on).
 * @param {{ smooth?: boolean, smoothMs?: number }} [options]
 *   smooth - ease displayed px toward the live target (iOS chat polish).
 */
export function useLoungeKeyboardOverlapPx(active = true, options = {}) {
  const { smooth = false, smoothMs = LOUNGE_IOS_KEYBOARD_SMOOTH_MS } = options
  const [targetPx, setTargetPx] = useState(0)
  const [displayPx, setDisplayPx] = useState(0)
  const displayRef = useRef(0)
  const rafRef = useRef(0)
  const targetRef = useRef(0)

  useEffect(() => {
    if (!active || typeof window === 'undefined') {
      setTargetPx(0)
      return undefined
    }
    const vv = window.visualViewport
    if (!vv) return undefined
    const sync = () => {
      try {
        const overlap = Math.max(0, window.innerHeight - vv.height - vv.offsetTop)
        setTargetPx(Number.isFinite(overlap) ? overlap : 0)
      } catch {
        setTargetPx(0)
      }
    }
    sync()
    vv.addEventListener('resize', sync)
    vv.addEventListener('scroll', sync)
    return () => {
      vv.removeEventListener('resize', sync)
      vv.removeEventListener('scroll', sync)
      setTargetPx(0)
    }
  }, [active])

  targetRef.current = targetPx

  useEffect(() => {
    if (!active) {
      displayRef.current = 0
      setDisplayPx(0)
      return undefined
    }
    if (!smooth) {
      displayRef.current = targetPx
      setDisplayPx(targetPx)
      return undefined
    }

    const step = () => {
      const target = targetRef.current
      const cur = displayRef.current
      const diff = target - cur
      if (Math.abs(diff) < 0.75) {
        displayRef.current = target
        setDisplayPx(target)
        rafRef.current = 0
        return
      }
      // Opening: chase a bit faster; closing: snap down quicker to avoid safe-area rebound.
      const opening = target > cur
      const alpha = opening
        ? Math.min(0.52, 32 / Math.max(28, smoothMs))
        : Math.min(0.58, 36 / Math.max(24, smoothMs * 0.85))
      const next = cur + diff * alpha
      displayRef.current = next
      setDisplayPx(next)
      rafRef.current = requestAnimationFrame(step)
    }

    cancelAnimationFrame(rafRef.current)
    rafRef.current = requestAnimationFrame(step)

    return () => {
      cancelAnimationFrame(rafRef.current)
      rafRef.current = 0
    }
  }, [active, targetPx, smooth, smoothMs])

  const overlapPx = smooth ? displayPx : targetPx
  return { overlapPx, targetPx, displayPx: overlapPx }
}

/**
 * Keyboard overlap for bottom sheets on iOS.
 *
 * Safari often shrinks `window.innerHeight` with the keyboard, so
 * `innerHeight - visualViewport.height` stays ~0 until a scroll/offset nudge.
 * Lock the pre-keyboard layout height and measure against that instead.
 *
 * Use `overlapPx` to pad the overlay (sheet sits in the visible band) and
 * `visibleHeightPx` to cap the sheet max-height so a sticky footer can shrink
 * the scroll body instead of shoving the whole form upward.
 *
 * @param {boolean} active
 * @returns {{ overlapPx: number, visibleHeightPx: number }}
 */
export function useLockedLayoutKeyboardOverlapPx(active = true) {
  const baselineRef = useRef(0)
  const [metrics, setMetrics] = useState({ overlapPx: 0, visibleHeightPx: 0 })

  useEffect(() => {
    if (!active || typeof window === 'undefined') {
      baselineRef.current = 0
      setMetrics({ overlapPx: 0, visibleHeightPx: 0 })
      return undefined
    }

    const vv = window.visualViewport

    const lockBaseline = () => {
      const layout = Math.max(window.innerHeight || 0, document.documentElement?.clientHeight || 0)
      if (layout > baselineRef.current) baselineRef.current = layout
      if (baselineRef.current < 1) baselineRef.current = layout
    }

    const readMetrics = () => {
      lockBaseline()
      const base = baselineRef.current || window.innerHeight || 0
      const height = vv?.height ?? window.innerHeight ?? 0
      const offsetTop = vv?.offsetTop ?? 0
      const overlapPx = Math.max(0, base - height - offsetTop)
      const visibleHeightPx = Math.max(0, height)
      return { overlapPx, visibleHeightPx }
    }

    const sync = () => {
      try {
        setMetrics(readMetrics())
      } catch {
        setMetrics({ overlapPx: 0, visibleHeightPx: 0 })
      }
    }

    const syncAfterKeyboardAnim = () => {
      sync()
      window.setTimeout(sync, 50)
      window.setTimeout(sync, 180)
      window.setTimeout(sync, 350)
      window.setTimeout(sync, 520)
    }

    const onFocusIn = (e) => {
      const t = e?.target
      if (!(t instanceof HTMLElement)) return
      if (t.tagName !== 'INPUT' && t.tagName !== 'TEXTAREA' && t.tagName !== 'SELECT') return
      syncAfterKeyboardAnim()
    }

    lockBaseline()
    sync()
    vv?.addEventListener('resize', sync)
    vv?.addEventListener('scroll', sync)
    window.addEventListener('resize', sync)
    window.addEventListener('focusin', onFocusIn)

    return () => {
      vv?.removeEventListener('resize', sync)
      vv?.removeEventListener('scroll', sync)
      window.removeEventListener('resize', sync)
      window.removeEventListener('focusin', onFocusIn)
      baselineRef.current = 0
      setMetrics({ overlapPx: 0, visibleHeightPx: 0 })
    }
  }, [active])

  return metrics
}
