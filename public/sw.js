/**
 * Service worker that caches the globe's satellite/cloud tiles on disk.
 *
 * The earth surface (Esri World Imagery) and moon texture are static, so they
 * are served cache-first: each tile is downloaded exactly once, then read from
 * CacheStorage on every later launch/zoom. OpenWeatherMap cloud tiles update
 * roughly every two hours, so they use network-first with a cached fallback
 * (fresh clouds, but still available offline).
 *
 * Everything else — the app's own assets and the NASA GIBS fetch (which goes
 * through Capacitor's native HTTP, not fetch) — passes through untouched.
 */

const CACHE_NAME = 'ontime-tiles-v1';
const STATIC_HOSTS = ['server.arcgisonline.com', 'threejs.org'];
const FRESH_HOSTS = ['tile.openweathermap.org'];

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const hostname = new URL(request.url).hostname;

  if (STATIC_HOSTS.includes(hostname)) {
    // Cache-first — static imagery, download once, serve from disk forever.
    event.respondWith(
      caches.open(CACHE_NAME).then(async (cache) => {
        const hit = await cache.match(request);
        if (hit) return hit;
        const response = await fetch(request);
        if (response && response.ok) cache.put(request, response.clone());
        return response;
      })
    );
    return;
  }

  if (FRESH_HOSTS.includes(hostname)) {
    // Network-first with cache fallback — clouds refresh, but stay offline-capable.
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response && response.ok) {
            const copy = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
          }
          return response;
        })
        .catch(() => caches.match(request))
    );
  }
});
