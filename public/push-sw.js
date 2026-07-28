self.addEventListener('install', () => {
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim())
})

function isLoungeActivityPushPayload(payload) {
  if (!payload || payload.eventStartAt) return false
  return Boolean(
    payload.activityEventId ||
      payload.activityBatchId ||
      payload.title === 'Edge Lounge' ||
      payload.title === 'Edge Chat',
  )
}

function isChatCallPushPayload(payload, contentUrl) {
  if (payload?.eventType === 'chat_call_invite' || payload?.eventType === 'chat_call_missed') {
    return true
  }
  if (payload?.chatCallId) return true
  try {
    const url = new URL(String(contentUrl || payload?.url || ''), self.location.origin)
    return Boolean(url.searchParams.get('call') || url.searchParams.get('missedCall'))
  } catch {
    return false
  }
}

const PENDING_APP_NAVIGATE_CACHE = 'edge-pending-app-navigate-v1'
const PENDING_APP_NAVIGATE_URL = '/__edge_pending_app_navigate__'

/** Survive iOS PWA focus races where postMessage / openWindow query are dropped. */
async function stashPendingAppNavigate(message) {
  try {
    const cache = await caches.open(PENDING_APP_NAVIGATE_CACHE)
    await cache.put(
      new Request(PENDING_APP_NAVIGATE_URL),
      new Response(JSON.stringify({ ...message, at: Date.now() }), {
        headers: { 'Content-Type': 'application/json' },
      }),
    )
  } catch {
    /* ignore quota / private mode */
  }
}

function buildPushNotificationContent(payload) {
  const title = payload.title || 'Edge'
  let body = payload.body || 'You have a new notification.'
  if (payload.eventStartAt) {
    const dt = new Date(payload.eventStartAt)
    if (!Number.isNaN(dt.getTime())) {
      if (payload.eventAlertPreset === 'day_9am') {
        const localDate = dt.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
        body = `${payload.body || 'Your event'} (${localDate})`
      } else {
        const localTime = dt.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
        body = `${payload.body || 'Your event'} at ${localTime}`
      }
    }
  }
  return {
    title,
    body,
    icon: payload.icon || '/android-icon-192x192.png',
    badge: payload.badge || '/favicon-32x32.png',
    url: payload.url || '/?tab=home',
    activityEventId: payload.activityEventId || null,
    activityBatchId: payload.activityBatchId || null,
    eventType: payload.eventType || null,
    chatCallId: payload.chatCallId || null,
  }
}

async function deliverLoungeActivityInApp(clients, content) {
  const message = {
    type: 'lounge-activity-inapp',
    title: content.title,
    body: content.body,
    url: content.url,
    activityEventId: content.activityEventId,
    activityBatchId: content.activityBatchId,
    icon: content.icon,
  }
  const focused = clients.filter((client) => client.focused)
  const targets = focused.length > 0 ? focused : clients
  for (const client of targets) {
    if (typeof client.postMessage === 'function') {
      client.postMessage(message)
    }
  }
}

function parseRoomIdFromPushUrl(url) {
  try {
    return new URL(String(url || ''), self.location.origin).searchParams.get('room') || null
  } catch {
    return null
  }
}

async function postCallPushToClients(clients, message) {
  for (const client of clients) {
    if (typeof client.postMessage === 'function') {
      try {
        client.postMessage(message)
      } catch {
        /* ignore */
      }
    }
  }
}

/** Deliver ringing invite into an open Edge tab (Realtime backup). */
async function deliverChatCallInviteInApp(clients, content) {
  const roomId = parseRoomIdFromPushUrl(content.url)
  await postCallPushToClients(clients, {
    type: 'chat-call-invite-inapp',
    chatCallId: content.chatCallId || null,
    roomId,
    eventType: content.eventType || null,
    url: content.url,
    title: content.title,
    body: content.body,
  })
}

