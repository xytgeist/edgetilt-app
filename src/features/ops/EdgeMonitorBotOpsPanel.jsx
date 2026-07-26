import { formatBotPostCap, formatOpsMonitorCount } from './opsMonitorApi.js'

/**
 * Compact Edge Monitor card linking to full Bot Portal.
 */
export default function EdgeMonitorBotOpsPanel({ botOps, loading, error, onOpenPortal }) {
  const marketNews = botOps?.market_news || botOps?.financial_wire || {}
  const configured = marketNews.configured === true
  const monitorLabel = marketNews.display_name || 'Market Edge'

  return (
    <section className="edge-monitor-panel rounded-2xl border border-zinc-800 bg-zinc-900 p-4 lg:p-5 lg:col-span-2">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-white font-bold text-[15px]">Lounge bots</div>
          <div className="text-zinc-500 text-xs mt-0.5">
            Full control in Bot Portal · run, pause, caps, edit posts
          </div>
        </div>
        <button
          type="button"
          onClick={onOpenPortal}
          className="min-h-8 rounded-lg bg-zinc-100 px-4 text-zinc-950 text-[11px] font-bold hover:bg-white"
        >
          Open Bot Portal →
        </button>
      </div>

      {error ? (
        <div className="mt-3 rounded-xl border border-amber-500/30 bg-amber-950/30 px-3 py-2 text-amber-100 text-xs">
          {error}
        </div>
      ) : null}

      {loading && !botOps ? (
        <div className="edge-monitor-shimmer h-12 rounded-xl bg-zinc-800/60 mt-3" />
      ) : null}

      {configured ? (
        <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
          <div className="rounded-xl bg-zinc-950 border border-zinc-800 px-3 py-2">
            <div className="text-zinc-500 text-[10px] uppercase">{monitorLabel}</div>
            <div className="text-white font-bold mt-0.5 capitalize">{marketNews.run_state || (marketNews.enabled ? 'running' : 'stopped')}</div>
          </div>
          <div className="rounded-xl bg-zinc-950 border border-zinc-800 px-3 py-2">
            <div className="text-zinc-500 text-[10px] uppercase">Posts today</div>
            <div className="text-white font-bold tabular-nums mt-0.5">{formatOpsMonitorCount(marketNews.posts_today)}</div>
          </div>
          <div className="rounded-xl bg-zinc-950 border border-zinc-800 px-3 py-2">
            <div className="text-zinc-500 text-[10px] uppercase">Cap / day</div>
            <div className="text-white font-bold tabular-nums mt-0.5">{formatBotPostCap(marketNews.max_posts_per_day)}</div>
          </div>
          <div className="rounded-xl bg-zinc-950 border border-zinc-800 px-3 py-2">
            <div className="text-zinc-500 text-[10px] uppercase">Sources on</div>
            <div className="text-white font-bold tabular-nums mt-0.5">{formatOpsMonitorCount(marketNews.sources_enabled)}</div>
          </div>
        </div>
      ) : (
        <div className="mt-3 text-zinc-500 text-xs">No bots configured yet. Use Bot Portal setup steps.</div>
      )}
    </section>
  )
}
