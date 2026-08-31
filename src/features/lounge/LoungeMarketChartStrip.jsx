import LoungeMarketChartMini from './LoungeMarketChartMini.jsx'
import {
  buildMarketStripCompareLabel,
  marketEmbedCacheKey,
  normalizeMarketEmbeds,
} from '../../utils/loungeMarketCaptionParse.js'
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
  const compareLabel = multi ? buildMarketStripCompareLabel(embeds, quotes) : ''

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
      <div
        className={
          multi
            ? 'w-full max-w-full overflow-x-auto overscroll-x-contain snap-x snap-mandatory [-webkit-overflow-scrolling:touch] [touch-action:pan-x_pan-y] [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden'
            : 'w-full'
        }
      >
        <div className={multi ? 'flex w-full min-w-full gap-2' : 'w-full'}>
          {embeds.map((embed) => {
            const key = marketEmbedCacheKey(embed)
            return (
              <div
                key={`${embed.symbol}-${embed.window_key}-${embed.kind}`}
                className={
                  multi
                    ? 'relative w-full min-w-full max-w-full shrink-0 snap-start'
                    : 'relative w-full max-w-full'
                }
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
    </div>
  )
}
