/**
 * Early SW message handlers for chat calling (before AppShell mounts).
 * - chat-call-push-probe → suppress OS banner while Edge is visible
 * - chat-call-invite-inapp → ring overlay (also used on notificationclick)
 * - chat-call-missed-inapp → Call back prompt (must not silent-drop when OS suppressed)
 */

import { stashPendingChatCallDeepLink } from './pendingChatCallDeepLink.js'

export function installChatCallPushProbeListener() {
  if (typeof window === 'undefined' || !navigator?.serviceWorker) return
  if (window.__edgeChatCallPushProbeInstalled) return
  window.__edgeChatCallPushProbeInstalled = true

  navigator.serviceWorker.addEventListener('message', (event) => {
    const type = event?.data?.type
    if (type === 'chat-call-push-probe') {
      const visible =
        typeof document !== 'undefined' && document.visibilityState === 'visible'
      try {
        event.ports?.[0]?.postMessage({ suppressCallPush: visible })
      } catch {
        /* ignore */
      }
      return
    }
    if (type === 'chat-call-invite-inapp') {
      try {
        const callId = String(event?.data?.chatCallId || '').trim()
        const roomId = String(event?.data?.roomId || '').trim()
        if (callId) stashPendingChatCallDeepLink(callId, roomId, 'ring')
        window.dispatchEvent(
          new CustomEvent('edge-chat-call-invite', { detail: event.data || {} }),
        )
      } catch {
        /* ignore */
      }
      return
    }
    if (type === 'chat-call-missed-inapp') {
      try {
        const callId = String(event?.data?.chatCallId || '').trim()
        const roomId = String(event?.data?.roomId || '').trim()
        if (callId) stashPendingChatCallDeepLink(callId, roomId, 'callback')
        window.dispatchEvent(
          new CustomEvent('edge-chat-call-missed', { detail: event.data || {} }),
        )
      } catch {
        /* ignore */
      }
    }
  })
}
