/**
 * Mon-Sun PT ops week on sharpesyndicate.com/ops.
 * Splits status stays on syndicate_betting_splits (shop week Tue).
 * Auto rows are cron/GHA reminders. Manual rows can be marked in for the week.
 */

import {
  evaluateSplitsDrops,
  ptClockParts,
  shopWeekTuesdayYmd,
  splitsCoverageOk,
  splitsDropAfterWindow,
} from './syndicateSplitsDropSchedule.js'

const PT = 'America/Los_Angeles'
const MARK_PREFIX = 'syndicate-ops-week-done:'
const SPORT_FILTER_KEY = 'syndicate-ops-week-sport'
const OPEN_PREF_KEY = 'syndicate-ops-week-cal-open'

export const OPS_WEEK_SPORTS = [
  { id: 'all', label: 'All' },
  { id: 'nfl', label: 'NFL' },
  { id: 'cfb', label: 'CFB' },
  { id: 'ufc', label: 'UFC' },
]

/**
 * @typedef {'shot' | 'auto' | 'check' | 'post'} OpsWeekKind
 * @typedef {'upcoming' | 'due' | 'done' | 'missed' | 'auto' | 'ran'} OpsWeekStatus
 */

/**
 * @type {Array<{
 *   id: string
 *   sports: Array<'nfl' | 'cfb' | 'ufc'>
 *   kind: OpsWeekKind
 *   label: string
 *   detail: string
 *   days: number[]
 *   startHour: number
 *   endHour: number
 *   tab: string
 *   splitsId?: string
 *   search?: string
 *   markable?: boolean
 *   atLabel?: string
 *   postKinds?: string[]
 *   pickMatch?: { sportIncludes?: string, marketKey?: string, primetime?: boolean, minCount?: number }
 *   feedNeedle?: string
 * }>}
 */
