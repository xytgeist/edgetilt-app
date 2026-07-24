import { useMemo, useState } from 'react'
import { ChevronDown, Download } from 'lucide-react'
import { formatOpsMonitorCount } from './opsMonitorApi.js'
import { OPS_CHART_COLORS, OPS_SECTION_THEMES } from './opsMonitorTheme.js'
import {
  downloadOpsMonitorCsv,
  formatOpsRosterHandle,
  formatOpsRosterWhen,
  opsMonitorProfileHref,
  opsMonitorUserSignupDailySeries,
  opsMonitorUserSignupGrowth,
  opsMonitorUserSignupsSummary,
  opsRecentSignupsToCsv,
  opsStripeCustomerDashboardUrl,
} from './opsMonitorSubscriberRoster.js'
import { MonitorSparklineChart } from './OpsMonitorCharts.jsx'

function SignupMetric({ label, value, accent = OPS_CHART_COLORS.cyan }) {
  return (
    <div
      className="rounded-xl bg-zinc-950 border border-zinc-800 px-3 py-2 min-w-0"
      style={{ borderLeftWidth: 3, borderLeftColor: accent }}
    >
      <div className="text-zinc-500 text-[10px] font-semibold uppercase tracking-wide truncate">{label}</div>
      <div className="text-white font-bold tabular-nums mt-0.5">{formatOpsMonitorCount(value)}</div>
    </div>
  )
}

function SignupGrowthMetric({ label, growth, hint }) {
  const valueClass =
    growth?.direction === 'up'
      ? 'text-emerald-400'
      : growth?.direction === 'down'
        ? 'text-red-400'
        : 'text-zinc-300'
  return (
    <div
      className="rounded-xl bg-zinc-950 border border-zinc-800 px-3 py-2 min-w-0"
      style={{ borderLeftWidth: 3, borderLeftColor: OPS_CHART_COLORS.yellow }}
    >
      <div className="text-zinc-500 text-[10px] font-semibold uppercase tracking-wide truncate">{label}</div>
      <div className={`font-bold tabular-nums mt-0.5 ${growth ? valueClass : 'text-zinc-500'}`}>
        {growth?.label || '...'}
      </div>
      {hint ? <div className="text-zinc-600 text-[10px] mt-0.5 truncate">{hint}</div> : null}
    </div>
  )
}

function ProfileCell({ handle, userId, displayName, email }) {
  const href = opsMonitorProfileHref({ handle, user_id: userId })
  const label = formatOpsRosterHandle(handle)
  return (
    <td className="px-3 py-2.5">
      {href ? (
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className="font-semibold text-white hover:underline"
          title="Open profile"
        >
          {label}
        </a>
      ) : (
        <div className="font-semibold text-white">{label}</div>
      )}
      {displayName ? <div className="text-zinc-400 truncate max-w-[220px]">{displayName}</div> : null}
      {email ? <div className="text-zinc-500 truncate max-w-[220px]">{email}</div> : null}
    </td>
  )
}

function StripeCustomerLink({ customerId }) {
  const href = opsStripeCustomerDashboardUrl(customerId)
  if (!href) return <span className="text-zinc-600">...</span>
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center text-[10px] font-semibold text-violet-300 hover:text-violet-200 hover:underline"
    >
      Customer ↗
    </a>
  )
}

/**
 * @param {{
 *   roster: object | null,
 *   signupTrends30d?: Array<object> | null,
 *   loading: boolean,
 *   error: string,
 * }} props
 */
