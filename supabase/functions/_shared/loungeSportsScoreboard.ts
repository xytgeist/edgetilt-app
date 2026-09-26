/**
 * Lounge in-post game pill scoreboard.
 * TheRundown day slates first (period scores + status). Odds API /scores as fallback.
 */
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2'
import { listRundownDayEvents, ptDateFromIso, rundownApiKey } from './loungeBotRundownContext.ts'
import { fetchSportScores, type ScoreEvent } from './loungeBotLiveContent.ts'
import { fetchSportOdds, fetchSportOddsHistorical, ptTodayDate } from './loungeBotOddsRun.ts'
import type { OddsEvent } from './loungeBotOddsCaption.ts'
import {
  loadMarketFilesForSportWindow,
  lockDueMarketFileCloses,
  resolvePregameMlFromFile,
  resolvePregameSpreadFromFile,
  upsertMarketFilesFromEvents,
  type MarketFileRow,
} from './loungeBotMarketFile.ts'
import cfbTeamEspnByAbbrev from './cfbTeamEspnByAbbrev.json' with { type: 'json' }
import cfbTeamNameAbbrev from './cfbTeamNameAbbrev.json' with { type: 'json' }

const CFB_ESPN_BY_ABBREV = cfbTeamEspnByAbbrev as Record<string, string>
const CFB_NAME_ABBREV = cfbTeamNameAbbrev as Record<string, string>

const CFB_ABBREV_ALIASES: Record<string, string> = {
  WSH: 'WASH',
  WAS: 'WASH',
  TAMU: 'TAM',
  'TA&M': 'TAM',
  TEXAM: 'TAM',
  SMISS: 'USM',
  SOMISS: 'USM',
  SOUMISS: 'USM',
  MIOH: 'M-OH',
  MIAOH: 'M-OH',
  'MIAMI-OH': 'M-OH',
  MIAOHIO: 'M-OH',
  GA: 'UGA',
  MISSST: 'MSST',
  MISSSTATE: 'MSST',
  OKLA: 'OU',
  OKL: 'OU',
  PIT: 'PITT',
  NCST: 'NCSU',
  FLAST: 'FSU',
  MIAFL: 'MIA',
  HAWAII: 'HAW',
  WASHST: 'WSU',
  MICHST: 'MSU',
  NW: 'NU',
  NWU: 'NU',
  NWEST: 'NU',
  HOWARD: 'HOW',
}

function foldCfbName(value: string): string {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

function resolveCfbCatalogAbbrev(raw: string): string {
  const a = String(raw || '').trim().toUpperCase().replace(/[^A-Z0-9&-]/g, '')
  if (!a) return ''
  if (CFB_ESPN_BY_ABBREV[a]) return a
  const aliased = CFB_ABBREV_ALIASES[a]
  if (aliased && CFB_ESPN_BY_ABBREV[aliased]) return aliased
  return a
}

function cfbAbbrevFromOddsName(name: string): string {
  const n = foldCfbName(name)
  if (!n) return ''
  if (CFB_NAME_ABBREV[n]) return CFB_NAME_ABBREV[n]
  let best = ''
  let bestLen = 0
  for (const [key, abbrev] of Object.entries(CFB_NAME_ABBREV)) {
    if (key.length < 4 || key.length <= bestLen) continue
    if (` ${n} `.includes(` ${key} `)) {
      best = abbrev
      bestLen = key.length
    }
  }
  if (best) return best
  return resolveCfbCatalogAbbrev((n.split(/\s+/).pop() || n).slice(0, 3).toUpperCase())
}

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
  /** Pinnacle American moneyline for this side. */
  ml?: number | null
  /** Season W-L (e.g. "3-1") from ESPN scoreboard when available. */
  record?: string | null
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
  /** Remaining timeouts this half (0–3). Null when the feed does not send them. */
  home_timeouts: number | null
  away_timeouts: number | null
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
  /** National TV / stream label (e.g. "FOX", "Prime Video"). */
  broadcast?: string | null
  /** Watch / stream site for the broadcast pill. */
  broadcast_url?: string | null
}

function espnLogo(league: string, abbrev: string): string {
  const slug = espnLogoSlug(league, abbrev)
  if (!slug) return ''
  return `https://a.espncdn.com/i/teamlogos/${league}/500/${slug}.png`
}

function espnLogoSlug(league: string, abbrev: string): string {
  const a = String(abbrev || '').trim().toUpperCase()
  if (!a) return ''
  if (league === 'ncaa') {
    const catalog = resolveCfbCatalogAbbrev(a)
    const espnId = CFB_ESPN_BY_ABBREV[catalog] || CFB_ESPN_BY_ABBREV[a.replace(/[^A-Z0-9-]/g, '')] || CFB_ESPN_BY_ABBREV[a]
    if (espnId) return espnId
  }
  const lower = a.toLowerCase()
  if (league === 'nfl' && (lower === 'was' || lower === 'wsh')) return 'wsh'
  return lower.replace(/[^a-z0-9]/g, '')
}

