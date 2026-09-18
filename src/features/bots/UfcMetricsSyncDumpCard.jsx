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

function fmtNum(n) {
  if (n == null || n === '') return '-'
  const v = Number(n)
  if (!Number.isFinite(v)) return String(n)
  return Number.isInteger(v) ? String(v) : v.toFixed(2)
}

function signed(n) {
  const v = Number(n)
  if (!Number.isFinite(v)) return '...'
  return `${v > 0 ? '+' : ''}${Number.isInteger(v) ? v : v.toFixed(2)}`
}

/**
 * Latest Tuesday UFC Stats refresh dump.
 * @param {{ supabaseClient?: import('@supabase/supabase-js').SupabaseClient | null }} props
 */
export default function UfcMetricsSyncDumpCard({ supabaseClient }) {
  const [run, setRun] = useState(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const load = useCallback(async () => {
    if (!supabaseClient) return
    setLoading(true)
    try {
      const { data, error: qErr } = await supabaseClient
        .from('ufc_metrics_sync_runs')
        .select('*')
        .order('ran_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      if (qErr) throw qErr
      setRun(data || null)
      setError('')
    } catch (err) {
      setError(err.message || 'Failed to load UFC dump')
      setRun(null)
    } finally {
      setLoading(false)
    }
  }, [supabaseClient])

  useEffect(() => {
    void load()
  }, [load])

  const movers = Array.isArray(run?.movers) ? run.movers : []
  const gotData = Number(run?.proposed_rows) > 0
  const wrote = Number(run?.wrote) > 0
  const failed = Number(run?.failed_n) > 0

  return (
    <div
      data-ufc-metrics-dump
      className="rounded-xl border border-rose-900/50 bg-rose-950/20 p-4 text-zinc-100"
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <div className="text-sm font-bold text-white">Last UFC Stats refresh</div>
          <p className="mt-0.5 text-xs text-zinc-400">
            What Tuesday pulled, who is new, and which career numbers actually moved. Overrides stay untouched.
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
          No dump yet. Next Tuesday GHA refresh writes one.
        </p>
      ) : null}

      {run ? (
        <div className="mt-3 space-y-3">
          <div className="text-xs text-zinc-300">{fmtWhen(run.ran_at)}</div>
          <div className="flex flex-wrap gap-1.5 text-[11px]">
            <Stat ok={gotData} label={`Pulled ${run.proposed_rows ?? 0}`} />
            <Stat ok={wrote || !gotData} label={`Wrote ${run.wrote ?? 0}`} />
            <Stat ok label={`${run.inserted_n ?? 0} new`} />
            <Stat ok={Number(run.updated_n) > 0} label={`${run.updated_n ?? 0} moved`} />
            <Stat ok label={`${run.unchanged_n ?? 0} same`} />
            <Stat ok label={`${run.skipped_overrides ?? 0} overrides kept`} />
            <Stat ok={!failed} label={`${run.failed_n ?? 0} failed`} />
            <Stat ok label={`Table ${run.table_n ?? '?'}`} />
          </div>
          {run.summary ? <p className="text-xs text-zinc-400">{run.summary}</p> : null}
          {!gotData ? (
            <p className="text-xs text-red-300">UFC Stats returned no fighters. Pull failed or was empty.</p>
          ) : null}

          {movers.length ? (
            <div>
              <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
                What changed
              </div>
              <div className="max-h-56 overflow-y-auto rounded-lg border border-zinc-800/80">
                <table className="w-full text-left text-[11px]">
                  <thead className="sticky top-0 bg-zinc-950 text-zinc-500">
                    <tr>
                      <th className="px-2 py-1">Fighter</th>
                      <th className="px-2 py-1">Stat</th>
                      <th className="px-2 py-1">From</th>
                      <th className="px-2 py-1">To</th>
                      <th className="px-2 py-1">Δ</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-800/70">
                    {movers.map((m, i) => (
                      <tr key={`${m.name}-${m.field}-${i}`}>
                        <td className="px-2 py-1 text-zinc-200">
                          {m.name}
                          {m.kind === 'insert' ? (
                            <span className="ml-1 text-[10px] text-emerald-400">new</span>
                          ) : null}
                        </td>
                        <td className="px-2 py-1 font-mono text-zinc-500">{m.field}</td>
                        <td className="px-2 py-1 text-zinc-400">{fmtNum(m.from)}</td>
                        <td className="px-2 py-1 text-amber-200">{fmtNum(m.to)}</td>
                        <td className="px-2 py-1 text-zinc-300">{m.delta == null ? '-' : signed(m.delta)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : gotData ? (
            <p className="text-xs text-zinc-400">No career numbers moved past the noise floor.</p>
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
