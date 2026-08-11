import { APP_MODAL_OVERLAY_CLASS, APP_MODAL_SHEET_PANEL_CLASS } from '../../constants/appZIndex.js'
import { fmtPoker$, pokerPlTone } from './pokerBankrollMath.js'
import { dealTypeLabel } from '../poker-stable/pokerStableMath.js'
import { buildStakeeClosedStakeReview } from '../poker-stable/pokerStableDealHistory.js'

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
        className={`relative z-10 w-full max-w-lg max-h-[85dvh] overflow-y-auto ${APP_MODAL_SHEET_PANEL_CLASS}`}
        onClick={(e) => e.stopPropagation()}
      >
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
              {closedLabel ? ` on ${closedLabel}` : ''}. Your on-stake sessions will merge with your
              personal Bankroll history. Archive this card when you are ready to move it out of the
              carousel.
            </p>
          )}
        </div>

        {!isDeclined && !isRevoked ? (
          <>
            <dl className="mt-4 space-y-2 rounded-2xl border border-zinc-800 bg-zinc-900/50 p-4 text-sm">
              <div className="flex justify-between gap-3">
                <dt className="text-zinc-500">Closed by</dt>
                <dd className="text-right font-medium text-zinc-100">{review.closer.label}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-zinc-500">Baseline</dt>
                <dd className="text-right font-medium text-zinc-100">
                  {fmtPoker$(review.baseline)}
                </dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-zinc-500">Your stake result</dt>
                <dd
                  data-poker-pl-tone={pokerPlTone(review.tableProfit)}
                  className="text-right font-semibold tabular-nums"
                >
                  {fmtPoker$(review.tableProfit)}
                </dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="min-w-0 text-zinc-500">Deposited to personal bankroll</dt>
                <dd
                  data-poker-pl-tone={pokerPlTone(review.personalDeposit)}
                  className="shrink-0 text-right font-semibold tabular-nums"
                >
                  {fmtPoker$(review.personalDeposit)}
                </dd>
              </div>
              {review.isTournamentPackage && review.unusedMarkupTotal > 0.005 ? (
                <div className="flex justify-between gap-3">
                  <dt className="min-w-0 text-zinc-500">Unused markup returned to backers</dt>
                  <dd className="shrink-0 text-right font-semibold tabular-nums text-zinc-100">
                    {fmtPoker$(review.unusedMarkupTotal)}
                  </dd>
                </div>
              ) : null}
            </dl>

            {review.backers.length ? (
              <div className="mt-4 space-y-2">
                <p className="text-[11px] font-bold uppercase tracking-wide text-zinc-500">
                  Backers
                </p>
                {review.backers.map((row) => (
                  <div
                    key={row.sliceId}
                    className="rounded-2xl border border-zinc-800 bg-zinc-900/50 px-4 py-3 text-sm"
                  >
                    <div className="flex items-baseline justify-between gap-3">
                      <span className="min-w-0 truncate font-semibold text-zinc-100">{row.name}</span>
                      <span className="shrink-0 text-[11px] tabular-nums text-zinc-500">
                        {row.actionPct}%
                      </span>
                    </div>
                    <div className="mt-2 space-y-1 text-[13px]">
                      <div className="flex justify-between gap-3">
                        <span className="text-zinc-500">Made</span>
                        <span
                          data-poker-pl-tone={pokerPlTone(row.profitMade)}
                          className="font-semibold tabular-nums"
                        >
                          {fmtPoker$(row.profitMade)}
                        </span>
                      </div>
                      <div className="flex justify-between gap-3">
                        <span className="text-zinc-500">
                          {review.isTournamentPackage ? 'Stake value returned' : 'Stake capital'}
                        </span>
                        <span className="font-medium tabular-nums text-zinc-200">
                          {fmtPoker$(row.capital)}
                        </span>
                      </div>
                      {review.isTournamentPackage && row.prepaidFee > 0.005 ? (
                        <>
                          <div className="flex justify-between gap-3">
                            <span className="text-zinc-500">Markup applied</span>
                            <span className="font-medium tabular-nums text-zinc-200">
                              {fmtPoker$(row.appliedMarkup)}
                            </span>
                          </div>
                          <div className="flex justify-between gap-3">
                            <span className="text-zinc-500">Unused markup refunded</span>
                            <span className="font-medium tabular-nums text-zinc-200">
                              {fmtPoker$(row.unusedMarkup)}
                            </span>
                          </div>
                        </>
                      ) : null}
                      <div className="flex justify-between gap-3 border-t border-zinc-800/70 pt-1.5">
                        <span className="text-zinc-400">
                          {review.isTournamentPackage
                            ? 'Returned to backing bankroll'
                            : 'Backer owed'}
                        </span>
                        <span className="font-semibold tabular-nums text-zinc-100">
                          {fmtPoker$(
                            review.isTournamentPackage ? row.returnedToBacker : row.owed,
                          )}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
                {review.declinedCount > 0 ? (
                  <p className="text-[11px] text-zinc-500">
                    {review.declinedCount} declined slice
                    {review.declinedCount === 1 ? '' : 's'} not included.
                  </p>
                ) : null}
              </div>
            ) : null}
          </>
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

        <button
          type="button"
          disabled={saving}
          onClick={() => onArchive?.()}
          className="mt-5 w-full rounded-2xl bg-amber-600 py-3.5 text-base font-bold text-white touch-manipulation hover:bg-amber-500 active:bg-amber-700 disabled:opacity-50"
        >
          Archive stake
        </button>
        <p className="mt-2 text-center text-xs text-zinc-500">
          Moves this stake to your Bankroll Archive tab. You can review it there anytime.
        </p>
      </div>
    </div>
  )
}
