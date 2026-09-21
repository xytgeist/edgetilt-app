/** Keep in sync with `supabase/functions/_shared/loungeSportsScoreboard.ts` slate window. */

const PT = 'America/Los_Angeles'
const WEEKDAY = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }

function ptYmd(ms) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: PT,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(ms))
}

function ptWeekdaySun0(ms) {
  const wd = new Intl.DateTimeFormat('en-US', { timeZone: PT, weekday: 'short' }).format(new Date(ms))
  return WEEKDAY[wd] ?? 0
}

function addDaysYmd(ymd, days) {
  const [y, m, d] = String(ymd).split('-').map(Number)
  return ptYmd(Date.UTC(y, m - 1, d, 20, 0, 0) + days * 86_400_000)
}

export function ptDateFromIsoLocal(iso) {
  const t = Date.parse(iso)
  return Number.isFinite(t) ? ptYmd(t) : ''
}

/** Yesterday + today PT. Non-NFL sports. */
export function otherSportSlateDates(now = Date.now()) {
  const today = ptYmd(now)
  const yest = ptYmd(now - 36 * 3600 * 1000)
  return yest === today ? [today] : [yest, today]
}

/**
 * NFL conversation week: Thursday through Monday.
 * Rolls to next week at Tuesday 00:00 PT (after MNF).
 */
export function nflSlatePtDates(now = Date.now()) {
  const today = ptYmd(now)
  const dow = ptWeekdaySun0(now)
  const rolled = dow === 2 || dow === 3
  const thursday = rolled
    ? addDaysYmd(today, dow === 2 ? 2 : 1)
    : addDaysYmd(today, -((dow - 4 + 7) % 7))
  return [0, 1, 2, 3, 4].map((i) => addDaysYmd(thursday, i))
}

export function isLoungeSportsCurrentSlateGame(game, now = Date.now()) {
  if (!game) return false
  if (game.status === 'in') return true
  const day = ptDateFromIsoLocal(game.commence_time)
  if (!day) return false
  const dates = String(game.sport_key || '').includes('nfl') ? nflSlatePtDates(now) : otherSportSlateDates(now)
  return dates.includes(day)
}
