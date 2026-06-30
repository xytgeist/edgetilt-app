import { useState, useEffect, useCallback, useMemo } from 'react'
import CalculatorDisclaimer from '../../../components/CalculatorDisclaimer'
import { CALCULATOR_ICON_SRC } from '../calculatorAccess.js'
import BankrollRiskAdvisor from '../BankrollRiskAdvisor.jsx'
import CalculatorLogPlayButton from '../CalculatorLogPlayButton.jsx'
import { playLogCalcEvPrefill, recommendedAcquisitionFeeUsd } from '../../../utils/playLogCalcSnapshot.js'
import { formatDenomLabel } from '../../../utils/formatDenomLabel'
import { DropdownSelect } from '../DropdownSelect'

const MUST_HIT = {
  mega: 350,
  grand: 250,
  major: 200,
  minor: 150,
  mini: 125,
}

const AVG_PAYOUT = {
  mega: 210,
  grand: 100,
  major: 60,
  minor: 20,
  mini: 7.5,
}

const SPINS_PER_INCREMENT = {
  mega: 95,
  grand: 72,
  major: 64,
  minor: 45,
  mini: 35,
}

const MIDPOINT = {
  mega: 300,
  grand: 225,
  major: 175,
  minor: 125,
  mini: 100,
}

const RESET = {
  mega: 250,
  grand: 200,
  major: 150,
  minor: 100,
  mini: 75,
}

/** Denoms available in the UI (no options above $2). */
const DENOM_OPTIONS = [0.01, 0.02, 0.05, 0.1, 0.25, 1, 2]

/** Volatility index for max-exposure grind (σ on realized RTP % ≈ 100 × VI / √N). */
const MAX_EXPOSURE_VOLATILITY_INDEX = 10
/** Credit this fraction of target meter avg bonus pay against grind losses. */
const MAX_EXPOSURE_BONUS_PAY_FRACTION = 0.5

/** Slider may use full must-hit on the track; stored counter stops one below must-hit. */
function meterCounterValue(value, mustHit, reset) {
  return Math.min(mustHit - 1, Math.max(reset, Number(value) || reset))
}

/** Where to draw the +EV tick (0–100%) along the range min→max. */
function plusEvMarkerPercent(min, max, plusEv) {
  if (max <= min) return 0
  return Math.min(100, Math.max(0, ((plusEv - min) / (max - min)) * 100))
}

/**
 * Approx. break-even counter for this meter alone (green marker).
 * meterEV = payout − (1 − grindRtp) × spinsRemaining; solve for counter.
 * Uses nominal SPI and overall paytable RTP for the BE marker (original behavior).
 */
function dynamicPlusEvCounter(mustHit, payout, spi, grindRtpDecimal, reset) {
  const lossPerSpin = 1 - grindRtpDecimal
  if (lossPerSpin <= 0) return reset

  const spinsToBreakEven = payout / lossPerSpin
  const rawCounter = mustHit - (spinsToBreakEven / spi)
  const clamped = Math.min(mustHit, Math.max(reset, rawCounter))
  // Round up so the displayed threshold is the first whole number at or above +EV.
  return Math.ceil(clamped)
}

/**
 * SPI (avg spins per +1 counter) so standalone RTP at grindRtpDecimal is ~100% at breakEvenCounter.
 */
function spiCalibratedForBreakEvenRtp(mustHit, payout, breakEvenCounter, grindRtpDecimal) {
  const houseEdge = 1 - grindRtpDecimal
  if (houseEdge <= 0) return null
  const ticksRemaining = Math.max(0.5, mustHit - breakEvenCounter)
  const spinsToMustHit = payout / houseEdge
  return spinsToMustHit / ticksRemaining
}

function getCalibrationFromCycle(overallRTP, meters) {
  const megaMeter = meters.find(m => m.label === 'Mega') || meters[0]
  const megaCycleSpins = (megaMeter.mustHit - megaMeter.reset) * megaMeter.spi
  if (!Number.isFinite(megaCycleSpins) || megaCycleSpins <= 0) {
    return { baseRTP: overallRTP, bonusRTP: 0, totalBonusBets: 0, megaCycleSpins: 1, meterCycleData: [] }
  }

  const meterCycleData = meters.map((m) => {
    const cycleSpins = (m.mustHit - m.reset) * m.spi
    const hitsPerMegaCycle = megaCycleSpins / cycleSpins
    const bonusBetsPerMegaCycle = hitsPerMegaCycle * m.payout
    return { ...m, cycleSpins, bonusBetsPerMegaCycle }
  })

  const totalBonusBets = meterCycleData.reduce((sum, m) => sum + m.bonusBetsPerMegaCycle, 0)
  const bonusShare = totalBonusBets / megaCycleSpins
  const bonusRTP = overallRTP * bonusShare
  const baseRTP = overallRTP - bonusRTP

  return { baseRTP, bonusRTP, totalBonusBets, megaCycleSpins, meterCycleData }
}

