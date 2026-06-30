/**
 * Buffalo Diamond meter math (decimal RTP model).
 * Total play RTP% = baseGame + Σ(banked FG × tier decimal × 100).
 * Coupled breakeven: other tiers held at reset values.
 */

/** @typedef {'green' | 'blue' | 'gold'} TierKey */

/** @typedef {{ key: TierKey, label: string, shortLabel: string, mult: number, meterMin: number, meterMax: number, accent: string, text: string, sliderAccent: string }} BuffaloDiamondTier */

/** @typedef {{ key: string, totalBet: number, label: string, baseGamePct: number, decimals: Record<TierKey, number>, resets: Record<TierKey, number> }} BuffaloDiamondBetLevel */

/**
 * Reel-5 colored diamond landing frequency (green : blue : gold ≈ 4 : 2 : 1).
 * Session SPI is derived from wheel-path cold-hit frequencies.
 */
export const DIAMOND_LAND_FREQ_RATIO = { green: 4, blue: 2, gold: 1 }

/**
 * Empirical wheel stats ($0.75): average wheel spins until tier FG on the wheel.
 * Cold-hit regular spins linearly extrapolate {@link COLD_HIT_SPINS_AT_075} ↔ {@link COLD_HIT_SPINS_AT_400}.
 */
export const WHEEL_SPINS_TO_TIER = { green: 4.11, blue: 19.89, gold: 63 }

/** Tracked wheel frequency at $0.75 bet. */
export const WHEEL_FREQUENCY_AT_075 = 146.42

/** Tracked wheel frequency at $4.00 bet. */
export const WHEEL_FREQUENCY_AT_400 = 126

/** Linear timing anchors ($0.75 ↔ $4.00). */
export const TIMING_BET_ANCHOR_LOW = 0.75
export const TIMING_BET_ANCHOR_HIGH = 4.0

/** MHB-style stress on effective grind RTP for max-exposure envelope. */
export const EXPOSURE_STRESS_RTP_FACTOR = 0.85

/**
 * Linear interpolate/extrapolate timing stats across bet levels.
 * Same $0.75 ↔ $4.00 anchor span as {@link BUFFALO_DIAMOND_BET_LEVELS} profiles.
 * @param {number} totalBet
 * @param {number} atLow
 * @param {number} atHigh
 */
export function linearBetTimingExtrapolation(totalBet, atLow, atHigh) {
  const bet = Number(totalBet)
  if (!Number.isFinite(bet)) return atLow
  const span = TIMING_BET_ANCHOR_HIGH - TIMING_BET_ANCHOR_LOW
  if (span <= 0) return atLow
  const t = (bet - TIMING_BET_ANCHOR_LOW) / span
  return atLow + (atHigh - atLow) * t
}

/** @type {Record<TierKey, number>} Cold-hit regular spins @ $0.75 (wheel freq × wheel tier rate). */
export const COLD_HIT_SPINS_AT_075 = {
  green: WHEEL_FREQUENCY_AT_075 * WHEEL_SPINS_TO_TIER.green,
  blue: WHEEL_FREQUENCY_AT_075 * WHEEL_SPINS_TO_TIER.blue,
  gold: WHEEL_FREQUENCY_AT_075 * WHEEL_SPINS_TO_TIER.gold,
}

/** @type {Record<TierKey, number>} Cold-hit regular spins @ $4.00. */
export const COLD_HIT_SPINS_AT_400 = {
  green: WHEEL_FREQUENCY_AT_400 * WHEEL_SPINS_TO_TIER.green,
  blue: WHEEL_FREQUENCY_AT_400 * WHEEL_SPINS_TO_TIER.blue,
  gold: WHEEL_FREQUENCY_AT_400 * WHEEL_SPINS_TO_TIER.gold,
}

/** Avg return per banked FG spin when the tier bonus hits ($0.75 calibration). */
export const AVG_PAY_PER_BANKED_SPIN = { green: 3.556, blue: 5.855, gold: 7.4568 }

