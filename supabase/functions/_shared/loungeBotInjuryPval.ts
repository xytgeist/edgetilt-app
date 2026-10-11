/**
 * Quantitative Injury Impact & Point Spread Value (PVAL) Calculator.
 *
 * Connects TheRundown inactive/injured player lists with PVAL weights:
 * 1. Curated / DB overrides (stars) … only when the row's team matches this side
 * 2. v0 position-band Typical priors for unmatched OUTs (kill silent zeros)
 * 3. QB replacement delta … starter OUT = starter − healthy backup (not full seat)
 *
 * Soft/hard non-QB caps + QB-out shrink live in loungeBotPvalBands.ts.
 *
 * Ghost / stale roster guard (2026-10-11): TheRundown `/teams/{id}/players` keeps
 * Inactive rows for cut / retired / practice-squad fossils (Philip Rivers, Rashod
 * Berry). We gate skill-position names against current `nfl_players`, enrich
 * depth_chart_order from Sleeper, and only VIP-kill on depth === 1.
 */
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2'
import {
  lookupPlayerPval,
  loadDbPlayerPvalMap,
  listTeamQbRoster,
  normalizePlayerNameKey,
  type PlayerValueEntry,
} from './loungeSportsPlayerValues.ts'
import {
  applyQbReplacementDeltas,
  applyTeamPvalStackRules,
  priorPvalFromRundownPlayer,
  scalePvalForStatus,
  teamsMatchLoose,
  type PvalAbsencePiece,
} from './loungeBotPvalBands.ts'
import { NFL_BASELINE_TEAM_METRICS } from './loungeBotTeamMetrics.ts'
import {
  injuryImpactPlayers,
  resolveRundownEvent,
  oddsSportKeyToRundownSportId,
} from './loungeBotRundownContext.ts'

function isHardOutStatus(status: string): boolean {
  const s = String(status || '').trim()
  return /^(out|inactive|suspended|ir|pup)$/i.test(s) || /injured reserve/i.test(s)
}

