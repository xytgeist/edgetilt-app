/**
 * Answer SW `chat-call-push-probe` as early as possible (before AppShell mounts).
 * If the probe times out, push-sw.js shows an OS notification even while Edge is open.
 */

export function installChatCallPushProbeListener() {
  if (typeof window === 'undefined' || !navigator?.serviceWorker) return
  if (window.__edgeChatCallPushProbeInstalled) return
  window.__edgeChatCallPushProbeInstalled = true

  navigator.serviceWorker.addEventListener('message', (event) => {
    if (event?.data?.type !== 'chat-call-push-probe') return
    const visible =
      typeof document !== 'undefined' && document.visibilityState === 'visible'
    try {
      event.ports?.[0]?.postMessage({ suppressCallPush: visible })
    } catch {
      /* ignore */
    }
  })
}
