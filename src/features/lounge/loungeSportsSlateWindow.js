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

/** Yesterday + today + tomorrow (PT) … fetch / cache window so late and next-day games are ready. */
export function otherSportSlateDates(now = Date.now()) {
  const today = ptYmd(now)
  const yest = ptYmd(now - 36 * 3600 * 1000)
  const tomorrow = addDaysYmd(today, 1)
  const days = yest === today ? [today, tomorrow] : [yest, today, tomorrow]
  return [...new Set(days)]
}

/** All Sports Hub only … PT today. League hubs (NFL, MLB, …) keep their own slates. */
export function hubSlateDates(now = Date.now()) {
  return [ptYmd(now)]
}

export function isLoungeSportsHubDayGame(game, now = Date.now()) {
  if (!game) return false
  if (game.status === 'in') return true
  const day = gameDay(game)
  if (!day) return true
  return hubSlateDates(now).includes(day)
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
  const sk = String(game?.sport_key || '')
  return sk.includes('nfl') && !sk.includes('ncaaf')
}

function isCfbGame(game) {
  return String(game?.sport_key || '').includes('ncaaf')
}

function isNhlGame(game) {
  return String(game?.sport_key || '').includes('icehockey_nhl')
}

function isNbaGame(game) {
  return String(game?.sport_key || '').includes('basketball_nba')
}

function isMlbGame(game) {
  return String(game?.sport_key || '').includes('baseball_mlb')
}

function isMlsGame(game) {
  return String(game?.sport_key || '').includes('soccer_usa_mls')
}

function isPgaGame(game) {
  return String(game?.sport_key || '').includes('golf_pga')
}

function commenceMs(game) {
  const t = Date.parse(game?.commence_time || '')
  return Number.isFinite(t) ? t : 0
}

export { commenceMs as loungeSportsCommenceMs }

function sideRank(side) {
  const r = Number(side?.rank)
  return Number.isInteger(r) && r >= 1 && r <= 25 ? r : Infinity
}

/**
 * Finals last; then kickoff; same kickoff → best Top 25 rank in the matchup, then the other side's rank.
 */
export function sortLoungeSportsGamesByKickoffRank(games) {
  return [...(Array.isArray(games) ? games : [])].sort((a, b) => {
    const aFinal = a?.status === 'post' ? 1 : 0
    const bFinal = b?.status === 'post' ? 1 : 0
    if (aFinal !== bFinal) return aFinal - bFinal
    const t = commenceMs(a) - commenceMs(b)
    if (t) return t
    const [aBest, aOther] = [sideRank(a?.away), sideRank(a?.home)].sort((x, y) => x - y)
    const [bBest, bOther] = [sideRank(b?.away), sideRank(b?.home)].sort((x, y) => x - y)
    if (aBest !== bBest) return aBest < bBest ? -1 : 1
    if (aOther !== bOther) return aOther < bOther ? -1 : 1
    return 0
  })
}

function top25First(byKickoff) {
  const best = (g) => Math.min(sideRank(g?.away), sideRank(g?.home))
  const other = (g) => Math.max(sideRank(g?.away), sideRank(g?.home))
  const ranked = byKickoff.filter((g) => best(g) !== Infinity)
  ranked.sort((a, b) => best(a) - best(b) || (other(a) === other(b) ? 0 : other(a) < other(b) ? -1 : 1))
  return [...ranked, ...byKickoff.filter((g) => best(g) === Infinity)]
}

/**
 * CFB lists: live games first, then Top 25 matchups in rank order (best side, then the other side),
 * then the rest in kickoff order. Live games are ranked-first too.
 */
export function sortCfbGamesTop25First(games) {
  const byKickoff = sortLoungeSportsGamesByKickoffRank(games)
  return [...top25First(byKickoff.filter((g) => g?.status === 'in')), ...top25First(byKickoff.filter((g) => g?.status !== 'in'))]
}

const MS_48H = 48 * 3600 * 1000

function gameDay(game) {
  return ptDateFromIsoLocal(game?.commence_time)
}

export function nflGamesOnDates(games, dates) {
  const set = new Set(dates)
  return (Array.isArray(games) ? games : []).filter((g) => isNflGame(g) && set.has(gameDay(g)))
}

export function cfbGamesOnDates(games, dates) {
  const set = new Set(dates)
  return (Array.isArray(games) ? games : []).filter((g) => isCfbGame(g) && set.has(gameDay(g)))
}

