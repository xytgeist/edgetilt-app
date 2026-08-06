import { triggerTapHapticLight } from '../../utils/tapHaptic.js'
import { dealStakeeDisplayName } from './pokerStableTerms.js'

/**
 * Closed horse stake archive prompt in the backer carousel (sparkline / stats slot).
 */
export default function PokerStableClosedHorseHeroBanner({
  deal,
  profilesById = {},
  saving = false,
  onArchive,
  onReview,
  className = '',
}) {
  if (!deal) return null

  const playerName = dealStakeeDisplayName(deal, profilesById) || 'The player'

  return (
    <div
      data-poker-stable-closed-horse
      data-poker-stake-notice
      className={`rounded-xl border border-zinc-600/60 bg-zinc-900/80 px-3 py-2.5 text-left ${className}`}
    >
      <p className="text-xs leading-snug text-zinc-200">
        This stake was closed by {playerName}. Archive it when you are done reviewing.
      </p>
      <div className="mt-2 flex flex-wrap gap-2">
        <button
          type="button"
          disabled={saving}
          onClick={() => {
            triggerTapHapticLight()
            onArchive?.()
          }}
          className="rounded-lg bg-amber-600 px-3 py-1.5 text-[11px] font-bold text-white touch-manipulation active:bg-amber-500 disabled:opacity-50"
        >
          Archive stake
        </button>
        <button
          type="button"
          onClick={() => {
            triggerTapHapticLight()
            onReview?.()
          }}
          className="rounded-lg bg-zinc-700 px-3 py-1.5 text-[11px] font-semibold text-zinc-200 touch-manipulation active:bg-zinc-600"
        >
          Review
        </button>
      </div>
    </div>
  )
}
