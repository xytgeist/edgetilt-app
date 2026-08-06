import { useState } from 'react'
import { Info } from 'lucide-react'
import MoneyInputField from '../../components/MoneyInputField.jsx'
import { Z_APP_MODAL } from '../../constants/appZIndex.js'
import { formatMoneyInputValue, parseMoneyInputNumber } from '../../utils/moneyInputFormat.js'
import { triggerTapHapticLight } from '../../utils/tapHaptic.js'
import { fmtPoker$ } from '../poker-bankroll/pokerBankrollMath.js'
import { roundMoney } from './pokerStableMath.js'
import {
  STABLE_PRIMARY_BTN,
  STABLE_SURFACE_CARD,
  STABLE_SURFACE_DIVIDER,
  STABLE_TAB_ACTIVE,
} from './pokerStableUi.js'

function fmtPct(n) {
  if (n == null || !Number.isFinite(n)) return '—'
  const sign = n > 0 ? '+' : ''
  return `${sign}${n.toFixed(1)}%`
}

function pctToneClass(n) {
  if (n == null || !Number.isFinite(n) || n === 0) return 'text-zinc-200'
  return n > 0 ? 'text-emerald-300' : 'text-rose-300'
}

function HeroInfoSection({ title, children }) {
  return (
    <div className="border-t border-zinc-800 pt-3 first:border-t-0 first:pt-0">
      <div className="mb-1 text-xs font-bold uppercase tracking-wide text-zinc-400">{title}</div>
      <div className="space-y-2 text-sm leading-relaxed text-zinc-400">{children}</div>
    </div>
  )
}

/**
 * Backer Stable portfolio hero: liquid bankroll + portfolio value + metrics.
 */
