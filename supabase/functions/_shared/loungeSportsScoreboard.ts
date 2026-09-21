/**
 * Lounge in-post game pill scoreboard.
 * TheRundown day slates first (period scores + status). Odds API /scores as fallback.
 */
import { listRundownDayEvents, ptDateFromIso } from './loungeBotRundownContext.ts'
import { fetchSportScores, type ScoreEvent } from './loungeBotLiveContent.ts'
import { ptTodayDate } from './loungeBotOddsRun.ts'

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
  } | undefined,
  score: number | null,
  lines: number[],
  logoLeague: string,
): LoungeSportsGameSide {
  const name = String(team?.name || '').trim()
  const mascot = String(team?.mascot || '').trim()
  const abbrev = String(team?.abbreviation || '').trim().toUpperCase()
  const display = [name, mascot].filter(Boolean).join(' ').trim() || abbrev || 'Team'
  return {
    name: display,
    mascot,
    abbrev: abbrev || display.slice(0, 3).toUpperCase(),
    logo: espnLogo(logoLeague, abbrev || name),
    score,
    linescores: lines,
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
    }>
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
  return {
    id,
    sport_key: sportKey,
    sport_label: sportLabel,
    status,
    status_label: statusLabel,
    commence_time: commence,
    home,
    away,
    aliases: [...aliasesForSide(home), ...aliasesForSide(away)],
  }
}

function scoreForName(scores: ScoreEvent['scores'], name: string): number | null {
  const want = String(name || '').trim().toLowerCase()
  const row = (scores || []).find((s) => String(s?.name || '').trim().toLowerCase() === want)
  return parseScore(row?.score)
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
  const homeAbbrev = homeName.split(/\s+/).pop() || homeName
  const awayAbbrev = awayName.split(/\s+/).pop() || awayName
  const home: LoungeSportsGameSide = {
    name: homeName,
    mascot: homeAbbrev,
    abbrev: homeAbbrev.slice(0, 3).toUpperCase(),
    logo: espnLogo(logoLeague, homeAbbrev),
    score: homeScore,
    linescores: [],
  }
  const away: LoungeSportsGameSide = {
    name: awayName,
    mascot: awayAbbrev,
    abbrev: awayAbbrev.slice(0, 3).toUpperCase(),
    logo: espnLogo(logoLeague, awayAbbrev),
    score: awayScore,
    linescores: [],
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
  }
}

function slateDates(): string[] {
  const today = ptTodayDate()
  const yest = ptDateFromIso(new Date(Date.now() - 36 * 3600 * 1000).toISOString())
  return yest === today ? [today] : [yest, today]
}

export async function buildLoungeSportsScoreboard(): Promise<{ games: LoungeSportsGame[]; source: string }> {
  const dates = slateDates()
  const byId = new Map<string, LoungeSportsGame>()
  let source = 'none'

  for (const sport of LOUNGE_SPORTS_SCOREBOARD_SPORTS) {
    for (const date of dates) {
      const events = await listRundownDayEvents(sport.key, date).catch(() => [])
      if (events.length) source = source === 'none' ? 'rundown' : source
      for (const ev of events) {
        const game = gameFromRundown(sport.key, sport.label, sport.logoLeague, ev)
        if (game) byId.set(game.id, game)
      }
    }
  }

  if (![...byId.values()].some((g) => g.sport_key === 'americanfootball_nfl')) {
    try {
      const nfl = await fetchSportScores('americanfootball_nfl')
      source = byId.size ? `${source}+odds` : 'odds'
      for (const ev of nfl) {
        const game = gameFromOdds('americanfootball_nfl', 'NFL', 'nfl', ev)
        if (game && !byId.has(game.id)) byId.set(game.id, game)
      }
    } catch {
      /* Odds fallback is optional */
    }
  }

  const games = [...byId.values()].sort((a, b) => {
    const rank = { in: 0, pre: 1, post: 2 }
    const d = rank[a.status] - rank[b.status]
    if (d) return d
    return String(a.commence_time).localeCompare(String(b.commence_time))
  })
  return { games, source }
}
