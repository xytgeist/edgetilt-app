import { formatOpsMonitorCount } from './opsMonitorApi.js'

const PANEL = 'rounded-2xl border border-zinc-800 bg-zinc-900'
const BTN = 'min-h-9 rounded-xl bg-zinc-800 px-3 text-zinc-200 text-xs font-semibold touch-manipulation hover:bg-zinc-700 disabled:opacity-50'

function overallClass(status) {
  if (status === 'critical') return 'border-red-500/40 bg-red-950/30 text-red-100'
  if (status === 'warn') return 'border-amber-500/35 bg-amber-950/25 text-amber-100'
  return 'border-emerald-500/30 bg-emerald-950/20 text-emerald-100'
}

function Stat({ label, value, hint }) {
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-950/50 px-3 py-2">
      <div className="text-[10px] uppercase tracking-wide text-zinc-500">{label}</div>
      <div className="text-lg font-black tabular-nums text-white">{formatOpsMonitorCount(value)}</div>
      {hint ? <div className="text-[10px] text-zinc-500 mt-0.5">{hint}</div> : null}
    </div>
  )
}

/**
 * @param {{
 *   security: object | null,
 *   loading: boolean,
 *   error: string,
 *   refreshing: boolean,
 *   onReload: () => void,
 * }} props
 */
export default function EdgeMonitorSecurityPanel({
  security,
  loading,
  error,
  refreshing,
  onReload,
}) {
  const reads = security?.guide_reads || {}
  const overall = String(security?.overall || 'ok')
  const topDenied = Array.isArray(security?.top_denied_slugs_24h) ? security.top_denied_slugs_24h : []
  const heavyReaders = Array.isArray(security?.heavy_readers_24h) ? security.heavy_readers_24h : []
  const notes = Array.isArray(security?.notes) ? security.notes : []

  return (
    <section className={`edge-monitor-panel ${PANEL} p-4 mb-4`}>
      <div className="flex flex-wrap items-start justify-between gap-3 mb-3">
        <div>
          <div className="text-white font-bold text-sm">Security · guide reads</div>
          <div className="text-zinc-500 text-[10px] mt-0.5">
            Audit trail from <span className="font-mono">get_guide_content()</span> · scrape signals
          </div>
        </div>
        <button type="button" className={BTN} disabled={refreshing} onClick={onReload}>
          {refreshing ? 'Refreshing…' : 'Refresh'}
        </button>
      </div>

      {loading && !security ? (
        <div className="text-zinc-500 text-sm py-6 text-center">Loading security snapshot…</div>
      ) : null}

      {error ? (
        <div className="rounded-xl border border-red-500/30 bg-red-950/20 px-3 py-2 text-red-200 text-xs mb-3">
          {error}
          {' '}
          Apply migration <span className="font-mono">20260731170000_admin_ops_security_snapshot.sql</span> on this project.
        </div>
      ) : null}

      {security ? (
        <>
          <div className={`rounded-xl border px-3 py-2 text-xs font-bold mb-3 ${overallClass(overall)}`}>
            Overall: {overall.toUpperCase()}
          </div>

          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-2 mb-4">
            <Stat label="Events 24h" value={reads.events_24h} />
            <Stat label="Granted 24h" value={reads.granted_24h} hint="Successful opens" />
            <Stat label="Denied 24h" value={reads.denied_24h} hint="Lock probes" />
            <Stat label="Rate limited 24h" value={reads.rate_limited_24h} />
            <Stat label="Anon granted 1h" value={reads.anon_granted_1h} hint="Shared NAT risk" />
            <Stat label="Rate limits 24h" value={security?.rate_limits?.events_24h} hint="All kinds" />
          </div>

          {topDenied.length > 0 ? (
            <div className="mb-4">
              <div className="text-zinc-300 text-xs font-bold mb-2">Top denied slugs (24h)</div>
              <div className="space-y-1">
                {topDenied.slice(0, 8).map((row) => (
                  <div
                    key={row.slug}
                    className="flex items-center justify-between rounded-lg bg-zinc-950/60 px-2 py-1 text-[11px]"
                  >
                    <span className="font-mono text-zinc-200 truncate">{row.slug}</span>
                    <span className="text-zinc-500 shrink-0 ml-2">
                      {formatOpsMonitorCount(row.count)} · {row.top_reason || 'denied'}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          {heavyReaders.length > 0 ? (
            <div className="mb-4">
              <div className="text-zinc-300 text-xs font-bold mb-2">Heavy readers (≥40 granted / 24h)</div>
              <div className="space-y-1">
                {heavyReaders.slice(0, 8).map((row) => (
                  <div
                    key={row.user_id}
                    className="flex items-center justify-between rounded-lg bg-zinc-950/60 px-2 py-1 text-[11px]"
                  >
                    <span className="text-zinc-200 truncate">
                      {row.handle ? `@${row.handle}` : row.user_id}
                    </span>
                    <span className="text-zinc-500 shrink-0 ml-2 tabular-nums">
                      {formatOpsMonitorCount(row.granted_count)} ok · {formatOpsMonitorCount(row.denied_count)} denied
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          {notes.length > 0 ? (
            <ul className="text-[10px] text-zinc-500 space-y-1 list-disc pl-4">
              {notes.map((note) => (
                <li key={note}>{note}</li>
              ))}
            </ul>
          ) : null}
        </>
      ) : null}
    </section>
  )
}
