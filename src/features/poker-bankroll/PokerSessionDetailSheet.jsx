import { DollarSign, Trophy } from 'lucide-react'
import { APP_MODAL_OVERLAY_CLASS } from '../../constants/appZIndex.js'
import { POKER_SHEET_PANEL_CLASS } from './pokerBankrollTrackerSheet.js'
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
  formatSwapIouLine,
  formatSwapSettledParenAmount,
  formatSwapWaitingStatus,
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
  )
  const grossWl = attribution.gross
  const playerNet = attribution.playerNetValue
  const hrs = isActive ? elapsedSeconds / 3600 : pokerSessionDurationHours(session)
  const hourly = playerNet != null && hrs >= 0.02 ? playerNet / hrs : null
  const bbh = pokerSessionTotalCost(session) ? pokerSessionBbPerHour(session) : null
  const showPartyBreakdown =
    !isActive && attribution.onStake && attribution.parties.length > 1
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
                <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/15 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-emerald-300">
                  <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" />
                  In progress
                </span>
              ) : (
                <span className="rounded-full bg-zinc-800 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-zinc-400">
                  Completed
                </span>
              )}
              {stakeLabel ? (
                <span className="rounded-full border border-cyan-500/30 bg-cyan-950/40 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-cyan-200">
                  On stake · {stakeLabel}
                </span>
              ) : null}
            </div>
            <div className="flex items-start gap-2">
              <span
                className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${
                  isTourney ? 'bg-amber-500/15 text-amber-300' : 'bg-emerald-500/15 text-emerald-300'
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
                  <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-cyan-400/90">
                    By party
                  </div>
                  <div className="space-y-0.5">
                    {attribution.parties.map((party) => (
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
                    Includes your share of on-stake sessions; personal bankroll updates when you
                    settle with backers.
                  </p>
                </div>
              ) : null}

              {sessionSwaps.length > 0 ? (
                <div className="mt-3 border-t border-zinc-800/80 pt-3">
                  <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-cyan-400/90">
                    Swaps
                  </div>
                  <ul className="space-y-2">
                    {sessionSwaps.map((swap) => {
                      const role = swapViewerRole(swap, userId) || 'creator'
                      const other = swapOtherPartyLabel(swap, swapProfilesById, userId)
                      const paid = swapIsMarkedPaid(swap)
                      const signed = swapViewerSettlementDelta(swap, role)
                      const waitingLine =
                        swap.status === 'settled'
                          ? formatSwapIouLine(swap.settlement_amount, role, other, fmtPoker$)
                          : formatSwapWaitingStatus(swap, role, other)
                      const canMarkSettled =
                        swap.status === 'settled' &&
                        !paid &&
                        Math.abs(Number(swap.settlement_amount) || 0) >= 0.005
                      return (
                        <li
                          key={swap.id}
                          className="flex items-start justify-between gap-2 text-sm"
                          data-poker-session-swap-line={paid ? 'settled' : 'waiting'}
                        >
                          <div className="min-w-0 flex-1">
                            <div className="truncate font-medium text-zinc-200">{other}</div>
                            <div className="mt-0.5 text-xs text-zinc-500">
                              {swap.pct_creator_gives != null && swap.pct_counterparty_gives != null
                                ? `${swap.pct_creator_gives}% ↔ ${swap.pct_counterparty_gives}%`
                                : null}
                              {waitingLine ? ` · ${waitingLine}` : null}
                            </div>
                          </div>
                          <div className="flex shrink-0 flex-col items-end gap-1">
                            {paid && swap.status === 'settled' ? (
                              <span
                                data-poker-session-swap-amt={
                                  signed < -0.005 ? 'loss' : signed > 0.005 ? 'gain' : 'flat'
                                }
                                className={`text-sm font-bold tabular-nums ${sessionAttributionAmountClass(signed)}`}
                              >
                                {formatSwapSettledParenAmount(signed, fmtPoker$)}
                              </span>
                            ) : null}
                            {canMarkSettled ? (
                              <button
                                type="button"
                                disabled={sessionCardSwapBusyId === swap.id}
                                data-poker-session-swap-settle-btn
                                onClick={() => onMarkSwapSettled?.(swap)}
                                className="rounded-lg bg-emerald-600 px-2.5 py-1 text-[10px] font-bold text-white touch-manipulation disabled:opacity-50"
                              >
                                {sessionCardSwapBusyId === swap.id ? '…' : 'Mark settled'}
                              </button>
                            ) : null}
                          </div>
                        </li>
                      )
                    })}
                  </ul>
                </div>
              ) : null}

              {showYourNet ? (
                <div className="mt-3 flex items-baseline justify-between gap-3 border-t border-zinc-800/80 pt-3">
                  <span className="text-sm font-semibold text-zinc-300">Your net</span>
                  <ResultMoney amount={playerNet} />
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
                className="rounded-2xl border border-cyan-400/40 bg-cyan-950/50 py-3 text-sm font-bold text-cyan-100 touch-manipulation active:bg-cyan-900/60"
              >
                Swaps
              </button>
            ) : (
              <button
                type="button"
                onClick={() => onRebuy?.()}
                className="rounded-2xl border border-emerald-400/40 bg-emerald-950/80 py-3 text-sm font-bold text-emerald-200 touch-manipulation active:bg-emerald-900"
              >
                Re-buy
              </button>
            )}
            <button
              type="button"
              onClick={() => onEndSession?.()}
              className="rounded-2xl border border-emerald-500 bg-emerald-500 py-3 text-sm font-bold text-white touch-manipulation active:bg-emerald-600"
            >
              End session
            </button>
          </div>
        ) : null}

        <button
          type="button"
          onClick={() => onEdit?.()}
          className="w-full rounded-2xl bg-emerald-600 py-3.5 text-base font-bold text-white touch-manipulation active:bg-emerald-500"
        >
          Edit session
        </button>
      </div>
    </div>
  )
}
