/**
 * TheRundown API enrichment for Scott captions (pitchers, headlines, player status).
 * Fetches only at publish time; never fabricates injury or matchup copy.
 */
import type { LineMovementAlert } from './loungeBotLineMovement.ts'

export { sportContextLabelFromKey } from './loungeBotSportLabels.ts'

const RUNDOWN_BASE = 'https://therundown.io/api/v2'
const PT_OFFSET_MIN = 420
const CACHE_MS = 45 * 60 * 1000
export const RUNDOWN_LIVE_CACHE_MS = 3 * 60 * 1000
const COMMENCE_MATCH_MS = 6 * 60 * 60 * 1000

export type RundownContextPostKind =
  | 'best_bet_hour'
  | 'sharp_report'
  | 'coffee_covers'
  | 'dog_of_the_day'
  | 'in_game_edge'
  | 'period_report'
  | 'value_bet_radar'
  | 'sharp_move'
  | 'steam'
  | 'rlm'
  | 'line_movement'

export type RundownMatchInput = {
  sportKey: string
  homeTeam: string
  awayTeam: string
  commenceTime: string
  pickTeamName?: string
  movedTeamName?: string
  live?: boolean
}

type RundownPitcher = { id?: number; name?: string }
type RundownTeam = {
  team_id?: number
  name?: string
  mascot?: string
  abbreviation?: string
  is_home?: boolean
  is_away?: boolean
}
type RundownPlayer = {
  id?: number
  display_name?: string
  first_name?: string
  last_name?: string
  status?: string
  active?: boolean
  position?: string
  position_abbreviation?: string
  primary_position?: string
  depth_chart_order?: number
  depth?: number
}
export type RundownScore = {
  event_status?: string
  score_away?: number
  score_home?: number
  score_away_by_period?: number[]
  score_home_by_period?: number[]
  game_clock?: number
  display_clock?: string
  game_period?: number
  event_status_detail?: string
  venue_name?: string
  venue_location?: string
  updated_at?: string
}

type RundownEvent = {
  event_id?: string
  event_date?: string
  sport_id?: number
  teams?: RundownTeam[]
  pitcher_away?: RundownPitcher
  pitcher_home?: RundownPitcher
  schedule?: { event_headline?: string }
  score?: RundownScore
}

export type ResolvedRundownEvent = {
  eventId: string
  sportId: number
  awayTeamId?: number
  homeTeamId?: number
  pitcherAway?: string
  pitcherHome?: string
  headline?: string
  venueLocation?: string
  inactivePlayers: Array<{
    name: string
    status: string
    teamId: number
    position?: string | null
    depthOrder?: number | null
  }>
  liveNotes: string[]
}

const dayEventsCache = new Map<string, { at: number; events: RundownEvent[] }>()
const eventCache = new Map<string, { at: number; ctx: ResolvedRundownEvent }>()
const teamPlayersCache = new Map<number, { at: number; players: RundownPlayer[] }>()

const INJURY_STATUS_RE = /^(out|inactive|suspended|doubtful|questionable|injured|ir|pup|na|gtd)$/i
const HEADLINE_NEWS_RE = /suspend|injur|out|doubtful|questionable|missing|ruled out|inactive/i

const HIGH_CONTEXT_KINDS = new Set<RundownContextPostKind>([
  'best_bet_hour',
  'sharp_report',
  'coffee_covers',
  'dog_of_the_day',
  'in_game_edge',
  'period_report',
])
const MEDIUM_CONTEXT_KINDS = new Set<RundownContextPostKind>([
  'value_bet_radar',
  'sharp_move',
  'steam',
  'rlm',
  'line_movement',
])

export function rundownApiKey(): string {
  return String(Deno.env.get('THERUNDOWN_API_KEY') || '').trim()
}

export function isRundownEnabled(): boolean {
  return rundownApiKey().length > 0
}

