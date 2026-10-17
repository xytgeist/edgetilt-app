/**
 * CBS Fantasy Connect. Member access token only. Password is never accepted or stored.
 * League reads: api.cbssports.com/fantasy v3. League ids come from the login sheet (My Teams).
 */
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2'

const API = 'https://api.cbssports.com/fantasy'

export type SyncResult = {
  ok: boolean
  connectionId?: string
  season?: number
  week?: number
  leagues?: number
  error?: string
}

type CbsSession = { accessToken: string; leagueIds: string[] }

const POS = new Set(['QB', 'RB', 'WR', 'TE', 'K', 'DEF', 'DST', 'D'])

export function normalizeCbsSession(tokenRaw: string, leagueIdsRaw: unknown): CbsSession | null {
  const accessToken = String(tokenRaw || '').trim()
  if (accessToken.length < 16 || accessToken.length > 4000) return null
  if (/[\r\n\s]/.test(accessToken)) return null
  const leagueIds: string[] = []
  const seen = new Set<string>()
  const list = Array.isArray(leagueIdsRaw) ? leagueIdsRaw : []
  for (const item of list) {
    const id = String(item || '').trim()
    if (!id || id.length > 80 || seen.has(id)) continue
    seen.add(id)
    leagueIds.push(id)
    if (leagueIds.length >= 20) break
  }
  return { accessToken, leagueIds }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  return value as Record<string, unknown>
}

function statusMessage(raw: unknown): string {
  const row = asRecord(raw)
  return String(row?.statusMessage || row?.error || '').trim()
}

async function cbsGet(
  path: string,
  token: string,
  query: Record<string, string>,
): Promise<unknown | null> {
  const url = new URL(`${API}/${path}`)
  url.searchParams.set('version', '3.0')
  url.searchParams.set('response_format', 'json')
  url.searchParams.set('sport', 'football')
  url.searchParams.set('access_token', token)
  for (const [key, value] of Object.entries(query)) url.searchParams.set(key, value)
  const res = await fetch(url.toString(), {
    headers: {
      Accept: 'application/json',
      Authorization: `Bearer ${token}`,
      'User-Agent': 'Mozilla/5.0',
    },
  })
  const text = await res.text()
  let json: unknown = null
  try {
    json = JSON.parse(text)
  } catch {
    json = null
  }
  const message = statusMessage(json)
  if (/invalid access token|failed authentication/i.test(message) || res.status === 401 || res.status === 403) {
    throw new Error('CBS session expired. Connect CBS again.')
  }
  if (/missing league/i.test(message)) return null
  if (!json) throw new Error('CBS did not return league data. Connect CBS again.')
  if (/error|fail/i.test(message) && !/success/i.test(message)) {
    throw new Error(message.slice(0, 180) || 'CBS read failed. Connect CBS again.')
  }
  return json
}

function leagueIdAttempts(raw: string): string[] {
  const id = raw.trim()
  const out = [id]
  if (!id.startsWith('football-')) out.push(`football-${id}`)
  return [...new Set(out)]
}

function bodyOf(raw: unknown): Record<string, unknown> {
  return asRecord(asRecord(raw)?.body) || asRecord(raw) || {}
}

function findNamedArray(node: unknown, names: Set<string>, depth = 0): Record<string, unknown>[] {
  if (!node || depth > 6) return []
  if (Array.isArray(node)) {
    const rows = node.map(asRecord).filter((row): row is Record<string, unknown> => Boolean(row))
    return rows
  }
  const rec = asRecord(node)
  if (!rec) return []
  for (const [key, value] of Object.entries(rec)) {
    if (names.has(key) && Array.isArray(value)) {
      const rows = value.map(asRecord).filter((row): row is Record<string, unknown> => Boolean(row))
      if (rows.length) return rows
    }
  }
  for (const value of Object.values(rec)) {
    const found = findNamedArray(value, names, depth + 1)
    if (found.length) return found
  }
  return []
}

type PlayerRow = { sleeper_id: string; full_name: string; team: string; position: string }

function nameKey(value: string): string {
  return value
    .toLowerCase()
    .replace(/\b(jr|sr|iii|ii|iv|v)\b/g, '')
    .replace(/[^a-z]/g, '')
}

async function loadPlayerIndex(admin: SupabaseClient): Promise<Map<string, PlayerRow[]>> {
  const index = new Map<string, PlayerRow[]>()
  for (let from = 0; from < 5000; from += 1000) {
    const { data, error } = await admin
      .from('nfl_players')
      .select('sleeper_id, full_name, team, position')
      .range(from, from + 999)
    if (error) break
    const rows = (data || []) as PlayerRow[]
    for (const row of rows) {
      const key = nameKey(String(row.full_name || ''))
      if (!key) continue
      const list = index.get(key) || []
      list.push(row)
      index.set(key, list)
    }
    if (rows.length < 1000) break
  }
  return index
}

