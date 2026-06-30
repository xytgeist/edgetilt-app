/** Dollar bet from machine credit line × denom. */
export function totalBetUsdFromCredits(betCredits, denom) {
  const credits = Number(betCredits)
  const d = Number(denom)
  if (!Number.isFinite(credits) || credits <= 0 || !Number.isFinite(d) || d <= 0) return 0
  return credits * d
}

/** Icon-derived theme (FREE GAMES wedge green on calc art). */
export const WOF_CE_THEME = {
  accent: '#228e4e',
  accentLight: '#3ecf7a',
  accentSoft: '#9ee6b8',
  accentDark: '#145a2f',
  accentDeep: '#0d3d20',
  accentMuted: '#1a7340',
  /** Collector's Edition subtitle - blue tier parallel to accentSoft / accentMuted. */
  editionBlueSoft: '#93c5fd',
  editionBlueMuted: '#1d6fa3',
}

/** @typedef {'r1' | 'r2' | 'r3' | 'r4' | 'r5'} WofCeReelKey */

/** @typedef {{ key: WofCeReelKey, label: string, shortLabel: string, multiplier: number, color: string, inputAccent: string }} WofCeReelDef */

/** Weighted +EV threshold (× bet). */
export const WEIGHTED_THRESHOLD_X = 45

/** Simple scout total (× bet). */
export const SIMPLE_TOTAL_THRESHOLD_X = 70

/** AP tier: count of columns at or above this × bet. */
export const AP_TIER_20X = 20
export const AP_TIER_30X = 30
export const AP_TIER_70X = 70

/** @type {WofCeReelDef[]} - panel colors match on-glass reel displays (R1→R5). */
export const WOF_CE_REELS = [
  {
    key: 'r1',
    label: 'Reel 1',
    shortLabel: 'R1',
    multiplier: 0.7,
    color: '#ef4444',
    inputAccent: 'focus:ring-[#ef4444]/45',
  },
  {
    key: 'r2',
    label: 'Reel 2',
    shortLabel: 'R2',
    multiplier: 0.9,
    color: '#f026a0',
    inputAccent: 'focus:ring-[#f026a0]/45',
  },
  {
    key: 'r3',
    label: 'Reel 3',
    shortLabel: 'R3',
    multiplier: 0.5,
    color: '#b026ff',
    inputAccent: 'focus:ring-[#b026ff]/45',
  },
  {
    key: 'r4',
    label: 'Reel 4',
    shortLabel: 'R4',
    multiplier: 1,
    color: '#38bdf8',
    inputAccent: 'focus:ring-[#38bdf8]/45',
  },
  {
    key: 'r5',
    label: 'Reel 5',
    shortLabel: 'R5',
    multiplier: 0.33,
    color: '#22c55e',
    inputAccent: 'focus:ring-[#22c55e]/45',
  },
]

/** @typedef {Record<WofCeReelKey, number>} WofCePrizeMap */

/** × bet multiple: column prize credits ÷ bet line credits. */
export function prizeMultiple(prizeCredits, betCredits) {
  const bet = Number(betCredits)
  const prize = Number(prizeCredits)
  if (!Number.isFinite(bet) || bet <= 0 || !Number.isFinite(prize) || prize < 0) return 0
  return prize / bet
}

/** @param {WofCePrizeMap} prizeCredits @param {number} betCredits */
export function prizesAsMultiples(prizeCredits, betCredits) {
  return Object.fromEntries(
    WOF_CE_REELS.map((reel) => [reel.key, prizeMultiple(prizeCredits[reel.key] ?? 0, betCredits)]),
  )
}

/**
 * Weighted column sum: Σ (prize× × reel multiplier).
 * @param {WofCePrizeMap} prizesX - multiples of bet per reel
 */
export function weightedSumX(prizesX) {
  return WOF_CE_REELS.reduce((sum, reel) => {
    const x = Number(prizesX[reel.key]) || 0
    return sum + x * reel.multiplier
  }, 0)
}

/** @param {WofCePrizeMap} prizesX */
export function simpleTotalX(prizesX) {
  return WOF_CE_REELS.reduce((sum, reel) => sum + (Number(prizesX[reel.key]) || 0), 0)
}

/** @param {WofCePrizeMap} prizesX @param {WofCeReelKey} reelKey */
export function weightedContributionX(prizesX, reelKey) {
  const reel = WOF_CE_REELS.find((r) => r.key === reelKey)
  if (!reel) return 0
  return (Number(prizesX[reelKey]) || 0) * reel.multiplier
}

/** @param {number} weightedX */
export function weightedVerdict(weightedX) {
  if (weightedX >= WEIGHTED_THRESHOLD_X) return 'plus-ev'
  if (weightedX >= WEIGHTED_THRESHOLD_X * 0.93) return 'marginal'
  return 'negative'
}

/** @param {number} simpleTotal */
export function simpleScoutVerdict(simpleTotal) {
  if (simpleTotal >= SIMPLE_TOTAL_THRESHOLD_X) return 'plus-ev'
  if (simpleTotal >= SIMPLE_TOTAL_THRESHOLD_X * 0.93) return 'marginal'
  return 'negative'
}

/**
 * AP tier flags from guide copy.
 * @param {WofCePrizeMap} prizesX
 */
export function apTierFlags(prizesX) {
  const values = WOF_CE_REELS.map((r) => Number(prizesX[r.key]) || 0)
  const at20 = values.filter((x) => x >= AP_TIER_20X).length
  const at30 = values.filter((x) => x >= AP_TIER_30X).length
  const at70 = values.filter((x) => x >= AP_TIER_70X).length
  return {
    threePlusAt20: at20 >= 3,
    twoPlusAt30: at30 >= 2,
    oneAt70: at70 >= 1,
    counts: { at20, at30, at70 },
  }
}

/** @param {number} weightedX @param {number} [thresholdX] */
export function weightedThresholdProgressPct(weightedX, thresholdX = WEIGHTED_THRESHOLD_X) {
  if (thresholdX <= 0) return 0
  return Math.max(0, (weightedX / thresholdX) * 100)
}

/** Edge in × bet units above weighted threshold. */
export function weightedEdgeX(weightedX) {
  return weightedX - WEIGHTED_THRESHOLD_X
}

/** Edge in bet-credit units above weighted threshold. */
export function weightedEdgeCredits(weightedX, betCredits) {
  return weightedEdgeX(weightedX) * betCredits
}

/** @param {number} weightedX @param {number} totalBetUsd */
export function weightedEdgeUsd(weightedX, totalBetUsd) {
  return weightedEdgeX(weightedX) * totalBetUsd
}

/** @param {number} min @param {number} max @param {number} marker */
export function markerPercent(min, max, marker) {
  if (max <= min) return 0
  return Math.min(100, Math.max(0, ((marker - min) / (max - min)) * 100))
}

/** Per-reel × needed on that column alone to clear 45× weighted (others zero). */
export function soloReelThresholdX(reelKey) {
  const reel = WOF_CE_REELS.find((r) => r.key === reelKey)
  if (!reel || reel.multiplier <= 0) return 0
  return WEIGHTED_THRESHOLD_X / reel.multiplier
}

/** @param {WofCePrizeMap} prizeCredits */
export function emptyPrizeMap(prizeCredits = {}) {
  return Object.fromEntries(WOF_CE_REELS.map((r) => [r.key, Number(prizeCredits[r.key]) || 0]))
}
