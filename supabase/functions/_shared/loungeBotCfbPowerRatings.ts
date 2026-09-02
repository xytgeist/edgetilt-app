/**
 * College Football Power Index for Scott (FPI vs market) + Rocco (SP+ off/def) + Tank (totals/tempo).
 *
 * Runtime prefers public.cfb_team_power_ratings filled by scripts/sync-cfb-power-ratings.mjs
 * from CollegeFootballData FPI + SP+ (with light in-season Elo blend). Static baselines
 * are fallback only when the DB board is empty.
 */
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2'
import { shortDisplayName } from './loungeBotOddsCaption.ts'

export type CfbTeamPowerRating = {
  team_name: string
  team_abbr: string
  conference: string
  power_rating: number
  off_rating: number
  def_rating: number
  tempo_rating: number
  home_field_advantage: number
  is_custom_override?: boolean
}

export type CfbMatchupProjection = {
  homeTeam: string
  awayTeam: string
  homePower: number
  awayPower: number
  homeFieldAdv: number
  modelSpreadHome: number // e.g. -7.5 (favors home by 7.5 pts)
  modelTotal: number      // e.g. 54.5
  combinedTempo: number   // avg plays/game (Tank totals lane)
  marketSpreadHome: number | null
  spreadDelta: number     // Model spread - Market spread
  isValuePlay: boolean    // Spread delta >= 2.5 points
  valueSide: 'home' | 'away' | null
  summaryLine: string
}

