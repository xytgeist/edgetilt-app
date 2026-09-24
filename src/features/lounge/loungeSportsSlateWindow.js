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

export function otherSportSlateDates(now = Date.now()) {
  const today = ptYmd(now)
  const yest = ptYmd(now - 36 * 3600 * 1000)
  return yest === today ? [today] : [yest, today]
}

/** Thursday that starts the calendar NFL week. Tue/Wed roll forward to the next Thursday. */
export function nflCalendarThursdayYmd(now = Date.now()) {
  const today = ptYmd(now)
  const dow = ptWeekdaySun0(now)
  if (dow === 2 || dow === 3) return addDaysYmd(today, dow === 2 ? 2 : 1)
  return addDaysYmd(today, -((dow - 4 + 7) % 7))
}

export function nflWeekDatesFromThursday(thursdayYmd) {
  return [0, 1, 2, 3, 4].map((i) => addDaysYmd(thursdayYmd, i))
}

/** This calendar week plus the adjacent week (recaps + upcoming). */
export function nflFetchDates(now = Date.now()) {
  const primary = nflCalendarThursdayYmd(now)
  const dow = ptWeekdaySun0(now)
  const secondary = addDaysYmd(primary, dow === 2 || dow === 3 ? -7 : 7)
  return [...new Set([...nflWeekDatesFromThursday(primary), ...nflWeekDatesFromThursday(secondary)])].sort()
}

function isNflGame(game) {
  return String(game?.sport_key || '').includes('nfl')
}

function commenceMs(game) {
  const t = Date.parse(game?.commence_time || '')
  return Number.isFinite(t) ? t : 0
}

export { commenceMs as loungeSportsCommenceMs }

const MS_48H = 48 * 3600 * 1000

function gameDay(game) {
  return ptDateFromIsoLocal(game?.commence_time)
}

export function nflGamesOnDates(games, dates) {
  const set = new Set(dates)
  return (Array.isArray(games) ? games : []).filter((g) => isNflGame(g) && set.has(gameDay(g)))
}

/**
 * True once this week's closer is final: Monday games if any, else the last game of the week.
 * Live games always keep the week open.
 */
export function nflMnfWeekComplete(games, weekDates, now = Date.now()) {
  const week = nflGamesOnDates(games, weekDates)
  if (week.some((g) => g.status === 'in')) return false
  const monday = weekDates[4]
  const mondayGames = week.filter((g) => gameDay(g) === monday)
  if (mondayGames.length) return mondayGames.every((g) => g.status === 'post')
  if (!week.length) return ptWeekdaySun0(now) === 1 || ptWeekdaySun0(now) === 2 || ptWeekdaySun0(now) === 3
  const last = [...week].sort((a, b) => commenceMs(b) - commenceMs(a))[0]
  return last?.status === 'post'
}

/** Hub list: this week until MNF is final, then the upcoming week. */
export function nflHubDates(games, now = Date.now()) {
  const calThu = nflCalendarThursdayYmd(now)
  const calDates = nflWeekDatesFromThursday(calThu)
  if (!nflMnfWeekComplete(games, calDates, now)) return calDates
  return nflWeekDatesFromThursday(addDaysYmd(calThu, 7))
}

export function loungeSportsHubGames(games, sportKey, now = Date.now()) {
  const list = Array.isArray(games) ? games : []
  const sport = String(sportKey || '')
  const same = list.filter((g) => !sport || g.sport_key === sport)
  if (!sport.includes('nfl')) return same
  const dates = new Set(nflHubDates(list, now))
  return same.filter((g) => g.status === 'in' || dates.has(gameDay(g)))
}

/** Sports Hub slate list: `all` = current multi-sport slate; NFL uses week window across nfl* keys. */
export function loungeSportsSlateGames(games, filter, now = Date.now()) {
  const list = Array.isArray(games) ? games : []
  const key = String(filter || '').trim()
  if (!key || key === 'all') {
    return list.filter((g) => isLoungeSportsCurrentSlateGame(g, now))
  }
  if (key.includes('nfl')) {
    const nfl = list.filter((g) => String(g?.sport_key || '').includes('nfl'))
    const dates = new Set(nflHubDates(list, now))
    return nfl.filter((g) => g.status === 'in' || dates.has(gameDay(g)))
  }
  return loungeSportsHubGames(list, key, now)
}

export function isLoungeSportsCurrentSlateGame(game, now = Date.now()) {
  if (!game) return false
  if (game.status === 'in') return true
  const day = gameDay(game)
  if (!day) return true
  const dates = isNflGame(game) ? nflFetchDates(now) : otherSportSlateDates(now)
  return dates.includes(day)
}

export function sideAbbrev(side) {
  return String(side?.abbrev || '').trim().toUpperCase()
}

function canonTeamAbbrev(abbrev) {
  const a = String(abbrev || '').trim().toUpperCase()
  if (a === 'WSH') return 'WAS'
  if (a === 'JAC') return 'JAX'
  return a
}

export function gameHasTeam(game, abbrev) {
  const a = canonTeamAbbrev(abbrev)
  if (!a) return false
  return canonTeamAbbrev(sideAbbrev(game?.home)) === a || canonTeamAbbrev(sideAbbrev(game?.away)) === a
}

/**
 * Ambiguous one-team mention: live first; else last final if still within 48h of
 * kickoff; else the next upcoming. Falls back to most recent final.
 */
export function pickAmbiguousTeamGame(abbrev, games, now = Date.now()) {
  const involving = (Array.isArray(games) ? games : []).filter((g) => gameHasTeam(g, abbrev))
  if (!involving.length) return null
  const live = involving.find((g) => g.status === 'in')
  if (live) return live
  const played = involving.filter((g) => g.status === 'post').sort((a, b) => commenceMs(b) - commenceMs(a))
  const last = played[0] || null
  if (last && now - commenceMs(last) < MS_48H) return last
  const upcoming = involving.filter((g) => g.status === 'pre').sort((a, b) => commenceMs(a) - commenceMs(b))
  if (upcoming[0]) return upcoming[0]
  return last
}

/** Named matchup: that game, preferring live / this week's final / upcoming in that order. */
export function pickSpecificMatchupGame(candidates, games, now = Date.now()) {
  const list = Array.isArray(candidates) ? candidates.filter(Boolean) : []
  if (!list.length) return null
  const live = list.find((g) => g.status === 'in')
  if (live) return live
  const calThu = nflCalendarThursdayYmd(now)
  const calDates = nflWeekDatesFromThursday(calThu)
  const closed = nflMnfWeekComplete(games, calDates, now)
  if (!closed) {
    const week = list.filter((g) => calDates.includes(gameDay(g)))
    const played = week.filter((g) => g.status === 'post').sort((a, b) => commenceMs(b) - commenceMs(a))
    if (played[0]) return played[0]
    const upcoming = week.filter((g) => g.status === 'pre').sort((a, b) => commenceMs(a) - commenceMs(b))
    if (upcoming[0]) return upcoming[0]
  }
  const upcoming = list.filter((g) => g.status === 'pre').sort((a, b) => commenceMs(a) - commenceMs(b))
  if (upcoming[0]) return upcoming[0]
  return [...list].sort((a, b) => commenceMs(b) - commenceMs(a))[0]
}
