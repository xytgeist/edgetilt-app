import { useEffect, useMemo, useState } from 'react'
import MoneyInputField from '../../components/MoneyInputField.jsx'
import { APP_MODAL_SHEET_PANEL_CLASS } from '../../constants/appZIndex.js'
import { parseMoneyInputNumber } from '../../utils/moneyInputFormat.js'
import { fmtPoker$ } from '../poker-bankroll/pokerBankrollMath.js'
import { dealTournamentBuyins } from './pokerStableBackerMath.js'
import { settlementBackerCredit, viewerBackingSlice } from './pokerStableDealHistory.js'
import {
  computeDealMakeup,
  computeDealSettlement,
  computeProfitAboveBaseline,
  dealTypeLabel,
  roundMoney,
  tournamentPlayerCloseEconomics,
} from './pokerStableMath.js'
import {
  attachSlicesToSettleLines,
  settlePayPhrases,
  tournamentCloseBackerReturnRows,
} from './pokerStableSettleReviewCopy.js'
import { dealHasMakeup, dealHasRakebackEnabled, dealStakeeDisplayName } from './pokerStableTerms.js'

/**
 * Close stake review before confirm.
 * Copy is viewer-aware: stakee (player) vs staker (backer).
 */
export default function PokerStableCloseStakeSheet({
  deal,
  slices = [],
  dealRoll = null,
  profilesById = {},
  sessions = [],
  supabaseClient = null,
  userId = null,
  saving = false,
  onClose,
  onConfirm,
  onError,
}) {
  const [rakebackTotal, setRakebackTotal] = useState('')
  const [fetchedBuyins, setFetchedBuyins] = useState(null)

  useEffect(() => {
    setRakebackTotal('')
  }, [deal?.id])

  useEffect(() => {
    let cancelled = false
    setFetchedBuyins(null)
    if (!deal?.id || deal.deal_type !== 'tournament_package') return undefined

    const fromSessions = (sessions || []).filter((s) => s?.deal_id === deal.id)
    if (fromSessions.length) {
      setFetchedBuyins(dealTournamentBuyins(fromSessions))
      return undefined
    }

    if (!supabaseClient) {
      setFetchedBuyins(0)
      return undefined
    }

    void (async () => {
      const { data, error } = await supabaseClient
        .from('poker_bankroll_sessions')
        .select('buy_in, rebuy_amount, addon_amount')
        .eq('deal_id', deal.id)
      if (cancelled) return
      if (error) {
        setFetchedBuyins(0)
        return
      }
      setFetchedBuyins(dealTournamentBuyins(data || []))
    })()

    return () => {
      cancelled = true
    }
  }, [deal?.id, deal?.deal_type, sessions, supabaseClient])

  const rollValue =
    dealRoll?.overall_bankroll ?? deal?.starting_roll ?? deal?.baseline_bankroll ?? 0
  const baseline = Number(deal?.baseline_bankroll) || 0
  const rakebackAmount = parseMoneyInputNumber(rakebackTotal) || 0
  const isTournamentPackage = deal?.deal_type === 'tournament_package'
  const isStakee = Boolean(deal?.stakee_user_id && userId && deal.stakee_user_id === userId)
  const showMakeup = deal ? dealHasMakeup(deal) : false
  const showRakeback = deal ? dealHasRakebackEnabled(slices, deal) : false
  const playerName = dealStakeeDisplayName(deal, profilesById) || 'Player'

  const settlement = useMemo(
    () =>
      deal
        ? computeDealSettlement(
            { ...deal, baseline_bankroll: baseline, roll: rollValue },
            slices,
            rakebackAmount,
          )
        : null,
    [deal, slices, baseline, rollValue, rakebackAmount],
  )

  const buyins = fetchedBuyins == null ? 0 : fetchedBuyins

  const tourneyClose = useMemo(
    () =>
      isTournamentPackage && deal
        ? tournamentPlayerCloseEconomics(
            { baseline_at_settle: baseline, roll_at_settle: rollValue },
            slices,
            deal,
            buyins,
          )
        : null,
    [isTournamentPackage, deal, baseline, rollValue, slices, buyins],
  )

  const backerReturnRows = useMemo(
    () =>
      isTournamentPackage && deal
        ? tournamentCloseBackerReturnRows(deal, slices, rollValue, buyins, profilesById)
        : [],
    [isTournamentPackage, deal, slices, rollValue, buyins, profilesById],
  )

  const mySlice = useMemo(
    () => (!isStakee && userId ? viewerBackingSlice(slices, userId) : null),
    [isStakee, userId, slices],
  )

  const myReturnRow = useMemo(() => {
    if (!mySlice?.id) return null
    return backerReturnRows.find((row) => row.sliceId === mySlice.id) || null
  }, [mySlice, backerReturnRows])

  const otherBackerRows = useMemo(() => {
    if (isStakee || !mySlice?.id) return backerReturnRows
    return backerReturnRows.filter((row) => row.sliceId !== mySlice.id)
  }, [isStakee, mySlice, backerReturnRows])

  const cashBackerPhrases = useMemo(() => {
    if (!deal || isTournamentPackage || !settlement) return []
    const lines = attachSlicesToSettleLines(settlement.lines || [], slices)
    return settlePayPhrases({
      isStakee,
      lines,
      userId,
      playerName: isStakee ? 'You' : playerName,
      profilesById,
      isClose: true,
      baseline,
      roll: rollValue,
      settlement,
    })
  }, [
    deal,
    isTournamentPackage,
    settlement,
    slices,
    profilesById,
    baseline,
    rollValue,
    isStakee,
    userId,
    playerName,
  ])

  if (!deal) return null

  const profitUp = computeProfitAboveBaseline({ baseline_bankroll: baseline, roll: rollValue })
  const makeup = computeDealMakeup({ baseline_bankroll: baseline, roll: rollValue })
  const label = deal.label?.trim() || dealTypeLabel(deal.deal_type)
  const playerCredit = tourneyClose ? tourneyClose.returned : settlement?.player_net ?? 0
  const overallPl = tourneyClose?.overallPl ?? null
  const unusedMarkupTotal = roundMoney(
    backerReturnRows.reduce((sum, row) => sum + (row.unusedMarkup || 0), 0),
  )
  const myUnusedMarkup = roundMoney(myReturnRow?.unusedMarkup || 0)
  const myTotalReturn = roundMoney(myReturnRow?.totalToBacker || 0)
  const cashBackerCredit =
    !isStakee && !isTournamentPackage && settlement && mySlice
      ? settlementBackerCredit(
          {
            ...settlement,
            roll_at_settle: rollValue,
            baseline_at_settle: baseline,
          },
          deal,
          mySlice,
          null,
          { isClose: true },
        )
      : 0
  const heroCredit = isStakee
    ? playerCredit
    : isTournamentPackage
      ? myTotalReturn
      : cashBackerCredit
  const lossTone =
    isTournamentPackage && overallPl != null
      ? overallPl < -0.005
      : Number(heroCredit) < -0.005

  const heroLabel = isTournamentPackage
    ? isStakee
      ? 'Returned to personal bankroll'
      : 'Returned to backing bankroll'
    : isStakee
      ? 'Credit to personal bankroll'
      : 'Credit to backing bankroll'

  return (
    <div
      className="fixed inset-0 z-[125] flex items-end justify-center overflow-x-hidden bg-black/70 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        data-poker-stable-close-stake-sheet
        data-poker-stable-close-viewer={isStakee ? 'player' : 'backer'}
        className={`relative z-10 w-full max-w-lg max-h-[90vh] overflow-y-auto ${APP_MODAL_SHEET_PANEL_CLASS}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between gap-3">
          <h3 className="text-lg font-bold text-white">Close stake</h3>
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
          {isTournamentPackage
            ? `Roll ${fmtPoker$(rollValue)}`
            : `Roll ${fmtPoker$(rollValue)} · Baseline ${fmtPoker$(baseline)}`}
          {!isStakee ? (
            <>
              {' · '}
              <span className="text-zinc-400">{playerName}</span>
            </>
          ) : null}
        </p>

        {isTournamentPackage ? null : (
          <div
            data-poker-stable-close-stake-summary
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
                <div className="text-[10px] font-bold uppercase tracking-wide text-zinc-500">
                  Makeup
                </div>
                <div className="mt-1 text-base font-bold tabular-nums text-amber-300/90">
                  {fmtPoker$(makeup)}
                </div>
              </div>
            ) : null}
          </div>
        )}

        <div
          data-poker-stable-close-stake-player-card
          className={`mb-4 rounded-2xl border p-3 ${
            lossTone ? 'border-rose-400/50 bg-rose-950/45' : 'border-emerald-500/25 bg-emerald-950/30'
          }`}
        >
          <div
            className={`text-[10px] font-bold uppercase tracking-wide ${
              lossTone ? 'text-rose-200/90' : 'text-emerald-300/80'
            }`}
          >
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
          {isTournamentPackage && overallPl != null ? (
            <p
              className={`mt-2 text-xs font-medium leading-relaxed ${
                lossTone ? 'text-rose-100/70' : 'text-emerald-100/70'
              }`}
            >
              Overall P/L {overallPl >= 0 ? '+' : ''}
              {fmtPoker$(overallPl)}
              {tourneyClose?.appliedMarkup > 0.005
                ? ` (stake ${tourneyClose.stakePl >= 0 ? '+' : ''}${fmtPoker$(tourneyClose.stakePl)} · markup +${fmtPoker$(tourneyClose.appliedMarkup)})`
                : ''}
              {isStakee && tourneyClose?.contribution > 0.005
                ? ` · your package share was ${fmtPoker$(tourneyClose.contribution)}`
                : ''}
            </p>
          ) : (
            <p className="mt-2 text-xs leading-relaxed text-zinc-500">
              {isStakee
                ? `This stake will be archived, roll resets to ${fmtPoker$(baseline)}, and its sessions move onto your personal timeline.`
                : `This stake will be archived and ${playerName}'s sessions move onto their personal timeline.`}
            </p>
          )}
          {isTournamentPackage && unusedMarkupTotal > 0.005 ? (
            <p className="mt-2 text-xs leading-relaxed text-zinc-400">
              {isStakee
                ? `${fmtPoker$(unusedMarkupTotal)} unused markup returns to backers from your personal bankroll.`
                : myUnusedMarkup > 0.005
                  ? `${fmtPoker$(myUnusedMarkup)} unused markup returns to your backing bankroll from ${playerName}'s personal bankroll.`
                  : `${fmtPoker$(unusedMarkupTotal)} unused markup returns to backers from ${playerName}'s personal bankroll.`}
            </p>
          ) : null}
        </div>

        {isTournamentPackage && isStakee && backerReturnRows.length ? (
          <div data-poker-stable-close-stake-backers className="mb-4">
            <div className="mb-2 text-[10px] font-bold uppercase tracking-wide text-zinc-500">
              Returns to backers
            </div>
            <ul className="space-y-2">
              {backerReturnRows.map((row) => (
                <BackerReturnRow key={row.sliceId} row={row} />
              ))}
            </ul>
          </div>
        ) : null}

        {isTournamentPackage && !isStakee && myReturnRow ? (
          <div data-poker-stable-close-stake-your-return className="mb-4">
            <div className="mb-2 text-[10px] font-bold uppercase tracking-wide text-zinc-500">
              Your return
            </div>
            <ul className="space-y-2">
              <BackerReturnRow row={{ ...myReturnRow, name: 'You' }} />
            </ul>
          </div>
        ) : null}

        {isTournamentPackage && !isStakee && otherBackerRows.length ? (
          <div data-poker-stable-close-stake-other-backers className="mb-4">
            <div className="mb-2 text-[10px] font-bold uppercase tracking-wide text-zinc-500">
              Other backers
            </div>
            <ul className="space-y-2">
              {otherBackerRows.map((row) => (
                <BackerReturnRow key={row.sliceId} row={row} />
              ))}
            </ul>
          </div>
        ) : null}

        {!isTournamentPackage && cashBackerPhrases.length ? (
          <div data-poker-stable-close-stake-backers className="mb-4">
            <div className="mb-2 text-[10px] font-bold uppercase tracking-wide text-zinc-500">
              {isStakee ? 'Backer settlements' : 'Your settlement'}
            </div>
            <ul className="space-y-1.5 rounded-2xl border border-zinc-700/80 bg-zinc-900/60 px-3 py-3 text-sm text-zinc-300">
              {cashBackerPhrases.map((phrase) => (
                <li key={phrase}>{phrase}</li>
              ))}
            </ul>
          </div>
        ) : null}

        <p className="mb-4 text-xs leading-relaxed text-zinc-500">
          {isTournamentPackage
            ? isStakee
              ? 'Closing distributes the current roll by action % and refunds unused prepaid markup. Sessions move onto your personal timeline.'
              : `Closing distributes the current roll by action % and refunds unused prepaid markup. ${playerName}'s sessions move onto their personal timeline.`
            : isStakee
              ? `Backer slices settle together from profit above baseline${
                  showRakeback ? ' and any rakeback you enter below' : ''
                }. Confirm when the numbers look right.`
              : `Settlement is from profit above baseline${
                  showRakeback ? ' and any rakeback entered below' : ''
                }. Confirm when the numbers look right.`}
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
          data-poker-stable-close-stake-confirm-btn
          className="w-full rounded-xl bg-zinc-100 py-3.5 text-base font-bold text-zinc-900 touch-manipulation disabled:opacity-50"
        >
          {saving ? 'Closing…' : 'Confirm close stake'}
        </button>
      </div>
    </div>
  )
}

