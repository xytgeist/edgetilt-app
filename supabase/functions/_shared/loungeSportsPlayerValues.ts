/**
 * Point Spread Value (PVAL) Table for NFL Key Players.
 *
 * Represents the estimated point spread line shift (in points) when a player
 * is ruled OUT / inactive relative to a replacement-level player.
 *
 * Tiers:
 * - Elite Tier 1 QBs: 4.5 - 6.0 pts
 * - Starting Tier 2 QBs: 3.0 - 4.5 pts
 * - Tier 3 / Bridge QBs: 1.5 - 2.5 pts
 * - Elite Edge / Pass Rushers: 1.0 - 1.5 pts
 * - Elite Tackles / O-Line Anchors: 0.75 - 1.25 pts
 * - Elite Lockdown Corners / Safeties: 0.75 - 1.0 pts
 * - Elite WR1s / Weapon Alpha: 0.75 - 1.25 pts
 * - Elite RBs (Usage Alpha): 0.5 - 0.75 pts
 */

export type PlayerPosType = 'QB' | 'EDGE' | 'OT' | 'CB' | 'WR' | 'DT' | 'S' | 'RB' | 'TE'

export type PlayerValueEntry = {
  name: string
  team: string
  pos: PlayerPosType
  pval: number // Point spread value (e.g. 5.5 for Mahomes)
  side: 'offense' | 'defense'
}

/**
 * Normalized player key lookup for fast name matching (strips suffixes, periods, punctuation).
 */
export function normalizePlayerNameKey(name: string): string {
  return String(name || '')
    .toLowerCase()
    .replace(/\b(jr|sr|ii|iii|iv|v)\b/gi, '')
    .replace(/[^a-z0-9]/g, '')
    .trim()
}

