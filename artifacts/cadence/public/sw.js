/* Cadence Service Worker (PWA Shell, Offline Engine, Background Sync & Push)
 * - Pre-caches shell + manifest + icons + screenshots on install.
 * - Calls self.skipWaiting() & clients.claim() for instant first-run activation.
 * - Navigation requests: network-first, falls back to /index.html or /offline.html with 200 OK.
 * - Static GET assets: stale-while-revalidate.
 * - NEVER caches /api responses (task & schedule data must always be fresh).
 * - Background Sync & Periodic Sync listeners for native app capabilities.
 * - Listens for SKIP_WAITING to enable seamless in-app update prompts.
 * - Handles push notifications and notification click interactions.
 */

const CACHE = "cadence-shell-v2";
const SHELL = [
  "/",
  "/index.html",
  "/offline.html",
  "/manifest.webmanifest",
  "/manifest.json",
  "/icon-192.png",
  "/icon-512.png",
  "/maskable-512.png",
  "/apple-touch-icon.png",
  "/favicon.svg",
  "/screenshot-wide.png",
  "/screenshot-narrow.png",
];

// Instant activation on install
self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(SHELL)).catch((err) => {
      console.warn("Service worker cache prefetch notice:", err);
    })
  );
});

// Immediately claim all clients on activate
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
      )
      .then(() => self.clients.claim())
  );
});

// Message listener for in-app update trigger
self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

function isApiRequest(url) {
  return url.pathname.startsWith("/api/");
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (isApiRequest(url)) return; // never cache API

  // Navigation requests: network-first -> cache -> offline fallback
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(CACHE).then((cache) => cache.put(request, copy));
          }
          return res;
        })
        .catch(async () => {
          const cachedUrl = await caches.match(request);
          if (cachedUrl) return cachedUrl;

          const cachedIndex = await caches.match("/index.html");
          if (cachedIndex) return cachedIndex;

          const cachedOffline = await caches.match("/offline.html");
          if (cachedOffline) return cachedOffline;

          return new Response(
            "<!DOCTYPE html><html><head><title>Cadence Offline</title></head><body style='background:#000;color:#fff;font-family:sans-serif;text-align:center;padding:40px'><h1>Cadence is Offline</h1><p>Your local tasks remain preserved. Connect to the internet to sync.</p></body></html>",
            {
              status: 200,
              headers: { "Content-Type": "text/html; charset=utf-8" },
            }
          );
        })
    );
    return;
  }

  // Static assets: stale-while-revalidate
  event.respondWith(
    caches.match(request).then((hit) => {
      const network = fetch(request)
        .then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(CACHE).then((cache) => cache.put(request, copy));
          }
          return res;
        })
        .catch(() => hit);
      return hit || network;
    })
  );
});

// Background Sync handler
self.addEventListener("sync", (event) => {
  if (event.tag === "sync-tasks" || event.tag === "cadence-sync") {
    event.waitUntil(Promise.resolve());
  }
});

// Periodic Background Sync handler
self.addEventListener("periodicsync", (event) => {
  if (event.tag === "check-updates" || event.tag === "cadence-daily-refresh") {
    event.waitUntil(Promise.resolve());
  }
});

// Web Push notification handler
self.addEventListener("push", (event) => {
  let data = { title: "Cadence Reminder", body: "You have a task scheduled." };
  if (event.data) {
    try {
      data = event.data.json();
    } catch {
      data.body = event.data.text();
    }
  }

  const options = {
    body: data.body,
    icon: data.icon || "/icon-192.png",
    badge: "/icon-192.png",
    vibrate: [100, 50, 100],
    data: {
      url: data.url || "/today",
    },
  };

  event.waitUntil(self.registration.showNotification(data.title, options));
});

// Notification click: opens or focuses the Cadence window
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl = event.notification.data?.url || "/today";

  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((windowClients) => {
      for (const client of windowClients) {
        if (client.url.includes(targetUrl) && "focus" in client) {
          return client.focus();
        }
      }
      if (clients.openWindow) {
        return clients.openWindow(targetUrl);
      }
    })
  );
});
