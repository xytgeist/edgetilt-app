import { useCallback, useEffect, useMemo, useState } from 'react'
import ScrollLinkedEdgeTitleBarShell from '../../components/ScrollLinkedEdgeTitleBarShell.jsx'
import { APP_BUILD_SHA } from '../../utils/appBuildInfo.js'
import {
  fetchOpsMonitorSnapshot,
  formatOpsMonitorBreakdown,
  formatOpsMonitorCount,
  opsMonitorSupabaseProjectRef,
} from './opsMonitorApi.js'
import {
  MonitorBarChart,
  MonitorCompareBars,
  MonitorDoughnutChart,
  MonitorPulseChart,
  breakdownToDoughnut,
  buildPulseDatasets,
} from './OpsMonitorCharts.jsx'
import {
  OPS_CHART_COLORS,
  OPS_SECTION_THEMES,
  opsMonitorHeroKpis,
  opsMonitorTrendLabels,
  opsMonitorTrendSeries,
} from './opsMonitorTheme.js'

function HeroKpiCard({ kpi }) {
  const theme = kpi.theme || OPS_SECTION_THEMES.users
  return (
    <div
      className={`edge-monitor-hero-card relative overflow-hidden rounded-2xl border border-white/5 bg-gradient-to-br ${theme.gradient} p-3 min-w-0`}
      style={{ boxShadow: `0 0 0 1px ${theme.accent}22, 0 8px 24px ${theme.accent}14` }}
    >
      <div
        className="absolute -right-3 -top-3 h-16 w-16 rounded-full blur-2xl opacity-40"
        style={{ backgroundColor: theme.accent }}
        aria-hidden
      />
      <div className="relative">
        <div className="text-[10px] font-bold uppercase tracking-wider text-zinc-400">{kpi.label}</div>
        <div className="text-white text-2xl font-black tabular-nums mt-0.5 tracking-tight">
          {formatOpsMonitorCount(kpi.value)}
        </div>
        <div className="text-[11px] font-medium mt-1 truncate" style={{ color: theme.accent }}>
          {kpi.sub}
        </div>
      </div>
    </div>
  )
}

function MetricTile({ label, value, hint = '', accent = OPS_CHART_COLORS.cyan }) {
  return (
    <div
      className="rounded-2xl bg-zinc-950/45 border border-zinc-800/70 px-3 py-3 min-w-0"
      style={{ borderLeftWidth: 3, borderLeftColor: `${accent}88` }}
    >
      <div className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500 truncate">{label}</div>
      <div className="text-white text-lg font-bold tabular-nums mt-1 truncate">{value}</div>
      {hint ? <div className="text-zinc-500 text-[11px] mt-1 leading-snug">{hint}</div> : null}
    </div>
  )
}

function MonitorSection({ themeKey, title, subtitle, chart = null, children }) {
  const theme = OPS_SECTION_THEMES[themeKey] || OPS_SECTION_THEMES.ops
  return (
    <section
      className={`edge-monitor-section relative overflow-hidden rounded-3xl border border-zinc-800/80 bg-zinc-900/90 mb-4`}
    >
      <div
        className={`absolute inset-x-0 top-0 h-24 bg-gradient-to-b ${theme.gradient} pointer-events-none`}
        aria-hidden
      />
      <div className="relative p-4">
        <div className="mb-3 flex items-start gap-2.5">
          <span
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-lg"
            style={{ backgroundColor: `${theme.accent}22`, boxShadow: `inset 0 0 0 1px ${theme.accent}44` }}
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
      </div>
    </section>
  )
}

const PLANNED_METRICS = [
  'Sentry error rate + release health',
  'Stripe MRR / churn dashboard',
  'Cloudflare Stream pending uploads',
  'Edge Function latency + deploy versions',
  'Market API quota (Finnhub / CoinGecko)',
  'Freemium lock → subscribe funnel',
]

