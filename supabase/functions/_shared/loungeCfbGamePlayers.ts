/**
 * CFB game hub Players tab … roster from public.cfb_players (no Fantasy/Sleeper).
 */
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2'

export type CfbGamePlayer = {
  sleeper_id: string
  espn_id: string | null
  name: string
  position: string | null
  team: string
  side: 'home' | 'away'
  headshot_url: string | null
  search_rank: number | null
  depth_chart_order: number | null
  depth_chart_position: string | null
  is_starter: boolean
  projected_ppr: number | null
  game_ppr: number | null
  injury_status: string | null
  jersey: string | null
}

export type CfbGamePlayersPayload = {
  event_id: string
  away_abbrev: string
  home_abbrev: string
  players: CfbGamePlayer[]
  props: []
  season: null
  week: null
  sources: string[]
}

function canonAbbrev(value: unknown): string {
  return String(value || '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9-]/g, '')
}

const SKILL = new Set(['QB', 'RB', 'FB', 'HB', 'WR', 'TE', 'ATH'])

function positionSortKey(pos: string | null): number {
  const p = String(pos || '')
    .toUpperCase()
    .replace(/[^A-Z]/g, '')
  const order: Record<string, number> = {
    QB: 0,
    RB: 1,
    FB: 1,
    HB: 1,
    WR: 2,
    TE: 3,
    OL: 10,
    OT: 10,
    OG: 10,
    C: 10,
    DL: 20,
    DE: 20,
    DT: 20,
    NT: 20,
    LB: 30,
    ILB: 30,
    OLB: 30,
    DB: 40,
    CB: 40,
    S: 40,
    SAF: 40,
    K: 50,
    PK: 50,
    P: 51,
    LS: 52,
  }
  return order[p] ?? 60
}

type DbRow = {
  espn_id: string
  full_name: string
  position: string | null
  jersey: string | null
  team_abbrev: string | null
  headshot_url: string | null
  status: string | null
}

function mapRow(row: DbRow, side: 'home' | 'away', team: string): CfbGamePlayer {
  const espnId = String(row.espn_id || '').trim()
  const pos = row.position ? String(row.position).trim().toUpperCase() : null
  return {
    sleeper_id: `cfb:${espnId}`,
    espn_id: espnId || null,
    name: String(row.full_name || '').trim(),
    position: pos,
    team,
    side,
    headshot_url: row.headshot_url ? String(row.headshot_url) : null,
    search_rank: SKILL.has(String(pos || '')) ? 100 : 500,
    depth_chart_order: null,
    depth_chart_position: pos,
    is_starter: false,
    projected_ppr: null,
    game_ppr: null,
    injury_status: row.status ? String(row.status) : null,
    jersey: row.jersey != null ? String(row.jersey) : null,
  }
}

export async function buildCfbGamePlayers(
  admin: SupabaseClient,
  opts: { eventId: string; awayAbbrev: string; homeAbbrev: string },
): Promise<CfbGamePlayersPayload> {
  const eventId = String(opts.eventId || '').trim()
  const away = canonAbbrev(opts.awayAbbrev)
  const home = canonAbbrev(opts.homeAbbrev)
  if (!eventId || !away || !home) {
    throw new Error('event_id, away_abbrev, and home_abbrev are required.')
  }

  const { data, error } = await admin
    .from('cfb_players')
    .select('espn_id, full_name, position, jersey, team_abbrev, headshot_url, status')
    .in('team_abbrev', [away, home])

  if (error) throw new Error(error.message)

  const players: CfbGamePlayer[] = []
  for (const row of (data || []) as DbRow[]) {
    const team = canonAbbrev(row.team_abbrev)
    if (team !== away && team !== home) continue
    const side: 'home' | 'away' = team === home ? 'home' : 'away'
    const mapped = mapRow(row, side, team)
    if (!mapped.name) continue
    players.push(mapped)
  }

  players.sort((a, b) => {
    const d = positionSortKey(a.position) - positionSortKey(b.position)
    if (d) return d
    const ja = Number(a.jersey)
    const jb = Number(b.jersey)
    if (Number.isFinite(ja) && Number.isFinite(jb) && ja !== jb) return ja - jb
    return a.name.localeCompare(b.name)
  })

  return {
    event_id: eventId,
    away_abbrev: away,
    home_abbrev: home,
    players,
    props: [],
    season: null,
    week: null,
    sources: ['cfb_players'],
  }
}
