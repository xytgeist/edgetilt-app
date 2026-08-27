/**
 * CallKit bridge for EdgeiOS shell chat calls.
 * Contract: `docs/ios-native-bridge.md`
 */
import { edgeNativeInvoke, isEdgeiOSShell } from './edgeNative.js'

/**
 * @param {{
 *   callId: string
 *   roomId?: string
 *   handle?: string
 *   hasVideo?: boolean
 *   uuid?: string
 * }} args
 */
export async function reportEdgeIncomingCall(args) {
  if (!isEdgeiOSShell()) return { ok: false, via: 'noop' }
  try {
    const result = await edgeNativeInvoke('reportIncomingCall', {
      callId: String(args.callId || '').trim(),
      roomId: String(args.roomId || '').trim(),
      handle: String(args.handle || 'Incoming call').trim(),
      hasVideo: Boolean(args.hasVideo),
      uuid: args.uuid || undefined,
    })
    return { ok: result?.ok !== false, via: 'bridge', uuid: result?.uuid || null }
  } catch {
    return { ok: false, via: 'error' }
  }
}

/**
 * @param {{ uuid?: string, callId?: string }} [args]
 */
export async function endEdgeNativeCall(args = {}) {
  if (!isEdgeiOSShell()) return { ok: false, via: 'noop' }
  try {
    const result = await edgeNativeInvoke('endNativeCall', {
      uuid: args.uuid,
      callId: args.callId,
    })
    return { ok: result?.ok !== false, via: 'bridge' }
  } catch {
    return { ok: false, via: 'error' }
  }
}

/** Wire CallKit answer/decline → window events for ChatCallProvider. */
export function installEdgeCallKitListeners({ onAnswer, onDecline }) {
  if (typeof window === 'undefined' || !isEdgeiOSShell()) return () => {}

  const onAnswerEvent = (event) => {
    const detail = event?.detail || {}
    onAnswer?.(detail)
  }
  const onDeclineEvent = (event) => {
    const detail = event?.detail || {}
    onDecline?.(detail)
  }

  window.addEventListener('edge-callkit-answer', onAnswerEvent)
  window.addEventListener('edge-callkit-decline', onDeclineEvent)

  return () => {
    window.removeEventListener('edge-callkit-answer', onAnswerEvent)
    window.removeEventListener('edge-callkit-decline', onDeclineEvent)
  }
}

/**
 * @returns {Promise<{ token: string | null, via: 'bridge' | 'noop' | 'error' }>}
 */
export async function getEdgeVoIPPushToken() {
  if (!isEdgeiOSShell()) return { token: null, via: 'noop' }
  try {
    const result = await edgeNativeInvoke('getVoIPPushToken')
    const raw = result?.token
    const token = typeof raw === 'string' && raw.trim() ? raw.trim() : null
    return { token, via: 'bridge' }
  } catch {
    return { token: null, via: 'error' }
  }
}
