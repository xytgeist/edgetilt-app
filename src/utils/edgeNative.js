/**
 * Edge iOS WKWebView shell detection + bridge invoke.
 * Contract: `docs/ios-native-bridge.md` (`AGENT_RULE_IOS_BRIDGE_CONTRACT`).
 *
 * Positive checks only ... never treat generic iOS Safari / PWA as the store shell
 * (`AGENT_RULE_POSITIVE_PLATFORM_GUARDS`).
 */

const EDGE_IOS_UA_RE = /EdgeiOS\/(\d+(?:\.\d+)*)/i

/**
 * True when running inside the EdgeiOS store / TestFlight WKWebView shell.
 * @returns {boolean}
 */
export function isEdgeiOSShell() {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return false
  if (window.EdgeNative && typeof window.EdgeNative === 'object') return true
  const ua = String(navigator.userAgent || '')
  return EDGE_IOS_UA_RE.test(ua)
}

/**
 * Parse `EdgeiOS/<semver>` from the UA when present.
 * @returns {string | null}
 */
export function readEdgeiOSShellVersion() {
  if (typeof navigator === 'undefined') return null
  const m = String(navigator.userAgent || '').match(EDGE_IOS_UA_RE)
  return m?.[1] ? String(m[1]) : null
}

/**
 * Call a native bridge method. Resolves with the Swift result object.
 * Rejects when the shell is absent or the method is unimplemented.
 *
 * @param {string} method
 * @param {Record<string, unknown>} [payload]
 * @returns {Promise<Record<string, unknown>>}
 */
export async function edgeNativeInvoke(method, payload = {}) {
  const name = String(method || '').trim()
  if (!name) throw new Error('edgeNativeInvoke: method required')

  const bridge = typeof window !== 'undefined' ? window.EdgeNative : null
  if (!bridge || typeof bridge !== 'object') {
    throw new Error('edgeNativeInvoke: EdgeNative bridge unavailable')
  }

  const fn = bridge[name]
  if (typeof fn !== 'function') {
    throw new Error(`edgeNativeInvoke: method not available (${name})`)
  }

  return fn.call(bridge, payload)
}

/**
 * Show or hide the system WK Done / prev-next accessory. Default is hidden.
 * Feature-detect first … old binaries no-op.
 *
 * @param {boolean} visible
 * @returns {Promise<Record<string, unknown> | { ok: false }>}
 */
export async function setEdgeKeyboardAccessoryVisible(visible) {
  if (typeof window === 'undefined' || !isEdgeiOSShell()) {
    return { ok: false }
  }
  if (typeof window.EdgeNative?.setKeyboardAccessory !== 'function') {
    return { ok: false }
  }
  try {
    return await edgeNativeInvoke('setKeyboardAccessory', { visible: Boolean(visible) })
  } catch {
    return { ok: false }
  }
}

/**
 * True when the IPA can present `UIActivityViewController`.
 * @returns {boolean}
 */
export function canShareEdgeNative() {
  if (typeof window === 'undefined' || !isEdgeiOSShell()) return false
  return typeof window.EdgeNative?.share === 'function'
}

/**
 * @param {Blob | File} file
 * @returns {Promise<{ mimeType: string, base64: string, filename?: string } | null>}
 */
export async function fileToEdgeShareImage(file) {
  if (!file) return null
  const mime = String(file.type || 'image/jpeg').toLowerCase()
  if (mime !== 'image/jpeg' && mime !== 'image/jpg' && mime !== 'image/png') return null
  const dataUrl = await new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result || ''))
    reader.onerror = () => reject(new Error('Could not read image'))
    reader.readAsDataURL(file)
  })
  const comma = dataUrl.indexOf(',')
  const base64 = comma >= 0 ? dataUrl.slice(comma + 1) : ''
  if (!base64) return null
  const filename =
    file instanceof File && file.name ? String(file.name) : undefined
  return { mimeType: mime === 'image/jpg' ? 'image/jpeg' : mime, base64, filename }
}

