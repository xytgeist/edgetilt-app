import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef } from 'react'

const PEEK_PX = 24
const SLIDE_GAP_PX = 8

/** Shared box model so personal + stake hero cards match in the peek carousel. */
export const POKER_BANKROLL_HERO_SHELL =
  'rounded-3xl border-2 px-6 pt-5 pb-3 shadow-none'

/**
 * Horizontal peek carousel for Personal + stake bankroll hero cards.
 * @param {{ slides: Array<{ id: string }>, activeId: string, onActiveIdChange: (id: string) => void, renderSlide: (slide: { id: string }, index: number) => import('react').ReactNode, activeSyncEnabled?: boolean }} props
 */
const PokerBankrollHeroCarousel = forwardRef(function PokerBankrollHeroCarousel(
  {
    slides,
    activeId,
    onActiveIdChange,
    renderSlide,
    /** When false, ignore scroll→selection (e.g. while Bankroll restores last card). */
    activeSyncEnabled = true,
  },
  ref,
) {
  const scrollerRef = useRef(null)
  const slideRefs = useRef(/** @type {(HTMLElement | null)[]} */ ([]))
  const ignoreScrollRef = useRef(false)
  const visibleIdRef = useRef(activeId)

  const foundIndex = slides.findIndex((s) => s.id === activeId)
  const activeIndex = Math.max(0, foundIndex)

  const readCenteredSlideId = useCallback(() => {
    const scroller = scrollerRef.current
    if (!scroller || !slides.length) return activeId
    if (slides.length <= 1) return slides[0]?.id || activeId
    const left = scroller.scrollLeft + PEEK_PX + 24
    let bestIdx = 0
    let bestDist = Infinity
    let measured = 0
    slideRefs.current.forEach((el, idx) => {
      if (!el) return
      measured += 1
      const dist = Math.abs(el.offsetLeft - left)
      if (dist < bestDist) {
        bestDist = dist
        bestIdx = idx
      }
    })
    // Unmounted refs used to fall through to slide 0 (Personal) and steal stake writes.
    if (measured === 0) return activeId
    return slides[bestIdx]?.id || activeId
  }, [slides, activeId])

  useImperativeHandle(
    ref,
    () => ({
      /** Centered hero card id (personal or deal), even if scroll→state debounce has not fired. */
      getVisibleSlideId: () => {
        const centered = readCenteredSlideId()
        if (centered) visibleIdRef.current = centered
        return visibleIdRef.current || activeId
      },
      /** True while programmatic restore/snap scroll is ignoring user scroll→scope. */
      isIgnoringScroll: () => ignoreScrollRef.current === true,
    }),
    [readCenteredSlideId, activeId],
  )

  useEffect(() => {
    visibleIdRef.current = activeId
  }, [activeId])

  const scrollToIndex = useCallback((index, smooth = true) => {
    const el = slideRefs.current[index]
    const scroller = scrollerRef.current
    if (!el || !scroller) return
    ignoreScrollRef.current = true
    scroller.scrollTo({
      left: el.offsetLeft - PEEK_PX,
      behavior: smooth ? 'smooth' : 'auto',
    })
    // Keep ignore armed long enough for WebKit async scroll events after behavior:auto.
    window.setTimeout(() => {
      ignoreScrollRef.current = false
    }, smooth ? 320 : 250)
  }, [])

  // Archived / removed deal ids must not silently clamp to slide 0 (Personal) while
  // parent scope still filters sessions for the missing stake.
  useEffect(() => {
    if (!slides.length) return
    if (foundIndex >= 0) return
    const fallback = slides.some((s) => s.id === 'personal') ? 'personal' : slides[0]?.id
    if (fallback && fallback !== activeId) onActiveIdChange(fallback)
  }, [slides, foundIndex, activeId, onActiveIdChange])

  useEffect(() => {
    scrollToIndex(activeIndex, false)
  }, [activeIndex, scrollToIndex, slides.length])

  useEffect(() => {
    const scroller = scrollerRef.current
    if (!scroller || slides.length <= 1 || !activeSyncEnabled) return undefined

    let t = 0
    const onScroll = () => {
      if (ignoreScrollRef.current) return
      window.clearTimeout(t)
      t = window.setTimeout(() => {
        const nextId = readCenteredSlideId()
        if (nextId) visibleIdRef.current = nextId
        if (nextId && nextId !== activeId) onActiveIdChange(nextId)
      }, 80)
    }
    scroller.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      window.clearTimeout(t)
      scroller.removeEventListener('scroll', onScroll)
    }
  }, [slides, activeId, onActiveIdChange, activeSyncEnabled, readCenteredSlideId])

  if (slides.length <= 1) {
    return <div className="mb-4">{renderSlide(slides[0], 0)}</div>
  }

  return (
    <div data-poker-bankroll-carousel className="mb-4 -mx-3">
      <div
        ref={scrollerRef}
        className="flex snap-x snap-mandatory overflow-x-auto overflow-y-visible px-3 pb-1 no-scrollbar"
        style={{
          scrollPaddingLeft: PEEK_PX,
          gap: SLIDE_GAP_PX,
          WebkitOverflowScrolling: 'touch',
        }}
      >
        {slides.map((slide, index) => (
          <div
            key={slide.id}
            ref={(el) => {
              slideRefs.current[index] = el
            }}
            className="snap-start shrink-0"
            style={{
              width: `calc(100% - ${PEEK_PX}px)`,
              flexBasis: `calc(100% - ${PEEK_PX}px)`,
            }}
          >
            {renderSlide(slide, index)}
          </div>
        ))}
      </div>
    </div>
  )
})

