import { useMemo, useState } from 'react'
import CalculatorDisclaimer from '../../../components/CalculatorDisclaimer'
import { CALCULATOR_ICON_SRC } from '../calculatorAccess.js'
import BankrollRiskAdvisor from '../BankrollRiskAdvisor.jsx'
import CalculatorLogPlayButton from '../CalculatorLogPlayButton.jsx'
import { formatDenomLabel } from '../../../utils/formatDenomLabel'
import { DropdownSelect } from '../DropdownSelect'
import {
  WEIGHTED_THRESHOLD_X,
  WOF_CE_REELS,
  emptyPrizeMap,
  markerPercent,
  prizeMultiple,
  prizesAsMultiples,
  soloReelThresholdX,
  weightedContributionX,
  weightedEdgeCredits,
  weightedEdgeX,
  weightedSumX,
  weightedThresholdProgressPct,
  weightedVerdict,
  WOF_CE_THEME,
  totalBetUsdFromCredits,
} from './wofCollectorsEditionCalc.js'

const THEME_STYLE = {
  '--wof-ce-accent': WOF_CE_THEME.accent,
  '--wof-ce-accent-light': WOF_CE_THEME.accentLight,
  '--wof-ce-accent-soft': WOF_CE_THEME.accentSoft,
  '--wof-ce-accent-dark': WOF_CE_THEME.accentDark,
  '--wof-ce-accent-muted': WOF_CE_THEME.accentMuted,
  '--wof-ce-edition-blue-soft': WOF_CE_THEME.editionBlueSoft,
  '--wof-ce-edition-blue-muted': WOF_CE_THEME.editionBlueMuted,
}

const DENOM_OPTIONS = [0.01, 0.02, 0.05, 0.1]
const BET_CREDIT_OPTIONS = [100, 200, 300, 400, 500]

function verdictPillClass(verdict) {
  if (verdict === 'plus-ev') return 'wof-ce-verdict-plus'
  if (verdict === 'marginal') return 'bg-amber-900 text-amber-200'
  return 'bg-red-900 text-red-300'
}

function playValueClass(verdict) {
  if (verdict === 'plus-ev') return 'wof-ce-accent-text'
  if (verdict === 'marginal') return 'text-amber-300'
  return 'text-red-400'
}

function verdictLabel(verdict, plusLabel, marginalLabel, negativeLabel) {
  if (verdict === 'plus-ev') return plusLabel
  if (verdict === 'marginal') return marginalLabel
  return negativeLabel
}

