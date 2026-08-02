import PokerBankrollHeroCarousel from '../poker-bankroll/PokerBankrollHeroCarousel.jsx'
import { fmtPoker$ } from '../poker-bankroll/pokerBankrollMath.js'
import {
  backerSliceEstimatedShare,
  backerSliceStakeValue,
} from './pokerStableBackerMath.js'
import { dealTypeLabel } from './pokerStableMath.js'

function statusLabel(status) {
  if (status === 'active') return 'Active'
  if (status === 'pending') return 'Pending'
  return status || 'Unknown'
}

function statusTone(status) {
  if (status === 'active') return 'bg-amber-500/20 text-amber-300'
  if (status === 'pending') return 'bg-amber-500/15 text-amber-200/90'
  return 'bg-zinc-700/60 text-zinc-400'
}

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
        const slice = (slicesByDeal[deal.id] || []).find(
          (s) => s.staker_user_id === userId && s.status === 'active',
        ) || (slicesByDeal[deal.id] || []).find((s) => s.staker_user_id === userId)
        const roll = bankrollByDeal[deal.id]
        const stats = statsByDeal[deal.id] || { sessions: 0, profit: 0 }
        const stakeVal = slice ? backerSliceStakeValue(deal, slice, roll) : 0
        const estShare = slice ? backerSliceEstimatedShare(deal, slice, roll) : 0
        const profitTone =
          stats.profit > 0 ? 'text-emerald-400' : stats.profit < 0 ? 'text-rose-400' : 'text-zinc-300'

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
                className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${statusTone(deal.status)}`}
              >
                {statusLabel(deal.status)}
              </span>
            </div>

            {deal.status === 'active' ? (
              <div className="mt-4 grid grid-cols-2 gap-3 border-t border-amber-500/15 pt-3 text-center">
                <div>
                  <div className="text-[10px] font-bold uppercase text-zinc-500">Horse roll</div>
                  <div className="mt-0.5 text-lg font-black tabular-nums text-white">
                    {roll ? fmtPoker$(roll.overall_bankroll) : '...'}
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
