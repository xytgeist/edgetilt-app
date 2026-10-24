/**
 * Server-side league detail for fantasy jobs (weekly digest, daily lineup check): teams, each team's latest synced
 * roster week, and injury tags (NFL: nfl_players + ESPN designations; NBA: Sleeper NBA map + ESPN injury report).
 */
import { type SupabaseClient } from 'npm:@supabase/supabase-js@2'
import { sleeperNbaPlayers } from './sleeperNbaPlayers.ts'

// deno-lint-ignore no-explicit-any
type Obj = Record<string, any>
type Sport = 'nfl' | 'nba'
const str = (v: unknown) => String(v ?? '').trim()
const FRESH_STATUS_LABEL: Record<string, string | null> = { active: null, questionable: 'Questionable', doubtful: 'Doubtful', out: 'Out', ir: 'IR' }

export async function leagueDetail(admin: SupabaseClient, league: Obj, sport: Sport) {
  const { data: teams } = await admin
    .from('fantasy_teams')
    .select('id, owner_name, team_name, is_mine, wins, losses, ties, points_for, points_against')
    .eq('league_id', league.id)
  const teamIds = (teams || []).map((t) => t.id)
  if (!teamIds.length) return null
  const { data: rows } = await admin
    .from('fantasy_rosters')
    .select('team_id, week, sleeper_id, player_name, position, nfl_team, slot, slot_label')
    .in('team_id', teamIds)
  const latest = new Map<string, number>()
  for (const r of rows || []) latest.set(r.team_id, Math.max(latest.get(r.team_id) || 0, Number(r.week) || 0))
  const current = (rows || []).filter((r) => (Number(r.week) || 0) === latest.get(r.team_id))
  const ids = [...new Set(current.map((r) => r.sleeper_id).filter(Boolean))]
  const injury: Record<string, string | null> = {}
  // Sleeper NBA ids collide with NFL ones, so NBA reads the NBA player map and the NBA status watcher.
  if (sport === 'nba') {
    const [players, { data: fresh }] = await Promise.all([
      sleeperNbaPlayers(admin).catch(() => []),
      admin.from('nba_player_status').select('sleeper_id, status').in('sleeper_id', ids.slice(0, 500)),
    ])
    const want = new Set(ids)
    // Sleeper's GTD / DTD reads as questionable (the NBA watcher maps them the same way).
    for (const p of players) if (want.has(p.sleeper_id)) injury[p.sleeper_id] = /^(gtd|dtd)/i.test(str(p.injury_status)) ? 'Questionable' : p.injury_status || null
    for (const s of fresh || []) if (s.sleeper_id) injury[s.sleeper_id] = FRESH_STATUS_LABEL[s.status] ?? null
  }
  for (let i = 0; sport === 'nfl' && i < ids.length; i += 200) {
    const chunk = ids.slice(i, i + 200)
    const [{ data: players }, { data: fresh }] = await Promise.all([
      admin.from('nfl_players').select('sleeper_id, injury_status').in('sleeper_id', chunk),
      admin.from('nfl_player_status').select('sleeper_id, status').in('sleeper_id', chunk),
    ])
    for (const p of players || []) injury[p.sleeper_id] = p.injury_status || null
    for (const s of fresh || []) if (s.sleeper_id) injury[s.sleeper_id] = FRESH_STATUS_LABEL[s.status] ?? null
  }
  const rostersByTeam: Record<string, Obj[]> = {}
  for (const r of current) {
    ;(rostersByTeam[r.team_id] ||= []).push({ ...r, injury_status: r.sleeper_id ? injury[r.sleeper_id] ?? null : null })
  }
  return { league, teams: teams || [], rostersByTeam }
}
