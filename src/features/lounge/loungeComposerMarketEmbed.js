import {
  formatMarketWindowDateLabel,
  parseCaptionMarketWindowClient,
} from '../../utils/loungeMarketCaptionParse.js'
import { loungeMarketBatchRolling, loungeMarketModalSeries, loungeMarketPreview } from '../../utils/loungeMarketApi.js'
import { marketSymbolDedupeKey } from './loungeMarketSymbolUtils.js'

/**
 * Mini-chart payload for compose / bot-portal publish.
 * Pass `caption` so temporal phrases (e.g. "first signs of life … in two months")
 * fetch a historical window instead of rolling 24h.
 *
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {{ symbol: string, asset_class: string, display_symbol?: string, name?: string, logo_url?: string, exchange?: string, market_cap?: number|null, coin_id?: string }} row
 * @param {{ caption?: string }} [opts]
 */
export async function fetchComposerMarketEmbed(supabase, row, opts = {}) {
  const symbol = String(row?.symbol || '').trim()
  const asset_class = String(row?.asset_class || 'stock').trim() === 'crypto' ? 'crypto' : 'stock'
  const display_symbol = String(row?.display_symbol || row?.symbol || '').trim().toUpperCase()
  if (!symbol) return null

  const windowInfo = parseCaptionMarketWindowClient(opts?.caption || '')
  const coinOpts = row?.coin_id ? { coin_id: String(row.coin_id).trim() } : {}

  const list = [
    {
      symbol,
      asset_class,
      display_symbol,
      ...coinOpts,
    },
  ]

  const previewPromise = loungeMarketPreview(supabase, { symbol, asset_class })
  const seriesPromise =
    windowInfo.kind === 'historical'
      ? loungeMarketModalSeries(supabase, {
          symbol,
          asset_class,
          kind: 'historical',
          window_key: windowInfo.windowKey,
          ...coinOpts,
        })
      : loungeMarketBatchRolling(supabase, list).then((quotes) => {
          const cacheKey = marketSymbolDedupeKey({ symbol, asset_class })
          return quotes?.[cacheKey] && typeof quotes[cacheKey] === 'object' ? quotes[cacheKey] : null
        })

  const [preview, series] = await Promise.all([previewPromise, seriesPromise])

  if (!preview && !series) return null

  const finnhubSym = String(preview?.symbol || symbol).trim()
  const previewName = String(preview?.name || '').trim()
  const rowName = String(row?.name || '').trim()
  const nameLooksLikeTicker = (n) => {
    const u = String(n || '').trim().toUpperCase()
    return !u || u === display_symbol || u === finnhubSym.toUpperCase()
  }
  // Prefer a real company/ETF name over Finnhub echoing the ticker (common for GLD et al.).
  const name = !nameLooksLikeTicker(previewName)
    ? previewName
    : !nameLooksLikeTicker(rowName)
      ? rowName
      : previewName || rowName || display_symbol || finnhubSym

  const bars = Array.isArray(series?.bars) ? series.bars : []
  const quote =
    series?.quote && typeof series.quote === 'object'
      ? series.quote
      : {
          price: preview?.price,
          change_pct: preview?.change_pct,
          change: preview?.change,
          as_of: new Date().toISOString(),
        }

  const window_label =
    windowInfo.kind === 'historical'
      ? formatMarketWindowDateLabel(windowInfo.windowKey, bars) ||
        String(series?.window_label || windowInfo.windowLabel || windowInfo.windowKey)
      : String(series?.window_label || '24h')

  return {
    symbol: finnhubSym,
    display_symbol: display_symbol || String(preview?.display_symbol || '').trim().toUpperCase() || finnhubSym,
    asset_class,
    name,
    exchange: preview?.exchange || row?.exchange,
    logo_url: String(preview?.logo_url || row?.logo_url || '').trim(),
    market_cap: series?.market_cap ?? preview?.market_cap ?? row?.market_cap ?? null,
    currency: 'USD',
    kind: windowInfo.kind,
    window_key: windowInfo.windowKey,
    window_label,
    quote,
    bars,
    ...coinOpts,
  }
}

/** @param {object} row Composer symbol row with optional `composerEmbed`. */
export function composerMarketRowEmbed(row) {
  if (row?.composerEmbed && typeof row.composerEmbed === 'object') return row.composerEmbed
  return null
}

/**
 * Fetch missing sparkline payloads for toolbar picker / restored rows.
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {Function} setSymbols
 * @param {object[]} symbols
 * @param {string} [caption]
 */
export function hydrateComposerMarketSymbolEmbeds(supabase, setSymbols, symbols, caption = '') {
  if (!supabase || !Array.isArray(symbols)) return
  const cap = String(caption || '')
  for (const row of symbols) {
    if (composerMarketRowEmbed(row) || !row?.symbol) continue
    const key = marketSymbolDedupeKey(row)
    void fetchComposerMarketEmbed(supabase, row, { caption: cap }).then((embed) => {
      if (!embed) return
      setSymbols((prev) => {
        const current = Array.isArray(prev) ? prev : []
        const existing = current.find((s) => marketSymbolDedupeKey(s) === key)
        if (!existing || composerMarketRowEmbed(existing)) return current
        return current.map((s) => (marketSymbolDedupeKey(s) === key ? { ...s, composerEmbed: embed } : s))
      })
    })
  }
}
