import { useMemo } from 'react'
import BankrollSparkline from '../../components/BankrollSparkline.jsx'
import { triggerTapHapticLight } from '../../utils/tapHaptic.js'
import { fmtPoker$ } from '../poker-bankroll/pokerBankrollMath.js'
import {
  backerSliceEstimatedShare,
  backerSliceStakeValue,
  viewerActiveBackingSlice,
} from './pokerStableBackerMath.js'
import { buildStakeDealHistoryEvents } from './pokerStableDealHistory.js'
import {
  computeDealMakeup,
  dealTypeLabel,
} from './pokerStableMath.js'
import { dealHasMakeup, dealStakeeDisplayName } from './pokerStableTerms.js'
import {
  STABLE_ACCENT_TEXT,
  STABLE_SURFACE_CARD,
  STABLE_SURFACE_DIVIDER,
} from './pokerStableUi.js'
import PokerStableDealSessionList, {
  PokerStableDealSessionCard,
} from './PokerStableDealSessionList.jsx'
import {
  computeDealRollSparkSeries,
  computeDealSessionHeroStats,
} from './pokerStableDealSessionStats.js'

function HeroStat({ label, value, tone = 'neutral' }) {
  const toneClass =
    tone === 'good' ? 'text-emerald-400' : tone === 'bad' ? 'text-rose-400' : 'text-white'
  return (
    <div className="min-w-0 text-center">
      <div className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">{label}</div>
      <div className={`mt-0.5 truncate text-sm font-bold tabular-nums sm:text-base ${toneClass}`}>
        {value}
      </div>
    </div>
  )
}

/**
 * Backer horse deal overview: summary hero + session history (player stake parity).
 */
