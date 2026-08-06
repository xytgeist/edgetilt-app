import { useCallback, useEffect, useMemo, useState } from 'react'
import MoneyInputField from '../../components/MoneyInputField.jsx'
import { APP_MODAL_OVERLAY_CLASS, APP_MODAL_SHEET_PANEL_CLASS } from '../../constants/appZIndex.js'
import { parseMoneyInputNumber } from '../../utils/moneyInputFormat.js'
import { triggerTapHapticLight } from '../../utils/tapHaptic.js'
import PokerBankrollChartsTab from '../poker-bankroll/PokerBankrollChartsTab.jsx'
import PokerBankrollOverview from '../poker-bankroll/PokerBankrollOverview.jsx'
import PokerBankrollTrendTab from '../poker-bankroll/PokerBankrollTrendTab.jsx'
import PokerLocationsTab from '../poker-bankroll/PokerLocationsTab.jsx'
import { fmtPoker$ } from '../poker-bankroll/pokerBankrollMath.js'
import {
  closeBackingDeal,
  loadLatestSettlement,
  loadLedgerEntries,
  loadPendingCommits,
  loadDealTopups,
  loadDealReductions,
  loadDealSettlements,
  periodicSettleBackingDeal,
  recordDealTopup,
  recordDealReduction,
  sliceDisplayName,
} from './pokerStableApi.js'
import PokerStableCommitSyncPanel from './PokerStableCommitSyncPanel.jsx'
import PokerStablePeriodicSettleSheet from './PokerStablePeriodicSettleSheet.jsx'
import PokerStableCloseStakeSheet from './PokerStableCloseStakeSheet.jsx'
import PokerStableDealOverviewPanel from './PokerStableDealOverviewPanel.jsx'
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
  SETTLE_BLOCKED_PENDING_COMMIT_MESSAGE,
  settleBlockedByPendingCommit,
  stakeeSkipsBackerCommitSync,
  userCanRecordDealEvent,
} from './pokerStableTerms.js'
import { STABLE_BACKER_BANKROLL_PHRASE } from './pokerStableBooksCopy.js'

import { STABLE_TAB_ACTIVE } from './pokerStableUi.js'

const DEAL_TABS = [
  { id: 'overview', label: 'OVERVIEW' },
  { id: 'details', label: 'DETAILS' },
  { id: 'trend', label: 'TREND' },
  { id: 'locations', label: 'LOCATIONS' },
  { id: 'charts', label: 'CHARTS' },
  { id: 'manage', label: 'MANAGE' },
]

/**
 * Fixed sheet height so Overview / Details / Trend / etc. do not resize the modal.
 * Docked to the bottom (overlay items-end); square bottom + tight safe-area padding so the
 * panel paints flush to the screen edge without growing the sheet taller.
 */
const DEAL_DETAIL_SHEET_HEIGHT_FIXED =
  'h-[min(92dvh,calc(100dvh-env(safe-area-inset-top,0px)-0.75rem))] !max-h-[min(92dvh,calc(100dvh-env(safe-area-inset-top,0px)-0.75rem))] overflow-hidden !overflow-y-hidden rounded-b-none !pb-[env(safe-area-inset-bottom,0px)]'

/** Player Bankroll Terms (manageOnly): height follows content, capped so tall manage content still scrolls. */
const DEAL_DETAIL_SHEET_HEIGHT_HUG =
  'h-auto max-h-[min(92dvh,calc(100dvh-env(safe-area-inset-top,0px)-0.75rem))] !max-h-[min(92dvh,calc(100dvh-env(safe-area-inset-top,0px)-0.75rem))] overflow-y-auto overscroll-contain rounded-b-none !pb-[env(safe-area-inset-bottom,0px)]'

/**
 * Deal detail: overview/history/analytics tabs + manage (top-up, settle, ledger).
 * @param {'full' | 'manageOnly'} [variant='full']
 *   `manageOnly` — player Bankroll Terms entry: Manage content only (no analytics tabs).
 *   Backer Stable horse detail must keep `full`.
 */