/** Edge fetch window for CFB … current Thu–Mon (volume is higher than NFL), plus next week on Monday. */
export function cfbFetchDates(now = Date.now()) {
  const primary = nflCalendarThursdayYmd(now)
  const week = nflWeekDatesFromThursday(primary)
  if (ptWeekdaySun0(now) !== 1) return week
  return [...week, ...nflWeekDatesFromThursday(addDaysYmd(primary, 7))]
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

/**
 * True once this week's CFB closer is final: Mon/Sun if any, else Saturday.
 * Live games always keep the week open.
 */
export function cfbWeekComplete(games, weekDates, now = Date.now()) {
  const week = cfbGamesOnDates(games, weekDates)
  if (week.some((g) => g.status === 'in')) return false
  for (const idx of [4, 3, 2]) {
    const day = weekDates[idx]
    if (!day) continue
    const dayGames = week.filter((g) => gameDay(g) === day)
    if (dayGames.length) return dayGames.every((g) => g.status === 'post')
  }
  if (!week.length) {
    const dow = ptWeekdaySun0(now)
    return dow === 0 || dow === 1 || dow === 2 || dow === 3
  }
  const last = [...week].sort((a, b) => commenceMs(b) - commenceMs(a))[0]
  return last?.status === 'post'
}

/**
 * Hub list: the completed slate stays up through Sunday; Monday flips to the upcoming week once any
 * Monday games are final. Tue/Wed are already on next week's calendar.
 */
export function cfbHubDates(games, now = Date.now()) {
  const calThu = nflCalendarThursdayYmd(now)
  const calDates = nflWeekDatesFromThursday(calThu)
  if (ptWeekdaySun0(now) !== 1 || !cfbWeekComplete(games, calDates, now)) return calDates
  return nflWeekDatesFromThursday(addDaysYmd(calThu, 7))
}

export function loungeSportsHubGames(games, sportKey, now = Date.now()) {
  const list = hubGamesUnsorted(games, sportKey, now)
  return String(sportKey || '').includes('ncaaf') ? sortCfbGamesTop25First(list) : sortLoungeSportsGamesByKickoffRank(list)
}

function hubGamesUnsorted(games, sportKey, now) {
  const list = Array.isArray(games) ? games : []
  const sport = String(sportKey || '')
  const same = list.filter((g) => !sport || g.sport_key === sport)
  if (sport.includes('ncaaf')) {
    const dates = new Set(cfbHubDates(list, now))
    return same.filter((g) => g.status === 'in' || dates.has(gameDay(g)))
  }
  if (sport.includes('nfl') && !sport.includes('ncaaf')) {
    const dates = new Set(nflHubDates(list, now))
    return same.filter((g) => g.status === 'in' || dates.has(gameDay(g)))
  }
  // NHL / NBA / MLB / MLS / PGA … Edge already windowed the board. Do not clip to today.
  return same
}

/** All Sports Hub = PT today. Individual league hubs keep their own slates. */
export function loungeSportsSlateGames(games, filter, now = Date.now()) {
  const list = slateGamesUnsorted(games, filter, now)
  return String(filter || '').includes('ncaaf') ? sortCfbGamesTop25First(list) : sortLoungeSportsGamesByKickoffRank(list)
}

function slateGamesUnsorted(games, filter, now) {
  const list = Array.isArray(games) ? games : []
  const key = String(filter || '').trim()
  if (!key || key === 'all') {
    return list.filter((g) => isLoungeSportsHubDayGame(g, now))
  }
  if (key.includes('ncaaf')) {
    const cfb = list.filter((g) => isCfbGame(g))
    const dates = new Set(cfbHubDates(list, now))
    return cfb.filter((g) => g.status === 'in' || dates.has(gameDay(g)))
  }
  if (key.includes('nfl')) {
    const nfl = list.filter((g) => isNflGame(g))
    const dates = new Set(nflHubDates(list, now))
    return nfl.filter((g) => g.status === 'in' || dates.has(gameDay(g)))
  }
  if (key.includes('icehockey_nhl') || key === 'nhl') {
    return list.filter((g) => isNhlGame(g))
  }
  if (key.includes('basketball_nba') || key === 'nba') {
    return list.filter((g) => isNbaGame(g))
  }
  if (key.includes('baseball_mlb') || key === 'mlb') {
    return list.filter((g) => isMlbGame(g))
  }
  if (key.includes('soccer_usa_mls') || key === 'mls') {
    return list.filter((g) => isMlsGame(g))
  }
  if (key.includes('golf_pga') || key === 'pga') {
    return list.filter((g) => isPgaGame(g))
  }
  return hubGamesUnsorted(list, key, now)
}

export function isLoungeSportsCurrentSlateGame(game, now = Date.now()) {
  if (!game) return false
  if (game.status === 'in') return true
  const day = gameDay(game)
  if (!day) return true
  if (isNflGame(game)) return nflFetchDates(now).includes(day)
  if (isCfbGame(game)) return cfbFetchDates(now).includes(day)
  return otherSportSlateDates(now).includes(day)
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
