/**
 * Sleeper NBA player map (active players on a team) + ESPN headshots … shared by the NBA game hub roster and
 * NBA waivers / sniper so both read one cached copy.
 */
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2'
import { sharedCached } from './edgeSharedCache.ts'
import { nbaTeam } from './fantasyNbaBoard.ts'
import { lookupNbaEspnId, nbaEspnIds } from './nbaEspnIds.ts'

const SLEEPER = 'https://api.sleeper.app/v1'

export type NbaPlayer = {
  sleeper_id: string
  name: string
  position: string
  fantasy_positions: string[]
  team: string
  injury_status: string | null
  search_rank: number | null
}

async function getJson(url: string): Promise<unknown> {
  const res = await fetch(url, { headers: { Accept: 'application/json', 'User-Agent': 'EdgeTilt/1.0' } })
  if (!res.ok) throw new Error(`${res.status} ${url}`)
  return await res.json()
}

/** Active players on a team (one shared row, refreshed twice a day). */
export function sleeperNbaPlayers(admin: SupabaseClient): Promise<NbaPlayer[]> {
  return sharedCached(
    'sleeper:nba-players:v3',
    { ttlMs: 12 * 60 * 60 * 1000, staleMaxMs: 3 * 24 * 60 * 60 * 1000, leaseMs: 60_000, admin, shouldStore: (v) => v.length > 300 },
    async () => {
      const raw = (await getJson(`${SLEEPER}/players/nba`)) as Record<string, Record<string, unknown>>
      const out: NbaPlayer[] = []
      for (const [id, p] of Object.entries(raw || {})) {
        const team = nbaTeam(String(p?.team || ''))
        // Sleeper keeps football-style team "DEF" rows in the NBA map ("Golden State Warriors"); none are players.
        if (!team || p?.active === false || String(p?.position || '').toUpperCase() === 'DEF') continue
        const name = String(p?.full_name || `${p?.first_name || ''} ${p?.last_name || ''}`).trim()
        if (!name) continue
        out.push({
          sleeper_id: String(p?.player_id || id),
          name,
          position: String(p?.position || ''),
          fantasy_positions: Array.isArray(p?.fantasy_positions) ? (p.fantasy_positions as unknown[]).map(String) : [],
          team,
          injury_status: p?.injury_status ? String(p.injury_status) : null,
          // Sleeper parks unranked players at 0 (or a huge sentinel); keep only a real rank.
          search_rank: Number(p?.search_rank) > 0 && Number(p?.search_rank) < 100_000 ? Number(p.search_rank) : null,
        })
      }
      return out
    },
  )
}

/** sleeper_id → { espn_id, headshot_url } (R2 copy when mirrored, else ESPN's CDN). */
export async function nbaHeadshots(
  admin: SupabaseClient,
  players: Array<{ sleeper_id: string; name: string; team: string }>,
): Promise<Map<string, { espn_id: string; headshot_url: string }>> {
  const ids = await nbaEspnIds(admin).catch(() => new Map<string, string>())
  const espnBy = new Map<string, string>()
  for (const p of players) {
    const espnId = lookupNbaEspnId(ids, p.name, p.team)
    if (espnId) espnBy.set(p.sleeper_id, espnId)
  }
  const stored = new Map<string, string>()
  const list = [...new Set(espnBy.values())]
  for (let i = 0; i < list.length; i += 200) {
    const { data } = await admin
      .from('player_headshots')
      .select('espn_id, full_url')
      .eq('league', 'nba')
      .eq('status', 'ok')
      .in('espn_id', list.slice(i, i + 200))
    for (const r of data || []) if (r?.full_url) stored.set(String(r.espn_id), String(r.full_url))
  }
  const out = new Map<string, { espn_id: string; headshot_url: string }>()
  for (const [sid, espnId] of espnBy) {
    out.set(sid, { espn_id: espnId, headshot_url: stored.get(espnId) || `https://a.espncdn.com/i/headshots/nba/players/full/${espnId}.png` })
  }
  return out
}
