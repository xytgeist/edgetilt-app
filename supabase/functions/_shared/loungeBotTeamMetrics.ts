/**
 * NFL Team EPA & Trench Efficiency Registry and Matchup Calculator.
 *
 * Provides:
 * 1. Off / Def EPA per play ratings.
 * 2. Pass Block Win Rate (PBWR) & Pass Rush Win Rate (PRWR).
 * 3. Run Block Win Rate (RBWR) & Run Stop Win Rate (RSWR).
 * 4. Matchup trench disparity & EPA model spread calculation for Rocco & Scott.
 */
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2'
import { shortDisplayName } from './loungeBotOddsCaption.ts'

export type NflTeamMetrics = {
  team_abbr: string
  team_name: string
  conference: 'AFC' | 'NFC'
  division: 'East' | 'North' | 'South' | 'West'
  off_epa_play: number
  def_epa_play: number
  success_rate: number
  pass_block_win_rate: number
  pass_rush_win_rate: number
  run_block_win_rate: number
  run_stop_win_rate: number
  pressure_rate_allowed: number
  pressure_rate_generated: number
  is_custom_override?: boolean
}

export type TrenchEpaMatchupSummary = {
  homeAbbr: string
  awayAbbr: string
  homeTeam: string
  awayTeam: string
  homeNetEpa: number
  awayNetEpa: number
  netEpaDeltaHome: number // homeNetEpa - awayNetEpa
  epaSpreadImpactHome: number // in points (+ = favors home, - = favors away)
  homePassTrenchDelta: number // home PBWR - away PRWR
  awayPassTrenchDelta: number // away PBWR - home PRWR
  netTrenchSpreadImpactHome: number // in points
  trenchAdvantageSide: 'home' | 'away' | null
  isTrenchMismatch: boolean // >= 0.8 pts trench edge
  isEpaMismatch: boolean    // >= 2.0 pts EPA edge
  summaryLine: string
}

/**
 * High-fidelity baseline 2026 NFL metrics across all 32 franchises.
 */
