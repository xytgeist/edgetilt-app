/**
 * Live counting lines from the ESPN summary, keyed for league scoring (Sleeper names).
 * Separate from the 15 minute lineup board so a refresh does not refetch Kalshi.
 */
import { sharedCached } from './edgeSharedCache.ts'

const ESPN = 'https://site.api.espn.com/apis/site/v2/sports'
const HEADERS = { Accept: 'application/json', 'User-Agent': 'EdgeTilt-fantasy-live-lines/1.0' }
const LIVE_MS = 25_000

const PATHS: Record<string, string> = {
  nfl: 'football/nfl',
  nba: 'basketball/nba',
  nhl: 'hockey/nhl',
  mlb: 'baseball/mlb',
}

export type FantasyLiveLine = Record<string, number>

export type FantasyLiveHit = {
  line: FantasyLiveLine | null
  game_status: string
  kickoff: string | null
  opponent: string | null
  home: boolean | null
  /** Share of the game played (0 at kickoff, 1 final) from ESPN period + clock, for live projection pacing. */
  progress?: number | null
}

/** One Map per shared payload (the shared cache hands every caller the same array until it refreshes). */
const mapByEntries = new WeakMap<object, Map<string, FantasyLiveHit>>()

function nameKey(name: string): string {
  return String(name || '')
    .toLowerCase()
    .replace(/\b(jr|sr|ii|iii|iv|v)\b/gi, '')
    .replace(/[^a-z0-9]/g, '')
}

function normTeam(team: string | null | undefined): string {
  const t = String(team || '').trim().toUpperCase().replace(/[^A-Z]/g, '')
  const alias: Record<string, string> = {
    WSH: 'WAS',
    JAC: 'JAX',
    GSW: 'GS',
    SAS: 'SA',
    NOP: 'NO',
    NYK: 'NY',
    LAK: 'LA',
    TBL: 'TB',
    SJS: 'SJ',
    NJD: 'NJ',
  }
  return alias[t] || t
}

function ptYmd(offsetDays: number): string {
  const now = new Date(Date.now() + offsetDays * 86_400_000)
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Los_Angeles',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now)
  const y = parts.find((p) => p.type === 'year')?.value || ''
  const m = parts.find((p) => p.type === 'month')?.value || ''
  const d = parts.find((p) => p.type === 'day')?.value || ''
  return `${y}${m}${d}`
}

async function fetchJson(url: string): Promise<unknown> {
  const res = await fetch(url, { headers: HEADERS, signal: AbortSignal.timeout(10_000) })
  if (!res.ok) throw new Error(`${url} → ${res.status}`)
  return res.json()
}

function espnStatus(status: Record<string, unknown> | undefined): string {
  const type = (status?.type && typeof status.type === 'object') ? status.type as Record<string, unknown> : {}
  const state = String(type.state || '').toLowerCase()
  const name = String(type.name || '').toUpperCase()
  if (state === 'in' || name.includes('IN_PROGRESS') || name.includes('HALFTIME') || name.includes('END_PERIOD')) {
    return 'in_progress'
  }
  if (state === 'post' || name.includes('FINAL')) return 'final'
  return 'pre'
}

function numStat(value: unknown): number | null {
  const s = String(value ?? '').trim()
  if (!s || s.includes(':')) return null
  const n = Number(s.replace(/^\+/, ''))
  return Number.isFinite(n) ? n : null
}

function addStat(line: FantasyLiveLine, key: string, value: number) {
  if (!Number.isFinite(value)) return
  line[key] = (line[key] || 0) + value
}

function fgBuckets(line: FantasyLiveLine, yards: number[]) {
  for (const y of yards) {
    addStat(line, 'fgm', 1)
    if (y < 20) addStat(line, 'fgm_0_19', 1)
    else if (y < 30) addStat(line, 'fgm_20_29', 1)
    else if (y < 40) addStat(line, 'fgm_30_39', 1)
    else if (y < 50) addStat(line, 'fgm_40_49', 1)
    else addStat(line, 'fgm_50p', 1)
    if (y < 40) addStat(line, 'fgm_0_39', 1)
    if (y >= 50 && y < 60) addStat(line, 'fgm_50_59', 1)
    if (y >= 60) addStat(line, 'fgm_60p', 1)
  }
}