function BackerReturnRow({ row }) {
  return (
    <li
      data-poker-stable-close-stake-backer-row
      className="rounded-2xl border border-zinc-700/80 bg-zinc-900/60 px-3 py-3"
    >
      <div className="flex items-baseline justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold text-white">{row.name}</div>
          <div className="text-[11px] text-zinc-500">
            {Number.isInteger(row.actionPct)
              ? `${row.actionPct}%`
              : `${Math.round(row.actionPct * 100) / 100}%`}{' '}
            action
          </div>
        </div>
        <div className="shrink-0 text-right text-sm font-bold tabular-nums text-zinc-100">
          {fmtPoker$(row.totalToBacker)}
        </div>
      </div>
      <div className="mt-2 space-y-1 text-xs leading-relaxed text-zinc-400">
        <div className="flex justify-between gap-3">
          <span>Stake value returned</span>
          <span className="tabular-nums text-zinc-300">{fmtPoker$(row.rollShare)}</span>
        </div>
        {row.unusedMarkup > 0.005 ? (
          <div className="flex justify-between gap-3">
            <span>Unused markup refunded</span>
            <span className="tabular-nums text-zinc-300">{fmtPoker$(row.unusedMarkup)}</span>
          </div>
        ) : row.prepaidFee > 0.005 ? (
          <div className="flex justify-between gap-3">
            <span>Markup</span>
            <span className="tabular-nums text-zinc-300">
              {fmtPoker$(row.appliedMarkup)} applied (none unused)
            </span>
          </div>
        ) : null}
      </div>
    </li>
  )
}