export const NFL_BASELINE_TEAM_METRICS: NflTeamMetrics[] = [
  // AFC EAST
  { team_abbr: 'BUF', team_name: 'Buffalo Bills', conference: 'AFC', division: 'East', off_epa_play: 0.14, def_epa_play: -0.04, success_rate: 49.5, pass_block_win_rate: 65, pass_rush_win_rate: 48, run_block_win_rate: 73, run_stop_win_rate: 33, pressure_rate_allowed: 26, pressure_rate_generated: 36 },
  { team_abbr: 'MIA', team_name: 'Miami Dolphins', conference: 'AFC', division: 'East', off_epa_play: 0.08, def_epa_play: 0.02, success_rate: 47.0, pass_block_win_rate: 57, pass_rush_win_rate: 46, run_block_win_rate: 68, run_stop_win_rate: 31, pressure_rate_allowed: 31, pressure_rate_generated: 34 },
  { team_abbr: 'NYJ', team_name: 'New York Jets', conference: 'AFC', division: 'East', off_epa_play: 0.03, def_epa_play: -0.09, success_rate: 45.0, pass_block_win_rate: 62, pass_rush_win_rate: 52, run_block_win_rate: 70, run_stop_win_rate: 36, pressure_rate_allowed: 29, pressure_rate_generated: 39 },
  { team_abbr: 'NE', team_name: 'New England Patriots', conference: 'AFC', division: 'East', off_epa_play: -0.12, def_epa_play: 0.04, success_rate: 40.0, pass_block_win_rate: 52, pass_rush_win_rate: 40, run_block_win_rate: 64, run_stop_win_rate: 29, pressure_rate_allowed: 39, pressure_rate_generated: 28 },

  // AFC NORTH
  { team_abbr: 'BAL', team_name: 'Baltimore Ravens', conference: 'AFC', division: 'North', off_epa_play: 0.16, def_epa_play: -0.07, success_rate: 51.0, pass_block_win_rate: 64, pass_rush_win_rate: 49, run_block_win_rate: 77, run_stop_win_rate: 37, pressure_rate_allowed: 27, pressure_rate_generated: 37 },
  { team_abbr: 'CIN', team_name: 'Cincinnati Bengals', conference: 'AFC', division: 'North', off_epa_play: 0.10, def_epa_play: 0.05, success_rate: 48.0, pass_block_win_rate: 59, pass_rush_win_rate: 43, run_block_win_rate: 67, run_stop_win_rate: 28, pressure_rate_allowed: 32, pressure_rate_generated: 31 },
  { team_abbr: 'CLE', team_name: 'Cleveland Browns', conference: 'AFC', division: 'North', off_epa_play: -0.06, def_epa_play: -0.11, success_rate: 42.5, pass_block_win_rate: 63, pass_rush_win_rate: 55, run_block_win_rate: 71, run_stop_win_rate: 38, pressure_rate_allowed: 33, pressure_rate_generated: 42 },
  { team_abbr: 'PIT', team_name: 'Pittsburgh Steelers', conference: 'AFC', division: 'North', off_epa_play: -0.02, def_epa_play: -0.08, success_rate: 44.0, pass_block_win_rate: 61, pass_rush_win_rate: 53, run_block_win_rate: 72, run_stop_win_rate: 35, pressure_rate_allowed: 30, pressure_rate_generated: 40 },

  // AFC SOUTH
  { team_abbr: 'HOU', team_name: 'Houston Texans', conference: 'AFC', division: 'South', off_epa_play: 0.09, def_epa_play: -0.03, success_rate: 47.5, pass_block_win_rate: 61, pass_rush_win_rate: 50, run_block_win_rate: 69, run_stop_win_rate: 34, pressure_rate_allowed: 29, pressure_rate_generated: 38 },
  { team_abbr: 'IND', team_name: 'Indianapolis Colts', conference: 'AFC', division: 'South', off_epa_play: 0.04, def_epa_play: 0.03, success_rate: 46.0, pass_block_win_rate: 67, pass_rush_win_rate: 44, run_block_win_rate: 74, run_stop_win_rate: 30, pressure_rate_allowed: 25, pressure_rate_generated: 32 },
  { team_abbr: 'JAX', team_name: 'Jacksonville Jaguars', conference: 'AFC', division: 'South', off_epa_play: 0.02, def_epa_play: 0.04, success_rate: 45.0, pass_block_win_rate: 58, pass_rush_win_rate: 45, run_block_win_rate: 68, run_stop_win_rate: 31, pressure_rate_allowed: 33, pressure_rate_generated: 33 },
  { team_abbr: 'TEN', team_name: 'Tennessee Titans', conference: 'AFC', division: 'South', off_epa_play: -0.09, def_epa_play: 0.01, success_rate: 41.5, pass_block_win_rate: 54, pass_rush_win_rate: 42, run_block_win_rate: 66, run_stop_win_rate: 33, pressure_rate_allowed: 37, pressure_rate_generated: 30 },

  // AFC WEST
  { team_abbr: 'KC', team_name: 'Kansas City Chiefs', conference: 'AFC', division: 'West', off_epa_play: 0.18, def_epa_play: -0.08, success_rate: 52.0, pass_block_win_rate: 68, pass_rush_win_rate: 51, run_block_win_rate: 74, run_stop_win_rate: 35, pressure_rate_allowed: 24, pressure_rate_generated: 38 },
  { team_abbr: 'LAC', team_name: 'Los Angeles Chargers', conference: 'AFC', division: 'West', off_epa_play: 0.06, def_epa_play: -0.02, success_rate: 46.5, pass_block_win_rate: 66, pass_rush_win_rate: 47, run_block_win_rate: 73, run_stop_win_rate: 32, pressure_rate_allowed: 26, pressure_rate_generated: 35 },
  { team_abbr: 'DEN', team_name: 'Denver Broncos', conference: 'AFC', division: 'West', off_epa_play: -0.04, def_epa_play: 0.00, success_rate: 43.0, pass_block_win_rate: 64, pass_rush_win_rate: 45, run_block_win_rate: 70, run_stop_win_rate: 32, pressure_rate_allowed: 28, pressure_rate_generated: 33 },
  { team_abbr: 'LV', team_name: 'Las Vegas Raiders', conference: 'AFC', division: 'West', off_epa_play: -0.08, def_epa_play: 0.01, success_rate: 42.0, pass_block_win_rate: 56, pass_rush_win_rate: 49, run_block_win_rate: 67, run_stop_win_rate: 33, pressure_rate_allowed: 35, pressure_rate_generated: 37 },

  // NFC EAST
  { team_abbr: 'PHI', team_name: 'Philadelphia Eagles', conference: 'NFC', division: 'East', off_epa_play: 0.13, def_epa_play: -0.03, success_rate: 49.0, pass_block_win_rate: 71, pass_rush_win_rate: 52, run_block_win_rate: 78, run_stop_win_rate: 34, pressure_rate_allowed: 23, pressure_rate_generated: 39 },
  { team_abbr: 'DAL', team_name: 'Dallas Cowboys', conference: 'NFC', division: 'East', off_epa_play: 0.09, def_epa_play: 0.02, success_rate: 47.0, pass_block_win_rate: 63, pass_rush_win_rate: 50, run_block_win_rate: 69, run_stop_win_rate: 30, pressure_rate_allowed: 28, pressure_rate_generated: 38 },
  { team_abbr: 'WAS', team_name: 'Washington Commanders', conference: 'NFC', division: 'East', off_epa_play: 0.07, def_epa_play: 0.06, success_rate: 46.5, pass_block_win_rate: 57, pass_rush_win_rate: 43, run_block_win_rate: 69, run_stop_win_rate: 29, pressure_rate_allowed: 34, pressure_rate_generated: 31 },
  { team_abbr: 'NYG', team_name: 'New York Giants', conference: 'NFC', division: 'East', off_epa_play: -0.11, def_epa_play: 0.03, success_rate: 40.5, pass_block_win_rate: 49, pass_rush_win_rate: 48, run_block_win_rate: 65, run_stop_win_rate: 31, pressure_rate_allowed: 41, pressure_rate_generated: 36 },

  // NFC NORTH
  { team_abbr: 'DET', team_name: 'Detroit Lions', conference: 'NFC', division: 'North', off_epa_play: 0.17, def_epa_play: -0.02, success_rate: 52.5, pass_block_win_rate: 70, pass_rush_win_rate: 49, run_block_win_rate: 79, run_stop_win_rate: 36, pressure_rate_allowed: 22, pressure_rate_generated: 37 },
  { team_abbr: 'GB', team_name: 'Green Bay Packers', conference: 'NFC', division: 'North', off_epa_play: 0.11, def_epa_play: -0.01, success_rate: 48.5, pass_block_win_rate: 67, pass_rush_win_rate: 48, run_block_win_rate: 72, run_stop_win_rate: 33, pressure_rate_allowed: 25, pressure_rate_generated: 36 },
  { team_abbr: 'MIN', team_name: 'Minnesota Vikings', conference: 'NFC', division: 'North', off_epa_play: 0.05, def_epa_play: -0.05, success_rate: 46.0, pass_block_win_rate: 62, pass_rush_win_rate: 51, run_block_win_rate: 68, run_stop_win_rate: 34, pressure_rate_allowed: 30, pressure_rate_generated: 39 },
  { team_abbr: 'CHI', team_name: 'Chicago Bears', conference: 'NFC', division: 'North', off_epa_play: 0.01, def_epa_play: -0.04, success_rate: 44.5, pass_block_win_rate: 58, pass_rush_win_rate: 46, run_block_win_rate: 70, run_stop_win_rate: 35, pressure_rate_allowed: 34, pressure_rate_generated: 35 },

  // NFC SOUTH
  { team_abbr: 'TB', team_name: 'Tampa Bay Buccaneers', conference: 'NFC', division: 'South', off_epa_play: 0.06, def_epa_play: 0.01, success_rate: 46.5, pass_block_win_rate: 64, pass_rush_win_rate: 44, run_block_win_rate: 69, run_stop_win_rate: 34, pressure_rate_allowed: 27, pressure_rate_generated: 33 },
  { team_abbr: 'ATL', team_name: 'Atlanta Falcons', conference: 'NFC', division: 'South', off_epa_play: 0.04, def_epa_play: 0.02, success_rate: 46.0, pass_block_win_rate: 65, pass_rush_win_rate: 41, run_block_win_rate: 74, run_stop_win_rate: 30, pressure_rate_allowed: 27, pressure_rate_generated: 29 },
  { team_abbr: 'NO', team_name: 'New Orleans Saints', conference: 'NFC', division: 'South', off_epa_play: -0.01, def_epa_play: 0.00, success_rate: 44.0, pass_block_win_rate: 59, pass_rush_win_rate: 45, run_block_win_rate: 68, run_stop_win_rate: 32, pressure_rate_allowed: 31, pressure_rate_generated: 34 },
  { team_abbr: 'CAR', team_name: 'Carolina Panthers', conference: 'NFC', division: 'South', off_epa_play: -0.15, def_epa_play: 0.12, success_rate: 38.5, pass_block_win_rate: 55, pass_rush_win_rate: 36, run_block_win_rate: 66, run_stop_win_rate: 26, pressure_rate_allowed: 38, pressure_rate_generated: 25 },

  // NFC WEST
  { team_abbr: 'SF', team_name: 'San Francisco 49ers', conference: 'NFC', division: 'West', off_epa_play: 0.15, def_epa_play: -0.06, success_rate: 51.5, pass_block_win_rate: 60, pass_rush_win_rate: 53, run_block_win_rate: 75, run_stop_win_rate: 36, pressure_rate_allowed: 30, pressure_rate_generated: 41 },
  { team_abbr: 'LAR', team_name: 'Los Angeles Rams', conference: 'NFC', division: 'West', off_epa_play: 0.08, def_epa_play: 0.01, success_rate: 47.0, pass_block_win_rate: 65, pass_rush_win_rate: 47, run_block_win_rate: 72, run_stop_win_rate: 31, pressure_rate_allowed: 26, pressure_rate_generated: 35 },
  { team_abbr: 'SEA', team_name: 'Seattle Seahawks', conference: 'NFC', division: 'West', off_epa_play: 0.03, def_epa_play: -0.01, success_rate: 45.5, pass_block_win_rate: 58, pass_rush_win_rate: 48, run_block_win_rate: 68, run_stop_win_rate: 32, pressure_rate_allowed: 32, pressure_rate_generated: 36 },
  { team_abbr: 'ARI', team_name: 'Arizona Cardinals', conference: 'NFC', division: 'West', off_epa_play: 0.02, def_epa_play: 0.07, success_rate: 45.0, pass_block_win_rate: 61, pass_rush_win_rate: 39, run_block_win_rate: 71, run_stop_win_rate: 27, pressure_rate_allowed: 30, pressure_rate_generated: 27 },
]

