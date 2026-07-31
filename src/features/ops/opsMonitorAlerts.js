/** Default alert thresholds for Edge Monitor Phase 4. */

export const OPS_MONITOR_THRESHOLDS_STORAGE_KEY = 'edge-monitor-thresholds-v1'

/** @typedef {{ id: string, label: string, metric: string, op: 'lt' | 'lte' | 'gt' | 'gte' | 'eq', value: number, severity: 'warn' | 'critical', runbookId?: string }} OpsMonitorThreshold */

/** @type {OpsMonitorThreshold[]} */
export const OPS_MONITOR_DEFAULT_THRESHOLDS = [
  {
    id: 'rate_limits_24h_spike',
    label: 'Rate limit hits 24h > 50',
    metric: 'rate_limits.events_24h',
    op: 'gt',
    value: 50,
    severity: 'warn',
    runbookId: 'prod-checklist',
  },
  {
    id: 'cf_pending_uploads',
    label: 'Stream pending uploads > 10',
    metric: 'external.cloudflare.pending_uploads',
    op: 'gt',
    value: 10,
    severity: 'warn',
    runbookId: 'stream-purge',
  },
  {
    id: 'starter_pool_exhausted',
    label: 'Starter subs with exhausted pool > 0',
    metric: 'starter_drops.exhausted_starter_subs',
    op: 'gt',
    value: 0,
    severity: 'warn',
    runbookId: 'starter-drops',
  },
  {
    id: 'sentry_unresolved',
    label: 'Sentry unresolved issues > 25',
    metric: 'external.sentry.unresolved_issues',
    op: 'gt',
    value: 25,
    severity: 'warn',
    runbookId: 'sentry',
  },
]

/** @param {OpsMonitorThreshold[]} thresholds */
export function saveOpsMonitorThresholds(thresholds) {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(OPS_MONITOR_THRESHOLDS_STORAGE_KEY, JSON.stringify(thresholds))
  } catch {
    /* ignore quota */
  }
}

/** @returns {OpsMonitorThreshold[]} */
export function loadOpsMonitorThresholds() {
  if (typeof window === 'undefined') return OPS_MONITOR_DEFAULT_THRESHOLDS
  try {
    const raw = window.localStorage.getItem(OPS_MONITOR_THRESHOLDS_STORAGE_KEY)
    if (!raw) return OPS_MONITOR_DEFAULT_THRESHOLDS
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed) || parsed.length === 0) return OPS_MONITOR_DEFAULT_THRESHOLDS
    const filtered = parsed.filter((t) => t?.id !== 'stripe_webhooks_24h_zero')
    return filtered.length > 0 ? filtered : OPS_MONITOR_DEFAULT_THRESHOLDS
  } catch {
    return OPS_MONITOR_DEFAULT_THRESHOLDS
  }
}

/** @param {string} path @param {object} root */
export function opsMonitorMetricValue(path, root) {
  if (!path || !root) return undefined
  return path.split('.').reduce((acc, key) => {
    if (acc == null || typeof acc !== 'object') return undefined
    return acc[key]
  }, root)
}

/**
 * @param {OpsMonitorThreshold} threshold
 * @param {number | undefined | null} actual
 */
function thresholdBreached(threshold, actual) {
  if (actual == null || !Number.isFinite(Number(actual))) return false
  const n = Number(actual)
  const v = threshold.value
  switch (threshold.op) {
    case 'lt':
      return n < v
    case 'lte':
      return n <= v
    case 'gt':
      return n > v
    case 'gte':
      return n >= v
    case 'eq':
      return n === v
    default:
      return false
  }
}

/**
 * @param {{
 *   snapshot?: object | null,
 *   external?: object | null,
 *   live?: object | null,
 *   thresholds?: OpsMonitorThreshold[],
 * }} ctx
 */
export function evaluateOpsMonitorAlerts(ctx) {
  const thresholds = ctx.thresholds || OPS_MONITOR_DEFAULT_THRESHOLDS
  const metricRoot = {
    ...(ctx.snapshot || {}),
    external: {
      cloudflare: ctx.external?.probes?.cloudflare || {},
      sentry: ctx.external?.probes?.sentry || {},
      stripe: ctx.external?.probes?.stripe || {},
    },
    live: ctx.live || {},
  }

  /** @type {Array<OpsMonitorThreshold & { actual: number | null, message: string }>} */
  const alerts = []

  for (const t of thresholds) {
    const actualRaw = opsMonitorMetricValue(t.metric, metricRoot)
    const actual = actualRaw == null ? null : Number(actualRaw)
    if (!thresholdBreached(t, actual)) continue
    alerts.push({
      ...t,
      actual,
      message: `${t.label} (actual: ${actual ?? 'n/a'})`,
    })
  }

  alerts.push(...evaluateStripeWebhookHealthAlerts(ctx.snapshot))

  return alerts.sort((a, b) => {
    if (a.severity === b.severity) return a.label.localeCompare(b.label)
    return a.severity === 'critical' ? -1 : 1
  })
}

/**
 * Stripe webhook health from snapshot (replaces naive "24h = 0" alert).
 * @param {object | null | undefined} snapshot
 * @returns {Array<OpsMonitorThreshold & { actual: number | null, message: string }>}
 */
export function evaluateStripeWebhookHealthAlerts(snapshot) {
  const wh = snapshot?.stripe_webhooks
  if (!wh || typeof wh !== 'object') return []

  /** @type {Array<OpsMonitorThreshold & { actual: number | null, message: string }>} */
  const alerts = []
  const status = String(wh.health_status || 'ok')
  const summary = String(wh.health_summary || '').trim()

  if (status === 'critical') {
    alerts.push({
      id: 'stripe_webhook_failure_unresolved',
      label: 'Stripe webhook processing failed',
      metric: 'stripe_webhooks.health_status',
      op: 'eq',
      value: 0,
      severity: 'critical',
      runbookId: 'stripe-handoff',
      actual: null,
      message: summary || 'Latest webhook failure not cleared by a later success',
    })
  } else if (status === 'warn') {
    alerts.push({
      id: 'stripe_webhook_stale',
      label: 'Stripe webhooks stale (active billing subs)',
      metric: 'stripe_webhooks.health_status',
      op: 'eq',
      value: 0,
      severity: 'warn',
      runbookId: 'stripe-handoff',
      actual: wh.active_billing_subs ?? null,
      message: summary || 'No successful webhook recently while billing subs are active',
    })
  }

  return alerts
}