function resolveSleeperId(
  index: Map<string, PlayerRow[]>,
  fullName: string,
  team: string,
  position: string,
): string | null {
  const rows = index.get(nameKey(fullName)) || []
  if (!rows.length) return null
  const teamAbbrev = team.toUpperCase()
  const pos = position.toUpperCase()
  const byTeam = teamAbbrev ? rows.filter((r) => String(r.team || '').toUpperCase() === teamAbbrev) : rows
  const pool = byTeam.length ? byTeam : rows
  if (pos) {
    const hit = pool.find((r) => String(r.position || '').toUpperCase() === pos)
    if (hit) return String(hit.sleeper_id)
  }
  return pool[0] ? String(pool[0].sleeper_id) : null
}

function playerName(row: Record<string, unknown>): string {
  const full = String(row.fullname || row.full_name || row.player_name || '').trim()
  if (full) return full
  const first = String(row.firstname || row.first_name || '').trim()
  const last = String(row.lastname || row.last_name || '').trim()
  return `${first} ${last}`.trim()
}

function isMineTeam(team: Record<string, unknown>): boolean {
  if (team.owned_by_current_user === true || team.is_owner === true || team.mine === true) return true
  const owners = Array.isArray(team.owners) ? team.owners : []
  return owners.some((owner) => {
    const row = asRecord(owner)
    return Boolean(row?.is_user || row?.logged_in || row?.is_owner)
  })
}

export async function linkAndSyncCbs(
  admin: SupabaseClient,
  edgeUserId: string,
  session: CbsSession,
): Promise<SyncResult> {
  const { data: conn, error: connErr } = await admin
    .from('fantasy_connections')
    .upsert(
      {
        user_id: edgeUserId,
        provider: 'cbs',
        external_user_id: 'cbs',
        external_username: 'CBS',
        status: 'active',
        last_error: null,
      },
      { onConflict: 'user_id,provider' },
    )
    .select('id')
    .single()
  if (connErr || !conn?.id) {
    return { ok: false, error: connErr?.message || 'Could not save CBS connection.' }
  }
  const connectionId = String(conn.id)
  const { error: tokenErr } = await admin.from('fantasy_provider_tokens').upsert(
    {
      connection_id: connectionId,
      access_token: session.accessToken,
      refresh_token: session.leagueIds.join(','),
      expires_at: null,
      token_type: 'cbs_access',
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'connection_id' },
  )
  if (tokenErr) return { ok: false, error: tokenErr.message }
  const sync = await syncCbsConnection(admin, edgeUserId, connectionId, session)
  return { ...sync, connectionId }
}

export async function syncCbsForUser(admin: SupabaseClient, edgeUserId: string): Promise<SyncResult> {
  const { data: conn } = await admin
    .from('fantasy_connections')
    .select('id, status')
    .eq('user_id', edgeUserId)
    .eq('provider', 'cbs')
    .maybeSingle()
  if (!conn?.id || conn.status === 'revoked') return { ok: false, error: 'Connect CBS first.' }
  const { data: token } = await admin
    .from('fantasy_provider_tokens')
    .select('access_token, refresh_token, token_type')
    .eq('connection_id', conn.id)
    .maybeSingle()
  if (token?.token_type !== 'cbs_access') return { ok: false, error: 'CBS session missing. Connect CBS again.' }
  const leagueIds = String(token.refresh_token || '')
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean)
  const session = normalizeCbsSession(String(token.access_token || ''), leagueIds)
  if (!session) return { ok: false, error: 'CBS session missing. Connect CBS again.' }
  return syncCbsConnection(admin, edgeUserId, String(conn.id), session)
}

