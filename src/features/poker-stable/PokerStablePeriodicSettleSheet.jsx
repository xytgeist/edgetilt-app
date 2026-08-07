import { useEffect, useMemo, useState } from 'react'
import MoneyInputField from '../../components/MoneyInputField.jsx'
import { APP_MODAL_SHEET_PANEL_CLASS } from '../../constants/appZIndex.js'
import { parseMoneyInputNumber } from '../../utils/moneyInputFormat.js'
import { fmtPoker$ } from '../poker-bankroll/pokerBankrollMath.js'
import { STABLE_BACKER_BANKROLL_PHRASE } from './pokerStableBooksCopy.js'
import {
  computeDealMakeup,
  computeDealSettlement,
  computeProRataBackerShares,
  computeProfitAboveBaseline,
  maxStakeReductionAmount,
  roundMoney,
  dealTypeLabel,
} from './pokerStableMath.js'
import { dealHasMakeup, dealHasRakebackEnabled, dealStakeeDisplayName } from './pokerStableTerms.js'
import { sliceDisplayName } from './pokerStableApi.js'

/**
 * Viewer-facing settle payment phrases (before the roll-reset clause).
 * @param {{ isStakee: boolean, lines: object[], userId?: string | null, playerName: string, profilesById: object }} params
 */
function settlePayPhrases({ isStakee, lines, userId, playerName, profilesById }) {
  const phrases = []
  for (const line of lines || []) {
    const amount = roundMoney(line.total_owed)
    if (amount < 0.005) continue
    const slice = line.slice || {}
    if (isStakee) {
      const backerName = sliceDisplayName(slice, profilesById)
      phrases.push(
        line.direction === 'player_to_staker'
          ? `You pay ${backerName} ${fmtPoker$(amount)}`
          : `${backerName} pays you ${fmtPoker$(amount)}`,
      )
      continue
    }
    if (!userId || slice.staker_user_id !== userId) continue
    phrases.push(
      line.direction === 'player_to_staker'
        ? `${playerName} pays you ${fmtPoker$(amount)}`
        : `You pay ${playerName} ${fmtPoker$(amount)}`,
    )
  }
  return phrases
}

/**
 * Periodic settle review screen before the initiator confirms.
 */