export const OPS_WEEK_TASKS = [
  {
    id: 'nfl_mnf',
    sports: ['nfl'],
    kind: 'post',
    label: 'MNF spotlight',
    atLabel: '3:30pm',
    detail: 'Mon 3:30pm PT. Public primetime lean + CTA if MNF is on.',
    days: [1],
    startHour: 15.5,
    endHour: 18,
    tab: 'scorecard',
    postKinds: ['nfl_primetime_spotlight'],
    pickMatch: { sportIncludes: 'nfl', primetime: true },
  },
  {
    id: 'nfl_grade',
    sports: ['nfl'],
    kind: 'check',
    label: 'Grade leftover',
    detail: 'Hit Grade Pending if Sunday auto-grade lagged.',
    days: [1],
    startHour: 0,
    endHour: 18,
    tab: 'scorecard',
    markable: true,
  },
  {
    id: 'cfb_grade_mon',
    sports: ['cfb'],
    kind: 'check',
    label: 'Grade leftover',
    detail: 'Hit Grade Pending if Saturday auto-grade lagged.',
    days: [1],
    startHour: 0,
    endHour: 18,
    tab: 'scorecard',
    markable: true,
  },
  {
    id: 'tue_sync',
    sports: ['nfl', 'cfb', 'ufc'],
    kind: 'auto',
    label: 'Metrics sync',
    detail: 'GHA 7am PT: NFL EPA, CFB power, UFC metrics, Sleeper PVALs.',
    days: [2],
    startHour: 7,
    endHour: 9,
    tab: 'trench_epa',
  },
  {
    id: 'weekly_recap',
    sports: ['nfl', 'cfb'],
    kind: 'post',
    label: 'Weekly recap',
    atLabel: '7:30am',
    detail: 'Tue 7:30am PT. Last week ATS / CLV ledger.',
    days: [2],
    startHour: 7.5,
    endHour: 9.5,
    tab: 'scorecard',
    postKinds: ['weekly_syndicate_recap'],
    feedNeedle: 'Weekly Ledger',
  },
  {
    id: 'nfl_seed',
    sports: ['nfl'],
    kind: 'shot',
    label: 'Seed shot',
    detail: 'Full NFL sides board. Action PRO or VSiN. Every remaining game.',
    days: [2, 3],
    startHour: 0,
    endHour: 24,
    tab: 'splits',
    splitsId: 'nfl_seed',
    search: 'Action Network PRO NFL betting splits',
  },
  {
    id: 'cfb_seed',
    sports: ['cfb'],
    kind: 'shot',
    label: 'Seed shot',
    detail: 'Full CFB sides board. Every remaining game.',
    days: [2, 3],
    startHour: 0,
    endHour: 24,
    tab: 'splits',
    splitsId: 'cfb_seed',
    search: 'Action Network PRO NCAA football betting splits',
  },
  {
    id: 'nfl_trench',
    sports: ['nfl'],
    kind: 'shot',
    label: 'ESPN trench',
    detail: 'If ESPN posted a new 2026 team win-rate table, paste it on NFL Trenches. Frozen 2025 stays until then.',
    days: [2, 3],
    startHour: 0,
    endHour: 24,
    tab: 'trench_epa',
    markable: true,
  },
  {
    id: 'nfl_pval_check',
    sports: ['nfl'],
    kind: 'check',
    label: 'PVAL check',
    detail: 'Spot-check Sleeper OUTs and overrides after the Tuesday refresh.',
    days: [2],
    startHour: 9,
    endHour: 18,
    tab: 'pvals',
    markable: true,
  },
  {
    id: 'cfb_power_check',
    sports: ['cfb'],
    kind: 'check',
    label: 'CFB board',
    detail: 'Confirm SP+ / FPI / Sagarin landed. Note if Sagarin is missing.',
    days: [2],
    startHour: 9,
    endHour: 18,
    tab: 'cfb_power',
    markable: true,
  },
  {
    id: 'ufc_metrics_check',
    sports: ['ufc'],
    kind: 'check',
    label: 'UFC metrics',
    detail: 'Confirm the Tuesday fighter-metrics refresh if a card is this week.',
    days: [2],
    startHour: 9,
    endHour: 18,
    tab: 'ufc_metrics',
    markable: true,
  },
  {
    id: 'cfb_wed_vip',
    sports: ['cfb'],
    kind: 'post',
    label: 'VIP midweek',
    atLabel: '2:00pm',
    detail: 'Wed 2:00pm PT. CFB Thu/Fri night VIP card.',
    days: [3],
    startHour: 14,
    endHour: 15.5,
    tab: 'scorecard',
    postKinds: ['cfb_wed_midweek_vip'],
  },
  {
    id: 'nfl_tnf_vip',
    sports: ['nfl'],
    kind: 'post',
    label: 'TNF VIP',
    atLabel: '11:00am',
    detail: 'Wed 11:00am PT. TNF VIP lean if Thursday night is on.',
    days: [3],
    startHour: 11,
    endHour: 13,
    tab: 'scorecard',
    postKinds: ['nfl_wed_tnf_vip'],
  },
  {
    id: 'cfb_movers',
    sports: ['cfb'],
    kind: 'shot',
    label: 'Movers shot',
    detail: 'Reshoot CFB sides before Friday lock. Movers only is fine.',
    days: [4, 5],
    startHour: 12,
    endHour: 14,
    tab: 'splits',
    splitsId: 'cfb_movers',
    search: 'Action Network PRO NCAA football betting splits',
  },
  {
    id: 'nfl_movers',
    sports: ['nfl'],
    kind: 'shot',
    label: 'Movers shot',
    detail: 'Reshoot NFL sides after TNF lock. Movers + leftover weekend games.',
    days: [4, 5],
    startHour: 18,
    endHour: 18,
    tab: 'splits',
    splitsId: 'nfl_movers',
    search: 'Action Network PRO NFL betting splits',
  },
  {
    id: 'cfb_thu_tease',
    sports: ['cfb'],
    kind: 'post',
    label: 'Night tease',
    atLabel: '3:30pm',
    detail: 'Thu 3:30pm PT. CFB Thursday night public tease + VIP deep.',
    days: [4],
    startHour: 15.5,
    endHour: 17,
    tab: 'scorecard',
    postKinds: ['cfb_thu_night_spotlight'],
  },
  {
    id: 'nfl_tnf_prime',
    sports: ['nfl'],
    kind: 'post',
    label: 'TNF public',
    atLabel: '3:30pm',
    detail: 'Thu 3:30pm PT. Public TNF lean + CTA if a game is on.',
    days: [4],
    startHour: 15.5,
    endHour: 18,
    tab: 'scorecard',
    postKinds: ['nfl_primetime_spotlight'],
    pickMatch: { sportIncludes: 'nfl', primetime: true },
  },
  {
    id: 'cfb_lock',
    sports: ['cfb'],
    kind: 'shot',
    label: 'Lock + totals',
    detail: 'Last CFB sides refresh + totals tab before Saturday kickoffs. Needed before Fri 12pm house lock.',
    days: [5, 6],
    startHour: 7,
    endHour: 14,
    tab: 'splits',
    splitsId: 'cfb_lock',
    search: 'Action Network PRO NCAA football totals splits',
  },
  {
    id: 'cfb_fri_house',
    sports: ['cfb'],
    kind: 'post',
    label: 'House lock',
    atLabel: '12:00pm',
    detail: 'Fri 12:00pm PT CFB house slate. Paste splits first.',
    days: [5],
    startHour: 12,
    endHour: 14,
    tab: 'scorecard',
    postKinds: ['cfb_slate_card', 'slate'],
    pickMatch: { sportIncludes: 'ncaaf', slate: true, minCount: 4 },
  },
  {
    id: 'nfl_fri_house',
    sports: ['nfl'],
    kind: 'post',
    label: 'House lock',
    atLabel: '1:00pm',
    detail: 'Fri 1:00pm PT NFL house slate. Paste splits first.',
    days: [5],
    startHour: 13,
    endHour: 15,
    tab: 'scorecard',
    postKinds: ['nfl_slate_card', 'slate'],
    pickMatch: { sportIncludes: 'nfl', slate: true, minCount: 4 },
  },
  {
    id: 'nfl_wong',
    sports: ['nfl'],
    kind: 'post',
    label: 'Wong teaser',
    atLabel: '1:30pm',
    detail: 'Fri 1:30pm PT. 6-point Wong teaser if a pair exists.',
    days: [5],
    startHour: 13.5,
    endHour: 15.5,
    tab: 'scorecard',
    postKinds: ['nfl_wong_teaser'],
    pickMatch: { sportIncludes: 'nfl', marketKey: 'teasers' },
  },
  {
    id: 'ufc_card',
    sports: ['ufc'],
    kind: 'check',
    label: 'UFC slate',
    detail: 'If a card is this week, Preview UFC before lock and paste any extra context.',
    days: [5, 6],
    startHour: 10,
    endHour: 18,
    tab: 'scorecard',
    markable: true,
  },
  {
    id: 'nfl_lock',
    sports: ['nfl'],
    kind: 'shot',
    label: 'Lock + totals',
    detail: 'Last NFL sides refresh, then the totals tab. Sat-Sun morning.',
    days: [6, 0],
    startHour: 7,
    endHour: 12,
    tab: 'splits',
    splitsId: 'nfl_lock',
    search: 'Action Network PRO NFL totals splits',
  },
  {
    id: 'sat_adds_cfb',
    sports: ['cfb'],
    kind: 'post',
    label: 'Adds / kills',
    atLabel: '10:00am',
    detail: 'Sat 10:00am PT. CFB VIP adds and kills if a lock flipped.',
    days: [6],
    startHour: 10,
    endHour: 12,
    tab: 'scorecard',
    postKinds: ['cfb_sat_vip_adds_kills'],
  },
  {
    id: 'sat_adds_nfl',
    sports: ['nfl'],
    kind: 'post',
    label: 'Adds / kills',
    atLabel: '10:00am',
    detail: 'Sat 10:00am PT. NFL VIP adds and kills if a lock flipped.',
    days: [6],
    startHour: 10,
    endHour: 12,
    tab: 'scorecard',
    postKinds: ['nfl_sat_vip_adds_kills'],
  },
  {
    id: 'cfb_grade_sun',
    sports: ['cfb'],
    kind: 'check',
    label: 'Grade games',
    detail: 'Auto-grade after kickoffs. Hit Grade Pending if anything stuck.',
    days: [0],
    startHour: 12,
    endHour: 22,
    tab: 'scorecard',
    markable: true,
  },
  {
    id: 'nfl_snf',
    sports: ['nfl'],
    kind: 'post',
    label: 'SNF spotlight',
    atLabel: '3:30pm',
    detail: 'Sun 3:30pm PT. Public primetime lean + CTA if SNF is on.',
    days: [0],
    startHour: 15.5,
    endHour: 18,
    tab: 'scorecard',
    postKinds: ['nfl_primetime_spotlight'],
    pickMatch: { sportIncludes: 'nfl', primetime: true },
  },
  {
    id: 'nfl_grade_sun',
    sports: ['nfl'],
    kind: 'check',
    label: 'Grade games',
    detail: 'Auto-grade after kickoffs. Hit Grade Pending if anything stuck.',
    days: [0],
    startHour: 17,
    endHour: 23,
    tab: 'scorecard',
    markable: true,
  },
]