export default function WheelOfFortuneCollectorsEdition({
  onBack,
  supabaseClient = null,
  onOpenLogbook = null,
  logPlayLocked = false,
  onRequireSubscribe = null,
  playLogsRemaining = null,
  freemiumUsageLoading = false,
}) {
  const [betCredits, setBetCredits] = useState(300)
  const [denom, setDenom] = useState(0.01)
  const [prizeCredits, setPrizeCredits] = useState(() => emptyPrizeMap())
  const [showInfoModal, setShowInfoModal] = useState(false)

  const totalBetUsd = useMemo(
    () => totalBetUsdFromCredits(betCredits, denom),
    [betCredits, denom],
  )

  const prizesX = useMemo(
    () => prizesAsMultiples(prizeCredits, betCredits),
    [prizeCredits, betCredits],
  )
  const weightedX = useMemo(() => weightedSumX(prizesX), [prizesX])
  const weightedPlay = useMemo(() => weightedVerdict(weightedX), [weightedX])
  const thresholdProgress = useMemo(() => weightedThresholdProgressPct(weightedX), [weightedX])
  const edgeX = useMemo(() => weightedEdgeX(weightedX), [weightedX])

  const handlePrizeChange = (key) => (e) => {
    const raw = e.target.value.replace(/[^0-9]/g, '')
    setPrizeCredits((prev) => ({ ...prev, [key]: raw === '' ? 0 : Number(raw) || 0 }))
  }

  return (
    <div data-calc="wof-collectors-edition" className="min-h-full pb-12" style={THEME_STYLE}>
      <div className="mb-6 flex items-center">
        <button
          type="button"
          onClick={onBack}
          className="wof-ce-back -mt-1 mr-4 shrink-0 text-[52px] font-light leading-none active:opacity-70"
          aria-label="Back to calculators"
        >
          ‹
        </button>
        <div className="flex flex-1 items-center justify-center gap-3">
          <img
            src={CALCULATOR_ICON_SRC['wof-collectors-edition']}
            alt=""
            className="wof-ce-icon-ring h-14 w-14 shrink-0 rounded-2xl object-cover shadow-lg ring-1"
          />
          <div className="-mt-1 flex flex-col items-center -space-y-[2px] text-center leading-none">
            <h1 className="wof-ce-title text-2xl font-bold leading-tight">
              Wheel of Fortune 4D
            </h1>
            <p className="wof-ce-subtitle text-[19px] font-semibold tracking-[0.06em]">
              Collector's Edition
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setShowInfoModal(true)}
          className="wof-ce-info-btn w-12 shrink-0 text-center text-xl text-gray-400"
          aria-label="How this calculator works"
        >
          ⓘ
        </button>
      </div>

      <div className="mb-6 grid grid-cols-2 gap-3">
        <div>
          <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-400">
            Bet (credits)
          </label>
          <DropdownSelect
            value={betCredits}
            onChange={setBetCredits}
            options={BET_CREDIT_OPTIONS.map((c) => ({
              value: c,
              label: String(c),
            }))}
            accentClass="wof-ce-accent-text"
            size="md"
            className="w-full"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-400">
            Denom
          </label>
          <DropdownSelect
            value={denom}
            onChange={setDenom}
            options={DENOM_OPTIONS.map((d) => ({ value: d, label: formatDenomLabel(d) }))}
            accentClass="wof-ce-accent-text"
            size="md"
            className="w-full"
          />
        </div>
      </div>

      <div className="mb-6 rounded-3xl bg-gray-900 p-4 sm:p-5">
        <h2 className="wof-ce-heading mb-4 text-lg font-semibold">Column prizes above reels</h2>
        <p className="mb-4 text-xs leading-relaxed text-gray-400">
          Enter the credit amount shown above each reel (same units as your bet line ... divide by bet credits for ×
          multiples).
        </p>
        <div className="space-y-4">
          {WOF_CE_REELS.map((reel) => {
            const prize = Number(prizeCredits[reel.key]) || 0
            const x = prizesX[reel.key] ?? 0
            const contribution = weightedContributionX(prizesX, reel.key)
            const soloThreshold = soloReelThresholdX(reel.key)
            const sliderMax = Math.max(120, soloThreshold * 1.35, x * 1.1)
            const markerPct = markerPercent(0, sliderMax, soloThreshold)
            return (
              <div key={reel.key} className="rounded-2xl border border-gray-800 bg-gray-950/60 p-4">
                <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
                  <div>
                    <span className="text-sm font-bold" style={{ color: reel.color }}>
                      {reel.label} (Credits)
                    </span>
                    <span className="ml-2 text-xs text-gray-500">×{reel.multiplier} weight</span>
                  </div>
                  <div className="text-right text-xs tabular-nums text-gray-400">
                    <div>
                      {x.toFixed(1)}× bet · weighted {contribution.toFixed(2)}×
                    </div>
                  </div>
                </div>
                <div className="grid grid-cols-[1fr_auto] items-center gap-3">
                  <input
                    type="text"
                    inputMode="numeric"
                    className={`wof-ce-prize-input wof-ce-focus w-full rounded-xl border border-gray-700 bg-gray-900 px-3 py-2.5 text-base font-semibold tabular-nums text-white focus:outline-none focus:ring-2 ${reel.inputAccent}`}
                    value={prize || ''}
                    placeholder="0"
                    onChange={handlePrizeChange(reel.key)}
                  />
                  <div className="min-w-[4.5rem] text-right text-sm tabular-nums text-gray-300">
                    {prizeMultiple(prize, betCredits).toFixed(1)}×
                  </div>
                </div>
                <div className="relative mt-3">
                  <div className="relative mb-0.5 h-2.5" aria-hidden>
                    <div
                      className="wof-ce-reel-marker absolute bottom-0 -translate-x-1/2 text-[10px] leading-none"
                      style={{ left: `${markerPct}%` }}
                      title={`Solo ${reel.shortLabel} threshold ~${soloThreshold.toFixed(0)}×`}
                    >
                      ▼
                    </div>
                  </div>
                  <div className="relative h-2 rounded-full bg-gray-800">
                    <div
                      className="wof-ce-reel-progress absolute top-0 h-2 rounded-full"
                      style={{
                        width: `${Math.min(100, (x / sliderMax) * 100)}%`,
                        backgroundColor: reel.color,
                      }}
                    />
                  </div>
                </div>
                <div className="mt-1 text-[10px] text-gray-500">
                  Solo {reel.shortLabel} weighted threshold ~{soloThreshold.toFixed(0)}× (
                  {soloThreshold * betCredits > 0
                    ? `${Math.round(soloThreshold * betCredits).toLocaleString()} cr`
                    : '-'}{' '}
                  at this bet)
                </div>
              </div>
            )
          })}
        </div>
      </div>

      <div className="mb-6 rounded-3xl bg-gray-900 p-6">
        <div className="mb-5 flex items-center justify-between gap-3">
          <h2 className="wof-ce-heading text-xl font-semibold">Weighted threshold</h2>
          <div className={`text-lg font-bold tabular-nums ${playValueClass(weightedPlay)}`}>
            {weightedX.toFixed(2)}× / {WEIGHTED_THRESHOLD_X}×
          </div>
        </div>

        <div className="rounded-2xl bg-gray-800 p-5">
          <div className="text-sm text-gray-400">Adjusted column sum</div>
          <div className={`text-4xl font-bold tabular-nums ${playValueClass(weightedPlay)}`}>
            {weightedX.toFixed(2)}×
          </div>
          <div className="text-sm text-gray-300">
            {Math.round(weightedX * betCredits).toLocaleString()} cr weighted · {betCredits} cr bet
          </div>
          <div className="mt-2 text-xs leading-relaxed text-gray-400">
            R1×0.7 + R2×0.9 + R3×0.5 + R4×1.0 + R5×0.33 ≥ {WEIGHTED_THRESHOLD_X}× bet
          </div>
          {weightedPlay === 'plus-ev' ? (
            <div className="wof-ce-accent-soft mt-3 text-sm">
              +{edgeX.toFixed(2)}× above threshold (
              {Math.round(weightedEdgeCredits(weightedX, betCredits)).toLocaleString()} cr)
            </div>
          ) : null}
        </div>

        <div className="mt-4 h-2 overflow-hidden rounded-full bg-gray-800">
          <div
            className={`h-full ${weightedPlay === 'plus-ev' ? 'wof-ce-progress-bar' : weightedPlay === 'marginal' ? 'bg-amber-500' : 'bg-red-500/80'}`}
            style={{ width: `${Math.min(100, thresholdProgress)}%` }}
          />
        </div>

        <div className={`mt-5 rounded-2xl p-4 text-center font-bold ${verdictPillClass(weightedPlay)}`}>
          {verdictLabel(
            weightedPlay,
            '✓ PLAY - weighted threshold met',
            '~ Marginal - close to 45× weighted',
            '✗ Wait - below 45× weighted threshold',
          )}
        </div>
      </div>

      <BankrollRiskAdvisor
        supabaseClient={supabaseClient}
        playLabel="WoF 4D CE"
        playDetails={{
          betSize: totalBetUsd,
          betCredits,
          denom,
          wofCeWeightedX: weightedX,
          wofCePrizes: Object.fromEntries(
            WOF_CE_REELS.map((r) => [r.shortLabel, Number(prizeCredits[r.key]) || 0]),
          ),
        }}
        accentClass="wof-ce-accent-text"
        accentBtnClass="wof-ce-btn"
        cardClassName="bg-gray-900 p-6 rounded-3xl mb-6"
      />

      <CalculatorLogPlayButton
        calculatorSlug="wof-collectors-edition"
        prefillValues={{
          r1_prize: Number(prizeCredits.r1) || 0,
          r2_prize: Number(prizeCredits.r2) || 0,
          r3_prize: Number(prizeCredits.r3) || 0,
          r4_prize: Number(prizeCredits.r4) || 0,
          r5_prize: Number(prizeCredits.r5) || 0,
          bet_size: totalBetUsd,
          denom,
        }}
        onOpenLogbook={onOpenLogbook}
        logPlayLocked={logPlayLocked}
        onRequireSubscribe={onRequireSubscribe}
        playLogsRemaining={playLogsRemaining}
        freemiumUsageLoading={freemiumUsageLoading}
        accentBtnClass="wof-ce-btn"
      />

      <CalculatorDisclaimer />

      {showInfoModal ? (
        <div
          className="fixed inset-0 z-[120] flex items-center justify-center bg-black/70 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="wof-ce-info-title"
          onClick={() => setShowInfoModal(false)}
        >
          <div
            className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-3xl bg-gray-900 p-6 text-sm leading-relaxed text-gray-300"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="wof-ce-info-title" className="wof-ce-title mb-3 text-lg font-bold">
              How this calculator works
            </h2>
            <p className="mb-3">
              Each reel builds a persistent credit prize above the column. When a Collect lands, that column pays.
            </p>
            <p className="mb-3">
              For +EV, the <strong className="text-white">weighted sum</strong> must reach{' '}
              <strong className="text-white">45× your bet</strong>:
            </p>
            <p className="wof-ce-accent-soft mb-3 rounded-xl bg-gray-800 px-3 py-2 font-mono text-xs">
              (R1×0.7) + (R2×0.9) + (R3×0.5) + (R4×1.0) + (R5×0.33) ≥ 45×
            </p>
            <p className="mb-3">
              Multipliers reflect how often each column&apos;s prize is awarded relative to the others. Enter the
              same credit amounts shown on the glass; × multiples use your bet line in credits.
            </p>
            <button
              type="button"
              className="wof-ce-btn mt-5 w-full rounded-xl py-2.5 font-semibold text-white"
              onClick={() => setShowInfoModal(false)}
            >
              Got it
            </button>
          </div>
        </div>
      ) : null}
    </div>
  )
}
