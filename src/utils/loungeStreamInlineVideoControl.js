/**
 * Pause inline Lounge Stream `<video>` nodes (feed, profile, search, detail, hero flyout).
 * @param {HTMLVideoElement | null | undefined} [exceptVideo]
 */
export function pauseLoungeStreamInlineVideos(exceptVideo = null) {
  try {
    document
      .querySelectorAll('[data-lounge-video-zoom] video, [data-lounge-stream-flyout-host] video')
      .forEach((el) => {
        if (exceptVideo && el === exceptVideo) return
        el.pause()
        el.muted = true
      })
  } catch {
    // ignore
  }
}

/** @type {Set<() => void>} */
const backgroundPauseListeners = new Set()

/** Pause every Lounge Stream inline/hero video (e.g. post or comment detail opened over the feed). */
export function pauseAllLoungeStreamInlineVideos() {
  pauseLoungeStreamInlineVideos(null)
  for (const fn of backgroundPauseListeners) {
    try {
      fn()
    } catch {
      // ignore
    }
  }
}

/** React tiles subscribe to reset local sound + pause when a detail overlay steals focus. */
export function subscribeLoungeStreamBackgroundPause(listener) {
  backgroundPauseListeners.add(listener)
  return () => {
    backgroundPauseListeners.delete(listener)
  }
}
