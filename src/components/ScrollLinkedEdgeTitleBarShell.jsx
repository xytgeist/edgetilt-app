import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import EdgeLogoWithEasterEgg from './EdgeLogoWithEasterEgg.jsx'
import TitleBarStatusLine from './TitleBarStatusLine.jsx'
import PwaInstallTitleBarRow from './PwaInstallBanner.jsx'
import { LOUNGE_FEED_TITLE_BAR_ROW_CLASS } from '../features/lounge/loungeFeedAvatar.js'
import { useQuickLinkIds } from '../features/shell/quickLinksStore.js'
import { useIpadNavRail } from '../features/shell/useIpadNavRail.js'
import { edgeLogoTitleBarClassName } from '../features/shell/titleBarLayout.js'
import { setEdgeTitleBarReveal } from '../features/shell/edgeTitleBarRevealStore.js'
import {
  lockStableLayoutViewportHeight,
  unlockStableLayoutViewportHeight,
} from '../utils/stableLayoutViewport.js'
import { loungeTitleBarHideTranslateYPx } from '../utils/loungeTitleRevealScroll.js'
import EdgeStatusBarScrollPlate from './EdgeStatusBarScrollPlate.jsx'

/**
 * Fixed EDGE title bar + scroll-linked hide/show - same chrome and tuning as
 * `SocialFeed.jsx` / Guides (no composer coupling).
 *
 * @param {React.ReactNode} titleBarNavSlot - hamburger / shell menu (right).
 * @param {React.ReactNode} children - scrollable body (placed inside padded column).
 * @param {string} [contentClassName] - inner wrapper classes. Default adds horizontal padding + bottom inset for FAB / thumb clearance **including** `max(env(safe-area-inset-bottom,0px),var(--edge-sab,0px))` inside the scroller (no dead strip under the scroll viewport).
 * @param {boolean} [fullWidth=false] - use full viewport width for column + fixed bar (e.g. Offers week landscape).
 * @param {boolean} [fillViewport=false] - pin title bar + fill remaining height; outer body does not scroll.
 *   Put your own `overflow-y-auto` region inside children (e.g. chat inbox list under sticky tabs).
 * @param {boolean} [stableLayoutViewport=false] - pin height to layout `100vh` / `innerHeight` instead of `dvh`.
 *   Use on admin surfaces with native file pickers (Chrome/Windows can shrink `dvh` to ~half).
 * @param {string | null} [titleBarAlignStartWidth=null] - CSS width for a left-aligned fixed title bar
 *   (e.g. `calc(100vw - var(--edge-ipad-rail, 0px))` or `var(--chat-landscape-list-col)`).
 *   When set, the bar sits at `left: var(--edge-rail-inset-start)` instead of centered.
 * @param {boolean} [fillParentHeight=false] - use `h-full` of the parent instead of `h-dvh`
 *   (landscape list column inside a split shell).
 */
const defaultShellContentClassName = 'px-3 pb-[calc(6rem+max(env(safe-area-inset-bottom,0px),var(--edge-sab,0px)))]'
const TUCK_HINT_KEY = 'edge.titleBarTuckHint.v1'
const TUCK_RETRY_MS = 1000

/** Auto-tuck: fully shown = 1, tucked = a small sliver at the top center where the pull tab sits. */
function shrinkScale(reveal) {
  const r = Math.min(1, Math.max(0, Number(reveal) || 0))
  return (0.18 + 0.82 * r).toFixed(3)
}

