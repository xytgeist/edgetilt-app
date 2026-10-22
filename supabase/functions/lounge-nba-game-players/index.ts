/**
 * Logged-in Lounge NBA game hub: Players + Fantasy rosters for one game.
 *
 * User JWT: { event_id, away_abbrev, home_abbrev }
 * Returns { ok, season, week, players: [...] } … every active Sleeper player on either team with the week's
 * per-game projection line (`proj_line`, Sleeper stat keys), season per-game averages (`season_line`), ESPN id
 * (live box match + headshot), and side. The client scores both with the viewer's NBA league rules.
 */
import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2'
import { userIdFromJwt } from '../_shared/userJwt.ts'
import { sharedCached } from '../_shared/edgeSharedCache.ts'
import { loadNbaBoard, nbaTeam } from '../_shared/fantasyNbaBoard.ts'
import { lookupNbaEspnId, nbaEspnIds } from '../_shared/nbaEspnIds.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}
const SLEEPER = 'https://api.sleeper.app/v1'
/** Season stat keys the Players / Fantasy tabs show or score. */
const SEASON_KEYS = ['pts', 'reb', 'ast', 'stl', 'blk', 'to', 'tpm', 'fgm', 'fga', 'ftm', 'fta', 'oreb', 'dreb', 'dd', 'td']

type NbaPlayer = {
  sleeper_id: string
  name: string
  position: string
  fantasy_positions: string[]
  team: string
  injury_status: string | null
  search_rank: number | null
}

function json(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
}

async function getJson(url: string): Promise<unknown> {
  const res = await fetch(url, { headers: { Accept: 'application/json', 'User-Agent': 'EdgeTilt/1.0' } })
  if (!res.ok) throw new Error(`${res.status} ${url}`)
  return await res.json()
}

/** Sleeper's full NBA player map, trimmed to active players on a team (one shared row, refreshed twice a day). */
function sleeperNbaPlayers(admin: SupabaseClient): Promise<NbaPlayer[]> {
  return sharedCached(
    'sleeper:nba-players:v2',
    { ttlMs: 12 * 60 * 60 * 1000, staleMaxMs: 3 * 24 * 60 * 60 * 1000, leaseMs: 60_000, admin, shouldStore: (v) => v.length > 300 },
    async () => {
      const raw = (await getJson(`${SLEEPER}/players/nba`)) as Record<string, Record<string, unknown>>
      const out: NbaPlayer[] = []
      for (const [id, p] of Object.entries(raw || {})) {
        const team = nbaTeam(String(p?.team || ''))
        if (!team || p?.active === false) continue
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

/** Season per-game averages for players with games played (Sleeper season totals / gp). */
function seasonLines(admin: SupabaseClient, season: string): Promise<Record<string, { gp: number; line: Record<string, number> }>> {
  return sharedCached(
    `sleeper:nba-season-avg:${season}`,
    { ttlMs: 6 * 60 * 60 * 1000, staleMaxMs: 48 * 60 * 60 * 1000, leaseMs: 60_000, admin, shouldStore: (v) => Object.keys(v).length > 0 },
    async () => {
      const raw = (await getJson(`${SLEEPER}/stats/nba/regular/${season}`)) as Record<string, Record<string, unknown>>
      const out: Record<string, { gp: number; line: Record<string, number> }> = {}
      for (const [id, s] of Object.entries(raw || {})) {
        const gp = Number(s?.gp)
        if (!(gp > 0)) continue
        const line: Record<string, number> = {}
        for (const key of SEASON_KEYS) {
          const n = Number(s?.[key])
          if (Number.isFinite(n) && n !== 0) line[key] = Math.round((n / gp) * 100) / 100
        }
        out[id] = { gp, line }
      }
      return out
    },
  ).catch(() => ({}))
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json(405, { error: 'Method not allowed' })
  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!supabaseUrl || !serviceKey) return json(500, { error: 'Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY' })
  const authHeader = req.headers.get('Authorization') || ''
  if (!authHeader.toLowerCase().startsWith('bearer ')) return json(401, { error: 'Missing Authorization bearer token.' })
  const admin = createClient(supabaseUrl, serviceKey)
  const userId = await userIdFromJwt(authHeader.replace(/^Bearer\s+/i, '').trim(), admin)
  if (!userId) return json(401, { error: 'Invalid or expired session.' })

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>
  const away = nbaTeam(String(body?.away_abbrev || ''))
  const home = nbaTeam(String(body?.home_abbrev || ''))
  if (!away || !home) return json(400, { error: 'away_abbrev and home_abbrev are required.' })

  try {
    const [all, board, espnIds] = await Promise.all([
      sleeperNbaPlayers(admin),
      loadNbaBoard(),
      nbaEspnIds(admin).catch(() => new Map<string, string>()),
    ])
    const season = board?.season || ''
    const averages = season ? await seasonLines(admin, season) : {}
    const roster = all.filter((p) => p.team === away || p.team === home)
    const espnBy = new Map(roster.map((p) => [p.sleeper_id, lookupNbaEspnId(espnIds, p.name, p.team)]))
    const shots = new Map<string, string>()
    const espnList = [...new Set([...espnBy.values()].filter(Boolean))]
    if (espnList.length) {
      const { data } = await admin
        .from('player_headshots')
        .select('espn_id, full_url')
        .eq('league', 'nba')
        .eq('status', 'ok')
        .in('espn_id', espnList)
      for (const r of data || []) if (r?.full_url) shots.set(String(r.espn_id), String(r.full_url))
    }
    const players = roster
      .map((p) => {
        const espnId = espnBy.get(p.sleeper_id) || ''
        const avg = averages[p.sleeper_id]
        return {
          ...p,
          side: p.team === home ? 'home' : 'away',
          espn_id: espnId || null,
          headshot_url: espnId ? shots.get(espnId) || `https://a.espncdn.com/i/headshots/nba/players/full/${espnId}.png` : null,
          proj_line: board?.projLine?.[p.sleeper_id] || null,
          season_line: avg?.line || null,
          season_gp: avg?.gp || 0,
        }
      })
      // Players with no projection, no season games, and no ranking are two-way / inactive depth.
      .filter((p) => p.proj_line || p.season_gp > 0 || p.search_rank != null)
      // Biggest roles first: projected points, else season average, then Sleeper rank.
      .sort((a, b) => {
        const pa = Number(a.proj_line?.pts ?? a.season_line?.pts ?? -1)
        const pb = Number(b.proj_line?.pts ?? b.season_line?.pts ?? -1)
        if (pb !== pa) return pb - pa
        return (a.search_rank ?? 99999) - (b.search_rank ?? 99999)
      })
    return json(200, { ok: true, season, week: board?.week ?? null, players })
  } catch (err) {
    return json(502, { error: err instanceof Error ? err.message : 'NBA roster request failed.' })
  }
})
