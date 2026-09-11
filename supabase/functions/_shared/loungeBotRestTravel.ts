/**
 * Rest + travel advantage detection (Rundown 7-day schedule + venue lookup table).
 * Team schedule only — no pitcher workload copy.
 */
import {
  detectTravelFatigue,
  resolveGameVenueCoords,
  type GameVenueCoords,
} from './loungeSportsVenues.ts'
import {
  loadRundownRecentEvents,
  oddsSportKeyToRundownSportId,
  ptCalendarDaysBetween,
  ptDateFromIso,
  type RundownEvent,
} from './loungeBotRundownContext.ts'

function shortTeamLabel(name: string): string {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean)
  if (parts.length <= 1) return parts[0] || ''
  return parts[parts.length - 1]!
}

const REST_LOOKBACK_DAYS = 7
const NFL_SHORT_WEEK_MAX_DAYS = 6

export type TeamRestProfile = {
  teamId: number
  teamName: string
  daysSinceLastGame: number | null
  onBye: boolean
  isB2b: boolean
  isShortWeek: boolean
  isHomeTonight: boolean
  lastEventId?: string
  lastWasHome?: boolean
  lastVenue?: GameVenueCoords
}

export type RestTravelMatchup = {
  fatiguedTeam: string
  restedTeam: string
  fatiguedTeamId: number
  restedTeamId: number
  restedAtHome: boolean
  restGapDays: number
  travelFatigue: boolean
  travelMiles?: number
  travelTzNote?: string
  fatiguedLine: string
  restedLine: string
}

type FlatEvent = {
  eventId: string
  eventDateMs: number
  eventPtDate: string
  awayTeamId: number
  homeTeamId: number
  awayTeamName: string
  homeTeamName: string
  venueLocation: string
  venueName: string
}

function parseEventMs(value: string): number | null {
  const t = Date.parse(value)
  return Number.isFinite(t) ? t : null
}

function teamLabel(team: { name?: string; mascot?: string }): string {
  return [team.name, team.mascot].filter(Boolean).join(' ').trim()
}

function flattenScheduleEvents(events: RundownEvent[]): FlatEvent[] {
  const out: FlatEvent[] = []
  for (const ev of events) {
    const eventId = String(ev.event_id || '').trim()
    const eventDate = String(ev.event_date || '').trim()
    const eventDateMs = parseEventMs(eventDate)
    if (!eventId || !eventDate || eventDateMs == null) continue
    const teams = ev.teams || []
    const away = teams.find((t) => t.is_away) || teams[0]
    const home = teams.find((t) => t.is_home) || teams[1]
    const awayTeamId = away?.team_id
    const homeTeamId = home?.team_id
    if (!Number.isFinite(awayTeamId) || !Number.isFinite(homeTeamId)) continue
    out.push({
      eventId,
      eventDateMs,
      eventPtDate: ptDateFromIso(eventDate),
      awayTeamId: Number(awayTeamId),
      homeTeamId: Number(homeTeamId),
      awayTeamName: teamLabel(away!),
      homeTeamName: teamLabel(home!),
      venueLocation: String(ev.score?.venue_location || '').trim(),
      venueName: String(ev.score?.venue_name || '').trim(),
    })
  }
  return out.sort((a, b) => b.eventDateMs - a.eventDateMs)
}

function isNflSportKey(sportKey: string): boolean {
  const sk = sportKey.toLowerCase()
  return sk === 'americanfootball_nfl' || sk === 'americanfootball_nfl_preseason'
}

function lastGameForTeam(
  schedule: FlatEvent[],
  teamId: number,
  beforeMs: number,
  excludeEventId?: string,
): FlatEvent | null {
  for (const row of schedule) {
    if (excludeEventId && row.eventId === excludeEventId) continue
    if (row.eventDateMs >= beforeMs) continue
    if (row.awayTeamId === teamId || row.homeTeamId === teamId) return row
  }
  return null
}

function venueForTeamOnEvent(
  sportId: number,
  ev: FlatEvent,
  teamId: number,
  teamName: string,
): GameVenueCoords | null {
  const isHome = ev.homeTeamId === teamId
  const opponentName = isHome ? ev.awayTeamName : ev.homeTeamName
  return resolveGameVenueCoords(sportId, teamName, isHome, opponentName, ev.venueLocation, ev.venueName)
}

export function buildTeamRestProfile(
  sportId: number,
  sportKey: string,
  schedule: FlatEvent[],
  teamId: number,
  teamName: string,
  isHomeTonight: boolean,
  tonightPtDate: string,
  tonightCommenceMs: number,
  currentEventId: string,
  opponentName: string,
): TeamRestProfile {
  const last = lastGameForTeam(schedule, teamId, tonightCommenceMs, currentEventId)
  const onBye = !last
  let daysSinceLastGame: number | null = null
  let isB2b = false
  let isShortWeek = false
  let lastWasHome: boolean | undefined
  let lastVenue: GameVenueCoords | undefined

  if (last) {
    daysSinceLastGame = ptCalendarDaysBetween(last.eventPtDate, tonightPtDate)
    isB2b = daysSinceLastGame === 1
    isShortWeek = isNflSportKey(sportKey)
      && daysSinceLastGame != null
      && daysSinceLastGame < NFL_SHORT_WEEK_MAX_DAYS
    lastWasHome = last.homeTeamId === teamId
    lastVenue = venueForTeamOnEvent(sportId, last, teamId, teamName) ?? undefined
  }

  void opponentName
  return {
    teamId,
    teamName,
    daysSinceLastGame,
    onBye,
    isB2b,
    isShortWeek,
    isHomeTonight,
    lastEventId: last?.eventId,
    lastWasHome,
    lastVenue,
  }
}