export const CFB_BASELINE_POWER_RATINGS: CfbTeamPowerRating[] = [
  // SEC
  { team_name: 'Georgia Bulldogs', team_abbr: 'UGA', conference: 'SEC', power_rating: 28.5, off_rating: 41.5, def_rating: 13.0, tempo_rating: 67.5, home_field_advantage: 3.5 },
  { team_name: 'Texas Longhorns', team_abbr: 'TEX', conference: 'SEC', power_rating: 28.0, off_rating: 42.0, def_rating: 14.0, tempo_rating: 69.0, home_field_advantage: 3.5 },
  { team_name: 'Alabama Crimson Tide', team_abbr: 'ALA', conference: 'SEC', power_rating: 26.5, off_rating: 39.5, def_rating: 13.0, tempo_rating: 68.5, home_field_advantage: 3.8 },
  { team_name: 'Ole Miss Rebels', team_abbr: 'MISS', conference: 'SEC', power_rating: 24.5, off_rating: 43.0, def_rating: 18.5, tempo_rating: 74.0, home_field_advantage: 3.0 },
  { team_name: 'LSU Tigers', team_abbr: 'LSU', conference: 'SEC', power_rating: 22.0, off_rating: 40.0, def_rating: 18.0, tempo_rating: 69.5, home_field_advantage: 4.0 },
  { team_name: 'Tennessee Volunteers', team_abbr: 'TENN', conference: 'SEC', power_rating: 23.5, off_rating: 38.5, def_rating: 15.0, tempo_rating: 72.5, home_field_advantage: 3.8 },
  { team_name: 'Texas A&M Aggies', team_abbr: 'TAMU', conference: 'SEC', power_rating: 21.0, off_rating: 35.0, def_rating: 14.0, tempo_rating: 68.0, home_field_advantage: 3.8 },
  { team_name: 'Missouri Tigers', team_abbr: 'MIZZ', conference: 'SEC', power_rating: 20.5, off_rating: 36.5, def_rating: 16.0, tempo_rating: 67.0, home_field_advantage: 3.0 },
  { team_name: 'Oklahoma Sooners', team_abbr: 'OU', conference: 'SEC', power_rating: 19.5, off_rating: 33.5, def_rating: 14.0, tempo_rating: 68.0, home_field_advantage: 3.5 },
  { team_name: 'Kentucky Wildcats', team_abbr: 'UK', conference: 'SEC', power_rating: 14.0, off_rating: 27.5, def_rating: 13.5, tempo_rating: 63.5, home_field_advantage: 2.8 },
  { team_name: 'Auburn Tigers', team_abbr: 'AUB', conference: 'SEC', power_rating: 15.5, off_rating: 31.0, def_rating: 15.5, tempo_rating: 69.0, home_field_advantage: 3.5 },
  { team_name: 'Florida Gators', team_abbr: 'FLA', conference: 'SEC', power_rating: 14.5, off_rating: 30.5, def_rating: 16.0, tempo_rating: 68.0, home_field_advantage: 3.5 },
  { team_name: 'South Carolina Gamecocks', team_abbr: 'SC', conference: 'SEC', power_rating: 13.5, off_rating: 26.0, def_rating: 12.5, tempo_rating: 67.0, home_field_advantage: 3.2 },
  { team_name: 'Arkansas Razorbacks', team_abbr: 'ARK', conference: 'SEC', power_rating: 12.0, off_rating: 30.0, def_rating: 18.0, tempo_rating: 68.5, home_field_advantage: 2.8 },
  { team_name: 'Mississippi State Bulldogs', team_abbr: 'MSST', conference: 'SEC', power_rating: 7.5, off_rating: 27.0, def_rating: 19.5, tempo_rating: 69.0, home_field_advantage: 3.0 },
  { team_name: 'Vanderbilt Commodores', team_abbr: 'VAN', conference: 'SEC', power_rating: 6.0, off_rating: 24.5, def_rating: 18.5, tempo_rating: 65.0, home_field_advantage: 2.0 },

  // BIG TEN
  { team_name: 'Ohio State Buckeyes', team_abbr: 'OSU', conference: 'Big Ten', power_rating: 28.5, off_rating: 42.0, def_rating: 13.5, tempo_rating: 67.0, home_field_advantage: 3.8 },
  { team_name: 'Oregon Ducks', team_abbr: 'ORE', conference: 'Big Ten', power_rating: 27.5, off_rating: 43.5, def_rating: 16.0, tempo_rating: 71.0, home_field_advantage: 3.8 },
  { team_name: 'Penn State Nittany Lions', team_abbr: 'PSU', conference: 'Big Ten', power_rating: 25.0, off_rating: 38.0, def_rating: 13.0, tempo_rating: 68.0, home_field_advantage: 4.0 },
  { team_name: 'Michigan Wolverines', team_abbr: 'MICH', conference: 'Big Ten', power_rating: 20.0, off_rating: 31.5, def_rating: 11.5, tempo_rating: 64.0, home_field_advantage: 3.8 },
  { team_name: 'USC Trojans', team_abbr: 'USC', conference: 'Big Ten', power_rating: 19.0, off_rating: 39.0, def_rating: 20.0, tempo_rating: 71.5, home_field_advantage: 2.8 },
  { team_name: 'Iowa Hawkeyes', team_abbr: 'IOWA', conference: 'Big Ten', power_rating: 15.0, off_rating: 23.0, def_rating: 8.0, tempo_rating: 62.0, home_field_advantage: 3.5 },
  { team_name: 'Washington Huskies', team_abbr: 'WASH', conference: 'Big Ten', power_rating: 14.5, off_rating: 31.0, def_rating: 16.5, tempo_rating: 68.0, home_field_advantage: 3.5 },
  { team_name: 'Wisconsin Badgers', team_abbr: 'WIS', conference: 'Big Ten', power_rating: 13.0, off_rating: 28.0, def_rating: 15.0, tempo_rating: 66.0, home_field_advantage: 3.2 },
  { team_name: 'Nebraska Cornhuskers', team_abbr: 'NEB', conference: 'Big Ten', power_rating: 13.5, off_rating: 27.5, def_rating: 14.0, tempo_rating: 66.5, home_field_advantage: 3.5 },
  { team_name: 'Indiana Hoosiers', team_abbr: 'IND', conference: 'Big Ten', power_rating: 17.5, off_rating: 37.0, def_rating: 19.5, tempo_rating: 70.0, home_field_advantage: 2.5 },
  { team_name: 'Illinois Fighting Illini', team_abbr: 'ILL', conference: 'Big Ten', power_rating: 14.0, off_rating: 29.5, def_rating: 15.5, tempo_rating: 67.0, home_field_advantage: 2.8 },
  { team_name: 'Rutgers Scarlet Knights', team_abbr: 'RUT', conference: 'Big Ten', power_rating: 10.5, def_rating: 15.5, off_rating: 26.0, tempo_rating: 66.0, home_field_advantage: 2.5 },
  { team_name: 'Minnesota Golden Gophers', team_abbr: 'MINN', conference: 'Big Ten', power_rating: 11.0, off_rating: 25.5, def_rating: 14.5, tempo_rating: 65.0, home_field_advantage: 2.8 },
  { team_name: 'Maryland Terrapins', team_abbr: 'MD', conference: 'Big Ten', power_rating: 10.0, off_rating: 29.0, def_rating: 19.0, tempo_rating: 68.0, home_field_advantage: 2.5 },
  { team_name: 'Michigan State Spartans', team_abbr: 'MSU', conference: 'Big Ten', power_rating: 9.0, off_rating: 25.0, def_rating: 16.0, tempo_rating: 67.0, home_field_advantage: 3.0 },
  { team_name: 'UCLA Bruins', team_abbr: 'UCLA', conference: 'Big Ten', power_rating: 7.0, off_rating: 24.5, def_rating: 17.5, tempo_rating: 66.0, home_field_advantage: 2.2 },
  { team_name: 'Northwestern Wildcats', team_abbr: 'NW', conference: 'Big Ten', power_rating: 4.5, off_rating: 20.5, def_rating: 16.0, tempo_rating: 64.0, home_field_advantage: 2.0 },
  { team_name: 'Purdue Boilermakers', team_abbr: 'PUR', conference: 'Big Ten', power_rating: 3.0, off_rating: 22.0, def_rating: 19.0, tempo_rating: 67.0, home_field_advantage: 2.5 },

  // BIG 12
  { team_name: 'Utah Utes', team_abbr: 'UTAH', conference: 'Big 12', power_rating: 20.5, off_rating: 33.5, def_rating: 13.0, tempo_rating: 67.0, home_field_advantage: 3.8 },
  { team_name: 'Kansas State Wildcats', team_abbr: 'KSU', conference: 'Big 12', power_rating: 19.0, off_rating: 34.5, def_rating: 15.5, tempo_rating: 67.5, home_field_advantage: 3.2 },
  { team_name: 'Iowa State Cyclones', team_abbr: 'ISU', conference: 'Big 12', power_rating: 18.0, off_rating: 31.5, def_rating: 13.5, tempo_rating: 66.0, home_field_advantage: 3.2 },
  { team_name: 'Oklahoma State Cowboys', team_abbr: 'OKST', conference: 'Big 12', power_rating: 17.0, off_rating: 34.0, def_rating: 17.0, tempo_rating: 68.5, home_field_advantage: 3.0 },
  { team_name: 'Arizona Wildcats', team_abbr: 'ARIZ', conference: 'Big 12', power_rating: 16.5, off_rating: 35.5, def_rating: 19.0, tempo_rating: 69.0, home_field_advantage: 3.0 },
  { team_name: 'Colorado Buffaloes', team_abbr: 'COLO', conference: 'Big 12', power_rating: 15.5, off_rating: 37.0, def_rating: 21.5, tempo_rating: 71.0, home_field_advantage: 3.2 },
  { team_name: 'Texas Tech Red Raiders', team_abbr: 'TTU', conference: 'Big 12', power_rating: 14.0, off_rating: 36.5, def_rating: 22.5, tempo_rating: 75.0, home_field_advantage: 3.2 },
  { team_name: 'TCU Horned Frogs', team_abbr: 'TCU', conference: 'Big 12', power_rating: 13.5, off_rating: 34.0, def_rating: 20.5, tempo_rating: 72.0, home_field_advantage: 2.8 },
  { team_name: 'West Virginia Mountaineers', team_abbr: 'WVU', conference: 'Big 12', power_rating: 13.0, off_rating: 31.5, def_rating: 18.5, tempo_rating: 67.5, home_field_advantage: 3.2 },
  { team_name: 'Kansas Jayhawks', team_abbr: 'KU', conference: 'Big 12', power_rating: 13.0, off_rating: 32.5, def_rating: 19.5, tempo_rating: 66.5, home_field_advantage: 2.5 },
  { team_name: 'BYU Cougars', team_abbr: 'BYU', conference: 'Big 12', power_rating: 15.0, off_rating: 30.0, def_rating: 15.0, tempo_rating: 67.0, home_field_advantage: 3.5 },
  { team_name: 'Baylor Bears', team_abbr: 'BAY', conference: 'Big 12', power_rating: 11.0, off_rating: 29.5, def_rating: 18.5, tempo_rating: 68.0, home_field_advantage: 2.8 },
  { team_name: 'UCF Knights', team_abbr: 'UCF', conference: 'Big 12', power_rating: 12.5, off_rating: 33.0, def_rating: 20.5, tempo_rating: 70.0, home_field_advantage: 3.0 },
  { team_name: 'Arizona State Sun Devils', team_abbr: 'ASU', conference: 'Big 12', power_rating: 12.0, off_rating: 28.5, def_rating: 16.5, tempo_rating: 67.0, home_field_advantage: 3.0 },
  { team_name: 'Cincinnati Bearcats', team_abbr: 'CIN', conference: 'Big 12', power_rating: 9.5, off_rating: 27.5, def_rating: 18.0, tempo_rating: 67.5, home_field_advantage: 2.8 },
  { team_name: 'Houston Cougars', team_abbr: 'HOU', conference: 'Big 12', power_rating: 5.0, off_rating: 21.0, def_rating: 16.0, tempo_rating: 65.5, home_field_advantage: 2.5 },

  // ACC
  { team_name: 'Miami Hurricanes', team_abbr: 'MIA', conference: 'ACC', power_rating: 22.5, off_rating: 41.0, def_rating: 18.5, tempo_rating: 70.0, home_field_advantage: 3.0 },
  { team_name: 'Clemson Tigers', team_abbr: 'CLEM', conference: 'ACC', power_rating: 22.0, off_rating: 36.5, def_rating: 14.5, tempo_rating: 69.5, home_field_advantage: 3.8 },
  { team_name: 'Louisville Cardinals', team_abbr: 'LOU', conference: 'ACC', power_rating: 19.0, off_rating: 36.0, def_rating: 17.0, tempo_rating: 68.5, home_field_advantage: 3.0 },
  { team_name: 'SMU Mustangs', team_abbr: 'SMU', conference: 'ACC', power_rating: 17.5, off_rating: 37.0, def_rating: 19.5, tempo_rating: 71.0, home_field_advantage: 2.8 },
  { team_name: 'Florida State Seminoles', team_abbr: 'FSU', conference: 'ACC', power_rating: 14.5, off_rating: 27.0, def_rating: 12.5, tempo_rating: 67.0, home_field_advantage: 3.5 },
  { team_name: 'Virginia Tech Hokies', team_abbr: 'VT', conference: 'ACC', power_rating: 14.0, off_rating: 29.5, def_rating: 15.5, tempo_rating: 66.0, home_field_advantage: 3.8 },
  { team_name: 'NC State Wolfpack', team_abbr: 'NCST', conference: 'ACC', power_rating: 13.5, off_rating: 28.5, def_rating: 15.0, tempo_rating: 67.0, home_field_advantage: 3.2 },
  { team_name: 'Pittsburgh Panthers', team_abbr: 'PITT', conference: 'ACC', power_rating: 14.0, off_rating: 33.5, def_rating: 19.5, tempo_rating: 72.0, home_field_advantage: 2.8 },
  { team_name: 'Georgia Tech Yellow Jackets', team_abbr: 'GT', conference: 'ACC', power_rating: 13.0, off_rating: 31.0, def_rating: 18.0, tempo_rating: 67.5, home_field_advantage: 2.5 },
  { team_name: 'North Carolina Tar Heels', team_abbr: 'UNC', conference: 'ACC', power_rating: 12.0, off_rating: 32.5, def_rating: 20.5, tempo_rating: 70.0, home_field_advantage: 2.8 },
  { team_name: 'California Golden Bears', team_abbr: 'CAL', conference: 'ACC', power_rating: 11.0, off_rating: 26.5, def_rating: 15.5, tempo_rating: 68.0, home_field_advantage: 2.5 },
  { team_name: 'Boston College Eagles', team_abbr: 'BC', conference: 'ACC', power_rating: 10.5, off_rating: 27.0, def_rating: 16.5, tempo_rating: 66.0, home_field_advantage: 2.5 },
  { team_name: 'Duke Blue Devils', team_abbr: 'DUKE', conference: 'ACC', power_rating: 11.5, off_rating: 26.0, def_rating: 14.5, tempo_rating: 67.0, home_field_advantage: 2.2 },
  { team_name: 'Virginia Cavaliers', team_abbr: 'UVA', conference: 'ACC', power_rating: 8.5, off_rating: 26.5, def_rating: 18.0, tempo_rating: 68.0, home_field_advantage: 2.5 },
  { team_name: 'Syracuse Orange', team_abbr: 'SYR', conference: 'ACC', power_rating: 10.0, off_rating: 30.5, def_rating: 20.5, tempo_rating: 71.0, home_field_advantage: 2.5 },
  { team_name: 'Wake Forest Demon Deacons', team_abbr: 'WAKE', conference: 'ACC', power_rating: 6.0, off_rating: 24.5, def_rating: 18.5, tempo_rating: 70.0, home_field_advantage: 2.2 },
  { team_name: 'Stanford Cardinal', team_abbr: 'STAN', conference: 'ACC', power_rating: 5.0, off_rating: 23.0, def_rating: 18.0, tempo_rating: 66.0, home_field_advantage: 2.0 },

  // NOTRE DAME / INDEPENDENTS
  { team_name: 'Notre Dame Fighting Irish', team_abbr: 'ND', conference: 'Independent', power_rating: 25.5, off_rating: 38.5, def_rating: 13.0, tempo_rating: 68.0, home_field_advantage: 3.5 },

  // GROUP OF 5 / SERVICE ACADEMIES
  { team_name: 'Boise State Broncos', team_abbr: 'BSU', conference: 'Mountain West', power_rating: 18.5, off_rating: 37.0, def_rating: 18.5, tempo_rating: 68.5, home_field_advantage: 3.8 },
  { team_name: 'Memphis Tigers', team_abbr: 'MEM', conference: 'AAC', power_rating: 13.5, off_rating: 34.5, def_rating: 21.0, tempo_rating: 70.0, home_field_advantage: 3.0 },
  { team_name: 'Tulane Green Wave', team_abbr: 'TUL', conference: 'AAC', power_rating: 13.0, off_rating: 31.5, def_rating: 18.5, tempo_rating: 67.0, home_field_advantage: 2.8 },
  { team_name: 'Liberty Flames', team_abbr: 'LIB', conference: 'C-USA', power_rating: 12.0, off_rating: 33.0, def_rating: 21.0, tempo_rating: 69.0, home_field_advantage: 2.8 },
  { team_name: 'Appalachian State Mountaineers', team_abbr: 'APP', conference: 'Sun Belt', power_rating: 10.5, off_rating: 31.0, def_rating: 20.5, tempo_rating: 70.0, home_field_advantage: 3.5 },
  { team_name: 'James Madison Dukes', team_abbr: 'JMU', conference: 'Sun Belt', power_rating: 11.5, off_rating: 30.5, def_rating: 19.0, tempo_rating: 68.5, home_field_advantage: 3.2 },
  { team_name: 'UNLV Rebels', team_abbr: 'UNLV', conference: 'Mountain West', power_rating: 12.5, off_rating: 33.5, def_rating: 21.0, tempo_rating: 69.5, home_field_advantage: 2.5 },
  { team_name: 'Fresno State Bulldogs', team_abbr: 'FRES', conference: 'Mountain West', power_rating: 9.5, off_rating: 28.0, def_rating: 18.5, tempo_rating: 67.0, home_field_advantage: 3.0 },
  { team_name: 'Army Black Knights', team_abbr: 'ARMY', conference: 'AAC', power_rating: 11.0, off_rating: 26.0, def_rating: 15.0, tempo_rating: 61.0, home_field_advantage: 3.0 },
  { team_name: 'Navy Midshipmen', team_abbr: 'NAVY', conference: 'AAC', power_rating: 9.0, off_rating: 25.0, def_rating: 16.0, tempo_rating: 61.5, home_field_advantage: 3.0 },
  { team_name: 'Air Force Falcons', team_abbr: 'AFA', conference: 'Mountain West', power_rating: 6.5, off_rating: 22.5, def_rating: 16.0, tempo_rating: 60.5, home_field_advantage: 3.5 },
]

