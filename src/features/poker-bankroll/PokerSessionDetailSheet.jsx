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
} from './pokerBankrollMath.js'
import {
  pokerSessionMetaLine,
  pokerSessionStakesLabel,
} from './pokerSessionLabels.js'
import PokerTournamentSwapsSection from './PokerTournamentSwapsSection.jsx'
import {
  swapIsMarkedPaid,
  swapOtherPartyLabel,
  swapViewerRole,
} from './pokerTournamentSwapApi.js'
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
 * Read-only session detail sheet. Edit opens separately from the parent.
 */
export default function PokerSessionDetailSheet({
  session,
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
  onClose,
  onEdit,
  onSavedSwapsMutated,
  onMarkSwapSettled,
  onEndSession,
  onOpenSwaps,
  onRebuy,
}) {
  if (!session) return null

  const isTourney = session.session_type === 'tournament'
  const swapDelta = sessionSwapSettlementDelta(sessionSwaps, session.id, userId)
  const attribution = computeSessionAttribution(
    session,
    deal,
    slices,
    stableProfilesById,
    swapDelta,
    stakeSessions,
  )
  const grossWl = attribution.gross
  const playerNet = attribution.playerNetValue
  const hrs = isActive ? elapsedSeconds / 3600 : pokerSessionDurationHours(session)
  const hourly = playerNet != null && hrs >= 0.02 ? playerNet / hrs : null
  const bbh = pokerSessionTotalCost(session) ? pokerSessionBbPerHour(session) : null
  const isPieceSession = isPieceDealType(deal?.deal_type)
  const partyLines = isPieceSession
    ? attribution.parties.filter((p) => p.role !== 'stake_roll')
    : attribution.parties
  const showPartyBreakdown =
    !isActive && attribution.onStake && partyLines.length > 0
  const showYourNet =
    !isActive &&
    playerNet != null &&
    (attribution.onStake || sessionSwaps.length > 0 || Math.abs(playerNet - grossWl) >= 0.005)
  const start = new Date(session.start_at)
  const startDate = start.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  })
  const startTime = start.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })

  return (
    <div
      className={`${APP_MODAL_OVERLAY_CLASS} overflow-x-hidden`}
      onClick={() => onClose?.()}
    >
      <div
        data-poker-bankroll-sheet
        data-poker-session-detail
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
                  Completed
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
          <DetailRow label="Start" value={startTime} valueClassName="text-zinc-300" />
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
          <DetailRow
            label="Invested"
            value={pokerSessionInForLine(session)}
            valueClassName="text-zinc-300"
          />
          {!isActive && session.cash_out != null ? (
            <DetailRow
              label="Cash out"
              value={fmtPoker$(session.cash_out)}
              valueClassName="text-zinc-300"
            />
          ) : null}
          {hourly != null ? (
            <DetailRow label="Hourly" value={`${fmtPoker$(hourly)}/h`} valueClassName="text-zinc-300" />
          ) : null}
          {bbh != null ? (
            <DetailRow label="BB / hour" value={`${bbh.toFixed(1)} BB/h`} valueClassName="text-zinc-300" />
          ) : null}
          {isTourney && session.finish_place != null ? (
            <DetailRow
              label="Finish"
              value={`#${session.finish_place}${
                session.field_size ? ` of ${session.field_size}` : ''
              }`}
              valueClassName="text-zinc-300"
            />
          ) : null}
        </div>

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
                      ? 'Your share after this session\'s backer splits. Swaps (if any) settle separately.'
                      : 'Includes your share of on-stake sessions; personal bankroll updates when you settle with backers.'}
                  </p>
                </div>
              ) : null}

              {sessionSwaps.length > 0 ? (
                <div className="mt-3 border-t border-zinc-800/80 pt-3">
                  <div
                    data-poker-session-section-heading
                    className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-cyan-400/90"
                  >
                    Swaps
                  </div>
                  <ul className="space-y-2">
                    {sessionSwaps.map((swap) => {
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
                  <p className="mt-2 text-[11px] leading-snug text-zinc-500">
                    Swaps are peer deals separate from stake backing; cash settles to your personal
                    bankroll when you mark them paid, not on stake settle with backers.
                  </p>
                </div>
              ) : null}

              {showYourNet ? (
                <div className="mt-3 border-t border-zinc-800/80 pt-3">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="text-sm font-semibold text-zinc-300">Your net</span>
                    <ResultMoney amount={playerNet} />
                  </div>
                  {!attribution.onStake && sessionSwaps.length > 0 ? (
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
              savedSwaps={sessionSwaps}
              profilesById={swapProfilesById}
              onSavedSwapsMutated={onSavedSwapsMutated}
              compact
            />
          </div>
        ) : null}

        {session.notes ? (
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
              onClick={() => onEdit?.()}
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
          <button
            type="button"
            onClick={() => onEdit?.()}
            data-poker-session-edit-btn
            className="w-full rounded-2xl bg-zinc-700 py-3.5 text-base font-bold text-white touch-manipulation active:bg-zinc-600"
          >
            Edit session
          </button>
        )}
      </div>
    </div>
  )
}
