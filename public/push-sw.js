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

self.addEventListener('push', (event) => {
  let payload = {}
  try {
    payload = event.data ? event.data.json() : {}
  } catch {
    payload = { body: event.data ? event.data.text() : '' }
  }

  const content = buildPushNotificationContent(payload)
  const loungeActivity = isLoungeActivityPushPayload(payload)

  event.waitUntil(
    (async () => {
      if (loungeActivity) {
        const clients = await self.clients.matchAll({
          type: 'window',
          includeUncontrolled: true,
        })
        const hasFocusedClient = clients.some((client) => client.focused)
        if (hasFocusedClient) {
          await deliverLoungeActivityInApp(clients, content)
          return
        }
      }

      await self.registration.showNotification(content.title, {
        body: content.body,
        icon: content.icon,
        badge: content.badge,
        data: {
          url: content.url,
          activityEventId: content.activityEventId,
          activityBatchId: content.activityBatchId,
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
  return {
    type: 'app-navigate',
    url: relativeUrl,
    tab,
    activityEventId,
    activityBatchId,
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
  })
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(async (clients) => {
      for (const client of clients) {
        if (!('focus' in client)) continue
        try {
          await client.focus()
          if (typeof client.postMessage === 'function') {
            client.postMessage(navigateMessage)
          }
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
    })
  )
})
