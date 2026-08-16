import { DollarSign, Trophy } from 'lucide-react'
import { APP_MODAL_OVERLAY_CLASS } from '../../constants/appZIndex.js'
import { POKER_SHEET_PANEL_CLASS } from './pokerBankrollTrackerSheet.js'
import { isPieceDealType } from '../poker-stable/pokerStableMath.js'
import {
  computeSessionAttribution,
  sessionAttributionAmountClass,
} from './pokerSessionAttribution.js'
import {
  fmtPoker$,
  fmtPokerDuration,
  pokerSessionBbPerHour,
  pokerSessionDurationHours,
  pokerSessionTotalCost,
  pokerSessionWinLoss,
} from './pokerBankrollMath.js'
import {
  pokerSessionMetaLine,
  pokerSessionStakesLabel,
} from './pokerSessionLabels.js'
import PokerTournamentSwapsSection from './PokerTournamentSwapsSection.jsx'
import {
  swapIsMarkedPaid,
  swapOtherPartyLabel,
  swapTermsAwaitingReaccept,
  swapViewerRole,
} from './pokerTournamentSwapApi.js'
import {
  aggregateSeriesHistoryDetail,
  dedupeSwapsById,
  seriesHistoryContextLine,
  sortHistorySessionsNewestFirst,
} from './pokerTournamentHistoryGroups.js'
import {
  computeTournamentSwapSettlement,
  formatSwapIouLine,
  formatSwapPaidLine,
  formatSwapSettledParenAmount,
  formatSwapTermLine,
  formatSwapWaitingStatus,
  settlementArgsFromSwap,
  sessionSwapSettlementDelta,
  swapViewerSettlementDelta,
} from './pokerTournamentSwapMath.js'

function pokerSessionInForLine(session) {
  const total = pokerSessionTotalCost(session)
  const bits = [`In for ${fmtPoker$(total)}`]
  const reentries = Number(session.reentries) || 0
  const rebuy = Number(session.rebuy_amount) || 0
  const addon = Number(session.addon_amount) || 0
  if (reentries > 0) {
    bits.push(`${reentries} re-buy${reentries === 1 ? '' : 's'}`)
  } else if (rebuy > 0) {
    bits.push(`re-buys ${fmtPoker$(rebuy)}`)
  }
  if (addon > 0) bits.push(`add-ons ${fmtPoker$(addon)}`)
  return bits.join(' · ')
}

function DetailRow({ label, value, valueClassName = 'text-zinc-200' }) {
  if (value == null || value === '') return null
  return (
    <div className="flex items-start justify-between gap-3 py-2">
      <span className="shrink-0 text-xs font-semibold uppercase tracking-wide text-zinc-500">
        {label}
      </span>
      <span className={`min-w-0 text-right text-sm font-medium tabular-nums ${valueClassName}`}>
        {value}
      </span>
    </div>
  )
}

function ResultMoney({ amount, className = 'text-lg font-black tabular-nums' }) {
  return (
    <span className={`${className} ${sessionAttributionAmountClass(amount)}`}>
      {amount == null ? '—' : fmtPoker$(amount)}
    </span>
  )
}

function PartyLine({ label, detail, amount, emphasize = false }) {
  return (
    <div
      className={`flex items-start justify-between gap-3 ${emphasize ? 'py-1' : 'py-1.5'}`}
      data-poker-session-party={emphasize ? 'player' : 'backer'}
    >
      <div className="min-w-0 flex-1">
        <div
          className={`truncate ${emphasize ? 'text-sm font-semibold text-zinc-200' : 'text-sm text-zinc-300'}`}
        >
          {label}
        </div>
        {detail ? <div className="mt-0.5 text-[11px] text-zinc-500">{detail}</div> : null}
      </div>
      <ResultMoney
        amount={amount}
        className={`shrink-0 tabular-nums ${emphasize ? 'text-base font-bold' : 'text-sm font-semibold'}`}
      />
    </div>
  )
}

function swapGiveFormula(base, pct, total) {
  const safeBase = Math.max(0, Number(base) || 0)
  const safePct = Number(pct) || 0
  const safeTotal = Math.max(0, Number(total) || 0)
  const percentageShare = (safeBase * safePct) / 100
  const bulletCoverage = Math.max(0, safeTotal - percentageShare)
  return `${safePct}% × ${fmtPoker$(safeBase)}${
    bulletCoverage >= 0.005 ? ` + ${fmtPoker$(bulletCoverage)} bullet coverage` : ''
  } = ${fmtPoker$(safeTotal)}`
}