/**
 * Fuzzy resolve CFB team power ratings.
 */
export function resolveCfbTeamRating(
  teamName: string,
  customMap?: Map<string, CfbTeamPowerRating>,
): CfbTeamPowerRating | null {
  const norm = teamName.toLowerCase().trim()
  const list = customMap ? Array.from(customMap.values()) : CFB_BASELINE_POWER_RATINGS

  for (const m of list) {
    if (m.team_name.toLowerCase() === norm) return m
    if (norm.includes(m.team_abbr.toLowerCase())) return m
    const short = shortDisplayName(m.team_name).toLowerCase()
    if (norm.endsWith(short) || norm.includes(short)) return m
    const firstWord = m.team_name.toLowerCase().split(' ')[0]
    if (norm.startsWith(firstWord) && firstWord.length >= 4) return m
  }
  return null
}

/**
 * Load dynamic CFB power ratings from public.cfb_team_power_ratings table.
 */
export async function loadDbCfbPowerRatingsMap(admin: SupabaseClient): Promise<Map<string, CfbTeamPowerRating>> {
  const map = new Map<string, CfbTeamPowerRating>()
  try {
    const { data, error } = await admin
      .from('cfb_team_power_ratings')
      .select('*')

    if (!error && data?.length) {
      for (const row of data) {
        map.set(row.team_name.toLowerCase(), {
          team_name: row.team_name,
          team_abbr: row.team_abbr,
          conference: row.conference,
          power_rating: Number(row.power_rating),
          off_rating: Number(row.off_rating),
          def_rating: Number(row.def_rating),
          tempo_rating: Number(row.tempo_rating),
          home_field_advantage: Number(row.home_field_advantage),
          is_custom_override: Boolean(row.is_custom_override),
        })
      }
    }
  } catch (err) {
    console.error('Error loading dynamic CFB power ratings from DB:', err)
  }

  // Backfill with static baselines
  for (const base of CFB_BASELINE_POWER_RATINGS) {
    if (!map.has(base.team_name.toLowerCase())) {
      map.set(base.team_name.toLowerCase(), base)
    }
  }

  return map
}

