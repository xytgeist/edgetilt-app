import { useEffect, useState } from 'react'

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

function getVisualViewportBounds() {
  const vv = window.visualViewport
  return {
    top: (vv?.offsetTop ?? 0) + SCROLL_GAP_PX,
    bottom: (vv ? vv.offsetTop + vv.height : window.innerHeight) - SCROLL_GAP_PX,
  }
}

/**
 * Rect to keep above the keyboard. When the picker opens upward, only the input
 * matters ... scrolling for the list top would shove header fields off-screen.
 * @param {DOMRect} inputRect
 * @param {DOMRect | undefined} listRect
 */
function fieldScrollRect(inputRect, listRect) {
  if (!listRect || listRect.width <= 0 || listRect.height <= 0) {
    return { top: inputRect.top, bottom: inputRect.bottom }
  }

  const listAboveInput = listRect.bottom <= inputRect.top + 1
  if (listAboveInput) {
    return { top: inputRect.top, bottom: inputRect.bottom }
  }

  return {
    top: inputRect.top,
    bottom: Math.max(inputRect.bottom, listRect.bottom),
  }
}

/**
 * Scroll the stable deal sheet only when the field is covered by the keyboard.
 * Never scrolls upward to reveal content above the focused field.
 * @param {HTMLElement | null | undefined} inputEl
 * @param {HTMLElement | null | undefined} [listEl]
 */
export function scrollPokerStableFieldIntoView(inputEl, listEl) {
  if (typeof window === 'undefined' || !inputEl) return

  const sheet = inputEl.closest?.(SHEET_SELECTOR)
  const inputRect = inputEl.getBoundingClientRect()
  const listRect = listEl?.getBoundingClientRect()
  const rect = fieldScrollRect(inputRect, listRect)

  if (!sheet) {
    inputEl.scrollIntoView?.({ block: 'nearest', behavior: 'auto' })
    return
  }

  const { bottom: vBottom } = getVisualViewportBounds()
  if (rect.bottom <= vBottom) return

  sheet.scrollTop += rect.bottom - vBottom
}

/**
 * @param {HTMLElement | null | undefined} el
 * @param {{ reserveBelowPx?: number, behavior?: ScrollBehavior }} [opts]
 */
export function scrollPokerStableSheetToElement(el, { reserveBelowPx = 0 } = {}) {
  if (!el) return
  scrollPokerStableFieldIntoView(el, null)
  if (reserveBelowPx > 0) {
    const sheet = el.closest?.(SHEET_SELECTOR)
    if (sheet) sheet.scrollTop += reserveBelowPx * 0.15
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

/**
 * Lift bottom sheets when a field inside the overlay is focused and the keyboard is open.
 * @param {import('react').RefObject<HTMLElement | null>} overlayRef
 */
export function usePokerStableSheetKeyboardLift(overlayRef) {
  const [liftPx, setLiftPx] = useState(0)

  useEffect(() => {
    if (typeof window === 'undefined') return undefined

    const sync = () => {
      const root = overlayRef.current
      const active = document.activeElement
      const focusedField =
        root instanceof HTMLElement &&
        active instanceof HTMLElement &&
        root.contains(active) &&
        (active.tagName === 'INPUT' ||
          active.tagName === 'TEXTAREA' ||
          active.tagName === 'SELECT' ||
          active.getAttribute('contenteditable') === 'true')

      const overlap = readKeyboardOverlapPx()
      setLiftPx(focusedField && overlap > 8 ? overlap : 0)
    }

    sync()
    const vv = window.visualViewport
    vv?.addEventListener('resize', sync)
    vv?.addEventListener('scroll', sync)
    document.addEventListener('focusin', sync)
    document.addEventListener('focusout', sync)
    window.addEventListener('resize', sync)

    return () => {
      vv?.removeEventListener('resize', sync)
      vv?.removeEventListener('scroll', sync)
      document.removeEventListener('focusin', sync)
      document.removeEventListener('focusout', sync)
      window.removeEventListener('resize', sync)
      setLiftPx(0)
    }
  }, [overlayRef])

  return liftPx
}

/** Retry once after the iOS keyboard finishes animating. */
export function schedulePokerStableFieldScroll(inputEl, listEl) {
  scrollPokerStableFieldIntoView(inputEl, listEl)
  requestAnimationFrame(() => scrollPokerStableFieldIntoView(inputEl, listEl))
  window.setTimeout(() => scrollPokerStableFieldIntoView(inputEl, listEl), 180)
}
