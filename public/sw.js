// Offline support: keep the app shell on the phone, and the last list of alerts.
const CACHE = "fw-v2.1.1";
const SHELL = ["./", "index.html", "css/app.css", "js/app.js", "js/api.js", "js/i18n.js", "js/voice.js", "js/research.js",
  "js/shared/areas.js", "js/shared/faq.js", "icon.svg", "manifest.webmanifest"];

self.addEventListener("install", (e) => e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting())));
self.addEventListener("activate", (e) => e.waitUntil(
  caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())));

self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.origin !== location.origin) return;
  if (url.pathname.startsWith("/api/")) return; // API: the app handles offline itself
  // App files: network first (so updates arrive), cache when offline.
  e.respondWith(fetch(e.request).then((r) => {
    const copy = r.clone();
    caches.open(CACHE).then((c) => c.put(e.request, copy));
    return r;
  }).catch(() => caches.match(e.request).then((r) => r || caches.match("index.html"))));
});
