import { useEffect, useState } from 'react'
import PokerBankrollHeroCarousel from '../poker-bankroll/PokerBankrollHeroCarousel.jsx'
import BankrollSparkline from '../../components/BankrollSparkline.jsx'
import { FileText, MessageCircle } from 'lucide-react'
import { fmtPoker$ } from '../poker-bankroll/pokerBankrollMath.js'
import {
  backerSliceEstimatedShare,
  backerSliceStakeValue,
} from './pokerStableBackerMath.js'
import { dealTypeLabel } from './pokerStableMath.js'
import PokerStableSettleNeedsAttnBanner from './PokerStableSettleNeedsAttnBanner.jsx'
import PokerStableClosedHorseHeroBanner from './PokerStableClosedHorseHeroBanner.jsx'
import { backerStableDealDisplayLabel, backerStableShowsClosedCarouselCard } from './pokerStableBackerMath.js'
import {
  backerSliceInviteSummaryLine,
  dealStakeeDisplayName,
  pendingBackerNudgeTargetsForActiveBacker,
  pendingSettleCommitsForDeal,
  sliceCounterpartyDisplayName,
  stableDealEdgeChatPeerUserId,
  stakeDealIsLiveForStakee,
  stakeHorseCardStatusLabel,
} from './pokerStableTerms.js'
import {
  stableHorseCardToneAttrForDeal,
  stableHorseCardToneForDeal,
} from './pokerStableHorseTone.js'

/**
 * Peek carousel of active horse stake cards (backer view).
 */
