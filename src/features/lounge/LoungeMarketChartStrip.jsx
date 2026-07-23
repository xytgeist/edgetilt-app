import LoungeMarketChartMini from './LoungeMarketChartMini.jsx'
import { marketEmbedCacheKey, normalizeMarketEmbeds } from '../../utils/loungeMarketCaptionParse.js'
import {
  LOUNGE_FEED_ATTACHMENT_COLUMN_CLASS,
  LOUNGE_FEED_MARKET_MINI_SINGLE_CLASS,
  LOUNGE_FEED_MARKET_MINI_SNAP_SLIDE_CLASS,
} from './loungeFeedAvatar.js'
import { useLoungeMarketFeedQuotes } from './LoungeMarketFeedContext.jsx'

/**
 * @param {{ post: object, onOpenChart?: (embed: object, allEmbeds: object[]) => void, className?: string }} props
 */
export default function LoungeMarketChartStrip({ post, onOpenChart, className = '' }) {
  const embeds = normalizeMarketEmbeds(post?.market_embeds)
  const { quotes } = useLoungeMarketFeedQuotes()
  if (!embeds.length) return null

  const multi = embeds.length > 1

  return (
    <div
      className={`mt-2 ${LOUNGE_FEED_ATTACHMENT_COLUMN_CLASS} ${
        multi
          ? 'overflow-x-auto overscroll-x-contain snap-x snap-mandatory [-webkit-overflow-scrolling:touch] [touch-action:pan-x_pan-y] [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden'
          : ''
      } ${className}`}
      data-lounge-market-chart-strip
    >
      <div className={multi ? 'flex w-full' : 'w-full'}>
        {embeds.map((embed) => {
          const key = marketEmbedCacheKey(embed)
          return (
            <LoungeMarketChartMini
              key={`${embed.symbol}-${embed.window_key}-${embed.kind}`}
              embed={embed}
              rollingLive={embed.kind === 'rolling' ? quotes[key] : null}
              onOpen={() => onOpenChart?.(embed, embeds)}
              className={
                multi
                  ? `${LOUNGE_FEED_MARKET_MINI_SNAP_SLIDE_CLASS} ${LOUNGE_FEED_MARKET_MINI_SINGLE_CLASS}`
                  : LOUNGE_FEED_MARKET_MINI_SINGLE_CLASS
              }
            />
          )
        })}
      </div>
    </div>
  )
}