/** Map The Odds API sport_key → TheRundown sport_id. */
export function oddsSportKeyToRundownSportId(sportKey: string): number | null {
  const sk = String(sportKey || '').trim().toLowerCase()
  if (!sk) return null
  if (sk === 'americanfootball_nfl') return 2
  if (sk === 'americanfootball_nfl_preseason') return 25
  if (sk === 'americanfootball_ncaaf') return 1
  if (sk === 'baseball_mlb') return 3
  if (sk === 'basketball_nba') return 4
  if (sk === 'basketball_ncaab') return 5
  if (sk === 'basketball_wnba') return 8
  if (sk.startsWith('icehockey')) return 6
  if (sk.startsWith('mma')) return 7
  if (sk === 'soccer_usa_mls') return 10
  if (sk === 'soccer_epl') return 11
  if (sk === 'soccer_france_ligue_one') return 12
  if (sk === 'soccer_germany_bundesliga') return 13
  if (sk === 'soccer_spain_la_liga') return 14
  if (sk === 'soccer_italy_serie_a') return 15
  if (sk === 'soccer_uefa_champs_league') return 16
  if (sk === 'soccer_uefa_europa_league') return 33
  if (sk === 'soccer_fifa_world_cup') return 18
  if (sk.startsWith('tennis_atp')) return 38
  if (sk.startsWith('tennis_wta')) return 39
  if (sk.startsWith('soccer')) return 11
  return null
}

function shortTeamName(name: string): string {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean)
  return parts.length <= 1 ? (parts[0] || '') : parts[parts.length - 1]!
}

