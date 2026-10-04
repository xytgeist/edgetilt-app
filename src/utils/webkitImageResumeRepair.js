import { isEdgeiOSShell } from './edgeNative.js'
import { isIosDevice } from './pwaNotificationPrompt.js'

const SVG_XLINK = 'http://www.w3.org/1999/xlink'
const MAX_NODES = 800
const FOLLOWUP_MS = [0, 160, 500, 1400, 2800]
const BLOB_REVOKE_MS = 45_000
const FETCH_POOL = 6

function needsWebkitImageResumeRepair() {
  if (typeof navigator === 'undefined') return false
  if (isEdgeiOSShell()) return true
  if (isIosDevice()) return true
  return navigator.platform === 'MacIntel' && (navigator.maxTouchPoints || 0) > 1
}

function htmlImgSrc(img) {
  return String(img.getAttribute('src') || img.currentSrc || img.src || '').trim()
}

function isTrackingPixel(img) {
  if (!(img instanceof HTMLImageElement)) return false
  const nw = img.naturalWidth
  const nh = img.naturalHeight
  if (img.complete && nw === 1 && nh === 1) return true
  if ((img.width === 1 && img.height === 1) && (!img.complete || (nw <= 1 && nh <= 1))) return true
  return false
}

function shouldSkipHtmlImg(img) {
  if (!(img instanceof HTMLImageElement)) return true
  if (img.dataset.edgeSkipImgRepair === '1') return true
  const src = htmlImgSrc(img)
  if (!src || src === 'about:blank') return true
  if (src.startsWith('data:')) return true
  if (isTrackingPixel(img)) return true
  return false
}

function svgImageHref(el) {
  return String(
    el.getAttribute('href') ||
      el.getAttributeNS(SVG_XLINK, 'href') ||
      el.href?.baseVal ||
      '',
  ).trim()
}

function inViewport(el) {
  try {
    const r = el.getBoundingClientRect()
    const vh = window.innerHeight || 0
    const vw = window.innerWidth || 0
    return r.bottom > 0 && r.right > 0 && r.top < vh && r.left < vw
  } catch {
    return true
  }
}

function revokeLater(url) {
  if (!url || !url.startsWith('blob:')) return
  window.setTimeout(() => {
    try {
      URL.revokeObjectURL(url)
    } catch {
      /* already revoked */
    }
  }, BLOB_REVOKE_MS)
}

async function objectUrlFromCachedSrc(src) {
  let abs
  try {
    abs = new URL(src, window.location.href)
  } catch {
    return null
  }
  if (abs.protocol !== 'http:' && abs.protocol !== 'https:') return null
  const same = abs.origin === window.location.origin
  const res = await fetch(abs.href, {
    cache: 'force-cache',
    credentials: same ? 'same-origin' : 'omit',
    mode: same ? 'same-origin' : 'cors',
  })
  if (!res.ok) return null
  const blob = await res.blob()
  if (!blob || !blob.size) return null
  const url = URL.createObjectURL(blob)
  revokeLater(url)
  return url
}

function revealIfHidden(el) {
  if (!(el instanceof Element)) return
  if (el.style.display === 'none') el.style.display = ''
  if (el.style.visibility === 'hidden') el.style.visibility = ''
}

async function rebindHtmlImg(img) {
  const src = htmlImgSrc(img)
  if (!src || src.startsWith('blob:') || src.startsWith('data:')) {
    try {
      if (typeof img.decode === 'function') await img.decode()
    } catch {
      /* still dead */
    }
    return
  }
  const url = await objectUrlFromCachedSrc(src)
  if (!url || document.visibilityState === 'hidden') {
    try {
      if (typeof img.decode === 'function') await img.decode()
    } catch {
      /* still dead */
    }
    return
  }
  const prev = img.dataset.edgeRepairBlob
  img.src = url
  img.dataset.edgeRepairBlob = url
  revealIfHidden(img)
  if (prev && prev.startsWith('blob:') && prev !== url) revokeLater(prev)
}

async function rebindSvgImage(el) {
  const href = svgImageHref(el)
  if (!href || href.startsWith('data:')) return
  if (href.startsWith('blob:')) return
  const url = await objectUrlFromCachedSrc(href)
  if (!url || document.visibilityState === 'hidden') return
  el.setAttribute('href', url)
  try {
    el.setAttributeNS(SVG_XLINK, 'href', url)
  } catch {
    /* href-only */
  }
}

async function mapPool(items, limit, fn) {
  if (!items.length) return
  let i = 0
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) {
      const idx = i
      i += 1
      try {
        await fn(items[idx])
      } catch {
        /* skip node */
      }
    }
  })
  await Promise.all(workers)
}

function collectNodes() {
  const html = []
  const svg = []
  const imgs = document.images
  for (let i = 0; i < imgs.length && html.length < MAX_NODES; i += 1) {
    const img = imgs[i]
    if (shouldSkipHtmlImg(img)) continue
    html.push(img)
  }
  const svgImages = document.querySelectorAll('image')
  for (let i = 0; i < svgImages.length && html.length + svg.length < MAX_NODES; i += 1) {
    const el = svgImages[i]
    const href = svgImageHref(el)
    if (!href || href.startsWith('data:')) continue
    svg.push(el)
  }
  const visFirst = (a, b) => Number(inViewport(b)) - Number(inViewport(a))
  html.sort(visFirst)
  svg.sort(visFirst)
  return { html, svg }
}

/**
 * WKWebView dumps decoded bitmaps when the app backgrounds. The file is still
 * cached; the node keeps a dead texture and WebKit paints the ? / empty box.
 *
 * Do **not** clear `src`/`href` then set it back … that fires `error`, and several
 * surfaces hide the node (`display:none`), so resume looks like missing logos / a
 * black field with a broken-image glyph.
 *
 * Re-decode from disk cache into a fresh blob URL (createImageBitmap when we can).
 */
async function repairDecodedImages() {
  if (typeof document === 'undefined') return
  if (document.visibilityState === 'hidden') return
  const { html, svg } = collectNodes()
  await mapPool(html, FETCH_POOL, rebindHtmlImg)
  await mapPool(svg, FETCH_POOL, rebindSvgImage)
}

/**
 * WKWebView dumps decoded bitmaps when the app backgrounds. Re-decode on resume.
 * iOS / iPadOS / EdgeiOS only.
 */
export function installWebkitImageResumeRepair() {
  if (typeof window === 'undefined' || typeof document === 'undefined') return
  if (window.__edgeWebkitImageResumeRepairInstalled) return
  window.__edgeWebkitImageResumeRepairInstalled = true
  if (!needsWebkitImageResumeRepair()) return

  let debounceTimer = 0
  const followupTimers = []
  let gen = 0

  const run = (mine) => {
    if (mine !== gen) return
    if (document.visibilityState === 'hidden') return
    void repairDecodedImages()
  }

  const onResume = () => {
    if (document.visibilityState === 'hidden') return
    gen += 1
    const mine = gen
    window.clearTimeout(debounceTimer)
    followupTimers.forEach((id) => window.clearTimeout(id))
    followupTimers.length = 0
    debounceTimer = window.setTimeout(() => {
      FOLLOWUP_MS.forEach((ms) => {
        followupTimers.push(window.setTimeout(() => run(mine), ms))
      })
    }, 30)
  }

  const onVis = () => {
    if (document.visibilityState === 'visible') onResume()
  }

  document.addEventListener('visibilitychange', onVis)
  window.addEventListener('pageshow', onResume)
  document.addEventListener('resume', onResume)
}
