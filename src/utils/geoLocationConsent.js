/** Per-user opt-in to use device GPS for nearby casino suggestions (Bankroll + Play Logbook). */

import { requestEdgeiOSLocationPermission } from './edgeNative.js'

export const GEO_LOCATION_CONSENT_KEY_PREFIX = 'edge_geo_location_consent:v1:'

export function getGeoLocationConsentStorageKey(userId) {
  return `${GEO_LOCATION_CONSENT_KEY_PREFIX}${userId || 'anon'}`
}

export function hasGeoLocationConsent(userId) {
  if (typeof window === 'undefined' || !userId) return false
  try {
    return window.localStorage.getItem(getGeoLocationConsentStorageKey(userId)) === 'granted'
  } catch {
    return false
  }
}

export function saveGeoLocationConsentGranted(userId) {
  if (typeof window === 'undefined' || !userId) return
  try {
    window.localStorage.setItem(getGeoLocationConsentStorageKey(userId), 'granted')
  } catch {
    // quota / private mode
  }
}

export function clearGeoLocationConsent(userId) {
  if (typeof window === 'undefined' || !userId) return
  try {
    window.localStorage.removeItem(getGeoLocationConsentStorageKey(userId))
  } catch {
    // ignore
  }
}

/** @returns {Promise<'granted' | 'denied' | 'prompt' | 'unknown'>} */
export async function queryBrowserGeoPermissionState() {
  if (typeof navigator === 'undefined' || !navigator.permissions?.query) return 'unknown'
  try {
    const result = await navigator.permissions.query({ name: 'geolocation' })
    return result.state
  } catch {
    return 'unknown'
  }
}

/** One ask at a time per user … currency default + nearby casinos both call this when a session opens. */
const pendingAccess = new Map()

/**
 * App-level one-time ask before calling `getCurrentPosition`.
 * Yes → saved per user (no repeat app prompt). No → not saved (ask again next time).
 * iOS app: CoreLocation's own When In Use prompt is the consent (asked once, remembered by iOS), so no app prompt.
 *
 * @returns {Promise<boolean>}
 */
export function ensureGeoLocationAccess(userId) {
  if (typeof window === 'undefined' || !navigator.geolocation || !userId) return Promise.resolve(false)
  const key = String(userId)
  const pending = pendingAccess.get(key)
  if (pending) return pending
  const ask = askGeoLocationAccess(userId).finally(() => pendingAccess.delete(key))
  pendingAccess.set(key, ask)
  return ask
}

async function askGeoLocationAccess(userId) {
  if (hasGeoLocationConsent(userId)) return true

  const native = await requestEdgeiOSLocationPermission()
  if (native.via === 'bridge') {
    if (native.status !== 'granted') return false
    saveGeoLocationConsentGranted(userId)
    return true
  }

  const browserState = await queryBrowserGeoPermissionState()
  if (browserState === 'granted') {
    saveGeoLocationConsentGranted(userId)
    return true
  }
  if (browserState === 'denied') return false

  const ok = window.confirm(
    'Use your location to suggest nearby casinos?\n\nYou can still type a casino name manually. Choose Not Now to skip for now.',
  )
  if (!ok) return false

  saveGeoLocationConsentGranted(userId)
  return true
}
