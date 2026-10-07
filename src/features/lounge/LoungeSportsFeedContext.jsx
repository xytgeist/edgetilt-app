import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import {
  loungeSportsGameDetail,
  loungeSportsScoreboard,
  readLoungeSportsScoreboardCache,
  writeLoungeSportsScoreboardCache,
} from '../../utils/loungeSportsApi.js'
import { dedupeLoungeSportsGames, enrichLoungeSportsGame } from './loungeSportsMatch.js'
import { isLoungeSportsCurrentSlateGame, loungeSportsSlateGames, ptDateFromIsoLocal } from './loungeSportsSlateWindow.js'
import { parseLoungeSportsGameField } from './loungeSportsGameField.js'
import {
  clearLoungeSportsGamePending,
  consumeLoungeSportsHubPending,
  LOUNGE_SPORTS_GAME_OPEN_EVENT,
  LOUNGE_SPORTS_HUB_FILTER_ALL,
  peekLoungeSportsGamePending,
  peekRememberedLoungeSportsGameOpen,
  readLoungeSportsGameIdFromLocation,
  syncOpenLoungeSportsGame,
  LOUNGE_SPORTS_HUB_OPEN_EVENT,
  normalizeLoungeSportsHubFilter,
} from './loungeSportsHubNav.js'
import { sportsBetLogOpenEventName } from '../sports-bet-tracker/sportsBetNav.js'
import { pushWatchedGameLiveActivity } from './watchedGameLiveActivity.js'

const LoungeSportsFeedContext = createContext(null)

export function useLoungeSportsFeed() {
  return useContext(LoungeSportsFeedContext)
}

function sameHubGame(a, b) {
  if (!a || !b) return false
  return (
    a.status === b.status &&
    a.status_label === b.status_label &&
    a.broadcast === b.broadcast &&
    a.broadcast_url === b.broadcast_url &&
    a.total === b.total &&
    a.home?.score === b.home?.score &&
    a.away?.score === b.away?.score &&
    a.home?.spread === b.home?.spread &&
    a.away?.spread === b.away?.spread &&
    a.home?.ml === b.home?.ml &&
    a.away?.ml === b.away?.ml &&
    a.home?.record === b.home?.record &&
    a.away?.record === b.away?.record &&
    a.home?.division_record === b.home?.division_record &&
    a.away?.division_record === b.away?.division_record &&
    JSON.stringify(a.live || null) === JSON.stringify(b.live || null)
  )
}

function gamesFromCache() {
  const cached = readLoungeSportsScoreboardCache()
  if (!Array.isArray(cached) || !cached.length) return []
  return dedupeLoungeSportsGames(cached.map(enrichLoungeSportsGame).filter(isLoungeSportsCurrentSlateGame))
}

function normAbbrev(value) {
  const x = String(value || '').toUpperCase()
  if (x === 'WSH') return 'WAS'
  if (x === 'JAC') return 'JAX'
  return x
}

function matchupKey(game) {
  return `${String(game?.sport_key || '')}:${normAbbrev(game?.away?.abbrev)}@${normAbbrev(game?.home?.abbrev)}:${ptDateFromIsoLocal(game?.commence_time)}`
}

function sideNum(side, key) {
  const n = Number(side?.[key])
  return Number.isFinite(n) ? n : null
}

/**
 * Prefer a real line over a missing one. Also reject mid-game `0` / `0` wipes …
 * TheRundown often stamps literal zeros when the live line is gone (not pick'em).
 */
function preferSpread(nextSide, prevSide) {
  const n = sideNum(nextSide, 'spread')
  const p = sideNum(prevSide, 'spread')
  if (n == null) return p
  if (n === 0 && p != null && p !== 0) return p
  return n
}

/**
 * Full boards can be thin (Rundown-only TNF) after a fat Odds week. Keep current-window
 * games the new payload missed. Active ticks only patch live/soon rows.
 */
