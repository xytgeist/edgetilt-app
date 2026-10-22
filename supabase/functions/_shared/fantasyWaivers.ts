/**
 * Waiver pool for one league: every NFL player not rostered by any team in it ("available in your league"),
 * shortlisted by the next four weeks of Sleeper projections. Each player carries per-week projected stat lines
 * so the app scores them in league rules (the same `scoreLine` Start/Sit uses) and ranks them against the
 * user's own roster. Host waiver order and pending claims are not visible here.
 */
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2'
import {
  fantasyPos,
  fetchJson,
  loadBoard,
  loadGames,
  normTeam,
  projStatLine,
  propsFor,
  ptsOf,
  statMap,
  type GameRow,
} from './fantasyLineupCards.ts'
import { sharedCached } from './edgeSharedCache.ts'
import { loadNbaBoard, nbaTeam, teamWeek, weekGames, type NbaBoard } from './fantasyNbaBoard.ts'
import { nbaHeadshots, sleeperNbaPlayers } from './sleeperNbaPlayers.ts'
// The app's Lock-In math (plain ESM): one game per player per week counts in Sleeper NBA.
import { lockInFactor, nbaLockIn } from '../../../src/features/fantasy/fantasyLockIn.js'

const WEEKS_AHEAD = 4
const CACHE_MS = 20 * 60 * 1000
const POSITIONS = ['QB', 'RB', 'WR', 'TE', 'K', 'DEF']
const SHORTLIST: Record<string, number> = { QB: 20, RB: 35, WR: 40, TE: 20, K: 10, DEF: 12 }

type WeekOut = { week: number; bye: boolean; opp: string | null; home: boolean | null; ppr: number | null; line: Record<string, number> | null }

export type WaiverPlayer = {
  sleeper_id: string
  name: string
  position: string
  team: string | null
  injury_status: string | null
  headshot_url: string | null
  weeks: WeekOut[]
  /** Trades mode only: rest-of-season + season lines, team games left, ESPN return date. */
  trade?: (TradeEntry & { team_games: number; return_date: string | null }) | null
  /** Trades mode only: FantasyCalc redraft trade value for this league's format (null when unlisted). */
  market_value?: number | null
}

type MarketParams = { numTeams: number; numQbs: 1 | 2; ppr: 0 | 0.5 | 1 }

/** FantasyCalc formats: team counts it prices, superflex when a lineup can start two QBs, PPR from the rules. */
function marketParams(league: { scoring?: unknown; settings?: unknown }, teamCount: number): MarketParams {
  const sizes = [8, 10, 12, 14, 16]
  const numTeams = sizes.reduce((best, n) => (Math.abs(n - teamCount) < Math.abs(best - teamCount) ? n : best), 12)
  const settings = (league.settings && typeof league.settings === 'object' ? league.settings : {}) as Record<string, unknown>
  const slots = (Array.isArray(settings.lineup_slots) ? settings.lineup_slots : Array.isArray(settings.roster_positions) ? settings.roster_positions : []) as unknown[]
  const names = slots.map((x) => String(x || '').toUpperCase())
  const superflex = names.some((n) => /SUPER|^OP$|Q\/W\/R\/T/.test(n)) || names.filter((n) => n === 'QB').length >= 2
  const rec = Number((league.scoring as Record<string, unknown> | null)?.rec) || 0
  const ppr = rec >= 0.75 ? 1 : rec >= 0.25 ? 0.5 : 0
  return { numTeams, numQbs: superflex ? 2 : 1, ppr }
}

