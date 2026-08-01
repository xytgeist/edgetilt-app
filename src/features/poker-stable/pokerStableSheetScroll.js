const SHEET_SELECTOR = '[data-poker-stable-sheet]'
const SCROLL_GAP_PX = 12

/** Room for the inline handle dropdown below the field. */
export const POKER_STABLE_TYPEAHEAD_RESERVE_PX = 216

/**
 * Scroll the stable deal sheet so `el` stays above the keyboard (and optional dropdown).
 * @param {HTMLElement | null | undefined} el
 * @param {{ reserveBelowPx?: number, behavior?: ScrollBehavior }} [opts]
 */
export function scrollPokerStableSheetToElement(el, { reserveBelowPx = 0, behavior = 'smooth' } = {}) {
  if (typeof window === 'undefined' || !el) return

  const sheet = el.closest?.(SHEET_SELECTOR)
  if (!sheet) {
    el.scrollIntoView?.({ block: 'nearest', behavior })
    return
  }

  const vv = window.visualViewport
  const vTop = (vv?.offsetTop ?? 0) + SCROLL_GAP_PX
  const vBottom =
    (vv ? vv.offsetTop + vv.height : window.innerHeight) - SCROLL_GAP_PX - reserveBelowPx

  const rect = el.getBoundingClientRect()
  let delta = 0
  if (rect.bottom > vBottom) delta += rect.bottom - vBottom
  if (rect.top < vTop) delta += rect.top - vTop

  if (Math.abs(delta) < 0.5) return

  if (behavior === 'smooth' && typeof sheet.scrollBy === 'function') {
    sheet.scrollBy({ top: delta, behavior: 'smooth' })
  } else {
    sheet.scrollTop += delta
  }
}

/**
 * @param {HTMLElement | null | undefined} sliceEl
 * @param {{ reserveBelowPx?: number }} [opts]
 */
export function scrollPokerStableSliceIntoView(sliceEl, opts) {
  scrollPokerStableSheetToElement(sliceEl, opts)
}
