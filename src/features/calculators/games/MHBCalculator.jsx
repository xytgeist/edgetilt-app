import { useState, useEffect, useMemo, useCallback } from 'react'
import CalculatorDisclaimer from '../../../components/CalculatorDisclaimer'
import { CALCULATOR_ICON_SRC } from '../calculatorAccess.js'
import BankrollRiskAdvisor from '../BankrollRiskAdvisor.jsx'
import CalculatorLogPlayButton from '../CalculatorLogPlayButton.jsx'
import { playLogCalcEvPrefill } from '../../../utils/playLogCalcSnapshot.js'

function defaultCurrentForCap(cap) {
  return Math.round(cap * 0.95)
}

/** Default presets per maker and MHB combination. */
const MHB_PRESETS = {
  ainsworth: {
    500: { current: defaultCurrentForCap(500), meterRise: 2.5, reset: 350, rtp: 88 },
    10000: { current: defaultCurrentForCap(10000), meterRise: 6.66666, reset: 9000, rtp: 88 },
  },
  ags: {
    500: { current: defaultCurrentForCap(500), meterRise: 2.5, reset: 200, rtp: 88 },
    5000: { current: defaultCurrentForCap(5000), meterRise: 3.75, reset: 4000, rtp: 88 },
  },
  igt: {
    mini: {
      20: { current: defaultCurrentForCap(20), meterRise: 0.25, reset: 17, rtp: 88 },
      40: { current: defaultCurrentForCap(40), meterRise: 0.25, reset: 34, rtp: 88 },
      60: { current: defaultCurrentForCap(60), meterRise: 0.25, reset: 51, rtp: 88 },
      100: { current: defaultCurrentForCap(100), meterRise: 0.25, reset: 85, rtp: 88 },
      200: { current: defaultCurrentForCap(200), meterRise: 0.25, reset: 170, rtp: 88 },
    },
    minor: {
      50: { current: defaultCurrentForCap(50), meterRise: 0.25, reset: 37.5, rtp: 88 },
      100: { current: defaultCurrentForCap(100), meterRise: 0.25, reset: 75, rtp: 88 },
      150: { current: defaultCurrentForCap(150), meterRise: 0.25, reset: 112.5, rtp: 88 },
      250: { current: defaultCurrentForCap(250), meterRise: 0.25, reset: 187.5, rtp: 88 },
      500: { current: defaultCurrentForCap(500), meterRise: 0.25, reset: 375, rtp: 88 },
    },
    major: {
      200: { current: defaultCurrentForCap(200), meterRise: 2.5, reset: 125, rtp: 88 },
      400: { current: defaultCurrentForCap(400), meterRise: 2.5, reset: 250, rtp: 88 },
      600: { current: defaultCurrentForCap(600), meterRise: 2.5, reset: 375, rtp: 88 },
      1000: { current: defaultCurrentForCap(1000), meterRise: 2.5, reset: 625, rtp: 88 },
      2000: { current: defaultCurrentForCap(2000), meterRise: 2.5, reset: 1250, rtp: 88 },
    },
  },
}

const IGT_TIER_LABELS = {
  mini: 'Mini',
  minor: 'Minor',
  major: 'Major',
}

const IGT_MHB_BY_TIER_AND_LINE_BET = {
  mini: { 1: 20, 2: 40, 3: 60, 5: 100, 10: 200 },
  minor: { 1: 50, 2: 100, 3: 150, 5: 250, 10: 500 },
  major: { 1: 200, 2: 400, 3: 600, 5: 1000, 10: 2000 },
}

const IGT_BASE_PRESETS = {
  mini: {
    20: { meterRise: 0.5, reset: 17 },
    40: { meterRise: 0.5, reset: 34 },
    60: { meterRise: 0.5, reset: 51 },
    100: { meterRise: 0.5, reset: 85 },
    200: { meterRise: 0.5, reset: 170 },
  },
  minor: {
    50: { meterRise: 1, reset: 37.5 },
    100: { meterRise: 1, reset: 75 },
    150: { meterRise: 1, reset: 112.5 },
    250: { meterRise: 1, reset: 187.5 },
    500: { meterRise: 1, reset: 375 },
  },
  major: {
    200: { meterRise: 2.5, reset: 125 },
    400: { meterRise: 2.5, reset: 250 },
    600: { meterRise: 2.5, reset: 375 },
    1000: { meterRise: 2.5, reset: 625 },
    2000: { meterRise: 2.5, reset: 1250 },
  },
}

function igtScaleFactorForDenom(denom) {
  return Number(denom) / 0.01
}

function igtRtpForDenom(denom) {
  if (denom === 0.25) return 85
  if (denom === 1) return 86
  if (denom === 2) return 87
  return 84
}

function igtMustHitByFor(tier, lineBet, denom = 0.01) {
  const tierMap = IGT_MHB_BY_TIER_AND_LINE_BET[tier]
  if (!tierMap) return 20
  const baseCap = tierMap[lineBet] || 20
  return baseCap * igtScaleFactorForDenom(denom)
}

function igtPresetFor(tier, lineBet, denom = 0.01) {
  const normalizedTier = IGT_BASE_PRESETS[tier] ? tier : 'mini'
  const normalizedLineBet = [1, 2, 3, 5, 10].includes(lineBet) ? lineBet : 1
  const baseCap = IGT_MHB_BY_TIER_AND_LINE_BET[normalizedTier][normalizedLineBet]
  const basePreset = IGT_BASE_PRESETS[normalizedTier][baseCap]
  const factor = igtScaleFactorForDenom(denom)
  const cap = baseCap * factor

  return {
    current: defaultCurrentForCap(cap),
    meterRise: basePreset.meterRise,
    reset: Number((basePreset.reset * factor).toFixed(2)),
    rtp: igtRtpForDenom(denom),
  }
}

/** AGS does not use a 10k cap in-app; 10k coerces to 5k for presets and math. */
function effectiveCap(manufacturer, mustHitBy) {
  const raw = Number(mustHitBy)
  if (manufacturer === 'manual' && !Number.isFinite(raw)) return NaN
  const v = raw || 500
  if (manufacturer === 'ags' && v === 10000) return 5000
  return v
}

function presetFor(manufacturer, mustHitBy, igtTier = 'mini', igtLineBet = 1, igtDenom = 0.01) {
  if (manufacturer === 'igt') {
    return igtPresetFor(igtTier, igtLineBet, igtDenom)
  }

  const m = MHB_PRESETS[manufacturer] || MHB_PRESETS.ainsworth
  const cap = effectiveCap(manufacturer, mustHitBy)
  return m[cap] || m[500]
}

