/**
 * Fantasy Connect client … Sleeper link/sync + RLS reads.
 */

export async function linkSleeperUsername(supabase, username) {
  const { data, error } = await supabase.functions.invoke('fantasy-sleeper-link', {
    body: { username: String(username || '').trim().replace(/^@/, '') },
  })
  if (error) throw new Error(error.message || 'Link failed.')
  if (data?.error) throw new Error(String(data.error))
  return data
}

export async function syncSleeperFantasy(supabase, body = {}) {
  const { data, error } = await supabase.functions.invoke('fantasy-sleeper-sync', {
    body: body && typeof body === 'object' ? body : {},
  })
  if (error) throw new Error(error.message || 'Sync failed.')
  if (data?.error) throw new Error(String(data.error))
  return data
}

export async function fetchHubFantasyPins(supabase) {
  return syncSleeperFantasy(supabase, { hub_pins: true })
}

export async function setPrimaryFantasyLeague(supabase, leagueId) {
  return syncSleeperFantasy(supabase, { primary_league_id: leagueId })
}

export async function loadFantasySnapshot(supabase) {
  const { data: connections, error: cErr } = await supabase
    .from('fantasy_connections')
    .select('id, provider, external_username, status, last_sync_at, last_error, primary_league_id')
    .order('created_at', { ascending: true })
  if (cErr) throw new Error(cErr.message)

  const { data: leagues, error: lErr } = await supabase
    .from('fantasy_leagues')
    .select('id, connection_id, name, season, is_primary, provider, external_league_id')
    .order('name', { ascending: true })
  if (lErr) throw new Error(lErr.message)

  return {
    connections: connections || [],
    leagues: leagues || [],
  }
}

export async function loadLeagueDetail(supabase, leagueId) {
  const id = String(leagueId || '').trim()
  if (!id) return null

  const { data: league, error: lgErr } = await supabase
    .from('fantasy_leagues')
    .select('id, name, season, is_primary, provider, connection_id')
    .eq('id', id)
    .maybeSingle()
  if (lgErr) throw new Error(lgErr.message)
  if (!league) return null

  const { data: teams, error: tErr } = await supabase
    .from('fantasy_teams')
    .select(
      'id, owner_name, team_name, is_mine, wins, losses, ties, points_for, points_against, avatar_url',
    )
    .eq('league_id', id)
    .order('wins', { ascending: false })
  if (tErr) throw new Error(tErr.message)

  const { data: matchup } = await supabase
    .from('fantasy_matchups')
    .select('id, week, mine_team_id, opp_team_id, mine_score, opp_score')
    .eq('league_id', id)
    .order('week', { ascending: false })
    .limit(1)
    .maybeSingle()

  const week = matchup?.week ?? null
  let mineRoster = []
  let oppRoster = []
  if (week && matchup?.mine_team_id) {
    const { data: mine } = await supabase
      .from('fantasy_rosters')
      .select('sleeper_id, player_name, position, nfl_team, slot')
      .eq('team_id', matchup.mine_team_id)
      .eq('week', week)
      .order('slot', { ascending: true })
    mineRoster = mine || []
  }
  if (week && matchup?.opp_team_id) {
    const { data: opp } = await supabase
      .from('fantasy_rosters')
      .select('sleeper_id, player_name, position, nfl_team, slot')
      .eq('team_id', matchup.opp_team_id)
      .eq('week', week)
      .order('slot', { ascending: true })
    oppRoster = opp || []
  }

  return {
    league,
    teams: teams || [],
    matchup: matchup || null,
    mineRoster,
    oppRoster,
  }
}
