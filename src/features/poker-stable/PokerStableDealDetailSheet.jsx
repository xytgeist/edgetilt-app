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
  loadPendingSettlementRequest,
  periodicSettleBackingDeal,
  recordDealTopup,
  recordDealReduction,
  respondToSettlementRequest,
  sliceDisplayName,
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
  computeProfitAboveBaseline,
  dealTypeLabel,
  maxStakeReductionAmount,
} from './pokerStableMath.js'
import {
  canProposeSettleStake,
  dealCanPeriodicSettle,
  dealHasMakeup,
} from './pokerStableTerms.js'
import { pokerStableViewerCanRespondToSettlement } from './pokerStableActivity.js'

/**
 * Deal detail: baseline, makeup, top-up, settle proposal, ledger history.
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
  const [reduceAmount, setReduceAmount] = useState('')
  const [settlement, setSettlement] = useState(null)
  const [settlementLines, setSettlementLines] = useState([])
  const [ledgerEntries, setLedgerEntries] = useState([])
  const [pendingRequest, setPendingRequest] = useState(null)
  const [periodicSettleOpen, setPeriodicSettleOpen] = useState(false)
  const [closeStakeOpen, setCloseStakeOpen] = useState(false)

  const isStakee = deal?.stakee_user_id === userId
  const hasProposal = Boolean(pendingRequest)
  const canProposeSettle = canProposeSettleStake(deal, slices, { userId, hasProposal })
  const showPeriodicSettle = canProposeSettle && dealCanPeriodicSettle(deal, roll)
  const canRespondToProposal = pokerStableViewerCanRespondToSettlement(pendingRequest, userId)
  const showMakeup = dealHasMakeup(deal)
  const rollValue = roll?.overall_bankroll ?? deal?.starting_roll ?? 0
  const baseline = deal?.baseline_bankroll ?? 0
  const makeup = computeDealMakeup({ baseline_bankroll: baseline, roll: rollValue })
  const profitUp = computeProfitAboveBaseline({ baseline_bankroll: baseline, roll: rollValue })
  const maxReduction = maxStakeReductionAmount(baseline, rollValue)

  const loadLedger = useCallback(async () => {
    if (!supabaseClient || !deal?.id) return
    const [
      { settlement: st, lines },
      { entries },
      { request },
    ] = await Promise.all([
      loadLatestSettlement(supabaseClient, deal.id),
      loadLedgerEntries(supabaseClient, deal.id),
      loadPendingSettlementRequest(supabaseClient, deal.id),
    ])
    setSettlement(st)
    setSettlementLines(lines || [])
    setLedgerEntries(entries || [])
    setPendingRequest(request)
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

  async function onTopup() {
    if (!isStakee || !deal) return
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
    if (!isStakee || !deal) return
    const amt = parseMoneyInputNumber(reduceAmount)
    if (!Number.isFinite(amt) || amt <= 0) {
      onError('Enter a reduction amount.')
      return
    }
    if (amt > maxReduction + 0.005) {
      onError(`Reduction cannot exceed ${fmtPoker$(maxReduction)}.`)
      return
    }
    onSavingChange(true)
    onError('')
    try {
      const { error } = await recordDealReduction(supabaseClient, {
        dealId: deal.id,
        amount: amt,
      })
      if (error) throw error
      setReduceAmount('')
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
      const { error, immediate, requestId } = await periodicSettleBackingDeal(supabaseClient, {
        dealId: deal.id,
        rakebackTotal: rakebackAmount,
        stakeReductionTotal: stakeReductionAmount,
      })
      if (error) throw error
      triggerTapHapticLight()
      setPeriodicSettleOpen(false)
      if (immediate) {
        await onRefresh()
      }
      await loadLedger()
      if (!immediate && requestId) {
        onError('')
      }
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
      const { error, immediate } = await closeBackingDeal(supabaseClient, {
        dealId: deal.id,
        rakebackTotal: rakebackAmount,
      })
      if (error) throw error
      triggerTapHapticLight()
      setCloseStakeOpen(false)
      if (immediate) {
        await onRefresh()
      }
      await loadLedger()
    } catch (e) {
      onError(e?.message || 'Close failed.')
    } finally {
      onSavingChange(false)
    }
  }

  async function onRespondProposal(response) {
    if (!pendingRequest || !canRespondToProposal) return
    onSavingChange(true)
    onError('')
    try {
      const { error, status } = await respondToSettlementRequest(supabaseClient, {
        requestId: pendingRequest.id,
        response,
      })
      if (error) throw error
      triggerTapHapticLight()
      if (status === 'accepted') {
        await onRefresh()
      }
      await loadLedger()
    } catch (e) {
      onError(e?.message || 'Could not respond.')
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

        {pendingRequest ? (
          <div className="mb-4 rounded-2xl border border-cyan-500/30 bg-cyan-950/20 p-3">
            <p className="text-sm font-semibold text-cyan-100">
              {pendingRequest.settle_kind === 'close'
                ? 'Close settlement awaiting confirmation'
                : 'Periodic settlement awaiting confirmation'}
            </p>
            <p className="mt-1 text-xs text-zinc-400">
              {canRespondToProposal
                ? 'Review the proposal and confirm or deny.'
                : 'Waiting for the other party to respond.'}
            </p>
            {canRespondToProposal ? (
              <div className="mt-3 flex gap-2">
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => void onRespondProposal('confirmed')}
                  className="flex-1 rounded-xl bg-emerald-600 py-2 text-sm font-bold text-white"
                >
                  Confirm
                </button>
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => void onRespondProposal('denied')}
                  className="flex-1 rounded-xl bg-zinc-800 py-2 text-sm font-bold text-rose-200"
                >
                  Deny
                </button>
              </div>
            ) : null}
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

        {isStakee && deal.status === 'active' ? (
          <>
            <h4 className="mb-2 text-[11px] font-bold uppercase tracking-wide text-zinc-500">
              Top-up stake
            </h4>
            <p className="mb-2 text-xs text-zinc-500">
              Increases baseline and roll. Edge backers are debited their action % share (pro-rata).
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

            <h4 className="mb-2 text-[11px] font-bold uppercase tracking-wide text-zinc-500">
              Reduce stake
            </h4>
            <p className="mb-2 text-xs text-zinc-500">
              Lowers baseline and roll (max {fmtPoker$(maxReduction)}). Backers credited pro-rata.
              For settle + reduce together, use periodic settle below.
            </p>
            <div className="mb-4 flex gap-2">
              <MoneyInputField
                value={reduceAmount}
                onChange={setReduceAmount}
                placeholder="Amount"
                focusRingClass="focus:ring-2 focus:ring-amber-500/40"
                className="min-w-0 flex-1"
              />
              <button
                type="button"
                disabled={saving}
                onClick={() => void onReduceStake()}
                className="rounded-2xl bg-zinc-700 px-4 text-sm font-bold text-white disabled:opacity-50"
              >
                Reduce
              </button>
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
                ? ' Periodic settle keeps the stake open; close ends it. Edge backers must confirm before it applies.'
                : ' Close ends the package. Edge backers must confirm before it applies.'}
            </p>
            {showPeriodicSettle ? (
              <button
                type="button"
                disabled={saving}
                onClick={() => setPeriodicSettleOpen(true)}
                className="mb-2 w-full rounded-3xl bg-emerald-600 py-3 text-base font-bold text-white disabled:opacity-50"
              >
                Propose periodic settle
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
              Propose close stake
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