export const NFL_PLAYER_PVAL_REGISTRY: PlayerValueEntry[] = [
  // --- TIER 1 QBs (4.5 to 6.0 pts) ---
  { name: 'Patrick Mahomes', team: 'Kansas City Chiefs', pos: 'QB', pval: 6.0, side: 'offense' },
  { name: 'Josh Allen', team: 'Buffalo Bills', pos: 'QB', pval: 5.5, side: 'offense' },
  { name: 'Lamar Jackson', team: 'Baltimore Ravens', pos: 'QB', pval: 5.5, side: 'offense' },
  { name: 'Joe Burrow', team: 'Cincinnati Bengals', pos: 'QB', pval: 5.0, side: 'offense' },
  { name: 'C.J. Stroud', team: 'Houston Texans', pos: 'QB', pval: 4.5, side: 'offense' },

  // --- TIER 2 QBs (3.0 to 4.0 pts) ---
  { name: 'Brock Purdy', team: 'San Francisco 49ers', pos: 'QB', pval: 4.0, side: 'offense' },
  { name: 'Dak Prescott', team: 'Dallas Cowboys', pos: 'QB', pval: 4.0, side: 'offense' },
  { name: 'Jared Goff', team: 'Detroit Lions', pos: 'QB', pval: 3.5, side: 'offense' },
  { name: 'Justin Herbert', team: 'Los Angeles Chargers', pos: 'QB', pval: 4.0, side: 'offense' },
  { name: 'Jalen Hurts', team: 'Philadelphia Eagles', pos: 'QB', pval: 4.0, side: 'offense' },
  { name: 'Jordan Love', team: 'Green Bay Packers', pos: 'QB', pval: 3.5, side: 'offense' },
  { name: 'Matthew Stafford', team: 'Los Angeles Rams', pos: 'QB', pval: 3.5, side: 'offense' },
  { name: 'Kyler Murray', team: 'Arizona Cardinals', pos: 'QB', pval: 3.5, side: 'offense' },
  { name: 'Kirk Cousins', team: 'Atlanta Falcons', pos: 'QB', pval: 3.0, side: 'offense' },
  { name: 'Baker Mayfield', team: 'Tampa Bay Buccaneers', pos: 'QB', pval: 3.0, side: 'offense' },
  { name: 'Trevor Lawrence', team: 'Jacksonville Jaguars', pos: 'QB', pval: 3.0, side: 'offense' },
  { name: 'Aaron Rodgers', team: 'New York Jets', pos: 'QB', pval: 3.5, side: 'offense' },
  { name: 'Tua Tagovailoa', team: 'Miami Dolphins', pos: 'QB', pval: 3.5, side: 'offense' },
  { name: 'Jayden Daniels', team: 'Washington Commanders', pos: 'QB', pval: 3.0, side: 'offense' },
  { name: 'Caleb Williams', team: 'Chicago Bears', pos: 'QB', pval: 2.5, side: 'offense' },

  // --- TIER 3 / BRIDGE QBs (1.5 to 2.5 pts) ---
  { name: 'Geno Smith', team: 'Seattle Seahawks', pos: 'QB', pval: 2.5, side: 'offense' },
  { name: 'Sam Darnold', team: 'Minnesota Vikings', pos: 'QB', pval: 2.0, side: 'offense' },
  { name: 'Derek Carr', team: 'New Orleans Saints', pos: 'QB', pval: 2.0, side: 'offense' },
  { name: 'Will Levis', team: 'Tennessee Titans', pos: 'QB', pval: 1.5, side: 'offense' },
  { name: 'Bryce Young', team: 'Carolina Panthers', pos: 'QB', pval: 1.5, side: 'offense' },
  { name: 'Deshaun Watson', team: 'Cleveland Browns', pos: 'QB', pval: 1.5, side: 'offense' },
  { name: 'Russell Wilson', team: 'Pittsburgh Steelers', pos: 'QB', pval: 2.0, side: 'offense' },
  { name: 'Justin Fields', team: 'Pittsburgh Steelers', pos: 'QB', pval: 2.0, side: 'offense' },
  { name: 'Daniel Jones', team: 'New York Giants', pos: 'QB', pval: 1.5, side: 'offense' },
  { name: 'Gardner Minshew', team: 'Las Vegas Raiders', pos: 'QB', pval: 1.5, side: 'offense' },
  { name: 'Bo Nix', team: 'Denver Broncos', pos: 'QB', pval: 1.5, side: 'offense' },
  { name: 'Drake Maye', team: 'New England Patriots', pos: 'QB', pval: 1.5, side: 'offense' },
  { name: 'Jacoby Brissett', team: 'New England Patriots', pos: 'QB', pval: 1.5, side: 'offense' },

  // --- ELITE EDGE / PASS RUSHERS (1.0 to 1.5 pts) ---
  { name: 'Myles Garrett', team: 'Cleveland Browns', pos: 'EDGE', pval: 1.5, side: 'defense' },
  { name: 'T.J. Watt', team: 'Pittsburgh Steelers', pos: 'EDGE', pval: 1.5, side: 'defense' },
  { name: 'Micah Parsons', team: 'Dallas Cowboys', pos: 'EDGE', pval: 1.5, side: 'defense' },
  { name: 'Nick Bosa', team: 'San Francisco 49ers', pos: 'EDGE', pval: 1.25, side: 'defense' },
  { name: 'Maxx Crosby', team: 'Las Vegas Raiders', pos: 'EDGE', pval: 1.25, side: 'defense' },
  { name: 'Aidan Hutchinson', team: 'Detroit Lions', pos: 'EDGE', pval: 1.25, side: 'defense' },
  { name: 'Chris Jones', team: 'Kansas City Chiefs', pos: 'DT', pval: 1.25, side: 'defense' },
  { name: 'Dexter Lawrence', team: 'New York Giants', pos: 'DT', pval: 1.0, side: 'defense' },
  { name: 'Josh Allen', team: 'Jacksonville Jaguars', pos: 'EDGE', pval: 1.0, side: 'defense' }, // Josh Hines-Allen
  { name: 'Trey Hendrickson', team: 'Cincinnati Bengals', pos: 'EDGE', pval: 1.0, side: 'defense' },
  { name: 'Will Anderson', team: 'Houston Texans', pos: 'EDGE', pval: 1.0, side: 'defense' },
  { name: 'Danielle Hunter', team: 'Houston Texans', pos: 'EDGE', pval: 1.0, side: 'defense' },
  { name: 'Montez Sweat', team: 'Chicago Bears', pos: 'EDGE', pval: 0.75, side: 'defense' },
  { name: 'Brian Burns', team: 'New York Giants', pos: 'EDGE', pval: 0.75, side: 'defense' },

  // --- ELITE SECONDARY / CORNERS (0.75 to 1.0 pts) ---
  { name: 'Sauce Gardner', team: 'New York Jets', pos: 'CB', pval: 1.0, side: 'defense' },
  { name: 'Patrick Surtain', team: 'Denver Broncos', pos: 'CB', pval: 1.0, side: 'defense' },
  { name: 'Trent McDuffie', team: 'Kansas City Chiefs', pos: 'CB', pval: 0.75, side: 'defense' },
  { name: 'Jaylon Johnson', team: 'Chicago Bears', pos: 'CB', pval: 0.75, side: 'defense' },
  { name: 'Kyle Hamilton', team: 'Baltimore Ravens', pos: 'S', pval: 1.0, side: 'defense' },
  { name: 'Antoine Winfield', team: 'Tampa Bay Buccaneers', pos: 'S', pval: 0.75, side: 'defense' },
  { name: 'Minkah Fitzpatrick', team: 'Pittsburgh Steelers', pos: 'S', pval: 0.75, side: 'defense' },
  { name: 'Jalen Ramsey', team: 'Miami Dolphins', pos: 'CB', pval: 0.75, side: 'defense' },
  { name: 'Charvarius Ward', team: 'San Francisco 49ers', pos: 'CB', pval: 0.75, side: 'defense' },
  { name: 'DaRon Bland', team: 'Dallas Cowboys', pos: 'CB', pval: 0.75, side: 'defense' },
  { name: 'Trevon Diggs', team: 'Dallas Cowboys', pos: 'CB', pval: 0.75, side: 'defense' },
  { name: 'Marshon Lattimore', team: 'Washington Commanders', pos: 'CB', pval: 0.75, side: 'defense' },

  // --- ELITE OFFENSIVE TACKLES (0.75 to 1.25 pts) ---
  { name: 'Trent Williams', team: 'San Francisco 49ers', pos: 'OT', pval: 1.25, side: 'offense' },
  { name: 'Penei Sewell', team: 'Detroit Lions', pos: 'OT', pval: 1.0, side: 'offense' },
  { name: 'Tristan Wirfs', team: 'Tampa Bay Buccaneers', pos: 'OT', pval: 1.0, side: 'offense' },
  { name: 'Lane Johnson', team: 'Philadelphia Eagles', pos: 'OT', pval: 1.0, side: 'offense' },
  { name: 'Jordan Mailata', team: 'Philadelphia Eagles', pos: 'OT', pval: 0.75, side: 'offense' },
  { name: 'Christian Darrisaw', team: 'Minnesota Vikings', pos: 'OT', pval: 0.75, side: 'offense' },
  { name: 'Rashawn Slater', team: 'Los Angeles Chargers', pos: 'OT', pval: 0.75, side: 'offense' },
  { name: 'Laremy Tunsil', team: 'Houston Texans', pos: 'OT', pval: 0.75, side: 'offense' },

  // --- ELITE WIDE RECEIVERS & WEAPONS (0.75 to 1.25 pts) ---
  { name: 'Justin Jefferson', team: 'Minnesota Vikings', pos: 'WR', pval: 1.25, side: 'offense' },
  { name: 'JaMarr Chase', team: 'Cincinnati Bengals', pos: 'WR', pval: 1.25, side: 'offense' },
  { name: 'CeeDee Lamb', team: 'Dallas Cowboys', pos: 'WR', pval: 1.25, side: 'offense' },
  { name: 'Tyreek Hill', team: 'Miami Dolphins', pos: 'WR', pval: 1.25, side: 'offense' },
  { name: 'Amon-Ra St. Brown', team: 'Detroit Lions', pos: 'WR', pval: 1.0, side: 'offense' },
  { name: 'A.J. Brown', team: 'Philadelphia Eagles', pos: 'WR', pval: 1.0, side: 'offense' },
  { name: 'Nico Collins', team: 'Houston Texans', pos: 'WR', pval: 1.0, side: 'offense' },
  { name: 'Malik Nabers', team: 'New York Giants', pos: 'WR', pval: 1.0, side: 'offense' },
  { name: 'Marvin Harrison', team: 'Arizona Cardinals', pos: 'WR', pval: 0.75, side: 'offense' },
  { name: 'Davante Adams', team: 'New York Jets', pos: 'WR', pval: 0.75, side: 'offense' },
  { name: 'Garrett Wilson', team: 'New York Jets', pos: 'WR', pval: 0.75, side: 'offense' },
  { name: 'Deebo Samuel', team: 'San Francisco 49ers', pos: 'WR', pval: 0.75, side: 'offense' },
  { name: 'Brandon Aiyuk', team: 'San Francisco 49ers', pos: 'WR', pval: 0.75, side: 'offense' },
  { name: 'Cooper Kupp', team: 'Los Angeles Rams', pos: 'WR', pval: 0.75, side: 'offense' },
  { name: 'Puka Nacua', team: 'Los Angeles Rams', pos: 'WR', pval: 0.75, side: 'offense' },
  { name: 'George Kittle', team: 'San Francisco 49ers', pos: 'TE', pval: 0.75, side: 'offense' },
  { name: 'Travis Kelce', team: 'Kansas City Chiefs', pos: 'TE', pval: 0.75, side: 'offense' },
  { name: 'Sam LaPorta', team: 'Detroit Lions', pos: 'TE', pval: 0.75, side: 'offense' },
  { name: 'Trey McBride', team: 'Arizona Cardinals', pos: 'TE', pval: 0.75, side: 'offense' },

  // --- RUNNING BACKS (0.5 to 0.75 pts) ---
  { name: 'Christian McCaffrey', team: 'San Francisco 49ers', pos: 'RB', pval: 0.75, side: 'offense' },
  { name: 'Derrick Henry', team: 'Baltimore Ravens', pos: 'RB', pval: 0.75, side: 'offense' },
  { name: 'Saquon Barkley', team: 'Philadelphia Eagles', pos: 'RB', pval: 0.75, side: 'offense' },
  { name: 'Bijan Robinson', team: 'Atlanta Falcons', pos: 'RB', pval: 0.5, side: 'offense' },
  { name: 'Breece Hall', team: 'New York Jets', pos: 'RB', pval: 0.5, side: 'offense' },
  { name: 'Jahmyr Gibbs', team: 'Detroit Lions', pos: 'RB', pval: 0.5, side: 'offense' },
  { name: 'Jonathan Taylor', team: 'Indianapolis Colts', pos: 'RB', pval: 0.5, side: 'offense' },
  { name: 'Kyren Williams', team: 'Los Angeles Rams', pos: 'RB', pval: 0.5, side: 'offense' },
  { name: 'Josh Jacobs', team: 'Green Bay Packers', pos: 'RB', pval: 0.5, side: 'offense' },
]

