/**
 * Tank ATS sidecar (spots), not a 4th hammer vote.
 *
 * Situational layer: PASS unless two independent Tank reasons point the same way,
 * or his own Under + dog tell fires (that one is enough).
 * Reasons: rest/travel, weather-as-side, CFB tempo/clock, own-total agree (Under + dog).
 * Injury / QB is a stack tag only … never a second reason (Scott already moved the model).
 *
 * Sharp board: weighted collation of pasted Action / VSiN / manual splits.
 * Never fires a Tank side by itself. Strong opposite street → PASS the spot.
 */
import type { BettingSplitSummary } from './loungeBotBettingSplits.ts'
import type { SideModifier } from './loungeBotSideModifier.ts'
import type { GameWeatherSummary } from './loungeBotWeather.ts'
import {
  buildTeamRestProfile,
  evaluateRestTravelMatchup,
  loadRestTravelSchedule,
  pickMatchesTeamName,
  type RestTravelMatchup,
} from './loungeBotRestTravel.ts'
import { ptDateFromIso } from './loungeBotRundownContext.ts'

export const TANK_ATS_LANE = 'tank_ats' as const

export type TankAtsReasonKey = 'rest' | 'weather' | 'tempo' | 'total_agree'

export type TankAtsSide = 'home' | 'away' | 'pass'

export type SharpBoardSourceScore = {
  source: string
  side: 'home' | 'away'
  score: number
  divergencePts: number
  isRlm: boolean
}

export type SharpBoardLean = {
  side: 'home' | 'away' | null
  homeScore: number
  awayScore: number
  gap: number
  sources: SharpBoardSourceScore[]
  /** Gap large enough to treat as a real street lean. */
  isLean: boolean
  /** Opposite-side veto threshold for a published spot. */
  isStrong: boolean
}

export type TankAtsSpot = {
  side: TankAtsSide
  teamName: string
  lineDisplay?: string
  pickLine?: number | null
  pickPrice?: number | null
  reasons: TankAtsReasonKey[]
  tags: string[]
  /** Two independent situational reasons agree (before street gate). */
  situationalFire: boolean
  sharpBoard: SharpBoardLean
  /** Card-worthy: situational fire and street does not strongly fade. */
  published: boolean
  rationale: string
  restTravel: RestTravelMatchup | null
}

const TEMPO_GAP_MIN = 6
const SHOOTOUT_MARKET_VS_MODEL = 3
const STREET_LEAN_MIN = 0.8
const STREET_FADE_MIN = 1.2
const DIV_FLOOR = 15

function teamIsSide(teamName: string, homeTeam: string, awayTeam: string): TankAtsSide | null {
  if (pickMatchesTeamName(teamName, homeTeam)) return 'home'
  if (pickMatchesTeamName(teamName, awayTeam)) return 'away'
  return null
}

function restTravelSignificant(rt: RestTravelMatchup): boolean {
  if (rt.travelFatigue) return true
  if (rt.restGapDays >= 2) return true
  if (/short week|back-to-back/i.test(rt.fatiguedLine || '')) return true
  return false
}

/** Action / VSiN / manual relative strength. Tune here, not in the two-reason fire. */
export function sharpSourceWeight(source: string | null | undefined): number {
  const s = String(source || '').toLowerCase().replace(/[\s-]+/g, '_')
  if (s.includes('vsin')) return 1.1
  if (s.includes('action')) return 1.0
  if (s === 'manual' || s === 'ops') return 0.55
  return 0.7
}

/**
 * Collate pasted boards for one game. Synthetic never votes.
 * Continuous score … not +1 Tank reason.
 */
export function scoreSharpBoardFromSplits(rows: BettingSplitSummary[] | null | undefined): SharpBoardLean {
  const sources: SharpBoardSourceScore[] = []
  let homeScore = 0
  let awayScore = 0

  for (const row of rows || []) {
    if (row.isPasted !== true) continue
    if (row.sharpFavoredSide !== 'home' && row.sharpFavoredSide !== 'away') continue
    const w = sharpSourceWeight(row.source)
    const scale = Math.max(1, Number(row.divergencePts || 0) / DIV_FLOOR)
    const rlm = row.isRlm === true ? 1.15 : 1
    const score = w * scale * rlm
    sources.push({
      source: row.source || 'manual',
      side: row.sharpFavoredSide,
      score,
      divergencePts: Number(row.divergencePts || 0),
      isRlm: row.isRlm === true,
    })
    if (row.sharpFavoredSide === 'home') homeScore += score
    else awayScore += score
  }

  const gap = Math.abs(homeScore - awayScore)
  let side: 'home' | 'away' | null = null
  if (gap >= STREET_LEAN_MIN) {
    side = homeScore > awayScore ? 'home' : awayScore > homeScore ? 'away' : null
  }

  return {
    side,
    homeScore,
    awayScore,
    gap,
    sources,
    isLean: side != null,
    isStrong: gap >= STREET_FADE_MIN,
  }
}

