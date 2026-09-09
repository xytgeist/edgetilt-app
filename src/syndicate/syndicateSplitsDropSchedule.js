/**
 * One Action / VSiN screenshot habit for Chedda + Tank.
 * Same syndicate_betting_splits rows. Chedda fires on ticket/handle dogs.
 * Tank only confirms. Totals tab feeds Tank's Over/Under.
 */

const PT = 'America/Los_Angeles'
const WEEKDAY = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }
const NOTIFY_PREF_KEY = 'syndicate-splits-desk-notify'
const NAG_PREFIX = 'syndicate-splits-desk-nagged:'

export const SPLITS_DROP_SPORTS = {
  nfl: 'americanfootball_nfl',
  cfb: 'americanfootball_ncaaf',
}

/** @typedef {'upcoming' | 'due' | 'done' | 'missed'} SplitsDropStatus */

/**
 * @type {Array<{
 *   id: string
 *   sport: 'nfl' | 'cfb'
 *   label: string
 *   search: string
 *   shot: string
 *   days: number[]
 *   startHour: number
 *   endHour: number
 *   needsTotals?: boolean
 *   refreshAfter?: { weekday: number, hour: number }
 * }>}
 */
export const SPLITS_DROPS = [
  {
    id: 'nfl_seed',
    sport: 'nfl',
    label: 'NFL seed',
    search: 'Action Network PRO NFL betting splits',
    shot: 'Full NFL sides board (Action PRO or VSiN). Every remaining game.',
    days: [2, 3],
    startHour: 0,
    endHour: 24,
  },
  {
    id: 'cfb_seed',
    sport: 'cfb',
    label: 'CFB seed',
    search: 'Action Network PRO NCAA football betting splits',
    shot: 'Full CFB sides board. Every remaining game.',
    days: [2, 3],
    startHour: 0,
    endHour: 24,
  },
  {
    id: 'nfl_movers',
    sport: 'nfl',
    label: 'NFL movers',
    search: 'Action Network PRO NFL betting splits',
    shot: 'Reshoot NFL sides after TNF lock. Movers + leftover weekend games.',
    days: [4, 5],
    startHour: 18,
    endHour: 18,
    refreshAfter: { weekday: 4, hour: 18 },
  },
  {
    id: 'cfb_movers',
    sport: 'cfb',
    label: 'CFB movers',
    search: 'Action Network PRO NCAA football betting splits',
    shot: 'Reshoot CFB sides before Friday lock. Movers only is fine.',
    days: [4, 5],
    startHour: 12,
    endHour: 14,
    refreshAfter: { weekday: 4, hour: 12 },
  },
  {
    id: 'nfl_lock',
    sport: 'nfl',
    label: 'NFL lock + totals',
    search: 'Action Network PRO NFL totals splits',
    shot: 'Last NFL sides refresh, then the totals tab (Over/Under handle).',
    days: [6, 0],
    startHour: 7,
    endHour: 12,
    needsTotals: true,
    refreshAfter: { weekday: 6, hour: 7 },
  },
  {
    id: 'cfb_lock',
    sport: 'cfb',
    label: 'CFB lock + totals',
    search: 'Action Network PRO NCAA football totals splits',
    shot: 'Last CFB sides refresh + totals tab before Saturday kickoffs.',
    days: [5, 6],
    startHour: 7,
    endHour: 14,
    needsTotals: true,
    refreshAfter: { weekday: 5, hour: 7 },
  },
]

export function ptClockParts(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: PT,
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now)
  const get = (type) => parts.find((p) => p.type === type)?.value || ''
  const weekday = WEEKDAY[get('weekday')]
  return {
    weekday: weekday == null ? now.getDay() : weekday,
    hour: Number(get('hour')),
    minute: Number(get('minute')),
    ymd: `${get('year')}-${get('month')}-${get('day')}`,
    weekdayLabel: get('weekday'),
  }
}

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

/** Shop week starts Tuesday 00:00 PT. */
export function shopWeekTuesdayYmd(now = new Date()) {
  const clock = ptClockParts(now)
  const todayMs = ptYmdStartMs(clock.ymd)
  const daysFromTue = (clock.weekday + 5) % 7
  const tueMs = todayMs - daysFromTue * 86_400_000
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: PT,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(tueMs))
}

function inDropCalendarDay(drop, weekday) {
  return drop.days.includes(weekday)
}

/**
 * Thu movers is Thu 18:00-24:00 then Fri 00:00-18:00.
 * Other multi-day drops use startHour on the first day and endHour on the last.
 */
function inDropClockWindow(drop, clock) {
  if (!inDropCalendarDay(drop, clock.weekday)) return false
  const first = drop.days[0]
  const last = drop.days[drop.days.length - 1]
  const hm = clock.hour + clock.minute / 60
  if (drop.days.length === 1) {
    return hm >= drop.startHour && hm < drop.endHour
  }
  if (clock.weekday === first) return hm >= drop.startHour
  if (clock.weekday === last) return hm < drop.endHour
  return true
}