function ptYmdStartMs(ymd) {
  for (const offset of ['-07:00', '-08:00']) {
    const ms = Date.parse(`${ymd}T00:00:00${offset}`)
    if (!Number.isFinite(ms)) continue
    const check = new Intl.DateTimeFormat('en-CA', {
      timeZone: PT,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date(ms))
    if (check === ymd) return ms
  }
  return Date.parse(`${ymd}T00:00:00-07:00`)
}

function formatPtYmd(ms) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: PT,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(ms))
}

export function weekMondayYmd(now = new Date()) {
  const clock = ptClockParts(now)
  const todayMs = ptYmdStartMs(clock.ymd)
  const daysFromMon = (clock.weekday + 6) % 7
  return formatPtYmd(todayMs - daysFromMon * 86_400_000)
}

export function addDaysYmd(ymd, days) {
  return formatPtYmd(ptYmdStartMs(ymd) + days * 86_400_000)
}

export function shopTuesdayYmdFromYmd(ymd) {
  const weekday = ptClockParts(new Date(`${ymd}T16:00:00-07:00`)).weekday
  const daysFromTue = (weekday + 5) % 7
  return addDaysYmd(ymd, -daysFromTue)
}

function inTaskClockWindow(task, clock) {
  if (!task.days.includes(clock.weekday)) return false
  const first = task.days[0]
  const last = task.days[task.days.length - 1]
  const hm = clock.hour + clock.minute / 60
  if (task.days.length === 1) {
    return hm >= task.startHour && hm < task.endHour
  }
  if (clock.weekday === first) return hm >= task.startHour
  if (clock.weekday === last) return hm < task.endHour
  return true
}

