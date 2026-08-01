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

const ACTIONS_FOOTER_GAP_PX = 20

function getVisibleScrollBottom(sheet) {
  const vv = window.visualViewport
  const vvBottom = vv ? vv.offsetTop + vv.height : window.innerHeight
  const sheetRect = sheet instanceof HTMLElement ? sheet.getBoundingClientRect() : null
  const clipBottom = sheetRect ? Math.min(sheetRect.bottom, vvBottom) : vvBottom
  return clipBottom - ACTIONS_FOOTER_GAP_PX
}

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
      el.closest('[data-poker-stable-slice]'),
  )
}

/** After keyboard dismiss, pin footer actions into the visible sheet area. */
export function scrollPokerStableSheetActionsIntoView(actionsEl) {
  if (typeof window === 'undefined' || !actionsEl) return

  const sheet = actionsEl.closest?.(SHEET_SELECTOR)
  if (!sheet) {
    actionsEl.scrollIntoView?.({ block: 'end', behavior: 'auto' })
    return
  }

  const submitEl = actionsEl.querySelector('[data-poker-stable-primary-btn]') || actionsEl
  const maxScroll = Math.max(0, sheet.scrollHeight - sheet.clientHeight)

  const alignActionsToVisibleBottom = () => {
    const visibleBottom = getVisibleScrollBottom(sheet)
    const bottom = submitEl.getBoundingClientRect().bottom
    const delta = bottom - visibleBottom
    if (delta > 0.5) {
      sheet.scrollTop = Math.min(sheet.scrollTop + delta, maxScroll)
    }
  }

  alignActionsToVisibleBottom()

  if (submitEl.getBoundingClientRect().bottom > getVisibleScrollBottom(sheet) + 0.5) {
    sheet.scrollTop = maxScroll
    alignActionsToVisibleBottom()
  }
}

function schedulePokerStableActionsScroll(actionsEl) {
  scrollPokerStableSheetActionsIntoView(actionsEl)
  requestAnimationFrame(() => scrollPokerStableSheetActionsIntoView(actionsEl))
  window.setTimeout(() => scrollPokerStableSheetActionsIntoView(actionsEl), 120)
  window.setTimeout(() => scrollPokerStableSheetActionsIntoView(actionsEl), 320)
}

/** When the keyboard closes after editing a slice field, scroll to footer actions. */
export function usePokerStableSheetKeyboardDismissScroll(sheetRef, actionsRef) {
  useEffect(() => {
    if (typeof window === 'undefined') return undefined

    let keyboardOpen = readKeyboardOverlapPx() > 8
    let pendingSliceDismiss = false
    let dismissTimer = 0

    const clearDismissTimer = () => {
      if (dismissTimer) window.clearTimeout(dismissTimer)
      dismissTimer = 0
    }

    const shouldRevealActions = () => {
      const sheet = sheetRef.current
      const active = document.activeElement
      return pendingSliceDismiss && !isSheetFormField(active, sheet) && readKeyboardOverlapPx() <= 8
    }

    const revealActionsIfNeeded = () => {
      if (!shouldRevealActions()) return
      schedulePokerStableActionsScroll(actionsRef.current)
      pendingSliceDismiss = false
      clearDismissTimer()
    }

    const queueRevealAfterBlur = () => {
      clearDismissTimer()
      dismissTimer = window.setTimeout(revealActionsIfNeeded, 280)
    }

    const onFocusIn = (e) => {
      const target = e.target
      if (!isSheetFormField(target, sheetRef.current)) return
      if (!fieldWasInSlice(target)) {
        pendingSliceDismiss = false
        clearDismissTimer()
      }
    }

    const onFocusOut = (e) => {
      const target = e.target
      if (!isSheetFormField(target, sheetRef.current)) return
      if (!fieldWasInSlice(target)) return
      pendingSliceDismiss = true
      queueRevealAfterBlur()
    }

    const onViewportChange = () => {
      const overlap = readKeyboardOverlapPx()
      const wasOpen = keyboardOpen
      keyboardOpen = overlap > 8
      if (wasOpen && !keyboardOpen) {
        revealActionsIfNeeded()
        if (pendingSliceDismiss) queueRevealAfterBlur()
      }
    }

    const vv = window.visualViewport
    vv?.addEventListener('resize', onViewportChange)
    vv?.addEventListener('scroll', onViewportChange)
    document.addEventListener('focusin', onFocusIn)
    document.addEventListener('focusout', onFocusOut)

    return () => {
      clearDismissTimer()
      vv?.removeEventListener('resize', onViewportChange)
      vv?.removeEventListener('scroll', onViewportChange)
      document.removeEventListener('focusin', onFocusIn)
      document.removeEventListener('focusout', onFocusOut)
    }
  }, [sheetRef, actionsRef])
}
