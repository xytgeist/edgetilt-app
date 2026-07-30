/**
 * Bilateral tournament swap settlement on positive net only
 * (bust / no cash ⇒ that side owes $0).
 */

/**
 * @param {{
 *   creatorPrize?: number | null,
 *   creatorBuyIn?: number | null,
 *   counterpartyPrize?: number | null,
 *   counterpartyBuyIn?: number | null,
 *   pctCreatorGives?: number | null,
 *   pctCounterpartyGives?: number | null,
 * }} args
 * @returns {{
 *   creatorNet: number,
 *   counterpartyNet: number,
 *   creatorOwes: number,
 *   counterpartyOwes: number,
 *   settlementAmount: number,
 * }}
 */
/** settlementAmount: positive => counterparty owes creator */
export function computeTournamentSwapSettlement(args) {
  const creatorNet = (Number(args.creatorPrize) || 0) - (Number(args.creatorBuyIn) || 0)
  const counterpartyNet =
    (Number(args.counterpartyPrize) || 0) - (Number(args.counterpartyBuyIn) || 0)
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
 * Cash-settled label with signed amount from viewer POV.
 * e.g. Settled ($25) / Settled (-$25)
 */
export function formatSwapSettledAmountLine(signedAmount, fmt$) {
  if (signedAmount == null || Number.isNaN(Number(signedAmount))) return 'Settled'
  return `Settled (${fmt$(Number(signedAmount))})`
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
  if (creatorReady && cpReady) return 'Both results in'

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
      return 'Awaiting results · or enter theirs below'
    }
    return 'Awaiting results'
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
