/**
 * Compact lineup context for Fantasy home.
 * Season PPR, weekly projection, and kickoff are Sleeper + ESPN.
 * Position rank is season PPR among nfl_players at that position (Sleeper pos_rank_ppr is empty).
 * Matchup grade is points the opponent has allowed to that position in completed weeks.
 * Rank 1 is the easiest (most allowed). A/B/C/D are quartiles of that rank.
 * Props are open Kalshi strikes. `stat` is the series (pass_yds, rush_yds, rec_yds, …).
 * `price` is the yes ask and `no` is the no ask. The home screen picks the main line by position.
 */
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2'
import { loadFantasyLiveMap, lookupLive } from './fantasyLiveLines.ts'
import { kalshiMarketUrls } from './loungeNflGameFantasy.ts'

const KALSHI_BASE = 'https://external-api.kalshi.com/trade-api/v2'
const PROP_SERIES = ['KXNFLPASSYDS', 'KXNFLRSHYDS', 'KXNFLRECYDS', 'KXNFLREC', 'KXNFLTD'] as const
const CACHE_MS = 15 * 60 * 1000

type PlayerIn = { sleeper_id?: string; name?: string; position?: string; team?: string }

type PropOut = {
  label: string
  price: number | null
  no: number | null
  volume: number
  stat: string | null
  source: 'kalshi'
  url_market: string
  url_yes: string
  url_no: string
}

const SERIES_STAT: Record<string, string> = {
  KXNFLPASSYDS: 'pass_yds',
  KXNFLRSHYDS: 'rush_yds',
  KXNFLRECYDS: 'rec_yds',
  KXNFLREC: 'rec',
  KXNFLTD: 'td',
}

export type LineupCard = {
  sleeper_id: string
  opponent: string | null
  home: boolean | null
  bye: boolean
  kickoff: string | null
  game_date: string | null
  game_status: string | null
  total: number | null
  avg: number | null
  gp: number | null
  projected: number | null
  week_pts: number | null
  pos_rank: number | null
  pos_rank_of: number | null
  matchup_grade: 'A' | 'B' | 'C' | 'D' | null
  matchup_rank: number | null
  matchup_of: number | null
  main_prop: PropOut | null
  props: PropOut[]
  /** Counting stats for this league's scoring rules. Null until the ESPN box has the player. */
  line?: Record<string, number> | null
  /** Sleeper's projected counting stats for this week (same keys as `line`). */
  proj_line?: Record<string, number> | null
}

export type GameRow = {
  week: number
  status: string
  home: string
  away: string
  date: string
}

type Board = {
  at: number
  season: string
  week: number
  games: GameRow[]
  kickoffByTeam: Map<string, string>
  total: Map<string, number>
  gp: Map<string, number>
  projected: Map<string, number>
  projLine: Map<string, Record<string, number>>
  weekPts: Map<string, number>
  posRank: Map<string, { rank: number; of: number }>
  matchup: Map<string, { rank: number; of: number; grade: 'A' | 'B' | 'C' | 'D' }>
  teamById: Map<string, string>
  posById: Map<string, string>
  nameById: Map<string, string>
  propsByName: Map<string, Array<PropOut & { teams: string }>>
}

let boardCache: Board | null = null

export function normTeam(team: string | null | undefined): string {
  const t = String(team || '').trim().toUpperCase().replace(/[^A-Z]/g, '')
  if (t === 'WSH') return 'WAS'
  if (t === 'JAC') return 'JAX'
  return t
}

function kalshiTeam(team: string): string {
  const t = normTeam(team)
  return t === 'JAX' ? 'JAC' : t
}

export function fantasyPos(position: string | null | undefined): string {
  const p = String(position || '').toUpperCase().replace(/[^A-Z]/g, '')
  if (p === 'FB' || p === 'HB') return 'RB'
  if (p === 'DST' || p === 'D' || p === 'DEF') return 'DEF'
  if (p === 'PK') return 'K'
  return p
}

function num(v: unknown): number | null {
  const n = Number(v)
  return Number.isFinite(n) ? Math.round(n * 10) / 10 : null
}

function nameKey(name: string): string {
  return String(name || '')
    .toLowerCase()
    .replace(/\b(jr|sr|ii|iii|iv|v)\b/gi, '')
    .replace(/[^a-z0-9]/g, '')
}