function isFatigued(profile: TeamRestProfile, sportKey: string): boolean {
  if (profile.onBye || profile.daysSinceLastGame == null) return false
  if (profile.isB2b) return true
  if (isNflSportKey(sportKey) && profile.isShortWeek) return true
  return false
}

function restGapDays(fatigued: TeamRestProfile, rested: TeamRestProfile): number {
  const fDays = fatigued.daysSinceLastGame ?? 1
  const rDays = rested.onBye ? REST_LOOKBACK_DAYS + 1 : (rested.daysSinceLastGame ?? 0)
  return rDays - fDays
}

function isRestedEnough(
  fatigued: TeamRestProfile,
  rested: TeamRestProfile,
  sportKey: string,
): boolean {
  const gap = restGapDays(fatigued, rested)
  if (gap >= 1) return true
  if (rested.onBye && isFatigued(fatigued, sportKey)) return true
  if (isNflSportKey(sportKey) && rested.onBye && !fatigued.onBye) return true
  return false
}

function formatFatiguedLine(
  teamName: string,
  profile: TeamRestProfile,
  travelFatigue: boolean,
  travelTzNote?: string,
  travelMiles?: number,
): string {
  const label = shortTeamLabel(teamName)
  let line: string
  if (profile.isB2b) {
    line = `${label} on back-to-back (2nd game in 2 nights)`
  } else if (profile.isShortWeek && profile.daysSinceLastGame != null) {
    line = `${label} on a short week (last game ${profile.daysSinceLastGame} days ago)`
  } else {
    line = `${label} on a short rest turnaround`
  }
  if (travelFatigue) {
    if (travelTzNote) {
      line += ` + cross-time-zone travel (${travelTzNote})`
    } else if (travelMiles != null) {
      line += ` + ~${travelMiles.toLocaleString('en-US')} mi travel since last game`
    }
  }
  return line
}

function formatRestedLine(
  teamName: string,
  profile: TeamRestProfile,
  restGap: number,
): string {
  const label = shortTeamLabel(teamName)
  if (profile.onBye) {
    const home = profile.isHomeTonight ? ' at home' : ''
    return `${label} coming off bye week${home}`
  }
  const days = profile.daysSinceLastGame ?? restGap
  const home = profile.isHomeTonight ? ' at home' : ''
  if (days >= 2) return `${label} had ${days} days of rest${home}`
  return `${label} had full day of rest${home}`
}

export function evaluateRestTravelMatchup(
  sportId: number,
  sportKey: string,
  awayTeam: string,
  homeTeam: string,
  awayProfile: TeamRestProfile,
  homeProfile: TeamRestProfile,
  tonightVenueLocation?: string,
  tonightVenueName?: string,
): RestTravelMatchup | null {
  const pairs = [
    { fatigued: awayProfile, rested: homeProfile, fatiguedName: awayTeam, restedName: homeTeam },
    { fatigued: homeProfile, rested: awayProfile, fatiguedName: homeTeam, restedName: awayTeam },
  ]

  for (const pair of pairs) {
    if (!isFatigued(pair.fatigued, sportKey)) continue
    if (!isRestedEnough(pair.fatigued, pair.rested, sportKey)) continue

    const gap = restGapDays(pair.fatigued, pair.rested)
    if (gap < 1 && !(pair.rested.onBye && isFatigued(pair.fatigued, sportKey))) continue

    const restedAtHome = pair.rested.isHomeTonight
    const currentVenue = resolveGameVenueCoords(
      sportId,
      pair.fatiguedName,
      pair.fatigued.isHomeTonight,
      pair.fatigued.isHomeTonight ? pair.restedName : pair.fatiguedName,
      tonightVenueLocation,
      tonightVenueName,
    )
    const travel = detectTravelFatigue(pair.fatigued.lastVenue ?? null, currentVenue)

    return {
      fatiguedTeam: pair.fatiguedName,
      restedTeam: pair.restedName,
      fatiguedTeamId: pair.fatigued.teamId,
      restedTeamId: pair.rested.teamId,
      restedAtHome,
      restGapDays: gap,
      travelFatigue: travel.travelFatigue,
      travelMiles: travel.miles,
      travelTzNote: travel.tzNote,
      fatiguedLine: formatFatiguedLine(
        pair.fatiguedName,
        pair.fatigued,
        travel.travelFatigue,
        travel.tzNote,
        travel.miles,
      ),
      restedLine: formatRestedLine(pair.restedName, pair.rested, gap),
    }
  }

  return null
}

export async function loadRestTravelSchedule(
  sportKey: string,
  tonightPtDate: string,
): Promise<{ sportId: number; events: FlatEvent[] } | null> {
  const sportId = oddsSportKeyToRundownSportId(sportKey)
  if (!sportId) return null
  const raw = await loadRundownRecentEvents(sportId, tonightPtDate, REST_LOOKBACK_DAYS)
  return { sportId, events: flattenScheduleEvents(raw) }
}

export function normTeamToken(value: string): string {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** True when +EV pick is on the rested team (h2h/spreads sides only). */
export function pickMatchesTeamName(pickName: string, teamName: string): boolean {
  const pick = normTeamToken(pickName)
  const team = normTeamToken(teamName)
  if (!pick || !team) return false
  const pickLast = pick.split(' ').pop() || ''
  const teamLast = team.split(' ').pop() || ''
  return pick === team || team.includes(pick) || pick.includes(team) || pickLast === teamLast
}
