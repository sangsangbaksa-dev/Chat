/// <reference lib="webworker" />
import { cleanupOutdatedCaches, precacheAndRoute, createHandlerBoundToURL } from 'workbox-precaching'
import { NavigationRoute, registerRoute } from 'workbox-routing'

declare const self: ServiceWorkerGlobalScope

precacheAndRoute(self.__WB_MANIFEST)
cleanupOutdatedCaches()
registerRoute(new NavigationRoute(createHandlerBoundToURL('/index.html'), { denylist: [/^\/api\//] }))

self.skipWaiting()
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()))

interface PushPayload {
  title?: string
  body?: string
  url?: string
  tag?: string
}

self.addEventListener('push', (event) => {
  let data: PushPayload = {}
  try {
    data = event.data?.json() ?? {}
  } catch {
    data = { body: event.data?.text() }
  }
  event.waitUntil(
    (async () => {
      // 앱이 화면에 떠 있으면 앱 안의 알림(토스트·배지)이 대신하므로 시스템 알림은 생략한다.
      const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      if (wins.some((c) => c.visibilityState === 'visible' && c.focused)) return
      await self.registration.showNotification(data.title ?? '왈도쳇', {
        body: data.body ?? '',
        icon: '/icon-192.png',
        badge: '/icon-192.png',
        tag: data.tag,
        data: { url: data.url ?? '/' },
      })
    })(),
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url: string = event.notification.data?.url ?? '/'
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(async (list) => {
      const c = list[0]
      if (c && 'focus' in c) {
        await c.focus()
        c.postMessage({ type: 'navigate', url })
        return
      }
      await self.clients.openWindow(url)
    }),
  )
})