/** Fantasy-synced skill spots … must appear on current `nfl_players` for that team. */
function isSkillRosterPos(position: string | null | undefined): boolean {
  const p = String(position || '').trim().toUpperCase()
  if (!p) return false
  return /^(QB|RB|HB|FB|WR|TE|K|PK)$/.test(p) || p.includes('QUARTER') || p.includes('RUNNING') ||
    p.includes('WIDE') || p.includes('TIGHT')
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
    depthOrder?: number | null
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

type RosterPlayer = {
  nameKey: string
  fullName: string
  team: string
  position: string | null
  depthOrder: number | null
  status: string | null
  injuryStatus: string | null
}

function oddsTeamToNflAbbrev(teamName: string): string {
  const n = String(teamName || '').trim().toLowerCase()
  if (!n) return ''
  for (const row of NFL_BASELINE_TEAM_METRICS) {
    if (row.team_name.toLowerCase() === n) return row.team_abbr
  }
  const last = n.split(/\s+/).pop() || ''
  for (const row of NFL_BASELINE_TEAM_METRICS) {
    const mascot = row.team_name.toLowerCase().split(/\s+/).pop() || ''
    if (mascot && mascot === last) return row.team_abbr
  }
  return ''
}

/**
 * Load current Sleeper-backed roster rows for both sides.
 * Used to drop TheRundown ghosts and fill missing depth_chart_order.
 */
export async function loadNflRosterByTeamAbbrev(
  admin: SupabaseClient,
  abbrevs: string[],
): Promise<Map<string, RosterPlayer[]>> {
  const clean = [...new Set(abbrevs.map((a) => String(a || '').trim().toUpperCase()).filter(Boolean))]
  const out = new Map<string, RosterPlayer[]>()
  for (const a of clean) out.set(a, [])
  if (!clean.length) return out

  const { data, error } = await admin
    .from('nfl_players')
    .select('full_name, team, position, depth_chart_order, status, injury_status')
    .in('team', clean)

  if (error) {
    console.warn('[loungeBotInjuryPval] nfl_players roster load failed:', error.message)
    return out
  }

  for (const row of data || []) {
    const team = String(row.team || '').trim().toUpperCase()
    const fullName = String(row.full_name || '').trim()
    const nameKey = normalizePlayerNameKey(fullName)
    if (!team || !nameKey || !out.has(team)) continue
    const status = row.status != null ? String(row.status) : null
    if (status && /^retired$/i.test(status)) continue
    out.get(team)!.push({
      nameKey,
      fullName,
      team,
      position: row.position != null ? String(row.position) : null,
      depthOrder:
        row.depth_chart_order != null && Number.isFinite(Number(row.depth_chart_order))
          ? Number(row.depth_chart_order)
          : null,
      status,
      injuryStatus: row.injury_status != null ? String(row.injury_status) : null,
    })
  }
  return out
}

function findRosterHit(roster: RosterPlayer[] | undefined, name: string): RosterPlayer | null {
  if (!roster?.length) return null
  const key = normalizePlayerNameKey(name)
  if (!key) return null
  const exact = roster.find((p) => p.nameKey === key)
  if (exact) return exact
  // Allow "George Gumbs Jr" ↔ "George Gumbs"
  return roster.find((p) => p.nameKey.startsWith(key) || key.startsWith(p.nameKey)) || null
}

/**
 * Drop skill-position ghosts not on the current team roster; enrich depth/pos
 * from `nfl_players` when TheRundown omits them.
 */
export function gateInactivesAgainstRoster(
  teamName: string,
  inactives: Array<InactivePlayerInput & { teamId?: number }>,
  rosterByAbbrev: Map<string, RosterPlayer[]> | null,
): InactivePlayerInput[] {
  const abbrev = oddsTeamToNflAbbrev(teamName)
  const roster = abbrev && rosterByAbbrev ? rosterByAbbrev.get(abbrev) : null
  const out: InactivePlayerInput[] = []

  for (const p of inactives) {
    const hit = findRosterHit(roster || undefined, p.name)
    const pos = p.position || hit?.position || null
    const skill = isSkillRosterPos(pos) || isSkillRosterPos(p.position)

    if (rosterByAbbrev && abbrev) {
      if (hit?.status && /^retired$/i.test(hit.status)) continue
      if (hit && hit.team !== abbrev) continue
      if (!hit) {
        // No current Sleeper row for this team.
        // Skill spots always drop. Non-skill (DE/LB/…) drop unless Rundown
        // already marks depth-chart #1 (keeps rare real starter outs that
        // fantasy sync never stored; drops fossil Inactive junk).
        if (skill || p.depthOrder !== 1) continue
      }
    } else if (skill && !hit) {
      continue
    }

    const depthOrder = p.depthOrder ?? hit?.depthOrder ?? null
    out.push({
      name: hit?.fullName || p.name,
      status: p.status,
      position: pos,
      depthOrder,
    })
  }
  return out
}

/**
 * Calculate net injury impact for a single team given their inactive player list.
 * Curated/DB PVAL wins; otherwise v0 position-band Typical prior from position + depth.
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
    if (valEntry && valEntry.pval > 0 && teamsMatchLoose(valEntry.team, teamName)) {
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
        depthOrder: a.depthOrder ?? null,
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

    const homeAbbrev = oddsTeamToNflAbbrev(homeTeam)
    const awayAbbrev = oddsTeamToNflAbbrev(awayTeam)
    const rosterByAbbrev = admin && (homeAbbrev || awayAbbrev)
      ? await loadNflRosterByTeamAbbrev(admin, [homeAbbrev, awayAbbrev].filter(Boolean))
      : null

    const homeTeamId = ctx.homeTeamId
    const awayTeamId = ctx.awayTeamId

    const homeInactives = gateInactivesAgainstRoster(
      homeTeam,
      allInactives.filter((p) => p.teamId === homeTeamId),
      rosterByAbbrev,
    )
    const awayInactives = gateInactivesAgainstRoster(
      awayTeam,
      allInactives.filter((p) => p.teamId === awayTeamId),
      rosterByAbbrev,
    )

    if (homeInactives.length === 0 && awayInactives.length === 0) return null

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
