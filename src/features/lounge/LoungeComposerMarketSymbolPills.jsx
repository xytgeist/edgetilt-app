import { LOUNGE_MARKET_EMBED_MAX } from '../../utils/loungeMarketCaptionParse.js'
import { marketSymbolDedupeKey } from './loungeMarketSymbolUtils.js'

/**
 * @param {{
 *   symbols: object[],
 *   onChange: (next: object[]) => void,
 *   className?: string,
 * }} props
 */
export default function LoungeComposerMarketSymbolPills({ symbols, onChange, className = '' }) {
  if (!symbols?.length) return null

  return (
    <div className={`flex flex-wrap gap-1.5 ${className}`}>
      {symbols.map((s) => (
        <button
          key={marketSymbolDedupeKey(s)}
          type="button"
          onClick={() =>
            onChange(symbols.filter((x) => marketSymbolDedupeKey(x) !== marketSymbolDedupeKey(s)))
          }
          className="inline-flex items-center gap-1 rounded-full bg-cyan-500/15 px-2.5 py-0.5 text-[12px] font-semibold text-cyan-300 touch-manipulation hover:bg-cyan-500/25"
          title="Remove chart"
        >
          ${s.display_symbol || s.symbol}
          <span aria-hidden>×</span>
        </button>
      ))}
      {symbols.length >= LOUNGE_MARKET_EMBED_MAX ? (
        <span className="self-center text-[11px] text-zinc-500">Max {LOUNGE_MARKET_EMBED_MAX}</span>
      ) : null}
    </div>
  )
}
