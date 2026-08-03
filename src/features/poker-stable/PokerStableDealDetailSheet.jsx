import { useCallback, useEffect, useMemo, useState } from 'react'
import MoneyInputField from '../../components/MoneyInputField.jsx'
import { APP_MODAL_OVERLAY_CLASS, APP_MODAL_SHEET_PANEL_CLASS } from '../../constants/appZIndex.js'
import { parseMoneyInputNumber } from '../../utils/moneyInputFormat.js'
import { triggerTapHapticLight } from '../../utils/tapHaptic.js'
import { fmtPoker$ } from '../poker-bankroll/pokerBankrollMath.js'
import {
  closeBackingDeal,
  loadLatestSettlement,
  loadLedgerEntries,
  loadPendingCommits,
  periodicSettleBackingDeal,
  recordDealTopup,
  recordDealReduction,
  sliceDisplayName,
  syncDealCommit,
} from './pokerStableApi.js'
import PokerStablePeriodicSettleSheet from './PokerStablePeriodicSettleSheet.jsx'
import PokerStableCloseStakeSheet from './PokerStableCloseStakeSheet.jsx'
import {
  pokerStableSliceCardClass,
  pokerStableSliceTitleClass,
  pokerStableSliceToneAttr,
} from './pokerStableSliceTone.js'
import {
  computeDealMakeup,
  computeProRataBackerShares,
  computeProfitAboveBaseline,
  dealTypeLabel,
  maxStakeReductionAmount,
  roundMoney,
} from './pokerStableMath.js'
import {
  canProposeSettleStake,
  dealCanPeriodicSettle,
  dealHasMakeup,
  userCanRecordDealEvent,
} from './pokerStableTerms.js'
import { buildStakeDealHistoryEvents } from './pokerStableDealHistory.js'
import { pokerStableCommitSummaryLine } from './pokerStableActivity.js'
import { STABLE_BACKER_BANKROLL_PHRASE, stableCommitBooksPhrase } from './pokerStableBooksCopy.js'

/**
 * Deal detail: baseline, makeup, top-up, settle, sync commits, ledger history.
 */
