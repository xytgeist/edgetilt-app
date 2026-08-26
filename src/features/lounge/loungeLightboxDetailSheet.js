import { computeHeroTargetRect } from './loungeLightboxFlip.js'

/** Rest ~60% of the layout viewport. Composer focused ~74%. */
const SHEET_REST_FRACTION = 0.6
const SHEET_COMPOSER_FRACTION = 0.74
const SHEET_MIN_PEEK_REM = 5.5
/** Black gap between contain-fit media and the sheet top. */
const PEEK_GAP_PX = 12
const IS_ANDROID = typeof navigator !== 'undefined' && /Android/i.test(navigator.userAgent)

let overlayOn = false
let composerExpanded = false
let peekRevealed = false
let dragOffsetPx = 0
let sheetDragging = false
const listeners = new Set()
let viewportBound = false
let sheetKbLocked = false
let frozenPeekInsetPx = 0
let frozenLayoutH = 0
let frozenSheetTop = 0
let frozenSheetH = 0
let frozenViewport = null
let frozenKbInnerH = 0
let lvhProbeEl = null
let peekRevealTries = 0
/** Painted image/GIF box, captured while peek transform is identity. */
let cachedPeekMediaBox = null
/** Cached for useSyncExternalStore ... never read getBoundingClientRect in getSnapshot. */
let cachedInnerKbPx = 0
let peekFollowRaf = 0
let peekResizing = false
const PEEK_FOLLOW_MS = 300

function emit() {
  listeners.forEach((fn) => {
    try {
      fn()
    } catch {
      // ignore
    }
  })
}

function onViewportChange(event) {
  if (!overlayOn) return
  if (event?.type === 'orientationchange') {
    frozenLayoutH = 0
    frozenViewport = null
    cachedPeekMediaBox = null
    writePeekIdentityVars()
    frozenKbInnerH = 0
    if (sheetKbLocked) {
      if (refreshCachedInnerKbPx()) emit()
      return
    }
    captureOverlayLayoutBaseline()
    writeSheetHeightVar(estimateLoungeMediaDetailSheetHeightPx())
    requestAnimationFrame(() => {
      if (!overlayOn) return
      writePeekInsetVar()
      emit()
    })
    return
  }
  if (sheetKbLocked) {
    if (refreshCachedInnerKbPx()) emit()
    return
  }
  captureOverlayLayoutBaseline()
  writeSheetHeightVar(estimateLoungeMediaDetailSheetHeightPx())
  writePeekInsetVar()
  emit()
}

/** Keyboard overlap only. Do not size the sheet or peek from visualViewport. */
function onVisualViewportChange() {
  if (!overlayOn) return
  if (!sheetKbLocked && !composerExpanded) return
  if (refreshCachedInnerKbPx()) emit()
}

function bindViewportWatch() {
  if (viewportBound || typeof window === 'undefined') return
  viewportBound = true
  window.addEventListener('resize', onViewportChange)
  window.addEventListener('orientationchange', onViewportChange)
  const vv = window.visualViewport
  if (vv) {
    vv.addEventListener('resize', onVisualViewportChange)
    vv.addEventListener('scroll', onVisualViewportChange)
  }
}

function unbindViewportWatch() {
  if (!viewportBound || typeof window === 'undefined') return
  viewportBound = false
  window.removeEventListener('resize', onViewportChange)
  window.removeEventListener('orientationchange', onViewportChange)
  const vv = window.visualViewport
  if (vv) {
    vv.removeEventListener('resize', onVisualViewportChange)
    vv.removeEventListener('scroll', onVisualViewportChange)
  }
}

function rootFontPx() {
  if (typeof document === 'undefined') return 16
  return Number.parseFloat(getComputedStyle(document.documentElement).fontSize) || 16
}

function ensureLvhProbe() {
  if (typeof document === 'undefined') return null
  if (lvhProbeEl?.isConnected) return lvhProbeEl
  const el = document.createElement('div')
  el.setAttribute('aria-hidden', 'true')
  el.style.cssText =
    'position:fixed;left:0;top:0;width:0;height:100lvh;visibility:hidden;pointer-events:none;z-index:-1'
  document.documentElement.appendChild(el)
  lvhProbeEl = el
  return el
}

function removeLvhProbe() {
  lvhProbeEl?.remove()
  lvhProbeEl = null
}