export default function EdgeMonitorScreen({
  supabaseClient,
  titleBarNavSlot = null,
  onBack,
}) {
  const [snapshot, setSnapshot] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [refreshing, setRefreshing] = useState(false)

  const load = useCallback(async (isRefresh = false) => {
    if (!supabaseClient) {
      setError('Supabase client unavailable.')
      setLoading(false)
      return
    }
    if (isRefresh) setRefreshing(true)
    else setLoading(true)
    setError('')
    const { data, error: rpcError } = await fetchOpsMonitorSnapshot(supabaseClient)
    if (rpcError) {
      setError(rpcError.message || 'Failed to load monitor snapshot.')
      setSnapshot(null)
    } else {
      setSnapshot(data || null)
    }
    setLoading(false)
    setRefreshing(false)
  }, [supabaseClient])

  useEffect(() => {
    void load(false)
  }, [load])

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

  const heroKpis = useMemo(() => opsMonitorHeroKpis(snapshot), [snapshot])

  const trendLabels = useMemo(() => opsMonitorTrendLabels(trends), [trends])
  const pulseDatasets = useMemo(() => buildPulseDatasets(trends), [trends])

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

  return (
    <ScrollLinkedEdgeTitleBarShell
      titleBarNavSlot={titleBarNavSlot}
      contentClassName="px-3 py-6 pb-[calc(6rem+env(safe-area-inset-bottom,0px))]"
    >
      <div data-edge-monitor className="edge-monitor-root">
        <div className="edge-monitor-header relative mb-5 overflow-hidden rounded-3xl border border-cyan-500/20 bg-gradient-to-br from-cyan-950/80 via-zinc-900 to-violet-950/60 p-4">
          <div className="pointer-events-none absolute inset-0 edge-monitor-header-glow" aria-hidden />
          <div className="relative flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-xl" aria-hidden>
                  📊
                </span>
                <div className="text-2xl font-black tracking-tight bg-gradient-to-r from-cyan-300 via-white to-violet-300 bg-clip-text text-transparent">
                  Edge Monitor
                </div>
              </div>
              <div className="text-zinc-400 text-sm mt-1">Live pulse · admin ops</div>
              <div className="mt-2 flex flex-wrap gap-2 text-[11px]">
                <span className="rounded-full bg-black/30 px-2.5 py-1 font-semibold text-cyan-200 ring-1 ring-cyan-500/30">
                  {opsMonitorSupabaseProjectRef()}
                </span>
                <span className="rounded-full bg-black/30 px-2.5 py-1 font-semibold text-zinc-300 ring-1 ring-zinc-600/50">
                  {APP_BUILD_SHA.slice(0, 7)}
                </span>
                {generatedAt ? (
                  <span className="rounded-full bg-black/20 px-2.5 py-1 font-medium text-zinc-400">
                    {generatedAt}
                  </span>
                ) : null}
              </div>
            </div>
            <div className="flex shrink-0 flex-col items-end gap-2">
              {onBack ? (
                <button
                  type="button"
                  onClick={onBack}
                  className="min-h-9 rounded-xl bg-zinc-800/80 px-3 text-zinc-200 text-xs font-semibold touch-manipulation hover:bg-zinc-700"
                >
                  ← Lounge
                </button>
              ) : null}
              <button
                type="button"
                disabled={loading || refreshing}
                onClick={() => void load(true)}
                className="min-h-9 rounded-xl bg-gradient-to-r from-cyan-600 to-violet-600 px-4 text-white text-xs font-bold touch-manipulation hover:from-cyan-500 hover:to-violet-500 disabled:opacity-50 shadow-lg shadow-cyan-900/30"
              >
                {refreshing ? 'Refreshing…' : 'Refresh'}
              </button>
            </div>
          </div>
        </div>

        {error ? (
          <div className="mb-4 rounded-2xl border border-red-500/40 bg-red-950/50 px-4 py-3 text-red-100 text-sm leading-relaxed">
            {error}
            <div className="mt-2 text-red-200/70 text-xs">
              Apply migrations{' '}
              <span className="font-mono">20260703100000</span> +{' '}
              <span className="font-mono">20260703110000</span>, then refresh.
            </div>
          </div>
        ) : null}

        {loading && !snapshot ? (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 mb-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="edge-monitor-shimmer h-20 rounded-2xl bg-zinc-800/60" />
            ))}
          </div>
        ) : null}

        {snapshot ? (
          <>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5 mb-4">
              {heroKpis.map((kpi) => (
                <HeroKpiCard key={kpi.id} kpi={kpi} />
              ))}
            </div>

            {trendLabels.length > 0 ? (
              <section className="mb-4 rounded-3xl border border-zinc-800/80 bg-zinc-900/90 p-4">
                <div className="mb-3">
                  <div className="text-white font-bold text-[15px]">7-day pulse</div>
                  <div className="text-zinc-500 text-xs mt-0.5">UTC daily buckets · signups, posts, activity, chat</div>
                </div>
                <MonitorPulseChart labels={trendLabels} datasets={pulseDatasets} height={240} />
              </section>
            ) : null}

            <section className="mb-4 rounded-3xl border border-zinc-800/80 bg-zinc-900/90 p-4">
              <div className="mb-3">
                <div className="text-white font-bold text-[15px]">Velocity</div>
                <div className="text-zinc-500 text-xs mt-0.5">24h vs 7d totals</div>
              </div>
              <MonitorCompareBars items={velocityCompare} height={200} />
            </section>

            <div className="grid gap-4 mb-4 sm:grid-cols-2">
              <section className="rounded-3xl border border-zinc-800/80 bg-zinc-900/90 p-4">
                <div className="text-white font-bold text-sm mb-2">Role mix</div>
                <MonitorDoughnutChart
                  labels={roleDoughnut.labels}
                  values={roleDoughnut.values}
                  colors={roleDoughnut.colors}
                  height={190}
                />
              </section>
              <section className="rounded-3xl border border-zinc-800/80 bg-zinc-900/90 p-4">
                <div className="text-white font-bold text-sm mb-2">Active subs by product</div>
                <MonitorDoughnutChart
                  labels={subsDoughnut.labels}
                  values={subsDoughnut.values}
                  colors={subsDoughnut.colors}
                  height={190}
                />
              </section>
            </div>

            <MonitorSection
              themeKey="users"
              title="Users & roles"
              subtitle="profiles"
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

            <MonitorSection themeKey="search" title="Search & limits" subtitle="Analytics + rate caps">
              <MetricTile label="Searches 24h" value={formatOpsMonitorCount(search.searches_24h)} accent={OPS_CHART_COLORS.yellow} />
              <MetricTile label="Searches 7d" value={formatOpsMonitorCount(search.searches_7d)} />
              <MetricTile label="Searchers 24h" value={formatOpsMonitorCount(search.unique_searchers_24h)} />
              <MetricTile label="Rate hits 24h" value={formatOpsMonitorCount(rateLimits.events_24h)} accent={OPS_CHART_COLORS.red} />
              <MetricTile label="Rate hits 7d" value={formatOpsMonitorCount(rateLimits.events_7d)} />
              <MetricTile label="Kinds 24h" value={formatOpsMonitorBreakdown(rateLimits.by_kind_24h, 'count')} />
            </MonitorSection>

            <MonitorSection
              themeKey="chat"
              title="Chat"
              subtitle="Rooms + messages"
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

            <MonitorSection themeKey="tools" title="Guides & tools" subtitle="Catalog + session tools">
              <MetricTile label="Guides live" value={formatOpsMonitorCount(guides.published)} accent={OPS_CHART_COLORS.pink} />
              <MetricTile label="Drafts" value={formatOpsMonitorCount(guides.unpublished)} />
              <MetricTile label="Machines" value={formatOpsMonitorCount(guides.machines_total)} />
              <MetricTile label="Bankroll sessions" value={formatOpsMonitorCount(bankroll.sessions_total)} />
              <MetricTile label="Bankroll 7d" value={formatOpsMonitorCount(bankroll.sessions_7d)} accent={OPS_CHART_COLORS.cyan} />
              <MetricTile label="Play logs" value={formatOpsMonitorCount(playLog.entries_total)} />
              <MetricTile label="Play logs 7d" value={formatOpsMonitorCount(playLog.entries_7d)} />
              <MetricTile label="Logbook users" value={formatOpsMonitorCount(playLog.users_with_entries)} />
            </MonitorSection>

            <MonitorSection themeKey="ops" title="Offers · push · Starter" subtitle="Calendar, notifications, drops">
              <MetricTile label="Offers" value={formatOpsMonitorCount(offers.events_total)} accent={OPS_CHART_COLORS.red} />
              <MetricTile label="Uploads" value={formatOpsMonitorCount(offers.uploads_total)} />
              <MetricTile label="Push subs" value={formatOpsMonitorCount(push.subscriptions_total)} accent={OPS_CHART_COLORS.cyan} />
              <MetricTile label="Starter unlocks" value={formatOpsMonitorCount(starterDrops.unlocks_total)} accent={OPS_CHART_COLORS.purple} />
              <MetricTile label="Pending scratch" value={formatOpsMonitorCount(starterDrops.pending_reveal)} accent={OPS_CHART_COLORS.yellow} />
              <MetricTile label="Activity 24h" value={formatOpsMonitorCount(activity.events_24h)} />
            </MonitorSection>

            <section className="rounded-3xl border border-dashed border-zinc-700/80 bg-zinc-900/50 p-4 mb-4">
              <div className="text-transparent bg-gradient-to-r from-cyan-400 to-violet-400 bg-clip-text font-bold text-[15px] mb-1">
                Coming next
              </div>
              <ul className="grid gap-2 sm:grid-cols-2">
                {PLANNED_METRICS.map((item) => (
                  <li key={item} className="flex gap-2 text-zinc-400 text-xs leading-relaxed">
                    <span className="text-lv-purple shrink-0">◆</span>
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </section>
          </>
        ) : null}
      </div>
    </ScrollLinkedEdgeTitleBarShell>
  )
}
