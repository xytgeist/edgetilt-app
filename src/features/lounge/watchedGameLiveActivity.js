import { syncEdgeLiveSportsActivity } from '../../utils/edgeNative.js'

/**
 * Build the Island payload for a board/detail game, or null to end.
 * @param {object | null | undefined} game
 * @param {{ watching?: boolean }} [opts]
 */
export function watchedGameLiveActivityPayload(game, opts = {}) {
  if (!game?.id) return { watching: false }
  const status = String(game.status || '').toLowerCase()
  if (opts.watching === false || status === 'post' || status === 'final') {
    return { watching: false, gameId: String(game.id) }
  }
  if (status !== 'in') return null

  const live = game.live || {}
  const clock = String(live.clock || game.status_label || '').trim()
  const period = String(live.period_label || live.period || '').trim()
  const downDistance = String(live.down_distance || live.downDistance || '').trim()

  return {
    watching: true,
    gameId: String(game.id),
    sportKey: String(game.sport_key || ''),
    status: 'in',
    clock,
    period,
    downDistance,
    away: {
      abbrev: String(game.away?.abbrev || ''),
      score: Number(game.away?.score) || 0,
    },
    home: {
      abbrev: String(game.home?.abbrev || ''),
      score: Number(game.home?.score) || 0,
    },
  }
}

/** Fire-and-forget sync to the iOS shell. No-op outside EdgeiOS. */
export function pushWatchedGameLiveActivity(game, opts = {}) {
  const payload = watchedGameLiveActivityPayload(game, opts)
  if (payload == null) return
  void syncEdgeLiveSportsActivity(payload)
}
