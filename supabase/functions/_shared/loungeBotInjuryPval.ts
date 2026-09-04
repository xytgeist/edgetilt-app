/**
 * Quantitative Injury Impact & Point Spread Value (PVAL) Calculator.
 *
 * Connects TheRundown inactive/injured player lists with PVAL weights:
 * 1. Curated / DB overrides (stars)
 * 2. v0 position-band Typical priors for unmatched OUTs (kill silent zeros)
 * 3. QB replacement delta … starter OUT = starter − healthy backup (not full seat)
 *
 * Soft/hard non-QB caps + QB-out shrink live in loungeBotPvalBands.ts.
 */
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2'
import {
  lookupPlayerPval,
  loadDbPlayerPvalMap,
  listTeamQbRoster,
  type PlayerValueEntry,
} from './loungeSportsPlayerValues.ts'
import {
  applyQbReplacementDeltas,
  applyTeamPvalStackRules,
  priorPvalFromRundownPlayer,
  scalePvalForStatus,
  type PvalAbsencePiece,
} from './loungeBotPvalBands.ts'
import {
  injuryImpactPlayers,
  resolveRundownEvent,
  oddsSportKeyToRundownSportId,
} from './loungeBotRundownContext.ts'

function isHardOutStatus(status: string): boolean {
  const s = String(status || '').trim()
  return /^(out|inactive|suspended|ir|pup)$/i.test(s) || /injured reserve/i.test(s)
}

export type InactivePlayerInput = {
  name: string
  status: string
  position?: string | null
  depthOrder?: number | null
}

export type TeamInjuryReport = {
  teamName: string
  totalPvalLost: number
  offensePvalLost: number
  defensePvalLost: number
  keyAbsences: Array<{
    name: string
    pos: string
    pval: number
    status: string
    side: 'offense' | 'defense'
    note?: string
  }>
}

export type GameInjurySummary = {
  homeTeam: string
  awayTeam: string
  homeReport: TeamInjuryReport
  awayReport: TeamInjuryReport
  netSpreadImpactHome: number // Positive means Home has net advantage (Away is more injured)
  isSignificant: boolean      // True if net impact >= 1.0 pt
  summaryLine: string
}

/**
 * Calculate net injury impact for a single team given their inactive player list.
 * Curated/DB PVAL wins; otherwise v0 Typical band prior from position + depth.
 * Starting QB absences are converted to replacement deltas before stack caps.
 */
export function calculateTeamInjuryImpact(
  teamName: string,
  inactives: InactivePlayerInput[],
  dynamicDbMap?: Map<string, PlayerValueEntry> | null,
): TeamInjuryReport {
  const pieces: PvalAbsencePiece[] = []

  for (const p of inactives) {
    const valEntry = lookupPlayerPval(p.name, dynamicDbMap)
    if (valEntry && valEntry.pval > 0) {
      const scaled = scalePvalForStatus(valEntry.pval, p.status)
      if (scaled <= 0) continue
      pieces.push({
        name: valEntry.name,
        pos: valEntry.pos,
        pval: scaled,
        status: p.status,
        side: valEntry.side,
        isQb: valEntry.pos === 'QB',
        depthOrder: p.depthOrder ?? null,
      })
      continue
    }

    const prior = priorPvalFromRundownPlayer({
      name: p.name,
      status: p.status,
      position: p.position,
      depthOrder: p.depthOrder,
    })
    if (prior) pieces.push(prior)
  }

  const withQbDelta = applyQbReplacementDeltas(pieces, {
    teamName,
    rosterQbs: listTeamQbRoster(teamName, dynamicDbMap),
  })
  const stacked = applyTeamPvalStackRules(withQbDelta)

  return {
    teamName,
    totalPvalLost: stacked.totalPvalLost,
    offensePvalLost: stacked.offensePvalLost,
    defensePvalLost: stacked.defensePvalLost,
    keyAbsences: stacked.pieces
      .filter((a) => a.pval > 0)
      .map((a) => ({
        name: a.name,
        pos: a.pos,
        pval: a.pval,
        status: a.status,
        side: a.side,
        note: a.note,
      })),
  }
}

/**
 * Fetch and calculate the real PVAL injury summary for a game using TheRundown context.
 */
export async function fetchGameInjuryPval(
  sportKey: string,
  homeTeam: string,
  awayTeam: string,
  commenceTimeIso: string,
  admin?: SupabaseClient | null,
  opts?: { hardOutsOnly?: boolean },
): Promise<GameInjurySummary | null> {
  const sportId = oddsSportKeyToRundownSportId(sportKey)
  if (!sportId) return null

  try {
    const ctx = await resolveRundownEvent({
      sportKey,
      homeTeam,
      awayTeam,
      commenceTime: commenceTimeIso,
    })
    if (!ctx) return null

    const allInactives = (opts?.hardOutsOnly !== false
      ? ctx.inactivePlayers.filter((p) => isHardOutStatus(p.status))
      : injuryImpactPlayers(ctx))
    if (!allInactives || allInactives.length === 0) return null

    // Load dynamic DB overrides if admin client provided
    const dynamicDbMap = admin ? await loadDbPlayerPvalMap(admin) : null

    const homeTeamId = ctx.homeTeamId
    const awayTeamId = ctx.awayTeamId

    const homeInactives = allInactives.filter((p) => p.teamId === homeTeamId)
    const awayInactives = allInactives.filter((p) => p.teamId === awayTeamId)

    const homeReport = calculateTeamInjuryImpact(homeTeam, homeInactives, dynamicDbMap)
    const awayReport = calculateTeamInjuryImpact(awayTeam, awayInactives, dynamicDbMap)

    // Net spread impact: Away PVAL lost minus Home PVAL lost
    // (If Away lost 3.5 pts and Home lost 1.0 pt, Home has a +2.5 pt injury advantage)
    const netSpreadImpactHome = Math.round((awayReport.totalPvalLost - homeReport.totalPvalLost) * 100) / 100
    const isSignificant = Math.abs(netSpreadImpactHome) >= 1.0 || homeReport.totalPvalLost >= 2.0 || awayReport.totalPvalLost >= 2.0

    // Build concise, objective summary line
    let summaryLine = ''
    if (homeReport.keyAbsences.length > 0 || awayReport.keyAbsences.length > 0) {
      const parts: string[] = []
      if (homeReport.keyAbsences.length > 0) {
        const topH = homeReport.keyAbsences.slice(0, 2).map((a) => `${a.name} (${a.pos} -${a.pval}pt)`).join(', ')
        parts.push(`${homeTeam}: ${topH}`)
      }
      if (awayReport.keyAbsences.length > 0) {
        const topA = awayReport.keyAbsences.slice(0, 2).map((a) => `${a.name} (${a.pos} -${a.pval}pt)`).join(', ')
        parts.push(`${awayTeam}: ${topA}`)
      }
      summaryLine = parts.join(' | ')
    }

    return {
      homeTeam,
      awayTeam,
      homeReport,
      awayReport,
      netSpreadImpactHome,
      isSignificant,
      summaryLine,
    }
  } catch (err) {
    console.warn(`[loungeBotInjuryPval] Error evaluating injuries for ${awayTeam} @ ${homeTeam}:`, err)
    return null
  }
}
