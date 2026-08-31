import LoungeMarketChartMini from './LoungeMarketChartMini.jsx'
import { composerMarketRowEmbed } from './loungeComposerMarketEmbed.js'
import { marketSymbolDedupeKey } from './loungeMarketSymbolUtils.js'
import { LOUNGE_MARKET_EMBED_MAX } from '../../utils/loungeMarketCaptionParse.js'
import {
  LOUNGE_COMPOSER_MARKET_MINI_MULTI_CLASS,
  LOUNGE_COMPOSER_MARKET_MINI_SINGLE_CLASS,
} from './loungeFeedAvatar.js'

/**
 * X-style horizontal mini chart row under the composer caption (picker selections only).
 *
 * @param {{
 *   symbols: object[],
 *   onChange: (next: object[]) => void,
 *   onOpenChart?: (embed: object, allEmbeds: object[]) => void,
 *   className?: string,
 * }} props
 */
export default function LoungeComposerMarketChartStrip({
  symbols,
  onChange,
  onOpenChart,
  className = '',
}) {
  const list = Array.isArray(symbols) ? symbols : []
  if (!list.length) return null

  const embeds = list.map((row) => composerMarketRowEmbed(row)).filter(Boolean)
  const multi = list.length > 1
  const miniWidthClass = multi
    ? LOUNGE_COMPOSER_MARKET_MINI_MULTI_CLASS
    : LOUNGE_COMPOSER_MARKET_MINI_SINGLE_CLASS

  return (
    <div className={`mt-2 ${className}`} data-lounge-composer-market-chart-strip="">
      <div
        className={
          multi
            ? 'overflow-x-auto overscroll-x-contain snap-x snap-mandatory [-webkit-overflow-scrolling:touch] [touch-action:pan-x_pan-y] [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden'
            : undefined
        }
      >
        <div className={multi ? 'flex w-full min-w-full gap-2' : undefined}>
          {list.map((row) => {
            const key = marketSymbolDedupeKey(row)
            const embed = composerMarketRowEmbed(row)
            const ticker = String(row?.display_symbol || row?.symbol || '').trim().toUpperCase()

            return (
              <div
                key={key}
                className={
                  multi
                    ? 'relative w-full min-w-full max-w-full shrink-0 snap-start'
                    : 'relative w-full max-w-full shrink-0'
                }
              >
                {embed ? (
                  <LoungeMarketChartMini
                    embed={embed}
                    className="w-full max-w-full"
                    onOpen={() => onOpenChart?.(embed, embeds)}
                  />
                ) : (
                  <div
                    className="flex h-[3.5rem] w-full max-w-full items-center gap-2 rounded-2xl border border-zinc-700/60 bg-zinc-900/80 px-2.5 py-0.5"
                    aria-busy="true"
                  >
                    <div className="h-7 w-7 shrink-0 animate-pulse rounded-full bg-zinc-800" />
                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="h-[14px] w-24 animate-pulse rounded bg-zinc-800" />
                      <div className="h-3 w-32 animate-pulse rounded bg-zinc-800/80" />
                    </div>
                    <div className="h-[32px] w-[5.5rem] shrink-0 animate-pulse rounded-lg bg-zinc-800/70" />
                  </div>
                )}
                <button
                  type="button"
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={(e) => {
                    e.stopPropagation()
                    onChange(list.filter((s) => marketSymbolDedupeKey(s) !== key))
                  }}
                  className="absolute left-2 top-2 z-10 flex h-6 w-6 touch-manipulation items-center justify-center rounded-full border border-zinc-600/80 bg-zinc-800/95 text-[13px] font-bold leading-none text-zinc-200 shadow-md hover:bg-zinc-700 active:bg-zinc-600 [-webkit-tap-highlight-color:transparent]"
                  aria-label={ticker ? `Remove ${ticker} chart` : 'Remove chart'}
                >
                  ×
                </button>
              </div>
            )
          })}
        </div>
      </div>
      {list.length >= LOUNGE_MARKET_EMBED_MAX ? (
        <p className="mt-1 text-[11px] text-zinc-500">Max {LOUNGE_MARKET_EMBED_MAX} charts per post.</p>
      ) : null}
    </div>
  )
}
