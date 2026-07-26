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

/** Scott Share alert types — per-type destination (lounge feed vs creator fan sub chat). */
export const ODDS_ALERT_AUDIENCE_ROWS = Object.freeze([
  { key: 'coffee_covers', label: 'Coffee & Covers' },
  { key: 'edge', label: '+EV Edge Alerts' },
  { key: 'line_movement', label: 'Line Movement (sharp / steam / RLM)' },
  { key: 'in_game_edge', label: 'In-Game Edge' },
  { key: 'period_report', label: 'Period / Halftime Report' },
  { key: 'best_bet_hour', label: 'Best Bet of the Hour' },
  { key: 'arb_watch', label: 'Arb Watch' },
  { key: 'sharp_report', label: "Sharpe's Sharp Report" },
  { key: 'value_bet_radar', label: 'Value Bet Radar' },
  { key: 'starter_spotlight', label: 'Starter Spotlight' },
  { key: 'confirmed_starters', label: 'Confirmed Starters' },
  { key: 'injury_impact', label: 'Injury Impact' },
  { key: 'rest_travel_edge', label: 'Rest + Travel Advantage' },
  { key: 'fade_the_public', label: 'Fade the Public' },
])

export const ODDS_ALERT_DESTINATION_OPTIONS = Object.freeze([
  { value: 'lounge', label: 'Everyone', title: 'Public lounge feed' },
  { value: 'sub_chat', label: 'Sub chat', title: 'Creator fan room only' },
  { value: 'sub_chat_10', label: 'Sub + 10%', title: 'Always sub chat; 10% chance also posts to lounge' },
  { value: 'sub_chat_30', label: 'Sub + 30%', title: 'Always sub chat; 30% chance also posts to lounge' },
])

/** @param {string | undefined | null} raw */
export function normalizeAlertDestinationValue(raw) {
  const val = String(raw || '').trim()
  if (val === 'all') return 'lounge'
  if (val === 'subscribers') return 'sub_chat'
  if (ODDS_ALERT_DESTINATION_OPTIONS.some((opt) => opt.value === val)) return val
  return null
}

/**
 * Portal "Run now" buttons — one invoke per alert type.
 * @type {ReadonlyArray<{ key: string, label: string, action: string, alertKind: string | null, force: boolean }>}
 */
export const ODDS_ALERT_INVOKE_ROWS = Object.freeze([
  { key: 'coffee_covers', label: 'Coffee & Covers', action: 'daily_slates', alertKind: null, force: true },
  { key: 'edge', label: '+EV Edge', action: 'poll_edges', alertKind: 'edge', force: true },
  { key: 'line_movement', label: 'Line Movement', action: 'poll_edges', alertKind: 'line_movement', force: true },
  { key: 'arb_watch', label: 'Arb Watch', action: 'poll_edges', alertKind: 'arb_watch', force: true },
  { key: 'sharp_report', label: 'Sharp Report', action: 'poll_edges', alertKind: 'sharp_report', force: true },
  { key: 'in_game_edge', label: 'In-Game Edge', action: 'poll_live', alertKind: 'in_game_edge', force: true },
  { key: 'period_report', label: 'Period Report', action: 'poll_live', alertKind: 'period_report', force: true },
  { key: 'best_bet_hour', label: 'Best Bet · Hour', action: 'best_bet_hour', alertKind: null, force: true },
  { key: 'value_bet_radar', label: 'Value Radar', action: 'value_bet_radar', alertKind: null, force: true },
  { key: 'starter_spotlight', label: 'Starter Spotlight', action: 'poll_edges', alertKind: 'starter_spotlight', force: true },
  { key: 'confirmed_starters', label: 'Confirmed Starters', action: 'poll_edges', alertKind: 'confirmed_starters', force: true },
  { key: 'injury_impact', label: 'Injury Impact', action: 'poll_edges', alertKind: 'injury_impact', force: true },
  { key: 'rest_travel_edge', label: 'Rest + Travel', action: 'poll_edges', alertKind: 'rest_travel_edge', force: true },
  { key: 'fade_the_public', label: 'Fade the Public', action: 'poll_edges', alertKind: 'fade_the_public', force: true },
])

export const DEFAULT_ODDS_ALERT_AUDIENCE = Object.freeze({
  coffee_covers: 'lounge',
  edge: 'sub_chat',
  line_movement: 'sub_chat',
  in_game_edge: 'sub_chat',
  period_report: 'sub_chat',
  best_bet_hour: 'sub_chat',
  arb_watch: 'sub_chat',
  sharp_report: 'sub_chat',
  value_bet_radar: 'lounge',
  starter_spotlight: 'sub_chat',
  confirmed_starters: 'sub_chat',
  injury_impact: 'sub_chat',
  rest_travel_edge: 'sub_chat',
  fade_the_public: 'sub_chat',
})

/** @param {string} tone */
export function botRunStateBadgeClass(tone) {
  if (tone === 'emerald') return 'bg-emerald-950/60 text-emerald-200 ring-emerald-500/40'
  if (tone === 'amber') return 'bg-amber-950/50 text-amber-100 ring-amber-500/35'
  return 'bg-zinc-800/80 text-zinc-300 ring-zinc-600/50'
}

/** Manual Fetch odds dropdown when no calendar boost rows today (auto-scan still runs). */
export const SCOTT_FALLBACK_SPORT_PICKS = Object.freeze([
  { slug: 'americanfootball-nfl', label_short: 'NFL', title: 'NFL', odds_sport_keys: ['americanfootball_nfl'] },
  { slug: 'basketball-nba', label_short: 'NBA', title: 'NBA', odds_sport_keys: ['basketball_nba'] },
  { slug: 'americanfootball-ncaaf', label_short: 'NCAAF', title: 'College Football', odds_sport_keys: ['americanfootball_ncaaf'] },
  { slug: 'baseball-mlb', label_short: 'MLB', title: 'MLB', odds_sport_keys: ['baseball_mlb'] },
  { slug: 'basketball-ncaab', label_short: 'NCAAB', title: 'College Basketball', odds_sport_keys: ['basketball_ncaab'] },
  { slug: 'mma-mixed-martial-arts', label_short: 'UFC', title: 'UFC / MMA', odds_sport_keys: ['mma_mixed_martial_arts'] },
  { slug: 'icehockey-nhl', label_short: 'NHL', title: 'NHL', odds_sport_keys: ['icehockey_nhl'] },
  { slug: 'soccer-epl', label_short: 'Premier League', title: 'Premier League', odds_sport_keys: ['soccer_epl'] },
  { slug: 'basketball-wnba', label_short: 'WNBA', title: 'WNBA', odds_sport_keys: ['basketball_wnba'] },
  { slug: 'boxing-boxing', label_short: 'Boxing', title: 'Boxing', odds_sport_keys: ['boxing_boxing'] },
])
