import { useState, useEffect, useMemo } from 'react'
import CalculatorDisclaimer from '../components/CalculatorDisclaimer'

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
    20: { meterRise: 0.25, reset: 17 },
    40: { meterRise: 0.25, reset: 34 },
    60: { meterRise: 0.25, reset: 51 },
    100: { meterRise: 0.25, reset: 85 },
    200: { meterRise: 0.25, reset: 170 },
  },
  minor: {
    50: { meterRise: 0.25, reset: 37.5 },
    100: { meterRise: 0.25, reset: 75 },
    150: { meterRise: 0.25, reset: 112.5 },
    250: { meterRise: 0.25, reset: 187.5 },
    500: { meterRise: 0.25, reset: 375 },
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
  if (denom === 0.25) return 90
  if (denom === 1) return 92
  if (denom === 2) return 94
  return 88
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
  const v = Number(mustHitBy) || 500
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

function MHBCalculator({ onBack }) {
  const [manufacturer, setManufacturer] = useState('ainsworth')
  const [igtTier, setIgtTier] = useState('mini')
  const [igtLineBet, setIgtLineBet] = useState(1)
  const [igtDenom, setIgtDenom] = useState(0.01)

  // Main fields
  const [current, setCurrent] = useState(475)
  const [mustHitBy, setMustHitBy] = useState(500)
  const [jpMeterFocused, setJpMeterFocused] = useState(false)
  const [jpMeterDraft, setJpMeterDraft] = useState('')

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

  const activePreset = useMemo(
    () => presetFor(manufacturer, mustHitBy, igtTier, igtLineBet, igtDenom),
    [manufacturer, mustHitBy, igtTier, igtLineBet, igtDenom]
  )

  // Outputs
  const [ev, setEv] = useState(0)
  const [evExact, setEvExact] = useState(0)
  const [breakeven, setBreakeven] = useState(0)
  const [breakevenExact, setBreakevenExact] = useState(0)
  const [coinInExpected, setCoinInExpected] = useState(0)
  const [jpContribution, setJpContribution] = useState(0)
  const [exposure, setExposure] = useState(0)
  const [isPositive, setIsPositive] = useState(false)

  // Load maker + cap bundle (current, rise, reset, RTP defaults)
  useEffect(() => {
    const p = presetFor(manufacturer, mustHitBy, igtTier, igtLineBet, igtDenom)
    setCurrent(p.current)
    setMeterRise(p.meterRise)
    setResetValue(p.reset)
    setOverallRTP(p.rtp)
  }, [manufacturer, mustHitBy, igtTier, igtLineBet, igtDenom])

  // Keep select value valid: AGS has no 10k tier.
  useEffect(() => {
    if (manufacturer === 'ags' && mustHitBy === 10000) {
      setMustHitBy(5000)
    }
  }, [manufacturer, mustHitBy])

  // Ainsworth does not offer a $5,000 must-hit option in the UI.
  useEffect(() => {
    if (manufacturer === 'ainsworth' && mustHitBy === 5000) {
      setMustHitBy(500)
    }
  }, [manufacturer, mustHitBy])

  // For IGT, derive must-hit cap from tier + line-bet controls.
  useEffect(() => {
    if (manufacturer !== 'igt') return
    const derived = igtMustHitByFor(igtTier, igtLineBet, igtDenom)
    if (mustHitBy !== derived) {
      setMustHitBy(derived)
    }
  }, [manufacturer, igtTier, igtLineBet, igtDenom, mustHitBy])

  // AGS and IGT default to full run (no midpoint); Ainsworth defaults to midpoint.
  useEffect(() => {
    setUseMidpoint(manufacturer === 'ainsworth')
  }, [manufacturer])

  // Briefly highlight MHB Meter whenever key selectors change.
  useEffect(() => {
    setShowMeterCue(true)
    const timer = setTimeout(() => setShowMeterCue(false), 1800)
    return () => clearTimeout(timer)
  }, [manufacturer, mustHitBy, igtTier, igtLineBet, igtDenom])

  const calculate = () => {
    const p = presetFor(manufacturer, mustHitBy, igtTier, igtLineBet, igtDenom)
    const rtp = (Number(overallRTP) || p.rtp) / 100
    const currentVal = Number(current) || p.current
    const mhb = effectiveCap(manufacturer, mustHitBy)
    const riseDollars = Number(meterRise) || p.meterRise
    const resetVal = Number(resetValue) || p.reset
    const jpTarget = useMidpoint ? (resetVal + mhb) / 2 : mhb
    const jpDistanceFromReset = jpTarget - resetVal
    const jpIncrementsFromReset = jpDistanceFromReset / 0.01
    const jpCoinInFromReset = jpIncrementsFromReset * riseDollars
    const jpContribFraction = jpCoinInFromReset > 0 ? jpTarget / jpCoinInFromReset : 0
    const jpContrib = jpContribFraction * 100
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
    let lo = resetVal
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
    setExposure(Math.round(maxExposureDollars))
    setIsPositive(finalEV >= 0)
  }

  useEffect(() => {
    calculate()
  }, [current, mustHitBy, meterRise, resetValue, overallRTP, useMidpoint, manufacturer, igtTier, igtLineBet, igtDenom])

  // Input handlers
  const handleIntegerChange = (setter, defaultVal) => (e) => {
    setter(e.target.value.replace(/[^0-9]/g, ''))
  }
  const handleIntegerBlur = (setter, defaultVal) => (e) => {
    let val = parseInt(e.target.value, 10)
    setter(isNaN(val) ? defaultVal : val)
  }
  const handleFloatChange = (setter, defaultVal) => (e) => {
    setter(e.target.value.replace(/[^0-9.]/g, ''))
  }
  const handleFloatBlur = (setter, defaultVal) => (e) => {
    let val = parseFloat(e.target.value)
    setter(isNaN(val) ? defaultVal : val)
  }

  const jpMeterDisplay = jpMeterFocused ? `$${jpMeterDraft}` : formatUsd(current)
  const meterRiseDisplay = meterRiseFocused ? `$${meterRiseDraft}` : formatUsd(meterRise)
  const resetValueDisplay = resetValueFocused ? `$${resetValueDraft}` : formatUsd(resetValue)

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
      setCurrent(activePreset.current)
    } else {
      setCurrent(n)
    }
    setJpMeterFocused(false)
    setJpMeterDraft('')
  }

  const handleMeterRiseFocus = () => {
    setMeterRiseFocused(true)
    const n = Number(meterRise)
    setMeterRiseDraft(Number.isFinite(n) ? String(n) : '')
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
      setMeterRise(activePreset.meterRise)
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
      setResetValue(activePreset.reset)
    } else {
      setResetValue(n)
    }
    setResetValueFocused(false)
    setResetValueDraft('')
  }

  return (
    <div className="min-h-screen bg-gray-950 pb-12">
      <div className="max-w-lg mx-auto px-4 pt-6">

        {/* Title */}
        <div className="flex items-center mb-6">
          <button onClick={onBack} className="text-[52px] leading-none text-violet-400 hover:text-violet-300 -mt-1 mr-4 font-light active:opacity-70">‹</button>
          <div className="flex items-center flex-1 justify-center gap-3">
            <img
              src="/guides/mhb/mhb-calculator-icon.webp"
              alt=""
              className="h-14 w-14 shrink-0 rounded-2xl object-cover shadow-lg shadow-black/40"
            />
            <h1 className="font-black text-white tracking-[-1.8px] text-[32px]"
                style={{
                  textShadow:
                    '-2px -2px 0 #5b21b6, 2px -2px 0 #5b21b6, -2px 2px 0 #0e7490, 2px 2px 0 #0e7490, 0 0 20px rgba(6,182,212,0.35)',
                }}>
              MUST HIT BY
            </h1>
          </div>
          <div className="w-12" />
        </div>

        {/* Main Inputs */}
        <div className="bg-gray-900 p-5 rounded-3xl">
          <div className="mb-4">
            <label className="block text-gray-400 text-xs mb-1">Manufacturer</label>
            <div className="relative">
              <select
                value={manufacturer}
                onChange={(e) => setManufacturer(e.target.value)}
                className="w-full appearance-none rounded-2xl bg-gray-800 p-3.5 pr-10 text-center text-lg font-bold text-white outline-none ring-cyan-500/0 focus:ring-2 focus:ring-cyan-500/35"
              >
                <option value="ainsworth">Ainsworth</option>
                <option value="ags">AGS</option>
                <option value="igt">IGT</option>
              </select>
              <svg
                aria-hidden="true"
                viewBox="0 0 20 20"
                className="pointer-events-none absolute right-3 top-1/2 h-5 w-5 -translate-y-1/2 text-white/90"
                fill="currentColor"
              >
                <path
                  fillRule="evenodd"
                  d="M5.23 7.21a.75.75 0 0 1 1.06.02L10 11.168l3.71-3.936a.75.75 0 1 1 1.08 1.04l-4.24 4.5a.75.75 0 0 1-1.08 0l-4.24-4.5a.75.75 0 0 1 .02-1.06Z"
                  clipRule="evenodd"
                />
              </svg>
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
                  <div className="relative">
                    <select
                      value={igtDenom}
                      onChange={(e) => setIgtDenom(Number(e.target.value))}
                      className="w-full appearance-none rounded-2xl bg-gray-800 p-3 pr-10 text-center text-base font-bold text-white outline-none ring-cyan-500/0 focus:ring-2 focus:ring-cyan-500/35"
                    >
                      <option value={0.01}>$0.01</option>
                      <option value={0.25}>$0.25</option>
                      <option value={1}>$1</option>
                      <option value={2}>$2</option>
                    </select>
                    <svg
                      aria-hidden="true"
                      viewBox="0 0 20 20"
                      className="pointer-events-none absolute right-3 top-1/2 h-5 w-5 -translate-y-1/2 text-white/90"
                      fill="currentColor"
                    >
                      <path
                        fillRule="evenodd"
                        d="M5.23 7.21a.75.75 0 0 1 1.06.02L10 11.168l3.71-3.936a.75.75 0 1 1 1.08 1.04l-4.24 4.5a.75.75 0 0 1-1.08 0l-4.24-4.5a.75.75 0 0 1 .02-1.06Z"
                        clipRule="evenodd"
                      />
                    </svg>
                  </div>
                </div>

                <div>
                  <label className="block text-gray-400 text-[11px] mb-0.5">Line Bet</label>
                  <div className="relative">
                    <select
                      value={igtLineBet}
                      onChange={(e) => setIgtLineBet(Number(e.target.value))}
                      className="w-full appearance-none rounded-2xl bg-gray-800 p-3 pr-10 text-center text-base font-bold text-white outline-none ring-cyan-500/0 focus:ring-2 focus:ring-cyan-500/35"
                    >
                      <option value={1}>Bet 1</option>
                      <option value={2}>Bet 2</option>
                      <option value={3}>Bet 3</option>
                      <option value={5}>Bet 5</option>
                      <option value={10}>Bet 10</option>
                    </select>
                    <svg
                      aria-hidden="true"
                      viewBox="0 0 20 20"
                      className="pointer-events-none absolute right-3 top-1/2 h-5 w-5 -translate-y-1/2 text-white/90"
                      fill="currentColor"
                    >
                      <path
                        fillRule="evenodd"
                        d="M5.23 7.21a.75.75 0 0 1 1.06.02L10 11.168l3.71-3.936a.75.75 0 1 1 1.08 1.04l-4.24 4.5a.75.75 0 0 1-1.08 0l-4.24-4.5a.75.75 0 0 1 .02-1.06Z"
                        clipRule="evenodd"
                      />
                    </svg>
                  </div>
                </div>

                <div>
                  <label className="block text-gray-400 text-[11px] mb-0.5">Jackpot Tier</label>
                  <div className="relative">
                    <select
                      value={igtTier}
                      onChange={(e) => setIgtTier(e.target.value)}
                      className="w-full appearance-none rounded-2xl bg-gray-800 p-3 pr-10 text-center text-base font-bold text-white outline-none ring-cyan-500/0 focus:ring-2 focus:ring-cyan-500/35"
                    >
                      <option value="mini">Mini</option>
                      <option value="minor">Minor</option>
                      <option value="major">Major</option>
                    </select>
                    <svg
                      aria-hidden="true"
                      viewBox="0 0 20 20"
                      className="pointer-events-none absolute right-3 top-1/2 h-5 w-5 -translate-y-1/2 text-white/90"
                      fill="currentColor"
                    >
                      <path
                        fillRule="evenodd"
                        d="M5.23 7.21a.75.75 0 0 1 1.06.02L10 11.168l3.71-3.936a.75.75 0 1 1 1.08 1.04l-4.24 4.5a.75.75 0 0 1-1.08 0l-4.24-4.5a.75.75 0 0 1 .02-1.06Z"
                        clipRule="evenodd"
                      />
                    </svg>
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
                    className={`w-full rounded-2xl bg-gray-800 p-4 text-center text-2xl font-bold text-white outline-none transition-all duration-300 ring-1 ring-cyan-400/45 focus:ring-2 focus:ring-cyan-300/65 ${
                      showMeterCue ? 'ring-2 ring-cyan-200/95 shadow-[0_0_0_3px_rgba(103,232,249,0.45)] animate-pulse' : ''
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
                  className={`w-full rounded-2xl bg-gray-800 p-4 text-center text-2xl font-bold text-white outline-none transition-all duration-300 ring-1 ring-cyan-400/45 focus:ring-2 focus:ring-cyan-300/65 ${
                    showMeterCue ? 'ring-2 ring-cyan-200/95 shadow-[0_0_0_3px_rgba(103,232,249,0.45)] animate-pulse' : ''
                  }`}
                />
              </div>

              <div>
                <label className="block text-gray-400 text-xs mb-1">Must Hit By</label>
                <div className="relative">
                  <select
                    value={mustHitBy}
                    onChange={(e) => setMustHitBy(Number(e.target.value))}
                    className="w-full appearance-none rounded-2xl bg-gray-800 p-4 pr-12 text-center text-2xl font-bold text-white outline-none ring-cyan-500/0 focus:ring-2 focus:ring-cyan-500/35"
                  >
                    <option value={500}>{formatUsd(500)}</option>
                    {manufacturer !== 'ainsworth' ? (
                      <option value={5000}>{formatUsd(5000)}</option>
                    ) : null}
                    {manufacturer !== 'ags' ? <option value={10000}>{formatUsd(10000)}</option> : null}
                  </select>
                  <svg
                    aria-hidden="true"
                    viewBox="0 0 20 20"
                    className="pointer-events-none absolute right-3 top-1/2 h-5 w-5 -translate-y-1/2 text-white/90"
                    fill="currentColor"
                  >
                    <path
                      fillRule="evenodd"
                      d="M5.23 7.21a.75.75 0 0 1 1.06.02L10 11.168l3.71-3.936a.75.75 0 1 1 1.08 1.04l-4.24 4.5a.75.75 0 0 1-1.08 0l-4.24-4.5a.75.75 0 0 1 .02-1.06Z"
                      clipRule="evenodd"
                    />
                  </svg>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Advanced Settings */}
        <div className="mt-6 bg-gray-900 rounded-3xl overflow-hidden">
          <button onClick={() => setShowAdvanced(!showAdvanced)} className="flex w-full items-center justify-between p-5 text-left hover:bg-gray-800">
            <span className="font-semibold text-white">Advanced Settings</span>
            <span className={`text-white transition-transform ${showAdvanced ? 'rotate-180' : ''}`}>▼</span>
          </button>
          {showAdvanced && (
            <div className="p-5 pt-4 space-y-6 border-t border-gray-800">
              <p className="text-[11px] italic leading-snug text-zinc-500">
                These defaults are set to known values. Only change if you know what you're doing!
              </p>
              <div>
                <label className="block text-gray-400 text-xs mb-1">RTP %</label>
                <input
                  type="text"
                  value={overallRTP}
                  onChange={handleFloatChange(setOverallRTP, activePreset.rtp)}
                  onBlur={handleFloatBlur(setOverallRTP, activePreset.rtp)}
                  className="w-full rounded-2xl bg-gray-800 p-4 text-center text-2xl font-bold text-white outline-none focus:ring-2 focus:ring-cyan-500/30"
                />
              </div>

              <div>
                <label className="block text-gray-400 text-xs mb-1">Meter Rise ($ per $0.01 increment)</label>
                <input
                  type="text"
                  inputMode="decimal"
                  value={meterRiseDisplay}
                  onFocus={handleMeterRiseFocus}
                  onChange={handleMeterRiseChange}
                  onBlur={handleMeterRiseBlur}
                  className="w-full rounded-2xl bg-gray-800 p-4 text-center text-2xl font-bold text-white outline-none focus:ring-2 focus:ring-cyan-500/30"
                />
              </div>

              <div>
                <label className="block text-gray-400 text-xs mb-1">Reset Value</label>
                <input
                  type="text"
                  inputMode="decimal"
                  value={resetValueDisplay}
                  onFocus={handleResetValueFocus}
                  onChange={handleResetValueChange}
                  onBlur={handleResetValueBlur}
                  className="w-full rounded-2xl bg-gray-800 p-4 text-center text-2xl font-bold text-white outline-none focus:ring-2 focus:ring-cyan-500/30"
                />
              </div>

              <div>
                <label className="block text-gray-400 text-xs mb-1">JP Contribution</label>
                <div className="w-full rounded-2xl bg-gray-800 p-4 text-center text-2xl font-bold text-white tabular-nums">
                  +{jpContribution}%
                </div>
              </div>

              <label className="flex cursor-pointer items-center gap-3 rounded-2xl bg-gray-800 p-4 touch-manipulation">
                <input
                  type="checkbox"
                  checked={useMidpoint}
                  onChange={(e) => setUseMidpoint(e.target.checked)}
                  className="h-5 w-5 shrink-0 rounded border-gray-600 bg-gray-700 accent-violet-600 focus:ring-2 focus:ring-cyan-500/45 focus:ring-offset-0 focus:ring-offset-gray-800"
                />
                <span className="text-gray-300 text-sm leading-snug">
                  Use Midpoint for EV & Breakeven
                </span>
              </label>
            </div>
          )}
        </div>

        {/* Outputs */}
        <div className="mt-8 bg-gray-900 p-6 rounded-3xl">
          <h2 className="mb-6 text-center text-xl font-semibold text-violet-400">
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
            {isPositive ? '✅ +EV — PLAY THIS ONE' : '❌ Still -EV — Keep Waiting'}
          </div>
        </div>

        <CalculatorDisclaimer className="mt-8" />

        
      </div>
    </div>
  )
}

export default MHBCalculator