/**
 * Shared Cache flag so push-sw.js can suppress OS call banners while Edge is visible.
 * MessageChannel / WindowClient.visibilityState are unreliable on iPhone PWA.
 */

const CACHE_NAME = 'edge-app-visibility-v1'
const REQUEST_URL = '/__edge_app_visible__'
const HEARTBEAT_MS = 12_000

async function writeVisible(visible) {
  if (typeof caches === 'undefined') return
  try {
    const cache = await caches.open(CACHE_NAME)
    const req = new Request(REQUEST_URL, { credentials: 'same-origin' })
    if (!visible) {
      await cache.delete(req)
      return
    }
    await cache.put(
      req,
      new Response(JSON.stringify({ visible: true, at: Date.now() }), {
        headers: { 'Content-Type': 'application/json' },
      }),
    )
  } catch {
    /* private mode / quota */
  }
}

export function installEdgeAppVisibilityBeacon() {
  if (typeof window === 'undefined' || typeof document === 'undefined') return
  if (window.__edgeAppVisibilityBeaconInstalled) return
  window.__edgeAppVisibilityBeaconInstalled = true

  const sync = () => {
    void writeVisible(document.visibilityState === 'visible')
  }

  sync()
  document.addEventListener('visibilitychange', sync)
  window.addEventListener('pageshow', sync)
  window.addEventListener('pagehide', () => {
    void writeVisible(false)
  })
  window.addEventListener('beforeunload', () => {
    void writeVisible(false)
  })

  window.setInterval(() => {
    if (document.visibilityState === 'visible') void writeVisible(true)
  }, HEARTBEAT_MS)
}
