export const LOUNGE_FEED_VIDEO_AUTOPLAY_STORAGE_KEY = 'loungeFeedVideoAutoplay:v1'

/** @type {boolean | null} */
let cachedEnabled = null
/** @type {Set<() => void>} */
const listeners = new Set()

/** @returns {boolean} */
export function readLoungeFeedVideoAutoplayEnabled() {
  if (cachedEnabled != null) return cachedEnabled
  if (typeof window === 'undefined') return true
  try {
    const v = window.localStorage.getItem(LOUNGE_FEED_VIDEO_AUTOPLAY_STORAGE_KEY)
    if (v === '0' || v === 'false') {
      cachedEnabled = false
      return false
    }
    if (v === '1' || v === 'true') {
      cachedEnabled = true
      return true
    }
  } catch {
    // ignore
  }
  cachedEnabled = true
  return true
}

/** @param {boolean} enabled */
export function writeLoungeFeedVideoAutoplayEnabled(enabled) {
  const next = Boolean(enabled)
  if (cachedEnabled === next) return
  cachedEnabled = next
  if (typeof window !== 'undefined') {
    try {
      window.localStorage.setItem(LOUNGE_FEED_VIDEO_AUTOPLAY_STORAGE_KEY, next ? '1' : '0')
    } catch {
      // ignore
    }
  }
  listeners.forEach((listener) => {
    try {
      listener()
    } catch {
      // ignore
    }
  })
}

/** @param {() => void} listener */
export function subscribeLoungeFeedVideoAutoplayEnabled(listener) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}