/**
 * Standalone RTP for one meter at the current counter (same base-RTP grind as green +EV BE).
 * 100 + 100 × (avg payout ÷ spins to must-hit − house edge).
 */
function perMeterStandaloneStateRtpPct(mustHit, counter, payout, spi, baseRtpDecimal) {
  const spinsRemaining = Math.max(0.0001, (mustHit - counter) * spi)
  const houseEdge = 1 - baseRtpDecimal
  return 100 + 100 * (payout / spinsRemaining - houseEdge)
}

/** 1σ below overall RTP % over N spins (VI = volatility index). */
function stressRtpOneSigmaBelow(overallRtpPct, spins, vi = MAX_EXPOSURE_VOLATILITY_INDEX) {
  if (!Number.isFinite(spins) || spins <= 0) return overallRtpPct
  const sigmaPts = (100 * vi) / Math.sqrt(spins)
  return Math.max(0, overallRtpPct - sigmaPts)
}

/**
 * Target = highest solo RTP meter. Max exposure = grind loss to must-hit at -1σ RTP
 * minus 50% of that meter's avg expected bonus return (configured avg pay).
 */
function targetMeterMaxExposure(snapshots, overallRtpPct) {
  const empty = {
    label: 'n/a',
    standaloneRtp: 0,
    counter: 0,
    mustHit: 0,
    spins: 0,
    overallRtpPct,
    sigmaRtpPts: 0,
    stressRtpPct: overallRtpPct,
    grindLossBets: 0,
    bonusRecoveryBets: 0,
    exposureBets: 0,
  }
  if (!snapshots?.length) return empty

  let target = snapshots[0]
  for (let i = 1; i < snapshots.length; i += 1) {
    if (snapshots[i].standaloneRtp > target.standaloneRtp) target = snapshots[i]
  }
  const ticksRemaining = Math.max(0, target.mustHit - target.counter)
  const spins = Math.round(ticksRemaining * target.nominalSpi)
  const sigmaRtpPts = spins > 0 ? (100 * MAX_EXPOSURE_VOLATILITY_INDEX) / Math.sqrt(spins) : 0
  const stressRtpPct = stressRtpOneSigmaBelow(overallRtpPct, spins)
  const grindLossBets = spins * Math.max(0, 1 - stressRtpPct / 100)
  const bonusRecoveryBets = MAX_EXPOSURE_BONUS_PAY_FRACTION * target.payout
  const exposureBets = Math.round(Math.max(0, grindLossBets - bonusRecoveryBets))

  return {
    label: target.label,
    standaloneRtp: target.standaloneRtp,
    counter: target.counter,
    mustHit: target.mustHit,
    spins,
    overallRtpPct,
    sigmaRtpPts,
    stressRtpPct,
    grindLossBets: Math.round(grindLossBets),
    bonusRecoveryBets,
    exposureBets,
  }
}

/**
 * Calibrated current-state RTP:
 * 1) Compute bonus share from reset-cycle math.
 * 2) Split that bonus share across meters by long-run weight.
 * 3) Scale each meter by current position (must-reset)/(must-counter).
 */
function getCalibratedStateRTP(overallRTP, meters) {
  const { baseRTP, bonusRTP, totalBonusBets, meterCycleData } = getCalibrationFromCycle(overallRTP, meters)

  const stateBonusRTP = meterCycleData.reduce((sum, m) => {
    const meterWeight = totalBonusBets > 0 ? (m.bonusBetsPerMegaCycle / totalBonusBets) : 0
    const meterBaselineRTP = bonusRTP * meterWeight

    const remainingTicks = Math.max(0.5, m.mustHit - m.counter)
    const scale = (m.mustHit - m.reset) / remainingTicks
    return sum + (meterBaselineRTP * scale)
  }, 0)

  return baseRTP + stateBonusRTP
}