function bonuses(line: FantasyLiveLine) {
  const at = (key: string, stat: string, min: number) => {
    if ((line[stat] || 0) >= min) line[key] = 1
  }
  at('bonus_pass_yd_300', 'pass_yd', 300)
  at('bonus_pass_yd_400', 'pass_yd', 400)
  at('bonus_rush_yd_100', 'rush_yd', 100)
  at('bonus_rush_yd_200', 'rush_yd', 200)
  at('bonus_rec_yd_100', 'rec_yd', 100)
  at('bonus_rec_yd_200', 'rec_yd', 200)
  at('bonus_pt_40p', 'pts', 40)
  at('bonus_pt_50p', 'pts', 50)
  const cats = ['pts', 'reb', 'ast', 'stl', 'blk'].filter((key) => (line[key] || 0) >= 10).length
  if (cats >= 2) line.dd = 1
  if (cats >= 3) line.td = 1
}

function madeOf(value: unknown): [number, number] {
  const m = String(value ?? '').match(/^(\d+)\s*[-/]\s*(\d+)$/)
  return m ? [Number(m[1]), Number(m[2])] : [0, 0]
}

function footballLine(
  groups: Array<Record<string, unknown>>,
  athleteId: string,
  fgYards: number[],
): FantasyLiveLine {
  const line: FantasyLiveLine = {}
  for (const g of groups) {
    const group = String(g.name || '')
    const keys = Array.isArray(g.keys) ? (g.keys as unknown[]).map(String) : []
    const athletes = Array.isArray(g.athletes) ? g.athletes as Array<Record<string, unknown>> : []
    const row = athletes.find((a) => {
      const ath = (a.athlete && typeof a.athlete === 'object') ? a.athlete as Record<string, unknown> : {}
      return String(ath.id || '') === athleteId
    })
    if (!row) continue
    const stats = Array.isArray(row.stats) ? row.stats as unknown[] : []
    const val = (key: string) => stats[keys.indexOf(key)]
    if (group === 'passing') {
      addStat(line, 'pass_yd', numStat(val('passingYards')) || 0)
      addStat(line, 'pass_td', numStat(val('passingTouchdowns')) || 0)
      addStat(line, 'pass_int', numStat(val('interceptions')) || 0)
    } else if (group === 'rushing') {
      addStat(line, 'rush_yd', numStat(val('rushingYards')) || 0)
      addStat(line, 'rush_td', numStat(val('rushingTouchdowns')) || 0)
    } else if (group === 'receiving') {
      addStat(line, 'rec', numStat(val('receptions')) || 0)
      addStat(line, 'rec_yd', numStat(val('receivingYards')) || 0)
      addStat(line, 'rec_td', numStat(val('receivingTouchdowns')) || 0)
    } else if (group === 'fumbles') {
      addStat(line, 'fum_lost', numStat(val('fumblesLost')) || 0)
    } else if (group === 'kickReturns' || group === 'puntReturns') {
      addStat(line, 'ret_td', numStat(val(group === 'kickReturns' ? 'kickReturnTouchdowns' : 'puntReturnTouchdowns')) || 0)
    } else if (group === 'kicking') {
      const [made, att] = madeOf(val('fieldGoalsMade/fieldGoalAttempts'))
      const xp = madeOf(val('extraPointsMade/extraPointAttempts'))
      addStat(line, 'xpm', xp[0])
      addStat(line, 'xpmiss', Math.max(0, xp[1] - xp[0]))
      addStat(line, 'fgmiss', Math.max(0, att - made))
      if (!fgYards.length && made) addStat(line, 'fgm', made)
    }
  }
  if (fgYards.length) fgBuckets(line, fgYards)
  bonuses(line)
  return line
}

