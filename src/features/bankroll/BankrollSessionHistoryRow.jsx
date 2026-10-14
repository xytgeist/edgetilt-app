import { useCallback, useEffect, useRef, useState } from 'react'

const SWIPE_AXIS_LOCK_PX = 8
const SWIPE_VERTICAL_LOCK_PX = 10
const SWIPE_COMMIT_RATIO = 0.38
const SWIPE_COMMIT_MIN_PX = 72
const SWIPE_SNAP_MS = 240
const SWIPE_ICON_FULL_PX = 52
const SWIPE_SNAP_TRANSITION = 'transform 240ms cubic-bezier(0.32, 0.72, 0, 1)'

function getCommitThreshold(width) {
  return Math.max(SWIPE_COMMIT_MIN_PX, width * SWIPE_COMMIT_RATIO)
}

function getIconProgress(absOffset) {
  return Math.min(1, absOffset / SWIPE_ICON_FULL_PX)
}

function getScrollParent(el) {
  let node = el?.parentElement || null
  while (node && node !== document.body) {
    const { overflowY } = window.getComputedStyle(node)
    if (overflowY === 'auto' || overflowY === 'scroll' || overflowY === 'overlay') return node
    node = node.parentElement
  }
  return null
}

function TrashIcon({ className = 'h-6 w-6' }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
      <path d="M10 11v6" />
      <path d="M14 11v6" />
      <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
    </svg>
  )
}

/**
 * Session history row with swipe-right-to-delete (same gesture model as chat inbox).
 * Swipe is disabled while bulk Select mode is on.
 * Full commit animates the card off-screen, then awaits onRequestDelete (confirm modal).
 */
