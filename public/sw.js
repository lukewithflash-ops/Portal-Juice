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
  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: "/icons/icon-192.png",
      data: { url: data.url },
    })
  );
});
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/lines";
  event.waitUntil(self.clients.openWindow(url));
});
