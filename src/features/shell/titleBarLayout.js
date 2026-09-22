import { IPAD_SHELL_QUERY, QUICK_LINK_MAX } from './quickLinkDestinations.js'

/**
 * Logo max-width for EDGE title bars - reserve space for right-side chrome.
 * @param {number} quickLinkCount 0–2 on phone. iPad shortcuts live on the rail, so they do not shrink the wordmark.
 * @param {{ panelCloseVisible?: boolean, toolCloseVisible?: boolean, liveSessionChipVisible?: boolean }} [opts]
 *   Lounge dock panels and slot tool screens add a × close button after the nav slot.
 *   Live session chip owns the flexible middle column (`auto minmax(0,1fr) auto`);
 *   shortcuts may hide via container queries when that gap is tight.
 */
export function edgeLogoTitleBarClassName(quickLinkCount, { panelCloseVisible = false, toolCloseVisible = false, liveSessionChipVisible = false } = {}) {
  const ipadRail = typeof window !== 'undefined' && window.matchMedia(IPAD_SHELL_QUERY).matches
  const q = ipadRail ? 0 : Math.max(0, Math.min(QUICK_LINK_MAX, quickLinkCount))
  let reserveRem = 9 + q * 2.75
  if (panelCloseVisible || toolCloseVisible) reserveRem += 2.75
  // Keep logo from eating the live gap (~7.5rem useful pill width).
  if (liveSessionChipVisible) reserveRem += 7.5
  return `h-6 w-auto max-w-[min(140px,calc(100vw-${reserveRem}rem))] shrink-0 object-contain object-left`
}

/** Landscape tools chrome / Chat / iPad portrait titleBarBrand. */
export const TITLE_BAR_SCREEN_TITLE_CLASS =
  'font-black leading-none tracking-tight text-white text-[1.25rem] sm:text-[1.5rem]'
