import { horizonValue } from './fantasyWaivers.js'

const YARD_STATS = new Set(['pass_yds', 'rush_yds', 'rec_yds'])
const YARD_WORD = { pass_yds: 'pass yds', rush_yds: 'rush yds', rec_yds: 'rec yds' }
/** FantasyCalc redraft value at which a one-week streamer is also a rest-of-season hold. */
const HOLD_MARKET_VALUE = 600

function strike(label) {
  const m = String(label || '').match(/^(\d+(?:\.\d+)?)\+/)
  return m ? Number(m[1]) : null
}

/** Strongest Kalshi signals: anytime TD price and the highest yardage line still priced at 30%+. */
function marketSignals(props) {
  let td = null
  let ladder = null
  for (const p of props || []) {
    const price = Number(p.price)
    if (!Number.isFinite(price)) continue
    const k = strike(p.label)
    if (p.stat === 'td' && k === 1) td = td && td.price >= price ? td : { price, prop: p }
    if (YARD_STATS.has(p.stat) && k != null && price >= 0.3 && (!ladder || k > ladder.strike)) {
      ladder = { strike: k, price, stat: p.stat, prop: p }
    }
  }
  return { td, ladder }
}

/**
 * Boom picks for one week: available players the market, the depth chart, or the matchup says could
 * outrun their projection. Ranked by projection plus those signals; every pick says why.
 */
export function rankBoom({ sniper, scoring, sport = 'nfl', perPos = 2 }) {
  const scored = (sniper?.boom || []).map((entry) => ({
    entry,
    proj: horizonValue({ ...entry, weeks: (entry.weeks || []).slice(0, 1) }, scoring, entry.injury_status, sport).avg,
  }))
  // Projection counts relative to the position (QBs always project highest), so the signals decide.
  const baseline = {}
  for (const { entry, proj } of scored) (baseline[entry.position] ||= []).push(proj)
  for (const pos of Object.keys(baseline)) {
    const list = baseline[pos].sort((a, b) => a - b)
    baseline[pos] = list[Math.floor(list.length / 2)] || 1
  }
  const picks = []
  for (const { entry, proj } of scored) {
    const { td, ladder } = marketSignals(entry.props)
    const reasons = []
    let score = 3 * (proj / Math.max(1, baseline[entry.position] || 1))
    if (entry.next_up?.length) {
      reasons.push(`next up with ${entry.next_up.join(' / ')} hurt`)
      score += 5
    }
    if (td && td.price >= 0.3) {
      reasons.push(`Kalshi ${Math.round(td.price * 100)}¢ anytime TD`)
      score += td.price * 6
    }
    if (ladder) {
      reasons.push(`${ladder.strike}+ ${YARD_WORD[ladder.stat]} at ${Math.round(ladder.price * 100)}¢`)
      score += ladder.strike / 25
    }
    // NBA streaming: games this week is most of a pickup's value.
    if (sport === 'nba' && Number(entry.games_left) >= 3) {
      reasons.push(`${entry.games_left} games left this week`)
      score += Number(entry.games_left) * 0.8
    }
    if (entry.matchup_grade === 'A') {
      reasons.push(`soft matchup (#${entry.matchup_rank} vs ${entry.position}s)`)
      score += 1.5
    } else if (entry.matchup_grade === 'B') {
      score += 0.5
    }
    if (!reasons.length) continue
    // FantasyCalc only lists players with real trade value: a streamer it prices is worth keeping past this week.
    const hold = Number(entry.market_value) >= HOLD_MARKET_VALUE
    if (hold) {
      reasons.push('worth holding past this week')
      score += 1
    }
    picks.push({
      entry,
      proj,
      score,
      reasons,
      hold,
      prop: ladder?.prop || td?.prop || entry.props?.[0] || null,
      // Raw signals behind `reasons`, for copy that explains them (weekly digest).
      signals: {
        nextUp: entry.next_up?.length ? entry.next_up : null,
        td: td && td.price >= 0.3 ? { price: td.price } : null,
        ladder: ladder ? { strike: ladder.strike, stat: ladder.stat, word: YARD_WORD[ladder.stat], price: ladder.price } : null,
        matchup: entry.matchup_grade === 'A' ? { rank: entry.matchup_rank } : null,
      },
    })
  }
  picks.sort((a, b) => b.score - a.score)
  const count = {}
  return picks.filter((p) => {
    const pos = p.entry.position
    count[pos] = (count[pos] || 0) + 1
    return count[pos] <= perPos
  })
}

/** Handcuffs: the free next back behind your RB1s first, then other teams' most valuable RB1s to block. */
export function rankHandcuffs({ sniper, scoring, sport = 'nfl' }) {
  const rows = (sniper?.handcuffs || []).map((h) => ({
    ...h,
    proj: horizonValue(h.backup, scoring, h.backup.injury_status, sport).avg,
  }))
  const mine = rows.filter((h) => h.starter.mine)
  const block = rows
    .filter((h) => !h.starter.mine)
    .sort((a, b) => (Number(b.starter.horizon_ppr) || 0) - (Number(a.starter.horizon_ppr) || 0))
    .slice(0, 5)
  return { mine, block }
}
