import { computeHeroTargetRect } from './loungeLightboxFlip.js'

/** Matches `h-[min(78dvh,calc(100dvh-5.5rem))]` on `[data-lounge-media-detail-sheet]`. */
const SHEET_DVH_FRACTION = 0.78
const SHEET_MIN_PEEK_REM = 5.5

let overlayOn = false
const listeners = new Set()
let metricPollRaf = 0
let viewportBound = false
let sheetKbLocked = false
let frozenPeekInsetPx = 0
let frozenLayoutH = 0
let frozenSheetTop = 0
let frozenSheetH = 0
let frozenViewport = null
let appliedParkPan = 0

const PARK_STYLE_PROPS = ['transform', 'top', 'bottom', 'height', 'max-height']

function emit() {
  listeners.forEach((fn) => {
    try {
      fn()
    } catch {
      // ignore
    }
  })
}

function stopMetricPoll() {
  if (!metricPollRaf) return
  cancelAnimationFrame(metricPollRaf)
  metricPollRaf = 0
}

function startMetricPoll() {
  stopMetricPoll()
  let frames = 0
  const tick = () => {
    metricPollRaf = 0
    syncLoungeMediaSheetHeightVar()
    emit()
    frames += 1
    if (frames < 40) metricPollRaf = requestAnimationFrame(tick)
  }
  metricPollRaf = requestAnimationFrame(tick)
}

function onViewportChange() {
  if (!overlayOn) return
  if (sheetKbLocked) {
    syncLockedSheetKeyboardVars()
    emit()
    return
  }
  notifyLoungeMediaDetailSheetMetrics()
}

function bindViewportWatch() {
  if (viewportBound || typeof window === 'undefined') return
  viewportBound = true
  window.addEventListener('resize', onViewportChange)
  window.visualViewport?.addEventListener('resize', onViewportChange)
  window.visualViewport?.addEventListener('scroll', onViewportChange)
}

function unbindViewportWatch() {
  if (!viewportBound || typeof window === 'undefined') return
  viewportBound = false
  window.removeEventListener('resize', onViewportChange)
  window.visualViewport?.removeEventListener('resize', onViewportChange)
  window.visualViewport?.removeEventListener('scroll', onViewportChange)
}

function rootFontPx() {
  if (typeof document === 'undefined') return 16
  return Number.parseFloat(getComputedStyle(document.documentElement).fontSize) || 16
}

function estimateSheetHeightForLayout(layoutH) {
  const vh = Math.max(0, Number(layoutH) || 0)
  const minPeek = SHEET_MIN_PEEK_REM * rootFontPx()
  return Math.round(Math.min(vh * SHEET_DVH_FRACTION, Math.max(0, vh - minPeek)))
}

/** Keep the tallest pre-keyboard layout; never freeze a already-shrunk keyboard viewport. */
function captureOverlayLayoutBaseline() {
  if (typeof window === 'undefined') return
  const layout = Math.max(window.innerHeight || 0, document.documentElement?.clientHeight || 0)
  if (layout > frozenLayoutH) frozenLayoutH = layout
  if (frozenLayoutH < 1) frozenLayoutH = layout
  const width = window.innerWidth || 0
  frozenViewport = {
    width: Math.max(width, frozenViewport?.width || 0),
    height: frozenLayoutH,
  }
}

function clearParkedLayerStyles(el) {
  if (!(el instanceof HTMLElement)) return
  for (const prop of PARK_STYLE_PROPS) el.style.removeProperty(prop)
}

function queryParkedLightboxLayers() {
  if (typeof document === 'undefined') return []
  return [
    ...document.querySelectorAll('[data-lounge-media-lightbox]'),
    ...document.querySelectorAll('[data-lounge-media-kb-park]'),
  ].filter((el, i, all) => all.indexOf(el) === i)
}

/**
 * Inline styles beat Tailwind `inset-0` / `h-[78dvh]`. Overlay transform parks peek+grab
 * in screen space when iOS pans visualViewport; sheet is a child so it rides that park.
 * Inner footer pad is what moves comments + composer.
 */
