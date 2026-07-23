import LoungeMarketChartMini from './LoungeMarketChartMini.jsx'
import { marketEmbedCacheKey, normalizeMarketEmbeds } from '../../utils/loungeMarketCaptionParse.js'
import { useLoungeMarketFeedQuotes } from './LoungeMarketFeedContext.jsx'

/**
 * @param {{ post: object, onOpenChart?: (embed: object, allEmbeds: object[]) => void, className?: string }} props
 */
export default function LoungeMarketChartStrip({ post, onOpenChart, className = '' }) {
  const embeds = normalizeMarketEmbeds(post?.market_embeds)
  const { quotes } = useLoungeMarketFeedQuotes()
  if (!embeds.length) return null

  return (
    <div
      className={`mt-2 -mx-1 min-w-0 max-w-full overflow-x-auto overscroll-x-contain [-webkit-overflow-scrolling:touch] [touch-action:pan-x_pan-y] [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden ${className}`}
    >
      <div className="flex w-max max-w-full snap-x snap-mandatory gap-2.5 px-1 pb-0.5">
        {embeds.map((embed) => {
          const key = marketEmbedCacheKey(embed)
          return (
            <LoungeMarketChartMini
              key={`${embed.symbol}-${embed.window_key}-${embed.kind}`}
              embed={embed}
              rollingLive={embed.kind === 'rolling' ? quotes[key] : null}
              onOpen={() => onOpenChart?.(embed, embeds)}
              className="w-[min(100%,22rem)] shrink-0 snap-start sm:w-[22rem]"
            />
          )
        })}
      </div>
    </div>
  )
}