/** Prefer ESPN team ids on CFB sides so hub PBP can match college-football scoreboard. */
function attachCfbEspnTeamIds(game: LoungeSportsGame): LoungeSportsGame {
  if (!isCfbSportKey(game.sport_key)) return game
  const patch = (side: LoungeSportsGameSide): LoungeSportsGameSide => {
    const fromAbbrev = resolveCfbCatalogAbbrev(side?.abbrev || '')
    const fromName = cfbAbbrevFromOddsName(`${side?.name || ''} ${side?.mascot || ''}`)
    const abb = (fromAbbrev && CFB_ESPN_BY_ABBREV[fromAbbrev] ? fromAbbrev : '') ||
      (fromName && CFB_ESPN_BY_ABBREV[fromName] ? fromName : fromAbbrev)
    const espnId = Number(CFB_ESPN_BY_ABBREV[abb] || 0)
    if (!Number.isFinite(espnId) || espnId <= 0) return side
    const logo = espnLogo('ncaa', abb) || side.logo
    if (side.team_id === espnId && side.logo === logo && side.abbrev === abb) return side
    return { ...side, abbrev: abb || side.abbrev, team_id: espnId, logo }
  }
  return { ...game, away: patch(game.away), home: patch(game.home) }
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
  // PT wall clock without zone suffix … clients prefer commence_time for true local.
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Los_Angeles',
    weekday: 'short',
    hour: 'numeric',
    minute: '2-digit',
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
  const abbrev = logoLeague === 'ncaa'
    ? (resolveCfbCatalogAbbrev(abbrevRaw) || cfbAbbrevFromOddsName([name, mascot].filter(Boolean).join(' ')))
    : abbrevRaw === 'WSH' ? 'WAS' : abbrevRaw === 'JAC' ? 'JAX' : abbrevRaw
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
    ml: null,
    record: null,
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

/**
 * Football LOS for UI: yard_line is 1–50 (50 = midfield), yard_side is territory.
 * Prefers ESPN possessionText ("HOW 1"), then yards-to-endzone + possession, then absolute 0–100.
 */
function resolveFootballYardSpot(opts: {
  possessionText?: string | null
  yardsToEndzone?: number | null
  absoluteYardLine?: number | null
  possession: 'home' | 'away' | null
  homeAbbrev?: string
  awayAbbrev?: string
}): { yard_line: number | null; yard_side: 'home' | 'away' | null } {
  const foldAbbrev = (v: string) => String(v || '').toUpperCase().replace(/[^A-Z0-9-]/g, '')
  const homeA = foldAbbrev(opts.homeAbbrev || '')
  const awayA = foldAbbrev(opts.awayAbbrev || '')

  const text = String(opts.possessionText || '').trim()
  const m = text.match(/^([A-Za-z0-9&.\-]+)\s+(\d{1,2})$/)
  if (m) {
    const token = foldAbbrev(m[1])
    const yard = Number(m[2])
    if (Number.isFinite(yard) && yard >= 0 && yard <= 50) {
      if (yard === 50) return { yard_line: 50, yard_side: null }
      let side: 'home' | 'away' | null = null
      if (token && homeA && (token === homeA || homeA.startsWith(token) || token.startsWith(homeA))) {
        side = 'home'
      } else if (token && awayA && (token === awayA || awayA.startsWith(token) || token.startsWith(awayA))) {
        side = 'away'
      }
      return { yard_line: Math.max(1, yard), yard_side: side }
    }
  }

  const yte = opts.yardsToEndzone
  if (yte != null && Number.isFinite(yte) && opts.possession) {
    if (yte === 50) return { yard_line: 50, yard_side: null }
    if (yte > 50 && yte <= 99) {
      return { yard_line: 100 - Math.round(yte), yard_side: opts.possession }
    }
    if (yte >= 0 && yte < 50) {
      const opp = opts.possession === 'home' ? 'away' : 'home'
      return { yard_line: Math.max(1, Math.round(yte)), yard_side: opp }
    }
  }

  const abs = opts.absoluteYardLine
  if (abs != null && Number.isFinite(abs) && abs >= 0 && abs <= 100) {
    if (abs === 50) return { yard_line: 50, yard_side: null }
    if (abs < 50) return { yard_line: Math.max(1, Math.round(abs)), yard_side: 'home' }
    return { yard_line: Math.max(1, 100 - Math.round(abs)), yard_side: 'away' }
  }

  return { yard_line: null, yard_side: null }
}

/** NFL: 3 timeouts per half. Clamp remaining into 0–3. */
function timeoutsRemaining(value: unknown): number | null {
  const n = numOrNull(value)
  if (n == null) return null
  return Math.max(0, Math.min(3, Math.round(n)))
}

function pickTimeouts(
  raw: Record<string, unknown>,
  side: 'home' | 'away',
): number | null {
  const nested = (raw.timeouts && typeof raw.timeouts === 'object')
    ? raw.timeouts as Record<string, unknown>
    : null
  if (side === 'home') {
    return timeoutsRemaining(
      raw.home_timeouts
        ?? raw.home_timeouts_remaining
        ?? raw.home_team_timeouts
        ?? raw.timeouts_remaining_home
        ?? nested?.home
        ?? nested?.home_remaining,
    )
  }
  return timeoutsRemaining(
    raw.away_timeouts
      ?? raw.away_timeouts_remaining
      ?? raw.away_team_timeouts
      ?? raw.timeouts_remaining_away
      ?? nested?.away
      ?? nested?.away_remaining,
  )
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
  const yte = numOrNull(raw.yards_to_endzone ?? raw.yards_from_goal)
  const rawYard = numOrNull(raw.yard_line ?? raw.field_position)
  const spot = resolveFootballYardSpot({
    possessionText: String(raw.possession_text || raw.field_position_text || '').trim() || null,
    yardsToEndzone: yte ?? (rawYard != null && rawYard > 50 ? rawYard : null),
    absoluteYardLine: rawYard != null && rawYard > 50 && yte == null ? rawYard : null,
    possession,
  })
  // Prefer explicit Rundown side when present and yard already 1–50.
  let yardLine = spot.yard_line
  let yardSideOut = spot.yard_side
  if (yardSide && rawYard != null && rawYard >= 1 && rawYard <= 50) {
    yardLine = rawYard
    yardSideOut = yardSide
  } else if (yardSide && yardLine != null) {
    yardSideOut = yardSide
  }
  if (!clock && period == null && down == null && !lastPlay) return null
  return {
    clock,
    period,
    down,
    distance,
    yard_line: yardLine,
    yard_side: yardSideOut,
    possession,
    home_timeouts: pickTimeouts(raw, 'home') ?? pickTimeouts(score, 'home'),
    away_timeouts: pickTimeouts(raw, 'away') ?? pickTimeouts(score, 'away'),
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
  const useNflAbbrev = isNflSportKey(sportKey)
  const homeAbbrev = useNflAbbrev
    ? nflAbbrevFromOddsName(homeName)
    : isCfbSportKey(sportKey)
      ? cfbAbbrevFromOddsName(homeName)
      : (homeName.split(/\s+/).pop() || homeName).slice(0, 3).toUpperCase()
  const awayAbbrev = useNflAbbrev
    ? nflAbbrevFromOddsName(awayName)
    : isCfbSportKey(sportKey)
      ? cfbAbbrevFromOddsName(awayName)
      : (awayName.split(/\s+/).pop() || awayName).slice(0, 3).toUpperCase()
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
    ml: null,
    record: null,
  }
  const away: LoungeSportsGameSide = {
    name: awayName,
    mascot: awayMascot,
    abbrev: awayAbbrev,
    logo: espnLogo(logoLeague, awayAbbrev),
    score: awayScore,
    linescores: [],
    spread: null,
    ml: null,
    record: null,
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

/** CFB Edge fetch … current Thu–Mon only (higher volume than NFL). */
export function cfbFetchDates(now = Date.now()): string[] {
  return nflWeekDatesFromThursday(nflCalendarThursdayYmd(now))
}

function isNflSportKey(sportKey: string): boolean {
  const sk = String(sportKey || '')
  return sk.includes('americanfootball_nfl') && !sk.includes('ncaaf')
}

function isCfbSportKey(sportKey: string): boolean {
  return String(sportKey || '').includes('americanfootball_ncaaf')
}

type EspnFootballLeague = 'nfl' | 'college-football'

function espnFootballScoreboardPath(league: EspnFootballLeague): string {
  return `https://site.api.espn.com/apis/site/v2/sports/football/${league}/scoreboard`
}

function espnFootballSummaryPath(league: EspnFootballLeague, eventId: string): string {
  return `https://site.api.espn.com/apis/site/v2/sports/football/${league}/summary?event=${encodeURIComponent(eventId)}`
}

function gameOnSlate(game: LoungeSportsGame, dates: string[]): boolean {
  if (game.status === 'in') return true
  const day = ptDateFromIso(game.commence_time)
  return Boolean(day) && dates.includes(day)
}

function slateDedupeKey(game: LoungeSportsGame): string {
  const a = isCfbSportKey(game.sport_key)
    ? resolveCfbCatalogAbbrev(game.away?.abbrev || '')
    : nflAbbrevKey(game.away?.abbrev)
  const h = isCfbSportKey(game.sport_key)
    ? resolveCfbCatalogAbbrev(game.home?.abbrev || '')
    : nflAbbrevKey(game.home?.abbrev)
  return `${game.sport_key}:${a}@${h}:${ptDateFromIso(game.commence_time)}`
}

function nflAbbrevKey(value: unknown): string {
  const u = String(value || '').trim().toUpperCase()
  if (u === 'WSH') return 'WAS'
  if (u === 'JAC') return 'JAX'
  return u
}

/** ESPN competitor `records[].summary` … prefer overall/total (e.g. "3-1"). */
function recordFromEspnCompetitor(c: Record<string, unknown>): string | null {
  const records = Array.isArray(c.records) ? c.records as Array<Record<string, unknown>> : []
  if (!records.length) return null
  const preferred =
    records.find((r) => String(r.type || '').toLowerCase() === 'total')
    || records.find((r) => {
      const name = String(r.name || '').toLowerCase()
      return name.includes('overall') || name.includes('ytd') || name === 'total'
    })
    || records[0]
  const summary = String(preferred?.summary || '').trim()
  if (!summary) return null
  if (!/^\d+-\d+(-\d+)?$/.test(summary)) return summary
  return summary
}

/** Prefer national TV name from ESPN competition broadcasts / geoBroadcasts. */
function broadcastFromEspnCompetition(comps: Record<string, unknown> | null | undefined): string | null {
  if (!comps) return null
  const broadcasts = Array.isArray(comps.broadcasts) ? comps.broadcasts as Array<Record<string, unknown>> : []
  let fallback: string | null = null
  for (const b of broadcasts) {
    const names = Array.isArray(b.names) ? b.names.map((n) => String(n || '').trim()).filter(Boolean) : []
    if (!names.length) continue
    const market = String(b.market || '').toLowerCase()
    if (market === 'national' || market === '') return names[0]
    if (!fallback) fallback = names[0]
  }
  const geo = Array.isArray(comps.geoBroadcasts) ? comps.geoBroadcasts as Array<Record<string, unknown>> : []
  for (const g of geo) {
    const media = (g.media && typeof g.media === 'object') ? g.media as Record<string, unknown> : null
    const short = String(media?.shortName || media?.name || '').trim()
    if (!short) continue
    const market = (g.market && typeof g.market === 'object')
      ? String((g.market as Record<string, unknown>).type || '').toLowerCase()
      : ''
    if (market === 'national' || market === '') return short
    if (!fallback) fallback = short
  }
  return fallback
}

/** Official / primary watch destinations for NFL national windows. */
const NFL_WATCH_URL_BY_NETWORK: Array<{ match: RegExp; url: string; label?: string }> = [
  { match: /\bprime\b|amazon/i, url: 'https://www.amazon.com/gp/video/sports', label: 'Prime Video' },
  { match: /\bnetflix\b/i, url: 'https://www.netflix.com/', label: 'Netflix' },
  { match: /\bpeacock\b/i, url: 'https://www.peacocktv.com/sports/nfl', label: 'Peacock' },
  { match: /\bnbc\b/i, url: 'https://www.peacocktv.com/sports/nfl' },
  { match: /\bcbs\b|paramount/i, url: 'https://www.paramountplus.com/sports/nfl/' },
  { match: /\bfox\b|fs1\b/i, url: 'https://www.foxsports.com/live' },
  { match: /\bespn\+?\b|\babc\b/i, url: 'https://www.espn.com/watch/' },
  { match: /\bnfl\s*network\b|\bnfln\b/i, url: 'https://www.nfl.com/network/watch/', label: 'NFL Network' },
  { match: /\bnfl\+/i, url: 'https://www.nfl.com/plus/', label: 'NFL+' },
]

function watchMetaForNetwork(network: string): { label: string; url: string } | null {
  const raw = String(network || '').trim()
  if (!raw) return null
  for (const row of NFL_WATCH_URL_BY_NETWORK) {
    if (row.match.test(raw)) {
      return { label: row.label || raw, url: row.url }
    }
  }
  // Unknown network … still show the label; link NFL.com watch hub as a safe default.
  return { label: raw, url: 'https://www.nfl.com/schedules/' }
}

function espnMatchupKey(awayAbb: string, homeAbb: string, commenceIso: string): string {
  return `${nflAbbrevKey(awayAbb)}@${nflAbbrevKey(homeAbb)}:${ptDateFromIso(commenceIso)}`
}

type EspnSlateExtras = {
  recordsByAbbrev: Map<string, string>
  broadcastByMatchup: Map<string, { label: string; url: string }>
}

const ESPN_SLATE_TTL_MS = 10 * 60 * 1000
const espnFootballSlateCache = new Map<EspnFootballLeague, { at: number; extras: EspnSlateExtras }>()

/**
 * Season W-L + national broadcast from ESPN public scoreboard (unofficial).
 * Cached 10m so the 45s pill poll does not hammer ESPN. Allowed on test + prod.
 */
async function loadEspnFootballSlateExtras(
  games: LoungeSportsGame[],
  league: EspnFootballLeague,
  sportMatch: (sportKey: string) => boolean,
): Promise<EspnSlateExtras> {
  const cached = espnFootballSlateCache.get(league)
  if (cached && Date.now() - cached.at < ESPN_SLATE_TTL_MS) {
    return cached.extras
  }
  const recordsByAbbrev = new Map<string, string>()
  const broadcastByMatchup = new Map<string, { label: string; url: string }>()
  const dateSet = new Set<string>()
  for (const g of games) {
    if (!sportMatch(String(g.sport_key || ''))) continue
    const day = ptDateFromIso(g.commence_time)
    if (day) dateSet.add(day.replace(/-/g, ''))
  }
  const dates = ['', ...[...dateSet].sort()]
  const headers = { 'User-Agent': 'EdgeTiltLounge/1.0', Accept: 'application/json' }
  const base = espnFootballScoreboardPath(league)

  await Promise.all(dates.map(async (date) => {
    const url = date ? `${base}?dates=${date}` : base
    try {
      const res = await fetch(url, { headers, signal: AbortSignal.timeout(8_000) })
      if (!res.ok) return
      const pack = await res.json() as { events?: Array<Record<string, unknown>> }
      for (const ev of Array.isArray(pack.events) ? pack.events : []) {
        const comps = (ev.competitions as Array<Record<string, unknown>> | undefined)?.[0]
        const competitors = Array.isArray(comps?.competitors)
          ? comps.competitors as Array<Record<string, unknown>>
          : []
        let homeAbb = ''
        let awayAbb = ''
        for (const c of competitors) {
          const team = (c.team && typeof c.team === 'object') ? c.team as Record<string, unknown> : {}
          const abb = nflAbbrevKey(team.abbreviation)
          const rec = recordFromEspnCompetitor(c)
          if (abb && rec) recordsByAbbrev.set(abb, rec)
          if (c.homeAway === 'home') homeAbb = abb
          if (c.homeAway === 'away') awayAbb = abb
        }
        const network = broadcastFromEspnCompetition(comps)
        const watch = network ? watchMetaForNetwork(network) : null
        const commence = String(ev.date || comps?.date || '').trim()
        if (watch && awayAbb && homeAbb && commence) {
          broadcastByMatchup.set(espnMatchupKey(awayAbb, homeAbb, commence), watch)
        }
      }
    } catch {
      // soft-fail … slate still paints without extras
    }
  }))

  const extras = { recordsByAbbrev, broadcastByMatchup }
  espnFootballSlateCache.set(league, { at: Date.now(), extras })
  return extras
}

async function enrichEspnFootballExtras(
  games: LoungeSportsGame[],
  league: EspnFootballLeague,
  sportMatch: (sportKey: string) => boolean,
): Promise<LoungeSportsGame[]> {
  const subset = games.filter((g) => sportMatch(String(g.sport_key || '')))
  if (!subset.length) return games
  const { recordsByAbbrev, broadcastByMatchup } = await loadEspnFootballSlateExtras(
    subset,
    league,
    sportMatch,
  )
  if (!recordsByAbbrev.size && !broadcastByMatchup.size) return games
  return games.map((g) => {
    if (!sportMatch(String(g.sport_key || ''))) return g
    const awayRec = recordsByAbbrev.get(nflAbbrevKey(g.away?.abbrev)) || null
    const homeRec = recordsByAbbrev.get(nflAbbrevKey(g.home?.abbrev)) || null
    const watch = broadcastByMatchup.get(
      espnMatchupKey(g.away?.abbrev || '', g.home?.abbrev || '', g.commence_time),
    ) || null
    const nextAway = awayRec ? { ...g.away, record: awayRec ?? g.away?.record ?? null } : g.away
    const nextHome = homeRec ? { ...g.home, record: homeRec ?? g.home?.record ?? null } : g.home
    const broadcast = watch?.label || g.broadcast || null
    const broadcastUrl = watch?.url || g.broadcast_url || null
    if (
      nextAway === g.away
      && nextHome === g.home
      && broadcast === (g.broadcast || null)
      && broadcastUrl === (g.broadcast_url || null)
    ) return g
    return {
      ...g,
      away: nextAway,
      home: nextHome,
      broadcast,
      broadcast_url: broadcastUrl,
    }
  })
}

export async function buildLoungeSportsScoreboard(
  admin?: SupabaseClient,
): Promise<{ games: LoungeSportsGame[]; source: string }> {
  const nflDates = nflFetchDates()
  const cfbDates = cfbFetchDates()
  const byKey = new Map<string, LoungeSportsGame>()
  let source = 'none'
  const nflSport = LOUNGE_SPORTS_SCOREBOARD_SPORTS.find((s) => s.key === 'americanfootball_nfl')
  const cfbSport = LOUNGE_SPORTS_SCOREBOARD_SPORTS.find((s) => s.key === 'americanfootball_ncaaf')

  const upsert = (game: LoungeSportsGame, overwrite = false) => {
    const key = slateDedupeKey(game)
    if (!overwrite && byKey.has(key)) return
    byKey.set(key, game)
  }

  // NFL + CFB in parallel. Other leagues stay skipped … sequential 6-sport fetch
  // burned the Edge wall clock and 502'd the Lounge pills.
  const [nflPack, cfbPack] = await Promise.all([
    nflSport
      ? Promise.all([
        Promise.all(nflDates.map((date) => listRundownDayEvents(nflSport.key, date).catch(() => []))),
        fetchSportScores('americanfootball_nfl', 3).catch(() => []),
        cachedSportOdds('americanfootball_nfl'),
        cachedPinnacleOdds('americanfootball_nfl'),
      ])
      : Promise.resolve(null),
    cfbSport
      ? Promise.all([
        Promise.all(cfbDates.map((date) => listRundownDayEvents(cfbSport.key, date).catch(() => []))),
        fetchSportScores('americanfootball_ncaaf', 3).catch(() => []),
        cachedSportOdds('americanfootball_ncaaf'),
        cachedPinnacleOdds('americanfootball_ncaaf'),
      ])
      : Promise.resolve(null),
  ])

  if (nflSport && nflPack) {
    const [nflBatches, nflScores, nflOddsPack, pinPack] = nflPack
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
    if (nflOddsPack || pinPack) source = source.includes('odds') ? source : source === 'none' ? 'odds' : `${source}+odds`
    let nflGames = applyPinnacleQuotes(
      [...byKey.values()].filter((g) => isNflSportKey(g.sport_key)),
      pinPack,
      false,
    )
    if (admin && pinPack?.events?.length) {
      await upsertMarketFilesFromEvents(
        admin,
        'americanfootball_nfl',
        pinPack.events as OddsEvent[],
      ).catch(() => null)
    }
    nflGames = await applyMarketFileCloses(nflGames, admin, nflDates)
    nflGames = await fillClosingQuotesFromHistorical(nflGames, 'americanfootball_nfl', admin)
    if (admin) {
      await lockDueMarketFileCloses(admin, 'americanfootball_nfl').catch(() => null)
    }
    for (const game of [...byKey.values()]) {
      if (isNflSportKey(game.sport_key)) byKey.delete(slateDedupeKey(game))
    }
    for (const game of nflGames) upsert(game, true)
  }

  if (cfbSport && cfbPack) {
    const [cfbBatches, cfbScores, cfbOddsPack, cfbPinPack] = cfbPack
    for (const events of cfbBatches) {
      if (events.length) source = source === 'none' ? 'rundown' : source
      for (const ev of events) {
        const game = gameFromRundown(cfbSport.key, cfbSport.label, cfbSport.logoLeague, ev)
        if (game && gameOnSlate(game, cfbDates)) upsert(game, true)
      }
    }
    if (cfbScores.length) {
      source = source === 'none' ? 'odds' : source.includes('odds') ? source : `${source}+odds`
      for (const ev of cfbScores) {
        const game = gameFromOdds('americanfootball_ncaaf', 'CFB', 'ncaa', ev)
        if (game && gameOnSlate(game, cfbDates)) upsert(game, false)
      }
    }
    if (cfbOddsPack || cfbPinPack) {
      source = source.includes('odds') ? source : source === 'none' ? 'odds' : `${source}+odds`
    }
    let cfbGames = applyPinnacleQuotes(
      [...byKey.values()].filter((g) => isCfbSportKey(g.sport_key)),
      cfbPinPack,
      false,
    )
    if (admin && cfbPinPack?.events?.length) {
      await upsertMarketFilesFromEvents(
        admin,
        'americanfootball_ncaaf',
        cfbPinPack.events as OddsEvent[],
      ).catch(() => null)
    }
    cfbGames = await applyMarketFileCloses(cfbGames, admin, cfbDates)
    cfbGames = await fillClosingQuotesFromHistorical(cfbGames, 'americanfootball_ncaaf', admin)
    if (admin) {
      await lockDueMarketFileCloses(admin, 'americanfootball_ncaaf').catch(() => null)
    }
    for (const game of [...byKey.values()]) {
      if (isCfbSportKey(game.sport_key)) byKey.delete(slateDedupeKey(game))
    }
    for (const game of cfbGames) upsert(game, true)
  }

  const games = [...byKey.values()].sort((a, b) => {
    const rank = { in: 0, post: 1, pre: 2 }
    const d = rank[a.status] - rank[b.status]
    if (d) return d
    return String(a.commence_time).localeCompare(String(b.commence_time))
  })
  let withRecords = await enrichEspnFootballExtras(games, 'nfl', isNflSportKey)
  withRecords = await enrichEspnFootballExtras(withRecords, 'college-football', isCfbSportKey)
  withRecords = withRecords.map(attachCfbEspnTeamIds)
  return { games: withRecords, source }
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

const PINNACLE_REGIONS = ['eu', 'us', 'us2']
const PINNACLE_BOOKS = ['pinnacle']
const pinnacleCache = new Map<string, { at: number; pack: Awaited<ReturnType<typeof fetchSportOdds>> | null }>()

async function cachedPinnacleOdds(sportKey: string) {
  const key = `pin:${sportKey}`
  const cached = pinnacleCache.get(key)
  if (cached && Date.now() - cached.at < ODDS_CACHE_MS) return cached.pack
  const pack = await fetchSportOdds(
    sportKey,
    PINNACLE_REGIONS,
    ['h2h', 'spreads', 'totals'],
    { bookmakers: PINNACLE_BOOKS },
  ).catch(() => null)
  pinnacleCache.set(key, { at: Date.now(), pack })
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

/** Unofficial ESPN public summary … fills football PBP / clock when TheRundown plays are empty.
 *  NFL: prod only (`jtjgtucumuoswnbauxry`) so sandbox hub polls do not burn ESPN.
 *  CFB: allowed on test + prod (college hub Plays tab needs it when Rundown is thin).
 */
const PROD_SUPABASE_REF = 'jtjgtucumuoswnbauxry'

function isProdSupabaseProject(): boolean {
  const url = Deno.env.get('SUPABASE_URL') || ''
  return url.includes(PROD_SUPABASE_REF)
}

function espnCompetitorTeamId(c: Record<string, unknown>): string {
  const team = (c.team && typeof c.team === 'object') ? c.team as Record<string, unknown> : {}
  return String(c.id || team.id || '').trim()
}

function espnSideMatchesGame(
  espnSide: Record<string, unknown>,
  gameSide: LoungeSportsGameSide | undefined,
): boolean {
  if (!espnSide || !gameSide) return false
  const espnAbb = nflAbbrevKey(espnSide.abb)
  const gameAbb = nflAbbrevKey(gameSide.abbrev)
  if (espnAbb && gameAbb && espnAbb === gameAbb) return true
  const espnId = espnCompetitorTeamId(espnSide)
  const gameTid = gameSide.team_id != null ? String(gameSide.team_id) : ''
  if (espnId && gameTid && espnId === gameTid) return true
  const espnTeam = (espnSide.team && typeof espnSide.team === 'object')
    ? espnSide.team as Record<string, unknown>
    : {}
  const espnName = String(espnTeam.displayName || espnTeam.name || espnSide.abb || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
  const gameName = String(gameSide.name || gameSide.mascot || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
  if (espnName.length >= 6 && gameName.length >= 6) {
    if (espnName.includes(gameName) || gameName.includes(espnName)) return true
    const espnTok = espnName.split(' ').filter((t) => t.length > 3)
    const gameTok = new Set(gameName.split(' ').filter((t) => t.length > 3))
    if (espnTok.some((t) => gameTok.has(t))) return true
  }
  return false
}

async function fetchEspnFootballLivePack(
  game: LoungeSportsGame,
): Promise<{ live: LoungeSportsLiveState | null; plays: LoungeSportsPlay[] }> {
  const sk = String(game.sport_key || '')
  const league: EspnFootballLeague | null = isCfbSportKey(sk)
    ? 'college-football'
    : isNflSportKey(sk)
      ? 'nfl'
      : null
  if (!league) return { live: null, plays: [] }
  // NFL ESPN fallback stays prod-only; CFB runs on test too.
  if (league === 'nfl' && !isProdSupabaseProject()) {
    return { live: null, plays: [] }
  }
  const awayAbb = nflAbbrevKey(game.away?.abbrev)
  const homeAbb = nflAbbrevKey(game.home?.abbrev)
  if ((!awayAbb || !homeAbb) && game.away?.team_id == null && game.home?.team_id == null) {
    return { live: null, plays: [] }
  }

  const dates: string[] = []
  const kick = game.commence_time ? new Date(game.commence_time) : new Date()
  for (const delta of [-1, 0, 1]) {
    const d = new Date(kick)
    d.setUTCDate(d.getUTCDate() + delta)
    const y = d.getUTCFullYear()
    const m = String(d.getUTCMonth() + 1).padStart(2, '0')
    const day = String(d.getUTCDate()).padStart(2, '0')
    dates.push(`${y}${m}${day}`)
  }
  dates.push('') // also try undated scoreboard

  const headers = { 'User-Agent': 'EdgeTiltLounge/1.0', Accept: 'application/json' }
  let eventId = ''
  let homeEspnId = ''
  let awayEspnId = ''
  let statusPeriod: number | null = null
  let statusClock = ''
  let boardHomeTimeouts: number | null = null
  let boardAwayTimeouts: number | null = null
  let boardPossession: 'home' | 'away' | null = null
  let boardPossessionText: string | null = null
  let boardYardLine: number | null = null
  let boardYardsToEndzone: number | null = null
  let boardHomeAbbrev = homeAbb
  let boardAwayAbbrev = awayAbb
  const boardBase = espnFootballScoreboardPath(league)

  for (const date of dates) {
    const url = date ? `${boardBase}?dates=${date}` : boardBase
    try {
      const res = await fetch(url, { headers, signal: AbortSignal.timeout(8_000) })
      if (!res.ok) continue
      const pack = await res.json() as { events?: Array<Record<string, unknown>> }
      for (const ev of Array.isArray(pack.events) ? pack.events : []) {
        const comps = (ev.competitions as Array<Record<string, unknown>> | undefined)?.[0]
        const competitors = Array.isArray(comps?.competitors) ? comps.competitors as Array<Record<string, unknown>> : []
        let home: Record<string, unknown> | null = null
        let away: Record<string, unknown> | null = null
        for (const c of competitors) {
          const team = (c.team && typeof c.team === 'object') ? c.team as Record<string, unknown> : {}
          const abb = nflAbbrevKey(team.abbreviation)
          if (c.homeAway === 'home') home = { ...c, abb, team }
          if (c.homeAway === 'away') away = { ...c, abb, team }
        }
        if (!home || !away) continue
        if (!espnSideMatchesGame(away, game.away) || !espnSideMatchesGame(home, game.home)) continue
        eventId = String(ev.id || '').trim()
        homeEspnId = espnCompetitorTeamId(home)
        awayEspnId = espnCompetitorTeamId(away)
        const status = (comps?.status && typeof comps.status === 'object')
          ? comps.status as Record<string, unknown>
          : (ev.status && typeof ev.status === 'object')
            ? ev.status as Record<string, unknown>
            : {}
        const type = (status.type && typeof status.type === 'object') ? status.type as Record<string, unknown> : {}
        statusPeriod = numOrNull(status.period ?? type.period)
        statusClock = String(status.displayClock || type.detail || '').trim()
        const sit = (comps?.situation && typeof comps.situation === 'object')
          ? comps.situation as Record<string, unknown>
          : null
        if (sit) {
          boardHomeTimeouts = timeoutsRemaining(sit.homeTimeouts)
          boardAwayTimeouts = timeoutsRemaining(sit.awayTimeouts)
          const possId = String(sit.possession || '').trim()
          if (possId && homeEspnId && possId === homeEspnId) boardPossession = 'home'
          else if (possId && awayEspnId && possId === awayEspnId) boardPossession = 'away'
          boardPossessionText = String(sit.possessionText || '').trim() || null
          boardYardLine = numOrNull(sit.yardLine)
          // ESPN absolute: 0 = home endzone, 100 = away endzone.
          // Home attacks toward 100 → yte = 100 - abs. Away attacks toward 0 → yte = abs.
          if (boardPossession === 'home' && boardYardLine != null) {
            boardYardsToEndzone = 100 - boardYardLine
          } else if (boardPossession === 'away' && boardYardLine != null) {
            boardYardsToEndzone = boardYardLine
          }
          const homeTeam = (home.team && typeof home.team === 'object') ? home.team as Record<string, unknown> : {}
          const awayTeam = (away.team && typeof away.team === 'object') ? away.team as Record<string, unknown> : {}
          boardHomeAbbrev = nflAbbrevKey(homeTeam.abbreviation) || boardHomeAbbrev
          boardAwayAbbrev = nflAbbrevKey(awayTeam.abbreviation) || boardAwayAbbrev
        }
        break
      }
    } catch {
      // try next date
    }
    if (eventId) break
  }
  if (!eventId) return { live: null, plays: [] }

  try {
    const res = await fetch(
      espnFootballSummaryPath(league, eventId),
      { headers, signal: AbortSignal.timeout(10_000) },
    )
    if (!res.ok) return { live: null, plays: [] }
    const summary = await res.json() as Record<string, unknown>
    const drivesObj = (summary.drives && typeof summary.drives === 'object')
      ? summary.drives as Record<string, unknown>
      : {}
    const driveList: Array<Record<string, unknown>> = []
    if (Array.isArray(drivesObj.previous)) driveList.push(...drivesObj.previous as Array<Record<string, unknown>>)
    if (drivesObj.current && typeof drivesObj.current === 'object') {
      driveList.push(drivesObj.current as Record<string, unknown>)
    }

    const sideForEspnTeamId = (id: string): 'home' | 'away' | null => {
      if (!id) return null
      if (homeEspnId && id === homeEspnId) return 'home'
      if (awayEspnId && id === awayEspnId) return 'away'
      return null
    }

    const plays: LoungeSportsPlay[] = []
    for (const drive of driveList) {
      for (const row of Array.isArray(drive.plays) ? drive.plays as Array<Record<string, unknown>> : []) {
        const text = String(row.text || row.description || '').trim()
        if (!text) continue
        const participants = Array.isArray(row.teamParticipants)
          ? row.teamParticipants as Array<Record<string, unknown>>
          : []
        const offense = participants.find((p) => String(p.type || '') === 'offense')
        const start = (row.start && typeof row.start === 'object') ? row.start as Record<string, unknown> : null
        const startTeam = (start?.team && typeof start.team === 'object')
          ? start.team as Record<string, unknown>
          : null
        const teamId = String(offense?.id || startTeam?.id || '').trim()
        const periodObj = (row.period && typeof row.period === 'object')
          ? row.period as Record<string, unknown>
          : null
        const clockObj = (row.clock && typeof row.clock === 'object')
          ? row.clock as Record<string, unknown>
          : null
        plays.push({
          id: String(row.id || row.sequenceNumber || `${plays.length}`),
          period: numOrNull(periodObj?.number ?? row.period),
          clock: String(clockObj?.displayValue || row.clock || '').trim(),
          description: text,
          team: sideForEspnTeamId(teamId),
        })
      }
    }

    const last = plays.length ? plays[plays.length - 1] : null
    const lastDrive = driveList.length ? driveList[driveList.length - 1] : null
    const lastPlayRow = lastDrive && Array.isArray(lastDrive.plays) && lastDrive.plays.length
      ? lastDrive.plays[lastDrive.plays.length - 1] as Record<string, unknown>
      : null
    const end = lastPlayRow && lastPlayRow.end && typeof lastPlayRow.end === 'object'
      ? lastPlayRow.end as Record<string, unknown>
      : null
    const endTeam = end?.team && typeof end.team === 'object' ? end.team as Record<string, unknown> : null
    const possession = boardPossession ?? sideForEspnTeamId(String(endTeam?.id || ''))
    const possessionText = String(
      end?.possessionText || boardPossessionText || '',
    ).trim() || null
    const yardsToEndzone = numOrNull(end?.yardsToEndzone) ?? boardYardsToEndzone
    const absoluteYardLine = numOrNull(end?.yardLine) ?? boardYardLine
    const spot = resolveFootballYardSpot({
      possessionText,
      yardsToEndzone,
      absoluteYardLine,
      possession,
      homeAbbrev: boardHomeAbbrev || game.home?.abbrev,
      awayAbbrev: boardAwayAbbrev || game.away?.abbrev,
    })
    const down = numOrNull(end?.down)
    const distance = numOrNull(end?.distance)

    const live: LoungeSportsLiveState | null = (statusClock || statusPeriod != null || last?.description || possessionText)
      ? {
          clock: statusClock.includes(' - ') ? '' : statusClock,
          period: statusPeriod ?? last?.period ?? null,
          down: down && down > 0 ? down : null,
          distance: distance && distance > 0 ? distance : null,
          yard_line: spot.yard_line,
          yard_side: spot.yard_side,
          possession,
          home_timeouts: boardHomeTimeouts,
          away_timeouts: boardAwayTimeouts,
          last_play: last?.description || '',
        }
      : null

    return { live, plays: plays.slice(-80) }
  } catch {
    return { live: null, plays: [] }
  }
}

function mergeLiveState(
  primary: LoungeSportsLiveState | null,
  fallback: LoungeSportsLiveState | null,
): LoungeSportsLiveState | null {
  if (!primary && !fallback) return null
  if (!primary) return fallback
  if (!fallback) return primary
  return {
    clock: primary.clock || fallback.clock,
    period: primary.period ?? fallback.period,
    down: primary.down ?? fallback.down,
    distance: primary.distance ?? fallback.distance,
    yard_line: primary.yard_line ?? fallback.yard_line,
    yard_side: primary.yard_side ?? fallback.yard_side,
    possession: primary.possession ?? fallback.possession,
    home_timeouts: primary.home_timeouts ?? fallback.home_timeouts,
    away_timeouts: primary.away_timeouts ?? fallback.away_timeouts,
    last_play: primary.last_play || fallback.last_play,
  }
}

type OddsBookmaker = {
  key?: string
  title?: string
  markets?: Array<{ key?: string; outcomes?: Array<{ name?: string; price?: number; point?: number }> }>
}

type OddsEventRow = {
  id?: string
  commence_time?: string
  home_team?: string
  away_team?: string
  bookmakers?: OddsBookmaker[]
}

function outcomePoint(outcomes: Array<{ name?: string; price?: number; point?: number }>, name: string) {
  const want = String(name || '').trim().toLowerCase()
  if (!want) return { price: null, point: null }
  const wantLast = want.split(/\s+/).pop() || want
  const row = outcomes.find((o) => {
    const n = String(o.name || '').trim().toLowerCase()
    if (!n) return false
    if (n === want) return true
    const last = n.split(/\s+/).pop() || n
    return Boolean(wantLast) && wantLast.length >= 4 && (last === wantLast || n.endsWith(wantLast) || want.endsWith(last))
  })
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
  // Pinnacle first always … then sharp/retail staples, then whatever else The Odds API returned.
  const preferred = ['pinnacle', 'lowvig', 'fanduel', 'draftkings', 'betmgm', 'caesars', 'fanatics', 'williamhill_us']
  const ordered: OddsBookmaker[] = []
  for (const key of preferred) {
    const hit = books.find((b) => String(b.key || '').toLowerCase() === key)
    if (hit) ordered.push(hit)
  }
  for (const book of books) {
    if (!ordered.includes(book)) ordered.push(book)
  }
  const rows: LoungeSportsOddsRow[] = []
  let pinnacleRow: LoungeSportsOddsRow | null = null
  for (const book of ordered) {
    const row = compactBook(book, homeName, awayName)
    if (!row) continue
    if (String(book.key || '').toLowerCase() === 'pinnacle') {
      pinnacleRow = row
      continue
    }
    rows.push(row)
  }
  // Compacted rows are tiny (~0.2KB each) … keep 8, with Pinnacle pinned first when present.
  const out = pinnacleRow ? [pinnacleRow, ...rows] : rows
  return out.slice(0, 8)
}

/** Merge a Pinnacle bookmaker from the eu-region pack onto a us/us2 event (Pinnacle often absent there). */
function mergePinnacleBookmaker(target: OddsEventRow, pinPack: { events?: OddsEventRow[] } | null): OddsEventRow {
  const pinEvents = Array.isArray(pinPack?.events) ? pinPack!.events as OddsEventRow[] : []
  if (!pinEvents.length) return target
  const matched = pinEvents.find((ev) =>
    String(ev.home_team || '').toLowerCase() === String(target.home_team || '').toLowerCase() &&
    String(ev.away_team || '').toLowerCase() === String(target.away_team || '').toLowerCase()
  )
  const pinBook = matched ? pinnacleBookFromEvent(matched) : null
  if (!pinBook) return target
  const existing = Array.isArray(target.bookmakers) ? [...target.bookmakers] : []
  const withoutPin = existing.filter((b) => String(b.key || '').toLowerCase() !== 'pinnacle')
  return { ...target, bookmakers: [pinBook, ...withoutPin] }
}

function gameHasSpread(game: LoungeSportsGame): boolean {
  return numOrNull(game.home?.spread) != null || numOrNull(game.away?.spread) != null
}

function pinnacleBookFromEvent(ev: OddsEventRow): OddsBookmaker | null {
  return (ev.bookmakers || []).find((b) => String(b.key || '').toLowerCase() === 'pinnacle') || null
}

function applyPinnacleQuotes(
  games: LoungeSportsGame[],
  pack: Awaited<ReturnType<typeof fetchSportOdds>> | { events?: OddsEventRow[] } | null,
  onlyIfMissing = false,
): LoungeSportsGame[] {
  const events = Array.isArray(pack?.events) ? pack!.events as OddsEventRow[] : []
  if (!events.length) return games
  return games.map((game) => {
    const needSpread = !gameHasSpread(game)
    const needMl = numOrNull(game.home?.ml) == null || numOrNull(game.away?.ml) == null
    if (onlyIfMissing && !needSpread && !needMl) return game
    const matched = events.find((ev) =>
      sameNflSide(String(ev.home_team || ''), game.home) && sameNflSide(String(ev.away_team || ''), game.away)
    )
    if (!matched) return game
    const book = pinnacleBookFromEvent(matched)
    if (!book) return game
    const homeName = String(matched.home_team || game.home.name)
    const awayName = String(matched.away_team || game.away.name)
    const row = compactBook(book, homeName, awayName)
    if (!row) return game
    const pair = pairSpreads(numOrNull(row.home_spread), numOrNull(row.away_spread))
    return {
      ...game,
      home: {
        ...game.home,
        spread: pair.home ?? game.home.spread ?? null,
        ml: row.home_ml ?? game.home.ml ?? null,
      },
      away: {
        ...game.away,
        spread: pair.away ?? game.away.spread ?? null,
        ml: row.away_ml ?? game.away.ml ?? null,
      },
    }
  })
}

function fileMatchesGame(file: MarketFileRow, game: LoungeSportsGame): boolean {
  return sameNflSide(file.home_team, game.home) && sameNflSide(file.away_team, game.away)
}

async function applyMarketFileCloses(
  games: LoungeSportsGame[],
  admin: SupabaseClient | undefined,
  nflDates: string[],
): Promise<LoungeSportsGame[]> {
  if (!admin || !nflDates.length) return games
  const fromIso = `${nflDates[0]}T00:00:00-07:00`
  const toIso = `${nflDates[nflDates.length - 1]}T23:59:59-07:00`
  const files = await loadMarketFilesForSportWindow(admin, 'americanfootball_nfl', fromIso, toIso).catch(() => [])
  if (!files.length) return games
  return games.map((game) => {
    const file = files.find((row) => fileMatchesGame(row, game))
    if (!file) return game
    let next = game
    const spreadQuote = resolvePregameSpreadFromFile(file, game.commence_time)
    if (spreadQuote && (game.status === 'post' || !gameHasSpread(game))) {
      const pair = pairSpreads(spreadQuote.homePoint, spreadQuote.homePoint != null ? -spreadQuote.homePoint : null)
      next = {
        ...next,
        home: { ...next.home, spread: pair.home ?? next.home.spread ?? null },
        away: { ...next.away, spread: pair.away ?? next.away.spread ?? null },
      }
    }
    const mlQuote = resolvePregameMlFromFile(file, game.commence_time)
    const needMl = numOrNull(next.home?.ml) == null || numOrNull(next.away?.ml) == null
    if (mlQuote && (game.status === 'post' || needMl)) {
      next = {
        ...next,
        home: { ...next.home, ml: mlQuote.homeMl ?? next.home.ml ?? null },
        away: { ...next.away, ml: mlQuote.awayMl ?? next.away.ml ?? null },
      }
    }
    return next
  })
}

const HIST_ODDS_CACHE_MS = 12 * 60 * 60 * 1000
const histOddsCache = new Map<string, { at: number; pack: { events: OddsEventRow[] }; ttl: number }>()

function kickoffSnapshotIso(commence: string): string {
  const t = Date.parse(commence)
  if (!Number.isFinite(t)) return ''
  const bucket = Math.floor((t - 60_000) / (10 * 60 * 1000)) * (10 * 60 * 1000)
  return new Date(Math.max(0, bucket)).toISOString().replace(/\.\d{3}Z$/, 'Z')
}

function eventHasH2h(ev: OddsEventRow): boolean {
  return (ev.bookmakers || []).some((book) =>
    (book.markets || []).some((m) => String(m.key || '') === 'h2h' && (m.outcomes || []).length >= 2),
  )
}

async function cachedHistoricalPinnacle(sportKey: string, dateIso: string) {
  const key = `pin|${sportKey}|${dateIso}`
  const cached = histOddsCache.get(key)
  if (cached && Date.now() - cached.at < cached.ttl) return cached.pack
  const pack = await fetchSportOddsHistorical(
    sportKey,
    dateIso,
    PINNACLE_REGIONS,
    ['spreads', 'h2h', 'totals'],
    { bookmakers: PINNACLE_BOOKS },
  ).catch(() => null)
  const events = Array.isArray(pack?.events) ? pack!.events as OddsEventRow[] : []
  const next = { events }
  if (events.length) {
    const ttl = events.some(eventHasH2h) ? HIST_ODDS_CACHE_MS : 3 * 60 * 1000
    histOddsCache.set(key, { at: Date.now(), pack: next, ttl })
  }
  return next
}

/** Live /odds drops finals. Kickoff Pinnacle snapshot is the closing ATS + ML. */
async function fillClosingQuotesFromHistorical(
  games: LoungeSportsGame[],
  sportKey: string,
  admin?: SupabaseClient,
): Promise<LoungeSportsGame[]> {
  const missing = games.filter((g) =>
    (g.status === 'post' || g.status === 'in')
    && (!gameHasSpread(g) || numOrNull(g.home?.ml) == null || numOrNull(g.away?.ml) == null)
  )
  const stamps = [...new Set(missing.map((g) => kickoffSnapshotIso(g.commence_time)).filter(Boolean))]
  if (!stamps.length) return games
  let next = games
  const used: OddsEventRow[] = []
  const packs = await Promise.all(stamps.slice(0, 24).map((stamp) => cachedHistoricalPinnacle(sportKey, stamp)))
  for (const pack of packs) {
    if (!pack.events.length) continue
    used.push(...pack.events)
    next = applyPinnacleQuotes(next, pack, true)
  }
  if (admin && used.length) {
    await upsertMarketFilesFromEvents(admin, sportKey, used as OddsEvent[]).catch(() => null)
    await lockDueMarketFileCloses(admin, sportKey).catch(() => null)
  }
  return next
}

function sameNflSide(oddsName: string, side: LoungeSportsGameSide): boolean {
  if (oddsNamesHit(oddsName, side)) return true
  const oddsAbbrev = nflAbbrevFromOddsName(oddsName)
  const sideAbbrev = String(side.abbrev || '').toUpperCase() === 'WSH' ? 'WAS' : String(side.abbrev || '').toUpperCase()
  return Boolean(oddsAbbrev) && oddsAbbrev === sideAbbrev
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
  const [eventRaw, playsRaw, statsRaw, oddsPack, pinPack] = await Promise.all([
    rundownGet<unknown>(`/events/${eventId}`),
    rundownGet<unknown>(`/events/${eventId}/plays`),
    rundownGet<unknown>(`/events/${eventId}/players/stats`),
    cachedSportOdds(game.sport_key),
    cachedPinnacleOdds(game.sport_key),
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

  let liveOut = live
  let playsOut = plays
  const sk = String(game.sport_key || '')
  const needEspn =
    (isNflSportKey(sk) || isCfbSportKey(sk)) &&
    (playsOut.length === 0 || !String(liveOut?.last_play || '').trim() || !String(liveOut?.clock || '').trim())
  if (needEspn) {
    const espn = await fetchEspnFootballLivePack(game)
    if (espn.plays.length && playsOut.length === 0) playsOut = espn.plays
    liveOut = mergeLiveState(liveOut, espn.live)
  }

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
  const matchedRaw = events.find((ev) =>
    oddsNamesHit(String(ev.home_team || ''), game.home) && oddsNamesHit(String(ev.away_team || ''), game.away)
  )
  const matched = matchedRaw ? mergePinnacleBookmaker(matchedRaw, pinPack) : null
  const odds = matched
    ? compactOddsBooksFromEvent(matched, String(matched.home_team || game.home.name), String(matched.away_team || game.away.name))
    : []

  return {
    live: liveOut,
    odds,
    plays: playsOut,
    stats,
  }
}