function gradeFor(rank: number, of: number): 'A' | 'B' | 'C' | 'D' {
  const q = rank / Math.max(of, 1)
  if (q <= 0.25) return 'A'
  if (q <= 0.5) return 'B'
  if (q <= 0.75) return 'C'
  return 'D'
}

export async function fetchJson(url: string): Promise<unknown> {
  let last: Error | null = null
  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await fetch(url, {
      headers: {
        Accept: 'application/json',
        'User-Agent': 'EdgeTilt-fantasy-lineup-cards/1.0',
      },
    })
    if (res.status === 429) {
      await new Promise((r) => setTimeout(r, 400 * 2 ** attempt))
      last = new Error(`${url} → 429`)
      continue
    }
    if (!res.ok) throw new Error(`${url} → ${res.status}`)
    return res.json()
  }
  throw last || new Error(`${url} → failed`)
}

export function statMap(raw: unknown): Map<string, Record<string, unknown>> {
  const out = new Map<string, Record<string, unknown>>()
  if (!raw || typeof raw !== 'object') return out
  for (const [id, row] of Object.entries(raw as Record<string, unknown>)) {
    if (!row || typeof row !== 'object') continue
    const r = row as Record<string, unknown>
    const stats = r.stats && typeof r.stats === 'object' ? (r.stats as Record<string, unknown>) : r
    out.set(String(id), stats)
  }
  return out
}

const PROJ_LINE_KEYS = ['pass_yd', 'pass_td', 'pass_int', 'rush_yd', 'rush_td', 'rec', 'rec_yd', 'rec_td', 'fgm', 'xpm']

function projStatLine(stats: Record<string, unknown> | undefined): Record<string, number> | null {
  if (!stats) return null
  const out: Record<string, number> = {}
  for (const key of PROJ_LINE_KEYS) {
    const v = num(stats[key])
    if (v != null && v > 0) out[key] = Math.round(v * 10) / 10
  }
  return Object.keys(out).length ? out : null
}

export function ptsOf(stats: Record<string, unknown> | undefined): number | null {
  if (!stats) return null
  return num(stats.pts_ppr ?? stats.pts_half_ppr ?? stats.pts_std)
}

export async function loadGames(season: string): Promise<GameRow[]> {
  const raw = (await fetchJson(`https://api.sleeper.app/schedule/nfl/regular/${season}`)) as unknown[]
  if (!Array.isArray(raw)) return []
  const out: GameRow[] = []
  for (const row of raw) {
    if (!row || typeof row !== 'object') continue
    const g = row as Record<string, unknown>
    const week = Number(g.week)
    const home = normTeam(String(g.home || ''))
    const away = normTeam(String(g.away || ''))
    if (!week || !home || !away) continue
    out.push({
      week,
      status: String(g.status || ''),
      home,
      away,
      date: String(g.date || ''),
    })
  }
  return out
}

async function loadKickoffs(season: string, week: number): Promise<Map<string, string>> {
  const map = new Map<string, string>()
  try {
    const raw = (await fetchJson(
      `https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard?week=${week}&seasontype=2&dates=${season}`,
    )) as { events?: Array<Record<string, unknown>> }
    for (const ev of raw.events || []) {
      const when = String(ev.date || '')
      const comps = (ev.competitions as Array<Record<string, unknown>> | undefined) || []
      const teams = (comps[0]?.competitors as Array<Record<string, unknown>> | undefined) || []
      for (const side of teams) {
        const team = side.team as Record<string, unknown> | undefined
        const abbr = normTeam(String(team?.abbreviation || ''))
        if (abbr && when) map.set(abbr, when)
      }
    }
  } catch {
    /* kickoff is optional */
  }
  return map
}

function findGame(games: GameRow[], week: number, team: string): GameRow | null {
  const t = normTeam(team)
  return games.find((g) => g.week === week && (g.home === t || g.away === t)) || null
}

function liquidity(m: Record<string, unknown>): number {
  const n = (v: unknown) => {
    const x = Number(v)
    return Number.isFinite(x) ? x : 0
  }
  return n(m.volume_24h_fp ?? m.volume_24h) * 2 + n(m.volume_fp ?? m.volume) + n(m.open_interest_fp ?? m.open_interest)
}

