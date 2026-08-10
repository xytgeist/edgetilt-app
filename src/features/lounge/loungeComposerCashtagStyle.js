import { useEffect, useMemo, useRef, useState } from 'react'
import {
  cashtagFinnhubSymbol,
  extractCashtagsFromCaption,
  guessCashtagAssetClass,
} from '../../utils/loungeMarketCaptionParse.js'
import { loungeMarketBatchRolling } from '../../utils/loungeMarketApi.js'
import { composerMarketRowEmbed } from './loungeComposerMarketEmbed.js'
import { marketSymbolDedupeKey } from './loungeMarketSymbolUtils.js'

/** @typedef {{ quotesByTicker: Record<string, { change_pct?: number }>, assetClassByTicker: Map<string, 'stock' | 'crypto'> }} ComposerCashtagStyleContext */

/**
 * @param {object[] | null | undefined} marketSymbolRows Picker rows with optional `composerEmbed`.
 * @param {Record<string, { change_pct?: number }>} [extraQuotes]
 * @returns {ComposerCashtagStyleContext}
 */
export function buildComposerCashtagStyleContext(marketSymbolRows, extraQuotes = {}) {
  /** @type {Record<string, { change_pct?: number }>} */
  const quotesByTicker = { ...extraQuotes }
  /** @type {Map<string, 'stock' | 'crypto'>} */
  const assetClassByTicker = new Map()

  for (const row of marketSymbolRows || []) {
    const ticker = String(row?.display_symbol || row?.symbol || '')
      .trim()
      .toUpperCase()
    if (!ticker) continue
    assetClassByTicker.set(ticker, row?.asset_class === 'crypto' ? 'crypto' : 'stock')
    const embed = composerMarketRowEmbed(row)
    const pct = embed?.quote?.change_pct ?? row?.change_pct
    if (Number.isFinite(Number(pct))) {
      quotesByTicker[ticker] = { change_pct: Number(pct) }
    }
  }

  return { quotesByTicker, assetClassByTicker }
}

/**
 * Live quote tint for `$` tags in the compose / post-edit caption field.
 *
 * @param {import('@supabase/supabase-js').SupabaseClient | null | undefined} supabase
 * @param {string} caption
 * @param {object[]} marketSymbolRows
 * @param {boolean} enabled
 */
export function useComposerCashtagStyleContext(supabase, caption, marketSymbolRows, enabled) {
  const [captionQuotes, setCaptionQuotes] = useState(/** @type {Record<string, { change_pct?: number }>} */ ({}))
  const inflightRef = useRef(false)
  const genRef = useRef(0)

  const pickerContext = useMemo(
    () => buildComposerCashtagStyleContext(marketSymbolRows, captionQuotes),
    [marketSymbolRows, captionQuotes],
  )

  useEffect(() => {
    if (!enabled || !supabase) return undefined

    const tags = extractCashtagsFromCaption(caption)
    const pickerQuotes = buildComposerCashtagStyleContext(marketSymbolRows)
    const missing = tags.filter((ticker) => {
      if (captionQuotes[ticker]?.change_pct != null) return false
      if (pickerQuotes.quotesByTicker[ticker]?.change_pct != null) return false
      return true
    })
    if (!missing.length) return undefined

    const gen = (genRef.current += 1)
    const timer = window.setTimeout(() => {
      if (inflightRef.current) return
      inflightRef.current = true

      const assetClassByTicker = pickerQuotes.assetClassByTicker
      const symbols = missing.slice(0, 8).map((ticker) => {
        const asset_class = guessCashtagAssetClass(ticker, assetClassByTicker)
        return {
          symbol: cashtagFinnhubSymbol(ticker, asset_class),
          asset_class,
          display_symbol: ticker,
        }
      })

      void loungeMarketBatchRolling(supabase, symbols)
        .then((quotes) => {
          if (gen !== genRef.current) return
          if (!quotes || typeof quotes !== 'object') return
          setCaptionQuotes((prev) => {
            let changed = false
            const next = { ...prev }
            for (const item of symbols) {
              const ticker = String(item.display_symbol || '').trim().toUpperCase()
              const key = marketSymbolDedupeKey(item)
              const row = quotes[key]
              const pct = row?.quote?.change_pct
              if (ticker && Number.isFinite(Number(pct))) {
                if (next[ticker]?.change_pct !== Number(pct)) {
                  next[ticker] = { change_pct: Number(pct) }
                  changed = true
                }
              }
            }
            return changed ? next : prev
          })
        })
        .catch((err) => {
          console.warn('[lounge] composer cashtag quotes:', err)
        })
        .finally(() => {
          inflightRef.current = false
        })
    }, 280)

    return () => window.clearTimeout(timer)
  }, [caption, captionQuotes, enabled, marketSymbolRows, supabase])

  return pickerContext
}
