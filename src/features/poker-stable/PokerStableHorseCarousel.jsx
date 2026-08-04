import PokerBankrollHeroCarousel from '../poker-bankroll/PokerBankrollHeroCarousel.jsx'
import BankrollSparkline from '../../components/BankrollSparkline.jsx'
import { FileText } from 'lucide-react'
import { fmtPoker$ } from '../poker-bankroll/pokerBankrollMath.js'
import {
  backerSliceEstimatedShare,
  backerSliceStakeValue,
} from './pokerStableBackerMath.js'
import { dealTypeLabel } from './pokerStableMath.js'
import PokerStableSettleNeedsAttnBanner from './PokerStableSettleNeedsAttnBanner.jsx'
import {
  backerSliceInviteSummaryLine,
  dealStakeeDisplayName,
  pendingBackerNudgeTargetsForActiveBacker,
  pendingSettleCommitForDeal,
  sliceCounterpartyDisplayName,
  stakeHorseCardStatusLabel,
  stakeHorseCardStatusTone,
} from './pokerStableTerms.js'
import { STABLE_ACCENT_TEXT, STABLE_SURFACE_CARD, STABLE_SURFACE_DIVIDER } from './pokerStableUi.js'

/**
 * Peek carousel of active horse stake cards (backer view).
 */
