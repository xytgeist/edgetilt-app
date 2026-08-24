import { isEdgeiOSShell } from './edgeNative.js'

/** iPhone/iPad / iPadOS Safari - inline Stream uses hls.js MSE when enabled. */
export function detectAppleWebKitInlineStream() {
  if (typeof navigator === 'undefined') return false
  const ua = navigator.userAgent || ''
  if (/iPhone|iPad|iPod/i.test(ua)) return true
  if (/Macintosh/i.test(ua) && navigator.maxTouchPoints > 1) return true
  return false
}

/**
 * Safari / Home Screen PWA block reliable unmuted autoplay handoff across feed tiles.
 * EdgeiOS WKWebView does not (`mediaTypesRequiringUserActionForPlayback = []` on native).
 * Use this for feed-wide sound coordination only ... keep `detectAppleWebKitInlineStream`
 * for MSE / readyState=0 / hero motion engine quirks.
 */
export function appleWebKitBlocksFeedSoundHandoff() {
  return detectAppleWebKitInlineStream() && !isEdgeiOSShell()
}