function statBag(groups: Array<Record<string, unknown>>, athleteId: string): Record<string, number> {
  const bag: Record<string, number> = {}
  for (const g of groups) {
    const keys = Array.isArray(g.keys) ? (g.keys as unknown[]).map(String) : []
    const athletes = Array.isArray(g.athletes) ? g.athletes as Array<Record<string, unknown>> : []
    const row = athletes.find((a) => {
      const ath = (a.athlete && typeof a.athlete === 'object') ? a.athlete as Record<string, unknown> : {}
      return String(ath.id || '') === athleteId
    })
    if (!row) continue
    const stats = Array.isArray(row.stats) ? row.stats as unknown[] : []
    keys.forEach((key, i) => {
      const raw = stats[i]
      const made = String(raw ?? '').match(/^(\d+)\s*-\s*(\d+)$/)
      if (made && key.includes('-')) {
        const [madeKey, attKey] = key.split('-')
        if (madeKey) bag[madeKey] = Number(made[1])
        if (attKey) bag[attKey] = Number(made[2])
        return
      }
      const n = numStat(raw)
      if (n == null || !key) return
      bag[key] = n
    })
  }
  return bag
}

function otherLine(sport: string, bag: Record<string, number>): FantasyLiveLine {
  const n = (key: string) => bag[key] || 0
  if (sport === 'nba') {
    const line: FantasyLiveLine = {
      pts: n('points'),
      reb: n('rebounds'),
      ast: n('assists'),
      stl: n('steals'),
      blk: n('blocks'),
      to: n('turnovers'),
      tpm: n('threePointFieldGoalsMade'),
      fgm: n('fieldGoalsMade'),
      fga: n('fieldGoalsAttempted'),
      ftm: n('freeThrowsMade'),
      fta: n('freeThrowsAttempted'),
      oreb: n('offensiveRebounds'),
      dreb: n('defensiveRebounds'),
    }
    bonuses(line)
    return line
  }
  if (sport === 'nhl') {
    return {
      goals: n('goals'),
      assists: n('assists'),
      shots: n('shotsTotal'),
      hits: n('hits'),
      blk: n('blockedShots'),
      pim: n('penaltyMinutes'),
      plus_minus: n('plusMinus'),
      saves: n('saves'),
      goals_against: n('goalsAgainst'),
    }
  }
  return {
    h: n('hits'),
    hr: n('homeRuns'),
    rbi: n('RBIs') || n('rbi'),
    r: n('runs'),
    sb: n('stolenBases'),
    bb: n('walks'),
    k: n('strikeouts') || n('battersStruckOut'),
    er: n('earnedRuns'),
    ip: n('inningsPitched') || n('innings'),
    w: n('wins'),
    sv: n('saves'),
  }
}

type Side = { abbrev: string; name: string; id: string }

/** Regulation periods and minutes per period; MLB counts half-innings instead. */
const GAME_SHAPE: Record<string, { periods: number; minutes: number }> = {
  nfl: { periods: 4, minutes: 15 },
  nba: { periods: 4, minutes: 12 },
  nhl: { periods: 3, minutes: 20 },
}

function gameProgress(sport: string, status: Record<string, unknown> | undefined, state: string): number | null {
  if (state === 'final') return 1
  if (state !== 'in_progress' || !status) return state === 'pre' ? 0 : null
  const period = Number(status.period)
  if (!Number.isFinite(period) || period < 1) return null
  if (sport === 'mlb') {
    const type = (status.type && typeof status.type === 'object') ? status.type as Record<string, unknown> : {}
    const detail = String(type.shortDetail || type.detail || '').toLowerCase()
    const half = /\b(bot|bottom|end)\b/.test(detail) ? 1 : 0
    return Math.min(0.99, ((period - 1) * 2 + half + 0.5) / 18)
  }
  const shape = GAME_SHAPE[sport]
  if (!shape) return null
  if (period > shape.periods) return 0.99
  const m = String(status.displayClock || '').match(/^(\d+):(\d+)/)
  const left = m ? Number(m[1]) + Number(m[2]) / 60 : shape.minutes
  const played = (period - 1) * shape.minutes + Math.max(0, shape.minutes - left)
  return Math.max(0, Math.min(0.99, played / (shape.periods * shape.minutes)))
}