function StackUpPays({ onBack, supabaseClient = null, onOpenLogbook = null, logPlayLocked = false, onRequireSubscribe = null, playLogsRemaining = null, freemiumUsageLoading = false }) {
  const [mega, setMega] = useState(300)
  const [grand, setGrand] = useState(225)
  const [major, setMajor] = useState(175)
  const [minor, setMinor] = useState(125)
  const [mini, setMini] = useState(100)

  const [betSize, setBetSize] = useState(25)
  const [denom, setDenom] = useState(0.1)
  const [overallRTP, setOverallRTP] = useState(89)
  const [rtpInput, setRtpInput] = useState('89')

  const [evAvg, setEvAvg] = useState(0)
  const [currentRTP, setCurrentRTP] = useState(89)
  const [isAlreadyPositive, setIsAlreadyPositive] = useState(false)
  const [projectedHits, setProjectedHits] = useState(0)
  const [spinsToPositive, setSpinsToPositive] = useState(null)
  const [simulationSteps, setSimulationSteps] = useState([])

  const [scoutPercentage, setScoutPercentage] = useState(10)
  const [showInfoModal, setShowInfoModal] = useState(false)
  const [showAdvanced, setShowAdvanced] = useState(false)

  useEffect(() => {
    if (!DENOM_OPTIONS.some((d) => Math.abs(d - denom) < 1e-9)) {
      queueMicrotask(() => setDenom(2))
    }
  }, [denom])

  // Auto-update RTP when denomination changes
  useEffect(() => {
    let base = 91
    if (denom <= 0.02) base = 88
    else if (denom === 0.05) base = 88.5
    else if (denom === 0.1) base = 89
    else if (denom === 0.25) base = 90
    else if (denom >= 0.5) base = 92

    queueMicrotask(() => {
      setOverallRTP(base)
      setRtpInput(String(base))
    })
  }, [denom])

  const calculate = useCallback(() => {
    const meterData = [
      { label: 'Mega',  counter: meterCounterValue(mega, MUST_HIT.mega, RESET.mega),  mustHit: MUST_HIT.mega,  payout: AVG_PAYOUT.mega,  spi: SPINS_PER_INCREMENT.mega, reset: RESET.mega,  mid: MIDPOINT.mega },
      { label: 'Grand', counter: meterCounterValue(grand, MUST_HIT.grand, RESET.grand), mustHit: MUST_HIT.grand, payout: AVG_PAYOUT.grand, spi: SPINS_PER_INCREMENT.grand, reset: RESET.grand, mid: MIDPOINT.grand },
      { label: 'Major', counter: meterCounterValue(major, MUST_HIT.major, RESET.major), mustHit: MUST_HIT.major, payout: AVG_PAYOUT.major, spi: SPINS_PER_INCREMENT.major, reset: RESET.major, mid: MIDPOINT.major },
      { label: 'Minor', counter: meterCounterValue(minor, MUST_HIT.minor, RESET.minor), mustHit: MUST_HIT.minor, payout: AVG_PAYOUT.minor, spi: SPINS_PER_INCREMENT.minor, reset: RESET.minor, mid: MIDPOINT.minor },
      { label: 'Mini',  counter: meterCounterValue(mini, MUST_HIT.mini, RESET.mini),  mustHit: MUST_HIT.mini,  payout: AVG_PAYOUT.mini,  spi: SPINS_PER_INCREMENT.mini, reset: RESET.mini,  mid: MIDPOINT.mini },
    ]

    const stateRTP = getCalibratedStateRTP(overallRTP, meterData)

    // Strategy:
    // 1) Use current state RTP as the edge rate.
    // 2) Project only spins-until-stop (first state where RTP drops below 100%).
    // 3) Expected bets won = spinsUntilStop * (currentRTP - 100%).
    const simMeters = meterData.map(m => ({ ...m }))
    const maxEvents = 60
    let projectedSpinsToStop = 0
    let projectedSessionEV = 0
    let hits = 0
    let spinsUntilPositive = null
    const steps = []
    const spinEpsilon = 0.0001

    if (stateRTP >= 100) {
      for (let eventIndex = 0; eventIndex < maxEvents; eventIndex += 1) {
        const rtpBeforeEvent = getCalibratedStateRTP(overallRTP, simMeters)
        if (rtpBeforeEvent < 100) break

        // Smooth next-hit modeling:
        // use expected-first-hit instead of hard "earliest meter always hits",
        // which avoids discontinuous jumps from tiny meter changes.
        const spinsToHitArr = simMeters.map((m) => Math.max(spinEpsilon, (m.mustHit - m.counter) * m.spi))
        const rates = spinsToHitArr.map((s) => 1 / s)
        const rateSum = rates.reduce((a, b) => a + b, 0)
        if (!Number.isFinite(rateSum) || rateSum <= 0) break
        const probs = rates.map((r) => r / rateSum)
        const safeSpins = Math.max(spinEpsilon, 1 / rateSum)

        // Use per-leg RTP (before the event) for EV accumulation.
        projectedSessionEV += safeSpins * ((rtpBeforeEvent / 100) - 1)
        projectedSpinsToStop += safeSpins

        // Advance all meters as expected during those spins.
        simMeters.forEach((m, idx) => {
          const advanced = Math.min(m.mustHit, m.counter + (safeSpins / m.spi))
          // Expected reset blend: meter resets with probability it is first to hit.
          m.counter = probs[idx] * m.reset + (1 - probs[idx]) * advanced
        })

        // One expected event occurs per leg.
        hits += 1
        const rtpAfterEvent = getCalibratedStateRTP(overallRTP, simMeters)
        const likelyHitIndex = probs.reduce((best, p, idx) => (p > probs[best] ? idx : best), 0)
        const likelyHit = simMeters[likelyHitIndex]?.label || 'Unknown'

        steps.push({
          step: eventIndex + 1,
          hit: likelyHit,
          spins: safeSpins,
          legRTP: rtpBeforeEvent,
          cumulativeSpins: projectedSpinsToStop,
          rtpAfterEvent,
          counters: {
            mega: Number(simMeters[0].counter.toFixed(1)),
            grand: Number(simMeters[1].counter.toFixed(1)),
            major: Number(simMeters[2].counter.toFixed(1)),
            minor: Number(simMeters[3].counter.toFixed(1)),
            mini: Number(simMeters[4].counter.toFixed(1)),
          },
        })

        if (rtpAfterEvent < 100) break
      }
    }

    const projectedHitsToStop = hits

    setCurrentRTP(Math.round(stateRTP * 10) / 10)
    setEvAvg(projectedSessionEV)
    setProjectedHits(projectedHitsToStop)
    setSpinsToPositive(spinsUntilPositive)
    setSimulationSteps(steps)

    const alreadyPositive = stateRTP >= 100
    setIsAlreadyPositive(alreadyPositive)
  }, [mega, grand, major, minor, mini, overallRTP])

  useEffect(() => {
    queueMicrotask(() => calculate())
  }, [calculate])

  const meterSliderMetrics = useMemo(() => {
    const rows = [
      { label: 'Mega', counter: mega, mustHit: MUST_HIT.mega, reset: RESET.mega, payout: AVG_PAYOUT.mega, nominalSpi: SPINS_PER_INCREMENT.mega },
      { label: 'Grand', counter: grand, mustHit: MUST_HIT.grand, reset: RESET.grand, payout: AVG_PAYOUT.grand, nominalSpi: SPINS_PER_INCREMENT.grand },
      { label: 'Major', counter: major, mustHit: MUST_HIT.major, reset: RESET.major, payout: AVG_PAYOUT.major, nominalSpi: SPINS_PER_INCREMENT.major },
      { label: 'Minor', counter: minor, mustHit: MUST_HIT.minor, reset: RESET.minor, payout: AVG_PAYOUT.minor, nominalSpi: SPINS_PER_INCREMENT.minor },
      { label: 'Mini', counter: mini, mustHit: MUST_HIT.mini, reset: RESET.mini, payout: AVG_PAYOUT.mini, nominalSpi: SPINS_PER_INCREMENT.mini },
    ]
    const meterData = rows.map((r) => ({
      label: r.label,
      counter: meterCounterValue(r.counter, r.mustHit, r.reset),
      mustHit: r.mustHit,
      reset: r.reset,
      payout: r.payout,
      spi: r.nominalSpi,
    }))
    const baseRtpDecimal = getCalibrationFromCycle(overallRTP, meterData).baseRTP / 100
    const overallRtpDecimal = overallRTP / 100

    /** @type {Record<string, { breakEvenCounter: number, rtpSpi: number, grindRtpDecimal: number }>} */
    const byLabel = {}
    /** @type {{ label: string, counter: number, mustHit: number, payout: number, nominalSpi: number, standaloneRtp: number }[]} */
    const snapshots = []
    for (const r of rows) {
      const counter = meterCounterValue(r.counter, r.mustHit, r.reset)
      const breakEvenCounter = dynamicPlusEvCounter(
        r.mustHit,
        r.payout,
        r.nominalSpi,
        overallRtpDecimal,
        r.reset,
      )
      const rtpSpi =
        spiCalibratedForBreakEvenRtp(r.mustHit, r.payout, breakEvenCounter, baseRtpDecimal) ??
        r.nominalSpi
      byLabel[r.label] = { breakEvenCounter, rtpSpi, grindRtpDecimal: baseRtpDecimal }
      snapshots.push({
        label: r.label,
        counter,
        mustHit: r.mustHit,
        payout: r.payout,
        nominalSpi: r.nominalSpi,
        standaloneRtp: perMeterStandaloneStateRtpPct(
          r.mustHit,
          counter,
          r.payout,
          rtpSpi,
          baseRtpDecimal,
        ),
      })
    }
    return {
      byLabel,
      maxExposure: targetMeterMaxExposure(snapshots, overallRTP),
    }
  }, [mega, grand, major, minor, mini, overallRTP])

  return (
    <div data-calc="stackup" className="min-h-full pb-12">
      <div className="w-full px-0 pt-1">

        {/* Title block */}
        <div className="flex items-center mb-6">
          <button
            onClick={onBack}
            className="text-[52px] leading-none text-cyan-400 hover:text-cyan-300 -mt-1 mr-4 font-light active:opacity-70"
          >
            ‹
          </button>

          <div className="flex items-center flex-1 justify-center gap-3">
            <img 
              src={CALCULATOR_ICON_SRC.stackup} 
              alt="Stack Up Volcano" 
              className="w-14 h-14 object-cover rounded-2xl shadow-lg" 
            />
            <div className="flex flex-col items-center -space-y-[6px] -mt-1">
              <h1 className="font-montserrat text-[31px] font-bold tracking-[-1.3px] text-cyan-100">
                STACK UP PAYS
              </h1>
              <p className="text-cyan-300/90 text-[17px] font-semibold tracking-[1px]">
                ASCENDING FORTUNES
              </p>
            </div>
          </div>

          <div className="w-12 shrink-0" aria-hidden />
        </div>

        {/* Bet Size + Denomination */}
        <div className="bg-slate-900 p-5 rounded-3xl mb-6 grid grid-cols-2 gap-3 sm:gap-4">
          <div>
            <label className="block text-slate-400 text-xs mb-1">Bet Size</label>
            <div className="flex h-14 items-stretch gap-1 rounded-2xl bg-slate-800 px-2.5 focus-within:ring-2 focus-within:ring-cyan-500/25">
              <span className="flex shrink-0 items-center pl-0.5 text-2xl font-bold leading-none text-slate-400" aria-hidden>
                $
              </span>
              <input
                type="text"
                inputMode="decimal"
                value={betSize}
                onChange={(e) => setBetSize(e.target.value.replace(/[^0-9.]/g, ''))}
                onBlur={(e) => setBetSize(parseFloat(e.target.value) || 25)}
                className="calc-field-lg min-w-0 flex-1 bg-transparent text-center text-2xl font-bold leading-none text-white outline-none focus:ring-0"
              />
            </div>
          </div>

          <div>
            <label className="block text-slate-400 text-xs mb-1">Denomination</label>
            <DropdownSelect
              value={denom}
              onChange={(v) => setDenom(parseFloat(v))}
              options={DENOM_OPTIONS.map((d) => ({ value: d, label: `$${formatDenomLabel(d)}` }))}
              accentClass="text-cyan-400"
              size="lg"
            />
          </div>
        </div>

        {/* Advanced Settings */}
        <div className="bg-slate-900 rounded-3xl mb-6 overflow-hidden">
          <button
            type="button"
            onClick={() => setShowAdvanced((v) => !v)}
            className="flex w-full items-center justify-between p-4 text-left transition-colors hover:bg-slate-800/80 touch-manipulation"
            aria-expanded={showAdvanced}
          >
            <span className="text-base font-semibold text-white">Advanced Settings</span>
            <span className={`text-xl text-slate-400 transition-transform ${showAdvanced ? 'rotate-180' : ''}`} aria-hidden>
              ▼
            </span>
          </button>
          {showAdvanced ? (
            <div className="space-y-4 border-t border-slate-800 p-4 pt-4">
              <div>
                <label className="mb-1 block text-xs text-slate-400">Overall RTP (%)</label>
                <input
                  type="text"
                  inputMode="decimal"
                  value={rtpInput}
                  onChange={(e) => {
                    const next = e.target.value.replace(/[^0-9.]/g, '')
                    setRtpInput(next)
                    const parsed = parseFloat(next)
                    if (Number.isFinite(parsed) && parsed > 0) {
                      setOverallRTP(parsed)
                    }
                  }}
                  onBlur={() => {
                    const parsed = parseFloat(rtpInput)
                    const safeRtp = Number.isFinite(parsed) && parsed > 0 ? parsed : 89
                    setOverallRTP(safeRtp)
                    setRtpInput(String(safeRtp))
                  }}
                  className="calc-field-lg h-14 w-full rounded-2xl border-0 bg-slate-800 px-3 text-center text-2xl font-bold leading-none text-white outline-none focus:ring-2 focus:ring-cyan-500/25"
                />
                <p className="mt-1.5 text-[11px] italic leading-relaxed text-slate-500">
                  Defaults by denomination; override only if your floor paytable differs.
                </p>
              </div>
            </div>
          ) : null}
        </div>

        {/* Meters: green labels + arrow = approx +EV threshold (same scale as slider) */}
        <div className="bg-slate-900 p-4 rounded-3xl mb-6 space-y-0">
          {[
            { label: 'Mega',  value: mega,  setter: setMega,  accent: 'accent-red-500',    text: 'text-red-400',   min: RESET.mega,  mustHit: MUST_HIT.mega,  payout: AVG_PAYOUT.mega,  spi: SPINS_PER_INCREMENT.mega },
            { label: 'Grand', value: grand, setter: setGrand, accent: 'accent-orange-500', text: 'text-orange-400', min: RESET.grand, mustHit: MUST_HIT.grand, payout: AVG_PAYOUT.grand, spi: SPINS_PER_INCREMENT.grand },
            { label: 'Major', value: major, setter: setMajor, accent: 'accent-purple-500', text: 'text-purple-400', min: RESET.major, mustHit: MUST_HIT.major, payout: AVG_PAYOUT.major, spi: SPINS_PER_INCREMENT.major },
            { label: 'Minor', value: minor, setter: setMinor, accent: 'accent-green-500',  text: 'text-green-400',  min: RESET.minor, mustHit: MUST_HIT.minor, payout: AVG_PAYOUT.minor, spi: SPINS_PER_INCREMENT.minor },
            { label: 'Mini',  value: mini,  setter: setMini,  accent: 'accent-blue-500',   text: 'text-blue-400',   min: RESET.mini,  mustHit: MUST_HIT.mini,  payout: AVG_PAYOUT.mini,  spi: SPINS_PER_INCREMENT.mini },
          ].map((m, i) => {
            const counter = meterCounterValue(m.value, m.mustHit, m.min)
            const sliderMetrics = meterSliderMetrics.byLabel[m.label]
            const dynamicBe = sliderMetrics?.breakEvenCounter ?? m.min
            const bePct = plusEvMarkerPercent(m.min, m.mustHit, dynamicBe)
            return (
            <div key={i} className={i > 0 ? '-mt-1.5' : ''}>
              <div className="flex justify-between items-baseline leading-none mb-0">
                <div className={`font-semibold text-sm ${m.text}`}>{m.label}</div>
                <div className={`font-mono text-sm font-bold tabular-nums ${m.text}`}>
                  <span>{counter}</span>
                  <span className="text-slate-500 font-semibold">/</span>
                  <span className="opacity-80">{m.mustHit}</span>
                </div>
              </div>
              {/* +EV tick aligned to slider min→max (same scale as the range input) */}
              <div className="relative w-full h-3 -mb-0.5" aria-hidden>
                <div
                  className="absolute -top-[0.5px] -translate-x-1/2 text-[9px] italic text-emerald-400 whitespace-nowrap leading-none"
                  style={{ left: `${bePct}%` }}
                  title={`Approx. +EV break-even counter (${dynamicBe})`}
                >
                  {dynamicBe}
                </div>
                <div
                  className="absolute top-[7px] -translate-x-1/2 text-[8px] leading-none text-emerald-400"
                  style={{ left: `${bePct}%` }}
                  title={`Break-even near counter ${dynamicBe}`}
                >
                  ▼
                </div>
              </div>
              <input
                type="range"
                min={m.min}
                max={m.mustHit}
                value={counter}
                onChange={(e) => {
                  const next = Number(e.target.value)
                  m.setter(meterCounterValue(next, m.mustHit, m.min))
                }}
                className={`range-touch-target w-full ${m.accent} relative z-10`}
              />
            </div>
            )
          })}
          <div className="pt-0.5 text-[10px] italic text-slate-400 leading-snug">
            Green arrow: ~ break-even point (overall RTP, nominal SPI). Current EV is the full machine state.
          </div>
        </div>

        {/* Current EV */}
        <div className="bg-slate-900 p-6 rounded-3xl mb-6">
          <div className="flex justify-between items-center mb-5">
            <h2 className="text-xl font-semibold text-cyan-400">Current EV</h2>
            <div className={`text-lg font-bold ${currentRTP >= 100 ? 'text-emerald-400' : 'text-red-400'}`}>
              {currentRTP.toFixed(1)}% RTP
            </div>
          </div>

          <div className="bg-slate-800 p-5 rounded-2xl">
            <div className="text-slate-400 text-sm">Average Case (Projected Session)</div>
            <div className={`text-4xl font-bold ${evAvg >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>{evAvg.toFixed(1)}×</div>
            <div className="text-sm text-slate-300">${(evAvg * betSize).toFixed(0)}</div>
            <div className="mt-1.5 text-xs italic text-slate-400 leading-relaxed">
              Expected win based on play until the machine's calibrated current RTP drops below 100%, at which point play is stopped.
            </div>
            {currentRTP >= 99 && (
              <div className="mt-4 pt-3 border-t border-slate-600/80 text-xs text-slate-400 leading-relaxed">
                <div>
                  Max Exposure:{' '}
                  <span className="text-red-400 font-bold tabular-nums">
                    {meterSliderMetrics.maxExposure.exposureBets.toLocaleString()} bets
                  </span>
                  <span className="text-slate-500">
                    {' '}
                    (${(meterSliderMetrics.maxExposure.exposureBets * betSize).toLocaleString()})
                  </span>
                </div>
                <div className="mt-1">
                  Target{' '}
                <span className="font-semibold text-slate-300">{meterSliderMetrics.maxExposure.label}</span>{' '}
                (highest solo RTP {meterSliderMetrics.maxExposure.standaloneRtp.toFixed(1)}%), ~{' '}
                {meterSliderMetrics.maxExposure.spins.toLocaleString()} spins to must-hit; grind modeled at{' '}
                {meterSliderMetrics.maxExposure.stressRtpPct.toFixed(1)}% (
                {meterSliderMetrics.maxExposure.overallRtpPct.toFixed(0)}% - 1σ, VI {MAX_EXPOSURE_VOLATILITY_INDEX}); +{' '}
                {(MAX_EXPOSURE_BONUS_PAY_FRACTION * 100).toFixed(0)}% expected bonus return.
                </div>
              </div>
            )}
          </div>

          <div className={`mt-6 p-4 rounded-2xl text-center font-bold ${isAlreadyPositive ? 'bg-emerald-900 text-emerald-300' : 'bg-red-900 text-red-300'}`}>
            {isAlreadyPositive ? (
              <>
                <span className="stackup-check-emoji">✅ </span>
                <span className="stackup-check-badge inline-flex items-center justify-center w-5 h-5 rounded border-2 border-[#fff] text-[#fff] text-xs font-black leading-none mr-1.5">✓</span>
                {currentRTP >= 110 ? 'PLAY Strong +EV' : 'PLAY +EV Expected'}
              </>
            ) : '❌ Still -EV Keep Waiting'}
          </div>
        </div>

        <BankrollRiskAdvisor
          supabaseClient={supabaseClient}
          maxExpectedLoss={
            currentRTP >= 99 ? meterSliderMetrics.maxExposure.exposureBets * betSize : 0
          }
          playLabel="Stack Up Pays"
          playDetails={{
            betSize,
            stackUpTarget: currentRTP >= 99 ? meterSliderMetrics.maxExposure.label : null,
            stackUpMeters: {
              Mega: meterCounterValue(mega, MUST_HIT.mega, RESET.mega),
              Grand: meterCounterValue(grand, MUST_HIT.grand, RESET.grand),
              Major: meterCounterValue(major, MUST_HIT.major, RESET.major),
              Minor: meterCounterValue(minor, MUST_HIT.minor, RESET.minor),
              Mini: meterCounterValue(mini, MUST_HIT.mini, RESET.mini),
            },
          }}
          accentClass="text-cyan-400"
          accentBtnClass="bg-cyan-600 hover:bg-cyan-500"
          cardClassName="bg-slate-900 p-6 rounded-3xl mb-6"
        />

        <CalculatorLogPlayButton
          calculatorSlug="stackup"
          prefillValues={{
            mega: meterCounterValue(mega, MUST_HIT.mega, RESET.mega),
            grand: meterCounterValue(grand, MUST_HIT.grand, RESET.grand),
            major: meterCounterValue(major, MUST_HIT.major, RESET.major),
            minor: meterCounterValue(minor, MUST_HIT.minor, RESET.minor),
            mini: meterCounterValue(mini, MUST_HIT.mini, RESET.mini),
            bet_size: betSize,
            denom,
            ...playLogCalcEvPrefill({
              currentRtpPct: currentRTP,
              averageCaseMult: evAvg,
              betSize,
            }),
          }}
          onOpenLogbook={onOpenLogbook}
          logPlayLocked={logPlayLocked}
          onRequireSubscribe={onRequireSubscribe}
          playLogsRemaining={playLogsRemaining}
          freemiumUsageLoading={freemiumUsageLoading}
        />

        {/* Acquisition Fee */}
        <div className="bg-slate-900 p-6 rounded-3xl mb-8">
          <h2 className="text-xl font-semibold text-cyan-400 mb-4">Acquisition Fee Calculator</h2>
          <p className="text-slate-400 text-sm mb-4">Fair finder's fee for scout</p>

          <div className="mb-5">
            <div className="flex justify-between mb-1">
              <span className="text-slate-400 text-xs">Scout share</span>
              <span className="text-cyan-400 font-bold">{scoutPercentage}%</span>
            </div>
            <input
              type="range"
              min="10"
              max="15"
              step="1"
              value={scoutPercentage}
              onChange={(e) => setScoutPercentage(Number(e.target.value))}
              className="range-touch-target w-full accent-cyan-500"
            />
          </div>

          <div className="bg-slate-800 rounded-2xl p-5 text-center mb-4">
            <div className="text-slate-400 text-sm">Expected Profit (Projected Session)</div>
            <div className="text-4xl font-bold text-white">
              ${(evAvg * betSize).toFixed(0)}
            </div>
          </div>

          <div className="bg-slate-800 rounded-2xl p-5 text-center">
            <div className="text-slate-400 text-sm">Recommended Finder's Fee</div>
            <div className="text-4xl font-bold text-emerald-400">
              ${((evAvg * betSize) * (scoutPercentage / 100)).toFixed(0)}
            </div>
            <div className="text-xs text-slate-400 mt-1">to scout ({scoutPercentage}% of expected profit)</div>
          </div>
        </div>

        <CalculatorDisclaimer className="border-slate-800/80" />
      </div>

      {/* Info Modal */}
      {showInfoModal && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
          <div className="bg-slate-900 rounded-3xl max-w-md w-full p-6">
            <h3 className="text-xl font-semibold text-cyan-400 mb-4">Stack Up Pays Advisor</h3>
            <div className="text-slate-300 leading-relaxed">
              Average Case simulates expected play from the current counters, following the strongest meter to hit next and continuing until projected RTP is no longer +EV.
            </div>
            <div className="mt-4 rounded-2xl bg-slate-800/70 p-4 text-sm text-slate-300 space-y-1">
              <div>Projected hits simulated: <span className="font-semibold text-cyan-300">{projectedHits}</span></div>
              {spinsToPositive !== null && currentRTP < 100 && (
                <div>Projected spins to reach +EV: <span className="font-semibold text-cyan-300">{Math.round(spinsToPositive).toLocaleString()}</span></div>
              )}
            </div>
            {simulationSteps.length > 0 && (
              <div className="mt-4 rounded-2xl bg-slate-800/70 p-4 text-xs text-slate-300">
                <div className="font-semibold text-cyan-300 mb-2">Shared-Spin Step Trace (first 6)</div>
                <div className="space-y-1">
                  {simulationSteps.slice(0, 6).map((s) => (
                    <div key={s.step} className="leading-relaxed">
                      <span className="text-slate-400">#{s.step}</span> hit <span className="text-cyan-300">{s.hit}</span> in {Math.round(s.spins)} spins, leg RTP {s.legRTP.toFixed(1)}%, state after {s.rtpAfterEvent.toFixed(1)}%
                    </div>
                  ))}
                </div>
              </div>
            )}
            <button onClick={() => setShowInfoModal(false)} className="mt-8 w-full bg-cyan-600 py-4 rounded-2xl font-bold">Got it</button>
          </div>
        </div>
      )}
    </div>
  )
}

export default StackUpPays