/**
 * ESPN Fantasy Connect. Session cookie only (espn_s2 + SWID). Password is never accepted or stored.
 * League reads: lm-api-reads.fantasy.espn.com v3. Players map onto nfl_players.sleeper_id by name + team.
 * NBA (`games/fba`, fan-profile game id 3) syncs in a second pass: Sleeper NBA ids (shared map), points or
 * categories rules, daily lineup slots, eligible positions, injuries, and per-matchup category results
 * (`fantasy_matchups.categories`). ESPN numbers the NBA season by its end year; it is saved by its start year
 * (Sleeper / Yahoo). An NBA failure never fails the NFL sync.
 */
import { addSchedulePair, saveLeagueSchedule, type ScheduleWeeks } from './fantasySchedule.ts'
import { pruneMissingLeagues } from './fantasyLeaguePrune.ts'
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2'
import { type NbaPlayer, sleeperNbaPlayers } from './sleeperNbaPlayers.ts'
import { loadNbaBoard } from './fantasyNbaBoard.ts'
// The app's categories math (plain ESM): category-value weights the points engines score with.
import { categoryWeights } from '../../../src/features/fantasy/fantasyCategories.js'

const READS_BASE = 'https://lm-api-reads.fantasy.espn.com/apis/v3/games'
const READS = `${READS_BASE}/ffl`
const FAN = 'https://fan.api.espn.com/apis/v2/fans'
/** ESPN fantasy preference types (league manager + regular member). NFL game id is 1. */
const FAN_PREF_TYPES = new Set([9, 10])
const NFL_GAME_ID = 1
const NBA_GAME_ID = 3

const NBA_PRO_TEAM: Record<number, string> = {
  1: 'ATL', 2: 'BOS', 3: 'NOP', 4: 'CHI', 5: 'CLE', 6: 'DAL', 7: 'DEN', 8: 'DET', 9: 'GSW', 10: 'HOU',
  11: 'IND', 12: 'LAC', 13: 'LAL', 14: 'MIA', 15: 'MIL', 16: 'MIN', 17: 'BKN', 18: 'NYK', 19: 'ORL', 20: 'PHI',
  21: 'PHX', 22: 'POR', 23: 'SAC', 24: 'SAS', 25: 'OKC', 26: 'UTA', 27: 'WAS', 28: 'TOR', 29: 'MEM', 30: 'CHA',
}
const NBA_POS: Record<number, string> = { 1: 'PG', 2: 'SG', 3: 'SF', 4: 'PF', 5: 'C' }
/** ESPN NBA `lineupSlotId` → app slot (12 bench, 13 IR). */
const NBA_SLOT: Record<number, string> = { 0: 'PG', 1: 'SG', 2: 'SF', 3: 'PF', 4: 'C', 5: 'G', 6: 'F', 7: 'SG/SF', 8: 'G/F', 9: 'PF/C', 10: 'F/C', 11: 'UTIL' }
/** ESPN NBA stat ids → Sleeper NBA stat keys (checked against a season line: 13/14 = 19, 6 = 4 + 5). */
const NBA_STAT: Record<number, string> = {
  0: 'pts', 1: 'blk', 2: 'stl', 3: 'ast', 4: 'oreb', 5: 'dreb', 6: 'reb', 8: 'ff', 9: 'pf', 10: 'tf', 11: 'to',
  13: 'fgm', 14: 'fga', 15: 'ftm', 16: 'fta', 17: 'tpm', 18: 'tpa', 19: 'fg_pct', 20: 'ft_pct', 21: 'tp_pct',
  23: 'fgmi', 24: 'ftmi', 25: 'tpmi', 37: 'dd', 38: 'td',
}
const NBA_INJURY: Record<string, string> = { OUT: 'Out', DAY_TO_DAY: 'DTD', QUESTIONABLE: 'Questionable', DOUBTFUL: 'Doubtful', SUSPENSION: 'Sus', INJURY_RESERVE: 'IR' }

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

