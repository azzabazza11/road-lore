const CACHE = 'road-lore-v1.2.0';
const ASSETS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './icon.svg',
  './icon-192.png',
  './icon-512.png'
];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(keys.map(key => key !== CACHE ? caches.delete(key) : null)))
  );
  self.clients.claim();
});

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;

  const isNav = event.request.mode === 'navigate' ||
    event.request.destination === 'document' ||
    url.pathname.endsWith('.html') ||
    url.pathname.endsWith('/');

  // Always try network first for HTML so fixes reach installed PWAs quickly.
  if (isNav) {
    event.respondWith(
      fetch(event.request).then(resp => {
        const copy = resp.clone();
        caches.open(CACHE).then(cache => cache.put(event.request, copy)).catch(() => {});
        return resp;
      }).catch(() => caches.match(event.request).then(c => c || caches.match('./index.html')))
    );
    return;
  }

  event.respondWith(
    caches.match(event.request).then(cached => cached || fetch(event.request).then(resp => {
      const copy = resp.clone();
      caches.open(CACHE).then(cache => cache.put(event.request, copy)).catch(() => {});
      return resp;
    }))
  );
});
