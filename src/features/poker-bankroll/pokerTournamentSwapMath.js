/**
 * Bilateral tournament swap settlement.
 *
 * Default (no term boxes): extra bullets are swapped at face. The player with
 * fewer bullets covers `pct * extra * face` when the extra-firer busts. % is of
 * prize (minus live extra-bullet face, and any face owed on the partner's busted
 * extras). Do not subtract the first buy-in from prize.
 * If both cash, extras only reduce the extra-firer's prize (no second face IOU).
 *
 * Optional terms (all combinable):
 * - bothMustCash: void unless both cashed (main prize / cash_out > 0)
 * - minCashThreshold: void unless either prize >= threshold
 * - finalBulletOnly: one face buy-in each ... no extra-bullet face
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
  const minCash = Number(swap?.min_cash_threshold)
  if (Number.isFinite(minCash) && minCash > 0) {
    labels.push(`Min cash $${minCash % 1 === 0 ? minCash.toFixed(0) : minCash.toFixed(2)}`)
  }
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
    minCashThreshold: swap.min_cash_threshold,
    creatorCashed: swap.creator_cashed,
    counterpartyCashed: swap.counterparty_cashed,
    creatorFinishPlace: swap.creator_finish_place,
    counterpartyFinishPlace: swap.counterparty_finish_place,
    creatorTableSize: swap.creator_table_size,
    counterpartyTableSize: swap.counterparty_table_size,
    creatorFaceBuyIn: swap.creator_face_buy_in,
    counterpartyFaceBuyIn: swap.counterparty_face_buy_in,
    creatorBullets: swap.creator_bullets,
    counterpartyBullets: swap.counterparty_bullets,
    creatorExcludePriorBullets: swap.creator_exclude_prior_bullets,
    counterpartyExcludePriorBullets: swap.counterparty_exclude_prior_bullets,
  }
}

/**
 * Bullet count for swap extras. Prefer logged re-entries, then stored bullets,
 * then total / face (add-ons can skew that last fallback).
 * @param {{
 *   bullets?: number | null,
 *   reentries?: number | null,
 *   totalBuyIn?: number | null,
 *   faceBuyIn?: number | null,
 * }} args
 */
