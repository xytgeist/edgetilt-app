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
  BUFFALO_DIAMOND_VARIANTS,
  EXTREME_DENOM_OPTIONS,
  betLevelByKey,
  betLevelOptionsForVariant,
  betLevelDisplayLabel,
  defaultBetLevelKeyForVariant,
  DEFAULT_BET_LEVEL_KEY,
  defaultOverallRtpForVariant,
  effectiveBetSize,
  coupledBreakevenMap,
  totalPlayRtpPct,
  tierMeterContributionPct,
  playRtpVerdict,
  projectedAverageCaseEvBets,
  projectedMaxExposureDollars,
  projectedCoinInExpected,
  tierBonusTiming,
  markerPercent,
  clampMeter,
  resolveProfile,
  resolveTargetTier,
  playPathRtpPct,
  isCombinedPlusEvPlay,
  resolveComboCascade,
  isIndeterminateComboEv,
  targetBankedExcessFg,
  AVG_PAY_PER_BANKED_SPIN,
  DEFAULT_OVERALL_RTP,
  REFERENCE_OVERALL_RTP,
} from './buffaloDiamondCalc.js'

export default function BuffaloDiamond({ onBack, supabaseClient = null, onOpenLogbook = null, logPlayLocked = false, onRequireSubscribe = null, playLogsRemaining = null, freemiumUsageLoading = false }) {
  const [variantKey, setVariantKey] = useState('diamond')
  const [betLevelKey, setBetLevelKey] = useState(DEFAULT_BET_LEVEL_KEY)
  const [extremeDenom, setExtremeDenom] = useState(0.01)
  const [greenMeter, setGreenMeter] = useState(24)
  const [blueMeter, setBlueMeter] = useState(59)
  const [goldMeter, setGoldMeter] = useState(120)

  const [showAdvanced, setShowAdvanced] = useState(false)
  const [overallRtp, setOverallRtp] = useState(DEFAULT_OVERALL_RTP)
  const [overallRtpInput, setOverallRtpInput] = useState(String(DEFAULT_OVERALL_RTP))
  const [tierDecimals, setTierDecimals] = useState(() => ({ ...betLevelByKey(DEFAULT_BET_LEVEL_KEY).decimals }))
  const [showInfoModal, setShowInfoModal] = useState(false)

  const betLevel = useMemo(() => betLevelByKey(betLevelKey), [betLevelKey])
  const betSize = useMemo(
    () => effectiveBetSize(betLevel, variantKey, extremeDenom),
    [betLevel, variantKey, extremeDenom],
  )
  const betLevelLabel = useMemo(
    () => betLevelDisplayLabel(betLevel, variantKey, extremeDenom),
    [betLevel, variantKey, extremeDenom],
  )

  const betLevelOptions = useMemo(
    () => betLevelOptionsForVariant(variantKey, extremeDenom),
    [variantKey, extremeDenom],
  )

  useEffect(() => {
    const nextKey = defaultBetLevelKeyForVariant(variantKey)
    const level = betLevelByKey(nextKey)
    const nextRtp = defaultOverallRtpForVariant(variantKey, 0.01)
    queueMicrotask(() => {
      setBetLevelKey(nextKey)
      setTierDecimals({ ...level.decimals })
      if (variantKey === 'extreme') setExtremeDenom(0.01)
      setOverallRtp(nextRtp)
      setOverallRtpInput(String(nextRtp))
    })
  }, [variantKey])

  useEffect(() => {
    if (variantKey !== 'extreme') return
    const nextRtp = defaultOverallRtpForVariant('extreme', extremeDenom)
    queueMicrotask(() => {
      setOverallRtp(nextRtp)
      setOverallRtpInput(String(nextRtp))
    })
  }, [variantKey, extremeDenom])

  useEffect(() => {
    const level = betLevelByKey(betLevelKey)
    queueMicrotask(() => {
      setTierDecimals({ ...level.decimals })
    })
  }, [betLevelKey])

  const profile = useMemo(
    () => resolveProfile(betLevel, tierDecimals, overallRtp),
    [betLevel, tierDecimals, overallRtp],
  )

  const meterValues = useMemo(() => {
    const raw = { green: greenMeter, blue: blueMeter, gold: goldMeter }
    return Object.fromEntries(
      BUFFALO_DIAMOND_TIERS.map((tier) => [
        tier.key,
        clampMeter(raw[tier.key], tier.meterMin, tier.meterMax),
      ]),
    )
  }, [greenMeter, blueMeter, goldMeter])

  const breakevenMap = useMemo(() => coupledBreakevenMap(profile), [profile])

  const playRtpPct = useMemo(() => totalPlayRtpPct(meterValues, profile), [meterValues, profile])

  const bankedMeterRtpPct = useMemo(
    () =>
      BUFFALO_DIAMOND_TIERS.reduce(
        (sum, tier) => sum + tierMeterContributionPct(meterValues[tier.key], profile.decimals[tier.key]),
        0,
      ),
    [meterValues, profile.decimals],
  )

  const playTargetKey = useMemo(() => resolveTargetTier(meterValues, profile), [meterValues, profile])
  const playTargetTier = useMemo(
    () => BUFFALO_DIAMOND_TIERS.find((tier) => tier.key === playTargetKey) ?? BUFFALO_DIAMOND_TIERS[0],
    [playTargetKey],
  )
  const pathRtpPct = useMemo(() => playPathRtpPct(meterValues, profile), [meterValues, profile])
  const isCombinedPlay = useMemo(
    () => isCombinedPlusEvPlay(meterValues, profile),
    [meterValues, profile],
  )
  const comboCascade = useMemo(
    () => (isCombinedPlay ? resolveComboCascade(meterValues, profile) : null),
    [isCombinedPlay, meterValues, profile],
  )
  const comboEffectiveTier = useMemo(() => {
    if (!comboCascade) return playTargetTier
    return (
      BUFFALO_DIAMOND_TIERS.find((tier) => tier.key === comboCascade.effectiveTargetKey) ?? playTargetTier
    )
  }, [comboCascade, playTargetTier])
  const comboLowestTier = useMemo(() => {
    if (!comboCascade) return null
    return BUFFALO_DIAMOND_TIERS.find((tier) => tier.key === comboCascade.lowestKey) ?? null
  }, [comboCascade])
  const isIndeterminateCombo = useMemo(
    () => isIndeterminateComboEv(meterValues, profile),
    [meterValues, profile],
  )
  const comboProjectedExcessFg = useMemo(() => {
    if (!comboCascade?.escalated) return 0
    return targetBankedExcessFg(comboCascade.projectedMeters, profile, comboCascade.effectiveTargetKey)
  }, [comboCascade, profile])
  const targetExcessFg = useMemo(
    () => targetBankedExcessFg(meterValues, profile, playTargetKey),
    [meterValues, profile, playTargetKey],
  )
  const targetAvgPayPerFg = AVG_PAY_PER_BANKED_SPIN[playTargetKey]

  const verdict = useMemo(() => playRtpVerdict(playRtpPct), [playRtpPct])
  const evAvg = useMemo(
    () => projectedAverageCaseEvBets(meterValues, profile),
    [meterValues, profile],
  )
  const evAvgDollars = useMemo(
    () => (evAvg != null ? evAvg * betSize : null),
    [evAvg, betSize],
  )
  const coinInExpected = useMemo(
    () => projectedCoinInExpected(meterValues, profile, betSize),
    [meterValues, profile, betSize],
  )
  const tierTiming = useMemo(
    () => tierBonusTiming(meterValues, profile, betSize),
    [meterValues, profile, betSize],
  )
  const maxExpectedLoss = useMemo(
    () => projectedMaxExposureDollars(meterValues, profile, evAvg ?? 0, betSize),
    [meterValues, profile, evAvg, betSize],
  )
  const isAlreadyPositive = verdict === 'plus-ev'

  const tierAnalysis = useMemo(
    () =>
      BUFFALO_DIAMOND_TIERS.map((tier) => ({
        tier,
        current: meterValues[tier.key],
        playLine: breakevenMap[tier.key],
      })),
    [meterValues, breakevenMap],
  )

  const calculate = useCallback(() => {
    /* derived via useMemo */
  }, [])

  useEffect(() => {
    queueMicrotask(() => calculate())
  }, [calculate])

  const meterSetters = {
    green: setGreenMeter,
    blue: setBlueMeter,
    gold: setGoldMeter,
  }

  const beSummary = `${breakevenMap.green} / ${breakevenMap.blue} / ${breakevenMap.gold}`

  return (
    <div data-calc="buffalo-diamond" className="min-h-full pb-12">
      <div className="w-full px-0 pt-1">
        <div className="mb-6 flex items-center">
          <button
            type="button"
            onClick={onBack}
            className="-mt-1 mr-4 text-[52px] font-light leading-none text-violet-400 hover:text-violet-300 active:opacity-70"
          >
            ‹
          </button>
          <div className="flex flex-1 items-center justify-center gap-3">
            <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-2xl bg-gradient-to-br from-amber-500/90 via-violet-600/90 to-emerald-700/90 ring-1 ring-violet-900/40 shadow-md shadow-black/30">
              <img
                src={CALCULATOR_ICON_SRC['buffalo-diamond']}
                alt="Buffalo Diamond"
                className="h-full w-full object-cover object-center"
              />
            </div>
            <div className="-mt-1 flex flex-col items-center -space-y-[6px]">
              <h1 className="font-montserrat text-[24px] font-bold leading-none tracking-[-1px] text-violet-100 sm:text-[27px]">
                BUFFALO DIAMOND
              </h1>
              <p className="text-[17px] font-semibold tracking-[1px] text-violet-300/90">
                MULTIPLIER FG METERS
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setShowInfoModal(true)}
            className="w-12 shrink-0 text-center text-xl text-gray-400 hover:text-violet-300"
            aria-label="How this calculator works"
          >
            ⓘ
          </button>
        </div>

        <div className="mb-6 space-y-3 rounded-3xl bg-gray-900 p-5">
          <div>
            <label className="mb-1 block text-xs text-gray-400">Game</label>
            <div
              className="grid grid-cols-2 gap-1.5 rounded-2xl bg-gray-800 p-1"
              role="radiogroup"
              aria-label="Buffalo Diamond game variant"
            >
              {Object.values(BUFFALO_DIAMOND_VARIANTS).map((v) => (
                <button
                  key={v.key}
                  type="button"
                  role="radio"
                  aria-checked={variantKey === v.key}
                  onClick={() => setVariantKey(v.key)}
                  className={`touch-manipulation rounded-xl py-2.5 text-center text-sm font-semibold transition-colors ${
                    variantKey === v.key
                      ? 'bg-violet-600 text-white'
                      : 'text-gray-400 hover:text-gray-200'
                  }`}
                >
                  {v.label}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="mb-1 block text-xs text-gray-400">Bet level</label>
            <DropdownSelect
              value={betLevelKey}
              onChange={setBetLevelKey}
              options={betLevelOptions}
              accentClass="text-violet-400"
              size="lg"
            />
          </div>
          {variantKey === 'extreme' ? (
            <div>
              <label className="mb-1 block text-xs text-gray-400">Denomination</label>
              <DropdownSelect
                value={extremeDenom}
                onChange={(v) => setExtremeDenom(parseFloat(v))}
                options={EXTREME_DENOM_OPTIONS.map((d) => ({
                  value: d,
                  label: `$${formatDenomLabel(d)}`,
                }))}
                accentClass="text-violet-400"
                size="lg"
              />
            </div>
          ) : null}
          <p className="text-[11px] italic leading-relaxed text-gray-500">
            {variantKey === 'extreme' && extremeDenom >= 0.05
              ? `${betLevelLabel} bet (5× $0.01 Extreme level). Default RTP 90% at $0.05.`
              : `Tier multipliers for ${betLevelLabel}; default RTP ${REFERENCE_OVERALL_RTP}% at $0.01 / Diamond.`}
          </p>
        </div>

        <div className="mb-6 overflow-hidden rounded-3xl bg-gray-900">
          <button
            type="button"
            onClick={() => setShowAdvanced((v) => !v)}
            className="flex w-full touch-manipulation items-center justify-between p-4 text-left transition-colors hover:bg-gray-800"
            aria-expanded={showAdvanced}
          >
            <span className="text-base font-semibold text-white">Advanced Settings</span>
            <span className={`text-xl text-gray-400 transition-transform ${showAdvanced ? 'rotate-180' : ''}`} aria-hidden>
              ▼
            </span>
          </button>
          {showAdvanced ? (
            <div className="space-y-4 border-t border-gray-800 p-4 pt-4">
              <div>
                <label className="mb-1 block text-xs text-gray-400">RTP (%)</label>
                <input
                  type="text"
                  inputMode="decimal"
                  value={overallRtpInput}
                  onChange={(e) => {
                    const next = e.target.value.replace(/[^0-9.]/g, '')
                    setOverallRtpInput(next)
                    const parsed = parseFloat(next)
                    if (Number.isFinite(parsed) && parsed > 0 && parsed < 100) setOverallRtp(parsed)
                  }}
                  onBlur={() => {
                    const parsed = parseFloat(overallRtpInput)
                    const safe =
                      Number.isFinite(parsed) && parsed > 0 && parsed < 100 ? parsed : DEFAULT_OVERALL_RTP
                    setOverallRtp(safe)
                    setOverallRtpInput(String(safe))
                  }}
                  className="calc-field-lg h-14 w-full rounded-2xl border-0 bg-gray-800 px-3 text-center text-2xl font-bold leading-none text-white outline-none focus:ring-2 focus:ring-violet-500/25"
                />
                <p className="mt-1.5 text-[11px] italic leading-relaxed text-gray-500">
                  Overall paytable RTP (default {REFERENCE_OVERALL_RTP}%). Shifts grind base game ±1 pt per 1 pt vs{' '}
                  {REFERENCE_OVERALL_RTP}%; ▼ breakevens and Current EV update automatically.
                </p>
              </div>
              <p className="text-[11px] leading-relaxed text-amber-400/90">
                Unless you know what these indicate and have 100s of thousands of spins tabulated, don&apos;t change
                these settings.
              </p>
              {BUFFALO_DIAMOND_TIERS.map((tier) => (
                <div key={tier.key} className="rounded-xl bg-gray-800 p-3">
                  <label className={`mb-1 block text-[10px] uppercase tracking-wide ${tier.text}`}>
                    {tier.shortLabel} multiplier
                  </label>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={tierDecimals[tier.key]}
                    onChange={(e) => {
                      const parsed = parseFloat(e.target.value.replace(/[^0-9.]/g, ''))
                      if (Number.isFinite(parsed) && parsed > 0) {
                        setTierDecimals((prev) => ({ ...prev, [tier.key]: parsed }))
                      }
                    }}
                    className="w-full rounded-lg bg-gray-700 p-2 text-center text-sm font-bold text-white"
                  />
                </div>
              ))}
            </div>
          ) : null}
        </div>

        <div className="mb-6 space-y-0 rounded-3xl bg-gray-900 p-4">
          {tierAnalysis.map((row, i) => {
            const { tier, current, playLine } = row
            const bePct = markerPercent(tier.meterMin, tier.meterMax, playLine)
            return (
              <div key={tier.key} className={i > 0 ? '-mt-1.5' : ''}>
                <div className="mb-0 flex items-baseline justify-between leading-none">
                  <div className={`text-sm font-semibold ${tier.text}`}>{tier.label}</div>
                  <div className={`font-mono text-sm font-bold tabular-nums ${tier.text}`}>
                    <span>{current}</span>
                    <span className="font-semibold"> FG</span>
                  </div>
                </div>
                <div className="relative h-5 w-full" aria-hidden>
                  <div
                    className={`absolute top-0 -translate-x-1/2 whitespace-nowrap text-[9px] italic leading-none ${tier.text}`}
                    style={{ left: `${bePct}%` }}
                    title={`Coupled breakeven (${playLine}) with other meters at reset`}
                  >
                    {playLine}
                  </div>
                  <div
                    className={`absolute top-[9px] -translate-x-1/2 text-[8px] leading-none ${tier.text}`}
                    style={{ left: `${bePct}%` }}
                  >
                    ▼
                  </div>
                </div>
                <input
                  type="range"
                  min={tier.meterMin}
                  max={tier.meterMax}
                  value={current}
                  onChange={(e) => {
                    const setter = meterSetters[tier.key]
                    setter(clampMeter(Number(e.target.value), tier.meterMin, tier.meterMax))
                  }}
                  className={`range-touch-target relative z-10 w-full ${tier.sliderAccent}`}
                />
              </div>
            )
          })}
          <div className="pt-1 text-[10px] italic leading-snug text-gray-400">
            ▼ = coupled breakeven at {betLevelLabel}, {overallRtp}% RTP (default {beSummary} @ {REFERENCE_OVERALL_RTP}% on
            this profile).
          </div>
        </div>

        {/* Current EV */}
        <div className="mb-6 rounded-3xl bg-gray-900 p-6">
          <div className="mb-5 flex items-center justify-between">
            <h2 className="text-xl font-semibold text-violet-400">Current EV</h2>
            <div className={`text-lg font-bold ${playRtpPct >= 100 ? 'text-emerald-400' : 'text-red-400'}`}>
              {playRtpPct.toFixed(1)}% RTP
            </div>
          </div>

          <div className="rounded-2xl bg-gray-800 p-5">
            <div className="text-sm text-gray-400">Average Case (Projected Session)</div>
            {isIndeterminateCombo ? (
              <p className="mt-2 text-sm font-medium leading-snug text-emerald-400">
                +EV snapshot: banked edge spread on all tiers; no ▼ chase or escalation path yet.
              </p>
            ) : evAvg != null && evAvg >= 0 ? (
              <>
                <div className="text-4xl font-bold tabular-nums text-emerald-400">{evAvg.toFixed(1)}×</div>
                <div className="text-sm text-gray-300">${evAvgDollars.toFixed(2)}</div>
              </>
            ) : (
              <div className="text-4xl font-bold text-red-400">No Play</div>
            )}
            {isCombinedPlay ? (
              <p className="mt-2 text-[11px] italic leading-relaxed text-gray-400">
                Snapshot shows +EV, but variance on combo plays is massive. We suggest stopping after your first
                meter hit.
              </p>
            ) : null}
            <p className="mt-3 text-[11px] leading-relaxed text-gray-500">
              Machine snapshot: {profile.baseGamePct.toFixed(1)}% grind + {bankedMeterRtpPct.toFixed(1)}% banked (
              {meterValues.green} / {meterValues.blue} / {meterValues.gold} FG) = {playRtpPct.toFixed(1)}% RTP.
              {isIndeterminateCombo
                ? ` Re-check when a tier crosses ▼ or cascade escalates.`
                : isCombinedPlay && comboCascade && comboLowestTier
                  ? comboCascade.escalated
                    ? ` Combo +EV: ${comboLowestTier.shortLabel} hits first (~${comboCascade.spinsToLowestHit.toLocaleString()} spins); ${comboEffectiveTier.shortLabel} crosses ▼ before then (~${comboProjectedExcessFg.toFixed(1)} FG above ▼ × ~${AVG_PAY_PER_BANKED_SPIN[comboCascade.effectiveTargetKey].toFixed(1)} bets/FG ≈ ${evAvg?.toFixed(1) ?? '-'}×). Coin-in ≈ cold spins to hit ${comboEffectiveTier.shortLabel}.`
                    : ` Combo +EV on snapshot.`
                  : pathRtpPct >= 100 && targetExcessFg > 0
                    ? ` Avg case on ${playTargetTier.shortLabel}: ${targetExcessFg} FG above ▼ × ~${targetAvgPayPerFg.toFixed(1)} bets/FG ≈ ${evAvg?.toFixed(1) ?? '-'}×. Coin-in ≈ cold spins to hit.`
                    : ` Path on ${playTargetTier.shortLabel} is ${pathRtpPct.toFixed(1)}% RTP (No Play).`}
            </p>
            <p className="mt-2 text-xs italic leading-relaxed text-gray-500">
              {BUFFALO_DIAMOND_VARIANTS[variantKey].label} · {betLevelLabel} · {overallRtp}% paytable RTP. Not a full
              session simulator; variance on 3×/4× chases is huge.
            </p>
          </div>

          {pathRtpPct >= 99 && coinInExpected > 0 ? (
            <div className="mt-4 grid grid-cols-2 gap-3">
              <div className="rounded-2xl bg-gray-800 p-4">
                <div className="text-xs text-gray-400">Coin-in Expected</div>
                <div className="text-2xl font-bold tabular-nums text-white">
                  ${Math.round(coinInExpected).toLocaleString()}
                </div>
                <p className="mt-1 text-[10px] leading-snug text-gray-500">
                  {isCombinedPlay && comboCascade?.escalated
                    ? `Combo escalates to ${comboEffectiveTier.shortLabel}; coin-in ≈ cold spins to hit.`
                    : `Path coin-in ≈ cold spins to hit ${playTargetTier.shortLabel}.`}
                </p>
              </div>
              <div className="rounded-2xl bg-gray-800 p-4">
                <div className="text-xs text-gray-400">Potential Loss</div>
                <div className="text-2xl font-bold tabular-nums text-red-400">
                  -${Math.round(maxExpectedLoss).toLocaleString()}
                </div>
                <p className="mt-1 text-[10px] leading-snug text-gray-500">
                  Stressed grind @ 85% RTP minus avg-case target. Not a ceiling ... variance can run worse in extreme cases.
                </p>
              </div>
            </div>
          ) : null}

          <div className="mt-4 rounded-2xl bg-gray-800/60 p-4">
            <div className="mb-2 text-xs font-medium uppercase tracking-wide text-gray-500">
              Avg bonus timing (@ {betLevelLabel})
            </div>
            <div className="grid grid-cols-3 gap-2 text-center text-[10px]">
              {tierTiming.map(({ tier, spinsToBonusCold, spinsPerFgIncrement }) => (
                <div key={tier.key}>
                  <div className={`font-semibold ${tier.text}`}>{tier.shortLabel}</div>
                  <div className="mt-1 tabular-nums text-gray-300">
                    {spinsToBonusCold.toLocaleString()} spins to hit
                  </div>
                  <div className="tabular-nums text-gray-500">
                    {spinsPerFgIncrement.toFixed(1)} spins/+1 FG
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div
            className={`mt-6 rounded-2xl p-4 text-center font-bold ${isAlreadyPositive ? 'bg-emerald-900 text-emerald-300' : verdict === 'marginal' ? 'bg-violet-900 text-violet-300' : 'bg-red-900 text-red-300'}`}
          >
            {isAlreadyPositive ? (
              <>
                <span className="buffalo-diamond-check-emoji">✅ </span>
                <span className="buffalo-diamond-check-badge mr-1.5 inline-flex h-5 w-5 items-center justify-center rounded border-2 border-[#fff] text-xs font-black leading-none text-[#fff]">
                  ✓
                </span>
                {playRtpPct >= 110 ? 'PLAY Strong +EV' : 'PLAY +EV Expected'}
              </>
            ) : verdict === 'marginal' ? (
              '⚠️ Marginal ... close to +EV'
            ) : (
              '❌ Still -EV Keep Waiting'
            )}
          </div>
        </div>

        <BankrollRiskAdvisor
          supabaseClient={supabaseClient}
          maxExpectedLoss={pathRtpPct >= 99 ? maxExpectedLoss : 0}
          exposureLabel="Potential Loss"
          playLabel={`Buffalo Diamond (${BUFFALO_DIAMOND_VARIANTS[variantKey].label})`}
          playDetails={{
            betSize,
            currentRtpPct: playRtpPct,
            coinInExpected: pathRtpPct >= 99 ? Math.round(coinInExpected) : null,
            buffaloDiamondMeters: {
              Green: meterValues.green,
              Blue: meterValues.blue,
              Gold: meterValues.gold,
            },
          }}
          accentClass="text-violet-400"
          accentBtnClass="bg-violet-700 hover:bg-violet-600"
          cardClassName="mb-6 rounded-3xl bg-gray-900 p-6"
        />

        <CalculatorLogPlayButton
          calculatorSlug="buffalo-diamond"
          prefillValues={{
            green_fg: meterValues.green,
            blue_fg: meterValues.blue,
            gold_fg: meterValues.gold,
            bet_size: betSize,
            denom: variantKey === 'extreme' ? extremeDenom : 0.01,
            ...playLogCalcEvPrefill({
              currentRtpPct: playRtpPct,
              averageCaseMult: evAvg != null && evAvg >= 0 ? evAvg : null,
              betSize,
            }),
          }}
          onOpenLogbook={onOpenLogbook}
          logPlayLocked={logPlayLocked}
          onRequireSubscribe={onRequireSubscribe}
          playLogsRemaining={playLogsRemaining}
          freemiumUsageLoading={freemiumUsageLoading}
          accentBtnClass="bg-violet-700 hover:bg-violet-600"
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
            className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-3xl bg-gray-900 p-5 text-sm leading-relaxed text-gray-300 shadow-xl ring-1 ring-gray-700"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="buffalo-diamond-calc-info-title" className="mb-3 text-lg font-bold text-violet-300">
              How this calculator works
            </h2>
            <div className="space-y-4 text-[13px] leading-relaxed">
              <section>
                <h3 className="mb-1.5 font-semibold text-white">Snapshot RTP (header)</h3>
                <p>
                  Let{' '}
                  <span className="text-white">B</span> = base-game return % (main line + 1× feature, bet-level
                  profile). Let{' '}
                  <span className="text-white">FG<sub>i</sub></span> = live banked free-game count on tier{' '}
                  <span className="text-white">i</span> ∈ {'{green, blue, gold}'}, and{' '}
                  <span className="text-white">m<sub>i</sub></span> = that tier&apos;s RTP multiplier (Advanced
                  Settings). Banked contribution per tier is{' '}
                  <span className="text-white">FG<sub>i</sub> × m<sub>i</sub> × 100</span> percentage points.{' '}
                  <strong className="text-white">Current RTP</strong> is the static snapshot:
                </p>
                <p className="mt-2 rounded-xl bg-gray-800/80 px-3 py-2 font-mono text-[12px] text-violet-200">
                  RTP<sub>snap</sub> = B + Σ<sub>i</sub> (FG<sub>i</sub> × m<sub>i</sub> × 100)
                </p>
                <p className="mt-2">
                  Play is labeled +EV when{' '}
                  <span className="text-white">RTP<sub>snap</sub> ≥ 100%</span>. Profiles and ▼ lines are calibrated
                  at{' '}
                  <span className="text-white">{REFERENCE_OVERALL_RTP}%</span> overall paytable RTP for your bet level
                  (linear between $0.75 and $4.00 anchors). Changing RTP in Advanced shifts{' '}
                  <span className="text-white">B</span> ±1 pt per 1 pt vs {REFERENCE_OVERALL_RTP}% and recomputes ▼.
                </p>
              </section>

              <section>
                <h3 className="mb-1.5 font-semibold text-white">Why snapshot RTP is not per-spin return</h3>
                <p>
                  <span className="text-white">RTP<sub>snap</sub></span> values the{' '}
                  <em>current machine state</em>: grind return plus all banked meter equity priced at once. On each
                  actual spin you only realize ~<span className="text-white">B%</span> from base game (minus variance).
                  The banked terms are <em>latent</em> ... they pay only when that tier&apos;s wheel/bonus path hits and
                  awards those FG. You cannot cash out meter value every spin, and a 113% snapshot does{' '}
                  <strong className="text-white">not</strong> mean +13% return per coin-in spin. Realized session RTP
                  depends on which bonus fires, when meters reset, and chase variance (especially 3× / 4× tiers).
                </p>
              </section>

              <section>
                <h3 className="mb-1.5 font-semibold text-white">Coupled breakeven (▼)</h3>
                <p>
                  Each tier has a <strong className="text-white">coupled</strong> breakeven: other meters held at reset,
                  solve for the target tier FG where snapshot RTP equals 100%:
                </p>
                <p className="mt-2 rounded-xl bg-gray-800/80 px-3 py-2 font-mono text-[12px] text-violet-200">
                  B + Σ<sub>j≠t</sub> (FG<sub>reset,j</sub> × m<sub>j</sub> × 100) + (FG<sub>t</sub> × m<sub>t</sub> ×
                  100) = 100 ⇒ ▼<sub>t</sub>
                </p>
                <p className="mt-2">
                  When{' '}
                  <span className="text-white">FG<sub>t</sub> &gt; ▼<sub>t</sub></span>, tier{' '}
                  <span className="text-white">t</span> is a standalone +EV chase target (gold → blue → green priority
                  if multiple qualify).
                </p>
              </section>

              <section>
                <h3 className="mb-1.5 font-semibold text-white">Average case (projected session ×)</h3>
                <p>
                  Shown only when a priced chase path exists. For a target tier above ▼ at live meters:
                </p>
                <p className="mt-2 rounded-xl bg-gray-800/80 px-3 py-2 font-mono text-[12px] text-violet-200">
                  EV<sub>avg</sub> (bets) ≈ (FG<sub>t</sub> − ▼<sub>t</sub>) × AvgPay<sub>t</sub>
                </p>
                <p className="mt-2">
                  <span className="text-white">AvgPay<sub>t</sub></span> = empirical mean return per banked FG spin on
                  tier hit ($0.75 calibration). Expected coin-in ≈ cold-hit spins to that tier × bet (wheel frequency ×
                  tier rate, linear in bet). This is an average-case bonus capture model, not a full session simulator.
                </p>
              </section>

              <section>
                <h3 className="mb-1.5 font-semibold text-white">Combo +EV (no single tier above ▼)</h3>
                <p>
                  When <span className="text-white">RTP<sub>snap</sub> ≥ 100%</span> but every tier is below ▼, edge is
                  spread across meters. We SPI-project to the lowest in-play tier hit; if a higher tier crosses ▼ before
                  then, we escalate and price that chase at projected meters (same{' '}
                  <span className="text-white">EV<sub>avg</sub></span> formula). If no tier reaches ▼ on that path, we
                  show +EV on snapshot only ... session × is not modeled (combo variance is too path-dependent). We
                  suggest stopping after your first meter hit on combo setups.
                </p>
              </section>

              <section>
                <h3 className="mb-1.5 font-semibold text-white">Potential loss</h3>
                <p>
                  Stressed envelope: coin-in to the priced path × house edge at ~85% of paytable RTP, minus average-case
                  target win $. Not a hard ceiling ... cold runs on 3×/4× chases can exceed it.
                </p>
              </section>
            </div>
            <button
              type="button"
              onClick={() => setShowInfoModal(false)}
              className="mt-2 w-full rounded-xl bg-violet-700 py-3 font-semibold text-white hover:bg-violet-600"
            >
              Close
            </button>
          </div>
        </div>
      ) : null}
    </div>
  )
}
