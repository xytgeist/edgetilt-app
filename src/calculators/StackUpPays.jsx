import { useState, useEffect } from 'react'
import CalculatorDisclaimer from '../components/CalculatorDisclaimer'

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

/** Where to draw the +EV tick (0–100%) along the range min→max. */
function plusEvMarkerPercent(min, max, plusEv) {
  if (max <= min) return 0
  return Math.min(100, Math.max(0, ((plusEv - min) / (max - min)) * 100))
}

/**
 * Dynamic +EV counter based on current base RTP:
 * meterEV = payout - (1 - baseRTP) * spinsRemaining
 * Solve meterEV = 0 for counter.
 */
function dynamicPlusEvCounter(mustHit, payout, spi, baseRTP, reset) {
  const lossPerSpin = 1 - baseRTP
  if (lossPerSpin <= 0) return reset

  const spinsToBreakEven = payout / lossPerSpin
  const rawCounter = mustHit - (spinsToBreakEven / spi)
  const clamped = Math.min(mustHit, Math.max(reset, rawCounter))
  // Round up so the displayed threshold is the first whole number at or above +EV.
  return Math.ceil(clamped)
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

    // Prevent explosive values when a meter is extremely close to must-hit.
    const remainingTicks = Math.max(0.5, m.mustHit - m.counter)
    const scale = (m.mustHit - m.reset) / remainingTicks
    return sum + (meterBaselineRTP * scale)
  }, 0)

  return baseRTP + stateBonusRTP
}

