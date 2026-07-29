/**
 * Cashtag logos on Cloudflare R2 — `market-logos/stocks/{TICKER}.png`, `market-logos/crypto/{coin_id}.png`.
 */
import { coingeckoCryptoLogo } from './coingeckoMarket.ts'
import { finnhubStockLogoUrl } from './finnhubMarket.ts'
import {
  loungeCfR2AllowedPublicOrigins,
  loungeCfR2PublicUrl,
  loungeCfR2PutObject,
  readLoungeCfR2Config,
  type LoungeCfR2Config,
} from './loungeCfR2.ts'
import type { MarketInstrumentRow } from './marketInstrumentRegistry.ts'

export const MARKET_LOGO_R2_PREFIX = 'market-logos'

const SOURCE_LOGO_HOST_SUFFIXES = [
  'finnhub.io',
  'coingecko.com',
  'coin-images.coingecko.com',
  'yimg.com',
  'clearbit.com',
  'googleusercontent.com',
]

function sanitizeMarketLogoFilePart(raw: string): string {
  return String(raw || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 120)
}

/** Public CDN URL for a mirrored logo (no network — key must match backfill). */
export function marketLogoR2PublicUrlForInstrument(
  cfg: LoungeCfR2Config,
  row: Pick<MarketInstrumentRow, 'asset_class' | 'display_symbol' | 'coin_id' | 'symbol'>,
): string {
  return loungeCfR2PublicUrl(cfg, marketLogoR2ObjectKey(row))
}

export function marketLogoR2ObjectKey(row: Pick<MarketInstrumentRow, 'asset_class' | 'display_symbol' | 'coin_id' | 'symbol'>): string {
  if (row.asset_class === 'crypto') {
    const coinId = sanitizeMarketLogoFilePart(String(row.coin_id || ''))
    const fallback = sanitizeMarketLogoFilePart(String(row.display_symbol || row.symbol || ''))
    const base = coinId || fallback || 'unknown'
    return `${MARKET_LOGO_R2_PREFIX}/crypto/${base}.png`
  }
  const ticker = sanitizeMarketLogoFilePart(String(row.display_symbol || row.symbol || ''))
  return `${MARKET_LOGO_R2_PREFIX}/stocks/${ticker || 'unknown'}.png`
}

export function isMarketLogoHostedOnR2(logoUrl: string, publicBaseUrl: string): boolean {
  const url = String(logoUrl || '').trim()
  if (!url) return false
  try {
    const parsed = new URL(url)
    const allowed = new Set(loungeCfR2AllowedPublicOrigins(null))
    const base = String(publicBaseUrl || '')
      .trim()
      .replace(/\/+$/, '')
    if (base) {
      try {
        allowed.add(new URL(base).origin)
      } catch {
        // ignore invalid configured base
      }
    }
    if (!allowed.has(parsed.origin)) return false
    return parsed.pathname.replace(/^\/+/, '').startsWith(`${MARKET_LOGO_R2_PREFIX}/`)
  } catch {
    return false
  }
}

function isAllowedSourceLogoUrl(url: string): boolean {
  try {
    const parsed = new URL(url)
    if (parsed.protocol !== 'https:') return false
    const host = parsed.hostname.toLowerCase()
    return SOURCE_LOGO_HOST_SUFFIXES.some((suffix) => host === suffix || host.endsWith(`.${suffix}`))
  } catch {
    return false
  }
}

export function readMarketLogoR2Config(): LoungeCfR2Config {
  const cfg = readLoungeCfR2Config()
  if (!cfg) {
    throw new Error(
      'Market logo R2 is not configured. Set LOUNGE_CF_R2_* and CLOUDFLARE_ACCOUNT_ID on the Edge function.',
    )
  }
  return cfg
}

export async function mirrorMarketLogoToR2(
  cfg: LoungeCfR2Config,
  row: MarketInstrumentRow,
  sourceUrl: string,
): Promise<string> {
  const src = String(sourceUrl || '').trim()
  if (!src || !isAllowedSourceLogoUrl(src)) return ''

  const res = await fetch(src, {
    headers: { Accept: 'image/*' },
    redirect: 'follow',
  })
  if (!res.ok) return ''

  const contentType = String(res.headers.get('content-type') || 'image/png').split(';')[0]?.trim() || 'image/png'
  if (!contentType.startsWith('image/')) return ''

  const bytes = new Uint8Array(await res.arrayBuffer())
  if (bytes.length < 32 || bytes.length > 2_000_000) return ''

  const objectKey = marketLogoR2ObjectKey(row)
  await loungeCfR2PutObject(cfg, objectKey, bytes, contentType)
  return loungeCfR2PublicUrl(cfg, objectKey)
}

export async function ensureMarketInstrumentLogoOnR2(
  row: MarketInstrumentRow,
  opts: { sourceUrl?: string; skipFinnhub?: boolean; skipCoingecko?: boolean } = {},
): Promise<string> {
  const cfg = readMarketLogoR2Config()
  const existing = String(row.logo_url || '').trim()
  if (existing && isMarketLogoHostedOnR2(existing, cfg.publicBaseUrl)) return existing

  let source = String(opts.sourceUrl || existing || '').trim()
  if (!source && row.asset_class === 'stock' && !opts.skipFinnhub) {
    source = String(await finnhubStockLogoUrl(row.symbol).catch(() => '')).trim()
  }
  if (!source && row.asset_class === 'crypto' && !opts.skipCoingecko) {
    source = String(await coingeckoCryptoLogo(row.symbol).catch(() => '')).trim()
  }
  if (!source) return existing

  const mirrored = await mirrorMarketLogoToR2(cfg, row, source)
  return mirrored || existing
}

export async function mirrorInstrumentRowsToR2(
  rows: MarketInstrumentRow[],
  concurrency = 8,
): Promise<{ rows: MarketInstrumentRow[]; r2_hits: number; finnhub_fetches: number }> {
  const out = rows.map((row) => ({ ...row }))
  let r2Hits = 0
  let finnhubFetches = 0
  const now = new Date().toISOString()
  const cfg = readMarketLogoR2Config()

  for (let i = 0; i < out.length; i += concurrency) {
    const slice = out.slice(i, i + concurrency)
    await Promise.all(
      slice.map(async (row, j) => {
        const idx = i + j
        const existing = String(row.logo_url || '').trim()
        if (existing && isMarketLogoHostedOnR2(existing, cfg.publicBaseUrl)) {
          r2Hits += 1
          return
        }
        let source = existing
        if (!source && row.asset_class === 'stock') {
          source = String(await finnhubStockLogoUrl(row.symbol).catch(() => '')).trim()
          if (source) finnhubFetches += 1
        }
        if (!source && row.asset_class === 'crypto') {
          source = String(await coingeckoCryptoLogo(row.symbol).catch(() => '')).trim()
        }
        if (!source) return
        const r2 = await mirrorMarketLogoToR2(cfg, row, source)
        if (!r2) return
        r2Hits += 1
        out[idx] = { ...row, logo_url: r2, metadata_updated_at: now }
      }),
    )
  }

  return { rows: out, r2_hits: r2Hits, finnhub_fetches: finnhubFetches }
}

export function isAllowedMarketLogoUrlForFetch(url: string, r2PublicBaseUrl = ''): boolean {
  const raw = String(url || '').trim()
  if (!raw) return false
  if (isAllowedSourceLogoUrl(raw)) return true
  const base = String(r2PublicBaseUrl || readLoungeCfR2Config()?.publicBaseUrl || '').trim()
  if (base && isMarketLogoHostedOnR2(raw, base)) return true
  return false
}
