const CACHE_NAME = 'between-us-shell-v2.2';
const SHELL = ['./', './index.html', './styles.css', './app.js', './github-store.mjs', './date-utils.mjs', './v2-utils.mjs', './image-utils.mjs', './city-map.mjs', './manifest.webmanifest', './couple-mark.svg', './icons/icon-180.png', './icons/icon-192.png', './icons/icon-512.png'];
SHELL.push('./vendor/leaflet/leaflet.js', './vendor/leaflet/leaflet.css', './vendor/leaflet/LICENSE');
const ALLOWED = new Set(SHELL.map((path) => new URL(path, self.location.href).href));

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((key) => key.startsWith('between-us-shell-') && key !== CACHE_NAME).map((key) => caches.delete(key))))
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  // Cache only the public app shell. Tokens and private API responses are excluded.
  if (request.method !== 'GET' || !ALLOWED.has(request.url)) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);
    try {
      const response = await fetch(request);
      if (response.ok) await cache.put(request, response.clone());
      return response;
    } catch { return await cache.match(request) || Response.error(); }
  })());
});
