import { useMemo, useState } from 'react'
import { APP_BUILD_SHA } from '../../utils/appBuildInfo.js'
import {
  formatOpsMonitorBreakdown,
  formatOpsMonitorCount,
  formatOpsMonitorTopQueries,
  opsMonitorSupabaseProjectRef,
} from './opsMonitorApi.js'
import {
  MonitorBarChart,
  MonitorCompareBars,
  MonitorDoughnutChart,
  MonitorPulseChart,
  MonitorSparklineChart,
  breakdownToDoughnut,
  buildPulseDatasets,
} from './OpsMonitorCharts.jsx'
import { evaluateOpsMonitorAlerts } from './opsMonitorAlerts.js'
import { opsMonitorRunbookById, opsMonitorRunbooksForSection } from './opsMonitorRunbooks.js'
import {
  OPS_CHART_COLORS,
  OPS_SECTION_THEMES,
  opsMonitorHeroKpis,
  opsMonitorTrendLabels,
  opsMonitorTrendSeries,
} from './opsMonitorTheme.js'
import { useEdgeMonitorSnapshot } from './useEdgeMonitorSnapshot.js'
import { useEdgeMonitorExternalHealth } from './useEdgeMonitorExternalHealth.js'
import { useLoungeBotOps } from './useLoungeBotOps.js'
import EdgeMonitorBotOpsPanel from './EdgeMonitorBotOpsPanel.jsx'
import EdgeMonitorSubscriberRosterPanel from './EdgeMonitorSubscriberRosterPanel.jsx'
import EdgeMonitorUserSignupsPanel from './EdgeMonitorUserSignupsPanel.jsx'
import { useEdgeMonitorLivePulse } from './useEdgeMonitorLivePulse.js'
import { useEdgeMonitorSubscriberRoster } from './useEdgeMonitorSubscriberRoster.js'
import { EDGE_MONITOR_PATH } from './opsMonitorNavigation.js'

const MONITOR_PANEL = 'rounded-2xl border border-zinc-800 bg-zinc-900'
const MONITOR_BTN = 'min-h-10 rounded-xl bg-zinc-800 px-3 text-zinc-200 text-xs font-semibold touch-manipulation hover:bg-zinc-700 disabled:opacity-50'
const MONITOR_BTN_PRIMARY =
  'min-h-10 rounded-xl bg-zinc-100 px-4 text-zinc-950 text-xs font-bold touch-manipulation hover:bg-white disabled:opacity-50'
const MONITOR_META_PILL = 'rounded-lg bg-zinc-800 px-2.5 py-1 text-[11px] font-medium text-zinc-300'

function HeroKpiCard({ kpi, compact = false }) {
  const theme = kpi.theme || OPS_SECTION_THEMES.users
  return (
    <div
      className={`edge-monitor-hero-card min-w-0 rounded-2xl border border-zinc-800 bg-zinc-950 ${compact ? 'p-3' : 'p-3 lg:p-4'}`}
      style={{ borderLeftWidth: 3, borderLeftColor: theme.accent }}
    >
      <div className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">{kpi.label}</div>
      <div
        className={`text-white font-black tabular-nums mt-0.5 tracking-tight ${compact ? 'text-2xl' : 'text-2xl lg:text-3xl'}`}
      >
        {formatOpsMonitorCount(kpi.value)}
      </div>
      <div className="text-[11px] font-medium mt-1 truncate text-zinc-400">{kpi.sub}</div>
    </div>
  )
}

function MetricTile({ label, value, hint = '', accent = OPS_CHART_COLORS.cyan }) {
  return (
    <div
      className="rounded-2xl bg-zinc-950 border border-zinc-800 px-3 py-3 min-w-0"
      style={{ borderLeftWidth: 3, borderLeftColor: accent }}
    >
      <div className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500 truncate">{label}</div>
      <div className="text-white text-lg font-bold tabular-nums mt-1 truncate">{value}</div>
      {hint ? <div className="text-zinc-500 text-[11px] mt-1 leading-snug">{hint}</div> : null}
    </div>
  )
}

function RunbookLinks({ sectionKey }) {
  const books = opsMonitorRunbooksForSection(sectionKey)
  if (!books.length) return null
  return (
    <div className="mt-3 flex flex-wrap gap-2 col-span-2 sm:col-span-3">
      {books.map((book) => (
        <a
          key={book.id}
          href={book.href}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center rounded-lg bg-zinc-950/60 px-2.5 py-1 text-[10px] font-semibold text-cyan-300 ring-1 ring-cyan-500/25 hover:bg-zinc-900"
          title={book.hint || book.title}
        >
          {book.title} ↗
        </a>
      ))}
    </div>
  )
}