export default function ScrollLinkedEdgeTitleBarShell({
  titleBarNavSlot = null,
  /** Optional center control (e.g. live session chip). */
  titleBarCenterSlot = null,
  /** Slot tool × in nav cluster - reserve logo width (matches `titleBarLayout.toolCloseVisible`). */
  titleBarToolCloseVisible = false,
  /** Publish scroll-linked reveal for the portaled lounge dock on other tabs. */
  publishScrollReveal = true,
  /** Optional ref to the scroll viewport (infinite scroll sentinels, etc.). */
  scrollRootRef = null,
  children,
  contentClassName = defaultShellContentClassName,
  fullWidth = false,
  fillViewport = false,
  stableLayoutViewport = false,
  /** Fill the parent instead of the viewport. No EDGE title bar. Used by the landscape Slots guides pane. */
  embedded = false,
  /** Landscape Slots split: no fixed title bar. SlotsScreen owns the tools-column chrome. */
  slotsToolsLogo = false,
  /** Replace the EDGE wordmark (e.g. Chat / Settings-style screen title). */
  titleBarBrand = null,
  titleBarAlignStartWidth = null,
  fillParentHeight = false,
  /**
   * Tuck the bar away after this many idle ms (0 = never) and leave a pull tab to bring it back
   * (drag down or tap). Scroll up / to the top still reveals it like the Lounge.
   */
  autoTuckMs = 0,
}) {
  const ipadNavRail = useIpadNavRail()
  /**
   * Explicit landscape widths win. Otherwise the iPad/phone-landscape rail needs the
   * same left-align Lounge already uses ... centered `left-1/2` paints under the rail
   * ("hat", "DGE" beside the rail E) after landscape→portrait.
   */
  const resolvedAlignStartWidth =
    titleBarAlignStartWidth ||
    (ipadNavRail && !embedded && !slotsToolsLogo
      ? 'calc(100vw - var(--edge-ipad-rail, 0px))'
      : null)
  const colMax = fullWidth || resolvedAlignStartWidth || ipadNavRail ? 'max-w-none' : 'max-w-2xl'
  const heightClass = fillParentHeight
    ? 'h-full max-h-full'
    : stableLayoutViewport
      ? 'h-[100vh] max-h-[100vh]'
      : 'h-dvh max-h-dvh'
  const alignStartWidth = resolvedAlignStartWidth ? String(resolvedAlignStartWidth) : ''
  const titleBarAlignStart = Boolean(alignStartWidth)
  const internalScrollRef = useRef(null)
  const feedScrollRef = scrollRootRef ?? internalScrollRef
  const titleBarRef = useRef(null)
  const scrollPrevTopRef = useRef(0)
  const titleRevealRef = useRef(1)
  const scrollVisualRafRef = useRef(0)
  const tuckActivityRef = useRef(Date.now())
  const autoTuckRef = useRef(Boolean(autoTuckMs))
  autoTuckRef.current = Boolean(autoTuckMs)
  const scrollRunRef = useRef({ dir: 0, px: 0 })
  const snapRevealRef = useRef(null)
  const tabDragRef = useRef(null)
  const [titleBarHeight, setTitleBarHeight] = useState(0)
  const [titleReveal, setTitleReveal] = useState(1)
  const [feedViewportTopPx, setFeedViewportTopPx] = useState(0)
  const quickLinkIds = useQuickLinkIds()
  const logoClassName = edgeLogoTitleBarClassName(quickLinkIds.length, {
    toolCloseVisible: titleBarToolCloseVisible,
    liveSessionChipVisible: Boolean(titleBarCenterSlot),
  })
  const hideFixedTitleBar = Boolean(slotsToolsLogo)

  useLayoutEffect(() => {
    if (!stableLayoutViewport) return undefined
    const apply = () => lockStableLayoutViewportHeight()
    apply()
    window.addEventListener('resize', apply)
    window.addEventListener('focus', apply)
    window.visualViewport?.addEventListener('resize', apply)
    return () => {
      window.removeEventListener('resize', apply)
      window.removeEventListener('focus', apply)
      window.visualViewport?.removeEventListener('resize', apply)
      unlockStableLayoutViewportHeight()
    }
  }, [stableLayoutViewport])

  useLayoutEffect(() => {
    const bar = titleBarRef.current
    if (!bar || typeof ResizeObserver === 'undefined') return
    const apply = () => {
      const h = Math.ceil(bar.getBoundingClientRect().height)
      if (h > 0) setTitleBarHeight((prev) => (prev === h ? prev : h))
    }
    apply()
    const ro = new ResizeObserver(() => apply())
    ro.observe(bar)
    return () => ro.disconnect()
  }, [])

  useLayoutEffect(() => {
    const el = feedScrollRef.current
    if (!el) return
    const sync = () => {
      setFeedViewportTopPx((prev) => {
        const n = Math.round(el.getBoundingClientRect().top)
        return prev === n ? prev : n
      })
    }
    sync()
    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', sync)
      return () => window.removeEventListener('resize', sync)
    }
    const ro = new ResizeObserver(sync)
    ro.observe(el)
    window.addEventListener('resize', sync)
    return () => {
      ro.disconnect()
      window.removeEventListener('resize', sync)
    }
  }, [])

  useEffect(() => {
    if (embedded || fillViewport) {
      // No outer scroll → keep title bar fully revealed. Embedded panes have no title bar.
      titleRevealRef.current = 1
      setTitleReveal(1)
      return undefined
    }
    const el = feedScrollRef.current
    if (!el || typeof window === 'undefined') return
    scrollPrevTopRef.current = el.scrollTop
    const titleRevealPerScrollPx = 220
    const titleHidePerScrollPx = 190
    const maxAbsScrollStepPx = 180
    const minScrollStepPx = 0.35
    const queueScrollVisualFlush = () => {
      if (scrollVisualRafRef.current) return
      scrollVisualRafRef.current = window.requestAnimationFrame(() => {
        scrollVisualRafRef.current = 0
        setTitleReveal(titleRevealRef.current)
      })
    }
    const onScroll = () => {
      const st = el.scrollTop
      const prev = scrollPrevTopRef.current
      const rawDelta = st - prev
      scrollPrevTopRef.current = st
      const eff =
        rawDelta === 0 ? 0 : Math.sign(rawDelta) * Math.min(Math.abs(rawDelta), maxAbsScrollStepPx)

      tuckActivityRef.current = Date.now()
      // Auto-tuck bars are all or nothing (a half-shrunk bar reads as a mini title bar): a short run of scroll in
      // one direction flips them, animated.
      if (autoTuckRef.current) {
        const run = scrollRunRef.current
        if (eff === 0) return
        if (Math.sign(eff) !== Math.sign(run.dir)) {
          run.dir = Math.sign(eff)
          run.px = 0
        }
        run.px += Math.abs(eff)
        const want = st <= 2 ? 1 : run.px >= 24 ? (eff > 0 ? 0 : 1) : titleRevealRef.current
        if (want !== titleRevealRef.current && !tabDragRef.current) snapRevealRef.current?.(want)
        return
      }
      let r = titleRevealRef.current
      if (st <= 2) {
        r = 1
      } else if (eff < -minScrollStepPx) {
        r = Math.min(1, r + (-eff) / titleRevealPerScrollPx)
      } else if (eff > minScrollStepPx) {
        r = Math.max(0, r - eff / titleHidePerScrollPx)
      }
      if (r !== titleRevealRef.current) {
        titleRevealRef.current = r
        queueScrollVisualFlush()
      }
    }
    el.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      el.removeEventListener('scroll', onScroll)
      if (scrollVisualRafRef.current) window.cancelAnimationFrame(scrollVisualRafRef.current)
    }
  }, [embedded, fillViewport])

  useEffect(() => {
    if (!publishScrollReveal) return undefined
    setEdgeTitleBarReveal(titleReveal)
    return () => setEdgeTitleBarReveal(1)
  }, [publishScrollReveal, titleReveal])

  // Auto-tuck + pull tab (opt-in). Programmatic reveal changes animate; finger-driven ones do not.
  const [revealAnimating, setRevealAnimating] = useState(false)
  const [tabDragging, setTabDragging] = useState(false)
  const [tuckHint, setTuckHint] = useState(false)
  const revealAnimTimerRef = useRef(0)
  const animateReveal = useCallback((to) => {
    setRevealAnimating(true)
    titleRevealRef.current = to
    setTitleReveal(to)
    window.clearTimeout(revealAnimTimerRef.current)
    revealAnimTimerRef.current = window.setTimeout(() => setRevealAnimating(false), 320)
  }, [])
  snapRevealRef.current = animateReveal
  useEffect(() => () => window.clearTimeout(revealAnimTimerRef.current), [])

  const tuck = useCallback(() => {
    const el = feedScrollRef.current
    const bar = titleBarRef.current
    if (!el || !bar) return false
    // Never pull the bar out from under its open menu.
    if (bar.querySelector('[aria-expanded="true"]')) return false
    const h = titleBarHeight || Math.ceil(bar.getBoundingClientRect().height)
    if (el.scrollTop < h) {
      // Near the top the content slides up into the bar's space; a page that fits (or is still loading) waits.
      if (el.scrollHeight - el.clientHeight < h) return false
      const reduce = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
      el.scrollTo({ top: h, behavior: reduce ? 'auto' : 'smooth' })
    }
    animateReveal(0)
    try {
      if (!localStorage.getItem(TUCK_HINT_KEY)) {
        localStorage.setItem(TUCK_HINT_KEY, '1')
        setTuckHint(true)
        window.setTimeout(() => setTuckHint(false), 3200)
      }
    } catch {
      /* private mode */
    }
    return true
    // feedScrollRef is a stable ref object
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [titleBarHeight, animateReveal])

  useEffect(() => {
    if (!autoTuckMs || embedded || fillViewport || hideFixedTitleBar || tabDragging) return undefined
    if (titleReveal < 1) return undefined
    let timer = 0
    const check = () => {
      const idle = Date.now() - tuckActivityRef.current
      // Menu open: try again once it has been closed for a full idle window.
      if (titleBarRef.current?.querySelector('[aria-expanded="true"]')) {
        tuckActivityRef.current = Date.now()
        timer = window.setTimeout(check, autoTuckMs)
      } else if (idle >= autoTuckMs) {
        // Skipped (content still loading, page fits): keep trying until it can tuck.
        if (!tuck()) timer = window.setTimeout(check, TUCK_RETRY_MS)
      } else timer = window.setTimeout(check, autoTuckMs - idle)
    }
    timer = window.setTimeout(check, autoTuckMs)
    return () => window.clearTimeout(timer)
  }, [autoTuckMs, embedded, fillViewport, hideFixedTitleBar, tabDragging, titleReveal, tuck])

  const onTabPointerDown = (event) => {
    event.preventDefault()
    tabDragRef.current = { y: event.clientY, moved: false, r: titleRevealRef.current }
    setTabDragging(true)
    event.currentTarget.setPointerCapture?.(event.pointerId)
  }
  const onTabPointerMove = (event) => {
    const g = tabDragRef.current
    if (!g) return
    const dy = event.clientY - g.y
    if (Math.abs(dy) > 6) g.moved = true
    const h = titleBarHeight || 56
    const r = Math.max(0, Math.min(1, dy / h))
    g.r = r
    titleRevealRef.current = r
    setTitleReveal(r)
  }
  const onTabPointerUp = () => {
    const g = tabDragRef.current
    tabDragRef.current = null
    setTabDragging(false)
    tuckActivityRef.current = Date.now()
    if (!g) return
    animateReveal(!g.moved || g.r >= 0.5 ? 1 : 0)
  }
  const showPullTab = Boolean(autoTuckMs) && !hideFixedTitleBar && !embedded && (titleReveal < 0.15 || tabDragging)

  if (embedded) {
    return (
      <div
        ref={feedScrollRef}
        data-edge-scroll-shell
        data-edge-scroll-embedded=""
        className={
          fillViewport
            ? 'flex min-h-0 w-full flex-1 flex-col overflow-hidden bg-zinc-950'
            : 'min-h-0 w-full flex-1 overflow-y-auto overscroll-y-contain bg-zinc-950 [-webkit-overflow-scrolling:touch]'
        }
      >
        <div
          className={
            fillViewport
              ? `${contentClassName} flex min-h-0 flex-1 flex-col overflow-hidden`
              : contentClassName
          }
        >
          {children}
        </div>
      </div>
    )
  }

  return (
    <div
      data-edge-scroll-shell
      {...(stableLayoutViewport ? { 'data-stable-layout-viewport': '' } : {})}
      className={
        fillParentHeight
          ? `mx-auto flex ${heightClass} min-h-0 w-full ${colMax} flex-col overflow-hidden bg-zinc-950`
          : `mx-auto flex ${heightClass} min-h-0 w-full ${colMax} flex-col overflow-hidden bg-zinc-950 pt-[max(0px,max(env(safe-area-inset-top,0px),var(--edge-sat,0px)))]`
      }
    >
      <EdgeStatusBarScrollPlate
        reveal={hideFixedTitleBar ? 1 : titleReveal}
        heightPx={feedViewportTopPx}
        className={colMax}
      />
      {hideFixedTitleBar ? null : (
        <div
          ref={titleBarRef}
          data-edge-scroll-shell
          className={
            titleBarAlignStart
              ? `fixed z-[50] border-b border-zinc-800/95 bg-zinc-950/95 backdrop-blur supports-[backdrop-filter]:bg-zinc-950/85 shadow-[0_1px_0_rgba(0,0,0,0.22)] will-change-transform`
              : `fixed left-1/2 z-[50] w-full ${colMax} border-b border-zinc-800/95 bg-zinc-950/95 backdrop-blur supports-[backdrop-filter]:bg-zinc-950/85 shadow-[0_1px_0_rgba(0,0,0,0.22)] will-change-transform`
          }
          onPointerDown={autoTuckMs ? () => { tuckActivityRef.current = Date.now() } : undefined}
          style={{
            top: feedViewportTopPx,
            ...(revealAnimating
              ? {
                  transition: autoTuckMs
                    ? 'transform 300ms cubic-bezier(0.2, 0.8, 0.2, 1), opacity 240ms ease, border-radius 300ms ease'
                    : 'transform 260ms cubic-bezier(0.2, 0.8, 0.2, 1)',
                }
              : {}),
            // Auto-tuck bars shrink in place toward the pull tab (top center) instead of sliding under the status bar.
            ...(autoTuckMs
              ? {
                  transformOrigin: '50% 0',
                  opacity: Math.min(1, titleReveal * 1.6),
                  borderRadius: `${Math.round((1 - titleReveal) * 22)}px`,
                }
              : {}),
            ...(titleBarAlignStart
              ? {
                  left: 'var(--edge-rail-inset-start, var(--edge-ipad-rail, 0px))',
                  width: alignStartWidth,
                  maxWidth: 'none',
                  transform: autoTuckMs
                    ? `scale(${shrinkScale(titleReveal)})`
                    : `translate3d(0, ${loungeTitleBarHideTranslateYPx(titleReveal, titleBarHeight, feedViewportTopPx)}px, 0)`,
                }
              : {
                  transform: autoTuckMs
                    ? `translate3d(-50%, 0, 0) scale(${shrinkScale(titleReveal)})`
                    : `translate3d(-50%, ${loungeTitleBarHideTranslateYPx(titleReveal, titleBarHeight, feedViewportTopPx)}px, 0)`,
                }),
            pointerEvents: titleReveal > 0.12 ? 'auto' : 'none',
          }}
        >
          <PwaInstallTitleBarRow
            rowClassName={LOUNGE_FEED_TITLE_BAR_ROW_CLASS}
            logo={
              titleBarBrand != null ? (
                titleBarBrand
              ) : (
                <EdgeLogoWithEasterEgg behavior="goLounge" className={logoClassName} />
              )
            }
            centerSlot={titleBarCenterSlot}
            navSlot={
              <>
                <TitleBarStatusLine />
                {titleBarNavSlot}
              </>
            }
          />
        </div>
      )}

      {showPullTab ? (
        <div
          className="pointer-events-none fixed left-1/2 z-[51] flex -translate-x-1/2 flex-col items-center"
          style={{ top: feedViewportTopPx }}
        >
          <button
            type="button"
            data-edge-title-pull-tab
            aria-label="Show title bar"
            onPointerDown={onTabPointerDown}
            onPointerMove={onTabPointerMove}
            onPointerUp={onTabPointerUp}
            onPointerCancel={onTabPointerUp}
            className="pointer-events-auto flex h-6 w-20 touch-none items-start justify-center pt-1.5 [-webkit-tap-highlight-color:transparent]"
          >
            <span className="block h-[5px] w-10 rounded-full bg-zinc-500/80" />
          </button>
          {tuckHint && !tabDragging ? (
            <span
              data-edge-title-pull-hint
              className="-mt-1 rounded-full border border-zinc-700 bg-zinc-900/95 px-2 py-0.5 text-[10px] font-semibold text-zinc-300"
            >
              Pull down for menu
            </span>
          ) : null}
        </div>
      ) : null}

      <div
        ref={feedScrollRef}
        data-edge-scroll-shell
        className={
          fillViewport
            ? 'flex min-h-0 flex-1 flex-col overflow-hidden bg-zinc-950'
            : 'min-h-0 flex-1 overflow-y-auto overscroll-y-contain bg-zinc-950 [-webkit-overflow-scrolling:touch]'
        }
      >
        {hideFixedTitleBar ? null : (
          <div
            aria-hidden
            className="shrink-0"
            style={{ height: titleBarHeight > 0 ? titleBarHeight : 56 }}
          />
        )}

        <div
          className={
            fillViewport
              ? `${contentClassName} flex min-h-0 flex-1 flex-col overflow-hidden`
              : contentClassName
          }
        >
          {children}
        </div>
      </div>
    </div>
  )
}