async function syncCbsConnection(
  admin: SupabaseClient,
  edgeUserId: string,
  connectionId: string,
  session: CbsSession,
): Promise<SyncResult> {
  try {
    if (!session.leagueIds.length) {
      throw new Error('No CBS football league was on My Teams. Open the league once, then connect again.')
    }
    const season = new Date().getFullYear()
    const week = 1
    const players = await loadPlayerIndex(admin)
    const { data: existingPrimary } = await admin
      .from('fantasy_leagues')
      .select('id')
      .eq('user_id', edgeUserId)
      .eq('is_primary', true)
      .limit(1)
    const userHasPrimary = Boolean(existingPrimary?.length)
    let created = 0
    let firstLeague: string | null = null

    for (const rawId of session.leagueIds) {
      let worked: string | null = null
      let details: unknown = null
      let teamsRaw: unknown = null
      let rostersRaw: unknown = null
      for (const attempt of leagueIdAttempts(rawId)) {
        const nextDetails = await cbsGet('league/details', session.accessToken, { league_id: attempt })
        const nextTeams = await cbsGet('league/teams', session.accessToken, { league_id: attempt })
        if (!nextDetails && !nextTeams) continue
        worked = attempt
        details = nextDetails
        teamsRaw = nextTeams
        rostersRaw = await cbsGet('league/rosters', session.accessToken, { league_id: attempt })
        break
      }
      if (!worked) continue
      const detailBody = bodyOf(details)
      const detailRow = asRecord(detailBody.league_details) || asRecord(detailBody.league) || detailBody
      const name = String(detailRow.name || detailRow.league_name || `CBS ${worked}`).trim() || `CBS ${worked}`
      const teams = findNamedArray(bodyOf(teamsRaw), new Set(['teams']))
      const rosterTeams = findNamedArray(bodyOf(rostersRaw), new Set(['teams', 'rosters']))

      const { data: leagueRow, error: lgErr } = await admin
        .from('fantasy_leagues')
        .upsert(
          {
            connection_id: connectionId,
            user_id: edgeUserId,
            provider: 'cbs',
            external_league_id: worked,
            name,
            season,
            sport: 'nfl',
            scoring: {},
            settings: { source_id: rawId },
          },
          { onConflict: 'connection_id,external_league_id' },
        )
        .select('id')
        .single()
      if (lgErr || !leagueRow?.id) throw new Error(lgErr?.message || 'League save failed.')
      const leagueId = String(leagueRow.id)
      created += 1
      if (!firstLeague) firstLeague = leagueId

      const rosterByTeam = new Map<string, Record<string, unknown>[]>()
      for (const rosterTeam of rosterTeams) {
        const id = String(rosterTeam.id ?? rosterTeam.team_id ?? '').trim()
        const list = findNamedArray(rosterTeam, new Set(['players', 'roster']))
        if (id) rosterByTeam.set(id, list)
      }

      for (const team of teams) {
        const externalTeamId = String(team.id ?? team.team_id ?? '').trim()
        if (!externalTeamId) continue
        const { data: teamRow, error: teamErr } = await admin
          .from('fantasy_teams')
          .upsert(
            {
              league_id: leagueId,
              user_id: edgeUserId,
              external_team_id: externalTeamId,
              owner_name: String(team.owner_name || team.owner || '').trim(),
              team_name: String(team.name || team.long_name || team.abbr || `Team ${externalTeamId}`).trim(),
              avatar_url: null,
              is_mine: isMineTeam(team),
              wins: Number(team.wins) || 0,
              losses: Number(team.losses) || 0,
              ties: Number(team.ties) || 0,
              points_for: Number(team.points_for ?? team.points) || null,
              points_against: Number(team.points_against) || null,
              metadata: { cbs_team_id: externalTeamId },
            },
            { onConflict: 'league_id,external_team_id' },
          )
          .select('id')
          .single()
        if (teamErr || !teamRow?.id) throw new Error(teamErr?.message || 'Team save failed.')
        const roster = rosterByTeam.get(externalTeamId) || []
        await admin.from('fantasy_rosters').delete().eq('team_id', teamRow.id).eq('week', week)
        const inserts = []
        for (const player of roster) {
          const fullName = playerName(player)
          if (!fullName) continue
          const position = String(player.position || player.pos || '').toUpperCase()
          if (position && !POS.has(position)) continue
          const nflTeam = String(player.pro_team || player.team || player.pro_status || '').toUpperCase()
          const slotRaw = String(player.roster_status || player.status || 'A').toUpperCase()
          const slot = slotRaw === 'A' || slotRaw === 'STARTER' ? 'starter' : 'bench'
          const cbsId = String(player.id || player.player_id || fullName)
          inserts.push({
            team_id: teamRow.id,
            user_id: edgeUserId,
            week,
            sleeper_id: resolveSleeperId(players, fullName, nflTeam.slice(0, 3), position === 'DST' ? 'DEF' : position),
            player_name: fullName,
            position: position || null,
            nfl_team: nflTeam.slice(0, 8) || null,
            slot,
            slot_label: `${slot}:${cbsId}`,
          })
        }
        if (inserts.length) {
          const { error: rostErr } = await admin.from('fantasy_rosters').insert(inserts)
          if (rostErr) throw new Error(rostErr.message)
        }
      }
    }

    if (!created) {
      await admin
        .from('fantasy_connections')
        .update({
          status: 'error',
          last_error: 'No CBS NFL leagues on this account.',
          last_sync_at: new Date().toISOString(),
        })
        .eq('id', connectionId)
      return { ok: false, error: 'No CBS NFL leagues on this account.', season, leagues: 0 }
    }

    if (!userHasPrimary && firstLeague) {
      await admin.from('fantasy_leagues').update({ is_primary: false }).eq('connection_id', connectionId)
      await admin.from('fantasy_leagues').update({ is_primary: true }).eq('id', firstLeague)
      await admin.from('fantasy_connections').update({ primary_league_id: firstLeague }).eq('id', connectionId)
    }
    await admin
      .from('fantasy_connections')
      .update({
        status: 'active',
        last_error: null,
        last_sync_at: new Date().toISOString(),
      })
      .eq('id', connectionId)
    return { ok: true, connectionId, season, week, leagues: created }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'CBS sync failed.'
    await admin
      .from('fantasy_connections')
      .update({ status: 'error', last_error: message.slice(0, 400), last_sync_at: new Date().toISOString() })
      .eq('id', connectionId)
    return { ok: false, connectionId, error: message }
  }
}
