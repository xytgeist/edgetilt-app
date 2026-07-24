import { createClient } from 'npm:@supabase/supabase-js@2'
import {
  MARKET_CACHE_TTL_MS,
  MARKET_EMBED_MAX,
  buildMarketEmbed,
  buildRollingBatchPayload,
  embedQuoteCurrency,
  enrichSearchResultsForPicker,
  enrichSearchResultsLogosOnly,
  finnhubLatestNews,
  fetchLiveMarketCapUsd,
  finnhubProfile,
  finnhubQuote,
  finnhubSymbolForAsset,
  marketSearch,
  normalizeDisplaySymbol,
  normalizeMarketBarsToUsd,
  normalizeMarketCapToUsd,
  normalizeMarketQuoteToUsd,
  normalizeMarketSeriesToUsd,
  resolveMarketBars,
  resolveMarketBarsBefore,
  resolveMarketSymbolsForAttach,
  resolveCashtagsDisambiguationBatch,
  sortMarketSearchResults,
  type MarketAssetClass,
  type MarketEmbed,
  type MarketProfile,
  type MarketWindowKey,
} from '../_shared/finnhubMarket.ts'
import { resolveMarketSymbolLookup } from '../_shared/marketSymbolLookup.ts'
import {
  resolveMarketBarsBeforeByResolution,
  resolveMarketSeriesByResolution,
} from '../_shared/marketChartResolution.ts'
import { isUsEquityRegularSessionOpen, isUsableStockIntradayBars, STOCK_ROLLING_CLOSED_CACHE_TTL_MS } from '../_shared/usEquityMarketSession.ts'
import {
  attachCoingeckoDebugPayload,
  buildCoingeckoActionMeta,
  runCoingeckoUsageScope,
  shouldDebugCoingecko,
} from '../_shared/coingeckoUsageLog.ts'
import {
  marketInstrumentCacheKey,
  readMarketInstrument,
  readMarketInstrumentCoinId,
  upsertMarketInstrument,
  upsertMarketInstrumentFromEmbed,
} from '../_shared/marketInstrumentRegistry.ts'
import { coingeckoCoinIdForTicker } from '../_shared/marketCashtagCrypto.ts'

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

function isRollingCachePayloadValid(payload: unknown, assetClass: MarketAssetClass): boolean {
  if (!payload || typeof payload !== 'object') return false
  const bars = (payload as { bars?: unknown }).bars
  if (!Array.isArray(bars) || bars.length < 2) return false
  if (assetClass === 'stock') return isUsableStockIntradayBars(bars as Array<{ t: number; c: number }>)
  return true
}

async function readCache(
  admin: ReturnType<typeof createClient>,
  key: string,
  assetClass: MarketAssetClass,
) {
  const { data } = await admin
    .from('market_quote_cache')
    .select('payload,fetched_at')
    .eq('cache_key', key)
    .maybeSingle()
  if (!data?.payload || !data.fetched_at) return null
  if (!isRollingCachePayloadValid(data.payload, assetClass)) return null
  const age = Date.now() - new Date(String(data.fetched_at)).getTime()
  const ttl =
    assetClass === 'stock' && !isUsEquityRegularSessionOpen()
      ? STOCK_ROLLING_CLOSED_CACHE_TTL_MS
      : MARKET_CACHE_TTL_MS
  if (age > ttl) return null
  return data.payload
}

async function writeCache(
  admin: ReturnType<typeof createClient>,
  key: string,
  symbol: string,
  assetClass: string,
  payload: unknown,
) {
  if (!isRollingCachePayloadValid(payload, assetClass as MarketAssetClass)) return
  await admin.from('market_quote_cache').upsert({
    cache_key: key,
    symbol,
    asset_class: assetClass,
    payload,
    fetched_at: new Date().toISOString(),
  })
}

function parseSymbolInput(raw: unknown): {
  symbol: string
  asset_class: MarketAssetClass
  coin_id?: string
} | null {
  const symbol = String(raw?.symbol || raw || '').trim()
  if (!symbol) return null
  const asset_class = (String(raw?.asset_class || '').trim() === 'crypto'
    ? 'crypto'
    : 'stock') as MarketAssetClass
  const coin_id = String(raw?.coin_id || raw?.coinId || '').trim() || undefined
  return { symbol, asset_class, coin_id }
}

