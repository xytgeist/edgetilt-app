/**
 * League chip state for the game hub Fantasy tab: only the leagues with one of this game's players (yours or your
 * opponent's starters), counted and busiest first. Opens on the busiest league until the viewer picks one.
 */
import { useEffect, useMemo, useRef } from 'react'
import { useAllLeagueOpponents, useRosterLeagues } from './gameHubRosterLeagues.js'

/**
 * `leagues` are the sport's connected leagues ({ id, name }); `activeId` / `onSelect` drive the shared league store.
 * Returns the chips to show (counted, busiest first) and keeps the store on the busiest one until the viewer picks.
 */
export function useGameLeagueChips(leagues, activeId, onSelect, gameId) {
  const owned = useRosterLeagues()
  const opponents = useAllLeagueOpponents()
  const chips = useMemo(() => {
    const counted = (leagues || []).map((league, order) => {
      const id = String(league.id)
      let mine = 0
      for (const entry of Object.values(owned)) if (entry?.leagues?.some((l) => l.id === id)) mine += 1
      const vs = Object.keys(opponents[id] || {}).length
      return { ...league, id, mine, vs, total: mine + vs, order }
    })
    const busy = counted.filter((c) => c.total > 0).sort((a, b) => b.total - a.total || a.order - b.order)
    // Nobody from this game on any team (or rosters still loading): every league stays pickable.
    return busy.length ? busy : counted
  }, [leagues, owned, opponents])

  const pickedRef = useRef('')
  const busiest = chips[0]?.total > 0 ? chips[0].id : ''
  const shownIsChip = chips.some((c) => c.id === String(activeId || ''))
  useEffect(() => {
    if (!busiest || pickedRef.current === String(gameId || '')) return
    if (String(activeId || '') !== busiest) onSelect(busiest)
  }, [busiest, activeId, onSelect, gameId])
  const top = chips[0]?.id || ''

  const pick = (id) => {
    pickedRef.current = String(gameId || '')
    onSelect(id)
  }
  return { chips, pick, activeId: shownIsChip ? String(activeId) : top }
}
