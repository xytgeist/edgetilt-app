import { useEffect } from 'react'

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

const ACTIONS_FOOTER_GAP_PX = 16

function isSheetFormField(el, sheet) {
  return (
    sheet instanceof HTMLElement &&
    el instanceof HTMLElement &&
    sheet.contains(el) &&
    (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT')
  )
}

function fieldWasInSlice(el) {
  return Boolean(
    el instanceof HTMLElement &&
      (el.closest('[data-poker-stable-slice]') || el.closest('.poker-stable-slice-inner')),
  )
}

/** After keyboard dismiss, reveal the sheet footer actions (+ slice / submit). */
export function scrollPokerStableSheetActionsIntoView(actionsEl) {
  if (typeof window === 'undefined' || !actionsEl) return

  const sheet = actionsEl.closest?.(SHEET_SELECTOR)
  const rect = actionsEl.getBoundingClientRect()
  const vTop = (window.visualViewport?.offsetTop ?? 0) + SCROLL_GAP_PX
  const vBottom = getVisualViewportBottom() - ACTIONS_FOOTER_GAP_PX

  if (rect.bottom <= vBottom && rect.top >= vTop) return

  if (!sheet) {
    actionsEl.scrollIntoView?.({ block: 'end', behavior: 'auto' })
    return
  }

  if (rect.bottom > vBottom) {
    sheet.scrollTop += rect.bottom - vBottom
  }
}

/** When the keyboard closes after editing a slice field, scroll to footer actions. */
export function usePokerStableSheetKeyboardDismissScroll(sheetRef, actionsRef) {
  useEffect(() => {
    if (typeof window === 'undefined') return undefined

    let keyboardOpen = readKeyboardOverlapPx() > 8
    let blurFromSlice = false

    const revealActionsIfNeeded = () => {
      if (!blurFromSlice) return
      const sheet = sheetRef.current
      const active = document.activeElement
      if (isSheetFormField(active, sheet)) return

      const run = () => scrollPokerStableSheetActionsIntoView(actionsRef.current)
      run()
      window.setTimeout(run, 120)
      blurFromSlice = false
    }

    const onFocusIn = (e) => {
      const target = e.target
      if (!isSheetFormField(target, sheetRef.current)) return
      if (!fieldWasInSlice(target)) blurFromSlice = false
    }

    const onFocusOut = (e) => {
      const target = e.target
      if (!isSheetFormField(target, sheetRef.current)) return
      blurFromSlice = fieldWasInSlice(target)
    }

    const onViewportChange = () => {
      const overlap = readKeyboardOverlapPx()
      const wasOpen = keyboardOpen
      keyboardOpen = overlap > 8
      if (wasOpen && !keyboardOpen) revealActionsIfNeeded()
    }

    const vv = window.visualViewport
    vv?.addEventListener('resize', onViewportChange)
    vv?.addEventListener('scroll', onViewportChange)
    document.addEventListener('focusin', onFocusIn)
    document.addEventListener('focusout', onFocusOut)

    return () => {
      vv?.removeEventListener('resize', onViewportChange)
      vv?.removeEventListener('scroll', onViewportChange)
      document.removeEventListener('focusin', onFocusIn)
      document.removeEventListener('focusout', onFocusOut)
    }
  }, [sheetRef, actionsRef])
}
