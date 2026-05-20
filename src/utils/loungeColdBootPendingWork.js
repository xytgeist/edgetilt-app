/** Live Lounge pending-work flag (upload bar, composer media, in-flight submits). */

/** @type {boolean} */
let pendingWork = false
/** @type {Set<() => void>} */
const listeners = new Set()

/** @returns {boolean} */
export function readLoungeColdBootPendingWork() {
  return pendingWork
}

/** @param {boolean} next */
export function setLoungeColdBootPendingWork(next) {
  const v = Boolean(next)
  if (v === pendingWork) return
  pendingWork = v
  listeners.forEach((fn) => {
    try {
      fn()
    } catch {
      // ignore
    }
  })
}

/** @param {() => void} listener @returns {() => void} */
export function subscribeLoungeColdBootPendingWork(listener) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}
