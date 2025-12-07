// Service Worker for Nexus GitHub Pages
// Provides offline support and caching for better performance

const CACHE_NAME = "nexus-v1";
const STATIC_CACHE = "nexus-static-v1";
const API_CACHE = "nexus-api-v1";

// Assets to cache on install
const STATIC_ASSETS = [
  "/",
  "/index.html",
  "/styles.css",
  "/config.js",
  "/invite-tracker.js",
  "/docs.html",
  "/comparison.html",
  "/features.html",
  "/commands.html",
  "/faq.html",
  "/contact.html",
  "/privacy.html",
  "/terms.html",
];

// Install event - cache static assets
self.addEventListener("install", (event) => {
  console.log("[Service Worker] Installing...");
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) => {
      console.log("[Service Worker] Caching static assets");
      return cache.addAll(STATIC_ASSETS).catch((err) => {
        console.warn("[Service Worker] Failed to cache some assets:", err);
        // Don't fail installation if some assets fail
        return Promise.resolve();
      });
    })
  );
  // Force activation of new service worker immediately
  self.skipWaiting();
});

// Activate event - clean up old caches
self.addEventListener("activate", (event) => {
  console.log("[Service Worker] Activating...");
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => {
            // Delete old caches
            return (
              name !== STATIC_CACHE && name !== API_CACHE && name !== CACHE_NAME
            );
          })
          .map((name) => {
            console.log("[Service Worker] Deleting old cache:", name);
            return caches.delete(name);
          })
      );
    })
  );
  // Take control of all pages immediately
  self.clients.claim();
});

// Fetch event - serve from cache, fallback to network
self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip cross-origin requests (API calls, external resources)
  if (url.origin !== location.origin) {
    // For API calls, use network-first strategy
    if (url.pathname.startsWith("/api/")) {
      event.respondWith(networkFirstStrategy(request, API_CACHE));
    }
    return; // Let browser handle other cross-origin requests
  }

  // Static assets - cache first strategy
  if (
    request.destination === "style" ||
    request.destination === "script" ||
    request.destination === "image" ||
    request.destination === "font" ||
    url.pathname.endsWith(".css") ||
    url.pathname.endsWith(".js") ||
    url.pathname.endsWith(".png") ||
    url.pathname.endsWith(".jpg") ||
    url.pathname.endsWith(".svg") ||
    url.pathname.endsWith(".woff") ||
    url.pathname.endsWith(".woff2")
  ) {
    event.respondWith(cacheFirstStrategy(request, STATIC_CACHE));
    return;
  }

  // HTML pages - network first, fallback to cache
  if (request.destination === "document" || url.pathname.endsWith(".html")) {
    event.respondWith(networkFirstStrategy(request, STATIC_CACHE));
    return;
  }

  // Default: try network, fallback to cache
  event.respondWith(networkFirstStrategy(request, CACHE_NAME));
});

// Cache First Strategy - good for static assets
async function cacheFirstStrategy(request, cacheName) {
  try {
    const cachedResponse = await caches.match(request);
    if (cachedResponse) {
      return cachedResponse;
    }

    const networkResponse = await fetch(request);
    if (networkResponse.ok) {
      const cache = await caches.open(cacheName);
      cache.put(request, networkResponse.clone());
    }
    return networkResponse;
  } catch (error) {
    console.error("[Service Worker] Cache first failed:", error);
    // Return offline page if available
    const offlinePage = await caches.match("/index.html");
    return offlinePage || new Response("Offline", { status: 503 });
  }
}

// Network First Strategy - good for dynamic content
async function networkFirstStrategy(request, cacheName) {
  try {
    const networkResponse = await fetch(request);
    if (networkResponse.ok) {
      const cache = await caches.open(cacheName);
      cache.put(request, networkResponse.clone());
    }
    return networkResponse;
  } catch (error) {
    console.warn("[Service Worker] Network failed, trying cache:", error);
    const cachedResponse = await caches.match(request);
    if (cachedResponse) {
      return cachedResponse;
    }

    // For API calls, return a helpful offline response
    if (request.url.includes("/api/")) {
      return new Response(
        JSON.stringify({
          error: "offline",
          message: "You are offline. Please check your connection.",
        }),
        {
          status: 503,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    // For HTML pages, return cached index.html
    const offlinePage = await caches.match("/index.html");
    return offlinePage || new Response("Offline", { status: 503 });
  }
}

// Background sync for offline actions (optional - for future use)
self.addEventListener("sync", (event) => {
  if (event.tag === "background-sync") {
    console.log("[Service Worker] Background sync triggered");
    event.waitUntil(doBackgroundSync());
  }
});

async function doBackgroundSync() {
  // Placeholder for future offline action sync
  console.log("[Service Worker] Performing background sync...");
}

// Message handler for cache management
self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") {
    self.skipWaiting();
  }

  if (event.data && event.data.type === "CLEAR_CACHE") {
    event.waitUntil(
      caches.keys().then((cacheNames) => {
        return Promise.all(cacheNames.map((name) => caches.delete(name)));
      })
    );
  }
});