function unionScoreboardGames(incoming, prev, { active = false } = {}) {
  if (!Array.isArray(incoming) || !incoming.length) return prev || []
  if (!Array.isArray(prev) || !prev.length) return incoming
  const incomingById = new Map(incoming.map((game) => [String(game.id), game]))
  const incomingByMatch = new Map(incoming.map((game) => [matchupKey(game), game]))
  const seenId = new Set()
  const seenMatch = new Set()
  const out = []
  const mark = (game) => {
    seenId.add(String(game?.id || ''))
    if (!normAbbrev(game?.away?.abbrev) || !normAbbrev(game?.home?.abbrev)) return
    seenMatch.add(matchupKey(game))
  }
  for (const old of prev) {
    const neu = incomingById.get(String(old.id)) || incomingByMatch.get(matchupKey(old))
    if (neu) {
      out.push(neu)
      mark(neu)
      mark(old)
      continue
    }
    if (active || isLoungeSportsCurrentSlateGame(old)) {
      out.push(old)
      mark(old)
    }
  }
  for (const neu of incoming) {
    if (seenId.has(String(neu.id)) || seenMatch.has(matchupKey(neu))) continue
    out.push(neu)
  }
  return out
}

function gameIsLive(game) {
  return game?.status === 'in'
}

/** Fast board ticks only when a live game is on the open slate / open hub / Island. */
function needsLiveBoardTick(games, slateFilter, hubGame, watchedId) {
  if (gameIsLive(hubGame)) return true
  if (watchedId) {
    const watched = (Array.isArray(games) ? games : []).find((g) => String(g.id) === String(watchedId))
    if (gameIsLive(watched)) return true
  }
  const list = Array.isArray(games) ? games : []
  if (slateFilter) return loungeSportsSlateGames(list, slateFilter).some(gameIsLive)
  return list.some((g) => gameIsLive(g) && isLoungeSportsCurrentSlateGame(g))
}

function liveBoardTickMs(hubGame, watchedId) {
  if (gameIsLive(hubGame)) return 10_000
  if (watchedId) return 12_000
  return 15_000
}

const BOARD_SCHEDULER_MS = 5_000
const FULL_BOARD_MS = 5 * 60_000

/** Odds drop completed games; keep the last Pinnacle close we already painted. */
function preserveSpreads(next, prev) {
  if (!Array.isArray(next) || !next.length || !Array.isArray(prev) || !prev.length) return next
  const prevById = new Map(prev.map((game) => [String(game.id), game]))
  const prevByMatch = new Map(prev.map((game) => [matchupKey(game), game]))
  return next.map((game) => {
    const old = prevById.get(String(game.id)) || prevByMatch.get(matchupKey(game))
    if (!old) return game
    let homeSpread = preferSpread(game.home, old.home)
    let awaySpread = preferSpread(game.away, old.away)
    // Both sides cleared to 0 … restore the previous pair when it wasn't pick'em.
    if (
      sideNum(game.home, 'spread') === 0
      && sideNum(game.away, 'spread') === 0
      && (sideNum(old.home, 'spread') != null || sideNum(old.away, 'spread') != null)
      && !(sideNum(old.home, 'spread') === 0 && sideNum(old.away, 'spread') === 0)
    ) {
      homeSpread = sideNum(old.home, 'spread')
      awaySpread = sideNum(old.away, 'spread')
    }
    const homeMl = sideNum(game.home, 'ml') ?? sideNum(old.home, 'ml')
    const awayMl = sideNum(game.away, 'ml') ?? sideNum(old.away, 'ml')
    const homeRecord = game.home?.record || old.home?.record || null
    const awayRecord = game.away?.record || old.away?.record || null
    const homeDiv = game.home?.division_record || old.home?.division_record || null
    const awayDiv = game.away?.division_record || old.away?.division_record || null
    const homeDivLabel = game.home?.division_record_label || old.home?.division_record_label || null
    const awayDivLabel = game.away?.division_record_label || old.away?.division_record_label || null
    const broadcast = game.broadcast || old.broadcast || null
    const broadcastUrl = game.broadcast_url || old.broadcast_url || null
    if (
      homeSpread === sideNum(game.home, 'spread')
      && awaySpread === sideNum(game.away, 'spread')
      && homeMl === sideNum(game.home, 'ml')
      && awayMl === sideNum(game.away, 'ml')
      && homeRecord === (game.home?.record || null)
      && awayRecord === (game.away?.record || null)
      && homeDiv === (game.home?.division_record || null)
      && awayDiv === (game.away?.division_record || null)
      && broadcast === (game.broadcast || null)
      && broadcastUrl === (game.broadcast_url || null)
    ) return game
    return {
      ...game,
      broadcast,
      broadcast_url: broadcastUrl,
      home: {
        ...game.home,
        spread: homeSpread,
        ml: homeMl,
        record: homeRecord,
        division_record: homeDiv,
        division_record_label: homeDivLabel,
      },
      away: {
        ...game.away,
        spread: awaySpread,
        ml: awayMl,
        record: awayRecord,
        division_record: awayDiv,
        division_record_label: awayDivLabel,
      },
    }
  })
}

