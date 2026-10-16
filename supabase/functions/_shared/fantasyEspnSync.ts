/**
 * ESPN Fantasy Connect. Session cookie only (espn_s2 + SWID). Password is never accepted or stored.
 * League reads: lm-api-reads.fantasy.espn.com v3. Players map onto nfl_players.sleeper_id by name + team.
 */
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2'

const READS = 'https://lm-api-reads.fantasy.espn.com/apis/v3/games/ffl'
const FAN = 'https://fan.api.espn.com/apis/v2/fans'
/** ESPN fantasy preference types (league manager + regular member). NFL game id is 1. */
const FAN_PREF_TYPES = new Set([9, 10])
const NFL_GAME_ID = 1

const PRO_TEAM: Record<number, string> = {
  1: 'ATL',
  2: 'BUF',
  3: 'CHI',
  4: 'CIN',
  5: 'CLE',
  6: 'DAL',
  7: 'DEN',
  8: 'DET',
  9: 'GB',
  10: 'TEN',
  11: 'IND',
  12: 'KC',
  13: 'LV',
  14: 'LAR',
  15: 'MIA',
  16: 'MIN',
  17: 'NE',
  18: 'NO',
  19: 'NYG',
  20: 'NYJ',
  21: 'PHI',
  22: 'ARI',
  23: 'PIT',
  24: 'LAC',
  25: 'SF',
  26: 'SEA',
  27: 'TB',
  28: 'WAS',
  29: 'CAR',
  30: 'JAX',
  33: 'BAL',
  34: 'HOU',
}

const POS: Record<number, string> = {
  1: 'QB',
  2: 'RB',
  3: 'WR',
  4: 'TE',
  5: 'K',
  16: 'DEF',
}

export type SyncResult = {
  ok: boolean
  connectionId?: string
  season?: number
  week?: number
  leagues?: number
  error?: string
}

type EspnSession = { espnS2: string; swid: string }

function swidKey(raw: string): string {
  return String(raw || '').replace(/[{}]/g, '').trim().toUpperCase()
}

export function normalizeEspnSession(espnS2Raw: string, swidRaw: string): EspnSession | null {
  const espnS2 = String(espnS2Raw || '').trim()
  let swid = String(swidRaw || '').trim()
  try {
    swid = decodeURIComponent(swid)
  } catch {
    /* already plain */
  }
  if (espnS2.length < 20 || espnS2.length > 4000) return null
  if (/[\r\n]/.test(espnS2) || /[\r\n]/.test(swid)) return null
  const key = swidKey(swid)
  if (!/^[0-9A-F-]{8,}$/.test(key)) return null
  return { espnS2, swid: `{${key}}` }
}

function espnCookieHeader(session: EspnSession): string {
  // SWID is `{UUID}`. A raw brace in the Cookie header is dropped, and ESPN then returns {}.
  return `espn_s2=${session.espnS2}; SWID=${encodeURIComponent(session.swid)}`
}

async function espnGet(path: string, session: EspnSession): Promise<unknown> {
  const res = await fetch(`${READS}${path}`, {
    headers: {
      Accept: 'application/json',
      Cookie: espnCookieHeader(session),
      'User-Agent':
        'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
    },
  })
  const text = await res.text()
  if (res.status === 401 || res.status === 403) {
    throw new Error('ESPN session expired. Connect ESPN again.')
  }
  if (!res.ok) {
    throw new Error(`ESPN read failed (${res.status}). Connect ESPN again.`)
  }
  const trimmed = text.trim()
  if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) {
    throw new Error('ESPN did not return league data. Connect ESPN again.')
  }
  return JSON.parse(trimmed) as unknown
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  return value as Record<string, unknown>
}

type FanLeagueRef = { id: string; name: string }

/** ESPN's site lists "my leagues" on the fan profile, not on the season URL (that one is `{}`). */
async function listFanLeagueRefs(session: EspnSession, season: number): Promise<FanLeagueRef[]> {
  const res = await fetch(`${FAN}/${encodeURIComponent(session.swid)}`, {
    headers: {
      Accept: 'application/json',
      Cookie: espnCookieHeader(session),
      'X-Personalization-Source': 'fantasy',
    },
  })
  if (res.status === 401 || res.status === 403) {
    throw new Error('ESPN session expired. Connect ESPN again.')
  }
  if (!res.ok) {
    throw new Error(`ESPN account read failed (${res.status}). Connect ESPN again.`)
  }
  const raw = (await res.json().catch(() => null)) as unknown
  const prefs = asRecord(raw)?.preferences
  if (!Array.isArray(prefs)) return []
  const seen = new Set<string>()
  const out: FanLeagueRef[] = []
  for (const pref of prefs) {
    const row = asRecord(pref)
    if (!row) continue
    const typeId = Number(asRecord(row.type)?.id)
    if (typeId && !FAN_PREF_TYPES.has(typeId)) continue
    const entry = asRecord(asRecord(row.metaData)?.entry)
    if (!entry) continue
    const gameId = Number(entry.gameId)
    if (gameId && gameId !== NFL_GAME_ID) continue
    const entrySeason = Number(entry.seasonId) || season
    if (entrySeason !== season) continue
    const groups = Array.isArray(entry.groups) ? entry.groups : []
    const group = asRecord(groups[0])
    const idNum = Math.abs(Number(group?.groupId))
    if (!idNum) continue
    const id = String(idNum)
    if (seen.has(id)) continue
    seen.add(id)
    const name = String(group?.groupName || `ESPN ${id}`).trim() || `ESPN ${id}`
    out.push({ id, name })
  }
  return out
}

