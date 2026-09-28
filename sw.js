// APEX OS Service Worker
// Bump APP_VERSION here (and the matching APP_VERSION constant in index.html)
// on every deploy. Because the browser only re-checks/installs this file when
// its BYTES change, a version bump is what makes an update detectable at all -
// this was the root cause of users being stuck on old JS (previously the cache
// name never changed, so a new install/activate cycle never fired).
const APP_VERSION = "1.1.0";
const CACHE_NAME = "apexos-cache-" + APP_VERSION;
const CORE_ASSETS = ["./", "./index.html", "./manifest.json", "./icon-192.png", "./icon-512.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(CORE_ASSETS)).catch(() => {})
  );
  // Intentionally NOT calling skipWaiting() here: the new worker waits until the
  // page (index.html) explicitly confirms via postMessage({type:"SKIP_WAITING"}),
  // which only happens when the user taps the in-app "update available" banner.
  // This guarantees we never yank the page out from under a user mid-action.
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

self.addEventListener("fetch", (event) => {
  var req = event.request;
  if (req.method !== "GET") return;
  // Never touch cross-origin traffic (Supabase auth/data, Edge Function, fonts).
  if (new URL(req.url).origin !== self.location.origin) return;

  var isAppShell = req.mode === "navigate" || req.url.indexOf("index.html") !== -1;
  if (isAppShell) {
    // Network-first for the app shell: always try to get the latest index.html
    // when online (so a new deploy shows up without a manual reinstall), and
    // fall back to the cached copy when offline so the app still opens.
    event.respondWith(
      fetch(req)
        .then((res) => {
          var copy = res.clone();
          caches.open(CACHE_NAME).then((cache) => (res.ok && cache.put("./index.html", copy))).catch(() => {});
          return res;
        })
        .catch(() => caches.match(req).then((cached) => cached || caches.match("./index.html")))
    );
    return;
  }

  // Cache-first for static assets (manifest, icons) - they change rarely, and a
  // CACHE_NAME bump on deploy still refreshes them.
  event.respondWith(
    caches.match(req).then((cached) => cached || fetch(req))
  );
});