function normalizeTeamToken(value: string): string {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function rundownTeamLabel(team: RundownTeam): string {
  return [team.name, team.mascot].filter(Boolean).join(' ').trim()
}

function teamNamesMatch(oddsName: string, team: RundownTeam): boolean {
  const odds = normalizeTeamToken(oddsName)
  if (!odds) return false
  const full = normalizeTeamToken(rundownTeamLabel(team))
  const mascot = normalizeTeamToken(String(team.mascot || ''))
  const abbrev = normalizeTeamToken(String(team.abbreviation || ''))
  if (full && (odds === full || odds.includes(full) || full.includes(odds))) return true
  if (mascot) {
    const oddsLast = odds.split(' ').pop() || ''
    if (oddsLast === mascot || odds.includes(mascot)) return true
  }
  if (abbrev && odds.includes(abbrev)) return true
  return false
}

export function ptDateFromIso(iso: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Los_Angeles',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date(iso))
  const y = parts.find((p) => p.type === 'year')?.value ?? ''
  const m = parts.find((p) => p.type === 'month')?.value ?? ''
  const d = parts.find((p) => p.type === 'day')?.value ?? ''
  return `${y}-${m}-${d}`
}

function eventCacheKey(sportId: number, awayTeam: string, homeTeam: string, commenceTime: string): string {
  return `${sportId}|${normalizeTeamToken(awayTeam)}|${normalizeTeamToken(homeTeam)}|${ptDateFromIso(commenceTime)}`
}

function parseEventDateMs(value: string): number | null {
  const t = Date.parse(value)
  return Number.isFinite(t) ? t : null
}

function eventsMatchTeamsAndTime(
  event: RundownEvent,
  awayTeam: string,
  homeTeam: string,
  commenceTime: string,
): boolean {
  const teams = event.teams || []
  const away = teams.find((t) => t.is_away) || teams[0]
  const home = teams.find((t) => t.is_home) || teams[1]
  if (!away || !home) return false
  if (!teamNamesMatch(awayTeam, away) || !teamNamesMatch(homeTeam, home)) return false
  const commenceMs = parseEventDateMs(commenceTime)
  const eventMs = parseEventDateMs(String(event.event_date || ''))
  if (commenceMs == null || eventMs == null) return true
  return Math.abs(commenceMs - eventMs) <= COMMENCE_MATCH_MS
}

async function rundownFetch<T>(path: string): Promise<T | null> {
  const key = rundownApiKey()
  if (!key) return null
  try {
    const res = await fetch(`${RUNDOWN_BASE}${path}`, {
      headers: { 'X-TheRundown-Key': key },
    })
    if (!res.ok) return null
    return await res.json() as T
  } catch {
    return null
  }
}

async function loadDayEvents(
  sportId: number,
  ptDate: string,
  maxCacheMs = CACHE_MS,
): Promise<RundownEvent[]> {
  const cacheKey = `${sportId}|${ptDate}`
  const cached = dayEventsCache.get(cacheKey)
  if (cached && Date.now() - cached.at < maxCacheMs) return cached.events

  const data = await rundownFetch<{ events?: RundownEvent[] }>(
    `/sports/${sportId}/events/${ptDate}?offset=${PT_OFFSET_MIN}`,
  )
  const events = Array.isArray(data?.events) ? data!.events! : []
  dayEventsCache.set(cacheKey, { at: Date.now(), events })
  return events
}

async function loadTeamPlayers(teamId: number): Promise<RundownPlayer[]> {
  const cached = teamPlayersCache.get(teamId)
  if (cached && Date.now() - cached.at < CACHE_MS) return cached.players

  const data = await rundownFetch<{ players?: RundownPlayer[] }>(`/teams/${teamId}/players`)
  const players = Array.isArray(data?.players) ? data!.players! : []
  teamPlayersCache.set(teamId, { at: Date.now(), players })
  return players
}

function playerDisplayName(player: RundownPlayer): string {
  return String(player.display_name || [player.first_name, player.last_name].filter(Boolean).join(' ')).trim()
}

function isInjuryStatus(status: string): boolean {
  const s = String(status || '').trim()
  if (!s || /^active$/i.test(s)) return false
  return INJURY_STATUS_RE.test(s) || /out|injur|suspend|doubt|question|inactive/i.test(s)
}

function formatHeadlineNote(headline: string): string | null {
  const h = String(headline || '').trim()
  if (!h || !HEADLINE_NEWS_RE.test(h)) return null
  return h.endsWith('.') ? h : `${h}.`
}

function pickTeamSide(
  pickTeamName: string,
  awayTeam: string,
  homeTeam: string,
): 'away' | 'home' | null {
  if (teamNamesMatch(pickTeamName, { name: awayTeam })) return 'away'
  if (teamNamesMatch(pickTeamName, { name: homeTeam })) return 'home'
  const short = shortTeamName(pickTeamName)
  if (teamNamesMatch(short, { name: awayTeam }) || normalizeTeamToken(awayTeam).includes(normalizeTeamToken(short))) {
    return 'away'
  }
  if (teamNamesMatch(short, { name: homeTeam }) || normalizeTeamToken(homeTeam).includes(normalizeTeamToken(short))) {
    return 'home'
  }
  return null
}

function playerPosition(player: RundownPlayer): string | null {
  const raw =
    player.position_abbreviation
    || player.position
    || player.primary_position
    || null
  const s = String(raw || '').trim()
  return s || null
}

function playerDepthOrder(player: RundownPlayer): number | null {
  const d = player.depth_chart_order ?? player.depth
  const n = Number(d)
  return Number.isFinite(n) && n > 0 ? n : null
}

async function loadInactivePlayersForTeams(
  teamIds: number[],
  sportId: number,
): Promise<Array<{
  name: string
  status: string
  teamId: number
  position?: string | null
  depthOrder?: number | null
}>> {
  if (![1, 2, 4, 5, 6, 8, 25, 26].includes(sportId)) return []
  const out: Array<{
    name: string
    status: string
    teamId: number
    position?: string | null
    depthOrder?: number | null
  }> = []
  for (const teamId of teamIds) {
    const players = await loadTeamPlayers(teamId)
    for (const player of players) {
      const status = String(player.status || '').trim()
      if (!status || !isInjuryStatus(status)) continue
      const name = playerDisplayName(player)
      if (!name) continue
      out.push({
        name,
        status: status.toUpperCase() === status ? status : status,
        teamId,
        position: playerPosition(player),
        depthOrder: playerDepthOrder(player),
      })
    }
  }
  // Keep a wide injury window for PVAL (old cap of 6 dropped key OUTs).
  return out.slice(0, 48)
}

type PlayerStatRow = {
  player?: RundownPlayer
  stats?: Array<{ stat?: { name?: string; abbreviation?: string }; value?: string }>
}

async function loadLiveFoulNotes(eventId: string, sportId: number): Promise<string[]> {
  if (![4, 5, 8].includes(sportId)) return []
  const rows = await rundownFetch<PlayerStatRow[]>(`/events/${eventId}/players/stats`)
  if (!Array.isArray(rows)) return []

  const notes: string[] = []
  for (const row of rows) {
    const player = row.player
    if (!player) continue
    const name = playerDisplayName(player)
    if (!name) continue
    for (const stat of row.stats || []) {
      const statName = `${stat.stat?.name || ''} ${stat.stat?.abbreviation || ''}`.toLowerCase()
      if (!statName.includes('foul')) continue
      const fouls = Number(stat.value)
      if (!Number.isFinite(fouls) || fouls < 4) continue
      notes.push(`${name} in foul trouble (${fouls} fouls).`)
      break
    }
  }
  return notes.slice(0, 2)
}

export async function findRundownEventForMatch(
  input: RundownMatchInput,
  opts: { maxCacheMs?: number } = {},
): Promise<RundownEvent | null> {
  const sportId = oddsSportKeyToRundownSportId(input.sportKey)
  if (!sportId || !isRundownEnabled()) return null
  const ptDate = ptDateFromIso(input.commenceTime)
  const dayEvents = await loadDayEvents(sportId, ptDate, opts.maxCacheMs ?? CACHE_MS)
  return dayEvents.find((ev) =>
    eventsMatchTeamsAndTime(ev, input.awayTeam, input.homeTeam, input.commenceTime)
  ) ?? null
}

export async function resolveRundownEvent(input: RundownMatchInput): Promise<ResolvedRundownEvent | null> {
  const sportId = oddsSportKeyToRundownSportId(input.sportKey)
  if (!sportId || !isRundownEnabled()) return null

  const cacheKey = eventCacheKey(sportId, input.awayTeam, input.homeTeam, input.commenceTime)
  const cached = eventCache.get(cacheKey)
  if (cached && Date.now() - cached.at < CACHE_MS) return cached.ctx

  const ptDate = ptDateFromIso(input.commenceTime)
  const dayEvents = await loadDayEvents(sportId, ptDate)
  const matched = dayEvents.find((ev) =>
    eventsMatchTeamsAndTime(ev, input.awayTeam, input.homeTeam, input.commenceTime)
  )
  if (!matched?.event_id) return null

  const teams = matched.teams || []
  const away = teams.find((t) => t.is_away) || teams[0]
  const home = teams.find((t) => t.is_home) || teams[1]
  const awayTeamId = away?.team_id
  const homeTeamId = home?.team_id

  const teamIds = [awayTeamId, homeTeamId].filter((id): id is number => Number.isFinite(id))
  const inactivePlayers = await loadInactivePlayersForTeams(teamIds, sportId)

  let liveNotes: string[] = []
  const isLive = input.live === true
    || /IN_PROGRESS|HALFTIME|FIRST_HALF|SECOND_HALF|OVERTIME/i.test(String(matched.score?.event_status || ''))
  if (isLive) {
    liveNotes = await loadLiveFoulNotes(matched.event_id, sportId)
  }

  const ctx: ResolvedRundownEvent = {
    eventId: matched.event_id,
    sportId,
    awayTeamId,
    homeTeamId,
    pitcherAway: String(matched.pitcher_away?.name || '').trim() || undefined,
    pitcherHome: String(matched.pitcher_home?.name || '').trim() || undefined,
    headline: String(matched.schedule?.event_headline || '').trim() || undefined,
    venueLocation: String(matched.score?.venue_location || '').trim() || undefined,
    inactivePlayers,
    liveNotes,
  }

  eventCache.set(cacheKey, { at: Date.now(), ctx })
  return ctx
}

function pitcherForTeam(ctx: ResolvedRundownEvent, teamName: string, awayTeam: string, homeTeam: string): string | null {
  const side = pickTeamSide(teamName, awayTeam, homeTeam)
  if (side === 'away') return ctx.pitcherAway || null
  if (side === 'home') return ctx.pitcherHome || null
  return null
}

function inactiveForTeam(
  ctx: ResolvedRundownEvent,
  teamName: string,
  awayTeam: string,
  homeTeam: string,
): Array<{ name: string; status: string }> {
  const side = pickTeamSide(teamName, awayTeam, homeTeam)
  const teamId = side === 'away' ? ctx.awayTeamId : side === 'home' ? ctx.homeTeamId : undefined
  if (!teamId) return []
  return ctx.inactivePlayers
    .filter((p) => p.teamId === teamId)
    .map((p) => ({ name: p.name, status: p.status }))
}

function formatPitcherNote(
  pitcher: string,
  teamName: string,
  style: 'confirmed' | 'starting',
): string {
  const team = shortTeamName(teamName)
  if (style === 'starting') return `${pitcher} starting`
  return `${pitcher} confirmed starting for ${team}.`
}

function formatInactiveNote(players: Array<{ name: string; status: string }>): string | null {
  if (!players.length) return null
  const top = players[0]!
  const status = String(top.status || 'OUT').trim()
  const label = /^out$/i.test(status) ? 'OUT' : status
  return `${top.name} listed as ${label}.`
}

function formatSharpMoveInactiveNote(
  player: { name: string; status: string },
  movedTeamName: string,
): string {
  const status = String(player.status || 'OUT').trim()
  const label = /^out$/i.test(status) ? 'OUT' : status
  const team = shortTeamName(movedTeamName)
  return `${player.name} listed as ${label}. Sharp money coming in on ${team} as the line shortens.`
}

function wantsContext(postKind: RundownContextPostKind): boolean {
  return HIGH_CONTEXT_KINDS.has(postKind) || MEDIUM_CONTEXT_KINDS.has(postKind)
}

/** Fetch and format one context line/block for a post kind. Returns null when no verified data. */
export async function fetchRundownContextNote(
  postKind: RundownContextPostKind,
  input: RundownMatchInput,
): Promise<string | null> {
  if (!wantsContext(postKind)) return null

  const ctx = await resolveRundownEvent(input)
  if (!ctx) return null

  const pickTeam = String(input.pickTeamName || input.movedTeamName || '').trim()
  const headlineNote = formatHeadlineNote(ctx.headline || '')

  if (postKind === 'value_bet_radar' && pickTeam) {
    const pitcher = pitcherForTeam(ctx, pickTeam, input.awayTeam, input.homeTeam)
    if (pitcher) return formatPitcherNote(pitcher, pickTeam, 'starting')
    return null
  }

  if (['sharp_move', 'steam', 'rlm', 'line_movement'].includes(postKind)) {
    const movedTeam = String(input.movedTeamName || '').trim()
    if (!movedTeam) return null
    const inactive = inactiveForTeam(ctx, movedTeam, input.awayTeam, input.homeTeam)
    if (!inactive.length) return headlineNote
    if (postKind === 'sharp_move' || postKind === 'steam') {
      return formatInactiveNote(inactive)
    }
    return formatInactiveNote(inactive) || headlineNote
  }

  if (postKind === 'sharp_report') {
    const movedTeam = String(input.movedTeamName || '').trim()
    if (movedTeam) {
      const inactive = inactiveForTeam(ctx, movedTeam, input.awayTeam, input.homeTeam)
      if (inactive[0]) return formatSharpMoveInactiveNote(inactive[0], movedTeam)
    }
    return headlineNote
  }

  if (postKind === 'in_game_edge' || postKind === 'period_report') {
    if (ctx.liveNotes.length) return ctx.liveNotes[0]!
    if (pickTeam) {
      const inactive = inactiveForTeam(ctx, pickTeam, input.awayTeam, input.homeTeam)
      const player = inactive[0]
      if (player) {
        const status = String(player.status || '').trim()
        if (/questionable|doubtful|gtd/i.test(status)) {
          return `${player.name} playing through ${status.toLowerCase()} concern.`
        }
        return formatInactiveNote(inactive)
      }
    }
    return headlineNote
  }

  if (pickTeam) {
    const pitcher = pitcherForTeam(ctx, pickTeam, input.awayTeam, input.homeTeam)
    if (pitcher) return formatPitcherNote(pitcher, pickTeam, 'confirmed')
    const inactive = inactiveForTeam(ctx, pickTeam, input.awayTeam, input.homeTeam)
    const inactiveNote = formatInactiveNote(inactive)
    if (inactiveNote) return inactiveNote
  }

  if (headlineNote && (postKind === 'coffee_covers' || postKind === 'dog_of_the_day')) {
    return headlineNote
  }

  if (headlineNote && HIGH_CONTEXT_KINDS.has(postKind)) return headlineNote

  return null
}

export function rundownEventKey(input: {
  eventId?: string
  homeTeam: string
  awayTeam: string
  commenceTime: string
}): string {
  const id = String(input.eventId || '').trim()
  if (id) return id
  return `${input.awayTeam}|${input.homeTeam}|${input.commenceTime}`
}

export async function fetchRundownContextNotesForPicks(
  postKind: RundownContextPostKind,
  picks: Array<{
    sportKey: string
    homeTeam: string
    awayTeam: string
    commenceTime: string
    pickName: string
    eventId?: string
  }>,
  maxNotes = 3,
): Promise<Map<string, string>> {
  const out = new Map<string, string>()
  if (!isRundownEnabled()) return out

  for (const pick of picks) {
    if (out.size >= maxNotes) break
    const key = rundownEventKey(pick)
    if (out.has(key)) continue
    const note = await fetchRundownContextNote(postKind, {
      sportKey: pick.sportKey,
      homeTeam: pick.homeTeam,
      awayTeam: pick.awayTeam,
      commenceTime: pick.commenceTime,
      pickTeamName: pick.pickName,
    })
    if (note) out.set(key, note)
  }
  return out
}

export function lineMovementMovedTeam(alert: LineMovementAlert): string {
  if (alert.marketKey === 'totals') return ''
  return String(alert.outcomeName || '').trim()
}

/** PT calendar date for yesterday (America/Los_Angeles). */
export function ptYesterdayDate(now = new Date()): string {
  const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000)
  return ptDateFromIso(yesterday.toISOString())
}

