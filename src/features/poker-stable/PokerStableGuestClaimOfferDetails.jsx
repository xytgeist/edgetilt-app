/**
 * Shared stake terms card for guest claim pages and stake-offer onboarding.
 *
 * @param {{
 *   label: string,
 *   rows?: { label: string, value: string }[],
 *   sliceSummaries?: { name: string, lines: { label: string, value: string }[] }[],
 *   notes?: string | null,
 * }} props
 */
export function PokerStableGuestClaimOfferDetails({
  label,
  rows = [],
  sliceSummaries = [],
  notes = null,
}) {
  const noteText = String(notes || '').trim()

  return (
    <div
      data-poker-guest-claim-offer
      className="rounded-2xl border border-zinc-700/70 bg-zinc-950/70 p-4"
    >
      <div className="text-lg font-bold text-white">{label}</div>

      {rows.length ? (
        <dl className="mt-3 space-y-2 text-sm">
          {rows.map((row) => (
            <div key={row.label} className="flex items-start justify-between gap-3">
              <dt className="text-zinc-400">{row.label}</dt>
              <dd className="text-right font-medium text-zinc-100">{row.value}</dd>
            </div>
          ))}
        </dl>
      ) : null}

      {sliceSummaries.length ? (
        <div className="mt-4 space-y-3 border-t border-zinc-800 pt-4">
          {sliceSummaries.map((summary, idx) => (
            <div key={`${summary.name}-${idx}`}>
              <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                Backer slice {sliceSummaries.length > 1 ? idx + 1 : ''}
              </div>
              <div className="mt-1 text-sm font-medium text-zinc-200">{summary.name}</div>
              <ul className="mt-1 space-y-0.5 text-sm text-zinc-400">
                {summary.lines.map((line) => (
                  <li key={line.label}>
                    {line.label}: <span className="text-zinc-200">{line.value}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      ) : null}

      {noteText ? (
        <div className="mt-4 border-t border-zinc-800 pt-4">
          <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Notes</div>
          <p className="mt-1 text-sm leading-relaxed text-zinc-300">{noteText}</p>
        </div>
      ) : null}
    </div>
  )
}