const MARKET_INSTRUMENT_METADATA_TTL_MS = 7 * 24 * 60 * 60 * 1000

async function resolveCoinIdForSymbol(
  admin: ReturnType<typeof createClient>,
  symbol: string,
  assetClass: MarketAssetClass,
  hint?: string,
): Promise<string | undefined> {
  const fromHint = String(hint || '').trim()
  if (fromHint) return fromHint
  const fromRegistry = await readMarketInstrumentCoinId(admin, symbol, assetClass)
  if (fromRegistry) return fromRegistry
  if (assetClass === 'crypto') {
    const mapped = coingeckoCoinIdForTicker(normalizeDisplaySymbol(finnhubSymbolForAsset(symbol, assetClass), assetClass))
    if (mapped) return mapped
  }
  return undefined
}

async function loadMarketProfileContext(
  admin: ReturnType<typeof createClient>,
  symbol: string,
  assetClass: MarketAssetClass,
  coinIdHint?: string,
): Promise<{ profile: MarketProfile; coinId?: string }> {
  const coinId = await resolveCoinIdForSymbol(admin, symbol, assetClass, coinIdHint)
  const row = await readMarketInstrument(admin, marketInstrumentCacheKey(symbol, assetClass))
  if (row?.name && row.metadata_updated_at) {
    const age = Date.now() - new Date(String(row.metadata_updated_at)).getTime()
    if (age <= MARKET_INSTRUMENT_METADATA_TTL_MS) {
      return {
        profile: {
          name: row.name,
          exchange: row.exchange,
          logo: row.logo_url,
          marketCapitalization: null,
          currency: row.listing_currency || 'USD',
          coinId: row.coin_id || coinId || undefined,
        },
        coinId: row.coin_id || coinId || undefined,
      }
    }
  }
  const profile = await finnhubProfile(symbol, assetClass)
  const resolvedCoinId = profile.coinId || coinId || undefined
  try {
    await upsertMarketInstrument(admin, {
      cache_key: marketInstrumentCacheKey(symbol, assetClass),
      display_symbol: normalizeDisplaySymbol(finnhubSymbolForAsset(symbol, assetClass), assetClass),
      asset_class: assetClass,
      symbol: finnhubSymbolForAsset(symbol, assetClass),
      coin_id: resolvedCoinId || null,
      name: profile.name,
      exchange: profile.exchange,
      logo_url: profile.logo,
      market_cap_usd: null,
      listing_currency: profile.currency || 'USD',
      metadata_updated_at: new Date().toISOString(),
    })
  } catch {
    /* registry optional until migration applied */
  }
  return { profile, coinId: resolvedCoinId }
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
      await upsertMarketInstrumentFromEmbed(admin, embed)
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

function bytesToBase64(bytes: Uint8Array): string {
  let binary = ''
  const chunkSize = 0x8000
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize)
    binary += String.fromCharCode(...chunk)
  }
  return btoa(binary)
}

function isAllowedMarketLogoUrl(url: string): boolean {
  try {
    const parsed = new URL(url)
    if (parsed.protocol !== 'https:') return false
    const host = parsed.hostname.toLowerCase()
    const allowedSuffixes = [
      'finnhub.io',
      'coingecko.com',
      'yimg.com',
      'clearbit.com',
      'googleusercontent.com',
    ]
    return allowedSuffixes.some((suffix) => host === suffix || host.endsWith(`.${suffix}`))
  } catch {
    return false
  }
}

