// Service Worker: macht ZEITSTURM nach dem ersten Besuch offline spielbar (lokale Partien).
// Eigene Dateien: „network-first“ (neue Versionen kommen sofort an, offline greift der Cache).
// Three.js/PeerJS vom CDN und Schriften: „cache-first“ (feste Versionen ändern sich nie).
const VERSION = 'zeitsturm-2.1.0';
const CORE = ['./', 'index.html', 'css/style.css', 'manifest.webmanifest', 'js/main.js', 'icons/icon-192.png', 'icons/icon-512.png'];
const CACHEABLE_HOSTS = ['cdn.jsdelivr.net', 'fonts.googleapis.com', 'fonts.gstatic.com'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(CORE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  const same = url.origin === self.location.origin;
  if (!same && !CACHEABLE_HOSTS.includes(url.hostname)) return;
  e.respondWith(caches.open(VERSION).then(async (cache) => {
    if (same) {
      try {
        const res = await fetch(req);
        if (res && res.ok) cache.put(req, res.clone());
        return res;
      } catch (err) {
        const cached = await cache.match(req, { ignoreSearch: url.pathname.endsWith('/') });
        if (cached) return cached;
        throw err;
      }
    }
    const cached = await cache.match(req);
    if (cached) return cached;
    const res = await fetch(req);
    if (res && (res.ok || res.type === 'opaque')) cache.put(req, res.clone());
    return res;
  }));
});
