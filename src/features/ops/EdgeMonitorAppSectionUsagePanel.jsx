import { useMemo, useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { CALCULATOR_CATALOG_ENTRIES } from '../calculators/calculatorAccess.js'
import { appProductSectionLabel } from '../../constants/appProductSections.js'
import { MonitorBarChart } from './OpsMonitorCharts.jsx'
import { formatOpsMonitorCount } from './opsMonitorApi.js'
import { OPS_CHART_COLORS, OPS_SECTION_THEMES } from './opsMonitorTheme.js'

/**
 * @param {Array<{ sub_section_id?: string, label?: string, visits_7d?: number }>} rows
 */
function mergeCalculatorBreakdown(rows) {
  const byKey = new Map(
    (rows || []).map((row) => [String(row.sub_section_id || '').trim().toLowerCase(), row]),
  )
  return CALCULATOR_CATALOG_ENTRIES.map((calc) => {
    const stats = byKey.get(calc.key) || {}
    return {
      sub_section_id: calc.key,
      label: calc.title,
      visits_24h: Number(stats.visits_24h) || 0,
      visits_7d: Number(stats.visits_7d) || 0,
      unique_users_24h: Number(stats.unique_users_24h) || 0,
      unique_users_7d: Number(stats.unique_users_7d) || 0,
    }
  }).sort((a, b) => b.visits_7d - a.visits_7d || a.label.localeCompare(b.label))
}

/**
 * @param {{
 *   title: string,
 *   rows: Array<Record<string, unknown>>,
 *   countKey: string,
 *   usersKey?: string,
 *   labelKey?: string,
 * }} props
 */
function BreakdownTable({ title, rows, countKey, usersKey = '', labelKey = 'label' }) {
  if (!rows?.length) return null
  const hasData = rows.some((row) => Number(row[countKey]) > 0)
  if (!hasData) return null

  return (
    <div className="mb-3 overflow-x-auto rounded-xl border border-zinc-800">
      <div className="border-b border-zinc-800 bg-zinc-950 px-3 py-2 text-zinc-500 text-[10px] font-semibold uppercase tracking-wide">
        {title}
      </div>
      <table className="w-full min-w-[420px] text-left text-xs">
        <thead className="bg-zinc-950/80 text-zinc-500 uppercase text-[10px]">
          <tr>
            <th className="px-3 py-2 font-semibold">Item</th>
            <th className="px-3 py-2 font-semibold text-right">24h</th>
            {usersKey ? (
              <th className="px-3 py-2 font-semibold text-right">Users 24h</th>
            ) : null}
            <th className="px-3 py-2 font-semibold text-right">7d</th>
            {usersKey ? (
              <th className="px-3 py-2 font-semibold text-right">Users 7d</th>
            ) : null}
          </tr>
        </thead>
        <tbody className="divide-y divide-zinc-800/80">
          {rows.map((row) => (
            <tr key={String(row.sub_section_id || row[labelKey])} className="bg-zinc-950/40">
              <td className="px-3 py-2.5 text-zinc-100 font-semibold">
                {String(row[labelKey] || row.sub_section_id || 'Unknown')}
              </td>
              <td className="px-3 py-2.5 text-right tabular-nums text-zinc-300">
                {formatOpsMonitorCount(row[`${countKey.replace('_7d', '_24h')}`] ?? row.sessions_24h ?? row.visits_24h)}
              </td>
              {usersKey ? (
                <td className="px-3 py-2.5 text-right tabular-nums text-zinc-400">
                  {formatOpsMonitorCount(row[`${usersKey.replace('_7d', '_24h')}`] ?? row.session_users_24h ?? row.unique_users_24h)}
                </td>
              ) : null}
              <td className="px-3 py-2.5 text-right tabular-nums text-zinc-200">
                {formatOpsMonitorCount(row[countKey])}
              </td>
              {usersKey ? (
                <td className="px-3 py-2.5 text-right tabular-nums text-zinc-400">
                  {formatOpsMonitorCount(row[usersKey])}
                </td>
              ) : null}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/**
 * @param {{
 *   usage: object | null | undefined,
 *   loading?: boolean,
 *   error?: string,
 * }} props
 */
export default function EdgeMonitorAppSectionUsagePanel({ usage, loading = false, error = '' }) {
  const [sectionTableOpen, setSectionTableOpen] = useState(false)
  const theme = OPS_SECTION_THEMES.tools
  const sections = usage?.sections || []

  const chart = useMemo(() => {
    const sorted = [...sections].sort(
      (a, b) => (Number(b.visits_7d) || 0) - (a.visits_7d) || 0,
    )
    return {
      labels: sorted.map((row) => appProductSectionLabel(row.section_id)),
      values: sorted.map((row) => Number(row.visits_7d) || 0),
    }
  }, [sections])

  const calculatorBreakdown = useMemo(() => {
    const calcSection = sections.find((row) => row.section_id === 'calculators')
    return mergeCalculatorBreakdown(calcSection?.visit_breakdown || [])
  }, [sections])

  const calculatorChart = useMemo(() => {
    const active = calculatorBreakdown.filter((row) => row.visits_7d > 0)
    return {
      labels: active.map((row) => row.label),
      values: active.map((row) => row.visits_7d),
    }
  }, [calculatorBreakdown])

  const playLogSection = sections.find((row) => row.section_id === 'play-logbook')
  const pokerSection = sections.find((row) => row.section_id === 'poker-bankroll')

  const totalVisits24h = sections.reduce((sum, row) => sum + (Number(row.visits_24h) || 0), 0)
  const totalUsers24h = usage?.unique_users_24h ?? 0
  const totalSessions24h =
    (Number(playLogSection?.sessions_24h) || 0) + (Number(pokerSection?.sessions_24h) || 0)

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
            Tab opens · calculator opens · logbook / poker session saves · 45s debounce on navigation · excludes admin, blocklisted emails/handles, and bot accounts · excludes Monitor and Bots
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
          {error} ... apply migrations <span className="font-mono">20260731210000</span>–<span className="font-mono">20600</span>.
        </div>
      ) : null}

      {loading && !usage ? (
        <div className="edge-monitor-shimmer h-20 rounded-xl bg-zinc-800/60" />
      ) : null}

      {usage ? (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-3">
            <div className="rounded-xl bg-zinc-950 border border-zinc-800 px-3 py-2">
              <div className="text-zinc-500 text-[10px] uppercase">Tab visits 24h</div>
              <div className="text-white font-bold tabular-nums mt-0.5">{formatOpsMonitorCount(totalVisits24h)}</div>
            </div>
            <div className="rounded-xl bg-zinc-950 border border-zinc-800 px-3 py-2">
              <div className="text-zinc-500 text-[10px] uppercase">Users 24h</div>
              <div className="text-white font-bold tabular-nums mt-0.5">{formatOpsMonitorCount(totalUsers24h)}</div>
            </div>
            <div className="rounded-xl bg-zinc-950 border border-zinc-800 px-3 py-2">
              <div className="text-zinc-500 text-[10px] uppercase">Sessions saved 24h</div>
              <div className="text-white font-bold tabular-nums mt-0.5">{formatOpsMonitorCount(totalSessions24h)}</div>
            </div>
            <div className="rounded-xl bg-zinc-950 border border-zinc-800 px-3 py-2">
              <div className="text-zinc-500 text-[10px] uppercase">Top tab 7d</div>
              <div className="text-white text-sm font-semibold mt-0.5 truncate">
                {chart.labels[0] ? `${chart.labels[0]} · ${formatOpsMonitorCount(chart.values[0])}` : '—'}
              </div>
            </div>
          </div>

          {chart.values.some((v) => v > 0) ? (
            <div className="mb-3 rounded-xl border border-zinc-800 bg-zinc-950 p-3">
              <div className="text-zinc-500 text-[10px] font-semibold uppercase tracking-wide mb-2">
                Tab visits by section (7d)
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
              No tab visits recorded yet. Data appears after members navigate the app.
            </div>
          )}

          {calculatorChart.values.length > 0 ? (
            <div className="mb-3 rounded-xl border border-zinc-800 bg-zinc-950 p-3">
              <div className="text-zinc-500 text-[10px] font-semibold uppercase tracking-wide mb-2">
                Calculator opens (7d)
              </div>
              <MonitorBarChart
                labels={calculatorChart.labels}
                values={calculatorChart.values}
                color={OPS_CHART_COLORS.cyan}
                height={180}
              />
            </div>
          ) : null}

          <BreakdownTable
            title="Calculator opens"
            rows={calculatorBreakdown}
            countKey="visits_7d"
            usersKey="unique_users_7d"
          />

          <BreakdownTable
            title="Play Logbook sessions saved"
            rows={playLogSection?.session_breakdown || []}
            countKey="sessions_7d"
            usersKey="session_users_7d"
          />

          <BreakdownTable
            title="Poker Bankroll sessions saved"
            rows={pokerSection?.session_breakdown || []}
            countKey="sessions_7d"
            usersKey="session_users_7d"
          />

          <div className="rounded-xl border border-zinc-800 bg-zinc-950">
            <button
              type="button"
              onClick={() => setSectionTableOpen((v) => !v)}
              className="flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left touch-manipulation hover:bg-zinc-900/80"
              aria-expanded={sectionTableOpen}
            >
              <div className="min-w-0">
                <div className="text-white text-sm font-semibold">All sections</div>
                <div className="text-zinc-500 text-[10px] mt-0.5">
                  {sections.length} sections · tap to {sectionTableOpen ? 'hide' : 'expand'}
                </div>
              </div>
              <ChevronDown
                className={`h-4 w-4 shrink-0 text-zinc-400 transition-transform ${sectionTableOpen ? 'rotate-180' : ''}`}
                aria-hidden
              />
            </button>

            {sectionTableOpen ? (
              <div className="overflow-x-auto border-t border-zinc-800">
                <table className="w-full min-w-[640px] text-left text-xs">
                  <thead className="bg-zinc-950 text-zinc-500 uppercase text-[10px]">
                    <tr>
                      <th className="px-3 py-2 font-semibold">Section</th>
                      <th className="px-3 py-2 font-semibold text-right">Tab 24h</th>
                      <th className="px-3 py-2 font-semibold text-right">Users 24h</th>
                      <th className="px-3 py-2 font-semibold text-right">Tab 7d</th>
                      <th className="px-3 py-2 font-semibold text-right">Users 7d</th>
                      <th className="px-3 py-2 font-semibold text-right">Sessions 24h</th>
                      <th className="px-3 py-2 font-semibold text-right">Sessions 7d</th>
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
                        <td className="px-3 py-2.5 text-right tabular-nums text-zinc-300">
                          {row.section_id === 'play-logbook' || row.section_id === 'poker-bankroll'
                            ? formatOpsMonitorCount(row.sessions_24h)
                            : '—'}
                        </td>
                        <td className="px-3 py-2.5 text-right tabular-nums text-zinc-200">
                          {row.section_id === 'play-logbook' || row.section_id === 'poker-bankroll'
                            ? formatOpsMonitorCount(row.sessions_7d)
                            : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}
          </div>
        </>
      ) : null}
    </section>
  )
}
