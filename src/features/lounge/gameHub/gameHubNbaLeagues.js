/**
 * Connected NBA league rules for the game hub Fantasy tab (same `fantasy_leagues.scoring` the fantasy home uses).
 * No NBA league scores with Sleeper's default points league.
 */
import { useEffect, useState } from 'react'
import { leagueRates } from '../../fantasy/fantasyBoxScore.js'

const STORAGE_KEY = 'edgetilt:gameHubNbaLeague'
const CHANGE_EVENT = 'edgetilt:game-hub-nba-league'

/** Sleeper's default NBA points scoring (used when the viewer has no NBA league connected). */
export const DEFAULT_NBA_SCORING = { pts: 1, reb: 1.2, ast: 1.5, stl: 3, blk: 3, to: -1 }

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

function chooseId(leagues) {
  const stored = readStoredId()
  if (stored && leagues.some((league) => league.id === stored)) return stored
  const primary = leagues.find((league) => league.isPrimary)
  return (primary || leagues[0])?.id || ''
}

export function selectNbaLeague(id) {
  const next = String(id || '')
  if (!snapshot.leagues.some((league) => league.id === next)) return
  snapshot = { ...snapshot, activeId: next }
  try {
    localStorage.setItem(STORAGE_KEY, next)
  } catch {
    /* private mode */
  }
  emit()
}

export function useNbaLeagueRules() {
  const [, bump] = useState(0)
  useEffect(() => {
    const onChange = () => bump((n) => n + 1)
    window.addEventListener(CHANGE_EVENT, onChange)
    return () => window.removeEventListener(CHANGE_EVENT, onChange)
  }, [])
  return {
    league: snapshot.leagues.find((league) => league.id === snapshot.activeId) || null,
    leagues: snapshot.leagues,
    selectLeague: selectNbaLeague,
  }
}

export function loadNbaLeagueRules(supabase) {
  if (!supabase) return Promise.resolve()
  const seq = ++loadSeq
  return supabase
    .from('fantasy_leagues')
    .select('id, name, sport, is_primary, scoring')
    .eq('sport', 'nba')
    .then(({ data, error }) => {
      if (seq !== loadSeq) return
      const leagues = error
        ? []
        : (data || [])
            .filter((row) => leagueRates(row.scoring, 'nba'))
            .map((row) => ({
              id: String(row.id),
              name: String(row.name || 'League').trim() || 'League',
              isPrimary: row.is_primary === true,
              scoring: row.scoring,
            }))
      snapshot = { leagues, activeId: chooseId(leagues) }
      emit()
    })
}
