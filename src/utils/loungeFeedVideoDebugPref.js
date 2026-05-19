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

function readUrlDebugParam() {
  if (typeof window === 'undefined') return null
  try {
    const params = new URLSearchParams(window.location.search || '')
    let q = params.get(QUERY_KEY)
    if (q != null) return q
    const hash = String(window.location.hash || '').replace(/^#/, '')
    if (!hash) return null
    const hashQuery = hash.includes('?') ? hash.slice(hash.indexOf('?') + 1) : hash
    return new URLSearchParams(hashQuery).get(QUERY_KEY)
  } catch {
    return null
  }
}

/** Call on app boot so `?loungeVideoDebug=1` persists before lazy Lounge mounts. */
export function syncLoungeFeedVideoDebugFromUrl() {
  if (typeof window === 'undefined') return readLoungeFeedVideoDebugEnabled()
  try {
    const q = readUrlDebugParam()
    if (q === '1' || q === 'true') {
      window.localStorage.setItem(STORAGE_KEY, '1')
      emit()
      return true
    }
    if (q === '0' || q === 'false') {
      window.localStorage.removeItem(STORAGE_KEY)
      emit()
      return false
    }
  } catch {
    // ignore
  }
  return readLoungeFeedVideoDebugEnabled()
}

/**
 * Dev HUD for Stream autoplay coordinator + tile media state.
 * Enable via Settings → Feed playback, or `?loungeVideoDebug=1` (persists in localStorage).
 */
export function readLoungeFeedVideoDebugEnabled() {
  if (typeof window === 'undefined') return false
  try {
    const q = readUrlDebugParam()
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
  const onUrl = () => {
    syncLoungeFeedVideoDebugFromUrl()
    listener()
  }
  if (typeof window !== 'undefined') {
    window.addEventListener('popstate', onUrl)
    window.addEventListener('hashchange', onUrl)
  }
  return () => {
    listeners.delete(listener)
    if (typeof window !== 'undefined') {
      window.removeEventListener('popstate', onUrl)
      window.removeEventListener('hashchange', onUrl)
    }
  }
}
