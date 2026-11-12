// D'lat Cafe Workforce Service Worker
const CACHE_NAME = 'dlat-workforce-v2';

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((name) => caches.delete(name))
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Never intercept localhost or Next.js internal / RSC requests
  if (
    url.hostname === 'localhost' ||
    url.hostname === '127.0.0.1' ||
    url.pathname.startsWith('/api/') ||
    url.pathname.startsWith('/_next/') ||
    url.searchParams.has('_rsc') ||
    event.request.headers.get('RSC') === '1'
  ) {
    return;
  }

  // Pass through directly
  event.respondWith(fetch(event.request));
});
