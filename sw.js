// ─── VERSION — À INCRÉMENTER À CHAQUE DÉPLOIEMENT ───────────
// Changer ce numéro force tous les appareils à vider leur cache
const VERSION = 'hbm-v7';

const SHELL = ['/index.html', '/manifest.json', '/icon-192.png', '/icon-512.png'];

// ── INSTALL ──────────────────────────────────────────────────
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(VERSION).then(cache => cache.addAll(SHELL))
  );
  self.skipWaiting();
});

// ── ACTIVATE : purger tous les anciens caches ─────────────────
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys.filter(k => k !== VERSION).map(k => {
          console.log('[SW] Suppression ancien cache :', k);
          return caches.delete(k);
        })
      )
    ).then(() => self.clients.claim())
  );
});

// ── FETCH : Network-First ─────────────────────────────────────
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);

  // Laisser passer Firebase, Google APIs, CDNs
  if (
    url.hostname.includes('firebase') ||
    url.hostname.includes('googleapis') ||
    url.hostname.includes('gstatic') ||
    url.hostname.includes('cloudflare') ||
    url.hostname.includes('fonts.g')
  ) return;

  // Network-first : réseau en priorité, cache en fallback offline
  e.respondWith(
    fetch(e.request)
      .then(response => {
        if (response && response.status === 200 && response.type === 'basic') {
          const clone = response.clone();
          caches.open(VERSION).then(cache => cache.put(e.request, clone));
        }
        return response;
      })
      .catch(() =>
        caches.match(e.request).then(cached => {
          if (cached) return cached;
          if (e.request.mode === 'navigate') return caches.match('/index.html');
        })
      )
  );
});

// ── MESSAGE : rechargement forcé depuis l'app ─────────────────
self.addEventListener('message', e => {
  if (e.data && e.data.type === 'SKIP_WAITING') self.skipWaiting();
});

// ── PUSH ──────────────────────────────────────────────────────
self.addEventListener('push', e => {
  const data = e.data ? e.data.json() : {};
  e.waitUntil(
    self.registration.showNotification(data.title || 'Maison HBM', {
      body: data.body || 'Nouveau message dans HBM Gestion',
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      vibrate: [100, 50, 100],
      data: { url: '/' }
    })
  );
});

self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil(clients.openWindow(e.notification.data.url || '/'));
});