/** Map for O(1) player lookup by normalized name */
const PLAYER_MAP = new Map<string, PlayerValueEntry>()
for (const p of NFL_PLAYER_PVAL_REGISTRY) {
  PLAYER_MAP.set(normalizePlayerNameKey(p.name), p)
}

import type { SupabaseClient } from 'npm:@supabase/supabase-js@2'

/**
 * Resolve a player's Point Spread Value (PVAL) by name.
 * Checks dynamic DB overrides map first, falling back to static registry.
 * Returns the PlayerValueEntry if found, or null if unknown / replacement level (0.0).
 */
export function lookupPlayerPval(
  name: string,
  dynamicDbMap?: Map<string, PlayerValueEntry> | null,
): PlayerValueEntry | null {
  const key = normalizePlayerNameKey(name)
  if (!key) return null

  // 1. Check dynamic DB overrides map first if provided
  if (dynamicDbMap) {
    const fromDb = dynamicDbMap.get(key)
    if (fromDb) return fromDb

    for (const [k, entry] of dynamicDbMap) {
      if (key.includes(k) || k.includes(key)) {
        return entry
      }
    }
  }

  // 2. Exact normalized key match in static registry
  const direct = PLAYER_MAP.get(key)
  if (direct) return direct

  // 3. Substring match for compound / hyphenated names
  for (const [k, entry] of PLAYER_MAP) {
    if (key.includes(k) || k.includes(key)) {
      return entry
    }
  }

  return null
}

