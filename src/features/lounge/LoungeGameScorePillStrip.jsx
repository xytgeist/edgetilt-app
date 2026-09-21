import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import LoungeGameScorePill from './LoungeGameScorePill.jsx'
import { useLoungeSportsFeed } from './LoungeSportsFeedContext.jsx'
import { LOUNGE_FEED_ATTACHMENT_COLUMN_CLASS } from './loungeFeedAvatar.js'
import {
  bindLoungeFeedCarouselMeasure,
  loungeFeedCarouselFullBleed,
  loungeFeedCarouselMeasureLayout,
} from './loungeFeedImageAttachment.js'
import { useLoungeFeedCarouselAxisLock } from './useLoungeFeedCarouselAxisLock.js'

/**
 * Feed / detail sports cards. Pin-only (via context `gamesForPost`). Multi = minichart carousel.
 *
 * @param {{ post: object, className?: string, variant?: string }} props
 */
export default function LoungeGameScorePillStrip({ post, className = '', variant = 'feed' }) {
  const sports = useLoungeSportsFeed()
  const games = sports?.gamesForPost?.(post) || []
  const carouselScrollRef = useRef(null)
  const [carouselViewport, setCarouselViewport] = useState(() =>
    loungeFeedCarouselMeasureLayout(null, false),
  )
  // Hub portal can leave WebKit with a stuck pill layer / slide width after back.
  const hubOpen = Boolean(sports?.hubGame)
  const wasHubOpenRef = useRef(false)
  const [hubPaintEpoch, setHubPaintEpoch] = useState(0)
  useEffect(() => {
    if (wasHubOpenRef.current && !hubOpen) setHubPaintEpoch((n) => n + 1)
    wasHubOpenRef.current = hubOpen
  }, [hubOpen])

  const multi = games.length > 1
  const carouselFullBleed = multi && loungeFeedCarouselFullBleed(variant)

  useLoungeFeedCarouselAxisLock(carouselScrollRef, multi)

  useLayoutEffect(() => {
    if (!multi) return undefined
    const el = carouselScrollRef.current
    if (!el) return undefined
    const reset = () => {
      el.scrollLeft = 0
      try {
        el.scrollTo({ left: 0, behavior: 'instant' })
      } catch {
        // ignore
      }
    }
    reset()
    const id0 = requestAnimationFrame(reset)
    const id1 = requestAnimationFrame(reset)
    return () => {
      cancelAnimationFrame(id0)
      cancelAnimationFrame(id1)
    }
  }, [games.length, multi, hubPaintEpoch])

  useLayoutEffect(() => {
    if (!multi) return undefined
    // Landscape split is detected live in measure so feed cards re-cap when the pane opens.
    return bindLoungeFeedCarouselMeasure(carouselScrollRef.current, carouselFullBleed, (next) => {
      setCarouselViewport((prev) =>
        prev.contentWidthPx === next.contentWidthPx &&
        prev.firstSlideMaxWidthPx === next.firstSlideMaxWidthPx &&
        prev.maxRowPx === next.maxRowPx
          ? prev
          : next,
      )
    }, {
      pairOnIpadLandscape: variant !== 'detail',
      phoneSlideCap: variant === 'detail',
    })
  }, [multi, carouselFullBleed, games.length, variant, hubPaintEpoch])

  if (!games.length) return null

  const slideWidthStyle =
    multi && carouselViewport.firstSlideMaxWidthPx
      ? {
          width: carouselViewport.firstSlideMaxWidthPx,
          minWidth: carouselViewport.firstSlideMaxWidthPx,
          maxWidth: carouselViewport.firstSlideMaxWidthPx,
        }
      : undefined

  const carouselTrack = (
    <div
      ref={carouselScrollRef}
      {...(multi ? { 'data-lounge-feed-horizontal-scroll': true } : null)}
      className={
        multi
          ? 'max-w-full overflow-x-auto overflow-y-hidden overscroll-x-contain [-webkit-overflow-scrolling:touch] [overflow-anchor:none] [touch-action:pan-x_pan-y] [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden'
          : 'w-full'
      }
      role={multi ? 'region' : undefined}
      aria-label={multi ? 'Game score cards' : undefined}
    >
      <div
        {...(multi ? { 'data-lounge-feed-carousel-track': true } : null)}
        className={multi ? 'flex flex-nowrap items-stretch gap-2' : 'w-full'}
      >
        {games.map((game) => (
          <div
            key={`${String(game.id)}-${hubPaintEpoch}`}
            className={multi ? 'relative shrink-0' : 'relative w-full max-w-full'}
            style={slideWidthStyle}
            {...(carouselFullBleed ? { 'data-lounge-feed-carousel-slide': true } : null)}
          >
            <LoungeGameScorePill game={game} className="mt-0" />
          </div>
        ))}
      </div>
    </div>
  )

  return (
    <div
      className={`mt-2 ${LOUNGE_FEED_ATTACHMENT_COLUMN_CLASS} ${className}`.trim()}
      data-lounge-game-score-pill-strip
    >
      {carouselFullBleed ? (
        <div data-lounge-feed-carousel-bleed>{carouselTrack}</div>
      ) : (
        carouselTrack
      )}
    </div>
  )
}
