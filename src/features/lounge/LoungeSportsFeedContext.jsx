import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import {
  loungeSportsScoreboard,
  readLoungeSportsScoreboardCache,
  writeLoungeSportsScoreboardCache,
} from '../../utils/loungeSportsApi.js'
import { enrichLoungeSportsGame } from './loungeSportsMatch.js'
import { isLoungeSportsCurrentSlateGame, ptDateFromIsoLocal } from './loungeSportsSlateWindow.js'
import { parseLoungeSportsGameField } from './loungeSportsGameField.js'
import {
  consumeLoungeSportsHubPending,
  LOUNGE_SPORTS_HUB_FILTER_ALL,
  LOUNGE_SPORTS_HUB_OPEN_EVENT,
  normalizeLoungeSportsHubFilter,
} from './loungeSportsHubNav.js'

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
    a.home?.score === b.home?.score &&
    a.away?.score === b.away?.score &&
    a.home?.record === b.home?.record &&
    a.away?.record === b.away?.record &&
    JSON.stringify(a.live || null) === JSON.stringify(b.live || null)
  )
}

function gamesFromCache() {
  const cached = readLoungeSportsScoreboardCache()
  if (!Array.isArray(cached) || !cached.length) return []
  return cached.map(enrichLoungeSportsGame).filter(isLoungeSportsCurrentSlateGame)
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

/** Odds drop completed games; keep the last Pinnacle close we already painted. */
function preserveSpreads(next, prev) {
  if (!Array.isArray(next) || !next.length || !Array.isArray(prev) || !prev.length) return next
  const prevById = new Map(prev.map((game) => [String(game.id), game]))
  const prevByMatch = new Map(prev.map((game) => [matchupKey(game), game]))
  return next.map((game) => {
    const old = prevById.get(String(game.id)) || prevByMatch.get(matchupKey(game))
    if (!old) return game
    const homeSpread = sideNum(game.home, 'spread') ?? sideNum(old.home, 'spread')
    const awaySpread = sideNum(game.away, 'spread') ?? sideNum(old.away, 'spread')
    const homeMl = sideNum(game.home, 'ml') ?? sideNum(old.home, 'ml')
    const awayMl = sideNum(game.away, 'ml') ?? sideNum(old.away, 'ml')
    const homeRecord = game.home?.record || old.home?.record || null
    const awayRecord = game.away?.record || old.away?.record || null
    const broadcast = game.broadcast || old.broadcast || null
    const broadcastUrl = game.broadcast_url || old.broadcast_url || null
    if (
      homeSpread === sideNum(game.home, 'spread')
      && awaySpread === sideNum(game.away, 'spread')
      && homeMl === sideNum(game.home, 'ml')
      && awayMl === sideNum(game.away, 'ml')
      && homeRecord === (game.home?.record || null)
      && awayRecord === (game.away?.record || null)
      && broadcast === (game.broadcast || null)
      && broadcastUrl === (game.broadcast_url || null)
    ) return game
    return {
      ...game,
      broadcast,
      broadcast_url: broadcastUrl,
      home: { ...game.home, spread: homeSpread, ml: homeMl, record: homeRecord },
      away: { ...game.away, spread: awaySpread, ml: awayMl, record: awayRecord },
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
  const inflightRef = useRef(false)
  const gamesRef = useRef(games)
  gamesRef.current = games

  const loadBoard = useCallback(async () => {
    if (!supabaseClient || inflightRef.current) return
    inflightRef.current = true
    try {
      const data = await loungeSportsScoreboard(supabaseClient)
      if (data?.error || !Array.isArray(data?.games)) return
      const incoming = data.games.map(enrichLoungeSportsGame)
      if (!incoming.length) return
      const next = preserveSpreads(incoming, gamesRef.current)
      setGames(next)
      writeLoungeSportsScoreboardCache(next)
    } catch (err) {
      console.warn('[lounge] sports scoreboard:', err)
    } finally {
      inflightRef.current = false
    }
  }, [supabaseClient])

  useEffect(() => {
    if (!feedActive || !supabaseClient) return undefined
    void loadBoard()
    const live = gamesRef.current.some((g) => g.status === 'in') || hubGame?.status === 'in'
    const ms = hubGame ? (hubGame.status === 'in' ? 20_000 : 60_000) : live ? 45_000 : 5 * 60_000
    const id = setInterval(() => void loadBoard(), ms)
    return () => clearInterval(id)
  }, [feedActive, hubGame, loadBoard, supabaseClient, games.some((g) => g.status === 'in')])

  useEffect(() => {
    setHubGame((prev) => {
      if (!prev) return prev
      const next = games.find((g) => g.id === prev.id)
      if (!next) return prev
      if (sameHubGame(prev, next)) return prev
      return { ...prev, ...next, live: next.live || prev.live }
    })
  }, [games])

  const openSlate = useCallback((filter = LOUNGE_SPORTS_HUB_FILTER_ALL) => {
    setSlateFilter(normalizeLoungeSportsHubFilter(filter))
  }, [])

  const closeSlate = useCallback(() => {
    setSlateFilter(null)
    setHubGame(null)
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

  const openHub = useCallback((game) => {
    if (game) setHubGame(game)
  }, [])

  const closeHub = useCallback(() => setHubGame(null), [])

  const value = useMemo(
    () => ({
      games,
      hubGame,
      slateFilter,
      slateOpen: Boolean(slateFilter),
      matchPost,
      gamesForPost,
      openHub,
      closeHub,
      openSlate,
      closeSlate,
      refresh: loadBoard,
    }),
    [
      closeHub,
      closeSlate,
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
