import { useCallback, useEffect, useState } from 'react'
import ScrollLinkedEdgeTitleBarShell from '../../components/ScrollLinkedEdgeTitleBarShell.jsx'
import { APP_BUILD_SHA } from '../../utils/appBuildInfo.js'
import {
  fetchOpsMonitorSnapshot,
  formatOpsMonitorBreakdown,
  formatOpsMonitorCount,
  opsMonitorSupabaseProjectRef,
} from './opsMonitorApi.js'

function MetricTile({ label, value, hint = '' }) {
  return (
    <div className="rounded-2xl bg-zinc-800/70 px-3 py-3 min-w-0">
      <div className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500 truncate">{label}</div>
      <div className="text-white text-xl font-bold tabular-nums mt-1 truncate">{value}</div>
      {hint ? <div className="text-zinc-500 text-[11px] mt-1 leading-snug">{hint}</div> : null}
    </div>
  )
}

function MonitorSection({ title, subtitle, children }) {
  return (
    <section className="bg-zinc-900 rounded-3xl p-4 mb-4">
      <div className="mb-3">
        <div className="text-white font-bold text-[15px]">{title}</div>
        {subtitle ? <div className="text-zinc-500 text-xs mt-0.5 leading-relaxed">{subtitle}</div> : null}
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">{children}</div>
    </section>
  )
}