function SwapSettlementBreakdown({ swap, role, other, statusLine }) {
  const calculation = computeTournamentSwapSettlement(settlementArgsFromSwap(swap))
  const viewerIsCreator = role === 'creator'
  const viewerPrize = Number(
    viewerIsCreator ? swap.creator_prize : swap.counterparty_prize,
  ) || 0
  const otherPrize = Number(
    viewerIsCreator ? swap.counterparty_prize : swap.creator_prize,
  ) || 0
  const viewerInvested = Number(
    viewerIsCreator ? swap.creator_buy_in : swap.counterparty_buy_in,
  ) || 0
  const otherInvested = Number(
    viewerIsCreator ? swap.counterparty_buy_in : swap.creator_buy_in,
  ) || 0
  const viewerPct = Number(
    viewerIsCreator ? swap.pct_creator_gives : swap.pct_counterparty_gives,
  ) || 0
  const otherPct = Number(
    viewerIsCreator ? swap.pct_counterparty_gives : swap.pct_creator_gives,
  ) || 0
  const viewerBase = viewerIsCreator ? calculation.creatorNet : calculation.counterpartyNet
  const otherBase = viewerIsCreator ? calculation.counterpartyNet : calculation.creatorNet
  const viewerGives = viewerIsCreator ? calculation.creatorOwes : calculation.counterpartyOwes
  const otherGives = viewerIsCreator ? calculation.counterpartyOwes : calculation.creatorOwes

  return (
    <div
      data-poker-session-swap-breakdown
      className="mt-2 rounded-xl border border-zinc-800/80 bg-black/15 p-3 text-[11px]"
    >
      <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-1.5">
        <span className="font-medium text-zinc-400">Your result</span>
        <span className="text-right tabular-nums text-zinc-300">
          {fmtPoker$(viewerPrize)} cash · {fmtPoker$(viewerInvested)} invested
        </span>
        <span className="truncate font-medium text-zinc-400">{other}'s result</span>
        <span className="text-right tabular-nums text-zinc-300">
          {fmtPoker$(otherPrize)} cash · {fmtPoker$(otherInvested)} invested
        </span>
      </div>

      {calculation.activated ? (
        <div className="mt-2 space-y-1.5 border-t border-zinc-800/80 pt-2">
          <div className="flex items-start justify-between gap-3">
            <span className="shrink-0 text-zinc-500">You give</span>
            <span className="text-right tabular-nums text-zinc-300">
              {swapGiveFormula(viewerBase, viewerPct, viewerGives)}
            </span>
          </div>
          <div className="flex items-start justify-between gap-3">
            <span className="shrink-0 text-zinc-500">{other} gives</span>
            <span className="text-right tabular-nums text-zinc-300">
              {swapGiveFormula(otherBase, otherPct, otherGives)}
            </span>
          </div>
        </div>
      ) : (
        <p className="mt-2 border-t border-zinc-800/80 pt-2 text-zinc-500">
          Swap condition was not met, so nothing is owed.
        </p>
      )}

      <div className="mt-2 flex items-start justify-between gap-3 border-t border-zinc-800/80 pt-2 font-semibold">
        <span className="text-zinc-400">Net settlement</span>
        <span className="text-right text-zinc-200">{statusLine}</span>
      </div>
    </div>
  )
}

/**
 * Read-only session detail sheet. Edit / delete open or run from the parent.
 * Multi-flight series groups show aggregate totals + per-flight Edit rows + Delete event.
 */
