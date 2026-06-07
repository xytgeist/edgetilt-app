/** US equity regular session (Mon–Fri 9:30–16:00 ET). Holidays deferred — see backlog. */

const ET = 'America/New_York'

type EtParts = {
  year: number
  month: number
  day: number
  weekday: number
  hour: number
  minute: number
}

function etParts(d: Date): EtParts {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: ET,
    weekday: 'short',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
  const map: Record<string, string> = {}
  for (const p of fmt.formatToParts(d)) {
    if (p.type !== 'literal') map[p.type] = p.value
  }
  const weekdayMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }
  return {
    year: Number(map.year),
    month: Number(map.month),
    day: Number(map.day),
    weekday: weekdayMap[String(map.weekday)] ?? 0,
    hour: Number(map.hour),
    minute: Number(map.minute),
  }
}

function etDateUtcMs(year: number, month: number, day: number, hour = 0, minute = 0): number {
  /** Walk UTC noon and adjust — stable for US session boundaries. */
  let guess = Date.UTC(year, month - 1, day, hour + 5, minute, 0)
  for (let i = 0; i < 3; i += 1) {
    const p = etParts(new Date(guess))
    const targetMin = hour * 60 + minute
    const actualMin = p.hour * 60 + p.minute
    guess += (targetMin - actualMin) * 60_000
  }
  return guess
}

function addCalendarDays(year: number, month: number, day: number, delta: number) {
  const d = new Date(Date.UTC(year, month - 1, day + delta, 12, 0, 0))
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() }
}

function previousTradingDay(parts: EtParts) {
  let { year, month, day } = parts
  let guard = 0
  while (guard < 10) {
    const prev = addCalendarDays(year, month, day, -1)
    year = prev.year
    month = prev.month
    day = prev.day
    const wd = etParts(new Date(Date.UTC(year, month - 1, day, 12, 0, 0))).weekday
    if (wd >= 1 && wd <= 5) return { year, month, day, weekday: wd }
    guard += 1
  }
  return parts
}

/** Mon–Fri 9:30–16:00 ET (no holiday calendar yet). */
export function isUsEquityRegularSessionOpen(now = new Date()): boolean {
  const p = etParts(now)
  if (p.weekday < 1 || p.weekday > 5) return false
  const mins = p.hour * 60 + p.minute
  return mins >= 9 * 60 + 30 && mins < 16 * 60
}

/** Regular trading hours for a calendar day in ET. */
export function regularSessionBoundsForDay(year: number, month: number, day: number) {
  const fromSec = Math.floor(etDateUtcMs(year, month, day, 9, 30) / 1000)
  const toSec = Math.floor(etDateUtcMs(year, month, day, 16, 0) / 1000)
  return { fromSec, toSec }
}

/**
 * Last regular session to chart when rolling 1D / feed minis on closed markets.
 * During RTH → today 9:30 → now. After close / weekends → last completed session.
 */
export function lastRegularSessionBounds(now = new Date()): {
  fromSec: number
  toSec: number
  year: number
  month: number
  day: number
} {
  const p = etParts(now)
  const mins = p.hour * 60 + p.minute

  if (p.weekday >= 1 && p.weekday <= 5 && mins >= 9 * 60 + 30 && mins < 16 * 60) {
    const fromSec = Math.floor(etDateUtcMs(p.year, p.month, p.day, 9, 30) / 1000)
    const toSec = Math.floor(now.getTime() / 1000)
    return { fromSec, toSec, year: p.year, month: p.month, day: p.day }
  }

  let target = p
  if (p.weekday === 0 || p.weekday === 6) {
    target = previousTradingDay(p)
  } else if (mins < 9 * 60 + 30) {
    target = previousTradingDay(p)
  }

  const bounds = regularSessionBoundsForDay(target.year, target.month, target.day)
  return { ...bounds, year: target.year, month: target.month, day: target.day }
}

/** Mini/modal label when market is closed — e.g. `Fri` or `Jun 6`. */
export function lastRegularSessionLabel(now = new Date()): string {
  const { year, month, day } = lastRegularSessionBounds(now)
  const d = new Date(Date.UTC(year, month - 1, day, 12, 0, 0))
  const weekday = etParts(d).weekday
  if (weekday === 5) return 'Fri'
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })
}

/** Longer cache TTL for stock rolling quotes when RTH is closed. */
export const STOCK_ROLLING_CLOSED_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000
