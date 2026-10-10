/* Install + push only. Does not cache pages. */
self.addEventListener("install", (event) => {
  event.waitUntil(self.skipWaiting());
});
self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});
self.addEventListener("fetch", () => {});
self.addEventListener("push", (event) => {
  let data = { title: "Portal Juice", body: "Your prop moved.", url: "/lines" };
  try {
    data = Object.assign(data, event.data ? event.data.json() : {});
  } catch {
    // keep the default text
  }
  const opts = {
    body: data.body,
    icon: data.icon || "/icons/icon-192.png",
    badge: data.badge || "/icons/badge-96.png",
    tag: data.tag || undefined,
    renotify: Boolean(data.tag && data.renotify),
    vibrate: data.silent ? [] : Array.isArray(data.vibrate) ? data.vibrate : [60],
    silent: Boolean(data.silent),
    timestamp: Date.now(),
    data: { url: data.url, game: data.game || null },
  };
  if (data.image) opts.image = data.image;
  if (Array.isArray(data.actions) && "maxActions" in Notification) opts.actions = data.actions.slice(0, Notification.maxActions || 2);
  // App icon badge: how many of your picks are live right now.
  if (typeof data.count === "number" && self.navigator && "setAppBadge" in self.navigator) {
    (data.count > 0 ? self.navigator.setAppBadge(data.count) : self.navigator.clearAppBadge()).catch(() => {});
  }
  event.waitUntil(
    self.registration.showNotification(data.title, opts).then(() =>
      data.silent ? null :
      // Tell open tabs so they can show a matching in-app toast.
      self.clients.matchAll({ type: "window" }).then((list) => list.forEach((c) => c.postMessage({ type: "pj-push", title: data.title, body: data.body, url: data.url })))
    )
  );
});
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const d = event.notification.data || {};
  if (event.action === "mute" && d.game) {
    event.waitUntil(
      self.registration.pushManager.getSubscription().then((sub) =>
        sub ? fetch("/api/push/mute", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ endpoint: sub.endpoint, game: d.game }) }).catch(() => {}) : null
      )
    );
    return;
  }
  const url = d.url || "/lines";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      for (const c of list) {
        if ("focus" in c) {
          c.navigate(url).catch(() => {});
          return c.focus();
        }
      }
      return self.clients.openWindow(url);
    })
  );
});
