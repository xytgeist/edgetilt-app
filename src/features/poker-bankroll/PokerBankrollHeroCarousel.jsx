import { useCallback, useEffect, useRef } from 'react'

const PEEK_PX = 44
const SLIDE_GAP_PX = 8

/**
 * Horizontal peek carousel for Personal + stake bankroll hero cards.
 * @param {{ slides: Array<{ id: string }>, activeId: string, onActiveIdChange: (id: string) => void, renderSlide: (slide: { id: string }, index: number) => import('react').ReactNode }} props
 */
export default function PokerBankrollHeroCarousel({
  slides,
  activeId,
  onActiveIdChange,
  renderSlide,
}) {
  const scrollerRef = useRef(null)
  const slideRefs = useRef(/** @type {(HTMLElement | null)[]} */ ([]))
  const ignoreScrollRef = useRef(false)

  const activeIndex = Math.max(
    0,
    slides.findIndex((s) => s.id === activeId),
  )

  const scrollToIndex = useCallback((index, smooth = true) => {
    const el = slideRefs.current[index]
    const scroller = scrollerRef.current
    if (!el || !scroller) return
    ignoreScrollRef.current = true
    scroller.scrollTo({
      left: el.offsetLeft - PEEK_PX,
      behavior: smooth ? 'smooth' : 'auto',
    })
    window.setTimeout(() => {
      ignoreScrollRef.current = false
    }, smooth ? 320 : 0)
  }, [])

  useEffect(() => {
    scrollToIndex(activeIndex, false)
  }, [activeIndex, scrollToIndex, slides.length])

  useEffect(() => {
    const scroller = scrollerRef.current
    if (!scroller || slides.length <= 1) return undefined

    let t = 0
    const onScroll = () => {
      if (ignoreScrollRef.current) return
      window.clearTimeout(t)
      t = window.setTimeout(() => {
        const left = scroller.scrollLeft + PEEK_PX + 24
        let bestIdx = 0
        let bestDist = Infinity
        slideRefs.current.forEach((el, idx) => {
          if (!el) return
          const dist = Math.abs(el.offsetLeft - left)
          if (dist < bestDist) {
            bestDist = dist
            bestIdx = idx
          }
        })
        const next = slides[bestIdx]
        if (next && next.id !== activeId) onActiveIdChange(next.id)
      }, 80)
    }
    scroller.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      window.clearTimeout(t)
      scroller.removeEventListener('scroll', onScroll)
    }
  }, [slides, activeId, onActiveIdChange])

  if (slides.length <= 1) {
    return <div className="mb-4">{renderSlide(slides[0], 0)}</div>
  }

  return (
    <div data-poker-bankroll-carousel className="mb-4 -mx-3">
      <div
        ref={scrollerRef}
        className="flex snap-x snap-mandatory items-stretch overflow-x-auto overflow-y-visible px-3 pb-1 no-scrollbar"
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
            className="flex snap-start shrink-0 flex-col"
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
}

/** Stake hero accent variants (rotate per deal index). */
export function stakeHeroTheme(stakeIndex) {
  const themes = [
    {
      card: 'rounded-3xl border-2 border-amber-400/70 bg-gradient-to-br from-amber-950 via-amber-900/80 to-zinc-950 p-6 shadow-[0_0_40px_-12px_rgba(251,191,36,0.55)]',
      label: 'text-amber-200/70',
      badge: 'bg-amber-400 text-amber-950',
      badgeText: 'text-amber-200/90',
      amount: 'text-amber-50',
      editBtn: 'bg-amber-500/25 text-amber-100 active:bg-amber-500/40',
      borderStat: 'border-amber-400/25',
      sparkUp: 'text-amber-400',
      sparkDown: 'text-amber-500',
    },
    {
      card: 'rounded-3xl border-2 border-orange-400/60 bg-gradient-to-br from-orange-950 via-orange-900/70 to-zinc-950 p-6 shadow-[0_0_36px_-12px_rgba(251,146,60,0.45)]',
      label: 'text-orange-200/70',
      badge: 'bg-orange-400 text-orange-950',
      badgeText: 'text-orange-200/90',
      amount: 'text-orange-50',
      editBtn: 'bg-orange-500/25 text-orange-100 active:bg-orange-500/40',
      borderStat: 'border-orange-400/25',
      sparkUp: 'text-orange-400',
      sparkDown: 'text-orange-500',
    },
    {
      card: 'rounded-3xl border-2 border-rose-400/55 bg-gradient-to-br from-rose-950 via-rose-900/60 to-zinc-950 p-6 shadow-[0_0_36px_-12px_rgba(251,113,133,0.4)]',
      label: 'text-rose-200/70',
      badge: 'bg-rose-400 text-rose-950',
      badgeText: 'text-rose-200/90',
      amount: 'text-rose-50',
      editBtn: 'bg-rose-500/25 text-rose-100 active:bg-rose-500/40',
      borderStat: 'border-rose-400/25',
      sparkUp: 'text-rose-400',
      sparkDown: 'text-rose-500',
    },
  ]
  return themes[stakeIndex % themes.length]
}