export default function PokerStablePeriodicSettleSheet({
  deal,
  slices = [],
  dealRoll = null,
  profilesById = {},
  userId = null,
  saving = false,
  onClose,
  onConfirm,
  onError,
}) {
  const [rakebackTotal, setRakebackTotal] = useState('')
  const [reduceStake, setReduceStake] = useState(false)
  const [newBaselineInput, setNewBaselineInput] = useState('')

  useEffect(() => {
    setRakebackTotal('')
    setReduceStake(false)
    setNewBaselineInput('')
  }, [deal?.id])

  const rollValue = dealRoll?.overall_bankroll ?? deal?.starting_roll ?? deal?.baseline_bankroll ?? 0
  const baseline = Number(deal?.baseline_bankroll) || 0
  const rakebackAmount = parseMoneyInputNumber(rakebackTotal) || 0

  const newBaselineValue = parseMoneyInputNumber(newBaselineInput)
  const hasNewBaselineInput = String(newBaselineInput || '').trim().length > 0
  const newBaselineValid =
    hasNewBaselineInput && Number.isFinite(newBaselineValue) && newBaselineValue >= 0
  const reductionAmount =
    reduceStake && newBaselineValid
      ? roundMoney(Math.max(0, baseline - newBaselineValue))
      : 0

  const settlement = useMemo(
    () =>
      deal
        ? computeDealSettlement(
            { ...deal, baseline_bankroll: baseline, roll: rollValue },
            slices,
            rakebackAmount,
          )
        : { lines: [], player_net: 0 },
    [deal, slices, baseline, rollValue, rakebackAmount],
  )

  const reductionShares = useMemo(
    () => (reductionAmount > 0.005 ? computeProRataBackerShares(slices, reductionAmount) : []),
    [slices, reductionAmount],
  )

  if (!deal) return null

  const profitUp = computeProfitAboveBaseline({ baseline_bankroll: baseline, roll: rollValue })
  const makeup = computeDealMakeup({ baseline_bankroll: baseline, roll: rollValue })
  const label = deal.label?.trim() || dealTypeLabel(deal.deal_type)
  const showMakeup = dealHasMakeup(deal)
  const showRakeback = dealHasRakebackEnabled(slices, deal)
  const maxReduction = maxStakeReductionAmount(baseline, rollValue)
  const isStakee = Boolean(userId) && deal.stakee_user_id === userId
  const playerName = dealStakeeDisplayName(deal, profilesById) || 'Player'

  const newBaselineTooHigh =
    reduceStake && newBaselineValid && newBaselineValue >= baseline - 0.005
  const reductionTooLarge = reductionAmount > maxReduction + 0.005
  const reduceInputIncomplete = reduceStake && !newBaselineValid
  const reduceInvalid = reduceStake && (newBaselineTooHigh || reductionTooLarge || reduceInputIncomplete)

  const baselineAfterReduction =
    reduceStake && newBaselineValid && !newBaselineTooHigh
      ? roundMoney(newBaselineValue)
      : baseline

  const playerCredit = settlement.player_net
  const backerCredit = roundMoney(
    (settlement.lines || [])
      .filter((line) => line.slice?.staker_user_id === userId)
      .reduce(
        (sum, line) =>
          sum + (line.direction === 'player_to_staker' ? line.total_owed : -line.total_owed),
        0,
      ),
  )
  const heroCredit = isStakee ? playerCredit : backerCredit
  const heroLabel = isStakee
    ? 'Credit to personal bankroll'
    : `Credit to ${STABLE_BACKER_BANKROLL_PHRASE}`

  const payPhrases = settlePayPhrases({
    isStakee,
    lines: settlement.lines,
    userId,
    playerName,
    profilesById,
  })
  const resetClause = `Stake roll resets to ${fmtPoker$(baseline)}${
    reduceStake && reductionAmount > 0
      ? `, then reduces to ${fmtPoker$(baselineAfterReduction)}`
      : ''
  } and the stake stays open for more sessions.`
  const settleDetailLine =
    payPhrases.length > 0 ? `${payPhrases.join('. ')}. ${resetClause}` : resetClause

  return (
    <div
      className="fixed inset-0 z-[125] flex items-end justify-center overflow-x-hidden bg-black/70 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        data-poker-stable-periodic-settle-sheet
        className={`relative z-10 w-full max-w-lg max-h-[90vh] overflow-y-auto ${APP_MODAL_SHEET_PANEL_CLASS}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between gap-3">
          <h3 className="text-lg font-bold text-white">Periodic settle</h3>
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl px-3 py-1.5 text-sm font-semibold text-zinc-400 touch-manipulation"
          >
            Cancel
          </button>
        </div>

        <p className="mb-4 text-sm text-zinc-300">
          <span className="font-semibold text-white">{label}</span>
          {' · '}
          Roll {fmtPoker$(rollValue)} · Baseline {fmtPoker$(baseline)}
        </p>

        <div
          data-poker-stable-periodic-settle-summary
          className={`mb-4 grid gap-2 rounded-2xl border border-zinc-700/80 bg-zinc-900/60 p-3 text-center ${
            showMakeup ? 'grid-cols-2' : 'grid-cols-1'
          }`}
        >
          <div>
            <div className="text-[10px] font-bold uppercase tracking-wide text-zinc-500">
              Profit above baseline
            </div>
            <div
              className={`mt-1 text-base font-bold tabular-nums ${
                profitUp >= 0 ? 'text-emerald-400' : 'text-zinc-300'
              }`}
            >
              {fmtPoker$(profitUp)}
            </div>
          </div>
          {showMakeup ? (
            <div>
              <div className="text-[10px] font-bold uppercase tracking-wide text-zinc-500">Makeup</div>
              <div className="mt-1 text-base font-bold tabular-nums text-amber-300/90">
                {fmtPoker$(makeup)}
              </div>
            </div>
          ) : null}
        </div>

        <div className="mb-4 rounded-2xl border border-emerald-500/25 bg-emerald-950/30 p-3">
          <div className="text-[10px] font-bold uppercase tracking-wide text-emerald-300/80">
            {heroLabel}
          </div>
          <div
            className={`mt-1 text-xl font-black tabular-nums ${
              heroCredit >= 0 ? 'text-emerald-300' : 'text-rose-300'
            }`}
          >
            {heroCredit >= 0 ? '+' : ''}
            {fmtPoker$(heroCredit)}
          </div>
          <p
            className="mt-2 text-xs leading-relaxed text-zinc-500"
            data-poker-stable-periodic-settle-pay-line
          >
            {settleDetailLine}
          </p>
        </div>

        <div className="mb-4 rounded-2xl border border-zinc-700/80 bg-zinc-900/40 p-3">
          <label className="flex cursor-pointer items-start gap-3 touch-manipulation">
            <input
              type="checkbox"
              checked={reduceStake}
              onChange={(e) => {
                setReduceStake(e.target.checked)
                if (!e.target.checked) setNewBaselineInput('')
              }}
              className="mt-1 h-4 w-4 shrink-0 rounded border-zinc-600 bg-zinc-800 text-amber-500 focus:ring-amber-500/40"
            />
            <span>
              <span className="block text-sm font-semibold text-zinc-200">Reduce stake</span>
              <span className="mt-0.5 block text-xs leading-relaxed text-zinc-500">
                After settle, lower baseline and roll by the reduction amount. Each Edge
                backer&apos;s Stable backing bankroll is credited their action % share of that
                reduction (the inverse of a top-up).
              </span>
            </span>
          </label>

          {reduceStake && reductionAmount > 0.005 ? (
            <p className="mt-2 text-xs leading-relaxed text-zinc-300">
              Backers&apos; Stable backing bankrolls will be credited{' '}
              <span className="font-semibold tabular-nums text-white">{fmtPoker$(reductionAmount)}</span>{' '}
              total, split by action % (see below).
            </p>
          ) : reduceStake ? (
            <p className="mt-2 text-xs leading-relaxed text-zinc-500">
              Enter a new baseline below current {fmtPoker$(baseline)}. Backers are credited the
              reduction pro-rata to Stable backing bankroll.
            </p>
          ) : null}

          {reduceStake ? (
            <div className="mt-3 flex items-end gap-3">
              <div className="min-w-0 flex-1">
                <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-wide text-zinc-500">
                  New bankroll baseline
                </label>
                <MoneyInputField
                  value={newBaselineInput}
                  onChange={setNewBaselineInput}
                  placeholder={`Below ${fmtPoker$(baseline)}`}
                  focusRingClass="focus:ring-2 focus:ring-amber-500/40"
                />
              </div>
              {reductionAmount > 0.005 ? (
                <div className="shrink-0 pb-2 text-right">
                  <div className="text-[10px] font-bold uppercase tracking-wide text-zinc-500">
                    Reduction
                  </div>
                  <div className="mt-0.5 text-base font-bold tabular-nums text-white">
                    {fmtPoker$(reductionAmount)}
                  </div>
                </div>
              ) : null}
            </div>
          ) : null}

          {reduceStake && newBaselineTooHigh ? (
            <p className="mt-2 text-xs font-semibold text-rose-300">
              New baseline must be below {fmtPoker$(baseline)}.
            </p>
          ) : null}
          {reduceStake && !newBaselineTooHigh && reductionTooLarge ? (
            <p className="mt-2 text-xs font-semibold text-rose-300">
              Reduction cannot exceed {fmtPoker$(maxReduction)}.
            </p>
          ) : null}
          {reduceStake && reductionAmount > 0.005 && reductionShares.length ? (
            <div className="mt-2 rounded-xl border border-zinc-800 bg-zinc-900/50 px-3 py-2 text-xs text-zinc-400">
              {reductionShares.map((row) => (
                <div key={row.sliceId} className="flex justify-between gap-2 py-0.5">
                  <span>
                    {sliceDisplayName(
                      slices.find((s) => s.id === row.sliceId) || {},
                      profilesById,
                    )}
                  </span>
                  <span className="font-semibold tabular-nums text-white">
                    +{fmtPoker$(row.share)}
                  </span>
                </div>
              ))}
            </div>
          ) : null}
        </div>

        <p className="mb-4 text-xs leading-relaxed text-zinc-500">
          Backer slices settle together from profit above baseline
          {showRakeback ? ' and any rakeback you enter below' : ''}. Confirm when the numbers look
          right.
        </p>

        {showRakeback ? (
          <MoneyInputField
            value={rakebackTotal}
            onChange={setRakebackTotal}
            placeholder="Rakeback total (optional)"
            focusRingClass="focus:ring-2 focus:ring-amber-500/40"
            className="mb-4"
          />
        ) : null}

        <button
          type="button"
          disabled={saving || reduceInvalid}
          onClick={() => {
            onError?.('')
            if (reduceInvalid) {
              if (reduceInputIncomplete) {
                onError?.('Enter a new bankroll baseline.')
              } else if (newBaselineTooHigh) {
                onError?.(`New baseline must be below ${fmtPoker$(baseline)}.`)
              } else if (reductionTooLarge) {
                onError?.(`Reduction cannot exceed ${fmtPoker$(maxReduction)}.`)
              }
              return
            }
            void onConfirm?.(rakebackAmount, reductionAmount)
          }}
          data-poker-stable-periodic-settle-confirm-btn
          className="w-full rounded-xl bg-emerald-600 py-3.5 text-base font-bold text-white touch-manipulation disabled:opacity-50"
        >
          {saving ? 'Recording…' : 'Settle'}
        </button>
      </div>
    </div>
  )
}
