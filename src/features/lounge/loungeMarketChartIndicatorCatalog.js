/** Indicator catalog - categories and definitions for Advanced market charts. */

/** @typedef {'overlay' | 'oscillator'} MarketChartIndicatorKind */
/** @typedef {'mas' | 'volatility' | 'momentum' | 'volume' | 'trend'} MarketChartIndicatorCategoryId */

/**
 * @typedef {Object} MarketChartIndicatorCategory
 * @property {MarketChartIndicatorCategoryId} id
 * @property {string} label
 */

/**
 * @typedef {Object} MarketChartIndicatorDef
 * @property {string} id
 * @property {MarketChartIndicatorCategoryId} category
 * @property {string} label
 * @property {MarketChartIndicatorKind} kind
 * @property {string} [color]
 */

export const MARKET_CHART_INDICATOR_CATEGORIES = /** @type {MarketChartIndicatorCategory[]} */ ([
  { id: 'mas', label: 'MAs' },
  { id: 'volatility', label: 'Volatility' },
  { id: 'momentum', label: 'Momentum' },
  { id: 'volume', label: 'Volume' },
  { id: 'trend', label: 'Trend' },
])

/** @type {MarketChartIndicatorDef[]} */
export const MARKET_CHART_INDICATORS = [
  // MAs
  { id: 'sma20', category: 'mas', label: 'SMA 20', kind: 'overlay', color: '#f59e0b' },
  { id: 'sma50', category: 'mas', label: 'SMA 50', kind: 'overlay', color: '#3b82f6' },
  { id: 'sma200', category: 'mas', label: 'SMA 200', kind: 'overlay', color: '#a855f7' },
  { id: 'ema9', category: 'mas', label: 'EMA 9', kind: 'overlay', color: '#06b6d4' },
  { id: 'ema21', category: 'mas', label: 'EMA 21', kind: 'overlay', color: '#ec4899' },
  { id: 'wma20', category: 'mas', label: 'WMA 20', kind: 'overlay', color: '#eab308' },
  { id: 'hma20', category: 'mas', label: 'HMA 20', kind: 'overlay', color: '#14b8a6' },
  { id: 'vwma20', category: 'mas', label: 'VWMA 20', kind: 'overlay', color: '#8b5cf6' },
  // Volatility
  { id: 'bb20', category: 'volatility', label: 'Bollinger 20', kind: 'overlay', color: '#94a3b8' },
  { id: 'keltner20', category: 'volatility', label: 'Keltner 20', kind: 'overlay', color: '#64748b' },
  { id: 'donchian20', category: 'volatility', label: 'Donchian 20', kind: 'overlay', color: '#78716c' },
  { id: 'atrBands20', category: 'volatility', label: 'ATR Bands 20', kind: 'overlay', color: '#a8a29e' },
  // Momentum
  { id: 'rsi14', category: 'momentum', label: 'RSI 14', kind: 'oscillator', color: '#c084fc' },
  { id: 'stoch14', category: 'momentum', label: 'Stochastic 14', kind: 'oscillator', color: '#f472b6' },
  { id: 'macd', category: 'momentum', label: 'MACD', kind: 'oscillator', color: '#38bdf8' },
  { id: 'cci20', category: 'momentum', label: 'CCI 20', kind: 'oscillator', color: '#fb7185' },
  { id: 'roc12', category: 'momentum', label: 'ROC 12', kind: 'oscillator', color: '#2dd4bf' },
  // Volume
  { id: 'obv', category: 'volume', label: 'OBV', kind: 'oscillator', color: '#84cc16' },
  { id: 'volProfile50', category: 'volume', label: 'Vol Profile 50', kind: 'overlay', color: '#ca8a04' },
  { id: 'ad', category: 'volume', label: 'A/D', kind: 'oscillator', color: '#65a30d' },
  // Trend
  { id: 'adx14', category: 'trend', label: 'ADX 14', kind: 'oscillator', color: '#f97316' },
  { id: 'ichimoku', category: 'trend', label: 'Ichimoku', kind: 'overlay', color: '#6366f1' },
  { id: 'psar', category: 'trend', label: 'Parabolic SAR', kind: 'overlay', color: '#0ea5e9' },
  { id: 'supertrend10', category: 'trend', label: 'Supertrend 10', kind: 'overlay', color: '#10b981' },
]

export const INDICATOR_BY_ID = Object.fromEntries(MARKET_CHART_INDICATORS.map((row) => [row.id, row]))

/** @param {MarketChartIndicatorCategoryId} categoryId */
export function listMarketChartIndicatorsByCategory(categoryId) {
  return MARKET_CHART_INDICATORS.filter((row) => row.category === categoryId)
}

/** @param {Set<string>|string[]} activeIds */
export function listActiveOscillatorIndicators(activeIds) {
  const ids = new Set(activeIds)
  return MARKET_CHART_INDICATORS.filter((row) => row.kind === 'oscillator' && ids.has(row.id))
}
