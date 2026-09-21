/**
 * Lounge in-post game pill scoreboard.
 * TheRundown day slates first (period scores + status). Odds API /scores as fallback.
 */
import { listRundownDayEvents, ptDateFromIso, rundownApiKey } from './loungeBotRundownContext.ts'
import { fetchSportScores, type ScoreEvent } from './loungeBotLiveContent.ts'
import { fetchSportOdds, ptTodayDate } from './loungeBotOddsRun.ts'

export const LOUNGE_SPORTS_SCOREBOARD_SPORTS = [
  { key: 'americanfootball_nfl', label: 'NFL', logoLeague: 'nfl' },
  { key: 'americanfootball_ncaaf', label: 'CFB', logoLeague: 'ncaa' },
  { key: 'baseball_mlb', label: 'MLB', logoLeague: 'mlb' },
  { key: 'basketball_nba', label: 'NBA', logoLeague: 'nba' },
  { key: 'icehockey_nhl', label: 'NHL', logoLeague: 'nhl' },
  { key: 'soccer_usa_mls', label: 'MLS', logoLeague: 'mls' },
] as const

export type LoungeSportsGameSide = {
  name: string
  mascot: string
  abbrev: string
  logo: string
  score: number | null
  linescores: number[]
  /** Current or last-known ATS number for this side (favorite negative). */
  spread?: number | null
  team_id?: number | null
}

export type LoungeSportsLiveState = {
  clock: string
  period: number | null
  down: number | null
  distance: number | null
  yard_line: number | null
  yard_side: 'home' | 'away' | null
  possession: 'home' | 'away' | null
  last_play: string
}

export type LoungeSportsOddsRow = {
  book: string
  home_spread: number | null
  home_spread_price: number | null
  away_spread: number | null
  away_spread_price: number | null
  total: number | null
  over_price: number | null
  under_price: number | null
  home_ml: number | null
  away_ml: number | null
}

export type LoungeSportsPlay = {
  id: string
  period: number | null
  clock: string
  description: string
  team: 'home' | 'away' | null
}

export type LoungeSportsPlayerStat = {
  name: string
  team_id: number | null
  side: 'home' | 'away' | null
  category: string
  line: string
}

export type LoungeSportsGame = {
  id: string
  sport_key: string
  sport_label: string
  status: 'pre' | 'in' | 'post'
  status_label: string
  commence_time: string
  home: LoungeSportsGameSide
  away: LoungeSportsGameSide
  aliases: string[]
  live: LoungeSportsLiveState | null
}

function espnLogo(league: string, abbrev: string): string {
  const slug = espnLogoSlug(league, abbrev)
  if (!slug) return ''
  return `https://a.espncdn.com/i/teamlogos/${league}/500/${slug}.png`
}

function espnLogoSlug(league: string, abbrev: string): string {
  const a = String(abbrev || '').trim().toLowerCase()
  if (!a) return ''
  if (league === 'nfl' && a === 'was') return 'wsh'
  if (league === 'nfl' && a === 'wsh') return 'wsh'
  return a.replace(/[^a-z0-9]/g, '')
}

function parseScore(value: unknown): number | null {
  if (value == null || value === '') return null
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}

function parseLines(value: unknown): number[] {
  if (!Array.isArray(value)) return []
  return value.map((n) => Number(n)).filter((n) => Number.isFinite(n))
}

function classifyRundownStatus(status: string, detail: string): 'pre' | 'in' | 'post' {
  const s = `${status} ${detail}`.toUpperCase()
  if (/FINAL|COMPLETE|FULL[_\s-]?TIME|ENDED/.test(s)) return 'post'
  if (/IN_PROGRESS|HALFTIME|END_PERIOD|OVERTIME|FIRST_HALF|SECOND_HALF|LIVE|Q[1-4]|OT/.test(s)) return 'in'
  if (/DELAY|POSTPONE/.test(s)) return 'pre'
  return 'pre'
}

function formatKickoffLabel(iso: string): string {
  const t = Date.parse(iso)
  if (!Number.isFinite(t)) return 'Upcoming'
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Los_Angeles',
    weekday: 'short',
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short',
  }).format(new Date(t))
}

