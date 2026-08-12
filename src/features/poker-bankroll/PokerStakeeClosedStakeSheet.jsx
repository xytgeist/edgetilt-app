import { APP_MODAL_OVERLAY_CLASS, APP_MODAL_SHEET_PANEL_CLASS } from '../../constants/appZIndex.js'
import { fmtPoker$ } from './pokerBankrollMath.js'
import { dealTypeLabel } from '../poker-stable/pokerStableMath.js'
import { buildStakeeClosedStakeReview } from '../poker-stable/pokerStableDealHistory.js'
import PokerStakeeClosedStakeReviewSections from './PokerStakeeClosedStakeReviewSections.jsx'

/**
 * Stakee-facing review after a stake is closed.
 * Shows closer, table result, personal bankroll deposit, and per-backer made / unwind owed.
 */
export default function PokerStakeeClosedStakeSheet({
  deal,
  slices = [],
  settlements = [],
  sessions = [],
  profilesById = {},
  viewerUserId = null,
  saving = false,
  onClose,
  onArchive,
}) {
  if (!deal) return null

  const label = deal.label?.trim() || dealTypeLabel(deal.deal_type) || 'Cash backing'
  const isDeclined = deal.status === 'declined'
  const isRevoked = deal.status === 'revoked'
  const review = buildStakeeClosedStakeReview({
    deal,
    slices,
    settlements,
    sessions,
    profilesById,
    viewerUserId,
  })
  const closedLabel = review.closedAt
    ? new Date(review.closedAt).toLocaleDateString('en-US', {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      })
    : null

  const closerPhrase = review.closer.isViewer
    ? 'You closed this stake'
    : `${review.closer.label} closed this stake`

  return (
    <div className={`${APP_MODAL_OVERLAY_CLASS} overflow-x-hidden`} onClick={onClose}>
      <div
        data-poker-stakee-closed-sheet
        className={`relative z-10 flex w-full max-w-lg flex-col !overflow-y-hidden !pb-0 ${APP_MODAL_SHEET_PANEL_CLASS}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain no-scrollbar [-webkit-overflow-scrolling:touch]">
          <div className="mb-4 flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-bold uppercase tracking-wide text-zinc-500">Closed stake</p>
              <h3 className="mt-1 text-lg font-bold text-white">{label}</h3>
              <p className="mt-0.5 text-xs text-zinc-500">{dealTypeLabel(deal.deal_type)}</p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl px-3 py-1.5 text-sm font-semibold text-zinc-400 touch-manipulation"
            >
              Close
            </button>
          </div>

          <div className="rounded-2xl border border-zinc-700/70 bg-zinc-950/70 p-4 text-sm leading-relaxed text-zinc-300">
            {isDeclined ? (
              <p>This stake was declined and is no longer active.</p>
            ) : isRevoked ? (
              <p>A backer revoked this stake. You can archive it when you are done reviewing.</p>
            ) : (
              <p>
                {closerPhrase}
                {closedLabel ? ` on ${closedLabel}` : ''}. Your on-stake sessions will merge with
                your personal Bankroll history. Archive this card when you are ready to move it out
                of the carousel.
              </p>
            )}
          </div>

          {!isDeclined && !isRevoked ? (
            <div className="mt-4 pb-2">
              <PokerStakeeClosedStakeReviewSections review={review} />
            </div>
          ) : (
            <dl className="mt-4 space-y-2 rounded-2xl border border-zinc-800 bg-zinc-900/50 p-4 text-sm">
              <div className="flex justify-between gap-3">
                <dt className="text-zinc-500">Baseline</dt>
                <dd className="text-right font-medium text-zinc-100">
                  {fmtPoker$(Number(deal.baseline_bankroll) || 0)}
                </dd>
              </div>
            </dl>
          )}
        </div>

        <div
          data-poker-stakee-closed-sheet-footer
          className="shrink-0 border-t border-zinc-800/90 bg-zinc-900 px-0 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom,0px))]"
        >
          <button
            type="button"
            disabled={saving}
            onClick={() => onArchive?.()}
            className="w-full rounded-2xl bg-amber-600 py-3.5 text-base font-bold text-white touch-manipulation hover:bg-amber-500 active:bg-amber-700 disabled:opacity-50"
          >
            Archive stake
          </button>
          <p className="mt-2 text-center text-xs text-zinc-500">
            Moves this stake to your Bankroll Archive tab. You can review it there anytime.
          </p>
        </div>
      </div>
    </div>
  )
}
