/**
 * Weekly syndicate data pulls (Tuesday GHA 7:00am PT) + home-PC daily pulls.
 * Pass/fail uses job heartbeats when present, else last write on the dest table.
 */
import { ptClockParts, shopWeekTuesdayYmd } from './syndicateSplitsDropSchedule.js'

/** Must match scripts/lib/opsJobHeartbeat.mjs */
export const SYNDICATE_ACTION_SPLITS_SYNC_JOB_ID =
  'syndicate_action_public_betting_sync_production'
export const SYNDICATE_ESPN_TRENCH_SYNC_JOB_ID = 'syndicate_espn_nfl_trench_sync_production'

const PT_OFFSETS = ['-07:00', '-08:00']
const FRESH_SLACK_MS = 30 * 60 * 1000
const LAST_WEEK_OK_MS = 8 * 24 * 3600_000
/** GHA Tuesday cron is 7:00am PT but often starts late. Do not fail until noon PT. */
const GRACE_AFTER_DUE_MS = 5 * 60 * 60 * 1000

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

/** Home-PC twice daily (10am + 6pm local). Stale after ~26h. */
export const HOME_PC_PULL_SCHEDULE = 'daily 10am + 6pm PT'
const HOME_PC_STALE_MS = 26 * 3600_000

export const HOME_PC_PULLS = [
  {
    id: 'action_splits',
    jobId: SYNDICATE_ACTION_SPLITS_SYNC_JOB_ID,
    label: 'Action public betting',
    detail: 'Home-PC API pull → syndicate_betting_splits (action_pro). Ops paste stays for VSiN.',
    tab: 'splits',
    sports: 'NFL+CFB',
    table: 'syndicate_betting_splits',
    timeCol: 'updated_at',
    sourceEq: 'action_pro',
  },
  {
    id: 'espn_trench',
    jobId: SYNDICATE_ESPN_TRENCH_SYNC_JOB_ID,
    label: 'ESPN trench',
    detail: 'Home-PC ESPN content feed → PBWR/PRWR/RBWR/RSWR. Vision paste stays as backup.',
    tab: 'trench_epa',
    sports: 'NFL',
    table: 'nfl_team_metrics',
    timeCol: 'updated_at',
    skipOverrides: true,
  },
]

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
  const inGrace = afterDue && nowMs < dueMs + GRACE_AFTER_DUE_MS
  if (!afterDue && !hasOk) return 'waiting'
  if (inGrace && !failIsLatest) return 'waiting'
  if (afterDue && !hasOk) return 'fail'
  if (afterDue && hasOk && okMs < dueMs - FRESH_SLACK_MS) return 'fail'
  return 'stale'
}

/** Home-PC twice-daily jobs: fail if latest heartbeat failed; stale if last ok >26h. */
export function resolveHomePcPullStatus({ lastOkAt, lastFailAt, lastStatus, now = new Date() }) {
  const nowMs = now.getTime()
  const okMs = lastOkAt ? Date.parse(lastOkAt) : NaN
  const failMs = lastFailAt ? Date.parse(lastFailAt) : NaN
  const hasOk = Number.isFinite(okMs)
  const hasFail = Number.isFinite(failMs)
  const failIsLatest = hasFail && (!hasOk || failMs >= okMs) && lastStatus === 'failed'

  if (failIsLatest) return 'fail'
  if (hasOk && nowMs - okMs <= HOME_PC_STALE_MS) return 'pass'
  if (hasOk) return 'stale'
  return 'waiting'
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
