/** Document flag so lightbox chrome can hide while the X-style detail sheet is up. */
export function setLoungeDetailOverLightboxAttr(on) {
  if (typeof document === 'undefined') return
  if (on) document.documentElement.setAttribute('data-lounge-detail-over-lightbox', '')
  else document.documentElement.removeAttribute('data-lounge-detail-over-lightbox')
}
