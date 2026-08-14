/**
 * Bilateral tournament swap settlement on positive net only
 * (bust / no cash ⇒ that side owes $0).
 *
 * Optional terms (all combinable):
 * - bothMustCash: void unless both cashed (main prize / cash_out > 0)
 * - finalBulletOnly: profit uses one face buy-in each (no extra-bullet cost)
 * - finalTableOnly: void unless either finish is a final table (9, or 6 if 6-max)
 */

/** @param {string | null | undefined} tableSize */
export function swapFinalTableSize(tableSize) {
  return tableSize === '6max' ? 6 : 9
}

/**
 * @param {number | null | undefined} finishPlace
 * @param {string | null | undefined} tableSize
 */
export function swapMadeFinalTable(finishPlace, tableSize) {
  const place = Number(finishPlace)
  if (!Number.isFinite(place) || place < 1) return false
  return place <= swapFinalTableSize(tableSize)
}

/**
 * @param {object | null | undefined} swap
 * @returns {string[]}
 */
export function swapTermLabels(swap) {
  const labels = []
  if (swap?.both_must_cash) labels.push('Both must cash')
  if (swap?.final_bullet_only) labels.push('Final bullet only')
  if (swap?.final_table_only) labels.push('Final table only')
  return labels
}

/** @param {object | null | undefined} swap */
export function formatSwapTermLine(swap) {
  const labels = swapTermLabels(swap)
  return labels.length ? labels.join(' · ') : ''
}

/** @param {object} swap */
export function settlementArgsFromSwap(swap) {
  return {
    creatorPrize: swap.creator_prize,
    creatorBuyIn: swap.creator_buy_in,
    counterpartyPrize: swap.counterparty_prize,
    counterpartyBuyIn: swap.counterparty_buy_in,
    pctCreatorGives: swap.pct_creator_gives,
    pctCounterpartyGives: swap.pct_counterparty_gives,
    bothMustCash: swap.both_must_cash,
    finalBulletOnly: swap.final_bullet_only,
    finalTableOnly: swap.final_table_only,
    creatorCashed: swap.creator_cashed,
    counterpartyCashed: swap.counterparty_cashed,
    creatorFinishPlace: swap.creator_finish_place,
    counterpartyFinishPlace: swap.counterparty_finish_place,
    creatorTableSize: swap.creator_table_size,
    counterpartyTableSize: swap.counterparty_table_size,
    creatorFaceBuyIn: swap.creator_face_buy_in,
    counterpartyFaceBuyIn: swap.counterparty_face_buy_in,
  }
}

/**
 * @param {{
 *   creatorPrize?: number | null,
 *   creatorBuyIn?: number | null,
 *   counterpartyPrize?: number | null,
 *   counterpartyBuyIn?: number | null,
 *   pctCreatorGives?: number | null,
 *   pctCounterpartyGives?: number | null,
 *   bothMustCash?: boolean,
 *   finalBulletOnly?: boolean,
 *   finalTableOnly?: boolean,
 *   creatorCashed?: boolean | null,
 *   counterpartyCashed?: boolean | null,
 *   creatorFinishPlace?: number | null,
 *   counterpartyFinishPlace?: number | null,
 *   creatorTableSize?: string | null,
 *   counterpartyTableSize?: string | null,
 *   creatorFaceBuyIn?: number | null,
 *   counterpartyFaceBuyIn?: number | null,
 * }} args
 * @returns {{
 *   creatorNet: number,
 *   counterpartyNet: number,
 *   creatorOwes: number,
 *   counterpartyOwes: number,
 *   settlementAmount: number | null,
 *   activated: boolean,
 *   pending: boolean,
 * }}
 */
