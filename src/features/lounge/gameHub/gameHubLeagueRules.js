/**
 * Connected NFL league rules for the game hub.
 * The fantasy home already multiplies the live box by `fantasy_leagues.scoring`.
 * The hub uses that same map for the Fantasy tab, the play pills, and the landscape rail.
 * No league (or an empty map) leaves the device Std / Half / PPR toggle in place.
 */
import { useEffect, useState } from 'react'
import { leagueRates } from '../../fantasy/fantasyBoxScore.js'
import { useFantasyScoring } from './gameHubFantasyScoring.js'

const STORAGE_KEY = 'edgetilt:gameHubFantasyLeague'
const CHANGE_EVENT = 'edgetilt:game-hub-fantasy-league'

let snapshot = { leagues: [], activeId: '' }
let loadSeq = 0

function emit() {
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent(CHANGE_EVENT))
}

function readStoredId() {
  try {
    return typeof localStorage !== 'undefined' ? localStorage.getItem(STORAGE_KEY) || '' : ''
  } catch {
    return ''
  }
}

function writeStoredId(id) {
  try {
    if (id) localStorage.setItem(STORAGE_KEY, id)
    else localStorage.removeItem(STORAGE_KEY)
  } catch {
    /* private mode */
  }
}

function chooseId(leagues) {
  const stored = readStoredId()
  if (stored && leagues.some((league) => league.id === stored)) return stored
  const primary = leagues.find((league) => league.isPrimary)
  return (primary || leagues[0])?.id || ''
}

export function getActiveNflLeague() {
  return snapshot.leagues.find((league) => league.id === snapshot.activeId) || null
}

export function getNflLeagues() {
  return snapshot.leagues
}

export function selectNflLeague(id) {
  const next = String(id || '')
  if (!snapshot.leagues.some((league) => league.id === next)) return
  snapshot = { ...snapshot, activeId: next }
  writeStoredId(next)
  emit()
}

/** Std / Half / PPR column that matches this league's reception rate. Custom TD values stay on the live box. */
export function formatForLeague(rates) {
  const rec = Number(rates?.rec)
  if (!Number.isFinite(rec)) return 'ppr'
  if (Math.abs(rec) < 0.001) return 'std'
  if (Math.abs(rec - 0.5) < 0.001) return 'half'
  return 'ppr'
}

export function useNflLeagueRules() {
  const [, bump] = useState(0)
  useEffect(() => {
    const onChange = () => bump((n) => n + 1)
    window.addEventListener(CHANGE_EVENT, onChange)
    return () => window.removeEventListener(CHANGE_EVENT, onChange)
  }, [])
  return {
    league: getActiveNflLeague(),
    leagues: snapshot.leagues,
    selectLeague: selectNflLeague,
  }
}

/** Sleeper column (proj / season) in the format closest to the active league. Device toggle when none. */
export function useHubPointFormat() {
  const device = useFantasyScoring()
  const { league } = useNflLeagueRules()
  return league ? formatForLeague(league.rates) : device
}

/** Reload on each NFL hub open so a sync that just saved rules is picked up. */
export function loadNflLeagueRules(supabase) {
  if (!supabase) return Promise.resolve()
  const seq = ++loadSeq
  return supabase
    .from('fantasy_leagues')
    .select('id, name, sport, is_primary, scoring')
    .then(({ data, error }) => {
      if (seq !== loadSeq) return
      if (error) {
        snapshot = { leagues: [], activeId: '' }
        emit()
        return
      }
      const leagues = (data || [])
        .filter((row) => String(row?.sport || 'nfl').toLowerCase() === 'nfl')
        .map((row) => {
          const rates = leagueRates(row.scoring, 'nfl')
          if (!rates) return null
          return {
            id: String(row.id),
            name: String(row.name || 'League').trim() || 'League',
            isPrimary: row.is_primary === true,
            scoring: row.scoring,
            rates,
          }
        })
        .filter(Boolean)
      snapshot = { leagues, activeId: chooseId(leagues) }
      emit()
    })
}