export default function EdgeMonitorUserSignupsPanel({ roster, signupTrends30d = null, loading, error }) {
  const [search, setSearch] = useState('')
  const [listOpen, setListOpen] = useState(false)
  const summary = useMemo(() => opsMonitorUserSignupsSummary(roster), [roster])
  const growth = useMemo(
    () => opsMonitorUserSignupGrowth(signupTrends30d, roster?.users || {}),
    [signupTrends30d, roster?.users],
  )
  const dailySeries = useMemo(() => opsMonitorUserSignupDailySeries(signupTrends30d), [signupTrends30d])
  const theme = OPS_SECTION_THEMES.users
  const users = roster?.users || {}
  const q = search.trim().toLowerCase()

  const recentSignups = useMemo(() => {
    const rows = Array.isArray(users.recent) ? users.recent : []
    if (!q) return rows
    return rows.filter((r) =>
      [r.handle, r.display_name, r.email, r.role].some((p) => String(p || '').toLowerCase().includes(q)),
    )
  }, [users.recent, q])

  const recentTotal = Array.isArray(users.recent) ? users.recent.length : 0

  const onExport = () => {
    const stamp = new Date().toISOString().slice(0, 10)
    downloadOpsMonitorCsv(opsRecentSignupsToCsv(users.recent || []), `edge-new-users-${stamp}.csv`)
  }

  return (
    <section
      className="edge-monitor-panel rounded-2xl border border-zinc-800 bg-zinc-900 p-4 lg:p-5 mb-4 lg:col-span-full"
      data-edge-monitor-user-signups
      style={{ borderLeftWidth: 3, borderLeftColor: theme.accent }}
    >
      <div className="flex flex-wrap items-start justify-between gap-3 mb-3">
        <div className="flex items-start gap-2.5 min-w-0">
          <span
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-zinc-800 text-lg"
            aria-hidden
          >
            {theme.icon}
          </span>
          <div className="min-w-0">
            <div className="text-white font-bold text-[15px] lg:text-base">New accounts</div>
            <div className="text-zinc-500 text-xs mt-0.5 leading-relaxed">
              Profile signups (free + paid) · not the same as new Stripe subscribers
            </div>
          </div>
        </div>
        <button
          type="button"
          onClick={onExport}
          disabled={!roster || loading}
          className="min-h-8 inline-flex items-center gap-1.5 rounded-lg bg-zinc-800 px-3 text-zinc-200 text-[11px] font-semibold hover:bg-zinc-700 disabled:opacity-50"
        >
          <Download className="h-3.5 w-3.5" aria-hidden />
          CSV
        </button>
      </div>

      {error ? (
        <div className="mb-3 rounded-xl border border-amber-500/30 bg-amber-950/30 px-3 py-2 text-amber-100 text-xs leading-relaxed">
          {error}
        </div>
      ) : null}

      {loading && !roster ? (
        <div className="edge-monitor-shimmer h-24 rounded-xl bg-zinc-800/60" />
      ) : null}

      {roster ? (
        <>
          <div className="grid grid-cols-3 gap-2 mb-3">
            <SignupMetric label="Signups 24h" value={summary.new24h} accent={OPS_CHART_COLORS.green} />
            <SignupMetric label="Signups 7d" value={summary.new7d} accent={OPS_CHART_COLORS.cyan} />
            <SignupMetric label="Signups 30d" value={summary.new30d} />
          </div>

          <div className="grid grid-cols-3 gap-2 mb-3">
            <SignupGrowthMetric label="Growth · day" growth={growth.day} hint="vs yesterday (UTC)" />
            <SignupGrowthMetric label="Growth · week" growth={growth.week} hint="last 7d vs prior 7d" />
            <SignupGrowthMetric
              label="Growth · month"
              growth={growth.month}
              hint="last 30d vs prior 30d"
            />
          </div>

          {dailySeries.values.length > 0 ? (
            <div className="mb-3">
              <div className="mb-2">
                <div className="text-white text-sm font-bold">Signups by day</div>
                <div className="text-zinc-500 text-[10px]">UTC daily · last 30 days</div>
              </div>
              <MonitorSparklineChart
                labels={dailySeries.labels}
                values={dailySeries.values}
                color={OPS_CHART_COLORS.cyan}
                label="New accounts"
                height={168}
              />
            </div>
          ) : null}

          <div className="rounded-xl border border-zinc-800 bg-zinc-950">
            <button
              type="button"
              onClick={() => setListOpen((v) => !v)}
              className="flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left touch-manipulation hover:bg-zinc-900/80"
              aria-expanded={listOpen}
            >
              <div className="min-w-0">
                <div className="text-white text-sm font-semibold">Recent signups</div>
                <div className="text-zinc-500 text-[10px] mt-0.5">
                  {recentTotal} loaded · tap to {listOpen ? 'hide' : 'browse'}
                </div>
              </div>
              <ChevronDown
                className={`h-4 w-4 shrink-0 text-zinc-400 transition-transform ${listOpen ? 'rotate-180' : ''}`}
                aria-hidden
              />
            </button>

            {listOpen ? (
              <div className="border-t border-zinc-800 px-3 pb-3 pt-2">
                <input
                  type="search"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Filter handle, email, role…"
                  className="mb-2 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-2.5 py-1.5 text-xs text-white placeholder:text-zinc-500"
                />

                <div className="overflow-x-auto overflow-y-auto max-h-52 rounded-lg border border-zinc-800">
                  <table className="w-full min-w-[520px] text-left text-xs">
                    <thead className="sticky top-0 z-10 bg-zinc-950 text-zinc-500 uppercase text-[10px] tracking-wide border-b border-zinc-800">
                      <tr>
                        <th className="px-2.5 py-1.5 font-semibold">Member</th>
                        <th className="px-2.5 py-1.5 font-semibold">Role</th>
                        <th className="px-2.5 py-1.5 font-semibold">Joined</th>
                        <th className="px-2.5 py-1.5 font-semibold">Stripe</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-800">
                      {recentSignups.length === 0 ? (
                        <tr>
                          <td colSpan={4} className="px-2.5 py-3 text-zinc-500 text-xs text-center">
                            No matching signups
                          </td>
                        </tr>
                      ) : (
                        recentSignups.map((row) => (
                          <tr key={row.user_id}>
                            <ProfileCell
                              handle={row.handle}
                              userId={row.user_id}
                              displayName={row.display_name}
                              email={row.email}
                            />
                            <td className="px-2.5 py-2 capitalize text-zinc-300">{row.role || 'user'}</td>
                            <td className="px-2.5 py-2 text-zinc-400 tabular-nums whitespace-nowrap">
                              {formatOpsRosterWhen(row.created_at)}
                            </td>
                            <td className="px-2.5 py-2">
                              <StripeCustomerLink customerId={row.stripe_customer_id} />
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : null}
          </div>
        </>
      ) : null}
    </section>
  )
}
