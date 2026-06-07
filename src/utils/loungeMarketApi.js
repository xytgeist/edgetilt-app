/**
 * Invoke `lounge-market-data` Edge function with the caller's session JWT.
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {Record<string, unknown>} payload Must include `action`.
 */

import { marketBarRowFields } from './marketBarOhlc.js'
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

  const { data, error } = await supabase.functions.invoke('lounge-market-data', {
    body: payload,
    headers: { Authorization: `Bearer ${session.access_token}` },
  })

  if (error) {
    let message = error.message || 'Market request failed.'
    try {
      const ctx = error.context
      if (ctx && typeof ctx.json === 'function') {
        const body = await ctx.json()
        if (body?.error) message = String(body.error)
      }
    } catch {
      /* ignore parse errors */
    }
    return { error: message }
  }

  if (data && typeof data === 'object' && data.error) {
    return { error: String(data.error) }
  }
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
 * @param {{ symbol: string, asset_class: string, kind?: string, window_key?: string }} opts
 */
export async function loungeMarketModalSeries(supabase, opts) {
  const data = await loungeMarketInvoke(supabase, {
    action: 'modal_series',
    symbol: opts.symbol,
    asset_class: opts.asset_class,
    kind: opts.kind || 'rolling',
    window_key: opts.window_key || '24h',
  })
  if (!data || data.error) return null
  return data
}

/**
 * Fetch older bars ending before `before_sec` (Advanced chart pan-back).
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {{ symbol: string, asset_class: string, kind?: string, window_key?: string, before_sec: number }} opts
 */
export async function loungeMarketModalSeriesBefore(supabase, opts) {
  const data = await loungeMarketInvoke(supabase, {
    action: 'modal_series',
    symbol: opts.symbol,
    asset_class: opts.asset_class,
    kind: opts.kind || 'historical',
    window_key: opts.window_key || '24h',
    before_sec: opts.before_sec,
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
