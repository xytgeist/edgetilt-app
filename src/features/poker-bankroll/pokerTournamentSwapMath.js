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

/** @param {unknown} pct */
export function parseSwapPct(pct) {
  const n = parseFloat(String(pct ?? '').trim())
  if (!Number.isFinite(n) || n < 0 || n > 100) return null
  return Math.round(n * 1000) / 1000
}