function askPrice(m: Record<string, unknown>, side: 'yes' | 'no'): number | null {
  const raw = Number(side === 'yes' ? (m.yes_ask_dollars ?? m.yes_ask) : (m.no_ask_dollars ?? m.no_ask))
  if (!Number.isFinite(raw) || raw <= 0 || raw >= 1) return null
  return Math.round(raw * 100) / 100
}

async function loadProps(): Promise<Map<string, Array<PropOut & { teams: string }>>> {
  const byName = new Map<string, Array<PropOut & { teams: string }>>()
  const pages = await Promise.all(
    PROP_SERIES.map(async (series) => {
      const rows: Array<{ market: Record<string, unknown>; stat: string; series: string }> = []
      let cursor = ''
      for (let page = 0; page < 6; page++) {
        const q = new URLSearchParams({ series_ticker: series, status: 'open', limit: '200' })
        if (cursor) q.set('cursor', cursor)
        try {
          const data = (await fetchJson(`${KALSHI_BASE}/markets?${q}`)) as {
            markets?: Record<string, unknown>[]
            cursor?: string
          }
          const markets = Array.isArray(data.markets) ? data.markets : []
          for (const market of markets) rows.push({ market, stat: SERIES_STAT[series] || '', series })
          cursor = String(data.cursor || '')
          if (!cursor || markets.length === 0) break
        } catch {
          break
        }
      }
      return rows
    }),
  )
  for (const markets of pages) {
    for (const { market: m, stat, series } of markets) {
      const title = String(m.title || '').trim()
      const cut = title.indexOf(':')
      if (cut <= 0) continue
      const player = title.slice(0, cut).trim()
      const label = title.slice(cut + 1).trim()
      if (!player || !label || player.length > 48) continue
      const key = nameKey(player)
      if (!key) continue
      const urls = kalshiMarketUrls(series, String(m.event_ticker || ''), String(m.ticker || ''))
      const row: PropOut & { teams: string } = {
        label,
        price: askPrice(m, 'yes'),
        no: askPrice(m, 'no'),
        volume: Math.round(liquidity(m)),
        stat: stat || null,
        source: 'kalshi',
        url_market: urls.marketUrl,
        url_yes: urls.yesUrl,
        url_no: urls.noUrl,
        teams: String(m.event_ticker || '').toUpperCase(),
      }
      const list = byName.get(key) || []
      list.push(row)
      byName.set(key, list)
    }
  }
  for (const list of byName.values()) list.sort((a, b) => b.volume - a.volume)
  return byName
}