function getConcurrentJackpotConfigs(manufacturer, igtLineBet, igtDenom) {
  if (manufacturer === 'ainsworth') {
    const p500 = MHB_PRESETS.ainsworth[500]
    const p10k = MHB_PRESETS.ainsworth[10000]
    return [
      { key: 'ainsworth-500', label: '$500 MHB', mhb: 500, reset: p500.reset, meterRise: p500.meterRise },
      { key: 'ainsworth-10000', label: '$10,000 MHB', mhb: 10000, reset: p10k.reset, meterRise: p10k.meterRise },
    ]
  }

  if (manufacturer === 'ags') {
    const p500 = MHB_PRESETS.ags[500]
    const p5k = MHB_PRESETS.ags[5000]
    return [
      { key: 'ags-500', label: '$500 MHB', mhb: 500, reset: p500.reset, meterRise: p500.meterRise },
      { key: 'ags-5000', label: '$5,000 MHB', mhb: 5000, reset: p5k.reset, meterRise: p5k.meterRise },
    ]
  }

  if (manufacturer === 'igt') {
    const tiers = ['mini', 'minor', 'major']
    return tiers.map((tier) => {
      const mhb = igtMustHitByFor(tier, igtLineBet, igtDenom)
      const p = igtPresetFor(tier, igtLineBet, igtDenom)
      return {
        key: `igt-${tier}-${igtDenom}-${igtLineBet}`,
        label: `${IGT_TIER_LABELS[tier]} ${formatUsd(mhb)} MHB`,
        mhb,
        reset: p.reset,
        meterRise: p.meterRise,
      }
    })
  }

  return []
}

function totalJpContributionFraction(manufacturer, useMidpoint, igtLineBet, igtDenom) {
  const concurrentJackpots = getConcurrentJackpotConfigs(manufacturer, igtLineBet, igtDenom)
  return concurrentJackpots.reduce((sum, jp) => {
    const target = useMidpoint ? (jp.reset + jp.mhb) / 2 : jp.mhb
    const distanceFromReset = target - jp.reset
    const incrementsFromReset = distanceFromReset / 0.01
    const coinInFromReset = incrementsFromReset * jp.meterRise
    const contrib = coinInFromReset > 0 ? target / coinInFromReset : 0
    return sum + contrib
  }, 0)
}

function solveBreakevenEntry({
  mhb,
  rtpPercent,
  riseDollars,
  useMidpoint,
  manufacturer,
  igtLineBet,
  igtDenom,
}) {
  const rtp = (Number(rtpPercent) || 0) / 100
  const jpContribFraction = totalJpContributionFraction(manufacturer, useMidpoint, igtLineBet, igtDenom)
  const effectiveRtp = Math.min(0.999999, Math.max(0, rtp - jpContribFraction))
  const effectiveHouseEdge = 1 - effectiveRtp

  const evForEntry = (entry) => {
    const targetAtEntry = useMidpoint ? entry + (mhb - entry) * 0.5 : mhb
    const dollarDistanceAtEntry = Math.max(0, targetAtEntry - entry)
    const incrementsNeededAtEntry = dollarDistanceAtEntry / 0.01
    const coinInToTargetAtEntry = incrementsNeededAtEntry * riseDollars
    const expectedLossAtEntry = coinInToTargetAtEntry * effectiveHouseEdge
    return targetAtEntry - expectedLossAtEntry
  }

  let lo = 0
  let hi = mhb
  let loEv = evForEntry(lo)
  let hiEv = evForEntry(hi)

  if (loEv === 0) return lo
  if (hiEv === 0) return hi
  if (loEv * hiEv > 0) return Math.abs(loEv) <= Math.abs(hiEv) ? lo : hi

  for (let i = 0; i < 60; i += 1) {
    const mid = (lo + hi) / 2
    const midEv = evForEntry(mid)
    if (Math.abs(midEv) < 1e-7 || Math.abs(hi - lo) < 1e-7) {
      lo = mid
      hi = mid
      break
    }
    if (loEv * midEv <= 0) {
      hi = mid
      hiEv = midEv
    } else {
      lo = mid
      loEv = midEv
    }
  }

  return (lo + hi) / 2
}

function roundToCents(value) {
  return Number((Number(value) || 0).toFixed(2))
}

function formatUsdTwoDecimals(amount) {
  const n = Number(amount)
  if (!Number.isFinite(n)) return '$0.00'
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n)
}

/** en-US currency: $10,000 / $4,911.76 */
function formatUsd(amount) {
  const n = Number(amount)
  if (!Number.isFinite(n)) return '$0'
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(n)
}

