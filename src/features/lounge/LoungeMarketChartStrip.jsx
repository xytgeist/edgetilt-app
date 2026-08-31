import { useLayoutEffect, useRef, useState } from 'react'
import LoungeMarketChartMini from './LoungeMarketChartMini.jsx'
import {
  buildMarketStripCompareLabel,
  marketEmbedCacheKey,
  normalizeMarketEmbeds,
} from '../../utils/loungeMarketCaptionParse.js'
import { LOUNGE_FEED_ATTACHMENT_COLUMN_CLASS } from './loungeFeedAvatar.js'
import {
  loungeFeedCarouselFullBleed,
  loungeFeedCarouselMeasureLayout,
} from './loungeFeedImageAttachment.js'
import { useLoungeMarketFeedQuotes } from './LoungeMarketFeedContext.jsx'

/**
 * @param {{ post: object, onOpenChart?: (embed: object, allEmbeds: object[]) => void, className?: string, variant?: string }} props
 */
export default function LoungeMarketChartStrip({ post, onOpenChart, className = '', variant = 'feed' }) {
  const embeds = normalizeMarketEmbeds(post?.market_embeds)
  const { quotes } = useLoungeMarketFeedQuotes()
  const carouselScrollRef = useRef(null)
  const [carouselViewport, setCarouselViewport] = useState(() =>
    loungeFeedCarouselMeasureLayout(null, false),
  )

  const multi = embeds.length > 1
  const carouselFullBleed = multi && loungeFeedCarouselFullBleed(variant)

  useLayoutEffect(() => {
    if (!multi) return undefined
    const syncViewport = () => {
      setCarouselViewport(
        loungeFeedCarouselMeasureLayout(carouselScrollRef.current, carouselFullBleed),
      )
    }
    syncViewport()
    const id = requestAnimationFrame(syncViewport)
    window.addEventListener('resize', syncViewport, { passive: true })
    return () => {
      cancelAnimationFrame(id)
      window.removeEventListener('resize', syncViewport)
    }
  }, [multi, carouselFullBleed, embeds.length])

  if (!embeds.length) return null

  const compareLabel = multi ? buildMarketStripCompareLabel(embeds, quotes) : ''

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
          ? 'max-w-full overflow-x-auto overflow-y-hidden overscroll-x-contain [-webkit-overflow-scrolling:touch] [overflow-anchor:none] [touch-action:pan-x_pan-y] snap-x snap-mandatory [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden'
          : 'w-full'
      }
      role={multi ? 'region' : undefined}
      aria-label={multi ? 'Market charts' : undefined}
    >
      <div
        {...(multi ? { 'data-lounge-feed-carousel-track': true } : null)}
        className={multi ? 'flex flex-nowrap items-stretch gap-2' : 'w-full'}
      >
        {embeds.map((embed) => {
          const key = marketEmbedCacheKey(embed)
          return (
            <div
              key={`${embed.symbol}-${embed.window_key}-${embed.kind}`}
              className={
                multi
                  ? 'relative shrink-0 snap-start'
                  : 'relative w-full max-w-full'
              }
              style={slideWidthStyle}
              {...(carouselFullBleed ? { 'data-lounge-feed-carousel-slide': true } : null)}
            >
              <LoungeMarketChartMini
                embed={embed}
                rollingLive={embed.kind === 'rolling' ? quotes[key] : null}
                compareMode={multi}
                onOpen={() => onOpenChart?.(embed, embeds)}
                className="w-full max-w-full"
              />
            </div>
          )
        })}
      </div>
    </div>
  )

  return (
    <div
      className={`mt-2 ${LOUNGE_FEED_ATTACHMENT_COLUMN_CLASS} ${className}`}
      data-lounge-market-chart-strip
    >
      {compareLabel ? (
        <div
          className="mb-1.5 truncate px-0.5 text-[11px] font-semibold leading-snug text-zinc-400"
          data-lounge-market-chart-compare
        >
          {compareLabel}
        </div>
      ) : null}
      {carouselFullBleed ? (
        <div data-lounge-feed-carousel-bleed>{carouselTrack}</div>
      ) : (
        carouselTrack
      )}
    </div>
  )
}
