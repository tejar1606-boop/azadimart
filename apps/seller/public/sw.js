// AzadiMart Seller Hub service worker: shows browser-push alerts (new orders,
// ship-by reminders, cancellations) even when Seller Hub isn't open.
self.addEventListener("push", (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch { data = { title: "AzadiMart Seller Hub", body: event.data ? event.data.text() : "" }; }
  event.waitUntil(self.registration.showNotification(data.title || "AzadiMart Seller Hub", {
    body: data.body || "",
    tag: data.tag || undefined,
    icon: "/alert-icon.png",
    badge: "/alert-icon.png",
    data: { href: data.href || "/notices" },
  }));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const href = new URL(event.notification.data?.href || "/notices", self.location.origin).href;
  event.waitUntil((async () => {
    const tabs = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    const open = tabs.find((t) => new URL(t.url).origin === self.location.origin);
    if (open) { await open.focus(); return open.navigate(href); }
    return self.clients.openWindow(href);
  })());
});
