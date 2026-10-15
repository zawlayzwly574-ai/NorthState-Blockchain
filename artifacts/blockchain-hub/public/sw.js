self.addEventListener("push", event => {
  let payload = {};
  try { payload = event.data ? event.data.json() : {}; } catch { payload = { body: event.data?.text() || "" }; }
  const title = typeof payload.title === "string" ? payload.title : "North State Blockchain";
  const options = {
    body: typeof payload.body === "string" ? payload.body : "You have a new notification.",
    icon: "/favicon.ico",
    badge: "/favicon.ico",
    tag: typeof payload.tag === "string" ? payload.tag : "northstate-notification",
    data: { url: typeof payload.url === "string" ? payload.url : "/" },
    renotify: false,
  };
  event.waitUntil(self.registration.showNotification(title, options));
});
self.addEventListener("notificationclick", event => {
  event.notification.close();
  const path = event.notification.data?.url || "/";
  event.waitUntil((async () => {
    const target = new URL(path, self.location.origin).href;
    const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const client of windows) {
      if ("focus" in client && new URL(client.url).origin === self.location.origin) {
        if ("navigate" in client) await client.navigate(target);
        return client.focus();
      }
    }
    return self.clients.openWindow(target);
  })());
});