/** Deliver missed-call into an open Edge tab → Call back prompt (do not silent-drop). */
async function deliverChatCallMissedInApp(clients, content) {
  const roomId = parseRoomIdFromPushUrl(content.url)
  await postCallPushToClients(clients, {
    type: 'chat-call-missed-inapp',
    chatCallId: content.chatCallId || null,
    roomId,
    eventType: 'chat_call_missed',
    url: content.url,
    title: content.title,
    body: content.body,
  })
}

const APP_VISIBLE_CACHE = 'edge-app-visibility-v1'
const APP_VISIBLE_URL = '/__edge_app_visible__'
const APP_VISIBLE_MAX_AGE_MS = 45_000

/** Page writes this Cache while document.visibilityState === 'visible' (see edgeAppVisibilityBeacon.js). */
async function appVisibilityBeaconSaysVisible() {
  try {
    const cache = await caches.open(APP_VISIBLE_CACHE)
    const res = await cache.match(new Request(APP_VISIBLE_URL))
    if (!res) return false
    const data = await res.json()
    if (!data?.visible) return false
    const at = Number(data.at || 0)
    if (!at || Date.now() - at > APP_VISIBLE_MAX_AGE_MS) return false
    return true
  } catch {
    return false
  }
}

/**
 * Suppress OS call banner only when Edge is actually visible.
 * 1) Shared Cache beacon (reliable on iPhone PWA)
 * 2) WindowClient.visibilityState when exposed
 * 3) MessageChannel probe fallback
 */
async function pageIsVisiblyHandlingCalls(clients) {
  if (await appVisibilityBeaconSaysVisible()) return true
  if (clients.some((client) => client.visibilityState === 'visible')) return true

  const candidates = clients.filter((client) => typeof client.postMessage === 'function')
  if (candidates.length === 0) return false

  const probes = candidates.map(
    (client) =>
      new Promise((resolve) => {
        let settled = false
        const finish = (value) => {
          if (settled) return
          settled = true
          resolve(Boolean(value))
        }
        const timer = setTimeout(() => finish(false), 800)
        try {
          const channel = new MessageChannel()
          channel.port1.onmessage = (event) => {
            clearTimeout(timer)
            finish(Boolean(event?.data?.suppressCallPush))
          }
          client.postMessage({ type: 'chat-call-push-probe' }, [channel.port2])
        } catch {
          clearTimeout(timer)
          finish(false)
        }
      }),
  )

  const results = await Promise.all(probes)
  return results.some(Boolean)
}

self.addEventListener('push', (event) => {
  let payload = {}
  try {
    payload = event.data ? event.data.json() : {}
  } catch {
    payload = { body: event.data ? event.data.text() : '' }
  }

  const content = buildPushNotificationContent(payload)
  const loungeActivity = isLoungeActivityPushPayload(payload)
  const chatCallPush = isChatCallPushPayload(payload, content.url)
  const chatCallMissed = content.eventType === 'chat_call_missed'

  event.waitUntil(
    (async () => {
      const clients = await self.clients.matchAll({
        type: 'window',
        includeUncontrolled: true,
      })
      const hasFocusedClient = clients.some((client) => client.focused)

      // Call pushes: suppress OS only when a page is actually visible.
      // Never trust client.focused alone on iPhone PWA (silent drop regression).
      if (chatCallPush) {
        const suppressOs = await pageIsVisiblyHandlingCalls(clients)
        if (suppressOs) {
          // Must hand the event to the open tab... never drop. Invite → ring overlay;
          // missed → Call back prompt (same payloads as notificationclick).
          if (chatCallMissed) {
            await deliverChatCallMissedInApp(clients, content)
          } else if (content.eventType === 'chat_call_invite' || content.chatCallId) {
            await deliverChatCallInviteInApp(clients, content)
          }
          return
        }
      } else if (loungeActivity && hasFocusedClient) {
        await deliverLoungeActivityInApp(clients, content)
        return
      }

      const callTag = content.chatCallId
        ? `chat-call-${content.chatCallId}`
        : chatCallPush
          ? 'chat-call-invite'
          : undefined

      await self.registration.showNotification(content.title, {
        body: content.body,
        icon: content.icon,
        badge: content.badge,
        tag: callTag,
        // Same tag as invite → Android replaces "is calling you" with missed.
        renotify: Boolean(chatCallPush),
        // Sticky only while ringing; missed can be dismissed normally.
        requireInteraction: Boolean(chatCallPush) && !chatCallMissed,
        data: {
          url: content.url,
          activityEventId: content.activityEventId,
          activityBatchId: content.activityBatchId,
          eventType: content.eventType,
          chatCallId: content.chatCallId,
        },
      })
    })(),
  )
})

