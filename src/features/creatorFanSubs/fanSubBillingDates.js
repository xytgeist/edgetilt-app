/** @param {string | null | undefined} iso */
export function formatFanSubAccessThrough(iso) {
  if (!iso) return null
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return null
  return date.toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' })
}

/**
 * @param {{ cancelAtPeriodEnd?: boolean, currentPeriodEnd?: string | null }} opts
 */
export function fanSubBillingStatusLine({ cancelAtPeriodEnd, currentPeriodEnd }) {
  const through = formatFanSubAccessThrough(currentPeriodEnd)
  if (cancelAtPeriodEnd) {
    return through ? `Access until ${through}` : 'Cancels at end of billing period'
  }
  return through ? `Renews ${through}` : 'Active subscription'
}