function sideFromRundown(
  team: {
    name?: string
    mascot?: string
    abbreviation?: string
    team_id?: number
    id?: number
  } | undefined,
  score: number | null,
  lines: number[],
  logoLeague: string,
): LoungeSportsGameSide {
  const name = String(team?.name || '').trim()
  const mascot = String(team?.mascot || '').trim()
  const abbrevRaw = String(team?.abbreviation || '').trim().toUpperCase()
  const abbrev = abbrevRaw === 'WSH' ? 'WAS' : abbrevRaw === 'JAC' ? 'JAX' : abbrevRaw
  const display = [name, mascot].filter(Boolean).join(' ').trim() || abbrev || 'Team'
  const teamId = Number(team?.team_id ?? team?.id)
  return {
    name: display,
    mascot,
    abbrev: abbrev || display.slice(0, 3).toUpperCase(),
    logo: espnLogo(logoLeague, abbrev || name),
    score,
    linescores: lines,
    spread: null,
    team_id: Number.isFinite(teamId) && teamId > 0 ? teamId : null,
  }
}

function pairSpreads(home: number | null, away: number | null): { home: number | null; away: number | null } {
  if (home == null && away == null) return { home: null, away: null }
  return {
    home: home ?? (away != null ? -away : null),
    away: away ?? (home != null ? -home : null),
  }
}

function spreadFromLineObject(raw: unknown): { home: number | null; away: number | null } {
  if (!raw || typeof raw !== 'object') return { home: null, away: null }
  const o = raw as Record<string, unknown>
  const spreadObj = (o.spread && typeof o.spread === 'object') ? o.spread as Record<string, unknown> : o
  const home = numOrNull(
    spreadObj.point_spread_home
    ?? spreadObj.spread_home
    ?? spreadObj.home_spread
    ?? spreadObj.home
    ?? o.point_spread_home
    ?? o.spread_home
    ?? o.home_spread,
  )
  const away = numOrNull(
    spreadObj.point_spread_away
    ?? spreadObj.spread_away
    ?? spreadObj.away_spread
    ?? spreadObj.away
    ?? o.point_spread_away
    ?? o.spread_away
    ?? o.away_spread,
  )
  return pairSpreads(home, away)
}

/** TheRundown day events sometimes carry affiliate `lines` / `line_periods` even after FINAL. */
function spreadFromRundownEvent(event: Record<string, unknown>): { home: number | null; away: number | null } {
  const direct = spreadFromLineObject(event)
  if (direct.home != null || direct.away != null) return direct
  const periods = event.line_periods
  if (periods && typeof periods === 'object') {
    const p = periods as Record<string, unknown>
    for (const key of ['full', 'period', 'current', 'full_game']) {
      const hit = spreadFromLineObject(p[key])
      if (hit.home != null || hit.away != null) return hit
    }
    for (const value of Object.values(p)) {
      const hit = spreadFromLineObject(value)
      if (hit.home != null || hit.away != null) return hit
    }
  }
  const lines = event.lines
  if (lines && typeof lines === 'object') {
    for (const value of Object.values(lines as Record<string, unknown>)) {
      const hit = spreadFromLineObject(value)
      if (hit.home != null || hit.away != null) return hit
    }
  }
  return { home: null, away: null }
}

function numOrNull(value: unknown): number | null {
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}

