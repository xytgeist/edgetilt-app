/**
 * Fantasy Connect client … Sleeper + Yahoo link/sync + RLS reads.
 */

export async function linkSleeperUsername(supabase, username) {
  const { data, error } = await supabase.functions.invoke('fantasy-sleeper-link', {
    body: { username: String(username || '').trim().replace(/^@/, '') },
  })
  if (error) throw new Error(error.message || 'Link failed.')
  if (data?.error) throw new Error(String(data.error))
  return data
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {{ returnMode?: 'native' | 'web' }} [opts]
 */
export async function startYahooOAuth(supabase, opts = {}) {
  const returnMode = opts.returnMode === 'native' ? 'native' : 'web'
  const { data, error } = await supabase.functions.invoke('fantasy-yahoo-oauth-start', {
    body: { returnMode },
  })
  if (error) throw new Error(error.message || 'Could not start Yahoo connect.')
  if (data?.error) throw new Error(String(data.error))
  const url = String(data?.url || '').trim()
  if (!url) throw new Error('Yahoo authorize URL missing.')
  return url
}

export async function syncSleeperFantasy(supabase, body = {}) {
  const { data, error } = await supabase.functions.invoke('fantasy-sleeper-sync', {
    body: body && typeof body === 'object' ? body : {},
  })
  if (error) throw new Error(error.message || 'Sync failed.')
  if (data?.error) throw new Error(String(data.error))
  return data
}

export async function syncYahooFantasy(supabase, body = {}) {
  const { data, error } = await supabase.functions.invoke('fantasy-yahoo-sync', {
    body: body && typeof body === 'object' ? body : {},
  })
  if (error) throw new Error(error.message || 'Yahoo sync failed.')
  if (data?.error) throw new Error(String(data.error))
  return data
}

/** Sync every active provider the user has linked. */
export async function syncAllFantasy(supabase, connections = []) {
  const list = Array.isArray(connections) ? connections : []
  const has = (p) => list.some((c) => c.provider === p && c.status !== 'revoked')
  const out = { sleeper: null, yahoo: null }
  const errors = []
  if (has('sleeper') || !list.length) {
    try {
      if (has('sleeper')) out.sleeper = await syncSleeperFantasy(supabase)
    } catch (e) {
      errors.push(e?.message || 'Sleeper sync failed.')
    }
  }
  if (has('yahoo')) {
    try {
      out.yahoo = await syncYahooFantasy(supabase)
    } catch (e) {
      errors.push(e?.message || 'Yahoo sync failed.')
    }
  }
  if (errors.length && !out.sleeper && !out.yahoo) {
    throw new Error(errors.join(' '))
  }
  return { ...out, warnings: errors }
}

export async function fetchHubFantasyPins(supabase) {
  return syncSleeperFantasy(supabase, { hub_pins: true })
}

/** Mark one league primary across all providers (hub pins). */
export async function setPrimaryFantasyLeague(supabase, leagueId) {
  const id = String(leagueId || '').trim()
  if (!id) throw new Error('league id required.')

  const { data: league, error: lgErr } = await supabase
    .from('fantasy_leagues')
    .select('id, connection_id')
    .eq('id', id)
    .maybeSingle()
  if (lgErr) throw new Error(lgErr.message)
  if (!league?.id) throw new Error('League not found.')

  const { error: clearErr } = await supabase
    .from('fantasy_leagues')
    .update({ is_primary: false })
    .eq('is_primary', true)
  if (clearErr) throw new Error(clearErr.message)

  const { error: setErr } = await supabase
    .from('fantasy_leagues')
    .update({ is_primary: true })
    .eq('id', id)
  if (setErr) throw new Error(setErr.message)

  const { error: connErr } = await supabase
    .from('fantasy_connections')
    .update({ primary_league_id: id })
    .eq('id', league.connection_id)
  if (connErr) throw new Error(connErr.message)

  return { ok: true, leagueId: id }
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
