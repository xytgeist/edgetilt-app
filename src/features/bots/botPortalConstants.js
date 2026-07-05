/** Labels and helpers for the bot management portal. */

export const BOT_RUN_STATES = Object.freeze([
  { id: 'running', label: 'Running', hint: 'Ingest + auto-publish', tone: 'emerald' },
  { id: 'paused', label: 'Paused', hint: 'Automation off, settings kept', tone: 'amber' },
  { id: 'stopped', label: 'Stopped', hint: 'Fully off', tone: 'zinc' },
])

export const BOT_PIPELINE_LABELS = Object.freeze({
  market_news: 'Financial wire',
  odds_api: 'Sports odds',
  x: 'X tracker',
  manual: 'Manual',
})

export const BOT_REVIEW_MODE_LABELS = Object.freeze({
  automatic: 'Self-contained',
  editorial: 'Editorial inbox',
})

/** @param {string} pipeline */
export function botPollActionLabel(pipeline) {
  if (pipeline === 'market_news') return 'Poll now'
  if (pipeline === 'odds_api') return 'Fetch odds'
  if (pipeline === 'x') return 'Ingest X'
  return 'Run pipeline'
}

/** @param {string} [iso] */
export function formatBotPortalWhen(iso) {
  if (!iso) return '—'
  const dt = new Date(iso)
  if (Number.isNaN(dt.getTime())) return '—'
  return dt.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

/** Scott Share alert types for All | Subs audience routing. */
export const ODDS_ALERT_AUDIENCE_ROWS = Object.freeze([
  { key: 'coffee_covers', label: 'Coffee & Covers' },
  { key: 'edge', label: '+EV Edge Alerts' },
  { key: 'line_movement', label: 'Line Movement' },
  { key: 'in_game_edge', label: 'In-Game Edge' },
  { key: 'period_report', label: 'Period / Halftime Report' },
])

export const DEFAULT_ODDS_ALERT_AUDIENCE = Object.freeze({
  coffee_covers: 'all',
  edge: 'subscribers',
  line_movement: 'subscribers',
  in_game_edge: 'subscribers',
  period_report: 'subscribers',
})

/** @param {string} tone */
export function botRunStateBadgeClass(tone) {
  if (tone === 'emerald') return 'bg-emerald-950/60 text-emerald-200 ring-emerald-500/40'
  if (tone === 'amber') return 'bg-amber-950/50 text-amber-100 ring-amber-500/35'
  return 'bg-zinc-800/80 text-zinc-300 ring-zinc-600/50'
}