function writeParkedLayerStyles(pan) {
  if (typeof document === 'undefined' || !sheetKbLocked) return
  appliedParkPan = pan
  const tx = `translate3d(0, ${Math.round(pan)}px, 0)`
  const overlay = document.querySelector('[data-lounge-media-detail-overlay]')
  const sheet = document.querySelector('[data-lounge-media-detail-sheet]')

  if (overlay instanceof HTMLElement) {
    overlay.style.setProperty('top', '0px', 'important')
    overlay.style.setProperty('bottom', 'auto', 'important')
    overlay.style.setProperty('height', `${frozenLayoutH}px`, 'important')
    overlay.style.setProperty('max-height', `${frozenLayoutH}px`, 'important')
    overlay.style.setProperty('transform', tx, 'important')
  }
  if (sheet instanceof HTMLElement) {
    sheet.style.setProperty('top', `${Math.round(frozenSheetTop)}px`, 'important')
    sheet.style.setProperty('bottom', 'auto', 'important')
    sheet.style.setProperty('height', `${Math.round(frozenSheetH)}px`, 'important')
    sheet.style.setProperty('max-height', `${Math.round(frozenSheetH)}px`, 'important')
    sheet.style.setProperty('transform', 'none', 'important')
  }
  for (const el of queryParkedLightboxLayers()) {
    if (!(el instanceof HTMLElement)) continue
    if (overlay instanceof HTMLElement && overlay.contains(el)) continue
    el.style.setProperty('top', '0px', 'important')
    el.style.setProperty('bottom', 'auto', 'important')
    el.style.setProperty('height', `${frozenLayoutH}px`, 'important')
    el.style.setProperty('max-height', `${frozenLayoutH}px`, 'important')
    el.style.setProperty('transform', tx, 'important')
  }
  document.documentElement.style.setProperty('--lounge-overlay-vv-pan', `${Math.round(pan)}px`)
  document.documentElement.style.setProperty(
    '--lounge-media-sheet-top',
    `${Math.round(frozenSheetTop)}px`,
  )
}

function parkOverlayToFrozenSheetTop() {
  writeParkedLayerStyles(appliedParkPan)
  const sheet = document.querySelector('[data-lounge-media-detail-sheet]')
  if (!(sheet instanceof HTMLElement)) return
  const actualTop = sheet.getBoundingClientRect().top
  const error = Math.round(frozenSheetTop - actualTop)
  if (Math.abs(error) < 1) return
  writeParkedLayerStyles(appliedParkPan + error)
}

function readInnerKeyboardOverlapPx() {
  if (!sheetKbLocked || typeof window === 'undefined') return 0
  const visibleH = window.visualViewport?.height ?? window.innerHeight ?? 0
  const sheet = document.querySelector('[data-lounge-media-detail-sheet]')
  const sheetBottom =
    sheet instanceof HTMLElement
      ? sheet.getBoundingClientRect().bottom
      : frozenSheetTop + frozenSheetH
  return Math.max(0, Math.round(sheetBottom - visibleH))
}

function estimatedParkedSheetBox() {
  const height = estimateSheetHeightForLayout(frozenLayoutH)
  if (height < 120 || frozenLayoutH < height + 24) return null
  return {
    top: Math.round(frozenLayoutH - height),
    height,
  }
}

/**
 * Live box only if the sheet has actually landed on-screen.
 * Off-screen / mid-slide rects are how the last pin hid the sheet.
 */
function readSettledOverlaySheetBox() {
  if (typeof document === 'undefined' || typeof window === 'undefined') return null
  const sheet = document.querySelector('[data-lounge-media-detail-sheet]')
  if (!(sheet instanceof HTMLElement)) return null
  const rect = sheet.getBoundingClientRect()
  const estimated = estimatedParkedSheetBox()
  if (!estimated) return null
  if (rect.height < estimated.height * 0.7) return null
  if (rect.top < 16) return null
  if (rect.top > estimated.top + 48) return null
  return {
    top: Math.round(rect.top),
    height: Math.round(rect.height),
  }
}

/** Document flag so lightbox chrome can hide while the X-style detail sheet is up. */
export function setLoungeDetailOverLightboxAttr(on) {
  overlayOn = Boolean(on)
  if (typeof document === 'undefined') return
  if (overlayOn) {
    captureOverlayLayoutBaseline()
    document.documentElement.setAttribute('data-lounge-detail-over-lightbox', '')
    const estimated = estimateLoungeMediaDetailSheetHeightPx()
    if (estimated > 0) {
      document.documentElement.style.setProperty('--lounge-media-sheet-h', `${estimated}px`)
    }
    startMetricPoll()
    bindViewportWatch()
  } else {
    unlockLoungeMediaSheetKeyboard()
    frozenLayoutH = 0
    frozenViewport = null
    stopMetricPoll()
    unbindViewportWatch()
    document.documentElement.removeAttribute('data-lounge-detail-over-lightbox')
    document.documentElement.style.removeProperty('--lounge-media-sheet-h')
  }
  emit()
}

export function getLoungeDetailOverLightbox() {
  return overlayOn
}

export function subscribeLoungeDetailOverLightbox(listener) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function estimateLoungeMediaDetailSheetHeightPx() {
  if (typeof window === 'undefined') return 0
  const vh =
    sheetKbLocked && frozenLayoutH > 0
      ? frozenLayoutH
      : (window.visualViewport?.height ?? window.innerHeight)
  return estimateSheetHeightForLayout(vh)
}

export function readLoungeMediaDetailSheetBottomInsetPx() {
  if (typeof document === 'undefined' || typeof window === 'undefined') return 0
  const el = document.querySelector('[data-lounge-media-detail-sheet]')
  if (!(el instanceof HTMLElement)) return 0
  const top = el.getBoundingClientRect().top
  const vv = window.visualViewport
  const vh = vv?.height ?? window.innerHeight
  const offsetTop = vv?.offsetTop ?? 0
  return Math.max(0, Math.round(offsetTop + vh - top))
}

