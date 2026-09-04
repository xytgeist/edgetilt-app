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
 *   avatarUrl?: string | null
 * }} args
 */
export async function reportEdgeIncomingCall(args) {
  if (!isEdgeiOSShell()) return { ok: false, via: 'noop' }
  try {
    const avatarUrl =
      typeof args.avatarUrl === 'string' && args.avatarUrl.trim() ? args.avatarUrl.trim() : ''
    const result = await edgeNativeInvoke('reportIncomingCall', {
      callId: String(args.callId || '').trim(),
      roomId: String(args.roomId || '').trim(),
      handle: String(args.handle || 'Incoming call').trim(),
      hasVideo: Boolean(args.hasVideo),
      uuid: args.uuid || undefined,
      ...(avatarUrl ? { avatarUrl } : {}),
    })
    return { ok: result?.ok !== false, via: 'bridge', uuid: result?.uuid || null }
  } catch {
    return { ok: false, via: 'error' }
  }
}

/**
 * Notify the native iOS shell of the currently active chat room ID.
 * When set, APNs push alerts for messages in this room are silenced in the foreground.
 * @param {string | null | undefined} roomId
 */
export async function setEdgeActiveChatRoom(roomId) {
  if (!isEdgeiOSShell()) return { ok: false, via: 'noop' }
  try {
    const trimmed = typeof roomId === 'string' ? roomId.trim() : null
    const result = await edgeNativeInvoke('setActiveChatRoom', { roomId: trimmed || null })
    return { ok: result?.ok !== false, via: 'bridge' }
  } catch {
    return { ok: false, via: 'error' }
  }
}

/**
 * Pre-cache an avatar JPEG to native disk so CallKit has it ready on incoming rings.
 * @param {string | null | undefined} avatarUrl
 */