/** @type {BuffaloDiamondTier[]} */
export const BUFFALO_DIAMOND_TIERS = [
  {
    key: 'green',
    label: 'Green 2×',
    shortLabel: '2× Green',
    mult: 2,
    meterMin: 7,
    meterMax: 60,
    accent: 'emerald',
    text: 'text-emerald-400',
    sliderAccent: 'accent-emerald-500',
  },
  {
    key: 'blue',
    label: 'Blue 3×',
    shortLabel: '3× Blue',
    mult: 3,
    meterMin: 7,
    meterMax: 120,
    accent: 'sky',
    text: 'text-sky-400',
    sliderAccent: 'accent-sky-500',
  },
  {
    key: 'gold',
    label: 'Gold 4×',
    shortLabel: '4× Gold',
    mult: 4,
    meterMin: 7,
    meterMax: 180,
    accent: 'amber',
    text: 'text-amber-400',
    sliderAccent: 'accent-amber-500',
  },
]

export const METER_RESET = 7

/** Profile base-game values and tier decimals are calibrated at this overall paytable RTP. */
export const REFERENCE_OVERALL_RTP = 87
export const DEFAULT_OVERALL_RTP = REFERENCE_OVERALL_RTP

/** @type {Record<TierKey, number>} */
export const DEFAULT_METER_RESETS = { green: 7, blue: 8, gold: 10 }

/**
 * Bet-level profiles: linear between $0.75 and $4.00 anchors at {@link REFERENCE_OVERALL_RTP}% overall RTP.
 * `baseGamePct` on each row is the main+1× grind return at that reference overall RTP.
 *
 * @type {BuffaloDiamondBetLevel[]}
 */
export const BUFFALO_DIAMOND_BET_LEVELS = [
  {
    key: '75',
    totalBet: 0.75,
    label: '$0.75',
    baseGamePct: 69.7,
    decimals: { green: 0.00564, blue: 0.00236, gold: 0.001352 },
    resets: { green: 7, blue: 8, gold: 10 },
  },
  {
    key: '100',
    totalBet: 1.0,
    label: '$1.00',
    baseGamePct: 67.36,
    decimals: { green: 0.006784, blue: 0.002978, gold: 0.00159 },
    resets: { green: 7, blue: 8, gold: 10 },
  },
  {
    key: '160',
    totalBet: 1.6,
    label: '$1.60',
    baseGamePct: 61.74,
    decimals: { green: 0.009529, blue: 0.004463, gold: 0.002162 },
    resets: { green: 7, blue: 8, gold: 10 },
  },
  {
    key: '225',
    totalBet: 2.25,
    label: '$2.25',
    baseGamePct: 55.66,
    decimals: { green: 0.012503, blue: 0.006071, gold: 0.002782 },
    resets: { green: 7, blue: 8, gold: 10 },
  },
  {
    key: '250',
    totalBet: 2.5,
    label: '$2.50',
    baseGamePct: 53.32,
    decimals: { green: 0.013647, blue: 0.006689, gold: 0.00302 },
    resets: { green: 7, blue: 8, gold: 10 },
  },
  {
    key: '375',
    totalBet: 3.75,
    label: '$3.75',
    baseGamePct: 41.62,
    decimals: { green: 0.019366, blue: 0.009782, gold: 0.004212 },
    resets: { green: 7, blue: 8, gold: 10 },
  },
  {
    key: '400',
    totalBet: 4.0,
    label: '$4.00',
    baseGamePct: 39.28,
    decimals: { green: 0.02051, blue: 0.0104, gold: 0.00445 },
    resets: { green: 7, blue: 8, gold: 10 },
  },
  {
    key: '500',
    totalBet: 5.0,
    label: '$5.00',
    baseGamePct: 29.92,
    decimals: { green: 0.025085, blue: 0.012874, gold: 0.005403 },
    resets: { green: 7, blue: 8, gold: 10 },
  },
  {
    key: '600',
    totalBet: 6.0,
    label: '$6.00',
    baseGamePct: 20.56,
    decimals: { green: 0.029661, blue: 0.015348, gold: 0.006356 },
    resets: { green: 7, blue: 8, gold: 10 },
  },
  {
    key: '700',
    totalBet: 7.0,
    label: '$7.00',
    baseGamePct: 11.2,
    decimals: { green: 0.034236, blue: 0.017822, gold: 0.00731 },
    resets: { green: 7, blue: 8, gold: 10 },
  },
]

/** @typedef {'diamond' | 'extreme'} BuffaloDiamondVariantKey */