function StackUpPays({ onBack }) {
  const [mega, setMega] = useState(300)
  const [grand, setGrand] = useState(225)
  const [major, setMajor] = useState(175)
  const [minor, setMinor] = useState(125)
  const [mini, setMini] = useState(100)

  const [betSize, setBetSize] = useState(25)
  const [denom, setDenom] = useState(0.10)
  const [overallRTP, setOverallRTP] = useState(89)
  const [rtpInput, setRtpInput] = useState('89')

  const [evAvg, setEvAvg] = useState(0)
  const [currentRTP, setCurrentRTP] = useState(89)
  const [fpDollarsNeeded, setFpDollarsNeeded] = useState(0)
  const [isAlreadyPositive, setIsAlreadyPositive] = useState(false)
  const [projectedHits, setProjectedHits] = useState(0)
  const [projectedSpins, setProjectedSpins] = useState(0)
  const [spinsToPositive, setSpinsToPositive] = useState(null)
  const [simulationSteps, setSimulationSteps] = useState([])

  const [scoutPercentage, setScoutPercentage] = useState(10)
  const [showInfoModal, setShowInfoModal] = useState(false)

  // Auto-update RTP when denomination changes
  useEffect(() => {
    let base = 91
    if (denom <= 0.02) base = 88
    else if (denom === 0.05) base = 88.5
    else if (denom === 0.10) base = 89
    else if (denom === 0.25) base = 90
    else if (denom >= 0.50) base = 92

    setOverallRTP(base)
    setRtpInput(String(base))
  }, [denom])

  const calculate = () => {
    const bet = Number(betSize) || 25
    const baseRTP = overallRTP / 100

    const meterData = [
      { label: 'Mega',  counter: mega,  mustHit: MUST_HIT.mega,  payout: AVG_PAYOUT.mega,  spi: SPINS_PER_INCREMENT.mega, reset: RESET.mega,  mid: MIDPOINT.mega },
      { label: 'Grand', counter: grand, mustHit: MUST_HIT.grand, payout: AVG_PAYOUT.grand, spi: SPINS_PER_INCREMENT.grand, reset: RESET.grand, mid: MIDPOINT.grand },
      { label: 'Major', counter: major, mustHit: MUST_HIT.major, payout: AVG_PAYOUT.major, spi: SPINS_PER_INCREMENT.major, reset: RESET.major, mid: MIDPOINT.major },
      { label: 'Minor', counter: minor, mustHit: MUST_HIT.minor, payout: AVG_PAYOUT.minor, spi: SPINS_PER_INCREMENT.minor, reset: RESET.minor, mid: MIDPOINT.minor },
      { label: 'Mini',  counter: mini,  mustHit: MUST_HIT.mini,  payout: AVG_PAYOUT.mini,  spi: SPINS_PER_INCREMENT.mini, reset: RESET.mini,  mid: MIDPOINT.mini },
    ]

    const stateRTP = getCalibratedStateRTP(overallRTP, meterData)
    const { baseRTP: calibratedBaseRTP } = getCalibrationFromCycle(overallRTP, meterData)
    const baseSpinRTP = calibratedBaseRTP / 100

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
    setProjectedSpins(projectedSpinsToStop)
    setSpinsToPositive(spinsUntilPositive)
    setSimulationSteps(steps)

    const alreadyPositive = stateRTP >= 100
    setIsAlreadyPositive(alreadyPositive)

    if (!alreadyPositive) {
      setFpDollarsNeeded(Math.round(68 * bet))
    } else {
      setFpDollarsNeeded(0)
    }
  }

  useEffect(() => {
    calculate()
  }, [mega, grand, major, minor, mini, betSize, denom, overallRTP])

  return (
    <div className="min-h-screen bg-slate-950 pb-12">
      <div className="max-w-lg mx-auto px-4 pt-6">

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
              src="/stackup-icon.jpg" 
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

          <div className="w-12" />
        </div>

        {/* Bet Size + Denomination + RTP Override */}
        <div className="bg-slate-900 p-5 rounded-3xl mb-6 grid grid-cols-3 gap-3 sm:gap-4">
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
                className="min-w-0 flex-1 bg-transparent text-center text-2xl font-bold leading-none text-white outline-none focus:ring-0"
              />
            </div>
          </div>

          <div>
            <label className="block text-slate-400 text-xs mb-1">Denomination</label>
            <select
              value={denom}
              onChange={(e) => setDenom(parseFloat(e.target.value))}
              className="h-14 w-full cursor-pointer rounded-2xl border-0 bg-slate-800 px-2 text-center text-2xl font-bold leading-none text-white outline-none focus:ring-2 focus:ring-cyan-500/25"
            >
              {[0.01, 0.02, 0.05, 0.1, 0.25, 1, 2, 5, 10, 25, 50, 100].map((d) => (
                <option key={d} value={d}>
                  ${d}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-slate-400 text-xs mb-1">RTP %</label>
            <input
              type="text"
              inputMode="decimal"
              value={rtpInput}
              onChange={(e) => {
                const next = e.target.value.replace(/[^0-9.]/g, '')
                setRtpInput(next)
                const parsed = parseFloat(next)
                if (Number.isFinite(parsed) && parsed > 0) {
                  // Live-update calculations/markers while user types a valid RTP override.
                  setOverallRTP(parsed)
                }
              }}
              onBlur={() => {
                const parsed = parseFloat(rtpInput)
                const safeRtp = Number.isFinite(parsed) && parsed > 0 ? parsed : 89
                setOverallRTP(safeRtp)
                setRtpInput(String(safeRtp))
              }}
              className="h-14 w-full rounded-2xl border-0 bg-slate-800 px-2 text-center text-2xl font-bold leading-none text-white outline-none focus:ring-2 focus:ring-cyan-500/25"
            />
          </div>
        </div>

        {/* Meters — green labels + arrow = approx +EV threshold (same scale as slider) */}
        <div className="bg-slate-900 p-5 rounded-3xl mb-6 space-y-2.5">
          {[
            { label: 'Mega',  value: mega,  setter: setMega,  accent: 'accent-red-500',    text: 'text-red-400',   min: RESET.mega,  mustHit: MUST_HIT.mega,  payout: AVG_PAYOUT.mega,  spi: SPINS_PER_INCREMENT.mega },
            { label: 'Grand', value: grand, setter: setGrand, accent: 'accent-orange-500', text: 'text-orange-400', min: RESET.grand, mustHit: MUST_HIT.grand, payout: AVG_PAYOUT.grand, spi: SPINS_PER_INCREMENT.grand },
            { label: 'Major', value: major, setter: setMajor, accent: 'accent-purple-500', text: 'text-purple-400', min: RESET.major, mustHit: MUST_HIT.major, payout: AVG_PAYOUT.major, spi: SPINS_PER_INCREMENT.major },
            { label: 'Minor', value: minor, setter: setMinor, accent: 'accent-green-500',  text: 'text-green-400',  min: RESET.minor, mustHit: MUST_HIT.minor, payout: AVG_PAYOUT.minor, spi: SPINS_PER_INCREMENT.minor },
            { label: 'Mini',  value: mini,  setter: setMini,  accent: 'accent-blue-500',   text: 'text-blue-400',   min: RESET.mini,  mustHit: MUST_HIT.mini,  payout: AVG_PAYOUT.mini,  spi: SPINS_PER_INCREMENT.mini },
          ].map((m, i) => {
            const dynamicBe = dynamicPlusEvCounter(m.mustHit, m.payout, m.spi, overallRTP / 100, m.min)
            const bePct = plusEvMarkerPercent(m.min, m.mustHit, dynamicBe)
            return (
            <div key={i}>
              <div className="flex justify-between mb-0.5">
                <div className={`font-semibold ${m.text}`}>{m.label}</div>
                <div className={`font-mono text-base sm:text-lg font-bold tabular-nums ${m.text}`}>
                  <span>{m.value}</span>
                  <span className="text-slate-500 font-semibold">/</span>
                  <span className="opacity-80">{m.mustHit}</span>
                </div>
              </div>
              {/* +EV tick aligned to slider min→max (same scale as the range input) */}
              <div className="relative w-full h-5 mb-0.5" aria-hidden>
                <div
                  className="absolute -top-1.5 -translate-x-1/2 text-[11px] italic text-emerald-400 whitespace-nowrap"
                  style={{ left: `${bePct}%` }}
                >
                  {dynamicBe}
                </div>
                <div
                  className="absolute top-2 -translate-x-1/2 text-[12px] leading-none text-emerald-400"
                  style={{ left: `${bePct}%` }}
                  title={`Approx. +EV — counter at or above ${dynamicBe} (meter in +EV territory)`}
                >
                  ▼
                </div>
              </div>
              <input
                type="range"
                min={m.min}
                max={m.mustHit}
                value={m.value}
                onChange={(e) => m.setter(Number(e.target.value))}
                className={`range-touch-target w-full ${m.accent} relative z-10`}
              />
            </div>
            )
          })}
          <div className="pt-1 text-[11px] italic text-slate-400 leading-relaxed">
            Green arrow values show each meter's standalone +EV threshold, independent of the other meters.
          </div>
        </div>

        {/* Current EV */}
        <div className="bg-slate-900 p-6 rounded-3xl mb-8">
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
              Expected bets won is based on the number of spins until the machine's calibrated current RTP drops below 100%, at which point play is stopped.
            </div>
          </div>

          <div className={`mt-6 p-4 rounded-2xl text-center font-bold ${isAlreadyPositive ? 'bg-emerald-900 text-emerald-300' : 'bg-red-900 text-red-300'}`}>
            {isAlreadyPositive
              ? currentRTP >= 110
                ? '✅ PLAY — Strong +EV'
                : '✅ PLAY — +EV'
              : '❌ Still -EV — Keep Waiting'}
          </div>
        </div>

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