import { roundMoney } from './pokerStableMath.js'
import { pokerSessionWinLoss } from '../poker-bankroll/pokerBankrollMath.js'

/**
 * Backer's allocated capital for one slice (baseline × action %).
 * @param {object} deal
 * @param {object} slice
 */
export function backerSliceAllocatedCapital(deal, slice) {
  const baseline = Number(deal?.baseline_bankroll) || 0
  const pct = Number(slice?.action_pct) || 0
  return roundMoney(baseline * (pct / 100))
}

/**
 * Mark-to-market stake value for backer's slice (roll × action % share of deal).
 * @param {object} deal
 * @param {object} slice
 * @param {object | null | undefined} dealRoll profile row
 */
export function backerSliceStakeValue(deal, slice, dealRoll) {
  const roll =
    Number(dealRoll?.overall_bankroll) ||
    Number(deal?.starting_roll) ||
    Number(deal?.baseline_bankroll) ||
    0
  const pct = Number(slice?.action_pct) || 0
  return roundMoney(roll * (pct / 100))
}

/**
 * Backer's share of one completed stake session (gross session W/L × action %).
 * @param {object} deal
 * @param {object} slice
 * @param {object} session
 */
export function backerSliceSessionShare(deal, slice, session) {
  const wl = pokerSessionWinLoss(session)
  if (wl == null) return 0
  const pct = Number(slice?.action_pct) || 0
  return roundMoney(wl * (pct / 100))
}

/**
 * Backer's estimated share of profit above baseline on an active deal.
 */
export function backerSliceEstimatedShare(deal, slice, dealRoll) {
  const baseline = Number(deal?.baseline_bankroll) || 0
  const roll =
    Number(dealRoll?.overall_bankroll) ||
    Number(deal?.starting_roll) ||
    baseline
  const profitAbove = roundMoney(Math.max(0, roll - baseline))
  if (profitAbove <= 0) return 0
  const pct = Number(slice?.action_pct) || 0
  const playerPct = Number(slice?.player_profit_pct) || 50
  const backerProfitPct = slice?.pricing_mode === 'markup' ? 100 : 100 - playerPct
  return roundMoney(profitAbove * (pct / 100) * (backerProfitPct / 100))
}

function viewerBackingSlice(dealId, slicesByDeal, userId) {
  return (slicesByDeal[dealId] || []).find(
    (s) => s.staker_user_id === userId && s.status !== 'declined',
  )
}

