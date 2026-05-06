import { useState, useEffect, useMemo } from 'react'
import CalculatorDisclaimer from '../components/CalculatorDisclaimer'

/** Example defaults per maker & cap—floor math still wins over these numbers. */
const MHB_PRESETS = {
  ainsworth: {
    500: { current: 475, meterRise: 2.5, reset: 350, rtp: 85 },
    /** Mid cap: interpolated between 500 and 10k tiers (illustrative). */
    5000: { current: 4894, meterRise: 4.46842, reset: 4446, rtp: 85 },
    10000: { current: 9802, meterRise: 6.66666, reset: 9000, rtp: 85 },
  },
  ags: {
    500: { current: 488, meterRise: 2.72, reset: 365, rtp: 87 },
    /** River Dragons–style bank: meter $3.75 per $0.01, reset $4k (verify glass; some installs show 4995 cap). */
    5000: { current: 4911.76, meterRise: 3.75, reset: 4000, rtp: 87 },
  },
  igt: {
    500: { current: 462, meterRise: 2.35, reset: 338, rtp: 85 },
    5000: { current: 4820, meterRise: 4.33, reset: 4050, rtp: 85 },
    10000: { current: 9740, meterRise: 6.42, reset: 8850, rtp: 85 },
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

function igtMustHitByFor(tier, lineBet) {
  const tierMap = IGT_MHB_BY_TIER_AND_LINE_BET[tier]
  if (!tierMap) return 20
  return tierMap[lineBet] || 20
}

/** AGS does not use a 10k cap in-app; 10k coerces to 5k for presets and math. */
function effectiveCap(manufacturer, mustHitBy) {
  const v = Number(mustHitBy) || 500
  if (manufacturer === 'ags' && v === 10000) return 5000
  return v
}

function presetFor(manufacturer, mustHitBy) {
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

  // Main fields
  const [current, setCurrent] = useState(475)
  const [mustHitBy, setMustHitBy] = useState(500)
  const [jpMeterFocused, setJpMeterFocused] = useState(false)
  const [jpMeterDraft, setJpMeterDraft] = useState('')

  // Advanced Settings
  const [overallRTP, setOverallRTP] = useState(85)
  const [meterRise, setMeterRise] = useState(2.50)
  const [resetValue, setResetValue] = useState(350)
  const [useMidpoint, setUseMidpoint] = useState(true)
  const [showAdvanced, setShowAdvanced] = useState(false)

  const activePreset = useMemo(() => presetFor(manufacturer, mustHitBy), [manufacturer, mustHitBy])

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
    const p = presetFor(manufacturer, mustHitBy)
    setCurrent(p.current)
    setMeterRise(p.meterRise)
    setResetValue(p.reset)
    setOverallRTP(p.rtp)
  }, [manufacturer, mustHitBy])

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
    const derived = igtMustHitByFor(igtTier, igtLineBet)
    if (mustHitBy !== derived) {
      setMustHitBy(derived)
    }
  }, [manufacturer, igtTier, igtLineBet, mustHitBy])

  // AGS defaults to full run (no midpoint); other makers default to midpoint.
  useEffect(() => {
    setUseMidpoint(manufacturer !== 'ags')
  }, [manufacturer])

  const calculate = () => {
    const p = presetFor(manufacturer, mustHitBy)
    const rtp = (Number(overallRTP) || p.rtp) / 100
    const currentVal = Number(current) || p.current
    const mhb = effectiveCap(manufacturer, mustHitBy)
    const riseDollars = Number(meterRise) || p.meterRise
    const resetVal = Number(resetValue) || p.reset

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

    const target = useMidpoint 
      ? currentVal + (mhb - currentVal) * 0.5 
      : mhb

    const dollarDistance = target - currentVal
    const incrementsNeeded = dollarDistance / 0.01
    const coinInToTarget = incrementsNeeded * riseDollars
    const expectedLoss = coinInToTarget * (1 - rtp)

    const finalEV = target - expectedLoss

    const houseEdge = 1 - rtp
    let breakevenCurrent = useMidpoint
      ? mhb * (100 * riseDollars * houseEdge - 1) / (100 * riseDollars * houseEdge + 1)
      : mhb - (riseDollars * 0.01 / houseEdge)

    const breakevenRounded = Math.ceil(breakevenCurrent)

    const jpContrib = 0.4 * (mhb + resetVal) / (mhb - resetVal)

    const fullIncrements = (mhb - currentVal) / 0.01
    const maxExposureDollars = fullIncrements * riseDollars * houseEdge

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
  }, [current, mustHitBy, meterRise, resetValue, overallRTP, useMidpoint, manufacturer])

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

  const jpMeterDisplay = jpMeterFocused ? jpMeterDraft : formatUsd(current)

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
            <div className="grid grid-cols-2 gap-4 items-start">
              <div className="space-y-2">
                <div>
                  <label className="block text-gray-400 text-xs mb-1">MHB Meter (Current)</label>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={jpMeterDisplay}
                    onFocus={handleJpMeterFocus}
                    onChange={handleJpMeterChange}
                    onBlur={handleJpMeterBlur}
                    className="w-full rounded-2xl bg-gray-800 p-4 text-center text-2xl font-bold text-white outline-none ring-cyan-500/0 focus:ring-2 focus:ring-cyan-500/35"
                  />
                </div>
                <div>
                  <label className="block text-gray-400 text-xs mb-1">Must Hit By</label>
                  <div className="w-full rounded-2xl bg-gray-800 p-4 text-center text-2xl font-bold text-white tabular-nums">
                    {formatUsd(mustHitBy)}
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <div>
                  <label className="block text-gray-400 text-xs mb-1">IGT Jackpot Tier</label>
                  <div className="relative">
                    <select
                      value={igtTier}
                      onChange={(e) => setIgtTier(e.target.value)}
                      className="w-full appearance-none rounded-2xl bg-gray-800 p-4 pr-12 text-center text-2xl font-bold text-white outline-none ring-cyan-500/0 focus:ring-2 focus:ring-cyan-500/35"
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

                <div>
                  <label className="block text-gray-400 text-xs mb-1">IGT Line Bet</label>
                  <div className="relative">
                    <select
                      value={igtLineBet}
                      onChange={(e) => setIgtLineBet(Number(e.target.value))}
                      className="w-full appearance-none rounded-2xl bg-gray-800 p-4 pr-12 text-center text-2xl font-bold text-white outline-none ring-cyan-500/0 focus:ring-2 focus:ring-cyan-500/35"
                    >
                      <option value={1}>Line Bet 1</option>
                      <option value={2}>Line Bet 2</option>
                      <option value={3}>Line Bet 3</option>
                      <option value={5}>Line Bet 5</option>
                      <option value={10}>Line Bet 10</option>
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
                  className="w-full rounded-2xl bg-gray-800 p-4 text-center text-2xl font-bold text-white outline-none ring-cyan-500/0 focus:ring-2 focus:ring-cyan-500/35"
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
                  value={meterRise}
                  onChange={handleFloatChange(setMeterRise, activePreset.meterRise)}
                  onBlur={handleFloatBlur(setMeterRise, activePreset.meterRise)}
                  className="w-full rounded-2xl bg-gray-800 p-4 text-center text-2xl font-bold text-white outline-none focus:ring-2 focus:ring-cyan-500/30"
                />
              </div>

              <div>
                <label className="block text-gray-400 text-xs mb-1">Reset Value</label>
                <input
                  type="text"
                  value={resetValue}
                  onChange={handleIntegerChange(setResetValue, activePreset.reset)}
                  onBlur={handleIntegerBlur(setResetValue, activePreset.reset)}
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