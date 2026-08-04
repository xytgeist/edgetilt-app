import PokerBankrollHeroCarousel from '../poker-bankroll/PokerBankrollHeroCarousel.jsx'
import { fmtPoker$ } from '../poker-bankroll/pokerBankrollMath.js'
import {
  backerSliceEstimatedShare,
  backerSliceStakeValue,
} from './pokerStableBackerMath.js'
import { dealTypeLabel } from './pokerStableMath.js'
import {
  pendingBackerNudgeTargetsForActiveBacker,
  sliceCounterpartyDisplayName,
  stakeHorseCardStatusLabel,
  stakeHorseCardStatusTone,
} from './pokerStableTerms.js'

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
  onNudgePendingBacker,
  nudgingSliceId = null,
  nudgeDisabled = false,
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
        const showBackerStats = deal.status === 'active' || sliceAccepted
        const pendingNudgeSlices = pendingBackerNudgeTargetsForActiveBacker(
          deal,
          dealSlices,
          userId,
        )

        return (
          <button
            type="button"
            onClick={() => onOpenDeal?.(deal.id)}
            data-poker-stable-horse-card
            data-elevated-card="surface"
            className="w-full rounded-3xl border-2 border-amber-500/30 bg-gradient-to-br from-amber-950/50 to-zinc-900/90 p-5 text-left touch-manipulation"
          >
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
                className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${stakeHorseCardStatusTone(deal, dealSlices)}`}
              >
                {stakeHorseCardStatusLabel(deal, dealSlices)}
              </span>
            </div>

            {showBackerStats ? (
              <>
                <div className="mt-4 grid grid-cols-2 gap-3 border-t border-amber-500/15 pt-3 text-center">
                  <div>
                    <div className="text-[10px] font-bold uppercase text-zinc-500">Horse roll</div>
                    <div className="mt-0.5 text-lg font-black tabular-nums text-white">
                      {roll
                        ? fmtPoker$(roll.overall_bankroll)
                        : fmtPoker$(deal.starting_roll ?? deal.baseline_bankroll ?? 0)}
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] font-bold uppercase text-zinc-500">Your stake MTM</div>
                    <div className="mt-0.5 text-lg font-black tabular-nums text-amber-300">
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
                {pendingNudgeSlices.length > 0 ? (
                  <div
                    data-poker-stake-pending-backers
                    className="mt-3 space-y-1.5 border-t border-amber-500/15 pt-3 text-left"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {pendingNudgeSlices.map((pendingSlice) => {
                      const backerName = sliceCounterpartyDisplayName(pendingSlice, profilesById)
                      const nudging = nudgingSliceId === pendingSlice.id
                      return (
                        <div
                          key={pendingSlice.id}
                          className="flex items-center justify-between gap-2 rounded-xl border border-amber-500/15 bg-amber-950/20 px-2.5 py-2"
                        >
                          <span className="min-w-0 text-xs leading-snug text-amber-100/90">
                            Pending acceptance by {backerName}
                          </span>
                          <button
                            type="button"
                            disabled={Boolean(nudgingSliceId) || nudgeDisabled}
                            onClick={(e) => {
                              e.stopPropagation()
                              void onNudgePendingBacker?.(deal.id, pendingSlice.id)
                            }}
                            className="shrink-0 rounded-lg bg-amber-500/20 px-2.5 py-1 text-[11px] font-semibold text-amber-200 touch-manipulation active:bg-amber-500/30 disabled:opacity-50"
                          >
                            {nudging ? 'Sending…' : 'Nudge'}
                          </button>
                        </div>
                      )
                    })}
                  </div>
                ) : null}
              </>
            ) : (
              <>
                <p className="mt-3 text-xs text-amber-200/80">Pending acceptance</p>
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
          </button>
        )
      }}
    />
  )
}
