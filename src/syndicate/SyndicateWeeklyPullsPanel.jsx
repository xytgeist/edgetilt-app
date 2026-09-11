import { useCallback, useEffect, useState } from 'react'
import { loadWeeklyPullBoard } from './syndicateWeeklyPullsLoad.js'
import {
  WEEKLY_PULL_SCHEDULE,
  formatPullWhen,
  pullStatusLabel,
} from './syndicateWeeklyPulls.js'

const BADGE = {
  pass: 'bg-emerald-950/80 text-emerald-300 ring-emerald-500/40',
  fail: 'bg-rose-950/80 text-rose-300 ring-rose-500/40',
  waiting: 'bg-zinc-800 text-zinc-300 ring-zinc-600/40',
  stale: 'bg-amber-950/80 text-amber-300 ring-amber-500/40',
}

export function SyndicateWeeklyPullsPanel({ supabaseClient, onOpenTab }) {
  const [board, setBoard] = useState(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    if (!supabaseClient) return
    setLoading(true)
    setError('')
    try {
      setBoard(await loadWeeklyPullBoard(supabaseClient))
    } catch (err) {
      setError(err.message || 'Could not load weekly pulls.')
      setBoard(null)
    } finally {
      setLoading(false)
    }
  }, [supabaseClient])

  useEffect(() => {
    void load()
  }, [load])

  const rows = board?.rows || []
  const passN = rows.filter((r) => r.status === 'pass').length
  const failN = rows.filter((r) => r.status === 'fail').length

  return (
    <div className="pt-2 space-y-3" data-syndicate-weekly-pulls>
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="text-sm font-bold text-zinc-100">Weekly data pulls</h2>
          <p className="text-[11px] text-zinc-500">
            Tuesday GHA {WEEKLY_PULL_SCHEDULE}. Pass means this shop week wrote. Fail means the due window passed with no write, or the job heartbeat is failed.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          disabled={loading}
          className="rounded-lg bg-zinc-800 hover:bg-zinc-700 px-2.5 py-1 text-xs text-zinc-300 disabled:opacity-50"
        >
          {loading ? 'Loading…' : 'Refresh'}
        </button>
      </div>

      <div className="flex flex-wrap gap-1.5 text-[11px]">
        <span className={`rounded px-2 py-0.5 font-semibold ring-1 ${BADGE.pass}`}>{passN} pass</span>
        <span className={`rounded px-2 py-0.5 font-semibold ring-1 ${BADGE.fail}`}>{failN} fail</span>
        {board?.rollup ? (
          <span className={`rounded px-2 py-0.5 font-semibold ring-1 ${BADGE[board.rollup.status] || BADGE.waiting}`}>
            Job {pullStatusLabel(board.rollup.status).toLowerCase()}
          </span>
        ) : null}
      </div>

      {error ? <p className="text-sm text-rose-400">{error}</p> : null}
      {board?.beatError ? (
        <p className="text-[11px] text-zinc-500">
          Heartbeats unread ({board.beatError}). Status is from the dest tables.
        </p>
      ) : null}

      <div className="space-y-1.5">
        {rows.map((row) => (
          <button
            key={row.id}
            type="button"
            onClick={() => onOpenTab?.(row.tab)}
            className="w-full text-left rounded-lg bg-zinc-900/60 border border-zinc-800/70 px-3 py-2 hover:border-zinc-600"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-semibold text-zinc-100">{row.label}</span>
                  <span className="text-[10px] uppercase tracking-wide text-zinc-500">{row.sports}</span>
                </div>
                <p className="text-[11px] text-zinc-500 mt-0.5">{row.detail}</p>
              </div>
              <span className={`text-[10px] font-bold uppercase px-1.5 py-0.5 rounded ring-1 shrink-0 ${BADGE[row.status]}`}>
                {pullStatusLabel(row.status)}
              </span>
            </div>
            <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5 text-[10px] text-zinc-500">
              <span>Last ok {formatPullWhen(row.lastOkAt)}</span>
              {row.lastFailAt ? <span>Last fail {formatPullWhen(row.lastFailAt)}</span> : null}
              <span>{row.source === 'heartbeat' ? 'GHA heartbeat' : row.source === 'table' ? 'Table write' : 'No signal'}</span>
              {row.message ? <span className="text-zinc-400 truncate max-w-full">{row.message}</span> : null}
            </div>
          </button>
        ))}
      </div>

      {board?.rollup ? (
        <p className="text-[11px] text-zinc-500">
          Rollup job last ok {formatPullWhen(board.rollup.lastOkAt)}
          {board.rollup.message ? ` · ${board.rollup.message}` : ''}.
        </p>
      ) : null}
    </div>
  )
}
