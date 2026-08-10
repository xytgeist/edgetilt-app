import { fmtPoker$ } from '../poker-bankroll/pokerBankrollMath.js'
import { backerSliceAllocatedCapital } from './pokerStableBackerMath.js'
import { sliceDisplayName } from './pokerStableApi.js'
import { computeProRataBackerShares, roundMoney, stableNum } from './pokerStableMath.js'

/** Profit (+ stake capital on close). */
function formatSettlePayAmount(profitAmount, capital, isClose) {
  const profit = roundMoney(profitAmount)
  const cap = roundMoney(capital)
  if (isClose && cap > 0.005) {
    return `${fmtPoker$(profit)} + ${fmtPoker$(cap)}`
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
 * On close, appends that backer's stake capital (baseline × action %) after profit.
 * @param {{
 *   isStakee: boolean,
 *   lines: object[],
 *   userId?: string | null,
 *   playerName: string,
 *   profilesById?: object,
 *   isClose?: boolean,
 *   baseline?: number,
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
}) {
  const phrases = []
  const capitalDeal = { baseline_bankroll: stableNum(baseline) }
  for (const line of lines || []) {
    const amount = roundMoney(line.total_owed)
    const slice = line.slice || {}
    const capital = isClose ? backerSliceAllocatedCapital(capitalDeal, slice) : 0
    if (amount < 0.005 && !(isClose && capital > 0.005)) continue
    const payAmount = formatSettlePayAmount(amount, capital, isClose)
    if (isStakee) {
      const backerName = sliceDisplayName(slice, profilesById)
      phrases.push(
        line.direction === 'player_to_staker'
          ? `You pay ${backerName} ${payAmount}`
          : `${backerName} pays you ${payAmount}`,
      )
      continue
    }
    if (!userId || slice.staker_user_id !== userId) continue
    phrases.push(
      line.direction === 'player_to_staker'
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
