import { useState } from 'react'
import MoneyInputField from '../../components/MoneyInputField.jsx'
import { APP_MODAL_OVERLAY_CLASS, APP_MODAL_SHEET_PANEL_CLASS } from '../../constants/appZIndex.js'
import { parseMoneyInputNumber } from '../../utils/moneyInputFormat.js'
import { fmtPoker$ } from '../poker-bankroll/pokerBankrollMath.js'
import { computeDealMakeup, computeProfitAboveBaseline } from './pokerStableMath.js'

/**
 * Focused settle / end flow for stakee on Bankroll (periodic vs close).
 */
export default function PokerStableEndStakeSheet({
  deal,
  dealRoll = null,
  saving = false,
  onClose,
  onPeriodicSettle,
  onCloseStake,
  onError,
}) {
  const [rakebackTotal, setRakebackTotal] = useState('')

  if (!deal) return null

  const rollValue = dealRoll?.overall_bankroll ?? deal.starting_roll ?? deal.baseline_bankroll ?? 0
  const baseline = Number(deal.baseline_bankroll) || 0
  const profitUp = computeProfitAboveBaseline({ baseline_bankroll: baseline, roll: rollValue })
  const makeup = computeDealMakeup({ baseline_bankroll: baseline, roll: rollValue })
  const label = deal.label?.trim() || 'Cash backing'

  return (
    <div className={`${APP_MODAL_OVERLAY_CLASS} overflow-x-hidden`} onClick={onClose}>
      <div
        data-poker-stable-end-stake-sheet
        className={`relative z-10 w-full max-w-lg max-h-[90vh] overflow-y-auto ${APP_MODAL_SHEET_PANEL_CLASS}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between gap-3">
          <h3 className="text-lg font-bold text-white">End stake</h3>
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
          data-poker-stable-end-stake-summary
          className="mb-4 grid grid-cols-2 gap-2 rounded-2xl border border-zinc-700/80 bg-zinc-900/60 p-3 text-center"
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
          <div>
            <div className="text-[10px] font-bold uppercase tracking-wide text-zinc-500">Makeup</div>
            <div className="mt-1 text-base font-bold tabular-nums text-amber-300/90">
              {fmtPoker$(makeup)}
            </div>
          </div>
        </div>

        <p className="mb-3 text-xs leading-relaxed text-zinc-500">
          <span className="font-semibold text-zinc-400">Periodic settle</span> resets the stake roll
          to baseline, credits your personal bankroll with your share, and keeps the stake open for
          more sessions.
        </p>
        <p className="mb-4 text-xs leading-relaxed text-zinc-500">
          <span className="font-semibold text-zinc-400">Close stake</span> runs the same final
          accounting, then archives the stake and moves its sessions onto your personal timeline.
        </p>

        <MoneyInputField
          value={rakebackTotal}
          onChange={setRakebackTotal}
          placeholder="Rakeback total (optional)"
          focusRingClass="focus:ring-2 focus:ring-amber-500/40"
          className="mb-4"
        />

        <div className="space-y-2">
          <button
            type="button"
            disabled={saving}
            onClick={() => {
              onError?.('')
              void onPeriodicSettle?.(parseMoneyInputNumber(rakebackTotal) || 0)
            }}
            data-poker-stable-end-stake-periodic-btn
            className="w-full rounded-xl bg-emerald-600 py-3.5 text-base font-bold text-white touch-manipulation disabled:opacity-50"
          >
            {saving ? 'Saving…' : 'Periodic settle'}
          </button>
          <button
            type="button"
            disabled={saving}
            onClick={() => {
              onError?.('')
              void onCloseStake?.(parseMoneyInputNumber(rakebackTotal) || 0)
            }}
            data-poker-stable-end-stake-close-btn
            className="w-full rounded-xl bg-zinc-100 py-3.5 text-base font-bold text-zinc-900 touch-manipulation disabled:opacity-50"
          >
            {saving ? 'Saving…' : 'Close stake'}
          </button>
        </div>
      </div>
    </div>
  )
}
