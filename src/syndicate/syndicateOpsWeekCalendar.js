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
 * @typedef {'shot' | 'auto' | 'check'} OpsWeekKind
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
 * }>}
 */
export const OPS_WEEK_TASKS = [
  {
    id: 'nfl_mnf',
    sports: ['nfl'],
    kind: 'auto',
    label: 'MNF spotlight',
    detail: 'Cron posts the Monday night lean if a game is on.',
    days: [1],
    startHour: 17,
    endHour: 21,
    tab: 'scorecard',
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
    kind: 'auto',
    label: 'VIP midweek',
    detail: 'Wed 2pm PT. CFB Thu/Fri night VIP card.',
    days: [3],
    startHour: 14,
    endHour: 15,
    tab: 'scorecard',
  },
  {
    id: 'nfl_tnf_vip',
    sports: ['nfl'],
    kind: 'auto',
    label: 'TNF VIP',
    detail: 'Wednesday TNF VIP card if Thursday night is on.',
    days: [3],
    startHour: 12,
    endHour: 20,
    tab: 'scorecard',
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
    kind: 'auto',
    label: 'Night tease',
    detail: 'Thu 3:30pm PT CFB night spotlight.',
    days: [4],
    startHour: 15.5,
    endHour: 16.5,
    tab: 'scorecard',
  },
  {
    id: 'nfl_tnf_prime',
    sports: ['nfl'],
    kind: 'auto',
    label: 'TNF public',
    detail: 'Thursday night public lean + CTA if a game is on.',
    days: [4],
    startHour: 16,
    endHour: 20,
    tab: 'scorecard',
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
    kind: 'auto',
    label: 'House lock',
    detail: 'Fri 12pm PT CFB house slate. Paste splits first.',
    days: [5],
    startHour: 12,
    endHour: 13,
    tab: 'scorecard',
  },
  {
    id: 'nfl_fri_house',
    sports: ['nfl'],
    kind: 'auto',
    label: 'House lock',
    detail: 'Fri 1pm PT NFL house slate. Paste splits first.',
    days: [5],
    startHour: 13,
    endHour: 14,
    tab: 'scorecard',
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
    kind: 'auto',
    label: 'Adds / kills',
    detail: 'Sat 10am PT CFB VIP adds and kills.',
    days: [6],
    startHour: 10,
    endHour: 11,
    tab: 'scorecard',
  },
  {
    id: 'sat_adds_nfl',
    sports: ['nfl'],
    kind: 'auto',
    label: 'Adds / kills',
    detail: 'Sat 10am PT NFL VIP adds and kills.',
    days: [6],
    startHour: 10,
    endHour: 11,
    tab: 'scorecard',
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
    kind: 'auto',
    label: 'SNF spotlight',
    detail: 'Cron posts the Sunday night lean if a game is on.',
    days: [0],
    startHour: 16,
    endHour: 21,
    tab: 'scorecard',
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

function markAnchorYmd(task, dayYmd) {
  return shopTuesdayYmdFromYmd(dayYmd)
}

/**
 * @param {typeof OPS_WEEK_TASKS[number]} task
 * @param {string} dayYmd
 * @param {object[]} rows
 * @param {Date} now
 */
export function evaluateOpsWeekTaskOnDay(task, dayYmd, rows, now = new Date()) {
  const clock = ptClockParts(now)
  const shopTue = shopTuesdayYmdFromYmd(dayYmd)
  const marked = task.markable ? isOpsWeekTaskMarked(shopTue, task.id) : false

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

export function buildOpsWeek(rows, now = new Date()) {
  const clock = ptClockParts(now)
  const mondayYmd = weekMondayYmd(now)
  const splitsLive = evaluateSplitsDrops(rows, now)
  const days = [0, 1, 2, 3, 4, 5, 6].map((i) => {
    const ymd = addDaysYmd(mondayYmd, i)
    const weekday = (1 + i) % 7
    const weekdayLabel = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][weekday]
    const tasks = OPS_WEEK_TASKS.filter((task) => task.days.includes(weekday)).map((task) =>
      evaluateOpsWeekTaskOnDay(task, ymd, rows, now),
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
  }
}

export function taskMatchesSportFilter(task, sport) {
  if (sport === 'all') return true
  return task.sports.includes(sport)
}

export function opsWeekStatusLabel(status) {
  if (status === 'due') return 'Due'
  if (status === 'done') return 'In'
  if (status === 'missed') return 'Missed'
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