export default function PokerSessionDetailSheet({
  session,
  seriesSessions = null,
  isActive = false,
  elapsedSeconds = 0,
  stakeLabel = '',
  deal = null,
  slices = [],
  stableProfilesById = {},
  userId,
  supabaseClient,
  sessionSwaps = [],
  swapProfilesById = {},
  maxSwapGivePct = 100,
  sessionCardSwapBusyId = null,
  recapMode = false,
  stakeSessions = [],
  eventsById = {},
  onClose,
  onEdit,
  onDelete,
  deleteBusy = false,
  onSavedSwapsMutated,
  showGlobalConfirm = null,
  onMarkSwapSettled,
  onEndSession,
  onOpenSwaps,
  onRebuy,
}) {
  if (!session) return null

  const flightSessions = sortHistorySessionsNewestFirst(
    Array.isArray(seriesSessions) && seriesSessions.length > 0 ? seriesSessions : [session],
  )
  const isSeriesGroup = !isActive && flightSessions.length > 1
  const uniqueSwaps = dedupeSwapsById(sessionSwaps)
  const seriesAgg = isSeriesGroup
    ? aggregateSeriesHistoryDetail(flightSessions, eventsById)
    : null
  const seriesContext = isSeriesGroup
    ? seriesHistoryContextLine(flightSessions, eventsById)
    : ''

  const isTourney = session.session_type === 'tournament'

  const flightAttributions = flightSessions.map((flight) => {
    const flightSwapDelta = sessionSwapSettlementDelta(uniqueSwaps, flight.id, userId)
    return computeSessionAttribution(
      flight,
      deal,
      slices,
      stableProfilesById,
      flightSwapDelta,
      stakeSessions,
    )
  })

  const singleAttribution =
    flightAttributions[0] ||
    computeSessionAttribution(
      session,
      deal,
      slices,
      stableProfilesById,
      sessionSwapSettlementDelta(uniqueSwaps, session.id, userId),
      stakeSessions,
    )

  let grossWl = singleAttribution.gross
  let playerNet = singleAttribution.playerNetValue
  let swapDelta = sessionSwapSettlementDelta(uniqueSwaps, session.id, userId)
  /** @type {Map<string, object>} */
  const partyMap = new Map()

  if (isSeriesGroup) {
    let grossTotal = 0
    let grossCounted = 0
    let netTotal = 0
    let netCounted = 0
    let swapTotal = 0
    for (let i = 0; i < flightSessions.length; i += 1) {
      const attr = flightAttributions[i]
      if (attr.gross != null) {
        grossTotal += attr.gross
        grossCounted += 1
      }
      if (attr.playerNetValue != null) {
        netTotal += attr.playerNetValue
        netCounted += 1
      }
      swapTotal += sessionSwapSettlementDelta(uniqueSwaps, flightSessions[i].id, userId)
      for (const party of attr.parties || []) {
        if (party.role === 'stake_roll') continue
        const key = party.sliceId || `${party.role}:${party.label}`
        const prev = partyMap.get(key)
        if (!prev) partyMap.set(key, { ...party })
        else {
          partyMap.set(key, {
            ...prev,
            amount: Math.round((prev.amount + party.amount) * 100) / 100,
          })
        }
      }
    }
    grossWl = grossCounted > 0 ? Math.round(grossTotal * 100) / 100 : null
    playerNet = netCounted > 0 ? Math.round(netTotal * 100) / 100 : null
    swapDelta = Math.round(swapTotal * 100) / 100
  }

  const hrs = isActive
    ? elapsedSeconds / 3600
    : isSeriesGroup
      ? seriesAgg?.hours || 0
      : pokerSessionDurationHours(session)
  const hourly = playerNet != null && hrs >= 0.02 ? playerNet / hrs : null
  const bbh =
    !isSeriesGroup && pokerSessionTotalCost(session) ? pokerSessionBbPerHour(session) : null
  const isPieceSession = isPieceDealType(deal?.deal_type)
  const partyLines = isSeriesGroup
    ? [...partyMap.values()]
    : isPieceSession
      ? singleAttribution.parties.filter((p) => p.role !== 'stake_roll')
      : singleAttribution.parties
  const showPartyBreakdown =
    !isActive &&
    (isSeriesGroup
      ? partyLines.length > 0 && Boolean(deal)
      : singleAttribution.onStake && partyLines.length > 0)
  const showYourNet =
    !isActive &&
    playerNet != null &&
    (Boolean(deal) || uniqueSwaps.length > 0 || Math.abs(playerNet - (grossWl || 0)) >= 0.005)
  const start = new Date(session.start_at)
  const oldest = flightSessions[flightSessions.length - 1]
  const startDate = isSeriesGroup
    ? (() => {
        const newestLabel = start.toLocaleDateString('en-US', {
          weekday: 'short',
          month: 'short',
          day: 'numeric',
          year: 'numeric',
        })
        if (!oldest?.start_at) return newestLabel
        const oldestLabel = new Date(oldest.start_at).toLocaleDateString('en-US', {
          weekday: 'short',
          month: 'short',
          day: 'numeric',
          year: 'numeric',
        })
        return oldestLabel === newestLabel ? newestLabel : `${oldestLabel} → ${newestLabel}`
      })()
    : start.toLocaleDateString('en-US', {
        weekday: 'long',
        month: 'long',
        day: 'numeric',
        year: 'numeric',
      })
  const startTime = isSeriesGroup
    ? seriesContext || `${flightSessions.length} sessions`
    : start.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
  const investedLine = isSeriesGroup
    ? `In for ${fmtPoker$(seriesAgg?.invested || 0)}${
        seriesAgg?.reentries
          ? ` · ${seriesAgg.reentries} re-buy${seriesAgg.reentries === 1 ? '' : 's'}`
          : ''
      }`
    : pokerSessionInForLine(session)
  const cashOutValue = isSeriesGroup
    ? seriesAgg?.cashOut != null
      ? fmtPoker$(seriesAgg.cashOut)
      : null
    : session.cash_out != null
      ? fmtPoker$(session.cash_out)
      : null
  const finishValue = isSeriesGroup
    ? seriesAgg?.finishPlace != null
      ? `#${seriesAgg.finishPlace}${
          seriesAgg.fieldSize ? ` of ${seriesAgg.fieldSize}` : ''
        }`
      : null
    : session.finish_place != null
      ? `#${session.finish_place}${session.field_size ? ` of ${session.field_size}` : ''}`
      : null

  return (
    <div
      className={`${APP_MODAL_OVERLAY_CLASS} overflow-x-hidden`}
      onClick={() => onClose?.()}
    >
      <div
        data-poker-bankroll-sheet
        data-poker-session-detail
        data-poker-session-detail-series={isSeriesGroup ? 'true' : undefined}
        className={POKER_SHEET_PANEL_CLASS}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="mb-2 flex flex-wrap items-center gap-2">
              {isActive ? (
                session.paused_at ? (
                  <span
                    data-poker-session-paused-badge
                    className="inline-flex items-center gap-1.5 rounded-full bg-amber-500/15 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-300"
                  >
                    <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
                    Paused
                  </span>
                ) : (
                  <span
                    data-poker-session-active-badge
                    className="inline-flex items-center gap-1.5 rounded-full bg-blue-500/15 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-blue-300"
                  >
                    <span
                      data-poker-session-active-dot
                      className="h-1.5 w-1.5 animate-pulse rounded-full bg-blue-400"
                    />
                    In progress
                  </span>
                )
              ) : (
                <span className="rounded-full bg-zinc-800 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-zinc-400">
                  {isSeriesGroup ? 'Completed series' : 'Completed'}
                </span>
              )}
              {stakeLabel ? (
                <span
                  data-poker-session-stake-badge
                  className="rounded-full border border-cyan-500/30 bg-cyan-950/40 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-cyan-200"
                >
                  On stake · {stakeLabel}
                </span>
              ) : null}
            </div>
            <div className="flex items-start gap-2">
              <span
                data-poker-session-type-icon={isTourney ? 'tournament' : 'cash'}
                className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${
                  isTourney ? 'bg-amber-500/15 text-amber-300' : 'bg-zinc-800 text-zinc-300'
                }`}
                aria-hidden
              >
                {isTourney ? (
                  <Trophy className="h-4 w-4" strokeWidth={2.25} />
                ) : (
                  <DollarSign className="h-4 w-4" strokeWidth={2.25} />
                )}
              </span>
              <h2 className="text-lg font-bold leading-snug text-white">
                {pokerSessionStakesLabel(session)}
              </h2>
            </div>
            <p className="mt-1 text-sm text-zinc-400">{pokerSessionMetaLine(session)}</p>
          </div>
          <button
            type="button"
            onClick={() => onClose?.()}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-zinc-800 text-sm text-zinc-400 touch-manipulation"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        <div className="mb-4 rounded-2xl border border-zinc-800 bg-zinc-900/60 px-4 py-1">
          <DetailRow label="Date" value={startDate} valueClassName="text-zinc-300" />
          <DetailRow
            label={isSeriesGroup ? 'Flights' : 'Start'}
            value={startTime}
            valueClassName="text-zinc-300"
          />
          <DetailRow
            label="Duration"
            value={
              isActive
                ? fmtPokerDuration(elapsedSeconds)
                : hrs > 0
                  ? fmtPokerDuration(hrs * 3600)
                  : null
            }
            valueClassName="text-zinc-300"
          />
          <DetailRow label="Invested" value={investedLine} valueClassName="text-zinc-300" />
          {!isActive && cashOutValue != null ? (
            <DetailRow label="Cash out" value={cashOutValue} valueClassName="text-zinc-300" />
          ) : null}
          {hourly != null ? (
            <DetailRow label="Hourly" value={`${fmtPoker$(hourly)}/h`} valueClassName="text-zinc-300" />
          ) : null}
          {bbh != null ? (
            <DetailRow label="BB / hour" value={`${bbh.toFixed(1)} BB/h`} valueClassName="text-zinc-300" />
          ) : null}
          {isTourney && finishValue ? (
            <DetailRow label="Finish" value={finishValue} valueClassName="text-zinc-300" />
          ) : null}
        </div>

        {isSeriesGroup ? (
          <div
            data-poker-session-flights
            className="mb-4 rounded-2xl border border-zinc-800 bg-zinc-900/60 p-4"
          >
            <div
              data-poker-session-section-heading
              className="mb-2 text-xs font-semibold uppercase tracking-wide text-cyan-400/90"
            >
              Flights / bullets
            </div>
            <ul className="space-y-2">
              {flightSessions.map((flight) => {
                const flightWl = pokerSessionWinLoss(flight)
                const flightDate = new Date(flight.start_at).toLocaleDateString('en-US', {
                  weekday: 'short',
                  month: 'short',
                  day: 'numeric',
                })
                return (
                  <li
                    key={flight.id}
                    data-poker-session-flight-row
                    className="rounded-xl border border-zinc-800/80 bg-black/15 p-3"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-semibold text-zinc-200">
                          {pokerSessionStakesLabel(flight)}
                        </div>
                        <div className="mt-0.5 text-[11px] text-zinc-500">
                          {flightDate}
                          {' · '}
                          {pokerSessionInForLine(flight)}
                          {flight.cash_out != null ? ` · out ${fmtPoker$(flight.cash_out)}` : ''}
                        </div>
                      </div>
                      <div className="flex shrink-0 flex-col items-end gap-1.5">
                        <ResultMoney
                          amount={flightWl}
                          className="text-sm font-bold tabular-nums"
                        />
                        {!recapMode ? (
                          <div className="flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => onEdit?.(flight)}
                              data-poker-session-flight-edit-btn
                              className="rounded-lg bg-zinc-700 px-2.5 py-1 text-[10px] font-bold text-white touch-manipulation active:bg-zinc-600"
                            >
                              Edit
                            </button>
                            {onDelete ? (
                              <button
                                type="button"
                                disabled={deleteBusy}
                                onClick={() => void onDelete?.([flight])}
                                data-poker-session-flight-delete-btn
                                className="rounded-lg border border-rose-500/40 px-2.5 py-1 text-[10px] font-bold text-rose-300 touch-manipulation disabled:opacity-50"
                              >
                                Delete
                              </button>
                            ) : null}
                          </div>
                        ) : null}
                      </div>
                    </div>
                  </li>
                )
              })}
            </ul>
          </div>
        ) : null}

        <div className="mb-4 rounded-2xl border border-zinc-800 bg-zinc-900/60 p-4">
          <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">
            Results
          </div>

          {isActive ? (
            <p className="text-sm text-zinc-500">
              End the session to see table result and attribution.
            </p>
          ) : grossWl == null ? (
            <p className="text-sm text-zinc-500">No cash-out recorded yet.</p>
          ) : (
            <>
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-sm text-zinc-400">Table result</span>
                <ResultMoney amount={grossWl} />
              </div>

              {showPartyBreakdown ? (
                <div className="mt-3 border-t border-zinc-800/80 pt-3">
                  <div
                    data-poker-session-section-heading
                    className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-cyan-400/90"
                  >
                    By party
                  </div>
                  <div className="space-y-0.5">
                    {partyLines.map((party) => (
                      <PartyLine
                        key={party.key}
                        label={party.label}
                        detail={party.detail}
                        amount={party.amount}
                        emphasize={party.role === 'player'}
                      />
                    ))}
                  </div>
                  <p className="mt-2 text-[11px] leading-snug text-zinc-500">
                    {isPieceSession
                      ? "Your share after this session's backer splits. Swaps (if any) settle separately."
                      : 'Includes your share of on-stake sessions; personal bankroll updates when you settle with backers.'}
                  </p>
                </div>
              ) : null}

              {uniqueSwaps.length > 0 ? (
                <div className="mt-3 border-t border-zinc-800/80 pt-3">
                  <div
                    data-poker-session-section-heading
                    className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-cyan-400/90"
                  >
                    Swaps
                  </div>
                  <ul className="space-y-2">
                    {uniqueSwaps.map((swap) => {
                      const role = swapViewerRole(swap, userId) || 'creator'
                      const other = swapOtherPartyLabel(swap, swapProfilesById, userId)
                      const paid = swapIsMarkedPaid(swap)
                      const signed = swapViewerSettlementDelta(swap, role)
                      const statusLine =
                        swap.status === 'settled'
                          ? paid
                            ? formatSwapPaidLine(signed, other, fmtPoker$)
                            : formatSwapIouLine(
                                swap.settlement_amount,
                                role,
                                other,
                                fmtPoker$,
                              )
                          : formatSwapWaitingStatus(swap, role, other)
                      const canMarkSettled =
                        swap.status === 'settled' &&
                        !paid &&
                        !swapTermsAwaitingReaccept(swap) &&
                        Math.abs(Number(swap.settlement_amount) || 0) >= 0.005
                      const amtTone =
                        signed < -0.005 ? 'loss' : signed > 0.005 ? 'gain' : 'flat'
                      return (
                        <li
                          key={swap.id}
                          className="text-sm"
                          data-poker-session-swap-line={paid ? 'settled' : 'waiting'}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="truncate font-medium text-zinc-200">{other}</span>
                                {canMarkSettled ? (
                                  <button
                                    type="button"
                                    disabled={sessionCardSwapBusyId === swap.id}
                                    data-poker-session-swap-settle-btn
                                    onClick={() => onMarkSwapSettled?.(swap)}
                                    className="shrink-0 rounded-lg bg-emerald-600 px-2.5 py-1 text-[10px] font-bold text-white touch-manipulation disabled:opacity-50"
                                  >
                                    {sessionCardSwapBusyId === swap.id ? '…' : 'Mark settled'}
                                  </button>
                                ) : null}
                              </div>
                              <div className="mt-0.5 text-xs text-zinc-500">
                                {swap.pct_creator_gives != null &&
                                swap.pct_counterparty_gives != null
                                  ? `${swap.pct_creator_gives}% ↔ ${swap.pct_counterparty_gives}%`
                                  : null}
                                {formatSwapTermLine(swap)
                                  ? ` · ${formatSwapTermLine(swap)}`
                                  : ''}
                                {swap.status !== 'settled' && statusLine
                                  ? ` · ${statusLine}`
                                  : null}
                              </div>
                            </div>
                            <div className="flex shrink-0 flex-col items-end gap-1">
                              {paid && swap.status === 'settled' ? (
                                <span
                                  data-poker-session-swap-amt={amtTone}
                                  className={`text-sm font-bold tabular-nums ${
                                    amtTone === 'loss'
                                      ? 'text-rose-400'
                                      : amtTone === 'gain'
                                        ? 'text-emerald-400'
                                        : 'text-zinc-400'
                                  }`}
                                >
                                  {formatSwapSettledParenAmount(signed, fmtPoker$)}
                                </span>
                              ) : null}
                            </div>
                          </div>
                          {swap.status === 'settled' && statusLine ? (
                            <SwapSettlementBreakdown
                              swap={swap}
                              role={role}
                              other={other}
                              statusLine={statusLine}
                            />
                          ) : null}
                        </li>
                      )
                    })}
                  </ul>
                  {deal ? (
                    <p className="mt-2 text-[11px] leading-snug text-zinc-500">
                      Swaps are peer deals separate from stake backing; cash settles to your personal
                      bankroll when you mark them paid, not on stake settle with backers.
                    </p>
                  ) : null}
                </div>
              ) : null}

              {showYourNet ? (
                <div className="mt-3 border-t border-zinc-800/80 pt-3">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="text-sm font-semibold text-zinc-300">Your net</span>
                    <ResultMoney amount={playerNet} />
                  </div>
                  {!deal && uniqueSwaps.length > 0 ? (
                    <div className="mt-1 text-right text-[11px] tabular-nums text-zinc-500">
                      {fmtPoker$(grossWl)} table {swapDelta >= 0 ? '+' : '−'}{' '}
                      {fmtPoker$(Math.abs(swapDelta))} swaps = {fmtPoker$(playerNet)}
                    </div>
                  ) : null}
                </div>
              ) : null}
            </>
          )}
        </div>

        {isTourney && isActive ? (
          <div className="mb-4">
            <PokerTournamentSwapsSection
              supabaseClient={supabaseClient}
              userId={userId}
              enabled
              maxSwapGivePct={maxSwapGivePct}
              showOwnershipSummary
              draftSwaps={[]}
              onDraftSwapsChange={() => {}}
              savedSwaps={uniqueSwaps}
              profilesById={swapProfilesById}
              onSavedSwapsMutated={onSavedSwapsMutated}
              showGlobalConfirm={showGlobalConfirm}
              compact
            />
          </div>
        ) : null}

        {session.notes && !isSeriesGroup ? (
          <div className="mb-4 rounded-2xl border border-zinc-800 bg-zinc-900/60 p-4">
            <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">
              Notes
            </div>
            <p className="whitespace-pre-wrap text-sm leading-relaxed text-zinc-300">
              {session.notes}
            </p>
          </div>
        ) : null}

        {isActive ? (
          <div className="mb-3 grid grid-cols-2 gap-2">
            {isTourney ? (
              <button
                type="button"
                onClick={() => onOpenSwaps?.()}
                data-poker-session-swap-btn
                className="rounded-2xl border border-cyan-400/40 bg-cyan-950/50 py-3 text-sm font-bold text-cyan-100 touch-manipulation active:bg-cyan-900/60"
              >
                Swaps
              </button>
            ) : (
              <button
                type="button"
                onClick={() => onRebuy?.()}
                data-poker-session-rebuy-btn
                className="rounded-2xl border border-emerald-500 bg-white py-3 text-sm font-bold text-emerald-600 touch-manipulation active:bg-emerald-50"
              >
                Re-buy
              </button>
            )}
            <button
              type="button"
              onClick={() => onEdit?.(session)}
              data-poker-session-edit-btn
              className="rounded-2xl bg-zinc-700 py-3 text-sm font-bold text-white touch-manipulation active:bg-zinc-600"
            >
              Edit session
            </button>
          </div>
        ) : null}

        {isActive ? (
          <button
            type="button"
            onClick={() => onEndSession?.()}
            data-poker-session-end-btn
            className="w-full rounded-2xl bg-emerald-600 py-3.5 text-base font-bold text-white touch-manipulation active:bg-emerald-500"
          >
            End session
          </button>
        ) : recapMode ? (
          <button
            type="button"
            onClick={() => onClose?.()}
            data-poker-session-recap-continue-btn
            className="w-full rounded-2xl bg-emerald-600 py-3.5 text-base font-bold text-white touch-manipulation active:bg-emerald-500"
          >
            Continue
          </button>
        ) : (
          <div className="space-y-2">
            {isSeriesGroup ? (
              <p className="text-center text-[11px] leading-snug text-zinc-500">
                Edit or delete each flight above. Sessions stay separate for bankroll accounting.
              </p>
            ) : (
              <button
                type="button"
                onClick={() => onEdit?.(session)}
                data-poker-session-edit-btn
                className="w-full rounded-2xl bg-zinc-700 py-3.5 text-base font-bold text-white touch-manipulation active:bg-zinc-600"
              >
                Edit session
              </button>
            )}
            {onDelete ? (
              <button
                type="button"
                disabled={deleteBusy}
                onClick={() => void onDelete?.(flightSessions)}
                data-poker-session-delete-btn
                className="w-full rounded-2xl border border-rose-500/40 py-3 text-sm font-semibold text-rose-300 touch-manipulation disabled:opacity-50"
              >
                {deleteBusy
                  ? 'Deleting…'
                  : isSeriesGroup
                    ? 'Delete event'
                    : 'Delete session'}
              </button>
            ) : null}
          </div>
        )}
      </div>
    </div>
  )
}
