import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { feedPostDisplayCaption, loungePostInteractionScore } from '../utils/communityFeedPost'
import EdgeLogoWithEasterEgg from './EdgeLogoWithEasterEgg.jsx'
import LoungePostArticle from '../features/lounge/LoungePostArticle.jsx'
import { LOUNGE_FEED_POST_ROW_CLASS } from '../features/lounge/loungeFeedAvatar.js'
import { LoungeFeedVideoAutoplayProvider } from '../features/lounge/LoungeFeedVideoAutoplayContext.jsx'
import LoungeChatPanel from '../features/lounge/LoungeChatPanel.jsx'
import { loungeDockFabScrollBottomInsetPx } from '../utils/loungeDockFabPosition.js'
import {
  loungeTitleRevealAfterScrollStep,
  loungeTitleRevealClampScrollDelta,
} from '../utils/loungeTitleRevealScroll.js'

const OPEN_MS = 300
const DISMISS_FRACTION = 0.22
const DISMISS_MIN_PX = 72
const COMMIT_PX = 10
/** Vertical must clearly beat horizontal to steal the gesture (thumb arcs skew slightly vertical). */
const VERTICAL_BEATS_HORIZONTAL = 1.52

/**
 * Full-screen Lounge dock panels (search / notifications / chat) over the feed column (`max-w-2xl`).
 * Same **title bar** chrome as the feed (logo, updating line, nav slot) with **scroll-linked hide/show**;
 * Bottom scroll inset clears the draggable FAB menu (`SocialFeed` mounts `LoungeDockArcCarouselPrototype` at
 * `z-[100]` above this layer). Swipe horizontally to dismiss (left or right). `viewportTitleTopPx` must
 * match the feed title’s `top` offset so the bar aligns with the main Lounge shell.
 *
 * Search tab: `postCardProps` is the same shape as profile/feed `LoungePostArticle` handlers (without
 * `repostMenuScrollRootRef`); this component injects `repostMenuScrollRootRef={panelScrollRef}`.
 */
