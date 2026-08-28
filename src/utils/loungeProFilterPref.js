export const LOUNGE_PRO_FILTER_STORAGE_KEY = 'loungeProFilter:v1'

/**
 * Reads whether the Edge Pro VIP filter (Pro-only posts and comments) is enabled.
 * Default is false.
 *
 * @returns {boolean}
 */
export function readLoungeProFilterEnabled() {
  if (typeof window === 'undefined') return false
  try {
    return window.localStorage.getItem(LOUNGE_PRO_FILTER_STORAGE_KEY) === '1'
  } catch {
    return false
  }
}

/**
 * Saves the Edge Pro VIP filter preference.
 *
 * @param {boolean} enabled
 */
export function writeLoungeProFilterEnabled(enabled) {
  if (typeof window === 'undefined') return
  try {
    if (enabled) {
      window.localStorage.setItem(LOUNGE_PRO_FILTER_STORAGE_KEY, '1')
    } else {
      window.localStorage.removeItem(LOUNGE_PRO_FILTER_STORAGE_KEY)
    }
  } catch {
    // ignore
  }
}