export default PokerBankrollHeroCarousel

/** Oldest stake = 0, next = 1, … stable even when carousel order changes. */
export function stakeHeroThemeIndexForDeal(dealId, stakeeDeals = []) {
  if (!dealId || dealId === 'personal') return 0
  const sorted = [...stakeeDeals].sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
  )
  const idx = sorted.findIndex((d) => d.id === dealId)
  return idx >= 0 ? idx : 0
}

/** Stake hero accent variants (rotate per deal index). blue / emerald / rose. */
export function stakeHeroTheme(stakeIndex) {
  const themes = [
    {
      tone: 'blue',
      card: `${POKER_BANKROLL_HERO_SHELL} border-blue-400/60 bg-gradient-to-br from-blue-950 via-blue-900/70 to-zinc-950 shadow-[0_0_36px_-12px_rgba(37,99,235,0.45)]`,
      label: 'text-blue-200/70',
      title: 'text-blue-100',
      badge: 'bg-blue-400 text-blue-950',
      badgeText: 'text-blue-200/90',
      amount: 'text-blue-50',
      borderStat: 'border-blue-400/25',
    },
    {
      tone: 'emerald',
      card: `${POKER_BANKROLL_HERO_SHELL} border-emerald-400/70 bg-gradient-to-br from-emerald-950 via-emerald-900/80 to-zinc-950 shadow-[0_0_40px_-12px_rgba(16,185,129,0.55)]`,
      label: 'text-emerald-200/70',
      title: 'text-emerald-100',
      badge: 'bg-emerald-400 text-emerald-950',
      badgeText: 'text-emerald-200/90',
      amount: 'text-emerald-50',
      borderStat: 'border-emerald-400/25',
    },
    {
      tone: 'rose',
      card: `${POKER_BANKROLL_HERO_SHELL} border-rose-400/55 bg-gradient-to-br from-rose-950 via-rose-900/60 to-zinc-950 shadow-[0_0_36px_-12px_rgba(251,113,133,0.4)]`,
      label: 'text-rose-200/70',
      title: 'text-rose-100',
      badge: 'bg-rose-400 text-rose-950',
      badgeText: 'text-rose-200/90',
      amount: 'text-rose-50',
      borderStat: 'border-rose-400/25',
    },
  ]
  return themes[stakeIndex % themes.length]
}
