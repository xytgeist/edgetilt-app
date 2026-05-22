self.addEventListener('install', () => {
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim())
})

self.addEventListener('push', (event) => {
  let payload = {}
  try {
    payload = event.data ? event.data.json() : {}
  } catch {
    payload = { body: event.data ? event.data.text() : '' }
  }

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
  const options = {
    body,
    icon: payload.icon || '/android-icon-192x192.png',
    badge: payload.badge || '/favicon-32x32.png',
    data: {
      url: payload.url || '/?tab=home',
      activityEventId: payload.activityEventId || null,
      activityBatchId: payload.activityBatchId || null,
    },
  }

  event.waitUntil(self.registration.showNotification(title, options))
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
