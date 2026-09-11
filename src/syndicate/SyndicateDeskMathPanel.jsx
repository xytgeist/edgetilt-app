import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  invokeLoungeOddsSlateCard,
  invokeLoungeOddsUfcCard,
} from '../features/bots/botPortalApi.js'
import { deskEvalsFor, deskMeta, OPS_DESK_HOUSE, OPS_DESKS } from './syndicateOpsDesks.js'
import { DESK_MATH_SPORTS, playbookFor } from './syndicateDeskMath.js'
import { SyndicateDeskEquationList } from './SyndicateDeskEquationList.jsx'

function passLike(side) {
  const s = String(side || '').toLowerCase()
  return !s || s === 'pass'
}

function VoteChip({ side, lineDisplay, teamName }) {
  const label = passLike(side) ? 'PASS' : String(lineDisplay || teamName || side)
  return (
    <span className={`inline-flex items-center rounded-md border px-2 py-0.5 text-[12px] font-semibold ${
      passLike(side)
        ? 'bg-zinc-800 text-zinc-200 border-zinc-600'
        : 'bg-amber-500/15 text-amber-100 border-amber-500/40'
    }`}>
      {label}
    </span>
  )
}

function PlaybookCard({ deskId, sportKey }) {
  const meta = deskMeta(deskId)
  const book = playbookFor(deskId, sportKey)
  if (!meta || !book) return null
  return (
    <section className="rounded-xl border border-zinc-800 bg-zinc-950/80 px-3 py-3">
      <p className="text-[10px] uppercase tracking-[0.16em] text-zinc-500 font-semibold">What {deskId} analyzes</p>
      <h3 className="text-sm font-bold text-zinc-50 mt-0.5">
        {meta.icon} {deskId} · {meta.title}
      </h3>
      <p className="text-[12px] text-zinc-400 mt-1">{book.analyzes}</p>
      <ul className="mt-2 space-y-1.5">
        {book.gates.map((g) => (
          <li key={g.label} className="text-[12px] text-zinc-300">
            <span className="font-semibold text-zinc-100">{g.label}.</span>{' '}
            <span className="text-zinc-500">{g.formula}.</span>{' '}
            <span className="text-zinc-400">{g.effect}</span>
          </li>
        ))}
      </ul>
      <p className="mt-2 text-[12px] text-amber-200/90">{book.decision}</p>
    </section>
  )
}

function GameMathCard({ row, deskId }) {
  const eqs = Array.isArray(row.equations) ? row.equations : []
  return (
    <article className="rounded-xl border border-zinc-800 bg-zinc-950/80 overflow-hidden">
      <div className="px-3 py-2.5 border-b border-zinc-800 flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-zinc-100">
            {row.away} / {row.home}
          </p>
          <p className="text-[11px] text-zinc-500">
            {row.when || ''}
            {row.houseBadge ? ` · ${row.houseBadge}` : ''}
          </p>
        </div>
        <VoteChip side={row.side} lineDisplay={row.lineDisplay} teamName={row.teamName} />
      </div>
      <div className="px-3 py-2.5">
        {row.why ? <p className="text-[13px] text-zinc-300 leading-snug">{row.why}</p> : null}
        {row.countsForHouse === false && !passLike(row.side) && deskId !== 'Tank' ? (
          <p className="text-[11px] text-orange-300/90 mt-1">Lean only … does not count in the house tally.</p>
        ) : null}
        <SyndicateDeskEquationList
          equations={eqs}
          emptyHint="No live equation rows yet. Redeploy lounge-odds-poll, then Refresh. The playbook above is still the real gates."
        />
        {row.extra ? (
          <div className="mt-3 rounded-lg border border-zinc-800 bg-zinc-900/50 px-2.5 py-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-[10px] uppercase tracking-wide text-zinc-500 font-semibold">
                {row.extra.label || 'ATS'}
              </p>
              <VoteChip
                side={row.extra.side}
                lineDisplay={row.extra.lineDisplay}
                teamName={row.extra.teamName}
              />
            </div>
            {row.extra.why ? (
              <p className="text-[13px] text-zinc-300 leading-snug mt-1">{row.extra.why}</p>
            ) : null}
            <SyndicateDeskEquationList equations={row.extra.equations} />
          </div>
        ) : null}
      </div>
    </article>
  )
}

