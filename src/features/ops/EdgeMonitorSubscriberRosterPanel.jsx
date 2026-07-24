import { useMemo, useState } from 'react'
import { Download } from 'lucide-react'
import { formatOpsMonitorCount } from './opsMonitorApi.js'
import { OPS_CHART_COLORS, OPS_SECTION_THEMES } from './opsMonitorTheme.js'
import {
  downloadOpsMonitorCsv,
  formatOpsRosterHandle,
  formatOpsRosterWhen,
  opsFanSubscribersToCsv,
  opsMonitorProfileHref,
  opsMonitorRosterSummary,
  opsPlatformSubscribersToCsv,
  opsRecentSignupsToCsv,
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
  { id: 'signups', label: 'New users' },
]

function RosterMetric({ label, value, accent = OPS_CHART_COLORS.purple }) {
  return (
    <div
      className="rounded-xl bg-zinc-950/50 border border-zinc-800/70 px-3 py-2 min-w-0"
      style={{ borderLeftWidth: 3, borderLeftColor: `${accent}88` }}
    >
      <div className="text-zinc-500 text-[10px] font-semibold uppercase tracking-wide truncate">{label}</div>
      <div className="text-white font-bold tabular-nums mt-0.5">{formatOpsMonitorCount(value)}</div>
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

  const summary = useMemo(() => opsMonitorRosterSummary(roster), [roster])
  const theme = OPS_SECTION_THEMES.subs
  const q = search.trim().toLowerCase()

  const platform = roster?.platform || {}
  const fan = roster?.creator_fan || {}
  const users = roster?.users || {}

  const filterText = (parts) => {
    if (!q) return true
    return parts.some((p) => String(p || '').toLowerCase().includes(q))
  }

  const activePlatform = useMemo(
    () => (Array.isArray(platform.active_roster) ? platform.active_roster : []).filter((r) =>
      filterText([r.handle, r.display_name, r.email, r.product_slug, r.status]),
    ),
    [platform.active_roster, q],
  )

  const fanActive = useMemo(
    () => (Array.isArray(fan.active_roster) ? fan.active_roster : []).filter((r) =>
      filterText([
        r.subscriber_handle,
        r.subscriber_email,
        r.creator_handle,
        r.fan_tier_key,
        r.status,
      ]),
    ),
    [fan.active_roster, q],
  )

  const creators = useMemo(
    () => (Array.isArray(fan.monetized_creators) ? fan.monetized_creators : []).filter((r) =>
      filterText([r.handle, r.display_name, r.email, r.fan_tier_key]),
    ),
    [fan.monetized_creators, q],
  )

  const pendingAll = useMemo(() => {
    const plat = Array.isArray(platform.pending_cancel) ? platform.pending_cancel : []
    const fanPending = Array.isArray(fan.pending_cancel) ? fan.pending_cancel : []
    return [
      ...plat.map((r) => ({ kind: 'platform', ...r })),
      ...fanPending.map((r) => ({ kind: 'fan', ...r })),
    ].filter((r) =>
      filterText([
        r.handle,
        r.email,
        r.subscriber_handle,
        r.subscriber_email,
        r.creator_handle,
        r.product_slug,
      ]),
    )
  }, [fan.pending_cancel, platform.pending_cancel, q])

  const canceledAll = useMemo(() => {
    const plat = Array.isArray(platform.canceled_recent) ? platform.canceled_recent : []
    const fanCanceled = Array.isArray(fan.canceled_recent) ? fan.canceled_recent : []
    return [
      ...plat.map((r) => ({ kind: 'platform', ...r })),
      ...fanCanceled.map((r) => ({ kind: 'fan', ...r })),
    ].filter((r) =>
      filterText([
        r.handle,
        r.email,
        r.subscriber_handle,
        r.subscriber_email,
        r.creator_handle,
        r.product_slug,
        r.status,
      ]),
    )
  }, [fan.canceled_recent, platform.canceled_recent, q])

  const recentSignups = useMemo(
    () => (Array.isArray(users.recent) ? users.recent : []).filter((r) =>
      filterText([r.handle, r.display_name, r.email, r.role]),
    ),
    [users.recent, q],
  )

  const byProduct = Array.isArray(platform.by_product) ? platform.by_product : []

  const onExport = () => {
    const stamp = new Date().toISOString().slice(0, 10)
    if (tab === 'platform') {
      downloadOpsMonitorCsv(
        opsPlatformSubscribersToCsv(platform.active_roster || []),
        `edge-platform-subs-${stamp}.csv`,
      )
    } else if (tab === 'fan') {
      downloadOpsMonitorCsv(opsFanSubscribersToCsv(fan.active_roster || []), `edge-fan-subs-${stamp}.csv`)
    } else if (tab === 'signups') {
      downloadOpsMonitorCsv(opsRecentSignupsToCsv(users.recent || []), `edge-new-users-${stamp}.csv`)
    } else if (tab === 'cancels') {
      downloadOpsMonitorCsv(
        opsPlatformSubscribersToCsv(platform.pending_cancel || []),
        `edge-pending-cancels-${stamp}.csv`,
      )
    }
  }

  return (
    <section
      className="edge-monitor-panel relative overflow-hidden rounded-3xl border border-zinc-800/80 bg-zinc-900/90 p-4 lg:p-5 mb-4 lg:col-span-full"
      data-edge-monitor-subscriber-roster
    >
      <div
        className={`absolute inset-x-0 top-0 h-24 bg-gradient-to-b ${theme.gradient} pointer-events-none`}
        aria-hidden
      />
      <div className="relative">
        <div className="flex flex-wrap items-start justify-between gap-3 mb-3">
          <div className="flex items-start gap-2.5 min-w-0">
            <span
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-lg"
              style={{ backgroundColor: `${theme.accent}22`, boxShadow: `inset 0 0 0 1px ${theme.accent}44` }}
              aria-hidden
            >
              {theme.icon}
            </span>
            <div className="min-w-0">
              <div className="text-white font-bold text-[15px] lg:text-base">Subscriber roster</div>
              <div className="text-zinc-500 text-xs mt-0.5 leading-relaxed">
                Platform Edge subs, creator fan subs, identities, pending cancels · admin only
              </div>
            </div>
          </div>
          <div className="flex flex-wrap gap-2 shrink-0">
            <button
              type="button"
              onClick={onExport}
              disabled={!roster || loading}
              className="min-h-8 inline-flex items-center gap-1.5 rounded-lg bg-zinc-800/80 px-3 text-zinc-200 text-[11px] font-semibold hover:bg-zinc-700 disabled:opacity-50"
            >
              <Download className="h-3.5 w-3.5" aria-hidden />
              CSV
            </button>
            <button
              type="button"
              disabled={loading || refreshing}
              onClick={onReload}
              className="min-h-8 rounded-lg bg-gradient-to-r from-violet-700 to-purple-700 px-3 text-white text-[11px] font-bold hover:from-violet-600 hover:to-purple-600 disabled:opacity-50"
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
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 mb-3">
              <RosterMetric label="New 24h" value={summary.new24h} accent={OPS_CHART_COLORS.green} />
              <RosterMetric label="New 7d" value={summary.new7d} accent={OPS_CHART_COLORS.cyan} />
              <RosterMetric label="New 30d" value={summary.new30d} />
              <RosterMetric label="Platform active" value={summary.activePlatform} accent={OPS_CHART_COLORS.purple} />
              <RosterMetric label="Fan active" value={summary.activeFan} accent={OPS_CHART_COLORS.pink} />
              <RosterMetric
                label="Pending cancel"
                value={summary.pendingPlatform + summary.pendingFan}
                accent={OPS_CHART_COLORS.orange}
              />
            </div>

            {byProduct.length > 0 ? (
              <div className="mb-3 flex flex-wrap gap-2">
                {byProduct.map((row) => (
                  <span
                    key={row.product_slug}
                    className="rounded-full bg-zinc-950/60 px-2.5 py-1 text-[10px] font-semibold text-zinc-200 ring-1 ring-zinc-700/60"
                    title={row.display_name || row.product_slug}
                  >
                    {row.product_slug}: {formatOpsMonitorCount(row.active_count + row.trialing_count)} active
                    {row.pending_cancel_count ? ` · ${row.pending_cancel_count} pending cancel` : ''}
                  </span>
                ))}
              </div>
            ) : null}

            <div className="mb-3 flex flex-wrap gap-1.5">
              {TABS.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setTab(t.id)}
                  className={`min-h-8 rounded-lg px-3 text-[11px] font-semibold touch-manipulation ${
                    tab === t.id
                      ? 'bg-violet-600 text-white'
                      : 'bg-zinc-800/70 text-zinc-300 hover:bg-zinc-700'
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>

            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Filter handle, email, product…"
              className="mb-3 w-full rounded-xl border border-zinc-700/80 bg-zinc-950/70 px-3 py-2 text-sm text-white placeholder:text-zinc-500"
            />

            <div className="overflow-x-auto rounded-2xl border border-zinc-800/70 bg-zinc-950/40">
              {tab === 'platform' ? (
                <table className="w-full min-w-[640px] text-left text-xs">
                  <thead className="text-zinc-500 uppercase text-[10px] tracking-wide border-b border-zinc-800/80">
                    <tr>
                      <th className="px-3 py-2 font-semibold">Member</th>
                      <th className="px-3 py-2 font-semibold">Product</th>
                      <th className="px-3 py-2 font-semibold">Status</th>
                      <th className="px-3 py-2 font-semibold">Renews</th>
                      <th className="px-3 py-2 font-semibold">Cancel?</th>
                      <th className="px-3 py-2 font-semibold">Stripe</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-800/60">
                    {activePlatform.length === 0 ? (
                      <EmptyRow colSpan={6}>No active platform subscriptions</EmptyRow>
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
                          <td className="px-3 py-2.5 capitalize text-zinc-300">{row.status}</td>
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
                      <th className="px-3 py-2 font-semibold">Status</th>
                      <th className="px-3 py-2 font-semibold">Renews</th>
                      <th className="px-3 py-2 font-semibold">Stripe</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-800/60">
                    {fanActive.length === 0 ? (
                      <EmptyRow colSpan={6}>No active fan subscriptions</EmptyRow>
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
                          <td className="px-3 py-2.5 capitalize text-zinc-300">{row.status}</td>
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
                      <th className="px-3 py-2 font-semibold">Ends</th>
                      <th className="px-3 py-2 font-semibold">Stripe</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-800/60">
                    {pendingAll.length === 0 && canceledAll.length === 0 ? (
                      <EmptyRow colSpan={5}>No pending cancels or recent churn (30d)</EmptyRow>
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

              {tab === 'signups' ? (
                <table className="w-full min-w-[560px] text-left text-xs">
                  <thead className="text-zinc-500 uppercase text-[10px] tracking-wide border-b border-zinc-800/80">
                    <tr>
                      <th className="px-3 py-2 font-semibold">Member</th>
                      <th className="px-3 py-2 font-semibold">Role</th>
                      <th className="px-3 py-2 font-semibold">Joined</th>
                      <th className="px-3 py-2 font-semibold">Stripe</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-800/60">
                    {recentSignups.length === 0 ? (
                      <EmptyRow colSpan={4}>No recent signups</EmptyRow>
                    ) : (
                      recentSignups.map((row) => (
                        <tr key={row.user_id}>
                          <RosterProfileCell
                            handle={row.handle}
                            userId={row.user_id}
                            displayName={row.display_name}
                            email={row.email}
                          />
                          <td className="px-3 py-2.5 capitalize text-zinc-300">{row.role || 'user'}</td>
                          <td className="px-3 py-2.5 text-zinc-400 tabular-nums">
                            {formatOpsRosterWhen(row.created_at)}
                          </td>
                          <td className="px-3 py-2.5">
                            <RosterStripeLinks customerId={row.stripe_customer_id} compact />
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              ) : null}
            </div>
          </>
        ) : null}
      </div>
    </section>
  )
}