async function espnGet(path: string, session: EspnSession, game = 'ffl'): Promise<unknown> {
  const res = await fetch(`${READS_BASE}/${game}${path}`, {
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

type FanLeagueRef = { id: string; name: string; season: number }

/**
 * ESPN's site lists "my leagues" on the fan profile, not on the season URL (that one is `{}`).
 * `season` null keeps each entry's own season (NBA spans two years; ESPN files it under the end year).
 */
async function listFanLeagueRefs(session: EspnSession, season: number | null, gameIdWanted = NFL_GAME_ID): Promise<FanLeagueRef[]> {
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
    if (gameId && gameId !== gameIdWanted) continue
    const entrySeason = Number(entry.seasonId) || season || 0
    if (season != null && entrySeason !== season) continue
    const groups = Array.isArray(entry.groups) ? entry.groups : []
    const group = asRecord(groups[0])
    const idNum = Math.abs(Number(group?.groupId))
    if (!idNum) continue
    const id = String(idNum)
    if (seen.has(id)) continue
    seen.add(id)
    const name = String(group?.groupName || `ESPN ${id}`).trim() || `ESPN ${id}`
    out.push({ id, name, season: entrySeason })
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
  // ESPN writes "Travis Etienne Jr." Sleeper stores "Travis Etienne".
  return value
    .toLowerCase()
    .replace(/\b(jr|sr|iii|ii|iv|v)\b/g, '')
    .replace(/[^a-z]/g, '')
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

const ESPN_DAY: Record<string, number> = { SUNDAY: 0, MONDAY: 1, TUESDAY: 2, WEDNESDAY: 3, THURSDAY: 4, FRIDAY: 5, SATURDAY: 6 }

/** League waiver rules in the Edge shape: type, FAAB budget, and when claims process (ET day + hour). */
function espnWaiver(settings: Record<string, unknown>) {
  const acq = asRecord(settings.acquisitionSettings) || {}
  const faab = acq.isUsingAcquisitionBudget === true
  const days = (Array.isArray(acq.waiverProcessDays) ? acq.waiverProcessDays : [])
    .map((d) => ESPN_DAY[String(d).toUpperCase()])
    .filter((d) => d != null)
  const hour = Number(acq.waiverProcessHour)
  return {
    type: faab ? 'faab' : String(acq.acquisitionType || '').toUpperCase().includes('CONTINUOUS') ? 'continuous' : 'rolling',
    budget: faab ? Number(acq.acquisitionBudget) || null : null,
    days,
    hour_et: Number.isFinite(hour) ? hour : null,
    waiver_hours: Number(acq.waiverHours) || null,
  }
}

/**
 * NBA add / games limits from mSettings: `add_limit` (adds per matchup, or per day when ESPN counts them per scoring
 * period), `season_add_limit`, and `games_limit` (games played per starting seat, stat 42, season-long leagues).
 */
function espnNbaLimits(settings: Record<string, unknown>) {
  const acq = asRecord(settings.acquisitionSettings) || {}
  const perMatchup = Number(acq.matchupAcquisitionLimit)
  const season = Number(acq.acquisitionLimit)
  // ESPN caps a slot group's total (3 UTIL seats share 243), so the per-seat cap is the limit over its seat count.
  const roster = asRecord(settings.rosterSettings) || {}
  const seats = asRecord(roster.lineupSlotCounts) || {}
  const perSeat: number[] = []
  for (const [slotId, raw] of Object.entries(asRecord(roster.lineupSlotStatLimits) || {})) {
    const l = asRecord(raw)
    const count = Number(seats[slotId]) || 0
    if (Number(l?.statId) !== 42 || !NBA_SLOT[Number(slotId)] || count <= 0) continue
    const cap = Math.round((Number(l?.limitValue) || 0) / count)
    if (cap > 0) perSeat.push(cap)
  }
  const tally = new Map<number, number>()
  for (const cap of perSeat) tally.set(cap, (tally.get(cap) || 0) + 1)
  const games = [...tally.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0]?.[0] || 0
  return {
    ...(perMatchup > 0 ? { add_limit: { count: perMatchup, per: acq.matchupLimitPerScoringPeriod ? 'day' : 'week' } } : {}),
    ...(season > 0 ? { season_add_limit: season } : {}),
    ...(games > 0 ? { games_limit: games } : {}),
  }
}

/** My adds against the limit: this scoring period (day limits) or matchup (week limits), stamped with the ET day read. */
function espnTeamAdds(team: Record<string, unknown>, settings: Record<string, unknown>, status: Record<string, unknown>) {
  const acq = asRecord(settings.acquisitionSettings) || {}
  const perDay = Boolean(acq.matchupLimitPerScoringPeriod)
  const counter = asRecord(team.transactionCounter) || {}
  const totals = asRecord(counter.matchupAcquisitionTotals) || {}
  const key = perDay ? Number(status.latestScoringPeriod) || 0 : Number(status.currentMatchupPeriod) || 0
  return {
    used: Number(totals[String(key)]) || 0,
    per: perDay ? 'day' : 'week',
    period: key || null,
    season_used: Number(counter.acquisitions) || 0,
    as_of: etDateOffset(0),
  }
}

function espnTeamWaiver(team: Record<string, unknown>, settings: Record<string, unknown>) {
  const acq = asRecord(settings.acquisitionSettings) || {}
  const spent = Number(asRecord(team.transactionCounter)?.acquisitionBudgetSpent)
  const budget = Number(acq.acquisitionBudget)
  const rank = Number(team.waiverRank)
  return {
    rank: Number.isFinite(rank) && rank > 0 ? rank : null,
    faab_left: acq.isUsingAcquisitionBudget === true && Number.isFinite(budget) ? budget - (Number.isFinite(spent) ? spent : 0) : null,
  }
}

/** ESPN `lineupSlotId` → Edge slot name. Bench (20), IR (21), and IDP slots are not lineup slots we optimize. */
const ESPN_LINEUP_SLOT: Record<number, string> = {
  0: 'QB',
  2: 'RB',
  3: 'WRRB_FLEX',
  4: 'WR',
  5: 'REC_FLEX',
  6: 'TE',
  7: 'SUPER_FLEX',
  16: 'DEF',
  17: 'K',
  23: 'FLEX',
}

/** Starting slots from `settings.rosterSettings.lineupSlotCounts` (mSettings), e.g. ['QB','RB','RB','WR','WR','TE','FLEX','DEF','K']. */
/** Regular season length + playoff team count, saved under Sleeper's key names. */
function espnPlayoffs(settings: Record<string, unknown>): { playoff_week_start?: number; playoff_teams?: number } {
  const sched = asRecord(settings.scheduleSettings)
  const regular = Number(sched?.matchupPeriodCount)
  const teams = Number(sched?.playoffTeamCount)
  return {
    ...(Number.isFinite(regular) && regular > 0 ? { playoff_week_start: regular + 1 } : {}),
    ...(Number.isFinite(teams) && teams > 0 ? { playoff_teams: teams } : {}),
  }
}

function espnLineupSlots(settings: Record<string, unknown>): string[] {
  const roster = asRecord(settings.rosterSettings)
  const counts = asRecord(roster?.lineupSlotCounts)
  if (!counts) return []
  const out: string[] = []
  for (const [id, raw] of Object.entries(counts)) {
    const name = ESPN_LINEUP_SLOT[Number(id)]
    const n = Number(raw)
    if (!name || !Number.isFinite(n) || n <= 0) continue
    for (let i = 0; i < n; i++) out.push(name)
  }
  return out
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
    const { data: existingPrimary } = await admin
      .from('fantasy_leagues')
      .select('id')
      .eq('user_id', edgeUserId)
      .eq('is_primary', true)
      .limit(1)
    const userHasPrimary = Boolean(existingPrimary?.length)

    // NBA rides a second pass; a failure there never fails the NFL sync.
    const nba = await syncEspnNba(admin, edgeUserId, connectionId, session).catch((err) => {
      console.error('espn nba sync', connectionId, err instanceof Error ? err.message : err)
      return { leagues: 0, firstMineLeague: null as string | null }
    })

    if (!leagues.length && !nba.leagues) {
      await admin
        .from('fantasy_connections')
        .update({
          status: 'error',
          last_error: 'No ESPN NFL or NBA leagues on this account.',
          last_sync_at: new Date().toISOString(),
        })
        .eq('id', connectionId)
      return { ok: false, error: 'No ESPN NFL or NBA leagues on this account.', season, leagues: 0 }
    }

    await admin.from('fantasy_leagues').delete().eq('connection_id', connectionId).eq('sport', 'nfl').neq('season', season)
    // This season's NFL leagues no longer on the fan profile (left / deleted).
    await pruneMissingLeagues(admin, connectionId, 'nfl', [...refs.map((r) => r.id), ...leagues.map((l) => String(l.id ?? ''))])

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
            settings: {
              size: settings.size ?? null,
              lineup_slots: espnLineupSlots(settings),
              waiver: espnWaiver(settings),
              ...espnPlayoffs(settings),
            },
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
              metadata: { espn_team_id: team.id ?? null, waiver: espnTeamWaiver(team, settings) },
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
            // `slot:espnPlayerId` (pending trades read the id), plus the lineup slot a starter fills (`starter:123:FLEX`).
            slot_label: `${slot}:${espnPlayerId}${slot === 'starter' && ESPN_LINEUP_SLOT[lineupSlot] ? `:${ESPN_LINEUP_SLOT[lineupSlot]}` : ''}`,
          })
        }
        if (inserts.length) {
          const { error: rostErr } = await admin.from('fantasy_rosters').insert(inserts)
          if (rostErr) throw new Error(rostErr.message)
        }
      }

      if (mineTeamId && !firstMineLeague) firstMineLeague = leagueId
      await admin.from('fantasy_matchups').delete().eq('league_id', leagueId).eq('week', week)
      const schedule = Array.isArray(lg.schedule) ? lg.schedule : []
      const seenPairs = new Set<string>()
      for (const rowRaw of schedule) {
        const row = asRecord(rowRaw)
        if (!row || Number(row.matchupPeriodId) !== week) continue
        const home = asRecord(row.home)
        const away = asRecord(row.away)
        const homeId = teamIdByEspn.get(String(home?.teamId ?? '')) || null
        const awayId = teamIdByEspn.get(String(away?.teamId ?? '')) || null
        if (!homeId && !awayId) continue
        const pairKey = [homeId, awayId].filter(Boolean).sort().join(':')
        if (seenPairs.has(pairKey)) continue
        seenPairs.add(pairKey)
        const leftId = homeId || awayId
        const rightId = homeId && awayId ? awayId : null
        const { error: muErr } = await admin.from('fantasy_matchups').upsert(
          {
            league_id: leagueId,
            user_id: edgeUserId,
            week,
            mine_team_id: leftId,
            opp_team_id: rightId,
            mine_score: num(homeId ? home?.totalPoints : away?.totalPoints),
            opp_score: rightId ? num(away?.totalPoints) : null,
            external_matchup_id: row.id != null ? String(row.id) : pairKey,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'league_id,week,mine_team_id' },
        )
        if (muErr) throw new Error(muErr.message)
      }
      await saveLeagueSchedule(admin, leagueId, espnRemainingSchedule(schedule, teamIdByEspn, week)).catch(() => {})
    }

    if (!firstMineLeague) firstMineLeague = nba.firstMineLeague
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

    return { ok: true, connectionId, season, week: defaultWeek, leagues: created + nba.leagues }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'ESPN sync failed.'
    await admin
      .from('fantasy_connections')
      .update({ status: 'error', last_error: message.slice(0, 400), last_sync_at: new Date().toISOString() })
      .eq('id', connectionId)
    return { ok: false, connectionId, error: message }
  }
}

