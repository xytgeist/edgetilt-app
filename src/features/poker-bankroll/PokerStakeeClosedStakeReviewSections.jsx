import { fmtPoker$, pokerPlTone } from './pokerBankrollMath.js'

/**
 * Shared player closed-stake economics (Your bankroll + Backers).
 * Used on pre-archive review and archive detail.
 *
 * @param {{ review: object }} props
 */
export default function PokerStakeeClosedStakeReviewSections({ review }) {
  if (!review) return null

  return (
    <div data-poker-stakee-closed-review>
      <div className="space-y-2">
        <p className="text-[11px] font-bold uppercase tracking-wide text-zinc-500">Your bankroll</p>
        <dl className="space-y-2 rounded-2xl border border-zinc-800 bg-zinc-900/50 p-4 text-sm">
          <div className="flex justify-between gap-3">
            <dt className="text-zinc-500">Closed by</dt>
            <dd className="text-right font-medium text-zinc-100">{review.closer.label}</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-zinc-500">Baseline</dt>
            <dd className="text-right font-medium text-zinc-100">{fmtPoker$(review.baseline)}</dd>
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
          <div className="flex justify-between gap-3 border-t border-zinc-800/70 pt-1.5">
            <dt className="min-w-0 text-zinc-400">Return to bankroll</dt>
            <dd
              data-poker-pl-tone={pokerPlTone(review.returnToBankroll)}
              className="shrink-0 text-right font-semibold tabular-nums"
            >
              {fmtPoker$(review.returnToBankroll)}
            </dd>
          </div>
        </dl>
      </div>

      {review.backers.length ? (
        <div className="mt-4 space-y-2">
          <p className="text-[11px] font-bold uppercase tracking-wide text-zinc-500">Backers</p>
          {review.backers.map((row) => (
            <div
              key={row.sliceId}
              data-poker-stakee-closed-backer-row
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
                    {review.isTournamentPackage ? 'Returned to backer' : 'Backer owed'}
                  </span>
                  <span className="font-semibold tabular-nums text-zinc-100">
                    {fmtPoker$(review.isTournamentPackage ? row.returnedToBacker : row.owed)}
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
    </div>
  )
}
