import { useState, useEffect, useCallback, useMemo } from 'react'
import CalculatorDisclaimer from '../../../components/CalculatorDisclaimer'
import { CALCULATOR_ICON_SRC } from '../calculatorAccess.js'
import BankrollRiskAdvisor from '../BankrollRiskAdvisor.jsx'
import CalculatorLogPlayButton from '../CalculatorLogPlayButton.jsx'
import { playLogCalcEvPrefill } from '../../../utils/playLogCalcSnapshot.js'
import { formatDenomLabel } from '../../../utils/formatDenomLabel'
import { DropdownSelect } from '../DropdownSelect'
import {
  BUFFALO_DIAMOND_TIERS,
  METER_RESET,
  METER_SLIDER_MAX,
  DEFAULT_BASE_GAME_RTP,
  DEFAULT_VARIANCE_BUFFER_PCT,
  DEFAULT_BASE_ADJUSTMENT,
  DIAMOND_LAND_FREQ_RATIO,
  tierBreakeven,
  meterPlayVerdict,
  marginalEdgeBets,
  markerPercent,
  clampMeter,
  defaultBaseGameRtpForDenom,
  defaultTierDiamondSpiMap,
  diamondSpiFromLandingRatio,
} from './buffaloDiamondCalc.js'

const DENOM_OPTIONS = [0.01, 0.02, 0.05, 0.1, 0.25, 0.5, 1, 2]

function verdictLabel(verdict) {
  if (verdict === 'plus-ev') return '+EV'
  if (verdict === 'marginal') return 'Marginal'
  return '-EV'
}

function verdictClass(verdict) {
  if (verdict === 'plus-ev') return 'text-emerald-400'
  if (verdict === 'marginal') return 'text-amber-400'
  return 'text-red-400'
}

