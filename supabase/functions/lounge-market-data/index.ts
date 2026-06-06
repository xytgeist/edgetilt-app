import { createClient } from 'npm:@supabase/supabase-js@2'
import {
  MARKET_CACHE_TTL_MS,
  MARKET_EMBED_MAX,
  buildMarketEmbed,
  buildRollingBatchPayload,
  embedQuoteCurrency,
  enrichSearchResultsForPicker,
  finnhubLatestNews,
  finnhubProfile,
  finnhubQuote,
  finnhubSymbolForAsset,
  marketSearch,
  normalizeDisplaySymbol,
  normalizeMarketCapToUsd,
  normalizeMarketQuoteToUsd,
  normalizeMarketSeriesToUsd,
  resolveMarketBars,
  resolveMarketSymbolsForAttach,
  sortMarketSearchResults,
  type MarketAssetClass,
  type MarketEmbed,
  type MarketWindowKey,
} from '../_shared/finnhubMarket.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function json(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

function cacheKey(symbol: string, assetClass: string) {
  return `${assetClass}:${symbol}`.toLowerCase()
}

async function readCache(admin: ReturnType<typeof createClient>, key: string) {
  const { data } = await admin
    .from('market_quote_cache')
    .select('payload,fetched_at')
    .eq('cache_key', key)
    .maybeSingle()
  if (!data?.payload || !data.fetched_at) return null
  const age = Date.now() - new Date(String(data.fetched_at)).getTime()
  if (age > MARKET_CACHE_TTL_MS) return null
  return data.payload
}

async function writeCache(
  admin: ReturnType<typeof createClient>,
  key: string,
  symbol: string,
  assetClass: string,
  payload: unknown,
) {
  await admin.from('market_quote_cache').upsert({
    cache_key: key,
    symbol,
    asset_class: assetClass,
    payload,
    fetched_at: new Date().toISOString(),
  })
}

function parseSymbolInput(raw: unknown): { symbol: string; asset_class: MarketAssetClass } | null {
  const symbol = String(raw?.symbol || raw || '').trim()
  if (!symbol) return null
  const asset_class = (String(raw?.asset_class || '').trim() === 'crypto'
    ? 'crypto'
    : 'stock') as MarketAssetClass
  return { symbol, asset_class }
}

async function previewSymbol(symbol: string, asset_class: MarketAssetClass) {
  const finnhubSym = finnhubSymbolForAsset(symbol, asset_class)
  const [profile, quote] = await Promise.all([
    finnhubProfile(symbol, asset_class),
    finnhubQuote(symbol, asset_class),
  ])
  const currency = embedQuoteCurrency(profile.exchange, profile.currency)
  const [quoteUsd, marketCapUsd] = await Promise.all([
    normalizeMarketQuoteToUsd(quote, currency),
    normalizeMarketCapToUsd(profile.marketCapitalization, currency),
  ])
  return {
    symbol: finnhubSym,
    display_symbol: normalizeDisplaySymbol(finnhubSym, asset_class),
    asset_class,
    name: profile.name,
    exchange: profile.exchange,
    logo_url: profile.logo,
    market_cap: marketCapUsd,
    currency: 'USD',
    price: quoteUsd.price,
    change_pct: quote.change_pct,
    change: quoteUsd.change,
  }
}