function afterTaskWindow(task, clock) {
  const last = task.days[task.days.length - 1]
  if (clock.weekday === last) {
    const hm = clock.hour + clock.minute / 60
    return hm >= task.endHour
  }
  if (last === 0) return clock.weekday === 1
  return clock.weekday > last && !(task.days.includes(0) && clock.weekday === 0)
}

function markKey(weekAnchorYmd, taskId) {
  return `${MARK_PREFIX}${weekAnchorYmd}:${taskId}`
}

export function isOpsWeekTaskMarked(weekAnchorYmd, taskId) {
  try {
    return localStorage.getItem(markKey(weekAnchorYmd, taskId)) === '1'
  } catch {
    return false
  }
}

export function setOpsWeekTaskMarked(weekAnchorYmd, taskId, on) {
  try {
    const key = markKey(weekAnchorYmd, taskId)
    if (on) localStorage.setItem(key, '1')
    else localStorage.removeItem(key)
  } catch {
    /* ignore */
  }
}

export function opsWeekSportFilter() {
  try {
    return localStorage.getItem(SPORT_FILTER_KEY) || 'all'
  } catch {
    return 'all'
  }
}

export function setOpsWeekSportFilter(sport) {
  try {
    localStorage.setItem(SPORT_FILTER_KEY, sport)
  } catch {
    /* ignore */
  }
}

export function opsWeekCalendarOpen() {
  try {
    return localStorage.getItem(OPEN_PREF_KEY) !== '0'
  } catch {
    return true
  }
}

export function setOpsWeekCalendarOpen(open) {
  try {
    localStorage.setItem(OPEN_PREF_KEY, open ? '1' : '0')
  } catch {
    /* ignore */
  }
}