/** US Eastern date `days` from today (YYYY-MM-DD). */
function etDateOffset(days: number): string {
  const fmt = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' })
  const [y, m, d] = fmt.format(new Date()).split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10)
}

function nbaNameKey(name: string): string {
  return String(name || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\b(jr|sr|ii|iii|iv|v)\b/g, '')
    .replace(/[^a-z]/g, '')
}

function nbaIndexOf(players: NbaPlayer[]): Map<string, NbaPlayer[]> {
  const index = new Map<string, NbaPlayer[]>()
  for (const p of players) {
    const key = nbaNameKey(p.name)
    if (key) index.set(key, [...(index.get(key) || []), p])
  }
  return index
}

function nbaSleeperId(index: Map<string, NbaPlayer[]>, name: string, team: string): string | null {
  const rows = index.get(nbaNameKey(name)) || []
  if (rows.length <= 1) return rows[0]?.sleeper_id || null
  return (rows.find((r) => r.team === team) || rows[0]).sleeper_id
}

/** Category totals by Sleeper stat key from ESPN `scoreByStat` ({ statId: { score, result } }). */
function nbaCategoryTotals(side: Record<string, unknown> | null) {
  const by = asRecord(asRecord(side?.cumulativeScore)?.scoreByStat) || {}
  const totals: Record<string, number> = {}
  const results: Record<string, string> = {}
  for (const [id, raw] of Object.entries(by)) {
    const key = NBA_STAT[Number(id)]
    const row = asRecord(raw)
    if (!key || !row) continue
    const score = num(row.score)
    if (score != null) totals[key] = score
    if (row.result) results[key] = String(row.result)
  }
  return { totals, results }
}