function weatherSideLean(
  weather: GameWeatherSummary | null | undefined,
  homePoint: number,
): { side: 'home' | 'away'; tags: string[] } | null {
  if (!weather || weather.isDome) return null
  const windMph = weather.windSpeedMph
  const windy = weather.isHighWind === true || (typeof windMph === 'number' && windMph >= 15)
  const wet = weather.isPrecipAlert === true
  if (!windy && !wet) return null
  // Outdoor wind / rain fades the passing favorite … lean the dog.
  if (!Number.isFinite(homePoint) || homePoint === 0) return null
  const side: 'home' | 'away' = homePoint > 0 ? 'home' : 'away'
  const tags: string[] = []
  if (windy) tags.push('wind_dog')
  if (wet) tags.push('precip_dog')
  return { side, tags }
}

function tempoSideLean(input: {
  isCfb: boolean
  homeTempo?: number | null
  awayTempo?: number | null
  modelTotal?: number | null
  marketTotal?: number | null
}): { side: 'home' | 'away'; tags: string[] } | null {
  if (!input.isCfb) return null
  const homeT = input.homeTempo
  const awayT = input.awayTempo
  const model = input.modelTotal
  const market = input.marketTotal
  if (homeT == null || awayT == null || !Number.isFinite(homeT) || !Number.isFinite(awayT)) return null
  if (model == null || market == null || !Number.isFinite(model) || !Number.isFinite(market)) return null
  const gap = Math.abs(homeT - awayT)
  if (gap < TEMPO_GAP_MIN) return null
  // Market priced a shootout vs model … lean the slower clock.
  if (market - model < SHOOTOUT_MARKET_VS_MODEL) return null
  const side: 'home' | 'away' = homeT < awayT ? 'home' : 'away'
  return { side, tags: ['tempo_clock'] }
}

/**
 * Pure situational + street-gate vote. Never uses Scott's model gap as a reason.
 */
export function resolveTankSituationalAts(input: {
  homeTeam: string
  awayTeam: string
  homePoint: number
  tankTotalsSide: 'over' | 'under' | 'pass'
  restTravel?: RestTravelMatchup | null
  weather?: GameWeatherSummary | null
  sideModifier?: SideModifier | null
  isCfb?: boolean
  homeTempo?: number | null
  awayTempo?: number | null
  modelTotal?: number | null
  marketTotal?: number | null
  pastedSplits?: BettingSplitSummary[] | null
}): TankAtsSpot {
  const homeTeam = input.homeTeam
  const awayTeam = input.awayTeam
  const restTravel = input.restTravel || null
  const tags: string[] = []
  const bySide: Record<'home' | 'away', TankAtsReasonKey[]> = { home: [], away: [] }

  if (restTravel && restTravelSignificant(restTravel)) {
    const side = teamIsSide(restTravel.restedTeam, homeTeam, awayTeam)
    if (side && side !== 'pass') {
      bySide[side].push('rest')
      if (restTravel.travelFatigue) tags.push('travel_fatigue')
      if (restTravel.restGapDays >= 2) tags.push('rest_gap')
      if (/short week/i.test(restTravel.fatiguedLine || '')) tags.push('short_week')
      if (/back-to-back/i.test(restTravel.fatiguedLine || '')) tags.push('b2b')
      if (restTravel.restedAtHome) tags.push('rested_at_home')
      if (restTravel.travelTzNote) tags.push('travel_tz')
    }
  }

  const weatherLean = weatherSideLean(input.weather, input.homePoint)
  let weatherSide: 'home' | 'away' | null = null
  if (weatherLean) {
    weatherSide = weatherLean.side
    bySide[weatherLean.side].push('weather')
    tags.push(...weatherLean.tags)
  }

  const tempoLean = tempoSideLean({
    isCfb: input.isCfb === true,
    homeTempo: input.homeTempo,
    awayTempo: input.awayTempo,
    modelTotal: input.modelTotal,
    marketTotal: input.marketTotal,
  })
  if (tempoLean) {
    bySide[tempoLean.side].push('tempo')
    tags.push(...tempoLean.tags)
  }

  const empty = (rationale: string, extraTags: string[] = []): TankAtsSpot => ({
    side: 'pass',
    teamName: 'PASS',
    reasons: [],
    tags: [...tags, ...extraTags],
    situationalFire: false,
    sharpBoard: scoreSharpBoardFromSplits(input.pastedSplits),
    published: false,
    rationale,
    restTravel,
  })

  // Unique Tank tell: Over + wind/rain dog is a conflict … PASS the side.
  if (weatherSide && input.tankTotalsSide === 'over') {
    return empty('Over + weather dog is a conflict … PASS the side', ['total_conflict'])
  }

  // Under + dog is Tank's own tell … it is a reason by itself, not a bonus tag.
  const dogSide: 'home' | 'away' | null = input.homePoint > 0
    ? 'home'
    : input.homePoint < 0
      ? 'away'
      : null
  if (input.tankTotalsSide === 'under' && dogSide) {
    bySide[dogSide].push('total_agree')
    tags.push('under_dog_stack')
  }

  const sides = (['home', 'away'] as const).filter((s) => bySide[s].length > 0)
  if (sides.length > 1) {
    return empty('Independent Tank reasons disagree … PASS', ['conflict_pass'])
  }

  const lean = sides[0] || null
  const reasons = lean ? bySide[lean] : []
  if (!lean || reasons.length === 0) {
    return empty(
      tags.length
        ? 'Situational tags present but no clear Tank side'
        : 'No rest / weather / tempo / total-agree trigger … PASS',
    )
  }

  // Injury stacks on an already-leaning tired / wind / travel / clock side. Not a 2nd reason.
  const hurt = input.sideModifier?.hurtSide ?? null
  if (hurt && hurt === lean) {
    tags.push('injury_stack')
  }

  const situationalFire = reasons.length >= 2
  const uniqueTell = reasons.includes('total_agree')
  const sharpBoard = scoreSharpBoardFromSplits(input.pastedSplits)
  let published = situationalFire || uniqueTell
  if (published && sharpBoard.isStrong && sharpBoard.side && sharpBoard.side !== lean) {
    published = false
    tags.push('street_fade')
  } else if (published && sharpBoard.isLean && sharpBoard.side === lean) {
    tags.push('sharp_agree')
  }

  const teamName = lean === 'home' ? homeTeam : awayTeam
  const why = reasons.join(' + ')
  const rationale = published
    ? `Tank spot ${teamName} (${why})`
    : uniqueTell || situationalFire
      ? `Tank spot ${teamName} faded by street board`
      : `Look only … one Tank reason (${why})`

  return {
    side: lean,
    teamName: published ? teamName : 'PASS',
    reasons,
    tags,
    situationalFire,
    sharpBoard,
    published,
    rationale,
    restTravel,
  }
}

