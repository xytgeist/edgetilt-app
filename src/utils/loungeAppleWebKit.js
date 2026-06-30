/** iPhone/iPad / iPadOS Safari - inline Stream uses hls.js MSE when enabled. */
export function detectAppleWebKitInlineStream() {
  if (typeof navigator === 'undefined') return false
  const ua = navigator.userAgent || ''
  if (/iPhone|iPad|iPod/i.test(ua)) return true
  if (/Macintosh/i.test(ua) && navigator.maxTouchPoints > 1) return true
  return false
}
