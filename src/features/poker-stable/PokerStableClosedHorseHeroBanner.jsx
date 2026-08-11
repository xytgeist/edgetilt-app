import { triggerTapHapticLight } from '../../utils/tapHaptic.js'
import { isBackerInitiatedBackingDeal } from './pokerStableApi.js'
import {
  dealLeadBackerDisplayName,
  dealStakeeDisplayName,
  stakeInitiatorCanReplaceDeclinedDeal,
} from './pokerStableTerms.js'

/**
 * Closed horse stake archive prompt in the backer carousel (sparkline / stats slot).
 * Fully declined backer-initiated offers show Delete / New Proposal for the lead.
 */
export default function PokerStableClosedHorseHeroBanner({
  deal,
  profilesById = {},
  userId = null,
  saving = false,
  onArchive,
  onReview,
  onDeleteDeclined,
  onNewProposal,
  className = '',
}) {
  if (!deal) return null

  const replaceDeclined = stakeInitiatorCanReplaceDeclinedDeal(deal, userId)
  const playerName = dealStakeeDisplayName(deal, profilesById) || 'The player'
  const leadBackerName = dealLeadBackerDisplayName(deal, profilesById) || 'a backer'
  const isRevoked = deal.status === 'revoked'
  const isDeclined = deal.status === 'declined'
  const backerInitiated = isBackerInitiatedBackingDeal(deal)
  const viewerIsLeadBacker =
    Boolean(userId) && Boolean(deal.staker_user_id) && deal.staker_user_id === userId

  if (replaceDeclined) {
    return (
      <div
        data-poker-stable-closed-horse
        data-poker-stable-declined-replace
        data-poker-stake-notice
        className={`rounded-xl border border-zinc-600/60 bg-zinc-900/80 px-3 py-2.5 text-left ${className}`}
      >
        <p className="text-xs leading-snug text-zinc-200">
          {playerName} declined this stake. Delete it, or start a new proposal.
        </p>
        <div className="mt-2 flex flex-wrap gap-2">
          <button
            type="button"
            disabled={saving}
            onClick={() => {
              triggerTapHapticLight()
              void onDeleteDeclined?.()
            }}
            className="rounded-lg bg-zinc-700 px-3 py-1.5 text-[11px] font-semibold text-zinc-200 touch-manipulation active:bg-zinc-600 disabled:opacity-50"
          >
            Delete
          </button>
          <button
            type="button"
            disabled={saving}
            onClick={() => {
              triggerTapHapticLight()
              void onNewProposal?.()
            }}
            className="rounded-lg bg-amber-600 px-3 py-1.5 text-[11px] font-bold text-white touch-manipulation active:bg-amber-500 disabled:opacity-50"
          >
            New proposal
          </button>
        </div>
      </div>
    )
  }

  let closedCopy = `This stake was closed by ${playerName}. Archive it when you are done reviewing.`
  if (backerInitiated) {
    closedCopy = viewerIsLeadBacker
      ? 'You closed this stake. Archive it when you are done reviewing.'
      : `This stake was closed by ${leadBackerName}. Archive it when you are done reviewing.`
  }

  return (
    <div
      data-poker-stable-closed-horse
      data-poker-stake-notice
      className={`rounded-xl border border-zinc-600/60 bg-zinc-900/80 px-3 py-2.5 text-left ${className}`}
    >
      <p className="text-xs leading-snug text-zinc-200">
        {isDeclined
          ? 'This stake was declined. Archive it when you are done reviewing.'
          : isRevoked
            ? 'This stake was revoked. Archive it when you are done reviewing.'
            : closedCopy}
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
