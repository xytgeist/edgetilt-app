import { loungeSportsGameMatch } from '../../utils/loungeSportsApi.js'

/** Sports Hub filter (and game hub) to reopen when Fantasy closes, if Fantasy was opened from there. */
let pendingHubFilter = null
let pendingGame = null

export function markFantasyOpenedFromSportsHub(filter) {
  pendingHubFilter = filter ? String(filter) : null
  pendingGame = null
}

/** Game hub Fantasy tab → Fantasy: closing Fantasy reopens that game (over its slate when it came from one). */
export function markFantasyOpenedFromGame(game, filter) {
  pendingHubFilter = filter ? String(filter) : null
  pendingGame = game?.id ? { id: String(game.id), match: loungeSportsGameMatch(game) } : null
}

export function takeFantasyHubReturn() {
  const filter = pendingHubFilter
  pendingHubFilter = null
  return filter
}

export function takeFantasyGameReturn() {
  const game = pendingGame
  pendingGame = null
  return game
}
