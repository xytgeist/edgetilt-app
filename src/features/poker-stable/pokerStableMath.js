/**
 * Poker Stable settle + ledger math. See docs/poker-stable-spec.md
 */

/** @param {number | string | null | undefined} n */
export function stableNum(n) {
  const x = Number(n)
  return Number.isFinite(x) ? x : 0
}

/** @param {number} n @param {number} [digits=2] */
export function roundMoney(n, digits = 2) {
  const f = 10 ** digits
  return Math.round(stableNum(n) * f) / f
}

/**
 * Deal-level makeup (positive = underwater vs baseline).
 * @param {{ baseline_bankroll?: number, roll?: number }} deal
 */
export function computeDealMakeup(deal) {
  const baseline = stableNum(deal.baseline_bankroll)
  const roll = stableNum(deal.roll ?? deal.overall_bankroll)
  return roundMoney(Math.max(0, baseline - roll))
}

/**
 * Profit above baseline (0 if underwater).
 * @param {{ baseline_bankroll?: number, roll?: number }} deal
 */
export function computeProfitAboveBaseline(deal) {
  const baseline = stableNum(deal.baseline_bankroll)
  const roll = stableNum(deal.roll ?? deal.overall_bankroll)
  return roundMoney(Math.max(0, roll - baseline))
}

/**
 * @param {object} slice
 * @param {number} profitAboveBaseline
 * @param {number} rakebackTotal
 */
export function computeSliceSettleShares(slice, profitAboveBaseline, rakebackTotal) {
  const actionPct = stableNum(slice.action_pct) / 100
  const profitOnSlice = roundMoney(profitAboveBaseline * actionPct)

  let profitShare = 0
  if (slice.pricing_mode === 'profit_split') {
    const playerPct = stableNum(slice.player_profit_pct) / 100
    const backerPct = 1 - playerPct
    profitShare = roundMoney(profitOnSlice * backerPct)
  } else if (slice.pricing_mode === 'markup') {
    profitShare = profitOnSlice
  }

  let rakebackShare = 0
  if (slice.rakeback_mode === 'all_to_stake') {
    rakebackShare = roundMoney(stableNum(rakebackTotal) * actionPct)
  } else if (slice.rakeback_mode === 'custom') {
    const playerRbPct = stableNum(slice.rakeback_player_pct) / 100
    const backerRbPct = 1 - playerRbPct
    rakebackShare = roundMoney(stableNum(rakebackTotal) * actionPct * backerRbPct)
  }

  const totalOwed = roundMoney(profitShare + rakebackShare)
  return { profitShare, rakebackShare, totalOwed, profitOnSlice }
}

/**
 * Settle all active slices on an ongoing deal.
 * @param {object} deal
 * @param {object[]} slices
 * @param {number} [rakebackTotal=0]
 */
export function computeDealSettlement(deal, slices, rakebackTotal = 0) {
  const baseline = stableNum(deal.baseline_bankroll)
  const roll = stableNum(deal.roll ?? deal.overall_bankroll)
  const profitAboveBaseline = computeProfitAboveBaseline({ baseline_bankroll: baseline, roll })
  const makeupAtSettle = computeDealMakeup({ baseline_bankroll: baseline, roll })

  const activeSlices = (slices || []).filter((s) => s.status === 'active')
  const lines = activeSlices.map((slice) => {
    const shares = computeSliceSettleShares(slice, profitAboveBaseline, rakebackTotal)
    return {
      slice_id: slice.id,
      slice,
      ...shares,
      direction: shares.totalOwed >= 0 ? 'player_to_staker' : 'staker_to_player',
      total_owed: Math.abs(shares.totalOwed),
    }
  })

  const playerNetFromDeal = roundMoney(
    profitAboveBaseline -
      lines.reduce((sum, l) => sum + (l.direction === 'player_to_staker' ? l.total_owed : -l.total_owed), 0),
  )

  return {
    baseline_at_settle: baseline,
    roll_at_settle: roll,
    profit_above_baseline: profitAboveBaseline,
    makeup_at_settle: makeupAtSettle,
    rakeback_total: roundMoney(rakebackTotal),
    lines,
    player_net: playerNetFromDeal,
  }
}

/**
 * Pro-rata Edge backer shares of a deal-wide top-up or reduction (by action %).
 * @param {object[]} slices
 * @param {number} amount
 */
export function computeProRataBackerShares(slices, amount) {
  const amt = roundMoney(amount)
  if (amt <= 0) return []
  const active = (slices || []).filter((s) => s.status === 'active')
  const totalAction = active.reduce((sum, s) => sum + stableNum(s.action_pct), 0)
  if (totalAction <= 0) return []
  return active
    .filter((s) => s.counterparty_kind === 'user' && s.staker_user_id)
    .map((s) => ({
      sliceId: s.id,
      stakerUserId: s.staker_user_id,
      actionPct: stableNum(s.action_pct),
      share: roundMoney(amt * (stableNum(s.action_pct) / totalAction)),
    }))
}

