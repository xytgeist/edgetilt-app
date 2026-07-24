/** Formatters + CSV export for Edge Monitor subscriber roster. */

import { buildLoungeProfileShareUrl } from '../../utils/loungeSharePost.js'

/** @param {string | null | undefined} iso */
export function formatOpsRosterWhen(iso) {
  if (!iso) return '...'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '...'
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

/** @param {string | null | undefined} handle */
export function formatOpsRosterHandle(handle) {
  const h = String(handle || '').trim()
  if (!h) return '(no handle)'
  return h.startsWith('@') ? h : `@${h}`
}

/**
 * In-app profile deep link (`/u/:handle` or legacy `/?tab=home&profile=<uuid>`).
 * @param {{ handle?: string | null, user_id?: string | null }} profile
 */
export function opsMonitorProfileHref(profile) {
  if (!profile) return ''
  return buildLoungeProfileShareUrl({
    handle: profile.handle,
    user_id: profile.user_id,
  })
}

/** @param {string | null | undefined} id */
function normalizeStripeId(id) {
  const s = String(id || '').trim()
  return s || ''
}

/** @param {string | null | undefined} customerId */
export function opsStripeCustomerDashboardUrl(customerId) {
  const id = normalizeStripeId(customerId)
  if (!id.startsWith('cus_')) return ''
  return `https://dashboard.stripe.com/customers/${encodeURIComponent(id)}`
}

/** @param {string | null | undefined} subscriptionId */
export function opsStripeSubscriptionDashboardUrl(subscriptionId) {
  const id = normalizeStripeId(subscriptionId)
  if (!id.startsWith('sub_')) return ''
  return `https://dashboard.stripe.com/subscriptions/${encodeURIComponent(id)}`
}

/**
 * Connect fan sub deep link when both ids are known.
 * @param {string | null | undefined} connectAccountId
 * @param {string | null | undefined} subscriptionId
 */
export function opsStripeConnectSubscriptionDashboardUrl(connectAccountId, subscriptionId) {
  const acct = normalizeStripeId(connectAccountId)
  const sub = normalizeStripeId(subscriptionId)
  if (!acct.startsWith('acct_') || !sub.startsWith('sub_')) return ''
  return `https://dashboard.stripe.com/connect/accounts/${encodeURIComponent(acct)}/subscriptions/${encodeURIComponent(sub)}`
}

/** @param {string | null | undefined} connectAccountId */
export function opsStripeConnectAccountDashboardUrl(connectAccountId) {
  const id = normalizeStripeId(connectAccountId)
  if (!id.startsWith('acct_')) return ''
  return `https://dashboard.stripe.com/connect/accounts/${encodeURIComponent(id)}`
}

/** @param {Array<Record<string, unknown>>} rows */
function csvEscapeRows(rows, columns) {
  const esc = (v) => {
    const s = String(v ?? '')
    if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`
    return s
  }
  const header = columns.map((c) => c.label).join(',')
  const lines = rows.map((row) => columns.map((c) => esc(c.value(row))).join(','))
  return `${header}\n${lines.join('\n')}\n`
}

/** @param {Array<Record<string, unknown>>} rows */
export function opsPlatformSubscribersToCsv(rows) {
  return csvEscapeRows(rows, [
    { label: 'handle', value: (r) => r.handle },
    { label: 'display_name', value: (r) => r.display_name },
    { label: 'email', value: (r) => r.email },
    { label: 'product', value: (r) => r.product_slug },
    { label: 'status', value: (r) => r.status },
    { label: 'interval', value: (r) => r.price_interval },
    { label: 'cancel_at_period_end', value: (r) => (r.cancel_at_period_end ? 'yes' : 'no') },
    { label: 'period_end', value: (r) => r.current_period_end },
    { label: 'subscribed_at', value: (r) => r.subscribed_at },
    { label: 'stripe_customer_id', value: (r) => r.stripe_customer_id },
    { label: 'stripe_subscription_id', value: (r) => r.stripe_subscription_id },
  ])
}

/** @param {Array<Record<string, unknown>>} rows */
export function opsFanSubscribersToCsv(rows) {
  return csvEscapeRows(rows, [
    { label: 'subscriber_handle', value: (r) => r.subscriber_handle },
    { label: 'subscriber_email', value: (r) => r.subscriber_email },
    { label: 'creator_handle', value: (r) => r.creator_handle },
    { label: 'tier_key', value: (r) => r.fan_tier_key },
    { label: 'status', value: (r) => r.status },
    { label: 'cancel_at_period_end', value: (r) => (r.cancel_at_period_end ? 'yes' : 'no') },
    { label: 'period_end', value: (r) => r.current_period_end },
    { label: 'subscribed_at', value: (r) => r.subscribed_at },
    { label: 'stripe_customer_id', value: (r) => r.stripe_customer_id },
    { label: 'stripe_subscription_id', value: (r) => r.stripe_subscription_id },
  ])
}

/** @param {Array<Record<string, unknown>>} rows */
export function opsRecentSignupsToCsv(rows) {
  return csvEscapeRows(rows, [
    { label: 'handle', value: (r) => r.handle },
    { label: 'display_name', value: (r) => r.display_name },
    { label: 'email', value: (r) => r.email },
    { label: 'role', value: (r) => r.role },
    { label: 'created_at', value: (r) => r.created_at },
    { label: 'stripe_customer_id', value: (r) => r.stripe_customer_id },
  ])
}

/** @param {string} csv @param {string} filename */
export function downloadOpsMonitorCsv(csv, filename) {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

/** Format period-over-period change for Monitor signup growth tiles. */
export function formatOpsMonitorGrowthPct(current, previous) {
  const c = Number(current) || 0
  const p = Number(previous) || 0
  if (p === 0) {
    if (c === 0) return { pct: 0, label: '0%', direction: 'flat' }
    return { pct: null, label: 'New', direction: 'up' }
  }
  const pct = ((c - p) / p) * 100
  return {
    pct,
    label: `${pct >= 0 ? '+' : ''}${pct.toFixed(1)}%`,
    direction: pct > 0 ? 'up' : pct < 0 ? 'down' : 'flat',
  }
}

/**
 * Daily signup series for charts (expects snapshot `trends_30d` rows).
 * @param {Array<{ signups?: number }> | null | undefined} trends30d
 */
export function opsMonitorUserSignupDailySeries(trends30d) {
  if (!Array.isArray(trends30d) || trends30d.length === 0) {
    return { labels: [], values: [], rawLabels: [] }
  }
  return {
    labels: trends30d.map((row, i) => {
      if (i % 5 !== 0 && i !== trends30d.length - 1) return ''
      const label = String(row.label || '').trim()
      if (label) return label.slice(0, 6)
      return `D${i + 1}`
    }),
    values: trends30d.map((row) => Number(row.signups) || 0),
    rawLabels: trends30d.map((row) => String(row.label || row.day || '').trim()),
  }
}

/**
 * DoD / WoW / MoM signup growth from daily trends + optional prior-30d count.
 * @param {Array<{ signups?: number }> | null | undefined} trends30d
 * @param {{ new_30d?: number, new_prev_30d?: number }} [users]
 */
export function opsMonitorUserSignupGrowth(trends30d, users = {}) {
  const signups = Array.isArray(trends30d) ? trends30d.map((row) => Number(row.signups) || 0) : []
  const dayCurrent = signups.length > 0 ? signups[signups.length - 1] : 0
  const dayPrior = signups.length > 1 ? signups[signups.length - 2] : 0
  const weekCurrent = signups.slice(-7).reduce((sum, n) => sum + n, 0)
  const weekPrior = signups.length >= 14 ? signups.slice(-14, -7).reduce((sum, n) => sum + n, 0) : null
  const monthCurrent =
    Number(users.new_30d) || (signups.length > 0 ? signups.reduce((sum, n) => sum + n, 0) : 0)
  const monthPrior = users.new_prev_30d != null ? Number(users.new_prev_30d) : null

  return {
    day: formatOpsMonitorGrowthPct(dayCurrent, dayPrior),
    week: weekPrior != null ? formatOpsMonitorGrowthPct(weekCurrent, weekPrior) : null,
    month: monthPrior != null ? formatOpsMonitorGrowthPct(monthCurrent, monthPrior) : null,
  }
}

/** @param {object | null | undefined} roster */
export function opsMonitorUserSignupsSummary(roster) {
  const users = roster?.users || {}
  return {
    new24h: users.new_24h,
    new7d: users.new_7d,
    new30d: users.new_30d,
  }
}

/** Paying subscriber counts only (platform + fan). */
export function opsMonitorRosterSummary(roster) {
  const platform = roster?.platform || {}
  const fan = roster?.creator_fan || {}
  const activePlatform = Array.isArray(platform.active_roster) ? platform.active_roster.length : 0
  const pendingPlatform = Array.isArray(platform.pending_cancel) ? platform.pending_cancel.length : 0
  const activeFan = Array.isArray(fan.active_roster) ? fan.active_roster.length : 0
  const pendingFan = Array.isArray(fan.pending_cancel) ? fan.pending_cancel.length : 0
  const monetizedCreators = Array.isArray(fan.monetized_creators) ? fan.monetized_creators.length : 0
  return {
    activePlatform,
    pendingPlatform,
    activeFan,
    pendingFan,
    monetizedCreators,
  }
}