async function loadBoard(admin: SupabaseClient): Promise<Board> {
  if (boardCache && Date.now() - boardCache.at < CACHE_MS) return boardCache

  const state = (await fetchJson('https://api.sleeper.app/v1/state/nfl')) as {
    week?: number
    season?: string
    season_type?: string
  }
  const season = String(state.season || '')
  const week = Number(state.week) || 1
  if (!season) throw new Error('NFL season missing.')

  const pastWeeks = []
  for (let w = 1; w < week; w++) pastWeeks.push(w)

  const [games, kickoffByTeam, seasonStats, projections, weekStats, pastStatList, playerRows] = await Promise.all([
    loadGames(season),
    loadKickoffs(season, week),
    fetchJson(`https://api.sleeper.app/v1/stats/nfl/regular/${season}`).then(statMap).catch(() => new Map()),
    fetchJson(`https://api.sleeper.app/v1/projections/nfl/regular/${season}/${week}`).then(statMap).catch(() => new Map()),
    fetchJson(`https://api.sleeper.app/v1/stats/nfl/regular/${season}/${week}`).then(statMap).catch(() => new Map()),
    Promise.all(
      pastWeeks.map((w) =>
        fetchJson(`https://api.sleeper.app/v1/stats/nfl/regular/${season}/${w}`).then(statMap).catch(() => new Map()),
      ),
    ),
    admin.from('nfl_players').select('sleeper_id, full_name, position, team').limit(2000),
  ])

  const teamById = new Map<string, string>()
  const posById = new Map<string, string>()
  const nameById = new Map<string, string>()
  for (const row of playerRows.data || []) {
    const id = String(row.sleeper_id || '')
    if (!id) continue
    teamById.set(id, normTeam(row.team))
    posById.set(id, fantasyPos(row.position))
    nameById.set(id, String(row.full_name || ''))
  }

  const total = new Map<string, number>()
  const gp = new Map<string, number>()
  for (const [id, stats] of seasonStats) {
    const pts = ptsOf(stats)
    const games = num(stats.gp)
    if (pts != null) total.set(id, pts)
    if (games != null) gp.set(id, games)
  }

  const projected = new Map<string, number>()
  const projLine = new Map<string, Record<string, number>>()
  for (const [id, stats] of projections) {
    const pts = ptsOf(stats)
    if (pts != null) projected.set(id, pts)
    const line = projStatLine(stats)
    if (line) projLine.set(id, line)
  }

  const weekPts = new Map<string, number>()
  for (const [id, stats] of weekStats) {
    const pts = ptsOf(stats)
    if (pts != null) weekPts.set(id, pts)
  }

  const byPos = new Map<string, Array<{ id: string; pts: number }>>()
  for (const [id, pts] of total) {
    const pos = posById.get(id)
    if (!pos) continue
    const list = byPos.get(pos) || []
    list.push({ id, pts })
    byPos.set(pos, list)
  }
  const posRank = new Map<string, { rank: number; of: number }>()
  for (const list of byPos.values()) {
    list.sort((a, b) => b.pts - a.pts)
    list.forEach((row, i) => posRank.set(row.id, { rank: i + 1, of: list.length }))
  }

  const allowed = new Map<string, { pts: number; games: number }>()
  pastStatList.forEach((weekMap, idx) => {
    const w = pastWeeks[idx]
    for (const [id, stats] of weekMap) {
      if (!/^\d+$/.test(id)) continue
      const pts = ptsOf(stats)
      const pos = posById.get(id)
      const team = teamById.get(id)
      if (pts == null || !pos || !team) continue
      const game = findGame(games, w, team)
      if (!game || game.status !== 'complete') continue
      const opp = game.home === team ? game.away : game.home
      const key = `${opp}|${pos}`
      const bucket = allowed.get(key) || { pts: 0, games: 0 }
      bucket.pts += pts
      bucket.games += 1
      allowed.set(key, bucket)
    }
  })

  const byOppPos = new Map<string, Array<{ team: string; pts: number }>>()
  for (const [key, bucket] of allowed) {
    if (bucket.games < 1) continue
    const [team, pos] = key.split('|')
    const list = byOppPos.get(pos) || []
    list.push({ team, pts: bucket.pts })
    byOppPos.set(pos, list)
  }
  const matchup = new Map<string, { rank: number; of: number; grade: 'A' | 'B' | 'C' | 'D' }>()
  for (const [pos, list] of byOppPos) {
    list.sort((a, b) => b.pts - a.pts)
    list.forEach((row, i) => {
      const rank = i + 1
      matchup.set(`${row.team}|${pos}`, { rank, of: list.length, grade: gradeFor(rank, list.length) })
    })
  }

  const propsByName = await loadProps().catch(() => new Map<string, Array<PropOut & { teams: string }>>())

  boardCache = {
    at: Date.now(),
    season,
    week,
    games,
    kickoffByTeam,
    total,
    gp,
    projected,
    projLine,
    weekPts,
    posRank,
    matchup,
    teamById,
    posById,
    nameById,
    propsByName,
  }
  return boardCache
}

function propsFor(board: Board, name: string, away: string, home: string): PropOut[] {
  const list = board.propsByName.get(nameKey(name)) || []
  const a = kalshiTeam(away)
  const h = kalshiTeam(home)
  const matched = list.filter((p) => !a || !h || p.teams.includes(a + h) || p.teams.includes(h + a))
  const use = matched.length ? matched : []
  const bestByStat = new Map<string, PropOut & { teams: string }>()
  const rest: Array<PropOut & { teams: string }> = []
  for (const row of use) {
    const key = row.stat || row.label
    if (!bestByStat.has(key)) bestByStat.set(key, row)
    else rest.push(row)
  }
  return [...bestByStat.values(), ...rest].slice(0, 12).map(({ teams: _teams, ...prop }) => prop)
}

