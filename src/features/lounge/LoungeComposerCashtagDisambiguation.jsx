import { useEffect, useMemo, useState } from 'react'
import { LOUNGE_MARKET_EMBED_MAX } from '../../utils/loungeMarketCaptionParse.js'
import {
  marketSymbolDedupeKey,
  mergeComposerMarketSymbolForCashtag,
} from './loungeMarketSymbolUtils.js'
import LoungeMarketSearchResultRow from './LoungeMarketSearchResultRow.jsx'

function candidateKey(row) {
  return marketSymbolDedupeKey(row)
}

/**
 * @param {{
 *   ambiguousTags: string[],
 *   byTag: Record<string, { suggested?: object, candidates?: object[] }>,
 *   loading?: boolean,
 *   symbols: object[],
 *   onChangeSymbols: (next: object[]) => void,
 *   onConfirmTag: (tag: string) => void,
 *   className?: string,
 * }} props
 */
export default function LoungeComposerCashtagDisambiguation({
  ambiguousTags,
  byTag,
  loading = false,
  symbols,
  onChangeSymbols,
  onConfirmTag,
  className = '',
}) {
  const tags = ambiguousTags
  const [selectedKeyByTag, setSelectedKeyByTag] = useState(/** @type {Record<string, string>} */ ({}))

  useEffect(() => {
    setSelectedKeyByTag((prev) => {
      const next = { ...prev }
      let changed = false
      for (const tag of tags) {
        if (next[tag]) continue
        const info = byTag[tag]
        const picked = info?.candidates?.[0] || info?.suggested
        if (picked) {
          next[tag] = candidateKey(picked)
          changed = true
        }
      }
      for (const key of Object.keys(next)) {
        if (!tags.includes(key)) {
          delete next[key]
          changed = true
        }
      }
      return changed ? next : prev
    })
  }, [tags, byTag])

  const rows = useMemo(() => {
    return tags.map((tag) => {
      const info = byTag[tag] || {}
      const candidates = Array.isArray(info.candidates) ? info.candidates : []
      const selectedKey = selectedKeyByTag[tag] || (candidates[0] ? candidateKey(candidates[0]) : '')
      const selected =
        candidates.find((c) => candidateKey(c) === selectedKey) ||
        candidates[0] ||
        info.suggested ||
        null
      return { tag, candidates, selected, selectedKey }
    })
  }, [tags, byTag, selectedKeyByTag])

  if (!tags.length) return null

  return (
    <div className={`space-y-2 ${className}`} data-lounge-cashtag-disambiguation="">
      {loading ? (
        <p className="text-[11px] text-zinc-500">Checking market tickers…</p>
      ) : null}
      {rows.map(({ tag, candidates, selected, selectedKey }) => (
        <div
          key={tag}
          className="rounded-xl border border-amber-500/35 bg-amber-950/20 px-3 py-2.5"
        >
          <div className="mb-2 text-[12px] font-semibold leading-tight text-amber-100/95">
            ${tag} matches more than one instrument — pick a chart
          </div>
          {selected ? (
            <div className="mb-2 rounded-lg border border-zinc-700/60 bg-zinc-900/40 px-2 py-1.5">
              <LoungeMarketSearchResultRow row={selected} variant="compact" />
            </div>
          ) : null}
          {candidates.length > 1 ? (
            <label className="mb-2 block">
              <span className="sr-only">Choose instrument for ${tag}</span>
              <select
                value={selectedKey}
                onChange={(e) => {
                  const key = e.target.value
                  setSelectedKeyByTag((prev) => ({ ...prev, [tag]: key }))
                }}
                className="w-full rounded-lg border border-zinc-600/80 bg-zinc-900 px-2 py-1.5 text-[13px] text-zinc-100"
              >
                {candidates.map((c) => {
                  const key = candidateKey(c)
                  const label = `${c.name || c.description || c.symbol} (${c.display_symbol || c.symbol} · ${c.asset_class})`
                  return (
                    <option key={key} value={key}>
                      {label}
                    </option>
                  )
                })}
              </select>
            </label>
          ) : null}
          <button
            type="button"
            disabled={!selected}
            onClick={() => {
              if (!selected) return
              const next = mergeComposerMarketSymbolForCashtag(
                symbols,
                tag,
                selected,
                LOUNGE_MARKET_EMBED_MAX,
              )
              onChangeSymbols(next)
              onConfirmTag(tag)
            }}
            className="min-h-8 touch-manipulation rounded-md bg-amber-600/90 px-3 py-1 text-[12px] font-bold text-white hover:bg-amber-500 disabled:cursor-not-allowed disabled:opacity-40 [-webkit-tap-highlight-color:transparent]"
          >
            Confirm chart for ${tag}
          </button>
        </div>
      ))}
    </div>
  )
}