export function emptyOpsWeekEvidence() {
  return { logs: [], picks: [], posts: [] }
}

function evidenceYmd(iso) {
  if (!iso) return ''
  const ms = Date.parse(String(iso))
  if (!Number.isFinite(ms)) return ''
  return ptClockParts(new Date(ms)).ymd
}

function pickMeta(row) {
  const meta = row?.metadata
  return meta && typeof meta === 'object' ? meta : {}
}

function pickMatches(task, row, dayYmd) {
  const match = task.pickMatch
  if (!match) return false
  if (evidenceYmd(row.created_at) !== dayYmd) return false
  const sport = String(row.sport_key || '').toLowerCase()
  if (match.sportIncludes && !sport.includes(match.sportIncludes)) return false
  if (match.marketKey && String(row.market_key || '') !== match.marketKey) return false
  const meta = pickMeta(row)
  if (match.primetime && !meta.is_primetime_spotlight) return false
  if (match.slate && !(meta.consensus_type || meta.bucket || meta.lane)) return false
  return true
}

/**
 * @param {typeof OPS_WEEK_TASKS[number]} task
 * @param {string} dayYmd
 * @param {{ logs?: object[], picks?: object[], posts?: object[] }} evidence
 */
export function findPostedEvidence(task, dayYmd, evidence = emptyOpsWeekEvidence()) {
  const kinds = task.postKinds || []
  const log = (evidence.logs || []).find((row) => {
    if (String(row.status || '') !== 'published') return false
    if (kinds.length && !kinds.includes(String(row.post_kind || ''))) return false
    return evidenceYmd(row.created_at) === dayYmd
  })
  if (log) return { posted: true, at: log.created_at, via: 'log' }

  const picks = (evidence.picks || []).filter((row) => pickMatches(task, row, dayYmd))
  const need = task.pickMatch?.minCount || 1
  if (task.pickMatch && picks.length >= need) {
    return { posted: true, at: picks[0].created_at, via: 'picks' }
  }

  const needle = String(task.feedNeedle || '').toLowerCase()
  if (needle) {
    const post = (evidence.posts || []).find((row) => {
      if (evidenceYmd(row.created_at) !== dayYmd) return false
      return String(row.body || '').toLowerCase().includes(needle)
    })
    if (post) return { posted: true, at: post.created_at, via: 'feed' }
  }

  const failed = (evidence.logs || []).find((row) => {
    if (String(row.status || '') !== 'failed') return false
    if (kinds.length && !kinds.includes(String(row.post_kind || ''))) return false
    return evidenceYmd(row.created_at) === dayYmd
  })
  if (failed) return { posted: false, failed: true, at: failed.created_at, via: 'log' }
  return { posted: false, failed: false, at: null, via: null }
}

/**
 * @param {typeof OPS_WEEK_TASKS[number]} task
 * @param {string} dayYmd
 * @param {object[]} rows
 * @param {Date} now
 * @param {{ logs?: object[], picks?: object[], posts?: object[] }} [evidence]
 */
