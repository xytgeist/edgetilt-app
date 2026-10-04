import { isEdgeiOSShell } from './edgeNative.js'
import { isIosDevice } from './pwaNotificationPrompt.js'

const SVG_XLINK = 'http://www.w3.org/1999/xlink'
const MAX_NODES = 500

function needsWebkitImageResumeRepair() {
  if (typeof navigator === 'undefined') return false
  if (isEdgeiOSShell()) return true
  if (isIosDevice()) return true
  return navigator.platform === 'MacIntel' && (navigator.maxTouchPoints || 0) > 1
}

function htmlImgSrc(img) {
  return String(img.getAttribute('src') || img.src || '').trim()
}

function shouldSkipHtmlImg(img) {
  if (!(img instanceof HTMLImageElement)) return true
  if (img.dataset.edgeSkipImgRepair === '1') return true
  const src = htmlImgSrc(img)
  if (!src || src === 'about:blank') return true
  if (!img.complete) return true
  if ((img.naturalWidth === 1 && img.naturalHeight === 1) || (img.width === 1 && img.height === 1)) {
    return true
  }
  return false
}

function rebindHtmlImg(img) {
  const src = img.getAttribute('src') || ''
  const srcset = img.getAttribute('srcset')
  if (!src && !srcset) return
  img.src = ''
  if (srcset) img.srcset = ''
  if (src) img.src = src
  if (srcset) img.srcset = srcset
}

function svgImageHref(el) {
  return String(
    el.getAttribute('href') ||
      el.getAttributeNS(SVG_XLINK, 'href') ||
      el.href?.baseVal ||
      '',
  ).trim()
}

function rebindSvgImage(el) {
  const href = svgImageHref(el)
  if (!href) return
  el.removeAttribute('href')
  try {
    el.removeAttributeNS(SVG_XLINK, 'href')
  } catch {
    /* href-only */
  }
  el.setAttribute('href', href)
  el.setAttributeNS(SVG_XLINK, 'href', href)
}

function repairDecodedImages() {
  if (typeof document === 'undefined') return
  if (document.visibilityState === 'hidden') return
  let n = 0
  const imgs = document.images
  for (let i = 0; i < imgs.length && n < MAX_NODES; i += 1) {
    const img = imgs[i]
    if (shouldSkipHtmlImg(img)) continue
    rebindHtmlImg(img)
    n += 1
  }
  const svgImages = document.querySelectorAll('image')
  for (let i = 0; i < svgImages.length && n < MAX_NODES; i += 1) {
    const el = svgImages[i]
    if (!svgImageHref(el)) continue
    rebindSvgImage(el)
    n += 1
  }
}

/**
 * WKWebView dumps decoded bitmaps when the app backgrounds. The file is still
 * cached; the node keeps a dead texture and WebKit paints the ? / empty box.
 * Rebind src/href from disk cache on resume. iOS / iPadOS / EdgeiOS only.
 */
export function installWebkitImageResumeRepair() {
  if (typeof window === 'undefined' || typeof document === 'undefined') return
  if (window.__edgeWebkitImageResumeRepairInstalled) return
  window.__edgeWebkitImageResumeRepairInstalled = true
  if (!needsWebkitImageResumeRepair()) return

  let debounceTimer = 0
  let followupTimer = 0
  const run = () => {
    if (document.visibilityState === 'hidden') return
    repairDecodedImages()
    window.clearTimeout(followupTimer)
    followupTimer = window.setTimeout(() => repairDecodedImages(), 280)
  }
  const onResume = () => {
    window.clearTimeout(debounceTimer)
    debounceTimer = window.setTimeout(run, 40)
  }
  const onVis = () => {
    if (document.visibilityState === 'visible') onResume()
  }

  document.addEventListener('visibilitychange', onVis)
  window.addEventListener('pageshow', onResume)
}
