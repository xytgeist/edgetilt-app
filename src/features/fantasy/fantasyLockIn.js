/**
 * Sleeper NBA Lock-In: one game per player per week counts. After each game the manager locks that score in or
 * passes for a later game; with no lock the last game of the week counts. (Legacy Game Pick leagues also count one
 * game.) A player's week is then the optimal-stopping value of his games left, with each game's score taken as
 * normal(mean, LOCK_IN_SD_SHARE x mean). ESPN / Yahoo NBA leagues count every game and keep the summed math.
 */

/** A single game's fantasy score spread as a share of its mean (NBA box scores swing about this much night to night). */
export const LOCK_IN_SD_SHARE = 0.3

/** Every Sleeper NBA league counts one game per player per week (Lock-In, or legacy Game Pick). */
export function nbaLockIn(provider, sport = 'nba') {
  return String(sport || '').toLowerCase() === 'nba' && String(provider || '').toLowerCase() === 'sleeper'
}

function normPdf(x) {
  return Math.exp(-0.5 * x * x) / Math.sqrt(2 * Math.PI)
}

function normCdf(x) {
  const sign = x < 0 ? -1 : 1
  const a = Math.abs(x) / Math.SQRT2
  const t = 1 / (1 + 0.3275911 * a)
  const y = 1 - (((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-a * a))
  return 0.5 * (1 + sign * y)
}

/** Expected counted score with `games` still to play and nothing in hand: lock a game only when it beats waiting. */
export function lockInValue(mean, games, sdShare = LOCK_IN_SD_SHARE) {
  const m = Number(mean)
  const k = Math.floor(Number(games) || 0)
  if (!(m > 0) || k <= 0) return 0
  const sd = m * sdShare
  // One game left must count; each earlier game is kept only above the value of the games after it.
  let v = m
  for (let i = 1; i < k; i += 1) {
    const d = (m - v) / sd
    v = m * normCdf(d) + v * normCdf(-d) + sd * normPdf(d)
  }
  return v
}

/** Week value per point of per-game projection (1 game = 1, 2 ≈ 1.12, 3 ≈ 1.19, 4 ≈ 1.24). */
export function lockInFactor(games) {
  return lockInValue(1, games)
}

/** A finished game's score vs the rest of the week: lock it when it beats what his games left are worth. */
export function lockInCall(score, mean, gamesLeft) {
  const after = lockInValue(mean, gamesLeft)
  return { lock: gamesLeft <= 0 || Number(score) >= after, after }
}
