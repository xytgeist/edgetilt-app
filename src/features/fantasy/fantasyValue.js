/**
 * Rest-of-season player value shared by the trade finder and waivers: a blended per-game rate (season production
 * + Sleeper's healthy rest-of-season projection, both in league scoring), the games he should play (schedule
 * minus expected misses), and his expected weekly lineup value. Inputs are the `trade` block the
 * `fantasy-waivers` Edge attaches (rest-of-season and season stat lines, team games left, ESPN return date).
 */
import { scoreLine } from './fantasyBoxScore.js'

/** Season production weight once a player has FULL_SAMPLE_GAMES (less before), the rest is Sleeper rest-of-season. */
const SEASON_WEIGHT = 0.4
const FULL_SAMPLE_GAMES = 5
/** Expected games missed by status. IR / PUP with no ESPN return date assumes LONG_MISS_DEFAULT. */
const MISSED_GAMES = { out: 1, doubtful: 0.75, questionable: 0.15 }
const LONG_MISS_DEFAULT = 4

export function perGame(line, games, scoring, sport, pos) {
  if (!line || !games) return null
  const pts = scoreLine(line, scoring, sport, pos)
  return Number.isFinite(pts) ? pts / games : null
}

export function expectedMissed(injury, returnDate, teamGames) {
  if (injury === 'long') {
    const t = returnDate ? Date.parse(returnDate) : NaN
    const weeks = Number.isFinite(t) ? Math.ceil((t - Date.now()) / (7 * 86_400_000)) : LONG_MISS_DEFAULT
    return Math.min(teamGames, Math.max(0, weeks))
  }
  return Math.min(teamGames, MISSED_GAMES[injury] || 0)
}

/**
 * Rest-of-season profile from the Edge `trade` block: a blended per-game rate (season production + Sleeper's
 * healthy rest-of-season projection), the games he should play (schedule minus expected misses), and his
 * expected weekly lineup value. Null without the block (older Edge, Sniper mode): callers keep 4-week values.
 */
export function seasonProfile(entry, h, ctx, pos) {
  const t = entry?.trade
  if (!t || !ctx.weeksLeft) return null
  const ros = perGame(t.ros_line, t.ros_games, ctx.scoring, ctx.sport, pos)
  const season = perGame(t.season_line, t.season_games, ctx.scoring, ctx.sport, pos)
  let ppg
  if (ros == null) ppg = season ?? h.healthy
  else {
    const w = season == null ? 0 : SEASON_WEIGHT * Math.min(1, t.season_games / FULL_SAMPLE_GAMES)
    ppg = w * (season ?? 0) + (1 - w) * ros
  }
  const teamGames = Number(t.team_games) || 0
  const games = Math.max(0, teamGames - expectedMissed(h.injury, t.return_date, teamGames))
  return { ppg, games, weekly: (ppg * games) / ctx.weeksLeft }
}
