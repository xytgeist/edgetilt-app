import { createPortal } from 'react-dom'
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { detectAppleWebKitInlineStream } from '../../utils/loungeAppleWebKit.js'
import { logLoungeBadgeTipDebug, syncLoungeBadgeTipDebugSnapshot } from './loungeBadgeTipDebug.js'

const OUT_MS = 220
/** Brief delay so pointer can move from anchor to portaled tip without dismissing. */
const LEAVE_DELAY_MS = 140
/** Coarse-pointer tap: show tip briefly (hover is unreliable on touch). */
const TAP_TIP_MS = Math.round(2800 / 3)

function prefersFinePointerHover() {
  if (typeof window === 'undefined') return true
  return window.matchMedia('(hover: hover) and (pointer: fine)').matches
}

function isBadgeTipInAnimation(name) {
  return typeof name === 'string' && name.includes('loungeBadgeTipIn')
}

function isBadgeTipOutAnimation(name) {
  return typeof name === 'string' && name.includes('loungeBadgeTipOut')
}

const TONE = {
  amber: 'text-amber-200/95 drop-shadow-[0_0_4px_rgba(251,191,36,0.3)]',
  /** Matches admin crown icon (`text-amber-400`). */
  crown: 'text-amber-400 drop-shadow-[0_0_4px_rgba(251,191,36,0.35)]',
  violet: 'text-violet-200/95 drop-shadow-[0_0_4px_rgba(167,139,250,0.35)]',
  sky: 'text-sky-200/95 drop-shadow-[0_0_4px_rgba(125,211,252,0.3)]',
}

/**
 * Small hover / tap tooltip for Lounge role + OG badges.
 * Portaled above the anchor so feed scroll / overflow / paint containment cannot clip it,
 * with a short leave delay so the pointer can reach the tip (tip uses pointer-events).
 * Outside **pointerdown** (capture) and **Escape** dismiss the tip so it does not stick when `mouseleave` does not fire.
 *
 * Enter on iOS WebKit: same keyframes as Android but paused until positioned, then unpaused once.
 * Layout listeners must not depend on anim state - that re-ran the effect and turbo-compressed the rise.
 *
 * @param {{ tip: string, tone?: 'amber' | 'crown' | 'violet' | 'sky', children: import('react').ReactNode, className?: string }} props
 */