function readLargeViewportH() {
  if (typeof window === 'undefined') return 0
  const probe = ensureLvhProbe()
  const lvh = probe instanceof HTMLElement ? Math.round(probe.getBoundingClientRect().height) : 0
  return Math.max(
    lvh,
    Math.round(window.innerHeight || 0),
    Math.round(document.documentElement?.clientHeight || 0),
  )
}

function layoutViewportH() {
  if (typeof window === 'undefined') return 0
  if (frozenLayoutH > 0) return frozenLayoutH
  return readLargeViewportH()
}

function liveLayoutH() {
  if (typeof window === 'undefined') return 0
  return Math.max(
    Math.round(window.innerHeight || 0),
    Math.round(document.documentElement?.clientHeight || 0),
  )
}

/** Android IME already shrank the layout. Size the sheet against that band, not frozen lvh. */
function sheetLayoutH() {
  if (IS_ANDROID && (composerExpanded || sheetKbLocked)) {
    const live = liveLayoutH()
    if (live > 0) return live
  }
  return layoutViewportH()
}

function readInlineFixedBox(el) {
  if (!(el instanceof HTMLElement)) return null
  const top = Number.parseFloat(el.style.top)
  const left = Number.parseFloat(el.style.left)
  const width = Number.parseFloat(el.style.width)
  const height = Number.parseFloat(el.style.height)
  if (![top, left, width, height].every(Number.isFinite) || width < 8 || height < 8) return null
  return { top, left, width, height }
}

function peekTransformIsIdentity() {
  if (typeof document === 'undefined') return true
  const root = document.documentElement.style
  const scale = Number.parseFloat(root.getPropertyValue('--lounge-media-peek-scale') || '1')
  const tx = Number.parseFloat(root.getPropertyValue('--lounge-media-peek-tx') || '0')
  const ty = Number.parseFloat(root.getPropertyValue('--lounge-media-peek-ty') || '0')
  return Math.abs(scale - 1) < 0.001 && Math.abs(tx) < 0.5 && Math.abs(ty) < 0.5
}

function readPaintedMediaBox(el) {
  if (!(el instanceof HTMLElement)) return null
  let r = el.getBoundingClientRect()
  if (r.width < 8 || r.height < 8) {
    const painted = el.querySelector('img, video')
    if (painted instanceof HTMLElement) r = painted.getBoundingClientRect()
  }
  if (r.width < 8 || r.height < 8) return null
  return { top: r.top, left: r.left, width: r.width, height: r.height }
}

function readPeekMediaLayoutBox() {
  if (typeof document === 'undefined') return null
  const media = document.querySelector('[data-lounge-lightbox-peek-media]')
  const fromInline = readInlineFixedBox(media)
  if (fromInline) {
    cachedPeekMediaBox = fromInline
    return fromInline
  }
  const flyout = document.querySelector('[data-lounge-stream-hero-flyout]')
  const fromFlyout = readInlineFixedBox(flyout)
  if (fromFlyout) {
    cachedPeekMediaBox = fromFlyout
    return fromFlyout
  }
  if (cachedPeekMediaBox) return cachedPeekMediaBox
  if (!peekTransformIsIdentity()) return null
  const painted = readPaintedMediaBox(media)
  if (painted) cachedPeekMediaBox = painted
  return painted
}

