/** @type {boolean} */
let feedMounted = false
/** @type {Set<() => void>} */
const listeners = new Set()

/** @returns {boolean} */
export function readLoungeColdBootFeedMounted() {
  return feedMounted
}

export function markLoungeColdBootFeedMounted() {
  if (feedMounted) return
  feedMounted = true
  listeners.forEach((fn) => {
    try {
      fn()
    } catch {
      // ignore
    }
  })
}

/** @param {() => void} listener @returns {() => void} */
export function subscribeLoungeColdBootFeedMounted(listener) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}
