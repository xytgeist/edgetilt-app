import { useEffect, useSyncExternalStore } from 'react'
import { canLockEdgeAndroidOrientation, setEdgeAndroidOrientationLock } from './edgeAndroid.js'
import { edgeNativeInvoke, isEdgeiOSShell } from './edgeNative.js'
import { IPAD_SHELL_QUERY } from '../features/shell/quickLinkDestinations.js'

const PHONE_LANDSCAPE_QUERY = '(orientation: landscape) and (pointer: coarse)'

let wantCount = 0
const listeners = new Set()
let pending = Promise.resolve()

function emitWanted() {
  for (const listener of listeners) listener()
}

function canNativeLock() {
  if (typeof window === 'undefined' || !isEdgeiOSShell()) return false
  return typeof window.EdgeNative?.setOrientationLock === 'function'
}

/** IPA (any build) or an EdgeAndroid APK with `setOrientationLock` rotates composers itself. */
export function composerRotatesNatively() {
  return isEdgeiOSShell() || canLockEdgeAndroidOrientation()
}

async function sendLock(lock) {
  if (canLockEdgeAndroidOrientation()) {
    setEdgeAndroidOrientationLock(lock)
    return
  }
  if (!canNativeLock()) return
  try {
    await edgeNativeInvoke('setOrientationLock', { lock })
  } catch {
    /* old IPA / bridge reject … stay landscape */
  }
}

function queueLock(lock) {
  pending = pending.then(() => sendLock(lock)).catch(() => {})
}

function acquireComposerPortraitWanted() {
  wantCount += 1
  if (wantCount === 1) {
    emitWanted()
    queueLock('portrait')
  }
}

function releaseComposerPortraitWanted() {
  wantCount = Math.max(0, wantCount - 1)
  if (wantCount === 0) {
    emitWanted()
    queueLock('none')
  }
}

export function subscribeComposerPortraitWanted(listener) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function getComposerPortraitWanted() {
  return wantCount > 0
}

/**
 * Safari / PWA / Android Chrome cannot force-rotate. While the phone is landscape,
 * do not raise the software keyboard on a composer field.
 */
export function shouldBlockComposerKeyboard() {
  if (typeof window === 'undefined' || composerRotatesNatively()) return false
  return readPhoneLandscapeNotTablet()
}

export function isComposerKeyboardField(node) {
  if (!node || typeof node.closest !== 'function') return false
  return Boolean(node.closest('[data-composer-kb-field]'))
}

export function useComposerPortraitWanted() {
  return useSyncExternalStore(subscribeComposerPortraitWanted, getComposerPortraitWanted, () => false)
}

function readPhoneLandscapeNotTablet() {
  if (typeof window === 'undefined') return false
  return (
    window.matchMedia(PHONE_LANDSCAPE_QUERY).matches &&
    !window.matchMedia(IPAD_SHELL_QUERY).matches
  )
}

/**
 * True on a landscape phone (coarse + landscape, not tall iPad shell).
 * Syncs on matchMedia and orientationchange … WK can lag one of those.
 */
export function usePhoneLandscapeNotTablet() {
  return useSyncExternalStore(
    (onStoreChange) => {
      if (typeof window === 'undefined') return () => {}
      const landscapeMq = window.matchMedia(PHONE_LANDSCAPE_QUERY)
      const tabletMq = window.matchMedia(IPAD_SHELL_QUERY)
      landscapeMq.addEventListener('change', onStoreChange)
      tabletMq.addEventListener('change', onStoreChange)
      window.addEventListener('orientationchange', onStoreChange)
      window.addEventListener('resize', onStoreChange)
      return () => {
        landscapeMq.removeEventListener('change', onStoreChange)
        tabletMq.removeEventListener('change', onStoreChange)
        window.removeEventListener('orientationchange', onStoreChange)
        window.removeEventListener('resize', onStoreChange)
      }
    },
    readPhoneLandscapeNotTablet,
    () => false,
  )
}

function readCoarseLandscape() {
  if (typeof window === 'undefined') return false
  // Portrait wins if WK still reports the landscape MQ after rotate-back.
  return (
    window.matchMedia(PHONE_LANDSCAPE_QUERY).matches &&
    !window.matchMedia('(orientation: portrait)').matches
  )
}

/**
 * Landscape phone or iPad (coarse pointer). Football gamecast uses this so iPad
 * gets the same full-screen field as iPhone … `usePhoneLandscapeNotTablet` excludes tablets.
 */
export function useCoarseLandscape() {
  return useSyncExternalStore(
    (onStoreChange) => {
      if (typeof window === 'undefined') return () => {}
      const landscapeMq = window.matchMedia(PHONE_LANDSCAPE_QUERY)
      const portraitMq = window.matchMedia('(orientation: portrait)')
      landscapeMq.addEventListener('change', onStoreChange)
      portraitMq.addEventListener('change', onStoreChange)
      window.addEventListener('orientationchange', onStoreChange)
      window.addEventListener('resize', onStoreChange)
      return () => {
        landscapeMq.removeEventListener('change', onStoreChange)
        portraitMq.removeEventListener('change', onStoreChange)
        window.removeEventListener('orientationchange', onStoreChange)
        window.removeEventListener('resize', onStoreChange)
      }
    },
    readCoarseLandscape,
    () => false,
  )
}

/**
 * While `active`, composers want portrait. IPA iPhone and the Android APK force-rotate. Other phones
 * show the rotate hint. Unlock / hide when the last composer closes.
 *
 * @param {boolean} active
 */
export function useEdgeiOSComposerPortraitLock(active) {
  const should = Boolean(active)
  useEffect(() => {
    if (!should) return undefined
    acquireComposerPortraitWanted()
    return () => releaseComposerPortraitWanted()
  }, [should])
}
