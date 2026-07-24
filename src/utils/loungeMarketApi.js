/**
 * Invoke `lounge-market-data` Edge function with the caller's session JWT.
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {Record<string, unknown>} payload Must include `action`.
 */

import { marketBarRowFields } from './marketBarOhlc.js'
import { readAppConsoleLogHudEnabled } from './appConsoleLogHudPref.js'

function logCoingeckoUsageDebug(data, payload) {
  const summary = data?._debug?.coingecko
  if (!summary || typeof summary !== 'object') return
  const action = String(payload?.action || summary.action || 'unknown')
  const network = Number(summary.network_calls) || 0
  const cached = Number(summary.cache_hits) || 0
  console.log(
    `[coingeckoUsage] action=${action} network=${network} cache_hits=${cached} by_reason=`,
    summary.by_reason,
    summary,
  )
}

export async function loungeMarketInvoke(supabase, payload) {
  let {
    data: { session },
  } = await supabase.auth.getSession()
  if (!session?.access_token) return { error: 'You must be signed in for market charts.' }

  const nowSecs = Math.floor(Date.now() / 1000)
  if (!session.expires_at || session.expires_at - nowSecs < 60) {
    const { data: refreshed } = await supabase.auth.refreshSession()
    if (refreshed?.session?.access_token) session = refreshed.session
  }

  const body = {
    ...payload,
    ...(readAppConsoleLogHudEnabled() ? { debug_coingecko: true } : {}),
  }

  const { data, error } = await supabase.functions.invoke('lounge-market-data', {
    body,
    headers: { Authorization: `Bearer ${session.access_token}` },
  })

  if (error) {
    let message = error.message || 'Market request failed.'
    try {
      const ctx = error.context
      if (ctx && typeof ctx.json === 'function') {
        const errBody = await ctx.json()
        if (errBody?.error) message = String(errBody.error)
        logCoingeckoUsageDebug(errBody, body)
      }
    } catch {
      /* ignore parse errors */
    }
    return { error: message }
  }

  if (data && typeof data === 'object' && data.error) {
    logCoingeckoUsageDebug(data, body)
    return { error: String(data.error) }
  }

  logCoingeckoUsageDebug(data, body)
  return data
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} query
 */
export async function loungeMarketSearch(supabase, query) {
  const data = await loungeMarketInvoke(supabase, { action: 'search', query })
  if (!data || data.error) return []
  return Array.isArray(data.results) ? data.results : []
}

/**
 * Quote/logo enrich for known symbols (skips Finnhub/CoinGecko text search).
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {Array<{ symbol: string, asset_class: string, display_symbol?: string, name?: string, exchange?: string, logo_url?: string, coin_id?: string }>} symbols
 */
export async function loungeMarketEnrichSymbols(supabase, symbols) {
  const list = Array.isArray(symbols) ? symbols.slice(0, 8) : []
  if (!list.length) return []
  const data = await loungeMarketInvoke(supabase, { action: 'enrich_symbols', symbols: list })
  if (!data || data.error) return []
  return Array.isArray(data.results) ? data.results : []
}

/**
 * Logo-only enrich for cashtag dropdown (no quote/mcap API).
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {Array<{ symbol: string, asset_class: string, display_symbol?: string, logo_url?: string, coin_id?: string }>} symbols
 */
export async function loungeMarketEnrichLogos(supabase, symbols) {
  const list = Array.isArray(symbols) ? symbols.slice(0, 8) : []
  if (!list.length) return []
  const data = await loungeMarketInvoke(supabase, { action: 'enrich_logos', symbols: list })
  if (!data || data.error) return []
  return Array.isArray(data.results) ? data.results : []
}

/**
 * Miss fallback — resolve unknown ticker via API, upsert lookup table, return rows.
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} query
 */
export async function loungeMarketResolveSymbol(supabase, query) {
  const q = String(query || '').trim()
  if (!q) return []
  const data = await loungeMarketInvoke(supabase, { action: 'resolve_symbol', query: q })
  if (!data || data.error) return []
  return Array.isArray(data.results) ? data.results : []
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string[]} tags Cashtag tickers without `$`
 */