function liveFromRundown(
  event: Record<string, unknown>,
  homeId: number | null,
  awayId: number | null,
): LoungeSportsLiveState | null {
  const score = (event.score && typeof event.score === 'object') ? event.score as Record<string, unknown> : {}
  const raw = (event.live_game_state || event.game_state || score.live_game_state || {}) as Record<string, unknown>
  const lastRaw = raw.last_play
  const lastObj = lastRaw && typeof lastRaw === 'object' ? lastRaw as Record<string, unknown> : null
  const lastPlay = String(
    lastObj?.description
    || lastObj?.play_text
    || lastObj?.play_description
    || raw.last_play_description
    || raw.last_play_text
    || (typeof lastRaw === 'string' ? lastRaw : ''),
  ).trim()
  const clock = String(raw.display_clock || raw.clock || score.display_clock || '').trim()
  const period = numOrNull(raw.period ?? raw.quarter ?? score.game_period)
  const down = numOrNull(raw.down)
  const distance = numOrNull(raw.distance ?? raw.yards_to_go)
  const yardLine = numOrNull(raw.yard_line ?? raw.yards_from_goal ?? raw.field_position)
  const possRaw = raw.possession ?? raw.possession_team_id ?? raw.team_in_possession
  let possession: 'home' | 'away' | null = null
  if (possRaw === 'home' || possRaw === 'away') possession = possRaw
  else {
    const pid = Number(possRaw)
    if (homeId && pid === homeId) possession = 'home'
    if (awayId && pid === awayId) possession = 'away'
  }
  let yardSide: 'home' | 'away' | null = null
  const sideRaw = String(raw.yard_line_side || raw.side || raw.territory || '').toLowerCase()
  if (sideRaw.includes('home')) yardSide = 'home'
  if (sideRaw.includes('away')) yardSide = 'away'
  if (!clock && period == null && down == null && !lastPlay) return null
  return {
    clock,
    period,
    down,
    distance,
    yard_line: yardLine,
    yard_side: yardSide,
    possession,
    last_play: lastPlay,
  }
}

function aliasesForSide(side: LoungeSportsGameSide): string[] {
  const out = new Set<string>()
  const add = (v: string) => {
    const t = String(v || '').trim()
    if (t.length >= 3) out.add(t)
  }
  add(side.name)
  add(side.mascot)
  add(side.abbrev)
  return [...out]
}

function gameFromRundown(
  sportKey: string,
  sportLabel: string,
  logoLeague: string,
  event: {
    event_id?: string
    event_date?: string
    teams?: Array<{
      name?: string
      mascot?: string
      abbreviation?: string
      is_home?: boolean
      is_away?: boolean
      team_id?: number
      id?: number
    }>
    live_game_state?: Record<string, unknown>
    game_state?: Record<string, unknown>
    lines?: unknown
    line_periods?: unknown
    score?: {
      event_status?: string
      event_status_detail?: string
      score_home?: number
      score_away?: number
      score_home_by_period?: number[]
      score_away_by_period?: number[]
      display_clock?: string
      game_period?: number
    }
  },
): LoungeSportsGame | null {
  const teams = Array.isArray(event.teams) ? event.teams : []
  const homeTeam = teams.find((t) => t.is_home) || teams[1]
  const awayTeam = teams.find((t) => t.is_away) || teams[0]
  if (!homeTeam || !awayTeam) return null
  const score = event.score || {}
  const detail = String(score.event_status_detail || '').trim()
  const statusRaw = String(score.event_status || '').trim()
  const status = classifyRundownStatus(statusRaw, detail)
  const commence = String(event.event_date || '').trim()
  let statusLabel = detail
  if (!statusLabel) {
    if (status === 'post') statusLabel = 'Final'
    else if (status === 'in') {
      const clock = String(score.display_clock || '').trim()
      const period = Number(score.game_period)
      statusLabel = clock || (Number.isFinite(period) && period > 0 ? `P${period}` : 'Live')
    } else statusLabel = commence ? formatKickoffLabel(commence) : 'Upcoming'
  }
  const home = sideFromRundown(
    homeTeam,
    parseScore(score.score_home),
    parseLines(score.score_home_by_period),
    logoLeague,
  )
  const away = sideFromRundown(
    awayTeam,
    parseScore(score.score_away),
    parseLines(score.score_away_by_period),
    logoLeague,
  )
  const id = String(event.event_id || `${sportKey}:${away.abbrev}@${home.abbrev}:${commence}`).trim()
  if (!id) return null
  const live = liveFromRundown(event as Record<string, unknown>, home.team_id ?? null, away.team_id ?? null)
  const spread = spreadFromRundownEvent(event as Record<string, unknown>)
  return {
    id,
    sport_key: sportKey,
    sport_label: sportLabel,
    status,
    status_label: statusLabel,
    commence_time: commence,
    home: { ...home, spread: spread.home },
    away: { ...away, spread: spread.away },
    aliases: [...aliasesForSide(home), ...aliasesForSide(away)],
    live,
  }
}