export async function buildFantasyLineupCards(
  admin: SupabaseClient,
  players: PlayerIn[],
): Promise<{ season: string; week: number; cards: Record<string, LineupCard> }> {
  const board = await loadBoard(admin)
  const cards: Record<string, LineupCard> = {}
  const seen = new Set<string>()
  for (const raw of players) {
    const id = String(raw?.sleeper_id || '').trim()
    if (!id || seen.has(id)) continue
    seen.add(id)
    if (seen.size > 250) break
    const team = board.teamById.get(id) || normTeam(raw.team)
    const pos = board.posById.get(id) || fantasyPos(raw.position)
    const name = board.nameById.get(id) || String(raw.name || '')
    const game = team ? findGame(board.games, board.week, team) : null
    const bye = Boolean(team) && !game
    const opponent = game ? (game.home === team ? game.away : game.home) : null
    const home = game ? game.home === team : null
    const seasonPts = board.total.get(id) ?? null
    const gamesPlayed = board.gp.get(id) ?? null
    const avg = seasonPts != null && gamesPlayed != null && gamesPlayed > 0
      ? Math.round((seasonPts / gamesPlayed) * 10) / 10
      : null
    const rank = board.posRank.get(id) || null
    const mu = opponent && pos ? board.matchup.get(`${opponent}|${pos}`) || null : null
    const props = game && name ? propsFor(board, name, game.away, game.home) : []
    cards[id] = {
      sleeper_id: id,
      opponent,
      home,
      bye,
      kickoff: team ? board.kickoffByTeam.get(team) || null : null,
      game_date: game?.date || null,
      game_status: game?.status || null,
      total: seasonPts,
      avg,
      gp: gamesPlayed,
      projected: board.projected.get(id) ?? null,
      week_pts: board.weekPts.get(id) ?? null,
      pos_rank: rank?.rank ?? null,
      pos_rank_of: rank?.of ?? null,
      matchup_grade: mu?.grade ?? null,
      matchup_rank: mu?.rank ?? null,
      matchup_of: mu?.of ?? null,
      main_prop: props[0] || null,
      props,
      line: null,
      proj_line: board.projLine?.get(id) || null,
    }
  }
  await mergeLiveLines(cards, players, 'nfl', { season: board.season, week: board.week })
  return { season: board.season, week: board.week, cards }
}

function emptyCard(id: string): LineupCard {
  return {
    sleeper_id: id,
    opponent: null,
    home: null,
    bye: false,
    kickoff: null,
    game_date: null,
    game_status: null,
    total: null,
    avg: null,
    gp: null,
    projected: null,
    week_pts: null,
    pos_rank: null,
    pos_rank_of: null,
    matchup_grade: null,
    matchup_rank: null,
    matchup_of: null,
    main_prop: null,
    props: [],
    line: null,
  }
}

async function mergeLiveLines(
  cards: Record<string, LineupCard>,
  players: PlayerIn[],
  sport: string,
  opts: { season?: string; week?: number },
) {
  const live = await loadFantasyLiveMap(sport, opts)
  if (!live.size) return
  for (const raw of players) {
    const id = String(raw?.sleeper_id || '').trim()
    const card = id ? cards[id] : null
    if (!card) continue
    const hit = lookupLive(live, String(raw.name || ''), raw.team)
    if (!hit) continue
    if (hit.line) card.line = hit.line
    if (hit.kickoff) card.kickoff = hit.kickoff
    if (hit.opponent) {
      card.opponent = hit.opponent
      card.home = hit.home
    }
    if (hit.game_status === 'in_progress' || hit.game_status === 'final') card.game_status = hit.game_status
  }
}

/** NBA, NHL, and MLB have no Sleeper football board. The card is the ESPN line plus the tip time. */
export async function buildSportLineupCards(
  players: PlayerIn[],
  sport: string,
): Promise<{ season: string; week: number; cards: Record<string, LineupCard> }> {
  const cards: Record<string, LineupCard> = {}
  const seen = new Set<string>()
  const list: PlayerIn[] = []
  for (const raw of players) {
    const id = String(raw?.sleeper_id || '').trim()
    if (!id || seen.has(id)) continue
    seen.add(id)
    if (seen.size > 250) break
    list.push({ ...raw, sleeper_id: id })
    cards[id] = emptyCard(id)
  }
  await mergeLiveLines(cards, list, sport, {})
  return { season: '', week: 0, cards }
}
