/**
 * NBA fantasy week for one player: the host's week-to-date points plus Sleeper's per-game projection for
 * every game still to play (the share left of a game in progress). Cards come from `fantasy-lineup-cards`
 * (`proj_line` per game, `games_week` / `games_left` / `games_played`); points from the roster row
 * (`week_points`, saved at sync).
 */
import { scoreLine } from './fantasyBoxScore.js'
import { lockInValue } from './fantasyLockIn.js'
import { projectionOf } from './fantasyProjection.js'

const NBA_GAME_MS = 140 * 60_000

const clamp01 = (n) => Math.min(1, Math.max(0, n))

function liveProgress(card, now) {
  const p = Number(card?.game_progress)
  if (Number.isFinite(p)) return clamp01(p)
  const kick = Date.parse(card?.kickoff || '')
  return Number.isFinite(kick) ? Math.min(0.97, clamp01((now - kick) / NBA_GAME_MS)) : 0
}

/**
 * @param {object} row roster row (`week_points`, `created_at` = sync time, `injury_status`)
 * @param {object} card lineup card
 * @returns {{ perGame: number, gamesWeek: number, gamesLeft: number, played: number, live: boolean,
 *   progress: number, host: number, boost: number, scored: number, remaining: number, total: number,
 *   pregame: number }}
 */
export function nbaWeekOf(row, card, scoring, now = Date.now(), { lockIn = false } = {}) {
  if (lockIn) return lockInWeekOf(row, card, scoring, now)
  const perGame = card ? projectionOf(card, scoring, 'nba', card.pos || null) : NaN
  const hasPer = Number.isFinite(perGame)
  const hostRaw = Number(row?.week_points)
  const host = Number.isFinite(hostRaw) ? hostRaw : 0
  const gamesWeek = Number(card?.games_week) || 0
  let gamesLeft = Number(card?.games_left) || 0
  const live = card?.game_status === 'in_progress'
  const progress = live ? liveProgress(card, now) : 0

  // Live points the host number does not hold yet: the sync caught `syncShare` of this game, so take that
  // share of the live line back out (paced) rather than counting it twice.
  let boost = 0
  if (live) {
    const scored = scoreLine(card.line, scoring, 'nba', card.pos || null)
    const livePts = Number.isFinite(scored) ? scored : 0
    const kick = Date.parse(card?.kickoff || '')
    const synced = Date.parse(row?.created_at || '')
    let atSync = 0
    if (Number.isFinite(kick) && Number.isFinite(synced) && synced > kick && progress > 0) {
      atSync = livePts * Math.min(1, clamp01((synced - kick) / NBA_GAME_MS) / progress)
    }
    boost = Math.max(0, livePts - atSync)
  }

  // Ruled out sits the next game only; the rest of the week still projects.
  if (!live && String(row?.injury_status || '').toLowerCase() === 'out' && gamesLeft > 0) gamesLeft -= 1
  const remaining = hasPer ? perGame * (gamesLeft + (live ? 1 - progress : 0)) : 0
  const scored = host + boost
  return {
    perGame,
    gamesWeek,
    gamesLeft,
    played: (Number(card?.games_played) || 0) + (live ? 1 : 0),
    live,
    progress,
    host,
    boost,
    scored,
    remaining,
    total: scored + remaining,
    pregame: hasPer ? perGame * gamesWeek : NaN,
  }
}

/**
 * Lock-In (Sleeper): one game counts. The host's number is the score in hand (his latest or locked game); the week
 * is the better of that and what his games left are worth. A live game counts as its paced final against the games
 * after it. The host already shows the counted score, so nothing is added on top of it.
 */
function lockInWeekOf(row, card, scoring, now) {
  const perGame = card ? projectionOf(card, scoring, 'nba', card.pos || null) : NaN
  const hasPer = Number.isFinite(perGame)
  const hostRaw = Number(row?.week_points)
  const host = Number.isFinite(hostRaw) ? hostRaw : 0
  const gamesWeek = Number(card?.games_week) || 0
  let gamesLeft = Number(card?.games_left) || 0
  const live = card?.game_status === 'in_progress'
  const progress = live ? liveProgress(card, now) : 0
  const playedBefore = Number(card?.games_played) || 0
  if (!live && String(row?.injury_status || '').toLowerCase() === 'out' && gamesLeft > 0) gamesLeft -= 1
  const after = hasPer ? lockInValue(perGame, gamesLeft) : 0
  let total
  if (live) {
    const scored = scoreLine(card.line, scoring, 'nba', card.pos || null)
    const paced = (Number.isFinite(scored) ? scored : 0) + (hasPer ? perGame * (1 - progress) : 0)
    total = Math.max(paced, after)
  } else if (playedBefore > 0 || host) {
    total = Math.max(host, after)
  } else {
    total = after
  }
  return {
    perGame,
    gamesWeek,
    gamesLeft,
    played: playedBefore + (live ? 1 : 0),
    live,
    progress,
    host,
    boost: 0,
    scored: host,
    remaining: Math.max(0, total - host),
    total,
    pregame: hasPer ? lockInValue(perGame, gamesWeek) : NaN,
    lockIn: true,
  }
}
