/**
 * Fantasy Connect client … Sleeper + Yahoo link/sync + RLS reads.
 */

/** supabase-js hides the JSON `{ error }` behind "non-2xx status code". */
async function messageFromEdgeError(error, fallback) {
  const base = String(error?.message || fallback).trim()
  const ctx = error?.context
  if (!ctx || typeof ctx.text !== 'function') return base || fallback
  try {
    const text = await ctx.clone().text()
    if (!text) return base || fallback
    try {
      const json = JSON.parse(text)
      const fromError = json?.error != null ? String(json.error).trim() : ''
      if (fromError) return fromError
    } catch {
      return text.slice(0, 400) || base || fallback
    }
  } catch {
    /* ignore */
  }
  return base || fallback
}

async function finishEdge(data, error, fallback) {
  if (error) throw new Error(await messageFromEdgeError(error, fallback))
  if (data?.error) throw new Error(String(data.error))
  return data
}

export async function linkSleeperUsername(supabase, username) {
  const { data, error } = await supabase.functions.invoke('fantasy-sleeper-link', {
    body: { username: String(username || '').trim().replace(/^@/, '') },
  })
  return finishEdge(data, error, 'Link failed.')
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
  await finishEdge(data, error, 'Could not start Yahoo connect.')
  const url = String(data?.url || '').trim()
  if (!url) throw new Error('Yahoo authorize URL missing.')
  return url
}

export async function syncSleeperFantasy(supabase, body = {}) {
  const { data, error } = await supabase.functions.invoke('fantasy-sleeper-sync', {
    body: body && typeof body === 'object' ? body : {},
  })
  return finishEdge(data, error, 'Sync failed.')
}

export async function linkCbsSession(supabase, session) {
  const ids = Array.isArray(session?.league_ids) ? session.league_ids : []
  const { data, error } = await supabase.functions.invoke('fantasy-cbs-link', {
    body: {
      access_token: String(session?.access_token || '').trim(),
      league_ids: ids.map((id) => String(id || '').trim()).filter(Boolean),
    },
  })
  return finishEdge(data, error, 'CBS link failed.')
}

export async function syncCbsFantasy(supabase) {
  const { data, error } = await supabase.functions.invoke('fantasy-cbs-sync', { body: {} })
  return finishEdge(data, error, 'CBS sync failed.')
}

export async function linkEspnSession(supabase, session) {
  const { data, error } = await supabase.functions.invoke('fantasy-espn-link', {
    body: {
      espn_s2: String(session?.espn_s2 || '').trim(),
      swid: String(session?.swid || '').trim(),
    },
  })
  return finishEdge(data, error, 'ESPN link failed.')
}

export async function syncEspnFantasy(supabase) {
  const { data, error } = await supabase.functions.invoke('fantasy-espn-sync', { body: {} })
  return finishEdge(data, error, 'ESPN sync failed.')
}

export async function syncYahooFantasy(supabase, body = {}) {
  const { data, error } = await supabase.functions.invoke('fantasy-yahoo-sync', {
    body: body && typeof body === 'object' ? body : {},
  })
  return finishEdge(data, error, 'Yahoo sync failed.')
}

/** Sync every active provider the user has linked. */
export async function syncAllFantasy(supabase, connections = []) {
  const list = Array.isArray(connections) ? connections : []
  const has = (p) => list.some((c) => c.provider === p && c.status !== 'revoked')
  const out = { sleeper: null, yahoo: null, espn: null, cbs: null }
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
  if (has('espn')) {
    try {
      out.espn = await syncEspnFantasy(supabase)
    } catch (e) {
      errors.push(e?.message || 'ESPN sync failed.')
    }
  }
  if (has('cbs')) {
    try {
      out.cbs = await syncCbsFantasy(supabase)
    } catch (e) {
      errors.push(e?.message || 'CBS sync failed.')
    }
  }
  if (errors.length && !out.sleeper && !out.yahoo && !out.espn && !out.cbs) {
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
    .select('id, connection_id, name, season, is_primary, provider, sport, external_league_id, scoring')
    .order('name', { ascending: true })
  if (lErr) throw new Error(lErr.message)

  return {
    connections: connections || [],
    leagues: leagues || [],
  }
}

export async function loadLineupCards(supabase, players, sport = 'nfl') {
  const list = (Array.isArray(players) ? players : [])
    .map((p) => ({
      sleeper_id: String(p?.sleeper_id || '').trim(),
      name: String(p?.player_name || p?.name || '').trim(),
      position: String(p?.position || '').trim(),
      team: String(p?.nfl_team || p?.team || '').trim(),
    }))
    .filter((p) => p.sleeper_id)
    .slice(0, 250)
  if (!list.length) return {}
  const { data, error } = await supabase.functions.invoke('fantasy-lineup-cards', {
    body: { players: list, sport: String(sport || 'nfl').toLowerCase() },
  })
  const result = await finishEdge(data, error, 'Could not load lineup cards.')
  return result?.cards && typeof result.cards === 'object' ? result.cards : {}
}

function loosePlayerName(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/\b(jr|sr|iii|ii|iv|v)\b/g, '')
    .replace(/[^a-z]/g, '')
}

