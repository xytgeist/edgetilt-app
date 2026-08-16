/**
 * Logo max-width for EDGE title bars - reserve space for right-side chrome.
 * @param {number} quickLinkCount 0–2
 * @param {{ panelCloseVisible?: boolean, toolCloseVisible?: boolean, liveSessionChipVisible?: boolean }} [opts]
 *   Lounge dock panels and slot tool screens add a × close button after the nav slot.
 *   Live session chip owns the flexible middle column (`auto minmax(0,1fr) auto`);
 *   shortcuts may hide via container queries when that gap is tight.
 */
export function edgeLogoTitleBarClassName(quickLinkCount, { panelCloseVisible = false, toolCloseVisible = false, liveSessionChipVisible = false } = {}) {
  const q = Math.max(0, Math.min(2, quickLinkCount))
  let reserveRem = 9 + q * 2.75
  if (panelCloseVisible || toolCloseVisible) reserveRem += 2.75
  // Keep logo from eating the live gap (~7.5rem useful pill width).
  if (liveSessionChipVisible) reserveRem += 7.5
  return `h-6 w-auto max-w-[min(140px,calc(100vw-${reserveRem}rem))] shrink-0 object-contain object-left`
}
