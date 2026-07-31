import { useMemo } from 'react'
import { appProductSectionLabel } from '../../constants/appProductSections.js'
import { MonitorBarChart } from './OpsMonitorCharts.jsx'
import { formatOpsMonitorCount } from './opsMonitorApi.js'
import { OPS_CHART_COLORS, OPS_SECTION_THEMES } from './opsMonitorTheme.js'

/**
 * @param {{
 *   usage: object | null | undefined,
 *   loading?: boolean,
 *   error?: string,
 * }} props
 */
export default function EdgeMonitorAppSectionUsagePanel({ usage, loading = false, error = '' }) {
  const theme = OPS_SECTION_THEMES.tools
  const sections = usage?.sections || []

  const chart = useMemo(() => {
    const sorted = [...sections].sort(
      (a, b) => (Number(b.visits_7d) || 0) - (Number(a.visits_7d) || 0),
    )
    return {
      labels: sorted.map((row) => appProductSectionLabel(row.section_id)),
      values: sorted.map((row) => Number(row.visits_7d) || 0),
    }
  }, [sections])

  const totalVisits24h = sections.reduce((sum, row) => sum + (Number(row.visits_24h) || 0), 0)
  const totalUsers24h = usage?.unique_users_24h ?? 0

  return (
    <section
      className="edge-monitor-panel rounded-2xl border border-zinc-800 bg-zinc-900 p-4 lg:p-5 mb-4 lg:col-span-full"
      data-edge-monitor-section-usage
      style={{ borderLeftWidth: 3, borderLeftColor: theme.accent }}
    >
      <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-lg" aria-hidden>
              {theme.icon}
            </span>
            <div className="text-white font-bold text-[15px]">App section visits</div>
          </div>
          <div className="text-zinc-500 text-xs mt-0.5 leading-relaxed">
            Logged-in tab opens · debounced 45s per section · excludes Monitor and Bots
          </div>
        </div>
        {usage?.generated_at ? (
          <div className="text-zinc-500 text-[10px] tabular-nums">
            Updated {new Date(usage.generated_at).toLocaleString(undefined, { hour: 'numeric', minute: '2-digit' })}
          </div>
        ) : null}
      </div>

      {error ? (
        <div className="mb-3 rounded-xl border border-amber-500/30 bg-amber-950/25 px-3 py-2 text-amber-100 text-xs">
          {error} ... apply migrations <span className="font-mono">20260731210000</span>–<span className="font-mono">10701</span>.
        </div>
      ) : null}

      {loading && !usage ? (
        <div className="edge-monitor-shimmer h-20 rounded-xl bg-zinc-800/60" />
      ) : null}

      {usage ? (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-3">
            <div className="rounded-xl bg-zinc-950 border border-zinc-800 px-3 py-2">
              <div className="text-zinc-500 text-[10px] uppercase">Visits 24h</div>
              <div className="text-white font-bold tabular-nums mt-0.5">{formatOpsMonitorCount(totalVisits24h)}</div>
            </div>
            <div className="rounded-xl bg-zinc-950 border border-zinc-800 px-3 py-2">
              <div className="text-zinc-500 text-[10px] uppercase">Users 24h</div>
              <div className="text-white font-bold tabular-nums mt-0.5">{formatOpsMonitorCount(totalUsers24h)}</div>
            </div>
            <div className="rounded-xl bg-zinc-950 border border-zinc-800 px-3 py-2 col-span-2 sm:col-span-2">
              <div className="text-zinc-500 text-[10px] uppercase">Top 7d</div>
              <div className="text-white text-sm font-semibold mt-0.5 truncate">
                {chart.labels[0] ? `${chart.labels[0]} · ${formatOpsMonitorCount(chart.values[0])}` : '—'}
              </div>
            </div>
          </div>

          {chart.values.some((v) => v > 0) ? (
            <div className="mb-3 rounded-xl border border-zinc-800 bg-zinc-950 p-3">
              <div className="text-zinc-500 text-[10px] font-semibold uppercase tracking-wide mb-2">
                Visits by section (7d)
              </div>
              <MonitorBarChart
                labels={chart.labels}
                values={chart.values}
                color={OPS_CHART_COLORS.pink}
                height={200}
              />
            </div>
          ) : (
            <div className="mb-3 rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-3 text-zinc-500 text-xs">
              No section visits recorded yet. Data appears after members navigate the app with migration applied.
            </div>
          )}

          <div className="overflow-x-auto rounded-xl border border-zinc-800">
            <table className="w-full min-w-[520px] text-left text-xs">
              <thead className="bg-zinc-950 text-zinc-500 uppercase text-[10px]">
                <tr>
                  <th className="px-3 py-2 font-semibold">Section</th>
                  <th className="px-3 py-2 font-semibold text-right">Visits 24h</th>
                  <th className="px-3 py-2 font-semibold text-right">Users 24h</th>
                  <th className="px-3 py-2 font-semibold text-right">Visits 7d</th>
                  <th className="px-3 py-2 font-semibold text-right">Users 7d</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/80">
                {sections.map((row) => (
                  <tr key={row.section_id} className="bg-zinc-950/40">
                    <td className="px-3 py-2.5 text-zinc-100 font-semibold">
                      {appProductSectionLabel(row.section_id)}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-zinc-300">
                      {formatOpsMonitorCount(row.visits_24h)}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-zinc-400">
                      {formatOpsMonitorCount(row.unique_users_24h)}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-zinc-200">
                      {formatOpsMonitorCount(row.visits_7d)}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-zinc-400">
                      {formatOpsMonitorCount(row.unique_users_7d)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      ) : null}
    </section>
  )
}