export async function loungeMarketResolveCashtags(supabase, tags) {
  const list = Array.isArray(tags)
    ? tags.map((t) => String(t || '').trim().toUpperCase()).filter(Boolean)
    : []
  if (!list.length) return { by_tag: {} }
  const data = await loungeMarketInvoke(supabase, { action: 'resolve_cashtags', tags: list })
  if (!data || data.error) return { error: String(data?.error || 'Could not resolve cashtags.'), by_tag: {} }
  return { by_tag: data.by_tag && typeof data.by_tag === 'object' ? data.by_tag : {} }
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {{ symbol: string, asset_class: 'stock'|'crypto' }} symbol
 */
export async function loungeMarketPreview(supabase, symbol) {
  const data = await loungeMarketInvoke(supabase, { action: 'preview', ...symbol })
  if (!data || data.error) return null
  return data.preview ?? null
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {{ postId: string, caption: string, symbols: Array<{ symbol: string, asset_class: string }> }} opts
 */
export async function attachMarketEmbedsToPost(supabase, { postId, caption, symbols }) {
  if (!postId) return null
  const origin =
    typeof window !== 'undefined' && window.location?.origin
      ? window.location.origin
      : undefined
  const data = await loungeMarketInvoke(supabase, {
    action: 'attach',
    post_id: postId,
    caption,
    symbols: Array.isArray(symbols) ? symbols : [],
    ...(origin ? { origin } : {}),
  })
  if (!data || data.error) {
    return { error: String(data?.error || 'Could not attach market charts.') }
  }
  return {
    embeds: data.embeds ?? [],
    ...(Array.isArray(data.warnings) && data.warnings.length ? { warnings: data.warnings } : {}),
  }
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {Array<{ symbol: string, asset_class: string }>} symbols
 * @param {{ refresh?: boolean }} [opts]
 */
export async function loungeMarketBatchRolling(supabase, symbols, opts = {}) {
  if (!symbols?.length) return {}
  const data = await loungeMarketInvoke(supabase, {
    action: 'batch_rolling',
    symbols,
    ...(opts.refresh ? { refresh: true } : {}),
  })
  if (!data || data.error) return {}
  return data.quotes && typeof data.quotes === 'object' ? data.quotes : {}
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {{ symbol: string, asset_class: string, kind?: string, window_key?: string, resolution?: string, bar_limit?: number }} opts
 */
export async function loungeMarketModalSeries(supabase, opts) {
  const data = await loungeMarketInvoke(supabase, {
    action: 'modal_series',
    symbol: opts.symbol,
    asset_class: opts.asset_class,
    kind: opts.kind || 'rolling',
    window_key: opts.window_key || '24h',
    ...(opts.coin_id ? { coin_id: opts.coin_id } : {}),
    ...(opts.resolution ? { resolution: opts.resolution } : {}),
    ...(opts.bar_limit != null ? { bar_limit: opts.bar_limit } : {}),
  })
  if (!data || data.error) return null
  return data
}

/**
 * Fetch older bars ending before `before_sec` (Advanced chart pan-back).
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {{ symbol: string, asset_class: string, kind?: string, window_key?: string, resolution?: string, bar_limit?: number, before_sec: number }} opts
 */
export async function loungeMarketModalSeriesBefore(supabase, opts) {
  const data = await loungeMarketInvoke(supabase, {
    action: 'modal_series',
    symbol: opts.symbol,
    asset_class: opts.asset_class,
    kind: opts.kind || 'historical',
    window_key: opts.window_key || '24h',
    before_sec: opts.before_sec,
    ...(opts.coin_id ? { coin_id: opts.coin_id } : {}),
    ...(opts.resolution ? { resolution: opts.resolution } : {}),
    ...(opts.bar_limit != null ? { bar_limit: opts.bar_limit } : {}),
  })
  if (!data || data.error) return null
  return data
}

/** Merge older bars into an ascending unique series. */
export function mergeMarketBarsOlder(existing = [], older = []) {
  /** @type {Map<number, ReturnType<typeof marketBarRowFields>>} */
  const map = new Map()
  for (const bar of [...older, ...existing]) {
    if (!bar || !Number.isFinite(bar.t) || !Number.isFinite(bar.c)) continue
    const row = marketBarRowFields(bar)
    map.set(row.t, row)
  }
  return [...map.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([, row]) => row)
}

/** Keep only bars strictly older than `beforeSec` (unix seconds). */
export function filterMarketBarsStrictlyBefore(bars = [], beforeSec) {
  const anchor = Math.floor(Number(beforeSec))
  if (!Number.isFinite(anchor) || anchor <= 0) return []
  return bars.filter((bar) => marketBarRowFields(bar).t < anchor)
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {{ symbol: string, asset_class: string }} opts
 */
export async function loungeMarketModalNews(supabase, opts) {
  const data = await loungeMarketInvoke(supabase, {
    action: 'modal_news',
    symbol: opts.symbol,
    asset_class: opts.asset_class,
  })
  if (!data || data.error) return null
  return data.news ?? null
}

/**
 * Fetch a market logo through Edge (server-side) for canvas snapshot compositing.
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {{ url?: string, symbol?: string, asset_class?: string }} opts
 * @returns {Promise<Blob | null>}
 */
export async function loungeMarketLogoImageBlob(supabase, opts = {}) {
  const url = String(opts.url || '').trim()
  const symbol = String(opts.symbol || '').trim()
  if (!url && !symbol) return null

  const payload = { action: 'logo_image' }
  if (url) payload.url = url
  if (symbol) {
    payload.symbol = symbol
    payload.asset_class = opts.asset_class === 'crypto' ? 'crypto' : 'stock'
  }

  const data = await loungeMarketInvoke(supabase, payload)
  if (!data?.ok || !data.data_base64) return null

  try {
    const binary = atob(String(data.data_base64))
    const bytes = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i)
    return new Blob([bytes], { type: String(data.content_type || 'image/png') })
  } catch {
    return null
  }
}
