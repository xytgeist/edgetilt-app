/**
 * Buffalo Diamond free-games meter breakeven math (VCT / empirical defaults).
 * All values in **bet units** unless noted.
 */

/** @typedef {{ key: string, label: string, shortLabel: string, mult: number, spinsToBonus: number, avgPayPerSpin: number, guidePlayLine: number, defaultDiamondSpi: number, diamondLandFreq: number, accent: string, text: string, sliderAccent: string }} BuffaloDiamondTier */

/**
 * Reel-5 colored diamond landing frequency (green : blue : gold ≈ 4 : 2 : 1).
 * Effective SPI defaults below are calibrated to hit play lines at default RTP / base adj.
 */
export const DIAMOND_LAND_FREQ_RATIO = { green: 4, blue: 2, gold: 1 }

/** @type {BuffaloDiamondTier[]} */
export const BUFFALO_DIAMOND_TIERS = [
  {
    key: 'green',
    label: 'Green 2×',
    shortLabel: '2× Green',
    mult: 2,
    spinsToBonus: 240,
    avgPayPerSpin: 3.56,
    guidePlayLine: 24,
    defaultDiamondSpi: 12,
    diamondLandFreq: DIAMOND_LAND_FREQ_RATIO.green,
    accent: 'emerald',
    text: 'text-emerald-400',
    sliderAccent: 'accent-emerald-500',
  },
  {
    key: 'blue',
    label: 'Blue 3×',
    shortLabel: '3× Blue',
    mult: 3,
    spinsToBonus: 840,
    avgPayPerSpin: 5.86,
    guidePlayLine: 59,
    defaultDiamondSpi: 87,
    diamondLandFreq: DIAMOND_LAND_FREQ_RATIO.blue,
    accent: 'sky',
    text: 'text-sky-400',
    sliderAccent: 'accent-sky-500',
  },
  {
    key: 'gold',
    label: 'Gold 4×',
    shortLabel: '4× Gold',
    mult: 4,
    spinsToBonus: 3000,
    avgPayPerSpin: 7.46,
    guidePlayLine: 159,
    defaultDiamondSpi: 165,
    diamondLandFreq: DIAMOND_LAND_FREQ_RATIO.gold,
    accent: 'amber',
    text: 'text-amber-400',
    sliderAccent: 'accent-amber-500',
  },
]

export const METER_RESET = 7
export const METER_SLIDER_MAX = 180

/** Default base-game grind RTP (excludes wheel FG value) at typical .75 bet level. */
export const DEFAULT_BASE_GAME_RTP = 66
/** 1× FG baseline subtracted from multiplier FG value (~half of 2× tracked return). */
export const DEFAULT_BASE_ADJUSTMENT = 1.7
export const DEFAULT_VARIANCE_BUFFER_PCT = 0

/**
 * Breakeven banked free games for one multiplier tier.
 *   [(spinsToBonus × (1 − baseRtp)) / (avgPay − baseAdj)] − (spinsToBonus / diamondSpi)
 * then variance buffer, round up.
 *
 * @param {{
 *   spinsToBonus: number,
 *   baseRtpDecimal: number,
 *   avgPayPerSpin: number,
 *   diamondSpi?: number,
 *   varianceBufferPct?: number,
 *   baseAdjustment?: number,
 * }} params
 */
export function breakevenMeterGames({
  spinsToBonus,
  baseRtpDecimal,
  avgPayPerSpin,
  diamondSpi = BUFFALO_DIAMOND_TIERS[0].defaultDiamondSpi,
  varianceBufferPct = DEFAULT_VARIANCE_BUFFER_PCT,
  baseAdjustment = DEFAULT_BASE_ADJUSTMENT,
}) {
  const houseEdge = Math.max(0, 1 - baseRtpDecimal)
  const waitLossBets = spinsToBonus * houseEdge
  const marginalValue = Math.max(0.05, avgPayPerSpin - baseAdjustment)
  const rawRequired = waitLossBets / marginalValue
  const diamondWaitCredit = diamondSpi > 0 ? spinsToBonus / diamondSpi : 0
  const afterDiamonds = Math.max(0, rawRequired - diamondWaitCredit)
  const withBuffer = afterDiamonds * (1 + Math.max(0, varianceBufferPct) / 100)
  return Math.ceil(withBuffer)
}

/**
 * @param {BuffaloDiamondTier} tier
 * @param {{
 *   baseRtpPct: number,
 *   diamondSpi?: number,
 *   varianceBufferPct?: number,
 *   baseAdjustment?: number,
 *   avgPayPerSpin?: number,
 *   spinsToBonus?: number,
 * }} settings
 */
export function tierBreakeven(tier, settings) {
  const baseRtpDecimal = settings.baseRtpPct / 100
  return breakevenMeterGames({
    spinsToBonus: settings.spinsToBonus ?? tier.spinsToBonus,
    baseRtpDecimal,
    avgPayPerSpin: settings.avgPayPerSpin ?? tier.avgPayPerSpin,
    diamondSpi: settings.diamondSpi ?? tier.defaultDiamondSpi,
    varianceBufferPct: settings.varianceBufferPct,
    baseAdjustment: settings.baseAdjustment,
  })
}

/** SPI from green baseline using 4:2:1 reel-5 landing ratio (advanced reset helper). */
export function diamondSpiFromLandingRatio(greenSpi) {
  const g = Math.max(1, Number(greenSpi) || BUFFALO_DIAMOND_TIERS[0].defaultDiamondSpi)
  return { green: g, blue: 2 * g, gold: 4 * g }
}

/**
 * @param {number} currentMeter
 * @param {number} threshold
 */
export function meterPlayVerdict(currentMeter, threshold) {
  if (currentMeter >= threshold) return 'plus-ev'
  if (currentMeter >= threshold - 2) return 'marginal'
  return 'negative'
}

/**
 * @param {number} currentMeter
 * @param {number} threshold
 * @param {number} avgPayPerSpin
 * @param {number} [baseAdjustment]
 */
export function marginalEdgeBets(currentMeter, threshold, avgPayPerSpin, baseAdjustment = DEFAULT_BASE_ADJUSTMENT) {
  const marginalValue = Math.max(0.05, avgPayPerSpin - baseAdjustment)
  if (currentMeter < threshold) {
    const gap = threshold - currentMeter
    return -gap * marginalValue * 0.35
  }
  return (currentMeter - threshold) * marginalValue
}

/** @param {number} min @param {number} max @param {number} marker */
export function markerPercent(min, max, marker) {
  if (max <= min) return 0
  return Math.min(100, Math.max(0, ((marker - min) / (max - min)) * 100))
}

export function clampMeter(value, min = METER_RESET, max = METER_SLIDER_MAX) {
  return Math.min(max, Math.max(min, Math.round(Number(value) || min)))
}

/** Base-game RTP default by denom (Buffalo Diamond .75-style paytable). */
export function defaultBaseGameRtpForDenom(denom) {
  if (denom <= 0.02) return 63
  if (denom <= 0.05) return 64
  if (denom <= 0.1) return 65
  if (denom <= 0.25) return 66
  if (denom <= 0.5) return 67
  if (denom <= 1) return 68
  return 69
}

export function defaultTierDiamondSpiMap() {
  return Object.fromEntries(BUFFALO_DIAMOND_TIERS.map((t) => [t.key, t.defaultDiamondSpi]))
}
