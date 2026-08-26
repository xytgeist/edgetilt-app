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
    // Cancel iOS visualViewport pan so peek + grab stay parked; inner pad handles the keys.
    window.scrollTo(0, 0)
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

/** Document flag so lightbox chrome can hide while the X-style detail sheet is up. */
export function setLoungeDetailOverLightboxAttr(on) {
  overlayOn = Boolean(on)
  if (typeof document === 'undefined') return
  if (overlayOn) {
    document.documentElement.setAttribute('data-lounge-detail-over-lightbox', '')
    const estimated = estimateLoungeMediaDetailSheetHeightPx()
    if (estimated > 0) {
      document.documentElement.style.setProperty('--lounge-media-sheet-h', `${estimated}px`)
    }
    startMetricPoll()
    bindViewportWatch()
  } else {
    unlockLoungeMediaSheetKeyboard()
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
  const rootPx =
    typeof document !== 'undefined'
      ? Number.parseFloat(getComputedStyle(document.documentElement).fontSize) || 16
      : 16
  const vv = window.visualViewport
  const vh = vv?.height ?? window.innerHeight
  const minPeek = SHEET_MIN_PEEK_REM * rootPx
  return Math.round(Math.min(vh * SHEET_DVH_FRACTION, Math.max(0, vh - minPeek)))
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
  const visibleH = window.visualViewport?.height ?? window.innerHeight ?? 0
  const overlap = Math.max(0, Math.round(frozenLayoutH - visibleH))
  document.documentElement.style.setProperty(
    '--lounge-media-sheet-top',
    `${Math.round(frozenSheetTop)}px`,
  )
  document.documentElement.style.setProperty('--lounge-overlay-inner-kb', `${overlap}px`)
}

/**
 * Pin peek + sheet frame, then let only the inner composer pad for the keyboard.
 * Call synchronously from composer focus.
 */
export function lockLoungeMediaSheetKeyboard() {
  if (typeof window === 'undefined' || typeof document === 'undefined') return
  if (!overlayOn) return
  if (sheetKbLocked) {
    syncLockedSheetKeyboardVars()
    emit()
    return
  }
  const sheet = document.querySelector('[data-lounge-media-detail-sheet]')
  const rect = sheet instanceof HTMLElement ? sheet.getBoundingClientRect() : null
  frozenSheetTop = rect ? Math.round(rect.top) : 0
  frozenSheetH = rect ? Math.round(rect.height) : 0
  frozenPeekInsetPx = readLoungeLightboxPeekBottomInsetPx()
  frozenLayoutH = Math.max(window.innerHeight || 0, document.documentElement?.clientHeight || 0)
  frozenViewport = {
    width: window.innerWidth || 0,
    height: frozenLayoutH,
  }
  sheetKbLocked = true
  if (frozenPeekInsetPx > 0) {
    document.documentElement.style.setProperty('--lounge-media-sheet-h', `${frozenPeekInsetPx}px`)
  }
  if (frozenSheetH > 0) {
    document.documentElement.style.setProperty('--lounge-media-sheet-panel-h', `${frozenSheetH}px`)
  }
  if (frozenLayoutH > 0) {
    document.documentElement.style.setProperty('--lounge-lightbox-layout-h', `${frozenLayoutH}px`)
  }
  syncLockedSheetKeyboardVars()
  document.documentElement.setAttribute('data-lounge-media-sheet-kb', '')
  emit()
}

export function unlockLoungeMediaSheetKeyboard() {
  if (!sheetKbLocked) return
  sheetKbLocked = false
  frozenPeekInsetPx = 0
  frozenLayoutH = 0
  frozenSheetTop = 0
  frozenSheetH = 0
  frozenViewport = null
  if (typeof document !== 'undefined') {
    document.documentElement.removeAttribute('data-lounge-media-sheet-kb')
    document.documentElement.style.removeProperty('--lounge-media-sheet-panel-h')
    document.documentElement.style.removeProperty('--lounge-media-sheet-top')
    document.documentElement.style.removeProperty('--lounge-lightbox-layout-h')
    document.documentElement.style.removeProperty('--lounge-overlay-inner-kb')
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
  if (!sheetKbLocked || frozenLayoutH < 1 || typeof window === 'undefined') return 0
  const visibleH = window.visualViewport?.height ?? window.innerHeight ?? 0
  return Math.max(0, Math.round(frozenLayoutH - visibleH))
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