/** Sleeper id -> FantasyCalc redraft value (built from real trades). Shared 6h per format. */
function loadMarketValues(admin: SupabaseClient, params: MarketParams): Promise<Record<string, number>> {
  const key = `fantasy:market-values:${params.numTeams}:${params.numQbs}:${params.ppr}`
  return sharedCached<Record<string, number>>(
    key,
    { ttlMs: 6 * 60 * 60_000, leaseMs: 60_000, staleMaxMs: 48 * 60 * 60_000, admin, shouldStore: (v) => Object.keys(v).length > 0 },
    async () => {
      const url = `https://api.fantasycalc.com/values/current?isDynasty=false&numQbs=${params.numQbs}&numTeams=${params.numTeams}&ppr=${params.ppr}`
      const rows = (await fetchJson(url).catch(() => [])) as Array<{ value?: number; player?: { sleeperId?: string | number } }>
      const out: Record<string, number> = {}
      for (const r of Array.isArray(rows) ? rows : []) {
        const id = String(r.player?.sleeperId || '')
        const v = Number(r.value)
        if (id && Number.isFinite(v)) out[id] = v
      }
      return out
    },
  )
}

/** Last week the trade value counts (fantasy playoffs end week 17). */
const TRADE_LAST_WEEK = 17

/** Rest-of-season and season-to-date stat lines, summed, for trade value. The app scores them in league rules. */
type TradeEntry = { ros_line: Record<string, number>; ros_games: number; season_line: Record<string, number>; season_games: number }
type TradeBoard = { start: number; weeks_left: number; team_games: Record<string, number>; players: Record<string, TradeEntry> }

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
      line: bye ? null : projStatLine(stats),
    }
  })
}

function addLine(into: Record<string, number>, line: Record<string, number> | null) {
  if (!line) return
  for (const [k, v] of Object.entries(line)) into[k] = Math.round(((into[k] || 0) + v) * 100) / 100
}

/**
 * Every Sleeper projection from the horizon start through week 17 plus every played week so far, summed per
 * player. Sleeper projects injured weeks at 0, so `ros_games` only counts weeks with a projection (a healthy
 * per-game rate); games left come from `team_games` minus expected misses in the app. Shared 6h (~7 MB pull).
 */
function loadTradeBoard(admin: SupabaseClient, board: ProjBoard): Promise<TradeBoard> {
  const start = board.weeks[0] || board.week
  return sharedCached<TradeBoard>(
    `fantasy:trade-board:${board.season}:${start}`,
    { ttlMs: 6 * 60 * 60_000, leaseMs: 120_000, staleMaxMs: 24 * 60 * 60_000, admin },
    async () => {
      const rosWeeks: number[] = []
      for (let w = start; w <= TRADE_LAST_WEEK; w++) rosWeeks.push(w)
      const pastWeeks: number[] = []
      for (let w = 1; w < start; w++) pastWeeks.push(w)
      const [rosMaps, pastMaps] = await Promise.all([
        Promise.all(rosWeeks.map((w) => board.proj.get(w) ? Promise.resolve(board.proj.get(w)!) : fetchJson(`https://api.sleeper.app/v1/projections/nfl/regular/${board.season}/${w}`).then(statMap).catch(() => new Map()))),
        Promise.all(pastWeeks.map((w) => fetchJson(`https://api.sleeper.app/v1/stats/nfl/regular/${board.season}/${w}`).then(statMap).catch(() => new Map()))),
      ])
      const players: Record<string, TradeEntry> = {}
      const entry = (id: string) => (players[id] ||= { ros_line: {}, ros_games: 0, season_line: {}, season_games: 0 })
      for (const map of rosMaps as Map<string, Record<string, unknown>>[]) {
        for (const [id, stats] of map) {
          if (!((ptsOf(stats) ?? 0) > 0)) continue
          const e = entry(id)
          addLine(e.ros_line, projStatLine(stats))
          e.ros_games += 1
        }
      }
      for (const map of pastMaps as Map<string, Record<string, unknown>>[]) {
        for (const [id, stats] of map) {
          if (!(Number(stats.gp) > 0) || !ptsOf(stats)) continue
          const e = entry(id)
          addLine(e.season_line, projStatLine(stats))
          e.season_games += 1
        }
      }
      const teamGames: Record<string, number> = {}
      for (const g of board.games) {
        if (g.week < start || g.week > TRADE_LAST_WEEK) continue
        teamGames[g.home] = (teamGames[g.home] || 0) + 1
        teamGames[g.away] = (teamGames[g.away] || 0) + 1
      }
      return { start, weeks_left: rosWeeks.length, team_games: teamGames, players }
    },
  )
}

