/* Service Worker – Hochsitze (JG Thuine)
 * Bei jeder Änderung an App-Dateien VERSION erhöhen → Hinweis „Neue Version“.
 * Kartenkacheln werden beim Ansehen zwischengespeichert (offline im Revier nutzbar).
 */
importScripts('config.js');
const PRE = (self.JAGD_CFG || {}).lsPrefix || '';   // Test-Umgebung: eigene Cache-Namen
const VERSION = PRE + 'hs-1.12.8';
const TILES = 'hs-tiles-v1';
const TILE_MAX = 3000;
const SHELL = ['./', 'index.html', 'style.css', 'app.js', 'config.js', 'konto.js', 'manifest.webmanifest',
  'icons/logo.png', 'icons/icon-180.png', 'icons/icon-192.png', 'icons/icon-512.png',
  'vendor/leaflet.js', 'vendor/leaflet.css', 'vendor/leaflet-rotate.js'];
const TILE_HOSTS = ['server.arcgisonline.com', 'tile.openstreetmap.org', 'sgx.geodatenzentrum.de'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(SHELL.map(u => new Request(u, { cache: 'reload' })))));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k.startsWith(PRE + 'hs-') && k !== VERSION && k !== TILES && k !== BADGE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});
self.addEventListener('message', e => {
  if (e.data === 'skipWaiting') self.skipWaiting();
  if (e.data === 'badge0') setBadge(0);
});

let trimT = null;
function trimTiles() {
  clearTimeout(trimT);
  trimT = setTimeout(async () => {
    const c = await caches.open(TILES); const keys = await c.keys();
    for (let i = 0; i < keys.length - TILE_MAX; i++) await c.delete(keys[i]);
  }, 5000);
}

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);
  if (TILE_HOSTS.includes(url.hostname)) {
    e.respondWith(caches.open(TILES).then(async c => {
      const hit = await c.match(e.request.url);
      if (hit) return hit;
      try {
        const r = await fetch(e.request);
        if (r.ok) { c.put(e.request.url, r.clone()); trimTiles(); }
        return r;
      } catch (err) { return hit || Response.error(); }
    }));
    return;
  }
  if (url.origin !== location.origin) return;           // GitHub-API nie cachen
  if (url.pathname.includes('/data/')) return;          // Daten & Fotos: App kümmert sich selbst
  e.respondWith(caches.match(e.request, { ignoreSearch: true }).then(hit => hit || fetch(e.request)));
});

const BADGE = PRE + 'hs-badge';
/* ---------- Push ---------- */
async function getBadge() { try { const r = await (await caches.open(BADGE)).match('n'); return r ? Number(await r.text()) || 0 : 0; } catch { return 0; } }
/* Zähler merken; die Zahl am Symbol setzt nur das Push-Ereignis (Löschen übernimmt die App beim Öffnen) */
async function setBadge(n) {
  try { await (await caches.open(BADGE)).put('n', new Response(String(n))); } catch { /* egal */ }
  try { if (n > 0 && 'setAppBadge' in self.navigator) await self.navigator.setAppBadge(n); } catch { /* egal */ }
}
self.addEventListener('push', e => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch { d = { body: e.data ? e.data.text() : '' }; }
  e.waitUntil((async () => {
    await setBadge((await getBadge()) + 1);
    await self.registration.showNotification(d.title || 'Hochsitze', {
      body: d.body || '', tag: d.tag || undefined, icon: 'icons/icon-192.png', badge: 'icons/icon-192.png',
      data: { url: d.url || self.registration.scope }, lang: 'de',
    });
  })());
});
self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const c = all.find(x => x.url.startsWith(self.registration.scope));
    if (c) return c.focus();
    return self.clients.openWindow(e.notification.data?.url || self.registration.scope);
  })());
});
