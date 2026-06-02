import { useCallback, useEffect, useRef } from 'react'

const IS_IOS =
  typeof navigator !== 'undefined' && /iPhone|iPad|iPod/i.test(navigator.userAgent)

/** Tail-pin rAF follow while iOS keyboard animates open. */
export const LOUNGE_IOS_KEYBOARD_TAIL_PIN_MS = 240

/**
 * Keep scroll content pinned above a lounge footer composer during iOS keyboard open.
 *
 * @param {React.RefObject<HTMLElement | null>} listRef
 * @param {React.RefObject<HTMLElement | null>} composerHostRef
 * @param {{ kbOverlapPx: number, iosSafeBottomPx?: number, enabled?: boolean, atBottomRef?: React.MutableRefObject<boolean> }} opts
 */
export function useLoungeKeyboardTailPin(listRef, composerHostRef, {
  kbOverlapPx,
  iosSafeBottomPx = 10,
  enabled = true,
  atBottomRef,
} = {}) {
  const tailPinFollowRafRef = useRef(0)
  const tailPinFollowUntilRef = useRef(0)
  const kbOverlapPrevRef = useRef(0)
  const kbClosingRef = useRef(false)

  const pinListToTail = useCallback(({ force = false } = {}) => {
    const list = listRef.current
    if (!list) return
    const nearBottom = list.scrollHeight - list.scrollTop - list.clientHeight < 80
    const tag = document.activeElement?.tagName
    const inputFocused = tag === 'TEXTAREA' || tag === 'INPUT'
    const atBottom = atBottomRef?.current ?? true
    if (!force && !atBottom && !nearBottom && !inputFocused) return
    list.scrollTop = list.scrollHeight
  }, [atBottomRef, listRef])

  const runTailPinFollow = useCallback(() => {
    if (!IS_IOS) {
      pinListToTail({ force: true })
      return
    }
    tailPinFollowUntilRef.current = performance.now() + LOUNGE_IOS_KEYBOARD_TAIL_PIN_MS
    if (tailPinFollowRafRef.current) return

    const tick = () => {
      pinListToTail({ force: true })
      if (performance.now() < tailPinFollowUntilRef.current) {
        tailPinFollowRafRef.current = requestAnimationFrame(tick)
      } else {
        tailPinFollowRafRef.current = 0
        pinListToTail({ force: true })
      }
    }
    tailPinFollowRafRef.current = requestAnimationFrame(tick)
  }, [pinListToTail])

  useEffect(() => () => {
    if (tailPinFollowRafRef.current) cancelAnimationFrame(tailPinFollowRafRef.current)
  }, [])

  useEffect(() => {
    if (!enabled || !IS_IOS) return undefined

    const composer = composerHostRef.current
    if (!composer) return undefined

    const onFocusIn = (e) => {
      if (e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLInputElement) {
        runTailPinFollow()
      }
    }

    composer.addEventListener('focusin', onFocusIn, true)

    const vv = window.visualViewport
    const onVvResize = () => {
      if (!composer.querySelector('textarea:focus, input:focus')) return
      runTailPinFollow()
    }
    vv?.addEventListener('resize', onVvResize)

    return () => {
      composer.removeEventListener('focusin', onFocusIn, true)
      vv?.removeEventListener('resize', onVvResize)
    }
  }, [composerHostRef, enabled, runTailPinFollow])

  useEffect(() => {
    if (!enabled) return undefined
    const prev = kbOverlapPrevRef.current
    kbOverlapPrevRef.current = kbOverlapPx
    kbClosingRef.current = kbOverlapPx < prev - 2
    if (kbOverlapPx <= iosSafeBottomPx + 0.5) {
      kbClosingRef.current = false
      return undefined
    }
    if (kbOverlapPx > prev + 2) runTailPinFollow()
    return undefined
  }, [enabled, iosSafeBottomPx, kbOverlapPx, runTailPinFollow])

  useEffect(() => {
    if (!enabled) return undefined
    const composer = composerHostRef.current
    if (!composer) return undefined
    const ro = new ResizeObserver(() => {
      if (!composer.querySelector('textarea:focus, input:focus')) return
      if (IS_IOS) runTailPinFollow()
      else pinListToTail({ force: true })
    })
    ro.observe(composer)
    return () => ro.disconnect()
  }, [composerHostRef, enabled, pinListToTail, runTailPinFollow])

  useEffect(() => {
    if (!enabled) return undefined
    const container = listRef.current
    if (!container) return undefined
    let prevH = container.clientHeight

    const ro = new ResizeObserver(() => {
      const h = container.clientHeight
      const growing = h > prevH
      const shrinking = h < prevH
      const tag = document.activeElement?.tagName
      const inputFocused = tag === 'TEXTAREA' || tag === 'INPUT'
      const atBottom = atBottomRef?.current ?? true

      if (IS_IOS && kbClosingRef.current) {
        prevH = h
        return
      }
      if (shrinking && (atBottom || inputFocused)) {
        if (IS_IOS) runTailPinFollow()
        else pinListToTail({ force: true })
      } else if (growing && (atBottom || inputFocused)) {
        if (IS_IOS) runTailPinFollow()
        else pinListToTail({ force: true })
      }
      prevH = h
    })
    ro.observe(container)
    return () => ro.disconnect()
  }, [atBottomRef, enabled, listRef, pinListToTail, runTailPinFollow])

  return { pinListToTail, runTailPinFollow }
}