/** Prefer the live sheet box; fall back to the CSS height while it is still sliding on. */
export function readLoungeLightboxPeekBottomInsetPx() {
  if (!overlayOn) return 0
  if (sheetKbLocked && frozenPeekInsetPx > 0) return frozenPeekInsetPx
  const measured = readLoungeMediaDetailSheetBottomInsetPx()
  const estimated = estimateLoungeMediaDetailSheetHeightPx()
  if (measured < estimated * 0.45) return estimated
  return measured
}

export function syncLoungeMediaSheetHeightVar() {
  if (typeof document === 'undefined') return
  if (sheetKbLocked) return
  const px = overlayOn ? readLoungeLightboxPeekBottomInsetPx() : 0
  if (px > 0) document.documentElement.style.setProperty('--lounge-media-sheet-h', `${px}px`)
  else document.documentElement.style.removeProperty('--lounge-media-sheet-h')
}

export function notifyLoungeMediaDetailSheetMetrics() {
  if (sheetKbLocked) {
    syncLockedSheetKeyboardVars()
    emit()
    return
  }
  syncLoungeMediaSheetHeightVar()
  emit()
}

function syncLockedSheetKeyboardVars() {
  if (typeof document === 'undefined' || typeof window === 'undefined' || !sheetKbLocked) return
  parkOverlayToFrozenSheetTop()
  document.documentElement.style.setProperty(
    '--lounge-overlay-inner-kb',
    `${readInnerKeyboardOverlapPx()}px`,
  )
}

/**
 * Pin peek + sheet frame from the pre-keyboard baseline.
 * Never pin a mid-slide / off-screen live rect (that hid the sheet last time).
 * Call from composer focus; safe to call before the slide finishes.
 */
export function lockLoungeMediaSheetKeyboard() {
  if (typeof window === 'undefined' || typeof document === 'undefined') return
  if (!overlayOn) return
  captureOverlayLayoutBaseline()
  const parked = estimatedParkedSheetBox()
  if (!parked) return
  const settled = readSettledOverlaySheetBox()
  const box = settled || parked
  frozenSheetTop = box.top
  frozenSheetH = box.height
  frozenPeekInsetPx = box.height
  appliedParkPan = 0
  sheetKbLocked = true
  document.documentElement.style.setProperty('--lounge-media-sheet-h', `${frozenPeekInsetPx}px`)
  document.documentElement.style.setProperty('--lounge-media-sheet-panel-h', `${frozenSheetH}px`)
  document.documentElement.style.setProperty('--lounge-lightbox-layout-h', `${frozenLayoutH}px`)
  document.documentElement.setAttribute('data-lounge-media-sheet-kb', '')
  document.documentElement.style.overflow = 'hidden'
  syncLockedSheetKeyboardVars()
  emit()
}

export function unlockLoungeMediaSheetKeyboard() {
  if (!sheetKbLocked) return
  sheetKbLocked = false
  frozenPeekInsetPx = 0
  frozenSheetTop = 0
  frozenSheetH = 0
  appliedParkPan = 0
  if (typeof document !== 'undefined') {
    const overlay = document.querySelector('[data-lounge-media-detail-overlay]')
    const sheet = document.querySelector('[data-lounge-media-detail-sheet]')
    clearParkedLayerStyles(overlay)
    clearParkedLayerStyles(sheet)
    queryParkedLightboxLayers().forEach(clearParkedLayerStyles)
    document.documentElement.removeAttribute('data-lounge-media-sheet-kb')
    document.documentElement.style.removeProperty('overflow')
    document.documentElement.style.removeProperty('--lounge-media-sheet-panel-h')
    document.documentElement.style.removeProperty('--lounge-media-sheet-top')
    document.documentElement.style.removeProperty('--lounge-lightbox-layout-h')
    document.documentElement.style.removeProperty('--lounge-overlay-inner-kb')
    document.documentElement.style.removeProperty('--lounge-overlay-vv-pan')
  }
  if (overlayOn) syncLoungeMediaSheetHeightVar()
  else if (typeof document !== 'undefined') {
    document.documentElement.style.removeProperty('--lounge-media-sheet-h')
  }
  emit()
}

export function getLoungeMediaSheetKeyboardLocked() {
  return sheetKbLocked
}

export function readLoungeOverlayInnerKeyboardOverlapPx() {
  return readInnerKeyboardOverlapPx()
}

export function computeLoungeLightboxPeekTarget(fromRect, extra = {}) {
  const insetBottomOpt = Number(extra.insetBottom)
  const vp = sheetKbLocked && frozenViewport ? frozenViewport : null
  return computeHeroTargetRect(fromRect, {
    ...extra,
    insetTop: Number(extra.insetTop) || 0,
    insetBottom: Number.isFinite(insetBottomOpt)
      ? insetBottomOpt
      : readLoungeLightboxPeekBottomInsetPx(),
    forceBand: true,
    ...(vp
      ? {
          viewportW: vp.width,
          viewportH: vp.height,
          ignoreVisualViewport: true,
        }
      : {}),
  })
}
