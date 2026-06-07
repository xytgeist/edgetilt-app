const STORAGE_KEY = 'appConsoleLogHud:v1'

/** @type {Set<() => void>} */
const listeners = new Set()

function emit() {
  listeners.forEach((fn) => {
    try {
      fn()
    } catch {
      /* ignore */
    }
  })
}

/** Staff Settings → Admin utils → Console log HUD (floating overlay). */
export function readAppConsoleLogHudEnabled() {
  if (typeof window === 'undefined') return false
  try {
    return window.localStorage.getItem(STORAGE_KEY) === '1'
  } catch {
    return false
  }
}

export function writeAppConsoleLogHudEnabled(enabled) {
  if (typeof window === 'undefined') return
  try {
    if (enabled) window.localStorage.setItem(STORAGE_KEY, '1')
    else window.localStorage.removeItem(STORAGE_KEY)
  } catch {
    /* ignore */
  }
  emit()
}

/** @param {() => void} listener */
export function subscribeAppConsoleLogHudEnabled(listener) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}
