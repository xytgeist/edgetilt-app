import { useState } from 'react'
import MoneyInputField from '../../components/MoneyInputField.jsx'
import { parseMoneyInputNumber } from '../../utils/moneyInputFormat.js'
import { fmtPoker$ } from '../poker-bankroll/pokerBankrollMath.js'

/**
 * Backer Stable portfolio hero: liquid bankroll + portfolio value + metrics.
 */
export default function PokerStablePortfolioHero({
  metrics,
  hasProfile,
  saving = false,
  onSetBankroll,
  onNeedsAttention,
  pendingCommitCount = 0,
}) {
  const [editing, setEditing] = useState(false)
  const [input, setInput] = useState('')

  const m = metrics || {}

  async function saveBankroll() {
    const amt = parseMoneyInputNumber(input)
    if (!Number.isFinite(amt) || amt < 0) return
    await onSetBankroll?.(amt)
    setEditing(false)
    setInput('')
  }

  return (
    <div
      data-poker-stable-portfolio-hero
      className="mb-4 rounded-3xl border-2 border-amber-500/30 bg-gradient-to-br from-amber-950/50 to-zinc-900/90 px-5 py-4"
    >
      {pendingCommitCount > 0 ? (
        <button
          type="button"
          onClick={onNeedsAttention}
          className="mb-3 w-full rounded-2xl border border-amber-400/40 bg-amber-500/15 px-3 py-2.5 text-left touch-manipulation"
        >
          <div className="text-sm font-bold text-amber-100">
            Needs your attention ({pendingCommitCount})
          </div>
          <div className="text-xs text-amber-200/80">Tap to review and commit updates</div>
        </button>
      ) : null}

      <div className="grid grid-cols-2 gap-3 text-center">
        <div>
          <div className="text-[10px] font-bold uppercase tracking-wide text-zinc-500">
            Backing bankroll
          </div>
          <div className="mt-1 text-2xl font-black tabular-nums text-white">
            {fmtPoker$(m.liquidBankroll ?? 0)}
          </div>
        </div>
        <div>
          <div className="text-[10px] font-bold uppercase tracking-wide text-zinc-500">
            Portfolio value
          </div>
          <div className="mt-1 text-2xl font-black tabular-nums text-amber-300">
            {fmtPoker$(m.portfolioValue ?? 0)}
          </div>
        </div>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2 border-t border-amber-500/15 pt-3 text-center sm:grid-cols-4">
        <div>
          <div className="text-[9px] font-bold uppercase text-zinc-500">At risk</div>
          <div className="mt-0.5 text-xs font-bold tabular-nums text-zinc-200">
            {fmtPoker$(m.capitalAtRisk ?? 0)}
          </div>
        </div>
        <div>
          <div className="text-[9px] font-bold uppercase text-zinc-500">Stakes MTM</div>
          <div className="mt-0.5 text-xs font-bold tabular-nums text-zinc-200">
            {fmtPoker$(m.stakeValueMtm ?? 0)}
          </div>
        </div>
        <div>
          <div className="text-[9px] font-bold uppercase text-zinc-500">Horses</div>
          <div className="mt-0.5 text-xs font-bold tabular-nums text-zinc-200">
            {m.activeHorseCount ?? 0}
          </div>
        </div>
        <div>
          <div className="text-[9px] font-bold uppercase text-zinc-500">Realized P/L</div>
          <div className="mt-0.5 text-xs font-bold tabular-nums text-emerald-300">
            {fmtPoker$(m.realizedBackingPl ?? 0)}
          </div>
        </div>
      </div>

      {editing ? (
        <div className="mt-3 flex gap-2">
          <MoneyInputField
            value={input}
            onChange={setInput}
            placeholder={hasProfile ? 'New balance' : 'Starting bankroll'}
            className="min-w-0 flex-1"
          />
          <button
            type="button"
            disabled={saving}
            onClick={() => void saveBankroll()}
            className="rounded-xl bg-amber-600 px-4 text-sm font-bold text-white disabled:opacity-50"
            data-poker-stable-primary-btn
          >
            Save
          </button>
          <button
            type="button"
            onClick={() => setEditing(false)}
            className="rounded-xl bg-zinc-800 px-3 text-sm font-semibold text-zinc-300"
          >
            Cancel
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => {
            setEditing(true)
            setInput(String(m.liquidBankroll ?? 0))
          }}
          className="mt-3 w-full rounded-xl bg-zinc-800/80 py-2 text-xs font-semibold text-zinc-300 touch-manipulation"
        >
          {hasProfile ? 'Update backing bankroll' : 'Set backing bankroll'}
        </button>
      )}
    </div>
  )
}
