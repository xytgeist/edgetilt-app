import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { requestSportsBetLog } from './sportsBetNav.js'
import { buildBetSummaryLabel, americanFromImplied } from './sportsBetMath.js'
import { insertSportsBet } from './sportsBetApi.js'
import { DEFAULT_STAKE_UNITS, readUnitSizeDollars, stakeDollarsFromUnits } from './sportsBetStake.js'
import { resolveSportsBetSport } from './sportsBetSports.js'
import { createPortal } from 'react-dom'
import { Z_APP_ALERT } from '../../constants/appZIndex.js'
import { isOddsHoldLearned } from './oddsHoldHint.js'

const SportsBetLogGameContext = createContext(null)
const TAP_DEDUPE_MS = 20_000
const TAP_TOAST_MS = 4500
/** In-app book sheets never hide the page, so wait a beat before confirming. */
const TAP_TOAST_VISIBLE_DELAY_MS = 900
const TAP_TOAST_RETURN_DELAY_MS = 350

/** Tap-through auto-log confirmation. Until the viewer has held a line once, it also teaches the hold. */
function TapLoggedToast({ toast, onDismiss }) {
  if (!toast || typeof document === 'undefined') return null
  return createPortal(
    <button
      type="button"
      key={toast.key}
      data-sports-bet-tap-toast
      onClick={onDismiss}
      className="fixed left-1/2 w-[min(calc(100vw-1.5rem),22rem)] -translate-x-1/2 touch-manipulation rounded-2xl border border-cyan-400/30 bg-zinc-900/95 px-3.5 py-2.5 text-left shadow-[0_8px_32px_rgba(0,0,0,0.4)] backdrop-blur-xl [-webkit-tap-highlight-color:transparent]"
      style={{ zIndex: Z_APP_ALERT, bottom: 'calc(env(safe-area-inset-bottom, 0px) + 1rem)' }}
    >
      <span className="block truncate text-[13px] font-semibold text-zinc-100">Logged {toast.units}u on {toast.label}</span>
      {toast.hint ? (
        <span className="mt-0.5 block text-[11px] text-zinc-400">Next time, hold a line to set your own stake.</span>
      ) : null}
    </button>,
    document.body,
  )
}

export function formatSportsBetBook(name) {
  return String(name || '').replace(/\.(ag|com|eu|lv)$/i, '').replace(/\s*\(US\)\s*$/i, '').trim()
}

export function sportsBetPrefillFromGame(game) {
  if (!game) return {}
  const sport = resolveSportsBetSport(game.sport_key, game.sport_label)
  return {
    event_id: game.id,
    sport_key: sport.key,
    sport_label: sport.label,
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
  const sport = resolveSportsBetSport(merged.sport_key, merged.sport_label)
  merged.sport_key = sport.key
  merged.sport_label = sport.label
  merged.book = formatSportsBetBook(merged.book)
  merged.selection_label = buildBetSummaryLabel(merged)
  return merged
}

const PROP_BOOK = { kalshi: 'Kalshi', polymarket: 'Polymarket', poly: 'Polymarket' }

export function sportsBetPropTapPayload({
  playerName,
  stat,
  line,
  price,
  book,
  side = 'over',
  selectionLabel,
}) {
  const odds = americanFromImplied(price)
  return {
    market: 'prop',
    side: side === 'under' ? 'under' : 'over',
    line: line == null || line === '' ? null : line,
    odds: odds == null ? -110 : odds,
    book: PROP_BOOK[String(book || '').toLowerCase()] || formatSportsBetBook(book) || String(book || ''),
    player_name: playerName ? String(playerName).trim() : '',
    prop_stat: stat ? String(stat).trim() : '',
    selection_label: selectionLabel ? String(selectionLabel).trim() : '',
  }
}

function tapDedupeKey(row) {
  return [
    row.event_id || '',
    row.book || '',
    row.market || '',
    row.side || '',
    row.line ?? '',
    row.odds ?? '',
    row.player_name || '',
    row.prop_stat || '',
  ].join('|')
}

/**
 * Hub-wide log helper so odds cells can prefill without drilling 15 props.
 * Hold → tracker composer. Tap-through → insert unconfirmed + open book.
 */
export function SportsBetLogGameProvider({ game, supabaseClient, onBeforeLog, children }) {
  const [userId, setUserId] = useState(null)
  const tapAtRef = useRef(new Map())
  const [tapToast, setTapToast] = useState(null)
  const tapToastTimersRef = useRef({ show: 0, hide: 0, onVis: null })

  const clearTapToastTimers = useCallback(() => {
    const t = tapToastTimersRef.current
    window.clearTimeout(t.show)
    window.clearTimeout(t.hide)
    if (t.onVis) document.removeEventListener('visibilitychange', t.onVis)
    tapToastTimersRef.current = { show: 0, hide: 0, onVis: null }
  }, [])
  useEffect(() => clearTapToastTimers, [clearTapToastTimers])

  const queueTapToast = useCallback(
    (row) => {
      clearTapToastTimers()
      const show = () => {
        setTapToast({ ...row, key: Date.now(), hint: !isOddsHoldLearned() })
        tapToastTimersRef.current.hide = window.setTimeout(() => setTapToast(null), TAP_TOAST_MS)
      }
      // Show once the page is back in front (an external book app hides it; an in-app sheet does not).
      const whenVisible = () => {
        if (!document.hidden) {
          show()
          return
        }
        const onVis = () => {
          if (document.hidden) return
          document.removeEventListener('visibilitychange', onVis)
          tapToastTimersRef.current.onVis = null
          tapToastTimersRef.current.show = window.setTimeout(show, TAP_TOAST_RETURN_DELAY_MS)
        }
        tapToastTimersRef.current.onVis = onVis
        document.addEventListener('visibilitychange', onVis)
      }
      if (document.hidden) whenVisible()
      else tapToastTimersRef.current.show = window.setTimeout(whenVisible, TAP_TOAST_VISIBLE_DELAY_MS)
    },
    [clearTapToastTimers],
  )

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
      void insertSportsBet(supabaseClient, userId, draft).then((result) => {
        if (result?.error) return
        queueTapToast({ units, label: String(draft.selection_label || 'this line').replace(/\s+·\s+\d{1,2}\/\d{1,2}\/\d{2,4}$/, '') })
      })
    },
    [game, supabaseClient, userId, queueTapToast],
  )

  const value = useMemo(
    () => ({ game, logOdds, recordTap }),
    [game, logOdds, recordTap],
  )
  return (
    <SportsBetLogGameContext.Provider value={value}>
      {children}
      <TapLoggedToast toast={tapToast} onDismiss={() => setTapToast(null)} />
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
