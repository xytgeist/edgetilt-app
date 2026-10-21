import { useEffect, useState } from 'react'
import { loadPlayerNews } from './fantasyApi.js'

const REFRESH_MS = 10 * 60 * 1000

/**
 * News for these sleeper ids, refreshed every 10 min while the page is visible. One fetch feeds the Player news
 * list, the roster row flags, and the Roster alert banner. Returns { key, notes, error, loading }.
 */
export function usePlayerNews(supabaseClient, players, sport = 'nfl') {
  const [state, setState] = useState({ key: '', notes: [], error: '' })
  const idKey = [...(players?.keys?.() || [])].sort().join(',')
  // NBA asks by name + team (no ESPN id on Sleeper NBA players); a string so the effect only reruns on change.
  const nbaKey =
    sport === 'nba'
      ? JSON.stringify(
        [...(players?.entries?.() || [])]
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([id, p]) => ({ sleeper_id: id, name: p?.name || '', team: p?.team || '', position: p?.position || '' })),
      )
      : ''

  useEffect(() => {
    if (!supabaseClient || !idKey) return undefined
    let alive = true
    const load = () =>
      loadPlayerNews(supabaseClient, idKey.split(','), { sport, players: nbaKey ? JSON.parse(nbaKey) : [] })
        .then((data) => {
          if (alive) setState({ key: idKey, notes: Array.isArray(data?.notes) ? data.notes : [], error: '' })
        })
        .catch((e) => {
          if (alive) setState((prev) => ({ key: idKey, notes: prev.key === idKey ? prev.notes : [], error: e?.message || 'Could not load player news.' }))
        })
    void load()
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') void load()
    }, REFRESH_MS)
    return () => {
      alive = false
      window.clearInterval(timer)
    }
  }, [supabaseClient, idKey, sport, nbaKey])

  const loading = Boolean(idKey) && state.key !== idKey
  return { key: idKey, notes: loading || !idKey ? [] : state.notes, error: state.error, loading }
}
