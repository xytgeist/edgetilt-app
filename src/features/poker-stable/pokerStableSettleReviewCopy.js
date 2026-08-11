import { fmtPoker$ } from '../poker-bankroll/pokerBankrollMath.js'
import { backerSliceAllocatedCapital } from './pokerStableBackerMath.js'
import { sliceDisplayName } from './pokerStableApi.js'
import { computeProRataBackerShares, roundMoney, stableNum } from './pokerStableMath.js'

/**
 * Close returns the backer's share of CURRENT roll (not baseline).
 * @param {number} baseline
 * @param {number} roll
 * @param {object} slice
 */
export function backerCloseCapitalReturned(baseline, roll, slice) {
  const action = (Number(slice?.action_pct) || 0) / 100
  const rollShare = roundMoney(stableNum(roll) * action)
  // Prefer roll share; fall back to face if roll missing.
  if (Math.abs(rollShare) > 0.005 || stableNum(roll) > 0.005) return Math.max(0, rollShare)
  return backerSliceAllocatedCapital({ baseline_bankroll: stableNum(baseline) }, slice)
}

/** Signed stake P/L for a slice at settle (profit share or −makeup share). */
export function backerCloseStakePl(settlement, slice, line = null) {
  if (!settlement || !slice) return 0
  const action = (Number(slice.action_pct) || 0) / 100
  const makeup = stableNum(settlement.makeup_at_settle)
  if (makeup > 0.005) return roundMoney(-makeup * action)
  if (line) {
    let credit = roundMoney(
      (Number(line.profit_share) || 0) + (Number(line.rakeback_share) || 0),
    )
    if (line.direction === 'staker_to_player') credit = -credit
    return credit
  }
  const profit = stableNum(settlement.profit_above_baseline)
  return roundMoney(profit * action)
}

/** Profit/loss (+ capital returned on close). */
function formatSettlePayAmount(profitAmount, capital, isClose) {
  const profit = roundMoney(profitAmount)
  const cap = roundMoney(capital)
  if (isClose && cap > 0.005) {
    const plBit = `${profit >= 0 ? '+' : ''}${fmtPoker$(profit)} stake P/L`
    return `${plBit} · ${fmtPoker$(cap)} returned`
  }
  return fmtPoker$(profit)
}

/**
 * Normalize settle lines so pay-copy helpers can read total_owed + nested slice.
 * @param {object[]} lines
 * @param {object[]} slices
 */
export function attachSlicesToSettleLines(lines = [], slices = []) {
  const byId = Object.fromEntries((slices || []).map((s) => [s.id, s]))
  return (lines || []).map((line) => {
    const sliceId = line.slice_id || line.sliceId || line.slice?.id
    const total =
      line.total_owed != null
        ? line.total_owed
        : line.totalOwed != null
          ? line.totalOwed
          : 0
    return {
      ...line,
      total_owed: roundMoney(total),
      slice: line.slice || byId[sliceId] || { id: sliceId },
    }
  })
}

/**
 * Viewer-facing settle payment phrases.
 * On close, uses CURRENT roll × action % as capital returned (not baseline),
 * and signed stake P/L (including underwater makeup).
 * @param {{
 *   isStakee: boolean,
 *   lines: object[],
 *   userId?: string | null,
 *   playerName: string,
 *   profilesById?: object,
 *   isClose?: boolean,
 *   baseline?: number,
 *   roll?: number,
 *   settlement?: object | null,
 * }} params
 */
export function settlePayPhrases({
  isStakee,
  lines,
  userId,
  playerName,
  profilesById = {},
  isClose = false,
  baseline = 0,
  roll = null,
  settlement = null,
}) {
  const phrases = []
  const rollAt = roll != null ? stableNum(roll) : stableNum(settlement?.roll_at_settle)
  const baseAt = baseline != null ? stableNum(baseline) : stableNum(settlement?.baseline_at_settle)
  for (const line of lines || []) {
    const slice = line.slice || {}
    const stakePl = isClose
      ? backerCloseStakePl(settlement || { makeup_at_settle: 0, profit_above_baseline: line.total_owed }, slice, line)
      : roundMoney(
          line.direction === 'staker_to_player'
            ? -stableNum(line.total_owed)
            : stableNum(line.total_owed),
        )
    const capital = isClose ? backerCloseCapitalReturned(baseAt, rollAt, slice) : 0
    if (Math.abs(stakePl) < 0.005 && !(isClose && capital > 0.005)) continue
    const payAmount = formatSettlePayAmount(isClose ? stakePl : Math.abs(stakePl), capital, isClose)
    if (isStakee) {
      const backerName = sliceDisplayName(slice, profilesById)
      if (isClose) {
        phrases.push(`${backerName}: ${payAmount}`)
        continue
      }
      phrases.push(
        stakePl >= 0
          ? `You pay ${backerName} ${payAmount}`
          : `${backerName} pays you ${payAmount}`,
      )
      continue
    }
    if (!userId || slice.staker_user_id !== userId) continue
    if (isClose) {
      phrases.push(payAmount)
      continue
    }
    phrases.push(
      stakePl >= 0
        ? `${playerName} pays you ${payAmount}`
        : `You pay ${playerName} ${payAmount}`,
    )
  }
  return phrases
}

/**
 * Player: per-backer names. Backer: "Owed to you" + aggregated "Other backers".
 * @returns {{ key: string, label: string, share: number }[]}
 */
export function settleReductionShareRows({
  isStakee,
  slices = [],
  reductionAmount = 0,
  userId = null,
  profilesById = {},
}) {
  const amount = roundMoney(reductionAmount)
  if (amount < 0.005) return []
  const shares = computeProRataBackerShares(slices, amount)
  if (!shares.length) return []

  if (isStakee) {
    return shares.map((row) => ({
      key: row.sliceId,
      label: sliceDisplayName(slices.find((s) => s.id === row.sliceId) || {}, profilesById),
      share: row.share,
    }))
  }

  const mine = shares.filter((row) => row.stakerUserId === userId)
  const others = shares.filter((row) => row.stakerUserId !== userId)
  const rows = []
  const myShare = roundMoney(mine.reduce((sum, row) => sum + row.share, 0))
  if (myShare > 0.005 || mine.length) {
    rows.push({ key: 'owed-to-you', label: 'Owed to you', share: myShare })
  }
  const otherShare = roundMoney(others.reduce((sum, row) => sum + row.share, 0))
  if (others.length && otherShare > 0.005) {
    rows.push({ key: 'other-backers', label: 'Other backers', share: otherShare })
  }
  return rows
}

/**
 * Final bullet under settle credit (periodic vs close).
 * @param {{ baseline: number, reductionAmount?: number, isClose?: boolean }} params
 */
export function settleResetBullet({ baseline, reductionAmount = 0, isClose = false }) {
  const base = roundMoney(baseline)
  const reduction = roundMoney(reductionAmount)
  const after =
    reduction > 0.005 ? roundMoney(Math.max(0, base - reduction)) : base
  if (isClose) {
    if (reduction > 0.005) {
      return `Stake closes at ${fmtPoker$(base)}, then reduces to ${fmtPoker$(after)}`
    }
    return `Stake closes at ${fmtPoker$(base)}`
  }
  if (reduction > 0.005) {
    return `Stake resets to ${fmtPoker$(base)}, then reduces to ${fmtPoker$(after)} and remains open`
  }
  return `Stake resets to ${fmtPoker$(base)} and remains open`
}