function competitors(
  event: Record<string, unknown>,
  sport = 'nfl',
): { home: Side; away: Side; status: string; kickoff: string | null; progress: number | null } | null {
  const comps = (event.competitions as Array<Record<string, unknown>> | undefined)?.[0]
  const rows = Array.isArray(comps?.competitors) ? comps!.competitors as Array<Record<string, unknown>> : []
  const side = (homeAway: string): Side | null => {
    const row = rows.find((c) => c.homeAway === homeAway)
    if (!row) return null
    const team = (row.team && typeof row.team === 'object') ? row.team as Record<string, unknown> : {}
    return {
      abbrev: normTeam(String(team.abbreviation || '')),
      name: String(team.displayName || team.name || ''),
      id: String(team.id || ''),
    }
  }
  const home = side('home')
  const away = side('away')
  if (!home || !away) return null
  const status = (comps?.status || event.status) as Record<string, unknown> | undefined
  const state = espnStatus(status)
  return {
    home,
    away,
    status: state,
    kickoff: String(event.date || '') || null,
    progress: gameProgress(sport, status, state),
  }
}

function groupTotal(groups: Array<Record<string, unknown>>, name: string, key: string): number {
  const g = groups.find((x) => String(x.name || '') === name)
  if (!g) return 0
  const keys = Array.isArray(g.keys) ? (g.keys as unknown[]).map(String) : []
  const totals = Array.isArray(g.totals) ? (g.totals as unknown[]) : []
  return numStat(totals[keys.indexOf(key)]) || 0
}

function teamStat(boxTeams: Array<Record<string, unknown>>, abbrev: string, name: string): number | null {
  const row = boxTeams.find((t) => {
    const team = (t.team && typeof t.team === 'object') ? t.team as Record<string, unknown> : {}
    return normTeam(String(team.abbreviation || '')) === abbrev
  })
  const stats = Array.isArray(row?.statistics) ? row!.statistics as Array<Record<string, unknown>> : []
  const hit = stats.find((s) => String(s.name || '') === name)
  return hit ? numStat(String(hit.displayValue ?? hit.value ?? '').split('-')[0]) : null
}

/**
 * Team D/ST line in the same keys the scoring map reads: points / yards allowed from the opponent, sacks /
 * INT / return TDs from this team's player groups, fumble recoveries from the opponent's fumbles lost,
 * safeties from scoring plays. Points-allowed tiers are derived in the app from `pts_allow`.
 */
function defenseLine(
  summary: Record<string, unknown>,
  playerTeams: Array<Record<string, unknown>>,
  abbrev: string,
  opp: string,
): FantasyLiveLine {
  const box = (summary.boxscore && typeof summary.boxscore === 'object') ? summary.boxscore as Record<string, unknown> : {}
  const boxTeams = Array.isArray(box.teams) ? box.teams as Array<Record<string, unknown>> : []
  const mine = playerTeams.find((t) => {
    const team = (t.team && typeof t.team === 'object') ? t.team as Record<string, unknown> : {}
    return normTeam(String(team.abbreviation || '')) === abbrev
  })
  const groups = Array.isArray(mine?.statistics) ? mine!.statistics as Array<Record<string, unknown>> : []
  const header = (summary.header && typeof summary.header === 'object') ? summary.header as Record<string, unknown> : {}
  const comp = (header.competitions as Array<Record<string, unknown>> | undefined)?.[0]
  const sides = Array.isArray(comp?.competitors) ? comp!.competitors as Array<Record<string, unknown>> : []
  const oppSide = sides.find((c) => {
    const team = (c.team && typeof c.team === 'object') ? c.team as Record<string, unknown> : {}
    return normTeam(String(team.abbreviation || '')) === opp
  })
  let safeties = 0
  for (const sp of Array.isArray(summary.scoringPlays) ? summary.scoringPlays as Array<Record<string, unknown>> : []) {
    const type = (sp.type && typeof sp.type === 'object') ? String((sp.type as Record<string, unknown>).text || '') : ''
    const team = (sp.team && typeof sp.team === 'object') ? sp.team as Record<string, unknown> : {}
    if (/safety/i.test(type) && normTeam(String(team.abbreviation || '')) === abbrev) safeties += 1
  }
  const pickSix = groupTotal(groups, 'interceptions', 'interceptionTouchdowns')
  const defTd = groupTotal(groups, 'defensive', 'defensiveTouchdowns')
  const line: FantasyLiveLine = {
    pts_allow: numStat(oppSide?.score) ?? 0,
    sack: groupTotal(groups, 'defensive', 'sacks'),
    int: groupTotal(groups, 'interceptions', 'interceptions'),
    fum_rec: teamStat(boxTeams, opp, 'fumblesLost') ?? 0,
    pass_int_td: pickSix,
    def_fum_td: Math.max(0, defTd - pickSix),
    ret_td: groupTotal(groups, 'kickReturns', 'kickReturnTouchdowns') + groupTotal(groups, 'puntReturns', 'puntReturnTouchdowns'),
    safe: safeties,
  }
  const yards = teamStat(boxTeams, opp, 'totalYards')
  if (yards != null) line.yds_allow = yards
  return line
}

