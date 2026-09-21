import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import {
  loungeSportsScoreboard,
  readLoungeSportsScoreboardCache,
  writeLoungeSportsScoreboardCache,
} from '../../utils/loungeSportsApi.js'
import { enrichLoungeSportsGame, matchLoungePostToSportsGame, loungeSportsMatchTextFromPost } from './loungeSportsMatch.js'
import { isLoungeSportsCurrentSlateGame, ptDateFromIsoLocal } from './loungeSportsSlateWindow.js'
import { parseLoungeSportsGameField } from './loungeSportsGameField.js'

const LoungeSportsFeedContext = createContext(null)

export function useLoungeSportsFeed() {
  return useContext(LoungeSportsFeedContext)
}

function sameHubGame(a, b) {
  if (!a || !b) return false
  return (
    a.status === b.status &&
    a.status_label === b.status_label &&
    a.home?.score === b.home?.score &&
    a.away?.score === b.away?.score &&
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

function sideSpread(side) {
  const n = Number(side?.spread)
  return Number.isFinite(n) ? n : null
}

/** Odds drop completed games; keep the last line we already painted. */
function preserveSpreads(next, prev) {
  if (!Array.isArray(next) || !next.length || !Array.isArray(prev) || !prev.length) return next
  const prevById = new Map(prev.map((game) => [String(game.id), game]))
  const prevByMatch = new Map(prev.map((game) => [matchupKey(game), game]))
  return next.map((game) => {
    if (sideSpread(game.home) != null || sideSpread(game.away) != null) return game
    const old = prevById.get(String(game.id)) || prevByMatch.get(matchupKey(game))
    if (!old) return game
    const homeSpread = sideSpread(old.home)
    const awaySpread = sideSpread(old.away)
    if (homeSpread == null && awaySpread == null) return game
    return {
      ...game,
      home: { ...game.home, spread: homeSpread },
      away: { ...game.away, spread: awaySpread },
    }
  })
}

/**
 * Live/recent scoreboard for in-post game pills.
 * Paints the last slate immediately (memory + localStorage), then refreshes.
 */
export function LoungeSportsFeedProvider({ supabaseClient, feedActive = true, children }) {
  const [games, setGames] = useState(gamesFromCache)
  const [hubGame, setHubGame] = useState(null)
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

  const matchPost = useCallback(
    (post) => {
      const pinned = parseLoungeSportsGameField(post?.sports_game)
      if (pinned.suppress) return null
      if (pinned.eventId) {
        const hit = games.find((g) => String(g.id) === pinned.eventId)
        if (hit) return hit
      }
      return matchLoungePostToSportsGame(loungeSportsMatchTextFromPost(post), games)
    },
    [games],
  )

  const openHub = useCallback((game) => {
    if (game) setHubGame(game)
  }, [])

  const closeHub = useCallback(() => setHubGame(null), [])

  const value = useMemo(
    () => ({ games, hubGame, matchPost, openHub, closeHub, refresh: loadBoard }),
    [closeHub, games, hubGame, loadBoard, matchPost, openHub],
  )

  return <LoungeSportsFeedContext.Provider value={value}>{children}</LoungeSportsFeedContext.Provider>
}
