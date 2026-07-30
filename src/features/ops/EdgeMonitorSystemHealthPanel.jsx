import { useMemo, useState } from 'react'
import { opsMonitorRunbookById } from './opsMonitorRunbooks.js'
import {
  copyOpsDiagnosticText,
  formatOpsSystemHealthDiagnostic,
  opsJobHealthClass,
  opsJobHealthLabel,
} from './opsMonitorSystemHealth.js'

const PANEL = 'rounded-2xl border border-zinc-800 bg-zinc-900'
const BTN = 'min-h-9 rounded-xl bg-zinc-800 px-3 text-zinc-200 text-xs font-semibold touch-manipulation hover:bg-zinc-700 disabled:opacity-50'
const BTN_PRIMARY =
  'min-h-9 rounded-xl bg-zinc-100 px-4 text-zinc-950 text-xs font-bold touch-manipulation hover:bg-white disabled:opacity-50'

function stripeCustomerUrl(customerId) {
  if (!customerId) return null
  return `https://dashboard.stripe.com/customers/${customerId}`
}

function stripeSubscriptionUrl(subId) {
  if (!subId) return null
  return `https://dashboard.stripe.com/subscriptions/${subId}`
}

/**
 * @param {{
 *   systemHealth: object | null,
 *   loading: boolean,
 *   error: string,
 *   refreshing: boolean,
 *   onReload: () => void,
 *   snapshot?: object | null,
 *   external?: object | null,
 * }} props
 */
