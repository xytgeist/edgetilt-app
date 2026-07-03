/**
 * Stop fullscreen lightbox playback before close/unmount.
 * Android Chrome can keep CF Stream iframe audio after React unmounts the portal.
 * @param {{ videoEl?: HTMLVideoElement | null, iframeEl?: HTMLIFrameElement | null, rootEl?: Element | null }} [opts]
 */
export function stopLoungeLightboxMedia({ videoEl = null, iframeEl = null, rootEl = null } = {}) {
  try {
    if (videoEl instanceof HTMLVideoElement) {
      videoEl.pause()
    }
    if (iframeEl instanceof HTMLIFrameElement) {
      iframeEl.src = 'about:blank'
    }
    if (rootEl instanceof Element) {
      rootEl.querySelectorAll('video').forEach((el) => {
        try {
          el.pause()
        } catch {
          // ignore
        }
      })
      rootEl.querySelectorAll('iframe').forEach((el) => {
        try {
          if (el instanceof HTMLIFrameElement) el.src = 'about:blank'
        } catch {
          // ignore
        }
      })
    }
  } catch {
    // ignore
  }
}

/**
 * Feed Stream hero uses the same `<video>` through shrink; mute + pause at dismiss start
 * so swipe/back does not leave hero audio running during the FLIP (Android bleed).
 * Inline resume is handled in `finishHeroCloseAnimation`.
 * @param {HTMLVideoElement | null | undefined} videoEl
 */
export function pauseLoungeHeroStreamForDismiss(videoEl) {
  if (!(videoEl instanceof HTMLVideoElement)) return
  try {
    videoEl.muted = true
    videoEl.pause()
  } catch {
    // ignore
  }
}