export default function PokerStableHorseCarousel({
  deals = [],
  labelDeals = [],
  /** All backer deals (incl. archived/hidden) for lifetime highlight color. */
  toneDeals = [],
  slicesByDeal = {},
  bankrollByDeal = {},
  statsByDeal = {},
  profilesById = {},
  userId,
  partyLabel,
  focusDealId = null,
  onFocusDealIdChange = null,
  onOpenDeal,
  onRevoke,
  onAcceptSlice,
  onDeclineSlice,
  onAcceptCounter,
  onDeclineCounter,
  onOpenTerms,
  /** Open Chat DM with Edge peer (null / omitted when guest counterpart). */
  onOpenChatWithUser = null,
  onNudgePendingBacker,
  nudgingSliceId = null,
  nudgeDisabled = false,
  saving = false,
  pendingCommits = [],
  horseSparkByDeal = {},
  onArchiveHorse,
  onOpenClosedHorseReview,
  /** Pulse pending Accept/Decline invite cards (breadcrumb first arrival). */
  highlightPendingInvite = false,
}) {
  const slides = deals.map((d) => ({ id: d.id }))
  const slideIdsKey = slides.map((s) => s.id).join('|')
  const [activeId, setActiveId] = useState(() => focusDealId || slides[0]?.id || null)

  useEffect(() => {
    if (!focusDealId || !slideIdsKey) return
    const ids = slideIdsKey.split('|')
    if (ids.includes(focusDealId)) setActiveId(focusDealId)
  }, [focusDealId, slideIdsKey])

  useEffect(() => {
    if (!slideIdsKey) return
    const ids = slideIdsKey.split('|')
    if (!activeId || !ids.includes(activeId)) setActiveId(ids[0])
  }, [slideIdsKey, activeId])

  if (!deals.length) return null

  const labelScope = labelDeals.length ? labelDeals : deals
  const toneScope = toneDeals.length ? toneDeals : labelScope

  return (
    <PokerBankrollHeroCarousel
      slides={slides}
      activeId={activeId || slides[0]?.id}
      onActiveIdChange={(id) => {
        setActiveId(id)
        onFocusDealIdChange?.(id)
      }}
      renderSlide={(slide) => {
        const dealIndex = deals.findIndex((d) => d.id === slide.id)
        const deal = dealIndex >= 0 ? deals[dealIndex] : null
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
        // Accepted backer sees roll/sessions even if co-backers still pending (deal may be pending briefly).
        const showBackerStats = sliceAccepted && (dealLive || deal.status === 'pending')
        const isPendingSyndicateInvite =
          slice?.status === 'pending' && deal.staker_user_id !== userId
        const isLeadBackerOnPendingDeal =
          deal.status === 'pending' && deal.staker_user_id === userId
        const pendingNudgeSlices = pendingBackerNudgeTargetsForActiveBacker(
          deal,
          dealSlices,
          userId,
        )
        const pendingSettleQueue = pendingSettleCommitsForDeal(pendingCommits, deal.id)
        const pendingSettleCommit = pendingSettleQueue[0] || null
        const pendingSettleCount = pendingSettleQueue.length
        const oldestSettleAt = pendingSettleQueue[0]?.created_at || null
        const newestSettleAt =
          pendingSettleCount > 1
            ? pendingSettleQueue[pendingSettleCount - 1]?.created_at || null
            : null
        const closedUnarchived = backerStableShowsClosedCarouselCard(deal, dealSlices, userId)
        const needsCounterAck =
          isLeadBackerOnPendingDeal && Boolean(deal.staker_terms_ack_required)
        const statusLabel = closedUnarchived
          ? 'Closed'
          : needsCounterAck
            ? 'Review'
            : slice?.status === 'pending'
              ? 'Pending'
              : stakeHorseCardStatusLabel(deal, dealSlices)
        const horseTone = stableHorseCardToneForDeal(deal.id, toneScope)
        const horseToneAttr = stableHorseCardToneAttrForDeal(deal.id, toneScope)
        const statusTone = closedUnarchived
          ? 'bg-zinc-700/60 text-zinc-300'
          : needsCounterAck
            ? 'bg-amber-500/20 text-amber-200'
            : slice?.status === 'pending'
              ? 'bg-zinc-700/60 text-zinc-300'
              : stakeDealIsLiveForStakee(deal, dealSlices)
                ? horseTone.statusActive
                : 'bg-zinc-700/60 text-zinc-400'
        const sparkSeries = horseSparkByDeal[deal.id] || []
        // Require this deal's sessions (not portfolio-padded points from other horses).
        const showSparkBackground =
          showBackerStats &&
          !pendingSettleCommit &&
          !closedUnarchived &&
          (stats.sessions || 0) >= 1 &&
          sparkSeries.length >= 2
        // Match Sessions / Unsettled tone … not padded trend first/last (can disagree after settles).
        const sparkUp = (stats.profit ?? 0) >= 0
        const cardClassName = `relative flex w-full flex-col overflow-hidden ${horseTone.surface} p-5 text-left`
        const chatPeerUserId = stableDealEdgeChatPeerUserId(deal, userId)
        const showChatBtn = Boolean(chatPeerUserId && typeof onOpenChatWithUser === 'function')

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
              strokeClassName={sparkUp ? 'stroke-emerald-300/15' : 'stroke-rose-300/15'}
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
                {backerStableDealDisplayLabel(deal, labelScope)}
              </div>
            </div>
            <div
              className="flex shrink-0 items-center gap-1.5"
              onClick={(e) => e.stopPropagation()}
            >
              {showChatBtn ? (
                <button
                  type="button"
                  data-poker-stable-chat-btn
                  onClick={(e) => {
                    e.stopPropagation()
                    onOpenChatWithUser?.(chatPeerUserId)
                  }}
                  className="flex h-9 w-9 items-center justify-center rounded-xl text-cyan-300 touch-manipulation active:bg-white/5"
                  aria-label="Chat"
                  title="Chat"
                >
                  <MessageCircle className="h-[18px] w-[18px]" strokeWidth={2.1} aria-hidden />
                </button>
              ) : null}
              <span
                data-poker-stable-horse-status={String(statusLabel || '').toLowerCase()}
                className={`rounded-full border border-transparent px-2 py-0.5 text-[10px] font-bold uppercase ${statusTone}`}
              >
                {statusLabel}
              </span>
            </div>
          </div>
        )

        const pendingNudgeBlock =
          pendingNudgeSlices.length > 0 ? (
            <div
              data-poker-stake-pending-backers
              className={`mt-3 space-y-1.5 border-t ${horseTone.divider} pt-3 text-left`}
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
                      data-poker-stake-nudge-btn
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
                      className={`mt-4 border-t ${horseTone.divider} pt-3`}
                      onClick={(e) => e.stopPropagation()}
                    >
                      <PokerStableSettleNeedsAttnBanner
                        counterpartyName={dealStakeeDisplayName(deal, profilesById)}
                        settleCount={pendingSettleCount}
                        oldestSettleAt={oldestSettleAt}
                        newestSettleAt={newestSettleAt}
                        onReview={() => onOpenDeal?.(deal.id)}
                      />
                    </div>
                    {pendingNudgeBlock}
                  </>
                ) : (
                  <div
                    className={`relative mt-4 flex min-h-[9rem] flex-1 flex-col overflow-visible border-t ${horseTone.divider} pt-3 pb-2 text-center`}
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
                        <div className={`mt-0.5 text-lg font-black tabular-nums ${horseTone.accent}`}>
                          {fmtPoker$(stakeVal)}
                        </div>
                      </div>
                      <div>
                        <div className="text-[10px] font-bold uppercase text-zinc-500">Unsettled</div>
                        <div className="mt-0.5 text-sm font-bold tabular-nums text-emerald-300">
                          {fmtPoker$(estShare)}
                        </div>
                      </div>
                      <div>
                        <div className="text-[10px] font-bold uppercase text-zinc-500">Sessions</div>
                        <div className="mt-0.5 flex items-center justify-center text-sm font-bold tabular-nums">
                          <span className={profitTone}>{stats.sessions}</span>
                          <span
                            data-poker-stable-sessions-sep
                            className="mx-1.5 h-3 w-px shrink-0 self-center bg-zinc-600"
                            aria-hidden
                          />
                          <span className={profitTone}>{fmtPoker$(stats.profit)}</span>
                        </div>
                      </div>
                    </div>
                    {pendingNudgeBlock}
                  </div>
                )}
              </>
            ) : closedUnarchived ? (
              <div
                className={`mt-4 border-t ${horseTone.divider} pt-3`}
                onClick={(e) => e.stopPropagation()}
              >
                {pendingSettleCommit ? (
                  <PokerStableSettleNeedsAttnBanner
                    counterpartyName={dealStakeeDisplayName(deal, profilesById)}
                    settleCount={pendingSettleCount}
                    oldestSettleAt={oldestSettleAt}
                    newestSettleAt={newestSettleAt}
                    onReview={() => onOpenDeal?.(deal.id)}
                  />
                ) : (
                  <PokerStableClosedHorseHeroBanner
                    deal={deal}
                    profilesById={profilesById}
                    userId={userId}
                    saving={saving}
                    onArchive={() => void onArchiveHorse?.(deal.id)}
                    onReview={() => onOpenClosedHorseReview?.(deal.id)}
                  />
                )}
              </div>
            ) : isPendingSyndicateInvite ? (
              <div
                data-poker-stable-horse-invite
                className={`mt-4 border-t ${horseTone.divider} pt-3 text-left`}
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
                {needsCounterAck ? (
                  <div
                    data-poker-stable-counter-ack
                    className={`mt-3 space-y-2 border-t ${horseTone.divider} pt-3 text-left`}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <p className="text-xs leading-snug text-amber-200/90">
                      {dealStakeeDisplayName(deal, profilesById)} proposed revised terms. Accept to
                      apply them and go live (their send was an implied accept), decline to keep your
                      original offer, or review details.
                    </p>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => onOpenTerms?.(deal.id)}
                        className="rounded-2xl bg-zinc-800 px-4 py-2.5 text-sm font-semibold text-zinc-200 touch-manipulation"
                      >
                        Review terms
                      </button>
                    </div>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        disabled={saving}
                        onClick={() => void onAcceptCounter?.(deal.id)}
                        className="flex-1 rounded-2xl bg-emerald-600 py-2.5 text-sm font-bold text-white touch-manipulation disabled:opacity-50"
                      >
                        Accept counter
                      </button>
                      <button
                        type="button"
                        disabled={saving}
                        onClick={() => void onDeclineCounter?.(deal.id)}
                        className="flex-1 rounded-2xl bg-zinc-700 py-2.5 text-sm font-semibold text-zinc-200 touch-manipulation disabled:opacity-50"
                      >
                        Decline
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <p className="mt-3 text-xs text-zinc-400">
                      {slice?.status === 'pending'
                        ? 'Pending acceptance'
                        : `Waiting for ${dealStakeeDisplayName(deal, profilesById)} to accept this stake.`}
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
                )}
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
              data-poker-stable-horse-tone={horseToneAttr}
              data-poker-offer-attention-pulse={highlightPendingInvite ? '1' : undefined}
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
            data-poker-stable-horse-tone={horseToneAttr}
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
