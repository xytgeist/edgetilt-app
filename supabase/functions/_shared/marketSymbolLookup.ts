/**
 * Cashtag symbol lookup table — backed by `market_instruments`.
 * Daily bulk: all tickers; logos for new crypto (CoinGecko) + new stocks only (Yahoo/Finnhub).
 * Miss fallback: resolve one query, upsert, return rows.
 */

import type { SupabaseClient } from 'npm:@supabase/supabase-js@2'
import { coingeckoCryptoUniverse } from './coingeckoMarket.ts'
import {
  enrichSearchResultsLogosOnly,
  finnhubSymbolForAsset,
  finnhubUsStockUniverse,
  marketSearch,
  sortMarketSearchResults,
  type MarketAssetClass,
  type MarketSymbolUniverseRow,
} from './finnhubMarket.ts'
import { withCashtagRowLogo } from './marketCashtagLogos.ts'
import {
  marketInstrumentCacheKey,
  upsertMarketInstrument,
  type MarketInstrumentRow,
} from './marketInstrumentRegistry.ts'

const LOOKUP_SYNC_TTL_MS = 24 * 60 * 60 * 1000
const UPSERT_CHUNK = 400
const NEW_STOCK_LOGO_CONCURRENCY = 8
/** Cap new stock logo fetches per daily sync — rest fill on miss fallback. */
const NEW_STOCK_LOGO_CAP_PER_SYNC = 50

type LookupMeta = { last_sync_at: string; row_count: number }

function instrumentToUniverseRow(row: MarketInstrumentRow): MarketSymbolUniverseRow {
  return {
    symbol: row.symbol,
    display_symbol: row.display_symbol,
    asset_class: row.asset_class,
    name: row.name,
    exchange: row.exchange,
    coin_id: row.coin_id || undefined,
    logo_url: row.logo_url || undefined,
  }
}

function universeRowToInstrument(row: MarketSymbolUniverseRow): MarketInstrumentRow {
  const assetClass = row.asset_class
  const symbol = String(row.symbol || '').trim()
  return {
    cache_key: marketInstrumentCacheKey(symbol, assetClass),
    display_symbol: String(row.display_symbol || symbol).trim().toUpperCase(),
    asset_class: assetClass,
    symbol,
    coin_id: row.coin_id ? String(row.coin_id).trim() : null,
    name: String(row.name || row.display_symbol || symbol).trim(),
    exchange: String(row.exchange || (assetClass === 'crypto' ? 'Crypto' : 'US')).trim(),
    logo_url: String(row.logo_url || '').trim(),
    market_cap_usd: null,
    listing_currency: 'USD',
    metadata_updated_at: new Date().toISOString(),
  }
}

async function readLookupMeta(admin: SupabaseClient): Promise<LookupMeta> {
  const { data } = await admin.from('market_symbol_lookup_meta').select('last_sync_at, row_count').eq('id', 1).maybeSingle()
  return {
    last_sync_at: String(data?.last_sync_at || '1970-01-01T00:00:00.000Z'),
    row_count: Number(data?.row_count) || 0,
  }
}

async function writeLookupMeta(admin: SupabaseClient, rowCount: number) {
  await admin.from('market_symbol_lookup_meta').upsert({
    id: 1,
    last_sync_at: new Date().toISOString(),
    row_count: rowCount,
  })
}

async function fetchProviderUniverse(): Promise<MarketSymbolUniverseRow[]> {
  const [stocks, cryptos] = await Promise.all([
    finnhubUsStockUniverse().catch(() => [] as MarketSymbolUniverseRow[]),
    coingeckoCryptoUniverse(4).catch(() => []),
  ])

  return [
    ...stocks,
    ...cryptos.map((row) => ({
      symbol: row.symbol,
      display_symbol: row.display_symbol,
      asset_class: 'crypto' as const,
      name: row.description,
      exchange: 'Crypto',
      coin_id: row.coin_id || undefined,
      logo_url: row.logo_url || undefined,
    })),
  ].map((row) => withCashtagRowLogo(row))
}