function scoreForName(scores: ScoreEvent['scores'], name: string): number | null {
  const want = String(name || '').trim().toLowerCase()
  const row = (scores || []).find((s) => String(s?.name || '').trim().toLowerCase() === want)
  return parseScore(row?.score)
}

const NFL_ODDS_NAME_ABBREV: Record<string, string> = {
  'arizona cardinals': 'ARI', cardinals: 'ARI',
  'atlanta falcons': 'ATL', falcons: 'ATL',
  'baltimore ravens': 'BAL', ravens: 'BAL',
  'buffalo bills': 'BUF', bills: 'BUF',
  'carolina panthers': 'CAR', panthers: 'CAR',
  'chicago bears': 'CHI', bears: 'CHI',
  'cincinnati bengals': 'CIN', bengals: 'CIN',
  'cleveland browns': 'CLE', browns: 'CLE',
  'dallas cowboys': 'DAL', cowboys: 'DAL',
  'denver broncos': 'DEN', broncos: 'DEN',
  'detroit lions': 'DET', lions: 'DET',
  'green bay packers': 'GB', packers: 'GB',
  'houston texans': 'HOU', texans: 'HOU',
  'indianapolis colts': 'IND', colts: 'IND',
  'jacksonville jaguars': 'JAX', jaguars: 'JAX', jags: 'JAX',
  'kansas city chiefs': 'KC', chiefs: 'KC',
  'los angeles chargers': 'LAC', chargers: 'LAC',
  'los angeles rams': 'LAR', rams: 'LAR',
  'las vegas raiders': 'LV', raiders: 'LV',
  'miami dolphins': 'MIA', dolphins: 'MIA',
  'minnesota vikings': 'MIN', vikings: 'MIN',
  'new england patriots': 'NE', patriots: 'NE', pats: 'NE',
  'new orleans saints': 'NO', saints: 'NO',
  'new york giants': 'NYG', giants: 'NYG',
  'new york jets': 'NYJ', jets: 'NYJ',
  'philadelphia eagles': 'PHI', eagles: 'PHI',
  'pittsburgh steelers': 'PIT', steelers: 'PIT',
  'san francisco 49ers': 'SF', '49ers': 'SF', niners: 'SF',
  'seattle seahawks': 'SEA', seahawks: 'SEA',
  'tampa bay buccaneers': 'TB', buccaneers: 'TB', bucs: 'TB',
  'tennessee titans': 'TEN', titans: 'TEN',
  'washington commanders': 'WAS', commanders: 'WAS', washington: 'WAS',
}

function nflAbbrevFromOddsName(name: string): string {
  const n = String(name || '').trim().toLowerCase()
  if (NFL_ODDS_NAME_ABBREV[n]) return NFL_ODDS_NAME_ABBREV[n]
  const last = n.split(/\s+/).pop() || ''
  if (NFL_ODDS_NAME_ABBREV[last]) return NFL_ODDS_NAME_ABBREV[last]
  return (last.slice(0, 3) || n.slice(0, 3)).toUpperCase()
}

function gameFromOdds(sportKey: string, sportLabel: string, logoLeague: string, ev: ScoreEvent): LoungeSportsGame | null {
  const homeName = String(ev.home_team || '').trim()
  const awayName = String(ev.away_team || '').trim()
  if (!homeName || !awayName) return null
  const completed = ev.completed === true
  const commence = String(ev.commence_time || '').trim()
  const homeScore = scoreForName(ev.scores, homeName)
  const awayScore = scoreForName(ev.scores, awayName)
  const kicked = commence ? Date.parse(commence) <= Date.now() : false
  const status: LoungeSportsGame['status'] = completed ? 'post' : kicked && (homeScore != null || awayScore != null) ? 'in' : 'pre'
  const homeAbbrev = sportKey.includes('nfl') ? nflAbbrevFromOddsName(homeName) : (homeName.split(/\s+/).pop() || homeName).slice(0, 3).toUpperCase()
  const awayAbbrev = sportKey.includes('nfl') ? nflAbbrevFromOddsName(awayName) : (awayName.split(/\s+/).pop() || awayName).slice(0, 3).toUpperCase()
  const homeMascot = homeName.split(/\s+/).pop() || homeName
  const awayMascot = awayName.split(/\s+/).pop() || awayName
  const home: LoungeSportsGameSide = {
    name: homeName,
    mascot: homeMascot,
    abbrev: homeAbbrev,
    logo: espnLogo(logoLeague, homeAbbrev),
    score: homeScore,
    linescores: [],
    spread: null,
  }
  const away: LoungeSportsGameSide = {
    name: awayName,
    mascot: awayMascot,
    abbrev: awayAbbrev,
    logo: espnLogo(logoLeague, awayAbbrev),
    score: awayScore,
    linescores: [],
    spread: null,
  }
  return {
    id: String(ev.id || `${sportKey}:${awayName}@${homeName}`).trim(),
    sport_key: sportKey,
    sport_label: sportLabel,
    status,
    status_label: completed ? 'Final' : status === 'in' ? 'Live' : commence ? formatKickoffLabel(commence) : 'Upcoming',
    commence_time: commence,
    home,
    away,
    aliases: [...aliasesForSide(home), ...aliasesForSide(away)],
    live: null,
  }
}

