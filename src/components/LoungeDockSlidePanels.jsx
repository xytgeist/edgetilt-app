import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { feedPostDisplayCaption } from '../utils/communityFeedPost'
import { renderRichCaption } from '../features/lounge/loungeCaption'

const OPEN_MS = 300
const DISMISS_FRACTION = 0.22
const DISMISS_MIN_PX = 72
const COMMIT_PX = 10
/** Vertical must clearly beat horizontal to steal the gesture (thumb arcs skew slightly vertical). */
const VERTICAL_BEATS_HORIZONTAL = 1.52

/**
 * Left-sliding dock panels for Lounge (search / notifications / chat).
 * Swipe horizontally to dismiss: finger **left** (panel slides off to the left) **or finger right** (panel
 * slides off to the right — natural for a left-thumb “push away” toward the feed). Works from anywhere on
 * the panel, including search result rows. Vertical scroll still wins when movement is clearly vertical
 * after a short direction lock. Taps on rows still work because pointer capture starts only after horizontal
 * intent is detected. Scroll regions use `touch-pan-y` only so the browser does not compete for horizontal pans.
 * `bottomReservePx` clears the fixed dock footer height + a little gap.
 */
export default function LoungeDockSlidePanels({
  openPanel,
  onClose,
  communityPosts = [],
  bottomReservePx = 56,
  /** Optional: focus a post in the parent feed (e.g. open detail). */
  onPickPost,
}) {
  const panelRef = useRef(null)
  const [panelW, setPanelW] = useState(300)
  const [tx, setTx] = useState(0)
  const [txTransition, setTxTransition] = useState(false)
  const dragTxRef = useRef(0)
  const closeTimerRef = useRef(0)

  const pointerIdRef = useRef(null)
  const startClientXRef = useRef(0)
  const startClientYRef = useRef(0)
  const startTxRef = useRef(0)
  const draggingRef = useRef(false)
  const decidedRef = useRef(false)
  const horizontalRef = useRef(false)
  /** Capture only after a horizontal dismiss gesture is committed so taps on list rows still work. */
  const pointerCapturedRef = useRef(false)

  const [q, setQ] = useState('')

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase()
    if (!s) return communityPosts
    return (communityPosts || []).filter((p) => {
      const cap = feedPostDisplayCaption(p).toLowerCase()
      const game = String(p?.game_title || '').toLowerCase()
      return cap.includes(s) || game.includes(s)
    })
  }, [communityPosts, q])

  useLayoutEffect(() => {
    return () => {
      if (closeTimerRef.current) window.clearTimeout(closeTimerRef.current)
    }
  }, [])

  useLayoutEffect(() => {
    const el = panelRef.current
    if (!el || typeof window === 'undefined') return
    let cancelled = false
    let innerRaf = 0
    const outerRaf = window.requestAnimationFrame(() => {
      if (cancelled) return
      const w = Math.round(el.getBoundingClientRect().width)
      const wClamped = Math.max(w || 300, 200)
      setPanelW(wClamped)
      setTxTransition(false)
      setTx(-wClamped)
      dragTxRef.current = -wClamped
      innerRaf = window.requestAnimationFrame(() => {
        if (cancelled) return
        const w2 = Math.round(el.getBoundingClientRect().width)
        const wc = Math.max(w2 || wClamped, 200)
        setPanelW(wc)
        setTxTransition(true)
        setTx(0)
        dragTxRef.current = 0
      })
    })
    return () => {
      cancelled = true
      window.cancelAnimationFrame(outerRaf)
      if (innerRaf) window.cancelAnimationFrame(innerRaf)
    }
  }, [openPanel])

  useEffect(() => {
    const el = panelRef.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(() => {
      const w = Math.round(el.getBoundingClientRect().width)
      if (w > 0) setPanelW(w)
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const dismissWithAnimation = useCallback((direction = 'left') => {
    const w = Math.round(panelRef.current?.getBoundingClientRect().width || panelW)
    const wc = Math.max(w, 200)
    setPanelW(wc)
    setTxTransition(true)
    const endTx = direction === 'right' ? wc : -wc
    setTx(endTx)
    dragTxRef.current = endTx
    if (closeTimerRef.current) window.clearTimeout(closeTimerRef.current)
    closeTimerRef.current = window.setTimeout(() => {
      closeTimerRef.current = 0
      onClose()
    }, OPEN_MS + 40)
  }, [onClose, panelW])

  const onPointerDown = useCallback((e) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return
    const t = e.target
    if (t instanceof Element) {
      if (t.closest('input, textarea, select, label')) return
      if (t.closest('button[aria-label="Close"]')) return
    }
    if (!(e.currentTarget instanceof Element)) return
    pointerIdRef.current = e.pointerId
    startClientXRef.current = e.clientX
    startClientYRef.current = e.clientY
    startTxRef.current = dragTxRef.current
    draggingRef.current = true
    decidedRef.current = false
    horizontalRef.current = false
    pointerCapturedRef.current = false
    setTxTransition(false)
  }, [])

  const onPointerMove = useCallback(
    (e) => {
      if (!draggingRef.current || pointerIdRef.current !== e.pointerId) return
      const dx = e.clientX - startClientXRef.current
      const dy = e.clientY - startClientYRef.current
      if (!decidedRef.current) {
        if (Math.abs(dx) < COMMIT_PX && Math.abs(dy) < COMMIT_PX) return
        decidedRef.current = true
        if (Math.abs(dy) > Math.abs(dx) * VERTICAL_BEATS_HORIZONTAL) {
          draggingRef.current = false
          horizontalRef.current = false
          pointerIdRef.current = null
          setTxTransition(true)
          return
        }
        horizontalRef.current = true
        const cur = e.currentTarget
        if (cur instanceof Element && !pointerCapturedRef.current) {
          try {
            cur.setPointerCapture(e.pointerId)
            pointerCapturedRef.current = true
          } catch {
            // still try to drag without capture (e.g. lost race)
          }
        }
      }
      if (!horizontalRef.current) return
      e.preventDefault()
      const w = Math.max(panelW, 200)
      /** Allow sliding off to the left (negative) or right (positive) so left- and right-thumb dismiss both work. */
      const next = Math.max(-w, Math.min(w, startTxRef.current + dx))
      dragTxRef.current = next
      setTx(next)
    },
    [panelW]
  )

  const endPointerGesture = useCallback(
    (e) => {
      if (pointerIdRef.current !== e.pointerId) return
      if (pointerCapturedRef.current && e.currentTarget instanceof Element) {
        try {
          e.currentTarget.releasePointerCapture(e.pointerId)
        } catch {
          // ignore
        }
      }
      pointerCapturedRef.current = false
      pointerIdRef.current = null
      const wasHorizontal = horizontalRef.current
      draggingRef.current = false
      horizontalRef.current = false
      decidedRef.current = false
      setTxTransition(true)
      if (!wasHorizontal) return
      const cur = dragTxRef.current
      const w = Math.max(panelW, 200)
      const travel = Math.max(w * DISMISS_FRACTION, DISMISS_MIN_PX)
      const thresholdNeg = -travel
      const thresholdPos = travel
      if (cur <= thresholdNeg) {
        dismissWithAnimation('left')
      } else if (cur >= thresholdPos) {
        dismissWithAnimation('right')
      } else {
        setTx(0)
        dragTxRef.current = 0
      }
    },
    [dismissWithAnimation, panelW]
  )

  if (!openPanel) return null

  const bottomPad = `max(0.75rem, calc(${bottomReservePx}px + env(safe-area-inset-bottom)))`

  return (
    <>
      <button
        type="button"
        aria-label="Close panel"
        className="fixed inset-0 z-[98] bg-black/45 backdrop-blur-[1px]"
        onClick={onClose}
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={openPanel === 'search' ? 'Search lounge' : openPanel === 'notifications' ? 'Notifications' : 'Chat'}
        className="fixed left-0 top-0 z-[99] flex h-dvh max-h-dvh w-[min(22rem,calc(100vw-2.5rem))] max-w-[85vw] flex-col border-r border-zinc-800/90 bg-zinc-950 shadow-[8px_0_40px_rgba(0,0,0,0.45)] will-change-transform motion-reduce:transition-none"
        style={{
          transform: `translate3d(${tx}px, 0, 0)`,
          transition: txTransition ? `transform ${OPEN_MS}ms cubic-bezier(0.22, 1, 0.36, 1)` : 'none',
          paddingBottom: bottomPad,
          paddingTop: 'max(0.5rem, env(safe-area-inset-top))',
        }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endPointerGesture}
        onPointerCancel={endPointerGesture}
      >
        <div className="flex shrink-0 items-center justify-between gap-2 border-b border-zinc-800/90 px-3 py-2">
          <h2 className="truncate text-[17px] font-semibold text-zinc-100">
            {openPanel === 'search' ? 'Search Lounge' : openPanel === 'notifications' ? 'Notifications' : 'Chat'}
          </h2>
          <button
            type="button"
            onClick={() => dismissWithAnimation('left')}
            className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-zinc-700/60 bg-zinc-900 text-zinc-200 touch-manipulation hover:bg-zinc-800"
            aria-label="Close"
          >
            <span className="text-xl leading-none">×</span>
          </button>
        </div>

        {openPanel === 'search' ? (
          <div className="flex min-h-0 flex-1 flex-col px-3 pt-3">
            <input
              type="search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search captions & games…"
              autoComplete="off"
              className="mb-3 w-full rounded-xl border border-zinc-700 bg-zinc-900/90 px-3 py-2.5 text-[16px] text-zinc-100 placeholder:text-zinc-500 outline-none focus:border-cyan-500/45 focus:ring-1 focus:ring-cyan-500/25"
            />
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain [-webkit-overflow-scrolling:touch] pb-2 touch-pan-y">
              {filtered.length === 0 ? (
                <p className="text-[14px] leading-relaxed text-zinc-500">No posts match.</p>
              ) : (
                <ul className="space-y-2">
                  {filtered.map((p) => (
                    <li key={p.id}>
                      <button
                        type="button"
                        onClick={() => onPickPost?.(p.id)}
                        className="w-full rounded-xl border border-zinc-800/90 bg-zinc-900/60 px-3 py-2.5 text-left touch-manipulation hover:bg-zinc-800/70"
                      >
                        <div className="line-clamp-3 text-[14px] leading-snug text-zinc-200">
                          {renderRichCaption(feedPostDisplayCaption(p) || ' ', {
                            hashtagClassName: 'font-semibold text-cyan-400',
                          })}
                        </div>
                        {p.game_title ? (
                          <div className="mt-1 text-[11px] font-bold uppercase tracking-wide text-amber-400/85">{p.game_title}</div>
                        ) : null}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        ) : (
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain px-3 py-4 [-webkit-overflow-scrolling:touch] touch-pan-y">
            <p className="text-[15px] leading-relaxed text-zinc-400">
              {openPanel === 'notifications'
                ? 'Notification center is coming soon. Push and offer alerts continue to work from their tabs.'
                : 'Direct messages and group chat are on the roadmap — TLS + encrypted storage first, then richer chat.'}
            </p>
          </div>
        )}
      </div>
    </>
  )
}
