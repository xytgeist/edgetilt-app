const SHEET_SELECTOR = '[data-poker-stable-sheet]'

const SCROLL_GAP_PX = 12

/** Room for the inline handle dropdown below the field. */
export const POKER_STABLE_TYPEAHEAD_RESERVE_PX = 216

/** @returns {number} */
export function readKeyboardOverlapPx() {
  if (typeof window === 'undefined') return 0
  const vv = window.visualViewport
  if (!vv) return 0
  return Math.max(0, window.innerHeight - vv.height - vv.offsetTop)
}

function getVisualViewportBottom() {
  const vv = window.visualViewport
  return (vv ? vv.offsetTop + vv.height : window.innerHeight) - SCROLL_GAP_PX
}

/**
 * @param {DOMRect} inputRect
 * @param {DOMRect | undefined} listRect
 */
function fieldScrollBottom(inputRect, listRect) {
  if (!listRect || listRect.width <= 0 || listRect.height <= 0) {
    return inputRect.bottom
  }

  const listAboveInput = listRect.bottom <= inputRect.top + 1
  if (listAboveInput) return inputRect.bottom

  return Math.max(inputRect.bottom, listRect.bottom)
}

/**
 * Nudge sheet scrollTop only when the field bottom sits under the keyboard.
 * Never lifts the sheet panel ... avoids shoving header fields off-screen.
 * @param {HTMLElement | null | undefined} inputEl
 * @param {HTMLElement | null | undefined} [listEl]
 */
export function scrollPokerStableFieldIntoView(inputEl, listEl) {
  if (typeof window === 'undefined' || !inputEl) return

  const sheet = inputEl.closest?.(SHEET_SELECTOR)
  const targetBottom = fieldScrollBottom(
    inputEl.getBoundingClientRect(),
    listEl?.getBoundingClientRect(),
  )
  const vBottom = getVisualViewportBottom()
  if (targetBottom <= vBottom) return

  const delta = targetBottom - vBottom
  if (!sheet) {
    inputEl.scrollIntoView?.({ block: 'nearest', behavior: 'auto' })
    return
  }

  sheet.scrollTop += delta
}

/**
 * @param {HTMLElement | null | undefined} el
 * @param {{ reserveBelowPx?: number }} [opts]
 */
export function scrollPokerStableSheetToElement(el, { reserveBelowPx = 0 } = {}) {
  if (!el) return
  scrollPokerStableFieldIntoView(el, null)
  if (reserveBelowPx > 0) {
    const sheet = el.closest?.(SHEET_SELECTOR)
    if (sheet) sheet.scrollTop += reserveBelowPx * 0.12
  }
}

/**
 * @param {HTMLElement | null | undefined} sliceEl
 * @param {{ reserveBelowPx?: number }} [opts]
 */
export function scrollPokerStableSliceIntoView(sliceEl, opts = {}) {
  if (!sliceEl) return
  scrollPokerStableSheetToElement(sliceEl, opts)
}

/** One follow-up pass after the iOS keyboard animation. */
export function schedulePokerStableFieldScroll(inputEl, listEl) {
  scrollPokerStableFieldIntoView(inputEl, listEl)
  window.setTimeout(() => scrollPokerStableFieldIntoView(inputEl, listEl), 160)
}