function addDaysYmd(ymd: string, days: number): string {
  const [y, m, d] = ymd.split('-').map(Number)
  const ms = Date.UTC(y, m - 1, d, 20, 0, 0) + days * 86_400_000
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Los_Angeles',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(ms))
}

function ptWeekdaySun0(ms = Date.now()): number {
  const wd = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Los_Angeles',
    weekday: 'short',
  }).format(new Date(ms))
  const map: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }
  return map[wd] ?? 0
}

function otherSportSlateDates(): string[] {
  const today = ptTodayDate()
  const yest = ptDateFromIso(new Date(Date.now() - 36 * 3600 * 1000).toISOString())
  return yest === today ? [today] : [yest, today]
}

/** Thursday that starts the calendar NFL week. Tue/Wed roll forward. */
export function nflCalendarThursdayYmd(now = Date.now()): string {
  const today = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Los_Angeles',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(now))
  const dow = ptWeekdaySun0(now)
  if (dow === 2 || dow === 3) return addDaysYmd(today, dow === 2 ? 2 : 1)
  return addDaysYmd(today, -((dow - 4 + 7) % 7))
}

function nflWeekDatesFromThursday(thursdayYmd: string): string[] {
  return [0, 1, 2, 3, 4].map((i) => addDaysYmd(thursdayYmd, i))
}

/** This calendar week plus the adjacent week (recaps + upcoming). */
export function nflFetchDates(now = Date.now()): string[] {
  const primary = nflCalendarThursdayYmd(now)
  const dow = ptWeekdaySun0(now)
  const secondary = addDaysYmd(primary, dow === 2 || dow === 3 ? -7 : 7)
  return [...new Set([...nflWeekDatesFromThursday(primary), ...nflWeekDatesFromThursday(secondary)])].sort()
}

function gameOnSlate(game: LoungeSportsGame, dates: string[]): boolean {
  if (game.status === 'in') return true
  const day = ptDateFromIso(game.commence_time)
  return Boolean(day) && dates.includes(day)
}

function slateDedupeKey(game: LoungeSportsGame): string {
  const a = String(game.away?.abbrev || '').toUpperCase() === 'WSH' ? 'WAS' : String(game.away?.abbrev || '').toUpperCase()
  const h = String(game.home?.abbrev || '').toUpperCase() === 'WSH' ? 'WAS' : String(game.home?.abbrev || '').toUpperCase()
  return `${game.sport_key}:${a}@${h}:${ptDateFromIso(game.commence_time)}`
}