export default function PokerStableDealDetailSheet({
  supabaseClient,
  userId,
  deal,
  slices = [],
  roll,
  profilesById = {},
  sessions = [],
  topups: topupsProp = [],
  reductions: reductionsProp = [],
  settlements: settlementsProp = [],
  saving,
  onSavingChange,
  onClose,
  onRefresh,
  onError,
  onOpenPokerBankroll,
  variant = 'full',
}) {
  const manageOnly = variant === 'manageOnly'
  const [activeTab, setActiveTab] = useState(manageOnly ? 'manage' : 'overview')
  const [topupAmount, setTopupAmount] = useState('')
  const [reduceStake, setReduceStake] = useState(false)
  const [newBaselineInput, setNewBaselineInput] = useState('')
  const [settlement, setSettlement] = useState(null)
  const [settlementLines, setSettlementLines] = useState([])
  const [ledgerEntries, setLedgerEntries] = useState([])
  const [pendingCommits, setPendingCommits] = useState([])
  const [periodicSettleOpen, setPeriodicSettleOpen] = useState(false)
  const [closeStakeOpen, setCloseStakeOpen] = useState(false)
  const [dealTopups, setDealTopups] = useState(topupsProp)
  const [dealReductions, setDealReductions] = useState(reductionsProp)
  const [dealSettlements, setDealSettlements] = useState(settlementsProp)

  useEffect(() => {
    setActiveTab(manageOnly ? 'manage' : 'overview')
  }, [deal?.id, manageOnly])

  useEffect(() => {
    setDealTopups(topupsProp)
    setDealReductions(reductionsProp)
    setDealSettlements(settlementsProp)
  }, [deal?.id, topupsProp, reductionsProp, settlementsProp])

  useEffect(() => {
    if (!supabaseClient || !deal?.id) return
    if (topupsProp.length || reductionsProp.length || settlementsProp.length) return
    let cancelled = false
    void (async () => {
      const [{ topups }, { reductions }, { settlements }] = await Promise.all([
        loadDealTopups(supabaseClient, deal.id),
        loadDealReductions(supabaseClient, deal.id),
        loadDealSettlements(supabaseClient, deal.id),
      ])
      if (cancelled) return
      setDealTopups(topups || [])
      setDealReductions(reductions || [])
      setDealSettlements(settlements || [])
    })()
    return () => {
      cancelled = true
    }
  }, [supabaseClient, deal?.id, topupsProp.length, reductionsProp.length, settlementsProp.length])

  const completedSessions = useMemo(
    () => sessions.filter((s) => s.deal_id === deal?.id && s.status !== 'active'),
    [sessions, deal?.id],
  )

  const isStakee = deal?.stakee_user_id === userId
  const skipStakeeCommitSync = stakeeSkipsBackerCommitSync(deal, userId)
  const visiblePendingCommits = useMemo(
    () => (skipStakeeCommitSync ? [] : pendingCommits),
    [pendingCommits, skipStakeeCommitSync],
  )
  const canRecordEvents = userCanRecordDealEvent(deal, slices, userId)
  const canProposeSettleBase = canProposeSettleStake(deal, slices, { userId, hasProposal: false })
  const settleBlockedPending = settleBlockedByPendingCommit(pendingCommits, deal?.id)
  const canProposeSettle = canProposeSettleBase && !settleBlockedPending
  const showSettleSection = canProposeSettleBase
  const showPeriodicSettle = canProposeSettleBase && dealCanPeriodicSettle(deal, roll)
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
      onClose()
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
      onClose()
    } catch (e) {
      onError(e?.message || 'Close failed.')
    } finally {
      onSavingChange(false)
    }
  }

  if (!deal) return null

  return (
    <div className={`${APP_MODAL_OVERLAY_CLASS} overflow-x-hidden`} onClick={onClose}>
      <div
        data-poker-stable-sheet
        data-poker-stable-deal-detail
        data-poker-stable-deal-detail-variant={manageOnly ? 'manageOnly' : 'full'}
        className={`relative z-10 flex w-full max-w-lg flex-col ${
          manageOnly ? DEAL_DETAIL_SHEET_HEIGHT_HUG : DEAL_DETAIL_SHEET_HEIGHT_FIXED
        } ${APP_MODAL_SHEET_PANEL_CLASS}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex shrink-0 items-center justify-between gap-2">
          <div className="min-w-0">
            <h3 className="truncate text-lg font-bold text-white">{deal.label || 'Deal'}</h3>
            <p className="text-xs text-zinc-500">{dealTypeLabel(deal.deal_type)}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 rounded-xl px-3 py-1.5 text-sm font-semibold text-zinc-400 touch-manipulation"
          >
            Close
          </button>
        </div>

        {manageOnly ? null : (
          <div className="mb-4 -mx-1 flex shrink-0 gap-1 overflow-x-auto px-1 no-scrollbar">
            {DEAL_TABS.map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => {
                  setActiveTab(tab.id)
                  triggerTapHapticLight()
                }}
                className={`shrink-0 rounded-full px-3 py-2 text-[10px] font-bold tracking-wide touch-manipulation sm:px-4 sm:text-xs ${
                  activeTab === tab.id
                    ? STABLE_TAB_ACTIVE
                    : 'bg-zinc-800 text-zinc-400 active:bg-zinc-700'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        )}

        <div
          className={
            manageOnly
              ? 'min-h-0'
              : 'min-h-0 flex-1 overflow-y-auto overscroll-contain [-webkit-overflow-scrolling:touch]'
          }
        >
        {activeTab === 'overview' ? (
          <>
            {visiblePendingCommits.length && supabaseClient ? (
              <div className="space-y-3">
                {visiblePendingCommits.map((row) => (
                  <PokerStableCommitSyncPanel
                    key={row.commit_id}
                    variant="inline"
                    supabaseClient={supabaseClient}
                    userId={userId}
                    commitId={String(row.commit_id)}
                    saving={saving}
                    onSavingChange={onSavingChange}
                    onSynced={async () => {
                      await onRefresh()
                      await loadLedger()
                    }}
                    onError={onError}
                  />
                ))}
              </div>
            ) : null}
            <PokerStableDealOverviewPanel
              deal={deal}
              slices={slices}
              roll={roll}
              profilesById={profilesById}
              userId={userId}
              sessions={sessions}
              topups={dealTopups}
              reductions={dealReductions}
              settlements={dealSettlements}
              ledgerEntries={ledgerEntries}
              onOpenTrend={() => setActiveTab('trend')}
              canProposeSettle={showSettleSection}
              showPeriodicSettle={showPeriodicSettle}
              settleBlockedPending={settleBlockedPending}
              settleBlockedMessage={SETTLE_BLOCKED_PENDING_COMMIT_MESSAGE}
              saving={saving}
              profitUp={profitUp}
              onOpenPeriodicSettle={() => {
                if (settleBlockedPending) return
                setPeriodicSettleOpen(true)
              }}
              onOpenCloseStake={() => {
                if (settleBlockedPending) return
                setCloseStakeOpen(true)
              }}
            />
          </>
        ) : null}

        {activeTab === 'details' ? (
          <PokerBankrollOverview sessions={completedSessions} />
        ) : null}

        {activeTab === 'trend' ? (
          <PokerBankrollTrendTab
            sessions={completedSessions}
            initialBankroll={rollValue}
            metricContext={{ stakeScope: true }}
            tournamentSwaps={[]}
            userId={userId}
          />
        ) : null}

        {activeTab === 'locations' ? (
          <PokerLocationsTab sessions={completedSessions} loading={false} />
        ) : null}

        {activeTab === 'charts' ? (
          <PokerBankrollChartsTab sessions={completedSessions} />
        ) : null}

        {activeTab === 'manage' ? (
          <>
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

        {/* Player Terms manage sheet: history already covers settle/top-up lines on the stake card. */}
        {!manageOnly && myLedgerEntries.length ? (
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

        {/* Player Terms (manageOnly): no top-up/reduce ... settle + slices only. */}
        {canRecordEvents && !manageOnly ? (
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

        {showSettleSection ? (
          <>
            <h4 className="mb-2 text-[11px] font-bold uppercase tracking-wide text-zinc-500">
              Settle stake
            </h4>
            {settleBlockedPending ? (
              <p
                data-poker-stable-settle-blocked
                className="mb-2 border-l-2 border-amber-500/70 pl-3 text-xs leading-relaxed text-amber-100"
              >
                {SETTLE_BLOCKED_PENDING_COMMIT_MESSAGE}
              </p>
            ) : (
              <p className="mb-2 text-xs text-zinc-500">
                Profit above baseline: {fmtPoker$(profitUp)} · all slices settle together.
                {showPeriodicSettle
                  ? ' Recording periodic settle updates your books immediately; others sync when ready.'
                  : ' Recording close ends the stake; others sync when ready.'}
              </p>
            )}
            {showPeriodicSettle ? (
              <button
                type="button"
                disabled={saving || settleBlockedPending}
                onClick={() => setPeriodicSettleOpen(true)}
                className="mb-2 w-full rounded-3xl bg-emerald-600 py-3 text-base font-bold text-white disabled:opacity-50"
              >
                Periodic settlement
              </button>
            ) : null}
            <button
              type="button"
              disabled={saving || settleBlockedPending}
              onClick={() => setCloseStakeOpen(true)}
              className={`mb-2 w-full rounded-3xl py-3 text-base font-bold disabled:opacity-50 ${
                showPeriodicSettle
                  ? 'bg-zinc-800 text-zinc-100'
                  : 'bg-emerald-600 text-white'
              }`}
            >
              Close stake
            </button>
          </>
        ) : null}

        {deal.status === 'settled' ? (
          <p className="text-center text-sm text-emerald-400">Deal settled · roll reset to baseline</p>
        ) : null}
          </>
        ) : null}
        </div>
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