function horizonPpr(weeks: WeekOut[]): number {
  return weeks.reduce((acc, w) => acc + (Number(w.ppr) || 0), 0)
}

export async function buildFantasyWaivers(
  admin: SupabaseClient,
  userId: string,
  leagueId: string,
  opts: { mode?: string; positions?: string[] } = {},
): Promise<Record<string, unknown>> {
  const withLeague = opts.mode === 'trades' || opts.mode === 'sniper'
  const withSniper = opts.mode === 'sniper'
  const { data: league, error: lgErr } = await admin
    .from('fantasy_leagues')
    .select('id, sport, provider, scoring, settings')
    .eq('id', leagueId)
    .eq('user_id', userId)
    .maybeSingle()
  if (lgErr) throw new Error(lgErr.message)
  if (!league) throw new Error('League not found.')
  const sport = String(league.sport || 'nfl').toLowerCase()
  if (sport !== 'nfl' && sport !== 'nba') {
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
  if (sport === 'nba') return buildNbaWaivers(admin, rostered, mineIds, { withLeague, withSniper, lockIn: nbaLockIn(league.provider, sport) })

  const [board, playersRes] = await Promise.all([
    loadProjBoard(),
    admin
      .from('nfl_players')
      .select('sleeper_id, full_name, position, team, status, injury_status, headshot_url, local_headshot_path, depth_chart_order')
      .in('position', POSITIONS)
      .limit(3000),
  ])
  if (playersRes.error) throw new Error(playersRes.error.message)

  if (opts.mode === 'fill') {
    return {
      supported: true,
      season: board.season,
      week: board.week,
      fill: await buildFill(board, playersRes.data || [], rostered, opts.positions || []),
    }
  }

  const byPos = new Map<string, Array<{ p: WaiverPlayer; horizon: number }>>()
  const roster: WaiverPlayer[] = []
  const leaguePlayers: WaiverPlayer[] = []
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
    if (withLeague && rostered.has(id)) leaguePlayers.push(out)
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

  const sniper = withSniper
    ? await buildSniper(admin, board, playersRes.data || [], rostered, mineIds)
    : null

  let weeksLeft: number | null = null
  let marketSource: string | null = null
  // Trades, waivers, and sniper all weigh rest-of-season and market value (fill returned above).
  {
    const boomEntries = ((sniper as { boom?: WaiverPlayer[] } | null)?.boom || []).filter((p) => p?.sleeper_id)
    const valued = [...new Set([...leaguePlayers, ...players, ...roster, ...boomEntries])]
    const [tradeBoard, market] = await Promise.all([
      loadTradeBoard(admin, board).catch(() => null),
      loadMarketValues(admin, marketParams(league, teamIds.length)).catch(() => ({} as Record<string, number>)),
    ])
    if (Object.keys(market).length) {
      marketSource = 'fantasycalc'
      for (const p of valued) p.market_value = market[p.sleeper_id] ?? null
    }
    if (tradeBoard) {
      weeksLeft = tradeBoard.weeks_left
      const withTrade = valued
      const ids = [...new Set(withTrade.map((p) => p.sleeper_id))]
      const { data: statusRows } = await admin.from('nfl_player_status').select('sleeper_id, return_date').in('sleeper_id', ids)
      const returnById = new Map((statusRows || []).map((r) => [String(r.sleeper_id), r.return_date ? String(r.return_date) : null]))
      const empty: TradeEntry = { ros_line: {}, ros_games: 0, season_line: {}, season_games: 0 }
      for (const p of withTrade) {
        p.trade = {
          ...(tradeBoard.players[p.sleeper_id] || empty),
          team_games: p.team ? tradeBoard.team_games[p.team] || 0 : 0,
          return_date: returnById.get(p.sleeper_id) || null,
        }
      }
    }
  }

  return {
    supported: true,
    season: board.season,
    week: board.week,
    weeks: board.weeks,
    ...(weeksLeft != null ? { weeks_left: weeksLeft } : {}),
    ...(marketSource ? { market_source: marketSource } : {}),
    players,
    roster,
    ...(withLeague ? { league_players: leaguePlayers } : {}),
    ...(sniper ? { sniper } : {}),
  }
}

type PlayerRow = {
  sleeper_id: string | null
  full_name: string | null
  position: string | null
  team: string | null
  status: string | null
  injury_status: string | null
  headshot_url: string | null
  local_headshot_path: string | null
  depth_chart_order: number | null
}

const SNIPER_POS = ['QB', 'RB', 'WR', 'TE']
/** Real-world starters per position; next man up only counts if the injuries ahead lift him into this group. */
const STARTERS_AT: Record<string, number> = { QB: 1, RB: 2, WR: 3, TE: 1 }

function hurt(status: string | null | undefined): string {
  const s = String(status || '').trim().toLowerCase()
  if (!s) return ''
  if (/^(ir|pup|sus|suspended|nfi|na|o|out)$/.test(s) || s.includes('reserve')) return 'out'
  if (/^d(oubtful)?$/.test(s)) return 'doubtful'
  if (/^q(uestionable)?$/.test(s)) return 'questionable'
  return ''
}

/**
 * Sniper inputs for the target week (first horizon week): every available QB / RB / WR / TE with a
 * Kalshi market, a starter ahead of him who is out / doubtful, or a top matchup; plus handcuffs (the next
 * healthy back behind a rostered RB1) split into yours and other teams'. Scoring and ranking stay in the app.
 */
async function buildSniper(
  admin: SupabaseClient,
  proj: ProjBoard,
  rows: PlayerRow[],
  rostered: Set<string>,
  mineIds: Set<string>,
) {
  const lineup = await loadBoard(admin).catch(() => null)
  const week = proj.weeks[0]
  const depth = new Map<string, PlayerRow[]>()
  for (const row of rows) {
    const pos = fantasyPos(row.position)
    const team = row.team ? normTeam(row.team) : ''
    if (!team || !SNIPER_POS.includes(pos) || row.depth_chart_order == null) continue
    const key = `${team}|${pos}`
    const list = depth.get(key) || []
    list.push(row)
    depth.set(key, list)
  }
  for (const list of depth.values()) list.sort((a, b) => Number(a.depth_chart_order) - Number(b.depth_chart_order))

  const out = (row: PlayerRow) => {
    const id = String(row.sleeper_id || '')
    const team = row.team ? normTeam(row.team) : null
    const game = team ? proj.games.find((g) => g.week === week && (g.home === team || g.away === team)) || null : null
    const pos = fantasyPos(row.position)
    const key = team ? `${team}|${pos}` : ''
    const list = key ? depth.get(key) || [] : []
    const rank = list.findIndex((r) => String(r.sleeper_id) === id) + 1
    const ahead = rank > 1 ? list.slice(0, rank - 1) : []
    const opponent = game ? (game.home === team ? game.away : game.home) : null
    const mu = lineup && opponent ? lineup.matchup.get(`${opponent}|${pos}`) || null : null
    return {
      sleeper_id: id,
      name: String(row.full_name || ''),
      position: pos,
      team,
      injury_status: row.injury_status || null,
      headshot_url: row.headshot_url || row.local_headshot_path || null,
      weeks: weeksFor(proj, id, row.team),
      depth_rank: rank || null,
      starters_ahead: ahead.map((r) => ({ name: String(r.full_name || ''), injury_status: r.injury_status || null })),
      opponent,
      home: game ? game.home === team : null,
      matchup_grade: mu?.grade || null,
      matchup_rank: mu?.rank || null,
      props: lineup && game ? propsFor(lineup, String(row.full_name || ''), game.away, game.home) : [],
    }
  }

  const boom = []
  for (const row of rows) {
    const id = String(row.sleeper_id || '')
    if (!id || rostered.has(id)) continue
    const pos = fantasyPos(row.position)
    if (!SNIPER_POS.includes(pos)) continue
    const status = String(row.status || '').toLowerCase()
    if (status && status !== 'active') continue
    if (hurt(row.injury_status) === 'out') continue
    const entry = out(row)
    const missing = entry.starters_ahead.filter((s) => hurt(s.injury_status) === 'out' || hurt(s.injury_status) === 'doubtful')
    const effective = entry.starters_ahead.length - missing.length + 1
    const nextUp = missing.length > 0 && effective <= (STARTERS_AT[pos] || 1)
    ;(entry as Record<string, unknown>).next_up = nextUp ? missing.map((s) => s.name) : []
    const goodMatchup = entry.matchup_grade === 'A'
    const weekPpr = Number(entry.weeks[0]?.ppr) || 0
    if (!entry.props.length && !nextUp && !(goodMatchup && weekPpr >= 6)) continue
    if (weekPpr < 3 && !nextUp) continue
    boom.push(entry)
  }

  const handcuffs = []
  for (const [key, list] of depth) {
    if (!key.endsWith('|RB')) continue
    const lead = list[0]
    const leadId = String(lead?.sleeper_id || '')
    if (!leadId || !rostered.has(leadId)) continue
    const backup = list.slice(1).find((r) => r.sleeper_id && !rostered.has(String(r.sleeper_id)) && hurt(r.injury_status) !== 'out')
    if (!backup) continue
    handcuffs.push({
      starter: {
        sleeper_id: leadId,
        name: String(lead.full_name || ''),
        mine: mineIds.has(leadId),
        injury_status: lead.injury_status || null,
        horizon_ppr: horizonPpr(weeksFor(proj, leadId, lead.team)),
      },
      backup: out(backup),
    })
  }

  return { week, boom, handcuffs }
}

const FILL_PER_POS = 12

/**
 * Open-slot fill: every available player at these positions whose team still has a game this week (Sleeper
 * schedule not in progress or final), ranked by this week's projection. Not limited to the waiver shortlist,
 * so Monday-night kickers show up on Sunday evening.
 */
async function buildFill(
  board: ProjBoard,
  players: PlayerRow[],
  rostered: Set<string>,
  positions: string[],
): Promise<Array<Record<string, unknown>>> {
  const want = new Set(positions.map((p) => fantasyPos(p)).filter((p) => POSITIONS.includes(p)))
  if (!want.size) return []
  const week = board.week
  const pending = new Set<string>()
  for (const g of board.games) {
    if (g.week !== week) continue
    const st = String(g.status || '').toLowerCase()
    if (st === 'complete' || st === 'in_game' || st === 'in_progress') continue
    pending.add(g.home)
    pending.add(g.away)
  }
  if (!pending.size) return []
  const stats =
    board.proj.get(week) ||
    ((await fetchJson(`https://api.sleeper.app/v1/projections/nfl/regular/${board.season}/${week}`)
      .then(statMap)
      .catch(() => new Map())) as Map<string, Record<string, unknown>>)
  const byPos = new Map<string, Array<Record<string, unknown> & { ppr: number }>>()
  for (const row of players) {
    const id = String(row.sleeper_id || '')
    const position = fantasyPos(row.position)
    if (!id || !want.has(position) || rostered.has(id)) continue
    const status = String(row.status || '').toLowerCase()
    if (status && status !== 'active') continue
    const team = row.team ? normTeam(row.team) : ''
    if (!team || !pending.has(team)) continue
    const ppr = ptsOf(stats.get(id)) || 0
    const list = byPos.get(position) || []
    list.push({
      sleeper_id: id,
      name: String(row.full_name || ''),
      position,
      team,
      injury_status: row.injury_status || null,
      headshot_url: row.headshot_url || row.local_headshot_path || null,
      ppr,
    })
    byPos.set(position, list)
  }
  const out: Array<Record<string, unknown>> = []
  for (const list of byPos.values()) {
    list.sort((a, b) => b.ppr - a.ppr)
    out.push(...list.slice(0, FILL_PER_POS))
  }
  return out
}

// ---------- NBA: streaming value = per-game projection x games this week (and next) ----------

const NBA_SHORTLIST = 70
const NBA_STARTERS_PER_TEAM = 5

function scaleLine(line: Record<string, number> | null | undefined, games: number): Record<string, number> | null {
  if (!line || games <= 0) return null
  const out: Record<string, number> = {}
  for (const [k, v] of Object.entries(line)) out[k] = Math.round(v * games * 1000) / 1000
  return out
}

const NBA_SEASON_GAMES = 82
/** NBA regular season ends mid-April of the season's second calendar year (Sleeper season "2026" = 2026-27). */
const NBA_SEASON_END_MMDD = '04-12'
const NBA_STANDINGS = 'https://site.api.espn.com/apis/v2/sports/basketball/nba/standings'

type NbaTradeBoard = {
  weeks_left: number
  team_games: Record<string, number>
  season: Record<string, { line: Record<string, number>; games: number }>
}

/**
 * Rest-of-season inputs in the NFL `trade` shape: Sleeper season totals (games played), each team's regular
 * season games left (82 minus ESPN standings W+L), and calendar weeks to the end of the regular season.
 * Shared 6h; stat keys are trimmed to the ones Sleeper projects (the scoring keys).
 */
function loadNbaTradeBoard(admin: SupabaseClient, board: NbaBoard): Promise<NbaTradeBoard> {
  return sharedCached<NbaTradeBoard>(
    `fantasy:nba-trade-board:${board.season}:${board.week}`,
    { ttlMs: 6 * 60 * 60_000, leaseMs: 120_000, staleMaxMs: 24 * 60 * 60_000, admin },
    async () => {
      const keys = new Set(Object.values(board.projLine).flatMap((l) => Object.keys(l)))
      const [stats, standings] = await Promise.all([
        fetchJson(`https://api.sleeper.app/v1/stats/nba/regular/${board.season}`).catch(() => ({})),
        fetchJson(NBA_STANDINGS).catch(() => null),
      ])
      const season: NbaTradeBoard['season'] = {}
      for (const [id, raw] of Object.entries((stats || {}) as Record<string, Record<string, unknown>>)) {
        const gp = Number(raw?.gp) || 0
        if (gp <= 0) continue
        const line: Record<string, number> = {}
        for (const k of keys) {
          const n = Number(raw[k])
          if (Number.isFinite(n) && n !== 0) line[k] = n
        }
        season[id] = { line, games: gp }
      }
      const team_games: Record<string, number> = {}
      const groups = ((standings as { children?: Array<{ standings?: { entries?: unknown[] } }> } | null)?.children || [])
      for (const g of groups) {
        for (const e of (g?.standings?.entries || []) as Array<{ team?: { abbreviation?: string }; stats?: Array<{ name?: string; value?: number }> }>) {
          const team = nbaTeam(e?.team?.abbreviation)
          const stat = (name: string) => Number(e?.stats?.find((s) => s?.name === name)?.value) || 0
          if (team) team_games[team] = Math.max(0, NBA_SEASON_GAMES - stat('wins') - stat('losses'))
        }
      }
      const end = Date.parse(`${Number(board.season) + 1}-${NBA_SEASON_END_MMDD}T00:00:00Z`)
      const weeks_left = Math.max(1, Math.ceil((end - Date.now()) / (7 * 86_400_000)))
      return { weeks_left, team_games, season }
    },
  )
}

function nbaHurt(status: string | null | undefined): boolean {
  return /^(out|o|ir|inj|sus)/i.test(String(status || '').trim())
}

/**
 * Same pool shape as NFL (`weeks` of stat lines the app scores in league rules), so `rankWaivers` / `rankBoom` /
 * `findTrades` run unchanged: week 1 = per-game projection x games left this week, week 2 = x next week's games.
 * Every valued player carries the NFL `trade` block (per-game projection as the rest-of-season rate, season
 * production, team games left), so waivers and trades weigh rest of season. Trades mode adds `league_players`.
 * Sniper boom = available players next up behind an injured starter, or with 3+ games left this week.
 */
async function buildNbaWaivers(
  admin: SupabaseClient,
  rostered: Set<string>,
  mineIds: Set<string>,
  opts: { withLeague: boolean; withSniper: boolean; lockIn?: boolean },
): Promise<Record<string, unknown>> {
  const { withLeague, withSniper } = opts
  // Lock-In counts one game a week: more games are more chances at a big one, not more points.
  const lockIn = Boolean(opts.lockIn)
  const weekScale = (games: number) => (lockIn ? lockInFactor(games) : games)
  const board: NbaBoard | null = await loadNbaBoard()
  if (!board) return { supported: true, players: [], roster: [] }
  const dayMs = 86_400_000
  const nextStart = new Date(Date.parse(`${board.end}T00:00:00Z`) + dayMs).toISOString().slice(0, 10)
  const nextEnd = new Date(Date.parse(`${nextStart}T00:00:00Z`) + 6 * dayMs).toISOString().slice(0, 10)
  const [all, nextGames] = await Promise.all([
    sleeperNbaPlayers(admin),
    sharedCached(
      `fantasy:nba-week-games:${board.season}:${board.week + 1}`,
      { ttlMs: 60 * 60 * 1000, staleMaxMs: 6 * 60 * 60 * 1000, admin, shouldStore: (v) => v.length > 0 },
      () => weekGames(nextStart, nextEnd),
    ).catch(() => []),
  ])
  const gamesNext = (team: string) => nextGames.filter((g) => g.home === team || g.away === team).length
  const perGamePts = (id: string) => Number(board.projLine[id]?.pts) || 0
  // Streaming: US Eastern dates of each team's untipped games this week and next.
  const etDate = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' })
  const nightsOf = (games: typeof nextGames) => {
    const out = new Map<string, string[]>()
    for (const g of games) {
      if (g.state !== 'pre' || !g.date) continue
      const d = etDate.format(new Date(g.date))
      for (const t of [g.home, g.away]) if (t) out.set(t, [...(out.get(t) || []), d])
    }
    return out
  }
  const nightsNow = nightsOf(board.games)
  const nightsNext = nightsOf(nextGames)

  const entries = all.map((p) => {
    const wk = teamWeek(board, p.team)
    const per = board.projLine[p.sleeper_id] || null
    const left = wk.games_left + (wk.live ? 1 : 0)
    return {
      p,
      left,
      out: {
        sleeper_id: p.sleeper_id,
        name: p.name,
        position: p.position,
        fantasy_positions: p.fantasy_positions,
        team: p.team,
        injury_status: p.injury_status,
        headshot_url: null as string | null,
        games_left: left,
        per_game: per,
        nights: nightsNow.get(nbaTeam(p.team)) || [],
        nights_next: nightsNext.get(nbaTeam(p.team)) || [],
        weeks: [
          { week: board.week, bye: left === 0, opp: null, home: null, ppr: null, line: scaleLine(per, weekScale(left)) },
          { week: board.week + 1, bye: gamesNext(p.team) === 0, opp: null, home: null, ppr: null, line: scaleLine(per, weekScale(gamesNext(p.team))) },
        ] as WeekOut[],
        next_up: [] as string[],
        trade: null as WaiverPlayer['trade'],
      },
    }
  })

  // Next man up: a top-5 projected player on his team is out, and they share a position.
  const byTeam = new Map<string, typeof entries>()
  for (const e of entries) byTeam.set(e.p.team, [...(byTeam.get(e.p.team) || []), e])
  for (const list of byTeam.values()) {
    const starters = [...list].sort((a, b) => perGamePts(b.p.sleeper_id) - perGamePts(a.p.sleeper_id)).slice(0, NBA_STARTERS_PER_TEAM)
    const hurtStarters = starters.filter((e) => nbaHurt(e.p.injury_status))
    for (const e of list) {
      if (rostered.has(e.p.sleeper_id) || starters.includes(e) || nbaHurt(e.p.injury_status)) continue
      const pos = new Set(e.p.fantasy_positions.length ? e.p.fantasy_positions : [e.p.position])
      const ahead = hurtStarters.filter((h) => (h.p.fantasy_positions.length ? h.p.fantasy_positions : [h.p.position]).some((x) => pos.has(x)))
      if (ahead.length) e.out.next_up = ahead.map((h) => h.p.name)
    }
  }

  const roster = entries.filter((e) => mineIds.has(e.p.sleeper_id)).map((e) => e.out)
  const available = entries
    .filter((e) => !rostered.has(e.p.sleeper_id) && perGamePts(e.p.sleeper_id) > 0)
    .sort((a, b) => perGamePts(b.p.sleeper_id) * weekScale(b.left) - perGamePts(a.p.sleeper_id) * weekScale(a.left))
  const players = available.slice(0, NBA_SHORTLIST).map((e) => e.out)
  const boom = withSniper
    ? available.filter((e) => e.out.next_up.length || e.left >= 3).slice(0, 30).map((e) => e.out)
    : []

  const leaguePlayers = withLeague ? entries.filter((e) => rostered.has(e.p.sleeper_id)).map((e) => e.out) : []
  const valued = [...new Set([...roster, ...players, ...boom, ...leaguePlayers])]
  const [shots, tradeBoard] = await Promise.all([
    nbaHeadshots(admin, [...roster, ...players, ...boom]),
    loadNbaTradeBoard(admin, board).catch(() => null),
  ])
  for (const e of [...roster, ...players, ...boom]) e.headshot_url = shots.get(e.sleeper_id)?.headshot_url || null
  // Lock-In: a week is worth lockInFactor(its games) of one game, so rest-of-season "games" become that many weeks' worth.
  const lockInGames = (teamGames: number) => {
    if (!lockIn || !tradeBoard) return teamGames
    const weeks = tradeBoard.weeks_left || 1
    return Math.round(weeks * lockInFactor(Math.max(1, Math.round(teamGames / weeks))) * 10) / 10
  }
  if (tradeBoard) {
    for (const e of valued) {
      const per = board.projLine[e.sleeper_id] || null
      const past = tradeBoard.season[e.sleeper_id]
      e.trade = {
        ros_line: per || {},
        ros_games: per ? 1 : 0,
        season_line: past?.line || {},
        season_games: past?.games || 0,
        team_games: lockInGames(tradeBoard.team_games[nbaTeam(e.team)] || 0),
        return_date: null,
      }
    }
  }

  return {
    supported: true,
    season: board.season,
    week: board.week,
    weeks: [board.week, board.week + 1],
    ...(tradeBoard ? { weeks_left: tradeBoard.weeks_left } : {}),
    ...(lockIn ? { lock_in: true } : {}),
    players,
    roster,
    ...(withLeague ? { league_players: leaguePlayers } : {}),
    ...(withSniper ? { sniper: { boom, handcuffs: [], lock_in: lockIn } } : {}),
  }
}