export const EXTREME_DENOM_OPTIONS = [0.01, 0.05]
/** $0.05 Extreme total bets are 5× the $0.01 bet level (same math profile). */
export const EXTREME_NICKEL_BET_MULTIPLIER = 5

/** @type {Record<BuffaloDiamondVariantKey, { key: BuffaloDiamondVariantKey, label: string, betLevelKeys: string[] }>} */
export const BUFFALO_DIAMOND_VARIANTS = {
  diamond: {
    key: 'diamond',
    label: 'Diamond',
    betLevelKeys: ['75', '160', '250', '400', '600'],
  },
  extreme: {
    key: 'extreme',
    label: 'Extreme',
    betLevelKeys: ['100', '225', '375', '500', '700'],
  },
}

/** @param {number} totalBet */
export function formatBetLevelLabel(totalBet) {
  const n = Number(totalBet)
  if (!Number.isFinite(n)) return String(totalBet)
  const rounded = Math.round(n * 100) / 100
  if (Number.isInteger(rounded) || Math.abs(rounded - Math.trunc(rounded)) < 1e-9) {
    return `$${Math.trunc(rounded)}.00`
  }
  return `$${rounded.toFixed(2)}`
}

/**
 * @param {BuffaloDiamondVariantKey} variantKey
 * @param {number} [denom]
 */
export function defaultOverallRtpForVariant(variantKey, denom = 0.01) {
  if (variantKey === 'extreme' && denom >= 0.05) return 90
  return REFERENCE_OVERALL_RTP
}

/**
 * @param {BuffaloDiamondBetLevel} profile
 * @param {BuffaloDiamondVariantKey} variantKey
 * @param {number} [denom]
 */
export function effectiveBetSize(profile, variantKey, denom = 0.01) {
  if (variantKey === 'extreme' && denom >= 0.05) {
    return profile.totalBet * EXTREME_NICKEL_BET_MULTIPLIER
  }
  return profile.totalBet
}

/**
 * @param {BuffaloDiamondBetLevel} profile
 * @param {BuffaloDiamondVariantKey} variantKey
 * @param {number} [denom]
 */
export function betLevelDisplayLabel(profile, variantKey, denom = 0.01) {
  return formatBetLevelLabel(effectiveBetSize(profile, variantKey, denom))
}

/**
 * @param {BuffaloDiamondVariantKey} variantKey
 * @param {number} [denom]
 */
export function betLevelOptionsForVariant(variantKey, denom = 0.01) {
  const variant = BUFFALO_DIAMOND_VARIANTS[variantKey] ?? BUFFALO_DIAMOND_VARIANTS.diamond
  return variant.betLevelKeys.map((key) => {
    const level = betLevelByKey(key)
    return {
      value: key,
      label: betLevelDisplayLabel(level, variantKey, denom),
    }
  })
}

export const DEFAULT_BET_LEVEL_KEY = '250'

/** @param {BuffaloDiamondVariantKey} variantKey */
export function defaultBetLevelKeyForVariant(variantKey) {
  const variant = BUFFALO_DIAMOND_VARIANTS[variantKey] ?? BUFFALO_DIAMOND_VARIANTS.diamond
  if (variantKey === 'diamond') return DEFAULT_BET_LEVEL_KEY
  return variant.betLevelKeys[0]
}

/** @param {number} totalBet */
export function betLevelForTotalBet(totalBet) {
  const bet = Number(totalBet)
  if (!Number.isFinite(bet) || bet <= 0) return BUFFALO_DIAMOND_BET_LEVELS[0]
  let best = BUFFALO_DIAMOND_BET_LEVELS[0]
  let bestDiff = Math.abs(bet - best.totalBet)
  for (const level of BUFFALO_DIAMOND_BET_LEVELS) {
    const diff = Math.abs(bet - level.totalBet)
    if (diff < bestDiff) {
      best = level
      bestDiff = diff
    }
  }
  return best
}

/** @param {string} key */
export function betLevelByKey(key) {
  return BUFFALO_DIAMOND_BET_LEVELS.find((l) => l.key === key) ?? BUFFALO_DIAMOND_BET_LEVELS[0]
}

/**
 * RTP contribution (percentage points) from one tier's banked meter.
 * @param {number} meter
 * @param {number} decimal
 */
export function tierMeterContributionPct(meter, decimal) {
  return meter * decimal * 100
}

