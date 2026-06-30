const STORAGE_KEY = 'loungeBuildBadge:v1'

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

/** Staff Settings toggle (admin/moderator) - show git build SHA in Lounge title bars. */
export function readLoungeBuildBadgeEnabled() {
  if (typeof window === 'undefined') return false
  try {
    return window.localStorage.getItem(STORAGE_KEY) === '1'
  } catch {
    return false
  }
}

export function writeLoungeBuildBadgeEnabled(enabled) {
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
export function subscribeLoungeBuildBadgeEnabled(listener) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}