/**
 * @param {HTMLCanvasElement} canvas
 * @param {string} [filename]
 * @returns {{ mimeType: string, base64: string, filename: string } | null}
 */
export function canvasToEdgeShareImage(canvas, filename = 'edge-share.jpg') {
  if (!canvas || typeof canvas.toDataURL !== 'function') return null
  const dataUrl = canvas.toDataURL('image/jpeg', 0.86)
  const comma = dataUrl.indexOf(',')
  const base64 = comma >= 0 ? dataUrl.slice(comma + 1) : ''
  if (!base64) return null
  return { mimeType: 'image/jpeg', base64, filename }
}

/**
 * Present the system share sheet. Old IPA / missing items → `{ ok: false }`.
 *
 * @param {{
 *   url?: string,
 *   text?: string,
 *   title?: string,
 *   images?: Array<{ mimeType?: string, base64?: string, filename?: string } | null | undefined>,
 * }} [opts]
 * @returns {Promise<{ ok: boolean, cancelled?: boolean }>}
 */
export async function shareEdgeNative(opts = {}) {
  if (!canShareEdgeNative()) return { ok: false }
  const url = String(opts.url || '').trim()
  const text = String(opts.text || '').trim()
  const title = String(opts.title || '').trim()
  const images = (Array.isArray(opts.images) ? opts.images : [])
    .filter((row) => row && String(row.base64 || '').trim())
    .slice(0, 4)
    .map((row) => ({
      mimeType: String(row.mimeType || 'image/jpeg'),
      base64: String(row.base64),
      filename: row.filename ? String(row.filename) : undefined,
    }))
  if (!url && !text && images.length === 0) return { ok: false }
  try {
    const result = await edgeNativeInvoke('share', {
      url: url || undefined,
      text: text || undefined,
      title: title || undefined,
      images: images.length ? images : undefined,
    })
    return {
      ok: result?.ok !== false,
      cancelled: result?.cancelled === true,
    }
  } catch {
    return { ok: false }
  }
}

/**
 * IPA uses the system sheet. Everywhere else uses `navigator.share`, then clipboard for a URL.
 *
 * @param {{
 *   url?: string,
 *   title?: string,
 *   text?: string,
 *   files?: File[],
 *   images?: Array<{ mimeType?: string, base64?: string, filename?: string }>,
 *   onCopied?: () => void,
 *   onCopyFailed?: () => void,
 * }} opts
 * @returns {Promise<{ mode: 'native' | 'web' | 'copy' | 'aborted' | 'failed' }>}
 */
export async function shareViaBestAvailable(opts = {}) {
  const url = String(opts.url || '').trim()
  const title = String(opts.title || '').trim()
  const text = String(opts.text || '').trim()
  let images = Array.isArray(opts.images) ? opts.images.filter(Boolean) : []
  if (!images.length && Array.isArray(opts.files) && opts.files.length) {
    const converted = await Promise.all(opts.files.map((file) => fileToEdgeShareImage(file)))
    images = converted.filter(Boolean)
  }

  if (canShareEdgeNative()) {
    const result = await shareEdgeNative({ url, title, text, images })
    if (result.cancelled) return { mode: 'aborted' }
    if (result.ok) return { mode: 'native' }
  }

  const nav = typeof navigator !== 'undefined' ? navigator : null
  if (nav?.share) {
    const shareData = {}
    if (url) shareData.url = url
    if (title) shareData.title = title
    if (text) shareData.text = text
    if (Array.isArray(opts.files) && opts.files.length) shareData.files = opts.files
    const allowed = typeof nav.canShare !== 'function' ? true : nav.canShare(shareData)
    if (allowed) {
      try {
        await nav.share(shareData)
        return { mode: 'web' }
      } catch (e) {
        if (e && typeof e === 'object' && e.name === 'AbortError') {
          return { mode: 'aborted' }
        }
      }
    }
  }

  if (url) {
    try {
      if (nav?.clipboard?.writeText) {
        await nav.clipboard.writeText(url)
        opts.onCopied?.()
        return { mode: 'copy' }
      }
    } catch {
      // fall through
    }
  }

  if (text && !url) {
    try {
      if (nav?.clipboard?.writeText) {
        await nav.clipboard.writeText(text)
        opts.onCopied?.()
        return { mode: 'copy' }
      }
    } catch {
      // fall through
    }
  }

  opts.onCopyFailed?.()
  return { mode: 'failed' }
}