async function resolveMarketLogoUrl(
  urlRaw: unknown,
  symbol: string,
  asset_class: MarketAssetClass,
): Promise<string> {
  let url = String(urlRaw || '').trim()
  if (url) return url
  if (!symbol) return ''
  try {
    const profile = await finnhubProfile(symbol, asset_class)
    url = String(profile.logo || '').trim()
  } catch {
    url = ''
  }
  return url
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

  return runCoingeckoUsageScope(
    {
      action: action || 'unknown',
      meta: buildCoingeckoActionMeta(action, body),
      emitConsoleLog: shouldDebugCoingecko(body),
    },
    async () => {
      const respond = (status: number, payload: Record<string, unknown>) =>
        json(status, attachCoingeckoDebugPayload(body, payload))

  if (action === 'search') {
    const q = String(body?.query || body?.q || '').trim()
    if (q.length < 1) return respond(400, { error: 'query is required.' })
    try {
      const results = await marketSearch(q)
      const enriched = await enrichSearchResultsForPicker(results.slice(0, 8))
      return respond(200, { ok: true, results: sortMarketSearchResults(q, enriched) })
    } catch (e) {
      return respond(502, { error: e instanceof Error ? e.message : 'Search failed.' })
    }
  }

  if (action === 'symbol_universe') {
    return respond(410, {
      error:
        'symbol_universe is deprecated. Cashtag typeahead uses bundled seed + resolve_symbol; daily sync runs via lounge-market-symbol-sync cron.',
    })
  }

  if (action === 'resolve_symbol') {
    const q = String(body?.query || body?.q || '').trim()
    if (q.length < 1) return respond(400, { error: 'query is required.' })
    try {
      const results = await resolveMarketSymbolLookup(admin, q)
      return respond(200, { ok: true, results })
    } catch (e) {
      return respond(502, { error: e instanceof Error ? e.message : 'Symbol resolve failed.' })
    }
  }

  if (action === 'enrich_logos') {
    const raw = Array.isArray(body?.symbols) ? body.symbols : []
    const rows = raw
      .slice(0, 8)
      .map((row) => {
        const parsed = parseSymbolInput(row)
        if (!parsed) return null
        const r = row && typeof row === 'object' ? (row as Record<string, unknown>) : {}
        return {
          symbol: parsed.symbol,
          asset_class: parsed.asset_class,
          display_symbol: String(r.display_symbol || parsed.symbol || '').trim(),
          logo_url: String(r.logo_url || r.logo || '').trim(),
          coin_id: String(r.coin_id || '').trim(),
        }
      })
      .filter(Boolean)
    if (!rows.length) return respond(400, { error: 'symbols is required.' })
    try {
      const results = await enrichSearchResultsLogosOnly(rows)
      return respond(200, { ok: true, results })
    } catch (e) {
      return respond(502, { error: e instanceof Error ? e.message : 'Logo enrich failed.' })
    }
  }

  if (action === 'enrich_symbols') {
    const raw = Array.isArray(body?.symbols) ? body.symbols : []
    const rows = raw
      .slice(0, 8)
      .map((row) => {
        const parsed = parseSymbolInput(row)
        if (!parsed) return null
        const r = row && typeof row === 'object' ? (row as Record<string, unknown>) : {}
        const name = String(r.name || r.description || '').trim()
        const exchange = String(r.exchange || r.type || '').trim()
        return {
          symbol: parsed.symbol,
          asset_class: parsed.asset_class,
          display_symbol: String(r.display_symbol || parsed.symbol || '').trim(),
          name,
          description: name,
          exchange,
          type: exchange,
          logo_url: String(r.logo_url || r.logo || '').trim(),
          coin_id: String(r.coin_id || '').trim(),
        }
      })
      .filter(Boolean)
    if (!rows.length) return respond(400, { error: 'symbols is required.' })
    try {
      const results = await enrichSearchResultsForPicker(rows)
      return respond(200, { ok: true, results })
    } catch (e) {
      return respond(502, { error: e instanceof Error ? e.message : 'Symbol enrich failed.' })
    }
  }

  if (action === 'resolve_cashtags') {
    const rawTags = Array.isArray(body?.tags) ? body.tags : []
    const tags = rawTags
      .map((t) => String(t || '').trim().toUpperCase())
      .filter((t) => t.length > 0)
    if (!tags.length) return respond(400, { error: 'tags is required.' })
    try {
      const by_tag = await resolveCashtagsDisambiguationBatch(tags)
      return respond(200, { ok: true, by_tag })
    } catch (e) {
      return respond(502, { error: e instanceof Error ? e.message : 'Cashtag resolve failed.' })
    }
  }

  if (action === 'preview') {
    const parsed = parseSymbolInput(body)
    if (!parsed) return respond(400, { error: 'symbol is required.' })
    try {
      const preview = await previewSymbol(parsed.symbol, parsed.asset_class)
      return respond(200, { ok: true, preview })
    } catch (e) {
      return respond(502, { error: e instanceof Error ? e.message : 'Preview failed.' })
    }
  }

  if (action === 'modal_news') {
    const parsed = parseSymbolInput(body)
    if (!parsed) return respond(400, { error: 'symbol is required.' })
    try {
      const news = await finnhubLatestNews(parsed.symbol, parsed.asset_class)
      return respond(200, { ok: true, news })
    } catch (e) {
      return respond(502, { error: e instanceof Error ? e.message : 'News failed.' })
    }
  }

  if (action === 'logo_image') {
    const parsed = parseSymbolInput(body)
    const symbol = parsed?.symbol || String(body?.symbol || '').trim()
    const asset_class = (parsed?.asset_class ||
      (String(body?.asset_class || '').trim() === 'crypto' ? 'crypto' : 'stock')) as MarketAssetClass
    try {
      const logoUrl = await resolveMarketLogoUrl(body?.url, symbol, asset_class)
      if (!logoUrl || !isAllowedMarketLogoUrl(logoUrl)) {
        return respond(404, { error: 'Logo unavailable.' })
      }
      const res = await fetch(logoUrl, {
        headers: { 'User-Agent': 'LVSlotPro lounge-market-data/1' },
      })
      if (!res.ok) return respond(502, { error: 'Logo fetch failed.' })
      const bytes = new Uint8Array(await res.arrayBuffer())
      if (!bytes.length) return respond(502, { error: 'Empty logo.' })
      return respond(200, {
        ok: true,
        content_type: res.headers.get('content-type') || 'image/png',
        data_base64: bytesToBase64(bytes),
      })
    } catch (e) {
      return respond(502, { error: e instanceof Error ? e.message : 'Logo failed.' })
    }
  }

  if (action === 'modal_series') {
    const parsed = parseSymbolInput(body)
    if (!parsed) return respond(400, { error: 'symbol is required.' })
    const resolutionId = String(body?.resolution || '').trim()
    const barLimitRaw = body?.bar_limit
    const barLimit =
      barLimitRaw != null && barLimitRaw !== ''
        ? Math.min(500, Math.max(10, Math.floor(Number(barLimitRaw))))
        : undefined
    const windowKey = (String(body?.window_key || '24h').trim() || '24h') as MarketWindowKey
    const kind = String(body?.kind || 'rolling')
    const beforeSecRaw = body?.before_sec
    if (beforeSecRaw != null && beforeSecRaw !== '') {
      const beforeSec = Number(beforeSecRaw)
      if (!Number.isFinite(beforeSec) || beforeSec <= 0) {
        return respond(400, { error: 'Invalid before_sec.' })
      }
      try {
        const { profile, coinId } = await loadMarketProfileContext(
          admin,
          parsed.symbol,
          parsed.asset_class,
          parsed.coin_id,
        )
        const currency = embedQuoteCurrency(profile.exchange, profile.currency)
        if (resolutionId) {
          const { bars, hasMore } = await resolveMarketBarsBeforeByResolution(
            parsed.symbol,
            parsed.asset_class,
            resolutionId,
            beforeSec,
            barLimit,
            coinId,
          )
          const normalizedBars = await normalizeMarketBarsToUsd(bars, currency)
          return respond(200, { ok: true, bars: normalizedBars, has_more: hasMore })
        }
        const extendWindowKey = (kind === 'rolling' ? '24h' : windowKey) as MarketWindowKey
        const { bars, hasMore } = await resolveMarketBarsBefore(
          parsed.symbol,
          parsed.asset_class,
          extendWindowKey,
          beforeSec,
        )
        const normalizedBars = await normalizeMarketBarsToUsd(bars, currency)
        return respond(200, { ok: true, bars: normalizedBars, has_more: hasMore })
      } catch (e) {
        return respond(502, { error: e instanceof Error ? e.message : 'Series extend failed.' })
      }
    }
    if (resolutionId) {
      try {
        const { profile, coinId } = await loadMarketProfileContext(
          admin,
          parsed.symbol,
          parsed.asset_class,
          parsed.coin_id,
        )
        const currency = embedQuoteCurrency(profile.exchange, profile.currency)
        const quote = await finnhubQuote(parsed.symbol, parsed.asset_class)
        const { bars, hasMore, windowLabel } = await resolveMarketSeriesByResolution(
          parsed.symbol,
          parsed.asset_class,
          resolutionId,
          barLimit,
          coinId,
        )
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
        const market_cap = await fetchLiveMarketCapUsd(parsed.symbol, parsed.asset_class, coinId)
        return respond(200, {
          ok: true,
          quote: normalized.quote,
          bars: normalized.bars,
          has_more: hasMore,
          window_label: windowLabel,
          resolution: resolutionId,
          market_cap,
        })
      } catch (e) {
        return respond(502, { error: e instanceof Error ? e.message : 'Resolution series failed.' })
      }
    }
    try {
      if (kind === 'historical') {
        const { profile, coinId } = await loadMarketProfileContext(
          admin,
          parsed.symbol,
          parsed.asset_class,
          parsed.coin_id,
        )
        const currency = embedQuoteCurrency(profile.exchange, profile.currency)
        const quote = await finnhubQuote(parsed.symbol, parsed.asset_class)
        const bars = await resolveMarketBars(parsed.symbol, parsed.asset_class, windowKey, quote, {
          coinId,
        })
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
        const market_cap = await fetchLiveMarketCapUsd(parsed.symbol, parsed.asset_class, coinId)
        return respond(200, {
          ok: true,
          quote: normalized.quote,
          bars: normalized.bars,
          window_label: windowKey.toUpperCase(),
          market_cap,
        })
      }
      const coinId = await resolveCoinIdForSymbol(admin, parsed.symbol, parsed.asset_class, parsed.coin_id)
      const [payload, market_cap] = await Promise.all([
        buildRollingBatchPayload(parsed.symbol, parsed.asset_class, { coinId }),
        fetchLiveMarketCapUsd(parsed.symbol, parsed.asset_class, coinId),
      ])
      return respond(200, { ok: true, ...payload, market_cap })
    } catch (e) {
      return respond(502, { error: e instanceof Error ? e.message : 'Series failed.' })
    }
  }

  if (action === 'batch_rolling') {
    const raw = Array.isArray(body?.symbols) ? body.symbols : []
    const refresh = body?.refresh === true
    const items = raw
      .map((row) => parseSymbolInput(row))
      .filter(Boolean) as Array<{ symbol: string; asset_class: MarketAssetClass }>
    const unique = new Map<
      string,
      { symbol: string; asset_class: MarketAssetClass; coin_id?: string }
    >()
    for (const item of items) {
      const key = cacheKey(finnhubSymbolForAsset(item.symbol, item.asset_class), item.asset_class)
      if (!unique.has(key)) unique.set(key, item)
    }
    const out: Record<string, unknown> = {}
    for (const [key, item] of unique.entries()) {
      if (!refresh) {
        const cached = await readCache(admin, key, item.asset_class)
        if (cached) {
          out[key] = cached
          continue
        }
      }
      try {
        const coinId = await resolveCoinIdForSymbol(admin, item.symbol, item.asset_class, item.coin_id)
        const payload = await buildRollingBatchPayload(item.symbol, item.asset_class, { coinId })
        await writeCache(admin, key, finnhubSymbolForAsset(item.symbol, item.asset_class), item.asset_class, payload)
        out[key] = payload
      } catch {
        /* skip symbol on failure */
      }
    }
    return respond(200, { ok: true, quotes: out })
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
    if (!postId) return respond(400, { error: 'post_id is required.' })

    const { data: postRow } = await admin
      .from('community_feed_posts')
      .select('id,user_id')
      .eq('id', postId)
      .maybeSingle()
    if (!postRow?.id) return respond(404, { error: 'Post not found.' })
    if (postRow.user_id !== user.id) return respond(403, { error: 'Not allowed.' })

    try {
      const symbols = await resolveMarketSymbolsForAttach(caption, pickerSymbols)
      if (!symbols.length) {
        const { error } = await admin
          .from('community_feed_posts')
          .update({ market_embeds: [] })
          .eq('id', postId)
        if (error) throw new Error(error.message || 'Could not clear market embeds.')
        return respond(200, { ok: true, embeds: [] })
      }
      const { embeds, skipped } = await attachMarketEmbeds(admin, postId, caption, symbols, origin)
      return respond(200, {
        ok: true,
        embeds,
        ...(skipped.length ? { warnings: skipped } : {}),
      })
    } catch (e) {
      return respond(502, { error: e instanceof Error ? e.message : 'Attach failed.' })
    }
  }

  return respond(400, { error: 'Unknown action.' })
    },
  )
})
