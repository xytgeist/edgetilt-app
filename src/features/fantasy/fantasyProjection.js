/**
 * This week's projection in a league's scoring.
 * Baseline: Sleeper's projected stat line scored with the league's rules (Sleeper's PPR total when the rules
 * cannot apply). Blend: each stat a market covers (`card.market_line`: NFL sportsbook props, NBA Kalshi ladders) replaces Sleeper's number for
 * that stat, the rest stay Sleeper's, and the mix is scored the same way. A blend more than GUARD_PTS and
 * GUARD_SHARE away from the baseline falls back to the baseline (a thin or missing market, e.g. a TE with a
 * yards line and no TD line, should not swing a projection on its own).
 */
import { scoreLine } from './fantasyBoxScore.js'

const GUARD_PTS = 3
const GUARD_SHARE = 0.35

export function baselineProjection(card, scoring, sport = 'nfl', pos = null) {
  const fromLine = card?.proj_line ? scoreLine(card.proj_line, scoring, sport, pos || card?.pos || null) : null
  if (Number.isFinite(fromLine)) return fromLine
  // No projection yet (e.g. a fresh pickup before his card fills in) is unknown, not 0: Number(null) is 0.
  if (card?.projected == null || card.projected === '') return NaN
  const p = Number(card.projected)
  return Number.isFinite(p) ? p : NaN
}

/** Projected points (NaN when there is nothing to project from). */
export function projectionOf(card, scoring, sport = 'nfl', pos = null) {
  const position = pos || card?.pos || null
  const base = baselineProjection(card, scoring, sport, position)
  if ((sport !== 'nfl' && sport !== 'nba') || !card?.market_line) return base
  const blended = scoreLine({ ...(card.proj_line || {}), ...card.market_line }, scoring, sport, position)
  if (!Number.isFinite(blended)) return base
  if (!Number.isFinite(base)) return blended
  const off = Math.abs(blended - base)
  return off > GUARD_PTS && off > Math.abs(base) * GUARD_SHARE ? base : blended
}