/** Blur the focused field and drop the IPA software keyboard (no WK Done bar). */
export function dismissEdgeKeyboard() {
  try {
    const el = typeof document !== 'undefined' ? document.activeElement : null
    if (el && el !== document.body && typeof el.blur === 'function') el.blur()
  } catch {
    // ignore
  }
  if (!isEdgeiOSShell()) return
  void edgeNativeInvoke('dismissKeyboard').catch(() => {})
}

/**
 * Open a Stripe Checkout / Customer Portal / Connect onboarding URL.
 * EdgeiOS shell → system Safari (`openInSafari`). Everywhere else → same-tab assign.
 * Never load Stripe-hosted checkout inside the WKWebView.
 *
 * @param {string} url
 * @returns {Promise<{ ok: boolean, via: 'safari' | 'assign' }>}
 */
export async function openExternalBillingUrl(url) {
  const href = String(url || '').trim()
  if (!href) throw new Error('openExternalBillingUrl: url required')
  if (typeof window === 'undefined') return { ok: false, via: 'assign' }

  if (isEdgeiOSShell()) {
    const result = await edgeNativeInvoke('openInSafari', { url: href })
    if (result && result.ok === false) {
      throw new Error('Could not open Safari for billing.')
    }
    return { ok: true, via: 'safari' }
  }

  window.location.assign(href)
  return { ok: true, via: 'assign' }
}

/**
 * Open the Edge app page in iOS Settings (notifications, etc.). Shell only.
 * @returns {Promise<{ ok: boolean, via: 'bridge' | 'noop' | 'error' }>}
 */
export async function openEdgeAppSettings() {
  if (typeof window === 'undefined' || !isEdgeiOSShell()) {
    return { ok: false, via: 'noop' }
  }
  try {
    const result = await edgeNativeInvoke('openAppSettings')
    return { ok: result?.ok !== false, via: 'bridge' }
  } catch {
    return { ok: false, via: 'error' }
  }
}

/**
 * Ask the shell for AVAudioSession `.playback` so Lounge video ignores the silent switch.
 * No-op outside EdgeiOS. Never throws.
 *
 * @returns {Promise<{ ok: boolean, via: 'bridge' | 'noop' | 'error' }>}
 */
export async function ensureEdgeiOSPlaybackAudioSession() {
  if (typeof window === 'undefined' || !isEdgeiOSShell()) {
    return { ok: false, via: 'noop' }
  }
  try {
    const result = await edgeNativeInvoke('setAudioSession', { mode: 'playback' })
    return { ok: result?.ok !== false, via: 'bridge' }
  } catch {
    return { ok: false, via: 'error' }
  }
}

/**
 * @typedef {'granted' | 'denied' | 'prompt'} EdgeiOSPushPermissionStatus
 */

/**
 * Read APNs authorization without prompting. No-op outside EdgeiOS.
 * @returns {Promise<{ status: EdgeiOSPushPermissionStatus, via: 'bridge' | 'noop' | 'error' }>}
 */
export async function getEdgeiOSPushPermissionStatus() {
  if (typeof window === 'undefined' || !isEdgeiOSShell()) {
    return { status: 'prompt', via: 'noop' }
  }
  try {
    const result = await edgeNativeInvoke('getPushPermissionStatus')
    const status = normalizePushStatus(result?.status)
    return { status, via: 'bridge' }
  } catch {
    return { status: 'prompt', via: 'error' }
  }
}

/**
 * Prompt (if needed) and register for remote notifications. Call from a user gesture.
 * @returns {Promise<{ status: EdgeiOSPushPermissionStatus, via: 'bridge' | 'noop' | 'error' }>}
 */
