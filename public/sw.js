// Operator app push service worker.
// Deliberately does no caching (no offline layer), only push handling, so there
// is never any risk of serving stale app content.

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("push", (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch { data = {}; }
  const title = data.title || "Notification";
  const options = {
    body: data.body || "New job request",
    icon: "/icon-192.png",
    badge: "/badge-96.png",
    tag: data.tag || undefined,
    renotify: !!data.tag,
    data: { url: data.url || "/operator/today" },
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/operator/today";
  event.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const client of all) {
      if ("focus" in client) {
        try { await client.navigate(url); } catch { /* ignore */ }
        return client.focus();
      }
    }
    if (self.clients.openWindow) return self.clients.openWindow(url);
  })());
});
