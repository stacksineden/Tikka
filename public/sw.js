// Tikka's service worker: only new lead alerts (web push). It caches nothing, so the dashboard
// always loads fresh. A push carries {title, body, tag, url}; a tap opens (or focuses) that page.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: "Tikka", body: event.data ? event.data.text() : "" };
  }
  const title = data.title || "New lead";
  event.waitUntil(
    self.registration.showNotification(title, {
      body: data.body || "",
      // The same tag replaces the last alert for this drop, so a burst is one notification.
      tag: data.tag || "lead",
      renotify: true,
      icon: "/brand/tikka-app-icon-192.png",
      data: { url: data.url || "/app/leads" },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = new URL((event.notification.data && event.notification.data.url) || "/app/leads", self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((tabs) => {
      for (const tab of tabs) {
        if (tab.url.startsWith(self.location.origin) && "focus" in tab) {
          return tab.navigate(url).then((t) => (t || tab).focus());
        }
      }
      return self.clients.openWindow(url);
    }),
  );
});
