import { useMemo, useState } from 'react'
import { ChevronDown, Download } from 'lucide-react'
import { formatOpsMonitorCount } from './opsMonitorApi.js'
import { OPS_CHART_COLORS, OPS_CHART_SEQUENCE, OPS_SECTION_THEMES } from './opsMonitorTheme.js'
import {
  downloadOpsMonitorCsv,
  formatOpsRosterHandle,
  formatOpsRosterWhen,
  formatOpsMonitorBillingSourceLabel,
  opsFanSubscribersToCsv,
  opsMonitorProfileHref,
  opsMonitorRosterSummary,
  opsMonitorRowBillingSource,
  opsMonitorSortByRecent,
  opsPlatformSubscribersToCsv,
  opsStripeConnectAccountDashboardUrl,
  opsStripeConnectSubscriptionDashboardUrl,
  opsStripeCustomerDashboardUrl,
  opsStripeSubscriptionDashboardUrl,
} from './opsMonitorSubscriberRoster.js'

const TABS = [
  { id: 'platform', label: 'Platform subs' },
  { id: 'fan', label: 'Fan subs' },
  { id: 'creators', label: 'Creators' },
  { id: 'cancels', label: 'Cancels' },
]

function RosterMetric({ label, value, accent = OPS_CHART_COLORS.purple }) {
  return (
    <div
      className="edge-monitor-metric-tile rounded-xl bg-zinc-950 border border-zinc-800 px-3 py-2 min-w-0"
      style={{ borderLeftWidth: 3, borderLeftColor: accent }}
    >
      <div className="text-zinc-500 text-[10px] font-semibold uppercase tracking-wide truncate">{label}</div>
      <div className="text-white font-bold tabular-nums mt-0.5">{formatOpsMonitorCount(value)}</div>
    </div>
  )
}

/**
 * @param {{
 *   row: { product_slug?: string, display_name?: string, active_count?: number, trialing_count?: number, pending_cancel_count?: number },
 *   accent?: string,
 * }} props
 */
function ProductActiveMetric({ row, accent = OPS_CHART_COLORS.purple }) {
  const active = (Number(row.active_count) || 0) + (Number(row.trialing_count) || 0)
  const pending = Number(row.pending_cancel_count) || 0
  const slug = String(row.product_slug || '').trim()
  const title = String(row.display_name || slug || 'Product').trim()
  return (
    <div
      className="edge-monitor-product-metric rounded-xl bg-zinc-950 border border-zinc-800 px-3 py-3 min-w-0"
      style={{ borderLeftWidth: 4, borderLeftColor: accent }}
      title={slug}
    >
      <div className="text-zinc-400 text-[11px] font-semibold leading-snug line-clamp-2 min-h-[2rem]">{title}</div>
      <div className="text-white text-2xl font-black tabular-nums mt-1 leading-none">{formatOpsMonitorCount(active)}</div>
      <div className="text-zinc-500 text-[10px] font-semibold uppercase tracking-wide mt-1">active</div>
      {pending > 0 ? (
        <div className="text-orange-400 text-[10px] font-semibold mt-1.5">{formatOpsMonitorCount(pending)} pending cancel</div>
      ) : (
        <div className="text-zinc-600 text-[10px] mt-1.5 truncate">{slug}</div>
      )}
    </div>
  )
}

function EmptyRow({ colSpan, children }) {
  return (
    <tr>
      <td colSpan={colSpan} className="px-3 py-4 text-zinc-500 text-xs text-center">
        {children}
      </td>
    </tr>
  )
}

/**
 * @param {{
 *   handle?: string | null,
 *   userId?: string | null,
 *   displayName?: string | null,
 *   email?: string | null,
 *   accent?: string,
 * }} props
 */
