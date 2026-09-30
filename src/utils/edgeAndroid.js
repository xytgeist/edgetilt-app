/**
 * EdgeAndroid native WebView shell (`android/`) detection + `window.EdgeAndroid` bridge.
 * Contract: `android/README.md` "JS bridge".
 *
 * Positive checks only ... never treat Chrome / the Android PWA as the shell
 * (`AGENT_RULE_POSITIVE_PLATFORM_GUARDS`).
 */

const EDGE_ANDROID_UA_RE = /EdgeAndroid\/(\d+(?:\.\d+)*)/i
const PUSH_RESULT_EVENT = 'edge-android-push'

/** @returns {boolean} */
export function isEdgeAndroidShell() {
  if (typeof navigator === 'undefined') return false
  return EDGE_ANDROID_UA_RE.test(String(navigator.userAgent || ''))
}

function bridge() {
  if (typeof window === 'undefined' || !isEdgeAndroidShell()) return null
  const b = window.EdgeAndroid
  return b && typeof b === 'object' ? b : null
}

/** @returns {'granted' | 'denied' | 'prompt'} */
function normalizeStatus(raw) {
  const s = String(raw || '').toLowerCase()
  return s === 'granted' || s === 'denied' ? s : 'prompt'
}

/** @returns {Promise<{ status: 'granted' | 'denied' | 'prompt', via: 'bridge' | 'noop' | 'error' }>} */
export async function getEdgeAndroidPushPermissionStatus() {
  const b = bridge()
  if (!b || typeof b.pushStatus !== 'function') return { status: 'prompt', via: 'noop' }
  try {
    return { status: normalizeStatus(b.pushStatus()), via: 'bridge' }
  } catch {
    return { status: 'prompt', via: 'error' }
  }
}

/**
 * Android 13+ POST_NOTIFICATIONS prompt. The shell answers with a `edge-android-push` window event.
 * Call from a user gesture.
 * @returns {Promise<{ status: 'granted' | 'denied' | 'prompt', via: 'bridge' | 'noop' | 'error' }>}
 */
export function requestEdgeAndroidPushPermission() {
  const b = bridge()
  if (!b || typeof b.requestPush !== 'function') return Promise.resolve({ status: 'prompt', via: 'noop' })
  return new Promise((resolve) => {
    let done = false
    const finish = (status, via) => {
      if (done) return
      done = true
      window.removeEventListener(PUSH_RESULT_EVENT, onResult)
      window.clearTimeout(timer)
      resolve({ status: normalizeStatus(status), via })
    }
    const onResult = (event) => finish(event?.detail?.status, 'bridge')
    const timer = window.setTimeout(() => finish(b.pushStatus?.(), 'bridge'), 60_000)
    window.addEventListener(PUSH_RESULT_EVENT, onResult)
    try {
      b.requestPush()
    } catch {
      finish('prompt', 'error')
    }
  })
}

/** Android location prompt (skipped when already granted). Result is not reported back. */
export async function requestEdgeAndroidLocationPermission() {
  const b = bridge()
  if (!b || typeof b.requestLocation !== 'function') return { ok: false, via: 'noop' }
  try {
    b.requestLocation()
    return { ok: true, via: 'bridge' }
  } catch {
    return { ok: false, via: 'error' }
  }
}

/**
 * FCM registration token, or null when Firebase is not configured in this build or has not
 * minted a token yet.
 * @returns {Promise<{ token: string | null, via: 'bridge' | 'noop' | 'error' }>}
 */
export async function getEdgeAndroidPushToken() {
  const b = bridge()
  if (!b || typeof b.pushToken !== 'function') return { token: null, via: 'noop' }
  try {
    const raw = String(b.pushToken() || '').trim()
    return { token: raw || null, via: 'bridge' }
  } catch {
    return { token: null, via: 'error' }
  }
}

/** Open this app's system notification settings. */
export async function openEdgeAndroidAppSettings() {
  const b = bridge()
  if (!b || typeof b.openAppSettings !== 'function') return { ok: false, via: 'noop' }
  try {
    b.openAppSettings()
    return { ok: true, via: 'bridge' }
  } catch {
    return { ok: false, via: 'error' }
  }
}

/** Bridge when this APK ships `name` (older APKs lack the newer methods). */
function bridgeWith(name) {
  const b = bridge()
  return b && typeof b[name] === 'function' ? b : null
}

/** True when this APK can open the system share sheet. */
export function canShareEdgeAndroid() {
  return Boolean(bridgeWith('share'))
}

/**
 * System share sheet. Same payload as the IPA's `share`.
 * The chooser does not report cancel, so a shown sheet is `{ ok: true }`.
 *
 * @param {{ url?: string, text?: string, title?: string, images?: Array<{ mimeType: string, base64: string, filename?: string }> }} payload
 * @returns {{ ok: boolean }}
 */
export function shareEdgeAndroid(payload) {
  const b = bridgeWith('share')
  if (!b) return { ok: false }
  try {
    return { ok: b.share(JSON.stringify(payload || {})) === true }
  } catch {
    return { ok: false }
  }
}

/** True when this APK can fire native haptics. */
export function canEdgeAndroidHaptic() {
  return Boolean(bridgeWith('haptic'))
}

/** @param {'light' | 'medium' | 'heavy' | 'success' | 'warning' | 'error'} [style] */
export function triggerEdgeAndroidHaptic(style = 'light') {
  const b = bridgeWith('haptic')
  if (!b) return { ok: false, via: 'noop' }
  try {
    b.haptic(String(style))
    return { ok: true, via: 'bridge' }
  } catch {
    return { ok: false, via: 'error' }
  }
}

/** True when this APK can force portrait (phones only; tablets ignore the lock natively). */
export function canLockEdgeAndroidOrientation() {
  return Boolean(bridgeWith('setOrientationLock'))
}

/** @param {'portrait' | 'none'} lock */
export function setEdgeAndroidOrientationLock(lock) {
  const b = bridgeWith('setOrientationLock')
  if (!b) return { ok: false, via: 'noop' }
  try {
    b.setOrientationLock(lock === 'portrait' ? 'portrait' : 'none')
    return { ok: true, via: 'bridge' }
  } catch {
    return { ok: false, via: 'error' }
  }
}

/** `com.edgetilt.app` or `com.edgetilt.app.test`. */
export function readEdgeAndroidAppId() {
  const b = bridge()
  try {
    const info = JSON.parse(String(b?.info?.() || '{}'))
    return typeof info.appId === 'string' && info.appId ? info.appId : 'com.edgetilt.app'
  } catch {
    return 'com.edgetilt.app'
  }
}