export function swapBulletCount(args = {}) {
  const explicit = Number(args.bullets)
  if (Number.isFinite(explicit) && explicit >= 1) return Math.round(explicit)
  const reentries = Number(args.reentries)
  if (Number.isFinite(reentries) && reentries >= 0) return 1 + Math.round(reentries)
  const face = Number(args.faceBuyIn) || 0
  const total = Number(args.totalBuyIn) || 0
  if (face > 0.005 && total > 0.005) {
    return Math.max(1, Math.round(total / face))
  }
  return 1
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
 *   minCashThreshold?: number | null,
 *   creatorCashed?: boolean | null,
 *   counterpartyCashed?: boolean | null,
 *   creatorFinishPlace?: number | null,
 *   counterpartyFinishPlace?: number | null,
 *   creatorTableSize?: string | null,
 *   counterpartyTableSize?: string | null,
 *   creatorFaceBuyIn?: number | null,
 *   counterpartyFaceBuyIn?: number | null,
 *   creatorBullets?: number | null,
 *   counterpartyBullets?: number | null,
 *   creatorReentries?: number | null,
 *   counterpartyReentries?: number | null,
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
  const minCashThreshold = Number(args.minCashThreshold)
  const creatorCashed =
    args.creatorCashed != null
      ? Boolean(args.creatorCashed)
      : (Number(args.creatorPrize) || 0) > 0
  const counterpartyCashed =
    args.counterpartyCashed != null
      ? Boolean(args.counterpartyCashed)
      : (Number(args.counterpartyPrize) || 0) > 0
  const creatorPrize = Number(args.creatorPrize) || 0
  const counterpartyPrize = Number(args.counterpartyPrize) || 0

  let activated = true
  let pending = false

  if (bothMustCash && (!creatorCashed || !counterpartyCashed)) {
    activated = false
  }

  if (
    activated &&
    Number.isFinite(minCashThreshold) &&
    minCashThreshold > 0 &&
    creatorPrize < minCashThreshold &&
    counterpartyPrize < minCashThreshold
  ) {
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

  const face =
    Number(args.creatorFaceBuyIn) ||
    Number(args.counterpartyFaceBuyIn) ||
    Number(args.creatorBuyIn) ||
    Number(args.counterpartyBuyIn) ||
    0
  const pctYou = Number(args.pctCreatorGives) || 0
  const pctThem = Number(args.pctCounterpartyGives) || 0

  const creatorExclude = Math.max(0, Number(args.creatorExcludePriorBullets) || 0)
  const counterpartyExclude = Math.max(0, Number(args.counterpartyExcludePriorBullets) || 0)
  const creatorBullets = finalBulletOnly
    ? 1
    : Math.max(
        1,
        swapBulletCount({
          bullets: args.creatorBullets,
          reentries: args.creatorReentries,
          totalBuyIn: args.creatorBuyIn,
          faceBuyIn: face,
        }) - creatorExclude,
      )
  const counterpartyBullets = finalBulletOnly
    ? 1
    : Math.max(
        1,
        swapBulletCount({
          bullets: args.counterpartyBullets,
          reentries: args.counterpartyReentries,
          totalBuyIn: args.counterpartyBuyIn,
          faceBuyIn: face,
        }) - counterpartyExclude,
      )
  const extraCreator = Math.max(0, creatorBullets - counterpartyBullets)
  const extraCounterparty = Math.max(0, counterpartyBullets - creatorBullets)
  const faceOnCreatorExtras = (pctYou / 100) * extraCreator * face
  const faceOnCounterpartyExtras = (pctThem / 100) * extraCounterparty * face
  // Partner covers busted extras at face. If the extra-firer cashed, extras only
  // reduce that casher's prize ... do not also collect a second face IOU.
  const creatorPaysFace = !counterpartyCashed ? faceOnCounterpartyExtras : 0
  const counterpartyPaysFace = !creatorCashed ? faceOnCreatorExtras : 0

  const creatorNet = creatorCashed
    ? creatorPrize - faceOnCreatorExtras - creatorPaysFace
    : 0
  const counterpartyNet = counterpartyCashed
    ? counterpartyPrize - faceOnCounterpartyExtras - counterpartyPaysFace
    : 0
  const creatorOwesProfit = creatorCashed ? (Math.max(0, creatorNet) * pctYou) / 100 : 0
  const counterpartyOwesProfit = counterpartyCashed
    ? (Math.max(0, counterpartyNet) * pctThem) / 100
    : 0
  const creatorOwes = creatorOwesProfit + creatorPaysFace
  const counterpartyOwes = counterpartyOwesProfit + counterpartyPaysFace
  const settlementAmount = Math.round((counterpartyOwes - creatorOwes) * 100) / 100
  return {
    creatorNet: Math.round(creatorNet * 100) / 100,
    counterpartyNet: Math.round(counterpartyNet * 100) / 100,
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
    return 'Awaiting results (upon completed sessions) · later flights still count'
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
  const prizeAmt = Number.isFinite(prize) ? prize : 0
  const share =
    Math.round((Math.max(0, prizeAmt) * (Number.isFinite(pct) ? pct : 0)) / 100 * 100) / 100
  const who = String(label || (side === 'creator' ? 'Them' : 'Them')).trim() || 'Them'
  return `${who}: ${fmt$(prizeAmt)} · ${fmt$(share)} toward swap`
}

/** @param {unknown} pct */
export function parseSwapPct(pct) {
  const n = parseFloat(String(pct ?? '').trim())
  if (!Number.isFinite(n) || n < 0 || n > 100) return null
  return Math.round(n * 1000) / 1000
}
