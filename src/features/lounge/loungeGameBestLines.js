import { useEffect, useMemo, useState } from 'react'
import { useLoungeSportsFeed } from './LoungeSportsFeedContext.jsx'
import { liveBestLines, pregameBestLines } from './gameHub/gameHubBestLines.js'
import { useLegalBooks } from './gameHub/gameHubLegalBooks.js'
import { isPgaGame } from './loungeSportsSlateWindow.js'

/**
 * Best legal-book lines for feed / slate game pills, so a pill shows the same spread + ML as the game hub header
 * (`pregameBestLines` before kickoff, `liveBestLines` in play). Book rows come from one batched
 * `lounge-sports-scoreboard { odds_for }` call per tick, built from the hub's sport-wide odds caches.
 */
const TTL_PRE_MS = 120_000
const TTL_LIVE_MS = 20_000
const TICK_MS = 10_000
const BATCH_MS = 60
const BATCH_MAX = 24

const store = new Map()
const subs = new Map()
const liveIds = new Set()
const inflight = new Set()
let queue = new Set()
let batchTimer = 0
let tickTimer = 0
let fetcher = null

function stale(id) {
  const hit = store.get(id)
  if (!hit) return true
  return Date.now() - hit.at > (liveIds.has(id) ? TTL_LIVE_MS : TTL_PRE_MS)
}

function flush() {
  batchTimer = 0
  const ids = [...queue]
  queue = new Set()
  if (!ids.length || !fetcher) return
  for (let i = 0; i < ids.length; i += BATCH_MAX) fetchChunk(ids.slice(i, i + BATCH_MAX))
}

function fetchChunk(ids) {
  for (const id of ids) inflight.add(id)
  fetcher(ids)
    .then((map) => {
      const now = Date.now()
      for (const id of ids) {
        const odds = Array.isArray(map?.[id]) ? map[id] : []
        store.set(id, { at: now, odds })
        subs.get(id)?.forEach((fn) => fn(odds))
      }
    })
    .catch(() => {})
    .finally(() => {
      for (const id of ids) inflight.delete(id)
    })
}

function enqueue(id) {
  if (inflight.has(id) || queue.has(id)) return
  queue.add(id)
  if (!batchTimer) batchTimer = window.setTimeout(flush, BATCH_MS)
}

function tick() {
  if (typeof document !== 'undefined' && document.hidden) return
  for (const id of subs.keys()) if (stale(id)) enqueue(id)
}

function subscribe(id, live, fn, nextFetcher) {
  fetcher = nextFetcher
  if (live) liveIds.add(id)
  else liveIds.delete(id)
  const set = subs.get(id) || new Set()
  set.add(fn)
  subs.set(id, set)
  if (stale(id)) enqueue(id)
  if (!tickTimer) tickTimer = window.setInterval(tick, TICK_MS)
  return () => {
    set.delete(fn)
    if (!set.size) {
      subs.delete(id)
      liveIds.delete(id)
    }
    if (!subs.size && tickTimer) {
      window.clearInterval(tickTimer)
      tickTimer = 0
    }
  }
}

/** `{ away: { spread, ml }, home: { spread, ml } }` picks (book + point / price), or null while loading / no books. */
export function useLoungeGameBestLines(game) {
  const sports = useLoungeSportsFeed()
  const { legalState } = useLegalBooks()
  const status = game?.status
  const id = game && !isPgaGame(game) && (status === 'pre' || status === 'in') ? String(game.id || '') : ''
  const request = sports?.requestGameOdds || null
  const [, setVersion] = useState(0)
  useEffect(() => {
    if (!id || !request) return undefined
    return subscribe(id, status === 'in', () => setVersion((v) => v + 1), request)
  }, [id, status, request])
  const odds = id ? store.get(id)?.odds || null : null
  return useMemo(() => {
    if (!id || !odds?.length) return null
    return status === 'in' ? liveBestLines(odds, { legalState }) : pregameBestLines(odds, { legalState })
  }, [id, odds, status, legalState])
}

/** The game with each side's spread / ML replaced by the best legal line (point / price), when one exists. */
export function withBestLines(game, best) {
  if (!game || !best) return game
  const side = (s, b) => (s ? { ...s, spread: b?.spread?.point ?? s.spread, ml: b?.ml?.price ?? s.ml } : s)
  return { ...game, away: side(game.away, best.away), home: side(game.home, best.home) }
}
