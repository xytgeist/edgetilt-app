/**
 * Logo max-width for EDGE title bars — reserve space for right-side chrome.
 * @param {number} quickLinkCount 0–2
 * @param {{ panelCloseVisible?: boolean }} [opts] Lounge dock panels add a close button after nav slot.
 */
export function edgeLogoTitleBarClassName(quickLinkCount, { panelCloseVisible = false } = {}) {
  const q = Math.max(0, Math.min(2, quickLinkCount))
  let reserveRem = 9 + q * 2.75
  if (panelCloseVisible) reserveRem += 2.75
  return `h-6 w-auto max-w-[min(140px,calc(100vw-${reserveRem}rem))] shrink-0 object-contain object-left`
}