/**
 * Fuzzy resolve team metrics by full name or city nickname.
 */
export function resolveTeamMetrics(teamName: string, customMap?: Map<string, NflTeamMetrics>): NflTeamMetrics | null {
  const norm = teamName.toLowerCase().trim()
  const list = customMap ? Array.from(customMap.values()) : NFL_BASELINE_TEAM_METRICS

  for (const m of list) {
    if (m.team_name.toLowerCase() === norm) return m
    if (norm.includes(m.team_abbr.toLowerCase())) return m
    const short = shortDisplayName(m.team_name).toLowerCase()
    if (norm.endsWith(short) || norm.includes(short)) return m
  }
  return null
}

/**
 * Load dynamic team metrics from public.nfl_team_metrics table.
 */
export async function loadDbTeamMetricsMap(admin: SupabaseClient): Promise<Map<string, NflTeamMetrics>> {
  const map = new Map<string, NflTeamMetrics>()
  try {
    const { data, error } = await admin
      .from('nfl_team_metrics')
      .select('*')

    if (!error && data?.length) {
      for (const row of data) {
        map.set(row.team_abbr.toUpperCase(), {
          team_abbr: row.team_abbr,
          team_name: row.team_name,
          conference: row.conference,
          division: row.division,
          off_epa_play: Number(row.off_epa_play),
          def_epa_play: Number(row.def_epa_play),
          success_rate: Number(row.success_rate),
          pass_block_win_rate: Number(row.pass_block_win_rate),
          pass_rush_win_rate: Number(row.pass_rush_win_rate),
          run_block_win_rate: Number(row.run_block_win_rate),
          run_stop_win_rate: Number(row.run_stop_win_rate),
          pressure_rate_allowed: Number(row.pressure_rate_allowed),
          pressure_rate_generated: Number(row.pressure_rate_generated),
          is_custom_override: Boolean(row.is_custom_override),
        })
      }
    }
  } catch (err) {
    console.error('Error loading dynamic team metrics from DB:', err)
  }

  // Backfill with static baselines for any missing teams
  for (const base of NFL_BASELINE_TEAM_METRICS) {
    if (!map.has(base.team_abbr.toUpperCase())) {
      map.set(base.team_abbr.toUpperCase(), base)
    }
  }

  return map
}

