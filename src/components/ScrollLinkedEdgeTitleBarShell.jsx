import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import EdgeLogoWithEasterEgg from './EdgeLogoWithEasterEgg.jsx'
import TitleBarStatusLine from './TitleBarStatusLine.jsx'
import PwaInstallTitleBarRow from './PwaInstallBanner.jsx'
import { LOUNGE_FEED_TITLE_BAR_ROW_CLASS } from '../features/lounge/loungeFeedAvatar.js'
import { useQuickLinkIds } from '../features/shell/quickLinksStore.js'
import { edgeLogoTitleBarClassName } from '../features/shell/titleBarLayout.js'
import { setEdgeTitleBarReveal } from '../features/shell/edgeTitleBarRevealStore.js'

/**
 * Fixed EDGE title bar + scroll-linked hide/show - same chrome and tuning as
 * `SocialFeed.jsx` / Guides (no composer coupling).
 *
 * @param {React.ReactNode} titleBarNavSlot - hamburger / shell menu (right).
 * @param {React.ReactNode} children - scrollable body (placed inside padded column).
 * @param {string} [contentClassName] - inner wrapper classes. Default adds horizontal padding + bottom inset for FAB / thumb clearance **including** `env(safe-area-inset-bottom)` inside the scroller (no dead strip under the scroll viewport).
 * @param {boolean} [fullWidth=false] - use full viewport width for column + fixed bar (e.g. Offers week landscape).
 */
const defaultShellContentClassName = 'px-3 pb-[calc(6rem+env(safe-area-inset-bottom,0px))]'

export default function ScrollLinkedEdgeTitleBarShell({
  titleBarNavSlot = null,
  /** Slot tool × in nav cluster - reserve logo width (matches `titleBarLayout.toolCloseVisible`). */
  titleBarToolCloseVisible = false,
  /** Publish scroll-linked reveal for the portaled lounge dock on other tabs. */
  publishScrollReveal = true,
  children,
  contentClassName = defaultShellContentClassName,
  fullWidth = false,
}) {
  const colMax = fullWidth ? 'max-w-none' : 'max-w-2xl'
  const feedScrollRef = useRef(null)
  const titleBarRef = useRef(null)
  const scrollPrevTopRef = useRef(0)
  const titleRevealRef = useRef(1)
  const scrollVisualRafRef = useRef(0)
  const [titleBarHeight, setTitleBarHeight] = useState(0)
  const [titleReveal, setTitleReveal] = useState(1)
  const [feedViewportTopPx, setFeedViewportTopPx] = useState(0)
  const quickLinkIds = useQuickLinkIds()
  const logoClassName = edgeLogoTitleBarClassName(quickLinkIds.length, {
    toolCloseVisible: titleBarToolCloseVisible,
  })

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
  }, [])

  useEffect(() => {
    if (!publishScrollReveal) return undefined
    setEdgeTitleBarReveal(titleReveal)
    return () => setEdgeTitleBarReveal(1)
  }, [publishScrollReveal, titleReveal])

  return (
    <div
      data-edge-scroll-shell
      className={`mx-auto flex h-dvh max-h-dvh min-h-0 w-full ${colMax} flex-col overflow-hidden bg-zinc-950 pt-[max(0px,env(safe-area-inset-top))]`}
    >
      <div
        ref={titleBarRef}
        data-edge-scroll-shell
        className={`fixed left-1/2 z-[50] w-full ${colMax} border-b border-zinc-800/95 bg-zinc-950/95 backdrop-blur supports-[backdrop-filter]:bg-zinc-950/85 shadow-[0_1px_0_rgba(0,0,0,0.22)] will-change-transform`}
        style={{
          top: feedViewportTopPx,
          transform: `translate3d(-50%, ${-(1 - titleReveal) * (titleBarHeight > 0 ? titleBarHeight : 56)}px, 0)`,
          pointerEvents: titleReveal > 0.12 ? 'auto' : 'none',
        }}
      >
        <PwaInstallTitleBarRow
          rowClassName={LOUNGE_FEED_TITLE_BAR_ROW_CLASS}
          logo={<EdgeLogoWithEasterEgg className={logoClassName} />}
          navSlot={
            <>
              <TitleBarStatusLine />
              {titleBarNavSlot}
            </>
          }
        />
      </div>

      <div
        ref={feedScrollRef}
        data-edge-scroll-shell
        className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain bg-zinc-950 [-webkit-overflow-scrolling:touch]"
      >
        <div
          aria-hidden
          className="shrink-0"
          style={{ height: titleBarHeight > 0 ? titleBarHeight : 56 }}
        />

        <div className={contentClassName}>{children}</div>
      </div>
    </div>
  )
}
