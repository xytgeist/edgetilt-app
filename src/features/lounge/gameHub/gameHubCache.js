/**
 * In-memory per-game cache for the game hub tabs (detail, fantasy/roster, posts by sort, chat).
 * Reopening a game (or hopping between game pills) paints the last data instantly while the
 * normal fetches refresh it in the background. Cleared on full page reload.
 */
const MAX_GAMES = 12
const cache = new Map()

export function readGameHubCache(gameId) {
  const key = gameId ? String(gameId) : ''
  if (!key || !cache.has(key)) return null
  const entry = cache.get(key)
  cache.delete(key)
  cache.set(key, entry)
  return entry
}

export function writeGameHubCache(gameId, patch) {
  const key = gameId ? String(gameId) : ''
  if (!key) return
  const prev = cache.get(key) || {}
  cache.delete(key)
  cache.set(key, { ...prev, ...patch })
  while (cache.size > MAX_GAMES) cache.delete(cache.keys().next().value)
}
