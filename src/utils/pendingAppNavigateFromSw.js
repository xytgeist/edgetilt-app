/** Durable SW → page handoff for notificationclick (iOS often drops postMessage / query). */

const CACHE_NAME = 'edge-pending-app-navigate-v1'
const REQUEST_URL = '/__edge_pending_app_navigate__'
const MAX_AGE_MS = 5 * 60 * 1000

/**
 * @returns {Promise<null | {
 *   type?: string,
 *   url?: string,
 *   tab?: string,
 *   roomId?: string | null,
 *   callId?: string | null,
 *   missedCallId?: string | null,
 *   eventType?: string | null,
 *   chatCallId?: string | null,
 *   activityEventId?: string | null,
 *   activityBatchId?: string | null,
 *   markActivityRead?: boolean,
 * }>}
 */
export async function takePendingAppNavigateFromSw() {
  if (typeof window === 'undefined' || typeof caches === 'undefined') return null
  try {
    const cache = await caches.open(CACHE_NAME)
    const req = new Request(REQUEST_URL, { credentials: 'same-origin' })
    const res = await cache.match(req)
    if (!res) return null
    await cache.delete(req)
    const parsed = await res.json()
    const at = Number(parsed?.at || 0)
    if (!at || Date.now() - at > MAX_AGE_MS) return null
    return parsed
  } catch {
    return null
  }
}