export function SyndicateDeskMathPanel({
  supabaseClient,
  botSlug,
  selectedDesk = OPS_DESK_HOUSE,
}) {
  const [sportKey, setSportKey] = useState('americanfootball_nfl')
  const [board, setBoard] = useState(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const load = useCallback(async () => {
    if (!supabaseClient || !botSlug) return
    setLoading(true)
    setError('')
    try {
      const { data, error: invokeErr } = sportKey === 'mma_ufc'
        ? await invokeLoungeOddsUfcCard(supabaseClient, { slug: botSlug, dryRun: true })
        : await invokeLoungeOddsSlateCard(supabaseClient, { slug: botSlug, sportKey, dryRun: true })
      if (invokeErr) throw invokeErr
      if (data?.ok === false && !data?.deskEvals) {
        throw new Error(data.message || data.error || 'No slate for this sport.')
      }
      setBoard(data || null)
    } catch (err) {
      setError(err.message || 'Could not load desk math.')
      setBoard(null)
    } finally {
      setLoading(false)
    }
  }, [supabaseClient, botSlug, sportKey])

  useEffect(() => {
    void load()
  }, [load])

  const desks = selectedDesk === OPS_DESK_HOUSE ? OPS_DESKS.map((d) => d.id) : [selectedDesk]
  const rowsByDesk = useMemo(() => {
    const map = {}
    for (const id of desks) map[id] = deskEvalsFor(board, id)
    return map
  }, [board, desks])
  const gameCount = Math.max(0, ...desks.map((id) => rowsByDesk[id]?.length || 0))
  const hasEquations = desks.some((id) =>
    (rowsByDesk[id] || []).some((g) => (g.equations || []).length || (g.extra?.equations || []).length),
  )

  return (
    <div className="pt-2 space-y-3" data-syndicate-desk-math>
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="text-sm font-bold text-zinc-100">Desk math</h2>
          <p className="text-[11px] text-zinc-500">
            Same equations the house card uses. Outcome is the live number. Effect is how that number moves the vote.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          disabled={loading}
          className="rounded-lg bg-zinc-800 hover:bg-zinc-700 px-2.5 py-1 text-xs text-zinc-300 disabled:opacity-50"
        >
          {loading ? 'Reading board…' : 'Refresh'}
        </button>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {DESK_MATH_SPORTS.map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => setSportKey(s.id)}
            className={`rounded-lg px-2.5 py-1 text-xs font-semibold border ${
              sportKey === s.id
                ? 'bg-amber-500 text-black border-amber-400'
                : 'bg-zinc-900 text-zinc-300 border-zinc-700 hover:bg-zinc-800'
            }`}
          >
            {s.label}
          </button>
        ))}
      </div>

      {desks.map((id) => (
        <PlaybookCard key={`${id}-book`} deskId={id} sportKey={sportKey} />
      ))}

      {error ? <p className="text-sm text-rose-400">{error}</p> : null}
      {loading && !board ? (
        <p className="text-sm text-zinc-500">Pulling the live slate … weather and files can take a bit.</p>
      ) : null}
      {board && !hasEquations && gameCount > 0 ? (
        <p className="text-[11px] text-amber-300/90">
          Votes are live. Equation rows need a fresh lounge-odds-poll deploy.
        </p>
      ) : null}

      {desks.map((id) => {
        const rows = rowsByDesk[id] || []
        if (!rows.length) return null
        const meta = deskMeta(id)
        return (
          <section key={`${id}-games`} className="space-y-2">
            <h3 className="text-xs font-bold uppercase tracking-wide text-zinc-400">
              {meta?.icon} {id} · {rows.length} game{rows.length === 1 ? '' : 's'}
            </h3>
            {rows.map((row) => (
              <GameMathCard
                key={`${id}-${row.eventId}-${row.market || 'm'}`}
                row={row}
                deskId={id}
              />
            ))}
          </section>
        )
      })}

      {!loading && board && gameCount === 0 ? (
        <p className="text-sm text-zinc-500">No games on this board right now. Playbook above is still the live gates.</p>
      ) : null}
    </div>
  )
}