/** settlementAmount: positive => counterparty owes creator; null when pending */
export function computeTournamentSwapSettlement(args) {
  const bothMustCash = Boolean(args.bothMustCash)
  const finalBulletOnly = Boolean(args.finalBulletOnly)
  const finalTableOnly = Boolean(args.finalTableOnly)
  const creatorCashed =
    args.creatorCashed != null
      ? Boolean(args.creatorCashed)
      : (Number(args.creatorPrize) || 0) > 0
  const counterpartyCashed =
    args.counterpartyCashed != null
      ? Boolean(args.counterpartyCashed)
      : (Number(args.counterpartyPrize) || 0) > 0

  let activated = true
  let pending = false

  if (bothMustCash && (!creatorCashed || !counterpartyCashed)) {
    activated = false
  }

  if (activated && finalTableOnly) {
    const creatorFt = swapMadeFinalTable(args.creatorFinishPlace, args.creatorTableSize)
    const counterpartyFt = swapMadeFinalTable(
      args.counterpartyFinishPlace,
      args.counterpartyTableSize,
    )
    if (creatorFt || counterpartyFt) {
      activated = true
    } else if (args.creatorFinishPlace == null || args.counterpartyFinishPlace == null) {
      pending = true
      activated = false
    } else {
      activated = false
    }
  }

  const zero = {
    creatorNet: 0,
    counterpartyNet: 0,
    creatorOwes: 0,
    counterpartyOwes: 0,
    settlementAmount: pending ? null : 0,
    activated,
    pending,
  }
  if (pending || !activated) return zero

  const creatorFace = Number(args.creatorFaceBuyIn) || Number(args.creatorBuyIn) || 0
  const counterpartyFace =
    Number(args.counterpartyFaceBuyIn) || Number(args.counterpartyBuyIn) || 0
  const creatorBuy = finalBulletOnly ? creatorFace : Number(args.creatorBuyIn) || 0
  const counterpartyBuy = finalBulletOnly ? counterpartyFace : Number(args.counterpartyBuyIn) || 0
  const creatorNet = (Number(args.creatorPrize) || 0) - creatorBuy
  const counterpartyNet = (Number(args.counterpartyPrize) || 0) - counterpartyBuy
  const pctYou = Number(args.pctCreatorGives) || 0
  const pctThem = Number(args.pctCounterpartyGives) || 0
  const creatorOwes = (Math.max(0, creatorNet) * pctYou) / 100
  const counterpartyOwes = (Math.max(0, counterpartyNet) * pctThem) / 100
  const settlementAmount = Math.round((counterpartyOwes - creatorOwes) * 100) / 100
  return {
    creatorNet,
    counterpartyNet,
    creatorOwes: Math.round(creatorOwes * 100) / 100,
    counterpartyOwes: Math.round(counterpartyOwes * 100) / 100,
    settlementAmount,
    activated: true,
    pending: false,
  }
}

/**
 * Human-readable IOU line from the viewer’s perspective.
 * @param {number | null | undefined} settlementAmount Positive => counterparty owes creator
 * @param {'creator' | 'counterparty'} viewerRole
 * @param {string} otherLabel
 * @param {(n: number) => string} fmt$
 */
export function formatSwapIouLine(settlementAmount, viewerRole, otherLabel, fmt$) {
  if (settlementAmount == null || Number.isNaN(Number(settlementAmount))) return null
  const amt = Number(settlementAmount)
  if (Math.abs(amt) < 0.005) return 'Even · nothing owed'
  const label = String(otherLabel || 'them').trim() || 'them'
  if (viewerRole === 'creator') {
    if (amt > 0) return `${label} owes you ${fmt$(amt)}`
    return `You owe ${label} ${fmt$(Math.abs(amt))}`
  }
  if (amt > 0) return `You owe ${label} ${fmt$(amt)}`
  return `${label} owes you ${fmt$(Math.abs(amt))}`
}

/**
 * Viewer cash delta from a settled swap (+ received / − paid).
 * settlement_amount > 0 ⇒ counterparty owes creator.
 * @param {object} swap
 * @param {'creator' | 'counterparty' | null} viewerRole
 * @returns {number}
 */
export function swapViewerSettlementDelta(swap, viewerRole) {
  if (!swap || swap.status === 'cancelled') return 0
  if (swap.status !== 'settled' && swap.settlement_amount == null) return 0
  const amt = Number(swap.settlement_amount)
  if (!Number.isFinite(amt)) return 0
  if (viewerRole === 'creator') return amt
  if (viewerRole === 'counterparty') return -amt
  return 0
}

/**
 * Sum viewer deltas for settled swaps linked to a session.
 * @param {object[]} swaps
 * @param {string} sessionId
 * @param {string} viewerUserId
 */
export function sessionSwapSettlementDelta(swaps, sessionId, viewerUserId) {
  if (!sessionId || !viewerUserId) return 0
  let total = 0
  for (const swap of swaps || []) {
    if (!swap || swap.status !== 'settled') continue
    if (swap.creator_session_id !== sessionId && swap.counterparty_session_id !== sessionId) {
      continue
    }
    const role =
      swap.creator_user_id === viewerUserId
        ? 'creator'
        : swap.counterparty_user_id === viewerUserId
          ? 'counterparty'
          : null
    total += swapViewerSettlementDelta(swap, role)
  }
  return Math.round(total * 100) / 100
}

/**
 * Parenthetical settled amount from viewer POV.
 * Gain: plain amount (no parens, no +). Loss: parens with abs value (red styling elsewhere).
 */
export function formatSwapSettledParenAmount(signedAmount, fmt$) {
  if (signedAmount == null || Number.isNaN(Number(signedAmount))) return null
  const n = Number(signedAmount)
  if (Math.abs(n) < 0.005) return fmt$(0)
  if (n > 0.005) return fmt$(n)
  return `(${fmt$(Math.abs(n))})`
}

/**
 * Cash-settled copy from viewer POV (after mark settled).
 * @param {number} signedAmount Viewer delta (+ received / − paid)
 * @param {string} otherLabel
 * @param {(n: number) => string} fmt$
 */