function MonitorSection({ themeKey, title, subtitle, chart = null, children, className = '', showRunbooks = true }) {
  const theme = OPS_SECTION_THEMES[themeKey] || OPS_SECTION_THEMES.ops
  return (
    <section
      className={`edge-monitor-section ${MONITOR_PANEL} ${className}`}
      style={{ borderLeftWidth: 3, borderLeftColor: theme.accent }}
    >
      <div className="p-4 lg:p-5">
        <div className="mb-3 flex items-start gap-2.5">
          <span
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-zinc-800 text-lg"
            aria-hidden
          >
            {theme.icon}
          </span>
          <div className="min-w-0">
            <div className="text-white font-bold text-[15px]">{title}</div>
            {subtitle ? <div className="text-zinc-500 text-xs mt-0.5 leading-relaxed">{subtitle}</div> : null}
          </div>
        </div>
        {chart ? <div className="mb-3">{chart}</div> : null}
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">{children}</div>
        {showRunbooks ? <RunbookLinks sectionKey={themeKey} /> : null}
      </div>
    </section>
  )
}

function LivePulseStrip({ live, error, show = true }) {
  if (!show) return null
  if (error) {
    return (
      <div className="mb-4 rounded-2xl border border-amber-500/30 bg-amber-950/30 px-4 py-2 text-amber-100 text-xs">
        Live pulse unavailable ... apply migration <span className="font-mono">20260703120000</span>.
      </div>
    )
  }
  if (!live) return null
  const hasSignal =
    (Number(live.rate_per_min) || 0) > 0 ||
    (Number(live.events_1m) || 0) > 0 ||
    (Number(live.posts_1m) || 0) > 0 ||
    (Number(live.chat_messages_1m) || 0) > 0
  if (!hasSignal) return null
  return (
    <section className={`mb-4 ${MONITOR_PANEL} px-3 py-3`}>
      <div className="mb-2">
        <div className="text-white text-xs font-bold">Right now</div>
        <div className="text-zinc-500 text-[10px]">Last minute on prod · refreshes ~15s</div>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {[
          { label: 'Activity / min', value: live.rate_per_min, accent: OPS_CHART_COLORS.purple },
          { label: 'Activity 1m', value: live.events_1m, accent: OPS_CHART_COLORS.cyan },
          { label: 'Posts 1m', value: live.posts_1m, accent: OPS_CHART_COLORS.green },
          { label: 'Chat 1m', value: live.chat_messages_1m, accent: OPS_CHART_COLORS.orange },
        ].map((item) => (
          <div
            key={item.label}
            className="rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2"
            style={{ borderLeftWidth: 3, borderLeftColor: item.accent }}
          >
            <div className="text-[10px] uppercase tracking-wide text-zinc-500">{item.label}</div>
            <div className="text-white text-lg font-bold tabular-nums">{formatOpsMonitorCount(item.value)}</div>
          </div>
        ))}
      </div>
    </section>
  )
}