export async function preloadEdgeAvatar(avatarUrl) {
  if (!isEdgeiOSShell()) return { ok: false, via: 'noop' }
  const trimmed = String(avatarUrl || '').trim()
  if (!trimmed || !trimmed.startsWith('https://')) return { ok: false, via: 'invalid' }
  try {
    const result = await edgeNativeInvoke('preloadAvatar', { avatarUrl: trimmed })
    return { ok: result?.ok !== false, via: 'bridge' }
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

/** Wire CallKit answer/decline/end → window events for ChatCallProvider. */
export function installEdgeCallKitListeners({ onAnswer, onDecline, onEnd, onReveal }) {
  if (typeof window === 'undefined' || !isEdgeiOSShell()) return () => {}

  const onAnswerEvent = (event) => {
    const detail = event?.detail || {}
    onAnswer?.(detail)
  }
  const onDeclineEvent = (event) => {
    const detail = event?.detail || {}
    onDecline?.(detail)
  }
  const onEndEvent = (event) => {
    const detail = event?.detail || {}
    onEnd?.(detail)
  }
  const onRevealEvent = (event) => {
    const detail = event?.detail || {}
    onReveal?.(detail)
  }

  window.addEventListener('edge-callkit-answer', onAnswerEvent)
  window.addEventListener('edge-callkit-decline', onDeclineEvent)
  window.addEventListener('edge-callkit-end', onEndEvent)
  window.addEventListener('edge-native-call-reveal', onRevealEvent)

  return () => {
    window.removeEventListener('edge-callkit-answer', onAnswerEvent)
    window.removeEventListener('edge-callkit-decline', onDeclineEvent)
    window.removeEventListener('edge-callkit-end', onEndEvent)
    window.removeEventListener('edge-native-call-reveal', onRevealEvent)
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
 * @param {{ roomId: string, mediaMode?: 'audio' | 'video', title?: string }} args
 */
export async function startNativeCall(args) {
  if (!isEdgeiOSShell()) return { ok: false, via: 'noop' }
  try {
    const result = await edgeNativeInvoke('startNativeCall', {
      roomId: String(args.roomId || '').trim(),
      mediaMode: args.mediaMode === 'video' ? 'video' : 'audio',
      title: String(args.title || 'Chat call').trim(),
    })
    return { ...result, ok: result?.ok !== false, via: 'bridge' }
  } catch {
    return { ok: false, via: 'error' }
  }
}

/**
 * @param {{ callId: string, roomId?: string, hasVideo?: boolean }} args
 */
export async function acceptNativeCall(args) {
  if (!isEdgeiOSShell()) return { ok: false, via: 'noop' }
  try {
    const result = await edgeNativeInvoke('acceptNativeCall', {
      callId: String(args.callId || '').trim(),
      roomId: String(args.roomId || '').trim(),
      hasVideo: Boolean(args.hasVideo),
    })
    return { ...result, ok: result?.ok !== false, via: 'bridge' }
  } catch {
    return { ok: false, via: 'error' }
  }
}

/** @param {boolean} muted */
export async function setNativeCallMute(muted) {
  if (!isEdgeiOSShell()) return { ok: false, via: 'noop' }
  try {
    const result = await edgeNativeInvoke('setNativeCallMute', { muted: Boolean(muted) })
    return { ok: result?.ok !== false, via: 'bridge', muted: Boolean(result?.muted) }
  } catch {
    return { ok: false, via: 'error' }
  }
}

/** @param {{ enabled?: boolean, flip?: boolean }} args */
export async function setNativeCallCamera(args = {}) {
  if (!isEdgeiOSShell()) return { ok: false, via: 'noop' }
  try {
    const result = await edgeNativeInvoke('setNativeCallCamera', {
      enabled: args.enabled,
      flip: Boolean(args.flip),
    })
    return { ok: result?.ok !== false, via: 'bridge', enabled: result?.enabled }
  } catch {
    return { ok: false, via: 'error' }
  }
}

/** @param {boolean} speaker */
export async function setNativeCallSpeaker(speaker) {
  if (!isEdgeiOSShell()) return { ok: false, via: 'noop' }
  try {
    const result = await edgeNativeInvoke('setNativeCallSpeaker', { speaker: Boolean(speaker) })
    return { ok: result?.ok !== false, via: 'bridge', speaker: Boolean(result?.speaker) }
  } catch {
    return { ok: false, via: 'error' }
  }
}

/** @param {{ minimized?: boolean, videoVisible?: boolean, participantAvatars?: { identity: string, name?: string, avatarUrl?: string }[] }} args */
export async function setNativeCallChrome(args = {}) {
  if (!isEdgeiOSShell()) return { ok: false, via: 'noop' }
  try {
    const result = await edgeNativeInvoke('setNativeCallChrome', args)
    return { ok: result?.ok !== false, via: 'bridge' }
  } catch {
    return { ok: false, via: 'error' }
  }
}

/** @param {{ isLocalMain?: boolean, focusedIdentity?: string | null }} args */
export async function setNativeCallStreamFocus(args = {}) {
  if (!isEdgeiOSShell()) return { ok: false, via: 'noop' }
  try {
    const focusedIdentity = String(args.focusedIdentity || '').trim()
    const result = await edgeNativeInvoke('setNativeCallStreamFocus', {
      isLocalMain: false,
      focusedIdentity,
    })
    return {
      ok: result?.ok !== false,
      via: 'bridge',
      isLocalMain: false,
      focusedIdentity: result?.focusedIdentity || focusedIdentity,
    }
  } catch {
    return { ok: false, via: 'error' }
  }
}

/** Blur web focus and tell WKWebView to drop the software keyboard. */
export function dismissEdgeCallKeyboard() {
  try {
    const el = typeof document !== 'undefined' ? document.activeElement : null
    if (el && el !== document.body && typeof el.blur === 'function') el.blur()
  } catch {
    /* ignore */
  }
  if (!isEdgeiOSShell()) return
  void edgeNativeInvoke('dismissKeyboard')
}

export async function getNativeCallState() {
  if (!isEdgeiOSShell()) return { ok: false, via: 'noop' }
  try {
    const result = await edgeNativeInvoke('getNativeCallState')
    return { ...result, ok: true, via: 'bridge' }
  } catch {
    return { ok: false, via: 'error' }
  }
}

/** Native LiveKit Room connected. CallKit fulfill is not this ... do not skip it. */
export async function markEdgeCallKitDidConnect() {
  if (!isEdgeiOSShell()) return { ok: false, via: 'noop' }
  try {
    const result = await edgeNativeInvoke('callKitDidConnect')
    return { ok: result?.ok !== false, via: 'bridge' }
  } catch {
    return { ok: false, via: 'error' }
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