/**
 * @param {Record<TierKey, number>} meters
 * @param {{ baseGamePct: number, decimals: Record<TierKey, number> }} profile
 * @param {number} [meterSpeedPct]
 */
export function totalPlayRtpPct(meters, profile, meterSpeedPct = 0) {
  const { baseGamePct, decimals } = profile
  const banked = BUFFALO_DIAMOND_TIERS.reduce(
    (sum, tier) => sum + tierMeterContributionPct(meters[tier.key] ?? 0, decimals[tier.key]),
    0,
  )
  return baseGamePct + banked + Math.max(0, meterSpeedPct)
}

/**
 * Coupled breakeven for one tier with other meters at reset.
 * @param {TierKey} tierKey
 * @param {{ baseGamePct: number, decimals: Record<TierKey, number>, resets: Record<TierKey, number> }} profile
 */
export function coupledTierBreakeven(tierKey, profile) {
  const { baseGamePct, decimals, resets } = profile
  const otherContribution = BUFFALO_DIAMOND_TIERS.filter((t) => t.key !== tierKey).reduce(
    (sum, tier) => sum + tierMeterContributionPct(resets[tier.key], decimals[tier.key]),
    0,
  )
  const dec = decimals[tierKey]
  if (dec <= 0) return 999
  const raw = (100 - baseGamePct - otherContribution) / (dec * 100)
  return Math.max(0, Math.round(raw))
}

/** @param {{ baseGamePct: number, decimals: Record<TierKey, number>, resets: Record<TierKey, number> }} profile */
export function coupledBreakevenMap(profile) {
  return Object.fromEntries(
    BUFFALO_DIAMOND_TIERS.map((tier) => [tier.key, coupledTierBreakeven(tier.key, profile)]),
  )
}

/**
 * RTP points of banked edge for one tier above its coupled breakeven (others at reset in BE math).
 * @param {TierKey} tierKey
 * @param {Record<TierKey, number>} meters
 * @param {{ decimals: Record<TierKey, number>, resets: Record<TierKey, number>, baseGamePct: number }} profile
 */
export function tierPlayEdgePts(tierKey, meters, profile) {
  const breakeven = coupledTierBreakeven(tierKey, profile)
  const meter = meters[tierKey] ?? profile.resets[tierKey]
  const excess = Math.max(0, meter - breakeven)
  if (excess <= 0) return 0
  return tierMeterContributionPct(excess, profile.decimals[tierKey])
}

/**
 * Meters for path/average-case RTP: target tier at live value, all others at reset.
 * @param {Record<TierKey, number>} meters
 * @param {{ resets: Record<TierKey, number> }} profile
 * @param {TierKey} targetKey
 */
export function metersAtTargetFocus(meters, profile, targetKey) {
  return Object.fromEntries(
    BUFFALO_DIAMOND_TIERS.map((tier) => [
      tier.key,
      tier.key === targetKey ? (meters[tier.key] ?? profile.resets[tier.key]) : profile.resets[tier.key],
    ]),
  )
}

/**
 * True when a tier's meter is above its coupled breakeven (standalone +EV on that tier).
 * @param {TierKey} tierKey
 * @param {Record<TierKey, number>} meters
 * @param {{ resets: Record<TierKey, number>, baseGamePct: number, decimals: Record<TierKey, number> }} profile
 */
export function isTierAboveBreakeven(tierKey, meters, profile) {
  const breakeven = coupledTierBreakeven(tierKey, profile)
  const meter = meters[tierKey] ?? profile.resets[tierKey]
  return meter > breakeven
}

/**
 * Auto play target: highest tier (gold → blue → green) that is above coupled BE.
 * Lower tiers may also be +EV but are incidental on a higher-tier chase - we do not stop at green when gold is still a play.
 * If none are above BE, pick the tier with the best standalone focused RTP.
 * @param {Record<TierKey, number>} meters
 * @param {{ baseGamePct: number, decimals: Record<TierKey, number>, resets: Record<TierKey, number> }} profile
 * @returns {TierKey}
 */
