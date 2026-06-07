/**
 * Advanced chart resolution fetch — bar-count windows + pan-back chunks (not modal timeframe pills).
 */

import { aggregateMarketBarsToBucketSec } from './marketBarOhlc.ts'
import {
  fetchFinnhubCandlesAtResolution,
  finnhubSymbolForAsset,
  normalizeMarketBars,
  type MarketAssetClass,
  type MarketBar,
} from './finnhubMarket.ts'
import { yahooStockCandles } from './yahooMarket.ts'

export type MarketChartResolutionId = '1' | '5' | '15' | '30' | '60' | '120' | '240' | 'D' | 'W'

export type MarketChartResolutionConfig = {
  id: MarketChartResolutionId
  label: string
  finnhubResolution: string
  bucketSec?: number
  barSec: number
  initialBars: number
  chunkBars: number
  maxLookbackDays: number
}

export const MARKET_CHART_RESOLUTIONS: MarketChartResolutionConfig[] = [
  { id: '1', label: '1m', finnhubResolution: '1', barSec: 60, initialBars: 390, chunkBars: 200, maxLookbackDays: 30 },
  { id: '5', label: '5m', finnhubResolution: '5', barSec: 300, initialBars: 350, chunkBars: 200, maxLookbackDays: 30 },
  { id: '15', label: '15m', finnhubResolution: '15', barSec: 900, initialBars: 280, chunkBars: 200, maxLookbackDays: 90 },
  { id: '30', label: '30m', finnhubResolution: '30', barSec: 1800, initialBars: 280, chunkBars: 200, maxLookbackDays: 90 },
  { id: '60', label: '1H', finnhubResolution: '60', barSec: 3600, initialBars: 400, chunkBars: 200, maxLookbackDays: 730 },
  { id: '120', label: '2H', finnhubResolution: '60', bucketSec: 7200, barSec: 7200, initialBars: 400, chunkBars: 200, maxLookbackDays: 730 },
  { id: '240', label: '4H', finnhubResolution: '60', bucketSec: 14400, barSec: 14400, initialBars: 400, chunkBars: 200, maxLookbackDays: 730 },
  { id: 'D', label: 'Daily', finnhubResolution: 'D', barSec: 86400, initialBars: 280, chunkBars: 200, maxLookbackDays: 730 },
  { id: 'W', label: 'Weekly', finnhubResolution: 'W', barSec: 604800, initialBars: 110, chunkBars: 200, maxLookbackDays: 730 },
]

export const DEFAULT_MARKET_CHART_RESOLUTION_ID: MarketChartResolutionId = 'D'

const RESOLUTION_BY_ID = Object.fromEntries(
  MARKET_CHART_RESOLUTIONS.map((row) => [row.id, row]),
) as Record<string, MarketChartResolutionConfig>

export function getMarketChartResolution(id: string): MarketChartResolutionConfig {
  const key = String(id || '').trim()
  return RESOLUTION_BY_ID[key] || RESOLUTION_BY_ID[DEFAULT_MARKET_CHART_RESOLUTION_ID]
}

function barUnixSec(t: number): number {
  return Math.floor(t > 1e12 ? t / 1000 : t)
}

function yahooIntervalForResolution(config: MarketChartResolutionConfig): string {
  switch (config.id) {
    case '1':
      return '1m'
    case '5':
      return '5m'
    case '15':
      return '15m'
    case '30':
      return '30m'
    case '60':
    case '120':
    case '240':
      return '1h'
    case 'D':
      return '1d'
    case 'W':
      return '1wk'
    default:
      return '1d'
  }
}

function aggregateBarsToBucket(bars: MarketBar[], bucketSec: number): MarketBar[] {
  const normalized = bars.map((bar) => ({ ...bar, t: barUnixSec(bar.t) }))
  return aggregateMarketBarsToBucketSec(normalized, bucketSec)
}

function takeLastBars(bars: MarketBar[], limit: number): MarketBar[] {
  if (bars.length <= limit) return bars
  return bars.slice(-limit)
}

function fetchSpanSec(config: MarketChartResolutionConfig, barLimit: number): number {
  const sourceMultiplier = config.bucketSec ? Math.ceil(config.bucketSec / 3600) : 1
  const pad = config.bucketSec ? 24 : 12
  return config.barSec * (barLimit * sourceMultiplier + pad)
}

async function fetchRawBarsForWindow(
  symbol: string,
  assetClass: MarketAssetClass,
  config: MarketChartResolutionConfig,
  fromSec: number,
  toSec: number,
): Promise<MarketBar[]> {
  const finnhubSym = finnhubSymbolForAsset(symbol, assetClass)
  let bars = await fetchFinnhubCandlesAtResolution(
    finnhubSym,
    assetClass,
    fromSec,
    toSec,
    config.finnhubResolution,
  )

  if (bars.length < 2 && assetClass === 'stock') {
    bars = await yahooStockCandles(
      symbol,
      fromSec,
      toSec,
      yahooIntervalForResolution(config),
    )
  }

  bars = normalizeMarketBars(bars)
  if (config.bucketSec) {
    bars = aggregateBarsToBucket(bars, config.bucketSec)
  }
  return bars.filter((b) => {
    const t = barUnixSec(b.t)
    return t >= fromSec && t <= toSec
  })
}

function clipBarsBefore(bars: MarketBar[], beforeSec: number): MarketBar[] {
  const anchor = Math.floor(beforeSec)
  return bars.filter((b) => barUnixSec(b.t) < anchor)
}

export async function resolveMarketSeriesByResolution(
  symbol: string,
  assetClass: MarketAssetClass,
  resolutionId: string,
  barLimit?: number,
): Promise<{ bars: MarketBar[]; hasMore: boolean; windowLabel: string }> {
  const config = getMarketChartResolution(resolutionId)
  const limit = Math.min(500, Math.max(10, Math.floor(barLimit || config.initialBars)))
  const now = Math.floor(Date.now() / 1000)
  const minFromSec = now - config.maxLookbackDays * 86400
  const fromSec = Math.max(minFromSec, now - fetchSpanSec(config, limit))
  const raw = await fetchRawBarsForWindow(symbol, assetClass, config, fromSec, now)
  const bars = takeLastBars(raw, limit)
  const hasMore = bars.length >= 2 && barUnixSec(bars[0].t) > minFromSec
  return { bars, hasMore, windowLabel: config.label }
}

export async function resolveMarketBarsBeforeByResolution(
  symbol: string,
  assetClass: MarketAssetClass,
  resolutionId: string,
  beforeSec: number,
  barLimit?: number,
): Promise<{ bars: MarketBar[]; hasMore: boolean }> {
  const anchor = Math.floor(beforeSec)
  if (!Number.isFinite(anchor) || anchor <= 0) return { bars: [], hasMore: false }

  const config = getMarketChartResolution(resolutionId)
  const limit = Math.min(500, Math.max(10, Math.floor(barLimit || config.chunkBars)))
  const endSec = anchor - 1
  const now = Math.floor(Date.now() / 1000)
  const minFromSec = now - config.maxLookbackDays * 86400
  if (endSec <= minFromSec) return { bars: [], hasMore: false }

  const fromSec = Math.max(minFromSec, endSec - fetchSpanSec(config, limit))
  const raw = await fetchRawBarsForWindow(symbol, assetClass, config, fromSec, endSec)
  const clipped = clipBarsBefore(raw, anchor)
  const bars = takeLastBars(clipped, limit)
  const hasMore = bars.length >= 2 && barUnixSec(bars[0].t) > minFromSec
  return { bars, hasMore }
}
