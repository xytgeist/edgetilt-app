/** @type {boolean} */
let splashActive = false
/** @type {Set<() => void>} */
const listeners = new Set()

/** @returns {boolean} */
export function readLoungeColdBootSplashActive() {
  return splashActive
}

/** @param {boolean} next */
export function setLoungeColdBootSplashActive(next) {
  const on = Boolean(next)
  if (splashActive === on) return
  splashActive = on
  listeners.forEach((fn) => {
    try {
      fn()
    } catch {
      // ignore
    }
  })
}

/** @param {() => void} listener @returns {() => void} */
export function subscribeLoungeColdBootSplashActive(listener) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}
