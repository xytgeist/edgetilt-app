const STORAGE_KEY = 'loungePushNotifications:v1'

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

/** Notifications panel — Lounge push opt-in (default on until user turns off). */
export function readLoungePushNotificationsEnabled() {
  if (typeof window === 'undefined') return true
  try {
    const v = window.localStorage.getItem(STORAGE_KEY)
    if (v === null) return true
    return v === '1'
  } catch {
    return true
  }
}

export function writeLoungePushNotificationsEnabled(enabled) {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(STORAGE_KEY, enabled ? '1' : '0')
  } catch {
    // ignore
  }
  emit()
}

/** @param {() => void} listener */
export function subscribeLoungePushNotificationsEnabled(listener) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}
