/**
 * Offline support.
 *
 * The app shell is precached so the icon on your home screen opens instantly
 * with no network. Bump CACHE on every deploy — the old cache is dropped on
 * activate, and the page shows a "Reload" bar rather than swapping code out
 * mid-entry.
 */

/*
 * The deploy workflow rewrites __BUILD__ to the commit SHA, so every deploy
 * gets a fresh cache and the page offers a Reload. If that substitution never
 * happens (serving straight from a branch), the name stays "dev" — assets
 * still refresh, just one launch later, via the revalidate below.
 */
const BUILD = "__BUILD__";
const CACHE = "gtb-" + (BUILD.startsWith("__") ? "dev" : BUILD);
const FONTS = "gtb-fonts-v1";

const SHELL = [
  "./",
  "index.html",
  "manifest.webmanifest",
  "css/app.css",
  "js/app.js",
  "js/store.js",
  "js/model.js",
  "js/views.js",
  "js/sheets.js",
  "js/charts.js",
  "js/util.js",
  "js/version.js",
  "icons/icon-192.png",
  "icons/icon-512.png",
  "icons/apple-touch-icon.png",
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE && k !== FONTS).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("message", (e) => {
  if (e.data && e.data.type === "SKIP_WAITING") self.skipWaiting();
});

const isFont = (url) =>
  url.hostname === "fonts.googleapis.com" || url.hostname === "fonts.gstatic.com";

self.addEventListener("fetch", (e) => {
  if (e.request.method !== "GET") return;
  const url = new URL(e.request.url);

  // Google Fonts: cache on first success so later loads work offline.
  if (isFont(url)) {
    e.respondWith(
      caches.open(FONTS).then(async (cache) => {
        const hit = await cache.match(e.request);
        if (hit) return hit;
        try {
          const res = await fetch(e.request);
          if (res.ok) cache.put(e.request, res.clone());
          return res;
        } catch (err) {
          // No font is better than no page.
          return new Response("", { status: 504 });
        }
      })
    );
    return;
  }

  if (url.origin !== location.origin) return;

  // Navigations fall back to the cached shell so a refresh works offline.
  if (e.request.mode === "navigate") {
    e.respondWith(
      fetch(e.request).catch(() => caches.match("index.html", { ignoreSearch: true }))
    );
    return;
  }

  // Everything else: serve from cache, refresh it in the background.
  e.respondWith(
    caches.open(CACHE).then(async (cache) => {
      const hit = await cache.match(e.request, { ignoreSearch: true });
      const net = fetch(e.request)
        .then((res) => {
          if (res.ok) cache.put(e.request, res.clone());
          return res;
        })
        .catch(() => hit);
      return hit || net;
    })
  );
});
