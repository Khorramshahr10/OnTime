/**
 * Service worker that caches the globe's satellite tiles on disk.
 *
 * The earth surface (Esri World Imagery) and the moon texture are static, so
 * they are served cache-first: each tile is downloaded exactly once, then read
 * from CacheStorage on every later launch/zoom. Everything else — including the
 * app's own assets — passes through untouched.
 */

const CACHE_NAME = 'ontime-tiles-v1';
const STATIC_HOSTS = ['server.arcgisonline.com', 'threejs.org'];

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
  }
});
