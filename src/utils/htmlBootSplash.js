/** Matches `#edge-html-boot-splash` in `index.html`. */
export const HTML_BOOT_SPLASH_ID = 'edge-html-boot-splash'

/** Fade out the HTML cover painted before React. Safe if already gone. */
export function dismissHtmlBootSplash() {
  if (typeof window === 'undefined') return
  try {
    window.__edgeDismissHtmlSplash?.()
  } catch {
    /* ignore */
  }
}

/** True when `index.html` is holding the cover for the Lottie upgrade. */
export function htmlBootSplashWantsLottie() {
  if (typeof window === 'undefined') return false
  return window.__edgeHtmlSplashHoldForLottie === true
}
