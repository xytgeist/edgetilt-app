/**
 * Merge Logbook handpay prefill into W-2G fields when extract left them blank.
 *
 * @param {Record<string, string> | null | undefined} fields
 * @param {{ dateWon?: string, box1Winnings?: string } | null | undefined} prefill
 * @returns {Record<string, string>}
 */
export function mergeW2GLogbookPrefill(fields, prefill) {
  const next = { ...(fields && typeof fields === 'object' ? fields : {}) }
  if (!prefill || typeof prefill !== 'object') return next
  if (!String(next.dateWon || '').trim() && prefill.dateWon) {
    next.dateWon = String(prefill.dateWon)
  }
  if (!String(next.box1Winnings || '').trim() && prefill.box1Winnings) {
    next.box1Winnings = String(prefill.box1Winnings)
  }
  return next
}