function RosterProfileCell({ handle, userId, displayName, email, accent = 'text-white' }) {
  const href = opsMonitorProfileHref({ handle, user_id: userId })
  const label = formatOpsRosterHandle(handle)
  return (
    <td className="px-3 py-2.5">
      {href ? (
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className={`font-semibold hover:underline ${accent}`}
          title="Open profile"
        >
          {label}
        </a>
      ) : (
        <div className={`font-semibold ${accent}`}>{label}</div>
      )}
      {displayName ? <div className="text-zinc-400 truncate max-w-[220px]">{displayName}</div> : null}
      {email ? <div className="text-zinc-500 truncate max-w-[220px]">{email}</div> : null}
      {!href && userId ? (
        <div className="text-zinc-600 text-[10px] font-mono truncate max-w-[220px]">{userId}</div>
      ) : null}
    </td>
  )
}

const stripeLinkClass =
  'inline-flex items-center text-[10px] font-semibold text-violet-300 hover:text-violet-200 hover:underline'

const billingBadgeClass = {
  paid: 'bg-emerald-950/80 text-emerald-300 border-emerald-800/60',
  comp: 'bg-amber-950/80 text-amber-300 border-amber-800/60',
  test: 'bg-cyan-950/80 text-cyan-300 border-cyan-800/60',
  unknown: 'bg-zinc-900 text-zinc-400 border-zinc-700',
}

/** @param {{ row: { stripe_subscription_id?: string | null, stripe_customer_id?: string | null } }} props */
function RosterBillingCell({ row }) {
  const source = opsMonitorRowBillingSource(row)
  return (
    <td className="px-3 py-2.5 whitespace-nowrap">
      <span
        className={`inline-flex rounded-md border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${billingBadgeClass[source]}`}
        title={String(row.stripe_subscription_id || row.stripe_customer_id || '').trim() || 'No billing id'}
      >
        {formatOpsMonitorBillingSourceLabel(source)}
      </span>
    </td>
  )
}

/**
 * @param {{
 *   customerId?: string | null,
 *   subscriptionId?: string | null,
 *   connectAccountId?: string | null,
 *   compact?: boolean,
 * }} props
 */
function RosterStripeLinks({ customerId, subscriptionId, connectAccountId, compact = false }) {
  const customerHref = opsStripeCustomerDashboardUrl(customerId)
  const subscriptionHref =
    opsStripeConnectSubscriptionDashboardUrl(connectAccountId, subscriptionId) ||
    opsStripeSubscriptionDashboardUrl(subscriptionId)
  const connectHref = opsStripeConnectAccountDashboardUrl(connectAccountId)

  if (!customerHref && !subscriptionHref && !connectHref) {
    return <span className="text-zinc-600">...</span>
  }

  return (
    <div className={`flex ${compact ? 'flex-row flex-wrap gap-2' : 'flex-col gap-0.5'}`}>
      {customerHref ? (
        <a href={customerHref} target="_blank" rel="noopener noreferrer" className={stripeLinkClass}>
          Customer ↗
        </a>
      ) : null}
      {subscriptionHref ? (
        <a href={subscriptionHref} target="_blank" rel="noopener noreferrer" className={stripeLinkClass}>
          Sub ↗
        </a>
      ) : null}
      {connectHref ? (
        <a href={connectHref} target="_blank" rel="noopener noreferrer" className={stripeLinkClass}>
          Connect ↗
        </a>
      ) : null}
    </div>
  )
}

/**
 * @param {{
 *   roster: object | null,
 *   loading: boolean,
 *   error: string,
 *   refreshing: boolean,
 *   onReload: () => void,
 * }} props
 */
