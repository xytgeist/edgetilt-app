import {
  pokerSessionDurationHours,
  pokerSessionWinLoss,
} from '../poker-bankroll/pokerBankrollMath.js'
import { roundMoney } from './pokerStableMath.js'

/** Hero stats for one horse deal (gross table session W/L, same basis as player stake scope). */
export function computeDealSessionHeroStats(sessions = []) {
  let profit = 0
  let hours = 0
  let wins = 0
  let counted = 0
  for (const s of sessions) {
    const wl = pokerSessionWinLoss(s)
    if (wl == null) continue
    counted += 1
    profit += wl
    hours += pokerSessionDurationHours(s)
    if (wl > 0) wins += 1
  }
  return {
    profit: roundMoney(profit),
    hours,
    hourly: hours >= 0.02 ? roundMoney(profit / hours) : null,
    winRate: counted > 0 ? Math.round((wins / counted) * 100) : null,
  }
}

/** Cumulative horse roll sparkline from completed sessions (matches player stake hero). */
export function computeDealRollSparkSeries(sessions = [], overallBankroll = null) {
  const ordered = [...sessions]
    .map((s) => ({
      at: s.end_at || s.start_at || null,
      wl: pokerSessionWinLoss(s),
    }))
    .filter((x) => x.wl != null && x.at)
    .sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime())
  if (ordered.length === 0) return []
  if (overallBankroll != null && Number.isFinite(Number(overallBankroll))) {
    let run = Number(overallBankroll) - ordered.reduce((sum, x) => sum + x.wl, 0)
    const points = [roundMoney(run)]
    for (const x of ordered) {
      run += x.wl
      points.push(roundMoney(run))
    }
    return points
  }
  let run = 0
  const points = [0]
  for (const x of ordered) {
    run += x.wl
    points.push(roundMoney(run))
  }
  return points
}