/** Team IDs with a game on the given PT date (Rundown schedule). */
export async function rundownTeamIdsPlayedOnDate(
  sportKey: string,
  ptDate: string,
): Promise<Set<number>> {
  const sportId = oddsSportKeyToRundownSportId(sportKey)
  if (!sportId || !isRundownEnabled()) return new Set()

  const events = await loadDayEvents(sportId, ptDate)
  const ids = new Set<number>()
  for (const ev of events) {
    for (const team of ev.teams || []) {
      if (Number.isFinite(team.team_id)) ids.add(Number(team.team_id))
    }
  }
  return ids
}

export function injuryImpactPlayers(
  ctx: ResolvedRundownEvent,
): Array<{ name: string; status: string; teamId: number }> {
  return ctx.inactivePlayers.filter((p) => isInjuryImpactStatus(p.status))
}

function isInjuryImpactStatus(status: string): boolean {
  const s = String(status || '').trim()
  return /^(out|inactive|suspended|ir|pup)$/i.test(s)
    || /^out$/i.test(s)
    || /injured reserve/i.test(s)
}

export type ConfirmedStarters = {
  away: string
  home: string
}

// sportContextLabelFromKey lives in loungeBotSportLabels.ts (re-exported above).

export function supportsRundownSchedule(sportKey: string): boolean {
  return oddsSportKeyToRundownSportId(sportKey) != null
}