async function attachMarketEmbeds(
  admin: ReturnType<typeof createClient>,
  postId: string,
  caption: string,
  symbols: Array<{ symbol: string; asset_class: MarketAssetClass }>,
  origin: string,
) {
  const limited = symbols.slice(0, MARKET_EMBED_MAX)
  const embeds: MarketEmbed[] = []
  const skipped: string[] = []
  for (const item of limited) {
    try {
      const embed = await buildMarketEmbed(item.symbol, item.asset_class, caption)
      embed.og_image_url = `${origin}/api/lounge-market-og?postId=${encodeURIComponent(postId)}&symbol=${encodeURIComponent(embed.display_symbol)}`
      embeds.push(embed)
    } catch (e) {
      const detail = e instanceof Error ? e.message : 'embed build failed'
      skipped.push(`${item.symbol}: ${detail}`)
    }
  }
  const { error } = await admin
    .from('community_feed_posts')
    .update({ market_embeds: embeds })
    .eq('id', postId)
  if (error) {
    const msg = String(error.message || '')
    if (/market_embeds|schema cache/i.test(msg)) {
      throw new Error(
        'Apply migration 20260609120000_lounge_market_embeds.sql on this Supabase project.',
      )
    }
    throw new Error(msg || 'Could not save market embeds.')
  }
  return { embeds, skipped }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json(405, { error: 'Method not allowed' })

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!supabaseUrl || !serviceKey) {
    return json(500, { error: 'Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY' })
  }

  const authHeader = req.headers.get('Authorization') || ''
  if (!authHeader.toLowerCase().startsWith('bearer ')) {
    return json(401, { error: 'Missing Authorization bearer token.' })
  }
  const jwt = authHeader.replace(/^Bearer\s+/i, '').trim()
  const admin = createClient(supabaseUrl, serviceKey)
  const {
    data: { user },
    error: userErr,
  } = await admin.auth.getUser(jwt)
  if (userErr || !user?.id) return json(401, { error: 'Invalid or expired session.' })

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return json(400, { error: 'Invalid JSON body.' })
  }

  const action = String(body?.action || '').trim()

  if (action === 'search') {
    const q = String(body?.query || body?.q || '').trim()
    if (q.length < 1) return json(400, { error: 'query is required.' })
    try {
      const results = await marketSearch(q)
      const enriched = await enrichSearchResultsForPicker(results.slice(0, 8))
      return json(200, { ok: true, results: sortMarketSearchResults(q, enriched) })
    } catch (e) {
      return json(502, { error: e instanceof Error ? e.message : 'Search failed.' })
    }
  }

  if (action === 'preview') {
    const parsed = parseSymbolInput(body)
    if (!parsed) return json(400, { error: 'symbol is required.' })
    try {
      const preview = await previewSymbol(parsed.symbol, parsed.asset_class)
      return json(200, { ok: true, preview })
    } catch (e) {
      return json(502, { error: e instanceof Error ? e.message : 'Preview failed.' })
    }
  }

  if (action === 'modal_news') {
    const parsed = parseSymbolInput(body)
    if (!parsed) return json(400, { error: 'symbol is required.' })
    try {
      const news = await finnhubLatestNews(parsed.symbol, parsed.asset_class)
      return json(200, { ok: true, news })
    } catch (e) {
      return json(502, { error: e instanceof Error ? e.message : 'News failed.' })
    }
  }

  if (action === 'modal_series') {
    const parsed = parseSymbolInput(body)
    if (!parsed) return json(400, { error: 'symbol is required.' })
    const windowKey = (String(body?.window_key || '24h').trim() || '24h') as MarketWindowKey
    const kind = String(body?.kind || 'rolling')
    try {
      if (kind === 'historical') {
        const profile = await finnhubProfile(parsed.symbol, parsed.asset_class)
        const currency = embedQuoteCurrency(profile.exchange, profile.currency)
        const quote = await finnhubQuote(parsed.symbol, parsed.asset_class)
        const bars = await resolveMarketBars(parsed.symbol, parsed.asset_class, windowKey, quote)
        let quoteOut: typeof quote & { change_pct: number } = { ...quote }
        let changePct = quote.change_pct
        if (bars.length >= 2) {
          const first = bars[0].c
          const last = bars[bars.length - 1].c
          if (first > 0) {
            changePct = ((last - first) / first) * 100
            quoteOut = {
              ...quote,
              price: last,
              change_pct: changePct,
              change: last - first,
            }
          } else {
            quoteOut = { ...quote, change_pct: changePct }
          }
        }
        const normalized = await normalizeMarketSeriesToUsd(quoteOut, bars, currency)
        return json(200, {
          ok: true,
          quote: normalized.quote,
          bars: normalized.bars,
          window_label: windowKey.toUpperCase(),
        })
      }
      const payload = await buildRollingBatchPayload(parsed.symbol, parsed.asset_class)
      return json(200, { ok: true, ...payload })
    } catch (e) {
      return json(502, { error: e instanceof Error ? e.message : 'Series failed.' })
    }
  }

  if (action === 'batch_rolling') {
    const raw = Array.isArray(body?.symbols) ? body.symbols : []
    const items = raw
      .map((row) => parseSymbolInput(row))
      .filter(Boolean) as Array<{ symbol: string; asset_class: MarketAssetClass }>
    const unique = new Map<string, { symbol: string; asset_class: MarketAssetClass }>()
    for (const item of items) {
      const key = cacheKey(finnhubSymbolForAsset(item.symbol, item.asset_class), item.asset_class)
      if (!unique.has(key)) unique.set(key, item)
    }
    const out: Record<string, unknown> = {}
    for (const [key, item] of unique.entries()) {
      const cached = await readCache(admin, key)
      if (cached) {
        out[key] = cached
        continue
      }
      try {
        const payload = await buildRollingBatchPayload(item.symbol, item.asset_class)
        await writeCache(admin, key, finnhubSymbolForAsset(item.symbol, item.asset_class), item.asset_class, payload)
        out[key] = payload
      } catch {
        /* skip symbol on failure */
      }
    }
    return json(200, { ok: true, quotes: out })
  }

  if (action === 'attach') {
    const postId = String(body?.post_id || body?.entity_id || '').trim()
    const caption = String(body?.caption || '').trim()
    const origin = String(body?.origin || Deno.env.get('LOUNGE_PUBLIC_ORIGIN') || 'https://lvslotpro.com').replace(/\/+$/, '')
    const rawSymbols = Array.isArray(body?.symbols) ? body.symbols : []
    const pickerSymbols = rawSymbols
      .map((row) => {
        const parsed = parseSymbolInput(row)
        if (!parsed) return null
        const raw = row && typeof row === 'object' ? (row as Record<string, unknown>) : {}
        return {
          ...parsed,
          display_symbol: String(raw.display_symbol || '').trim(),
        }
      })
      .filter(Boolean) as Array<{ symbol: string; asset_class: MarketAssetClass; display_symbol?: string }>
    if (!postId) return json(400, { error: 'post_id is required.' })

    const { data: postRow } = await admin
      .from('community_feed_posts')
      .select('id,user_id')
      .eq('id', postId)
      .maybeSingle()
    if (!postRow?.id) return json(404, { error: 'Post not found.' })
    if (postRow.user_id !== user.id) return json(403, { error: 'Not allowed.' })

    try {
      const symbols = await resolveMarketSymbolsForAttach(caption, pickerSymbols)
      if (!symbols.length) {
        const { error } = await admin
          .from('community_feed_posts')
          .update({ market_embeds: [] })
          .eq('id', postId)
        if (error) throw new Error(error.message || 'Could not clear market embeds.')
        return json(200, { ok: true, embeds: [] })
      }
      const { embeds, skipped } = await attachMarketEmbeds(admin, postId, caption, symbols, origin)
      return json(200, {
        ok: true,
        embeds,
        ...(skipped.length ? { warnings: skipped } : {}),
      })
    } catch (e) {
      return json(502, { error: e instanceof Error ? e.message : 'Attach failed.' })
    }
  }

  return json(400, { error: 'Unknown action.' })
})
