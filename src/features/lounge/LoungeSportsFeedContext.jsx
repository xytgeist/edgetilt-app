import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { loungeSportsScoreboard } from '../../utils/loungeSportsApi.js'
import { enrichLoungeSportsGame, matchLoungePostToSportsGame, loungeSportsMatchTextFromPost } from './loungeSportsMatch.js'

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

/**
 * Live/recent scoreboard for in-post game pills.
 */
export function LoungeSportsFeedProvider({ supabaseClient, feedActive = true, children }) {
  const [games, setGames] = useState([])
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
      setGames(data.games.map(enrichLoungeSportsGame))
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
    (post) => matchLoungePostToSportsGame(loungeSportsMatchTextFromPost(post), games),
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
