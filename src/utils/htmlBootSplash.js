import {
  readLoungeColdBootFeedMounted,
  subscribeLoungeColdBootFeedMounted,
} from './loungeColdBootFeedMounted.js'

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

/** Keep the HTML cover until Lounge has mounted (browser) or Lottie takes over (PWA/IPA). */
export function installHtmlBootSplashRelease() {
  if (typeof window === 'undefined') return
  if (window.__edgeHtmlSplashHoldForLottie) return
  if (readLoungeColdBootFeedMounted()) {
    dismissHtmlBootSplash()
    return
  }
  subscribeLoungeColdBootFeedMounted(() => {
    dismissHtmlBootSplash()
  })
}