export async function buildLoungeSportsScoreboard(): Promise<{ games: LoungeSportsGame[]; source: string }> {
  const nflDates = nflFetchDates()
  const byKey = new Map<string, LoungeSportsGame>()
  let source = 'none'
  const nflSport = LOUNGE_SPORTS_SCOREBOARD_SPORTS.find((s) => s.key === 'americanfootball_nfl')

  const upsert = (game: LoungeSportsGame, overwrite = false) => {
    const key = slateDedupeKey(game)
    if (!overwrite && byKey.has(key)) return
    byKey.set(key, game)
  }

  // NFL + Odds only. Fetching CFB/MLB/NBA/NHL/MLS sequentially after a 10-day NFL
  // Rundown round was burning the Edge wall clock (10s timeout × 6 sports) so the
  // invoke 502'd and the Lounge painted zero pills.
  if (nflSport) {
    const [nflBatches, nflScores, nflOddsPack] = await Promise.all([
      Promise.all(nflDates.map((date) => listRundownDayEvents(nflSport.key, date).catch(() => []))),
      fetchSportScores('americanfootball_nfl', 3).catch(() => []),
      cachedSportOdds('americanfootball_nfl'),
    ])
    for (const events of nflBatches) {
      if (events.length) source = source === 'none' ? 'rundown' : source
      for (const ev of events) {
        const game = gameFromRundown(nflSport.key, nflSport.label, nflSport.logoLeague, ev)
        if (game && gameOnSlate(game, nflDates)) upsert(game, true)
      }
    }
    if (nflScores.length) {
      source = source === 'none' ? 'odds' : source.includes('odds') ? source : `${source}+odds`
      for (const ev of nflScores) {
        const game = gameFromOdds('americanfootball_nfl', 'NFL', 'nfl', ev)
        if (game && gameOnSlate(game, nflDates)) upsert(game, false)
      }
    }
    if (nflOddsPack) source = source.includes('odds') ? source : source === 'none' ? 'odds' : `${source}+odds`
    const withSpreads = applyOddsSpreads([...byKey.values()], nflOddsPack)
    byKey.clear()
    for (const game of withSpreads) upsert(game, true)
  }

  const games = [...byKey.values()].sort((a, b) => {
    const rank = { in: 0, post: 1, pre: 2 }
    const d = rank[a.status] - rank[b.status]
    if (d) return d
    return String(a.commence_time).localeCompare(String(b.commence_time))
  })
  return { games, source }
}

const RUNDOWN_BASE = 'https://therundown.io/api/v2'
const ODDS_CACHE_MS = 90_000
const oddsCache = new Map<string, { at: number; pack: Awaited<ReturnType<typeof fetchSportOdds>> | null }>()

async function cachedSportOdds(sportKey: string) {
  const key = String(sportKey || '')
  const cached = oddsCache.get(key)
  if (cached && Date.now() - cached.at < ODDS_CACHE_MS) return cached.pack
  const pack = await fetchSportOdds(key, ['us', 'us2'], ['h2h', 'spreads', 'totals']).catch(() => null)
  oddsCache.set(key, { at: Date.now(), pack })
  return pack
}

async function rundownGet<T>(path: string): Promise<T | null> {
  const key = rundownApiKey()
  if (!key) return null
  try {
    const res = await fetch(`${RUNDOWN_BASE}${path}`, {
      headers: { 'X-TheRundown-Key': key },
      signal: AbortSignal.timeout(10_000),
    })
    if (!res.ok) return null
    return await res.json() as T
  } catch {
    return null
  }
}

type OddsBookmaker = {
  key?: string
  title?: string
  markets?: Array<{ key?: string; outcomes?: Array<{ name?: string; price?: number; point?: number }> }>
}

type OddsEventRow = {
  home_team?: string
  away_team?: string
  bookmakers?: OddsBookmaker[]
}

function outcomePoint(outcomes: Array<{ name?: string; price?: number; point?: number }>, name: string) {
  const want = name.toLowerCase()
  const row = outcomes.find((o) => String(o.name || '').trim().toLowerCase() === want)
  return {
    price: numOrNull(row?.price),
    point: numOrNull(row?.point),
  }
}

