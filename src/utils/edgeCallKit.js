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
 * @param {{ uuid?: string, callId?: string, reason?: 'local' | 'remote' }} [args]
 */
export async function endEdgeNativeCall(args = {}) {
  if (!isEdgeiOSShell()) return { ok: false, via: 'noop' }
  try {
    const result = await edgeNativeInvoke('endNativeCall', {
      uuid: args.uuid,
      callId: args.callId,
      reason: args.reason === 'remote' ? 'remote' : undefined,
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
 * Tell native the web layer can accept CallKit events, so it replays anything it
 * buffered. A VoIP push wakes the shell from terminated, so CallKit can hold an
 * answered call before this page exists ... those events are dropped without this.
 * Call it only once listeners are installed AND a session can actually join a call.
 * @returns {Promise<{ ok: boolean, replayed: number, via: 'bridge' | 'noop' | 'error' }>}
 */
export async function markEdgeCallKitWebReady() {
  if (!isEdgeiOSShell()) return { ok: false, replayed: 0, via: 'noop' }
  try {
    const result = await edgeNativeInvoke('callKitWebReady')
    const replayed = Number(result?.replayed)
    return {
      ok: result?.ok !== false,
      replayed: Number.isFinite(replayed) ? replayed : 0,
      via: 'bridge',
    }
  } catch {
    return { ok: false, replayed: 0, via: 'error' }
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
