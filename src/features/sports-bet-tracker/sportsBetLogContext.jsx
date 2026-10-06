import { createContext, useCallback, useContext, useMemo } from 'react'
import { requestSportsBetLog } from './sportsBetNav.js'
import { buildSelectionLabel } from './sportsBetMath.js'

const SportsBetLogGameContext = createContext(null)

export function formatSportsBetBook(name) {
  return String(name || '').replace(/\.(ag|com|eu|lv)$/i, '').replace(/\s*\(US\)\s*$/i, '').trim()
}

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
 * `onBeforeLog` should close the sports surface (same as … → Log a bet).
 */
export function SportsBetLogGameProvider({ game, onBeforeLog, children }) {
  const logOdds = useCallback(
    (partial) => {
      if (!game) return
      onBeforeLog?.()
      const merged = {
        ...sportsBetPrefillFromGame(game),
        ...(partial && typeof partial === 'object' ? partial : {}),
        source: 'odds_cell',
      }
      merged.book = formatSportsBetBook(merged.book)
      merged.selection_label = buildSelectionLabel({
        market: merged.market,
        side: merged.side,
        homeTeam: merged.home_team,
        awayTeam: merged.away_team,
        line: merged.line,
        selectionLabel: merged.selection_label,
      })
      requestSportsBetLog(merged)
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
