/** Survive PWA notificationclick navigate/reload races for ?call= / ?missedCall= deep links. */

const STORAGE_KEY = 'edge_pending_chat_call_v1'
const MAX_AGE_MS = 5 * 60 * 1000

/**
 * @param {string} callId
 * @param {string} [roomId]
 * @param {'ring' | 'callback'} [intent]
 */
export function stashPendingChatCallDeepLink(callId, roomId = '', intent = 'ring') {
  if (typeof window === 'undefined') return
  const id = String(callId || '').trim()
  if (!id) return
  try {
    window.sessionStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        callId: id,
        roomId: String(roomId || '').trim(),
        intent: intent === 'callback' ? 'callback' : 'ring',
        at: Date.now(),
      }),
    )
  } catch {
    /* private mode / quota */
  }
}

/** @returns {{ callId: string, roomId: string, intent: 'ring' | 'callback' } | null} */
export function peekPendingChatCallDeepLink() {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    const callId = String(parsed?.callId || '').trim()
    const at = Number(parsed?.at || 0)
    if (!callId || !at || Date.now() - at > MAX_AGE_MS) {
      window.sessionStorage.removeItem(STORAGE_KEY)
      return null
    }
    return {
      callId,
      roomId: String(parsed?.roomId || '').trim(),
      intent: parsed?.intent === 'callback' ? 'callback' : 'ring',
    }
  } catch {
    return null
  }
}

export function clearPendingChatCallDeepLink() {
  if (typeof window === 'undefined') return
  try {
    window.sessionStorage.removeItem(STORAGE_KEY)
  } catch {
    /* ignore */
  }
}