/** @param {number} baseline @param {number} roll */
export function maxStakeReductionAmount(baseline, roll) {
  return roundMoney(Math.max(0, Math.min(stableNum(baseline), stableNum(roll))))
}

function fmtLedgerAmt(n) {
  return `$${roundMoney(n).toLocaleString(undefined, { maximumFractionDigits: 0 })}`
}

/**
 * Asymmetric ledger owed from viewer perspective on a slice settlement line.
 * @param {object} params
 * @param {number} params.settleOwed
 * @param {string} params.viewerUserId
 * @param {string} params.playerUserId
 * @param {string | null | undefined} params.stakerUserId
 * @param {Array<{ actor_user_id: string, amount: number, claim_kind: string, status: string }>} params.claims
 */
export function computeSliceLedgerOwed({
  settleOwed,
  viewerUserId,
  playerUserId,
  stakerUserId,
  claims = [],
}) {
  const base = stableNum(settleOwed)
  if (base <= 0) return { owed: 0, statusNotes: [] }

  const isPlayer = viewerUserId === playerUserId
  const isStaker = stakerUserId && viewerUserId === stakerUserId
  /** @type {string[]} */
  const statusNotes = []

  let owed = base

  for (const c of claims) {
    const amt = stableNum(c.amount)
    const actorIsPlayer = c.actor_user_id === playerUserId
    const actorIsStaker = stakerUserId && c.actor_user_id === stakerUserId

    if (isPlayer) {
      if (actorIsPlayer) owed = roundMoney(owed - amt)
      if (actorIsStaker && c.status === 'confirmed') owed = roundMoney(owed - amt)
      if (actorIsStaker && c.status === 'pending') {
        statusNotes.push(`Staker claims ${fmtLedgerAmt(amt)} received`)
      }
      if (actorIsPlayer && c.status === 'pending') {
        statusNotes.push('Awaiting staker confirmation')
      }
      if (c.status === 'disputed' && actorIsStaker) {
        statusNotes.push('Staker disputed')
      }
    }

    if (isStaker) {
      if (actorIsStaker) owed = roundMoney(owed - amt)
      if (actorIsPlayer && c.status === 'confirmed') owed = roundMoney(owed - amt)
      if (actorIsPlayer && c.status === 'pending') {
        statusNotes.push(`Player claims ${fmtLedgerAmt(amt)} paid`)
      }
      if (c.status === 'disputed' && actorIsPlayer) {
        statusNotes.push('You disputed')
      }
      if (actorIsPlayer && c.status === 'confirmed') {
        statusNotes.push('You confirmed payment')
      }
    }
  }

  return { owed: roundMoney(Math.max(0, owed)), statusNotes: [...new Set(statusNotes)] }
}

/** @param {object[]} slices */
export function sumSliceActionPct(slices) {
  return roundMoney((slices || []).reduce((s, sl) => s + stableNum(sl.action_pct), 0), 3)
}

/**
 * Action % sold by the player (stakee) across stable deals.
 * @param {object[]} deals
 * @param {Record<string, object[]>} slicesByDeal
 * @param {{ dealStatuses?: string[] }} [opts]
 */
export function sumStakeeSoldActionPct(deals, slicesByDeal, opts = {}) {
  const dealStatuses = opts.dealStatuses ?? ['active', 'pending']
  let total = 0
  for (const deal of deals || []) {
    if (!dealStatuses.includes(deal.status)) continue
    for (const sl of slicesByDeal[deal.id] || []) {
      if (sl.status === 'cancelled' || sl.status === 'declined') continue
      total += stableNum(sl.action_pct)
    }
  }
  return roundMoney(total, 3)
}

/**
 * Player self-owned action % (100 minus sold backing slices).
 * @param {object[]} deals
 * @param {Record<string, object[]>} slicesByDeal
 * @param {{ dealStatuses?: string[] }} [opts]
 */
export function playerSelfOwnedActionPct(deals, slicesByDeal, opts) {
  const sold = sumStakeeSoldActionPct(deals, slicesByDeal, opts)
  return roundMoney(Math.max(0, 100 - sold), 3)
}

/** @param {string} dealType */
export function dealTypeLabel(dealType) {
  if (dealType === 'cash_piece') return 'Cash piece'
  if (dealType === 'cash_backing') return 'Cash backing'
  if (dealType === 'tournament_piece') return 'Tournament piece'
  if (dealType === 'tournament_package') return 'Tournament package'
  return dealType || 'Deal'
}

/** @param {string} dealType */
export function isOngoingDealType(dealType) {
  return dealType === 'cash_backing' || dealType === 'tournament_package'
}