export default function EdgeMonitorSubscriberRosterPanel({
  roster,
  loading,
  error,
  refreshing,
  onReload,
}) {
  const [tab, setTab] = useState('platform')
  const [search, setSearch] = useState('')
  const [paidOnly, setPaidOnly] = useState(false)
  const [listOpen, setListOpen] = useState(false)

  const summary = useMemo(() => opsMonitorRosterSummary(roster), [roster])
  const theme = OPS_SECTION_THEMES.subs
  const q = search.trim().toLowerCase()

  const platform = roster?.platform || {}
  const fan = roster?.creator_fan || {}

  const filterText = (parts, query) => {
    if (!query) return true
    return parts.some((p) => String(p || '').toLowerCase().includes(query))
  }

  const passesPaidFilter = (row, onlyPaid) => !onlyPaid || opsMonitorRowBillingSource(row) === 'paid'

  const activePlatform = useMemo(() => {
    const rows = Array.isArray(platform.active_roster) ? platform.active_roster : []
    const filtered = rows.filter(
      (r) =>
        passesPaidFilter(r, paidOnly)
        && filterText(
          [
            r.handle,
            r.display_name,
            r.email,
            r.product_slug,
            r.status,
            formatOpsMonitorBillingSourceLabel(opsMonitorRowBillingSource(r)),
          ],
          q,
        ),
    )
    return opsMonitorSortByRecent(filtered, ['subscribed_at', 'updated_at', 'created_at'])
  }, [platform.active_roster, q, paidOnly])

  const fanActive = useMemo(() => {
    const rows = Array.isArray(fan.active_roster) ? fan.active_roster : []
    const filtered = rows.filter(
      (r) =>
        passesPaidFilter(r, paidOnly)
        && filterText(
          [
            r.subscriber_handle,
            r.subscriber_email,
            r.creator_handle,
            r.fan_tier_key,
            r.status,
            formatOpsMonitorBillingSourceLabel(opsMonitorRowBillingSource(r)),
          ],
          q,
        ),
    )
    return opsMonitorSortByRecent(filtered, ['subscribed_at', 'updated_at', 'created_at'])
  }, [fan.active_roster, q, paidOnly])

  const creators = useMemo(() => {
    const rows = Array.isArray(fan.monetized_creators) ? fan.monetized_creators : []
    const filtered = rows.filter((r) => filterText([r.handle, r.display_name, r.email, r.fan_tier_key], q))
    return opsMonitorSortByRecent(filtered, ['profile_created_at', 'created_at'])
  }, [fan.monetized_creators, q])

  const pendingAll = useMemo(() => {
    const plat = Array.isArray(platform.pending_cancel) ? platform.pending_cancel : []
    const fanPending = Array.isArray(fan.pending_cancel) ? fan.pending_cancel : []
    const merged = [
      ...plat.map((r) => ({ kind: 'platform', ...r })),
      ...fanPending.map((r) => ({ kind: 'fan', ...r })),
    ].filter(
      (r) =>
        passesPaidFilter(r, paidOnly)
        && filterText(
          [
            r.handle,
            r.email,
            r.subscriber_handle,
            r.subscriber_email,
            r.creator_handle,
            r.product_slug,
            formatOpsMonitorBillingSourceLabel(opsMonitorRowBillingSource(r)),
          ],
          q,
        ),
    )
    return opsMonitorSortByRecent(merged, ['updated_at', 'subscribed_at', 'current_period_end'])
  }, [fan.pending_cancel, platform.pending_cancel, q, paidOnly])

  const canceledAll = useMemo(() => {
    const plat = Array.isArray(platform.canceled_recent) ? platform.canceled_recent : []
    const fanCanceled = Array.isArray(fan.canceled_recent) ? fan.canceled_recent : []
    const merged = [
      ...plat.map((r) => ({ kind: 'platform', ...r })),
      ...fanCanceled.map((r) => ({ kind: 'fan', ...r })),
    ].filter(
      (r) =>
        passesPaidFilter(r, paidOnly)
        && filterText(
          [
            r.handle,
            r.email,
            r.subscriber_handle,
            r.subscriber_email,
            r.creator_handle,
            r.product_slug,
            r.status,
            formatOpsMonitorBillingSourceLabel(opsMonitorRowBillingSource(r)),
          ],
          q,
        ),
    )
    return opsMonitorSortByRecent(merged, ['canceled_at', 'updated_at', 'current_period_end'])
  }, [fan.canceled_recent, platform.canceled_recent, q, paidOnly])

  const byProduct = Array.isArray(platform.by_product) ? platform.by_product : []

  const activeTabMeta = useMemo(() => {
    const tabDef = TABS.find((t) => t.id === tab) || TABS[0]
    if (tab === 'platform') {
      const total = Array.isArray(platform.active_roster) ? platform.active_roster.length : 0
      return { label: tabDef.label, shown: activePlatform.length, total }
    }
    if (tab === 'fan') {
      const total = Array.isArray(fan.active_roster) ? fan.active_roster.length : 0
      return { label: tabDef.label, shown: fanActive.length, total }
    }
    if (tab === 'creators') {
      const total = Array.isArray(fan.monetized_creators) ? fan.monetized_creators.length : 0
      return { label: tabDef.label, shown: creators.length, total }
    }
    const pendingTotal = (Array.isArray(platform.pending_cancel) ? platform.pending_cancel.length : 0)
      + (Array.isArray(fan.pending_cancel) ? fan.pending_cancel.length : 0)
    const canceledTotal = (Array.isArray(platform.canceled_recent) ? platform.canceled_recent.length : 0)
      + (Array.isArray(fan.canceled_recent) ? fan.canceled_recent.length : 0)
    return {
      label: tabDef.label,
      shown: pendingAll.length + canceledAll.length,
      total: pendingTotal + canceledTotal,
    }
  }, [
    tab,
    activePlatform.length,
    fanActive.length,
    creators.length,
    pendingAll.length,
    canceledAll.length,
    platform.active_roster,
    fan.active_roster,
    fan.monetized_creators,
    platform.pending_cancel,
    fan.pending_cancel,
    platform.canceled_recent,
    fan.canceled_recent,
  ])

  const rosterListHint = useMemo(() => {
    const parts = [`${activeTabMeta.shown}`]
    if (q || paidOnly) parts.push(`of ${activeTabMeta.total}`)
    parts.push('rows')
    if (paidOnly && tab !== 'creators') parts.push('· paid only')
    parts.push('· newest first')
    return parts.join(' ')
  }, [activeTabMeta.shown, activeTabMeta.total, q, paidOnly, tab])

  const onExport = () => {
    const stamp = new Date().toISOString().slice(0, 10)
    if (tab === 'platform') {
      downloadOpsMonitorCsv(
        opsPlatformSubscribersToCsv(activePlatform),
        `edge-platform-subs-${stamp}.csv`,
      )
    } else if (tab === 'fan') {
      downloadOpsMonitorCsv(opsFanSubscribersToCsv(fanActive), `edge-fan-subs-${stamp}.csv`)
    } else if (tab === 'cancels') {
      const cancelRows = [...pendingAll, ...canceledAll]
      downloadOpsMonitorCsv(
        opsPlatformSubscribersToCsv(cancelRows),
        `edge-cancels-${stamp}.csv`,
      )
    }
  }

  return (
    <section
      className="edge-monitor-panel rounded-2xl border border-zinc-800 bg-zinc-900 p-4 lg:p-5 mb-4 lg:col-span-full"
      data-edge-monitor-subscriber-roster
      style={{ borderLeftWidth: 3, borderLeftColor: theme.accent }}
    >
      <div>
        <div className="flex flex-wrap items-start justify-between gap-3 mb-3">
          <div className="flex items-start gap-2.5 min-w-0">
            <span
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-zinc-800 text-lg"
              aria-hidden
            >
              {theme.icon}
            </span>
            <div className="min-w-0">
              <div className="text-white font-bold text-[15px] lg:text-base">Subscriber roster</div>
              <div className="text-zinc-500 text-xs mt-0.5 leading-relaxed">
                Paying platform + fan subscribers · pending cancels · admin only
              </div>
            </div>
          </div>
          <div className="flex flex-wrap gap-2 shrink-0">
            <button
              type="button"
              onClick={onExport}
              disabled={!roster || loading || tab === 'creators'}
              className="min-h-8 inline-flex items-center gap-1.5 rounded-lg bg-zinc-800 px-3 text-zinc-200 text-[11px] font-semibold hover:bg-zinc-700 disabled:opacity-50"
            >
              <Download className="h-3.5 w-3.5" aria-hidden />
              CSV
            </button>
            <button
              type="button"
              disabled={loading || refreshing}
              onClick={onReload}
              className="min-h-8 rounded-lg bg-zinc-100 px-3 text-zinc-950 text-[11px] font-bold hover:bg-white disabled:opacity-50"
            >
              {refreshing ? 'Refreshing…' : 'Refresh roster'}
            </button>
          </div>
        </div>

        {error ? (
          <div className="mb-3 rounded-xl border border-amber-500/30 bg-amber-950/30 px-3 py-2 text-amber-100 text-xs leading-relaxed">
            {error}
            <div className="mt-1 text-amber-200/70">
              If this mentions <span className="font-mono">subscribed_at</span>, apply migration{' '}
              <span className="font-mono">20260723240000</span>, then refresh.
            </div>
          </div>
        ) : null}

        {loading && !roster ? (
          <div className="edge-monitor-shimmer h-32 rounded-xl bg-zinc-800/60" />
        ) : null}

        {roster ? (
          <>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
              <div className="min-w-0">
                {byProduct.length > 0 ? (
                  <div className="mb-4">
                    <div className="mb-2">
                      <div className="text-white text-sm font-bold">Active by product</div>
                      <div className="text-zinc-500 text-[10px]">Platform Edge subs · active + trialing</div>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-2 gap-2">
                      {byProduct.map((row, i) => (
                        <ProductActiveMetric
                          key={row.product_slug}
                          row={row}
                          accent={OPS_CHART_SEQUENCE[i % OPS_CHART_SEQUENCE.length]}
                        />
                      ))}
                    </div>
                  </div>
                ) : null}

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  <RosterMetric label="Platform active" value={summary.activePlatform} accent={OPS_CHART_COLORS.purple} />
                  <RosterMetric label="Fan active" value={summary.activeFan} accent={OPS_CHART_COLORS.pink} />
                  <RosterMetric
                    label="Pending cancel"
                    value={summary.pendingPlatform + summary.pendingFan}
                    accent={OPS_CHART_COLORS.orange}
                  />
                  <RosterMetric label="Monetized creators" value={summary.monetizedCreators} accent={OPS_CHART_COLORS.cyan} />
                </div>
              </div>

              <div className="min-w-0 rounded-xl border border-zinc-800 bg-zinc-950 flex flex-col min-h-0 lg:max-h-[480px]">
                <button
                  type="button"
                  onClick={() => setListOpen((v) => !v)}
                  className="flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left touch-manipulation hover:bg-zinc-900/80 lg:pointer-events-none lg:cursor-default border-b border-zinc-800/80"
                  aria-expanded={listOpen}
                >
                  <div className="min-w-0">
                    <div className="text-white text-sm font-semibold">{activeTabMeta.label}</div>
                    <div className="text-zinc-500 text-[10px] mt-0.5">
                      {rosterListHint}
                      <span className="lg:hidden"> · tap to {listOpen ? 'hide' : 'browse'}</span>
                    </div>
                  </div>
                  <ChevronDown
                    className={`h-4 w-4 shrink-0 text-zinc-400 transition-transform lg:hidden ${listOpen ? 'rotate-180' : ''}`}
                    aria-hidden
                  />
                </button>

                <div
                  className={`px-3 pb-3 pt-2 flex flex-col min-h-0 flex-1 ${listOpen ? '' : 'hidden lg:flex'}`}
                >
                  <div className="mb-2 flex flex-wrap gap-1.5">
                    {TABS.map((t) => (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => setTab(t.id)}
                        className={`min-h-8 rounded-lg px-3 text-[11px] font-semibold touch-manipulation ${
                          tab === t.id
                            ? 'bg-violet-600 text-white'
                            : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700'
                        }`}
                      >
                        {t.label}
                      </button>
                    ))}
                  </div>

                  <div className="mb-2 flex flex-col gap-2 sm:flex-row sm:items-center">
                    <input
                      type="search"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      placeholder="Filter handle, email, product, billing…"
                      className="min-w-0 flex-1 rounded-lg border border-zinc-700 bg-zinc-900 px-2.5 py-1.5 text-xs text-white placeholder:text-zinc-500"
                    />
                    {tab !== 'creators' ? (
                      <button
                        type="button"
                        onClick={() => setPaidOnly((v) => !v)}
                        aria-pressed={paidOnly}
                        className={`min-h-8 shrink-0 rounded-lg px-3 text-[11px] font-semibold touch-manipulation ${
                          paidOnly
                            ? 'bg-emerald-700 text-white'
                            : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700'
                        }`}
                      >
                        Paid only
                      </button>
                    ) : null}
                  </div>

                  <div className="overflow-x-auto overflow-y-auto max-h-52 lg:max-h-none lg:flex-1 rounded-lg border border-zinc-800">
              {tab === 'platform' ? (
                <table className="w-full min-w-[640px] text-left text-xs">
                  <thead className="sticky top-0 z-10 bg-zinc-950 text-zinc-500 uppercase text-[10px] tracking-wide border-b border-zinc-800/80">
                    <tr>
                      <th className="px-3 py-2 font-semibold">Member</th>
                      <th className="px-3 py-2 font-semibold">Product</th>
                      <th className="px-3 py-2 font-semibold">Billing</th>
                      <th className="px-3 py-2 font-semibold">Status</th>
                      <th className="px-3 py-2 font-semibold">Subscribed</th>
                      <th className="px-3 py-2 font-semibold">Renews</th>
                      <th className="px-3 py-2 font-semibold">Cancel?</th>
                      <th className="px-3 py-2 font-semibold">Stripe</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-800/60">
                    {activePlatform.length === 0 ? (
                      <EmptyRow colSpan={8}>
                        {paidOnly ? 'No paid platform subscriptions' : 'No active platform subscriptions'}
                      </EmptyRow>
                    ) : (
                      activePlatform.map((row) => (
                        <tr key={`${row.user_id}-${row.product_slug}-${row.stripe_subscription_id}`}>
                          <RosterProfileCell
                            handle={row.handle}
                            userId={row.user_id}
                            displayName={row.display_name}
                            email={row.email}
                          />
                          <td className="px-3 py-2.5 text-zinc-200">
                            <div>{row.product_slug}</div>
                            <div className="text-zinc-500">{row.price_interval || '...'}</div>
                          </td>
                          <RosterBillingCell row={row} />
                          <td className="px-3 py-2.5 capitalize text-zinc-300">{row.status}</td>
                          <td className="px-3 py-2.5 text-zinc-400 tabular-nums whitespace-nowrap">
                            {formatOpsRosterWhen(row.subscribed_at)}
                          </td>
                          <td className="px-3 py-2.5 text-zinc-400 tabular-nums">
                            {formatOpsRosterWhen(row.current_period_end)}
                          </td>
                          <td className="px-3 py-2.5">
                            {row.cancel_at_period_end ? (
                              <span className="text-orange-300 font-semibold">Pending</span>
                            ) : (
                              <span className="text-zinc-500">No</span>
                            )}
                          </td>
                          <td className="px-3 py-2.5">
                            <RosterStripeLinks
                              customerId={row.stripe_customer_id}
                              subscriptionId={row.stripe_subscription_id}
                            />
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              ) : null}

              {tab === 'fan' ? (
                <table className="w-full min-w-[640px] text-left text-xs">
                  <thead className="text-zinc-500 uppercase text-[10px] tracking-wide border-b border-zinc-800/80">
                    <tr>
                      <th className="px-3 py-2 font-semibold">Fan</th>
                      <th className="px-3 py-2 font-semibold">Creator</th>
                      <th className="px-3 py-2 font-semibold">Tier</th>
                      <th className="px-3 py-2 font-semibold">Billing</th>
                      <th className="px-3 py-2 font-semibold">Status</th>
                      <th className="px-3 py-2 font-semibold">Subscribed</th>
                      <th className="px-3 py-2 font-semibold">Renews</th>
                      <th className="px-3 py-2 font-semibold">Stripe</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-800/60">
                    {fanActive.length === 0 ? (
                      <EmptyRow colSpan={8}>
                        {paidOnly ? 'No paid fan subscriptions' : 'No active fan subscriptions'}
                      </EmptyRow>
                    ) : (
                      fanActive.map((row) => (
                        <tr
                          key={`${row.subscriber_user_id}-${row.creator_user_id}-${row.stripe_subscription_id}`}
                        >
                          <RosterProfileCell
                            handle={row.subscriber_handle}
                            userId={row.subscriber_user_id}
                            email={row.subscriber_email}
                          />
                          <td className="px-3 py-2.5">
                            {opsMonitorProfileHref({
                              handle: row.creator_handle,
                              user_id: row.creator_user_id,
                            }) ? (
                              <a
                                href={opsMonitorProfileHref({
                                  handle: row.creator_handle,
                                  user_id: row.creator_user_id,
                                })}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-violet-200 font-semibold hover:underline"
                                title="Open creator profile"
                              >
                                {formatOpsRosterHandle(row.creator_handle)}
                              </a>
                            ) : (
                              <div className="text-violet-200 font-semibold">
                                {formatOpsRosterHandle(row.creator_handle)}
                              </div>
                            )}
                            <div className="text-zinc-500">{row.creator_display_name || '...'}</div>
                          </td>
                          <td className="px-3 py-2.5 text-zinc-300">{row.fan_tier_key}</td>
                          <RosterBillingCell row={row} />
                          <td className="px-3 py-2.5 capitalize text-zinc-300">{row.status}</td>
                          <td className="px-3 py-2.5 text-zinc-400 tabular-nums whitespace-nowrap">
                            {formatOpsRosterWhen(row.subscribed_at)}
                          </td>
                          <td className="px-3 py-2.5 text-zinc-400 tabular-nums">
                            {formatOpsRosterWhen(row.current_period_end)}
                          </td>
                          <td className="px-3 py-2.5">
                            <RosterStripeLinks
                              customerId={row.stripe_customer_id}
                              subscriptionId={row.stripe_subscription_id}
                              connectAccountId={row.creator_stripe_connect_account_id}
                            />
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              ) : null}

              {tab === 'creators' ? (
                <table className="w-full min-w-[560px] text-left text-xs">
                  <thead className="text-zinc-500 uppercase text-[10px] tracking-wide border-b border-zinc-800/80">
                    <tr>
                      <th className="px-3 py-2 font-semibold">Creator</th>
                      <th className="px-3 py-2 font-semibold">Tier</th>
                      <th className="px-3 py-2 font-semibold">Live</th>
                      <th className="px-3 py-2 font-semibold">Connect</th>
                      <th className="px-3 py-2 font-semibold">Active fans</th>
                      <th className="px-3 py-2 font-semibold">Pending cancel</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-800/60">
                    {creators.length === 0 ? (
                      <EmptyRow colSpan={6}>No creator monetization profiles yet</EmptyRow>
                    ) : (
                      creators.map((row) => (
                        <tr key={row.creator_user_id}>
                          <RosterProfileCell
                            handle={row.handle}
                            userId={row.creator_user_id}
                            email={row.email}
                          />
                          <td className="px-3 py-2.5 text-zinc-300">{row.fan_tier_key}</td>
                          <td className="px-3 py-2.5">
                            {row.enabled ? (
                              <span className="text-emerald-300 font-semibold">On</span>
                            ) : (
                              <span className="text-zinc-500">Off</span>
                            )}
                          </td>
                          <td className="px-3 py-2.5">
                            {row.connect_onboarding_complete ? (
                              row.stripe_connect_account_id ? (
                                <RosterStripeLinks connectAccountId={row.stripe_connect_account_id} compact />
                              ) : (
                                <span className="text-cyan-300">Ready</span>
                              )
                            ) : (
                              <span className="text-zinc-500">Incomplete</span>
                            )}
                          </td>
                          <td className="px-3 py-2.5 text-white font-bold tabular-nums">
                            {formatOpsMonitorCount(row.active_subscriber_count)}
                          </td>
                          <td className="px-3 py-2.5 tabular-nums">
                            {row.pending_cancel_count ? (
                              <span className="text-orange-300 font-semibold">{row.pending_cancel_count}</span>
                            ) : (
                              <span className="text-zinc-500">0</span>
                            )}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              ) : null}

              {tab === 'cancels' ? (
                <table className="w-full min-w-[640px] text-left text-xs">
                  <thead className="text-zinc-500 uppercase text-[10px] tracking-wide border-b border-zinc-800/80">
                    <tr>
                      <th className="px-3 py-2 font-semibold">Type</th>
                      <th className="px-3 py-2 font-semibold">Member</th>
                      <th className="px-3 py-2 font-semibold">Product / creator</th>
                      <th className="px-3 py-2 font-semibold">Billing</th>
                      <th className="px-3 py-2 font-semibold">Ends</th>
                      <th className="px-3 py-2 font-semibold">Stripe</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-800/60">
                    {pendingAll.length === 0 && canceledAll.length === 0 ? (
                      <EmptyRow colSpan={6}>
                        {paidOnly
                          ? 'No paid pending cancels or recent churn (30d)'
                          : 'No pending cancels or recent churn (30d)'}
                      </EmptyRow>
                    ) : null}
                    {pendingAll.map((row, i) => (
                      <tr key={`pending-${i}-${row.kind}`}>
                        <td className="px-3 py-2.5">
                          <span className="text-orange-300 font-semibold">Pending</span>
                        </td>
                        <RosterProfileCell
                          handle={row.handle || row.subscriber_handle}
                          userId={row.user_id || row.subscriber_user_id}
                          email={row.email || row.subscriber_email}
                        />
                        <td className="px-3 py-2.5 text-zinc-300">
                          {row.kind === 'platform' ? (
                            row.product_slug
                          ) : opsMonitorProfileHref({
                              handle: row.creator_handle,
                              user_id: row.creator_user_id,
                            }) ? (
                            <a
                              href={opsMonitorProfileHref({
                                handle: row.creator_handle,
                                user_id: row.creator_user_id,
                              })}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="hover:underline"
                            >
                              {formatOpsRosterHandle(row.creator_handle)} fan
                            </a>
                          ) : (
                            `${formatOpsRosterHandle(row.creator_handle)} fan`
                          )}
                        </td>
                        <RosterBillingCell row={row} />
                        <td className="px-3 py-2.5 text-zinc-400 tabular-nums">
                          {formatOpsRosterWhen(row.current_period_end)}
                        </td>
                        <td className="px-3 py-2.5">
                          <RosterStripeLinks
                            customerId={row.stripe_customer_id}
                            subscriptionId={row.stripe_subscription_id}
                            connectAccountId={row.creator_stripe_connect_account_id}
                          />
                        </td>
                      </tr>
                    ))}
                    {canceledAll.map((row, i) => (
                      <tr key={`canceled-${i}-${row.kind}`}>
                        <td className="px-3 py-2.5">
                          <span className="text-red-300 font-semibold capitalize">{row.status || 'canceled'}</span>
                        </td>
                        <RosterProfileCell
                          handle={row.handle || row.subscriber_handle}
                          userId={row.user_id || row.subscriber_user_id}
                          email={row.email || row.subscriber_email}
                        />
                        <td className="px-3 py-2.5 text-zinc-300">
                          {row.kind === 'platform' ? (
                            row.product_slug
                          ) : opsMonitorProfileHref({
                              handle: row.creator_handle,
                              user_id: row.creator_user_id,
                            }) ? (
                            <a
                              href={opsMonitorProfileHref({
                                handle: row.creator_handle,
                                user_id: row.creator_user_id,
                              })}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="hover:underline"
                            >
                              {formatOpsRosterHandle(row.creator_handle)} fan
                            </a>
                          ) : (
                            `${formatOpsRosterHandle(row.creator_handle)} fan`
                          )}
                        </td>
                        <RosterBillingCell row={row} />
                        <td className="px-3 py-2.5 text-zinc-400 tabular-nums">
                          {formatOpsRosterWhen(row.canceled_at || row.current_period_end)}
                        </td>
                        <td className="px-3 py-2.5">
                          <RosterStripeLinks
                            customerId={row.stripe_customer_id}
                            subscriptionId={row.stripe_subscription_id}
                            connectAccountId={row.creator_stripe_connect_account_id}
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : null}
                  </div>
                </div>
              </div>
            </div>
          </>
        ) : null}
      </div>
    </section>
  )
}