function remember(
  map: Map<string, FantasyLiveHit>,
  name: string,
  team: string,
  hit: FantasyLiveHit,
) {
  const key = nameKey(name)
  if (!key) return
  map.set(key, hit)
  if (team) map.set(`${key}|${team}`, hit)
}

async function mapPool<T>(items: T[], limit: number, fn: (item: T) => Promise<void>): Promise<void> {
  let cursor = 0
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const idx = cursor
      cursor += 1
      await fn(items[idx])
    }
  })
  await Promise.all(workers)
}

/**
 * The live slate map (ESPN scoreboard + up to 20 game summaries) is shared across every isolate for 25s, so a
 * busy Sunday is one ESPN read per window project-wide instead of one per warm isolate.
 */
async function loadLiveMap(
  sport: string,
  opts: { season?: string; week?: number },
): Promise<Map<string, FantasyLiveHit>> {
  const path = PATHS[sport]
  if (!path) return new Map()
  const cacheKey = sport === 'nfl' && opts.week ? `nfl:${opts.season}:${opts.week}` : sport
  const entries = await sharedCached<Array<[string, FantasyLiveHit]>>(
    `fantasy:live:${cacheKey}`,
    { ttlMs: LIVE_MS, leaseMs: 20_000, shouldStore: (rows) => Array.isArray(rows) && rows.length > 0 },
    async () => [...(await buildLiveMap(sport, path, opts)).entries()],
  )
  let map = mapByEntries.get(entries)
  if (!map) {
    map = new Map(entries)
    mapByEntries.set(entries, map)
  }
  return map
}

