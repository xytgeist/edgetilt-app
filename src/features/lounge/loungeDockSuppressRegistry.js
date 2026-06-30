/**
 * Registry for suppressing the Lounge dock FAB from outside the Lounge tree
 * (e.g. while a full-screen chat conversation is visible).
 *
 * Mirrors loungeStreamLightboxRegistry.js - ref-counted so multiple callers
 * can independently suppress without clobbering each other.
 *
 * The `temporaryRevealLoungeDock` escape hatch lets a title-bar icon briefly
 * un-suppress so the user can tap the FAB for navigation.
 */

let suppressCount = 0
let temporaryRevealActive = false
let temporaryRevealTimer = null

/** @type {Set<(suppressed: boolean) => void>} */
const listeners = new Set()

function computeSuppressed() {
  return suppressCount > 0 && !temporaryRevealActive
}

/** @returns {boolean} */
export function getLoungeDockSuppressed() {
  return computeSuppressed()
}

/**
 * Increment (suppress=true) or decrement (suppress=false) the suppress count.
 * @param {boolean} suppress
 */
export function notifyLoungeDockSuppress(suppress) {
  suppressCount = Math.max(0, suppressCount + (suppress ? 1 : -1))
  broadcast()
}

/**
 * Temporarily un-suppress for `ms` milliseconds so the user can reach the FAB.
 * Resets an existing timer if called again before expiry.
 * @param {number} [ms=4000]
 */
export function temporaryRevealLoungeDock(ms = 4000) {
  if (temporaryRevealTimer !== null) clearTimeout(temporaryRevealTimer)
  temporaryRevealActive = true
  broadcast()
  temporaryRevealTimer = setTimeout(() => {
    temporaryRevealActive = false
    temporaryRevealTimer = null
    broadcast()
  }, ms)
}

/**
 * @param {(suppressed: boolean) => void} listener
 * @returns {() => void} unsubscribe
 */
export function subscribeLoungeDockSuppressed(listener) {
  listeners.add(listener)
  listener(computeSuppressed())
  return () => {
    listeners.delete(listener)
  }
}

function broadcast() {
  const val = computeSuppressed()
  for (const fn of listeners) {
    try {
      fn(val)
    } catch {
      // ignore
    }
  }
}