export default function PokerStableDealOverviewPanel({
  deal,
  slices = [],
  roll,
  profilesById = {},
  userId,
  sessions = [],
  topups = [],
  reductions = [],
  settlements = [],
  ledgerEntries = [],
  onOpenTrend,
  onOpenSession,
  canProposeSettle = false,
  showPeriodicSettle = false,
  settleBlockedPending = false,
  settleBlockedMessage = '',
  saving = false,
  profitUp = 0,
  onOpenPeriodicSettle,
  onOpenCloseStake,
  showArchive = false,
  onArchive = null,
  archiveBlockedPendingSettle = false,
}) {
  const rollValue = roll?.overall_bankroll ?? deal?.starting_roll ?? deal?.baseline_bankroll ?? 0
  const baseline = deal?.baseline_bankroll ?? 0
  const showMakeup = dealHasMakeup(deal)
  const makeup = computeDealMakeup({ baseline_bankroll: baseline, roll: rollValue })
  const dealSessions = useMemo(
    () => sessions.filter((s) => s.deal_id === deal?.id && s.status !== 'active'),
    [sessions, deal?.id],
  )
  const heroStats = useMemo(() => computeDealSessionHeroStats(dealSessions), [dealSessions])
  const sparkSeries = useMemo(
    () => computeDealRollSparkSeries(dealSessions, rollValue),
    [dealSessions, rollValue],
  )
  const viewerSlice = viewerActiveBackingSlice(deal?.id, { [deal?.id]: slices }, userId)
  const stakeMtm = viewerSlice ? backerSliceStakeValue(deal, viewerSlice, roll) : 0
  const estShare = viewerSlice
    ? backerSliceEstimatedShare(deal, viewerSlice, roll, dealSessions)
    : 0

  const historyFeed = useMemo(() => {
    const sessionItems = dealSessions.map((session) => ({
      kind: 'session',
      id: session.id,
      at: session.end_at || session.start_at,
      session,
    }))
    const historyEvents = buildStakeDealHistoryEvents({
      deal,
      slices,
      profilesById,
      topups,
      reductions,
      settlements,
      ledgerEntries,
      viewerUserId: userId,
    })
    const eventItems = historyEvents.map((event) => ({
      kind: 'event',
      id: event.id,
      at: event.at,
      event,
    }))
    return [...sessionItems, ...eventItems].sort(
      (a, b) => new Date(b.at).getTime() - new Date(a.at).getTime(),
    )
  }, [
    deal,
    dealSessions,
    slices,
    profilesById,
    topups,
    reductions,
    settlements,
    ledgerEntries,
    userId,
  ])

  return (
    <div data-poker-stable-deal-overview className="pb-2">
      <div data-poker-stable-surface-card className={`mb-4 ${STABLE_SURFACE_CARD} px-5 py-4`}>
        <div className="mb-2 min-w-0">
          <div className="truncate text-lg font-black text-white">
            {dealStakeeDisplayName(deal, profilesById)}
          </div>
          <div className="mt-0.5 truncate text-sm text-zinc-400">
            {deal.label?.trim() || dealTypeLabel(deal.deal_type)}
          </div>
        </div>

        <div
          className={`mb-3 grid gap-2 rounded-2xl border ${STABLE_SURFACE_DIVIDER} bg-zinc-900/40 p-3 text-center ${
            showMakeup ? 'grid-cols-3' : 'grid-cols-2'
          }`}
        >
          <div>
            <div className="text-[10px] font-semibold uppercase text-zinc-500">Baseline</div>
            <div className="mt-0.5 text-sm font-bold tabular-nums text-white">
              {fmtPoker$(baseline)}
            </div>
          </div>
          <div>
            <div className="text-[10px] font-semibold uppercase text-zinc-500">Horse roll</div>
            <div className="mt-0.5 text-sm font-bold tabular-nums text-white">
              {fmtPoker$(rollValue)}
            </div>
          </div>
          {showMakeup ? (
            <div>
              <div className="text-[10px] font-semibold uppercase text-zinc-500">Make-up</div>
              <div className="mt-0.5 text-sm font-bold tabular-nums text-rose-400">
                {fmtPoker$(makeup)}
              </div>
            </div>
          ) : null}
        </div>

        {viewerSlice ? (
          <div className="mb-3 grid grid-cols-2 gap-3 text-center">
            <div>
              <div className="text-[10px] font-bold uppercase text-zinc-500">Your stake MTM</div>
              <div className={`mt-0.5 text-lg font-black tabular-nums ${STABLE_ACCENT_TEXT}`}>
                {fmtPoker$(stakeMtm)}
              </div>
            </div>
            <div>
              <div className="text-[10px] font-bold uppercase text-zinc-500">Unsettled</div>
              <div className="mt-0.5 text-lg font-black tabular-nums text-emerald-300">
                {fmtPoker$(estShare)}
              </div>
            </div>
          </div>
        ) : null}

        {sparkSeries.length >= 2 ? (
          <div className="mb-3 h-9 w-full" data-poker-stable-deal-sparkline>
            {onOpenTrend ? (
              <button
                type="button"
                onClick={onOpenTrend}
                className="block h-full w-full touch-manipulation active:opacity-80"
                aria-label="Open Trend chart"
              >
                <BankrollSparkline series={sparkSeries} className="h-full w-full" />
              </button>
            ) : (
              <BankrollSparkline series={sparkSeries} className="h-full w-full" />
            )}
          </div>
        ) : null}

        <div className={`grid grid-cols-4 gap-2 border-t ${STABLE_SURFACE_DIVIDER} pt-3`}>
          <HeroStat
            label="Profit"
            value={fmtPoker$(heroStats.profit)}
            tone={heroStats.profit >= 0 ? 'good' : 'bad'}
          />
          <HeroStat
            label="Hourly"
            value={heroStats.hourly == null ? '-' : fmtPoker$(heroStats.hourly)}
            tone={
              heroStats.hourly == null
                ? 'neutral'
                : heroStats.hourly >= 0
                  ? 'good'
                  : 'bad'
            }
          />
          <HeroStat label="Hours" value={heroStats.hours.toFixed(1)} />
          <HeroStat
            label="Win rate"
            value={heroStats.winRate == null ? '-' : `${heroStats.winRate}%`}
          />
        </div>

        {canProposeSettle ? (
          <div className={`mt-3 border-t ${STABLE_SURFACE_DIVIDER} pt-3`}>
            {settleBlockedPending ? (
              <p
                data-poker-stable-settle-blocked
                className="mb-2 border-l-2 border-amber-500/70 pl-3 text-xs leading-relaxed text-amber-100"
              >
                {settleBlockedMessage}
              </p>
            ) : (
              <p className="mb-2 text-xs leading-relaxed text-zinc-500">
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
                onClick={onOpenPeriodicSettle}
                className="mb-2 w-full rounded-3xl bg-emerald-600 py-3 text-base font-bold text-white touch-manipulation disabled:opacity-50"
              >
                Periodic settlement
              </button>
            ) : null}
            <button
              type="button"
              disabled={saving || settleBlockedPending}
              onClick={onOpenCloseStake}
              className={`w-full rounded-3xl py-3 text-base font-bold touch-manipulation disabled:opacity-50 ${
                showPeriodicSettle ? 'bg-zinc-800 text-zinc-100' : 'bg-emerald-600 text-white'
              }`}
            >
              Close stake
            </button>
          </div>
        ) : null}

        {showArchive ? (
          <div className={`mt-3 border-t ${STABLE_SURFACE_DIVIDER} pt-3`}>
            <button
              type="button"
              disabled={saving || archiveBlockedPendingSettle}
              data-poker-stable-archive-btn
              onClick={() => {
                if (archiveBlockedPendingSettle) return
                triggerTapHapticLight()
                onArchive?.()
              }}
              className="w-full rounded-3xl bg-amber-600 py-3 text-base font-bold text-white touch-manipulation active:bg-amber-500 disabled:opacity-50"
            >
              Archive stake
            </button>
            {archiveBlockedPendingSettle ? (
              <p className="mt-2 text-center text-[11px] leading-snug text-zinc-500">
                Commit the settlement above before archiving this stake.
              </p>
            ) : null}
          </div>
        ) : null}
      </div>

      <div className="mb-3 flex items-center gap-3">
        <h4 className="shrink-0 text-[11px] font-bold uppercase tracking-wide text-zinc-500">
          History
        </h4>
        <div className="h-px min-w-0 flex-1 bg-zinc-700/70" aria-hidden />
      </div>

      {historyFeed.length === 0 ? (
        <PokerStableDealSessionList
          sessions={sessions}
          deal={deal}
          slices={slices}
          userId={userId}
          onOpenSession={onOpenSession}
        />
      ) : (
        <ul className="space-y-2">
          {historyFeed.map((item) => {
            if (item.kind === 'event') {
              const eventDate = new Date(item.at).toLocaleDateString('en-US', {
                weekday: 'short',
                month: 'short',
                day: 'numeric',
                year: 'numeric',
              })
              return (
                <li key={item.id} className="py-1.5 text-center">
                  <p
                    data-poker-stake-history-line
                    data-poker-stake-history-kind={item.event.kind}
                    className="text-sm italic leading-snug text-emerald-300/90"
                  >
                    {item.event.text}
                    <span className="not-italic opacity-70"> · {eventDate}</span>
                  </p>
                </li>
              )
            }

            return (
              <li key={item.session.id}>
                <PokerStableDealSessionCard
                  session={item.session}
                  deal={deal}
                  slices={slices}
                  userId={userId}
                  dealSessions={dealSessions}
                  onOpenSession={onOpenSession}
                />
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
