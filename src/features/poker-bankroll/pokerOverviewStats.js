import {
  pokerSessionDurationHours,
  pokerSessionHandsPerHour,
  pokerSessionTotalCost,
  pokerSessionWinLoss,
  pokerSessionBbWon,
} from './pokerBankrollMath.js'
import { pokerCashGameNameFromStored } from './pokerSessionLabels.js'

/** Compact money for dense overview tables ($1.7k, -$23.5k). */
export function fmtPokerOverview$(n, { signed = false } = {}) {
  if (n == null || Number.isNaN(Number(n))) return '-'
  const num = Number(n)
  const abs = Math.abs(num)
  let body
  if (abs >= 100_000) body = `$${(abs / 1000).toFixed(1).replace(/\.0$/, '')}k`
  else if (abs >= 10_000) body = `$${Math.round(abs / 1000)}k`
  else if (abs >= 1000) body = `$${(abs / 1000).toFixed(1).replace(/\.0$/, '')}k`
  else if (abs >= 100) body = `$${abs.toFixed(0)}`
  else body = `$${abs.toFixed(2)}`
  if (num < 0) return `-${body}`
  if (signed && num > 0) return `+${body}`
  return body
}

function emptyBucket() {
  return {
    sessions: 0,
    hours: 0,
    handsSum: 0,
    buyIn: 0,
    cashOut: 0,
    profit: 0,
    wins: 0,
    rebuys: 0,
    sessionsWithRebuy: 0,
    bounty: 0,
    bbWonSum: 0,
    bbHours: 0,
    bbHandsSum: 0,
    winProfitSum: 0,
    winCount: 0,
    lossProfitSum: 0,
    lossCount: 0,
    itm: 0,
    finalTable: 0,
    runnerUp: 0,
    victories: 0,
  }
}

function addSession(bucket, session) {
  const wl = pokerSessionWinLoss(session)
  if (wl == null) return
  const hrs = pokerSessionDurationHours(session)
  const hands = hrs >= 0.02 ? hrs * pokerSessionHandsPerHour(session) : 0
  const buyIn = pokerSessionTotalCost(session)
  const cashOut = Number(session.cash_out) || 0
  const rebuys = Number(session.reentries) || 0
  const bounty = Number(session.bounty_winnings) || 0
  const rebuyDollars = Number(session.rebuy_amount) || 0

  bucket.sessions += 1
  bucket.hours += hrs
  bucket.handsSum += hands
  bucket.buyIn += buyIn
  bucket.cashOut += cashOut + bounty
  bucket.profit += wl
  if (wl > 0) {
    bucket.wins += 1
    bucket.winProfitSum += wl
    bucket.winCount += 1
  } else if (wl < 0) {
    bucket.lossProfitSum += wl
    bucket.lossCount += 1
  }
  bucket.rebuys += rebuys
  if (rebuys > 0 || rebuyDollars > 0) bucket.sessionsWithRebuy += 1
  bucket.bounty += bounty

  if (session.session_type === 'cash') {
    const bbWon = pokerSessionBbWon(session)
    if (bbWon != null && hrs >= 0.02) {
      bucket.bbWonSum += bbWon
      bucket.bbHours += hrs
      bucket.bbHandsSum += hands
    }
  }

  if (session.session_type === 'tournament') {
    const place = session.finish_place != null ? Number(session.finish_place) : null
    if (Number.isFinite(place) && place > 0) {
      if (wl > 0 || place <= 10) bucket.itm += 1
      if (place <= 9) bucket.finalTable += 1
      if (place === 2) bucket.runnerUp += 1
      if (place === 1) bucket.victories += 1
    } else if (wl > 0) {
      bucket.itm += 1
    }
  }
}

function finalize(bucket) {
  const hours = bucket.hours
  const sessions = bucket.sessions
  return {
    ...bucket,
    hourly: hours >= 0.02 ? bucket.profit / hours : null,
    roi: bucket.buyIn > 0 ? (bucket.profit / bucket.buyIn) * 100 : null,
    wonPct: sessions > 0 ? (bucket.wins / sessions) * 100 : null,
    avgBuyIn: sessions > 0 ? bucket.buyIn / sessions : null,
    avgProfit: sessions > 0 ? bucket.profit / sessions : null,
    avgRebuys: sessions > 0 ? bucket.rebuys / sessions : null,
    rebuyPct: sessions > 0 ? (bucket.sessionsWithRebuy / sessions) * 100 : null,
    bbPerHour: bucket.bbHours >= 0.02 ? bucket.bbWonSum / bucket.bbHours : null,
    bbPer100: bucket.bbHandsSum > 0 ? (bucket.bbWonSum / bucket.bbHandsSum) * 100 : null,
    dollarsPer100: bucket.handsSum > 0 ? (bucket.profit / bucket.handsSum) * 100 : null,
    avgWinnings: bucket.winCount > 0 ? bucket.winProfitSum / bucket.winCount : null,
    avgLosses: bucket.lossCount > 0 ? bucket.lossProfitSum / bucket.lossCount : null,
    itmPct: sessions > 0 ? (bucket.itm / sessions) * 100 : null,
    finalTablePct: sessions > 0 ? (bucket.finalTable / sessions) * 100 : null,
    runnerUpPct: sessions > 0 ? (bucket.runnerUp / sessions) * 100 : null,
    victoriesPct: sessions > 0 ? (bucket.victories / sessions) * 100 : null,
  }
}

