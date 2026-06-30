/** Advanced chart candle resolution - bar count + pan-back depth (Quick chart keeps timeframe pills). */

export const LOUNGE_MARKET_CHART_RESOLUTION_STORAGE_KEY = 'loungeMarketChartResolution:v1'

/** @typedef {'1' | '5' | '15' | '60' | '120' | '240' | 'D' | 'W'} MarketChartResolutionId */

/**
 * @typedef {Object} MarketChartResolutionRow
 * @property {MarketChartResolutionId} id
 * @property {string} label
 * @property {number} initialBars
 * @property {number} chunkBars
 * @property {number} maxLookbackDays
 */

/** @type {MarketChartResolutionRow[]} */
export const MARKET_CHART_RESOLUTIONS = [
  { id: '1', label: '1m', initialBars: 390, chunkBars: 200, maxLookbackDays: 30 },
  { id: '5', label: '5m', initialBars: 350, chunkBars: 200, maxLookbackDays: 30 },
  { id: '15', label: '15m', initialBars: 280, chunkBars: 200, maxLookbackDays: 90 },
  { id: '60', label: '1H', initialBars: 400, chunkBars: 200, maxLookbackDays: 730 },
  { id: '120', label: '2H', initialBars: 400, chunkBars: 200, maxLookbackDays: 730 },
  { id: '240', label: '4H', initialBars: 400, chunkBars: 200, maxLookbackDays: 730 },
  { id: 'D', label: '1D', initialBars: 280, chunkBars: 200, maxLookbackDays: 730 },
  { id: 'W', label: '1W', initialBars: 110, chunkBars: 200, maxLookbackDays: 730 },
]

export const DEFAULT_MARKET_CHART_RESOLUTION_ID = /** @type {MarketChartResolutionId} */ ('D')

const RESOLUTION_BY_ID = Object.fromEntries(MARKET_CHART_RESOLUTIONS.map((row) => [row.id, row]))

/** @param {string} [id] */
export function getMarketChartResolution(id) {
  const key = String(id || '').trim()
  if (key === '30') return RESOLUTION_BY_ID['15']
  return RESOLUTION_BY_ID[key] || RESOLUTION_BY_ID[DEFAULT_MARKET_CHART_RESOLUTION_ID]
}

/** @returns {MarketChartResolutionId} */
export function readStoredMarketChartResolution() {
  if (typeof window === 'undefined') return DEFAULT_MARKET_CHART_RESOLUTION_ID
  try {
    const raw = String(window.localStorage.getItem(LOUNGE_MARKET_CHART_RESOLUTION_STORAGE_KEY) || '').trim()
    if (raw === '30') return '15'
    return RESOLUTION_BY_ID[raw] ? /** @type {MarketChartResolutionId} */ (raw) : DEFAULT_MARKET_CHART_RESOLUTION_ID
  } catch {
    return DEFAULT_MARKET_CHART_RESOLUTION_ID
  }
}

/** @param {MarketChartResolutionId} id */
export function writeStoredMarketChartResolution(id) {
  if (typeof window === 'undefined') return
  if (!RESOLUTION_BY_ID[id]) return
  try {
    window.localStorage.setItem(LOUNGE_MARKET_CHART_RESOLUTION_STORAGE_KEY, id)
  } catch {
    /* ignore quota / private mode */
  }
}

/** @param {{ symbol: string, asset_class: string, resolutionId: string }} scope */
export function advancedMarketSeriesScopeKey({ symbol, asset_class, resolutionId }) {
  return `${String(asset_class || '')}:${String(symbol || '').toUpperCase()}:${String(resolutionId || '')}`
}