/**
 * Calculate Model Spread and Total Projection for a College Football game.
 */
export function calculateCfbMatchupProjection(
  homeTeamName: string,
  awayTeamName: string,
  marketSpreadHome: number | null,
  ratingsMap?: Map<string, CfbTeamPowerRating>,
): CfbMatchupProjection | null {
  const home = resolveCfbTeamRating(homeTeamName, ratingsMap)
  const away = resolveCfbTeamRating(awayTeamName, ratingsMap)

  if (!home || !away) return null

  // 1. Model Spread Calculation:
  // Spread = (Away Power Rating - Home Power Rating) - Home Field Advantage
  // If Home is 28.5 and Away is 18.5, Neutral delta = -10.0. With 3.5 HFA -> Home -13.5
  const rawSpread = (away.power_rating - home.power_rating) - home.home_field_advantage
  const modelSpreadHome = Math.round(rawSpread * 10) / 10

  // 2. Projected Total (SP+ off/def, tempo-scaled vs ~68 plays/game FBS mean)
  const homeProjPts = Math.max(10, (home.off_rating + away.def_rating) / 2)
  const awayProjPts = Math.max(10, (away.off_rating + home.def_rating) / 2)
  const tempoAvg = (home.tempo_rating + away.tempo_rating) / 2
  const tempoScale = Math.max(0.85, Math.min(1.2, tempoAvg / 68))
  const modelTotal = Math.round((homeProjPts + awayProjPts) * tempoScale * 10) / 10
  const combinedTempo = Math.round(tempoAvg * 10) / 10

  // 3. Value calculation vs Market Spread
  let spreadDelta = 0
  let isValuePlay = false
  let valueSide: 'home' | 'away' | null = null

  if (marketSpreadHome != null) {
    // Delta = Market spread - Model spread (e.g. Market is -6.5, Model is -10.0 -> +3.5 value on Home)
    const deltaOnHome = marketSpreadHome - modelSpreadHome
    spreadDelta = Math.round(Math.abs(deltaOnHome) * 10) / 10

    if (deltaOnHome >= 2.5) {
      isValuePlay = true
      valueSide = 'home'
    } else if (deltaOnHome <= -2.5) {
      isValuePlay = true
      valueSide = 'away'
    }
  }

  // Concise insight summary line
  let summaryLine = ''
  const homeName = shortDisplayName(home.team_name)
  const awayName = shortDisplayName(away.team_name)
  const spreadDisp = modelSpreadHome > 0 ? `+${modelSpreadHome}` : String(modelSpreadHome)

  if (isValuePlay && valueSide) {
    const valTeam = valueSide === 'home' ? homeName : awayName
    summaryLine = `CFB FPI Edge · Model ${homeName} ${spreadDisp} vs ${awayName} · +${spreadDelta} pt on ${valTeam}`
  } else {
    summaryLine = `CFB FPI · ${homeName} (${home.power_rating}) vs ${awayName} (${away.power_rating}) · Model ${homeName} ${spreadDisp}`
  }

  return {
    homeTeam: home.team_name,
    awayTeam: away.team_name,
    homePower: home.power_rating,
    awayPower: away.power_rating,
    homeFieldAdv: home.home_field_advantage,
    modelSpreadHome,
    modelTotal,
    combinedTempo,
    marketSpreadHome,
    spreadDelta,
    isValuePlay,
    valueSide,
    summaryLine,
  }
}