function peekContainTarget(box, bandW, bandH) {
  const scale = Math.min(bandW / Math.max(box.width, 1), bandH / Math.max(box.height, 1), 1)
  const width = box.width * scale
  const height = box.height * scale
  return {
    top: Math.max(0, bandH - height),
    left: (bandW - width) / 2,
    width,
    height,
    scale,
  }
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

function schedulePeekSettleWrite() {
  startPeekFollowSheet()
}

function clearPeekSettleWrite() {
  stopPeekFollowSheet()
}

function syncResizingAttr() {
  if (typeof document === 'undefined') return
  if (overlayOn && peekResizing) {
    document.documentElement.setAttribute('data-lounge-media-sheet-resizing', '')
  } else {
    document.documentElement.removeAttribute('data-lounge-media-sheet-resizing')
  }
}

function stopPeekFollowSheet() {
  if (peekFollowRaf) {
    cancelAnimationFrame(peekFollowRaf)
    peekFollowRaf = 0
  }
  if (peekResizing) {
    peekResizing = false
    syncResizingAttr()
  }
}

function startPeekFollowSheet() {
  if (typeof window === 'undefined') return
  stopPeekFollowSheet()
  peekResizing = true
  syncResizingAttr()
  const t0 = performance.now()
  const tick = (now) => {
    peekFollowRaf = 0
    if (!overlayOn) {
      peekResizing = false
      syncResizingAttr()
      return
    }
    writePeekInsetVar()
    if (now - t0 < PEEK_FOLLOW_MS) {
      peekFollowRaf = requestAnimationFrame(tick)
      return
    }
    peekResizing = false
    syncResizingAttr()
    writePeekInsetVar()
  }
  peekFollowRaf = requestAnimationFrame(tick)
}

function writePeekIdentityVars() {
  const root = document.documentElement
  root.style.setProperty('--lounge-media-peek-tx', '0px')
  root.style.setProperty('--lounge-media-peek-ty', '0px')
  root.style.setProperty('--lounge-media-peek-scale', '1')
  // Interpolable identity ... `none` will not ease into translate/scale.
  root.style.setProperty('--lounge-media-peek-transform', 'translate3d(0px, 0px, 0) scale(1)')
}

function readVisualSheetTopPx() {
  if (typeof document === 'undefined') return 0
  const el = document.querySelector('[data-lounge-media-detail-sheet]')
  if (!(el instanceof HTMLElement)) return 0
  const top = el.getBoundingClientRect().top
  return Number.isFinite(top) ? top : 0
}

function peekBandHeightPx() {
  if (!overlayOn || !peekRevealed) return 0
  const vh = sheetLayoutH()
  const sheetTop = readVisualSheetTopPx()
  const dragging = sheetDragging || dragOffsetPx > 0 || peekResizing
  const slidingOn = !dragging && vh >= 80 && sheetTop > vh * 0.88
  // Same coordinate space as the painted image box (getBoundingClientRect).
  // Landscape shots are width-capped so they only re-fit when this band actually
  // shrinks with the painted sheet, not with a mixed lvh estimate.
  if (sheetTop >= 8 && !slidingOn) return Math.max(0, Math.round(sheetTop - PEEK_GAP_PX))
  const estimated = visualSheetHeightPx()
  if (estimated < 8) return 0
  return Math.max(0, vh - estimated - PEEK_GAP_PX)
}

function writePeekInsetVar() {
  if (typeof document === 'undefined') return
  const bandH = peekBandHeightPx()
  const inset = peekInsetPx()
  const root = document.documentElement
  root.style.setProperty('--lounge-media-peek-inset', `${Math.max(0, inset)}px`)
  if (!overlayOn || !peekRevealed || bandH < 8) {
    writePeekIdentityVars()
    return
  }
  const box = readPeekMediaLayoutBox()
  const vw = Math.max(
    layoutViewportW(),
    typeof window !== 'undefined' ? Math.round(window.visualViewport?.width || window.innerWidth || 0) : 0,
  )
  if (!box || vw < 8) {
    writePeekIdentityVars()
    return
  }
  const target = peekContainTarget(box, vw, bandH)
  const tx = Math.round(target.left - box.left)
  const ty = Math.round(target.top - box.top)
  root.style.setProperty('--lounge-media-peek-tx', `${tx}px`)
  root.style.setProperty('--lounge-media-peek-ty', `${ty}px`)
  root.style.setProperty('--lounge-media-peek-scale', String(target.scale))
  root.style.setProperty(
    '--lounge-media-peek-transform',
    `translate3d(${tx}px, ${ty}px, 0) scale(${target.scale})`,
  )
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
  const band = peekBandHeightPx()
  if (band < 8) return 0
  return Math.max(0, sheetLayoutH() - band)
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
  refreshCachedInnerKbPx()
  emit()
  schedulePeekSettleWrite()
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
  const layout = readLargeViewportH()
  if (layout > frozenLayoutH) frozenLayoutH = layout
  if (frozenLayoutH < 1) frozenLayoutH = layout
  const width = layoutViewportW()
  frozenViewport = {
    width: Math.max(width, frozenViewport?.width || 0),
    height: frozenLayoutH,
  }
  captureKeyboardViewportBaseline()
}

/** Rest innerHeight only ... lvh vs visualViewport is why the composer sat above the keys. */
function captureKeyboardViewportBaseline() {
  if (typeof window === 'undefined') return
  const inner = Math.round(window.innerHeight || 0)
  if (inner > frozenKbInnerH) frozenKbInnerH = inner
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
  if (!overlayOn || typeof window === 'undefined') {
    if (cachedInnerKbPx === 0) return false
    cachedInnerKbPx = 0
    return true
  }
  if (!sheetKbLocked && !composerExpanded) {
    if (cachedInnerKbPx === 0) return false
    cachedInnerKbPx = 0
    return true
  }
  const baseline = frozenKbInnerH > 0 ? frozenKbInnerH : Math.round(window.innerHeight || 0)
  if (baseline < 1) return false
  const vv = window.visualViewport
  const visibleH = vv?.height ?? window.innerHeight ?? 0
  const offset = Number(vv?.offsetTop) || 0
  const inner = Math.round(window.innerHeight || 0)
  // Android `interactive-widget=resizes-content` already shrinks the layout viewport, so
  // `fixed bottom` is on the keys. iOS needs frozen innerHeight vs visualViewport.
  const next = IS_ANDROID
    ? Math.max(0, Math.round(inner - visibleH - offset))
    : Math.max(0, Math.round(baseline - visibleH - offset))
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
    peekRevealTries = 0
    cachedPeekMediaBox = null
    captureOverlayLayoutBaseline()
    writePeekIdentityVars()
    document.documentElement.setAttribute('data-lounge-detail-over-lightbox', '')
    syncDraggingAttr()
    const estimated = estimateLoungeMediaDetailSheetHeightPx()
    writeSheetHeightVar(estimated)
    writePeekInsetVar()
    emit()
    const revealPeekAfterLayout = () => {
      if (!overlayOn) return
      peekRevealed = true
      writePeekInsetVar()
      emit()
      if (!readPeekMediaLayoutBox() && peekRevealTries < 32) {
        peekRevealTries += 1
        requestAnimationFrame(revealPeekAfterLayout)
        return
      }
      schedulePeekSettleWrite()
    }
    // Paint identity under the overlay rule first, then ease to the peek.
    requestAnimationFrame(() => {
      requestAnimationFrame(revealPeekAfterLayout)
    })
    bindViewportWatch()
  } else {
    composerExpanded = false
    peekRevealed = false
    peekRevealTries = 0
    cachedPeekMediaBox = null
    dragOffsetPx = 0
    sheetDragging = false
    syncComposerAttr()
    syncDraggingAttr()
    unlockLoungeMediaSheetKeyboard()
    clearPeekSettleWrite()
    frozenLayoutH = 0
    frozenKbInnerH = 0
    frozenViewport = null
    unbindViewportWatch()
    removeLvhProbe()
    document.documentElement.removeAttribute('data-lounge-detail-over-lightbox')
    document.documentElement.removeAttribute('data-lounge-media-sheet-resizing')
    document.documentElement.style.removeProperty('--lounge-media-sheet-h')
    document.documentElement.style.removeProperty('--lounge-media-peek-inset')
    document.documentElement.style.removeProperty('--lounge-media-peek-scale')
    document.documentElement.style.removeProperty('--lounge-media-peek-tx')
    document.documentElement.style.removeProperty('--lounge-media-peek-ty')
    document.documentElement.style.removeProperty('--lounge-media-peek-transform')
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
  return estimateSheetHeightForLayout(sheetLayoutH())
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
  if (IS_ANDROID) {
    // resizes-content already parked `fixed bottom` on the keys. Pinning 74lvh of the
    // pre-keyboard layout fills the remaining band. Follow live innerHeight instead.
    writeSheetHeightVar(estimateLoungeMediaDetailSheetHeightPx())
    writePeekInsetVar()
    refreshCachedInnerKbPx()
    emit()
    schedulePeekSettleWrite()
    return
  }
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
  requestAnimationFrame(() => {
    if (!overlayOn || (!sheetKbLocked && !composerExpanded)) return
    if (refreshCachedInnerKbPx()) emit()
  })
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
    document.documentElement.style.removeProperty('--lounge-media-peek-scale')
    document.documentElement.style.removeProperty('--lounge-media-peek-tx')
    document.documentElement.style.removeProperty('--lounge-media-peek-ty')
    document.documentElement.style.removeProperty('--lounge-media-peek-transform')
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
