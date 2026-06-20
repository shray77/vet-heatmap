/**
 * Service Worker for ВетКарта (VetHeatmap) PWA.
 *
 * Strategy:
 *   - Precache: app shell (HTML, CSS, JS bundles), data JSONs, manifest, icons.
 *   - Runtime: stale-while-revalidate for same-origin GET requests.
 *   - Cache-only for map tiles (with fallback to network if missing).
 *
 * The worker is intentionally simple — no Workbox / Serwist dependency.
 * Works on GitHub Pages (basePath /vet-heatmap/).
 *
 * CACHE_VERSION is bumped on every code change that affects caching logic.
 * This forces all clients to invalidate their old cache + activate new SW.
 */

const CACHE_VERSION = "v6.0.0"; // pulse-outbreak CSS fix — force refresh
const CACHE_NAME = `vetkart-${CACHE_VERSION}`;
const BASE = "/vet-heatmap"; // GitHub Pages subpath

// Resources to precache on install. The list is built at build-time below.
const PRECACHE_URLS = [
  `${BASE}/`,
  `${BASE}/manifest.webmanifest`,
  `${BASE}/data/outbreaks.json`,
  `${BASE}/data/russia_regions.geojson`,
  `${BASE}/icons/icon-192.png`,
  `${BASE}/icons/icon-512.png`,
  // Note: Next.js JS/CSS bundles are hashed and unknown at SW authoring time.
  // We cache them on first fetch via the runtime strategy below.
];

// Map tile hosts — cache aggressively for offline field use
const TILE_HOSTS = [
  "basemaps.cartocdn.com",
  "server.arcgisonline.com",
  "tile.openstreetmap.org",
];

// ─── Install: precache static assets ──────────────────────────────────
self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      try {
        await cache.addAll(PRECACHE_URLS);
      } catch (e) {
        // Some precache URLs may 404 in dev — ignore
        console.warn("[sw] precache partial failure:", e.message);
      }
      // Force the new SW to take over immediately (no waiting for old SW
      // to be released). Combined with `clients.claim()` in activate, this
      // means new code applies on next page load.
      await self.skipWaiting();
    })(),
  );
});

// ─── Activate: clean up old caches + claim clients ────────────────────
self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)),
      );
      // Take control of all clients immediately — new SW applies on next load
      await self.clients.claim();
      // Notify all open clients to reload (optional, but ensures fresh state)
      const clients = await self.clients.matchAll({ type: "window" });
      for (const c of clients) {
        c.postMessage({ type: "SW_ACTIVATED", version: CACHE_VERSION });
      }
    })(),
  );
});

// ─── Fetch: stale-while-revalidate + tile caching ─────────────────────
self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);

  // Only handle same-origin + known tile hosts
  const isSameOrigin = url.origin === self.location.origin;
  const isTileHost = TILE_HOSTS.some((h) => url.hostname.includes(h));

  if (!isSameOrigin && !isTileHost) return;

  // Skip Next.js HMR / dev-only requests
  if (url.pathname.includes("/_next/webpack-hmr")) return;

  // Strategy: stale-while-revalidate
  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      const cached = await cache.match(req);

      // For tile hosts, prefer cache (offline-friendly)
      if (isTileHost) {
        if (cached) return cached;
        try {
          const fresh = await fetch(req);
          if (fresh.ok) cache.put(req, fresh.clone());
          return fresh;
        } catch (e) {
          return cached || new Response("", { status: 504 });
        }
      }

      // For same-origin: SWR
      const networkPromise = fetch(req)
        .then((fresh) => {
          if (fresh && fresh.ok && fresh.type === "basic") {
            cache.put(req, fresh.clone());
          }
          return fresh;
        })
        .catch(() => null);

      if (cached) {
        // Refresh in background, return cache immediately
        event.waitUntil(networkPromise);
        return cached;
      }

      // Not cached — must wait for network
      const fresh = await networkPromise;
      if (fresh) return fresh;

      // Offline + not cached — try to serve the cached app shell for navigation requests
      if (req.mode === "navigate") {
        const shell = await cache.match(`${BASE}/`);
        if (shell) return shell;
      }

      return new Response("Offline and not cached", { status: 504 });
    })(),
  );
});

// ─── Message handler: skipWaiting on demand ───────────────────────────
self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") self.skipWaiting();
});