export function resolveTargetTier(meters, profile) {
  /** @type {TierKey[]} */
  const playPriority = ['gold', 'blue', 'green']

  for (const key of playPriority) {
    if (isTierAboveBreakeven(key, meters, profile)) return key
  }

  /** @type {TierKey[]} */
  const tierOrder = ['green', 'blue', 'gold']
  /** @type {TierKey} */
  let bestKey = 'gold'
  let bestRtp = -Infinity
  for (const key of tierOrder) {
    const rtp = totalPlayRtpPct(metersAtTargetFocus(meters, profile, key), profile)
    const rank = tierOrder.indexOf(key)
    const bestRank = tierOrder.indexOf(bestKey)
    if (rtp > bestRtp || (rtp === bestRtp && rank > bestRank)) {
      bestRtp = rtp
      bestKey = key
    }
  }
  return bestKey
}

/**
 * True when total snapshot RTP is +EV but no single tier is above coupled BE.
 * @param {Record<TierKey, number>} meters
 * @param {{ baseGamePct: number, decimals: Record<TierKey, number>, resets: Record<TierKey, number> }} profile
 */
export function isCombinedPlusEvPlay(meters, profile) {
  if (totalPlayRtpPct(meters, profile) < 100) return false
  return !BUFFALO_DIAMOND_TIERS.some((tier) => isTierAboveBreakeven(tier.key, meters, profile))
}

/**
 * Lowest tier with banked FG above reset (green → blue → gold).
 * @param {Record<TierKey, number>} meters
 * @param {{ resets: Record<TierKey, number> }} profile
 * @returns {BuffaloDiamondTier | null}
 */
function lowestTierInPlay(meters, profile) {
  return (
    BUFFALO_DIAMOND_TIERS.find(
      (tier) => (meters[tier.key] ?? profile.resets[tier.key]) > profile.resets[tier.key],
    ) ?? null
  )
}

/**
 * Advance all meters after `spins` base-game spins (SPI model).
 * @param {Record<TierKey, number>} meters
 * @param {{ resets: Record<TierKey, number>, baseGamePct: number, decimals: Record<TierKey, number> }} profile
 * @param {number} spins
 */
function advanceMetersForSpins(meters, profile, spins) {
  return Object.fromEntries(
    BUFFALO_DIAMOND_TIERS.map((tier) => {
      const start = meters[tier.key] ?? profile.resets[tier.key]
      const spi = tierSpinsPerFgIncrement(tier.key, profile)
      return [tier.key, clampMeter(start + spins / spi, tier.meterMin, tier.meterMax)]
    }),
  )
}

/**
 * Combo-play cascade: sim to lowest in-play tier hit; escalate if a higher tier crosses ▼ by then.
 * @param {Record<TierKey, number>} meters
 * @param {{ totalBet?: number, baseGamePct: number, decimals: Record<TierKey, number>, resets: Record<TierKey, number> }} profile
 * @returns {{
 *   lowestKey: TierKey,
 *   effectiveTargetKey: TierKey,
 *   projectedMeters: Record<TierKey, number>,
 *   escalated: boolean,
 *   spinsToLowestHit: number,
 * }}
 */
export function resolveComboCascade(meters, profile) {
  const lowestTier = lowestTierInPlay(meters, profile)
  const totalBet = profile.totalBet ?? 0.75

  if (!lowestTier) {
    return {
      lowestKey: 'green',
      effectiveTargetKey: 'green',
      projectedMeters: { ...meters },
      escalated: false,
      spinsToLowestHit: 0,
    }
  }

  const lowestKey = lowestTier.key
  const spinsToLowestHit = tierSpinsToBonusCold(lowestKey, totalBet)
  const projectedMeters = advanceMetersForSpins(meters, profile, spinsToLowestHit)

  const lowestRank = BUFFALO_DIAMOND_TIERS.findIndex((tier) => tier.key === lowestKey)
  /** @type {TierKey[]} */
  const playPriority = ['gold', 'blue', 'green']

  for (const key of playPriority) {
    const rank = BUFFALO_DIAMOND_TIERS.findIndex((tier) => tier.key === key)
    if (rank <= lowestRank) continue
    if (isTierAboveBreakeven(key, projectedMeters, profile)) {
      return {
        lowestKey,
        effectiveTargetKey: key,
        projectedMeters,
        escalated: true,
        spinsToLowestHit,
      }
    }
  }

  return {
    lowestKey,
    effectiveTargetKey: lowestKey,
    projectedMeters,
    escalated: false,
    spinsToLowestHit,
  }
}

