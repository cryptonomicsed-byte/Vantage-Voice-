// Minimal service worker: exists mainly to satisfy PWA installability
// (Chrome/Android requires a registered SW with a fetch handler). Kept
// deliberately network-first/passthrough -- this app is a live audio
// websocket app, so aggressive caching would risk serving stale JS
// against a live session. Only the app shell is cached for a faster
// repeat cold-open; everything else always goes to the network.
const SHELL_CACHE = 'vantage-voice-shell-v1';
const SHELL_ASSETS = ['/', '/manifest.json'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE).then((cache) => cache.addAll(SHELL_ASSETS)).catch(() => {})
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== SHELL_CACHE).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  // Never intercept API/WebSocket traffic.
  if (url.pathname.startsWith('/api/')) return;

  event.respondWith(
    fetch(req)
      .then((res) => {
        if (res.ok && SHELL_ASSETS.includes(url.pathname)) {
          const clone = res.clone();
          caches.open(SHELL_CACHE).then((cache) => cache.put(req, clone));
        }
        return res;
      })
      .catch(() => caches.match(req).then((cached) => cached || Response.error()))
  );
});
