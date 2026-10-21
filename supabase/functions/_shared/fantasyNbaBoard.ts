/**
 * NBA lineup board: Sleeper's per-game projection lines plus this fantasy week's schedule (ESPN).
 * A Sleeper NBA matchup week runs Monday-Sunday; week 1 runs from opening night to the first Sunday.
 * The app projects a player's week as host week-to-date points + per-game projection x games left.
 */
import { sharedCached } from './edgeSharedCache.ts'

const SLEEPER = 'https://api.sleeper.app/v1'
const ESPN_SCOREBOARD = 'https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard'
const DAY_MS = 86_400_000

/** Sleeper per-game projection keys that score (gp / sp are meta). */
const SKIP_KEYS = new Set(['gp', 'sp'])

/** ESPN NBA abbreviations -> Sleeper's. */
const TEAM_ALIAS: Record<string, string> = { GS: 'GSW', SA: 'SAS', NO: 'NOP', NY: 'NYK', UTAH: 'UTA', WSH: 'WAS' }

export function nbaTeam(team: string | null | undefined): string {
  const t = String(team || '').trim().toUpperCase().replace(/[^A-Z]/g, '')
  return TEAM_ALIAS[t] || t
}

export type NbaGame = { id: string; date: string; home: string; away: string; state: 'pre' | 'in' | 'post' }

export type NbaBoard = {
  season: string
  week: number
  /** Week window, YYYY-MM-DD (US Eastern game dates, inclusive). */
  start: string
  end: string
  projLine: Record<string, Record<string, number>>
  games: NbaGame[]
}

async function getJson(url: string): Promise<unknown> {
  const res = await fetch(url, { headers: { Accept: 'application/json', 'User-Agent': 'EdgeTilt/1.0' } })
  if (!res.ok) throw new Error(`${res.status} ${url}`)
  return await res.json()
}

const ymd = (ms: number) => new Date(ms).toISOString().slice(0, 10)
const dayMs = (date: string) => Date.parse(`${date}T00:00:00Z`)

/** Week `week` window from the season's first game date. */
export function nbaWeekWindow(seasonStart: string, week: number): { start: string; end: string } | null {
  const first = dayMs(seasonStart)
  if (!Number.isFinite(first)) return null
  const dow = new Date(first).getUTCDay()
  const firstSunday = first + ((7 - dow) % 7) * DAY_MS
  if (week <= 1) return { start: ymd(first), end: ymd(firstSunday) }
  const start = firstSunday + DAY_MS + (week - 2) * 7 * DAY_MS
  return { start: ymd(start), end: ymd(start + 6 * DAY_MS) }
}

function perGameLines(raw: unknown): Record<string, Record<string, number>> {
  const out: Record<string, Record<string, number>> = {}
  const rows = Array.isArray(raw)
    ? Object.fromEntries((raw as Array<Record<string, unknown>>).map((r) => [String(r?.player_id || ''), r?.stats]))
    : (raw as Record<string, unknown>) || {}
  for (const [id, stats] of Object.entries(rows)) {
    if (!id || !stats || typeof stats !== 'object') continue
    const s = stats as Record<string, unknown>
    if (!(Number(s.gp) > 0)) continue
    const line: Record<string, number> = {}
    for (const [k, v] of Object.entries(s)) {
      const n = Number(v)
      if (SKIP_KEYS.has(k) || !Number.isFinite(n) || n === 0) continue
      line[k] = Math.round(n * 1000) / 1000
    }
    if (Object.keys(line).length) out[id] = line
  }
  return out
}

async function weekGames(start: string, end: string): Promise<NbaGame[]> {
  const dates: string[] = []
  for (let t = dayMs(start); t <= dayMs(end); t += DAY_MS) dates.push(ymd(t).replace(/-/g, ''))
  const days = await Promise.all(
    dates.map((d) => getJson(`${ESPN_SCOREBOARD}?dates=${d}`).catch(() => null)),
  )
  const games: NbaGame[] = []
  const seen = new Set<string>()
  for (const day of days) {
    const events = ((day as { events?: unknown[] } | null)?.events || []) as Array<Record<string, any>>
    for (const e of events) {
      const id = String(e?.id || '')
      if (!id || seen.has(id)) continue
      const comp = e?.competitions?.[0]
      const sides = Array.isArray(comp?.competitors) ? comp.competitors : []
      const home = sides.find((c: any) => c?.homeAway === 'home')
      const away = sides.find((c: any) => c?.homeAway === 'away')
      if (!home || !away) continue
      const state = String(comp?.status?.type?.state || e?.status?.type?.state || 'pre')
      seen.add(id)
      games.push({
        id,
        date: String(e?.date || comp?.date || ''),
        home: nbaTeam(home?.team?.abbreviation),
        away: nbaTeam(away?.team?.abbreviation),
        state: state === 'in' ? 'in' : state === 'post' ? 'post' : 'pre',
      })
    }
  }
  return games.sort((a, b) => Date.parse(a.date) - Date.parse(b.date))
}

export async function loadNbaBoard(): Promise<NbaBoard | null> {
  const state = (await getJson(`${SLEEPER}/state/nba`).catch(() => null)) as
    | { season?: string; week?: number; season_start_date?: string }
    | null
  const season = String(state?.season || '')
  const week = Math.max(1, Number(state?.week) || 1)
  const window = state?.season_start_date ? nbaWeekWindow(state.season_start_date, week) : null
  if (!season || !window) return null

  const [projLine, games] = await Promise.all([
    sharedCached(
      `fantasy:nba-proj:${season}:${week}`,
      { ttlMs: 60 * 60 * 1000, staleMaxMs: 6 * 60 * 60 * 1000, shouldStore: (v) => Object.keys(v).length > 0 },
      async () => perGameLines(await getJson(`${SLEEPER}/projections/nba/regular/${season}/${week}`)),
    ).catch(() => ({} as Record<string, Record<string, number>>)),
    sharedCached(
      `fantasy:nba-week-games:${season}:${week}`,
      { ttlMs: 5 * 60 * 1000, staleMaxMs: 60 * 60 * 1000, shouldStore: (v) => v.length > 0 },
      () => weekGames(window.start, window.end),
    ).catch(() => [] as NbaGame[]),
  ])
  return { season, week, start: window.start, end: window.end, projLine, games }
}

/** This team's games in the board week: total, not yet tipped, today's live one, and the next tip. */
export function teamWeek(board: NbaBoard, team: string | null | undefined) {
  const t = nbaTeam(team)
  const mine = t ? board.games.filter((g) => g.home === t || g.away === t) : []
  const left = mine.filter((g) => g.state === 'pre')
  const live = mine.find((g) => g.state === 'in') || null
  const next = live || left[0] || null
  return {
    games_week: mine.length,
    games_left: left.length,
    games_played: mine.filter((g) => g.state === 'post').length,
    live,
    next,
    opponent: next ? (next.home === t ? next.away : next.home) : null,
    home: next ? next.home === t : null,
  }
}