export default function PokerStableHorseCarousel({
  deals = [],
  slicesByDeal = {},
  bankrollByDeal = {},
  statsByDeal = {},
  profilesById = {},
  userId,
  partyLabel,
  onOpenDeal,
  onRevoke,
  onAcceptSlice,
  onDeclineSlice,
  onOpenTerms,
  onNudgePendingBacker,
  nudgingSliceId = null,
  nudgeDisabled = false,
  saving = false,
  pendingCommits = [],
  horseSparkByDeal = {},
  onReviewSettleCommit,
}) {
  if (!deals.length) return null

  const slides = deals.map((d) => ({ id: d.id }))

  return (
    <PokerBankrollHeroCarousel
      slides={slides}
      activeId={slides[0]?.id}
      onActiveIdChange={() => {}}
      renderSlide={(slide) => {
        const deal = deals.find((d) => d.id === slide.id)
        if (!deal) return null
        const dealSlices = slicesByDeal[deal.id] || []
        const slice =
          dealSlices.find((s) => s.staker_user_id === userId && s.status === 'active') ||
          dealSlices.find((s) => s.staker_user_id === userId)
        const roll = bankrollByDeal[deal.id]
        const stats = statsByDeal[deal.id] || { sessions: 0, profit: 0 }
        const stakeVal = slice ? backerSliceStakeValue(deal, slice, roll) : 0
        const estShare = slice ? backerSliceEstimatedShare(deal, slice, roll) : 0
        const profitTone =
          stats.profit > 0 ? 'text-emerald-400' : stats.profit < 0 ? 'text-rose-400' : 'text-zinc-300'
        const sliceAccepted = slice?.status === 'active'
        const dealLive = deal.status === 'active'
        const showBackerStats = sliceAccepted && dealLive
        const isPendingSyndicateInvite =
          slice?.status === 'pending' && deal.staker_user_id !== userId
        const isLeadBackerOnPendingDeal =
          deal.status === 'pending' && deal.staker_user_id === userId
        const statusLabel =
          slice?.status === 'pending' ? 'Pending' : stakeHorseCardStatusLabel(deal, dealSlices)
        const statusTone =
          slice?.status === 'pending'
            ? 'bg-zinc-700/60 text-zinc-300'
            : stakeHorseCardStatusTone(deal, dealSlices)
        const pendingNudgeSlices = pendingBackerNudgeTargetsForActiveBacker(
          deal,
          dealSlices,
          userId,
        )
        const pendingSettleCommit = pendingSettleCommitForDeal(pendingCommits, deal.id)
        const sparkSeries = horseSparkByDeal[deal.id] || []
        const showSparkBackground =
          showBackerStats && !pendingSettleCommit && sparkSeries.length >= 2
        const sparkUp =
          sparkSeries.length >= 2 &&
          sparkSeries[sparkSeries.length - 1] >= sparkSeries[0]
        const cardClassName = `relative flex w-full flex-col overflow-hidden ${STABLE_SURFACE_CARD} p-5 text-left`

        const statsSparkBackground = showSparkBackground ? (
          <div
            className="pointer-events-none absolute -bottom-5 -left-5 -right-5 top-0 z-0"
            data-poker-stable-horse-sparkline-bg
            aria-hidden
          >
            <BankrollSparkline
              series={sparkSeries}
              showFill
              className="h-full w-full"
              upClass="text-emerald-400"
              downClass="text-rose-400"
              fillClassName={
                sparkUp ? 'fill-emerald-400/[0.08]' : 'fill-rose-400/[0.08]'
              }
              strokeClassName={sparkUp ? 'stroke-emerald-400/35' : 'stroke-rose-400/35'}
            />
          </div>
        ) : null

        const header = (
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="truncate text-xl font-black text-white">
                {partyLabel?.(deal, 'staker')}
              </div>
              <div className="mt-0.5 truncate text-sm text-zinc-400">
                {deal.label || dealTypeLabel(deal.deal_type)}
              </div>
            </div>
            <span
              className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${statusTone}`}
            >
              {statusLabel}
            </span>
          </div>
        )

        const pendingNudgeBlock =
          pendingNudgeSlices.length > 0 ? (
            <div
              data-poker-stake-pending-backers
              className={`mt-3 space-y-1.5 border-t ${STABLE_SURFACE_DIVIDER} pt-3 text-left`}
              onClick={(e) => e.stopPropagation()}
            >
              {pendingNudgeSlices.map((pendingSlice) => {
                const backerName = sliceCounterpartyDisplayName(pendingSlice, profilesById)
                const nudging = nudgingSliceId === pendingSlice.id
                return (
                  <div
                    key={pendingSlice.id}
                    className="flex items-center justify-between gap-2 rounded-xl border border-cyan-500/15 bg-cyan-950/20 px-2.5 py-2"
                  >
                    <span className="min-w-0 text-xs leading-snug text-cyan-100/90">
                      Pending acceptance by {backerName}
                    </span>
                    <button
                      type="button"
                      disabled={Boolean(nudgingSliceId) || nudgeDisabled}
                      onClick={(e) => {
                        e.stopPropagation()
                        void onNudgePendingBacker?.(deal.id, pendingSlice.id)
                      }}
                      className="shrink-0 rounded-lg bg-cyan-500/20 px-2.5 py-1 text-[11px] font-semibold text-cyan-200 touch-manipulation active:bg-cyan-500/30 disabled:opacity-50"
                    >
                      {nudging ? 'Sending…' : 'Nudge'}
                    </button>
                  </div>
                )
              })}
            </div>
          ) : null

        const body = showBackerStats ? (
              <>
                {pendingSettleCommit ? (
                  <>
                    <div
                      className={`mt-4 border-t ${STABLE_SURFACE_DIVIDER} pt-3`}
                      onClick={(e) => e.stopPropagation()}
                    >
                      <PokerStableSettleNeedsAttnBanner
                        counterpartyName={dealStakeeDisplayName(deal, profilesById)}
                        onReview={() =>
                          onReviewSettleCommit?.(String(pendingSettleCommit.commit_id))
                        }
                      />
                    </div>
                    {pendingNudgeBlock}
                  </>
                ) : (
                  <div
                    className={`relative mt-4 flex min-h-[9rem] flex-1 flex-col overflow-visible border-t ${STABLE_SURFACE_DIVIDER} pt-3 pb-2 text-center`}
                  >
                    {statsSparkBackground}
                    <div className="relative z-10 grid grid-cols-2 gap-3">
                      <div>
                        <div className="text-[10px] font-bold uppercase text-zinc-500">Horse roll</div>
                        <div className="mt-0.5 text-lg font-black tabular-nums text-white">
                          {roll
                            ? fmtPoker$(roll.overall_bankroll)
                            : fmtPoker$(deal.starting_roll ?? deal.baseline_bankroll ?? 0)}
                        </div>
                      </div>
                      <div>
                        <div className="text-[10px] font-bold uppercase text-zinc-500">
                          Your stake MTM
                        </div>
                        <div className={`mt-0.5 text-lg font-black tabular-nums ${STABLE_ACCENT_TEXT}`}>
                          {fmtPoker$(stakeVal)}
                        </div>
                      </div>
                      <div>
                        <div className="text-[10px] font-bold uppercase text-zinc-500">Est. share</div>
                        <div className="mt-0.5 text-sm font-bold tabular-nums text-emerald-300">
                          {fmtPoker$(estShare)}
                        </div>
                      </div>
                      <div>
                        <div className="text-[10px] font-bold uppercase text-zinc-500">Sessions</div>
                        <div className={`mt-0.5 text-sm font-bold tabular-nums ${profitTone}`}>
                          {stats.sessions} · {fmtPoker$(stats.profit)}
                        </div>
                      </div>
                    </div>
                    {pendingNudgeBlock}
                  </div>
                )}
              </>
            ) : isPendingSyndicateInvite ? (
              <div
                data-poker-stable-horse-invite
                className={`mt-4 border-t ${STABLE_SURFACE_DIVIDER} pt-3 text-left`}
                onClick={(e) => e.stopPropagation()}
              >
                <div className="flex items-stretch gap-2">
                  <p className="min-w-0 flex-1 text-sm font-semibold leading-snug text-white">
                    {backerSliceInviteSummaryLine(deal, slice, profilesById)}
                  </p>
                  <button
                    type="button"
                    onClick={() => onOpenTerms?.(deal.id)}
                    className="flex w-9 shrink-0 items-center justify-center self-stretch rounded-xl text-zinc-400 touch-manipulation active:opacity-80"
                    aria-label="Stake terms"
                    data-poker-stable-terms-icon
                  >
                    <FileText className="h-[18px] w-[18px]" strokeWidth={2.1} aria-hidden />
                  </button>
                </div>
                {deal.stakee_terms_ack_required ? (
                  <p className="mt-2 text-xs text-amber-200/90">
                    Waiting for the player to accept revised terms before you can accept your slice.
                  </p>
                ) : null}
                <div className="mt-3 flex gap-2">
                  <button
                    type="button"
                    disabled={saving}
                    onClick={() => void onDeclineSlice?.(slice.id)}
                    className="flex-1 rounded-2xl bg-zinc-700 py-2.5 text-sm font-semibold text-zinc-200 touch-manipulation disabled:opacity-50"
                  >
                    Decline
                  </button>
                  <button
                    type="button"
                    disabled={saving || deal.stakee_terms_ack_required}
                    onClick={() => void onAcceptSlice?.(slice.id)}
                    className="flex-1 rounded-2xl bg-emerald-600 py-2.5 text-sm font-bold text-white touch-manipulation disabled:opacity-50"
                  >
                    Accept
                  </button>
                </div>
              </div>
            ) : isLeadBackerOnPendingDeal ? (
              <>
                <p className="mt-3 text-xs text-zinc-400">
                  {slice?.status === 'pending'
                    ? 'Pending acceptance'
                    : 'Waiting for the player to accept this stake.'}
                </p>
                {pendingNudgeBlock}
                <span
                  role="button"
                  tabIndex={0}
                  onClick={(e) => {
                    e.stopPropagation()
                    void onRevoke?.(deal.id)
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.stopPropagation()
                      void onRevoke?.(deal.id)
                    }
                  }}
                  className="mt-3 block w-full rounded-xl py-2 text-center text-xs font-semibold text-zinc-500 touch-manipulation active:text-zinc-300"
                >
                  Revoke deal
                </span>
              </>
            ) : null

        const cardInner = (
          <>
            {header}
            <div className="flex flex-1 flex-col">{body}</div>
          </>
        )

        if (isPendingSyndicateInvite) {
          return (
            <div
              data-poker-stable-horse-card
              data-elevated-card="surface"
              className={cardClassName}
            >
              {cardInner}
            </div>
          )
        }

        return (
          <button
            type="button"
            onClick={() => onOpenDeal?.(deal.id)}
            data-poker-stable-horse-card
            data-elevated-card="surface"
            className={`${cardClassName} touch-manipulation`}
          >
            {cardInner}
          </button>
        )
      }}
    />
  )
}