export async function requestEdgeiOSPushPermission() {
  if (typeof window === 'undefined' || !isEdgeiOSShell()) {
    return { status: 'prompt', via: 'noop' }
  }
  try {
    const result = await edgeNativeInvoke('requestPushPermission')
    const status = normalizePushStatus(result?.status)
    return { status, via: 'bridge' }
  } catch {
    return { status: 'prompt', via: 'error' }
  }
}

/**
 * Device token hex when APNs has registered. May be null briefly after grant.
 * @returns {Promise<{ token: string | null, via: 'bridge' | 'noop' | 'error' }>}
 */
export async function getEdgeiOSPushToken() {
  if (typeof window === 'undefined' || !isEdgeiOSShell()) {
    return { token: null, via: 'noop' }
  }
  try {
    const result = await edgeNativeInvoke('getPushToken')
    const raw = result?.token
    const token = typeof raw === 'string' && raw.trim() ? raw.trim() : null
    return { token, via: 'bridge' }
  } catch {
    return { token: null, via: 'error' }
  }
}

/**
 * Native UIKit haptics in EdgeiOS shell. No-op elsewhere.
 * @param {'light' | 'medium' | 'heavy' | 'success' | 'warning' | 'error'} [style]
 */
export async function triggerEdgeNativeHaptic(style = 'light') {
  if (typeof window === 'undefined' || !isEdgeiOSShell()) return { ok: false, via: 'noop' }
  try {
    const result = await edgeNativeInvoke('triggerHaptic', { style })
    return { ok: result?.ok !== false, via: 'bridge' }
  } catch {
    return { ok: false, via: 'error' }
  }
}

/**
 * @param {'earpiece' | 'speaker'} route
 */
export async function setEdgeCallAudioRoute(route) {
  if (typeof window === 'undefined' || !isEdgeiOSShell()) {
    return { ok: false, via: 'noop' }
  }
  try {
    const result = await edgeNativeInvoke('setAudioRoute', { route })
    return { ok: result?.ok !== false, via: 'bridge', route: result?.route || route }
  } catch {
    return { ok: false, via: 'error' }
  }
}

/**
 * True when the IPA injected `scanDocument` (VisionKit). Old binaries and PWA are false.
 * @returns {boolean}
 */
export function canScanEdgeDocument() {
  if (typeof window === 'undefined' || !isEdgeiOSShell()) return false
  return typeof window.EdgeNative?.scanDocument === 'function'
}

/**
 * Present the iOS document camera. Feature-detect first (`canScanEdgeDocument`).
 * Cancel returns `{ ok: false, cancelled: true }`. Simulator often returns `unsupported`.
 *
 * @param {{ purpose?: string, maxPages?: number }} [payload]
 * @returns {Promise<Record<string, unknown>>}
 */
export async function scanEdgeDocument(payload = {}) {
  return edgeNativeInvoke('scanDocument', payload)
}

/**
 * Turn native JPEG pages into Files the W-2G pipeline already understands.
 * @param {Record<string, unknown> | null | undefined} result
 * @returns {File[]}
 */
export function filesFromNativeScanImages(result) {
  const images = Array.isArray(result?.images) ? result.images : []
  const files = []
  for (let i = 0; i < images.length; i++) {
    const img = images[i] && typeof images[i] === 'object' ? images[i] : {}
    const b64 = String(img.base64 || '').replace(/\s+/g, '')
    if (!b64) continue
    try {
      const binary = atob(b64)
      const bytes = new Uint8Array(binary.length)
      for (let n = 0; n < binary.length; n++) bytes[n] = binary.charCodeAt(n)
      const mime = String(img.mimeType || 'image/jpeg')
      files.push(new File([bytes], `scan-${i + 1}.jpg`, { type: mime }))
    } catch {
      // skip a bad page
    }
  }
  return files
}

/**
 * True when the IPA injected `recognizeText` (Vision OCR). Old binaries and PWA are false.
 * @returns {boolean}
 */
export function canRecognizeEdgeText() {
  if (typeof window === 'undefined' || !isEdgeiOSShell()) return false
  return typeof window.EdgeNative?.recognizeText === 'function'
}

