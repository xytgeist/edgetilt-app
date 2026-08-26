import { computeHeroTargetRect } from './loungeLightboxFlip.js'

/** Rest ~60% of the layout viewport. Composer focused ~74%. */
const SHEET_REST_FRACTION = 0.6
const SHEET_COMPOSER_FRACTION = 0.74
const SHEET_MIN_PEEK_REM = 5.5
/** Black gap between contain-fit media and the sheet top. */
const PEEK_GAP_PX = 12

let overlayOn = false
let composerExpanded = false
let peekRevealed = false
let dragOffsetPx = 0
let sheetDragging = false
const listeners = new Set()
let dragEmitRaf = 0
let viewportBound = false
let sheetKbLocked = false
let frozenPeekInsetPx = 0
let frozenLayoutH = 0
let frozenSheetTop = 0
let frozenSheetH = 0
let frozenViewport = null
/** Cached for useSyncExternalStore ... never read getBoundingClientRect in getSnapshot. */
let cachedInnerKbPx = 0

function emit() {
  listeners.forEach((fn) => {
    try {
      fn()
    } catch {
      // ignore
    }
  })
}

function emitOnNextFrame() {
  if (dragEmitRaf) return
  dragEmitRaf = requestAnimationFrame(() => {
    dragEmitRaf = 0
    emit()
  })
}

function onViewportChange() {
  if (!overlayOn) return
  if (sheetKbLocked) {
    if (refreshCachedInnerKbPx()) emit()
    return
  }
  captureOverlayLayoutBaseline()
  writeSheetHeightVar(estimateLoungeMediaDetailSheetHeightPx())
  writePeekInsetVar()
  emit()
}

function bindViewportWatch() {
  if (viewportBound || typeof window === 'undefined') return
  viewportBound = true
  window.addEventListener('resize', onViewportChange)
  window.addEventListener('orientationchange', onViewportChange)
}

function unbindViewportWatch() {
  if (!viewportBound || typeof window === 'undefined') return
  viewportBound = false
  window.removeEventListener('resize', onViewportChange)
  window.removeEventListener('orientationchange', onViewportChange)
}

function rootFontPx() {
  if (typeof document === 'undefined') return 16
  return Number.parseFloat(getComputedStyle(document.documentElement).fontSize) || 16
}

function layoutViewportH() {
  if (typeof window === 'undefined') return 0
  if (frozenLayoutH > 0) return frozenLayoutH
  return Math.max(window.innerHeight || 0, document.documentElement?.clientHeight || 0)
}

function layoutViewportW() {
  if (typeof window === 'undefined') return 0
  return Math.max(
    frozenViewport?.width || 0,
    window.innerWidth || 0,
    document.documentElement?.clientWidth || 0,
  )
}

function activeSheetFraction() {
  return composerExpanded ? SHEET_COMPOSER_FRACTION : SHEET_REST_FRACTION
}

function estimateSheetHeightForLayout(layoutH) {
  const vh = Math.max(0, Number(layoutH) || 0)
  const minPeek = SHEET_MIN_PEEK_REM * rootFontPx()
  return Math.round(Math.min(vh * activeSheetFraction(), Math.max(0, vh - minPeek)))
}

function writeSheetHeightVar(px) {
  if (typeof document === 'undefined') return
  if (px > 0) document.documentElement.style.setProperty('--lounge-media-sheet-h', `${px}px`)
  else document.documentElement.style.removeProperty('--lounge-media-sheet-h')
}

function writePeekInsetVar() {
  if (typeof document === 'undefined') return
  const px = peekInsetPx()
  if (px > 0) document.documentElement.style.setProperty('--lounge-media-peek-inset', `${px}px`)
  else document.documentElement.style.setProperty('--lounge-media-peek-inset', '0px')
}

function syncComposerAttr() {
  if (typeof document === 'undefined') return
  if (overlayOn && composerExpanded) {
    document.documentElement.setAttribute('data-lounge-media-sheet-composer', '')
  } else {
    document.documentElement.removeAttribute('data-lounge-media-sheet-composer')
  }
}

function syncDraggingAttr() {
  if (typeof document === 'undefined') return
  if (overlayOn && sheetDragging) {
    document.documentElement.setAttribute('data-lounge-media-sheet-dragging', '')
  } else {
    document.documentElement.removeAttribute('data-lounge-media-sheet-dragging')
  }
}

