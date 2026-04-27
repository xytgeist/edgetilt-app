import { useState, useEffect } from 'react'
import CalculatorDisclaimer from '../components/CalculatorDisclaimer'

function MHBCalculator({ onBack }) {
  // Main fields
  const [current, setCurrent] = useState(475)
  const [mustHitBy, setMustHitBy] = useState(500)

  // Advanced Settings
  const [overallRTP, setOverallRTP] = useState(85)
  const [meterRise, setMeterRise] = useState(2.50)
  const [resetValue, setResetValue] = useState(350)
  const [useMidpoint, setUseMidpoint] = useState(true)
  const [showAdvanced, setShowAdvanced] = useState(false)

  // Outputs
  const [ev, setEv] = useState(0)
  const [evExact, setEvExact] = useState(0)
  const [breakeven, setBreakeven] = useState(0)
  const [breakevenExact, setBreakevenExact] = useState(0)
  const [coinInExpected, setCoinInExpected] = useState(0)
  const [jpContribution, setJpContribution] = useState(0)
  const [exposure, setExposure] = useState(0)
  const [isPositive, setIsPositive] = useState(false)

  // Auto-adjust when MHB changes
  useEffect(() => {
    if (mustHitBy === 10000) {
      setCurrent(9802)
      setMeterRise(6.66666)
    } else if (mustHitBy === 500) {
      setCurrent(475)
      setMeterRise(2.50)
    }
  }, [mustHitBy])

  const calculate = () => {
    const rtp = overallRTP / 100
    const currentVal = Number(current) || 475
    const mhb = Number(mustHitBy) || 500
    const riseDollars = Number(meterRise) || 2.50
    const resetVal = Number(resetValue) || 350

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
  }, [current, mustHitBy, meterRise, resetValue, overallRTP, useMidpoint])

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

  return (
    <div className="min-h-screen bg-gray-950 pb-12">
      <div className="max-w-lg mx-auto px-4 pt-6">

        {/* Title */}
        <div className="flex items-center mb-6">
          <button onClick={onBack} className="text-[52px] leading-none text-purple-400 hover:text-purple-300 -mt-1 mr-4 font-light active:opacity-70">‹</button>
          <div className="flex items-center flex-1 justify-center gap-3">
            <div className="w-14 h-14 flex items-center justify-center overflow-hidden rounded-2xl bg-gradient-to-br from-purple-600 to-fuchsia-600 flex-shrink-0">
              <span className="text-4xl">🎰</span>
            </div>
            <h1 className="font-black text-white tracking-[-1.8px] text-[26px] xs:text-[27px] sm:text-[29px] md:text-[32px] lg:text-[33px]"
                style={{ textShadow: `-2px -2px 0 #7e22ce, 2px -2px 0 #7e22ce, -2px 2px 0 #7e22ce, 2px 2px 0 #7e22ce` }}>
              MHB CALCULATOR
            </h1>
          </div>
          <div className="w-12" />
        </div>

        {/* Main Inputs - Now side by side */}
        <div className="bg-gray-900 p-5 rounded-3xl">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-gray-400 text-xs mb-1">JP Meter (Current)</label>
              <input 
                type="text" 
                value={current} 
                onChange={handleIntegerChange(setCurrent, 475)} 
                onBlur={handleIntegerBlur(setCurrent, 475)} 
                className="w-full p-4 bg-gray-800 rounded-2xl text-3xl font-bold text-center text-purple-300" 
              />
            </div>

            <div>
              <label className="block text-gray-400 text-xs mb-1">Must Hit By</label>
              <select 
                value={mustHitBy} 
                onChange={(e) => setMustHitBy(Number(e.target.value))}
                className="w-full p-4 bg-gray-800 rounded-2xl text-3xl font-bold text-center text-purple-300"
              >
                <option value={500}>500</option>
                <option value={10000}>10000</option>
              </select>
            </div>
          </div>
        </div>

        {/* Advanced Settings */}
        <div className="mt-6 bg-gray-900 rounded-3xl overflow-hidden">
          <button onClick={() => setShowAdvanced(!showAdvanced)} className="w-full flex justify-between items-center p-5 text-left hover:bg-gray-800">
            <span className="font-semibold text-purple-300">Advanced Settings</span>
            <span className={`transition-transform ${showAdvanced ? 'rotate-180' : ''}`}>▼</span>
          </button>
          {showAdvanced && (
            <div className="p-5 pt-0 space-y-6 border-t border-gray-800">
              <div>
                <label className="block text-gray-400 text-xs mb-1">RTP %</label>
                <input 
                  type="text" 
                  value={overallRTP} 
                  onChange={handleFloatChange(setOverallRTP, 85)} 
                  onBlur={handleFloatBlur(setOverallRTP, 85)} 
                  className="w-full p-4 bg-gray-800 rounded-2xl text-center text-2xl font-bold" 
                />
              </div>

              <div>
                <label className="block text-gray-400 text-xs mb-1">Meter Rise ($ per $0.01 increment)</label>
                <input 
                  type="text" 
                  value={meterRise} 
                  onChange={handleFloatChange(setMeterRise, 2.50)} 
                  onBlur={handleFloatBlur(setMeterRise, 2.50)} 
                  className="w-full p-4 bg-gray-800 rounded-2xl text-center text-2xl font-bold" 
                />
              </div>

              <div>
                <label className="block text-gray-400 text-xs mb-1">Reset Value</label>
                <input 
                  type="text" 
                  value={resetValue} 
                  onChange={handleIntegerChange(setResetValue, 350)} 
                  onBlur={handleIntegerBlur(setResetValue, 350)} 
                  className="w-full p-4 bg-gray-800 rounded-2xl text-center text-2xl font-bold" 
                />
              </div>

              <div className="flex items-center justify-between bg-gray-800 p-4 rounded-2xl">
                <span className="text-gray-300">Use Midpoint for EV & Breakeven</span>
                <button 
                  onClick={() => setUseMidpoint(!useMidpoint)} 
                  className={`px-6 py-2 rounded-xl font-semibold ${useMidpoint ? 'bg-purple-600 text-white' : 'bg-gray-700'}`}
                >
                  {useMidpoint ? 'YES' : 'NO'}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Outputs */}
        <div className="mt-8 bg-gray-900 p-6 rounded-3xl">
          <h2 className="text-xl font-semibold text-purple-400 mb-6 text-center">MHB Analysis</h2>

          <div className="grid grid-cols-2 gap-4 text-center">
            <div className="bg-gray-800 p-5 rounded-2xl">
              <div className="text-gray-400 text-sm">Expected Value</div>
              <div className={`text-4xl font-bold ${ev >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                ${ev.toFixed(0)}
              </div>
              <div className={`text-xs mt-1 ${ev >= 0 ? 'text-emerald-400/70' : 'text-red-400/70'}`}>
                ${evExact.toFixed(2)}
              </div>
            </div>
            <div className="bg-gray-800 p-5 rounded-2xl">
              <div className="text-gray-400 text-sm">Breakeven Entry</div>
              <div className="text-4xl font-bold text-purple-300">{breakeven}</div>
              <div className="text-xs text-purple-400/70 mt-1">
                ${breakevenExact.toFixed(2)}
              </div>
            </div>
            <div className="bg-gray-800 p-5 rounded-2xl">
              <div className="text-gray-400 text-sm">Coin in expected</div>
              <div className="text-4xl font-bold text-amber-400">${coinInExpected}</div>
            </div>
            <div className="bg-gray-800 p-5 rounded-2xl">
              <div className="text-gray-400 text-sm">JP Contribution</div>
              <div className="text-4xl font-bold text-purple-300">+{jpContribution}%</div>
            </div>
          </div>

          <div className="mt-6 bg-gray-800 p-5 rounded-2xl text-center">
            <div className="text-gray-400 text-sm">Max Exposure (Full Run)</div>
            <div className="text-3xl font-bold text-red-400">
              ${exposure.toLocaleString()}
            </div>
          </div>

          <div className={`mt-6 p-4 rounded-2xl text-center font-bold text-lg ${isPositive ? 'bg-emerald-900 text-emerald-300' : 'bg-red-900 text-red-300'}`}>
            {isPositive ? '✅ +EV — PLAY THIS ONE' : '❌ Still -EV — Keep Waiting'}
          </div>
        </div>

        <CalculatorDisclaimer className="mt-8" />

        <div className="text-center text-slate-500 text-xs mt-6">
          MHB Calculator • Purple Edition
        </div>
      </div>
    </div>
  )
}

export default MHBCalculator