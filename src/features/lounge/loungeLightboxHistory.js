/** @typedef {{ loungeLightbox?: boolean }} LoungeLightboxHistoryState */

/** Skip the popstate handler once when we called `history.back()` to sync a UI dismiss. */
let uiSyncBack = false

/**
 * Bind browser / hardware back to `onClose` for Stream video hero lightbox only.
 * Image/GIF lightboxes do not use this - UI dismiss must not call `history.back()`.
 *
 * @param {() => void} onClose
 * @returns {() => void}
 */
export function bindLoungeLightboxHistory(onClose) {
  if (typeof window === 'undefined') return () => {}

  window.history.pushState({ loungeLightbox: true }, '', window.location.href)
  let active = true
  let popClosed = false

  const onPop = () => {
    if (uiSyncBack) {
      uiSyncBack = false
      return
    }
    if (!active) return
    active = false
    popClosed = true
    onClose()
  }

  window.addEventListener('popstate', onPop)

  return () => {
    window.removeEventListener('popstate', onPop)
    if (active && !popClosed) {
      active = false
      uiSyncBack = true
      window.history.back()
    }
  }
}