/**
 * ESPN NBA leagues for this session (fan profile game id 3): league, teams, today's lineup, and this matchup
 * period's results. Points leagues keep `scoring`; categories leagues save `settings.categories` and per-matchup
 * category totals, with category wins as the matchup score.
 */
async function syncEspnNba(
  admin: SupabaseClient,
  edgeUserId: string,
  connectionId: string,
  session: EspnSession,
): Promise<{ leagues: number; firstMineLeague: string | null }> {
  const refs = await listFanLeagueRefs(session, null, NBA_GAME_ID)
  if (!refs.length) return { leagues: 0, firstMineLeague: null }
  // NBA leagues no longer on the fan profile (left / deleted).
  await pruneMissingLeagues(admin, connectionId, 'nba', refs.map((r) => r.id))
  const index = nbaIndexOf(await sleeperNbaPlayers(admin).catch(() => [] as NbaPlayer[]))
  const mineKey = swidKey(session.swid)
  const views = 'view=mTeam&view=mRoster&view=mMatchup&view=mSettings&view=mStatus&view=mMatchupScore'
  let count = 0
  let firstMineLeague: string | null = null
  for (const ref of refs) {
    const lg = asRecord(await espnGet(`/seasons/${ref.season}/segments/0/leagues/${encodeURIComponent(ref.id)}?${views}`, session, 'fba'))
    if (!lg) continue
    const settings = asRecord(lg.settings) || {}
    const status = asRecord(lg.status) || {}
    const scoringSettings = asRecord(settings.scoringSettings) || {}
    const scoringType = String(scoringSettings.scoringType || '')
    // H2H_CATEGORY, H2H_MOST_CATEGORIES (one win a week for more categories won), ROTO.
    const categoriesLeague = /CATEGOR|ROTO/.test(scoringType)
    const items = Array.isArray(scoringSettings.scoringItems) ? scoringSettings.scoringItems.map(asRecord).filter(Boolean) as Record<string, unknown>[] : []
    const scoring: Record<string, number> = {}
    const categories: Array<{ stat_id: number; key: string; label: string; higher_better: boolean }> = []
    for (const item of items) {
      const id = Number(item.statId)
      const key = NBA_STAT[id]
      if (!key) continue
      if (categoriesLeague) categories.push({ stat_id: id, key, label: key.toUpperCase().replace('_PCT', '%'), higher_better: item.isReverseItem !== true })
      else if (num(item.points) != null) scoring[key] = Number(item.points)
    }
    // Categories leagues score "category value" (z-score weights from this week's per-game projections).
    let categoryPct: Record<string, number> = {}
    if (categoriesLeague && categories.length) {
      const board = await loadNbaBoard().catch(() => null)
      const cw = categoryWeights(categories, Object.values(board?.projLine || {}))
      Object.assign(scoring, cw.weights)
      categoryPct = cw.pct
    }
    const roster = asRecord(settings.rosterSettings) || {}
    const lineupSlots: string[] = []
    for (const [id, raw] of Object.entries(asRecord(roster.lineupSlotCounts) || {})) {
      const name = NBA_SLOT[Number(id)]
      for (let i = 0; name && i < (Number(raw) || 0); i++) lineupSlots.push(name)
    }
    const week = Math.max(1, Number(status.currentMatchupPeriod) || 1)
    const espnSeason = Number(lg.seasonId) || ref.season
    // ESPN NBA scoring periods are days. Before the first one (`firstScoringPeriod` > today's `latestScoringPeriod`)
    // the first matchup is upcoming; its first day is today plus the gap.
    const firstDay = Number(status.firstScoringPeriod) || 0
    const today = Number(status.latestScoringPeriod) || 0
    const matchupWeekStart = firstDay > today && today > 0 ? etDateOffset(firstDay - today) : null
    const { data: leagueRow, error: lgErr } = await admin
      .from('fantasy_leagues')
      .upsert(
        {
          connection_id: connectionId,
          user_id: edgeUserId,
          provider: 'espn',
          external_league_id: ref.id,
          name: String(settings.name || ref.name || `ESPN ${ref.id}`).trim(),
          season: espnSeason - 1,
          sport: 'nba',
          scoring,
          settings: {
            size: settings.size ?? null,
            espn_season: espnSeason,
            scoring_type: scoringType,
            categories,
            ...(categoriesLeague ? { category_value: true, category_pct: categoryPct } : {}),
            daily_lineups: String(roster.lineupLocktimeType || '') !== 'WEEKLY',
            lineup_slots: lineupSlots,
            ...(matchupWeekStart ? { matchup_week_start: matchupWeekStart } : {}),
            current_week: week,
            waiver: espnWaiver(settings),
            ...espnPlayoffs(settings),
            ...espnNbaLimits(settings),
          },
        },
        { onConflict: 'connection_id,external_league_id' },
      )
      .select('id')
      .single()
    if (lgErr || !leagueRow?.id) throw new Error(lgErr?.message || 'NBA league save failed.')
    const leagueId = String(leagueRow.id)
    count += 1

    const teamIdByEspn = new Map<string, string>()
    for (const team of (Array.isArray(lg.teams) ? lg.teams : []).map(asRecord).filter(Boolean) as Record<string, unknown>[]) {
      const externalTeamId = String(team.id ?? '').trim()
      if (!externalTeamId) continue
      const owners = Array.isArray(team.owners) ? team.owners.map((o) => swidKey(String(o))) : []
      const isMine = swidKey(String(team.primaryOwner || '')) === mineKey || owners.includes(mineKey)
      const record = asRecord(asRecord(team.record)?.overall) || {}
      // Season-long leagues (ROTO, TOTAL_SEASON_POINTS) have no matchups: the standings view reads ESPN's own total
      // (`points`: roto points or season points) and each category's season value.
      const seasonLong = scoringType === 'ROTO' || scoringType === 'TOTAL_SEASON_POINTS'
      const standings = seasonLong
        ? {
            points: num(team.points),
            stats: Object.fromEntries(
              Object.entries(asRecord(team.valuesByStat) || {})
                .map(([id, v]) => [NBA_STAT[Number(id)], num(v)])
                .filter(([k, v]) => k && v != null),
            ),
          }
        : null
      const { data: teamRow, error: teamErr } = await admin
        .from('fantasy_teams')
        .upsert(
          {
            league_id: leagueId,
            user_id: edgeUserId,
            external_team_id: externalTeamId,
            owner_name: String(team.abbrev || '').trim(),
            team_name: String(team.name || team.abbrev || `Team ${externalTeamId}`).trim(),
            avatar_url: typeof team.logo === 'string' ? team.logo : null,
            is_mine: isMine,
            wins: Number(record.wins) || 0,
            losses: Number(record.losses) || 0,
            ties: Number(record.ties) || 0,
            points_for: num(record.pointsFor),
            points_against: num(record.pointsAgainst),
            metadata: {
              espn_team_id: team.id ?? null,
              waiver: espnTeamWaiver(team, settings),
              ...(isMine ? { adds: espnTeamAdds(team, settings, status) } : {}),
              ...(standings ? { standings } : {}),
            },
          },
          { onConflict: 'league_id,external_team_id' },
        )
        .select('id')
        .single()
      if (teamErr || !teamRow?.id) throw new Error(teamErr?.message || 'NBA team save failed.')
      teamIdByEspn.set(externalTeamId, String(teamRow.id))
      if (isMine && !firstMineLeague) firstMineLeague = leagueId

      const rows = []
      for (const entryRaw of (Array.isArray(asRecord(team.roster)?.entries) ? (asRecord(team.roster)!.entries as unknown[]) : [])) {
        const entry = asRecord(entryRaw)
        const player = asRecord(asRecord(entry?.playerPoolEntry)?.player)
        const fullName = String(player?.fullName || '').trim()
        if (!entry || !fullName) continue
        const team3 = NBA_PRO_TEAM[Number(player?.proTeamId)] || ''
        const slotId = Number(entry.lineupSlotId)
        const slot = slotId === 13 ? 'ir' : slotId === 12 ? 'bench' : 'starter'
        const elig = (Array.isArray(player?.eligibleSlots) ? player!.eligibleSlots : [])
          .map((id) => NBA_SLOT[Number(id)])
          .filter((p): p is string => Boolean(p) && !p.includes('/'))
        const injury = NBA_INJURY[String(player?.injuryStatus || entry.injuryStatus || '').toUpperCase()] || null
        rows.push({
          team_id: teamRow.id,
          user_id: edgeUserId,
          week,
          sleeper_id: nbaSleeperId(index, fullName, team3),
          player_name: fullName,
          position: NBA_POS[Number(player?.defaultPositionId)] || null,
          nfl_team: team3 || null,
          slot,
          slot_label: `${slot}:${String(entry.playerId || player?.id || fullName)}${slot === 'starter' && NBA_SLOT[slotId] ? `:${NBA_SLOT[slotId]}` : ''}`,
          injury_status: injury,
          eligible_positions: elig.length ? elig : null,
        })
      }
      // Clear and write back to back so a waiver read never sees the team empty.
      await admin.from('fantasy_rosters').delete().eq('team_id', teamRow.id).eq('week', week)
      if (rows.length) {
        const { error: rostErr } = await admin.from('fantasy_rosters').insert(rows)
        if (rostErr) throw new Error(rostErr.message)
      }
    }

    await admin.from('fantasy_matchups').delete().eq('league_id', leagueId).eq('week', week)
    for (const rowRaw of Array.isArray(lg.schedule) ? lg.schedule : []) {
      const row = asRecord(rowRaw)
      if (!row || Number(row.matchupPeriodId) !== week) continue
      const home = asRecord(row.home)
      const away = asRecord(row.away)
      const homeId = teamIdByEspn.get(String(home?.teamId ?? '')) || null
      const awayId = teamIdByEspn.get(String(away?.teamId ?? '')) || null
      if (!homeId) continue
      const left = nbaCategoryTotals(home)
      const right = nbaCategoryTotals(away)
      const cs = asRecord(home?.cumulativeScore) || {}
      const { error: muErr } = await admin.from('fantasy_matchups').upsert(
        {
          league_id: leagueId,
          user_id: edgeUserId,
          week,
          mine_team_id: homeId,
          opp_team_id: awayId,
          mine_score: categoriesLeague ? Number(cs.wins) || 0 : num(home?.totalPoints),
          opp_score: awayId ? (categoriesLeague ? Number(asRecord(away?.cumulativeScore)?.wins) || 0 : num(away?.totalPoints)) : null,
          categories: categoriesLeague
            ? { left: left.totals, right: right.totals, results: left.results, wins: Number(cs.wins) || 0, losses: Number(cs.losses) || 0, ties: Number(cs.ties) || 0 }
            : null,
          external_matchup_id: row.id != null ? String(row.id) : `${homeId}:${awayId}`,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'league_id,week,mine_team_id' },
      )
      if (muErr) throw new Error(muErr.message)
    }
    await saveLeagueSchedule(admin, leagueId, espnRemainingSchedule(lg.schedule, teamIdByEspn, week)).catch(() => {})
  }
  return { leagues: count, firstMineLeague }
}