/**
 * Snapshot is +EV but no tier is above ▼ now and cascade does not reach ▼ before the next bonus hit.
 * Session avg-case × is not modeled in this state.
 * @param {Record<TierKey, number>} meters
 * @param {{ baseGamePct: number, decimals: Record<TierKey, number>, resets: Record<TierKey, number> }} profile
 */
export function isIndeterminateComboEv(meters, profile) {
  if (!isCombinedPlusEvPlay(meters, profile)) return false
  return !resolveComboCascade(meters, profile).escalated
}

/**
 * Combo-play avg case: escalated chase (FG above ▼ × avg pay), else not modeled (null).
 * @param {Record<TierKey, number>} meters
 * @param {{ totalBet?: number, baseGamePct: number, decimals: Record<TierKey, number>, resets: Record<TierKey, number> }} profile
 * @returns {number | null}
 */
export function projectedComboEvBets(meters, profile) {
  if (isIndeterminateComboEv(meters, profile)) return null

  const cascade = resolveComboCascade(meters, profile)
  const excess = targetBankedExcessFg(cascade.projectedMeters, profile, cascade.effectiveTargetKey)
  return excess * AVG_PAY_PER_BANKED_SPIN[cascade.effectiveTargetKey]
}

/**
 * Path/average-case RTP: combined snapshot when no tier is above BE; else target-tier focus.
 * @param {Record<TierKey, number>} meters
 * @param {{ baseGamePct: number, decimals: Record<TierKey, number>, resets: Record<TierKey, number> }} profile
 */
export function playPathRtpPct(meters, profile) {
  if (isCombinedPlusEvPlay(meters, profile)) {
    const cascade = resolveComboCascade(meters, profile)
    if (cascade.escalated) {
      return totalPlayRtpPct(
        metersAtTargetFocus(cascade.projectedMeters, profile, cascade.effectiveTargetKey),
        profile,
      )
    }
    return totalPlayRtpPct(meters, profile)
  }
  const targetKey = resolveTargetTier(meters, profile)
  return totalPlayRtpPct(metersAtTargetFocus(meters, profile, targetKey), profile)
}

/**
 * @param {number} playRtpPct
 */
export function playRtpVerdict(playRtpPct) {
  if (playRtpPct >= 100) return 'plus-ev'
  if (playRtpPct >= 98) return 'marginal'
  return 'negative'
}

/** Edge vs breakeven in percentage points of RTP. */
export function playRtpEdgePct(playRtpPct) {
  return playRtpPct - 100
}

/**
 * Approximate edge in bet units from RTP gap (snapshot, not session sim).
 * @param {number} playRtpPct
 */
export function playRtpEdgeMult(playRtpPct) {
  return playRtpEdgePct(playRtpPct) / 100
}

/**
 * Approximate edge in bet units from RTP gap (snapshot, not session sim).
 * @param {number} playRtpPct
 * @param {number} betSize
 */
export function playRtpEdgeDollars(playRtpPct, betSize) {
  return playRtpEdgeMult(playRtpPct) * betSize
}

/**
 * Wheel frequency by bet level (~146 @ $0.75, ~126 @ $4; linear across all bets).
 * @param {number} totalBet
 */
export function wheelFrequencyForBet(totalBet) {
  return linearBetTimingExtrapolation(totalBet, WHEEL_FREQUENCY_AT_075, WHEEL_FREQUENCY_AT_400)
}

/**
 * Cold-hit regular spins until tier FG (linear extrapolation $0.75 ↔ $4+).
 * @param {TierKey} tierKey
 * @param {number} totalBet
 */
export function tierSpinsToBonusCold(tierKey, totalBet) {
  return Math.round(
    linearBetTimingExtrapolation(totalBet, COLD_HIT_SPINS_AT_075[tierKey], COLD_HIT_SPINS_AT_400[tierKey]),
  )
}

/**
 * SPI: spins per +1 FG banked, from cold-hit path and coupled breakeven excess.
 * @param {TierKey} tierKey
 * @param {{ totalBet?: number, baseGamePct: number, decimals: Record<TierKey, number>, resets: Record<TierKey, number> }} profile
 */
export function tierSpinsPerFgIncrement(tierKey, profile) {
  const totalBet = profile.totalBet ?? 0.75
  const spinsToBonus = tierSpinsToBonusCold(tierKey, totalBet)
  const breakeven = coupledTierBreakeven(tierKey, profile)
  const excess = Math.max(1, breakeven - profile.resets[tierKey])
  return spinsToBonus / excess
}