/** Cash stake tier from big blind. */
export function cashStakeTier(session) {
  const bb = Number(session.big_blind)
  if (!Number.isFinite(bb) || bb <= 0) {
    const bi = Number(session.buy_in) || 0
    if (bi <= 200) return 'Small-Stakes'
    if (bi <= 1000) return 'Mid-Stakes'
    return 'High-Stakes'
  }
  if (bb <= 2) return 'Small-Stakes'
  if (bb <= 5) return 'Mid-Stakes'
  return 'High-Stakes'
}

/** Tournament stake tier from entry buy-in (not re-buys / add-ons). */
export function tourneyStakeTier(session) {
  const bi = Number(session.buy_in) || 0
  if (bi < 1000) return 'Low-Stakes'
  if (bi <= 5000) return 'Mid-Stakes'
  return 'High-Stakes'
}

const TOURNEY_TIER_ORDER = ['Low-Stakes', 'Mid-Stakes', 'High-Stakes']

function cashGameRowLabel(session) {
  const name = pokerCashGameNameFromStored(session.game_variant)
  const sb = Number(session.small_blind)
  const bb = Number(session.big_blind)
  if (Number.isFinite(sb) && Number.isFinite(bb) && sb > 0 && bb > 0) {
    const fmt = (n) => (n % 1 === 0 ? String(n) : n.toFixed(2))
    const stakes = `$${fmt(sb)}/${fmt(bb)}`
    return name ? `${stakes} ${name}` : stakes
  }
  return name || 'Cash'
}

function tourneyGameRowLabel(session) {
  const bi = Number(session.buy_in)
  const biStr = Number.isFinite(bi)
    ? bi >= 1000
      ? `$${(bi / 1000).toFixed(1).replace(/\.0$/, '')}k`
      : `$${bi % 1 === 0 ? bi.toFixed(0) : bi.toFixed(0)}`
    : ''
  const name =
    String(session.tournament_name || '').trim() ||
    pokerCashGameNameFromStored(session.game_variant) ||
    'Tournament'
  return biStr ? `${biStr} ${name}` : name
}

/** Games card: group by session Game field only (stored game_variant). */
function sessionGameFieldLabel(session) {
  const name = pokerCashGameNameFromStored(session.game_variant)
  if (name && name !== 'custom' && name !== 'other') return name
  return session.session_type === 'tournament' ? 'Tournament' : 'Cash'
}

function groupRows(sessions, labelFn) {
  /** @type {Map<string, ReturnType<typeof emptyBucket>>} */
  const map = new Map()
  for (const s of sessions) {
    const label = labelFn(s)
    if (!map.has(label)) map.set(label, emptyBucket())
    addSession(map.get(label), s)
  }
  return [...map.entries()]
    .map(([label, b]) => ({ label, ...finalize(b) }))
    .filter((r) => r.sessions > 0)
    .sort((a, b) => b.hours - a.hours)
}

function monthKey(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

function sessionsInMonth(sessions, y, m) {
  return sessions.filter((s) => {
    const d = new Date(s.start_at)
    return d.getFullYear() === y && d.getMonth() === m
  })
}

function summarizeMonth(sessions) {
  const b = emptyBucket()
  for (const s of sessions) addSession(b, s)
  return finalize(b)
}

/**
 * Full overview aggregates from completed poker sessions.
 * @param {object[]} completedSessions
 */
export function buildPokerOverviewStats(completedSessions) {
  const sessions = (completedSessions || []).filter((s) => s.status !== 'active')
  const cash = sessions.filter((s) => s.session_type === 'cash')
  const tourney = sessions.filter((s) => s.session_type === 'tournament')

  const cashB = emptyBucket()
  const tourneyB = emptyBucket()
  const totalB = emptyBucket()
  for (const s of cash) addSession(cashB, s)
  for (const s of tourney) addSession(tourneyB, s)
  for (const s of sessions) addSession(totalB, s)

  const cashByTier = groupRows(cash, cashStakeTier)
  const cashByGame = groupRows(cash, cashGameRowLabel)
  const tourneyByTier = groupRows(tourney, tourneyStakeTier).sort(
    (a, b) => TOURNEY_TIER_ORDER.indexOf(a.label) - TOURNEY_TIER_ORDER.indexOf(b.label),
  )
  const tourneyByGame = groupRows(tourney, tourneyGameRowLabel)
  const byGameField = groupRows(sessions, sessionGameFieldLabel)

  const now = new Date()
  const curY = now.getFullYear()
  const curM = now.getMonth()
  const prev = new Date(curY, curM - 1, 1)
  const currentMonth = summarizeMonth(sessionsInMonth(sessions, curY, curM))
  const lastMonth = summarizeMonth(sessionsInMonth(sessions, prev.getFullYear(), prev.getMonth()))

  /** Last 3 calendar months including current, oldest → newest */
  const trendMonths = []
  for (let i = 2; i >= 0; i--) {
    const d = new Date(curY, curM - i, 1)
    const key = monthKey(d)
    const label = d.toLocaleString('en-US', { month: 'short' })
    const stats = summarizeMonth(sessionsInMonth(sessions, d.getFullYear(), d.getMonth()))
    trendMonths.push({ key, label, ...stats })
  }
  const trendAgg = summarizeMonth(
    sessions.filter((s) => {
      const d = new Date(s.start_at)
      const oldest = new Date(curY, curM - 2, 1)
      return d >= oldest
    }),
  )

  return {
    cash: finalize(cashB),
    tourney: finalize(tourneyB),
    total: finalize(totalB),
    cashByTier,
    cashByGame,
    tourneyByTier,
    tourneyByGame,
    byGameField,
    currentMonth,
    lastMonth,
    trendMonths,
    trendAgg,
  }
}
