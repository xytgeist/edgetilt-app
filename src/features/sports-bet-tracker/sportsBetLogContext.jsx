import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { requestSportsBetLog } from './sportsBetNav.js'
import { buildSelectionLabel } from './sportsBetMath.js'
import { insertSportsBet } from './sportsBetApi.js'
import { DEFAULT_STAKE_UNITS, readUnitSizeDollars, stakeDollarsFromUnits } from './sportsBetStake.js'

const SportsBetLogGameContext = createContext(null)
const TAP_DEDUPE_MS = 20_000

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

export function mergeSportsBetOddsPrefill(game, partial) {
  const merged = {
    ...sportsBetPrefillFromGame(game),
    ...(partial && typeof partial === 'object' ? partial : {}),
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
  return merged
}

function tapDedupeKey(row) {
  return [
    row.event_id || '',
    row.book || '',
    row.market || '',
    row.side || '',
    row.line ?? '',
    row.odds ?? '',
  ].join('|')
}

/**
 * Hub-wide log helper so odds cells can prefill without drilling 15 props.
 * Hold → tracker composer. Tap-through → insert unconfirmed + open book.
 */
export function SportsBetLogGameProvider({ game, supabaseClient, onBeforeLog, children }) {
  const [userId, setUserId] = useState(null)
  const tapAtRef = useRef(new Map())

  useEffect(() => {
    if (!supabaseClient) {
      setUserId(null)
      return undefined
    }
    let cancelled = false
    supabaseClient.auth.getSession().then(({ data }) => {
      if (!cancelled) setUserId(data?.session?.user?.id || null)
    })
    const { data: sub } = supabaseClient.auth.onAuthStateChange((_e, session) => {
      setUserId(session?.user?.id || null)
    })
    return () => {
      cancelled = true
      sub?.subscription?.unsubscribe?.()
    }
  }, [supabaseClient])

  const logOdds = useCallback(
    (partial) => {
      if (!game) return
      onBeforeLog?.()
      requestSportsBetLog({
        ...mergeSportsBetOddsPrefill(game, partial),
        source: 'odds_cell',
      })
    },
    [game, onBeforeLog],
  )

  const recordTap = useCallback(
    (partial) => {
      if (!game || !supabaseClient || !userId) return
      const unitSize = readUnitSizeDollars()
      const units = DEFAULT_STAKE_UNITS
      const draft = {
        ...mergeSportsBetOddsPrefill(game, partial),
        source: 'odds_tap',
        confirmed: false,
        stake_units: units,
        unit_size_dollars: unitSize,
        stake_dollars: stakeDollarsFromUnits(units, unitSize),
      }
      const key = tapDedupeKey(draft)
      const now = Date.now()
      const prev = tapAtRef.current.get(key) || 0
      if (now - prev < TAP_DEDUPE_MS) return
      tapAtRef.current.set(key, now)
      void insertSportsBet(supabaseClient, userId, draft)
    },
    [game, supabaseClient, userId],
  )

  const value = useMemo(
    () => ({ game, logOdds, recordTap }),
    [game, logOdds, recordTap],
  )
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

export function useSportsBetOddsActions() {
  const ctx = useContext(SportsBetLogGameContext)
  return {
    logOdds: ctx?.logOdds || null,
    recordTap: ctx?.recordTap || null,
  }
}
