import {
  BOT_PIPELINE_LABELS,
  BOT_RUN_STATES,
  botRunStateBadgeClass,
} from '../bots/botPortalConstants.js'
import { formatBotPostCap, formatOpsMonitorCount, formatOpsMonitorRelativeTime } from './opsMonitorApi.js'

/** @param {Record<string, unknown> | null | undefined} botOps */
function normalizeBotOpsBots(botOps) {
  if (Array.isArray(botOps?.bots) && botOps.bots.length) return botOps.bots
  const legacy = botOps?.market_news || botOps?.financial_wire
  if (legacy?.configured) return [legacy]
  return []
}

/** @param {string | null | undefined} runState @param {boolean | null | undefined} enabled */
function botRunStateLabel(runState, enabled) {
  const state = String(runState || '').trim()
  if (state) return state
  return enabled ? 'running' : 'stopped'
}

/** @param {string | null | undefined} runState @param {boolean | null | undefined} enabled */
function botRunStateTone(runState, enabled) {
  const label = botRunStateLabel(runState, enabled)
  return BOT_RUN_STATES.find((row) => row.id === label)?.tone || 'zinc'
}

/** @param {Record<string, unknown>} bot */
function botSecondaryMetric(bot) {
  const pipeline = String(bot.pipeline || '')
  if (pipeline === 'market_news') {
    return `Sources on ${formatOpsMonitorCount(bot.sources_enabled)}`
  }
  if (pipeline === 'x') {
    const pending = Number(bot.pending_review)
    if (Number.isFinite(pending) && pending > 0) {
      return `${formatOpsMonitorCount(pending)} pending review`
    }
    return `X sources on ${formatOpsMonitorCount(bot.x_sources_enabled)}`
  }
  if (pipeline === 'odds_api') {
    const lastHour = Number(bot.posts_last_hour)
    if (Number.isFinite(lastHour) && lastHour > 0) {
      return `${formatOpsMonitorCount(lastHour)} posts last hour`
    }
    if (bot.last_publish_at) {
      return `Last publish ${formatOpsMonitorRelativeTime(String(bot.last_publish_at))}`
    }
    return 'Odds pipeline'
  }
  if (bot.last_publish_at) {
    return `Last publish ${formatOpsMonitorRelativeTime(String(bot.last_publish_at))}`
  }
  return 'Manual pipeline'
}

/** @param {Record<string, unknown>} bot */
function BotOpsRow({ bot }) {
  const displayName = String(bot.display_name || bot.slug || 'Bot').trim()
  const handle = String(bot.handle || '').trim()
  const pipeline = String(bot.pipeline || '')
  const pipelineLabel = BOT_PIPELINE_LABELS[pipeline] || pipeline || 'Bot'
  const runLabel = botRunStateLabel(
    typeof bot.run_state === 'string' ? bot.run_state : null,
    bot.enabled === true,
  )
  const runTone = botRunStateTone(
    typeof bot.run_state === 'string' ? bot.run_state : null,
    bot.enabled === true,
  )

  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2.5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="text-white font-semibold text-sm truncate">
            {displayName}
            {handle ? (
              <span className="text-zinc-500 font-normal ml-1.5">
                @{handle.replace(/^@/, '')}
              </span>
            ) : null}
          </div>
          <div className="text-zinc-500 text-[11px] mt-0.5">{pipelineLabel}</div>
        </div>
        <span
          className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ring-1 ring-inset capitalize ${botRunStateBadgeClass(runTone)}`}
        >
          {runLabel}
        </span>
      </div>
      <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-zinc-400">
        <span>
          Posts today{' '}
          <span className="text-white font-semibold tabular-nums">
            {formatOpsMonitorCount(bot.posts_today)}
          </span>
          <span className="text-zinc-600">
            {' '}
            / {formatBotPostCap(bot.max_posts_per_day)}
          </span>
        </span>
        <span>{botSecondaryMetric(bot)}</span>
      </div>
    </div>
  )
}

/**
 * Compact Edge Monitor card linking to full Bot Portal.
 */
export default function EdgeMonitorBotOpsPanel({ botOps, loading, error, onOpenPortal }) {
  const bots = normalizeBotOpsBots(botOps)
  const editorialPending = Number(botOps?.editorial_pending)
  const editorialScheduled = Number(botOps?.editorial_scheduled)

  return (
    <section className="edge-monitor-panel rounded-2xl border border-zinc-800 bg-zinc-900 p-4 lg:p-5 lg:col-span-2">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-white font-bold text-[15px]">Lounge bots</div>
          <div className="text-zinc-500 text-xs mt-0.5">
            {bots.length
              ? `${formatOpsMonitorCount(bots.length)} configured · full control in Bot Portal`
              : 'Full control in Bot Portal · run, pause, caps, edit posts'}
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

      {!loading || botOps ? (
        <>
          {(Number.isFinite(editorialPending) && editorialPending > 0)
          || (Number.isFinite(editorialScheduled) && editorialScheduled > 0) ? (
            <div className="mt-3 flex flex-wrap gap-2 text-[11px]">
              {editorialPending > 0 ? (
                <span className="rounded-full bg-amber-950/50 text-amber-100 px-2.5 py-1 ring-1 ring-amber-500/30">
                  {formatOpsMonitorCount(editorialPending)} editorial pending
                </span>
              ) : null}
              {editorialScheduled > 0 ? (
                <span className="rounded-full bg-sky-950/50 text-sky-100 px-2.5 py-1 ring-1 ring-sky-500/30">
                  {formatOpsMonitorCount(editorialScheduled)} scheduled
                </span>
              ) : null}
            </div>
          ) : null}

          {bots.length ? (
            <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-2">
              {bots.map((bot) => (
                <BotOpsRow key={String(bot.user_id || bot.slug)} bot={bot} />
              ))}
            </div>
          ) : (
            <div className="mt-3 text-zinc-500 text-xs">
              No bots configured yet. Use Bot Portal setup steps.
            </div>
          )}
        </>
      ) : null}
    </section>
  )
}
