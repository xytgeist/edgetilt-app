import { useMemo } from 'react'
import { renderLoungeMarkdown } from '../features/lounge/loungeMarkdown.jsx'

const TYPE_LABEL = {
  hammer: 'Hammer',
  consensus: 'Consensus',
  split: 'Split',
  solo: 'Solo',
  pass_only: 'All pass',
}

function typeBadgeClass(type) {
  const t = String(type || '').toLowerCase()
  if (t === 'hammer') return 'bg-amber-500/20 text-amber-200 border-amber-500/35'
  if (t === 'consensus') return 'bg-emerald-500/20 text-emerald-200 border-emerald-500/35'
  if (t === 'split') return 'bg-cyan-500/20 text-cyan-200 border-cyan-500/35'
  if (t === 'solo') return 'bg-violet-500/20 text-violet-200 border-violet-500/35'
  return 'bg-zinc-800 text-zinc-400 border-zinc-700'
}

/**
 * @param {{
 *   preview: {
 *     sportLabel?: string
 *     dayKey?: string
 *     previewCaption?: string
 *     gamesSummary?: Array<{ away: string, home: string, when: string, lineDisplay: string, badge: string, type: string }>
 *     gamesToday?: number
 *     totalGames?: number
 *     hammersCount?: number
 *     consensusCount?: number
 *     splitsCount?: number
 *     error?: string
 *   } | null
 *   onDismiss?: () => void
 * }} props
 */
export function SyndicateDryRunPreview({ preview, onDismiss }) {
  const richCaption = useMemo(() => {
    const caption = String(preview?.previewCaption || '').trim()
    if (!caption) return null
    return renderLoungeMarkdown(caption)
  }, [preview?.previewCaption])

  if (!preview) return null

  const stats = [
    preview.gamesToday != null ? `${preview.gamesToday} kickoff today` : null,
    preview.totalGames != null ? `${preview.totalGames} scored` : null,
    preview.hammersCount != null ? `${preview.hammersCount} hammers` : null,
    preview.consensusCount != null ? `${preview.consensusCount} consensus` : null,
    preview.splitsCount != null ? `${preview.splitsCount} splits` : null,
    preview.solosCount != null ? `${preview.solosCount} solos` : null,
  ]
    .filter(Boolean)
    .join(' · ')

  const games = Array.isArray(preview.gamesSummary) ? preview.gamesSummary : []

  return (
    <section
      className="mb-5 rounded-xl border border-amber-500/30 bg-zinc-900/80 overflow-hidden"
      aria-label="Dry run preview"
    >
      <div className="flex flex-wrap items-start justify-between gap-2 px-3 py-2.5 border-b border-zinc-800 bg-amber-950/25">
        <div className="min-w-0">
          <p className="text-[10px] uppercase tracking-[0.16em] text-amber-400/90 font-semibold">Dry run preview</p>
          <p className="text-sm font-semibold text-zinc-100">
            {preview.sportLabel || 'Sport'}
            {preview.dayKey ? ` · ${preview.dayKey}` : ''}
          </p>
          {stats ? <p className="text-[11px] text-zinc-400 mt-0.5">{stats}</p> : null}
        </div>
        {onDismiss ? (
          <button
            type="button"
            onClick={onDismiss}
            className="shrink-0 rounded-lg px-2.5 py-1 text-[11px] font-semibold text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800"
          >
            Dismiss
          </button>
        ) : null}
      </div>

      {preview.error ? (
        <p className="px-3 py-3 text-sm text-red-400">{preview.error}</p>
      ) : null}

      {richCaption ? (
        <div className="px-3 py-3 border-b border-zinc-800/80">
          <p className="text-[10px] uppercase tracking-[0.14em] text-zinc-500 font-semibold mb-2">
            Lounge post (exact caption)
          </p>
          <article className="rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-3 text-[13px] leading-relaxed text-zinc-100 lounge-markdown">
            {richCaption}
          </article>
          <p className="text-[10px] text-zinc-500 mt-2">
            Public tease caps hammers / consensus / splits. Ledger still records every scored game below.
          </p>
        </div>
      ) : !preview.error ? (
        <p className="px-3 py-3 text-sm text-zinc-500">No caption generated (desk may not have voted yet).</p>
      ) : null}

      {games.length ? (
        <div className="px-3 py-3">
          <p className="text-[10px] uppercase tracking-[0.14em] text-zinc-500 font-semibold mb-2">
            All games scored ({games.length})
          </p>
          <div className="overflow-x-auto rounded-lg border border-zinc-800">
            <table className="w-full min-w-[520px] text-left text-[11px]">
              <thead className="bg-zinc-950/80 text-zinc-500 uppercase tracking-wide">
                <tr>
                  <th className="px-2 py-1.5 font-semibold">Matchup</th>
                  <th className="px-2 py-1.5 font-semibold">Kick</th>
                  <th className="px-2 py-1.5 font-semibold">Pick</th>
                  <th className="px-2 py-1.5 font-semibold">Desk</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/80">
                {games.map((g, i) => {
                  const type = String(g.type || '').toLowerCase()
                  return (
                    <tr key={`${g.away}-${g.home}-${i}`} className="text-zinc-300">
                      <td className="px-2 py-1.5 whitespace-nowrap">
                        {g.away} @ {g.home}
                      </td>
                      <td className="px-2 py-1.5 text-zinc-500 whitespace-nowrap">{g.when || '—'}</td>
                      <td className="px-2 py-1.5">{g.lineDisplay || '—'}</td>
                      <td className="px-2 py-1.5">
                        <span
                          className={`inline-flex items-center rounded-md border px-1.5 py-0.5 text-[10px] font-semibold ${typeBadgeClass(type)}`}
                        >
                          {g.badge || TYPE_LABEL[type] || type || '—'}
                        </span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}
    </section>
  )
}
