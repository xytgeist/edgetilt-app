/** System health helpers: scheduled jobs + billing drift (Edge Monitor). */

import { APP_BUILD_SHA } from '../../utils/appBuildInfo.js'
import { opsMonitorRunbookById } from './opsMonitorRunbooks.js'
import { opsMonitorSupabaseProjectRef } from './opsMonitorApi.js'

/** @typedef {'ok' | 'failed' | 'stale' | 'disabled' | 'external' | 'unscheduled'} OpsJobHealth */

/**
 * @param {object | null | undefined} systemHealth
 * @returns {Array<{ id: string, severity: 'warn' | 'critical', label: string, message: string, runbookId?: string }>}
 */
export function evaluateSystemHealthAlerts(systemHealth) {
  if (!systemHealth) return []

  /** @type {Array<{ id: string, severity: 'warn' | 'critical', label: string, message: string, runbookId?: string }>} */
  const alerts = []

  for (const drift of systemHealth.billing_drift || []) {
    const name = drift.display_name || drift.handle || 'Unknown user'
    alerts.push({
      id: `drift-${drift.case_code}-${drift.user_id}`,
      severity: drift.severity === 'critical' ? 'critical' : 'warn',
      label: `${name} — paid but no access`,
      message: drift.message || drift.case_code,
      runbookId: 'billing-drift',
    })
  }

  for (const job of systemHealth.scheduled_jobs || []) {
    if (!['failed', 'stale', 'unscheduled'].includes(job.health)) continue
    const severity =
      job.health === 'failed' || (job.critical && job.health === 'stale') ? 'critical' : 'warn'
    alerts.push({
      id: `job-${job.id || job.jobname || job.label}`,
      severity,
      label: `${job.label} — ${job.health}`,
      message: job.hint || job.return_message || job.schedule_hint || '',
      runbookId: job.runbook_id || 'prod-checklist',
    })
  }

  return alerts.sort((a, b) => {
    if (a.severity === b.severity) return a.label.localeCompare(b.label)
    return a.severity === 'critical' ? -1 : 1
  })
}

/** @param {OpsJobHealth | string | undefined} health */
export function opsJobHealthLabel(health) {
  switch (health) {
    case 'ok':
      return 'OK'
    case 'failed':
      return 'Failed'
    case 'stale':
      return 'Stale'
    case 'disabled':
      return 'Disabled'
    case 'external':
      return 'External'
    case 'unscheduled':
      return 'Not scheduled'
    default:
      return health || '—'
  }
}

/** @param {OpsJobHealth | string | undefined} health */
export function opsJobHealthClass(health) {
  switch (health) {
    case 'ok':
      return 'text-emerald-300 bg-emerald-950/40 ring-emerald-500/30'
    case 'failed':
    case 'stale':
      return 'text-red-200 bg-red-950/40 ring-red-500/30'
    case 'unscheduled':
      return 'text-amber-200 bg-amber-950/40 ring-amber-500/30'
    case 'disabled':
    case 'external':
      return 'text-zinc-300 bg-zinc-800/60 ring-zinc-600/30'
    default:
      return 'text-zinc-300 bg-zinc-800/60 ring-zinc-600/30'
  }
}

/**
 * @param {object | null | undefined} systemHealth
 * @param {{ snapshot?: object | null, external?: object | null }} [ctx]
 */
export function formatOpsSystemHealthDiagnostic(systemHealth, ctx = {}) {
  const lines = []
  const project = opsMonitorSupabaseProjectRef()
  const generated = systemHealth?.generated_at
    ? new Date(systemHealth.generated_at).toISOString()
    : new Date().toISOString()

  lines.push('=== EdgeTilt System Health Diagnostic ===')
  lines.push(`project: ${project}`)
  lines.push(`generated: ${generated}`)
  lines.push(`build: ${APP_BUILD_SHA.slice(0, 7)}`)
  lines.push(`overall: ${systemHealth?.summary?.overall || 'unknown'}`)
  lines.push('')

  const drift = systemHealth?.billing_drift || []
  if (drift.length) {
    lines.push(`--- Billing drift (${drift.length}) ---`)
    for (const c of drift) {
      lines.push(`[${String(c.severity || 'warn').toUpperCase()}] ${c.case_code}`)
      lines.push(`  message: ${c.message}`)
      lines.push(`  user_id: ${c.user_id}`)
      lines.push(`  handle: @${c.handle || '—'}`)
      lines.push(`  display_name: ${c.display_name || '—'}`)
      if (c.product_slug) lines.push(`  product: ${c.product_slug}`)
      if (c.db_status) lines.push(`  db_status: ${c.db_status}`)
      lines.push(`  has_active_subscription: ${c.has_active_subscription}`)
      if (c.stripe_customer_id) lines.push(`  stripe_customer: ${c.stripe_customer_id}`)
      if (c.stripe_subscription_id) lines.push(`  stripe_subscription: ${c.stripe_subscription_id}`)
      if (c.stuck_since) lines.push(`  stuck_since: ${c.stuck_since}`)
      if (c.suggested_action) lines.push(`  suggested: ${c.suggested_action}`)
      lines.push('')
    }
  } else {
    lines.push('--- Billing drift ---')
    lines.push('(none)')
    lines.push('')
  }

  const jobs = (systemHealth?.scheduled_jobs || []).filter((j) =>
    ['failed', 'stale', 'unscheduled'].includes(j.health),
  )
  if (jobs.length) {
    lines.push(`--- Scheduled job issues (${jobs.length}) ---`)
    for (const j of jobs) {
      lines.push(`[${String(j.health).toUpperCase()}] ${j.label} (${j.id || j.jobname || '?'})`)
      lines.push(`  schedule: ${j.schedule_hint || j.cron_schedule || '—'}`)
      if (j.last_start) lines.push(`  last_run: ${j.last_start}`)
      if (j.last_status) lines.push(`  last_status: ${j.last_status}`)
      if (j.hint) lines.push(`  hint: ${j.hint}`)
      if (j.return_message) lines.push(`  return_message: ${j.return_message}`)
      const book = opsMonitorRunbookById(j.runbook_id)
      if (book?.href) lines.push(`  runbook: ${book.href}`)
      lines.push('')
    }
  }

  if (ctx.snapshot?.stripe_webhooks) {
    lines.push('--- Stripe webhooks (snapshot) ---')
    lines.push(`  events_24h: ${ctx.snapshot.stripe_webhooks.events_24h ?? '—'}`)
    lines.push(`  events_7d: ${ctx.snapshot.stripe_webhooks.events_7d ?? '—'}`)
    lines.push('')
  }

  if (ctx.external?.probes?.stripe?.configured) {
    lines.push('--- Stripe probe ---')
    lines.push(`  active_subs_sample: ${ctx.external.probes.stripe.subscriptions_active ?? '—'}`)
    lines.push(`  past_due_sample: ${ctx.external.probes.stripe.subscriptions_past_due ?? '—'}`)
    lines.push('')
  }

  lines.push('--- Paste to Theo for triage ---')
  return lines.join('\n')
}

/** @param {string} text */
export async function copyOpsDiagnosticText(text) {
  if (!text) return { ok: false, error: 'Nothing to copy.' }
  try {
    await navigator.clipboard.writeText(text)
    return { ok: true, error: null }
  } catch {
    return { ok: false, error: 'Clipboard unavailable.' }
  }
}
