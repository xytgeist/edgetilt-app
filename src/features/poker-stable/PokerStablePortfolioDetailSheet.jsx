import { useEffect, useState } from 'react'
import MoneyInputField from '../../components/MoneyInputField.jsx'
import { APP_MODAL_OVERLAY_CLASS } from '../../constants/appZIndex.js'
import { formatMoneyInputValue, parseMoneyInputNumber } from '../../utils/moneyInputFormat.js'
import { triggerTapHapticLight } from '../../utils/tapHaptic.js'
import { fmtPoker$ } from '../poker-bankroll/pokerBankrollMath.js'
import PokerStableLocationsTab from './PokerStableLocationsTab.jsx'
import PokerStableTrendTab from './PokerStableTrendTab.jsx'
import { roundMoney } from './pokerStableMath.js'
import { STABLE_PRIMARY_BTN, STABLE_TAB_ACTIVE } from './pokerStableUi.js'

const PORTFOLIO_TABS = [
  { id: 'overview', label: 'Overview' },
  { id: 'trend', label: 'Trend' },
  { id: 'locations', label: 'Locations' },
]

function fmtPct(n) {
  if (n == null || !Number.isFinite(n)) return '—'
  const sign = n > 0 ? '+' : ''
  return `${sign}${n.toFixed(1)}%`
}

function pctToneClass(n) {
  if (n == null || !Number.isFinite(n) || n === 0) return 'text-zinc-200'
  return n > 0 ? 'text-emerald-300' : 'text-rose-300'
}

/**
 * Portfolio detail sheet: Overview (metrics + adjust) / Trend / Locations.
 */
