// Minimal service worker: installability + an offline page. The app needs the server (and the
// GPU) for everything else, so it deliberately caches nothing but the fallback: no API calls,
// no Next.js assets (cached assets would break updates).
const CACHE = "bigos-offline-v3";
const OFFLINE_URL = "/offline.html";
const PRECACHE = [OFFLINE_URL, "/icons/icon-192.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(PRECACHE)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  if (event.request.mode === "navigate") {
    event.respondWith(fetch(event.request).catch(() => caches.match(OFFLINE_URL)));
    return;
  }
  // The offline page's own assets: network first, cache when offline.
  if (PRECACHE.includes(new URL(event.request.url).pathname)) {
    event.respondWith(fetch(event.request).catch(() => caches.match(event.request)));
  }
});
