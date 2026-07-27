/**
 * Early SW message handlers for chat calling (before AppShell mounts).
 * - chat-call-push-probe → suppress OS banner while Edge is visible
 * - chat-call-invite-inapp → CustomEvent so ChatCallProvider can show the ring overlay
 */

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
        window.dispatchEvent(
          new CustomEvent('edge-chat-call-invite', { detail: event.data || {} }),
        )
      } catch {
        /* ignore */
      }
    }
  })
}
