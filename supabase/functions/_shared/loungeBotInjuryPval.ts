/**
 * Quantitative Injury Impact & Point Spread Value (PVAL) Calculator.
 *
 * Connects TheRundown inactive/injured player lists with real PVAL weights
 * to calculate objective, mathematically grounded team and matchup injury penalties.
 */
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2'
import {
  lookupPlayerPval,
  loadDbPlayerPvalMap,
  type PlayerValueEntry,
} from './loungeSportsPlayerValues.ts'
import {
  injuryImpactPlayers,
  resolveRundownEvent,
  oddsSportKeyToRundownSportId,
} from './loungeBotRundownContext.ts'

function isHardOutStatus(status: string): boolean {
  const s = String(status || '').trim()
  return /^(out|inactive|suspended|ir|pup)$/i.test(s) || /injured reserve/i.test(s)
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
 */
export function calculateTeamInjuryImpact(
  teamName: string,
  inactives: Array<{ name: string; status: string }>,
  dynamicDbMap?: Map<string, PlayerValueEntry> | null,
): TeamInjuryReport {
  let totalPvalLost = 0
  let offensePvalLost = 0
  let defensePvalLost = 0
  const keyAbsences: TeamInjuryReport['keyAbsences'] = []

  for (const p of inactives) {
    const valEntry = lookupPlayerPval(p.name, dynamicDbMap)
    if (valEntry && valEntry.pval > 0) {
      totalPvalLost += valEntry.pval
      if (valEntry.side === 'offense') offensePvalLost += valEntry.pval
      else defensePvalLost += valEntry.pval

      keyAbsences.push({
        name: valEntry.name,
        pos: valEntry.pos,
        pval: valEntry.pval,
        status: p.status,
        side: valEntry.side,
      })
    }
  }

  // Round to 2 decimal places
  totalPvalLost = Math.round(totalPvalLost * 100) / 100
  offensePvalLost = Math.round(offensePvalLost * 100) / 100
  defensePvalLost = Math.round(defensePvalLost * 100) / 100

  // Sort key absences by highest PVAL impact first
  keyAbsences.sort((a, b) => b.pval - a.pval)

  return {
    teamName,
    totalPvalLost,
    offensePvalLost,
    defensePvalLost,
    keyAbsences,
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
