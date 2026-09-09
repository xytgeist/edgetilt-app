import { useEffect, useMemo, useState } from 'react'
import { renderLoungeMarkdown } from '../features/lounge/loungeMarkdown.jsx'
import {
  DEST_PREVIEW_NOTES,
  DEST_PREVIEW_TABS,
  destSlotHasCopy,
  firstDestTabWithCopy,
  resolveDestPreviews,
} from './syndicateDestPreview.js'

const TYPE_LABEL = {
  hammer: 'Hammer (3-0)',
  consensus: 'Consensus (2-0)',
  majority_split: 'House Divided (2-1)',
  split: 'Split (1-1)',
  solo: 'Solo',
  pass_only: 'All pass',
}

const TAB_ACTIVE = {
  public: 'bg-amber-500 text-black',
  private: 'bg-violet-500 text-white',
  chat: 'bg-sky-500 text-black',
  x: 'bg-zinc-100 text-black',
}

function typeBadgeClass(type) {
  const t = String(type || '').toLowerCase()
  if (t === 'hammer') return 'bg-amber-500/20 text-amber-200 border-amber-500/35'
  if (t === 'consensus') return 'bg-emerald-500/20 text-emerald-200 border-emerald-500/35'
  if (t === 'split') return 'bg-cyan-500/20 text-cyan-200 border-cyan-500/35'
  if (t === 'majority_split') return 'bg-orange-500/20 text-orange-200 border-orange-500/35'
  if (t === 'solo') return 'bg-violet-500/20 text-violet-200 border-violet-500/35'
  return 'bg-zinc-800 text-zinc-400 border-zinc-700'
}

function MarkdownCaption({ caption, emptyLabel }) {
  const rich = useMemo(() => {
    const text = String(caption || '').trim()
    if (!text) return null
    return renderLoungeMarkdown(text)
  }, [caption])

  if (!rich) {
    return emptyLabel ? <p className="text-sm text-zinc-500">{emptyLabel}</p> : null
  }

  return (
    <article className="rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-3 text-[13px] leading-relaxed text-zinc-100 lounge-markdown whitespace-pre-wrap">
      {rich}
    </article>
  )
}

function PlainCaption({ caption, emptyLabel }) {
  const text = String(caption || '').trim()
  if (!text) {
    return emptyLabel ? <p className="text-sm text-zinc-500">{emptyLabel}</p> : null
  }
  return (
    <pre className="rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-3 text-[13px] leading-relaxed text-zinc-100 whitespace-pre-wrap font-sans">
      {text}
    </pre>
  )
}

function DestSlotBody({ tabId, slot }) {
  const isPlain = tabId === 'chat' || tabId === 'x'
  const Caption = isPlain ? PlainCaption : MarkdownCaption
  const empty = 'Nothing posts here unless this Send to box is checked and the drop has copy.'
  if (!destSlotHasCopy(slot)) {
    return <p className="text-sm text-zinc-500">{empty}</p>
  }
  return (
    <div className="space-y-3">
      {slot.caption ? <Caption caption={slot.caption} /> : null}
      {slot.threadParts.map((part, i) => (
        <div key={`${part.label || 'part'}-${i}`} className="space-y-1.5">
          <p className="text-[10px] uppercase tracking-[0.12em] text-zinc-500 font-semibold">
            Thread · {part.label || `Part ${i + 1}`}
          </p>
          <Caption caption={part.body} />
        </div>
      ))}
      {tabId === 'x' ? (
        <p className="text-[10px] text-zinc-500">{slot.chars || slot.caption.length}/280</p>
      ) : null}
    </div>
  )
}

/**
 * @param {{
 *   preview: {
 *     sportLabel?: string
 *     dayKey?: string
 *     previewCaption?: string
 *     vipPreviewCaption?: string
 *     subscriberThreadParts?: Array<{ label?: string, body?: string }>
 *     destPreviews?: Record<string, { caption?: string, threadParts?: Array<{ label?: string, body?: string }>, chars?: number }>
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
  const dests = useMemo(() => resolveDestPreviews(preview), [preview])
  const firstTab = firstDestTabWithCopy(dests)
  const [tab, setTab] = useState(firstTab)

  useEffect(() => {
    setTab(firstDestTabWithCopy(dests))
  }, [preview?.sportLabel, preview?.previewCaption, preview?.vipPreviewCaption, preview?.destPreviews, dests])

  if (!preview) return null

  const active = DEST_PREVIEW_TABS.some((t) => t.id === tab) ? tab : firstTab
  const activeSlot = dests[active] || { caption: '', threadParts: [] }
  const hasAnyDest = DEST_PREVIEW_TABS.some((t) => destSlotHasCopy(dests[t.id]))

  const stats = [
    preview.gamesToday != null ? `${preview.gamesToday} kickoff today` : null,
    preview.totalGames != null ? `${preview.totalGames} scored` : null,
    preview.hammersCount != null ? `${preview.hammersCount} hammers` : null,
    preview.consensusCount != null ? `${preview.consensusCount} consensus` : null,
    preview.splitsCount != null ? `${preview.splitsCount} split` : null,
    preview.majoritySplitsCount != null ? `${preview.majoritySplitsCount} house divided` : null,
    preview.solosCount != null ? `${preview.solosCount} solos` : null,
    preview.passOnlyCount != null ? `${preview.passOnlyCount} all pass` : null,
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
          <p className="text-[10px] uppercase tracking-[0.16em] text-amber-400/90 font-semibold">Post preview</p>
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

      {!preview.error && hasAnyDest ? (
        <div className="flex flex-wrap gap-1 px-3 pt-3">
          {DEST_PREVIEW_TABS.map((t) => {
            const on = destSlotHasCopy(dests[t.id])
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => setTab(t.id)}
                className={`rounded-lg px-2.5 py-1 text-[11px] font-semibold transition ${
                  active === t.id
                    ? TAB_ACTIVE[t.id]
                    : on
                      ? 'bg-zinc-800 text-zinc-300 hover:text-zinc-100'
                      : 'bg-zinc-900 text-zinc-600 hover:text-zinc-400'
                }`}
              >
                {t.label}
              </button>
            )
          })}
        </div>
      ) : null}

      {!preview.error && hasAnyDest ? (
        <div className="px-3 py-3 border-b border-zinc-800/80 space-y-2">
          <p className="text-[10px] uppercase tracking-[0.14em] text-zinc-500 font-semibold">
            {DEST_PREVIEW_TABS.find((t) => t.id === active)?.label} (exact)
          </p>
          <DestSlotBody tabId={active} slot={activeSlot} />
          <p className="text-[10px] text-zinc-500">{DEST_PREVIEW_NOTES[active]}</p>
        </div>
      ) : null}

      {!preview.error && !hasAnyDest ? (
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
