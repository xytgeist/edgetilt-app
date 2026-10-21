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

type NamedPlayer = { full_name: string; position: string; team: string; injury_status?: string | null; eligible?: string[] }

async function loadNbaPlayers(ids: string[]): Promise<Map<string, NamedPlayer>> {
  const map = new Map<string, NamedPlayer>()
  const unique = [...new Set(ids.filter((id) => id && id !== '0'))]
  let cursor = 0
  async function worker() {
    while (cursor < unique.length) {
      const id = unique[cursor++]
      try {
        const p = await sleeperGet<{
          full_name?: string
          first_name?: string
          last_name?: string
          first?: string
          last?: string
          position?: string
          pos?: string
          team?: string | null
          injury_status?: string | null
          fantasy_positions?: string[] | null
        }>(`/players/nba/${encodeURIComponent(id)}`)
        const name = String(
          p?.full_name || `${p?.first_name || p?.first || ''} ${p?.last_name || p?.last || ''}`,
        ).trim()
        map.set(id, {
          full_name: name || id,
          position: String(p?.position || p?.pos || ''),
          team: String(p?.team || ''),
          injury_status: p?.injury_status ? String(p.injury_status) : null,
          eligible: Array.isArray(p?.fantasy_positions) ? p!.fantasy_positions!.map(String).filter(Boolean) : [],
        })
      } catch {
        map.set(id, { full_name: id, position: '', team: '' })
      }
    }
  }
  const workers = Math.min(8, unique.length)
  if (workers > 0) await Promise.all(Array.from({ length: workers }, () => worker()))
  return map
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
    waiver_position?: number
    waiver_budget_used?: number
  }
}

type SleeperMatchup = {
  roster_id: number
  matchup_id: number | null
  points?: number
  players_points?: Record<string, number>
}

/**
 * Sleeper waiver rules in the Edge shape. `waiver_type` 2 is FAAB, 1 reverse standings, 0 rolling.
 * `waiver_day_of_week` counts from Monday (2 = Wednesday, the default); Sleeper processes overnight.
 */