async function buildLiveMap(
  sport: string,
  path: string,
  opts: { season?: string; week?: number },
): Promise<Map<string, FantasyLiveHit>> {
  const urls = sport === 'nfl' && opts.week && opts.season
    ? [`${ESPN}/${path}/scoreboard?week=${opts.week}&seasontype=2&dates=${opts.season}`]
    : [0, -1, 1].map((delta) => `${ESPN}/${path}/scoreboard?dates=${ptYmd(delta)}`)

  const events: Array<Record<string, unknown>> = []
  for (const url of urls) {
    try {
      const pack = (await fetchJson(url)) as { events?: Array<Record<string, unknown>> }
      for (const ev of pack.events || []) events.push(ev)
    } catch {
      /* one date can miss */
    }
  }

  const map = new Map<string, FantasyLiveHit>()
  const started: Array<{ id: string; pack: NonNullable<ReturnType<typeof competitors>> }> = []
  const seen = new Set<string>()
  for (const ev of events) {
    const id = String(ev.id || '')
    if (!id || seen.has(id)) continue
    seen.add(id)
    const pack = competitors(ev, sport)
    if (!pack) continue
    const kickMs = pack.kickoff ? Date.parse(pack.kickoff) : NaN
    const begun = pack.status !== 'pre' || (Number.isFinite(kickMs) && kickMs <= Date.now())
    if (begun) started.push({ id, pack })
    for (const [side, opp] of [[pack.home, pack.away], [pack.away, pack.home]] as const) {
      remember(map, side.name, side.abbrev, {
        line: null,
        game_status: begun && pack.status === 'pre' ? 'in_progress' : pack.status,
        kickoff: pack.kickoff,
        progress: pack.progress,
        opponent: opp.abbrev || null,
        home: side === pack.home,
      })
    }
  }

  await mapPool(started.slice(0, 20), 4, async (game) => {
    try {
      const summary = (await fetchJson(`${ESPN}/${path}/summary?event=${encodeURIComponent(game.id)}`)) as Record<string, unknown>
      const box = (summary.boxscore && typeof summary.boxscore === 'object')
        ? summary.boxscore as Record<string, unknown>
        : null
      const teams = Array.isArray(box?.players) ? box!.players as Array<Record<string, unknown>> : []
      const fgByName = new Map<string, number[]>()
      if (sport === 'nfl') {
        for (const sp of Array.isArray(summary.scoringPlays) ? summary.scoringPlays as Array<Record<string, unknown>> : []) {
          const m = String(sp.text || '').match(/^(.+?)\s+(\d+)\s+Yd\s+Field\s+Goal\b/i)
          if (!m) continue
          const k = nameKey(m[1])
          fgByName.set(k, [...(fgByName.get(k) || []), Number(m[2])])
        }
      }
      for (const t of teams) {
        const team = (t.team && typeof t.team === 'object') ? t.team as Record<string, unknown> : {}
        const abbrev = normTeam(String(team.abbreviation || ''))
        const groups = Array.isArray(t.statistics) ? t.statistics as Array<Record<string, unknown>> : []
        if (sport === 'nfl' && abbrev) {
          const opp = abbrev === game.pack.home.abbrev ? game.pack.away.abbrev : game.pack.home.abbrev
          map.set(`def|${abbrev}`, {
            line: defenseLine(summary, teams, abbrev, opp),
            game_status: game.pack.status === 'pre' ? 'in_progress' : game.pack.status,
            kickoff: game.pack.kickoff,
            progress: game.pack.progress,
            opponent: opp || null,
            home: abbrev === game.pack.home.abbrev,
          })
        }
        const seenAth = new Set<string>()
        for (const g of groups) {
          const athletes = Array.isArray(g.athletes) ? g.athletes as Array<Record<string, unknown>> : []
          for (const a of athletes) {
            const ath = (a.athlete && typeof a.athlete === 'object') ? a.athlete as Record<string, unknown> : {}
            const id = String(ath.id || '')
            const name = String(ath.displayName || '')
            if (!id || !name || seenAth.has(id)) continue
            seenAth.add(id)
            const opp = abbrev === game.pack.home.abbrev ? game.pack.away.abbrev : game.pack.home.abbrev
            const home = abbrev === game.pack.home.abbrev
            const line = sport === 'nfl'
              ? footballLine(groups, id, fgByName.get(nameKey(name)) || [])
              : otherLine(sport, statBag(groups, id))
            remember(map, name, abbrev, {
              line,
              game_status: game.pack.status === 'pre' ? 'in_progress' : game.pack.status,
              kickoff: game.pack.kickoff,
              progress: game.pack.progress,
              opponent: opp || null,
              home,
            })
          }
        }
      }
    } catch {
      /* this game keeps the scoreboard row */
    }
  })

  return map
}

export function lookupLive(
  map: Map<string, FantasyLiveHit>,
  name: string,
  team: string | null | undefined,
): FantasyLiveHit | null {
  const key = nameKey(name)
  if (!key) return null
  const t = normTeam(team)
  return (t && map.get(`${key}|${t}`)) || map.get(key) || null
}

/** Team D/ST live line (keyed by team abbreviation, e.g. HOU). */
export function lookupLiveDefense(map: Map<string, FantasyLiveHit>, team: string | null | undefined): FantasyLiveHit | null {
  const t = normTeam(team)
  return t ? map.get(`def|${t}`) || null : null
}

export async function loadFantasyLiveMap(
  sport: string,
  opts: { season?: string; week?: number } = {},
): Promise<Map<string, FantasyLiveHit>> {
  try {
    return await loadLiveMap(sport, opts)
  } catch {
    return new Map()
  }
}