/** ESPN/CBS names keep "Jr." Sleeper's row often does not, so the roster id is blank and the photo never joins. */
async function attachMissingSleeperIds(supabase, rows) {
  const missing = (rows || []).some((row) => !row?.sleeper_id && loosePlayerName(row?.player_name))
  if (!missing) return rows || []
  const { data: players } = await supabase
    .from('nfl_players')
    .select('sleeper_id, full_name, team, position')
    .limit(2000)
  const index = new Map()
  for (const player of players || []) {
    const key = loosePlayerName(player.full_name)
    if (!key || !player.sleeper_id) continue
    const list = index.get(key) || []
    list.push(player)
    index.set(key, list)
  }
  return (rows || []).map((row) => {
    if (row?.sleeper_id) return row
    const hits = index.get(loosePlayerName(row?.player_name)) || []
    if (!hits.length) return row
    const pos = String(row.position || '').toUpperCase()
    const team = String(row.nfl_team || '').toUpperCase()
    const byPos = pos ? hits.filter((player) => String(player.position || '').toUpperCase() === pos) : hits
    const pool = byPos.length ? byPos : hits
    const byTeam = team ? pool.filter((player) => String(player.team || '').toUpperCase() === team) : []
    const pick = byTeam.length === 1 ? byTeam[0] : pool.length === 1 ? pool[0] : null
    if (!pick?.sleeper_id) return row
    return { ...row, sleeper_id: String(pick.sleeper_id) }
  })
}

export async function loadLeagueDetail(supabase, leagueId) {
  const id = String(leagueId || '').trim()
  if (!id) return null

  const { data: league, error: lgErr } = await supabase
    .from('fantasy_leagues')
    .select('id, name, season, is_primary, provider, sport, connection_id, scoring')
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

  const { data: latestWeek } = await supabase
    .from('fantasy_matchups')
    .select('week')
    .eq('league_id', id)
    .order('week', { ascending: false })
    .limit(1)
    .maybeSingle()

  const week = latestWeek?.week ?? null
  let matchups = []
  if (week != null) {
    const { data: rows, error: mErr } = await supabase
      .from('fantasy_matchups')
      .select('id, week, mine_team_id, opp_team_id, mine_score, opp_score')
      .eq('league_id', id)
      .eq('week', week)
    if (mErr) throw new Error(mErr.message)
    matchups = rows || []
  }
  const mineTeam = (teams || []).find((t) => t.is_mine) || null
  const matchup =
    matchups.find((m) => m.mine_team_id === mineTeam?.id || m.opp_team_id === mineTeam?.id) || null
  const teamIds = (teams || []).map((t) => t.id).filter(Boolean)
  let rosterRows = []
  if (week && teamIds.length) {
    const { data: rows, error: rErr } = await supabase
      .from('fantasy_rosters')
      .select('team_id, sleeper_id, player_name, position, nfl_team, slot')
      .in('team_id', teamIds)
      .eq('week', week)
    if (rErr) throw new Error(rErr.message)
    rosterRows = rows || []
  }

  rosterRows = await attachMissingSleeperIds(supabase, rosterRows)

  const sleeperIds = [...new Set(rosterRows.map((r) => r.sleeper_id).filter(Boolean))]
  const injuryById = {}
  if (sleeperIds.length) {
    const { data: players } = await supabase
      .from('nfl_players')
      .select('sleeper_id, injury_status, status, headshot_url, local_headshot_path')
      .in('sleeper_id', sleeperIds)
    for (const p of players || []) {
      if (p?.sleeper_id) injuryById[String(p.sleeper_id)] = p
    }
  }

  const rostersByTeam = {}
  for (const row of rosterRows) {
    const key = row.team_id
    if (!rostersByTeam[key]) rostersByTeam[key] = []
    const tag = row.sleeper_id ? injuryById[String(row.sleeper_id)] : null
    rostersByTeam[key].push({
      ...row,
      injury_status: tag?.injury_status || null,
      player_status: tag?.status || null,
      headshot_url: tag?.headshot_url || tag?.local_headshot_path || null,
    })
  }
  for (const list of Object.values(rostersByTeam)) {
    list.sort((a, b) => {
      const as = a.slot === 'starter' ? 0 : 1
      const bs = b.slot === 'starter' ? 0 : 1
      if (as !== bs) return as - bs
      return String(a.slot_label || '').localeCompare(String(b.slot_label || ''))
    })
  }

  const oppTeamId = !matchup
    ? null
    : matchup.mine_team_id === mineTeam?.id
      ? matchup.opp_team_id
      : matchup.mine_team_id
  const mineRoster = mineTeam ? rostersByTeam[mineTeam.id] || [] : []
  const oppRoster = oppTeamId ? rostersByTeam[oppTeamId] || [] : []

  return {
    league,
    teams: teams || [],
    week,
    matchups,
    matchup: matchup || null,
    mineRoster,
    oppRoster,
    rostersByTeam,
  }
}
