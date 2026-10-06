import { createContext, useCallback, useContext, useMemo } from 'react'
import { requestSportsBetLog } from './sportsBetNav.js'

const SportsBetLogGameContext = createContext(null)

export function sportsBetPrefillFromGame(game) {
  if (!game) return {}
  return {
    event_id: game.id,
    sport_key: game.sport_key,
    sport_label: game.sport_label,
    home_team: game.home?.name || game.home?.mascot,
    away_team: game.away?.name || game.away?.mascot,
    commence_time: game.commence_time,
  }
}

/**
 * Hub-wide log helper so odds cells can prefill without drilling 15 props.
 * `onBeforeLog` should close the hub (same as … → Log a bet).
 */
export function SportsBetLogGameProvider({ game, onBeforeLog, children }) {
  const logOdds = useCallback(
    (partial) => {
      if (!game) return
      onBeforeLog?.()
      requestSportsBetLog({
        ...sportsBetPrefillFromGame(game),
        ...(partial && typeof partial === 'object' ? partial : {}),
        source: 'odds_cell',
      })
    },
    [game, onBeforeLog],
  )

  const value = useMemo(() => ({ game, logOdds }), [game, logOdds])
  return (
    <SportsBetLogGameContext.Provider value={value}>
      {children}
    </SportsBetLogGameContext.Provider>
  )
}

export function useLogSportsBetOdds() {
  const ctx = useContext(SportsBetLogGameContext)
  return ctx?.logOdds || null
}