const PLANNED_METRICS = [
  'Sentry error rate + release health (external link)',
  'Stripe MRR / churn / failed payments dashboard',
  'Cloudflare Stream pending uploads + purge cron last run',
  'Edge Function deploy versions + cold-start latency',
  'Lounge market chart API quota (Finnhub / CoinGecko)',
  'Guide ingest queue + R2 hero coverage audit',
  'Freemium lock hit counts (subscribe modal opens)',
  'Realtime connection count + chat delivery lag',
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

  return (
    <ScrollLinkedEdgeTitleBarShell
      titleBarNavSlot={titleBarNavSlot}
      contentClassName="px-3 py-6 pb-[calc(6rem+env(safe-area-inset-bottom,0px))]"
    >
      <div className="mb-5 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-white text-2xl font-black tracking-tight">Edge Monitor</div>
          <div className="text-zinc-400 text-sm mt-0.5">Admin ops snapshot</div>
          <div className="mt-2 flex flex-wrap gap-2 text-[11px]">
            <span className="rounded-full bg-zinc-800 px-2.5 py-1 font-semibold text-zinc-300">
              DB {opsMonitorSupabaseProjectRef()}
            </span>
            <span className="rounded-full bg-zinc-800 px-2.5 py-1 font-semibold text-zinc-400">
              build {APP_BUILD_SHA.slice(0, 7)}
            </span>
          </div>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-2">
          {onBack ? (
            <button
              type="button"
              onClick={onBack}
              className="min-h-9 rounded-xl bg-zinc-800 px-3 text-zinc-200 text-xs font-semibold touch-manipulation hover:bg-zinc-700"
            >
              ← Lounge
            </button>
          ) : null}
          <button
            type="button"
            disabled={loading || refreshing}
            onClick={() => void load(true)}
            className="min-h-9 rounded-xl bg-cyan-800/80 px-3 text-cyan-100 text-xs font-semibold touch-manipulation hover:bg-cyan-700/80 disabled:opacity-50"
          >
            {refreshing ? 'Refreshing…' : 'Refresh'}
          </button>
        </div>
      </div>

      {generatedAt ? (
        <div className="mb-4 text-zinc-500 text-xs">Snapshot {generatedAt}</div>
      ) : null}

      {error ? (
        <div className="mb-4 rounded-2xl border border-red-900/60 bg-red-950/40 px-4 py-3 text-red-200 text-sm leading-relaxed">
          {error}
          <div className="mt-2 text-red-300/80 text-xs">
            Apply migration <span className="font-mono">20260703100000_admin_ops_monitor_snapshot.sql</span> on this
            Supabase project, then refresh.
          </div>
        </div>
      ) : null}

      {loading && !snapshot ? (
        <div className="text-zinc-500 text-sm py-8 text-center">Loading metrics…</div>
      ) : null}

      {snapshot ? (
        <>
          <MonitorSection title="Users & roles" subtitle="profiles table">
            <MetricTile label="Total profiles" value={formatOpsMonitorCount(users.total_profiles)} />
            <MetricTile label="New 24h" value={formatOpsMonitorCount(users.new_24h)} />
            <MetricTile label="New 7d" value={formatOpsMonitorCount(users.new_7d)} />
            <MetricTile label="Role: user" value={formatOpsMonitorCount(users.role_user)} />
            <MetricTile label="Role: mod" value={formatOpsMonitorCount(users.role_moderator)} />
            <MetricTile label="Role: admin" value={formatOpsMonitorCount(users.role_admin)} />
            <MetricTile
              label="Legacy sub flag"
              value={formatOpsMonitorCount(users.has_active_subscription_flag)}
              hint="profiles.has_active_subscription"
            />
            <MetricTile label="Stripe customer" value={formatOpsMonitorCount(users.stripe_customer_linked)} />
          </MonitorSection>

          <MonitorSection title="Subscriptions" subtitle="user_subscriptions + Stripe webhook volume">
            <MetricTile label="Rows total" value={formatOpsMonitorCount(subs.rows_total)} />
            <MetricTile
              label="Active by product"
              value={formatOpsMonitorBreakdown(subs.active_by_product)}
            />
            <MetricTile
              label="Status mix"
              value={formatOpsMonitorBreakdown(subs.status_breakdown, 'count')}
            />
            <MetricTile label="Cancel at end" value={formatOpsMonitorCount(subs.cancel_at_period_end)} />
            <MetricTile label="Monthly interval" value={formatOpsMonitorCount(subs.monthly_interval)} />
            <MetricTile label="Annual interval" value={formatOpsMonitorCount(subs.annual_interval)} />
            <MetricTile label="Webhooks 24h" value={formatOpsMonitorCount(stripeWebhooks.events_24h)} />
            <MetricTile label="Webhooks 7d" value={formatOpsMonitorCount(stripeWebhooks.events_7d)} />
          </MonitorSection>

          <MonitorSection title="Lounge" subtitle="Feed, engagement, media">
            <MetricTile label="Posts total" value={formatOpsMonitorCount(lounge.posts_total)} />
            <MetricTile label="Visible" value={formatOpsMonitorCount(lounge.posts_visible)} />
            <MetricTile label="Hidden" value={formatOpsMonitorCount(lounge.posts_hidden)} />
            <MetricTile label="Posts 24h" value={formatOpsMonitorCount(lounge.posts_24h)} />
            <MetricTile label="Posts 7d" value={formatOpsMonitorCount(lounge.posts_7d)} />
            <MetricTile label="Pinned" value={formatOpsMonitorCount(lounge.pinned)} />
            <MetricTile label="Stream videos" value={formatOpsMonitorCount(lounge.with_stream_video)} />
            <MetricTile label="Comments" value={formatOpsMonitorCount(lounge.comments_total)} />
            <MetricTile label="Comments 24h" value={formatOpsMonitorCount(lounge.comments_24h)} />
            <MetricTile label="Likes" value={formatOpsMonitorCount(lounge.likes_total)} />
            <MetricTile label="Bookmarks" value={formatOpsMonitorCount(lounge.bookmarks_total)} />
            <MetricTile label="Follows" value={formatOpsMonitorCount(lounge.follows_total)} />
          </MonitorSection>

          <MonitorSection title="Search & limits" subtitle="lounge_search_analytics + rate_limit_events">
            <MetricTile label="Searches 24h" value={formatOpsMonitorCount(search.searches_24h)} />
            <MetricTile label="Searches 7d" value={formatOpsMonitorCount(search.searches_7d)} />
            <MetricTile label="Searchers 24h" value={formatOpsMonitorCount(search.unique_searchers_24h)} />
            <MetricTile label="Rate events 24h" value={formatOpsMonitorCount(rateLimits.events_24h)} />
            <MetricTile label="Rate events 7d" value={formatOpsMonitorCount(rateLimits.events_7d)} />
            <MetricTile
              label="Rate kinds 24h"
              value={formatOpsMonitorBreakdown(rateLimits.by_kind_24h, 'count')}
            />
          </MonitorSection>

          <MonitorSection title="Chat" subtitle="Rooms, messages, membership">
            <MetricTile label="Rooms" value={formatOpsMonitorCount(chat.rooms_total)} />
            <MetricTile label="Messages" value={formatOpsMonitorCount(chat.messages_total)} />
            <MetricTile label="Messages 24h" value={formatOpsMonitorCount(chat.messages_24h)} />
            <MetricTile label="Messages 7d" value={formatOpsMonitorCount(chat.messages_7d)} />
            <MetricTile label="Members" value={formatOpsMonitorCount(chat.members_total)} />
          </MonitorSection>

          <MonitorSection title="Guides & tools" subtitle="AP catalog + member tool usage">
            <MetricTile label="Guides published" value={formatOpsMonitorCount(guides.published)} />
            <MetricTile label="Guides draft" value={formatOpsMonitorCount(guides.unpublished)} />
            <MetricTile label="Machines" value={formatOpsMonitorCount(guides.machines_total)} />
            <MetricTile label="Bankroll sessions" value={formatOpsMonitorCount(bankroll.sessions_total)} />
            <MetricTile label="Bankroll 7d" value={formatOpsMonitorCount(bankroll.sessions_7d)} />
            <MetricTile label="Bankroll users" value={formatOpsMonitorCount(bankroll.profiles_with_sessions)} />
            <MetricTile label="Play logs" value={formatOpsMonitorCount(playLog.entries_total)} />
            <MetricTile label="Play logs 7d" value={formatOpsMonitorCount(playLog.entries_7d)} />
            <MetricTile label="Play log users" value={formatOpsMonitorCount(playLog.users_with_entries)} />
          </MonitorSection>

          <MonitorSection title="Offers, push, Starter" subtitle="Calendar, notifications, weekly drops">
            <MetricTile label="Offer events" value={formatOpsMonitorCount(offers.events_total)} />
            <MetricTile label="Offer uploads" value={formatOpsMonitorCount(offers.uploads_total)} />
            <MetricTile label="Push subs" value={formatOpsMonitorCount(push.subscriptions_total)} />
            <MetricTile label="Starter unlocks" value={formatOpsMonitorCount(starterDrops.unlocks_total)} />
            <MetricTile label="Pending scratch" value={formatOpsMonitorCount(starterDrops.pending_reveal)} />
            <MetricTile label="Starter grants 7d" value={formatOpsMonitorCount(starterDrops.grants_7d)} />
            <MetricTile label="Activity 24h" value={formatOpsMonitorCount(activity.events_24h)} />
            <MetricTile label="Activity 7d" value={formatOpsMonitorCount(activity.events_7d)} />
          </MonitorSection>

          <section className="bg-zinc-900/70 rounded-3xl p-4 mb-4 border border-zinc-800/80">
            <div className="text-white font-bold text-[15px] mb-1">Planned next</div>
            <div className="text-zinc-500 text-xs mb-3 leading-relaxed">
              v1 is DB snapshot only. See <span className="text-zinc-400">docs/edge-monitor-roadmap.md</span> for the
              full metric backlog.
            </div>
            <ul className="space-y-2">
              {PLANNED_METRICS.map((item) => (
                <li key={item} className="flex gap-2 text-zinc-400 text-xs leading-relaxed">
                  <span className="text-zinc-600 shrink-0">○</span>
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </section>
        </>
      ) : null}
    </ScrollLinkedEdgeTitleBarShell>
  )
}
