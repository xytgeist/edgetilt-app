/**
 * Waiver pool for one league: every NFL player not rostered by any team in it ("available in your league"),
 * shortlisted by the next four weeks of Sleeper projections. Each player carries per-week projected stat lines
 * so the app scores them in league rules (the same `scoreLine` Start/Sit uses) and ranks them against the
 * user's own roster. Host waiver order and pending claims are not visible here.
 */
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2'
import { fantasyPos, fetchJson, loadGames, normTeam, ptsOf, statMap, type GameRow } from './fantasyLineupCards.ts'

const WEEKS_AHEAD = 4
const CACHE_MS = 20 * 60 * 1000
const POSITIONS = ['QB', 'RB', 'WR', 'TE', 'K', 'DEF']
const SHORTLIST: Record<string, number> = { QB: 20, RB: 35, WR: 40, TE: 20, K: 10, DEF: 12 }
const LINE_KEYS = ['pass_yd', 'pass_td', 'pass_int', 'rush_yd', 'rush_td', 'rec', 'rec_yd', 'rec_td', 'fum_lost', 'fgm', 'xpm']

type WeekOut = { week: number; bye: boolean; opp: string | null; home: boolean | null; ppr: number | null; line: Record<string, number> | null }

export type WaiverPlayer = {
  sleeper_id: string
  name: string
  position: string
  team: string | null
  injury_status: string | null
  headshot_url: string | null
  weeks: WeekOut[]
}

type ProjBoard = {
  at: number
  season: string
  week: number
  weeks: number[]
  games: GameRow[]
  proj: Map<number, Map<string, Record<string, unknown>>>
}

let boardCache: ProjBoard | null = null

function etParts(d = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    hour12: false,
  }).formatToParts(d)
  const get = (t: string) => parts.find((p) => p.type === t)?.value || ''
  return { ymd: `${get('year')}-${get('month')}-${get('day')}`, hour: Number(get('hour')) || 0 }
}

/**
 * Sleeper keeps `week` on the current week until Tuesday. Once most of its games have kicked off
 * (Sunday late afternoon ET onward), pickups are for next week, so the horizon starts there.
 */
function weekMostlyPlayed(games: GameRow[], week: number): boolean {
  const list = games.filter((g) => g.week === week && g.date)
  if (!list.length) return false
  const { ymd, hour } = etParts()
  const before = list.filter((g) => g.date < ymd).length
  const today = list.filter((g) => g.date === ymd).length
  if (before === list.length) return true
  return (before + today) / list.length >= 0.75 && today > 0 && hour >= 16
}

async function loadProjBoard(): Promise<ProjBoard> {
  if (boardCache && Date.now() - boardCache.at < CACHE_MS) return boardCache
  const state = (await fetchJson('https://api.sleeper.app/v1/state/nfl')) as { week?: number; season?: string }
  const season = String(state.season || '')
  const week = Math.max(1, Number(state.week) || 1)
  if (!season) throw new Error('NFL season missing.')
  const games = await loadGames(season).catch(() => [] as GameRow[])
  const start = weekMostlyPlayed(games, week) ? week + 1 : week
  const weeks = Array.from({ length: WEEKS_AHEAD }, (_, i) => start + i).filter((w) => w <= 18)
  const projList = await Promise.all([
    ...weeks.map((w) =>
      fetchJson(`https://api.sleeper.app/v1/projections/nfl/regular/${season}/${w}`).then(statMap).catch(() => new Map()),
    ),
  ])
  const proj = new Map<number, Map<string, Record<string, unknown>>>()
  weeks.forEach((w, i) => proj.set(w, projList[i] as Map<string, Record<string, unknown>>))
  boardCache = { at: Date.now(), season, week, weeks, games, proj }
  return boardCache
}

function lineOf(stats: Record<string, unknown> | undefined): Record<string, number> | null {
  if (!stats) return null
  const out: Record<string, number> = {}
  for (const key of LINE_KEYS) {
    const v = Number(stats[key])
    if (Number.isFinite(v) && v !== 0) out[key] = Math.round(v * 10) / 10
  }
  return Object.keys(out).length ? out : null
}