/**
 * Live/recent scoreboard for in-post game pills + Sports Hub slate.
 * Paints the last slate immediately (memory + localStorage), then refreshes.
 */
export function LoungeSportsFeedProvider({ supabaseClient, feedActive = true, children }) {
  const [games, setGames] = useState(gamesFromCache)
  const [hubGame, setHubGame] = useState(null)
  /** null = closed; `all` or a sport_key (e.g. americanfootball_nfl). */
  const [slateFilter, setSlateFilter] = useState(null)
  /** First network board attempt finished (success or fail) … cache-only paint is not "loaded". */
  const [boardFetched, setBoardFetched] = useState(false)
  const inflightRef = useRef(false)
  const gamesRef = useRef(games)
  gamesRef.current = games
  /** Game id for Dynamic Island … survives hub close until final / dismiss / other live game. */
  const watchedGameIdRef = useRef(null)

  const lastFullBoardAtRef = useRef(0)
  const lastActiveBoardAtRef = useRef(0)
  const slateFilterRef = useRef(slateFilter)
  slateFilterRef.current = slateFilter
  const hubGameRef = useRef(hubGame)
  hubGameRef.current = hubGame

  /** `active` = live / about-to-start / recently-final, merged into the slate. Never wipes the week. */
  const loadBoard = useCallback(async ({ active = false } = {}) => {
    if (!supabaseClient || inflightRef.current) return
    const useActive = active && gamesRef.current.length > 0
    inflightRef.current = true
    try {
      const data = await loungeSportsScoreboard(supabaseClient, useActive ? { scope: 'active' } : {})
      if (data?.error || !Array.isArray(data?.games)) return
      const incoming = data.games.map(enrichLoungeSportsGame)
      if (!useActive) lastFullBoardAtRef.current = Date.now()
      if (useActive) lastActiveBoardAtRef.current = Date.now()
      if (!incoming.length) return
      const merged = unionScoreboardGames(incoming, gamesRef.current, { active: useActive })
      const next = preserveSpreads(dedupeLoungeSportsGames(merged), gamesRef.current)
      setGames(next)
      writeLoungeSportsScoreboardCache(next)
    } catch (err) {
      console.warn('[lounge] sports scoreboard:', err)
    } finally {
      inflightRef.current = false
      setBoardFetched(true)
    }
  }, [supabaseClient])

  useEffect(() => {
    if (!feedActive || !supabaseClient) return undefined
    void loadBoard()
    const id = setInterval(() => {
      const keepForIsland = Boolean(watchedGameIdRef.current)
      if (typeof document !== 'undefined' && document.hidden && !keepForIsland) return
      const now = Date.now()
      if (now - lastFullBoardAtRef.current >= FULL_BOARD_MS) {
        void loadBoard({ active: false })
        return
      }
      if (!needsLiveBoardTick(
        gamesRef.current,
        slateFilterRef.current,
        hubGameRef.current,
        watchedGameIdRef.current,
      )) return
      const liveMs = liveBoardTickMs(hubGameRef.current, watchedGameIdRef.current)
      if (now - lastActiveBoardAtRef.current < liveMs) return
      void loadBoard({ active: true })
    }, BOARD_SCHEDULER_MS)
    const onVis = () => {
      if (typeof document === 'undefined' || document.hidden) return
      void loadBoard({ active: true })
    }
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', onVis)
    }
    return () => {
      clearInterval(id)
      if (typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', onVis)
      }
    }
  }, [feedActive, loadBoard, supabaseClient])

  useEffect(() => {
    setHubGame((prev) => {
      if (!prev) return prev
      const next = games.find((g) => g.id === prev.id)
      if (!next) return prev
      if (sameHubGame(prev, next)) return prev
      return {
        ...prev,
        ...next,
        live: next.live || prev.live,
        total: next.total ?? prev.total ?? null,
        home: {
          ...prev.home,
          ...next.home,
          spread: preferSpread(next.home, prev.home),
          ml: sideNum(next.home, 'ml') ?? sideNum(prev.home, 'ml'),
        },
        away: {
          ...prev.away,
          ...next.away,
          spread: preferSpread(next.away, prev.away),
          ml: sideNum(next.away, 'ml') ?? sideNum(prev.away, 'ml'),
        },
      }
    })
  }, [games])

  // Watched-game Island: keep updating from the board after the hub closes; end on final.
  useEffect(() => {
    const watchedId = watchedGameIdRef.current
    if (!watchedId) return
    const fromHub =
      hubGame && String(hubGame.id) === String(watchedId) ? hubGame : null
    const game = fromHub || games.find((g) => String(g.id) === String(watchedId))
    if (!game) return
    if (game.status === 'post') {
      pushWatchedGameLiveActivity(game, { watching: false })
      watchedGameIdRef.current = null
      return
    }
    if (game.status === 'in') {
      pushWatchedGameLiveActivity(game)
    }
  }, [games, hubGame])

  const openSlate = useCallback((filter = LOUNGE_SPORTS_HUB_FILTER_ALL) => {
    setSlateFilter(normalizeLoungeSportsHubFilter(filter))
  }, [])

  const closeSlate = useCallback(() => {
    setSlateFilter(null)
    setHubGame(null)
    syncOpenLoungeSportsGame(null)
  }, [])

  const openHub = useCallback((game) => {
    if (!game) return
    setHubGame(game)
    syncOpenLoungeSportsGame(game.id)
    if (game.status === 'in') {
      watchedGameIdRef.current = String(game.id)
      pushWatchedGameLiveActivity(game)
    }
  }, [])

  const closeHub = useCallback(() => {
    setHubGame(null)
    syncOpenLoungeSportsGame(null)
  }, [])

  useEffect(() => {
    const onLog = () => closeSlate()
    window.addEventListener(sportsBetLogOpenEventName(), onLog)
    return () => window.removeEventListener(sportsBetLogOpenEventName(), onLog)
  }, [closeSlate])

  const dismissWatchedGame = useCallback(() => {
    const id = watchedGameIdRef.current
    const game = id ? gamesRef.current.find((g) => String(g.id) === String(id)) : null
    pushWatchedGameLiveActivity(game || { id }, { watching: false })
    watchedGameIdRef.current = null
  }, [])

  useEffect(() => {
    const apply = (filter) => {
      if (!filter) return
      openSlate(filter)
    }
    apply(consumeLoungeSportsHubPending())
    const onOpen = (event) => {
      apply(normalizeLoungeSportsHubFilter(event?.detail?.filter))
    }
    window.addEventListener(LOUNGE_SPORTS_HUB_OPEN_EVENT, onOpen)
    return () => window.removeEventListener(LOUNGE_SPORTS_HUB_OPEN_EVENT, onOpen)
  }, [openSlate])

  // Shared game link (`?game=`): open that hub once the board has it (or a one-game lookup does).
  const [pendingGameId, setPendingGameId] = useState(
    () => peekLoungeSportsGamePending()
      || peekRememberedLoungeSportsGameOpen()
      || readLoungeSportsGameIdFromLocation(),
  )
  const pendingLookupRef = useRef('')
  useEffect(() => {
    const onOpen = (event) => {
      const id = String(event?.detail?.eventId || '').trim()
      if (id) setPendingGameId(id)
    }
    window.addEventListener(LOUNGE_SPORTS_GAME_OPEN_EVENT, onOpen)
    return () => window.removeEventListener(LOUNGE_SPORTS_GAME_OPEN_EVENT, onOpen)
  }, [])

  // Shared links only open (and clear) for a signed-in viewer … signed-out, the id waits through sign-in.
  const [signedIn, setSignedIn] = useState(false)
  useEffect(() => {
    if (!supabaseClient?.auth?.onAuthStateChange) return undefined
    const { data } = supabaseClient.auth.onAuthStateChange((event, session) => {
      setSignedIn(Boolean(session?.user))
      if (event === 'SIGNED_IN') {
        void loadBoard()
        const pending = peekLoungeSportsGamePending()
        if (pending) setPendingGameId(pending)
      }
      if (event === 'SIGNED_OUT') {
        dismissWatchedGame()
        setHubGame(null)
        syncOpenLoungeSportsGame(null)
      }
    })
    return () => data?.subscription?.unsubscribe?.()
  }, [dismissWatchedGame, loadBoard, supabaseClient])

  useEffect(() => {
    if (!pendingGameId || !signedIn) return undefined
    const hit = games.find((g) => String(g.id) === pendingGameId)
    if (hit) {
      clearLoungeSportsGamePending()
      setPendingGameId(null)
      openHub(hit)
      return undefined
    }
    if (!boardFetched || !supabaseClient || pendingLookupRef.current === pendingGameId) return undefined
    // Not on the painted slate … the Edge event lookup still finds current-slate games.
    pendingLookupRef.current = pendingGameId
    let cancelled = false
    void loungeSportsGameDetail(supabaseClient, pendingGameId).then((data) => {
      if (cancelled) return
      const game = data?.game && typeof data.game === 'object' ? enrichLoungeSportsGame(data.game) : null
      if (game) {
        clearLoungeSportsGamePending()
        setPendingGameId(null)
        openHub(game)
      } else if (/not on the current slate/i.test(String(data?.error || ''))) {
        clearLoungeSportsGamePending()
        setPendingGameId(null)
      } else {
        // Signed out / network … retry after the next board load (e.g. sign-in).
        pendingLookupRef.current = ''
      }
    })
    return () => {
      cancelled = true
    }
  }, [boardFetched, games, openHub, pendingGameId, signedIn, supabaseClient])

  const gamesForPost = useCallback(
    (post) => {
      const pinned = parseLoungeSportsGameField(post?.sports_game)
      if (pinned.suppress || !pinned.eventIds.length) return []
      const byId = new Map(games.map((game) => [String(game.id), game]))
      return pinned.eventIds.map((id) => byId.get(String(id))).filter(Boolean)
    },
    [games],
  )

  const matchPost = useCallback(
    (post) => gamesForPost(post)[0] || null,
    [gamesForPost],
  )

  const value = useMemo(
    () => ({
      games,
      boardFetched,
      hubGame,
      slateFilter,
      slateOpen: Boolean(slateFilter),
      matchPost,
      gamesForPost,
      openHub,
      closeHub,
      dismissWatchedGame,
      openSlate,
      closeSlate,
      refresh: loadBoard,
    }),
    [
      boardFetched,
      closeHub,
      closeSlate,
      dismissWatchedGame,
      games,
      gamesForPost,
      hubGame,
      loadBoard,
      matchPost,
      openHub,
      openSlate,
      slateFilter,
    ],
  )

  return <LoungeSportsFeedContext.Provider value={value}>{children}</LoungeSportsFeedContext.Provider>
}
