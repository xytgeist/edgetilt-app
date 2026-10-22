/**
 * Which of this game's players the signed-in user owns, and in which NFL leagues.
 * The Fantasy list floats those players and replaces the Watch pill with the league name.
 * A trailing + means the same player is on more than one of their teams.
 */
import { useEffect, useState } from 'react'

const CHANGE_EVENT = 'edgetilt:game-hub-roster-leagues'

/** @type {Record<string, { leagues: { id: string, name: string, primary: boolean }[] }>} */
let ownedSnapshot = {}
/** @type {Record<string, Record<string, true>>} league id → sleeper ids on that week's opponent roster */
let opponentSnapshot = {}
const EMPTY_OPPONENTS = {}
let loadSeq = 0

function emit() {
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent(CHANGE_EVENT))
}

export function getRosterLeague(sleeperId) {
  const id = String(sleeperId || '').trim()
  return id ? ownedSnapshot[id] || null : null
}

/** 0 owned, 1 opponent, 2 manual watch, 3 everyone else. */
export function fantasyBoardTier({ owned = false, enemy = false, watch = false } = {}) {
  if (owned) return 0
  if (enemy) return 1
  if (watch) return 2
  return 3
}

/** Primary league name, then the rest. "+" when they own him in more than one. */
export function rosterLeaguePill(entry) {
  const leagues = entry?.leagues || []
  if (!leagues.length) return ''
  const name = String(leagues[0].name || 'League').trim() || 'League'
  const short = name.length > 14 ? `${name.slice(0, 13)}…` : name
  return leagues.length > 1 ? `${short}+` : short
}

export function rosterLeagueTitle(entry) {
  return (entry?.leagues || []).map((league) => league.name).filter(Boolean).join(', ')
}

export function useRosterLeagues() {
  const [, bump] = useState(0)
  useEffect(() => {
    const onChange = () => bump((n) => n + 1)
    window.addEventListener(CHANGE_EVENT, onChange)
    return () => window.removeEventListener(CHANGE_EVENT, onChange)
  }, [])
  return ownedSnapshot
}

export function useLeagueOpponents(leagueId) {
  const [, bump] = useState(0)
  useEffect(() => {
    const onChange = () => bump((n) => n + 1)
    window.addEventListener(CHANGE_EVENT, onChange)
    return () => window.removeEventListener(CHANGE_EVENT, onChange)
  }, [])
  const id = String(leagueId || '')
  return (id && opponentSnapshot[id]) || EMPTY_OPPONENTS
}

/**
 * Latest stored week on the user's NFL teams, then who they own among `sleeperIds`.
 * A miss leaves the map empty so the list keeps the manual Watch pins.
 */
/** `sport` picks which leagues count (Sleeper NBA and NFL player ids can collide). */
export function loadGameRosterLeagues(supabase, sleeperIds, sport = 'nfl') {
  const ids = [...new Set((sleeperIds || []).map((id) => String(id || '').trim()).filter(Boolean))].slice(0, 200)
  if (!supabase || !ids.length) {
    ownedSnapshot = {}
    opponentSnapshot = {}
    emit()
    return Promise.resolve()
  }
  const seq = ++loadSeq
  return (async () => {
    const { data: teams, error: teamErr } = await supabase
      .from('fantasy_teams')
      .select('id, league:fantasy_leagues!league_id(id, name, sport, is_primary)')
      .eq('is_mine', true)
    if (seq !== loadSeq) return
    if (teamErr) {
      ownedSnapshot = {}
      opponentSnapshot = {}
      emit()
      return
    }
    const want = String(sport || 'nfl').toLowerCase()
    const nflTeams = (teams || []).filter((team) => {
      const leagueSport = String(team?.league?.sport || 'nfl').toLowerCase()
      return leagueSport === want && team?.league?.id && team?.id
    })
    const teamById = new Map(nflTeams.map((team) => [String(team.id), team]))
    const teamIds = [...teamById.keys()]
    if (!teamIds.length) {
      ownedSnapshot = {}
      opponentSnapshot = {}
      emit()
      return
    }
    const { data: latest, error: weekErr } = await supabase
      .from('fantasy_rosters')
      .select('week')
      .in('team_id', teamIds)
      .order('week', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (seq !== loadSeq) return
    const week = Number(latest?.week)
    if (weekErr || !Number.isFinite(week)) {
      ownedSnapshot = {}
      opponentSnapshot = {}
      emit()
      return
    }
    const { data: rows, error: rowErr } = await supabase
      .from('fantasy_rosters')
      .select('sleeper_id, team_id')
      .in('team_id', teamIds)
      .in('sleeper_id', ids)
      .eq('week', week)
    if (seq !== loadSeq) return
    if (rowErr) {
      ownedSnapshot = {}
      opponentSnapshot = {}
      emit()
      return
    }
    const next = {}
    for (const row of rows || []) {
      const playerId = String(row?.sleeper_id || '').trim()
      const team = teamById.get(String(row?.team_id || ''))
      const league = team?.league
      if (!playerId || !league?.id) continue
      const bucket = next[playerId] || { leagues: [] }
      if (!bucket.leagues.some((item) => item.id === String(league.id))) {
        bucket.leagues.push({
          id: String(league.id),
          name: String(league.name || 'League').trim() || 'League',
          primary: league.is_primary === true,
        })
      }
      next[playerId] = bucket
    }
    for (const bucket of Object.values(next)) {
      bucket.leagues.sort((a, b) => {
        if (a.primary !== b.primary) return a.primary ? -1 : 1
        return a.name.localeCompare(b.name)
      })
    }
    const leagueIds = [...new Set(nflTeams.map((team) => String(team.league.id)))]
    const { data: matchups, error: matchErr } = await supabase
      .from('fantasy_matchups')
      .select('league_id, opp_team_id')
      .in('league_id', leagueIds)
      .eq('week', week)
    if (seq !== loadSeq) return
    const opponents = {}
    if (!matchErr) {
      const leaguesByOpp = new Map()
      for (const matchup of matchups || []) {
        const oppId = String(matchup?.opp_team_id || '').trim()
        const leagueId = String(matchup?.league_id || '').trim()
        if (!oppId || !leagueId) continue
        const list = leaguesByOpp.get(oppId) || []
        if (!list.includes(leagueId)) list.push(leagueId)
        leaguesByOpp.set(oppId, list)
      }
      const oppTeamIds = [...leaguesByOpp.keys()]
      if (oppTeamIds.length) {
        const { data: oppRows, error: oppErr } = await supabase
          .from('fantasy_rosters')
          .select('sleeper_id, team_id')
          .in('team_id', oppTeamIds)
          .in('sleeper_id', ids)
          .eq('week', week)
        if (seq !== loadSeq) return
        if (!oppErr) {
          for (const row of oppRows || []) {
            const playerId = String(row?.sleeper_id || '').trim()
            const leaguesForOpp = leaguesByOpp.get(String(row?.team_id || '')) || []
            if (!playerId) continue
            for (const leagueId of leaguesForOpp) {
              const bucket = opponents[leagueId] || {}
              bucket[playerId] = true
              opponents[leagueId] = bucket
            }
          }
        }
      }
    }
    ownedSnapshot = next
    opponentSnapshot = opponents
    emit()
  })()
}
