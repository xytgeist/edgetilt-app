/**
 * After hamburger (or similar) navigation unmounts a menu/backdrop, mobile browsers
 * often synthesize a click on whatever is now under the finger — commonly the
 * portaled Lounge dock Home chip, which snaps the user back to Lounge.
 *
 * Same capture pattern as LoungeDockArcCarouselPrototype pointer guard.
 */

const CAPTURE_EVENTS = [
  'click',
  'auxclick',
  'pointerup',
  'pointerdown',
  'mouseup',
  'mousedown',
  'touchend',
  'touchstart',
]

/** Home dock / logo need a bit longer than in-menu wheel taps (matches dock AWAY_HOME). */
export const SHELL_NAV_GHOST_CLICK_GUARD_MS = 1200

let cleanup = null
let timerId = 0
/** performance.now() deadline — Lounge dock Home must ignore "away" navigations until then. */
let suppressLoungeHomeUntil = 0

function block(e) {
  e.preventDefault()
  e.stopPropagation()
  if (typeof e.stopImmediatePropagation === 'function') e.stopImmediatePropagation()
}

function disarmShellNavGhostClickGuard() {
  if (timerId) {
    window.clearTimeout(timerId)
    timerId = 0
  }
  cleanup?.()
  cleanup = null
}

/**
 * True while hamburger→tool navigation should ignore dock Home "return to Lounge".
 * Survives cases where a synthesized click slips past the document capture shield.
 */
export function isShellNavLoungeHomeSuppressed() {
  if (typeof performance === 'undefined') return false
  return performance.now() < suppressLoungeHomeUntil
}

/**
 * Swallow pointer/click events at document capture for `durationMs`.
 * Call immediately before setTab / setMenuOpen(false) when leaving Lounge via chrome.
 */
export function armShellNavGhostClickGuard(durationMs = SHELL_NAV_GHOST_CLICK_GUARD_MS) {
  if (typeof document === 'undefined') return
  disarmShellNavGhostClickGuard()
  const ms = Math.max(0, Number(durationMs) || SHELL_NAV_GHOST_CLICK_GUARD_MS)
  if (typeof performance !== 'undefined') {
    suppressLoungeHomeUntil = performance.now() + ms
  }
  const onCapture = (e) => block(e)
  CAPTURE_EVENTS.forEach((type) => {
    document.addEventListener(type, onCapture, true)
  })
  cleanup = () => {
    CAPTURE_EVENTS.forEach((type) => {
      document.removeEventListener(type, onCapture, true)
    })
  }
  timerId = window.setTimeout(() => {
    timerId = 0
    disarmShellNavGhostClickGuard()
  }, ms)
}
