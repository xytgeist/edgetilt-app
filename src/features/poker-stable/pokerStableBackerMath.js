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
    const slices = (slicesByDeal[deal.id] || []).filter(
      (s) => s.staker_user_id === userId && s.counterparty_kind === 'user',
    )
    if (!slices.length) continue

    const roll = bankrollByDeal[deal.id]
    const isLive = deal.status === 'active' || deal.status === 'pending' || deal.status === 'revoked'

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

    if (!isLive) continue
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
