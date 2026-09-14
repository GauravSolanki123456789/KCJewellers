/* Exhibition / sudden outage — keep the last ERP pages + JS so Scan & bill still opens. */
const CACHE = 'kc-erp-shell-v1'

self.addEventListener('install', (event) => {
  self.skipWaiting()
  event.waitUntil(caches.open(CACHE))
})

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim())
})

self.addEventListener('fetch', (event) => {
  const req = event.request
  if (req.method !== 'GET') return
  let url
  try {
    url = new URL(req.url)
  } catch {
    return
  }
  if (url.origin !== self.location.origin) return
  if (url.pathname.startsWith('/api/')) return

  const cacheable =
    url.pathname.startsWith('/reseller/erp') ||
    url.pathname.startsWith('/_next/') ||
    url.pathname.startsWith('/pdf-viewer') ||
    url.pathname === '/erp-offline-sw.js'

  if (!cacheable) return

  event.respondWith(
    fetch(req)
      .then((res) => {
        if (res && res.ok) {
          const copy = res.clone()
          caches.open(CACHE).then((cache) => cache.put(req, copy)).catch(() => {})
        }
        return res
      })
      .catch(async () => {
        const hit = await caches.match(req)
        if (hit) return hit
        if (url.pathname.startsWith('/reseller/erp')) {
          return (
            (await caches.match('/reseller/erp')) ||
            (await caches.match('/reseller/erp/billing')) ||
            new Response('Offline. Open Exhibition / offline after Wi-Fi returns.', {
              status: 503,
              headers: { 'Content-Type': 'text/plain; charset=utf-8' },
            })
          )
        }
        return new Response('Offline', { status: 503 })
      }),
  )
})
