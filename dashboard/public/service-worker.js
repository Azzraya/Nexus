const CACHE_NAME = "nexus-dashboard-v3";
// Don't cache HTML files - they change frequently and need fresh content
const urlsToCache = ["/dashboard.css", "/dashboard.js", "/manifest.json"];

// Install service worker
self.addEventListener("install", (event) => {
  // Force activation of new service worker immediately
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log("Opened cache");
      return cache.addAll(urlsToCache);
    })
  );
});

// Cache and return requests
self.addEventListener("fetch", (event) => {
  // Skip caching for chrome extensions, external CDNs, and Discord CDN
  const url = event.request.url;
  if (
    url.startsWith("chrome-extension://") ||
    url.includes("cdn.jsdelivr.net") ||
    url.includes("cdn.discordapp.com") ||
    url.includes("sessions.bugsnag.com")
  ) {
    return;
  }

  event.respondWith(
    caches.match(event.request).then((response) => {
      // Never cache HTML files - always fetch fresh
      const url = new URL(event.request.url);
      const isHTML =
        event.request.headers.get("accept")?.includes("text/html") ||
        url.pathname.endsWith(".html") ||
        url.pathname === "/" ||
        url.pathname === "/dashboard" ||
        url.pathname.match(/^\/\d+\/dashboard$/);

      if (isHTML) {
        // Always fetch fresh HTML, don't use cache
        return fetch(event.request)
          .then((response) => {
            return response;
          })
          .catch((error) => {
            // If fetch fails, try cache as fallback
            if (response) return response;
            console.log("Fetch failed for:", event.request.url);
            return new Response("Network error", { status: 408 });
          });
      }

      // Cache hit - return response for non-HTML files
      if (response) {
        return response;
      }

      return fetch(event.request)
        .then((response) => {
          // Check if we received a valid response
          // Don't cache POST, PUT, DELETE, PATCH requests (Cache API doesn't support them)
          if (
            !response ||
            response.status !== 200 ||
            response.type !== "basic" ||
            event.request.method !== "GET"
          ) {
            return response;
          }

          // Clone the response
          const responseToCache = response.clone();

          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseToCache);
          });

          return response;
        })
        .catch((error) => {
          // If fetch fails, just return the error silently
          console.log("Fetch failed for:", event.request.url);
          return new Response("Network error", { status: 408 });
        });
    })
  );
});

// Update service worker
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      // Delete ALL old caches to ensure fresh content
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            console.log("Deleting old cache:", cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
  // Take control of all pages immediately
  return self.clients.claim();
});