function compactBook(
  book: OddsBookmaker,
  homeName: string,
  awayName: string,
): LoungeSportsOddsRow | null {
  const markets = Array.isArray(book.markets) ? book.markets : []
  const h2h = markets.find((m) => m.key === 'h2h')?.outcomes || []
  const spreads = markets.find((m) => m.key === 'spreads')?.outcomes || []
  const totals = markets.find((m) => m.key === 'totals')?.outcomes || []
  const homeH2h = outcomePoint(h2h, homeName)
  const awayH2h = outcomePoint(h2h, awayName)
  const homeSp = outcomePoint(spreads, homeName)
  const awaySp = outcomePoint(spreads, awayName)
  const over = outcomePoint(totals, 'Over')
  const under = outcomePoint(totals, 'Under')
  if (
    homeH2h.price == null &&
    awayH2h.price == null &&
    homeSp.point == null &&
    over.point == null &&
    under.point == null
  ) return null
  return {
    book: String(book.title || book.key || 'Books').trim() || 'Books',
    home_spread: homeSp.point,
    home_spread_price: homeSp.price,
    away_spread: awaySp.point,
    away_spread_price: awaySp.price,
    total: over.point ?? under.point,
    over_price: over.price,
    under_price: under.price,
    home_ml: homeH2h.price,
    away_ml: awayH2h.price,
  }
}

function compactOddsBooksFromEvent(ev: OddsEventRow, homeName: string, awayName: string): LoungeSportsOddsRow[] {
  const books = Array.isArray(ev.bookmakers) ? ev.bookmakers : []
  const preferred = ['pinnacle', 'lowvig', 'fanduel', 'draftkings', 'betmgm', 'caesars', 'fanatics']
  const ordered: OddsBookmaker[] = []
  for (const key of preferred) {
    const hit = books.find((b) => b.key === key)
    if (hit) ordered.push(hit)
  }
  for (const book of books) {
    if (!ordered.includes(book)) ordered.push(book)
  }
  const rows: LoungeSportsOddsRow[] = []
  for (const book of ordered) {
    const row = compactBook(book, homeName, awayName)
    if (row) rows.push(row)
    if (rows.length >= 5) break
  }
  return rows
}

function preferredSpreadFromBooks(books: LoungeSportsOddsRow[]): { home: number | null; away: number | null } {
  for (const row of books) {
    const pair = pairSpreads(numOrNull(row.home_spread), numOrNull(row.away_spread))
    if (pair.home != null || pair.away != null) return pair
  }
  return { home: null, away: null }
}

function applyOddsSpreads(
  games: LoungeSportsGame[],
  pack: Awaited<ReturnType<typeof fetchSportOdds>> | null,
): LoungeSportsGame[] {
  const events = Array.isArray(pack?.events) ? pack!.events as OddsEventRow[] : []
  if (!events.length) return games
  return games.map((game) => {
    const matched = events.find((ev) =>
      oddsNamesHit(String(ev.home_team || ''), game.home) && oddsNamesHit(String(ev.away_team || ''), game.away)
    )
    if (!matched) return game
    const books = compactOddsBooksFromEvent(
      matched,
      String(matched.home_team || game.home.name),
      String(matched.away_team || game.away.name),
    )
    const pair = preferredSpreadFromBooks(books)
    if (pair.home == null && pair.away == null) return game
    return {
      ...game,
      home: { ...game.home, spread: pair.home },
      away: { ...game.away, spread: pair.away },
    }
  })
}

function oddsNamesHit(oddsName: string, side: LoungeSportsGameSide): boolean {
  const o = String(oddsName || '').toLowerCase()
  if (!o) return false
  const tokens = [side.mascot, side.abbrev, side.name].map((s) => String(s || '').toLowerCase()).filter((s) => s.length >= 3)
  return tokens.some((t) => o.includes(t) || t.includes(o.split(/\s+/).pop() || o))
}

function playTeam(raw: unknown, homeId: number | null, awayId: number | null): 'home' | 'away' | null {
  if (raw === 'home' || raw === 'away') return raw
  const n = Number(raw)
  if (homeId && n === homeId) return 'home'
  if (awayId && n === awayId) return 'away'
  return null
}

function categorizeStat(name: string, abbr: string): string | null {
  const hay = `${name} ${abbr}`.toLowerCase()
  if (/pass/.test(hay) && !/rush|receiv/.test(hay)) return 'Passing'
  if (/rush/.test(hay)) return 'Rushing'
  if (/rec|catch|target/.test(hay)) return 'Receiving'
  if (/\bpts\b|points|reb|ast|3pt/.test(hay)) return 'Basketball'
  if (/\bso\b|strike|hits|rbi|era/.test(hay)) return 'Baseball'
  if (/\bg\b|a\b|sog|save/.test(hay) && /hockey|goal/.test(hay)) return 'Hockey'
  return null
}