export function evaluateOpsWeekTaskOnDay(task, dayYmd, rows, now = new Date(), evidence = emptyOpsWeekEvidence()) {
  const clock = ptClockParts(now)
  const shopTue = shopTuesdayYmdFromYmd(dayYmd)
  const marked = task.markable ? isOpsWeekTaskMarked(shopTue, task.id) : false

  if (task.kind === 'post') {
    const hit = findPostedEvidence(task, dayYmd, evidence)
    if (hit.posted) {
      return { ...task, status: 'done', dayYmd, shopTue, marked: false, postedAt: hit.at }
    }
    if (dayYmd > clock.ymd) {
      return { ...task, status: 'upcoming', dayYmd, shopTue, marked: false, postedAt: null }
    }
    if (dayYmd === clock.ymd) {
      if (inTaskClockWindow(task, clock)) {
        return { ...task, status: 'due', dayYmd, shopTue, marked: false, postedAt: null }
      }
      if (afterTaskWindow(task, clock) || hit.failed) {
        return { ...task, status: 'missed', dayYmd, shopTue, marked: false, postedAt: null }
      }
      return { ...task, status: 'upcoming', dayYmd, shopTue, marked: false, postedAt: null }
    }
    return { ...task, status: 'missed', dayYmd, shopTue, marked: false, postedAt: null }
  }

  if (task.splitsId) {
    const done = splitsCoverageOk(task.splitsId, rows, shopTue)
    if (done) {
      return { ...task, status: 'done', dayYmd, shopTue, marked: false }
    }
    if (dayYmd > clock.ymd) {
      return { ...task, status: 'upcoming', dayYmd, shopTue, marked: false }
    }
    if (dayYmd === clock.ymd) {
      const live = evaluateSplitsDrops(rows, now).find((d) => d.id === task.splitsId)
      return { ...task, status: live?.status || 'upcoming', dayYmd, shopTue, marked: false }
    }
    const sameShop = shopWeekTuesdayYmd(now) === shopTue
    if (sameShop && !splitsDropAfterWindow(task.splitsId, now)) {
      const live = evaluateSplitsDrops(rows, now).find((d) => d.id === task.splitsId)
      return { ...task, status: live?.status === 'due' ? 'due' : 'upcoming', dayYmd, shopTue, marked: false }
    }
    return { ...task, status: 'missed', dayYmd, shopTue, marked: false }
  }

  if (marked) {
    return { ...task, status: 'done', dayYmd, shopTue, marked: true }
  }

  if (task.kind === 'auto') {
    if (dayYmd > clock.ymd) {
      return { ...task, status: 'upcoming', dayYmd, shopTue, marked: false }
    }
    if (dayYmd === clock.ymd && inTaskClockWindow(task, clock)) {
      return { ...task, status: 'auto', dayYmd, shopTue, marked: false }
    }
    if (dayYmd < clock.ymd || afterTaskWindow(task, clock)) {
      return { ...task, status: 'ran', dayYmd, shopTue, marked: false }
    }
    return { ...task, status: 'upcoming', dayYmd, shopTue, marked: false }
  }

  if (dayYmd > clock.ymd) {
    return { ...task, status: 'upcoming', dayYmd, shopTue, marked: false }
  }
  if (dayYmd === clock.ymd) {
    if (inTaskClockWindow(task, clock)) {
      return { ...task, status: 'due', dayYmd, shopTue, marked: false }
    }
    if (afterTaskWindow(task, clock)) {
      return { ...task, status: 'missed', dayYmd, shopTue, marked: false }
    }
    return { ...task, status: 'upcoming', dayYmd, shopTue, marked: false }
  }
  const sameShop = shopWeekTuesdayYmd(now) === shopTue
  if (sameShop && !afterTaskWindow(task, clock)) {
    return { ...task, status: inTaskClockWindow(task, clock) ? 'due' : 'upcoming', dayYmd, shopTue, marked: false }
  }
  return { ...task, status: 'missed', dayYmd, shopTue, marked: false }
}

export function buildOpsWeek(rows, now = new Date(), evidence = emptyOpsWeekEvidence()) {
  const clock = ptClockParts(now)
  const mondayYmd = weekMondayYmd(now)
  const splitsLive = evaluateSplitsDrops(rows, now)
  const days = [0, 1, 2, 3, 4, 5, 6].map((i) => {
    const ymd = addDaysYmd(mondayYmd, i)
    const weekday = (1 + i) % 7
    const weekdayLabel = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][weekday]
    const tasks = OPS_WEEK_TASKS.filter((task) => task.days.includes(weekday)).map((task) =>
      evaluateOpsWeekTaskOnDay(task, ymd, rows, now, evidence),
    )
    return {
      ymd,
      weekday,
      weekdayLabel,
      isToday: ymd === clock.ymd,
      isPast: ymd < clock.ymd,
      tasks,
    }
  })

  const seen = new Set()
  const owed = []
  for (const day of days) {
    for (const task of day.tasks) {
      if (task.kind === 'auto') continue
      if (task.status !== 'due' && task.status !== 'missed') continue
      const key = `${task.id}:${task.shopTue}`
      if (seen.has(key)) continue
      seen.add(key)
      owed.push(task)
    }
  }
  for (const drop of splitsLive) {
    if (drop.status !== 'due' && drop.status !== 'missed') continue
    if (owed.some((t) => t.splitsId === drop.id)) continue
    const task = OPS_WEEK_TASKS.find((t) => t.splitsId === drop.id)
    if (!task) continue
    owed.push({
      ...task,
      status: drop.status,
      dayYmd: clock.ymd,
      shopTue: shopWeekTuesdayYmd(now),
      marked: false,
    })
  }

  return {
    clock,
    mondayYmd,
    sundayYmd: addDaysYmd(mondayYmd, 6),
    days,
    owed,
    dueCount: owed.filter((t) => t.status === 'due').length,
    missedCount: owed.filter((t) => t.status === 'missed').length,
    postedCount: days.reduce(
      (n, day) => n + day.tasks.filter((t) => t.kind === 'post' && t.status === 'done').length,
      0,
    ),
  }
}