export default function PokerStableDealDetailSheet({
  supabaseClient,
  userId,
  deal,
  slices = [],
  roll,
  profilesById = {},
  saving,
  onSavingChange,
  onClose,
  onRefresh,
  onError,
  onOpenPokerBankroll,
}) {
  const [topupAmount, setTopupAmount] = useState('')
  const [reduceStake, setReduceStake] = useState(false)
  const [newBaselineInput, setNewBaselineInput] = useState('')
  const [settlement, setSettlement] = useState(null)
  const [settlementLines, setSettlementLines] = useState([])
  const [ledgerEntries, setLedgerEntries] = useState([])
  const [pendingCommits, setPendingCommits] = useState([])
  const [periodicSettleOpen, setPeriodicSettleOpen] = useState(false)
  const [closeStakeOpen, setCloseStakeOpen] = useState(false)

  const isStakee = deal?.stakee_user_id === userId
  const canRecordEvents = userCanRecordDealEvent(deal, slices, userId)
  const canProposeSettle = canProposeSettleStake(deal, slices, { userId, hasProposal: false })
  const showPeriodicSettle = canProposeSettle && dealCanPeriodicSettle(deal, roll)
  const showMakeup = dealHasMakeup(deal)
  const rollValue = roll?.overall_bankroll ?? deal?.starting_roll ?? 0
  const baseline = deal?.baseline_bankroll ?? 0
  const makeup = computeDealMakeup({ baseline_bankroll: baseline, roll: rollValue })
  const profitUp = computeProfitAboveBaseline({ baseline_bankroll: baseline, roll: rollValue })
  const maxReduction = maxStakeReductionAmount(baseline, rollValue)

  const newBaselineValue = parseMoneyInputNumber(newBaselineInput)
  const hasNewBaselineInput = String(newBaselineInput || '').trim().length > 0
  const newBaselineValid =
    hasNewBaselineInput && Number.isFinite(newBaselineValue) && newBaselineValue >= 0
  const reductionAmount =
    reduceStake && newBaselineValid
      ? roundMoney(Math.max(0, baseline - newBaselineValue))
      : 0
  const newBaselineTooHigh =
    reduceStake && newBaselineValid && newBaselineValue >= baseline - 0.005
  const reductionTooLarge = reductionAmount > maxReduction + 0.005
  const reduceInputIncomplete = reduceStake && !newBaselineValid
  const reduceInvalid =
    reduceStake && (newBaselineTooHigh || reductionTooLarge || reduceInputIncomplete)

  const backerReductionShares = useMemo(
    () => computeProRataBackerShares(slices, reductionAmount),
    [slices, reductionAmount],
  )

  useEffect(() => {
    setReduceStake(false)
    setNewBaselineInput('')
  }, [deal?.id])

  const loadLedger = useCallback(async () => {
    if (!supabaseClient || !deal?.id) return
    const [{ settlement: st, lines }, { entries }, { commits }] = await Promise.all([
      loadLatestSettlement(supabaseClient, deal.id),
      loadLedgerEntries(supabaseClient, deal.id),
      loadPendingCommits(supabaseClient, deal.id),
    ])
    setSettlement(st)
    setSettlementLines(lines || [])
    setLedgerEntries(entries || [])
    setPendingCommits(commits || [])
  }, [supabaseClient, deal?.id])

  useEffect(() => {
    void loadLedger()
  }, [loadLedger])

  const linesBySlice = useMemo(() => {
    const map = {}
    for (const l of settlementLines) map[l.slice_id] = l
    return map
  }, [settlementLines])

  const myLedgerEntries = useMemo(
    () => ledgerEntries.filter((entry) => entry.user_id === userId),
    [ledgerEntries, userId],
  )

  const dealHistoryEvents = useMemo(
    () =>
      buildStakeDealHistoryEvents({
        deal,
        slices,
        profilesById,
        ledgerEntries,
        viewerUserId: userId,
      }).filter((event) => event.kind === 'offer' || event.kind === 'accept' || event.kind === 'decline'),
    [deal, slices, profilesById, ledgerEntries, userId],
  )

  async function onTopup() {
    if (!canRecordEvents || !deal) return
    onSavingChange(true)
    onError('')
    try {
      const { error } = await recordDealTopup(supabaseClient, {
        dealId: deal.id,
        amount: parseMoneyInputNumber(topupAmount),
      })
      if (error) throw error
      setTopupAmount('')
      triggerTapHapticLight()
      await onRefresh()
      await loadLedger()
    } catch (e) {
      onError(e?.message || 'Top-up failed.')
    } finally {
      onSavingChange(false)
    }
  }

  async function onReduceStake() {
    if (!canRecordEvents || !deal) return
    onError('')
    if (reduceInvalid) {
      if (reduceInputIncomplete) {
        onError('Enter a new bankroll baseline.')
      } else if (newBaselineTooHigh) {
        onError(`New baseline must be below ${fmtPoker$(baseline)}.`)
      } else if (reductionTooLarge) {
        onError(`Reduction cannot exceed ${fmtPoker$(maxReduction)}.`)
      }
      return
    }
    if (reductionAmount <= 0.005) {
      onError('Enter a new bankroll baseline below current.')
      return
    }
    onSavingChange(true)
    try {
      const { error } = await recordDealReduction(supabaseClient, {
        dealId: deal.id,
        amount: reductionAmount,
      })
      if (error) throw error
      setReduceStake(false)
      setNewBaselineInput('')
      triggerTapHapticLight()
      await onRefresh()
      await loadLedger()
    } catch (e) {
      onError(e?.message || 'Reduction failed.')
    } finally {
      onSavingChange(false)
    }
  }

  async function confirmPeriodicSettle(rakebackAmount, stakeReductionAmount = 0) {
    if (!canProposeSettle || !deal) return
    onSavingChange(true)
    onError('')
    try {
      const { error } = await periodicSettleBackingDeal(supabaseClient, {
        dealId: deal.id,
        rakebackTotal: rakebackAmount,
        stakeReductionTotal: stakeReductionAmount,
      })
      if (error) throw error
      triggerTapHapticLight()
      setPeriodicSettleOpen(false)
      await onRefresh()
      await loadLedger()
    } catch (e) {
      onError(e?.message || 'Settle failed.')
    } finally {
      onSavingChange(false)
    }
  }

  async function confirmCloseStake(rakebackAmount) {
    if (!canProposeSettle || !deal) return
    onSavingChange(true)
    onError('')
    try {
      const { error } = await closeBackingDeal(supabaseClient, {
        dealId: deal.id,
        rakebackTotal: rakebackAmount,
      })
      if (error) throw error
      triggerTapHapticLight()
      setCloseStakeOpen(false)
      await onRefresh()
      await loadLedger()
    } catch (e) {
      onError(e?.message || 'Close failed.')
    } finally {
      onSavingChange(false)
    }
  }

  async function onSyncCommit(commitId) {
    if (!commitId) return
    onSavingChange(true)
    onError('')
    try {
      const { error } = await syncDealCommit(supabaseClient, commitId)
      if (error) throw error
      triggerTapHapticLight()
      await onRefresh()
      await loadLedger()
    } catch (e) {
      onError(e?.message || 'Could not sync commit.')
    } finally {
      onSavingChange(false)
    }
  }

  if (!deal) return null

  return (
    <div className={`${APP_MODAL_OVERLAY_CLASS} overflow-x-hidden`} onClick={onClose}>
      <div
        data-poker-stable-sheet
        className={`relative z-10 w-full max-w-lg max-h-[92vh] overflow-y-auto ${APP_MODAL_SHEET_PANEL_CLASS}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h3 className="text-lg font-bold text-white">{deal.label || 'Deal'}</h3>
            <p className="text-xs text-zinc-500">{dealTypeLabel(deal.deal_type)}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl px-3 py-1.5 text-sm font-semibold text-zinc-400 touch-manipulation"
          >
            Close
          </button>
        </div>

        {pendingCommits.length ? (
          <div className="mb-4 rounded-2xl border border-amber-500/35 bg-amber-950/25 p-3">
            <p className="text-sm font-semibold text-amber-100">
              Out of sync with last commit ({pendingCommits.length})
            </p>
            <p className="mt-1 text-xs text-zinc-400">
              Another party recorded an update. Commit to sync your{' '}
              {stableCommitBooksPhrase(isStakee)}.
            </p>
            <div className="mt-3 space-y-2">
              {pendingCommits.map((row) => (
                <div
                  key={row.commit_id}
                  className="rounded-xl border border-zinc-800 bg-zinc-900/60 px-3 py-2"
                >
                  <p className="text-xs leading-relaxed text-zinc-300">
                    {pokerStableCommitSummaryLine(row)}
                  </p>
                  <button
                    type="button"
                    disabled={saving}
                    onClick={() => void onSyncCommit(row.commit_id)}
                    className="mt-2 w-full rounded-xl bg-emerald-600 py-2 text-sm font-bold text-white disabled:opacity-50"
                  >
                    Commit to my books
                  </button>
                </div>
              ))}
            </div>
          </div>
        ) : null}

        <div
          className={`mb-4 grid gap-2 rounded-2xl border border-amber-500/20 bg-amber-950/20 p-3 text-center ${
            showMakeup ? 'grid-cols-3' : 'grid-cols-2'
          }`}
        >
          <div>
            <div className="text-[10px] font-semibold uppercase text-zinc-500">Baseline</div>
            <div className="mt-0.5 text-sm font-bold tabular-nums text-white">{fmtPoker$(baseline)}</div>
          </div>
          <div>
            <div className="text-[10px] font-semibold uppercase text-zinc-500">Roll</div>
            <div className="mt-0.5 text-sm font-bold tabular-nums text-white">{fmtPoker$(rollValue)}</div>
          </div>
          {showMakeup ? (
            <div>
              <div className="text-[10px] font-semibold uppercase text-zinc-500">Makeup</div>
              <div className="mt-0.5 text-sm font-bold tabular-nums text-rose-400">{fmtPoker$(makeup)}</div>
            </div>
          ) : null}
        </div>

        {deal.lifetime_pl_display != null ? (
          <p className="mb-3 text-xs text-zinc-500">
            Lifetime P/L (display): {fmtPoker$(deal.lifetime_pl_display)}
          </p>
        ) : null}

        {isStakee && deal.status === 'active' && typeof onOpenPokerBankroll === 'function' ? (
          <button
            type="button"
            onClick={() => {
              triggerTapHapticLight()
              onOpenPokerBankroll(deal.id)
            }}
            className="mb-4 w-full rounded-2xl bg-amber-600/90 py-2.5 text-sm font-bold text-white touch-manipulation"
            data-poker-stable-primary-btn
          >
            Open Poker Bankroll (On Stake)
          </button>
        ) : null}

        <h4 className="mb-2 text-[11px] font-bold uppercase tracking-wide text-zinc-500">Slices</h4>
        <div className="mb-4 space-y-2">
          {slices.map((slice) => {
            const line = linesBySlice[slice.id]

            return (
              <div
                key={slice.id}
                data-poker-stable-slice-tone={pokerStableSliceToneAttr(slice.slice_index)}
                className={pokerStableSliceCardClass(slice.slice_index)}
              >
                <div className="mb-2 flex items-start justify-between gap-2">
                  <div>
                    <div className={`font-semibold ${pokerStableSliceTitleClass(slice.slice_index)}`}>
                      {sliceDisplayName(slice, profilesById)}
                    </div>
                    <div className="text-xs text-zinc-500">
                      {slice.action_pct}% ·{' '}
                      {slice.pricing_mode === 'markup'
                        ? `${slice.markup_rate}× markup`
                        : `${slice.player_profit_pct}% player split`}
                    </div>
                  </div>
                  <span className="text-[10px] font-bold uppercase text-zinc-500">{slice.status}</span>
                </div>
                {line ? (
                  <div className="mt-2 text-sm text-zinc-300">
                    Last settle slice: {fmtPoker$(line.total_owed)} ({line.direction.replace(/_/g, ' ')})
                  </div>
                ) : null}
              </div>
            )
          })}
        </div>

        {dealHistoryEvents.length ? (
          <>
            <h4 className="mb-2 text-[11px] font-bold uppercase tracking-wide text-zinc-500">
              Deal history
            </h4>
            <ul className="mb-4 space-y-2">
              {dealHistoryEvents.map((event) => {
                const eventDate = new Date(event.at).toLocaleDateString('en-US', {
                  weekday: 'short',
                  month: 'short',
                  day: 'numeric',
                  year: 'numeric',
                })
                return (
                  <li key={event.id} className="py-1 text-center">
                    <p
                      data-poker-stake-history-line
                      data-poker-stake-history-kind={event.kind}
                      className="text-sm italic leading-snug text-emerald-300/90"
                    >
                      {event.text}
                      <span className="not-italic opacity-70"> · {eventDate}</span>
                    </p>
                  </li>
                )
              })}
            </ul>
          </>
        ) : null}

        {myLedgerEntries.length ? (
          <>
            <h4 className="mb-2 text-[11px] font-bold uppercase tracking-wide text-zinc-500">
              Your ledger
            </h4>
            <div className="mb-4 space-y-2">
              {myLedgerEntries.slice(0, 8).map((entry) => (
                <div
                  key={entry.id}
                  className="rounded-xl border border-zinc-800 bg-zinc-900/60 px-3 py-2 text-xs leading-relaxed text-zinc-300"
                >
                  {entry.message}
                </div>
              ))}
            </div>
          </>
        ) : null}

        {canRecordEvents ? (
          <>
            <h4 className="mb-2 text-[11px] font-bold uppercase tracking-wide text-zinc-500">
              Top-up stake
            </h4>
            <p className="mb-2 text-xs text-zinc-500">
              Increases baseline and roll. Edge backers debit their action % share when they sync
              (yours updates when you record if you are a backer).
            </p>
            <div className="mb-4 flex gap-2">
              <MoneyInputField
                value={topupAmount}
                onChange={setTopupAmount}
                placeholder="Amount"
                focusRingClass="focus:ring-2 focus:ring-amber-500/40"
                className="min-w-0 flex-1"
              />
              <button
                type="button"
                disabled={saving}
                onClick={() => void onTopup()}
                data-poker-stable-primary-btn
                className="rounded-2xl bg-amber-600 px-4 text-sm font-bold text-white disabled:opacity-50"
              >
                Add
              </button>
            </div>

            <div
              data-poker-stable-reduce-stake-block
              className="mb-4 rounded-2xl border border-zinc-800 bg-zinc-900/40 p-3"
            >
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
                    Lowers baseline and roll by the reduction amount. Each Edge backer&apos;s{' '}
                    {STABLE_BACKER_BANKROLL_PHRASE.toLowerCase()} is credited their action % share
                    (the inverse of a top-up). For settle + reduce together, use periodic settle
                    below.
                  </span>
                </span>
              </label>

              {reduceStake && reductionAmount > 0.005 ? (
                <p className="mt-2 text-xs leading-relaxed text-cyan-200/90">
                  Backers&apos; Stable backing bankrolls will be credited{' '}
                  <span className="font-semibold tabular-nums">{fmtPoker$(reductionAmount)}</span>{' '}
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
                      <div className="mt-0.5 text-base font-bold tabular-nums text-cyan-200">
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
              {reduceStake && reductionAmount > 0.005 && backerReductionShares.length ? (
                <div className="mt-2 rounded-xl border border-zinc-800 bg-zinc-900/50 px-3 py-2 text-xs text-zinc-400">
                  {backerReductionShares.map((row) => (
                    <div key={row.sliceId} className="flex justify-between gap-2 py-0.5">
                      <span>
                        {sliceDisplayName(
                          slices.find((s) => s.id === row.sliceId) || {},
                          profilesById,
                        )}
                      </span>
                      <span className="font-semibold tabular-nums text-cyan-200">
                        +{fmtPoker$(row.share)}
                      </span>
                    </div>
                  ))}
                </div>
              ) : null}

              {reduceStake ? (
                <button
                  type="button"
                  disabled={saving || reduceInvalid}
                  onClick={() => void onReduceStake()}
                  data-poker-stable-reduce-stake-btn
                  className="mt-3 w-full rounded-xl bg-zinc-700 py-3 text-sm font-bold text-white touch-manipulation disabled:opacity-50"
                >
                  {saving ? 'Reducing…' : 'Confirm reduction'}
                </button>
              ) : null}
            </div>
          </>
        ) : null}

        {canProposeSettle ? (
          <>
            <h4 className="mb-2 text-[11px] font-bold uppercase tracking-wide text-zinc-500">
              Settle stake
            </h4>
            <p className="mb-2 text-xs text-zinc-500">
              Profit above baseline: {fmtPoker$(profitUp)} · all slices settle together.
              {showPeriodicSettle
                ? ' Recording periodic settle updates your books immediately; others sync when ready.'
                : ' Recording close ends the stake; others sync when ready.'}
            </p>
            {showPeriodicSettle ? (
              <button
                type="button"
                disabled={saving}
                onClick={() => setPeriodicSettleOpen(true)}
                className="mb-2 w-full rounded-3xl bg-emerald-600 py-3 text-base font-bold text-white disabled:opacity-50"
              >
                Record periodic settle
              </button>
            ) : null}
            <button
              type="button"
              disabled={saving}
              onClick={() => setCloseStakeOpen(true)}
              className={`mb-2 w-full rounded-3xl py-3 text-base font-bold disabled:opacity-50 ${
                showPeriodicSettle
                  ? 'bg-zinc-800 text-zinc-100'
                  : 'bg-emerald-600 text-white'
              }`}
            >
              Record close stake
            </button>
          </>
        ) : null}

        {deal.status === 'settled' ? (
          <p className="text-center text-sm text-emerald-400">Deal settled · roll reset to baseline</p>
        ) : null}
      </div>

      {periodicSettleOpen ? (
        <PokerStablePeriodicSettleSheet
          deal={deal}
          slices={slices}
          dealRoll={roll}
          profilesById={profilesById}
          saving={saving}
          onClose={() => setPeriodicSettleOpen(false)}
          onError={onError}
          onConfirm={(rakebackAmount, stakeReductionAmount) =>
            void confirmPeriodicSettle(rakebackAmount, stakeReductionAmount)
          }
        />
      ) : null}

      {closeStakeOpen ? (
        <PokerStableCloseStakeSheet
          deal={deal}
          slices={slices}
          dealRoll={roll}
          saving={saving}
          onClose={() => setCloseStakeOpen(false)}
          onError={onError}
          onConfirm={(rakebackAmount) => void confirmCloseStake(rakebackAmount)}
        />
      ) : null}
    </div>
  )
}
