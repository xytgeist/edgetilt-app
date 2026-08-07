import { loungeMarketBatchRolling, loungeMarketPreview } from '../../utils/loungeMarketApi.js'
import { marketSymbolDedupeKey } from './loungeMarketSymbolUtils.js'

/**
 * Rolling mini-chart payload for compose / post-edit preview (picker selection only).
 *
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {{ symbol: string, asset_class: string, display_symbol?: string, name?: string, logo_url?: string, exchange?: string, market_cap?: number|null, coin_id?: string }} row
 */
export async function fetchComposerMarketEmbed(supabase, row) {
  const symbol = String(row?.symbol || '').trim()
  const asset_class = String(row?.asset_class || 'stock').trim() === 'crypto' ? 'crypto' : 'stock'
  const display_symbol = String(row?.display_symbol || row?.symbol || '').trim().toUpperCase()
  if (!symbol) return null

  const list = [
    {
      symbol,
      asset_class,
      display_symbol,
      ...(row?.coin_id ? { coin_id: String(row.coin_id).trim() } : {}),
    },
  ]

  const [preview, quotes] = await Promise.all([
    loungeMarketPreview(supabase, { symbol, asset_class }),
    loungeMarketBatchRolling(supabase, list),
  ])

  const cacheKey = marketSymbolDedupeKey({ symbol, asset_class })
  const rolling = quotes?.[cacheKey] && typeof quotes[cacheKey] === 'object' ? quotes[cacheKey] : null

  if (!preview && !rolling) return null

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
  return {
    symbol: finnhubSym,
    display_symbol: display_symbol || String(preview?.display_symbol || '').trim().toUpperCase() || finnhubSym,
    asset_class,
    name,
    exchange: preview?.exchange || row?.exchange,
    logo_url: String(preview?.logo_url || row?.logo_url || '').trim(),
    market_cap: preview?.market_cap ?? row?.market_cap ?? null,
    currency: 'USD',
    kind: 'rolling',
    window_key: '24h',
    window_label: String(rolling?.window_label || '24h'),
    quote: rolling?.quote || {
      price: preview?.price,
      change_pct: preview?.change_pct,
      change: preview?.change,
      as_of: new Date().toISOString(),
    },
    bars: Array.isArray(rolling?.bars) ? rolling.bars : [],
    ...(row?.coin_id ? { coin_id: String(row.coin_id).trim() } : {}),
  }
}

/** @param {object} row Composer symbol row with optional `composerEmbed`. */
export function composerMarketRowEmbed(row) {
  if (row?.composerEmbed && typeof row.composerEmbed === 'object') return row.composerEmbed
  return null
}

/** Fetch missing sparkline payloads for toolbar picker / restored rows. */
export function hydrateComposerMarketSymbolEmbeds(supabase, setSymbols, symbols) {
  if (!supabase || !Array.isArray(symbols)) return
  for (const row of symbols) {
    if (composerMarketRowEmbed(row) || !row?.symbol) continue
    const key = marketSymbolDedupeKey(row)
    void fetchComposerMarketEmbed(supabase, row).then((embed) => {
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
