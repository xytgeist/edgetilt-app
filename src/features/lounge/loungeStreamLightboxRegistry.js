/** Ref-count of open Lounge media lightboxes (Stream hero + image/GIF) - hides viewport FAB when > 0. */
let openCount = 0
/** @type {Set<(open: boolean) => void>} */
const listeners = new Set()

export function getLoungeStreamLightboxOpen() {
  return openCount > 0
}

/** @param {boolean} open */
export function notifyLoungeStreamLightboxOpen(open) {
  openCount = Math.max(0, openCount + (open ? 1 : -1))
  const isOpen = openCount > 0
  for (const fn of listeners) {
    try {
      fn(isOpen)
    } catch {
      // ignore
    }
  }
}

/** @param {(open: boolean) => void} listener */
export function subscribeLoungeStreamLightboxOpen(listener) {
  listeners.add(listener)
  listener(openCount > 0)
  return () => {
    listeners.delete(listener)
  }
}
