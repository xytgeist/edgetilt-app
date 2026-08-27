/** Ref-count of open Lounge media lightboxes (Stream hero + image/GIF) - hides viewport FAB when > 0. */
let openCount = 0
/** @type {Set<(open: boolean) => void>} */
const listeners = new Set()
/** @type {Set<(count: number) => void>} */
const countListeners = new Set()

export function getLoungeStreamLightboxOpen() {
  return openCount > 0
}

export function getLoungeStreamLightboxCount() {
  return openCount
}

function emitLightboxCount() {
  const isOpen = openCount > 0
  for (const fn of listeners) {
    try {
      fn(isOpen)
    } catch {
      // ignore
    }
  }
  for (const fn of countListeners) {
    try {
      fn(openCount)
    } catch {
      // ignore
    }
  }
}

/** @param {boolean} open */
export function notifyLoungeStreamLightboxOpen(open) {
  openCount = Math.max(0, openCount + (open ? 1 : -1))
  emitLightboxCount()
}

/** @param {(open: boolean) => void} listener */
export function subscribeLoungeStreamLightboxOpen(listener) {
  listeners.add(listener)
  listener(openCount > 0)
  return () => {
    listeners.delete(listener)
  }
}

/** Fires on every stack-count change (1 → 2 still notifies). */
export function subscribeLoungeStreamLightboxCount(listener) {
  countListeners.add(listener)
  listener(openCount)
  return () => {
    countListeners.delete(listener)
  }
}