function visualSheetHeightPx() {
  return Math.max(0, estimateLoungeMediaDetailSheetHeightPx() - dragOffsetPx)
}

function peekInsetPx() {
  if (!overlayOn || !peekRevealed) return 0
  const visual = visualSheetHeightPx()
  if (visual < 8) return 0
  return visual + PEEK_GAP_PX
}

/** Grow the sheet when the overlay composer is focused ... media peek follows. */
export function setLoungeMediaSheetComposerExpanded(on) {
  const next = Boolean(on)
  const changed = composerExpanded !== next
  composerExpanded = next
  syncComposerAttr()
  if (!overlayOn || !changed) return
  const estimated = estimateLoungeMediaDetailSheetHeightPx()
  writeSheetHeightVar(estimated)
  if (sheetKbLocked && estimated > 0) {
    frozenPeekInsetPx = estimated
    const parked = estimatedParkedSheetBox()
    if (parked) {
      frozenSheetTop = parked.top
      frozenSheetH = parked.height
    }
  }
  writePeekInsetVar()
  emit()
}

export function getLoungeMediaSheetDragging() {
  return sheetDragging
}

export function setLoungeMediaSheetDragging(on) {
  const next = Boolean(on)
  if (sheetDragging === next) return
  sheetDragging = next
  syncDraggingAttr()
  emit()
}

export function setLoungeMediaSheetDragOffsetPx(dy) {
  const next = Math.max(0, Math.round(Number(dy) || 0))
  if (next === dragOffsetPx) return
  dragOffsetPx = next
  writePeekInsetVar()
  emitOnNextFrame()
}

/** Sheet dismissed or snapping closed ... media fills the viewport in the same motion. */
export function releaseLoungeMediaSheetPeek() {
  dragOffsetPx = 0
  sheetDragging = false
  peekRevealed = false
  syncDraggingAttr()
  writePeekInsetVar()
  emit()
}

/** Keep the tallest pre-keyboard layout; never freeze an already-shrunk keyboard viewport. */
function captureOverlayLayoutBaseline() {
  if (typeof window === 'undefined') return
  const layout = Math.max(window.innerHeight || 0, document.documentElement?.clientHeight || 0)
  if (layout > frozenLayoutH) frozenLayoutH = layout
  if (frozenLayoutH < 1) frozenLayoutH = layout
  const width = layoutViewportW()
  frozenViewport = {
    width: Math.max(width, frozenViewport?.width || 0),
    height: frozenLayoutH,
  }
}

function estimatedParkedSheetBox() {
  const height = estimateSheetHeightForLayout(frozenLayoutH)
  if (height < 120 || frozenLayoutH < height + 24) return null
  return {
    top: Math.round(frozenLayoutH - height),
    height,
  }
}

function refreshCachedInnerKbPx() {
  if (!sheetKbLocked || frozenLayoutH < 1 || typeof window === 'undefined') {
    if (cachedInnerKbPx === 0) return false
    cachedInnerKbPx = 0
    return true
  }
  const visibleH = window.visualViewport?.height ?? window.innerHeight ?? 0
  const next = Math.max(0, Math.round(frozenLayoutH - visibleH))
  if (next === cachedInnerKbPx) return false
  cachedInnerKbPx = next
  document.documentElement.style.setProperty('--lounge-overlay-inner-kb', `${next}px`)
  return true
}

