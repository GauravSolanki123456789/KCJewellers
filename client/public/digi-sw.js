/* DigiGold / DigiSilver PWA — cache the last storefront shell for flaky networks. */
const CACHE = 'kc-digi-shell-v1'

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
    url.pathname === '/digi' ||
    url.pathname.startsWith('/digi/') ||
    url.pathname.startsWith('/_next/') ||
    url.pathname === '/digi-sw.js' ||
    url.pathname === '/digi-manifest.webmanifest' ||
    url.pathname === '/favicon.png' ||
    url.pathname === '/favicon.ico'

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
        if (url.pathname === '/digi' || url.pathname.startsWith('/digi/')) {
          return (
            (await caches.match('/digi')) ||
            (await caches.match('/digi/gold')) ||
            (await caches.match('/digi/silver')) ||
            new Response('Offline. Reconnect to buy DigiGold / DigiSilver.', {
              status: 503,
              headers: { 'Content-Type': 'text/plain; charset=utf-8' },
            })
          )
        }
        return new Response('Offline', { status: 503 })
      }),
  )
})