export default function PokerStablePortfolioHero({
  metrics,
  hasProfile,
  saving = false,
  onDeposit,
  onWithdraw,
  onNeedsAttention,
  pendingCommitCount = 0,
}) {
  const [editing, setEditing] = useState(false)
  /** @type {'add' | 'remove'} */
  const [adjustDirection, setAdjustDirection] = useState('add')
  const [amountInput, setAmountInput] = useState('')
  const [newBalanceInput, setNewBalanceInput] = useState('')
  const [infoOpen, setInfoOpen] = useState(false)

  const m = metrics || {}
  const currentBalance = roundMoney(m.liquidBankroll ?? 0)
  const pendingHold = roundMoney(m.pendingHold ?? 0)
  const canRemove = Boolean(hasProfile) || currentBalance > 0

  function resetAdjustForm() {
    setAmountInput('')
    setNewBalanceInput(formatMoneyInputValue(String(currentBalance)))
    setAdjustDirection('add')
  }

  function openAdjustForm() {
    setEditing(true)
    resetAdjustForm()
  }

  function closeAdjustForm() {
    setEditing(false)
    setAmountInput('')
    setNewBalanceInput('')
    setAdjustDirection('add')
  }

  function syncNewBalanceFromAmount(nextAmount, direction = adjustDirection) {
    const amt = parseMoneyInputNumber(nextAmount)
    if (!Number.isFinite(amt) || amt <= 0) {
      setNewBalanceInput(formatMoneyInputValue(String(currentBalance)))
      return
    }
    const signed = direction === 'add' ? amt : -amt
    setNewBalanceInput(formatMoneyInputValue(String(roundMoney(currentBalance + signed))))
  }

  function onAmountChange(next) {
    setAmountInput(next)
    syncNewBalanceFromAmount(next)
  }

  function onNewBalanceChange(next) {
    setNewBalanceInput(next)
    const target = parseMoneyInputNumber(next)
    if (!Number.isFinite(target)) {
      if (next === '') setAmountInput('')
      return
    }
    const delta = roundMoney(target - currentBalance)
    if (delta === 0) {
      setAmountInput('')
      setAdjustDirection('add')
      return
    }
    if (delta > 0) {
      setAdjustDirection('add')
      setAmountInput(formatMoneyInputValue(String(delta)))
      return
    }
    setAdjustDirection('remove')
    setAmountInput(formatMoneyInputValue(String(Math.abs(delta))))
  }

  function onDirectionChange(direction) {
    setAdjustDirection(direction)
    syncNewBalanceFromAmount(amountInput, direction)
  }

  async function applyAdjust() {
    const target = parseMoneyInputNumber(newBalanceInput)
    if (!Number.isFinite(target) || target < 0) return
    const delta = roundMoney(target - currentBalance)
    if (delta === 0) {
      closeAdjustForm()
      return
    }
    if (delta > 0) {
      await onDeposit?.(delta)
    } else {
      await onWithdraw?.(Math.abs(delta))
    }
    closeAdjustForm()
  }

  const applyDisabled =
    saving ||
    !Number.isFinite(parseMoneyInputNumber(newBalanceInput)) ||
    parseMoneyInputNumber(newBalanceInput) < 0 ||
    roundMoney(parseMoneyInputNumber(newBalanceInput) - currentBalance) === 0

  return (
    <>
      <div
        data-poker-stable-portfolio-hero
        className={`relative mb-4 ${STABLE_SURFACE_CARD} px-5 py-4`}
      >
        <button
          type="button"
          onClick={() => {
            setInfoOpen(true)
            triggerTapHapticLight()
          }}
          className="absolute right-4 top-4 shrink-0 text-zinc-500 touch-manipulation active:text-zinc-300"
          aria-label="About portfolio metrics"
          data-poker-stable-portfolio-info-btn
        >
          <Info className="h-3.5 w-3.5" strokeWidth={2.25} aria-hidden />
        </button>

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
          <div className="mt-1 flex flex-wrap items-center justify-center gap-x-2 gap-y-0.5">
            <span className="text-3xl font-black tabular-nums text-white">
              {fmtPoker$(currentBalance)}
            </span>
            {!editing ? (
              <button
                type="button"
                onClick={openAdjustForm}
                className="rounded-full border border-zinc-600/80 bg-zinc-800/80 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-zinc-300 touch-manipulation active:bg-zinc-700"
                data-poker-stable-edit-btn
              >
                Edit
              </button>
            ) : null}
            {pendingHold > 0 ? (
              <span
                className="w-full text-xs font-semibold tabular-nums text-zinc-400"
                data-poker-stable-backing-pending-hold
              >
                ({fmtPoker$(-pendingHold)} pending)
              </span>
            ) : null}
          </div>
        </div>
        <div>
          <div className="text-[10px] font-bold uppercase tracking-wide text-zinc-500">
            Portfolio value
          </div>
          <div
            className="mt-1 text-3xl font-black tabular-nums text-cyan-300"
            data-poker-stable-portfolio-value
          >
            {fmtPoker$(m.portfolioValue ?? 0)}
          </div>
        </div>
      </div>

      {editing ? (
        <div className="mt-3 rounded-2xl border border-zinc-700/80 bg-zinc-900/50 p-3" data-poker-stable-adjust-bankroll>
          <div className="mb-2 text-sm font-bold text-white">Adjust bankroll</div>
          <p className="mb-3 text-xs text-zinc-400">
            Updates your backing bankroll balance only. Does not change stake performance metrics
            or Trend.
          </p>
          <div className="mb-3 flex gap-1 rounded-xl bg-zinc-800/80 p-1">
            <button
              type="button"
              onClick={() => onDirectionChange('add')}
              className={`flex-1 rounded-lg py-1.5 text-xs font-bold touch-manipulation ${
                adjustDirection === 'add' ? STABLE_TAB_ACTIVE : 'text-zinc-400'
              }`}
            >
              Add
            </button>
            <button
              type="button"
              disabled={!canRemove}
              onClick={() => onDirectionChange('remove')}
              className={`flex-1 rounded-lg py-1.5 text-xs font-bold touch-manipulation disabled:opacity-40 ${
                adjustDirection === 'remove' ? STABLE_TAB_ACTIVE : 'text-zinc-400'
              }`}
            >
              Remove
            </button>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            <MoneyInputField
              label="Add or remove"
              value={amountInput}
              onChange={onAmountChange}
              placeholder="Amount"
              compact
              className="min-w-0"
            />
            <MoneyInputField
              label="New balance"
              value={newBalanceInput}
              onChange={onNewBalanceChange}
              placeholder={formatMoneyInputValue(String(currentBalance))}
              compact
              className="min-w-0"
            />
          </div>
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              disabled={applyDisabled}
              onClick={() => void applyAdjust()}
              className={`flex-1 rounded-xl py-2.5 text-sm font-bold text-white disabled:opacity-50 ${STABLE_PRIMARY_BTN}`}
              data-poker-stable-primary-btn
            >
              Apply
            </button>
            <button
              type="button"
              onClick={closeAdjustForm}
              className="rounded-xl bg-zinc-800 px-4 py-2.5 text-sm font-semibold text-zinc-300"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : null}

      <div className={`mt-3 grid grid-cols-3 gap-2 border-t ${STABLE_SURFACE_DIVIDER} pt-3 text-center sm:grid-cols-6`}>
        <div>
          <div className="text-[10px] font-bold uppercase text-zinc-500">At risk</div>
          <div className="mt-0.5 text-sm font-bold tabular-nums text-zinc-200">
            {fmtPoker$(m.capitalAtRisk ?? 0)}
          </div>
        </div>
        <div>
          <div className="text-[10px] font-bold uppercase text-zinc-500">Stakes MTM</div>
          <div className="mt-0.5 text-sm font-bold tabular-nums text-zinc-200">
            {fmtPoker$(m.stakeValueMtm ?? 0)}
          </div>
        </div>
        <div>
          <div className="text-[10px] font-bold uppercase text-zinc-500">At-risk ROI</div>
          <div className={`mt-0.5 text-sm font-bold tabular-nums ${pctToneClass(m.atRiskReturnPct)}`}>
            {fmtPct(m.atRiskReturnPct)}
          </div>
        </div>
        <div>
          <div className="text-[10px] font-bold uppercase text-zinc-500">Horses</div>
          <div className="mt-0.5 text-sm font-bold tabular-nums text-zinc-200">
            {m.activeHorseCount ?? 0}
          </div>
        </div>
        <div>
          <div className="text-[10px] font-bold uppercase text-zinc-500">TWR</div>
          <div className={`mt-0.5 text-sm font-bold tabular-nums ${pctToneClass(m.twrPct)}`}>
            {fmtPct(m.twrPct)}
          </div>
        </div>
        <div>
          <div className="text-[10px] font-bold uppercase text-zinc-500">Realized P/L</div>
          <div className="mt-0.5 text-sm font-bold tabular-nums text-emerald-300">
            {fmtPoker$(m.realizedBackingPl ?? 0)}
          </div>
        </div>
      </div>
      </div>

      {infoOpen ? (
        <div
          className="fixed inset-0 flex items-end justify-center bg-black/75 px-4 pb-6 pt-10 backdrop-blur-sm sm:items-center sm:p-4"
          style={{ zIndex: Z_APP_MODAL }}
          onClick={() => setInfoOpen(false)}
        >
          <div
            data-poker-stable-portfolio-info-modal
            className="flex max-h-[min(85vh,640px)] w-full max-w-md flex-col rounded-3xl border border-zinc-700/50 bg-zinc-900"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex shrink-0 items-start justify-between gap-3 border-b border-zinc-800 px-5 py-4">
              <div>
                <h3 className="text-base font-bold leading-tight text-white">Portfolio card</h3>
                <p className="mt-1 text-xs text-zinc-500">Stable backing economics</p>
              </div>
              <button
                type="button"
                onClick={() => setInfoOpen(false)}
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-zinc-800 text-xs text-zinc-400 touch-manipulation active:bg-zinc-700"
                aria-label="Close"
              >
                ✕
              </button>
            </div>
            <div className="space-y-4 overflow-y-auto px-5 py-4">
              <HeroInfoSection title="Overview">
                <p>
                  This card tracks your <strong className="font-semibold text-zinc-300">Stable backing bankroll</strong>
                  ... separate from your personal Poker bankroll. Player settle credits still go to personal;
                  backer economics stay here.
                </p>
              </HeroInfoSection>

              <HeroInfoSection title="Top numbers">
                <p>
                  <strong className="font-semibold text-zinc-300">Backing bankroll</strong> ... manual
                  deposits/withdrawals ± settle/close-out economics, minus capital deployed on{' '}
                  <strong className="font-semibold text-zinc-300">accepted</strong> (active) stakes. Pending offers
                  do not reduce this number ... they show as a hold until the player accepts (e.g. (−$50,000 pending)).
                </p>
                <p>
                  <strong className="font-semibold text-zinc-300">Portfolio value</strong> ... backing bankroll plus
                  mark-to-market value of your active horse stakes.
                </p>
              </HeroInfoSection>

              <HeroInfoSection title="Adjust bankroll">
                <p>
                  Manual capital only. Updates backing bankroll balance. Does{' '}
                  <strong className="font-semibold text-zinc-300">not</strong> change At risk, Realized P/L, session
                  performance, or the Trend chart.
                </p>
                <p>
                  <strong className="font-semibold text-zinc-300">Add or remove</strong> and{' '}
                  <strong className="font-semibold text-zinc-300">New balance</strong> stay linked ... change one and
                  the other updates.
                </p>
              </HeroInfoSection>

              <HeroInfoSection title="Metrics">
                <p>
                  <strong className="font-semibold text-zinc-300">At risk</strong> ... your share of committed baseline
                  on open horses (baseline × action %).
                </p>
                <p>
                  <strong className="font-semibold text-zinc-300">At-risk ROI</strong> ... unrealized horse
                  performance (Stakes MTM minus At risk) ÷ current At risk. Shows — when nothing is deployed.
                </p>
                <p>
                  <strong className="font-semibold text-zinc-300">TWR</strong> ... time-weighted return on your manual
                  backing pool. Splits at each Edit adjust; horse performance $ inside each period. Not the same as At-risk
                  ROI.
                </p>
                <p>
                  <strong className="font-semibold text-zinc-300">Stakes MTM</strong> ... your action % of current horse
                  rolls (mark-to-market).
                </p>
                <p>
                  <strong className="font-semibold text-zinc-300">Horses</strong> ... count of active deals you back.
                </p>
                <p>
                  <strong className="font-semibold text-zinc-300">Realized P/L</strong> ... crystallized backing profit
                  from settle events (same timing as settle credits to this pool). Not session accrual.
                </p>
              </HeroInfoSection>

              <HeroInfoSection title="What moves what">
                <p>
                  <strong className="font-semibold text-zinc-300">Moves on sessions:</strong> Trend, TWR numerator.
                </p>
                <p>
                  <strong className="font-semibold text-zinc-300">Moves on open-horse MTM:</strong> At-risk ROI
                  (Stakes MTM − At risk).
                </p>
                <p>
                  <strong className="font-semibold text-zinc-300">Moves on settle sync:</strong> Realized P/L, backing
                  bankroll (settle credits).
                </p>
                <p>
                  <strong className="font-semibold text-zinc-300">Moves on Edit adjust:</strong> backing bankroll,
                  portfolio value, TWR period boundaries.
                </p>
                <p>
                  <strong className="font-semibold text-zinc-300">Moves on horse top-up / reduce:</strong> deal baseline,
                  At risk, Stakes MTM ... not manual pool edits.
                </p>
              </HeroInfoSection>
            </div>
          </div>
        </div>
      ) : null}
    </>
  )
}