function cleanStarterName(raw: string): string {
  return String(raw || '')
    .replace(/\s+/g, ' ')
    .replace(/[.]+$/g, '')
    .trim()
}

function parseStarterHeadline(headline: string | undefined): ConfirmedStarters | null {
  const h = String(headline || '').trim()
  if (!h) return null

  const dual = h.match(
    /(?:probable\s+)?(?:pitchers?|starters?|quarterbacks?|qbs?)\s*:?\s*(.+?)\s+vs\.?\s+(.+?)(?:[.!]|$)/i,
  )
  if (dual) {
    const away = cleanStarterName(dual[1])
    const home = cleanStarterName(dual[2])
    if (away && home) return { away, home }
  }

  const single = h.match(
    /([A-Z][A-Za-z.'-]+(?:\s+[A-Z][A-Za-z.'-]+)*)\s+(?:to start|will start|confirmed (?:as )?starter)/i,
  )
  if (single) {
    const name = cleanStarterName(single[1])
    if (name) return { away: name, home: 'TBD' }
  }

  return null
}

/** Confirmed starters when Rundown has structured or headline data (any sport). */
export function confirmedStartersFromRundown(
  ctx: ResolvedRundownEvent,
  _sportKey?: string,
): ConfirmedStarters | null {
  const awayPitcher = String(ctx.pitcherAway || '').trim()
  const homePitcher = String(ctx.pitcherHome || '').trim()
  if (awayPitcher || homePitcher) {
    return {
      away: awayPitcher || 'TBD',
      home: homePitcher || 'TBD',
    }
  }
  return parseStarterHeadline(ctx.headline)
}

