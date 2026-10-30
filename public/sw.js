// Service worker Sove (D-118): obaveštenja na telefonu i otvaranje prave strane na dodir.
// Ne kešira strane: aplikacija uvek radi sa servera, a instalacija ne traži rad bez mreže.
self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()))

self.addEventListener('push', (event) => {
  let data = {}
  try {
    data = event.data ? event.data.json() : {}
  } catch {
    data = { title: 'Sova', body: event.data ? event.data.text() : '' }
  }
  const title = data.title || 'Sova'
  event.waitUntil(
    self.registration.showNotification(title, {
      body: data.body || '',
      icon: '/icons/icon-192.png',
      badge: '/icons/badge-96.png',
      tag: data.tag || undefined,
      data: { url: data.url || '/app' },
    }),
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const target = new URL(
    (event.notification.data && event.notification.data.url) || '/app',
    self.location.origin,
  )
  // samo adrese Sove; otvoren prozor se preusmerava umesto da se otvara nov
  if (target.origin !== self.location.origin) return
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const client of list) {
        if ('focus' in client) {
          client.navigate(target.href)
          return client.focus()
        }
      }
      return self.clients.openWindow(target.href)
    }),
  )
})