export default function LoungeBadgeHoverTip({ tip, tone = 'amber', children, className = '' }) {
  const anchorRef = useRef(null)
  const tipShellRef = useRef(null)
  const tipTextRef = useRef(null)
  const [mounted, setMounted] = useState(false)
  const [exiting, setExiting] = useState(false)
  const [animInReady, setAnimInReady] = useState(false)
  const [showGeneration, setShowGeneration] = useState(0)

  const hideTRef = useRef(null)
  const tapDismissTRef = useRef(null)
  const leaveDelayTRef = useRef(null)
  const canRepositionRef = useRef(false)
  const exitingRef = useRef(false)
  const animInReadyRef = useRef(false)
  const positionFrameRef = useRef(null)
  const animStartFrameRef = useRef(null)
  const showGenerationRef = useRef(0)
  const scrollPosCountRef = useRef(0)
  const needsDeferredEnter = useMemo(() => detectAppleWebKitInlineStream(), [])

  const debugDom = useCallback(
    () => ({
      tipTextEl: tipTextRef.current,
      tipShellEl: tipShellRef.current,
      gen: showGenerationRef.current,
    }),
    [],
  )

  const debugStateRef = useRef({
    mounted: false,
    exiting: false,
    animInReady: false,
  })
  debugStateRef.current = { mounted, exiting, animInReady: animInReadyRef.current }

  const syncDebugSnapshot = useCallback(() => {
    const s = debugStateRef.current
    syncLoungeBadgeTipDebugSnapshot(tip, {
      mounted: s.mounted,
      exiting: s.exiting,
      animInReady: animInReadyRef.current,
      showGeneration: showGenerationRef.current,
      finePointerHover: prefersFinePointerHover(),
      needsDeferredEnter,
      tipEnterPaused: needsDeferredEnter && !s.exiting && !animInReadyRef.current,
      tipTextEl: tipTextRef.current,
      tipShellEl: tipShellRef.current,
    })
  }, [needsDeferredEnter, tip])

  const clearLeaveDelay = useCallback(() => {
    if (leaveDelayTRef.current != null) {
      clearTimeout(leaveDelayTRef.current)
      leaveDelayTRef.current = null
    }
  }, [])

  const clearHide = useCallback(() => {
    if (hideTRef.current != null) {
      clearTimeout(hideTRef.current)
      hideTRef.current = null
    }
    if (tapDismissTRef.current != null) {
      clearTimeout(tapDismissTRef.current)
      tapDismissTRef.current = null
    }
  }, [])

  const clearAllTimers = useCallback(() => {
    clearHide()
    clearLeaveDelay()
  }, [clearHide, clearLeaveDelay])

  const cancelAnimStartFrames = useCallback(() => {
    if (animStartFrameRef.current != null) {
      logLoungeBadgeTipDebug(tip, 'anim', 'cancel pending enter rAF', debugDom())
      cancelAnimationFrame(animStartFrameRef.current)
      animStartFrameRef.current = null
    }
  }, [debugDom, tip])

  useEffect(
    () => () => {
      clearAllTimers()
      cancelAnimStartFrames()
    },
    [clearAllTimers, cancelAnimStartFrames],
  )

  const positionTip = useCallback(() => {
    if (!canRepositionRef.current) return
    const anchor = anchorRef.current
    const shell = tipShellRef.current
    if (!anchor || !shell) return
    shell.style.visibility = 'visible'
    const ar = anchor.getBoundingClientRect()
    const h = shell.offsetHeight || 18
    const gap = 6
    shell.style.left = `${ar.left + ar.width / 2}px`
    shell.style.top = `${ar.top - h - gap}px`
    scrollPosCountRef.current += 1
    if (scrollPosCountRef.current <= 3 || scrollPosCountRef.current % 12 === 0) {
      logLoungeBadgeTipDebug(tip, 'pos', `#${scrollPosCountRef.current} top=${shell.style.top}`, debugDom())
    }
  }, [debugDom, tip])

  const schedulePositionTip = useCallback(() => {
    if (positionFrameRef.current != null) return
    positionFrameRef.current = window.requestAnimationFrame(() => {
      positionFrameRef.current = null
      positionTip()
    })
  }, [positionTip])

  const unpauseEnterAnimation = useCallback(() => {
    const el = tipTextRef.current
    if (el) {
      void el.offsetWidth
      el.removeAttribute('data-tip-enter-paused')
    }
    animInReadyRef.current = true
    setAnimInReady(true)
  }, [])

  const armEnterAnimation = useCallback(() => {
    cancelAnimStartFrames()
    animInReadyRef.current = false
    setAnimInReady(false)
    const el = tipTextRef.current
    if (el && needsDeferredEnter) {
      el.setAttribute('data-tip-enter-paused', '')
    }

    const markInReady = () => {
      if (!exitingRef.current && canRepositionRef.current) {
        unpauseEnterAnimation()
        logLoungeBadgeTipDebug(tip, 'anim', 'in ready', debugDom())
      } else {
        logLoungeBadgeTipDebug(
          tip,
          'anim',
          `in ready skipped exiting=${exitingRef.current} canRepo=${canRepositionRef.current}`,
          debugDom(),
        )
      }
    }

    if (!needsDeferredEnter) {
      logLoungeBadgeTipDebug(tip, 'anim', 'in ready (immediate)', debugDom())
      markInReady()
      return
    }

    logLoungeBadgeTipDebug(tip, 'anim', 'arm enter (double rAF, iOS unpause)', debugDom())
    animStartFrameRef.current = window.requestAnimationFrame(() => {
      animStartFrameRef.current = window.requestAnimationFrame(() => {
        animStartFrameRef.current = null
        markInReady()
      })
    })
  }, [cancelAnimStartFrames, debugDom, needsDeferredEnter, tip, unpauseEnterAnimation])

  const finishExit = useCallback(() => {
    if (hideTRef.current != null) {
      clearTimeout(hideTRef.current)
      hideTRef.current = null
    }
    cancelAnimStartFrames()
    canRepositionRef.current = false
    exitingRef.current = false
    animInReadyRef.current = false
    setAnimInReady(false)
    setMounted(false)
    setExiting(false)
    logLoungeBadgeTipDebug(tip, 'exit', 'finish', debugDom())
    syncLoungeBadgeTipDebugSnapshot(tip, {
      mounted: false,
      exiting: false,
      animInReady: false,
      showGeneration: showGenerationRef.current,
      finePointerHover: prefersFinePointerHover(),
      needsDeferredEnter,
      tipEnterPaused: false,
      tipTextEl: null,
      tipShellEl: null,
    })
  }, [cancelAnimStartFrames, debugDom, needsDeferredEnter, tip])

  const beginExit = useCallback(
    (source = 'unknown') => {
      if (exitingRef.current) return
      clearLeaveDelay()
      cancelAnimStartFrames()
      animInReadyRef.current = false
      setAnimInReady(false)
      if (hideTRef.current != null) {
        clearTimeout(hideTRef.current)
        hideTRef.current = null
      }
      exitingRef.current = true
      setExiting(true)
      logLoungeBadgeTipDebug(tip, 'exit', `begin (${source})`, debugDom())
      hideTRef.current = window.setTimeout(finishExit, OUT_MS + 80)
    },
    [cancelAnimStartFrames, clearLeaveDelay, debugDom, finishExit, tip],
  )

  const onTipAnimationEnd = useCallback(
    (e) => {
      if (e.target !== e.currentTarget) return
      if (isBadgeTipOutAnimation(e.animationName)) {
        logLoungeBadgeTipDebug(tip, 'anim', `out-end (${e.animationName})`, debugDom())
        if (!exitingRef.current) return
        finishExit()
        return
      }
      if (isBadgeTipInAnimation(e.animationName)) {
        logLoungeBadgeTipDebug(tip, 'anim', `in-end (${e.animationName})`, debugDom())
      }
    },
    [debugDom, finishExit, tip],
  )

  const openTip = useCallback(
    (source = 'unknown') => {
      clearAllTimers()
      exitingRef.current = false
      setExiting(false)
      animInReadyRef.current = false
      setAnimInReady(false)
      scrollPosCountRef.current = 0
      setShowGeneration((g) => {
        const next = g + 1
        showGenerationRef.current = next
        logLoungeBadgeTipDebug(tip, 'open', `${source} gen=${next}`, debugDom())
        return next
      })
      setMounted(true)
    },
    [clearAllTimers, debugDom, tip],
  )

  const positionTipRef = useRef(positionTip)
  const schedulePositionTipRef = useRef(schedulePositionTip)
  const armEnterAnimationRef = useRef(armEnterAnimation)
  const cancelAnimStartFramesRef = useRef(cancelAnimStartFrames)
  positionTipRef.current = positionTip
  schedulePositionTipRef.current = schedulePositionTip
  armEnterAnimationRef.current = armEnterAnimation
  cancelAnimStartFramesRef.current = cancelAnimStartFrames

  /** Dismiss when the user taps/clicks outside the anchor and portaled tip (mouseleave is flaky on touch and when focus moves). */
  useEffect(() => {
    if (!mounted) return undefined
    const onDocPointerDown = (e) => {
      const t = e.target
      if (!(t instanceof Node)) return
      if (anchorRef.current?.contains(t)) return
      if (tipShellRef.current?.contains(t)) return
      beginExit('doc-pointerdown')
    }
    const onKeyDown = (e) => {
      if (e.key === 'Escape') beginExit('escape')
    }
    document.addEventListener('pointerdown', onDocPointerDown, true)
    window.addEventListener('keydown', onKeyDown, true)
    return () => {
      document.removeEventListener('pointerdown', onDocPointerDown, true)
      window.removeEventListener('keydown', onKeyDown, true)
    }
  }, [mounted, beginExit])

  useLayoutEffect(() => {
    if (!mounted) {
      canRepositionRef.current = false
      animInReadyRef.current = false
      setAnimInReady(false)
      return undefined
    }
    logLoungeBadgeTipDebug(tip, 'layout', `mount gen=${showGenerationRef.current}`, debugDom())
    canRepositionRef.current = true
    positionTipRef.current()
    void tipShellRef.current?.offsetHeight
    armEnterAnimationRef.current()
    const onScrollOrResize = () => schedulePositionTipRef.current()
    window.addEventListener('scroll', onScrollOrResize, true)
    window.addEventListener('resize', onScrollOrResize)
    let ro
    if (typeof ResizeObserver !== 'undefined') {
      ro = new ResizeObserver(onScrollOrResize)
      const anchor = anchorRef.current
      if (anchor) ro.observe(anchor)
    }
    return () => {
      logLoungeBadgeTipDebug(tip, 'layout', `cleanup gen=${showGenerationRef.current}`, debugDom())
      canRepositionRef.current = false
      window.removeEventListener('scroll', onScrollOrResize, true)
      window.removeEventListener('resize', onScrollOrResize)
      ro?.disconnect()
      if (positionFrameRef.current != null) {
        cancelAnimationFrame(positionFrameRef.current)
        positionFrameRef.current = null
      }
      cancelAnimStartFramesRef.current()
    }
  }, [mounted, showGeneration, tip])

  useEffect(() => {
    if (!mounted) return undefined
    syncDebugSnapshot()
    const id = window.setInterval(syncDebugSnapshot, 450)
    return () => window.clearInterval(id)
  }, [mounted, syncDebugSnapshot])

  const onEnterAnchor = useCallback(() => {
    if (!prefersFinePointerHover()) {
      logLoungeBadgeTipDebug(tip, 'hover', 'mouseenter ignored (coarse pointer)', debugDom())
      return
    }
    openTip('mouseenter')
  }, [debugDom, openTip, tip])

  const onLeaveAnchor = useCallback(() => {
    if (!prefersFinePointerHover()) return
    clearLeaveDelay()
    leaveDelayTRef.current = window.setTimeout(() => {
      leaveDelayTRef.current = null
      beginExit('mouseleave-anchor')
    }, LEAVE_DELAY_MS)
  }, [beginExit, clearLeaveDelay])

  const onEnterTip = useCallback(() => {
    if (!prefersFinePointerHover()) return
    clearAllTimers()
    exitingRef.current = false
    setExiting(false)
    logLoungeBadgeTipDebug(tip, 'hover', 'enter portaled tip', debugDom())
  }, [clearAllTimers, debugDom, tip])

  const onLeaveTip = useCallback(() => {
    if (!prefersFinePointerHover()) return
    beginExit('mouseleave-tip')
  }, [beginExit])

  const onWrapperClick = useCallback(
    (e) => {
      e.stopPropagation()
      if (prefersFinePointerHover()) return
      openTip('click')
      tapDismissTRef.current = window.setTimeout(() => {
        tapDismissTRef.current = null
        beginExit('tap-timeout')
      }, TAP_TIP_MS)
    },
    [beginExit, openTip],
  )

  const toneCls = TONE[tone] ?? TONE.amber
  const tipAnimClass = exiting ? 'lounge-badge-tip-out' : 'lounge-badge-tip-in'
  const tipEnterPaused = needsDeferredEnter && !exiting && !animInReady

  const tipPortal =
    mounted && typeof document !== 'undefined'
      ? createPortal(
          <div
            ref={tipShellRef}
            data-lounge-badge-tip
            role="tooltip"
            className="pointer-events-auto fixed z-[10050] max-w-[13rem] text-center"
            style={{
              left: 0,
              top: 0,
              transform: 'translateX(-50%)',
              visibility: 'hidden',
            }}
            onMouseEnter={onEnterTip}
            onMouseLeave={onLeaveTip}
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Tone + drop-shadow on a static wrapper - iOS Safari stutters when filter + transform animate on one node. */}
            <span className={`inline-block ${toneCls}`}>
              <span
                ref={tipTextRef}
                data-tip-enter-paused={tipEnterPaused ? '' : undefined}
                className={`inline-block whitespace-normal text-[9px] font-semibold leading-snug tracking-wide antialiased ${tipAnimClass}`}
                onAnimationEnd={onTipAnimationEnd}
              >
                {tip}
              </span>
            </span>
          </div>,
          document.body,
        )
      : null

  return (
    <>
      <span
        ref={anchorRef}
        data-lounge-badge-tip
        className={`relative inline-flex shrink-0 cursor-help touch-manipulation ${className}`}
        onMouseEnter={onEnterAnchor}
        onMouseLeave={onLeaveAnchor}
        onPointerDown={(e) => e.stopPropagation()}
        onClick={onWrapperClick}
      >
        {children}
      </span>
      {tipPortal}
    </>
  )
}
