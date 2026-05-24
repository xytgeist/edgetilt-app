import { readLoungeComposerDraft } from '../features/lounge/loungeStorage.js'

/** Splash already shown for this tab boot cycle (cleared after long background). */
export const LOUNGE_COLD_BOOT_SPLASH_CYCLE_KEY = 'loungeColdBootSplashCycle:v1'
/** Timestamp when the tab last went to background (`visibilitychange` → hidden). */
export const LOUNGE_COLD_BOOT_BG_AT_KEY = 'loungeColdBootBgAt:v1'

export const LOUNGE_COLD_BOOT_RESUME_AFTER_MS = 10 * 60 * 1000

/** Member: hold splash while feed + chunk warm. Min must exceed Lottie duration (300fr / 60fps = 5000ms). */
export const LOUNGE_COLD_BOOT_MEMBER_MIN_MS = 2800
export const LOUNGE_COLD_BOOT_MEMBER_MAX_MS = 7000

/** Anonymous browse: short brand flash only. */
export const LOUNGE_COLD_BOOT_ANON_MIN_MS = 380
export const LOUNGE_COLD_BOOT_ANON_MAX_MS = 900

/** @returns {boolean} */
export function readLoungeComposerDraftPendingWork() {
  const d = readLoungeComposerDraft()
  if (!d) return false
  return (
    String(d.postText || '').trim().length > 0 ||
    String(d.composerMediaUrl || '').trim().length > 0 ||
    d.composerExpanded === true
  )
}

/** Deep-link boot that should not force a Lounge splash (Offers, etc.). Share links → home. */
export function isLoungeColdBootHomeIntent() {
  if (typeof window === 'undefined') return true
  const params = new URLSearchParams(window.location.search || '')
  const targetTab = (params.get('tab') || '').trim().toLowerCase()
  if (!targetTab || targetTab === 'home') return true
  return false
}

/** @returns {boolean} */
export function readLoungeColdBootSplashCycleDone() {
  if (typeof window === 'undefined') return false
  try {
    return window.sessionStorage.getItem(LOUNGE_COLD_BOOT_SPLASH_CYCLE_KEY) === '1'
  } catch {
    return false
  }
}

export function markLoungeColdBootSplashCycleDone() {
  if (typeof window === 'undefined') return
  try {
    window.sessionStorage.setItem(LOUNGE_COLD_BOOT_SPLASH_CYCLE_KEY, '1')
  } catch {
    // ignore
  }
}

export function clearLoungeColdBootSplashCycle() {
  if (typeof window === 'undefined') return
  try {
    window.sessionStorage.removeItem(LOUNGE_COLD_BOOT_SPLASH_CYCLE_KEY)
  } catch {
    // ignore
  }
}

export function markLoungeColdBootBackgroundAt() {
  if (typeof window === 'undefined') return
  try {
    window.sessionStorage.setItem(LOUNGE_COLD_BOOT_BG_AT_KEY, String(Date.now()))
  } catch {
    // ignore
  }
}

/**
 * After a long background, allow one more splash this session.
 * @returns {boolean} true when resume splash should run
 */
export function consumeLoungeColdBootLongBackgroundResume() {
  if (typeof window === 'undefined') return false
  try {
    const raw = window.sessionStorage.getItem(LOUNGE_COLD_BOOT_BG_AT_KEY)
    if (!raw) return false
    const at = Number(raw)
    if (!Number.isFinite(at) || at <= 0) return false
    if (Date.now() - at < LOUNGE_COLD_BOOT_RESUME_AFTER_MS) return false
    window.sessionStorage.removeItem(LOUNGE_COLD_BOOT_BG_AT_KEY)
    clearLoungeColdBootSplashCycle()
    return true
  } catch {
    return false
  }
}

/**
 * @param {{ tab: string, pendingWork?: boolean }} opts
 * @returns {boolean}
 */
export function shouldShowLoungeColdBootSplash({ tab, pendingWork = false }) {
  if (typeof window === 'undefined') return false
  if (tab !== 'home') return false
  if (!isLoungeColdBootHomeIntent()) return false
  if (pendingWork || readLoungeComposerDraftPendingWork()) return false
  if (readLoungeColdBootSplashCycleDone()) return false
  return true
}

/**
 * @param {{ tab: string, pendingWork?: boolean }} opts
 * @returns {boolean}
 */
export function shouldShowLoungeColdBootResumeSplash({ tab, pendingWork = false }) {
  if (typeof window === 'undefined') return false
  if (tab !== 'home') return false
  if (!isLoungeColdBootHomeIntent()) return false
  if (pendingWork || readLoungeComposerDraftPendingWork()) return false
  return consumeLoungeColdBootLongBackgroundResume()
}