function MobileMonitorGlance({ heroKpis }) {
  if (!heroKpis?.length) return null
  return (
    <section className={`mb-4 ${MONITOR_PANEL} p-3`}>
      <div className="mb-2">
        <div className="text-white text-sm font-bold">At a glance</div>
        <div className="text-zinc-500 text-[10px]">24h snapshot · new accounts + subscriber roster below</div>
      </div>
      <div className="divide-y divide-zinc-800/70">
        {heroKpis.map((kpi) => (
          <div key={kpi.id} className="flex items-center justify-between gap-3 py-2.5 min-w-0">
            <div className="min-w-0">
              <div className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">{kpi.label}</div>
              <div className="text-[11px] text-zinc-400 truncate mt-0.5">{kpi.sub}</div>
            </div>
            <div className="text-white text-xl font-black tabular-nums shrink-0">
              {formatOpsMonitorCount(kpi.value)}
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}

function AlertsBanner({ alerts }) {
  if (!alerts?.length) return null
  return (
    <div className="mb-4 space-y-2">
      {alerts.map((alert) => (
        <div
          key={alert.id}
          className={`rounded-2xl border px-4 py-3 text-sm flex flex-wrap items-start justify-between gap-2 ${
            alert.severity === 'critical'
              ? 'border-red-500/40 bg-red-950/40 text-red-100'
              : 'border-amber-500/35 bg-amber-950/30 text-amber-100'
          }`}
        >
          <div>
            <div className="font-bold">{alert.label}</div>
            <div className="text-xs opacity-80 mt-0.5">{alert.message}</div>
          </div>
          {alert.runbookId ? (
            <a
              href={opsMonitorRunbookById(alert.runbookId)?.href || '#'}
              target="_blank"
              rel="noopener noreferrer"
              className="shrink-0 rounded-lg bg-black/25 px-2.5 py-1 text-[11px] font-semibold ring-1 ring-white/10 hover:bg-black/40"
            >
              Runbook ↗
            </a>
          ) : null}
        </div>
      ))}
    </div>
  )
}

function ExternalHealthPanel({ external, loading, error, onReload }) {
  const probes = external?.probes || {}
  const links = external?.links || {}
  const cards = [
    {
      key: 'stripe',
      title: 'Stripe',
      probe: probes.stripe,
      href: links.stripe || probes.stripe?.dashboard_url,
    },
    {
      key: 'sentry',
      title: 'Sentry',
      probe: probes.sentry,
      href: links.sentry || probes.sentry?.dashboard_url,
    },
    {
      key: 'cloudflare',
      title: 'Cloudflare Stream',
      probe: probes.cloudflare,
      href: links.cloudflare_stream || probes.cloudflare?.dashboard_url,
    },
    {
      key: 'vercel',
      title: 'Vercel',
      probe: probes.vercel,
      href: links.vercel || probes.vercel?.dashboard_url,
    },
    {
      key: 'supabase',
      title: 'Supabase',
      probe: probes.supabase,
      href: links.supabase || probes.supabase?.dashboard_url,
    },
  ]

  return (
    <section className={`edge-monitor-panel ${MONITOR_PANEL} p-4 lg:p-5 lg:col-span-2`}>
      <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div>
          <div className="text-white font-bold text-[15px]">External health</div>
          <div className="text-zinc-500 text-xs mt-0.5">Dashboard links + optional server probes (Phase 3)</div>
        </div>
        <button
          type="button"
          onClick={() => void onReload()}
          disabled={loading}
          className="min-h-8 rounded-lg bg-zinc-800 px-3 text-zinc-200 text-[11px] font-semibold disabled:opacity-50"
        >
          {loading ? 'Probing…' : 'Re-probe'}
        </button>
      </div>
      {error ? (
        <div className="mb-3 rounded-xl border border-amber-500/30 bg-amber-950/25 px-3 py-2 text-amber-100 text-xs">
          {error} ... deploy Edge fn <span className="font-mono">admin-ops-external-health</span>.
        </div>
      ) : null}
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {cards.map(({ key, title, probe, href }) => (
          <div key={key} className="rounded-2xl border border-zinc-800 bg-zinc-950 p-3 min-w-0">
            <div className="flex items-center justify-between gap-2">
              <div className="text-white text-sm font-bold">{title}</div>
              {href ? (
                <a
                  href={href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[10px] font-semibold text-cyan-300 hover:text-cyan-200"
                >
                  Open ↗
                </a>
              ) : null}
            </div>
            <div className="mt-2 text-[11px] text-zinc-400 leading-relaxed">
              {!probe?.configured && key !== 'vercel' && key !== 'supabase' ? (
                <span>Probe not configured on Edge.</span>
              ) : null}
              {key === 'stripe' && probe?.configured ? (
                <span>
                  Active ~{formatOpsMonitorCount(probe.subscriptions_active)} · past due{' '}
                  {formatOpsMonitorCount(probe.subscriptions_past_due)}
                </span>
              ) : null}
              {key === 'sentry' && probe?.configured && probe.ok ? (
                <span>Unresolved: {formatOpsMonitorCount(probe.unresolved_issues)}</span>
              ) : null}
              {key === 'cloudflare' && probe?.configured && probe.ok ? (
                <span>Pending uploads: {formatOpsMonitorCount(probe.pending_uploads)}</span>
              ) : null}
              {key === 'vercel' ? <span>Deploy SHA in header badge.</span> : null}
              {key === 'supabase' ? (
                <span>Project {probe?.project_ref || opsMonitorSupabaseProjectRef()}</span>
              ) : null}
              {probe?.error ? <span className="text-amber-300">{probe.error}</span> : null}
            </div>
          </div>
        ))}
      </div>
      <RunbookLinks sectionKey="external" />
    </section>
  )
}

/**
 * @param {{
 *   supabaseClient: import('@supabase/supabase-js').SupabaseClient,
 *   layout?: 'mobile' | 'desktop',
 *   onBack?: () => void,
 *   showDesktopLink?: boolean,
 *   headerSlot?: import('react').ReactNode,
 * }} props
 */
export default function EdgeMonitorDashboard({
  supabaseClient,
  layout = 'mobile',
  onBack,
  onOpenBotPortal,
  showDesktopLink = layout === 'mobile',
  headerSlot = null,
}) {
  const isDesktop = layout === 'desktop'
  const [autoRefresh, setAutoRefresh] = useState(false)
  const { snapshot, loading, error, refreshing, load } = useEdgeMonitorSnapshot(supabaseClient, {
    autoRefreshMs: autoRefresh ? 90_000 : 0,
  })
  const { external, loading: externalLoading, error: externalError, reload: reloadExternal } =
    useEdgeMonitorExternalHealth(supabaseClient)
  const { botOps, loading: botOpsLoading, error: botOpsError, reload: reloadBotOps } =
    useLoungeBotOps(supabaseClient)
  const { live, error: liveError } = useEdgeMonitorLivePulse(supabaseClient, { enabled: Boolean(snapshot) })
  const {
    roster,
    loading: rosterLoading,
    error: rosterError,
    refreshing: rosterRefreshing,
    load: loadRoster,
  } = useEdgeMonitorSubscriberRoster(supabaseClient, {
    enabled: Boolean(snapshot),
    autoRefreshMs: autoRefresh ? 90_000 : 0,
  })

  const generatedAt = snapshot?.generated_at
    ? new Date(snapshot.generated_at).toLocaleString(undefined, {
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        second: '2-digit',
      })
    : null

  const users = snapshot?.users || {}
  const subs = snapshot?.subscriptions || {}
  const lounge = snapshot?.lounge || {}
  const search = snapshot?.search || {}
  const rateLimits = snapshot?.rate_limits || {}
  const chat = snapshot?.chat || {}
  const guides = snapshot?.guides || {}
  const bankroll = snapshot?.bankroll || {}
  const playLog = snapshot?.play_log || {}
  const offers = snapshot?.offers || {}
  const push = snapshot?.push || {}
  const starterDrops = snapshot?.starter_drops || {}
  const activity = snapshot?.activity || {}
  const stripeWebhooks = snapshot?.stripe_webhooks || {}
  const trends = snapshot?.trends
  const trends30d = snapshot?.trends_30d
  const trends90d = snapshot?.trends_90d
  const freemiumFunnel = snapshot?.freemium_funnel || {}
  const topQueries7d = search.top_queries_7d
  const topQueries30d = search.top_queries_30d

  const heroKpis = useMemo(() => opsMonitorHeroKpis(snapshot), [snapshot])
  const trendLabels = useMemo(() => opsMonitorTrendLabels(trends), [trends])
  const trendLabels30d = useMemo(() => opsMonitorTrendLabels(trends30d, { every: 5 }), [trends30d])
  const trendLabels90d = useMemo(() => opsMonitorTrendLabels(trends90d, { every: 2 }), [trends90d])
  const pulseDatasets = useMemo(() => buildPulseDatasets(trends), [trends])
  const alerts = useMemo(
    () => evaluateOpsMonitorAlerts({ snapshot, external, live }),
    [snapshot, external, live],
  )

  const roleDoughnut = useMemo(
    () =>
      breakdownToDoughnut(
        [
          { role: 'Users', count: users.role_user },
          { role: 'Mods', count: users.role_moderator },
          { role: 'Admins', count: users.role_admin },
        ],
        'role',
        0,
      ),
    [users.role_admin, users.role_moderator, users.role_user],
  )

  const subsDoughnut = useMemo(
    () => breakdownToDoughnut(subs.active_by_product, 'product_slug', 2),
    [subs.active_by_product],
  )

  const statusDoughnut = useMemo(
    () => breakdownToDoughnut(subs.status_breakdown, 'status', 4),
    [subs.status_breakdown],
  )

  const loungeEngagement = useMemo(
    () => ({
      labels: ['Likes', 'Comments', 'Bookmarks', 'Follows'],
      values: [
        lounge.likes_total,
        lounge.comments_total,
        lounge.bookmarks_total,
        lounge.follows_total,
      ],
    }),
    [lounge.bookmarks_total, lounge.comments_total, lounge.follows_total, lounge.likes_total],
  )

  const velocityCompare = useMemo(
    () => [
      { label: 'Posts', v24: lounge.posts_24h, v7: lounge.posts_7d },
      { label: 'Chat', v24: chat.messages_24h, v7: chat.messages_7d },
      { label: 'Search', v24: search.searches_24h, v7: search.searches_7d },
      { label: 'Activity', v24: activity.events_24h, v7: activity.events_7d },
    ],
    [
      activity.events_24h,
      activity.events_7d,
      chat.messages_24h,
      chat.messages_7d,
      lounge.posts_24h,
      lounge.posts_7d,
      search.searches_24h,
      search.searches_7d,
    ],
  )

  const pulseHeight = isDesktop ? 320 : 240
  const chartPanel = (
    <>
      {trendLabels.length > 0 ? (
        <section className={`edge-monitor-panel ${MONITOR_PANEL} p-4 lg:p-5 h-full`}>
          <div className="mb-3">
            <div className="text-white font-bold text-[15px] lg:text-base">7-day pulse</div>
            <div className="text-zinc-500 text-xs mt-0.5">UTC daily · signups, posts, activity, chat</div>
          </div>
          <MonitorPulseChart labels={trendLabels} datasets={pulseDatasets} height={pulseHeight} />
        </section>
      ) : null}

      <section className={`edge-monitor-panel ${MONITOR_PANEL} p-4 lg:p-5`}>
        <div className="mb-3">
          <div className="text-white font-bold text-[15px] lg:text-base">Velocity</div>
          <div className="text-zinc-500 text-xs mt-0.5">24h vs 7d totals</div>
        </div>
        <MonitorCompareBars items={velocityCompare} height={isDesktop ? 220 : 200} />
      </section>

      <div className={`grid gap-4 ${isDesktop ? 'grid-cols-1' : 'sm:grid-cols-2'}`}>
        <section className={`edge-monitor-panel ${MONITOR_PANEL} p-4`}>
          <div className="text-white font-bold text-sm mb-2">Role mix</div>
          <MonitorDoughnutChart
            labels={roleDoughnut.labels}
            values={roleDoughnut.values}
            colors={roleDoughnut.colors}
            height={isDesktop ? 200 : 190}
          />
        </section>
        <section className={`edge-monitor-panel ${MONITOR_PANEL} p-4`}>
          <div className="text-white font-bold text-sm mb-2">Active subs by product</div>
          <MonitorDoughnutChart
            labels={subsDoughnut.labels}
            values={subsDoughnut.values}
            colors={subsDoughnut.colors}
            height={isDesktop ? 200 : 190}
          />
        </section>
      </div>
    </>
  )

  const detailSections = snapshot ? (
    <>
      <MonitorSection
        themeKey="users"
        title="Users & roles"
        subtitle="profiles"
        className="mb-0"
        chart={
          trends?.length ? (
            <MonitorBarChart
              labels={trendLabels}
              values={opsMonitorTrendSeries(trends, 'signups')}
              color={OPS_CHART_COLORS.cyan}
              height={160}
            />
          ) : null
        }
      >
        <MetricTile label="Total" value={formatOpsMonitorCount(users.total_profiles)} accent={OPS_CHART_COLORS.cyan} />
        <MetricTile label="New 24h" value={formatOpsMonitorCount(users.new_24h)} accent={OPS_CHART_COLORS.green} />
        <MetricTile label="New 7d" value={formatOpsMonitorCount(users.new_7d)} />
        <MetricTile label="Stripe linked" value={formatOpsMonitorCount(users.stripe_customer_linked)} accent={OPS_CHART_COLORS.purple} />
        <MetricTile label="Legacy sub flag" value={formatOpsMonitorCount(users.has_active_subscription_flag)} hint="has_active_subscription" />
        <MetricTile label="Mods" value={formatOpsMonitorCount(users.role_moderator)} />
      </MonitorSection>

      <MonitorSection
        themeKey="subs"
        title="Subscriptions"
        subtitle="Stripe + webhooks"
        className="mb-0"
        chart={
          <MonitorDoughnutChart
            labels={statusDoughnut.labels}
            values={statusDoughnut.values}
            colors={statusDoughnut.colors}
            height={180}
          />
        }
      >
        <MetricTile label="Rows" value={formatOpsMonitorCount(subs.rows_total)} accent={OPS_CHART_COLORS.purple} />
        <MetricTile label="Active products" value={formatOpsMonitorBreakdown(subs.active_by_product)} />
        <MetricTile label="Cancel at end" value={formatOpsMonitorCount(subs.cancel_at_period_end)} accent={OPS_CHART_COLORS.orange} />
        <MetricTile label="Monthly" value={formatOpsMonitorCount(subs.monthly_interval)} />
        <MetricTile label="Annual" value={formatOpsMonitorCount(subs.annual_interval)} />
        <MetricTile label="Webhooks 24h" value={formatOpsMonitorCount(stripeWebhooks.events_24h)} accent={OPS_CHART_COLORS.yellow} />
      </MonitorSection>

      <MonitorSection
        themeKey="lounge"
        title="Lounge"
        subtitle="Feed + engagement"
        className="mb-0"
        chart={
          <MonitorBarChart
            labels={loungeEngagement.labels}
            values={loungeEngagement.values}
            color={OPS_CHART_COLORS.green}
            height={180}
          />
        }
      >
        <MetricTile label="Posts" value={formatOpsMonitorCount(lounge.posts_total)} accent={OPS_CHART_COLORS.green} />
        <MetricTile label="Visible" value={formatOpsMonitorCount(lounge.posts_visible)} />
        <MetricTile label="Hidden" value={formatOpsMonitorCount(lounge.posts_hidden)} accent={OPS_CHART_COLORS.red} />
        <MetricTile label="Posts 24h" value={formatOpsMonitorCount(lounge.posts_24h)} />
        <MetricTile label="Stream" value={formatOpsMonitorCount(lounge.with_stream_video)} accent={OPS_CHART_COLORS.cyan} />
        <MetricTile label="Pinned" value={formatOpsMonitorCount(lounge.pinned)} accent={OPS_CHART_COLORS.yellow} />
      </MonitorSection>

      <MonitorSection themeKey="search" title="Search & limits" subtitle="Analytics + rate caps" className="mb-0">
        <MetricTile label="Searches 24h" value={formatOpsMonitorCount(search.searches_24h)} accent={OPS_CHART_COLORS.yellow} />
        <MetricTile label="Searches 7d" value={formatOpsMonitorCount(search.searches_7d)} />
        <MetricTile label="Searchers 24h" value={formatOpsMonitorCount(search.unique_searchers_24h)} />
        <MetricTile label="Rate hits 24h" value={formatOpsMonitorCount(rateLimits.events_24h)} accent={OPS_CHART_COLORS.red} />
        <MetricTile label="Rate hits 7d" value={formatOpsMonitorCount(rateLimits.events_7d)} />
        <MetricTile label="Kinds 24h" value={formatOpsMonitorBreakdown(rateLimits.by_kind_24h, 'count')} />
        <div className="col-span-2 sm:col-span-3 rounded-2xl bg-zinc-950 border border-zinc-800 px-3 py-3">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500 mb-2">Top queries 7d</div>
          <pre className="text-zinc-300 text-[11px] whitespace-pre-wrap font-sans leading-relaxed">
            {formatOpsMonitorTopQueries(topQueries7d)}
          </pre>
        </div>
        <div className="col-span-2 sm:col-span-3 rounded-2xl bg-zinc-950 border border-zinc-800 px-3 py-3">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500 mb-2">Top queries 30d</div>
          <pre className="text-zinc-300 text-[11px] whitespace-pre-wrap font-sans leading-relaxed">
            {formatOpsMonitorTopQueries(topQueries30d)}
          </pre>
        </div>
      </MonitorSection>

      <MonitorSection
        themeKey="chat"
        title="Chat"
        subtitle="Rooms + messages"
        className="mb-0"
        chart={
          trends?.length ? (
            <MonitorBarChart
              labels={trendLabels}
              values={opsMonitorTrendSeries(trends, 'chat_messages')}
              color={OPS_CHART_COLORS.orange}
              height={160}
            />
          ) : null
        }
      >
        <MetricTile label="Rooms" value={formatOpsMonitorCount(chat.rooms_total)} accent={OPS_CHART_COLORS.orange} />
        <MetricTile label="Messages" value={formatOpsMonitorCount(chat.messages_total)} />
        <MetricTile label="Msgs 24h" value={formatOpsMonitorCount(chat.messages_24h)} accent={OPS_CHART_COLORS.green} />
        <MetricTile label="Msgs 7d" value={formatOpsMonitorCount(chat.messages_7d)} />
        <MetricTile label="Members" value={formatOpsMonitorCount(chat.members_total)} />
      </MonitorSection>

      <MonitorSection themeKey="tools" title="Guides & freemium funnel" subtitle="Catalog + cap pressure (8/9/10)" className="mb-0">
        <MetricTile label="Guides live" value={formatOpsMonitorCount(guides.published)} accent={OPS_CHART_COLORS.pink} />
        <MetricTile label="Drafts" value={formatOpsMonitorCount(guides.unpublished)} />
        <MetricTile label="Machines" value={formatOpsMonitorCount(guides.machines_total)} />
        <MetricTile label="Limited users" value={formatOpsMonitorCount(freemiumFunnel.limited_users)} accent={OPS_CHART_COLORS.yellow} />
        <MetricTile
          label="Bankroll @ cap"
          value={formatOpsMonitorCount(freemiumFunnel.bankroll?.at_10)}
          hint={`8: ${formatOpsMonitorCount(freemiumFunnel.bankroll?.at_8)} · 9: ${formatOpsMonitorCount(freemiumFunnel.bankroll?.at_9)}`}
          accent={OPS_CHART_COLORS.red}
        />
        <MetricTile
          label="Play log @ cap"
          value={formatOpsMonitorCount(freemiumFunnel.play_log?.at_10)}
          hint={`8: ${formatOpsMonitorCount(freemiumFunnel.play_log?.at_8)} · 9: ${formatOpsMonitorCount(freemiumFunnel.play_log?.at_9)}`}
          accent={OPS_CHART_COLORS.orange}
        />
        <MetricTile label="Bankroll sessions" value={formatOpsMonitorCount(bankroll.sessions_total)} />
        <MetricTile label="Bankroll 7d" value={formatOpsMonitorCount(bankroll.sessions_7d)} accent={OPS_CHART_COLORS.cyan} />
        <MetricTile label="Play logs" value={formatOpsMonitorCount(playLog.entries_total)} />
      </MonitorSection>

      <MonitorSection themeKey="ops" title="Offers · push · Starter" subtitle="Calendar, notifications, drops" className="mb-0">
        <MetricTile label="Offers" value={formatOpsMonitorCount(offers.events_total)} accent={OPS_CHART_COLORS.red} />
        <MetricTile label="Uploads" value={formatOpsMonitorCount(offers.uploads_total)} />
        <MetricTile label="Push subs" value={formatOpsMonitorCount(push.subscriptions_total)} accent={OPS_CHART_COLORS.cyan} />
        <MetricTile label="Starter unlocks" value={formatOpsMonitorCount(starterDrops.unlocks_total)} accent={OPS_CHART_COLORS.purple} />
        <MetricTile label="Pending scratch" value={formatOpsMonitorCount(starterDrops.pending_reveal)} accent={OPS_CHART_COLORS.yellow} />
        <MetricTile label="Pool size" value={formatOpsMonitorCount(starterDrops.pool_size)} />
        <MetricTile label="Active starter" value={formatOpsMonitorCount(starterDrops.active_starter_subs)} />
        <MetricTile
          label="Pool exhausted"
          value={formatOpsMonitorCount(starterDrops.exhausted_starter_subs)}
          accent={OPS_CHART_COLORS.red}
          hint="Active starter subs with no slugs left"
        />
        <MetricTile label="Activity 24h" value={formatOpsMonitorCount(activity.events_24h)} />
      </MonitorSection>

      <EdgeMonitorBotOpsPanel
        botOps={botOps}
        loading={botOpsLoading}
        error={botOpsError}
        onOpenPortal={onOpenBotPortal}
      />

      <ExternalHealthPanel
        external={external}
        loading={externalLoading}
        error={externalError}
        onReload={reloadExternal}
      />
    </>
  ) : null

  return (
    <div
      data-edge-monitor
      data-edge-monitor-layout={layout}
      className={isDesktop ? 'edge-monitor-desktop' : 'edge-monitor-mobile'}
    >
      <div
        className={`edge-monitor-header ${MONITOR_PANEL} ${isDesktop ? 'mb-8 px-6 py-5' : 'mb-5 p-4'}`}
      >
        {isDesktop ? (
          <div className="flex items-center justify-between gap-4">
            <div className="min-w-0 flex items-start gap-4">
              <span className="hidden sm:inline-flex shrink-0">
                <img
                  src="/edge-lounge-logo-transparent.png"
                  alt=""
                  className="edge-logo--dark h-12 w-auto object-contain"
                  draggable={false}
                />
                <img
                  src="/edge-lounge-logo-light.png"
                  alt=""
                  className="edge-logo--light h-12 w-auto object-contain"
                  draggable={false}
                />
              </span>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <div className="text-2xl lg:text-3xl font-black tracking-tight text-white">Edge Monitor</div>
                  <span className="hidden md:inline rounded-lg bg-zinc-800 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-zinc-400">
                    Desktop
                  </span>
                </div>
                <div className="text-zinc-400 text-sm mt-1">Live pulse · admin ops</div>
                <div className="mt-2 flex flex-wrap gap-2">
                  <span className={MONITOR_META_PILL}>{opsMonitorSupabaseProjectRef()}</span>
                  <span className={MONITOR_META_PILL}>{APP_BUILD_SHA.slice(0, 7)}</span>
                  {generatedAt ? <span className={MONITOR_META_PILL}>{generatedAt}</span> : null}
                </div>
              </div>
            </div>
            <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
              {headerSlot}
              {showDesktopLink ? (
                <a href={EDGE_MONITOR_PATH} target="_blank" rel="noopener noreferrer" className={`inline-flex items-center ${MONITOR_BTN}`}>
                  Desktop ↗
                </a>
              ) : null}
              {onBack ? (
                <button type="button" onClick={onBack} className={MONITOR_BTN}>
                  ← Lounge
                </button>
              ) : null}
              <button
                type="button"
                disabled={loading || refreshing || rosterRefreshing}
                onClick={() => {
                  void load(true)
                  void loadRoster(true)
                }}
                className={MONITOR_BTN_PRIMARY}
              >
                {refreshing || rosterRefreshing ? 'Refreshing…' : 'Refresh'}
              </button>
              <button
                type="button"
                onClick={() => setAutoRefresh((v) => !v)}
                className={`${MONITOR_BTN} ring-1 ring-zinc-700 ${autoRefresh ? 'bg-emerald-900 text-emerald-200 ring-emerald-800' : ''}`}
              >
                Auto 90s {autoRefresh ? 'ON' : 'OFF'}
              </button>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-xl shrink-0" aria-hidden>
                  📊
                </span>
                <div className="text-xl font-black tracking-tight text-white">Edge Monitor</div>
              </div>
              <div className="text-zinc-400 text-sm mt-1">Live pulse · admin ops</div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {headerSlot}
              {showDesktopLink ? (
                <a
                  href={EDGE_MONITOR_PATH}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`inline-flex items-center justify-center ${MONITOR_BTN}`}
                >
                  Desktop ↗
                </a>
              ) : null}
              {onBack ? (
                <button type="button" onClick={onBack} className={MONITOR_BTN}>
                  ← Lounge
                </button>
              ) : null}
              <button
                type="button"
                disabled={loading || refreshing || rosterRefreshing}
                onClick={() => {
                  void load(true)
                  void loadRoster(true)
                }}
                className={MONITOR_BTN_PRIMARY}
              >
                {refreshing || rosterRefreshing ? 'Refreshing…' : 'Refresh'}
              </button>
              <button
                type="button"
                onClick={() => setAutoRefresh((v) => !v)}
                className={`${MONITOR_BTN} ring-1 ring-zinc-700 ${autoRefresh ? 'bg-emerald-900 text-emerald-200 ring-emerald-800' : ''}`}
              >
                Auto 90s {autoRefresh ? 'ON' : 'OFF'}
              </button>
            </div>
            <div className="flex flex-wrap gap-2">
              <span className={MONITOR_META_PILL}>{opsMonitorSupabaseProjectRef()}</span>
              <span className={MONITOR_META_PILL}>{APP_BUILD_SHA.slice(0, 7)}</span>
              {generatedAt ? <span className={MONITOR_META_PILL}>{generatedAt}</span> : null}
            </div>
          </div>
        )}
      </div>

      {error ? (
        <div className="mb-4 rounded-2xl border border-red-500/40 bg-red-950/50 px-4 py-3 text-red-100 text-sm leading-relaxed">
          {error}
          <div className="mt-2 text-red-200/70 text-xs">
            Apply migrations <span className="font-mono">20260703100000</span> +{' '}
            <span className="font-mono">20260703110000</span> +{' '}
            <span className="font-mono">20260703120000</span>, then refresh.
          </div>
        </div>
      ) : null}

      {loading && !snapshot ? (
        <div className={`grid gap-2 mb-4 ${isDesktop ? 'grid-cols-5' : 'grid-cols-2 sm:grid-cols-3'}`}>
          {Array.from({ length: isDesktop ? 5 : 6 }).map((_, i) => (
            <div key={i} className="edge-monitor-shimmer h-20 rounded-2xl bg-zinc-800/60" />
          ))}
        </div>
      ) : null}

      {snapshot ? (
        <>
          <AlertsBanner alerts={alerts} />
          <LivePulseStrip live={live} error={liveError} show={isDesktop} />

          {isDesktop ? (
            <div className={`grid gap-3 mb-4 grid-cols-5`}>
              {heroKpis.map((kpi) => (
                <HeroKpiCard key={kpi.id} kpi={kpi} compact={!isDesktop} />
              ))}
            </div>
          ) : (
            <MobileMonitorGlance heroKpis={heroKpis} />
          )}

          <EdgeMonitorUserSignupsPanel
            roster={roster}
            signupTrends30d={trends30d}
            loading={rosterLoading}
            error={rosterError}
          />

          <EdgeMonitorSubscriberRosterPanel
            roster={roster}
            loading={rosterLoading}
            error={rosterError}
            refreshing={rosterRefreshing}
            onReload={() => void loadRoster(true)}
          />

          {isDesktop ? (
            <div className="edge-monitor-desktop-charts mb-6 grid grid-cols-1 xl:grid-cols-12 gap-4">
              <div className="xl:col-span-8 space-y-4">
                {trendLabels.length > 0 ? (
                  <section className={`edge-monitor-panel ${MONITOR_PANEL} p-5 h-full`}>
                    <div className="mb-3">
                      <div className="text-white font-bold text-base">7-day pulse</div>
                      <div className="text-zinc-500 text-xs mt-0.5">UTC daily · signups, posts, activity, chat</div>
                    </div>
                    <MonitorPulseChart labels={trendLabels} datasets={pulseDatasets} height={pulseHeight} />
                  </section>
                ) : null}
              </div>
              <div className="xl:col-span-4 space-y-4">
                <section className={`edge-monitor-panel ${MONITOR_PANEL} p-5`}>
                  <div className="mb-3">
                    <div className="text-white font-bold text-base">Velocity</div>
                    <div className="text-zinc-500 text-xs mt-0.5">24h vs 7d</div>
                  </div>
                  <MonitorCompareBars items={velocityCompare} height={220} />
                </section>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  <section className={`edge-monitor-panel ${MONITOR_PANEL} p-4`}>
                    <div className="text-white font-bold text-sm mb-1">30-day signups</div>
                    <div className="text-zinc-500 text-[10px] mb-2">UTC daily sparkline</div>
                    <MonitorSparklineChart
                      labels={trendLabels30d}
                      values={opsMonitorTrendSeries(trends30d, 'signups')}
                      color={OPS_CHART_COLORS.cyan}
                      label="Signups"
                      height={130}
                    />
                  </section>
                  <section className={`edge-monitor-panel ${MONITOR_PANEL} p-4`}>
                    <div className="text-white font-bold text-sm mb-1">90-day activity</div>
                    <div className="text-zinc-500 text-[10px] mb-2">UTC weekly buckets</div>
                    <MonitorSparklineChart
                      labels={trendLabels90d}
                      values={opsMonitorTrendSeries(trends90d, 'activity')}
                      color={OPS_CHART_COLORS.purple}
                      label="Activity"
                      height={130}
                    />
                  </section>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <section className={`edge-monitor-panel ${MONITOR_PANEL} p-4`}>
                    <div className="text-white font-bold text-sm mb-2">Roles</div>
                    <MonitorDoughnutChart
                      labels={roleDoughnut.labels}
                      values={roleDoughnut.values}
                      colors={roleDoughnut.colors}
                      height={170}
                    />
                  </section>
                  <section className={`edge-monitor-panel ${MONITOR_PANEL} p-4`}>
                    <div className="text-white font-bold text-sm mb-2">Subs</div>
                    <MonitorDoughnutChart
                      labels={subsDoughnut.labels}
                      values={subsDoughnut.values}
                      colors={subsDoughnut.colors}
                      height={170}
                    />
                  </section>
                </div>
              </div>
            </div>
          ) : (
            <div className="mb-4 space-y-4">{chartPanel}</div>
          )}

          <div className={isDesktop ? 'edge-monitor-desktop-sections grid grid-cols-1 lg:grid-cols-2 gap-4' : 'space-y-4'}>
            {detailSections}
          </div>
        </>
      ) : null}
    </div>
  )
}
