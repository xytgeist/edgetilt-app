import { useEffect, useMemo, useState } from 'react'
import MoneyInputField from '../../components/MoneyInputField.jsx'
import { APP_MODAL_SHEET_PANEL_CLASS } from '../../constants/appZIndex.js'
import { parseMoneyInputNumber } from '../../utils/moneyInputFormat.js'
import { fmtPoker$ } from '../poker-bankroll/pokerBankrollMath.js'
import {
  computeDealMakeup,
  computeDealSettlement,
  computeProfitAboveBaseline,
  dealTypeLabel,
} from './pokerStableMath.js'
import { dealHasMakeup, dealHasRakebackEnabled } from './pokerStableTerms.js'

/**
 * Periodic settle review screen before the stakee confirms.
 */
export default function PokerStablePeriodicSettleSheet({
  deal,
  slices = [],
  dealRoll = null,
  saving = false,
  onClose,
  onConfirm,
  onError,
}) {
  const [rakebackTotal, setRakebackTotal] = useState('')

  useEffect(() => {
    setRakebackTotal('')
  }, [deal?.id])

  if (!deal) return null

  const rollValue = dealRoll?.overall_bankroll ?? deal.starting_roll ?? deal.baseline_bankroll ?? 0
  const baseline = Number(deal.baseline_bankroll) || 0
  const profitUp = computeProfitAboveBaseline({ baseline_bankroll: baseline, roll: rollValue })
  const makeup = computeDealMakeup({ baseline_bankroll: baseline, roll: rollValue })
  const label = deal.label?.trim() || dealTypeLabel(deal.deal_type)
  const showMakeup = dealHasMakeup(deal)
  const showRakeback = dealHasRakebackEnabled(slices, deal)
  const rakebackAmount = parseMoneyInputNumber(rakebackTotal) || 0

  const settlement = useMemo(
    () =>
      computeDealSettlement(
        { ...deal, baseline_bankroll: baseline, roll: rollValue },
        slices,
        rakebackAmount,
      ),
    [deal, slices, baseline, rollValue, rakebackAmount],
  )

  const playerCredit = settlement.player_net

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
            Credit to personal bankroll
          </div>
          <div
            className={`mt-1 text-xl font-black tabular-nums ${
              playerCredit >= 0 ? 'text-emerald-300' : 'text-rose-300'
            }`}
          >
            {playerCredit >= 0 ? '+' : ''}
            {fmtPoker$(playerCredit)}
          </div>
          <p className="mt-2 text-xs leading-relaxed text-zinc-500">
            Stake roll resets to {fmtPoker$(baseline)} and the stake stays open for more sessions.
          </p>
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
          disabled={saving}
          onClick={() => {
            onError?.('')
            void onConfirm?.(rakebackAmount)
          }}
          data-poker-stable-periodic-settle-confirm-btn
          className="w-full rounded-xl bg-emerald-600 py-3.5 text-base font-bold text-white touch-manipulation disabled:opacity-50"
        >
          {saving ? 'Settling…' : 'Confirm periodic settle'}
        </button>
      </div>
    </div>
  )
}
