// Robinsavages GM service worker: offline shell + push notifications.
const V = "rsv-2026-1";
const SHELL = ["./", "./manifest.webmanifest", "./icons/icon-192.png"];

self.addEventListener("install", e => {
  self.skipWaiting();
  e.waitUntil(caches.open(V).then(c => c.addAll(SHELL)).catch(() => {}));
});
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== V).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
// Network first for our own files, cache as the offline fallback. API calls are never cached here.
self.addEventListener("fetch", e => {
  const u = new URL(e.request.url);
  if (e.request.method !== "GET" || u.origin !== self.location.origin || u.pathname.includes("/api/")) return;
  e.respondWith(
    fetch(e.request).then(r => {
      if (r.ok) { const copy = r.clone(); caches.open(V).then(c => c.put(e.request, copy)).catch(() => {}); }
      return r;
    }).catch(() => caches.match(e.request, { ignoreSearch: true }).then(m => m || (e.request.mode === "navigate" ? caches.match("./") : undefined)))
  );
});
self.addEventListener("push", e => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch (_) { d = { title: "Robinsavages GM", body: e.data ? e.data.text() : "" }; }
  e.waitUntil(self.registration.showNotification(d.title || "Robinsavages GM", {
    body: d.body || "", tag: d.tag || undefined, renotify: !!d.tag,
    icon: "./icons/icon-192.png", badge: "./icons/icon-192.png", data: { url: d.url || "./" },
  }));
});
self.addEventListener("notificationclick", e => {
  e.notification.close();
  const url = new URL((e.notification.data && e.notification.data.url) || "./", self.location.href).href;
  e.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(list => {
    for (const c of list) { if ("focus" in c) { c.navigate && c.navigate(url).catch(() => {}); return c.focus(); } }
    return self.clients.openWindow(url);
  }));
});