export async function fetchLoungeSportsGameDetail(
  game: LoungeSportsGame,
): Promise<{
  live: LoungeSportsLiveState | null
  odds: LoungeSportsOddsRow[]
  plays: LoungeSportsPlay[]
  stats: LoungeSportsPlayerStat[]
}> {
  const eventId = encodeURIComponent(game.id)
  const [eventRaw, playsRaw, statsRaw, oddsPack] = await Promise.all([
    rundownGet<unknown>(`/events/${eventId}`),
    rundownGet<unknown>(`/events/${eventId}/plays`),
    rundownGet<unknown>(`/events/${eventId}/players/stats`),
    cachedSportOdds(game.sport_key),
  ])

  const eventObj = eventRaw && typeof eventRaw === 'object'
    ? ((eventRaw as { event?: Record<string, unknown> }).event || eventRaw) as Record<string, unknown>
    : null
  const homeId = game.home.team_id ?? null
  const awayId = game.away.team_id ?? null
  const live = eventObj
    ? liveFromRundown(eventObj, homeId, awayId) || game.live
    : game.live

  const playList: unknown[] = Array.isArray(playsRaw)
    ? playsRaw
    : Array.isArray((playsRaw as { plays?: unknown[] } | null)?.plays)
      ? (playsRaw as { plays: unknown[] }).plays
      : []
  const plays: LoungeSportsPlay[] = playList.slice(0, 80).map((row, i) => {
    const p = (row && typeof row === 'object') ? row as Record<string, unknown> : {}
    return {
      id: String(p.id || p.sequence || i),
      period: numOrNull(p.period ?? p.quarter ?? p.game_period),
      clock: String(p.clock || p.display_clock || p.time || '').trim(),
      description: String(p.description || p.play_text || p.play_description || p.text || '').trim(),
      team: playTeam(p.team_id ?? p.team ?? p.possession, homeId, awayId),
    }
  }).filter((p) => p.description)

  const statRows: unknown[] = Array.isArray(statsRaw)
    ? statsRaw
    : Array.isArray((statsRaw as { players?: unknown[] } | null)?.players)
      ? (statsRaw as { players: unknown[] }).players
      : []
  const stats: LoungeSportsPlayerStat[] = []
  for (const row of statRows.slice(0, 80)) {
    const r = (row && typeof row === 'object') ? row as Record<string, unknown> : {}
    const player = (r.player && typeof r.player === 'object') ? r.player as Record<string, unknown> : {}
    const name = String(player.display_name || [player.first_name, player.last_name].filter(Boolean).join(' ')).trim()
    if (!name) continue
    const teamId = numOrNull(player.team_id)
    const side: 'home' | 'away' | null = teamId && homeId === teamId ? 'home' : teamId && awayId === teamId ? 'away' : null
    const bits: string[] = []
    let category = ''
    for (const s of Array.isArray(r.stats) ? r.stats as Array<Record<string, unknown>> : []) {
      const def = (s.stat && typeof s.stat === 'object') ? s.stat as Record<string, unknown> : {}
      const stName = String(def.name || def.display_name || '').trim()
      const abbr = String(def.abbreviation || '').trim()
      const value = String(s.value ?? '').trim()
      if (!value) continue
      const cat = categorizeStat(stName, abbr)
      if (cat && !category) category = cat
      bits.push(`${abbr || stName} ${value}`)
    }
    if (!bits.length) continue
    stats.push({
      name,
      team_id: teamId,
      side,
      category: category || 'Stats',
      line: bits.slice(0, 8).join(' · '),
    })
  }

  const events = Array.isArray(oddsPack?.events) ? oddsPack.events as OddsEventRow[] : []
  const matched = events.find((ev) =>
    oddsNamesHit(String(ev.home_team || ''), game.home) && oddsNamesHit(String(ev.away_team || ''), game.away)
  )
  const odds = matched
    ? compactOddsBooksFromEvent(matched, String(matched.home_team || game.home.name), String(matched.away_team || game.away.name))
    : []

  return {
    live,
    odds,
    plays,
    stats,
  }
}