function normalizeLeagues(raw: unknown): Record<string, unknown>[] {
  if (Array.isArray(raw)) {
    return raw.map(asRecord).filter((row): row is Record<string, unknown> => Boolean(row?.id || row?.teams))
  }
  const obj = asRecord(raw)
  if (!obj) return []
  if (Array.isArray(obj.leagues)) return normalizeLeagues(obj.leagues)
  if (obj.id != null && (obj.teams || obj.settings)) return [obj]
  return []
}

type PlayerRow = { sleeper_id: string; full_name: string; team: string; position: string }

function nameKey(value: string): string {
  return value.toLowerCase().replace(/[^a-z]/g, '')
}

async function loadPlayerIndex(admin: SupabaseClient): Promise<Map<string, PlayerRow[]>> {
  const index = new Map<string, PlayerRow[]>()
  const pageSize = 1000
  for (let from = 0; from < 5000; from += pageSize) {
    const { data, error } = await admin
      .from('nfl_players')
      .select('sleeper_id, full_name, team, position')
      .range(from, from + pageSize - 1)
    if (error) break
    const rows = (data || []) as PlayerRow[]
    for (const row of rows) {
      const key = nameKey(String(row.full_name || ''))
      if (!key) continue
      const list = index.get(key) || []
      list.push(row)
      index.set(key, list)
    }
    if (rows.length < pageSize) break
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
  if (pool.length === 1) return String(pool[0].sleeper_id)
  if (pos) {
    const hit = pool.find((r) => String(r.position || '').toUpperCase() === pos)
    if (hit) return String(hit.sleeper_id)
  }
  return pool.length ? String(pool[0].sleeper_id) : null
}

function num(value: unknown): number | null {
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}

export async function linkAndSyncEspn(
  admin: SupabaseClient,
  edgeUserId: string,
  session: EspnSession,
): Promise<SyncResult> {
  const { data: conn, error: connErr } = await admin
    .from('fantasy_connections')
    .upsert(
      {
        user_id: edgeUserId,
        provider: 'espn',
        external_user_id: session.swid,
        external_username: 'ESPN',
        status: 'active',
        last_error: null,
      },
      { onConflict: 'user_id,provider' },
    )
    .select('id')
    .single()

  if (connErr || !conn?.id) {
    return { ok: false, error: connErr?.message || 'Could not save ESPN connection.' }
  }

  const connectionId = String(conn.id)
  const { error: tokenErr } = await admin.from('fantasy_provider_tokens').upsert(
    {
      connection_id: connectionId,
      access_token: session.espnS2,
      refresh_token: session.swid,
      expires_at: null,
      token_type: 'espn_cookie',
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'connection_id' },
  )
  if (tokenErr) return { ok: false, error: tokenErr.message }

  const sync = await syncEspnConnection(admin, edgeUserId, connectionId, session)
  return { ...sync, connectionId }
}

export async function syncEspnForUser(
  admin: SupabaseClient,
  edgeUserId: string,
): Promise<SyncResult> {
  const { data: conn } = await admin
    .from('fantasy_connections')
    .select('id, status')
    .eq('user_id', edgeUserId)
    .eq('provider', 'espn')
    .maybeSingle()
  if (!conn?.id || conn.status === 'revoked') {
    return { ok: false, error: 'Connect ESPN first.' }
  }
  const { data: token } = await admin
    .from('fantasy_provider_tokens')
    .select('access_token, refresh_token, token_type')
    .eq('connection_id', conn.id)
    .maybeSingle()
  const session = normalizeEspnSession(
    String(token?.access_token || ''),
    String(token?.refresh_token || ''),
  )
  if (!session || token?.token_type !== 'espn_cookie') {
    return { ok: false, error: 'ESPN session missing. Connect ESPN again.' }
  }
  return syncEspnConnection(admin, edgeUserId, String(conn.id), session)
}

async function syncEspnConnection(
  admin: SupabaseClient,
  edgeUserId: string,
  connectionId: string,
  session: EspnSession,
): Promise<SyncResult> {
  try {
    const meta = asRecord(await espnGet('', session))
    const currentSeason = asRecord(meta?.currentSeason)
    const season = Number(currentSeason?.id) || new Date().getFullYear()
    const period = asRecord(currentSeason?.currentScoringPeriod)
    const defaultWeek = Math.max(1, Number(period?.id) || 1)

    const views = 'view=mTeam&view=mRoster&view=mMatchup&view=mSettings&view=mStatus'
    const refs = await listFanLeagueRefs(session, season)
    const leagues: Record<string, unknown>[] = []
    for (const ref of refs) {
      try {
        const one = await espnGet(
          `/seasons/${season}/segments/0/leagues/${encodeURIComponent(ref.id)}?${views}`,
          session,
        )
        const parsed = normalizeLeagues(one)
        if (parsed.length) leagues.push(...parsed)
        else leagues.push({ id: ref.id, settings: { name: ref.name }, teams: [] })
      } catch {
        // A league that is still drafting can fail the roster read. Keep the league.
        leagues.push({ id: ref.id, settings: { name: ref.name }, teams: [] })
      }
    }
    if (!leagues.length) {
      const raw = await espnGet(`/seasons/${season}?${views}`, session)
      leagues.push(...normalizeLeagues(raw))
    }
    if (!leagues.length) {
      await admin
        .from('fantasy_connections')
        .update({
          status: 'error',
          last_error: 'No ESPN NFL leagues on this account.',
          last_sync_at: new Date().toISOString(),
        })
        .eq('id', connectionId)
      return { ok: false, error: 'No ESPN NFL leagues on this account.', season, leagues: 0 }
    }

    await admin.from('fantasy_leagues').delete().eq('connection_id', connectionId).neq('season', season)

    const { data: existingPrimary } = await admin
      .from('fantasy_leagues')
      .select('id')
      .eq('user_id', edgeUserId)
      .eq('is_primary', true)
      .limit(1)
    const userHasPrimary = Boolean(existingPrimary?.length)

    const players = await loadPlayerIndex(admin)
    const mineKey = swidKey(session.swid)
    let created = 0
    let firstMineLeague: string | null = null

    for (const lg of leagues) {
      const externalLeagueId = String(lg.id || '').trim()
      if (!externalLeagueId) continue
      const settings = asRecord(lg.settings) || {}
      const status = asRecord(lg.status) || {}
      const week = Math.max(1, Number(status.currentMatchupPeriod) || Number(lg.scoringPeriodId) || defaultWeek)
      const name = String(settings.name || lg.name || `ESPN ${externalLeagueId}`).trim() || 'ESPN league'

      const { data: leagueRow, error: lgErr } = await admin
        .from('fantasy_leagues')
        .upsert(
          {
            connection_id: connectionId,
            user_id: edgeUserId,
            provider: 'espn',
            external_league_id: externalLeagueId,
            name,
            season,
            sport: 'nfl',
            scoring: asRecord(settings.scoringSettings) || {},
            settings: { size: settings.size ?? null },
          },
          { onConflict: 'connection_id,external_league_id' },
        )
        .select('id')
        .single()
      if (lgErr || !leagueRow?.id) throw new Error(lgErr?.message || 'League save failed.')
      const leagueId = String(leagueRow.id)
      created += 1

      const teams = Array.isArray(lg.teams) ? lg.teams.map(asRecord).filter(Boolean) as Record<string, unknown>[] : []
      const teamIdByEspn = new Map<string, string>()
      let mineTeamId: string | null = null

      for (const team of teams) {
        const externalTeamId = String(team.id ?? '').trim()
        if (!externalTeamId) continue
        const owners = Array.isArray(team.owners) ? team.owners.map((o) => swidKey(String(o))) : []
        const primary = swidKey(String(team.primaryOwner || ''))
        const isMine = primary === mineKey || owners.includes(mineKey)
        const record = asRecord(asRecord(team.record)?.overall) || {}
        const { data: teamRow, error: teamErr } = await admin
          .from('fantasy_teams')
          .upsert(
            {
              league_id: leagueId,
              user_id: edgeUserId,
              external_team_id: externalTeamId,
              owner_name: String(team.abbrev || '').trim(),
              team_name: String(
                team.name ||
                  (team.location && team.nickname
                    ? `${team.location} ${team.nickname}`
                    : team.abbrev || `Team ${externalTeamId}`),
              ).trim(),
              avatar_url: typeof team.logo === 'string' ? team.logo : null,
              is_mine: isMine,
              wins: Number(record.wins) || 0,
              losses: Number(record.losses) || 0,
              ties: Number(record.ties) || 0,
              points_for: num(record.pointsFor),
              points_against: num(record.pointsAgainst),
              metadata: { espn_team_id: team.id ?? null },
            },
            { onConflict: 'league_id,external_team_id' },
          )
          .select('id')
          .single()
        if (teamErr || !teamRow?.id) throw new Error(teamErr?.message || 'Team save failed.')
        teamIdByEspn.set(externalTeamId, String(teamRow.id))
        if (isMine && !mineTeamId) mineTeamId = String(teamRow.id)

        const roster = asRecord(team.roster)
        const entries = Array.isArray(roster?.entries) ? roster.entries : []
        await admin.from('fantasy_rosters').delete().eq('team_id', teamRow.id).eq('week', week)
        const inserts = []
        for (const entryRaw of entries) {
          const entry = asRecord(entryRaw)
          if (!entry) continue
          const pool = asRecord(asRecord(entry.playerPoolEntry)?.player)
          const fullName = String(pool?.fullName || '').trim()
          if (!fullName) continue
          const posId = Number(pool?.defaultPositionId)
          const position = POS[posId] || ''
          const nflTeam = PRO_TEAM[Number(pool?.proTeamId)] || ''
          const lineupSlot = Number(entry.lineupSlotId)
          const slot = lineupSlot === 21 ? 'ir' : lineupSlot === 20 ? 'bench' : 'starter'
          const espnPlayerId = String(entry.playerId || pool?.id || fullName)
          inserts.push({
            team_id: teamRow.id,
            user_id: edgeUserId,
            week,
            sleeper_id: resolveSleeperId(players, fullName, nflTeam, position),
            player_name: fullName,
            position: position || null,
            nfl_team: nflTeam || null,
            slot,
            slot_label: `${slot}:${espnPlayerId}`,
          })
        }
        if (inserts.length) {
          const { error: rostErr } = await admin.from('fantasy_rosters').insert(inserts)
          if (rostErr) throw new Error(rostErr.message)
        }
      }

      if (mineTeamId) {
        if (!firstMineLeague) firstMineLeague = leagueId
        const schedule = Array.isArray(lg.schedule) ? lg.schedule : []
        const match = schedule
          .map(asRecord)
          .find((row) => row && Number(row.matchupPeriodId) === week && (
            teamIdByEspn.get(String(asRecord(row.home)?.teamId ?? '')) === mineTeamId ||
            teamIdByEspn.get(String(asRecord(row.away)?.teamId ?? '')) === mineTeamId
          ))
        let oppTeamId: string | null = null
        let mineScore: number | null = null
        let oppScore: number | null = null
        if (match) {
          const home = asRecord(match.home)
          const away = asRecord(match.away)
          const homeId = teamIdByEspn.get(String(home?.teamId ?? '')) || null
          const awayId = teamIdByEspn.get(String(away?.teamId ?? '')) || null
          const homeIsMine = homeId === mineTeamId
          oppTeamId = homeIsMine ? awayId : homeId
          mineScore = num(homeIsMine ? home?.totalPoints : away?.totalPoints)
          oppScore = num(homeIsMine ? away?.totalPoints : home?.totalPoints)
        }
        await admin.from('fantasy_matchups').upsert(
          {
            league_id: leagueId,
            user_id: edgeUserId,
            week,
            mine_team_id: mineTeamId,
            opp_team_id: oppTeamId,
            mine_score: mineScore,
            opp_score: oppScore,
            external_matchup_id: match ? String(match.id ?? week) : null,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'league_id,week,mine_team_id' },
        )
      }
    }

    if (!userHasPrimary && firstMineLeague) {
      await admin.from('fantasy_leagues').update({ is_primary: false }).eq('connection_id', connectionId)
      await admin.from('fantasy_leagues').update({ is_primary: true }).eq('id', firstMineLeague)
      await admin.from('fantasy_connections').update({ primary_league_id: firstMineLeague }).eq('id', connectionId)
    }

    await admin
      .from('fantasy_connections')
      .update({
        status: 'active',
        last_error: null,
        last_sync_at: new Date().toISOString(),
        external_user_id: session.swid,
      })
      .eq('id', connectionId)

    return { ok: true, connectionId, season, week: defaultWeek, leagues: created }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'ESPN sync failed.'
    await admin
      .from('fantasy_connections')
      .update({ status: 'error', last_error: message.slice(0, 400), last_sync_at: new Date().toISOString() })
      .eq('id', connectionId)
    return { ok: false, connectionId, error: message }
  }
}