export function hasConfirmedStarterInfo(
  ctx: ResolvedRundownEvent,
  sportKey?: string,
): boolean {
  const starters = confirmedStartersFromRundown(ctx, sportKey)
  if (!starters) return false
  return starters.away !== 'TBD' || starters.home !== 'TBD'
}

export function ptCalendarDaysBetween(earlierPt: string, laterPt: string): number {
  const a = new Date(`${earlierPt}T12:00:00-07:00`).getTime()
  const b = new Date(`${laterPt}T12:00:00-07:00`).getTime()
  if (!Number.isFinite(a) || !Number.isFinite(b)) return 0
  return Math.max(0, Math.round((b - a) / 86_400_000))
}

export function ptDatesBackFrom(ptDate: string, count: number): string[] {
  const out: string[] = []
  const base = new Date(`${ptDate}T12:00:00-07:00`)
  for (let i = 1; i <= count; i++) {
    const d = new Date(base.getTime() - i * 86_400_000)
    out.push(ptDateFromIso(d.toISOString()))
  }
  return out
}

export async function loadRundownDayEvents(sportId: number, ptDate: string): Promise<RundownEvent[]> {
  return loadDayEvents(sportId, ptDate)
}

export async function loadRundownRecentEvents(
  sportId: number,
  ptEndDate: string,
  daysBack = 7,
): Promise<RundownEvent[]> {
  const dates = [ptEndDate, ...ptDatesBackFrom(ptEndDate, daysBack)]
  const all: RundownEvent[] = []
  for (const d of dates) {
    const rows = await loadDayEvents(sportId, d)
    all.push(...rows)
  }
  return all
}
