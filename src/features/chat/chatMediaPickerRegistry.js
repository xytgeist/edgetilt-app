/** Ref-counted guard while chat composer native media pickers / crop modal are open. */

let activeCount = 0

/** @returns {boolean} */
export function isChatMediaPickerActive() {
  return activeCount > 0
}

/** @param {boolean} active */
export function notifyChatMediaPickerActive(active) {
  activeCount = Math.max(0, activeCount + (active ? 1 : -1))
}
