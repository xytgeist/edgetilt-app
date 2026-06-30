import { useState, useEffect, useCallback } from 'react'
import { DropdownSelect } from '../DropdownSelect'
import { Line } from 'react-chartjs-2'
import BankrollRiskAdvisor from '../BankrollRiskAdvisor.jsx'
import CalculatorLogPlayButton from '../CalculatorLogPlayButton.jsx'
import { playLogCalcEvPrefill, recommendedAcquisitionFeeUsd } from '../../../utils/playLogCalcSnapshot.js'
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
} from 'chart.js'
import CalculatorDisclaimer from '../../../components/CalculatorDisclaimer'
import { CALCULATOR_ICON_SRC } from '../calculatorAccess.js'
import { formatDenomLabel } from '../../../utils/formatDenomLabel'

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend)

const MUST_HIT = 1888

function PhoenixLink({ onBack, supabaseClient = null, onOpenLogbook = null, logPlayLocked = false, onRequireSubscribe = null, playLogsRemaining = null, freemiumUsageLoading = false }) {
  const [currentX, setCurrentX] = useState(1400)
  const [betSize, setBetSize] = useState(25)
  const [denom, setDenom] = useState(1.00)
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [overallRTP, setOverallRTP] = useState(91)
  const [avgBonusPay, setAvgBonusPay] = useState(31)
  const [increment, setIncrement] = useState(1.2)
  const [avgTrigger, setAvgTrigger] = useState(1795)
  const [maxMajor, setMaxMajor] = useState(false)
  const [evAvg, setEvAvg] = useState(0)
  const [evFullRun, setEvFullRun] = useState(0)
  const [maxExposureAvg, setMaxExposureAvg] = useState(0)
  const [maxExposureFull, setMaxExposureFull] = useState(0)
  const [beAvg, setBeAvg] = useState(0)
  const [beFullRun, setBeFullRun] = useState(0)
  const [evTable, setEvTable] = useState([])
  const [currentRTP, setCurrentRTP] = useState(0)
  const [fpDollarsNeeded, setFpDollarsNeeded] = useState(0)
  const [isAlreadyPositive, setIsAlreadyPositive] = useState(false)
  const [testCounter, setTestCounter] = useState(1400)
  const [hoverCounter, setHoverCounter] = useState(null)
  const [hoverWalkAway, setHoverWalkAway] = useState(null)
  const [showInfoModal, setShowInfoModal] = useState(false)
  const [useFullRunForFee, setUseFullRunForFee] = useState(false)
  const [scoutPercentage, setScoutPercentage] = useState(12)

  const getRecommendedWalkAway = (counter) => {
    const oRTP = overallRTP / 100
    const inc = increment
    const avgTrig = avgTrigger
    const B = avgBonusPay
    const spinsRemaining = Math.max(0, (avgTrig - counter) / inc)
    const remainingEV = B - (1 - oRTP) * spinsRemaining
    const normalized = Math.max(0, Math.min(1, (counter - 1300) / 588))
    const sCurve = 1 / (1 + Math.exp(-5.5 * (normalized - 0.48)))
    const curveBonus = sCurve * 98
    let walkAway = Math.round(remainingEV * 3.5 + curveBonus)
    return Math.max(75, Math.min(245, walkAway))
  }

  const chartData = {
    labels: Array.from({ length: 21 }, (_, i) => 1300 + i * 28),
    datasets: [{
      label: 'Recommended Walk-Away',
      data: Array.from({ length: 21 }, (_, i) => getRecommendedWalkAway(1300 + i * 28)),
      borderColor: '#f97316',
      backgroundColor: 'rgba(249, 115, 22, 0.1)',
      tension: 0.45,
      borderWidth: 3.5,
      pointRadius: 3,
      pointHoverRadius: 7,
    }]
  }

  const isLight = typeof document !== 'undefined' && document.documentElement.classList.contains('light')
  const chartAxisColor  = isLight ? '#18181b' : '#9CA3AF'
  const chartGridColor  = isLight ? '#c4c4c8' : '#374151'
  const chartBgPlugins  = isLight ? [{
    id: 'chartAreaBg',
    beforeDraw(chart) {
      const { ctx } = chart
      ctx.save()
      ctx.fillStyle = '#e4e4e7'
      ctx.fillRect(0, 0, chart.width, chart.height)
      ctx.restore()
    },
  }] : []

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { intersect: false, mode: 'index' },
    onHover: (event, elements) => {
      if (elements.length > 0) {
        const index = elements[0].index
        setHoverCounter(chartData.labels[index])
        setHoverWalkAway(chartData.datasets[0].data[index])
      } else {
        setHoverCounter(null)
        setHoverWalkAway(null)
      }
    },
    scales: {
      x: { title: { display: true, text: 'Counter', color: chartAxisColor }, grid: { color: chartGridColor }, ticks: { color: chartAxisColor }, border: { color: chartGridColor } },
      y: { title: { display: true, text: 'Walk-Away (Bets)', color: chartAxisColor }, grid: { color: chartGridColor }, ticks: { color: chartAxisColor }, border: { color: chartGridColor }, min: 0, max: 260 }
    },
    plugins: { legend: { display: false }, tooltip: { enabled: false } }
  }

  useEffect(() => {
    let baseOverall = 91
    if (denom <= 0.02) baseOverall = 88
    else if (denom === 0.05) baseOverall = 88.25
    else if (denom === 0.10) baseOverall = 88.4
    else if (denom === 0.25) baseOverall = 88.6
    else if (denom > 1) baseOverall = 91.5
    // Keep the UI RTP stable; Max Major affects calculations only.
    queueMicrotask(() => setOverallRTP(baseOverall))
  }, [denom])

  const calculate = useCallback(() => {
    const displayedOverall = Number(overallRTP) || 0
    const effectiveOverall = displayedOverall + (maxMajor ? 0.5 : 0)
    const oRTP = effectiveOverall / 100
    const inc = increment
    const avgTrig = avgTrigger
    const X = currentX || 0
    const bet = betSize || 25
    const B = avgBonusPay
    const houseEdge = 1 - oRTP
    const spinsAvg = Math.max(0, (avgTrig - X) / inc)
    const spinsFull = Math.max(0, (MUST_HIT - X) / inc)
    const avgEV = B - houseEdge * spinsAvg
    const fullEV = B - houseEdge * spinsFull
    const baseHouseEdge = 1 - (28 / 100)
    const maxExpAvg = Math.round(spinsAvg * baseHouseEdge)
    const maxExpFull = Math.round(spinsFull * baseHouseEdge)
    const breakevenAvg = Math.round(avgTrig - (B / houseEdge) * inc)
    const breakevenFull = Math.round(MUST_HIT - (B / houseEdge) * inc)
    setEvAvg(avgEV)
    setEvFullRun(fullEV)
    setMaxExposureAvg(maxExpAvg)
    setMaxExposureFull(maxExpFull)
    setBeAvg(breakevenAvg)
    setBeFullRun(breakevenFull)
    let rtp = oRTP * 100
    if (spinsAvg > 0) {
      const evPerSpin = avgEV / spinsAvg
      rtp = 100 + (evPerSpin * 100)
    }
    setCurrentRTP(Math.round(rtp * 10) / 10)
    const alreadyPositive = avgEV >= 0
    setIsAlreadyPositive(alreadyPositive)
    if (alreadyPositive) {
      setFpDollarsNeeded(0)
    } else {
      const spinsNeeded = Math.max(0, breakevenAvg - X)
      const dollarsNeeded = Math.round(spinsNeeded * bet)
      setFpDollarsNeeded(dollarsNeeded)
    }
    const table = []
    for (let c = 1150; c <= 1875; c += 25) {
      const avgSpins = Math.max(0, (avgTrig - c) / inc)
      const fullSpins = Math.max(0, (MUST_HIT - c) / inc)
      table.push({
        counter: c,
        avgEV: B - houseEdge * avgSpins,
        fullEV: B - houseEdge * fullSpins,
        avgDollar: (B - houseEdge * avgSpins) * bet,
        fullDollar: (B - houseEdge * fullSpins) * bet
      })
    }
    setEvTable(table)
  }, [overallRTP, avgBonusPay, increment, avgTrigger, currentX, betSize, maxMajor])

  useEffect(() => {
    queueMicrotask(() => calculate())
  }, [calculate])

  const handleFloatChange = (setter) => (e) => {
    const val = e.target.value.replace(/[^0-9.]/g, '');
    setter(val);
  };

  const handleFloatBlur = (setter, defaultVal) => (e) => {
    let val = e.target.value.trim();
    if (val === '' || isNaN(parseFloat(val))) {
      setter(defaultVal);
    } else {
      setter(parseFloat(val));
    }
  };

  return (
    <div data-calc="phoenix" className="min-h-full pb-12">
      <div className="w-full px-0 pt-1">

        {/* Large back chevron + Title with reduced padding */}
        <div className="flex items-center mb-4">
          <button
            onClick={onBack}
            className="text-[52px] leading-none text-orange-400 hover:text-orange-300 -mt-1 mr-4 font-light active:opacity-70"
          >
            ‹
          </button>

          <div className="flex items-center flex-1 justify-center gap-3">
            <img 
              src={CALCULATOR_ICON_SRC.phoenix} 
              alt="Phoenix Link" 
              className="w-14 h-14 rounded-xl object-contain" 
            />
            <h1 
              className="text-[33px] font-black tracking-[-1.6px] text-black"
              style={{
                textShadow: `-1px -1px 0 #f97316, 1px -1px 0 #f97316, -1px 1px 0 #f97316, 1px 1px 0 #f97316`
              }}
            >
              PHOENIX LINK
            </h1>
          </div>

          <div className="w-12 shrink-0" aria-hidden />
        </div>

        {/* Counter + Bet + Denom */}
        <div className="bg-gray-900 p-3 rounded-3xl mb-4 space-y-3">
          <div>
            <label className="block text-gray-400 mb-1 text-xs">Counter</label>
            <input 
              type="text" 
              inputMode="numeric" 
              value={currentX} 
              onChange={(e) => {
                const val = e.target.value.replace(/[^0-9]/g, '');
                setCurrentX(val === '' ? '' : parseInt(val, 10));
              }} 
              className="calc-field-lg w-full p-3 bg-gray-800 rounded-2xl text-2xl font-bold text-center border-2 border-orange-500" 
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-gray-400 mb-1 text-xs">Bet Size</label>
              <div className="flex h-14 items-stretch gap-1 rounded-2xl bg-gray-800 px-2.5 focus-within:ring-2 focus-within:ring-orange-500/30">
                <span className="flex shrink-0 items-center pl-0.5 text-2xl font-bold leading-none text-gray-400" aria-hidden>
                  $
                </span>
                <input
                  type="text"
                  inputMode="decimal"
                  value={betSize}
                  onChange={handleFloatChange(setBetSize, 25)}
                  onBlur={handleFloatBlur(setBetSize, 25)}
                  className="calc-field-lg min-w-0 flex-1 border-0 bg-transparent text-center text-2xl font-bold leading-none text-white outline-none focus:ring-0"
                />
              </div>
            </div>
            <div>
              <label className="block text-gray-400 mb-1 text-xs">Denomination</label>
              <DropdownSelect
                value={denom}
                onChange={setDenom}
                options={[0.01,0.02,0.05,0.10,0.25,1,2,5,10,25,50,100].map(d => ({ value: d, label: `$${formatDenomLabel(d)}` }))}
                accentClass="text-orange-400"
                size="lg"
              />
            </div>
          </div>
        </div>

        {/* Advanced Settings */}
        <div className="bg-gray-900 rounded-3xl mb-6 overflow-hidden">
          <button 
            onClick={() => setShowAdvanced(!showAdvanced)} 
            className="w-full flex items-center justify-between p-4 text-left hover:bg-gray-800 transition-colors"
          >
            <span className="text-base font-semibold">Advanced Settings</span>
            <span className={`text-xl transition-transform ${showAdvanced ? 'rotate-180' : ''}`}>▼</span>
          </button>
          {showAdvanced && (
            <div className="p-4 pt-4 space-y-4 border-t border-gray-800">
              <div className="flex items-center justify-between">
                <span className="text-sm">Max Major</span>
                <button 
                  onClick={() => setMaxMajor(!maxMajor)} 
                  className={`px-6 py-2 rounded-xl font-semibold text-sm ${maxMajor ? 'bg-green-600 text-white' : 'bg-gray-700 text-gray-300'}`}
                >
                  {maxMajor ? 'YES' : 'NO'}
                </button>
              </div>
              <div>
                <label className="block text-gray-400 mb-1 text-xs">Overall RTP (%)</label>
                <input 
                  type="text" 
                  value={overallRTP} 
                  onChange={handleFloatChange(setOverallRTP, 91)} 
                  onBlur={handleFloatBlur(setOverallRTP, 91)} 
                  className="w-full p-3 bg-gray-800 rounded-xl" 
                />
              </div>
              <div>
                <label className="block text-gray-400 mb-1 text-xs">Avg Bonus Pay (bets)</label>
                <input 
                  type="text" 
                  value={avgBonusPay} 
                  onChange={handleFloatChange(setAvgBonusPay, 31)} 
                  onBlur={handleFloatBlur(setAvgBonusPay, 31)} 
                  className="w-full p-3 bg-gray-800 rounded-xl" 
                />
              </div>
              <div>
                <label className="block text-gray-400 mb-1 text-xs">Balls per Spin</label>
                <input 
                  type="text" 
                  value={increment} 
                  onChange={handleFloatChange(setIncrement, 1.2)} 
                  onBlur={handleFloatBlur(setIncrement, 1.2)} 
                  className="w-full p-3 bg-gray-800 rounded-xl" 
                />
              </div>
              <div>
                <label className="block text-gray-400 mb-1 text-xs">Avg Counter Trigger</label>
                <input 
                  type="text" 
                  value={avgTrigger} 
                  onChange={handleFloatChange(setAvgTrigger, 1795)} 
                  onBlur={handleFloatBlur(setAvgTrigger, 1795)} 
                  className="w-full p-3 bg-gray-800 rounded-xl" 
                />
              </div>
            </div>
          )}
        </div>

        {/* Current EV */}
        <div className="bg-gray-900 p-6 rounded-3xl mb-6">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-semibold text-orange-400">Current EV</h2>
            <div className={`text-lg font-bold ${currentRTP >= 100 ? 'text-green-400' : 'text-red-400'}`}>
              {currentRTP.toFixed(1)}% RTP
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4 mb-6">
            <div className="bg-gray-800 p-4 rounded-2xl">
              <div className="text-gray-400 text-sm">Average Case</div>
              <div className={`text-3xl font-bold ${evAvg >= 0 ? 'text-green-400' : 'text-red-400'}`}>{evAvg.toFixed(1)}×</div>
              <div className="text-sm">${(evAvg * betSize).toFixed(2)}</div>
              <div className="mt-3 pt-3 border-t border-gray-700">
                <div className="text-xs text-gray-400">Max Exposure</div>
                <div className="text-red-400 font-bold">{maxExposureAvg} bets (${(maxExposureAvg * betSize).toFixed(0)})</div>
              </div>
            </div>
            <div className="bg-gray-800 p-4 rounded-2xl">
              <div className="text-gray-400 text-sm">Full Run (to 1888)</div>
              <div className={`text-3xl font-bold ${evFullRun >= 0 ? 'text-green-400' : 'text-red-400'}`}>{evFullRun.toFixed(1)}×</div>
              <div className="text-sm">${(evFullRun * betSize).toFixed(2)}</div>
              <div className="mt-3 pt-3 border-t border-gray-700">
                <div className="text-xs text-gray-400">Max Exposure</div>
                <div className="text-red-400 font-bold">{maxExposureFull} bets (${(maxExposureFull * betSize).toFixed(0)})</div>
              </div>
            </div>
          </div>
          <div className={`p-4 rounded-2xl text-center text-base font-bold mb-8 ${currentX >= beAvg ? 'bg-green-900 text-green-300' : 'bg-red-900 text-red-300'}`}>
            {currentX >= beAvg ? (
              <>
                <span className="phoenix-check-emoji">✅ </span>
                <span className="phoenix-check-badge inline-flex items-center justify-center w-5 h-5 rounded border-2 border-[#fff] text-[#fff] text-xs font-black leading-none mr-1.5">✓</span>
                PLAY +EV Expected
              </>
            ) : '❌ Still -EV keep waiting'}
          </div>
          <h2 className="text-xl font-semibold mb-5 text-orange-400">Break Even Points</h2>
          <div className="grid grid-cols-2 gap-4">
            <div><div className="text-gray-400 text-sm">Average</div><div className="text-4xl font-bold text-green-400">{beAvg}</div></div>
            <div><div className="text-gray-400 text-sm">Full Run (to 1888)</div><div className="text-4xl font-bold text-yellow-400">{beFullRun}</div></div>
          </div>
          {!isAlreadyPositive && (
            <div className="mt-6 pt-4 border-t border-gray-700 text-center text-sm italic text-orange-400">
              FP needed to reach +EV: <span className="font-bold text-white">${fpDollarsNeeded}</span> (play to {beAvg})
            </div>
          )}
        </div>

        <BankrollRiskAdvisor
          supabaseClient={supabaseClient}
          maxExpectedLoss={maxExposureFull * betSize}
          playLabel="Phoenix Link"
          playDetails={{ counter: currentX, betSize }}
          accentClass="text-orange-400"
          accentBtnClass="bg-orange-600 hover:bg-orange-500"
        />

        <CalculatorLogPlayButton
          calculatorSlug="phoenix"
          prefillValues={{
            counter: currentX,
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
          accentBtnClass="bg-orange-600 hover:bg-orange-500"
        />

        {/* Acquisition Fee Calculator */}
        <div className="bg-gray-900 p-6 rounded-3xl mb-6">
          <h2 className="text-xl font-semibold mb-4 text-orange-400">Acquisition Fee Calculator</h2>
          <p className="text-gray-400 text-sm mb-5">Fair finder's fee for scout</p>
          <div className="grid grid-cols-2 gap-4 mb-6">
            <div>
              <label className="block text-gray-400 mb-1 text-xs">EV Basis</label>
              <div className="flex h-14 items-stretch bg-gray-800 rounded-2xl p-1">
                <button 
                  onClick={() => setUseFullRunForFee(false)} 
                  className={`flex-1 text-sm font-semibold rounded-[14px] ${!useFullRunForFee ? 'bg-orange-600 text-white' : 'text-gray-400'}`}
                >
                  Average
                </button>
                <button 
                  onClick={() => setUseFullRunForFee(true)} 
                  className={`flex-1 text-sm font-semibold rounded-[14px] ${useFullRunForFee ? 'bg-orange-600 text-white' : 'text-gray-400'}`}
                >
                  Full Run
                </button>
              </div>
            </div>
            <div>
              <div className="flex justify-between items-center mb-1">
                <label className="block text-gray-400 text-xs">Scout Share</label>
                <span className="font-bold text-orange-400 text-xs">{scoutPercentage}%</span>
              </div>
              <div className="flex h-14 items-center bg-gray-800 rounded-2xl px-3">
                <input 
                  type="range" 
                  min="10" 
                  max="15" 
                  step="1" 
                  value={scoutPercentage} 
                  onChange={(e) => setScoutPercentage(Number(e.target.value))} 
                  className="w-full range-touch-target accent-orange-500" 
                />
              </div>
            </div>
          </div>
          <div className="bg-gray-800 rounded-2xl p-5 text-center mb-4">
            <div className="text-gray-400 text-sm mb-1">Expected Profit</div>
            <div className="text-4xl font-bold text-white">
              ${((useFullRunForFee ? evFullRun : evAvg) * betSize).toFixed(2)}
            </div>
            <div className="text-xs text-gray-400">
              {useFullRunForFee ? 'Full Run EV' : 'Average Case EV'}
            </div>
          </div>
          <div className="bg-gray-800 rounded-2xl p-5 text-center">
            <div className="text-gray-400 text-sm mb-1">Recommended Finder's Fee</div>
            <div className="text-4xl font-bold text-green-400">
              ${(((useFullRunForFee ? evFullRun : evAvg) * betSize) * (scoutPercentage / 100)).toFixed(2)}
            </div>
            <div className="text-xs text-gray-400 mt-1">to scout</div>
          </div>
        </div>

        {/* Walk-Away Advisor */}
        <div className="bg-gray-900 p-6 rounded-3xl mb-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-semibold text-orange-400">Walk-Away Advisor</h2>
            <button onClick={() => setShowInfoModal(true)} className="w-8 h-8 flex items-center justify-center text-orange-400 hover:text-orange-300 transition-colors">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
                <circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/>
              </svg>
            </button>
          </div>
          <div className="bg-gray-800 rounded-2xl p-4 mb-6 flex items-center gap-4">
            <div className="flex-1">
              <label className="block text-gray-400 mb-1 text-xs">Test Counter</label>
              <input 
                type="text" 
                inputMode="numeric" 
                value={testCounter} 
                onChange={(e) => {
                  const val = e.target.value.replace(/[^0-9]/g, '');
                  setTestCounter(val === '' ? '' : parseInt(val, 10));
                }} 
                className="w-full p-3 bg-gray-700 rounded-2xl text-2xl font-bold text-center border border-orange-400" 
              />
            </div>
            <div className="text-center">
              <div className="text-xs text-gray-400 mb-1">Walk-away</div>
              <div className="text-4xl font-bold text-green-400">+{testCounter ? getRecommendedWalkAway(testCounter) : 0} bets</div>
              <div className="text-sm text-green-400">
                ${((testCounter ? getRecommendedWalkAway(testCounter) : 0) * betSize).toFixed(0)}
              </div>
            </div>
          </div>
          <div className="h-80 bg-gray-950 rounded-2xl p-4 border border-gray-700 mb-4 relative">
            <Line data={chartData} options={chartOptions} plugins={chartBgPlugins} />
          </div>
          <div className="bg-gray-800 rounded-2xl p-4 text-center text-sm min-h-[52px] flex items-center justify-center">
            {hoverCounter !== null ? (
              <>At <span className="text-orange-400 font-semibold mx-1">{hoverCounter}</span> walk away around <span className="text-green-400 font-bold mx-1">+{hoverWalkAway} bets</span> <span className="text-green-400">(${ (hoverWalkAway * betSize).toFixed(0) })</span></>
            ) : (
              <>At <span className="text-orange-400 font-semibold mx-1">{currentX}</span> walk away around <span className="text-green-400 font-bold mx-1">+{getRecommendedWalkAway(currentX)} bets</span> <span className="text-green-400">(${ (getRecommendedWalkAway(currentX) * betSize).toFixed(0) })</span></>
            )}
          </div>
        </div>

        {/* EV Table */}
        <div className="bg-gray-900 p-6 rounded-3xl">
          <h2 className="text-xl font-semibold mb-5 text-orange-400">EV Table - 1150 to 1875</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse min-w-[540px]">
              <thead>
                <tr className="border-b border-gray-700">
                  <th className="py-4 px-4 text-gray-400 font-medium w-[92px]">Counter</th>
                  <th className="py-4 px-3 text-gray-400 font-medium w-[155px]">EV Avg (Bets | $)</th>
                  <th className="py-4 px-5 text-gray-400 font-medium">Full Run (to 1888) (Bets | $)</th>
                </tr>
              </thead>
              <tbody>
                {evTable.map((row, index) => (
                  <tr key={index} className="border-b border-gray-800">
                    <td className="py-4 px-4 font-semibold">{row.counter}</td>
                    <td className={`py-4 px-3 font-bold ${row.avgEV >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                      {row.avgEV.toFixed(1)} | ${row.avgDollar.toFixed(0)}
                    </td>
                    <td className={`py-4 px-5 font-bold ${row.fullEV >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                      {row.fullEV.toFixed(1)} | ${row.fullDollar.toFixed(0)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <CalculatorDisclaimer />
      </div>

      {/* Info Modal */}
      {showInfoModal && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-900 rounded-3xl max-w-md w-full p-6">
            <h3 className="text-xl font-semibold text-orange-400 mb-4">Walk-Away Advisor</h3>
            <div className="text-gray-300 text-[15px] leading-relaxed space-y-4">
              <p>This advisor recommends the <strong>optimal stopping threshold</strong>: the profit level (in bets) at which you should consider walking away, even while the machine remains in a positive expected value (+EV) state.</p>
              <p>Phoenix Link has extreme <strong>volatility drag</strong> and <strong>drawdown risk</strong>. Even with strong positive remaining EV, 100–300 bet drawdowns occur frequently.</p>
              <p>The advisor calculates a <strong>risk-adjusted certainty equivalent</strong> by combining remaining EV and a logistic S-curve calibrated through Monte Carlo simulations.</p>
              <p>In short: it converts raw theoretical EV into a practical, utility-aware stopping rule.</p>
            </div>
            <button onClick={() => setShowInfoModal(false)} className="mt-6 w-full bg-orange-600 hover:bg-orange-500 py-4 rounded-2xl font-bold text-lg transition-colors">
              Got it
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

export default PhoenixLink