export default function BuffaloDiamond({ onBack, supabaseClient = null, onOpenLogbook = null }) {
  const [greenMeter, setGreenMeter] = useState(24)
  const [blueMeter, setBlueMeter] = useState(59)
  const [goldMeter, setGoldMeter] = useState(120)

  const [betSize, setBetSize] = useState(25)
  const [denom, setDenom] = useState(0.75)
  const [baseRtp, setBaseRtp] = useState(DEFAULT_BASE_GAME_RTP)
  const [baseRtpInput, setBaseRtpInput] = useState(String(DEFAULT_BASE_GAME_RTP))
  const [showAdvanced, setShowAdvanced] = useState(false)

  const [tierDiamondSpi, setTierDiamondSpi] = useState(defaultTierDiamondSpiMap)
  const [varianceBufferPct, setVarianceBufferPct] = useState(DEFAULT_VARIANCE_BUFFER_PCT)
  const [baseAdjustment, setBaseAdjustment] = useState(DEFAULT_BASE_ADJUSTMENT)
  const [tierSpins, setTierSpins] = useState(() =>
    Object.fromEntries(BUFFALO_DIAMOND_TIERS.map((t) => [t.key, t.spinsToBonus])),
  )
  const [tierAvgPay, setTierAvgPay] = useState(() =>
    Object.fromEntries(BUFFALO_DIAMOND_TIERS.map((t) => [t.key, t.avgPayPerSpin])),
  )

  const [showInfoModal, setShowInfoModal] = useState(false)

  useEffect(() => {
    const next = defaultBaseGameRtpForDenom(denom)
    queueMicrotask(() => {
      setBaseRtp(next)
      setBaseRtpInput(String(next))
    })
  }, [denom])

  const meterValues = useMemo(
    () => ({
      green: clampMeter(greenMeter),
      blue: clampMeter(blueMeter),
      gold: clampMeter(goldMeter),
    }),
    [greenMeter, blueMeter, goldMeter],
  )

  const tierAnalysis = useMemo(() => {
    const shared = { baseRtpPct: baseRtp, varianceBufferPct, baseAdjustment }
    return BUFFALO_DIAMOND_TIERS.map((tier) => {
      const current = meterValues[tier.key]
      const formulaBe = tierBreakeven(tier, {
        ...shared,
        diamondSpi: tierDiamondSpi[tier.key],
        spinsToBonus: tierSpins[tier.key],
        avgPayPerSpin: tierAvgPay[tier.key],
      })
      const playLine = formulaBe
      const verdict = meterPlayVerdict(current, playLine)
      const edgeBets = marginalEdgeBets(current, playLine, tierAvgPay[tier.key], baseAdjustment)
      return { tier, current, formulaBe, playLine, verdict, edgeBets }
    })
  }, [meterValues, baseRtp, tierDiamondSpi, varianceBufferPct, baseAdjustment, tierSpins, tierAvgPay])

  const bestTier = useMemo(() => {
    const ranked = [...tierAnalysis].sort((a, b) => b.edgeBets - a.edgeBets)
    return ranked[0]
  }, [tierAnalysis])

  const sessionEvBets = bestTier?.edgeBets ?? 0
  const isAlreadyPositive = bestTier?.verdict === 'plus-ev'

  const calculate = useCallback(() => {
    /* derived via useMemo — hook keeps parity with other calculators */
  }, [])

  useEffect(() => {
    queueMicrotask(() => calculate())
  }, [calculate])

  const meterSetters = {
    green: setGreenMeter,
    blue: setBlueMeter,
    gold: setGoldMeter,
  }

  return (
    <div data-calc="buffalo-diamond" className="min-h-full pb-12">
      <div className="w-full px-0 pt-1">
        <div className="mb-6 flex items-center">
          <button
            type="button"
            onClick={onBack}
            className="-mt-1 mr-4 text-[52px] font-light leading-none text-emerald-400 hover:text-emerald-300 active:opacity-70"
          >
            ‹
          </button>
          <div className="flex flex-1 items-center justify-center gap-3">
            <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-2xl bg-gradient-to-br from-emerald-500/90 to-teal-800 ring-1 ring-emerald-900/40 shadow-md shadow-black/30">
              <img
                src={CALCULATOR_ICON_SRC['buffalo-diamond']}
                alt="Buffalo Diamond"
                className="h-full w-full object-cover object-center"
              />
            </div>
            <div className="-mt-1 flex flex-col items-center -space-y-[6px]">
              <h1 className="font-montserrat text-[28px] font-bold tracking-[-1.2px] text-emerald-100 sm:text-[31px]">
                BUFFALO DIAMOND
              </h1>
              <p className="text-[15px] font-semibold tracking-[0.6px] text-emerald-300/90">
                Multiplier FG meters
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setShowInfoModal(true)}
            className="w-12 shrink-0 text-center text-xl text-slate-400 hover:text-emerald-300"
            aria-label="How this calculator works"
          >
            ⓘ
          </button>
        </div>

        <div className="mb-6 grid grid-cols-2 gap-3 rounded-3xl bg-slate-900 p-5 sm:gap-4">
          <div>
            <label className="mb-1 block text-xs text-slate-400">Bet Size</label>
            <div className="flex h-14 items-stretch gap-1 rounded-2xl bg-slate-800 px-2.5 focus-within:ring-2 focus-within:ring-emerald-500/25">
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
            <label className="mb-1 block text-xs text-slate-400">Denomination</label>
            <DropdownSelect
              value={denom}
              onChange={(v) => setDenom(parseFloat(v))}
              options={[
                ...DENOM_OPTIONS.map((d) => ({ value: d, label: `$${formatDenomLabel(d)}` })),
                { value: 0.75, label: '$0.75' },
              ]}
              accentClass="text-emerald-400"
              size="lg"
            />
          </div>
        </div>

        <div className="mb-6 overflow-hidden rounded-3xl bg-slate-900">
          <button
            type="button"
            onClick={() => setShowAdvanced((v) => !v)}
            className="flex w-full touch-manipulation items-center justify-between p-4 text-left transition-colors hover:bg-slate-800/80"
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
                <label className="mb-1 block text-xs text-slate-400">Base game RTP (%)</label>
                <input
                  type="text"
                  inputMode="decimal"
                  value={baseRtpInput}
                  onChange={(e) => {
                    const next = e.target.value.replace(/[^0-9.]/g, '')
                    setBaseRtpInput(next)
                    const parsed = parseFloat(next)
                    if (Number.isFinite(parsed) && parsed > 0 && parsed < 100) setBaseRtp(parsed)
                  }}
                  onBlur={() => {
                    const parsed = parseFloat(baseRtpInput)
                    const safe = Number.isFinite(parsed) && parsed > 0 && parsed < 100 ? parsed : DEFAULT_BASE_GAME_RTP
                    setBaseRtp(safe)
                    setBaseRtpInput(String(safe))
                  }}
                  className="calc-field-lg h-14 w-full rounded-2xl border-0 bg-slate-800 px-3 text-center text-2xl font-bold leading-none text-white outline-none focus:ring-2 focus:ring-emerald-500/25"
                />
                <p className="mt-1.5 text-[11px] italic leading-relaxed text-slate-500">
                  Grind RTP while waiting (regular reels + 1× FG + small wheels). Not full 90% machine RTP.
                </p>
              </div>
              <div>
                <label className="mb-1 block text-xs text-slate-400">Base adjustment (1× FG baseline, bets)</label>
                <input
                  type="text"
                  inputMode="decimal"
                  value={baseAdjustment}
                  onChange={(e) => {
                    const parsed = parseFloat(e.target.value.replace(/[^0-9.]/g, ''))
                    if (Number.isFinite(parsed)) setBaseAdjustment(parsed)
                  }}
                  className="w-full rounded-xl bg-slate-800 p-3 text-center font-bold text-white"
                />
                <p className="mt-1.5 text-[11px] italic leading-relaxed text-slate-500">
                  Default 1.7 ... ~half of tracked 2× FG return (1× baseline before multiplier lift).
                </p>
              </div>
              <div className="rounded-xl bg-slate-800/60 p-3">
                <p className="mb-2 text-[11px] leading-relaxed text-slate-400">
                  Reel-5 colored diamonds land about{' '}
                  <span className="text-white">{DIAMOND_LAND_FREQ_RATIO.green}:{DIAMOND_LAND_FREQ_RATIO.blue}:{DIAMOND_LAND_FREQ_RATIO.gold}</span>{' '}
                  (green:blue:gold). Defaults below are calibrated to breakeven 24 / 59 / 159 at 66% base RTP.
                </p>
                <button
                  type="button"
                  onClick={() => setTierDiamondSpi(diamondSpiFromLandingRatio(tierDiamondSpi.green))}
                  className="mb-3 w-full rounded-lg bg-slate-900 px-3 py-2 text-xs font-semibold text-emerald-300 hover:bg-slate-950"
                >
                  Apply 4:2:1 SPI ratio from green ({tierDiamondSpi.green} → blue {tierDiamondSpi.green * 2}, gold {tierDiamondSpi.green * 4})
                </button>
                {BUFFALO_DIAMOND_TIERS.map((tier) => (
                  <div key={`spi-${tier.key}`} className="mb-2 last:mb-0">
                    <label className={`mb-1 block text-[10px] uppercase tracking-wide ${tier.text}`}>
                      {tier.shortLabel} avg spins per +1 FG (diamond build)
                    </label>
                    <input
                      type="text"
                      inputMode="decimal"
                      value={tierDiamondSpi[tier.key]}
                      onChange={(e) => {
                        const parsed = parseFloat(e.target.value.replace(/[^0-9.]/g, ''))
                        if (Number.isFinite(parsed) && parsed > 0) {
                          setTierDiamondSpi((prev) => ({ ...prev, [tier.key]: parsed }))
                        }
                      }}
                      className="w-full rounded-lg bg-slate-900 p-2 text-center text-sm font-bold text-white"
                    />
                  </div>
                ))}
              </div>
              {BUFFALO_DIAMOND_TIERS.map((tier) => (
                <div key={tier.key} className="grid grid-cols-2 gap-2 rounded-xl bg-slate-800/60 p-3">
                  <div>
                    <label className={`mb-1 block text-[10px] uppercase tracking-wide ${tier.text}`}>
                      {tier.shortLabel} spins to bonus
                    </label>
                    <input
                      type="text"
                      inputMode="numeric"
                      value={tierSpins[tier.key]}
                      onChange={(e) => {
                        const parsed = parseInt(e.target.value.replace(/[^0-9]/g, ''), 10)
                        if (Number.isFinite(parsed) && parsed > 0) {
                          setTierSpins((prev) => ({ ...prev, [tier.key]: parsed }))
                        }
                      }}
                      className="w-full rounded-lg bg-slate-900 p-2 text-center text-sm font-bold text-white"
                    />
                  </div>
                  <div>
                    <label className={`mb-1 block text-[10px] uppercase tracking-wide ${tier.text}`}>
                      Avg bets / FG spin
                    </label>
                    <input
                      type="text"
                      inputMode="decimal"
                      value={tierAvgPay[tier.key]}
                      onChange={(e) => {
                        const parsed = parseFloat(e.target.value.replace(/[^0-9.]/g, ''))
                        if (Number.isFinite(parsed) && parsed > 0) {
                          setTierAvgPay((prev) => ({ ...prev, [tier.key]: parsed }))
                        }
                      }}
                      className="w-full rounded-lg bg-slate-900 p-2 text-center text-sm font-bold text-white"
                    />
                  </div>
                </div>
              ))}
              <div>
                <label className="mb-1 block text-xs text-slate-400">Variance buffer (%)</label>
                <input
                  type="text"
                  inputMode="decimal"
                  value={varianceBufferPct}
                  onChange={(e) => {
                    const parsed = parseFloat(e.target.value.replace(/[^0-9.]/g, ''))
                    if (Number.isFinite(parsed) && parsed >= 0) setVarianceBufferPct(parsed)
                  }}
                  className="w-full rounded-xl bg-slate-800 p-3 text-center font-bold text-white"
                />
              </div>
            </div>
          ) : null}
        </div>

        <div className="mb-6 space-y-0 rounded-3xl bg-slate-900 p-4">
          {tierAnalysis.map((row, i) => {
            const { tier, current, formulaBe, playLine, verdict } = row
            const bePct = markerPercent(METER_RESET, METER_SLIDER_MAX, playLine)
            return (
              <div key={tier.key} className={i > 0 ? '-mt-1.5' : ''}>
                <div className="mb-0 flex items-baseline justify-between leading-none">
                  <div className={`text-sm font-semibold ${tier.text}`}>{tier.label}</div>
                  <div className={`font-mono text-sm font-bold tabular-nums ${tier.text}`}>
                    <span>{current}</span>
                    <span className="font-semibold text-slate-500"> FG</span>
                  </div>
                </div>
                <div className="relative h-5 w-full" aria-hidden>
                  <div
                    className="absolute top-0 -translate-x-1/2 whitespace-nowrap text-[9px] italic leading-none text-emerald-400"
                    style={{ left: `${bePct}%` }}
                    title={`Breakeven / play line (${playLine})`}
                  >
                    {playLine}
                  </div>
                  <div
                    className="absolute top-[9px] -translate-x-1/2 text-[8px] leading-none text-emerald-400"
                    style={{ left: `${bePct}%` }}
                  >
                    ▼
                  </div>
                </div>
                <input
                  type="range"
                  min={METER_RESET}
                  max={METER_SLIDER_MAX}
                  value={current}
                  onChange={(e) => {
                    const setter = meterSetters[tier.key]
                    setter(clampMeter(Number(e.target.value)))
                  }}
                  className={`range-touch-target relative z-10 w-full ${tier.sliderAccent}`}
                />
                <div className="mt-1 flex items-center justify-between text-[11px]">
                  <span className={verdictClass(verdict)}>{verdictLabel(verdict)} vs {playLine}+</span>
                  <span className="text-slate-500">Breakeven {formulaBe} FG</span>
                </div>
              </div>
            )
          })}
          <div className="pt-1 text-[10px] italic leading-snug text-slate-400">
            Green ▼ = breakeven banked free games (default 24 / 59 / 159 at .75 denom).
          </div>
        </div>

        <div className="mb-6 rounded-3xl bg-slate-900 p-6">
          <div className="mb-5 flex items-center justify-between">
            <h2 className="text-xl font-semibold text-emerald-400">Best tier now</h2>
            <div className={`text-lg font-bold ${isAlreadyPositive ? 'text-emerald-400' : 'text-red-400'}`}>
              {bestTier ? verdictLabel(bestTier.verdict) : '—'}
            </div>
          </div>
          {bestTier ? (
            <div className="rounded-2xl bg-slate-800 p-5">
              <div className="text-sm text-slate-400">{bestTier.tier.label}</div>
              <div className="text-2xl font-bold text-white">
                {bestTier.current} banked FG @ {bestTier.tier.mult}×
              </div>
              <div className={`mt-2 text-3xl font-bold ${sessionEvBets >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                {sessionEvBets >= 0 ? '+' : ''}
                {sessionEvBets.toFixed(1)}×
              </div>
              <div className="text-sm text-slate-300">${(sessionEvBets * betSize).toFixed(0)} edge vs play line</div>
              <p className="mt-2 text-xs italic leading-relaxed text-slate-400">
                Marginal edge vs your guide threshold on the strongest meter. Not a full session simulator.
              </p>
            </div>
          ) : null}
        </div>

        <BankrollRiskAdvisor
          betSize={betSize}
          playCostBets={750}
          supabaseClient={supabaseClient}
          cardClassName="bg-slate-900"
        />

        <CalculatorLogPlayButton
          calculatorSlug="buffalo-diamond"
          gameTitle="Buffalo Diamond"
          betSize={betSize}
          evPrefill={playLogCalcEvPrefill({
            evBets: sessionEvBets,
            betSize,
            isPositive: isAlreadyPositive,
          })}
          onOpenLogbook={onOpenLogbook}
        />

        <CalculatorDisclaimer />
      </div>

      {showInfoModal ? (
        <div
          className="fixed inset-0 z-[120] flex items-end justify-center bg-black/70 p-4 sm:items-center"
          role="dialog"
          aria-modal="true"
          aria-labelledby="buffalo-diamond-calc-info-title"
          onClick={() => setShowInfoModal(false)}
        >
          <div
            className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-3xl bg-slate-900 p-5 text-sm leading-relaxed text-slate-300 shadow-xl ring-1 ring-slate-700"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="buffalo-diamond-calc-info-title" className="mb-3 text-lg font-bold text-emerald-300">
              Breakeven logic
            </h2>
            <p className="mb-3">
              For each multiplier meter, required banked free games ≈{' '}
              <span className="text-white">(spins to that bonus × base-game house edge) ÷ (avg bets per FG spin − base adj)</span>
              {' '}minus diamond meter build during the wait (tier-specific SPI), optional variance buffer.
            </p>
            <p className="mb-3">
              Defaults: 240 / 840 / 3000 spins to bonus, 3.56 / 5.86 / 7.46 bets per FG spin, base adj 1.7, green:blue:gold diamond SPI 12 / 87 / 165 → breakeven 24 / 59 / 159.
            </p>
            <button
              type="button"
              onClick={() => setShowInfoModal(false)}
              className="mt-2 w-full rounded-xl bg-emerald-700 py-3 font-semibold text-white hover:bg-emerald-600"
            >
              Close
            </button>
          </div>
        </div>
      ) : null}
    </div>
  )
}