/**
 * Per-tier bonus timing at current meters (wheel-path cold hits + derived SPI).
 * @param {Record<TierKey, number>} meters
 * @param {{ totalBet?: number, baseGamePct: number, decimals: Record<TierKey, number>, resets: Record<TierKey, number> }} profile
 * @param {number} betSize
 */
export function tierBonusTiming(meters, profile, betSize) {
  const bet = Number(betSize)
  const safeBet = Number.isFinite(bet) && bet > 0 ? bet : 1
  const totalBet = profile.totalBet ?? safeBet

  return BUFFALO_DIAMOND_TIERS.map((tier) => {
    const meter = meters[tier.key] ?? profile.resets[tier.key]
    const spinsToBonusCold = tierSpinsToBonusCold(tier.key, totalBet)
    const spi = tierSpinsPerFgIncrement(tier.key, profile)
    const coinInToBonusCold = spinsToBonusCold * safeBet

    return {
      tier,
      meter,
      reset: profile.resets[tier.key],
      spinsPerFgIncrement: spi,
      spinsToBonusCold,
      coinInToBonusCold,
      wheelFrequency: wheelFrequencyForBet(totalBet),
    }
  })
}

/**
 * Banked FG on the play-target tier above coupled breakeven.
 * @param {Record<TierKey, number>} meters
 * @param {{ baseGamePct: number, decimals: Record<TierKey, number>, resets: Record<TierKey, number> }} profile
 * @param {TierKey} targetKey
 */
export function targetBankedExcessFg(meters, profile, targetKey) {
  const breakeven = coupledTierBreakeven(targetKey, profile)
  const meter = meters[targetKey] ?? profile.resets[targetKey]
  return Math.max(0, meter - breakeven)
}

/**
 * Expected cold-hit spins to reach the auto play-target tier once.
 * @param {Record<TierKey, number>} meters
 * @param {{ totalBet?: number, baseGamePct: number, decimals: Record<TierKey, number>, resets: Record<TierKey, number> }} profile
 */
export function projectedPathSpins(meters, profile) {
  if (isCombinedPlusEvPlay(meters, profile)) {
    if (isIndeterminateComboEv(meters, profile)) return 0
    const cascade = resolveComboCascade(meters, profile)
    const totalBet = profile.totalBet ?? 0.75
    return tierSpinsToBonusCold(cascade.effectiveTargetKey, totalBet)
  }
  const targetKey = resolveTargetTier(meters, profile)
  if (!isTierAboveBreakeven(targetKey, meters, profile)) return 0
  const totalBet = profile.totalBet ?? 0.75
  return tierSpinsToBonusCold(targetKey, totalBet)
}

/**
 * Average-case EV in bet units: (target FG − ▼) × avg pay per banked FG on hit.
 * @param {Record<TierKey, number>} meters
 * @param {{ baseGamePct: number, decimals: Record<TierKey, number>, resets: Record<TierKey, number> }} profile
 * @returns {number | null}
 */
export function projectedBankedExcessEvBets(meters, profile) {
  if (isCombinedPlusEvPlay(meters, profile)) {
    return projectedComboEvBets(meters, profile)
  }
  const targetKey = resolveTargetTier(meters, profile)
  if (!isTierAboveBreakeven(targetKey, meters, profile)) {
    return playRtpEdgeMult(playPathRtpPct(meters, profile))
  }
  const excess = targetBankedExcessFg(meters, profile, targetKey)
  return excess * AVG_PAY_PER_BANKED_SPIN[targetKey]
}

/**
 * Baseline expected coin-in: cold-hit spins to the play-target tier × bet.
 * @param {Record<TierKey, number>} meters
 * @param {{ totalBet?: number, baseGamePct: number, decimals: Record<TierKey, number>, resets: Record<TierKey, number> }} profile
 * @param {number} betSize
 */
export function projectedCoinInExpected(meters, profile, betSize) {
  const exposureSpins = projectedPathSpins(meters, profile)
  const bet = Number(betSize)
  if (!Number.isFinite(bet) || bet <= 0 || exposureSpins <= 0) return 0
  return exposureSpins * bet
}