function sleeperWaiver(raw: unknown) {
  const st = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const type = Number(st.waiver_type)
  const daily = Number(st.daily_waivers) === 1
  const dow = Number(st.waiver_day_of_week)
  return {
    type: type === 2 ? 'faab' : type === 1 ? 'reverse' : 'rolling',
    budget: type === 2 ? Number(st.waiver_budget) || null : null,
    days: daily ? [0, 1, 2, 3, 4, 5, 6] : [Number.isFinite(dow) ? (dow + 1) % 7 : 3],
    hour_et: 3,
    waiver_hours: Number(st.waiver_clear_days) ? Number(st.waiver_clear_days) * 24 : null,
  }
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
    const { data: primaryRows } = await admin
      .from('fantasy_leagues')
      .select('id')
      .eq('user_id', edgeUserId)
      .eq('is_primary', true)
      .limit(1)
    const userHasPrimary = Boolean(primaryRows?.length)

    let primaryLeagueId: string | null = null
    const { data: existingConn } = await admin
      .from('fantasy_connections')
      .select('primary_league_id')
      .eq('id', connectionId)
      .maybeSingle()
    primaryLeagueId = existingConn?.primary_league_id ? String(existingConn.primary_league_id) : null

    let leaguesFound = 0
    let season = new Date().getFullYear()
    let week = 1

    for (const sport of ['nfl', 'nba'] as const) {
      const state = sport === 'nfl'
        ? await fetchNflState()
        : await sleeperGet<{ season: string; week: number }>(`/state/${sport}`)
      season = Number(state.season)
      week = Math.max(1, Number(state.week) || 1)
      if (!Number.isFinite(season)) continue

      const leagues = await sleeperGet<SleeperLeague[]>(
        `/user/${encodeURIComponent(sleeperUserId)}/leagues/${sport}/${season}`,
      )
      const list = Array.isArray(leagues) ? leagues : []
      leaguesFound += list.length

      // Drop this sport's other seasons. Leave the other sport's rows alone.
      await admin.from('fantasy_leagues').delete().eq('connection_id', connectionId).eq('sport', sport).neq('season', season)

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
            sport,
            scoring: lg.scoring_settings && typeof lg.scoring_settings === 'object' ? lg.scoring_settings : {},
            settings: {
              ...(lg.settings && typeof lg.settings === 'object' ? lg.settings : {}),
              roster_positions: Array.isArray(lg.roster_positions) ? lg.roster_positions : [],
              waiver: sleeperWaiver(lg.settings),
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
      let nbaById = new Map<string, NamedPlayer>()
      if (sport === 'nba') {
        const ids: string[] = []
        for (const roster of rosters || []) {
          for (const id of roster.players || []) ids.push(String(id))
        }
        nbaById = await loadNbaPlayers(ids)
      }

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
              metadata: {
                sleeper_roster_id: r.roster_id,
                owner_id: ownerId || null,
                waiver: {
                  rank: Number(r.settings?.waiver_position) || null,
                  faab_left: sleeperWaiver(lg.settings).type === 'faab'
                    ? (Number((lg.settings as Record<string, unknown> | undefined)?.waiver_budget) || 0) - (Number(r.settings?.waiver_budget_used) || 0)
                    : null,
                },
              },
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

        const starterOrder = (r.starters || []).map(String)
        const starters = new Set(starterOrder.filter((id) => id && id !== '0'))
        const reserve = new Set((r.reserve || []).map(String).filter(Boolean))
        const taxi = new Set((r.taxi || []).map(String).filter(Boolean))
        const players = (r.players || []).map(String).filter((id) => id && id !== '0')
        const slotNames = Array.isArray(lg.roster_positions) ? lg.roster_positions.map((s) => String(s || 'UTIL')) : []
        const lineupLabel = (pid: string) => {
          const idx = starterOrder.indexOf(pid)
          if (idx < 0) return 'BN'
          const name = slotNames[idx] || 'UTIL'
          const earlier = starterOrder.slice(0, idx).filter((id, i) => id !== '0' && (slotNames[i] || 'UTIL') === name).length
          const label = earlier ? `${name}${earlier + 1}` : name
          return `${String(idx).padStart(2, '0')}:${label}`
        }

        // NFL names come from nfl_players. NBA ids are a different set, so look them up on Sleeper.
        const named = new Map<string, NamedPlayer>()
        if (sport === 'nba') {
          for (const id of players) {
            const row = nbaById.get(id)
            if (row) named.set(id, row)
          }
        } else if (players.length) {
          const { data: nflRows } = await admin
            .from('nfl_players')
            .select('sleeper_id, full_name, position, team')
            .in('sleeper_id', players)
          for (const p of nflRows || []) {
            named.set(String(p.sleeper_id), {
              full_name: String(p.full_name || ''),
              position: String(p.position || ''),
              team: String(p.team || ''),
            })
          }
        }

        const weekPoints = (matchups || []).find((m) => m?.roster_id === r.roster_id)?.players_points || {}
        const rosterInserts = players.map((pid, idx) => {
          const meta = named.get(pid)
          const slot = slotForPlayer(pid, starters, reserve, taxi)
          return {
            team_id: teamRow.id,
            user_id: edgeUserId,
            week,
            sleeper_id: pid,
            player_name: meta?.full_name || pid,
            position: meta?.position || null,
            nfl_team: meta?.team || null,
            slot,
            // NFL: `slot:idx`, plus the lineup slot a starter fills (`starter:3:FLEX`) from roster_positions order.
            slot_label:
              sport === 'nba'
                ? lineupLabel(pid)
                : `${slot}:${idx}${slot === 'starter' && slotNames[starterOrder.indexOf(pid)] ? `:${slotNames[starterOrder.indexOf(pid)]}` : ''}`,
            ...(sport === 'nba'
              ? {
                week_points: Number.isFinite(Number(weekPoints[pid])) ? Number(weekPoints[pid]) : null,
                injury_status: meta?.injury_status || null,
                eligible_positions: meta?.eligible?.length ? meta.eligible : null,
              }
              : {}),
          }
        })
        if (rosterInserts.length) {
          const { error: rostErr } = await admin.from('fantasy_rosters').insert(rosterInserts)
          if (rostErr) throw new Error(rostErr.message)
        }
      }

      await admin.from('fantasy_matchups').delete().eq('league_id', leagueId).eq('week', week)
      const groups = new Map<string, SleeperMatchup[]>()
      for (const m of matchups || []) {
        if (m?.matchup_id == null || m.roster_id == null) continue
        const key = String(m.matchup_id)
        const list = groups.get(key) || []
        list.push(m)
        groups.set(key, list)
      }
      for (const [mid, list] of groups) {
        const a = list[0]
        const b = list.find((m) => m.roster_id !== a.roster_id) || null
        const aId = teamIdByRoster.get(a.roster_id) || null
        const bId = b ? teamIdByRoster.get(b.roster_id) || null : null
        if (!aId) continue
        const { error: muErr } = await admin.from('fantasy_matchups').upsert(
          {
            league_id: leagueId,
            user_id: edgeUserId,
            week,
            mine_team_id: aId,
            opp_team_id: bId,
            mine_score: a.points != null ? Number(a.points) : null,
            opp_score: b?.points != null ? Number(b.points) : null,
            external_matchup_id: mid,
          },
          { onConflict: 'league_id,week,mine_team_id' },
        )
        if (muErr) throw new Error(muErr.message)
      }

      // NBA must not steal the NFL primary used for game-hub pins.
      if (!primaryLeagueId && mineTeamId && (sport === 'nfl' || !userHasPrimary)) primaryLeagueId = leagueId
    }
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
      leagues: leaguesFound,
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

/** sleeper_ids for mine + enemy starters in the user's primary league this NFL week (any provider). */
export async function hubPinsForUser(
  admin: SupabaseClient,
  edgeUserId: string,
): Promise<{ week: number; mine: string[]; enemy: string[]; leagueId: string | null }> {
  const state = await fetchNflState()
  const week = Math.max(1, Number(state.week) || 1)

  const { data: primaryLeague } = await admin
    .from('fantasy_leagues')
    .select('id, sport')
    .eq('user_id', edgeUserId)
    .eq('is_primary', true)
    .maybeSingle()

  let leagueId = primaryLeague?.id ? String(primaryLeague.id) : null
  if (primaryLeague?.sport && primaryLeague.sport !== 'nfl') leagueId = null
  if (!leagueId) {
    const { data: conn } = await admin
      .from('fantasy_connections')
      .select('primary_league_id')
      .eq('user_id', edgeUserId)
      .eq('status', 'active')
      .not('primary_league_id', 'is', null)
      .order('last_sync_at', { ascending: false, nullsFirst: false })
      .limit(1)
      .maybeSingle()
    leagueId = conn?.primary_league_id ? String(conn.primary_league_id) : null
  }

  if (!leagueId) {
    return { week, mine: [], enemy: [], leagueId: null }
  }

  // Prefer matchup row for Sleeper state week; else latest matchup for that league.
  let matchup =
    (
      await admin
        .from('fantasy_matchups')
        .select('mine_team_id, opp_team_id, week')
        .eq('league_id', leagueId)
        .eq('week', week)
        .maybeSingle()
    ).data || null
  if (!matchup) {
    matchup =
      (
        await admin
          .from('fantasy_matchups')
          .select('mine_team_id, opp_team_id, week')
          .eq('league_id', leagueId)
          .order('week', { ascending: false })
          .limit(1)
          .maybeSingle()
      ).data || null
  }

  const pinWeek = matchup?.week != null ? Number(matchup.week) : week
  const mineTeam = matchup?.mine_team_id ? String(matchup.mine_team_id) : null
  const oppTeam = matchup?.opp_team_id ? String(matchup.opp_team_id) : null

  const loadStarters = async (teamId: string | null) => {
    if (!teamId) return [] as string[]
    const { data } = await admin
      .from('fantasy_rosters')
      .select('sleeper_id')
      .eq('team_id', teamId)
      .eq('week', pinWeek)
      .eq('slot', 'starter')
    return (data || []).map((r) => String(r.sleeper_id || '').trim()).filter(Boolean)
  }

  const [mine, enemy] = await Promise.all([loadStarters(mineTeam), loadStarters(oppTeam)])
  return { week: pinWeek, mine, enemy, leagueId }
}
