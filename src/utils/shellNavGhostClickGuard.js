/**
 * After hamburger (or similar) navigation unmounts a menu/backdrop, mobile browsers
 * often synthesize a click on whatever is now under the finger — commonly the
 * portaled Lounge dock Home chip, which snaps the user back to Lounge, or a Sports
 * Hub league pill that sits under the menu item that was just tapped.
 *
 * Same capture pattern as LoungeDockArcCarouselPrototype pointer guard.
 *
 * Two phases:
 * 1) Short full-document swallow (~400ms) … eats the retargeted click onto hub
 *    content (MLB under Sports Hub, etc.). A long full-document window used to
 *    block the first intentional hub-tool tap, so keep this brief.
 * 2) Longer dock/FAB-only shield (~1200ms) … Home / EDGE mark snapback.
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

/**
 * Dock / Home chrome that must ignore ghost taps after leaving Lounge.
 * Home is a sibling of the FAB host (compact chip), and other screens' EDGE
 * mark uses `data-edge-go-lounge`. Both sit where a closing menu's click lands.
 */
const DOCK_GHOST_TARGET_SELECTOR =
  '[data-lounge-dock-fab-host], [data-lounge-dock-home], [data-edge-go-lounge]'

/** Home dock / logo need a bit longer than in-menu wheel taps (matches dock AWAY_HOME). */
export const SHELL_NAV_GHOST_CLICK_GUARD_MS = 1200

/**
 * Full-document window: long enough for the browser's retargeted click after the
 * menu unmounts, short enough that a real hub-tool tap after nav still works.
 */
export const SHELL_NAV_GHOST_CLICK_FULL_MS = 400

let cleanup = null
let timerId = 0
let fullUntil = 0
/** performance.now() deadline — Lounge dock Home must ignore "away" navigations until then. */
let suppressLoungeHomeUntil = 0

function isDockGhostTarget(e) {
  const el = e.target instanceof Element ? e.target : null
  return Boolean(el?.closest?.(DOCK_GHOST_TARGET_SELECTOR))
}

function stopEvent(e) {
  e.preventDefault()
  e.stopPropagation()
  if (typeof e.stopImmediatePropagation === 'function') e.stopImmediatePropagation()
}

function block(e) {
  const now = typeof performance !== 'undefined' ? performance.now() : 0
  if (now < fullUntil) {
    stopEvent(e)
    return
  }
  if (!isDockGhostTarget(e)) return
  stopEvent(e)
}

function disarmShellNavGhostClickGuard() {
  if (timerId) {
    window.clearTimeout(timerId)
    timerId = 0
  }
  cleanup?.()
  cleanup = null
  fullUntil = 0
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
 * Swallow pointer/click events after hamburger nav:
 * - ~400ms: all targets (retargeted click onto hub content under the menu)
 * - remainder of `durationMs`: dock/FAB / EDGE-home only
 * Call immediately before setTab / setMenuOpen(false) when leaving Lounge via chrome.
 */
export function armShellNavGhostClickGuard(durationMs = SHELL_NAV_GHOST_CLICK_GUARD_MS) {
  if (typeof document === 'undefined') return
  disarmShellNavGhostClickGuard()
  const ms = Math.max(0, Number(durationMs) || SHELL_NAV_GHOST_CLICK_GUARD_MS)
  const fullMs = Math.min(SHELL_NAV_GHOST_CLICK_FULL_MS, ms)
  if (typeof performance !== 'undefined') {
    const now = performance.now()
    suppressLoungeHomeUntil = now + ms
    fullUntil = now + fullMs
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