export default function EdgeMonitorSystemHealthPanel({
  systemHealth,
  loading,
  error,
  refreshing,
  onReload,
  snapshot = null,
  external = null,
}) {
  const [copyState, setCopyState] = useState('')
  const [jobsFilter, setJobsFilter] = useState('issues')

  const drift = systemHealth?.billing_drift || []
  const jobs = systemHealth?.scheduled_jobs || []
  const gaps = systemHealth?.known_gaps || []
  const summary = systemHealth?.summary || {}

  const filteredJobs = useMemo(() => {
    if (jobsFilter === 'all') return jobs
    return jobs.filter((j) => ['failed', 'stale', 'unscheduled'].includes(j.health))
  }, [jobs, jobsFilter])

  const diagnosticText = useMemo(
    () => formatOpsSystemHealthDiagnostic(systemHealth, { snapshot, external }),
    [systemHealth, snapshot, external],
  )

  async function handleCopyDiagnostic() {
    const { ok, error: copyErr } = await copyOpsDiagnosticText(diagnosticText)
    setCopyState(ok ? 'Copied!' : copyErr || 'Copy failed')
    window.setTimeout(() => setCopyState(''), 2500)
  }

  if (error) {
    return (
      <section className={`edge-monitor-panel ${PANEL} p-4 lg:p-5 mb-4`}>
        <div className="text-white font-bold text-[15px]">System health</div>
        <div className="mt-2 rounded-xl border border-amber-500/30 bg-amber-950/30 px-3 py-2 text-amber-100 text-xs">
          {error}
          <div className="mt-1 opacity-80">
            Apply migrations through <span className="font-mono">20260730240400</span>, then refresh.
          </div>
        </div>
      </section>
    )
  }

  const jobsLoadError = systemHealth?.jobs_error

  return (
    <section className={`edge-monitor-panel ${PANEL} p-4 lg:p-5 mb-4 lg:col-span-2`} data-edge-monitor-system-health>
      <div className="flex flex-wrap items-start justify-between gap-3 mb-3">
        <div>
          <div className="text-white font-bold text-[15px] lg:text-base">System health</div>
          <div className="text-zinc-500 text-xs mt-0.5">
            Scheduled jobs · billing drift · copy diagnostic for triage
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => void onReload()} disabled={loading || refreshing} className={BTN}>
            {refreshing ? 'Refreshing…' : 'Refresh health'}
          </button>
          <button
            type="button"
            onClick={() => void handleCopyDiagnostic()}
            disabled={!systemHealth}
            className={BTN_PRIMARY}
          >
            {copyState || 'Copy diagnostic'}
          </button>
        </div>
      </div>

      {loading && !systemHealth ? (
        <div className="edge-monitor-shimmer h-16 rounded-xl bg-zinc-800/60" />
      ) : null}

      {systemHealth ? (
        <>
          <div className="mb-4 flex flex-wrap gap-2 text-[11px]">
            <span
              className={`rounded-lg px-2.5 py-1 font-bold ring-1 ${
                summary.overall === 'critical'
                  ? 'text-red-200 bg-red-950/40 ring-red-500/30'
                  : summary.overall === 'warn'
                    ? 'text-amber-200 bg-amber-950/40 ring-amber-500/30'
                    : 'text-emerald-300 bg-emerald-950/40 ring-emerald-500/30'
              }`}
            >
              Overall: {summary.overall || 'ok'}
            </span>
            <span className="rounded-lg bg-zinc-950 px-2.5 py-1 text-zinc-300 ring-1 ring-zinc-700">
              Jobs OK: {summary.jobs_ok ?? 0}/{summary.jobs_total ?? 0}
            </span>
            <span className="rounded-lg bg-zinc-950 px-2.5 py-1 text-zinc-300 ring-1 ring-zinc-700">
              Billing drift: {summary.drift_cases ?? 0}
            </span>
          </div>

          {jobsLoadError ? (
            <div className="mb-4 rounded-xl border border-amber-500/30 bg-amber-950/25 px-3 py-2 text-amber-100 text-xs">
              Scheduled jobs unavailable: {jobsLoadError}. Billing drift above still loaded. Apply{' '}
              <span className="font-mono">20260730240400</span> and refresh.
            </div>
          ) : null}

          {drift.length > 0 ? (
            <div className="mb-4 space-y-2">
              <div className="text-red-200 text-xs font-bold uppercase tracking-wide">
                Needs attention — paid but no access
              </div>
              {drift.map((c) => (
                <div
                  key={`${c.case_code}-${c.user_id}`}
                  className="rounded-2xl border border-red-500/40 bg-red-950/35 px-4 py-3"
                >
                  <div className="text-red-100 font-bold text-sm">
                    {c.display_name || c.handle || 'Unknown user'}
                    {c.handle ? <span className="text-red-200/80 font-semibold"> @{c.handle}</span> : null}
                  </div>
                  <div className="text-red-100/90 text-xs mt-1 leading-relaxed">{c.message}</div>
                  <div className="mt-2 flex flex-wrap gap-2 text-[10px]">
                    {c.db_status ? (
                      <span className="rounded-md bg-black/25 px-2 py-0.5 font-mono">DB: {c.db_status}</span>
                    ) : null}
                    {c.product_slug ? (
                      <span className="rounded-md bg-black/25 px-2 py-0.5">{c.product_slug}</span>
                    ) : null}
                    {c.stripe_customer_id ? (
                      <a
                        href={stripeCustomerUrl(c.stripe_customer_id) || '#'}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="rounded-md bg-black/25 px-2 py-0.5 text-cyan-300 hover:underline"
                      >
                        Stripe customer ↗
                      </a>
                    ) : null}
                    {c.stripe_subscription_id ? (
                      <a
                        href={stripeSubscriptionUrl(c.stripe_subscription_id) || '#'}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="rounded-md bg-black/25 px-2 py-0.5 text-cyan-300 hover:underline"
                      >
                        Stripe sub ↗
                      </a>
                    ) : null}
                  </div>
                  {c.suggested_action ? (
                    <div className="mt-2 text-[10px] text-red-200/70 font-mono break-all">{c.suggested_action}</div>
                  ) : null}
                </div>
              ))}
            </div>
          ) : (
            <div className="mb-4 rounded-xl border border-emerald-500/25 bg-emerald-950/20 px-3 py-2 text-emerald-100 text-xs">
              No billing drift cases — no one stuck on incomplete with paid access symptoms.
            </div>
          )}

          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <div className="text-white text-xs font-bold">Scheduled jobs</div>
            <div className="flex gap-1">
              {[
                { id: 'issues', label: 'Issues only' },
                { id: 'all', label: 'All' },
              ].map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setJobsFilter(opt.id)}
                  className={`rounded-lg px-2.5 py-1 text-[10px] font-semibold ${
                    jobsFilter === opt.id ? 'bg-zinc-100 text-zinc-950' : 'bg-zinc-800 text-zinc-300'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          <div className="overflow-x-auto rounded-xl border border-zinc-800">
            <table className="w-full min-w-[640px] text-left text-xs">
              <thead className="bg-zinc-950 text-zinc-500 uppercase text-[10px]">
                <tr>
                  <th className="px-3 py-2 font-semibold">Job</th>
                  <th className="px-3 py-2 font-semibold">Schedule</th>
                  <th className="px-3 py-2 font-semibold">Last run</th>
                  <th className="px-3 py-2 font-semibold">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/80">
                {filteredJobs.length ? (
                  filteredJobs.map((job) => (
                    <tr key={job.id || job.jobname || job.label} className="bg-zinc-950/40">
                      <td className="px-3 py-2.5 text-zinc-100">
                        <div className="font-semibold">{job.label}</div>
                        <div className="text-zinc-500 text-[10px] mt-0.5 capitalize">{job.category}</div>
                      </td>
                      <td className="px-3 py-2.5 text-zinc-400">{job.schedule_hint || job.cron_schedule || '—'}</td>
                      <td className="px-3 py-2.5 text-zinc-400 tabular-nums">
                        {job.last_start
                          ? new Date(job.last_start).toLocaleString(undefined, {
                              month: 'short',
                              day: 'numeric',
                              hour: 'numeric',
                              minute: '2-digit',
                            })
                          : '—'}
                      </td>
                      <td className="px-3 py-2.5">
                        <span
                          className={`inline-flex rounded-md px-2 py-0.5 text-[10px] font-bold ring-1 ${opsJobHealthClass(job.health)}`}
                        >
                          {opsJobHealthLabel(job.health)}
                        </span>
                        {job.hint ? (
                          <div className="text-zinc-500 text-[10px] mt-1 max-w-xs leading-snug">{job.hint}</div>
                        ) : null}
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={4} className="px-3 py-4 text-zinc-500 text-center">
                      {jobsFilter === 'issues' ? 'No job issues detected.' : 'No scheduled jobs in registry.'}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {gaps.length ? (
            <div className="mt-4 rounded-xl border border-amber-500/25 bg-amber-950/15 px-3 py-2 text-amber-100 text-xs">
              <div className="font-bold mb-1">Known gaps</div>
              <ul className="space-y-1 list-disc pl-4">
                {gaps.map((g) => (
                  <li key={g.id}>
                    <span className="font-semibold">{g.label}</span> — {g.schedule_hint}
                    {g.runbook_id && opsMonitorRunbookById(g.runbook_id)?.href ? (
                      <>
                        {' '}
                        <a
                          href={opsMonitorRunbookById(g.runbook_id).href}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-cyan-300 hover:underline"
                        >
                          Runbook ↗
                        </a>
                      </>
                    ) : null}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </>
      ) : null}
    </section>
  )
}
