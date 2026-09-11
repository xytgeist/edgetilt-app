/**
 * Weekly syndicate data pulls (Tuesday GHA 7:00am PT).
 * Pass/fail uses job heartbeats when present, else last write on the dest table.
 */
import { ptClockParts, shopWeekTuesdayYmd } from './syndicateSplitsDropSchedule.js'

const PT_OFFSETS = ['-07:00', '-08:00']
const FRESH_SLACK_MS = 30 * 60 * 1000
const LAST_WEEK_OK_MS = 8 * 24 * 3600_000

export const WEEKLY_PULL_SCHEDULE = 'Tue 7:00am PT'

export const WEEKLY_PULLS = [
  {
    id: 'nfl_epa',
    jobId: 'syndicate_weekly_nfl_epa',
    label: 'NFL EPA',
    detail: 'nflverse play-by-play → nfl_team_metrics (skips trench overrides).',
    tab: 'trench_epa',
    sports: 'NFL',
    table: 'nfl_team_metrics',
    timeCol: 'updated_at',
    skipOverrides: true,
  },
  {
    id: 'cfb_power',
    jobId: 'syndicate_weekly_cfb_power',
    label: 'CFB power',
    detail: 'CFBD games → owned Elo/SRS → cfb_team_power_ratings.',
    tab: 'cfb_power',
    sports: 'CFB',
    table: 'cfb_team_power_ratings',
    timeCol: 'updated_at',
    skipOverrides: true,
  },
  {
    id: 'ufc_metrics',
    jobId: 'syndicate_weekly_ufc_metrics',
    label: 'UFC metrics',
    detail: 'UFC Stats fighter page + upcoming/recent card names.',
    tab: 'ufc_metrics',
    sports: 'UFC',
    table: 'ufc_fighter_metrics',
    timeCol: 'source_synced_at',
    fallbackTimeCol: 'updated_at',
    skipOverrides: true,
  },
  {
    id: 'pval_sleeper',
    jobId: 'syndicate_weekly_pval_sleeper',
    label: 'Sleeper PVAL',
    detail: 'Depth band + fantasy seat. Skips curated overrides.',
    tab: 'pvals',
    sports: 'NFL',
    table: 'nfl_player_pvals',
    timeCol: 'last_synced_at',
    notesLike: 'sleeper v1%',
    notesNotIlike: '%twodeep fill%',
  },
  {
    id: 'pval_twodeep',
    jobId: 'syndicate_weekly_pval_twodeep',
    label: 'TWO·DEEP hole-fill',
    detail: 'Polite NFL depth scrape. OL seats + missing starters only.',
    tab: 'pvals',
    sports: 'NFL',
    table: 'nfl_player_pvals',
    timeCol: 'last_synced_at',
    notesIlike: '%twodeep fill%',
  },
]

export const WEEKLY_PULL_ROLLUP = {
  id: 'metrics_sync',
  jobId: 'syndicate_football_metrics_sync_production',
  label: 'Tuesday metrics sync',
  detail: 'Whole GHA job (EPA + CFB + UFC + Sleeper + Two Deep).',
  tab: 'pulls',
  sports: 'All',
}

function ptWallMs(ymd, hour, minute = 0) {
  const hh = String(hour).padStart(2, '0')
  const mm = String(minute).padStart(2, '0')
  for (const offset of PT_OFFSETS) {
    const ms = Date.parse(`${ymd}T${hh}:${mm}:00${offset}`)
    if (!Number.isFinite(ms)) continue
    const clock = ptClockParts(new Date(ms))
    if (clock.ymd === ymd && clock.hour === hour && clock.minute === minute) return ms
  }
  return Date.parse(`${ymd}T${hh}:${mm}:00-07:00`)
}

export function thisWeekPullDueMs(now = new Date()) {
  return ptWallMs(shopWeekTuesdayYmd(now), 7, 0)
}

export function resolveWeeklyPullStatus({ lastOkAt, lastFailAt, lastStatus, now = new Date() }) {
  const dueMs = thisWeekPullDueMs(now)
  const nowMs = now.getTime()
  const afterDue = nowMs >= dueMs
  const okMs = lastOkAt ? Date.parse(lastOkAt) : NaN
  const failMs = lastFailAt ? Date.parse(lastFailAt) : NaN
  const hasOk = Number.isFinite(okMs)
  const hasFail = Number.isFinite(failMs)
  const failIsLatest = hasFail && (!hasOk || failMs >= okMs) && lastStatus === 'failed'

  if (failIsLatest && afterDue) return 'fail'
  if (hasOk && okMs >= dueMs - FRESH_SLACK_MS) return 'pass'
  if (!afterDue && hasOk && nowMs - okMs < LAST_WEEK_OK_MS) return 'pass'
  if (!afterDue && !hasOk) return 'waiting'
  if (afterDue && !hasOk) return 'fail'
  if (afterDue && hasOk && okMs < dueMs - FRESH_SLACK_MS) return 'fail'
  return 'stale'
}

export function formatPullWhen(iso) {
  if (!iso) return 'Never'
  const ms = Date.parse(iso)
  if (!Number.isFinite(ms)) return 'Never'
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Los_Angeles',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(ms))
}

export function pullStatusLabel(status) {
  if (status === 'pass') return 'Pass'
  if (status === 'fail') return 'Fail'
  if (status === 'waiting') return 'Waiting'
  return 'Stale'
}