/** Regular-season pairings after `week` from ESPN's full `schedule` (playoff bracket rows skipped). */
function espnRemainingSchedule(schedule: unknown, teamIdByEspn: Map<string, string>, week: number): ScheduleWeeks {
  const weeks: ScheduleWeeks = {}
  for (const rowRaw of Array.isArray(schedule) ? schedule : []) {
    const row = asRecord(rowRaw)
    if (!row) continue
    const tier = String(row.playoffTierType || 'NONE')
    if (tier !== 'NONE') continue
    const period = Number(row.matchupPeriodId)
    addSchedulePair(
      weeks,
      period,
      teamIdByEspn.get(String(asRecord(row.home)?.teamId ?? '')) || null,
      teamIdByEspn.get(String(asRecord(row.away)?.teamId ?? '')) || null,
      week + 1,
    )
  }
  return weeks
}

export type PendingTradeItem = {
  from_team_id: string | null
  to_team_id: string | null
  external_player_id: string
  sleeper_id: string | null
  player_name: string | null
  position: string | null
  nfl_team: string | null
}

export type PendingTrade = {
  id: string
  proposer_team_id: string | null
  proposed_at: string | null
  expires_at: string | null
  accepted_by: string[]
  items: PendingTradeItem[]
}

/**
 * Live trade proposals that involve the caller's team. ESPN files proposals under the scoring period they were
 * made in, so read this week and last week, keep PENDING ones that have not expired, and map ESPN player ids to
 * the synced roster rows (`slot_label` = `slot:espnPlayerId`).
 */