export default function BankrollSessionHistoryRow({
  sessionId,
  selectMode = false,
  isSelected = false,
  openSwipeId = null,
  onSwipeOpen,
  onActivate,
  /** @type {() => Promise<boolean>|boolean|void} resolves true after confirmed delete */
  onRequestDelete,
  /** Use a div (role=button) when children include nested buttons (e.g. poker Settle). */
  asDiv = false,
  /** When set, replaces default slots-bankroll surface classes on the foreground. */
  foregroundClassName = null,
  children,
}) {
  const rowRef = useRef(null)
  const foregroundRef = useRef(null)
  const rowWidthRef = useRef(320)
  const offsetRef = useRef(0)
  const swipeDraggingRef = useRef(false)
  const committingRef = useRef(false)
  const commitTimerRef = useRef(null)
  const gestureRef = useRef({
    startX: 0,
    startY: 0,
    lastY: 0,
    axis: null,
    pointerId: null,
    scrollParent: null,
  })
  const [offsetX, setOffsetX] = useState(0)
  const [swipeDragging, setSwipeDragging] = useState(false)

  const clearCommitTimer = useCallback(() => {
    if (commitTimerRef.current != null) {
      window.clearTimeout(commitTimerRef.current)
      commitTimerRef.current = null
    }
  }, [])

  const setOffset = useCallback((next, { syncDom = false } = {}) => {
    offsetRef.current = next
    setOffsetX(next)
    if (syncDom && foregroundRef.current) {
      foregroundRef.current.style.transform = `translate3d(${next}px, 0, 0)`
    }
  }, [])

  const restoreSnapTransition = useCallback(() => {
    if (foregroundRef.current) {
      foregroundRef.current.style.transition = SWIPE_SNAP_TRANSITION
    }
  }, [])

  /** Apply snap target after re-enabling transition (same-frame set can skip the anim). */
  const animateOffsetTo = useCallback((next) => {
    restoreSnapTransition()
    if (foregroundRef.current) void foregroundRef.current.offsetWidth
    setOffset(next, { syncDom: true })
  }, [restoreSnapTransition, setOffset])

  useEffect(() => {
    const el = rowRef.current
    if (!el) return undefined
    const measure = () => {
      rowWidthRef.current = el.getBoundingClientRect().width || window.innerWidth
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  useEffect(() => () => clearCommitTimer(), [clearCommitTimer])

  useEffect(() => {
    if (selectMode) {
      clearCommitTimer()
      committingRef.current = false
      swipeDraggingRef.current = false
      setSwipeDragging(false)
      setOffset(0)
      return
    }
    // Don't yank closed while dragging or mid swipe-away / confirm.
    if (swipeDraggingRef.current || committingRef.current) return
    if (openSwipeId !== sessionId) setOffset(0)
  }, [openSwipeId, sessionId, selectMode, setOffset, clearCommitTimer])

  const onPointerDown = useCallback((e) => {
    if (selectMode || committingRef.current) return
    if (e.pointerType === 'mouse' && e.button !== 0) return
    gestureRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      lastY: e.clientY,
      axis: null,
      pointerId: e.pointerId,
      scrollParent: null,
    }
    try {
      e.currentTarget.setPointerCapture(e.pointerId)
    } catch {
      /* ignore */
    }
  }, [selectMode])

  const onPointerMove = useCallback((e) => {
    if (selectMode || committingRef.current) return
    const g = gestureRef.current
    if (g.pointerId == null || e.pointerId !== g.pointerId) return
    if (e.pointerType === 'mouse' && e.buttons === 0) return
    const dx = e.clientX - g.startX
    const dy = e.clientY - g.startY
    if (!g.axis) {
      if (Math.abs(dx) > SWIPE_AXIS_LOCK_PX && Math.abs(dx) > Math.abs(dy)) {
        // Right swipe only (delete). Left snaps back on release.
        g.axis = 'x'
        swipeDraggingRef.current = true
        setSwipeDragging(true)
        onSwipeOpen?.(sessionId)
        if (foregroundRef.current) foregroundRef.current.style.transition = 'none'
      } else if (Math.abs(dy) > SWIPE_VERTICAL_LOCK_PX && Math.abs(dy) > Math.abs(dx)) {
        g.axis = 'y'
        g.scrollParent = getScrollParent(rowRef.current)
      } else {
        return
      }
    }
    if (g.axis === 'y') {
      e.preventDefault()
      const scroller = g.scrollParent || getScrollParent(rowRef.current)
      g.scrollParent = scroller
      if (scroller) scroller.scrollTop -= e.clientY - g.lastY
      g.lastY = e.clientY
      return
    }
    if (g.axis !== 'x') return
    e.preventDefault()
    const width = rowWidthRef.current || window.innerWidth
    // Allow left drag slightly for feel, but commit only on right.
    const clamped = Math.max(-width * 0.2, Math.min(width, dx))
    setOffset(clamped, { syncDom: true })
    g.lastY = e.clientY
  }, [onSwipeOpen, selectMode, sessionId, setOffset])

  const finishGesture = useCallback(() => {
    const g = gestureRef.current
    if (g.axis === 'x') {
      const width = rowWidthRef.current || window.innerWidth
      const offset = offsetRef.current
      const commitAt = getCommitThreshold(width)

      if (offset >= commitAt) {
        // Keep exclusivity on this row until confirm resolves; do not call
        // onSwipeOpen(null) yet or the openSwipe effect would setOffset(0).
        committingRef.current = true
        swipeDraggingRef.current = false
        setSwipeDragging(false)
        animateOffsetTo(width)
        clearCommitTimer()
        commitTimerRef.current = window.setTimeout(() => {
          commitTimerRef.current = null
          void (async () => {
            let ok = false
            try {
              ok = Boolean(await onRequestDelete?.())
            } catch {
              ok = false
            }
            if (ok) {
              // Parent removes the row; leave offset off-screen until unmount.
              onSwipeOpen?.(null)
              return
            }
            committingRef.current = false
            animateOffsetTo(0)
            onSwipeOpen?.(null)
          })()
        }, SWIPE_SNAP_MS)
      } else {
        swipeDraggingRef.current = false
        setSwipeDragging(false)
        animateOffsetTo(0)
        onSwipeOpen?.(null)
      }
    } else {
      swipeDraggingRef.current = false
      setSwipeDragging(false)
    }
    g.axis = null
    g.pointerId = null
    g.scrollParent = null
  }, [animateOffsetTo, clearCommitTimer, onRequestDelete, onSwipeOpen])

  const onPointerUp = useCallback((e) => {
    if (gestureRef.current.pointerId !== e.pointerId) return
    finishGesture()
    try {
      e.currentTarget.releasePointerCapture(e.pointerId)
    } catch {
      /* ignore */
    }
  }, [finishGesture])

  const onPointerCancel = useCallback((e) => {
    if (gestureRef.current.pointerId !== e.pointerId) return
    finishGesture()
    try {
      e.currentTarget.releasePointerCapture(e.pointerId)
    } catch {
      /* ignore */
    }
  }, [finishGesture])

  const handleClick = useCallback(() => {
    if (committingRef.current) return
    if (Math.abs(offsetRef.current) > 8) {
      animateOffsetTo(0)
      onSwipeOpen?.(null)
      return
    }
    onActivate?.()
  }, [animateOffsetTo, onActivate, onSwipeOpen])

  const deleteProgress = offsetX > 0 ? getIconProgress(offsetX) : 0
  const iconScale = 0.84 + deleteProgress * 0.16
  const rowTransition = swipeDragging ? 'none' : SWIPE_SNAP_TRANSITION
  const defaultSurfaceClass = isSelected
    ? 'border p-4 transition-colors bg-cyan-950/40 border-cyan-700/60 active:bg-cyan-950/60'
    : 'border p-4 transition-colors bg-zinc-900 border-zinc-800/60 active:bg-zinc-800'
  const fgClassName = [
    'bankroll-session-swipe-foreground relative z-[1] w-full text-left touch-manipulation',
    foregroundClassName || defaultSurfaceClass,
    offsetX !== 0 ? 'bankroll-session-swipe-foreground-active' : '',
  ]
    .filter(Boolean)
    .join(' ')
  const Foreground = asDiv ? 'div' : 'button'

  return (
    <li ref={rowRef} className="bankroll-session-swipe-row relative list-none">
      <div className="bankroll-session-swipe-underlay-clip pointer-events-none absolute inset-0 z-0">
        {offsetX > 0 && (
          <>
            <div className="bankroll-session-swipe-delete absolute inset-0" aria-hidden />
            <span
              className="bankroll-session-swipe-icon absolute left-5 top-1/2"
              style={{
                opacity: deleteProgress,
                transform: `translateY(-50%) scale(${iconScale})`,
              }}
              aria-hidden
            >
              <TrashIcon />
            </span>
          </>
        )}
      </div>

      <Foreground
        {...(asDiv
          ? {
              role: 'button',
              tabIndex: 0,
              onKeyDown: (e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  handleClick()
                }
              },
            }
          : { type: 'button' })}
        ref={foregroundRef}
        data-session-row
        onClick={handleClick}
        className={fgClassName}
        style={{
          transform: `translate3d(${offsetX}px, 0, 0)`,
          transition: rowTransition,
          touchAction: selectMode ? 'manipulation' : 'none',
          WebkitUserSelect: 'none',
          WebkitTouchCallout: 'none',
          willChange: swipeDragging ? 'transform' : 'auto',
        }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerCancel}
        onContextMenu={(e) => e.preventDefault()}
      >
        {children}
      </Foreground>
    </li>
  )
}