/**
 * On-device Vision OCR. Feature-detect first (`canRecognizeEdgeText`).
 *
 * @param {{ imageBase64: string, mimeType?: string, purpose?: string }} payload
 * @returns {Promise<Record<string, unknown>>}
 */
export async function recognizeEdgeText(payload) {
  return edgeNativeInvoke('recognizeText', payload)
}

/**
 * True when the IPA injected `pickPhotos` (PHPicker). Old binaries and PWA are false.
 * @returns {boolean}
 */
export function canPickEdgePhotos() {
  if (typeof window === 'undefined' || !isEdgeiOSShell()) return false
  return typeof window.EdgeNative?.pickPhotos === 'function'
}

/**
 * Native photo library picker. Feature-detect first (`canPickEdgePhotos`).
 * Cancel returns `{ ok: false, cancelled: true }`.
 *
 * @param {{ purpose?: string, maxCount?: number }} [payload]
 * @returns {Promise<Record<string, unknown>>}
 */
export async function pickEdgePhotos(payload = {}) {
  return edgeNativeInvoke('pickPhotos', payload)
}

/**
 * Put Files on a hidden `<input type="file">` and fire `change` so existing handlers run.
 * Empty `files` still fires change so cancel paths can unwind picker-session locks.
 *
 * @param {HTMLInputElement | null | undefined} input
 * @param {File[]} [files]
 * @returns {boolean}
 */
export function dispatchFilesOnInput(input, files = []) {
  if (!input) return false
  try {
    const dt = new DataTransfer()
    for (const file of files) {
      if (file instanceof File) dt.items.add(file)
    }
    input.files = dt.files
    input.dispatchEvent(new Event('change', { bubbles: true }))
    return true
  } catch {
    return false
  }
}

/**
 * PHPicker → hidden file input. `fallback` means the caller should `.click()` the input.
 *
 * @param {HTMLInputElement | null | undefined} input
 * @param {{ purpose?: string, maxCount?: number }} [opts]
 * @returns {Promise<'picked' | 'cancelled' | 'fallback'>}
 */
export async function tryAssignEdgePickedPhotos(input, opts = {}) {
  if (!input || !canPickEdgePhotos()) return 'fallback'
  try {
    const result = await pickEdgePhotos({
      purpose: opts.purpose || 'photos',
      maxCount: opts.maxCount,
    })
    if (result?.cancelled) {
      dispatchFilesOnInput(input, [])
      return 'cancelled'
    }
    const files = filesFromNativeScanImages(result)
    if (!files.length) return 'fallback'
    if (!dispatchFilesOnInput(input, files)) return 'fallback'
    void triggerEdgeNativeHaptic('success')
    return 'picked'
  } catch {
    return 'fallback'
  }
}

/**
 * VisionKit → hidden file input. `fallback` means the caller should `.click()` the input.
 *
 * @param {HTMLInputElement | null | undefined} input
 * @param {{ purpose?: string, maxPages?: number }} [opts]
 * @returns {Promise<'picked' | 'cancelled' | 'fallback'>}
 */
export async function tryAssignEdgeScannedDocuments(input, opts = {}) {
  if (!input || !canScanEdgeDocument()) return 'fallback'
  try {
    const result = await scanEdgeDocument({
      purpose: opts.purpose || 'scan',
      maxPages: opts.maxPages,
    })
    if (result?.cancelled) {
      dispatchFilesOnInput(input, [])
      return 'cancelled'
    }
    if (result?.unsupported) return 'fallback'
    const files = filesFromNativeScanImages(result)
    if (!files.length) return 'fallback'
    if (!dispatchFilesOnInput(input, files)) return 'fallback'
    void triggerEdgeNativeHaptic('success')
    return 'picked'
  } catch {
    return 'fallback'
  }
}

/** @param {unknown} value */
function normalizePushStatus(value) {
  const s = String(value || '').trim().toLowerCase()
  if (s === 'granted' || s === 'denied' || s === 'prompt') return s
  return 'prompt'
}