export async function espnPendingTrades(
  admin: SupabaseClient,
  edgeUserId: string,
  league: { id: string; connection_id: string; external_league_id: string; season: number; sport?: string; espn_season?: number | null },
): Promise<PendingTrade[]> {
  const { data: token } = await admin
    .from('fantasy_provider_tokens')
    .select('access_token, refresh_token, token_type')
    .eq('connection_id', league.connection_id)
    .maybeSingle()
  const session = normalizeEspnSession(String(token?.access_token || ''), String(token?.refresh_token || ''))
  if (!session || token?.token_type !== 'espn_cookie') throw new Error('ESPN session missing. Connect ESPN again.')

  // NBA reads games/fba under ESPN's own season (the year the season ends); we save the start year.
  const nba = String(league.sport || '').toLowerCase() === 'nba'
  const game = nba ? 'fba' : 'ffl'
  const season = nba ? Number(league.espn_season) || league.season + 1 : league.season
  const base = `/seasons/${season}/segments/0/leagues/${encodeURIComponent(league.external_league_id)}`
  const head = asRecord(await espnGet(`${base}?view=mTransactions2&view=mTeam`, session, game)) || {}
  const period = Number(head.scoringPeriodId) || 1
  const txs: Record<string, unknown>[] = (Array.isArray(head.transactions) ? head.transactions : []).map(asRecord).filter(Boolean) as Record<string, unknown>[]
  if (period > 1) {
    const prev = asRecord(await espnGet(`${base}?scoringPeriodId=${period - 1}&view=mTransactions2`, session, game).catch(() => null))
    for (const t of Array.isArray(prev?.transactions) ? prev.transactions : []) {
      const rec = asRecord(t)
      if (rec) txs.push(rec)
    }
  }

  const mineKey = swidKey(session.swid)
  const espnTeams = (Array.isArray(head.teams) ? head.teams : []).map(asRecord).filter(Boolean) as Record<string, unknown>[]
  const myEspnTeam = espnTeams.find((t) =>
    swidKey(String(t.primaryOwner || '')) === mineKey ||
    (Array.isArray(t.owners) && t.owners.some((o) => swidKey(String(o)) === mineKey)))
  const myExt = myEspnTeam ? String(myEspnTeam.id) : null
  if (!myExt) return []

  const now = Date.now()
  const seen = new Set<string>()
  const open = txs.filter((t) => {
    const id = String(t.id || '')
    if (!id || seen.has(id)) return false
    seen.add(id)
    if (t.type !== 'TRADE_PROPOSAL' || t.status !== 'PENDING') return false
    const exp = Number(t.expirationDate)
    if (Number.isFinite(exp) && exp > 0 && exp < now) return false
    const items = Array.isArray(t.items) ? t.items.map(asRecord).filter(Boolean) as Record<string, unknown>[] : []
    const sides = new Set(items.flatMap((i) => [String(i.fromTeamId), String(i.toTeamId)]))
    return sides.has(myExt) && sides.size === 2
  })
  if (!open.length) return []

  const { data: teams } = await admin.from('fantasy_teams').select('id, external_team_id').eq('league_id', league.id)
  const teamByExt = new Map((teams || []).map((t) => [String(t.external_team_id), String(t.id)]))
  const teamIds = (teams || []).map((t) => t.id)
  const { data: rows } = teamIds.length
    ? await admin
        .from('fantasy_rosters')
        .select('team_id, week, sleeper_id, player_name, position, nfl_team, slot_label')
        .in('team_id', teamIds)
    : { data: [] as Record<string, unknown>[] }
  const latest = Math.max(0, ...(rows || []).map((r) => Number(r.week) || 0))
  const byEspn = new Map<string, Record<string, unknown>>()
  for (const r of rows || []) {
    if (Number(r.week) !== latest) continue
    const pid = String(r.slot_label || '').split(':')[1]
    if (pid) byEspn.set(pid, r)
  }

  return open.map((t) => {
    const items = (Array.isArray(t.items) ? t.items : []).map(asRecord).filter(Boolean) as Record<string, unknown>[]
    const actions = asRecord(t.teamActions) || {}
    return {
      id: String(t.id),
      proposer_team_id: teamByExt.get(String(t.teamId)) || null,
      proposed_at: Number(t.proposedDate) ? new Date(Number(t.proposedDate)).toISOString() : null,
      expires_at: Number(t.expirationDate) ? new Date(Number(t.expirationDate)).toISOString() : null,
      accepted_by: Object.entries(actions).filter(([, v]) => v === 'ACCEPTED').map(([k]) => teamByExt.get(k) || k),
      items: items.map((i) => {
        const pid = String(i.playerId ?? '')
        const row = byEspn.get(pid)
        return {
          from_team_id: teamByExt.get(String(i.fromTeamId)) || null,
          to_team_id: teamByExt.get(String(i.toTeamId)) || null,
          external_player_id: pid,
          sleeper_id: row?.sleeper_id ? String(row.sleeper_id) : null,
          player_name: row?.player_name ? String(row.player_name) : null,
          position: row?.position ? String(row.position) : null,
          nfl_team: row?.nfl_team ? String(row.nfl_team) : null,
        }
      }),
    }
  })
}