/** Document flag so lightbox chrome can hide while the X-style detail sheet is up. */
export function setLoungeDetailOverLightboxAttr(on) {
  overlayOn = Boolean(on)
  if (typeof document === 'undefined') return
  if (overlayOn) {
    dragOffsetPx = 0
    sheetDragging = false
    peekRevealed = false
    captureOverlayLayoutBaseline()
    document.documentElement.setAttribute('data-lounge-detail-over-lightbox', '')
    syncDraggingAttr()
    const estimated = estimateLoungeMediaDetailSheetHeightPx()
    writeSheetHeightVar(estimated)
    writePeekInsetVar()
    emit()
    requestAnimationFrame(() => {
      if (!overlayOn) return
      peekRevealed = true
      writePeekInsetVar()
      emit()
    })
    bindViewportWatch()
  } else {
    composerExpanded = false
    peekRevealed = false
    dragOffsetPx = 0
    sheetDragging = false
    syncComposerAttr()
    syncDraggingAttr()
    unlockLoungeMediaSheetKeyboard()
    frozenLayoutH = 0
    frozenViewport = null
    unbindViewportWatch()
    document.documentElement.removeAttribute('data-lounge-detail-over-lightbox')
    document.documentElement.style.removeProperty('--lounge-media-sheet-h')
    document.documentElement.style.removeProperty('--lounge-media-peek-inset')
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
  return estimateSheetHeightForLayout(layoutViewportH())
}

export function readLoungeMediaDetailSheetBottomInsetPx() {
  if (typeof document === 'undefined' || typeof window === 'undefined') return 0
  const el = document.querySelector('[data-lounge-media-detail-sheet]')
  if (!(el instanceof HTMLElement)) return 0
  const top = el.getBoundingClientRect().top
  const vh = layoutViewportH()
  return Math.max(0, Math.round(vh - top))
}

export function readLoungeLightboxPeekBottomInsetPx() {
  return peekInsetPx()
}

export function syncLoungeMediaSheetHeightVar() {
  if (typeof document === 'undefined') return
  if (sheetKbLocked) return
  writeSheetHeightVar(overlayOn ? estimateLoungeMediaDetailSheetHeightPx() : 0)
  writePeekInsetVar()
}

export function notifyLoungeMediaDetailSheetMetrics() {
  if (sheetKbLocked) {
    if (refreshCachedInnerKbPx()) emit()
    return
  }
  syncLoungeMediaSheetHeightVar()
  emit()
}

/**
 * Pin the sheet frame from the pre-keyboard baseline. Do not touch the lightbox
 * `<video>` node (transform/height there caused a setState loop / crash).
 */
export function lockLoungeMediaSheetKeyboard() {
  if (typeof window === 'undefined' || typeof document === 'undefined') return
  if (!overlayOn) return
  if (sheetKbLocked) {
    if (refreshCachedInnerKbPx()) emit()
    return
  }
  captureOverlayLayoutBaseline()
  const parked = estimatedParkedSheetBox()
  if (!parked) return
  frozenSheetTop = parked.top
  frozenSheetH = parked.height
  frozenPeekInsetPx = parked.height
  sheetKbLocked = true
  writeSheetHeightVar(frozenPeekInsetPx)
  document.documentElement.style.setProperty('--lounge-media-sheet-panel-h', `${frozenSheetH}px`)
  document.documentElement.style.setProperty('--lounge-media-sheet-top', `${frozenSheetTop}px`)
  document.documentElement.setAttribute('data-lounge-media-sheet-kb', '')
  writePeekInsetVar()
  refreshCachedInnerKbPx()
  emit()
}

export function unlockLoungeMediaSheetKeyboard() {
  if (!sheetKbLocked) return
  sheetKbLocked = false
  frozenPeekInsetPx = 0
  frozenSheetTop = 0
  frozenSheetH = 0
  cachedInnerKbPx = 0
  if (typeof document !== 'undefined') {
    document.documentElement.removeAttribute('data-lounge-media-sheet-kb')
    document.documentElement.style.removeProperty('--lounge-media-sheet-panel-h')
    document.documentElement.style.removeProperty('--lounge-media-sheet-top')
    document.documentElement.style.removeProperty('--lounge-overlay-inner-kb')
  }
  if (overlayOn) syncLoungeMediaSheetHeightVar()
  else if (typeof document !== 'undefined') {
    document.documentElement.style.removeProperty('--lounge-media-sheet-h')
    document.documentElement.style.removeProperty('--lounge-media-peek-inset')
  }
  emit()
}

export function getLoungeMediaSheetKeyboardLocked() {
  return sheetKbLocked
}

export function readLoungeOverlayInnerKeyboardOverlapPx() {
  return cachedInnerKbPx
}

export function computeLoungeLightboxPeekTarget(fromRect, extra = {}) {
  const insetBottomOpt = Number(extra.insetBottom)
  const vpH = layoutViewportH()
  const vpW = layoutViewportW()
  return computeHeroTargetRect(fromRect, {
    ...extra,
    insetTop: Number(extra.insetTop) || 0,
    insetBottom: Number.isFinite(insetBottomOpt) ? insetBottomOpt : peekInsetPx(),
    forceBand: true,
    viewportW: vpW,
    viewportH: vpH,
    ignoreVisualViewport: true,
  })
}
