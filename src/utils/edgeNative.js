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
