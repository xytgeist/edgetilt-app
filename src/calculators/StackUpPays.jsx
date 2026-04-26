import { useState, useEffect } from 'react'

const MUST_HIT = {
  mega: 350,
  grand: 250,
  major: 200,
  minor: 150,
  mini: 125,
}

const PLUS_EV = {   // These are your approximate break-even counters
  mega: 330,
  grand: 238,
  major: 192,
  minor: 146,
  mini: 123,
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
  return Math.round(clamped)
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

  const getMeterRTP = (counter, mustHit, payout, spi, baseRTP) => {
    const spinsRemaining = Math.max(0.001, (mustHit - counter) * spi)
    const baseReturn = spinsRemaining * baseRTP
    const totalReturn = baseReturn + payout
    return (totalReturn / spinsRemaining) * 100
  }

  const calculate = () => {
    const bet = Number(betSize) || 25
    const baseRTP = overallRTP / 100

    const meterData = [
      { label: 'Mega',  counter: mega,  mustHit: MUST_HIT.mega,  payout: AVG_PAYOUT.mega,  spi: SPINS_PER_INCREMENT.mega, reset: 250, mid: MIDPOINT.mega },
      { label: 'Grand', counter: grand, mustHit: MUST_HIT.grand, payout: AVG_PAYOUT.grand, spi: SPINS_PER_INCREMENT.grand, reset: 200, mid: MIDPOINT.grand },
      { label: 'Major', counter: major, mustHit: MUST_HIT.major, payout: AVG_PAYOUT.major, spi: SPINS_PER_INCREMENT.major, reset: 150, mid: MIDPOINT.major },
      { label: 'Minor', counter: minor, mustHit: MUST_HIT.minor, payout: AVG_PAYOUT.minor, spi: SPINS_PER_INCREMENT.minor, reset: 100, mid: MIDPOINT.minor },
      { label: 'Mini',  counter: mini,  mustHit: MUST_HIT.mini,  payout: AVG_PAYOUT.mini,  spi: SPINS_PER_INCREMENT.mini, reset: 75,  mid: MIDPOINT.mini },
    ]

    let sumExtras = 0
    let meterEVs = []

    meterData.forEach(m => {
      const dynamicPlusEV = dynamicPlusEvCounter(m.mustHit, m.payout, m.spi, baseRTP, m.reset)
      let meterRTP

      if (m.counter >= dynamicPlusEV) {
        meterRTP = getMeterRTP(m.counter, m.mustHit, m.payout, m.spi, baseRTP)
      } else {
        const plusEV_RTP = getMeterRTP(dynamicPlusEV, m.mustHit, m.payout, m.spi, baseRTP)
        const p_mid = (m.mid - m.reset) / (dynamicPlusEV - m.reset)
        const midRTP = baseRTP * 100
        const reset_RTP = (midRTP - p_mid * plusEV_RTP) / (1 - p_mid)
        const progress = (m.counter - m.reset) / (dynamicPlusEV - m.reset)
        meterRTP = reset_RTP + progress * (plusEV_RTP - reset_RTP)
      }

      // Meters should only add upside over the configured base RTP.
      const extra = Math.max(0, meterRTP - (baseRTP * 100))
      sumExtras += extra

      const spinsRem = (m.mustHit - m.counter) * m.spi
      const meterEV = m.payout - (1 - baseRTP) * spinsRem

      meterEVs.push(meterEV)
    })

    const combinedRTP = (baseRTP * 100) + sumExtras
    // Never show RTP below the configured machine/base RTP.
    const displayedRTP = Math.max(baseRTP * 100, combinedRTP)

    const averageEV = Math.max(...meterEVs)

    setCurrentRTP(Math.round(displayedRTP * 10) / 10)
    setEvAvg(averageEV)

    const alreadyPositive = averageEV >= 0
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
        <div className="bg-slate-900 p-5 rounded-3xl mb-6 grid grid-cols-3 gap-4">
          <div className="relative">
            <label className="block text-slate-400 text-xs mb-1">Bet Size</label>
            <div className="absolute left-4 top-10 text-2xl text-slate-400">$</div>
            <input
              type="text"
              value={betSize}
              onChange={(e) => setBetSize(e.target.value.replace(/[^0-9.]/g, ''))}
              onBlur={(e) => setBetSize(parseFloat(e.target.value) || 25)}
              className="w-full pl-8 p-3.5 bg-slate-800 rounded-2xl text-2xl font-bold text-center"
            />
          </div>

          <div>
            <label className="block text-slate-400 text-xs mb-1">Denomination</label>
            <select 
              value={denom} 
              onChange={(e) => setDenom(parseFloat(e.target.value))} 
              className="w-full p-3.5 bg-slate-800 rounded-2xl text-2xl font-bold text-center"
            >
              {[0.01,0.02,0.05,0.10,0.25,1,2,5,10,25,50,100].map(d => (
                <option key={d} value={d}>${d}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-slate-400 text-xs mb-1">RTP %</label>
            <input 
              type="text" 
              value={rtpInput}
              onChange={(e) => setRtpInput(e.target.value.replace(/[^0-9.]/g, ''))}
              onBlur={() => {
                const parsed = parseFloat(rtpInput)
                const safeRtp = Number.isFinite(parsed) && parsed > 0 ? parsed : 89
                setOverallRTP(safeRtp)
                setRtpInput(String(safeRtp))
              }}
              className="w-full p-3.5 bg-slate-800 rounded-2xl text-center text-xl font-bold" 
            />
          </div>
        </div>

        {/* Meters — gold tick = approx +EV; number in ( ) matches tick position */}
        <div className="bg-slate-900 p-5 rounded-3xl mb-6 space-y-2.5">
          {[
            { label: 'Mega',  value: mega,  setter: setMega,  accent: 'accent-red-500',    text: 'text-red-400',   min: 250, mustHit: MUST_HIT.mega,  payout: AVG_PAYOUT.mega,  spi: SPINS_PER_INCREMENT.mega },
            { label: 'Grand', value: grand, setter: setGrand, accent: 'accent-orange-500', text: 'text-orange-400', min: 200, mustHit: MUST_HIT.grand, payout: AVG_PAYOUT.grand, spi: SPINS_PER_INCREMENT.grand },
            { label: 'Major', value: major, setter: setMajor, accent: 'accent-purple-500', text: 'text-purple-400', min: 150, mustHit: MUST_HIT.major, payout: AVG_PAYOUT.major, spi: SPINS_PER_INCREMENT.major },
            { label: 'Minor', value: minor, setter: setMinor, accent: 'accent-green-500',  text: 'text-green-400',  min: 100, mustHit: MUST_HIT.minor, payout: AVG_PAYOUT.minor, spi: SPINS_PER_INCREMENT.minor },
            { label: 'Mini',  value: mini,  setter: setMini,  accent: 'accent-blue-500',   text: 'text-blue-400',   min: 75,  mustHit: MUST_HIT.mini,  payout: AVG_PAYOUT.mini,  spi: SPINS_PER_INCREMENT.mini },
          ].map((m, i) => {
            const dynamicBe = dynamicPlusEvCounter(m.mustHit, m.payout, m.spi, overallRTP / 100, m.min)
            const bePct = plusEvMarkerPercent(m.min, m.mustHit, dynamicBe)
            return (
            <div key={i}>
              <div className="flex justify-between mb-0.5">
                <div className={`font-semibold ${m.text}`}>
                  {m.label} <span className="text-slate-500 font-normal">({dynamicBe})</span>
                </div>
                <div className={`font-mono text-lg font-bold ${m.text}`}>{m.value}</div>
              </div>
              {/* +EV tick aligned to slider min→max (same scale as the range input) */}
              <div className="relative w-full h-5 mb-0.5" aria-hidden>
                <div
                  className="absolute -top-0.5 -translate-x-1/2 text-[10px] italic text-emerald-400 whitespace-nowrap"
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
                className={`w-full ${m.accent} relative z-10`}
              />
            </div>
            )
          })}
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
            <div className="text-slate-400 text-sm">Average Case (Strongest Meter)</div>
            <div className={`text-4xl font-bold ${evAvg >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>{evAvg.toFixed(1)}×</div>
            <div className="text-sm text-slate-300">${(evAvg * betSize).toFixed(0)}</div>
          </div>

          <div className={`mt-6 p-4 rounded-2xl text-center font-bold ${isAlreadyPositive ? 'bg-emerald-900 text-emerald-300' : 'bg-red-900 text-red-300'}`}>
            {isAlreadyPositive ? '✅ PLAY — Strong +EV' : '❌ Still -EV — Keep Waiting'}
          </div>
        </div>

        {/* Acquisition Fee */}
        <div className="bg-slate-900 p-6 rounded-3xl mb-8">
          <h2 className="text-xl font-semibold text-cyan-400 mb-4">Acquisition Fee Calculator</h2>

          <div className="bg-slate-800 rounded-2xl p-5 text-center mb-4">
            <div className="text-slate-400 text-sm">Expected Profit (Strongest Meter)</div>
            <div className="text-4xl font-bold text-white">
              ${(evAvg * betSize).toFixed(0)}
            </div>
          </div>

          <div className="bg-slate-800 rounded-2xl p-5 text-center">
            <div className="text-slate-400 text-sm">Recommended Scout Fee</div>
            <div className="text-5xl font-black text-emerald-400">
              ${((evAvg * betSize) * (scoutPercentage / 100)).toFixed(0)}
            </div>
            <div className="text-xs text-slate-400 mt-1">{scoutPercentage}% of expected profit</div>
          </div>
        </div>

        <div className="text-center text-slate-500 text-sm mt-12">
          Stack Up Pays • Blue Surfer Edition
        </div>
      </div>

      {/* Info Modal */}
      {showInfoModal && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
          <div className="bg-slate-900 rounded-3xl max-w-md w-full p-6">
            <h3 className="text-xl font-semibold text-cyan-400 mb-4">Stack Up Pays Advisor</h3>
            <div className="text-slate-300 leading-relaxed">
              Average Case shows only the EV of the single strongest meter — the one you will actually sit and play until it hits.
            </div>
            <button onClick={() => setShowInfoModal(false)} className="mt-8 w-full bg-cyan-600 py-4 rounded-2xl font-bold">Got it</button>
          </div>
        </div>
      )}
    </div>
  )
}

export default StackUpPays