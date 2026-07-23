import LoungeMarketChartMini from './LoungeMarketChartMini.jsx'
import { marketEmbedCacheKey, normalizeMarketEmbeds } from '../../utils/loungeMarketCaptionParse.js'
import {
  LOUNGE_FEED_ATTACHMENT_COLUMN_CLASS,
  LOUNGE_FEED_ATTACHMENT_SINGLE_ROW_CLASS,
  LOUNGE_FEED_MARKET_MINI_MULTI_CLASS,
} from './loungeFeedAvatar.js'
import { useLoungeMarketFeedQuotes } from './LoungeMarketFeedContext.jsx'

/**
 * @param {{ post: object, onOpenChart?: (embed: object, allEmbeds: object[]) => void, className?: string }} props
 */
export default function LoungeMarketChartStrip({ post, onOpenChart, className = '' }) {
  const embeds = normalizeMarketEmbeds(post?.market_embeds)
  const { quotes } = useLoungeMarketFeedQuotes()
  if (!embeds.length) return null

  const single = embeds.length === 1

  return (
    <div
      className={`mt-2 ${LOUNGE_FEED_ATTACHMENT_COLUMN_CLASS} ${
        single
          ? ''
          : '-mx-1 overflow-x-auto overscroll-x-contain [-webkit-overflow-scrolling:touch] [touch-action:pan-x_pan-y] [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden'
      } ${className}`}
      data-lounge-market-chart-strip
    >
      <div
        className={
          single
            ? LOUNGE_FEED_ATTACHMENT_SINGLE_ROW_CLASS
            : 'flex w-max max-w-full snap-x snap-mandatory gap-2.5 px-1 pb-0.5'
        }
      >
        {embeds.map((embed) => {
          const key = marketEmbedCacheKey(embed)
          return (
            <LoungeMarketChartMini
              key={`${embed.symbol}-${embed.window_key}-${embed.kind}`}
              embed={embed}
              rollingLive={embed.kind === 'rolling' ? quotes[key] : null}
              onOpen={() => onOpenChart?.(embed, embeds)}
              className={
                single ? `${LOUNGE_FEED_ATTACHMENT_SINGLE_ROW_CLASS} max-w-none` : LOUNGE_FEED_MARKET_MINI_MULTI_CLASS
              }
            />
          )
        })}
      </div>
    </div>
  )
}