function parseAppNavigateMessage(relativeUrl, extra = {}) {
  const fullUrl = new URL(relativeUrl, self.location.origin).href
  const params = new URL(fullUrl).searchParams
  const tab = params.get('tab') || 'home'
  const activityEventId =
    extra.activityEventId || params.get('activityEvent') || null
  const activityBatchId =
    extra.activityBatchId || params.get('activityBatch') || null
  const eventType = extra.eventType || null
  const chatCallId = extra.chatCallId || null
  const missedCallId =
    params.get('missedCall') ||
    (eventType === 'chat_call_missed' ? chatCallId || null : null)
  // Invite taps must keep callId even when URL was truncated to room-only.
  const callId =
    params.get('call') ||
    (!missedCallId && chatCallId ? chatCallId : null) ||
    (eventType === 'chat_call_invite' && chatCallId ? chatCallId : null)
  const roomId = params.get('room') || null
  return {
    type: 'app-navigate',
    url: relativeUrl,
    tab,
    activityEventId,
    activityBatchId,
    callId,
    missedCallId,
    roomId,
    eventType,
    chatCallId,
    markActivityRead: Boolean(activityEventId || activityBatchId),
  }
}

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const data = event.notification?.data || {}
  const relative = typeof data.url === 'string' ? data.url : '/?tab=home'
  const fullUrl = new URL(relative, self.location.origin).href
  const navigateMessage = parseAppNavigateMessage(relative, {
    activityEventId: data.activityEventId,
    activityBatchId: data.activityBatchId,
    chatCallId: data.chatCallId,
    eventType: data.eventType,
  })
  const skipNavigateAfterPostMessage =
    data.eventType === 'chat_call_invite' ||
    data.eventType === 'chat_call_missed' ||
    Boolean(navigateMessage.callId) ||
    Boolean(navigateMessage.missedCallId)

  event.waitUntil(
    (async () => {
      // Write before focus/openWindow... iOS often drops postMessage on wake.
      await stashPendingAppNavigate(navigateMessage)

      const inviteCallId = String(navigateMessage.callId || navigateMessage.chatCallId || '').trim()
      const missedId = String(navigateMessage.missedCallId || '').trim()
      const roomId = String(navigateMessage.roomId || '').trim() || null

      const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      for (const client of clients) {
        if (!('focus' in client)) continue
        try {
          await client.focus()
          if (typeof client.postMessage === 'function') {
            client.postMessage(navigateMessage)
            // Same ring/callback path as visible-tab push delivery. app-navigate alone
            // can open the DM while the deep-link accept effect loses a wake race.
            if (inviteCallId && data.eventType !== 'chat_call_missed' && !missedId) {
              client.postMessage({
                type: 'chat-call-invite-inapp',
                chatCallId: inviteCallId,
                roomId,
                eventType: 'chat_call_invite',
                url: relative,
              })
            } else if (missedId || data.eventType === 'chat_call_missed') {
              client.postMessage({
                type: 'chat-call-missed-inapp',
                chatCallId: missedId || inviteCallId || null,
                roomId,
                eventType: 'chat_call_missed',
                url: relative,
              })
            }
          }
          // Call invite + missed callback: do NOT client.navigate after postMessage.
          // On iOS/Android PWA that reload wipes React state (DM opens, prompt never shows).
          if (skipNavigateAfterPostMessage) return
          if ('navigate' in client && typeof client.navigate === 'function') {
            try {
              await client.navigate(fullUrl)
              return
            } catch {
              // If navigation fails on a focused client, keep trying other clients/openWindow.
            }
          }
          return
        } catch {
          continue
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow(fullUrl)
      }
      return undefined
    })(),
  )
})