export function taskMatchesSportFilter(task, sport) {
  if (sport === 'all') return true
  return task.sports.includes(sport)
}

export function opsWeekStatusLabel(status, kind) {
  if (status === 'due') return kind === 'post' ? 'Goes out' : 'Due'
  if (status === 'done') return kind === 'post' ? 'Posted' : 'In'
  if (status === 'missed') return kind === 'post' ? 'No post' : 'Missed'
  if (status === 'auto') return 'Runs now'
  if (status === 'ran') return 'Auto'
  return 'Later'
}

export function opsWeekStatusClass(status) {
  if (status === 'due') return 'bg-amber-500/20 text-amber-200 border-amber-500/40'
  if (status === 'done') return 'bg-emerald-500/20 text-emerald-200 border-emerald-500/35'
  if (status === 'missed') return 'bg-red-500/15 text-red-300 border-red-500/30'
  if (status === 'auto') return 'bg-sky-500/20 text-sky-200 border-sky-500/40'
  if (status === 'ran') return 'bg-sky-950/40 text-sky-300/80 border-sky-800/50'
  return 'bg-zinc-800 text-zinc-400 border-zinc-700'
}

export function sportChipClass(sport) {
  if (sport === 'nfl') return 'text-emerald-300'
  if (sport === 'cfb') return 'text-amber-300'
  if (sport === 'ufc') return 'text-rose-300'
  return 'text-zinc-400'
}

export function formatOpsWeekDayLabel(ymd) {
  const [year, month, day] = ymd.split('-')
  return `${Number(month)}/${Number(day)}`
}

export function formatOpsWeekRange(mondayYmd, sundayYmd) {
  return `${formatOpsWeekDayLabel(mondayYmd)}-${formatOpsWeekDayLabel(sundayYmd)}`
}

export function opsWeekQuerySinceIso(now = new Date()) {
  const monday = weekMondayYmd(now)
  const ms = ptYmdStartMs(monday)
  return new Date(ms).toISOString()
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient | null} supabaseClient
 * @param {string} botUserId
 * @param {Date} [now]
 */
export async function fetchOpsWeekEvidence(supabaseClient, botUserId, now = new Date()) {
  if (!supabaseClient || !botUserId) return emptyOpsWeekEvidence()
  const since = opsWeekQuerySinceIso(now)
  const [logsRes, picksRes, postsRes] = await Promise.all([
    supabaseClient
      .from('lounge_bot_publish_log')
      .select('post_kind,status,created_at,dedupe_key')
      .eq('bot_user_id', botUserId)
      .gte('created_at', since)
      .in('status', ['published', 'failed'])
      .order('created_at', { ascending: false })
      .limit(250),
    supabaseClient
      .from('lounge_bot_picks')
      .select('id,sport_key,market_key,created_at,metadata')
      .eq('bot_user_id', botUserId)
      .gte('created_at', since)
      .order('created_at', { ascending: false })
      .limit(400),
    supabaseClient
      .from('community_feed_posts')
      .select('id,body,created_at')
      .eq('user_id', botUserId)
      .gte('created_at', since)
      .order('created_at', { ascending: false })
      .limit(80),
  ])
  return {
    logs: logsRes.data || [],
    picks: picksRes.data || [],
    posts: postsRes.data || [],
  }
}