async function readExistingCacheKeys(admin: SupabaseClient): Promise<Set<string>> {
  const keys = new Set<string>()
  const pageSize = 5000
  let from = 0
  while (true) {
    const { data, error } = await admin
      .from('market_instruments')
      .select('cache_key')
      .range(from, from + pageSize - 1)
    if (error) throw error
    const rows = Array.isArray(data) ? data : []
    for (const row of rows) {
      const key = String(row?.cache_key || '').trim().toLowerCase()
      if (key) keys.add(key)
    }
    if (rows.length < pageSize) break
    from += pageSize
  }
  return keys
}

async function enrichNewStockLogos(rows: MarketSymbolUniverseRow[]): Promise<MarketSymbolUniverseRow[]> {
  const out = [...rows]
  for (let i = 0; i < out.length; i += NEW_STOCK_LOGO_CONCURRENCY) {
    const slice = out.slice(i, i + NEW_STOCK_LOGO_CONCURRENCY)
    const enriched = await enrichSearchResultsLogosOnly(
      slice.map((row) => ({
        symbol: row.symbol,
        asset_class: row.asset_class as MarketAssetClass,
        display_symbol: row.display_symbol,
        logo_url: row.logo_url,
      })),
    )
    for (let j = 0; j < slice.length; j += 1) {
      const logo = String(enriched[j]?.logo_url || '').trim()
      if (logo) out[i + j] = { ...out[i + j], logo_url: logo }
    }
  }
  return out
}

async function upsertInstrumentRows(admin: SupabaseClient, rows: MarketInstrumentRow[]) {
  for (let i = 0; i < rows.length; i += UPSERT_CHUNK) {
    const chunk = rows.slice(i, i + UPSERT_CHUNK)
    await Promise.all(chunk.map((row) => upsertMarketInstrument(admin, row)))
  }
}

/** Daily bulk sync — tickers for all; logos for new crypto + new stocks only. */
export async function syncMarketSymbolLookup(admin: SupabaseClient): Promise<{ row_count: number }> {
  const existingKeys = await readExistingCacheKeys(admin)
  const providerRows = await fetchProviderUniverse()

  const newStockRows: MarketSymbolUniverseRow[] = []
  const upsertRows: MarketInstrumentRow[] = []

  for (const row of providerRows) {
    const key = marketInstrumentCacheKey(row.symbol, row.asset_class).toLowerCase()
    const isNew = !existingKeys.has(key)
    let next = row

    if (isNew && row.asset_class === 'stock') {
      newStockRows.push(row)
    }

    upsertRows.push(universeRowToInstrument(next))
  }

  if (newStockRows.length) {
    const toEnrich = newStockRows.slice(0, NEW_STOCK_LOGO_CAP_PER_SYNC)
    const withLogos = await enrichNewStockLogos(toEnrich)
    const logoByKey = new Map(
      withLogos.map((row) => [marketInstrumentCacheKey(row.symbol, row.asset_class).toLowerCase(), row.logo_url || '']),
    )
    for (const inst of upsertRows) {
      const logo = logoByKey.get(inst.cache_key)
      if (logo) inst.logo_url = logo
    }
  }

  await upsertInstrumentRows(admin, upsertRows)
  const { count } = await admin.from('market_instruments').select('*', { count: 'exact', head: true })
  await writeLookupMeta(admin, count || upsertRows.length)
  return { row_count: count || upsertRows.length }
}

export async function syncMarketSymbolLookupIfStale(admin: SupabaseClient): Promise<boolean> {
  const meta = await readLookupMeta(admin)
  const last = Date.parse(meta.last_sync_at)
  const stale = !Number.isFinite(last) || Date.now() - last > LOOKUP_SYNC_TTL_MS || meta.row_count < 500
  if (!stale) return false
  await syncMarketSymbolLookup(admin)
  return true
}

export async function readMarketSymbolLookup(admin: SupabaseClient): Promise<{
  updated_at: string
  rows: MarketSymbolUniverseRow[]
}> {
  const meta = await readLookupMeta(admin)
  const rows: MarketSymbolUniverseRow[] = []
  const pageSize = 5000
  let from = 0
  while (true) {
    const { data, error } = await admin
      .from('market_instruments')
      .select('cache_key, display_symbol, asset_class, symbol, coin_id, name, exchange, logo_url')
      .range(from, from + pageSize - 1)
    if (error) throw error
    const batch = Array.isArray(data) ? data : []
    for (const row of batch) {
      rows.push(
        withCashtagRowLogo(
          instrumentToUniverseRow({
            ...(row as MarketInstrumentRow),
            market_cap_usd: null,
            listing_currency: 'USD',
            metadata_updated_at: meta.last_sync_at,
          }),
        ),
      )
    }
    if (batch.length < pageSize) break
    from += pageSize
  }
  return { updated_at: meta.last_sync_at, rows }
}

