// D'lat Cafe Workforce Service Worker
const CACHE_NAME = "dlat-cafe-static-v2";
const PRECACHE_URLS = [
  "/offline",
  "/manifest.json",
  "/icons/icon.svg",
  "/icons/icon-192x192.png",
  "/icons/icon-512x512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((cacheNames) =>
        Promise.all(
          cacheNames
            .filter((name) => name !== CACHE_NAME)
            .map((name) => caches.delete(name)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") {
    return;
  }

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) {
    return;
  }

  // Never intercept API calls or Next.js RSC / Router prefetch payloads
  if (
    url.pathname.startsWith("/api/") ||
    url.searchParams.has("_rsc") ||
    request.headers.get("RSC") === "1" ||
    request.headers.get("Next-Router-Prefetch") === "1"
  ) {
    return;
  }

  // Static assets: Cache-first with background refresh
  const isStaticAsset =
    url.pathname.startsWith("/_next/static/") ||
    url.pathname.startsWith("/icons/") ||
    url.pathname === "/manifest.json";

  if (isStaticAsset) {
    event.respondWith(
      caches.open(CACHE_NAME).then(async (cache) => {
        const cached = await cache.match(request);
        const networkPromise = fetch(request)
          .then((response) => {
            if (response && response.status === 200) {
              cache.put(request, response.clone());
            }
            return response;
          })
          .catch(() => null);

        if (cached) {
          return cached;
        }
        const networkResponse = await networkPromise;
        if (networkResponse) {
          return networkResponse;
        }
        return new Response("Offline static asset unavailable", { status: 503 });
      }),
    );
    return;
  }

  // HTML navigation requests: Network-first with /offline fallback
  if (request.mode === "navigate") {
    event.respondWith(
      (async () => {
        try {
          const networkResponse = await fetch(request);
          if (url.pathname === "/offline" && networkResponse.status === 200) {
            const cache = await caches.open(CACHE_NAME);
            cache.put("/offline", networkResponse.clone());
          }
          return networkResponse;
        } catch {
          if (url.pathname !== "/offline") {
            return Response.redirect(
              new URL("/offline", self.location.origin).href,
              302,
            );
          }
          const cache = await caches.open(CACHE_NAME);
          const offlineFallback = await cache.match("/offline");
          if (offlineFallback) {
            return offlineFallback;
          }
          return new Response(
            "<!doctype html><html lang='vi'><head><meta charset='utf-8'><meta name='viewport' content='width=device-width,initial-scale=1,viewport-fit=cover'><title>Ngoại tuyến</title></head><body><h1>Bạn đang ngoại tuyến (Offline)</h1><p>Vui lòng kiểm tra kết nối mạng.</p><a href='/login'>Về trang đăng nhập</a></body></html>",
            {
              status: 200,
              headers: { "Content-Type": "text/html; charset=utf-8" },
            },
          );
        }
      })(),
    );
  }
});