export default function PokerStablePortfolioDetailSheet({
  open,
  onClose,
  metrics,
  hasProfile = false,
  saving = false,
  onDeposit,
  onWithdraw,
  horseDeals = [],
  sessions = [],
  slicesByDeal = {},
  profilesById = {},
  userId,
  locationsDealId = null,
  onSelectLocationsDealId,
}) {
  const [tab, setTab] = useState('overview')
  /** @type {'add' | 'remove'} */
  const [adjustDirection, setAdjustDirection] = useState('add')
  const [amountInput, setAmountInput] = useState('')
  const [newBalanceInput, setNewBalanceInput] = useState('')

  const m = metrics || {}
  const currentBalance = roundMoney(m.liquidBankroll ?? 0)
  const pendingHold = roundMoney(m.pendingHold ?? 0)
  const canRemove = Boolean(hasProfile) || currentBalance > 0

  function resetAdjustForm(balance = currentBalance) {
    setAmountInput('')
    setNewBalanceInput(formatMoneyInputValue(String(balance)))
    setAdjustDirection('add')
  }

  useEffect(() => {
    if (!open) return
    setTab('overview')
    resetAdjustForm(roundMoney(metrics?.liquidBankroll ?? 0))
    // eslint-disable-next-line react-hooks/exhaustive-deps -- seed form once when sheet opens
  }, [open])

  if (!open) return null

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
      resetAdjustForm()
      return
    }
    if (delta > 0) {
      await onDeposit?.(delta)
    } else {
      await onWithdraw?.(Math.abs(delta))
    }
    resetAdjustForm()
  }

  const applyDisabled =
    saving ||
    newBalanceInput === '' ||
    !Number.isFinite(parseMoneyInputNumber(newBalanceInput)) ||
    parseMoneyInputNumber(newBalanceInput) < 0 ||
    roundMoney(parseMoneyInputNumber(newBalanceInput) - currentBalance) === 0

  return (
    <div
      className={`${APP_MODAL_OVERLAY_CLASS} z-[140]`}
      role="dialog"
      aria-modal="true"
      aria-labelledby="poker-stable-portfolio-detail-title"
      onClick={() => onClose?.()}
    >
      <div
        data-poker-stable-portfolio-detail
        data-poker-stable-sheet
        className="relative z-10 flex max-h-[min(92dvh,calc(100dvh-env(safe-area-inset-top,0px)-3rem))] w-full max-w-lg flex-col overflow-hidden rounded-t-3xl border-t border-zinc-700/50 bg-zinc-900 px-5 pt-5 pb-[calc(1.25rem+env(safe-area-inset-bottom,0px))]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mx-auto mb-3 h-1 w-10 shrink-0 rounded-full bg-zinc-600/70" aria-hidden />
        <div className="mb-3 flex shrink-0 items-start justify-between gap-3">
          <div className="min-w-0">
            <h2
              id="poker-stable-portfolio-detail-title"
              className="text-lg font-black tracking-tight text-white"
            >
              Backing portfolio
            </h2>
            <p className="mt-0.5 text-xs text-zinc-500">Liquid bankroll, performance, and venues</p>
          </div>
          <button
            type="button"
            onClick={() => onClose?.()}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-zinc-800 text-sm text-zinc-400 touch-manipulation active:bg-zinc-700"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        <div
          data-poker-stable-portfolio-detail-tabs
          className="mb-4 flex shrink-0 gap-1 rounded-2xl border border-zinc-800 bg-zinc-900/50 p-1"
        >
          {PORTFOLIO_TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => {
                setTab(t.id)
                if (t.id === 'overview') resetAdjustForm()
                triggerTapHapticLight()
              }}
              className={`flex-1 rounded-xl py-2 text-xs font-bold uppercase tracking-wide touch-manipulation ${
                tab === t.id ? STABLE_TAB_ACTIVE : 'text-zinc-400 active:text-zinc-200'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain [-webkit-overflow-scrolling:touch]">
          {tab === 'overview' ? (
            <div className="space-y-4 pb-2">
              <div className="grid grid-cols-2 gap-3 text-center">
                <div className="min-w-0">
                  <div className="text-[10px] font-bold uppercase tracking-wide text-zinc-500">
                    Backing bankroll
                  </div>
                  <div
                    data-poker-stable-backing-bankroll={currentBalance < 0 ? 'negative' : undefined}
                    className={`mt-1 text-3xl font-black tabular-nums tracking-tight ${
                      currentBalance < 0 ? 'text-rose-400' : 'text-white'
                    }`}
                  >
                    {fmtPoker$(currentBalance)}
                  </div>
                  {pendingHold > 0 ? (
                    <div
                      className="mt-1 text-xs font-semibold tabular-nums text-zinc-400"
                      data-poker-stable-backing-pending-hold
                    >
                      ({fmtPoker$(-pendingHold)} pending)
                    </div>
                  ) : null}
                </div>
                <div className="min-w-0">
                  <div className="text-[10px] font-bold uppercase tracking-wide text-zinc-500">
                    Portfolio value
                  </div>
                  <div
                    className="mt-1 text-3xl font-black tabular-nums tracking-tight text-cyan-300"
                    data-poker-stable-portfolio-value
                  >
                    {fmtPoker$(m.portfolioValue ?? 0)}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2 border-t border-zinc-800 pt-3 text-center sm:grid-cols-6">
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
                  <div
                    className={`mt-0.5 text-sm font-bold tabular-nums ${pctToneClass(m.atRiskReturnPct)}`}
                  >
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

              <div
                className="rounded-2xl border border-zinc-700/80 bg-zinc-900/50 p-3"
                data-poker-stable-adjust-bankroll
              >
                <div className="mb-2 text-sm font-bold text-white">Adjust bankroll</div>
                <p className="mb-3 text-xs text-zinc-400">
                  Add or remove from your liquid backing pool only. Does not change stake performance
                  metrics or Trend.
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
                <button
                  type="button"
                  disabled={applyDisabled}
                  onClick={() => void applyAdjust()}
                  className={`mt-3 w-full rounded-xl py-2.5 text-sm font-bold text-white disabled:opacity-50 ${STABLE_PRIMARY_BTN}`}
                  data-poker-stable-primary-btn
                >
                  Apply
                </button>
              </div>
            </div>
          ) : null}

          {tab === 'trend' ? (
            <PokerStableTrendTab
              horseDeals={horseDeals}
              sessions={sessions}
              slicesByDeal={slicesByDeal}
              profilesById={profilesById}
              userId={userId}
            />
          ) : null}

          {tab === 'locations' ? (
            <PokerStableLocationsTab
              sessions={sessions}
              horseDeals={horseDeals}
              slicesByDeal={slicesByDeal}
              profilesById={profilesById}
              userId={userId}
              selectedDealId={locationsDealId}
              onSelectDealId={onSelectLocationsDealId}
            />
          ) : null}
        </div>
      </div>
    </div>
  )
}