function MHBCalculator({ onBack, supabaseClient = null, onOpenLogbook = null, logPlayLocked = false, onRequireSubscribe = null, playLogsRemaining = null, freemiumUsageLoading = false }) {
  const isLight = document.documentElement.classList.contains('light')
  const scrollThumb = isLight
    ? '[&::-webkit-scrollbar-thumb]:bg-blue-400/40 hover:[&::-webkit-scrollbar-thumb]:bg-blue-400/60 [scrollbar-color:rgba(96,165,250,0.45)_transparent]'
    : '[&::-webkit-scrollbar-thumb]:bg-cyan-300/20 hover:[&::-webkit-scrollbar-thumb]:bg-cyan-300/35 [scrollbar-color:rgba(34,211,238,0.25)_transparent]'
  const scrollThumbSm = isLight
    ? '[&::-webkit-scrollbar-thumb]:bg-blue-400/40 hover:[&::-webkit-scrollbar-thumb]:bg-blue-400/60 [scrollbar-color:rgba(96,165,250,0.45)_transparent]'
    : '[&::-webkit-scrollbar-thumb]:bg-cyan-300/15 hover:[&::-webkit-scrollbar-thumb]:bg-cyan-300/30 [scrollbar-color:rgba(34,211,238,0.2)_transparent]'

  const [manufacturer, setManufacturer] = useState('ainsworth')
  const [igtTier, setIgtTier] = useState('mini')
  const [igtLineBet, setIgtLineBet] = useState(1)
  const [igtDenom, setIgtDenom] = useState(0.01)

  // Main fields
  const [current, setCurrent] = useState(475)
  const [mustHitBy, setMustHitBy] = useState(500)
  const [jpMeterFocused, setJpMeterFocused] = useState(false)
  const [jpMeterDraft, setJpMeterDraft] = useState('')
  const [mustHitByFocused, setMustHitByFocused] = useState(false)
  const [mustHitByDraft, setMustHitByDraft] = useState('')

  // Advanced Settings
  const [overallRTP, setOverallRTP] = useState(88)
  const [meterRise, setMeterRise] = useState(2.50)
  const [resetValue, setResetValue] = useState(350)
  const [meterRiseFocused, setMeterRiseFocused] = useState(false)
  const [meterRiseDraft, setMeterRiseDraft] = useState('')
  const [resetValueFocused, setResetValueFocused] = useState(false)
  const [resetValueDraft, setResetValueDraft] = useState('')
  const [useMidpoint, setUseMidpoint] = useState(true)
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [showMeterCue, setShowMeterCue] = useState(false)
  const [showIgtTierInfo, setShowIgtTierInfo] = useState(false)
  const [showCalcInfo, setShowCalcInfo] = useState(false)
  const [includedJpContributions, setIncludedJpContributions] = useState({})

  const activePreset = useMemo(
    () => presetFor(manufacturer, mustHitBy, igtTier, igtLineBet, igtDenom),
    [manufacturer, mustHitBy, igtTier, igtLineBet, igtDenom]
  )
  const concurrentJackpots = useMemo(
    () => getConcurrentJackpotConfigs(manufacturer, igtLineBet, igtDenom),
    [manufacturer, igtLineBet, igtDenom]
  )
  const jpCheckboxJackpots = useMemo(() => {
    if (manufacturer !== 'manual') return concurrentJackpots
    const mhbVal = Number(mustHitBy)
    const resetVal = Number(resetValue)
    const riseVal = Number(meterRise)
    const ready =
      Number.isFinite(mhbVal) &&
      Number.isFinite(resetVal) &&
      Number.isFinite(riseVal) &&
      mhbVal > resetVal &&
      riseVal > 0
    if (!ready) return []
    return [
      {
        key: 'manual-mhb',
        label: `${formatUsd(mhbVal)} MHB`,
        mhb: mhbVal,
        reset: resetVal,
        meterRise: riseVal,
      },
    ]
  }, [manufacturer, concurrentJackpots, mustHitBy, resetValue, meterRise])

  // Outputs
  const [ev, setEv] = useState(0)
  const [evExact, setEvExact] = useState(0)
  const [breakeven, setBreakeven] = useState(0)
  const [breakevenExact, setBreakevenExact] = useState(0)
  const [coinInExpected, setCoinInExpected] = useState(0)
  const [, setJpContribution] = useState(0)
  const [jpContributionByKey, setJpContributionByKey] = useState({})
  const [exposure, setExposure] = useState(0)
  const [isPositive, setIsPositive] = useState(false)

  // Load maker + cap bundle (current, rise, reset, RTP defaults)
  useEffect(() => {
    if (manufacturer === 'manual') return
    const p = presetFor(manufacturer, mustHitBy, igtTier, igtLineBet, igtDenom)
    const mhb = effectiveCap(manufacturer, mustHitBy)
    const useMidpointDefault = manufacturer === 'ainsworth'
    const defaultBreakeven = solveBreakevenEntry({
      mhb,
      rtpPercent: p.rtp,
      riseDollars: p.meterRise,
      useMidpoint: useMidpointDefault,
      manufacturer,
      igtLineBet,
      igtDenom,
    })
    queueMicrotask(() => {
      setCurrent(roundToCents(defaultBreakeven))
      setMeterRise(p.meterRise)
      setResetValue(p.reset)
      setOverallRTP(p.rtp)
    })
  }, [manufacturer, mustHitBy, igtTier, igtLineBet, igtDenom])

  // Keep select value valid: AGS has no 10k tier.
  useEffect(() => {
    if (manufacturer === 'manual') return
    if (manufacturer === 'ags' && mustHitBy === 10000) {
      queueMicrotask(() => setMustHitBy(5000))
    }
  }, [manufacturer, mustHitBy])

  // Ainsworth does not offer a $5,000 must-hit option in the UI.
  useEffect(() => {
    if (manufacturer === 'manual') return
    if (manufacturer === 'ainsworth' && mustHitBy === 5000) {
      queueMicrotask(() => setMustHitBy(500))
    }
  }, [manufacturer, mustHitBy])

  // For IGT, derive must-hit cap from tier + line-bet controls.
  useEffect(() => {
    if (manufacturer !== 'igt') return
    const derived = igtMustHitByFor(igtTier, igtLineBet, igtDenom)
    if (mustHitBy !== derived) {
      queueMicrotask(() => setMustHitBy(derived))
    }
  }, [manufacturer, igtTier, igtLineBet, igtDenom, mustHitBy])

  // AGS and IGT default to full run (no midpoint); Ainsworth defaults to midpoint.
  useEffect(() => {
    if (manufacturer === 'manual') return
    queueMicrotask(() => setUseMidpoint(manufacturer === 'ainsworth'))
  }, [manufacturer])

  // Briefly highlight MHB Meter whenever key selectors change.
  useEffect(() => {
    queueMicrotask(() => setShowMeterCue(true))
    const timer = setTimeout(() => setShowMeterCue(false), 1800)
    return () => clearTimeout(timer)
  }, [manufacturer, mustHitBy, igtTier, igtLineBet, igtDenom])

  // Manual Entry starts with blank money fields and RTP at 85.
  useEffect(() => {
    if (manufacturer !== 'manual') return
    queueMicrotask(() => {
      setCurrent('')
      setMustHitBy('')
      setMeterRise('')
      setResetValue('')
      setOverallRTP(85)
      setUseMidpoint(false)
      setShowAdvanced(true)
    })
  }, [manufacturer])

  // Reset include toggles to checked when concurrent jackpot set changes.
  useEffect(() => {
    const next = {}
    for (const jp of jpCheckboxJackpots) next[jp.key] = true
    const selectedCap = effectiveCap(manufacturer, mustHitBy)
    if (manufacturer === 'ainsworth' && selectedCap !== 10000) {
      next['ainsworth-10000'] = false
    }
    if (manufacturer === 'ags' && selectedCap !== 5000) {
      next['ags-5000'] = false
    }
    queueMicrotask(() => setIncludedJpContributions(next))
  }, [jpCheckboxJackpots, manufacturer, mustHitBy])

  const calculate = useCallback(() => {
    const p = presetFor(manufacturer, mustHitBy, igtTier, igtLineBet, igtDenom)
    const rtp = (Number(overallRTP) || p.rtp) / 100
    const currentVal = manufacturer === 'manual' ? Number(current) : (Number(current) || p.current)
    const mhb = effectiveCap(manufacturer, mustHitBy)
    const riseDollars = manufacturer === 'manual' ? Number(meterRise) : (Number(meterRise) || p.meterRise)
    if (manufacturer === 'manual' && (!Number.isFinite(currentVal) || !Number.isFinite(mhb) || !Number.isFinite(riseDollars) || riseDollars <= 0)) {
      setEv(0)
      setEvExact(0)
      setBreakeven(0)
      setBreakevenExact(0)
      setCoinInExpected(0)
      setJpContribution(0)
      setJpContributionByKey({})
      setExposure(0)
      setIsPositive(false)
      return
    }
    const contributionParts = jpCheckboxJackpots.map((jp) => {
      const target = useMidpoint ? (jp.reset + jp.mhb) / 2 : jp.mhb
      const distanceFromReset = target - jp.reset
      const incrementsFromReset = distanceFromReset / 0.01
      const coinInFromReset = incrementsFromReset * jp.meterRise
      const contributionFraction = coinInFromReset > 0 ? target / coinInFromReset : 0
      const included = includedJpContributions[jp.key] !== false
      return {
        key: jp.key,
        label: jp.label,
        included,
        percent: contributionFraction * 100,
        fraction: included ? contributionFraction : 0,
      }
    })
    const jpContribFraction = contributionParts.reduce((sum, part) => sum + part.fraction, 0)
    const jpContrib = jpContribFraction * 100
    const jpByKey = contributionParts.reduce((acc, part) => {
      acc[part.key] = Number(part.percent.toFixed(2))
      return acc
    }, {})
    const effectiveRtp = Math.min(0.999999, Math.max(0, rtp - jpContribFraction))
    const effectiveHouseEdge = 1 - effectiveRtp

    const evForCurrent = (entry) => {
      const targetAtEntry = useMidpoint
        ? entry + (mhb - entry) * 0.5
        : mhb

      const dollarDistanceAtEntry = Math.max(0, targetAtEntry - entry)
      const incrementsNeededAtEntry = dollarDistanceAtEntry / 0.01
      const coinInToTargetAtEntry = incrementsNeededAtEntry * riseDollars

      const expectedLossAtEntry = coinInToTargetAtEntry * effectiveHouseEdge
      const evAtEntry = targetAtEntry - expectedLossAtEntry

      return {
        targetAtEntry,
        coinInToTargetAtEntry,
        evAtEntry,
      }
    }

    if (mhb <= currentVal) {
      setEv(999)
      setEvExact(999)
      setBreakeven(currentVal)
      setBreakevenExact(currentVal)
      setCoinInExpected(0)
      setJpContribution(0)
      setExposure(0)
      setIsPositive(true)
      return
    }

    const currentEval = evForCurrent(currentVal)
    const target = currentEval.targetAtEntry
    const coinInToTarget = currentEval.coinInToTargetAtEntry
    const finalEV = currentEval.evAtEntry

    // Solve breakeven entry from EV(entry) = 0, independent of the current meter input.
    let lo = 0
    let hi = mhb
    let loEv = evForCurrent(lo).evAtEntry
    let hiEv = evForCurrent(hi).evAtEntry
    let breakevenCurrent

    if (loEv === 0) {
      breakevenCurrent = lo
    } else if (hiEv === 0) {
      breakevenCurrent = hi
    } else if (loEv * hiEv > 0) {
      // No root bracketed: choose the boundary closest to breakeven.
      breakevenCurrent = Math.abs(loEv) <= Math.abs(hiEv) ? lo : hi
    } else {
      for (let i = 0; i < 60; i += 1) {
        const mid = (lo + hi) / 2
        const midEv = evForCurrent(mid).evAtEntry
        if (Math.abs(midEv) < 1e-7 || Math.abs(hi - lo) < 1e-7) {
          lo = mid
          hi = mid
          break
        }
        if (loEv * midEv <= 0) {
          hi = mid
          hiEv = midEv
        } else {
          lo = mid
          loEv = midEv
        }
      }
      breakevenCurrent = (lo + hi) / 2
    }

    const breakevenRounded = Math.ceil(breakevenCurrent)

    const fullIncrements = (target - currentVal) / 0.01
    const stressedRtp = effectiveRtp * 0.85
    const stressedHouseEdge = 1 - stressedRtp
    const stressedLossToHit = fullIncrements * riseDollars * stressedHouseEdge
    const maxExposureDollars = Math.max(0, stressedLossToHit - target)

    setEv(Math.round(finalEV))
    setEvExact(Number(finalEV.toFixed(2)))
    setBreakeven(breakevenRounded)
    setBreakevenExact(Number(breakevenCurrent.toFixed(2)))
    setCoinInExpected(Math.round(coinInToTarget))
    setJpContribution(Number(jpContrib.toFixed(2)))
    setJpContributionByKey(jpByKey)
    setExposure(Math.round(maxExposureDollars))
    setIsPositive(finalEV >= 0)
  }, [
    current,
    mustHitBy,
    meterRise,
    overallRTP,
    useMidpoint,
    manufacturer,
    igtTier,
    igtLineBet,
    igtDenom,
    includedJpContributions,
    jpCheckboxJackpots,
  ])

  useEffect(() => {
    queueMicrotask(() => calculate())
  }, [calculate])

  // Input handlers
  const handleFloatChange = (setter) => (e) => {
    setter(e.target.value.replace(/[^0-9.]/g, ''))
  }
  const handleFloatBlur = (setter, defaultVal) => (e) => {
    let val = parseFloat(e.target.value)
    setter(isNaN(val) ? defaultVal : val)
  }

  const currentBlank = manufacturer === 'manual' && (current === '' || current === null)
  const mustHitByBlank = manufacturer === 'manual' && (mustHitBy === '' || mustHitBy === null)
  const meterRiseBlank = manufacturer === 'manual' && (meterRise === '' || meterRise === null)
  const resetValueBlank = manufacturer === 'manual' && (resetValue === '' || resetValue === null)
  const jpMeterDisplay = jpMeterFocused ? `$${jpMeterDraft}` : (currentBlank ? '---' : formatUsd(current))
  const mustHitByDisplay = mustHitByFocused ? `$${mustHitByDraft}` : (mustHitByBlank ? '---' : formatUsd(mustHitBy))
  const meterRiseDisplay = meterRiseFocused ? `$${meterRiseDraft}` : (meterRiseBlank ? '---' : formatUsdTwoDecimals(meterRise))
  const resetValueDisplay = resetValueFocused ? `$${resetValueDraft}` : (resetValueBlank ? '---' : formatUsd(resetValue))

  const handleJpMeterFocus = () => {
    setJpMeterFocused(true)
    const n = Number(current)
    setJpMeterDraft(Number.isFinite(n) ? String(n) : '')
  }

  const handleJpMeterChange = (e) => {
    let v = e.target.value.replace(/[^0-9.]/g, '')
    const dot = v.indexOf('.')
    if (dot !== -1) {
      v = v.slice(0, dot + 1) + v.slice(dot + 1).replace(/\./g, '')
    }
    setJpMeterDraft(v)
    if (v === '' || v === '.') return
    const num = parseFloat(v)
    if (!Number.isNaN(num)) setCurrent(num)
  }

  const handleJpMeterBlur = () => {
    const n = parseFloat(jpMeterDraft)
    if (jpMeterDraft === '' || jpMeterDraft === '.' || Number.isNaN(n)) {
      if (manufacturer === 'manual') setCurrent('')
      else setCurrent(roundToCents(activePreset.current))
    } else {
      setCurrent(roundToCents(n))
    }
    setJpMeterFocused(false)
    setJpMeterDraft('')
  }

  const handleMustHitByFocus = () => {
    setMustHitByFocused(true)
    const n = Number(mustHitBy)
    setMustHitByDraft(Number.isFinite(n) ? String(n) : '')
  }

  const handleMustHitByChange = (e) => {
    let v = e.target.value.replace(/[^0-9.]/g, '')
    const dot = v.indexOf('.')
    if (dot !== -1) {
      v = v.slice(0, dot + 1) + v.slice(dot + 1).replace(/\./g, '')
    }
    setMustHitByDraft(v)
    if (v === '' || v === '.') return
    const num = parseFloat(v)
    if (!Number.isNaN(num)) setMustHitBy(num)
  }

  const handleMustHitByBlur = () => {
    const n = parseFloat(mustHitByDraft)
    if (mustHitByDraft === '' || mustHitByDraft === '.' || Number.isNaN(n)) {
      if (manufacturer === 'manual') setMustHitBy('')
      else setMustHitBy(500)
    } else {
      const rounded = roundToCents(n)
      setMustHitBy(rounded)
      if (manufacturer === 'manual' && (resetValue === '' || resetValue === null)) {
        setResetValue(roundToCents(rounded * 0.7))
      }
    }
    setMustHitByFocused(false)
    setMustHitByDraft('')
  }

  const handleMeterRiseFocus = () => {
    setMeterRiseFocused(true)
    const n = Number(meterRise)
    setMeterRiseDraft(Number.isFinite(n) ? n.toFixed(2) : '')
  }

  const handleMeterRiseChange = (e) => {
    let v = e.target.value.replace(/[^0-9.]/g, '')
    const dot = v.indexOf('.')
    if (dot !== -1) {
      v = v.slice(0, dot + 1) + v.slice(dot + 1).replace(/\./g, '')
    }
    setMeterRiseDraft(v)
    if (v === '' || v === '.') return
    const num = parseFloat(v)
    if (!Number.isNaN(num)) setMeterRise(num)
  }

  const handleMeterRiseBlur = () => {
    const n = parseFloat(meterRiseDraft)
    if (meterRiseDraft === '' || meterRiseDraft === '.' || Number.isNaN(n)) {
      if (manufacturer === 'manual') setMeterRise('')
      else setMeterRise(activePreset.meterRise)
    } else {
      setMeterRise(n)
    }
    setMeterRiseFocused(false)
    setMeterRiseDraft('')
  }

  const handleResetValueFocus = () => {
    setResetValueFocused(true)
    const n = Number(resetValue)
    setResetValueDraft(Number.isFinite(n) ? String(n) : '')
  }

  const handleResetValueChange = (e) => {
    let v = e.target.value.replace(/[^0-9.]/g, '')
    const dot = v.indexOf('.')
    if (dot !== -1) {
      v = v.slice(0, dot + 1) + v.slice(dot + 1).replace(/\./g, '')
    }
    setResetValueDraft(v)
    if (v === '' || v === '.') return
    const num = parseFloat(v)
    if (!Number.isNaN(num)) setResetValue(num)
  }

  const handleResetValueBlur = () => {
    const n = parseFloat(resetValueDraft)
    if (resetValueDraft === '' || resetValueDraft === '.' || Number.isNaN(n)) {
      if (manufacturer === 'manual') setResetValue('')
      else setResetValue(activePreset.reset)
    } else {
      setResetValue(n)
    }
    setResetValueFocused(false)
    setResetValueDraft('')
  }

  return (
    <div data-calc="mhb" className="min-h-full pb-12">
      <div className="w-full px-0 pt-1">

        {/* Title */}
        <div className="flex items-center mb-6">
          <button onClick={onBack} className="text-[52px] leading-none text-cyan-400 hover:text-cyan-300 -mt-1 mr-4 font-light active:opacity-70">‹</button>
          <div className="flex items-center flex-1 justify-center gap-3">
            <img
              src={CALCULATOR_ICON_SRC.mhb}
              alt=""
              className="h-14 w-14 shrink-0 rounded-2xl object-cover shadow-lg shadow-black/40"
            />
            <div className="text-center leading-none">
              <h1
                className="font-black text-white tracking-[0.5px] text-[32px]"
                style={{
                  textShadow:
                    '-2px -2px 0 #5b21b6, 2px -2px 0 #5b21b6, -2px 2px 0 #0e7490, 2px 2px 0 #0e7490, 0 0 20px rgba(6,182,212,0.35)',
                }}
              >
                MUST HIT BY
              </h1>
              <div className="mt-1 text-[17px] font-semibold tracking-[0.18em] text-cyan-200/90">
                JACKPOT ANALYZER
              </div>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={() => setShowCalcInfo(true)}
              className="flex h-8 w-8 items-center justify-center rounded-md border border-cyan-400/45 bg-cyan-500/10 text-sm font-bold italic text-cyan-200 hover:bg-cyan-500/20"
              aria-label="How calculations work"
            >
              i
            </button>
          </div>
        </div>

        {/* Main Inputs */}
        <div className="bg-gray-900 p-5 rounded-3xl">
          <div className="mb-4">
            <label className="block text-gray-400 text-xs mb-1">Manufacturer</label>
            <div className="grid grid-cols-4 gap-1.5 p-1 bg-gray-800 rounded-2xl">
              {[['ainsworth','Ainsworth'],['ags','AGS'],['igt','IGT'],['manual','Manual']].map(([val,label]) => (
                <button key={val} type="button" onClick={() => {
                  setManufacturer(val)
                  if (val === 'ainsworth' || val === 'ags') setMustHitBy(500)
                }}
                  className={`py-2.5 rounded-xl text-sm font-semibold text-center transition-colors touch-manipulation ${manufacturer === val ? 'bg-cyan-600 text-white' : 'text-gray-400 hover:text-gray-200'}`}>
                  {label}
                </button>
              ))}
            </div>
            <p className="text-gray-500 text-[11px] mt-2 leading-snug">
              Switches the default meter, rise, reset, and RTP to typical for the selected manufacturer.
            </p>
          </div>

          {manufacturer === 'igt' ? (
            <div className="space-y-3">
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="block text-gray-400 text-[11px] mb-0.5">Denom</label>
                  <div className="flex flex-col gap-1 p-1 bg-gray-800 rounded-2xl">
                    {[[0.01,'1¢'],[0.25,'25¢'],[1,'$1'],[2,'$2']].map(([val,label]) => (
                      <button key={val} type="button" onClick={() => setIgtDenom(val)}
                        className={`py-1.5 rounded-xl text-xs font-bold text-center transition-colors touch-manipulation ${igtDenom === val ? 'bg-cyan-600 text-white' : 'text-gray-400 hover:text-gray-200'}`}>
                        {label}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-gray-400 text-[11px] mb-0.5">Line Bet</label>
                  <div className="flex flex-col gap-1 p-1 bg-gray-800 rounded-2xl">
                    {[[1,'×1'],[2,'×2'],[3,'×3'],[5,'×5'],[10,'×10']].map(([val,label]) => (
                      <button key={val} type="button" onClick={() => setIgtLineBet(val)}
                        className={`py-1.5 rounded-xl text-xs font-bold text-center transition-colors touch-manipulation ${igtLineBet === val ? 'bg-cyan-600 text-white' : 'text-gray-400 hover:text-gray-200'}`}>
                        {label}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <div className="mb-0.5 flex items-center gap-1">
                    <label className="block text-gray-400 text-[11px]">Jackpot Tier</label>
                    <button
                      type="button"
                      onClick={() => setShowIgtTierInfo(true)}
                      className="flex h-4 w-4 items-center justify-center rounded-sm border border-cyan-400/45 bg-cyan-500/10 text-[9px] font-bold italic leading-none text-cyan-200 hover:bg-cyan-500/20"
                      aria-label="Show jackpot tier info"
                    >
                      i
                    </button>
                  </div>
                  <div className="flex flex-col gap-1 p-1 bg-gray-800 rounded-2xl">
                    {[['mini','Mini'],['minor','Minor'],['major','Major']].map(([val,label]) => (
                      <button key={val} type="button" onClick={() => setIgtTier(val)}
                        className={`py-1.5 rounded-xl text-xs font-bold text-center transition-colors touch-manipulation ${igtTier === val ? 'bg-cyan-600 text-white' : 'text-gray-400 hover:text-gray-200'}`}>
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-gray-400 text-xs mb-1">MHB Meter (Current)</label>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={jpMeterDisplay}
                    onFocus={handleJpMeterFocus}
                    onChange={handleJpMeterChange}
                    onBlur={handleJpMeterBlur}
                    className={`calc-field-lg mhb-meter-input w-full rounded-2xl bg-gray-800 p-4 text-center text-2xl font-bold text-white outline-none transition-all duration-300 ring-1 ring-inset ring-cyan-300/80 focus:ring-2 focus:ring-cyan-200/85 ${
                      showMeterCue ? (isLight ? 'mhb-meter-cue animate-pulse' : 'ring-2 ring-cyan-100 shadow-[0_0_0_3px_rgba(103,232,249,0.6)] animate-pulse') : ''
                    }`}
                  />
                </div>
                <div>
                  <label className="block text-gray-400 text-xs mb-1">Must Hit By</label>
                  <div className="w-full rounded-2xl bg-gray-800 p-4 text-center text-2xl font-bold text-white tabular-nums">
                    {formatUsd(mustHitBy)}
                  </div>
                </div>
              </div>
            </div>
            ) : (
            <div className="grid grid-cols-2 gap-4 items-stretch">
              <div className="flex flex-col">
                <label className="block text-gray-400 text-xs mb-1">MHB Meter (Current)</label>
                <input
                  type="text"
                  inputMode="decimal"
                  value={jpMeterDisplay}
                  onFocus={handleJpMeterFocus}
                  onClick={(e) => e.currentTarget.select()}
                  onChange={handleJpMeterChange}
                  onBlur={handleJpMeterBlur}
                  className={`calc-field-lg mhb-meter-input flex-1 w-full rounded-2xl bg-gray-800 p-4 text-center text-2xl font-bold text-white outline-none transition-all duration-300 ring-1 ring-inset ring-cyan-300/80 focus:ring-2 focus:ring-cyan-200/85 ${
                    showMeterCue ? (isLight ? 'mhb-meter-cue animate-pulse' : 'ring-2 ring-cyan-100 shadow-[0_0_0_3px_rgba(103,232,249,0.6)] animate-pulse') : ''
                  }`}
                />
              </div>

              <div className="flex flex-col">
                <label className="block text-gray-400 text-xs mb-1">Must Hit By</label>
                  {manufacturer === 'manual' ? (
                    <input
                      type="text"
                      inputMode="decimal"
                      value={mustHitByDisplay}
                      onFocus={handleMustHitByFocus}
                      onClick={(e) => e.currentTarget.select()}
                      onChange={handleMustHitByChange}
                      onBlur={handleMustHitByBlur}
                      className="flex-1 w-full rounded-2xl bg-gray-800 p-4 text-center text-2xl font-bold text-white outline-none ring-cyan-500/0 focus:ring-2 focus:ring-cyan-500/35"
                    />
                  ) : (
                    <div className="flex-1 grid gap-1 p-1 bg-gray-800 rounded-2xl" style={{gridTemplateColumns: `repeat(${[500, manufacturer !== 'ainsworth' && 5000, manufacturer !== 'ags' && 10000].filter(Boolean).length}, 1fr)`}}>
                      {[500, manufacturer !== 'ainsworth' && 5000, manufacturer !== 'ags' && 10000].filter(Boolean).map((val) => (
                        <button key={val} type="button" onClick={() => setMustHitBy(val)}
                          className={`py-3 rounded-xl text-xl font-bold text-center transition-colors touch-manipulation ${mustHitBy === val ? 'bg-cyan-600 text-white' : 'text-gray-400 hover:text-gray-200'}`}>
                          {formatUsd(val)}
                        </button>
                      ))}
                    </div>
                  )}
              </div>
            </div>
          )}
        </div>

        {/* Advanced Settings */}
        <div className="mt-4 bg-gray-900 rounded-3xl overflow-hidden">
          <button onClick={() => setShowAdvanced(!showAdvanced)} className="flex w-full items-center justify-between p-5 text-left hover:bg-gray-800">
            <span className="font-semibold text-white">Advanced Settings</span>
            <span className={`text-white transition-transform ${showAdvanced ? 'rotate-180' : ''}`}>▼</span>
          </button>
          {showAdvanced && (
            <div className="p-4 pt-3 space-y-4 border-t border-gray-800">
              <p className="text-[11px] italic leading-snug text-zinc-500">
                {manufacturer === 'manual'
                  ? 'RTP and Meter Rise are required. Provide Reset Value if possible for more precise analysis - if unknown, we will estimate based on the Must Hit By value.'
                  : 'These defaults are set to observed values. Only change if you know what you\'re doing!'}
              </p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-gray-400 text-[11px] mb-1">RTP %</label>
                  <input
                    type="text"
                    value={overallRTP}
                  onFocus={(e) => e.currentTarget.select()}
                    onChange={handleFloatChange(setOverallRTP, activePreset.rtp)}
                    onBlur={handleFloatBlur(setOverallRTP, activePreset.rtp)}
                    className="h-12 w-full rounded-2xl bg-gray-800 px-3 text-center text-xl font-bold text-white outline-none focus:ring-2 focus:ring-cyan-500/30"
                  />
                </div>

                <div>
                  <label className="block text-gray-400 text-[11px] mb-1">Reset Value</label>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={resetValueDisplay}
                    onFocus={handleResetValueFocus}
                    onClick={(e) => e.currentTarget.select()}
                    onChange={handleResetValueChange}
                    onBlur={handleResetValueBlur}
                    className="h-12 w-full rounded-2xl bg-gray-800 px-3 text-center text-xl font-bold text-white outline-none focus:ring-2 focus:ring-cyan-500/30"
                  />
                </div>
              </div>

              <div>
                <div>
                  <label className="block text-gray-400 text-[11px] mb-1">Meter Rise ($ per $0.01 increment)</label>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={meterRiseDisplay}
                    onFocus={handleMeterRiseFocus}
                    onClick={(e) => e.currentTarget.select()}
                    onChange={handleMeterRiseChange}
                    onBlur={handleMeterRiseBlur}
                    className="h-12 w-full rounded-2xl bg-gray-800 px-3 text-center text-xl font-bold text-white outline-none focus:ring-2 focus:ring-cyan-500/30"
                  />
                </div>
              </div>

              <div>
                <label className="flex h-12 cursor-pointer items-center gap-3 rounded-2xl bg-gray-800 px-3 touch-manipulation">
                  <button
                    type="button"
                    role="switch"
                    aria-checked={useMidpoint}
                    onClick={() => setUseMidpoint((v) => !v)}
                    className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full border transition-colors focus:outline-none focus:ring-2 focus:ring-cyan-500/45 ${
                      useMidpoint ? 'border-cyan-300/70 bg-cyan-500/40' : 'border-gray-600 bg-gray-700'
                    }`}
                  >
                    <span
                      className={`inline-block h-5 w-5 transform rounded-full bg-white transition-transform ${
                        useMidpoint ? 'translate-x-5' : 'translate-x-0.5'
                      }`}
                    />
                  </button>
                  <span className="text-gray-300 text-[13px] leading-snug">Use Midpoint for EV & Breakeven</span>
                </label>
              </div>

              {jpCheckboxJackpots.length > 0 && (
                <div>
                  <div className="rounded-2xl bg-gray-800 p-3">
                    <div className="mb-2 text-center text-[11px] font-semibold text-cyan-300">
                      Include MHB Contribution to RTP
                    </div>
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                      {jpCheckboxJackpots.map((jp) => {
                        const checked = includedJpContributions[jp.key] !== false
                        const pct = jpContributionByKey[jp.key]
                        const label = Number.isFinite(pct) ? `${jp.label} (${pct.toFixed(2)}%)` : jp.label
                        return (
                          <label
                            key={jp.key}
                            className="flex items-center justify-between gap-2 rounded-xl bg-gray-900/70 px-3 py-2 text-[11px] font-semibold text-white tabular-nums"
                          >
                            <span>{label}</span>
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={(e) => {
                                const isChecked = e.target.checked
                                setIncludedJpContributions((prev) => ({ ...prev, [jp.key]: isChecked }))
                              }}
                              className="h-4 w-4 shrink-0 rounded border-gray-600 bg-gray-700 accent-cyan-500"
                            />
                          </label>
                        )
                      })}
                    </div>
                  </div>
                </div>
              )}

            </div>
          )}
        </div>

        {/* Outputs */}
        <div className="mt-5 mb-6 bg-gray-900 p-6 rounded-3xl">
          <h2
            className="mb-6 text-center font-black text-[26px] tracking-[-1px] text-white"
            style={{
              textShadow:
                '-1.5px -1.5px 0 #5b21b6, 1.5px -1.5px 0 #5b21b6, -1.5px 1.5px 0 #0e7490, 1.5px 1.5px 0 #0e7490, 0 0 18px rgba(6,182,212,0.45), 0 0 10px rgba(139,92,246,0.35)',
            }}
          >
            MHB Analysis
          </h2>

          <div className="grid grid-cols-2 gap-4 text-center">
            <div className="bg-gray-800 p-5 rounded-2xl">
              <div className="text-gray-400 text-sm">Expected Value</div>
              <div className={`text-2xl leading-tight font-bold tracking-tight tabular-nums ${ev >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                {formatUsd(ev)}
              </div>
              <div className={`text-xs mt-1 ${ev >= 0 ? 'text-emerald-400/70' : 'text-red-400/70'}`}>
                ${evExact.toFixed(2)}
              </div>
            </div>
            <div className="bg-gray-800 p-5 rounded-2xl">
              <div className="text-gray-400 text-sm">Breakeven Entry</div>
              <div className="text-2xl leading-tight font-bold tracking-tight tabular-nums text-amber-300">{formatUsd(breakeven)}</div>
              <div className="text-xs text-amber-300/70 mt-1">
                ${breakevenExact.toFixed(2)}
              </div>
            </div>
            <div className="bg-gray-800 p-5 rounded-2xl">
              <div className="text-gray-400 text-sm">Coin-in Expected</div>
              <div className="text-2xl leading-tight font-bold tracking-tight tabular-nums text-white">
                {formatUsd(coinInExpected)}
              </div>
            </div>
            <div className="bg-gray-800 p-5 rounded-2xl">
              <div className="text-gray-400 text-sm">Max Exposure</div>
              <div className="text-2xl leading-tight font-bold tracking-tight tabular-nums text-red-400">
                -{formatUsd(exposure)}
              </div>
            </div>
          </div>

          <div className={`mt-6 p-4 rounded-2xl text-center font-bold text-lg ${isPositive ? 'bg-emerald-900 text-emerald-300' : 'bg-red-900 text-red-300'}`}>
            {isPositive ? (
              <>
                <span className="mhb-check-emoji">✅ </span>
                <span className="mhb-check-badge inline-flex items-center justify-center w-5 h-5 rounded border-2 border-[#fff] text-[#fff] text-xs font-black leading-none mr-1.5">✓</span>
                +EV PLAY THIS ONE
              </>
            ) : '❌ Still -EV Keep Waiting'}
          </div>
        </div>

        <BankrollRiskAdvisor
          supabaseClient={supabaseClient}
          maxExpectedLoss={exposure}
          playLabel="Must Hit By"
          playDetails={{ current, mustHitBy, playStake: igtLineBet }}
          accentClass="text-cyan-400"
          accentBtnClass="bg-cyan-600 hover:bg-cyan-500"
        />

        <CalculatorLogPlayButton
          calculatorSlug="mhb"
          prefillValues={{
            mhb_manufacturer: manufacturer,
            ...(Number.isFinite(Number(current))
              ? { mhb_meter: roundToCents(Number(current)) }
              : {}),
            ...(Number.isFinite(effectiveCap(manufacturer, mustHitBy))
              ? { must_hit_by: effectiveCap(manufacturer, mustHitBy) }
              : {}),
            bet_size: igtLineBet,
            denom: igtDenom,
            ...playLogCalcEvPrefill({ expectedEvUsd: ev }),
          }}
          onOpenLogbook={onOpenLogbook}
          logPlayLocked={logPlayLocked}
          onRequireSubscribe={onRequireSubscribe}
          playLogsRemaining={playLogsRemaining}
          freemiumUsageLoading={freemiumUsageLoading}
        />

        <CalculatorDisclaimer className="mt-8" />

        {showIgtTierInfo && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4">
            <div className="w-full max-w-sm rounded-2xl bg-gray-900 p-5 text-white shadow-xl">
              <h3 className="text-lg font-bold text-cyan-300">IGT Jackpot Tier</h3>
              <p className="mt-3 text-sm leading-relaxed text-gray-300">
                This calculator uses
                <span className="font-semibold text-cyan-200"> Mini</span>,
                <span className="font-semibold text-cyan-200"> Minor</span>, and
                <span className="font-semibold text-cyan-200"> Major</span>
                {' '}
                as a consistent naming convention to apply across multiple titles (
                <span className="font-semibold text-cyan-200">Coyote Moon Deluxe</span>,
                <span className="font-semibold text-cyan-200"> Money Storm Deluxe</span>,
                <span className="font-semibold text-cyan-200"> Lobstermania Deluxe</span>).
              </p>
              <p className="mt-2 text-sm leading-relaxed text-gray-300">
                Many IGT games are the same underlying math with different skins, and the jackpot tier names shown on the cabinet can vary by title. Pick the tier by relative level (lowest/middle/highest).
              </p>
              <button
                type="button"
                onClick={() => setShowIgtTierInfo(false)}
                className="mt-5 w-full rounded-xl bg-cyan-600 py-3 font-semibold hover:bg-cyan-500"
              >
                Got it
              </button>
            </div>
          </div>
        )}

        {showCalcInfo && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4">
            <div className={`mhb-info-scroll max-h-[85vh] w-full max-w-md overflow-y-auto rounded-2xl border border-cyan-500/30 bg-gray-900 p-5 text-white shadow-xl [scrollbar-width:thin] [&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:rounded-full ${scrollThumb}`}>
              <h3 className="border-b border-cyan-500/25 pb-2 text-center text-lg font-semibold tracking-[0.08em] text-cyan-200 [font-family:Georgia,'Times_New_Roman',serif]">
                Analytical Methodology
              </h3>
              <details className="mt-3 rounded-xl border border-cyan-500/25 bg-gray-800/60 p-3">
                <summary className="cursor-pointer select-none text-sm font-semibold tracking-[0.03em] text-cyan-200 [font-family:Georgia,'Times_New_Roman',serif]">
                  Non-techie version
                </summary>
                <div className={`mhb-info-scroll mt-2 max-h-40 space-y-2 overflow-y-auto pr-1 text-sm leading-relaxed text-gray-300 [font-family:Georgia,'Times_New_Roman',serif] [scrollbar-width:thin] [&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:rounded-full ${scrollThumbSm}`}>
                  <p>
                    The calculator estimates whether a jackpot is worth playing right now, based on where the meter currently is and how fast it grows.
                  </p>
                  <p>
                    It figures out how much money you are likely to put in before the jackpot hits, then compares that to the expected jackpot return.
                  </p>
                  <p>
                    It also backs out jackpot value already included in the game RTP so you do not double-count value.
                  </p>
                  <p>
                    Breakeven Entry is the meter point where the expected value is about zero. Above that, the game tends to be better; below that, you are usually still waiting.
                  </p>
                  <p>
                    Max Exposure is a worst-case style estimate assuming colder-than-normal performance, so you can see potential downside before getting paid.
                  </p>
                </div>
              </details>
              <details className="mt-3 rounded-xl border border-cyan-500/25 bg-gray-800/60 p-3">
                <summary className="cursor-pointer select-none text-sm font-semibold tracking-[0.03em] text-cyan-200 [font-family:Georgia,'Times_New_Roman',serif]">
                  Dweeb-speak
                </summary>
                <div className={`mhb-info-scroll mt-2 max-h-52 overflow-y-auto pr-1 [scrollbar-width:thin] [&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:rounded-full ${scrollThumbSm}`}>
                  <p className="text-sm italic leading-relaxed text-gray-300 [font-family:Georgia,'Times_New_Roman',serif]">
                    This analyzer is a quantitative framework for progressive-jackpot valuation, breakeven threshold detection, and stressed-loss envelope estimation.
                  </p>
                  <div className="mt-2 space-y-2 text-sm leading-relaxed text-gray-300 [font-family:Georgia,'Times_New_Roman',serif]">
                  <p>
                    <span className="font-semibold text-cyan-200">I. State Space:</span> Let x denote entry meter, M the must-hit boundary, m the observed current meter, R the reset baseline, r the meter-rise coefficient ($ coin-in per $0.01 meter increment), and p the total machine RTP.
                  </p>
                  <p>
                    <span className="font-semibold text-cyan-200">II. Terminal Payoff Functional:</span> The target operator T(x) is piecewise: T(x) = M (midpoint disabled), or T(x) = x + 0.5 x (M - x) (midpoint enabled). For live EV evaluation, set x = m.
                  </p>
                  <p>
                    <span className="font-semibold text-cyan-200">III. Coin-in Path Integral (Discrete Step Form):</span> Required path coin-in is C(x) = ((T(x) - x) / 0.01) x r, i.e., meter displacement mapped to 0.01 increments and scaled by r.
                  </p>
                  <p>
                    <span className="font-semibold text-cyan-200">IV. Concurrent Progressive Return Extraction:</span> For each enabled jackpot i with hit value H_i, reset R_i, and rise coefficient r_i, contribution_i = H_i / (((H_i - R_i) / 0.01) x r_i). Aggregate progressive return term is P = sum_i(contribution_i).
                  </p>
                  <p>
                    <span className="font-semibold text-cyan-200">V. Effective Base RTP Projection:</span> Progressive-adjusted RTP is p_eff = clamp(p - P, 0, 0.999999), enforcing bounded probability-domain behavior.
                  </p>
                  <p>
                    <span className="font-semibold text-cyan-200">VI. Expectation Layer:</span> Expected path loss is L(x) = C(x) x (1 - p_eff), with net expected value EV(x) = T(x) - L(x).
                  </p>
                  <p>
                    <span className="font-semibold text-cyan-200">VII. Breakeven Root Localization:</span> Solve x* such that EV(x*) = 0 over x in [0, M] using bisection on a sign-changing bracket. Displayed breakeven is ceil(x*), while the continuous root is reported beneath.
                  </p>
                  <p>
                    <span className="font-semibold text-cyan-200">VIII. Stress-Case Loss Envelope:</span> Under adverse conversion efficiency, p_stress = 0.85 x p_eff. Stress loss is L_stress(x) = C(x) x (1 - p_stress), and downside exposure is Exposure(x) = max(0, L_stress(x) - T(x)).
                  </p>
                  </div>
                </div>
              </details>
              <button
                type="button"
                onClick={() => setShowCalcInfo(false)}
                className="mt-5 w-full rounded-xl bg-cyan-600 py-3 font-semibold hover:bg-cyan-500"
              >
                Got it
              </button>
            </div>
          </div>
        )}

      </div>
    </div>
  )
}

export default MHBCalculator