import { swapViewerRole } from './pokerTournamentSwapApi.js'
import { parseSwapPct } from './pokerTournamentSwapMath.js'

/** Sum of % you give across drafts, saved swaps, and pending incoming accept. */
export function computeMySideSwapTotalPct({
  draftSwaps = [],
  savedSwaps = [],
  incomingAcceptSwap = null,
  userId,
}) {
  let total = 0
  for (const d of draftSwaps) {
    const pct = parseSwapPct(d.pct_you_give)
    if (pct != null) total += pct
  }
  for (const swap of savedSwaps) {
    if (swap.status === 'cancelled') continue
    const role = swapViewerRole(swap, userId)
    const pct =
      role === 'counterparty'
        ? Number(swap.pct_counterparty_gives)
        : Number(swap.pct_creator_gives)
    if (Number.isFinite(pct)) total += pct
  }
  if (incomingAcceptSwap) {
    const pct = Number(incomingAcceptSwap.pct_counterparty_gives)
    if (Number.isFinite(pct)) total += pct
  }
  return Math.round(total * 1000) / 1000
}

/** @param {number} maxSwapGivePct @param {number} mySideTotalPct */
export function computeSwapOwnershipStats(maxSwapGivePct, mySideTotalPct) {
  const capRaw = Number(maxSwapGivePct)
  const swapCapPct = Number.isFinite(capRaw)
    ? Math.max(0, Math.min(100, Math.round(capRaw * 1000) / 1000))
    : 100
  const backingSoldPct = Math.max(0, Math.round((100 - swapCapPct) * 1000) / 1000)
  const remainingSwapPct = Math.max(
    0,
    Math.round((swapCapPct - mySideTotalPct) * 1000) / 1000,
  )
  const mySideOver = mySideTotalPct > swapCapPct
  return { swapCapPct, backingSoldPct, remainingSwapPct, mySideOver }
}