/**
 * Session metrics: banked-excess EV and cold-hit coin-in on the auto play target.
 * @returns {{ evBets: number, exposureSpins: number, targetKey: TierKey }}
 */
export function projectSessionMetrics(meters, profile) {
  const targetKey = resolveTargetTier(meters, profile)
  return {
    evBets: projectedBankedExcessEvBets(meters, profile),
    exposureSpins: projectedPathSpins(meters, profile),
    targetKey,
  }
}

/**
 * Project expected bets won on target hit: (FG above ▼) × avg pay per banked FG.
 *
 * @param {Record<TierKey, number>} meters
 * @param {{ baseGamePct: number, decimals: Record<TierKey, number>, resets: Record<TierKey, number> }} profile
 * @returns {number | null}
 */
export function projectedAverageCaseEvBets(meters, profile) {
  return projectedBankedExcessEvBets(meters, profile)
}

/**
 * Potential loss envelope: stressed path grind minus average-case target (EV in dollars).
 * Not a true maximum ... cold runs and variance can exceed this envelope.
 * Exposure = max(0, coinIn × (1 − p_stress) − targetEv$).
 *
 * @param {Record<TierKey, number>} meters
 * @param {{ overallRtpPct?: number, baseGamePct: number, decimals: Record<TierKey, number>, resets: Record<TierKey, number> }} profile
 * @param {number} evAvgBets Average-case EV in bet units
 * @param {number} betSize
 */
export function projectedMaxExposureDollars(meters, profile, evAvgBets, betSize) {
  const startRtp = playPathRtpPct(meters, profile)
  if (startRtp < 99) return 0

  const coinInExpected = projectedCoinInExpected(meters, profile, betSize)
  if (coinInExpected <= 0) return 0

  const effectiveRtp = Math.min(
    0.999999,
    Math.max(0, (profile.overallRtpPct ?? REFERENCE_OVERALL_RTP) / 100),
  )
  const stressedRtp = effectiveRtp * EXPOSURE_STRESS_RTP_FACTOR
  const stressedHouseEdge = 1 - stressedRtp
  const stressedLoss = coinInExpected * stressedHouseEdge
  const targetEvDollars = Math.max(0, evAvgBets * betSize)

  return Math.max(0, stressedLoss - targetEvDollars)
}

/** @deprecated Use {@link projectedMaxExposureDollars} - kept for bet-unit callers. */
export function projectedMaxExposureBets(meters, profile, evAvgBets = 0, betSize = 1) {
  const bet = Number(betSize)
  if (!Number.isFinite(bet) || bet <= 0) return 0
  return projectedMaxExposureDollars(meters, profile, evAvgBets, bet) / bet
}

/** @param {number} min @param {number} max @param {number} marker */
export function markerPercent(min, max, marker) {
  if (max <= min) return 0
  return Math.min(100, Math.max(0, ((marker - min) / (max - min)) * 100))
}

export function clampMeter(value, min = METER_RESET, max = 180) {
  return Math.min(max, Math.max(min, Math.round(Number(value) || min)))
}

/**
 * Shift profile base-game return when overall paytable RTP differs from {@link REFERENCE_OVERALL_RTP}.
 * @param {number} profileBaseGamePct
 * @param {number} overallRtpPct
 */
export function baseGamePctForOverallRtp(profileBaseGamePct, overallRtpPct) {
  const overall = Number(overallRtpPct)
  if (!Number.isFinite(overall) || overall <= 0 || overall >= 100) {
    return profileBaseGamePct
  }
  return Math.max(1, Math.min(98, profileBaseGamePct + (overall - REFERENCE_OVERALL_RTP)))
}

/**
 * @param {BuffaloDiamondBetLevel} profile
 * @param {Record<TierKey, number>} [decimalsOverride]
 * @param {number} [overallRtpPct]
 */
export function resolveProfile(profile, decimalsOverride, overallRtpPct = REFERENCE_OVERALL_RTP) {
  const overall = Number(overallRtpPct)
  const safeOverall =
    Number.isFinite(overall) && overall > 0 && overall < 100 ? overall : REFERENCE_OVERALL_RTP
  return {
    ...profile,
    overallRtpPct: safeOverall,
    baseGamePct: baseGamePctForOverallRtp(profile.baseGamePct, safeOverall),
    decimals: { ...profile.decimals, ...decimalsOverride },
  }
}