function formatTrendLabel(iso) {
  if (!iso) return 'n/a'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return 'n/a'
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

/**
 * Portfolio + per-horse cumulative session share (active + closed stakes).
 * Session performance only ... bankroll adjustments do not affect this series.
 */
export function computeBackerPortfolioTrendChart({
  horseDeals = [],
  sessions = [],
  slicesByDeal = {},
  userId,
}) {
  const deals = [...horseDeals]
  /** @type {Record<string, number>} */
  const perfByDeal = {}
  /** @type {Record<string, number[]>} */
  const horseSeries = {}
  for (const deal of deals) {
    perfByDeal[deal.id] = 0
    horseSeries[deal.id] = [0]
  }

  const events = []
  for (const deal of deals) {
    const slice = viewerBackingSlice(deal.id, slicesByDeal, userId)
    if (!slice) continue
    for (const session of sessions) {
      if (session.deal_id !== deal.id) continue
      events.push({
        deal,
        slice,
        session,
        t: new Date(session.start_at || session.created_at).getTime(),
      })
    }
  }
  events.sort((a, b) => a.t - b.t)

  const labels = ['Start']
  const portfolio = [0]

  for (const ev of events) {
    const share = backerSliceSessionShare(ev.deal, ev.slice, ev.session)
    perfByDeal[ev.deal.id] = roundMoney(perfByDeal[ev.deal.id] + share)
    let port = 0
    for (const deal of deals) {
      port = roundMoney(port + (perfByDeal[deal.id] || 0))
    }
    labels.push(formatTrendLabel(ev.session.start_at || ev.session.created_at))
    portfolio.push(port)
    for (const deal of deals) {
      horseSeries[deal.id].push(perfByDeal[deal.id] || 0)
    }
  }

  return { labels, portfolio, horseSeries, deals }
}

/**
 * Total cumulative session share (last point on portfolio trend).
 */
export function computeBackerSessionShareTotal({
  horseDeals = [],
  sessions = [],
  slicesByDeal = {},
  userId,
}) {
  const { portfolio } = computeBackerPortfolioTrendChart({
    horseDeals,
    sessions,
    slicesByDeal,
    userId,
  })
  if (!portfolio?.length) return 0
  return roundMoney(portfolio[portfolio.length - 1])
}

/**
 * Session share P/L ÷ current capital at risk.
 * @returns {number | null} percent, or null when at risk is zero
 */
export function computeBackerAtRiskReturnPct(sessionShareTotal, capitalAtRisk) {
  const atRisk = roundMoney(capitalAtRisk)
  if (atRisk <= 0) return null
  return roundMoney((roundMoney(sessionShareTotal) / atRisk) * 100)
}

/**
 * Time-weighted return on manual backing pool (Edit → Adjust bankroll boundaries).
 * Numerator: session share $ in each sub-period. Denominator: manual pool at period start.
 * @returns {number | null} percent, or null when not computable
 */
export function computeBackerTwrPct({
  horseDeals = [],
  sessions = [],
  slicesByDeal = {},
  userId,
  adjustments = [],
  liquidBankroll = 0,
  realizedBackingPl = 0,
}) {
  /** @type {{ t: number, kind: 'session', share: number }[]} */
  const sessionEvents = []
  for (const deal of horseDeals) {
    const slice = viewerBackingSlice(deal.id, slicesByDeal, userId)
    if (!slice) continue
    for (const session of sessions) {
      if (session.deal_id !== deal.id) continue
      const t = new Date(session.start_at || session.created_at).getTime()
      if (Number.isNaN(t)) continue
      sessionEvents.push({
        t,
        kind: 'session',
        share: backerSliceSessionShare(deal, slice, session),
      })
    }
  }

  /** @type {{ t: number, kind: 'adjust', amount: number }[]} */
  const adjustEvents = (adjustments || [])
    .map((row) => ({
      t: new Date(row.occurred_at || row.created_at).getTime(),
      kind: 'adjust',
      amount: roundMoney(row.amount),
    }))
    .filter((ev) => !Number.isNaN(ev.t) && ev.amount !== 0)

  const events = [...sessionEvents, ...adjustEvents].sort((a, b) => a.t - b.t)
  if (!events.length) return null

  let manualPool = 0
  let periodSessionPl = 0
  let twrFactor = 1
  let sawAdjust = adjustEvents.length > 0

  function closePeriod() {
    if (manualPool > 0 && periodSessionPl !== 0) {
      twrFactor *= 1 + periodSessionPl / manualPool
    } else if (manualPool > 0 && periodSessionPl === 0) {
      // flat period ... no-op
    }
    periodSessionPl = 0
  }

  for (const ev of events) {
    if (ev.kind === 'session') {
      periodSessionPl = roundMoney(periodSessionPl + ev.share)
      continue
    }
    closePeriod()
    manualPool = roundMoney(manualPool + ev.amount)
    if (manualPool < 0) manualPool = 0
  }

  closePeriod()

  if (!sawAdjust) {
    const estimatedManualPool = roundMoney(
      Math.max(0, roundMoney(liquidBankroll) - roundMoney(realizedBackingPl)),
    )
    const totalSessionPl = computeBackerSessionShareTotal({
      horseDeals,
      sessions,
      slicesByDeal,
      userId,
    })
    if (estimatedManualPool <= 0) return null
    return roundMoney((totalSessionPl / estimatedManualPool) * 100)
  }

  if (twrFactor === 1 && periodSessionPl === 0) {
    return 0
  }

  return roundMoney((twrFactor - 1) * 100)
}

/**
 * @param {object} args
 * @param {object[]} args.deals
 * @param {Record<string, object[]>} args.slicesByDeal
 * @param {string} args.userId
 * @param {Record<string, object>} args.bankrollByDeal
 * @param {number} args.liquidBankroll
 * @param {number} [args.realizedPl]
 */
export function computeBackerPortfolioMetrics({
  deals,
  slicesByDeal,
  userId,
  bankrollByDeal,
  liquidBankroll,
  realizedPl = 0,
}) {
  let capitalAtRisk = 0
  let stakeValueMtm = 0
  let rollExposure = 0
  let activeHorseCount = 0
  let pendingCommitCount = 0

  for (const deal of deals) {
    if (!['active', 'pending'].includes(deal.status)) continue

    const slices = (slicesByDeal[deal.id] || []).filter(
      (s) => s.staker_user_id === userId && s.counterparty_kind === 'user',
    )
    if (!slices.length) continue

    const roll = bankrollByDeal[deal.id]

    for (const slice of slices) {
      if (slice.status !== 'active' && slice.status !== 'pending') continue
      const allocated = backerSliceAllocatedCapital(deal, slice)
      capitalAtRisk = roundMoney(capitalAtRisk + allocated)
      if (slice.status === 'pending') pendingCommitCount += 1

      if (deal.status === 'active') {
        activeHorseCount += 1
        stakeValueMtm = roundMoney(stakeValueMtm + backerSliceStakeValue(deal, slice, roll))
        rollExposure = roundMoney(rollExposure + (Number(roll?.overall_bankroll) || 0))
      } else if (deal.status === 'pending' && slice.status === 'pending') {
        stakeValueMtm = roundMoney(stakeValueMtm + allocated)
      }
    }
  }

  const portfolioValue = roundMoney(Number(liquidBankroll) + stakeValueMtm)

  return {
    liquidBankroll: roundMoney(liquidBankroll),
    portfolioValue,
    capitalAtRisk,
    stakeValueMtm,
    rollExposure,
    activeHorseCount,
    pendingCommitCount,
    realizedBackingPl: roundMoney(realizedPl),
  }
}

/**
 * Portfolio hero metrics including TWR and at-risk return (requires sessions + adjustments).
 */
export function computeBackerPortfolioPerformanceMetrics({
  deals,
  slicesByDeal,
  userId,
  bankrollByDeal,
  liquidBankroll,
  realizedPl = 0,
  horseDeals = [],
  sessions = [],
  adjustments = [],
}) {
  const base = computeBackerPortfolioMetrics({
    deals,
    slicesByDeal,
    userId,
    bankrollByDeal,
    liquidBankroll,
    realizedPl,
  })

  const sessionShareTotal = computeBackerSessionShareTotal({
    horseDeals,
    sessions,
    slicesByDeal,
    userId,
  })

  return {
    ...base,
    sessionShareTotal,
    atRiskReturnPct: computeBackerAtRiskReturnPct(sessionShareTotal, base.capitalAtRisk),
    twrPct: computeBackerTwrPct({
      horseDeals,
      sessions,
      slicesByDeal,
      userId,
      adjustments,
      liquidBankroll,
      realizedBackingPl: realizedPl,
    }),
  }
}

/**
 * Active + pending deals for horse carousel; settled for history.
 */
export function partitionBackerDeals(deals, slicesByDeal, userId) {
  /** @type {object[]} */
  const active = []
  /** @type {object[]} */
  const history = []

  for (const deal of deals) {
    const mySlices = (slicesByDeal[deal.id] || []).filter(
      (s) => s.staker_user_id === userId && s.status !== 'declined',
    )
    if (!mySlices.length && deal.staker_user_id !== userId) continue

    if (deal.status === 'settled' || deal.status === 'declined' || deal.status === 'revoked') {
      if (deal.status === 'settled' || deal.status === 'revoked') history.push(deal)
      continue
    }
    if (['active', 'pending'].includes(deal.status)) active.push(deal)
  }

  active.sort((a, b) => String(b.updated_at || '').localeCompare(String(a.updated_at || '')))
  history.sort((a, b) => String(b.settled_at || b.updated_at || '').localeCompare(String(a.settled_at || a.updated_at || '')))

  return { activeDeals: active, historyDeals: history }
}