/**
 * Calculate Trench Disparity & Net EPA impact between two teams.
 */
export function calculateTrenchEpaMatchup(
  homeTeamName: string,
  awayTeamName: string,
  teamMap?: Map<string, NflTeamMetrics>,
): TrenchEpaMatchupSummary | null {
  const home = resolveTeamMetrics(homeTeamName, teamMap)
  const away = resolveTeamMetrics(awayTeamName, teamMap)

  if (!home || !away) return null

  // 1. Net EPA Calculations
  const homeNetEpa = Math.round((home.off_epa_play - home.def_epa_play) * 100) / 100
  const awayNetEpa = Math.round((away.off_epa_play - away.def_epa_play) * 100) / 100
  const netEpaDeltaHome = Math.round((homeNetEpa - awayNetEpa) * 100) / 100

  // Net EPA spread impact: 1 net EPA unit per play ~ 22.0 spread points across ~65 plays
  const epaSpreadImpactHome = Math.round(netEpaDeltaHome * 22.0 * 10) / 10

  // 2. Trench Matchup Calculations
  // Home Offense Pass Protection vs Away Pass Rush
  const homePassTrenchDelta = home.pass_block_win_rate - away.pass_rush_win_rate
  // Away Offense Pass Protection vs Home Pass Rush
  const awayPassTrenchDelta = away.pass_block_win_rate - home.pass_rush_win_rate

  // Run Game Push: RBWR vs RSWR
  const homeRunTrenchDelta = home.run_block_win_rate - away.run_stop_win_rate
  const awayRunTrenchDelta = away.run_block_win_rate - home.run_stop_win_rate

  // Point spread impact from line disparities:
  // Pass protection disparity is primary (div 12), Run push secondary (div 25)
  const passTrenchPoints = (homePassTrenchDelta - awayPassTrenchDelta) / 12.0
  const runTrenchPoints = (homeRunTrenchDelta - awayRunTrenchDelta) / 25.0
  const netTrenchSpreadImpactHome = Math.round((passTrenchPoints + runTrenchPoints) * 10) / 10

  let trenchAdvantageSide: 'home' | 'away' | null = null
  if (netTrenchSpreadImpactHome >= 0.8) trenchAdvantageSide = 'home'
  else if (netTrenchSpreadImpactHome <= -0.8) trenchAdvantageSide = 'away'

  const isTrenchMismatch = Math.abs(netTrenchSpreadImpactHome) >= 0.8
  const isEpaMismatch = Math.abs(epaSpreadImpactHome) >= 2.0

  // Concise insight summary line
  let summaryLine = ''
  if (isTrenchMismatch) {
    const advSide = trenchAdvantageSide === 'home' ? home : away
    const oppSide = trenchAdvantageSide === 'home' ? away : home
    const advPts = Math.abs(netTrenchSpreadImpactHome)
    summaryLine = `Trench Mismatch · ${shortDisplayName(advSide.team_name)} O-Line (${advSide.pass_block_win_rate}% PBWR vs ${oppSide.pass_rush_win_rate}% PRWR) · +${advPts} pt line edge`
  } else if (isEpaMismatch) {
    const advSide = epaSpreadImpactHome > 0 ? home : away
    const oppSide = epaSpreadImpactHome > 0 ? away : home
    const advPts = Math.abs(epaSpreadImpactHome)
    summaryLine = `EPA Edge · ${shortDisplayName(advSide.team_name)} Net EPA (${advSide.off_epa_play > 0 ? '+' : ''}${advSide.off_epa_play}/play) vs ${shortDisplayName(oppSide.team_name)} · +${advPts} pt model delta`
  }

  return {
    homeAbbr: home.team_abbr,
    awayAbbr: away.team_abbr,
    homeTeam: home.team_name,
    awayTeam: away.team_name,
    homeNetEpa,
    awayNetEpa,
    netEpaDeltaHome,
    epaSpreadImpactHome,
    homePassTrenchDelta,
    awayPassTrenchDelta,
    netTrenchSpreadImpactHome,
    trenchAdvantageSide,
    isTrenchMismatch,
    isEpaMismatch,
    summaryLine,
  }
}
