import { useEffect, useRef, useState } from 'react'

/** Approximate iOS software-keyboard slide duration (ms). */
const DEFAULT_SMOOTH_MS = 135

/**
 * visualViewport keyboard overlap — same formula as Lounge post-detail reply composer.
 *
 * @param {boolean} active
 * @param {{ smooth?: boolean, smoothMs?: number }} [options]
 *   smooth — ease displayed px toward the live target (iOS chat polish).
 */
export function useLoungeKeyboardOverlapPx(active = true, options = {}) {
  const { smooth = false, smoothMs = DEFAULT_SMOOTH_MS } = options
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

  return smooth ? displayPx : targetPx
}