function weeksFor(board: ProjBoard, id: string, team: string | null): WeekOut[] {
  const t = normTeam(team)
  return board.weeks.map((week) => {
    const game = t ? board.games.find((g) => g.week === week && (g.home === t || g.away === t)) || null : null
    const bye = Boolean(t) && board.games.some((g) => g.week === week) && !game
    const stats = board.proj.get(week)?.get(id)
    return {
      week,
      bye,
      opp: game ? (game.home === t ? game.away : game.home) : null,
      home: game ? game.home === t : null,
      ppr: bye ? 0 : ptsOf(stats),
      line: bye ? null : lineOf(stats),
    }
  })
}

function horizonPpr(weeks: WeekOut[]): number {
  return weeks.reduce((acc, w) => acc + (Number(w.ppr) || 0), 0)
}

export async function buildFantasyWaivers(
  admin: SupabaseClient,
  userId: string,
  leagueId: string,
): Promise<Record<string, unknown>> {
  const { data: league, error: lgErr } = await admin
    .from('fantasy_leagues')
    .select('id, sport')
    .eq('id', leagueId)
    .eq('user_id', userId)
    .maybeSingle()
  if (lgErr) throw new Error(lgErr.message)
  if (!league) throw new Error('League not found.')
  if (String(league.sport || 'nfl').toLowerCase() !== 'nfl') {
    return { supported: false, players: [], roster: [] }
  }

  const { data: teams, error: tErr } = await admin.from('fantasy_teams').select('id, is_mine').eq('league_id', leagueId)
  if (tErr) throw new Error(tErr.message)
  const teamIds = (teams || []).map((t) => String(t.id))
  const mineId = String((teams || []).find((t) => t.is_mine)?.id || '')
  if (!teamIds.length) return { supported: true, players: [], roster: [] }

  const { data: rows, error: rErr } = await admin
    .from('fantasy_rosters')
    .select('team_id, week, sleeper_id, position, nfl_team')
    .in('team_id', teamIds)
  if (rErr) throw new Error(rErr.message)
  const latest = new Map<string, number>()
  for (const r of rows || []) latest.set(String(r.team_id), Math.max(latest.get(String(r.team_id)) || 0, Number(r.week) || 0))
  const rostered = new Set<string>()
  const mineIds = new Set<string>()
  for (const r of rows || []) {
    if ((Number(r.week) || 0) !== latest.get(String(r.team_id))) continue
    // Host D/ST rows rarely resolve a Sleeper id; Sleeper keys team defenses by abbreviation (HOU).
    const id = r.sleeper_id ? String(r.sleeper_id) : fantasyPos(r.position) === 'DEF' && r.nfl_team ? normTeam(r.nfl_team) : ''
    if (!id) continue
    rostered.add(id)
    if (String(r.team_id) === mineId) mineIds.add(id)
  }

  const [board, playersRes] = await Promise.all([
    loadProjBoard(),
    admin
      .from('nfl_players')
      .select('sleeper_id, full_name, position, team, status, injury_status, headshot_url, local_headshot_path')
      .in('position', POSITIONS)
      .limit(3000),
  ])
  if (playersRes.error) throw new Error(playersRes.error.message)

  const byPos = new Map<string, Array<{ p: WaiverPlayer; horizon: number }>>()
  const roster: WaiverPlayer[] = []
  for (const row of playersRes.data || []) {
    const id = String(row.sleeper_id || '')
    if (!id) continue
    const position = fantasyPos(row.position)
    const out: WaiverPlayer = {
      sleeper_id: id,
      name: String(row.full_name || ''),
      position,
      team: row.team ? normTeam(row.team) : null,
      injury_status: row.injury_status || null,
      headshot_url: row.headshot_url || row.local_headshot_path || null,
      weeks: weeksFor(board, id, row.team),
    }
    if (mineIds.has(id)) {
      roster.push(out)
      continue
    }
    if (rostered.has(id)) continue
    const status = String(row.status || '').toLowerCase()
    if (status && status !== 'active') continue
    const horizon = horizonPpr(out.weeks)
    if (horizon <= 0) continue
    const list = byPos.get(position) || []
    list.push({ p: out, horizon })
    byPos.set(position, list)
  }

  const players: WaiverPlayer[] = []
  for (const [pos, list] of byPos) {
    list.sort((a, b) => b.horizon - a.horizon)
    for (const { p } of list.slice(0, SHORTLIST[pos] || 10)) players.push(p)
  }

  return { supported: true, season: board.season, week: board.week, weeks: board.weeks, players, roster }
}