function afterDropWindow(drop, clock) {
  const last = drop.days[drop.days.length - 1]
  if (clock.weekday === last) {
    const hm = clock.hour + clock.minute / 60
    return hm >= drop.endHour
  }
  if (last === 0) return clock.weekday === 1
  return clock.weekday > last && !(drop.days.includes(0) && clock.weekday === 0)
}

function sportKeyFor(sport) {
  return SPLITS_DROP_SPORTS[sport]
}

function rowSportMatches(row, sport) {
  return String(row?.sport_key || '') === sportKeyFor(sport)
}

function rowHasSides(row) {
  return row?.home_ticket_pct != null && row?.home_handle_pct != null
}

function rowHasTotals(row) {
  return row?.over_ticket_pct != null && row?.over_handle_pct != null
}

function coverageRows(rows, sport, weekTueMs) {
  return (rows || []).filter((row) => {
    if (!rowSportMatches(row, sport)) return false
    if (row.active === false) return false
    const updated = Date.parse(String(row.updated_at || row.created_at || ''))
    if (!Number.isFinite(updated)) return false
    return updated >= weekTueMs
  })
}

function refreshAfterMs(drop, weekTueYmd) {
  if (!drop.refreshAfter) return null
  const tueMs = ptYmdStartMs(weekTueYmd)
  const delta = (drop.refreshAfter.weekday + 5) % 7
  return tueMs + delta * 86_400_000 + drop.refreshAfter.hour * 3_600_000
}

function coverageOk(drop, rows, weekTueYmd) {
  const weekTueMs = ptYmdStartMs(weekTueYmd)
  const sportRows = coverageRows(rows, drop.sport, weekTueMs)
  if (!sportRows.some(rowHasSides)) return false
  if (drop.needsTotals && !sportRows.some(rowHasTotals)) return false
  const after = refreshAfterMs(drop, weekTueYmd)
  if (after != null) {
    const latest = Math.max(
      ...sportRows.map((row) => Date.parse(String(row.updated_at || row.created_at || '')) || 0),
    )
    if (latest < after) return false
  }
  return true
}

export function evaluateSplitsDrops(rows, now = new Date()) {
  const clock = ptClockParts(now)
  const weekTueYmd = shopWeekTuesdayYmd(now)
  return SPLITS_DROPS.map((drop) => {
    const done = coverageOk(drop, rows, weekTueYmd)
    const today = inDropCalendarDay(drop, clock.weekday)
    const live = inDropClockWindow(drop, clock)
    let status = 'upcoming'
    if (done) status = 'done'
    else if (live) status = 'due'
    else if (today && !live && clock.hour + clock.minute / 60 < drop.startHour) status = 'upcoming'
    else if (afterDropWindow(drop, clock)) status = 'missed'
    return {
      ...drop,
      status,
      today,
      live,
    }
  })
}

export function dueSplitsDrops(rows, now = new Date()) {
  return evaluateSplitsDrops(rows, now).filter((d) => d.status === 'due')
}

export function splitsNotifyEnabled() {
  try {
    return localStorage.getItem(NOTIFY_PREF_KEY) === '1'
  } catch {
    return false
  }
}

export function setSplitsNotifyEnabled(on) {
  try {
    localStorage.setItem(NOTIFY_PREF_KEY, on ? '1' : '0')
  } catch {
    /* ignore */
  }
}

function nagKey(ymd, dropId) {
  return `${NAG_PREFIX}${ymd}:${dropId}`
}

export function maybeFireSplitsDesktopNags(dueDrops, now = new Date()) {
  if (typeof Notification === 'undefined') return
  if (Notification.permission !== 'granted') return
  if (!splitsNotifyEnabled()) return
  const ymd = ptClockParts(now).ymd
  for (const drop of dueDrops) {
    const key = nagKey(ymd, drop.id)
    try {
      if (localStorage.getItem(key) === '1') continue
      localStorage.setItem(key, '1')
    } catch {
      continue
    }
    try {
      new Notification('Drop screenshots today', {
        body: `${drop.shot} Search: ${drop.search}`,
        tag: `splits-${drop.id}`,
      })
    } catch {
      /* ignore */
    }
  }
}

export function statusLabel(status) {
  if (status === 'due') return 'Due today'
  if (status === 'done') return 'In'
  if (status === 'missed') return 'Missed'
  return 'Upcoming'
}

export function statusClass(status) {
  if (status === 'due') return 'bg-amber-500/20 text-amber-200 border-amber-500/40'
  if (status === 'done') return 'bg-emerald-500/20 text-emerald-200 border-emerald-500/35'
  if (status === 'missed') return 'bg-red-500/15 text-red-300 border-red-500/30'
  return 'bg-zinc-800 text-zinc-400 border-zinc-700'
}
