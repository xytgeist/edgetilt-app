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

  const title = payload.title || 'LVSlotPro Reminder'
  let body = payload.body || 'You have an upcoming event.'
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
    icon: payload.icon || '/android-chrome-192x192.png',
    badge: payload.badge || '/favicon-32x32.png',
    data: {
      url: payload.url || '/?tab=offers&offersView=agenda',
    },
  }

  event.waitUntil(self.registration.showNotification(title, options))
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const relative = typeof event.notification?.data?.url === 'string' ? event.notification.data.url : '/?tab=offers&offersView=agenda'
  const url = new URL(relative, self.location.origin)
  if (url.searchParams.get('tab') === 'offers' && !url.searchParams.get('offersView')) {
    url.searchParams.set('offersView', 'agenda')
  }
  const fullUrl = url.href
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(async (clients) => {
      for (const client of clients) {
        if (!('focus' in client)) continue
        try {
          await client.focus()
          if ('navigate' in client && typeof client.navigate === 'function') {
            try {
              await client.navigate(fullUrl)
              return
            } catch {
              // If navigation fails on a focused client, keep trying other clients/openWindow.
            }
          }
        } catch {
          continue
        }
      }
      if (self.clients.openWindow) return self.clients.openWindow(fullUrl)
      return undefined
    })
  )
})