type SlateEventLike = {
  id?: string
  home_team?: string
  away_team?: string
  commence_time?: string
}

/**
 * One Rundown schedule pull, then name-match each slate game. Missing match → no rest reason.
 */
export async function loadRestTravelByEventId(
  sportKey: string,
  events: Array<SlateEventLike>,
): Promise<Map<string, RestTravelMatchup>> {
  const out = new Map<string, RestTravelMatchup>()
  if (!events.length) return out

  const anchor = events[0]?.commence_time || new Date().toISOString()
  const pack = await loadRestTravelSchedule(sportKey, ptDateFromIso(anchor)).catch(() => null)
  if (!pack?.events?.length) return out

  for (const ev of events) {
    const eid = String(ev.id || '').trim()
    const home = String(ev.home_team || '').trim()
    const away = String(ev.away_team || '').trim()
    const commence = String(ev.commence_time || '').trim()
    if (!eid || !home || !away || !commence) continue
    const commenceMs = Date.parse(commence)
    if (!Number.isFinite(commenceMs)) continue

    let best: (typeof pack.events)[number] | null = null
    let bestDelta = Infinity
    for (const row of pack.events) {
      if (
        !pickMatchesTeamName(home, row.homeTeamName)
        || !pickMatchesTeamName(away, row.awayTeamName)
      ) {
        continue
      }
      const delta = Math.abs(row.eventDateMs - commenceMs)
      if (delta < bestDelta) {
        best = row
        bestDelta = delta
      }
    }
    if (!best) continue

    const tonightPt = ptDateFromIso(commence)
    const awayProfile = buildTeamRestProfile(
      pack.sportId,
      sportKey,
      pack.events,
      best.awayTeamId,
      away,
      false,
      tonightPt,
      commenceMs,
      best.eventId,
      home,
    )
    const homeProfile = buildTeamRestProfile(
      pack.sportId,
      sportKey,
      pack.events,
      best.homeTeamId,
      home,
      true,
      tonightPt,
      commenceMs,
      best.eventId,
      away,
    )
    const matchup = evaluateRestTravelMatchup(
      pack.sportId,
      sportKey,
      away,
      home,
      awayProfile,
      homeProfile,
      best.venueLocation,
      best.venueName,
    )
    if (matchup) out.set(eid, matchup)
  }

  return out
}

const TANK_ATS_WHY_LABEL: Record<TankAtsReasonKey, string> = {
  rest: 'rest',
  weather: 'weather',
  tempo: 'tempo',
  total_agree: 'under + dog',
}

export function formatTankAtsWhy(spot: TankAtsSpot | null | undefined): string {
  if (!spot?.published) return ''
  return spot.reasons.map((r) => TANK_ATS_WHY_LABEL[r] || r).join(' + ')
}