/**
 * Load all custom and active PVAL values from the public.nfl_player_pvals DB table.
 * Paginates past PostgREST's default 1000-row cap.
 */
export async function loadDbPlayerPvalMap(
  admin: SupabaseClient,
): Promise<Map<string, PlayerValueEntry>> {
  const map = new Map<string, PlayerValueEntry>()
  const page = 1000

  for (let from = 0; ; from += page) {
    const { data, error } = await admin
      .from('nfl_player_pvals')
      .select('player_name, normalized_name, team_name, position, side, pval')
      .range(from, from + page - 1)

    if (error || !data) break

    for (const row of data) {
      map.set(row.normalized_name, {
        name: row.player_name,
        team: row.team_name,
        pos: row.position as PlayerPosType,
        pval: Number(row.pval) || 0,
        side: row.side as 'offense' | 'defense',
      })
    }

    if (data.length < page) break
  }

  return map
}

function normalizeTeamLoose(value: string): string {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
}

function teamsMatchLoose(a: string, b: string): boolean {
  const na = normalizeTeamLoose(a)
  const nb = normalizeTeamLoose(b)
  if (!na || !nb) return false
  return na === nb || na.includes(nb) || nb.includes(na)
}

/**
 * QB roster candidates for replacement-delta (DB map + static registry).
 */
export function listTeamQbRoster(
  teamName: string,
  dynamicDbMap?: Map<string, PlayerValueEntry> | null,
): Array<{ name: string; team: string; pval: number }> {
  const byKey = new Map<string, { name: string; team: string; pval: number }>()

  const consider = (entry: PlayerValueEntry) => {
    if (entry.pos !== 'QB') return
    if (!teamsMatchLoose(entry.team, teamName)) return
    const key = normalizePlayerNameKey(entry.name)
    if (!key) return
    const prev = byKey.get(key)
    // Prefer DB / higher specificity already in map order; keep max pval if dup.
    if (!prev || entry.pval > prev.pval) {
      byKey.set(key, { name: entry.name, team: entry.team, pval: entry.pval })
    }
  }

  for (const entry of NFL_PLAYER_PVAL_REGISTRY) consider(entry)
  if (dynamicDbMap) {
    for (const entry of dynamicDbMap.values()) consider(entry)
  }

  return [...byKey.values()].sort((a, b) => b.pval - a.pval)
}
