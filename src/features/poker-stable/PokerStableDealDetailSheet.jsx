import { useCallback, useEffect, useMemo, useState } from 'react'
import MoneyInputField from '../../components/MoneyInputField.jsx'
import { APP_MODAL_OVERLAY_CLASS, APP_MODAL_SHEET_PANEL_CLASS } from '../../constants/appZIndex.js'
import { parseMoneyInputNumber } from '../../utils/moneyInputFormat.js'
import { triggerTapHapticLight } from '../../utils/tapHaptic.js'
import { fmtPoker$ } from '../poker-bankroll/pokerBankrollMath.js'
import {
  createPaymentClaim,
  loadLatestSettlement,
  loadPaymentClaims,
  recordDealTopup,
  respondToPaymentClaim,
  settleBackingDeal,
  sliceDisplayName,
} from './pokerStableApi.js'
import {
  pokerStableSliceCardClass,
  pokerStableSliceTitleClass,
  pokerStableSliceToneAttr,
} from './pokerStableSliceTone.js'
import {
  computeDealMakeup,
  computeProfitAboveBaseline,
  computeSliceLedgerOwed,
  dealTypeLabel,
  isOngoingDealType,
} from './pokerStableMath.js'

/**
 * Deal detail: baseline, makeup, top-up, settle, ledger.
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
  const [rakebackTotal, setRakebackTotal] = useState('')
  const [settlement, setSettlement] = useState(null)
  const [settlementLines, setSettlementLines] = useState([])
  const [claims, setClaims] = useState([])
  const [claimAmounts, setClaimAmounts] = useState({})

  const isStakee = deal?.stakee_user_id === userId
  const rollValue = roll?.overall_bankroll ?? deal?.starting_roll ?? 0
  const baseline = deal?.baseline_bankroll ?? 0
  const makeup = computeDealMakeup({ baseline_bankroll: baseline, roll: rollValue })
  const profitUp = computeProfitAboveBaseline({ baseline_bankroll: baseline, roll: rollValue })

  const loadLedger = useCallback(async () => {
    if (!supabaseClient || !deal?.id) return
    const [{ settlement: st, lines }, { claims: cl }] = await Promise.all([
      loadLatestSettlement(supabaseClient, deal.id),
      loadPaymentClaims(supabaseClient, deal.id),
    ])
    setSettlement(st)
    setSettlementLines(lines || [])
    setClaims(cl || [])
  }, [supabaseClient, deal?.id])

  useEffect(() => {
    void loadLedger()
  }, [loadLedger])

  const linesBySlice = useMemo(() => {
    const map = {}
    for (const l of settlementLines) map[l.slice_id] = l
    return map
  }, [settlementLines])

  const claimsBySlice = useMemo(() => {
    const map = {}
    for (const c of claims) {
      if (!map[c.slice_id]) map[c.slice_id] = []
      map[c.slice_id].push(c)
    }
    return map
  }, [claims])

  async function onTopup() {
    if (!isStakee || !deal) return
    onSavingChange(true)
    onError('')
    try {
      const { error } = await recordDealTopup(supabaseClient, {
        dealId: deal.id,
        stakeeUserId: userId,
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

  async function onSettle() {
    if (!isStakee || !deal) return
    if (!window.confirm('Settle all slices? Roll resets to baseline and IOU lines are posted.')) return
    onSavingChange(true)
    onError('')
    try {
      const { error } = await settleBackingDeal(supabaseClient, {
        dealId: deal.id,
        stakeeUserId: userId,
        rakebackTotal: parseMoneyInputNumber(rakebackTotal) || 0,
      })
      if (error) throw error
      triggerTapHapticLight()
      await onRefresh()
      await loadLedger()
    } catch (e) {
      onError(e?.message || 'Settle failed.')
    } finally {
      onSavingChange(false)
    }
  }

  async function onClaim(sliceId, claimKind) {
    const amount = parseMoneyInputNumber(claimAmounts[sliceId])
    if (!Number.isFinite(amount) || amount <= 0) {
      onError('Enter a payment amount.')
      return
    }
    onSavingChange(true)
    onError('')
    try {
      const { error } = await createPaymentClaim(supabaseClient, {
        dealId: deal.id,
        sliceId,
        actorUserId: userId,
        amount,
        claimKind,
        settlementId: settlement?.id,
      })
      if (error) throw error
      setClaimAmounts((prev) => ({ ...prev, [sliceId]: '' }))
      triggerTapHapticLight()
      await loadLedger()
    } catch (e) {
      onError(e?.message || 'Could not log payment.')
    } finally {
      onSavingChange(false)
    }
  }

  async function onRespond(claimId, response) {
    onSavingChange(true)
    onError('')
    try {
      const { error } = await respondToPaymentClaim(supabaseClient, {
        claimId,
        responderUserId: userId,
        response,
      })
      if (error) throw error
      triggerTapHapticLight()
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

        <div className="mb-4 grid grid-cols-3 gap-2 rounded-2xl border border-amber-500/20 bg-amber-950/20 p-3 text-center">
          <div>
            <div className="text-[10px] font-semibold uppercase text-zinc-500">Baseline</div>
            <div className="mt-0.5 text-sm font-bold tabular-nums text-white">{fmtPoker$(baseline)}</div>
          </div>
          <div>
            <div className="text-[10px] font-semibold uppercase text-zinc-500">Roll</div>
            <div className="mt-0.5 text-sm font-bold tabular-nums text-white">{fmtPoker$(rollValue)}</div>
          </div>
          <div>
            <div className="text-[10px] font-semibold uppercase text-zinc-500">Makeup</div>
            <div className="mt-0.5 text-sm font-bold tabular-nums text-rose-400">{fmtPoker$(makeup)}</div>
          </div>
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
            const sliceClaims = claimsBySlice[slice.id] || []
            const stakerId = slice.staker_user_id
            const viewerIsPlayer = isStakee
            const viewerIsStaker = stakerId === userId
            const ledger =
              line && (viewerIsPlayer || viewerIsStaker)
                ? computeSliceLedgerOwed({
                    settleOwed: line.total_owed,
                    viewerUserId: userId,
                    playerUserId: deal.stakee_user_id,
                    stakerUserId: stakerId,
                    claims: sliceClaims,
                  })
                : null
            const pendingForMe = sliceClaims.filter(
              (c) => c.status === 'pending' && c.actor_user_id !== userId,
            )

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
                    Settled IOU: {fmtPoker$(line.total_owed)}
                    {ledger ? (
                      <span className="ml-2 text-amber-200">You show: {fmtPoker$(ledger.owed)}</span>
                    ) : null}
                  </div>
                ) : null}
                {ledger?.statusNotes?.length ? (
                  <p className="mt-1 text-[11px] text-cyan-300">{ledger.statusNotes.join(' · ')}</p>
                ) : null}

                {pendingForMe.map((c) => (
                  <div
                    key={c.id}
                    className="mt-2 flex flex-wrap items-center gap-2 rounded-xl bg-zinc-800/80 px-2 py-2"
                  >
                    <span className="text-xs text-zinc-300">
                      Claims {fmtPoker$(c.amount)} ({c.claim_kind.replace('_', ' ')})
                    </span>
                    <button
                      type="button"
                      disabled={saving}
                      onClick={() => void onRespond(c.id, 'confirmed')}
                      className="rounded-lg bg-emerald-700 px-2 py-1 text-xs font-bold text-white"
                    >
                      Confirm
                    </button>
                    <button
                      type="button"
                      disabled={saving}
                      onClick={() => void onRespond(c.id, 'disputed')}
                      className="rounded-lg bg-rose-900/80 px-2 py-1 text-xs font-bold text-rose-200"
                    >
                      Dispute
                    </button>
                  </div>
                ))}

                {settlement && (viewerIsPlayer || viewerIsStaker) && slice.counterparty_kind === 'user' ? (
                  <div className="mt-2 flex gap-2">
                    <MoneyInputField
                      compact
                      value={claimAmounts[slice.id] || ''}
                      onChange={(next) =>
                        setClaimAmounts((prev) => ({ ...prev, [slice.id]: next }))
                      }
                      placeholder="Payment"
                      focusRingClass="focus:ring-2 focus:ring-amber-500/40"
                      className="min-w-0 flex-1"
                    />
                    {viewerIsPlayer ? (
                      <button
                        type="button"
                        disabled={saving}
                        onClick={() => void onClaim(slice.id, 'payment_made')}
                        className="rounded-xl bg-zinc-700 px-3 text-xs font-bold text-white"
                      >
                        I paid
                      </button>
                    ) : (
                      <button
                        type="button"
                        disabled={saving}
                        onClick={() => void onClaim(slice.id, 'payment_received')}
                        className="rounded-xl bg-zinc-700 px-3 text-xs font-bold text-white"
                      >
                        Received
                      </button>
                    )}
                  </div>
                ) : null}
              </div>
            )
          })}
        </div>

        {isStakee && deal.status === 'active' && isOngoingDealType(deal.deal_type) ? (
          <>
            <h4 className="mb-2 text-[11px] font-bold uppercase tracking-wide text-zinc-500">
              Top-up stake
            </h4>
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
              Settle deal
            </h4>
            <p className="mb-2 text-xs text-zinc-500">
              Profit above baseline: {fmtPoker$(profitUp)} · all slices settle together.
            </p>
            <MoneyInputField
              value={rakebackTotal}
              onChange={setRakebackTotal}
              placeholder="Rakeback total"
              focusRingClass="focus:ring-2 focus:ring-amber-500/40"
              className="mb-3"
            />
            <button
              type="button"
              disabled={saving}
              onClick={() => void onSettle()}
              className="mb-2 w-full rounded-3xl bg-emerald-600 py-3 text-base font-bold text-white disabled:opacity-50"
            >
              Settle all slices
            </button>
          </>
        ) : null}

        {deal.status === 'settled' ? (
          <p className="text-center text-sm text-emerald-400">Deal settled · roll reset to baseline</p>
        ) : null}
      </div>
    </div>
  )
}