export function formatSwapPaidLine(signedAmount, otherLabel, fmt$) {
  if (signedAmount == null || Number.isNaN(Number(signedAmount))) return null
  const n = Number(signedAmount)
  const label = String(otherLabel || 'them').trim() || 'them'
  if (Math.abs(n) < 0.005) return `${label} · even`
  if (n > 0.005) return `${label} paid you ${fmt$(n)}`
  return `You paid ${label} ${fmt$(Math.abs(n))}`
}

/**
 * Status line for session card / detail swap rows.
 * @param {object} swap
 * @param {'creator' | 'counterparty'} viewerRole
 * @param {string} otherLabel
 * @param {(n: number) => string} fmt$
 * @param {{ paid?: boolean }} [opts]
 */
export function formatSwapSessionStatusLine(swap, viewerRole, otherLabel, fmt$, opts = {}) {
  if (swap?.status === 'settled') {
    const signed = swapViewerSettlementDelta(swap, viewerRole)
    if (opts.paid) return formatSwapPaidLine(signed, otherLabel, fmt$)
    return formatSwapIouLine(swap.settlement_amount, viewerRole, otherLabel, fmt$)
  }
  return formatSwapWaitingStatus(swap, viewerRole, otherLabel)
}

/**
 * Cash-settled label with signed amount from viewer POV.
 * e.g. Settled (+$25) / Settled (-$25)
 */
export function formatSwapSettledAmountLine(signedAmount, fmt$) {
  const paren = formatSwapSettledParenAmount(signedAmount, fmt$)
  if (!paren) return 'Settled'
  return `Settled ${paren}`
}

/**
 * Explicit, role-aware waiting copy for the real gate
 * (accept / claim / log result) ... never blames a side that already finished.
 *
 * @param {object} swap
 * @param {'creator' | 'counterparty'} viewerRole
 * @param {string} otherLabel
 */
export function formatSwapWaitingStatus(swap, viewerRole, otherLabel) {
  const label = String(otherLabel || 'them').trim() || 'them'
  const creatorReady = Boolean(swap?.creator_result_ready)
  const cpReady = Boolean(swap?.counterparty_result_ready)
  if (creatorReady && cpReady) {
    if (
      swap?.final_table_only &&
      (swap.creator_finish_place == null || swap.counterparty_finish_place == null) &&
      !swapMadeFinalTable(swap.creator_finish_place, swap.creator_table_size) &&
      !swapMadeFinalTable(swap.counterparty_finish_place, swap.counterparty_table_size)
    ) {
      return 'Need finish places (final-table swap)'
    }
    return 'Both results in'
  }

  const accepted = Boolean(swap?.counterparty_session_accepted_at)
  const isGuest = swap?.counterparty_kind === 'guest'
  const selfReady = viewerRole === 'creator' ? creatorReady : cpReady

  // Edge user / guest hasn’t joined the swap yet (Incoming Accept or claim link).
  if (!cpReady && !accepted) {
    if (isGuest) {
      if (viewerRole === 'creator') {
        return `Waiting on ${label} to claim · or enter their result below`
      }
      return 'Waiting on you to claim this swap'
    }
    if (viewerRole === 'creator') return `Waiting on ${label} to accept`
    return 'Waiting on you to accept this swap'
  }

  // Joined / claimed path — results still missing (soft copy; not a do-it-now nudge).
  if (!selfReady || !creatorReady || !cpReady) {
    if (isGuest && viewerRole === 'creator' && !cpReady) {
      return 'Awaiting results (upon completed sessions) · or enter theirs below'
    }
    return 'Awaiting results (upon completed sessions)'
  }
  return 'Both results in'
}

/**
 * One side’s logged result + their positive-net swap share.
 * @param {object} swap
 * @param {'creator' | 'counterparty'} side
 * @param {string} label
 * @param {(n: number) => string} fmt$
 */
export function formatSwapSideResultLine(swap, side, label, fmt$) {
  const buyIn =
    side === 'creator' ? Number(swap?.creator_buy_in) : Number(swap?.counterparty_buy_in)
  const prize =
    side === 'creator' ? Number(swap?.creator_prize) : Number(swap?.counterparty_prize)
  const pct =
    side === 'creator' ? Number(swap?.pct_creator_gives) : Number(swap?.pct_counterparty_gives)
  if (!Number.isFinite(buyIn) && !Number.isFinite(prize)) return null
  const net = (Number.isFinite(prize) ? prize : 0) - (Number.isFinite(buyIn) ? buyIn : 0)
  const share = Math.round((Math.max(0, net) * (Number.isFinite(pct) ? pct : 0)) / 100 * 100) / 100
  const who = String(label || (side === 'creator' ? 'Them' : 'Them')).trim() || 'Them'
  return `${who}: net ${fmt$(net)} · ${fmt$(share)} toward swap`
}

/** @param {unknown} pct */
export function parseSwapPct(pct) {
  const n = parseFloat(String(pct ?? '').trim())
  if (!Number.isFinite(n) || n < 0 || n > 100) return null
  return Math.round(n * 1000) / 1000
}
