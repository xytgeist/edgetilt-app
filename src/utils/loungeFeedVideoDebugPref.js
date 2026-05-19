const STORAGE_KEY = 'loungeFeedVideoDebug:v1'
const QUERY_KEY = 'loungeVideoDebug'

/** @type {Set<() => void>} */
const listeners = new Set()

function emit() {
  listeners.forEach((fn) => {
    try {
      fn()
    } catch {
      // ignore
    }
  })
}

/** Dev-only HUD for feed Stream autoplay coordinator + tile media state. */
export function readLoungeFeedVideoDebugEnabled() {
  if (typeof window === 'undefined') return false
  try {
    const params = new URLSearchParams(window.location.search)
    const q = params.get(QUERY_KEY)
    if (q === '1' || q === 'true') {
      window.localStorage.setItem(STORAGE_KEY, '1')
      return true
    }
    if (q === '0' || q === 'false') {
      window.localStorage.removeItem(STORAGE_KEY)
      return false
    }
    return window.localStorage.getItem(STORAGE_KEY) === '1'
  } catch {
    return false
  }
}

export function writeLoungeFeedVideoDebugEnabled(enabled) {
  if (typeof window === 'undefined') return
  try {
    if (enabled) window.localStorage.setItem(STORAGE_KEY, '1')
    else window.localStorage.removeItem(STORAGE_KEY)
  } catch {
    // ignore
  }
  emit()
}

/** @param {() => void} listener */
export function subscribeLoungeFeedVideoDebugEnabled(listener) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}
