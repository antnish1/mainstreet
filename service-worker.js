const CACHE_NAME = "mainstreet-business-v2";
const APP_SHELL = [
  "./",
  "./index.html",
  "./styles.css",
  "./styles-base.css",
  "./styles-invoice.css",
  "./styles-dialogs.css",
  "./app.js",
  "./app-state.js",
  "./app-utils.js",
  "./app-customer.js",
  "./app-invoice.js",
  "./app-transactions.js",
  "./app-report.js",
  "./menu-data.js",
  "./supabase-api.js",
  "./supabase-config.js",
  "./manifest.webmanifest",
  "./assets/mainstreet-logo.svg",
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))),
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== "GET" || url.hostname.endsWith("supabase.co")) return;
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        const copy = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
        return response;
      })
      .catch(() => caches.match(event.request).then((cached) => cached || caches.match("./index.html"))),
  );
});
