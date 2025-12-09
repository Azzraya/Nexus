const CACHE_NAME = "nexus-dashboard-v1";
const urlsToCache = [
  "/dashboard",
  "/dashboard.css",
  "/dashboard.js",
  "/manifest.json",
];

// Install service worker
self.addEventListener("install", (event) => {
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
      // Cache hit - return response
      if (response) {
        return response;
      }

      return fetch(event.request).then((response) => {
        // Check if we received a valid response
        if (!response || response.status !== 200 || response.type !== "basic") {
          return response;
        }

        // Clone the response
        const responseToCache = response.clone();

        caches.open(CACHE_NAME).then((cache) => {
          cache.put(event.request, responseToCache);
        });

        return response;
      }).catch((error) => {
        // If fetch fails, just return the error silently
        console.log("Fetch failed for:", event.request.url);
        return new Response("Network error", { status: 408 });
      });
    })
  );
});

// Update service worker
self.addEventListener("activate", (event) => {
  const cacheWhitelist = [CACHE_NAME];
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheWhitelist.indexOf(cacheName) === -1) {
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
});