/** Prefix search in cron-synced `market_instruments` (no upstream API). */
export async function searchMarketSymbolLookupInDb(
  admin: SupabaseClient,
  query: string,
  limit = 8,
): Promise<MarketSymbolUniverseRow[]> {
  const q = String(query || '').trim()
  if (q.length < 1) return []

  const prefix = q.toUpperCase()
  const { data, error } = await admin
    .from('market_instruments')
    .select('display_symbol, asset_class, symbol, coin_id, name, exchange, logo_url')
    .ilike('display_symbol', `${prefix}%`)
    .limit(Math.max(limit * 2, 16))

  if (error || !Array.isArray(data) || !data.length) return []

  const rows = data.map((row) =>
    withCashtagRowLogo(
      instrumentToUniverseRow({
        cache_key: marketInstrumentCacheKey(String(row.symbol || ''), row.asset_class as MarketAssetClass),
        display_symbol: String(row.display_symbol || row.symbol || '').trim(),
        asset_class: row.asset_class as MarketAssetClass,
        symbol: String(row.symbol || '').trim(),
        coin_id: row.coin_id ? String(row.coin_id).trim() : null,
        name: String(row.name || row.display_symbol || row.symbol || '').trim(),
        exchange: String(row.exchange || '').trim(),
        logo_url: String(row.logo_url || '').trim(),
        market_cap_usd: null,
        listing_currency: 'USD',
        metadata_updated_at: new Date().toISOString(),
      }),
    ),
  )

  return sortMarketSearchResults(q, rows).slice(0, limit)
}

/** Miss fallback — DB prefix first, then provider search; upsert matches, return up to 8 rows. */
export async function resolveMarketSymbolLookup(
  admin: SupabaseClient,
  query: string,
): Promise<MarketSymbolUniverseRow[]> {
  const q = String(query || '').trim()
  if (q.length < 1) return []

  const dbHits = await searchMarketSymbolLookupInDb(admin, q, 8)
  if (dbHits.length) return dbHits

  const found = await marketSearch(q)
  if (!found.length) return []

  const top = found.slice(0, 8)
  const enriched = await enrichSearchResultsLogosOnly(
    top.map((row) => ({
      symbol: row.symbol,
      asset_class: row.asset_class,
      display_symbol: row.display_symbol,
      logo_url: row.logo_url,
      coin_id: 'coin_id' in row ? String((row as { coin_id?: string }).coin_id || '') : '',
    })),
  )

  const enrichedByKey = new Map(
    enriched.map((row) => [`${row.asset_class}:${row.symbol}`.toLowerCase(), row]),
  )

  const merged = top.map((row) => {
    const key = `${row.asset_class}:${row.symbol}`.toLowerCase()
    const logoRow = enrichedByKey.get(key)
    return {
      ...row,
      logo_url: String(logoRow?.logo_url || row.logo_url || '').trim(),
    }
  })

  const sorted = sortMarketSearchResults(q, merged).slice(0, 8)
  const rows: MarketSymbolUniverseRow[] = []

  for (const row of sorted) {
    const assetClass = row.asset_class
    const symbol = finnhubSymbolForAsset(row.symbol, assetClass)
    const universeRow: MarketSymbolUniverseRow = withCashtagRowLogo({
      symbol,
      display_symbol: String(row.display_symbol || row.symbol || '').trim().toUpperCase(),
      asset_class: assetClass,
      name: String(row.name || row.description || row.display_symbol || row.symbol || '').trim(),
      exchange: String(row.exchange || row.type || (assetClass === 'crypto' ? 'Crypto' : 'US')).trim(),
      logo_url: String(row.logo_url || '').trim(),
      coin_id:
        'coin_id' in row && String((row as { coin_id?: string }).coin_id || '').trim()
          ? String((row as { coin_id?: string }).coin_id).trim()
          : undefined,
    })
    rows.push(universeRow)
    await upsertMarketInstrument(admin, universeRowToInstrument(universeRow))
  }

  return rows
}