export default function LoungeDockSlidePanels({
  openPanel,
  onClose,
  communityPosts = [],
  /** Props for `LoungePostArticle` on the search tab (e.g. `SocialFeed` `profilePostCardProps`). */
  postCardProps = null,
  /** Matches `SocialFeed` `loungeFeedViewportTopPx` (title `top` under shell padding). */
  viewportTitleTopPx = 0,
  titleBarNavSlot = null,
  communityFeedLoading = false,
  onHome,
  onSearch,
  onFollowingFilterToggle,
  followingFilterOn = false,
  followingFilterDisabled = false,
  onNotifications,
  onChat,
  onSettings,
  onOpenOwnProfile,
  activePanel = null,
  /** Open a post from search (full row); closes the panel and opens post detail like the main feed. */
  onOpenPostFromSearch,
  chatSupabaseClient = null,
  chatViewerUserId = '',
  chatHasActiveSubscription = false,
  chatIsStaff = false,
  chatInitialPeerUserId = null,
  onChatInitialPeerCleared,
  /** `'wheel'` | `'cornerL'` — persisted in `loungeDockMenuLayout:v1`. */
  dockMenuLayout = 'wheel',
  onDockMenuLayoutChange,
  /** When true (e.g. FAB long-press), block scroll-region hits so gestures don’t fight the dock. */
  blockUnderlyingPointer = false,
  /** Scroll-linked 0–1 reveal for `LoungeDockArcCarouselPrototype` (same curve as panel title bar). */
  onTitleRevealChange,
  /** Pre-fill the search input when the panel opens (e.g. from a #hashtag tap). */
  initialSearchQuery = '',
}) {
  const panelRef = useRef(null)
  const panelScrollRef = useRef(null)
  const panelTitleBarRef = useRef(null)
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
  const pointerCapturedRef = useRef(false)

  const [panelTitleBarHeight, setPanelTitleBarHeight] = useState(0)
  const panelTitleRevealRef = useRef(1)
  const [panelTitleReveal, setPanelTitleReveal] = useState(1)
  const panelScrollPrevTopRef = useRef(0)
  const panelScrollVisualRafRef = useRef(0)

  const [q, setQ] = useState(() => initialSearchQuery || '')

  const filteredSearchPosts = useMemo(() => {
    const s = q.trim().toLowerCase()
    const base = communityPosts || []
    if (!s) {
      const all = base.slice()
      all.sort((a, b) => {
        const d = loungePostInteractionScore(b) - loungePostInteractionScore(a)
        if (d !== 0) return d
        return new Date(b?.created_at || 0).getTime() - new Date(a?.created_at || 0).getTime()
      })
      return all
    }

    // Strip leading # so "#lasvegas" and "lasvegas" search identically.
    const hashBase = s.startsWith('#') ? s.slice(1) : s
    // Only apply hashtag-bucket logic when the term is a single word (no spaces).
    const isWordQuery = hashBase.length > 0 && !hashBase.includes(' ')
    // Escape special regex chars in the term.
    const esc = hashBase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const exactRe = isWordQuery ? new RegExp(`#${esc}(?![\\w-])`, 'i') : null
    const prefixRe = isWordQuery ? new RegExp(`#${esc}[\\w-]`, 'i') : null

    const tsMs = (p) => new Date(p?.created_at || 0).getTime()

    const buckets = [[], [], []] // 0=exact hashtag, 1=prefix hashtag, 2=text match
    for (const p of base) {
      const cap = feedPostDisplayCaption(p).toLowerCase()
      const game = String(p?.game_title || '').toLowerCase()
      if (exactRe?.test(cap)) {
        buckets[0].push(p)
      } else if (prefixRe?.test(cap)) {
        buckets[1].push(p)
      } else if (cap.includes(s) || game.includes(s)) {
        buckets[2].push(p)
      }
    }

    // Within each bucket: most recent first.
    for (const bucket of buckets) {
      bucket.sort((a, b) => tsMs(b) - tsMs(a))
    }

    return [...buckets[0], ...buckets[1], ...buckets[2]]
  }, [communityPosts, q])

  const panelTitleBarChromePx = panelTitleBarHeight > 0 ? panelTitleBarHeight : 56
  const scrollBottomInsetPx = loungeDockFabScrollBottomInsetPx()
  const titleHidePx = panelTitleBarHeight > 0 ? panelTitleBarHeight : 56
  const scrollPaddingTopPx = viewportTitleTopPx + panelTitleBarChromePx

  useLayoutEffect(() => {
    return () => {
      if (closeTimerRef.current) window.clearTimeout(closeTimerRef.current)
    }
  }, [])

  useLayoutEffect(() => {
    const bar = panelTitleBarRef.current
    if (!bar || typeof ResizeObserver === 'undefined') return
    const apply = () => {
      const h = Math.ceil(bar.getBoundingClientRect().height)
      if (h > 0) setPanelTitleBarHeight((prev) => (prev === h ? prev : h))
    }
    apply()
    const ro = new ResizeObserver(() => apply())
    ro.observe(bar)
    return () => ro.disconnect()
  }, [openPanel])

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

  useEffect(() => {
    if (!openPanel) return
    panelTitleRevealRef.current = 1
    setPanelTitleReveal(1)
    onTitleRevealChange?.(1)
  }, [openPanel, onTitleRevealChange])

  useEffect(() => {
    const el = panelScrollRef.current
    if (!el || typeof window === 'undefined' || !openPanel) return
    panelScrollPrevTopRef.current = el.scrollTop
    const queuePanelTitleFlush = () => {
      if (panelScrollVisualRafRef.current) return
      panelScrollVisualRafRef.current = window.requestAnimationFrame(() => {
        panelScrollVisualRafRef.current = 0
        const next = panelTitleRevealRef.current
        setPanelTitleReveal(next)
        onTitleRevealChange?.(next)
      })
    }
    const onScroll = () => {
      const st = el.scrollTop
      const prev = panelScrollPrevTopRef.current
      const rawDelta = st - prev
      panelScrollPrevTopRef.current = st
      const eff = rawDelta === 0 ? 0 : loungeTitleRevealClampScrollDelta(rawDelta)
      const titleStep = loungeTitleRevealAfterScrollStep({
        scrollTop: st,
        effectiveDelta: eff,
        revealRef: panelTitleRevealRef,
      })
      if (titleStep.changed) queuePanelTitleFlush()
    }
    el.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      el.removeEventListener('scroll', onScroll)
      if (panelScrollVisualRafRef.current) {
        window.cancelAnimationFrame(panelScrollVisualRafRef.current)
        panelScrollVisualRafRef.current = 0
      }
    }
  }, [openPanel, onTitleRevealChange])

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
      if (t.closest('button[aria-label="Close panel"]')) return
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

  return (
    <div className="pointer-events-none fixed inset-x-0 top-0 z-[99] flex h-dvh max-h-dvh justify-center">
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={
          openPanel === 'search'
            ? 'Search lounge'
            : openPanel === 'notifications'
              ? 'Notifications'
              : openPanel === 'settings'
                ? 'Settings'
                : 'Chat'
        }
        className="pointer-events-auto relative flex h-full w-full max-w-2xl flex-col overflow-hidden bg-zinc-950 shadow-[0_0_0_1px_rgba(24,24,27,0.6)] will-change-transform motion-reduce:transition-none"
        style={{
          transform: `translate3d(${tx}px, 0, 0)`,
          transition: txTransition ? `transform ${OPEN_MS}ms cubic-bezier(0.22, 1, 0.36, 1)` : 'none',
        }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endPointerGesture}
        onPointerCancel={endPointerGesture}
      >
      <div
        ref={panelTitleBarRef}
        className="pointer-events-auto absolute left-0 right-0 z-20 w-full border-b border-zinc-800/95 bg-zinc-950/95 backdrop-blur supports-[backdrop-filter]:bg-zinc-950/85 shadow-[0_1px_0_rgba(0,0,0,0.22)] will-change-transform"
        style={{
          top: viewportTitleTopPx,
          transform: `translate3d(0, ${-(1 - panelTitleReveal) * titleHidePx}px, 0)`,
          pointerEvents: panelTitleReveal > 0.12 ? 'auto' : 'none',
        }}
      >
        <div className="flex items-center justify-between gap-2 px-3 py-2">
          <EdgeLogoWithEasterEgg className="h-6 w-auto max-w-[min(140px,calc(100vw-9rem))] shrink-0 object-contain object-left" />
          <div className="flex min-w-0 shrink-0 items-center justify-end gap-2">
            <div className="pointer-events-none truncate text-right text-zinc-600 text-[13px]">
              {communityFeedLoading ? 'Updating…' : ''}
            </div>
            {titleBarNavSlot}
            <button
              type="button"
              onClick={() => dismissWithAnimation('left')}
              className="pointer-events-auto grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-zinc-700/60 bg-zinc-900 text-zinc-200 touch-manipulation hover:bg-zinc-800"
              aria-label="Close panel"
            >
              <span className="text-xl leading-none">×</span>
            </button>
          </div>
        </div>
      </div>

      <div
        ref={panelScrollRef}
        className={
          openPanel === 'chat'
            ? 'min-h-0 flex flex-1 flex-col overflow-hidden overscroll-y-contain [-webkit-overflow-scrolling:touch] touch-pan-y'
            : 'min-h-0 flex-1 overflow-y-auto overscroll-y-contain [-webkit-overflow-scrolling:touch] touch-pan-y'
        }
        style={{
          paddingTop: scrollPaddingTopPx,
          paddingBottom: scrollBottomInsetPx,
          pointerEvents: blockUnderlyingPointer ? 'none' : undefined,
        }}
      >
        {openPanel === 'search' ? (
          <div className="px-3 pt-3">
            <input
              type="search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search captions & games…"
              autoComplete="off"
              className="mb-3 w-full rounded-xl border border-zinc-700 bg-zinc-900/90 px-3 py-2.5 text-[16px] text-zinc-100 placeholder:text-zinc-500 outline-none focus:border-cyan-500/45 focus:ring-1 focus:ring-cyan-500/25"
            />
            {!postCardProps ? (
              <p className="text-[14px] leading-relaxed text-zinc-500">Search is not available.</p>
            ) : filteredSearchPosts.length === 0 ? (
              <p className="text-[14px] leading-relaxed text-zinc-500">No posts match.</p>
            ) : (
              <LoungeFeedVideoAutoplayProvider scrollRootRef={panelScrollRef}>
                {filteredSearchPosts.map((post) => (
                  <article
                    key={post.id}
                    style={{ contentVisibility: 'auto', containIntrinsicSize: 'auto 320px' }}
                    className={LOUNGE_FEED_POST_ROW_CLASS}
                    onClick={(e) => {
                      const t = e.target
                      if (!(t instanceof Element)) return
                      const origHost = t.closest('[data-lounge-original-embed]')
                      if (origHost && post.reposted_post?.id) {
                        onOpenPostFromSearch?.(post.reposted_post)
                        return
                      }
                      if (
                        t.closest(
                          'button, a, textarea, input, select, [data-lounge-post-menu], [data-lounge-image-zoom], [data-lounge-video-zoom], [data-lounge-badge-tip]',
                        )
                      )
                        return
                      onOpenPostFromSearch?.(post)
                    }}
                  >
                    <LoungePostArticle
                      post={post}
                      {...postCardProps}
                      repostMenuScrollRootRef={panelScrollRef}
                    />
                  </article>
                ))}
              </LoungeFeedVideoAutoplayProvider>
            )}
          </div>
        ) : openPanel === 'chat' ? (
          <div className="flex min-h-0 flex-1 flex-col px-0 pt-2">
            <LoungeChatPanel
              supabaseClient={chatSupabaseClient}
              viewerUserId={chatViewerUserId}
              hasActiveSubscription={chatHasActiveSubscription}
              isStaff={chatIsStaff}
              initialPeerUserId={chatInitialPeerUserId}
              onClearInitialPeer={onChatInitialPeerCleared}
            />
          </div>
        ) : openPanel === 'settings' ? (
          <div className="px-3 py-4">
            <h2 className="text-[17px] font-semibold text-zinc-100">Settings</h2>
            <p className="mt-1 text-[14px] leading-relaxed text-zinc-500">
              Lounge account and preferences.
            </p>
            <div className="mt-4 flex flex-col gap-2">
              <button
                type="button"
                onClick={() => onOpenOwnProfile?.()}
                className="min-h-12 w-full rounded-xl border border-[#ff3dff]/75 bg-[#180018]/90 px-4 py-3 text-left text-[15px] font-semibold text-white shadow-[0_0_18px_rgba(255,61,255,0.45)] touch-manipulation hover:bg-[#280028]/95 [-webkit-tap-highlight-color:transparent]"
              >
                Profile &amp; account
              </button>
              <p className="px-1 text-[13px] leading-relaxed text-zinc-500">
                Edit handle, display name, avatar, and bio. More Lounge settings will land here.
              </p>
            </div>

            <div className="mt-6 border-t border-zinc-800 pt-5">
              <h3 className="text-[15px] font-semibold text-zinc-100">Menu button layout</h3>
              <p className="mt-1 text-[13px] leading-relaxed text-zinc-500">
                Choose how the <span className="text-zinc-400">+</span> menu arranges shortcuts. Applies on the Lounge
                feed (max-width column).
              </p>
              <div className="mt-3 flex flex-col gap-2">
                <button
                  type="button"
                  onClick={() => onDockMenuLayoutChange?.('wheel')}
                  className={`min-h-12 w-full rounded-xl border px-4 py-3 text-left text-[15px] font-semibold touch-manipulation [-webkit-tap-highlight-color:transparent] ${
                    dockMenuLayout === 'wheel'
                      ? 'border-lv-blue/90 bg-[#001828]/95 text-white shadow-[0_0_14px_rgba(6,206,252,0.35)]'
                      : 'border-zinc-700/90 bg-zinc-950/80 text-zinc-200 hover:bg-zinc-900/70'
                  }`}
                >
                  Wheel (O)
                  <span className="mt-0.5 block text-[12px] font-normal text-zinc-500">
                    Icons in an arc around the button; spin the ring if some sit off-screen.
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => onDockMenuLayoutChange?.('cornerL')}
                  className={`min-h-12 w-full rounded-xl border px-4 py-3 text-left text-[15px] font-semibold touch-manipulation [-webkit-tap-highlight-color:transparent] ${
                    dockMenuLayout === 'cornerL'
                      ? 'border-lv-blue/90 bg-[#001828]/95 text-white shadow-[0_0_14px_rgba(6,206,252,0.35)]'
                      : 'border-zinc-700/90 bg-zinc-950/80 text-zinc-200 hover:bg-zinc-900/70'
                  }`}
                >
                  Edge (L)
                  <span className="mt-0.5 block text-[12px] font-normal text-zinc-500">
                    Button snaps to the bottom corner; icons run in an L along the bottom edge and side (mirrored on
                    the right).
                  </span>
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div className="px-3 py-4">
            <p className="text-[15px] leading-relaxed text-zinc-400">
              {openPanel === 'notifications'
                ? 'Notification center is coming soon. Push and offer alerts continue to work from their tabs.'
                : 'Chat panel is unavailable.'}
            </p>
          </div>
        )}
      </div>
      </div>
    </div>
  )
}
