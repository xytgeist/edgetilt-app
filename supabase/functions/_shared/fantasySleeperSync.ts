/**
 * Sleeper Fantasy Connect … link username + sync leagues / teams / rosters / matchups.
 * Public Sleeper API (no OAuth). Maps players onto sleeper_id for nfl_players + hub pins.
 */
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2'

const SLEEPER = 'https://api.sleeper.app/v1'

export type SleeperUser = {
  user_id: string
  username: string
  display_name?: string
  avatar?: string | null
}

export type SyncResult = {
  ok: boolean
  connectionId?: string
  season?: number
  week?: number
  leagues?: number
  error?: string
}

async function sleeperGet<T>(path: string): Promise<T> {
  const res = await fetch(`${SLEEPER}${path}`, {
    headers: { Accept: 'application/json' },
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`Sleeper ${path} → ${res.status} ${text.slice(0, 200)}`)
  }
  return (await res.json()) as T
}

export async function fetchSleeperUserByUsername(username: string): Promise<SleeperUser | null> {
  const u = String(username || '').trim().replace(/^@/, '')
  if (!u) return null
  const data = await sleeperGet<SleeperUser | null>(`/user/${encodeURIComponent(u)}`)
  if (!data?.user_id) return null
  return data
}

export async function fetchNflState(): Promise<{ season: string; week: number; season_type: string }> {
  return sleeperGet(`/state/nfl`)
}

type SleeperLeague = {
  league_id: string
  name?: string
  season?: string
  scoring_settings?: Record<string, unknown>
  settings?: Record<string, unknown>
  roster_positions?: string[]
}

type SleeperLeagueUser = {
  user_id: string
  display_name?: string
  metadata?: { team_name?: string }
  avatar?: string | null
}

type SleeperRoster = {
  roster_id: number
  owner_id: string | null
  players?: string[] | null
  starters?: string[] | null
  reserve?: string[] | null
  taxi?: string[] | null
  settings?: {
    wins?: number
    losses?: number
    ties?: number
    fpts?: number
    fpts_against?: number
  }
}

type SleeperMatchup = {
  roster_id: number
  matchup_id: number | null
  points?: number
  players_points?: Record<string, number>
}

function slotForPlayer(
  playerId: string,
  starters: Set<string>,
  reserve: Set<string>,
  taxi: Set<string>,
): 'starter' | 'bench' | 'ir' | 'taxi' {
  if (starters.has(playerId)) return 'starter'
  if (reserve.has(playerId)) return 'ir'
  if (taxi.has(playerId)) return 'taxi'
  return 'bench'
}

/**
 * Upsert connection for this EdgeTilt user + Sleeper account, then full-sync all NFL leagues.
 */
export async function linkAndSyncSleeper(
  admin: SupabaseClient,
  edgeUserId: string,
  username: string,
): Promise<SyncResult> {
  const sleeperUser = await fetchSleeperUserByUsername(username)
  if (!sleeperUser) {
    return { ok: false, error: `No Sleeper user named "${username}".` }
  }

  const { data: conn, error: connErr } = await admin
    .from('fantasy_connections')
    .upsert(
      {
        user_id: edgeUserId,
        provider: 'sleeper',
        external_user_id: String(sleeperUser.user_id),
        external_username: String(sleeperUser.username || username).trim(),
        status: 'active',
        last_error: null,
      },
      { onConflict: 'user_id,provider' },
    )
    .select('id, primary_league_id')
    .single()

  if (connErr || !conn?.id) {
    return { ok: false, error: connErr?.message || 'Could not save connection.' }
  }

  const sync = await syncSleeperConnection(admin, edgeUserId, conn.id, String(sleeperUser.user_id))
  return { ...sync, connectionId: conn.id }
}

