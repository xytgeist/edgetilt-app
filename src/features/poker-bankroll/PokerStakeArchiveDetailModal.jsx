import { DollarSign, Trophy, X } from 'lucide-react'
import { APP_MODAL_OVERLAY_CLASS, APP_MODAL_SHEET_PANEL_CLASS } from '../../constants/appZIndex.js'
import {
  fmtPoker$,
  fmtPokerBbPerHour,
  pokerSessionBbPerHour,
  pokerSessionDurationHours,
  pokerSessionWinLoss,
} from './pokerBankrollMath.js'
import {
  pokerSessionMetaLine,
  pokerSessionStakesLabel,
} from './pokerSessionLabels.js'
import {
  archivedStakeBackerEconomicsBreakdown,
  archivedStakeBackerSessionShareTotal,
  archivedStakePersonalBankrollBreakdown,
  buildFullStakeArchiveTimeline,
  viewerBackingSlice,
} from '../poker-stable/pokerStableDealHistory.js'
import { dealTypeLabel } from '../poker-stable/pokerStableMath.js'
import { sliceCounterpartyDisplayName } from '../poker-stable/pokerStableTerms.js'

function formatArchiveDate(iso) {
  return new Date(iso).toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

/**
 * Read-only archived stake history (sessions + deal events, chronological).
 */
export default function PokerStakeArchiveDetailModal({
  deal,
  slices = [],
  profilesById = {},
  topups = [],
  reductions = [],
  settlements = [],
  sessions = [],
  /** @type {'player' | 'backer'} */
  perspective = 'player',
  viewerUserId = null,
  onClose,
}) {
  if (!deal) return null

  const isBackerView = perspective === 'backer'
  const playerProfile = deal.stakee_user_id ? profilesById[deal.stakee_user_id] : null
  const playerDisplayName = playerProfile?.handle
    ? `@${playerProfile.handle}`
    : playerProfile?.display_name?.trim() || 'Player'

  const timeline = buildFullStakeArchiveTimeline({
    deal,
    slices,
    profilesById,
    topups,
    reductions,
    settlements,
    sessions,
    playerLabel: isBackerView ? playerDisplayName : 'You',
  })

  const backerNames = slices
    .filter((slice) => slice.status !== 'declined')
    .map((slice) => sliceCounterpartyDisplayName(slice, profilesById))
    .filter(Boolean)

  const dealLabel = deal.label?.trim() || dealTypeLabel(deal.deal_type)
  const closedAt = deal.settled_at || deal.responded_at || deal.updated_at
  const { total: personalBankrollNet, items: personalBankrollItems } =
    archivedStakePersonalBankrollBreakdown({ deal, slices, settlements })
  const personalBankrollNeutral = Math.abs(personalBankrollNet) < 0.005
  const settleCount = personalBankrollItems.length

  const { total: realizedBackingNet, items: realizedBackingItems } =
    archivedStakeBackerEconomicsBreakdown({
      deal,
      slices,
      settlements,
      viewerUserId,
    })
  const realizedBackingNeutral = Math.abs(realizedBackingNet) < 0.005
  const backerSettleCount = realizedBackingItems.length
  const sessionShareTotal = archivedStakeBackerSessionShareTotal({
    deal,
    slices,
    sessions,
    viewerUserId,
  })
  const sessionShareNeutral = Math.abs(sessionShareTotal) < 0.005
  const viewerSlice = viewerBackingSlice(slices, viewerUserId)
  const viewerActionPct = viewerSlice ? Number(viewerSlice.action_pct) || 0 : null

  return (
    <div className={`${APP_MODAL_OVERLAY_CLASS} overflow-x-hidden`} onClick={onClose}>
      <div
        data-poker-stake-archive-modal
        className={`relative z-10 w-full max-w-lg max-h-[90vh] overflow-y-auto ${APP_MODAL_SHEET_PANEL_CLASS}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="truncate text-lg font-bold text-white">{dealLabel}</h3>
            <p className="mt-0.5 text-xs text-zinc-500">
              {dealTypeLabel(deal.deal_type)}
              {closedAt ? ` · Closed ${formatArchiveDate(closedAt)}` : null}
            </p>
            {isBackerView ? (
              <p className="mt-1 text-xs text-zinc-400">Player: {playerDisplayName}</p>
            ) : backerNames.length ? (
              <p className="mt-1 text-xs text-zinc-400">
                Backers: {backerNames.join(', ')}
              </p>
            ) : null}
            {isBackerView && viewerActionPct != null ? (
              <p className="mt-0.5 text-[11px] text-zinc-500">Your slice · {viewerActionPct}%</p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-zinc-400 touch-manipulation active:bg-zinc-800"
            aria-label="Close archive detail"
          >
            <X className="h-5 w-5" strokeWidth={2.1} aria-hidden />
          </button>
        </div>

        {isBackerView ? (
          <>
            <div
              data-poker-stake-archive-summary
              data-poker-stake-archive-summary-kind="session-share"
              data-elevated-card="surface"
              className="mb-3 rounded-2xl border border-zinc-800/80 bg-zinc-900/50 px-4 py-3"
            >
              <div className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">
                Session share
              </div>
              <div
                className={`mt-0.5 text-xl font-black tabular-nums ${
                  sessionShareNeutral
                    ? 'text-zinc-400'
                    : sessionShareTotal >= 0
                      ? 'text-emerald-400'
                      : 'text-rose-400'
                }`}
              >
                {fmtPoker$(sessionShareTotal)}
              </div>
              <p className="mt-1 text-[11px] leading-snug text-zinc-500">
                Gross session W/L × your action % on completed sessions for this horse.
              </p>
            </div>
            <div
              data-poker-stake-archive-summary
              data-poker-stake-archive-summary-kind="realized-backing"
              data-elevated-card="surface"
              className="rounded-2xl border border-zinc-800/80 bg-zinc-900/50 px-4 py-3"
            >
              <div className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">
                Realized backing
              </div>
              <div
                className={`mt-0.5 text-xl font-black tabular-nums ${
                  realizedBackingNeutral
                    ? 'text-zinc-400'
                    : realizedBackingNet >= 0
                      ? 'text-emerald-400'
                      : 'text-rose-400'
                }`}
              >
                {fmtPoker$(realizedBackingNet)}
              </div>
              <p className="mt-1 text-[11px] leading-snug text-zinc-500">
                {backerSettleCount === 0
                  ? 'No settle events recorded for this stake.'
                  : realizedBackingNeutral
                    ? `${backerSettleCount} settle event${backerSettleCount === 1 ? '' : 's'} · no net credit to your backing bankroll.`
                    : `Sum of ${backerSettleCount} settle event${backerSettleCount === 1 ? '' : 's'} credited to Stable backing bankroll.`}
              </p>
              {backerSettleCount > 0 ? (
                <ul className="mt-2 space-y-1 border-t border-zinc-800/60 pt-2">
                  {realizedBackingItems.map((row) => (
                    <li
                      key={row.id}
                      className="flex items-baseline justify-between gap-3 text-[11px]"
                    >
                      <span className="text-zinc-500">{row.label}</span>
                      <span
                        className={`shrink-0 font-semibold tabular-nums ${
                          Math.abs(row.credit) < 0.005
                            ? 'text-zinc-500'
                            : row.credit >= 0
                              ? 'text-emerald-400'
                              : 'text-rose-400'
                        }`}
                      >
                        {Math.abs(row.credit) < 0.005 ? '$0' : fmtPoker$(row.credit)}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          </>
        ) : (
          <div
            data-poker-stake-archive-summary
            data-elevated-card="surface"
            className="rounded-2xl border border-zinc-800/80 bg-zinc-900/50 px-4 py-3"
          >
            <div className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">
              Personal bankroll
            </div>
            <div
              className={`mt-0.5 text-xl font-black tabular-nums ${
                personalBankrollNeutral
                  ? 'text-zinc-400'
                  : personalBankrollNet >= 0
                    ? 'text-emerald-400'
                    : 'text-rose-400'
              }`}
            >
              {fmtPoker$(personalBankrollNet)}
            </div>
            <p className="mt-1 text-[11px] leading-snug text-zinc-500">
              {settleCount === 0
                ? 'No settle events recorded for this stake.'
                : personalBankrollNeutral
                  ? `${settleCount} settle event${settleCount === 1 ? '' : 's'} · no net credit to personal bankroll.`
                  : `Sum of ${settleCount} settle event${settleCount === 1 ? '' : 's'} (periodic + close).`}
            </p>
            {settleCount > 0 ? (
              <ul className="mt-2 space-y-1 border-t border-zinc-800/60 pt-2">
                {personalBankrollItems.map((row) => (
                  <li
                    key={row.id}
                    className="flex items-baseline justify-between gap-3 text-[11px]"
                  >
                    <span className="text-zinc-500">{row.label}</span>
                    <span
                      className={`shrink-0 font-semibold tabular-nums ${
                        Math.abs(row.credit) < 0.005
                          ? 'text-zinc-500'
                          : row.credit >= 0
                            ? 'text-emerald-400'
                            : 'text-rose-400'
                      }`}
                    >
                      {Math.abs(row.credit) < 0.005 ? '$0' : fmtPoker$(row.credit)}
                    </span>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        )}

        <div
          data-poker-stake-archive-history-divider
          className="mb-4 mt-5 border-t-2 border-zinc-700/80 pt-4"
        >
          <div className="flex items-center gap-3">
            <h4 className="shrink-0 text-[11px] font-bold uppercase tracking-wide text-zinc-500">
              History
            </h4>
            <div className="h-px min-w-0 flex-1 bg-zinc-700/70" aria-hidden />
          </div>
        </div>

        {timeline.length === 0 ? (
          <p className="py-10 text-center text-sm text-zinc-500">No history recorded for this stake.</p>
        ) : (
          <ul className="space-y-2">
            {timeline.map((item) => {
              if (item.kind !== 'session') {
                return (
                  <li key={item.id} className="py-1.5 text-center">
                    <p
                      data-poker-stake-history-line
                      data-poker-stake-history-kind={item.kind}
                      className="text-sm italic leading-snug"
                    >
                      {item.text}
                      <span className="not-italic opacity-70"> · {formatArchiveDate(item.at)}</span>
                    </p>
                  </li>
                )
              }

              const session = item.session
              const wl = pokerSessionWinLoss(session)
              const hrs = pokerSessionDurationHours(session)
              const hourly = wl != null && hrs >= 0.02 ? wl / hrs : null
              const bbh = pokerSessionBbPerHour(session)

              return (
                <li key={item.id}>
                  <div
                    data-elevated-card="surface"
                    className="flex w-full items-start gap-3 rounded-2xl border border-zinc-800/80 bg-zinc-900/70 px-3 py-3"
                  >
                    <span
                      data-poker-session-type-icon={
                        session.session_type === 'tournament' ? 'tournament' : 'cash'
                      }
                      className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${
                        session.session_type === 'tournament'
                          ? 'bg-amber-500/15 text-amber-300'
                          : 'bg-emerald-500/15 text-emerald-300'
                      }`}
                      aria-hidden
                    >
                      {session.session_type === 'tournament' ? (
                        <Trophy className="h-4 w-4" strokeWidth={2.25} />
                      ) : (
                        <DollarSign className="h-4 w-4" strokeWidth={2.25} />
                      )}
                    </span>
                    <span className="min-w-0 flex-1">
                      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-x-2 gap-y-0.5">
                        <span className="truncate font-semibold text-white">
                          {pokerSessionStakesLabel(session)}
                        </span>
                        <span
                          className={`shrink-0 text-right font-bold tabular-nums ${
                            wl == null
                              ? 'text-zinc-500'
                              : wl >= 0
                                ? 'text-emerald-400'
                                : 'text-rose-400'
                          }`}
                        >
                          {wl == null ? '-' : fmtPoker$(wl)}
                        </span>
                        <span className="min-w-0 truncate text-[12px] text-zinc-500">
                          {pokerSessionMetaLine(session)}
                        </span>
                        <span className="shrink-0 text-right text-[10px] tabular-nums text-zinc-500">
                          {hourly != null ? `${fmtPoker$(hourly)}/hr` : null}
                          {bbh != null ? ` · ${fmtPokerBbPerHour(bbh)}` : null}
                        </span>
                      </div>
                    </span>
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </div>
  )
}
