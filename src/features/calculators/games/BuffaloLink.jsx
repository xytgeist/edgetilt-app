import { useState, useEffect, useCallback } from 'react'
import { DropdownSelect } from '../DropdownSelect'
import CalculatorDisclaimer from '../../../components/CalculatorDisclaimer'
import { CALCULATOR_ICON_SRC } from '../calculatorAccess.js'
import { formatDenomLabel } from '../../../utils/formatDenomLabel'
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
ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend)

const MUST_HIT = 1800
const RTP_FLOOR_COUNTER = 850

function BuffaloLink({ onBack, supabaseClient = null, onOpenLogbook = null, logPlayLocked = false, onRequireSubscribe = null, playLogsRemaining = null, freemiumUsageLoading = false }) {
  const [currentX, setCurrentX] = useState(1234)   // Changed default to 1234
  const [betSize, setBetSize] = useState(25)
  const [denom, setDenom] = useState(1.00)
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [overallRTP, setOverallRTP] = useState(91)
  const [avgBonusPay, setAvgBonusPay] = useState(20)
  const [buffalosPerSpin, setBuffalosPerSpin] = useState(1.7)
  const [midpointFactor, setMidpointFactor] = useState(0.5)
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

  const [scoutPercentage, setScoutPercentage] = useState(12)
  const [useFullRunForFee, setUseFullRunForFee] = useState(false)

  // Walk-Away S-Curve
  const getRecommendedWalkAway = (counter) => {
    const oRTP = overallRTP / 100
    const inc = buffalosPerSpin
    const B = avgBonusPay
    const spinsRemaining = Math.max(0, (MUST_HIT - counter) / inc)
    const remainingEV = B - (1 - oRTP) * spinsRemaining
    const normalized = Math.max(0, Math.min(1, (counter - 1300) / 588))
    const sCurve = 1 / (1 + Math.exp(-5.5 * (normalized - 0.48)))
    const curveBonus = sCurve * 98
    let walkAway = Math.round(remainingEV * 3.5 + curveBonus)
    return Math.max(75, Math.min(245, walkAway))
  }

  const isLight = typeof document !== 'undefined' && document.documentElement.classList.contains('light')
  const chartLineColor = isLight ? '#b45309' : '#fcd34d'
  const chartFillColor = isLight ? 'rgba(180, 83, 9, 0.15)' : 'rgba(252, 211, 77, 0.15)'

  const chartData = {
    labels: Array.from({ length: 21 }, (_, i) => 1300 + i * 28),
    datasets: [{
      label: 'Recommended Walk-Away',
      data: Array.from({ length: 21 }, (_, i) => getRecommendedWalkAway(1300 + i * 28)),
      borderColor: chartLineColor,
      backgroundColor: chartFillColor,
      tension: 0.45,
      borderWidth: 3.5,
      pointRadius: 3,
      pointHoverRadius: 7,
    }]
  }
  const chartAxisColor = isLight ? '#18181b' : '#d1d5db'
  const chartGridColor = isLight ? '#c4c4c8' : '#374151'
  const chartBgPlugins = isLight ? [{
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

  // Auto RTP based on denomination
  useEffect(() => {
    let baseOverall = 91
    if (denom <= 0.02) baseOverall = 88
    else if (denom === 0.05) baseOverall = 88.25
    else if (denom === 0.10) baseOverall = 88.4
    else if (denom === 0.25) baseOverall = 88.6
    else if (denom === 0.5) baseOverall = 90
    else if (denom > 1) baseOverall = 91.5

    // Keep the UI RTP stable; Max Major affects calculations only.
    queueMicrotask(() => setOverallRTP(baseOverall))
  }, [denom])

  // Main calculation
  const calculate = useCallback(() => {
    const displayedOverall = Number(overallRTP) || 0
    const effectiveOverall = displayedOverall + (maxMajor ? 0.5 : 0)
    const oRTP = effectiveOverall / 100
    const inc = buffalosPerSpin
    const X = Number(currentX) || 0
    const bet = Number(betSize) || 25
    const B = Number(avgBonusPay) || 20
    const houseEdge = 1 - oRTP

    const midpointTrigger = X + (MUST_HIT - X) * midpointFactor
    const spinsAvg = Math.max(0, (midpointTrigger - X) / inc)
    const spinsFull = Math.max(0, (MUST_HIT - X) / inc)

    const avgEV = B - houseEdge * spinsAvg
    const fullEV = B - houseEdge * spinsFull

    const baseHouseEdge = 1 - 0.28
    const maxExpAvg = Math.round(spinsAvg * baseHouseEdge)
    const maxExpFull = Math.round(spinsFull * baseHouseEdge)

    const breakevenAvg = Math.round(MUST_HIT - (B / houseEdge) * (inc / midpointFactor))
    const breakevenFull = Math.round(MUST_HIT - (B / houseEdge) * inc)

    setEvAvg(avgEV)
    setEvFullRun(fullEV)
    setMaxExposureAvg(maxExpAvg)
    setMaxExposureFull(maxExpFull)
    setBeAvg(breakevenAvg)
    setBeFullRun(breakevenFull)

    const spinsToExpectedHit = Math.max(1, spinsAvg)
    const rawRTP = 100 + 100 * (B / spinsToExpectedHit - houseEdge)

    let finalRTP
    if (X >= breakevenAvg) {
      finalRTP = rawRTP
    } else if (X <= RTP_FLOOR_COUNTER) {
      finalRTP = overallRTP
    } else {
      const distanceFromFloor = breakevenAvg - RTP_FLOOR_COUNTER
      const distanceFromBE = breakevenAvg - X
      const progress = distanceFromBE / distanceFromFloor
      finalRTP = 100 - (100 - overallRTP) * progress
    }

    setCurrentRTP(Math.round(finalRTP * 10) / 10)

    const alreadyPositive = avgEV >= 0
    setIsAlreadyPositive(alreadyPositive)

    if (!alreadyPositive && breakevenAvg > X) {
      const spinsNeeded = (breakevenAvg - X) / inc
      setFpDollarsNeeded(Math.round(spinsNeeded * bet))
    } else {
      setFpDollarsNeeded(0)
    }

    const table = []
    for (let c = 1150; c <= 1775; c += 25) {
      const midTrig = c + (MUST_HIT - c) * midpointFactor
      const avgSpins = Math.max(0, (midTrig - c) / inc)
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
  }, [
    currentX,
    betSize,
    overallRTP,
    avgBonusPay,
    buffalosPerSpin,
    midpointFactor,
    maxMajor,
  ])

  useEffect(() => {
    queueMicrotask(() => calculate())
  }, [calculate])

  const handleFloatChange = (setter) => (e) => {
    const val = e.target.value.replace(/[^0-9.]/g, '')
    setter(val)
  }

  const handleFloatBlur = (setter, defaultVal) => (e) => {
    let val = parseFloat(e.target.value)
    setter(isNaN(val) ? defaultVal : val)
  }

  const handleIntegerChange = (setter) => (e) => {
    const val = e.target.value.replace(/[^0-9]/g, '')
    setter(val)
  }

  const handleIntegerBlur = (setter, defaultVal) => (e) => {
    let val = parseInt(e.target.value, 10)
    setter(isNaN(val) ? defaultVal : val)
  }

  return (
    <div data-calc="buffalo-link" className="min-h-full pb-12">
      <div className="w-full px-0 pt-1">

        {/* Large back chevron + Title with reduced padding */}
        <div className="flex items-center mb-4">
          <button
            onClick={onBack}
            className="text-[52px] leading-none text-amber-400 hover:text-amber-300 -mt-1 mr-4 font-light active:opacity-70"
          >
            ‹
          </button>

          <div className="flex items-center flex-1 justify-center gap-3">
            <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-2xl bg-gradient-to-br from-amber-400 to-orange-600 ring-1 ring-amber-950/35 shadow-md shadow-black/30">
              <img
                src={CALCULATOR_ICON_SRC['buffalo-link']}
                alt="Buffalo"
                className="h-full w-full object-cover object-center"
              />
            </div>
            <h1
              className="text-[32px] font-black tracking-[-1.6px] text-amber-100"
              style={{ textShadow: `-1px -1px 0 #b45309, 1px -1px 0 #b45309, -1px 1px 0 #b45309, 1px 1px 0 #b45309` }}
            >
              BUFFALO LINK
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
              onChange={handleIntegerChange(setCurrentX, 1234)}
              onBlur={handleIntegerBlur(setCurrentX, 1234)}
              className="calc-field-lg w-full p-3 bg-gray-800 rounded-2xl text-2xl font-bold text-center border-2 border-amber-500"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-gray-400 mb-1 text-xs">Bet Size</label>
              <div className="flex h-14 items-stretch gap-1 rounded-2xl bg-gray-800 px-2.5 focus-within:ring-2 focus-within:ring-amber-500/30">
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
                options={[0.01, 0.02, 0.05, 0.10, 0.25, 0.5, 1, 2, 5, 10, 25, 50, 100].map((d) => ({
                  value: d,
                  label: `$${formatDenomLabel(d)}`,
                }))}
                accentClass="text-amber-400"
                size="lg"
              />
            </div>
          </div>
        </div>

        {/* Advanced Settings */}
        <div className="bg-gray-900 rounded-3xl mb-6 overflow-hidden">
          <button onClick={() => setShowAdvanced(!showAdvanced)} className="w-full flex items-center justify-between p-4 text-left hover:bg-gray-800">
            <span className="text-base font-semibold">Advanced Settings</span>
            <span className={`text-xl transition-transform ${showAdvanced ? 'rotate-180' : ''}`}>▼</span>
          </button>
          {showAdvanced && (
            <div className="p-4 pt-4 space-y-5 border-t border-gray-800">
              <div className="flex justify-between items-center">
                <span>Max Major</span>
                <button onClick={() => setMaxMajor(!maxMajor)} className={`px-6 py-2 rounded-xl text-sm font-semibold ${maxMajor ? 'bg-green-600' : 'bg-gray-700'}`}>
                  {maxMajor ? 'YES' : 'NO'}
                </button>
              </div>
              <div>
                <label className="block text-gray-400 text-xs mb-1">Overall RTP (%)</label>
                <input type="text" value={overallRTP} onChange={handleFloatChange(setOverallRTP, 91)} onBlur={handleFloatBlur(setOverallRTP, 91)} className="w-full p-3 bg-gray-800 rounded-xl" />
              </div>
              <div>
                <label className="block text-gray-400 text-xs mb-1">Avg Bonus Pay (bets)</label>
                <input type="text" value={avgBonusPay} onChange={handleFloatChange(setAvgBonusPay, 20)} onBlur={handleFloatBlur(setAvgBonusPay, 20)} className="w-full p-3 bg-gray-800 rounded-xl" />
              </div>
              <div>
                <div className="flex justify-between mb-1">
                  <label className="text-gray-400 text-xs">Buffalos per Spin</label>
                  <span className="text-amber-400 font-bold">{buffalosPerSpin.toFixed(1)}</span>
                </div>
                <input type="range" min="1.5" max="1.9" step="0.1" value={buffalosPerSpin} onChange={(e) => setBuffalosPerSpin(parseFloat(e.target.value))} className="w-full range-touch-target accent-amber-500" />
              </div>
              <div>
                <div className="flex justify-between mb-1">
                  <label className="text-gray-400 text-xs">Midpoint Factor</label>
                  <span className="text-amber-400 font-bold">{midpointFactor.toFixed(2)}</span>
                </div>
                <input type="range" min="0" max="1" step="0.05" value={midpointFactor} onChange={(e) => setMidpointFactor(parseFloat(e.target.value))} className="w-full range-touch-target accent-amber-500" />
              </div>
            </div>
          )}
        </div>

        {/* Current EV */}
        <div className="bg-gray-900 p-6 rounded-3xl mb-6">
          <div className="flex justify-between mb-4">
            <h2 className="text-xl font-semibold text-amber-400">Current EV</h2>
            <div className={`text-lg font-bold ${currentRTP >= 100 ? 'text-green-400' : 'text-red-400'}`}>{currentRTP.toFixed(1)}% RTP</div>
          </div>

          <div className="grid grid-cols-2 gap-4 mb-6">
            <div className="bg-gray-800 p-4 rounded-2xl">
              <div className="text-gray-400 text-sm">Average Case</div>
              <div className={`text-3xl font-bold ${evAvg >= 0 ? 'text-green-400' : 'text-red-400'}`}>{evAvg.toFixed(1)}×</div>
              <div className="text-sm text-gray-300">${(evAvg * betSize).toFixed(2)}</div>
              <div className="mt-4 pt-3 border-t border-gray-700 text-xs text-gray-400">
                Max Exposure: <span className="text-red-400 font-bold">{maxExposureAvg} bets</span>
              </div>
            </div>
            <div className="bg-gray-800 p-4 rounded-2xl">
              <div className="text-gray-400 text-sm">Full Run (to 1800)</div>
              <div className={`text-3xl font-bold ${evFullRun >= 0 ? 'text-green-400' : 'text-red-400'}`}>{evFullRun.toFixed(1)}×</div>
              <div className="text-sm text-gray-300">${(evFullRun * betSize).toFixed(2)}</div>
              <div className="mt-4 pt-3 border-t border-gray-700 text-xs text-gray-400">
                Max Exposure: <span className="text-red-400 font-bold">{maxExposureFull} bets</span>
              </div>
            </div>
          </div>

          <div className={`p-4 rounded-2xl text-center font-bold ${currentX >= beAvg ? 'bg-green-900 text-green-300' : 'bg-red-900 text-red-300'}`}>
            {currentX >= beAvg ? (
              <>
                <span className="buffalo-check-emoji">✅ </span>
                <span className="buffalo-check-badge inline-flex items-center justify-center w-5 h-5 rounded border-2 border-[#fff] text-[#fff] text-xs font-black leading-none mr-1.5">✓</span>
                PLAY +EV Expected
              </>
            ) : '❌ Still -EV keep waiting'}
          </div>

          <h2 className="text-xl font-semibold mt-8 mb-4 text-amber-400">Break Even Points</h2>
          <div className="grid grid-cols-2 gap-6 text-center">
            <div>
              <div className="text-gray-400 text-sm">Average Case</div>
              <div className="text-4xl font-bold text-green-400">{beAvg}</div>
            </div>
            <div>
              <div className="text-gray-400 text-sm">Full Run (to 1800)</div>
              <div className="text-4xl font-bold text-amber-400">{beFullRun}</div>
            </div>
          </div>

          {!isAlreadyPositive && fpDollarsNeeded > 0 && (
            <div className="mt-6 text-center text-amber-400 italic text-sm">
              FP needed to reach +EV: <span className="font-bold text-white">${fpDollarsNeeded}</span> (play to {beAvg})
            </div>
          )}
        </div>

        <BankrollRiskAdvisor
          supabaseClient={supabaseClient}
          maxExpectedLoss={maxExposureFull * betSize}
          playLabel="Buffalo Link"
          playDetails={{ counter: currentX, betSize }}
          accentClass="text-amber-400"
          accentBtnClass="bg-amber-600 hover:bg-amber-500"
        />

        <CalculatorLogPlayButton
          calculatorSlug="buffalo-link"
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
          accentBtnClass="bg-amber-600 hover:bg-amber-500"
        />

        {/* Acquisition Fee */}
        <div className="bg-gray-900 p-6 rounded-3xl mb-6">
          <h2 className="text-xl font-semibold text-amber-400 mb-4">Acquisition Fee Calculator</h2>
          <p className="text-gray-400 text-sm mb-5">Fair finder's fee for scout</p>
          <div className="grid grid-cols-2 gap-4 mb-6">
            <div>
              <label className="block text-gray-400 text-xs mb-1">EV Basis</label>
              <div className="flex h-14 items-stretch bg-gray-800 rounded-2xl p-1">
                <button
                  onClick={() => setUseFullRunForFee(false)}
                  className={`flex-1 rounded-[14px] text-sm font-semibold ${!useFullRunForFee ? 'bg-amber-600 text-white' : 'text-gray-400'}`}
                >
                  Average
                </button>
                <button
                  onClick={() => setUseFullRunForFee(true)}
                  className={`flex-1 rounded-[14px] text-sm font-semibold ${useFullRunForFee ? 'bg-amber-600 text-white' : 'text-gray-400'}`}
                >
                  Full Run
                </button>
              </div>
            </div>
            <div>
              <div className="flex justify-between items-center mb-1">
                <span className="text-gray-400 text-xs">Scout Share</span>
                <span className="text-amber-400 font-bold text-xs">{scoutPercentage}%</span>
              </div>
              <div className="flex h-14 items-center bg-gray-800 rounded-2xl px-3">
                <input
                  type="range"
                  min="10"
                  max="15"
                  step="1"
                  value={scoutPercentage}
                  onChange={(e) => setScoutPercentage(Number(e.target.value))}
                  className="w-full range-touch-target accent-amber-500"
                />
              </div>
            </div>
          </div>
          <div className="bg-gray-800 rounded-2xl p-5 mb-4 text-center">
            <div className="text-gray-400 text-sm mb-1">Expected Profit</div>
            <div className="text-4xl font-bold text-white">
              ${((useFullRunForFee ? evFullRun : evAvg) * betSize).toFixed(2)}
            </div>
            <div className="text-xs text-gray-400 mt-1">
              {useFullRunForFee ? 'Full Run EV' : 'Average Case EV'}
            </div>
          </div>
          <div className="bg-gray-800 rounded-2xl p-5 text-center">
            <div className="text-gray-400 text-sm mb-1">Recommended Finder's Fee</div>
            <div className="text-4xl font-bold text-green-400">
              ${(((useFullRunForFee ? evFullRun : evAvg) * betSize) * (scoutPercentage / 100)).toFixed(2)}
            </div>
            <div className="text-xs text-gray-400 mt-1">to scout ({scoutPercentage}% of expected profit)</div>
          </div>
        </div>

        {/* Walk-Away Advisor */}
        <div className="bg-gray-900 p-6 rounded-3xl mb-6">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-semibold text-amber-400">Walk-Away Advisor</h2>
            <button onClick={() => setShowInfoModal(true)} className="w-8 h-8 flex items-center justify-center text-amber-400 hover:text-amber-300 transition-colors">
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
                onChange={handleIntegerChange(setTestCounter, 1400)}
                onBlur={handleIntegerBlur(setTestCounter, 1400)}
                className="w-full p-3 bg-gray-700 rounded-2xl text-2xl font-bold text-center border border-amber-400"
              />
            </div>
            <div className="text-center">
              <div className="text-xs text-gray-400 mb-1">Recommended Walk-Away</div>
              <div className="text-4xl font-bold text-green-400">
                +{getRecommendedWalkAway(testCounter)} bets
              </div>
              <div className="text-sm text-green-400">
                ${ (getRecommendedWalkAway(testCounter) * betSize).toFixed(0) }
              </div>
            </div>
          </div>
          <div className="h-80 bg-gray-950 rounded-2xl p-4 border border-gray-700 mb-6">
            <Line data={chartData} options={chartOptions} plugins={chartBgPlugins} />
          </div>
          <div className="bg-gray-800 rounded-2xl p-5 text-center">
            {hoverCounter !== null ? (
              <>At <span className="text-amber-400 font-semibold mx-1">{hoverCounter}</span> walk away around <span className="text-green-400 font-bold mx-1">+{hoverWalkAway} bets</span> <span className="text-green-400">(${ (hoverWalkAway * betSize).toFixed(0) })</span></>
            ) : (
              <>At <span className="text-amber-400 font-semibold mx-1">{currentX}</span> walk away around <span className="text-green-400 font-bold mx-1">+{getRecommendedWalkAway(currentX)} bets</span> <span className="text-green-400">(${ (getRecommendedWalkAway(currentX) * betSize).toFixed(0) })</span></>
            )}
          </div>
        </div>

        {/* EV Table */}
        <div className="bg-gray-900 p-6 rounded-3xl">
          <h2 className="text-xl font-semibold mb-5 text-amber-400">EV Table (1150 to 1775)</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-700">
                  <th className="py-3 px-4 text-left text-gray-400">Counter</th>
                  <th className="py-3 px-4 text-left text-gray-400">Avg EV (Bets | $)</th>
                  <th className="py-3 px-4 text-left text-gray-400">Full Run (Bets | $)</th>
                </tr>
              </thead>
              <tbody>
                {evTable.map((row, i) => (
                  <tr key={i} className="border-b border-gray-800">
                    <td className="py-3 px-4 font-semibold">{row.counter}</td>
                    <td className={`py-3 px-4 ${row.avgEV >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                      {row.avgEV.toFixed(1)} | ${(row.avgDollar || 0).toFixed(0)}
                    </td>
                    <td className={`py-3 px-4 ${row.fullEV >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                      {row.fullEV.toFixed(1)} | ${(row.fullDollar || 0).toFixed(0)}
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
            <h3 className="text-xl font-semibold text-amber-400 mb-4">Walk-Away Advisor</h3>
            <div className="text-gray-300 text-[15px] leading-relaxed space-y-4">
              <p>This advisor recommends the <strong>optimal stopping threshold</strong>: the profit level (in bets) at which you should consider walking away, even while the machine remains in a positive expected value (+EV) state.</p>
              <p>Buffalo Link has extreme <strong>volatility drag</strong> and <strong>drawdown risk</strong>. Even with strong positive remaining EV, large drawdowns occur frequently.</p>
              <p>The advisor calculates a <strong>risk-adjusted certainty equivalent</strong> by combining remaining EV and a logistic S-curve calibrated through Monte Carlo simulations.</p>
              <p>In short: it converts raw theoretical EV into a practical, utility-aware stopping rule.</p>
            </div>
            <button onClick={() => setShowInfoModal(false)} className="mt-6 w-full bg-amber-600 hover:bg-amber-500 py-4 rounded-2xl font-bold text-lg transition-colors">
              Got it
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

export default BuffaloLink