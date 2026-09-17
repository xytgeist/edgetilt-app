import { useCallback, useEffect, useState } from 'react'

function fmtWhen(iso) {
  if (!iso) return '...'
  const ms = Date.parse(iso)
  if (!Number.isFinite(ms)) return '...'
  return new Date(ms).toLocaleString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

function signed(n) {
  const v = Number(n)
  if (!Number.isFinite(v)) return '...'
  return `${v > 0 ? '+' : ''}${v.toFixed(2)}`
}

/**
 * Latest Tuesday Sleeper PVAL refresh dump for Syndicate Ops / Sharp Desk.
 * @param {{ supabaseClient?: import('@supabase/supabase-js').SupabaseClient | null }} props
 */
export default function PvalSyncDumpCard({ supabaseClient }) {
  const [run, setRun] = useState(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const load = useCallback(async () => {
    if (!supabaseClient) return
    setLoading(true)
    try {
      const { data, error: qErr } = await supabaseClient
        .from('nfl_pval_sync_runs')
        .select('*')
        .eq('source', 'sleeper')
        .order('ran_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      if (qErr) throw qErr
      setRun(data || null)
      setError('')
    } catch (err) {
      setError(err.message || 'Failed to load PVAL dump')
      setRun(null)
    } finally {
      setLoading(false)
    }
  }, [supabaseClient])

  useEffect(() => {
    void load()
  }, [load])

  const movers = Array.isArray(run?.movers) ? run.movers : []
  const blocked = Array.isArray(run?.override_blocked) ? run.override_blocked : []
  const bands = run?.band_counts && typeof run.band_counts === 'object' ? run.band_counts : {}
  const gotData = Number(run?.proposed_rows) > 0
  const wrote = Number(run?.wrote) > 0

  return (
    <div
      data-pval-sync-dump
      className="mb-4 rounded-xl border border-emerald-900/50 bg-emerald-950/20 p-4 text-zinc-100"
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <div className="text-sm font-bold text-white">Last Sleeper PVAL refresh</div>
          <p className="mt-0.5 text-xs text-zinc-400">
            What Tuesday (or the last apply) pulled, wrote, and moved. Overrides stay untouched.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          disabled={loading}
          className="rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-1 text-xs text-zinc-300 hover:text-white"
        >
          {loading ? 'Loading...' : 'Reload dump'}
        </button>
      </div>

      {error ? <p className="mt-2 text-xs text-red-300">{error}</p> : null}

      {!run && !error ? (
        <p className="mt-3 text-xs text-zinc-400">
          No dump yet. Next Tuesday GHA refresh writes one. You can also run{' '}
          <span className="font-mono text-zinc-300">npm run syndicate:pval-sleeper:refresh:production</span>.
        </p>
      ) : null}

      {run ? (
        <div className="mt-3 space-y-3">
          <div className="text-xs text-zinc-300">
            {fmtWhen(run.ran_at)}
            {run.season || run.week != null
              ? ` · season ${run.season || '?'} week ${run.week ?? '?'}`
              : ''}
          </div>
          <div className="flex flex-wrap gap-1.5 text-[11px]">
            <Stat ok={gotData} label={`Pulled ${run.proposed_rows ?? 0}`} />
            <Stat ok={wrote} label={`Wrote ${run.wrote ?? 0}`} />
            <Stat ok label={`${run.inserted_n ?? 0} new`} />
            <Stat ok={Number(run.updated_n) > 0} label={`${run.updated_n ?? 0} moved`} />
            <Stat ok label={`${run.unchanged_n ?? 0} same`} />
            <Stat ok label={`${run.skipped_overrides ?? 0} overrides kept`} />
            <Stat ok label={`Table ${run.table_n ?? '?'}`} />
          </div>
          {run.summary ? <p className="text-xs text-zinc-400">{run.summary}</p> : null}
          {!gotData ? (
            <p className="text-xs text-red-300">Sleeper returned no proposed rows. Pull failed or was empty.</p>
          ) : null}
          {gotData && !wrote ? (
            <p className="text-xs text-amber-300">
              Sleeper data landed but nothing was written (insert-new only, or every row was an override).
            </p>
          ) : null}

          {Object.keys(bands).length ? (
            <div className="flex flex-wrap gap-1">
              {Object.entries(bands)
                .sort((a, b) => Number(b[1]) - Number(a[1]))
                .map(([k, n]) => (
                  <span
                    key={k}
                    className="rounded bg-zinc-900 px-1.5 py-0.5 font-mono text-[10px] text-zinc-400"
                  >
                    {k} {n}
                  </span>
                ))}
            </div>
          ) : null}

          {movers.length ? (
            <div>
              <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
                Movers (new + |Δ|≥0.05)
              </div>
              <div className="max-h-56 overflow-y-auto rounded-lg border border-zinc-800/80">
                <table className="w-full text-left text-[11px]">
                  <thead className="sticky top-0 bg-zinc-950 text-zinc-500">
                    <tr>
                      <th className="px-2 py-1">Player</th>
                      <th className="px-2 py-1">Band</th>
                      <th className="px-2 py-1">From</th>
                      <th className="px-2 py-1">To</th>
                      <th className="px-2 py-1">Δ</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-800/70">
                    {movers.map((m, i) => (
                      <tr key={`${m.name}-${i}`}>
                        <td className="px-2 py-1 text-zinc-200">
                          {m.name}
                          {m.kind === 'insert' ? (
                            <span className="ml-1 text-[10px] text-emerald-400">new</span>
                          ) : null}
                        </td>
                        <td className="px-2 py-1 font-mono text-zinc-500">{m.band}</td>
                        <td className="px-2 py-1 text-zinc-400">{m.from == null ? '-' : Number(m.from).toFixed(2)}</td>
                        <td className="px-2 py-1 text-amber-200">{Number(m.to).toFixed(2)}</td>
                        <td className="px-2 py-1 text-zinc-300">{signed(m.delta)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : null}

          {blocked.length ? (
            <div>
              <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
                Override held (Sleeper wanted a move)
              </div>
              <ul className="max-h-28 overflow-y-auto text-[11px] text-zinc-400">
                {blocked.map((m, i) => (
                  <li key={`${m.name}-ov-${i}`}>
                    {m.name}: {Number(m.from).toFixed(2)} → {Number(m.to).toFixed(2)} ({signed(m.delta)}) kept
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}

function Stat({ ok, label }) {
  return (
    <span
      className={`rounded-md px-2 py-0.5 font-semibold ${
        ok ? 'bg-emerald-950/70 text-emerald-300 ring-1 ring-emerald-700/40' : 'bg-red-950/50 text-red-300 ring-1 ring-red-700/40'
      }`}
    >
      {label}
    </span>
  )
}
