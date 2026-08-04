import { DollarSign, Trophy } from 'lucide-react'
import {
  fmtPoker$,
  pokerSessionBbPerHour,
  pokerSessionDurationHours,
  pokerSessionWinLoss,
} from '../poker-bankroll/pokerBankrollMath.js'
import {
  pokerSessionMetaLine,
  pokerSessionStakesLabel,
} from '../poker-bankroll/pokerSessionLabels.js'
import {
  backerSliceSessionEconomicShare,
  viewerActiveBackingSlice,
} from './pokerStableBackerMath.js'
import { playerStakeSessionValue } from '../poker-bankroll/pokerSessionAttribution.js'
import { sessionPlayerShareInMakeup } from '../poker-bankroll/pokerSessionAttribution.js'

export function PokerStableDealSessionCard({
  session,
  deal,
  slices = [],
  userId,
  dealSessions = [],
  onOpenSession,
}) {
  const viewerSlice = viewerActiveBackingSlice(deal?.id, { [deal?.id]: slices }, userId)
  const displayWl = pokerSessionWinLoss(session)
  const isStakee = deal?.stakee_user_id === userId
  const playerShareInMakeup =
    isStakee && deal && sessionPlayerShareInMakeup(deal, session, dealSessions)
  const economicShare = (() => {
    if (viewerSlice && deal) {
      return backerSliceSessionEconomicShare(deal, viewerSlice, session, dealSessions)
    }
    if (isStakee && deal && !playerShareInMakeup) {
      return playerStakeSessionValue(session, deal, slices, dealSessions)
    }
    return null
  })()
  const hrs = pokerSessionDurationHours(session)
  const hourly = displayWl != null && hrs >= 0.02 ? displayWl / hrs : null
  const bbh = pokerSessionBbPerHour(session)

  const content = (
    <>
      <span
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
              displayWl == null
                ? 'text-zinc-500'
                : displayWl >= 0
                  ? 'text-emerald-400'
                  : 'text-rose-400'
            }`}
          >
            {displayWl == null ? '-' : fmtPoker$(displayWl)}
          </span>
          <span className="min-w-0 truncate text-[12px] text-zinc-500">
            {pokerSessionMetaLine(session)}
          </span>
          {economicShare != null ? (
            <span
              data-poker-session-player-share
              className="shrink-0 whitespace-nowrap text-right text-[10px] font-medium tabular-nums text-zinc-500"
            >
              Your share{' '}
              <span
                className={
                  economicShare >= 0 ? 'text-emerald-400/85' : 'text-rose-400/85'
                }
              >
                {fmtPoker$(economicShare)}
              </span>
            </span>
          ) : null}
        </div>
        <span className="mt-0.5 block truncate text-[11px] text-zinc-600">
          {new Date(session.start_at).toLocaleDateString('en-US', {
            weekday: 'short',
            month: 'short',
            day: 'numeric',
            year: 'numeric',
          })}
          {hourly != null ? ` · ${fmtPoker$(hourly)}/h` : ''}
          {bbh != null ? ` · ${bbh.toFixed(1)} BB/h` : ''}
        </span>
      </span>
    </>
  )

  if (onOpenSession) {
    return (
      <button
        type="button"
        onClick={() => onOpenSession(session)}
        data-elevated-card="surface"
        className="flex w-full items-start gap-3 rounded-2xl border border-zinc-800/80 bg-zinc-900/70 px-3 py-3 text-left touch-manipulation active:bg-zinc-800/80"
      >
        {content}
      </button>
    )
  }

  return (
    <div
      data-elevated-card="surface"
      className="flex w-full items-start gap-3 rounded-2xl border border-zinc-800/80 bg-zinc-900/70 px-3 py-3"
    >
      {content}
    </div>
  )
}

/**
 * Completed stake session cards (player stake overview layout; backer "Your share" uses slice economics).
 */
export default function PokerStableDealSessionList({
  sessions = [],
  deal,
  slices = [],
  userId,
  onOpenSession,
}) {
  const dealSessions = sessions.filter((s) => s.deal_id === deal?.id && s.status !== 'active')

  if (!dealSessions.length) {
    return (
      <div
        data-elevated-card="surface"
        className="rounded-3xl border border-zinc-800 bg-zinc-900/50 px-4 py-10 text-center"
      >
        <p className="font-semibold text-white">No stake sessions yet</p>
        <p className="mt-1 text-sm text-zinc-500">Sessions logged on this horse appear here.</p>
      </div>
    )
  }

  const ordered = dealSessions
    .slice()
    .sort(
      (a, b) =>
        new Date(b.end_at || b.start_at).getTime() - new Date(a.end_at || a.start_at).getTime(),
    )

  return (
    <ul className="space-y-2">
      {ordered.map((session) => (
        <li key={session.id}>
          <PokerStableDealSessionCard
            session={session}
            deal={deal}
            slices={slices}
            userId={userId}
            dealSessions={dealSessions}
            onOpenSession={onOpenSession}
          />
        </li>
      ))}
    </ul>
  )
}