export async function syncSleeperConnection(
  admin: SupabaseClient,
  edgeUserId: string,
  connectionId: string,
  sleeperUserId: string,
): Promise<SyncResult> {
  try {
    const state = await fetchNflState()
    const season = Number(state.season)
    const week = Math.max(1, Number(state.week) || 1)
    if (!Number.isFinite(season)) {
      return { ok: false, error: 'Sleeper NFL state missing season.' }
    }

    const leagues = await sleeperGet<SleeperLeague[]>(
      `/user/${encodeURIComponent(sleeperUserId)}/leagues/nfl/${season}`,
    )
    const list = Array.isArray(leagues) ? leagues : []

    // Drop stale season rows for this connection (re-insert fresh).
    await admin.from('fantasy_leagues').delete().eq('connection_id', connectionId).neq('season', season)

    let primaryLeagueId: string | null = null
    const { data: existingConn } = await admin
      .from('fantasy_connections')
      .select('primary_league_id')
      .eq('id', connectionId)
      .maybeSingle()
    primaryLeagueId = existingConn?.primary_league_id ? String(existingConn.primary_league_id) : null

    for (const lg of list) {
      const externalLeagueId = String(lg.league_id || '').trim()
      if (!externalLeagueId) continue

      const { data: leagueRow, error: lgErr } = await admin
        .from('fantasy_leagues')
        .upsert(
          {
            connection_id: connectionId,
            user_id: edgeUserId,
            provider: 'sleeper',
            external_league_id: externalLeagueId,
            name: String(lg.name || 'League').trim() || 'League',
            season,
            sport: 'nfl',
            scoring: lg.scoring_settings && typeof lg.scoring_settings === 'object' ? lg.scoring_settings : {},
            settings: {
              ...(lg.settings && typeof lg.settings === 'object' ? lg.settings : {}),
              roster_positions: Array.isArray(lg.roster_positions) ? lg.roster_positions : [],
            },
          },
          { onConflict: 'connection_id,external_league_id' },
        )
        .select('id')
        .single()

      if (lgErr || !leagueRow?.id) {
        throw new Error(lgErr?.message || `League upsert failed (${externalLeagueId})`)
      }
      const leagueId = String(leagueRow.id)

      const [users, rosters, matchups] = await Promise.all([
        sleeperGet<SleeperLeagueUser[]>(`/league/${externalLeagueId}/users`),
        sleeperGet<SleeperRoster[]>(`/league/${externalLeagueId}/rosters`),
        sleeperGet<SleeperMatchup[]>(`/league/${externalLeagueId}/matchups/${week}`),
      ])

      const userById = new Map<string, SleeperLeagueUser>()
      for (const u of users || []) {
        if (u?.user_id) userById.set(String(u.user_id), u)
      }

      const teamIdByRoster = new Map<number, string>()
      let mineTeamId: string | null = null

      for (const r of rosters || []) {
        const ownerId = r.owner_id != null ? String(r.owner_id) : ''
        const owner = ownerId ? userById.get(ownerId) : null
        const isMine = ownerId === String(sleeperUserId)
        const externalTeamId = String(r.roster_id)
        const { data: teamRow, error: teamErr } = await admin
          .from('fantasy_teams')
          .upsert(
            {
              league_id: leagueId,
              user_id: edgeUserId,
              external_team_id: externalTeamId,
              owner_name: String(owner?.display_name || ownerId || 'Team').trim(),
              team_name: String(owner?.metadata?.team_name || owner?.display_name || `Roster ${externalTeamId}`).trim(),
              avatar_url: owner?.avatar
                ? `https://sleepercdn.com/avatars/thumbs/${owner.avatar}`
                : null,
              is_mine: isMine,
              wins: Number(r.settings?.wins) || 0,
              losses: Number(r.settings?.losses) || 0,
              ties: Number(r.settings?.ties) || 0,
              points_for: r.settings?.fpts != null ? Number(r.settings.fpts) : null,
              points_against: r.settings?.fpts_against != null ? Number(r.settings.fpts_against) : null,
              metadata: { sleeper_roster_id: r.roster_id, owner_id: ownerId || null },
            },
            { onConflict: 'league_id,external_team_id' },
          )
          .select('id')
          .single()
        if (teamErr || !teamRow?.id) {
          throw new Error(teamErr?.message || `Team upsert failed (${externalTeamId})`)
        }
        teamIdByRoster.set(r.roster_id, String(teamRow.id))
        if (isMine) mineTeamId = String(teamRow.id)

        // Replace this week's roster rows for the team.
        await admin.from('fantasy_rosters').delete().eq('team_id', teamRow.id).eq('week', week)

        const starters = new Set((r.starters || []).map(String).filter((id) => id && id !== '0'))
        const reserve = new Set((r.reserve || []).map(String).filter(Boolean))
        const taxi = new Set((r.taxi || []).map(String).filter(Boolean))
        const players = (r.players || []).map(String).filter((id) => id && id !== '0')

        // Enrich names from nfl_players when we have them.
        const { data: nflRows } = players.length
          ? await admin
              .from('nfl_players')
              .select('sleeper_id, full_name, position, team')
              .in('sleeper_id', players)
          : { data: [] as Array<{ sleeper_id: string; full_name: string; position: string; team: string }> }
        const nflById = new Map(
          (nflRows || []).map((p) => [String(p.sleeper_id), p]),
        )

        const rosterInserts = players.map((pid, idx) => {
          const nfl = nflById.get(pid)
          const slot = slotForPlayer(pid, starters, reserve, taxi)
          return {
            team_id: teamRow.id,
            user_id: edgeUserId,
            week,
            sleeper_id: pid,
            player_name: nfl?.full_name || pid,
            position: nfl?.position || null,
            nfl_team: nfl?.team || null,
            slot,
            slot_label: `${slot}:${idx}`,
          }
        })
        if (rosterInserts.length) {
          const { error: rostErr } = await admin.from('fantasy_rosters').insert(rosterInserts)
          if (rostErr) throw new Error(rostErr.message)
        }
      }

      // Matchup for my team this week.
      if (mineTeamId) {
        const mineRosterId = [...teamIdByRoster.entries()].find(([, id]) => id === mineTeamId)?.[0]
        const mineMu = (matchups || []).find((m) => m.roster_id === mineRosterId)
        let oppTeamId: string | null = null
        let oppScore: number | null = null
        if (mineMu?.matchup_id != null) {
          const opp = (matchups || []).find(
            (m) => m.matchup_id === mineMu.matchup_id && m.roster_id !== mineRosterId,
          )
          if (opp) {
            oppTeamId = teamIdByRoster.get(opp.roster_id) || null
            oppScore = opp.points != null ? Number(opp.points) : null
          }
        }
        await admin.from('fantasy_matchups').upsert(
          {
            league_id: leagueId,
            user_id: edgeUserId,
            week,
            mine_team_id: mineTeamId,
            opp_team_id: oppTeamId,
            mine_score: mineMu?.points != null ? Number(mineMu.points) : null,
            opp_score: oppScore,
            external_matchup_id: mineMu?.matchup_id != null ? String(mineMu.matchup_id) : null,
          },
          { onConflict: 'league_id,week,mine_team_id' },
        )
      }

      if (!primaryLeagueId && mineTeamId) primaryLeagueId = leagueId
    }

    // Mark primary: keep existing if still present, else first league with my team.
    if (primaryLeagueId) {
      await admin.from('fantasy_leagues').update({ is_primary: false }).eq('connection_id', connectionId)
      await admin.from('fantasy_leagues').update({ is_primary: true }).eq('id', primaryLeagueId)
    }

    await admin
      .from('fantasy_connections')
      .update({
        last_sync_at: new Date().toISOString(),
        last_error: null,
        status: 'active',
        primary_league_id: primaryLeagueId,
      })
      .eq('id', connectionId)

    return {
      ok: true,
      connectionId,
      season,
      week,
      leagues: list.length,
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    await admin
      .from('fantasy_connections')
      .update({ status: 'error', last_error: message.slice(0, 500) })
      .eq('id', connectionId)
    return { ok: false, connectionId, error: message }
  }
}

/** sleeper_ids for mine + enemy starters in the primary league this NFL week. */
export async function hubPinsForUser(
  admin: SupabaseClient,
  edgeUserId: string,
): Promise<{ week: number; mine: string[]; enemy: string[]; leagueId: string | null }> {
  const state = await fetchNflState()
  const week = Math.max(1, Number(state.week) || 1)

  const { data: conn } = await admin
    .from('fantasy_connections')
    .select('id, primary_league_id')
    .eq('user_id', edgeUserId)
    .eq('provider', 'sleeper')
    .eq('status', 'active')
    .maybeSingle()

  if (!conn?.primary_league_id) {
    return { week, mine: [], enemy: [], leagueId: null }
  }

  const leagueId = String(conn.primary_league_id)
  const { data: matchup } = await admin
    .from('fantasy_matchups')
    .select('mine_team_id, opp_team_id')
    .eq('league_id', leagueId)
    .eq('week', week)
    .maybeSingle()

  const mineTeam = matchup?.mine_team_id ? String(matchup.mine_team_id) : null
  const oppTeam = matchup?.opp_team_id ? String(matchup.opp_team_id) : null

  const loadStarters = async (teamId: string | null) => {
    if (!teamId) return [] as string[]
    const { data } = await admin
      .from('fantasy_rosters')
      .select('sleeper_id')
      .eq('team_id', teamId)
      .eq('week', week)
      .eq('slot', 'starter')
    return (data || []).map((r) => String(r.sleeper_id || '').trim()).filter(Boolean)
  }

  const [mine, enemy] = await Promise.all([loadStarters(mineTeam), loadStarters(oppTeam)])
  return { week, mine, enemy, leagueId }
}
