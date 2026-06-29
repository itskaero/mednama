/* MedNama Service Worker — caches core assets for offline use */
const CACHE = 'mednama-v2';
const ASSETS = [
  './',
  './index.html',
  './css/theme.css',
  './js/manifest.js',
  './js/store.js',
  './js/ai.js',
  './js/ui.js',
  './js/app.js',
  './icon.svg',
  './manifest.json'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE).then(cache =>
      // addAll rejects entirely if any single asset fails; cache each
      // individually so one missing file doesn't abort the whole install.
      Promise.allSettled(ASSETS.map(a => cache.add(a)))
    ).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);

  // Only handle same-origin GET requests
  if (url.origin !== self.location.origin || request.method !== 'GET') return;

  // Network-first for downloaded_js data files (MCQ content)
  if (url.pathname.includes('/downloaded_js/')) {
    event.respondWith(
      fetch(request).catch(() => caches.match(request))
    );
    return;
  }

  // Network-first for navigations so users always get the latest index.html
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).then(res => {
        const copy = res.clone();
        caches.open(CACHE).then(c => c.put(request, copy)).catch(() => {});
        return res;
      }).catch(() => caches.match(request).then(c => c || caches.match('./index.html')))
    );
    return;
  }

  // Stale-while-revalidate for app assets (so code updates land promptly)
  event.respondWith(
    caches.match(request).then(cached => {
      const network = fetch(request).then(res => {
        const copy = res.clone();
        caches.open(CACHE).then(c => c.put(request, copy)).catch(() => {});
        return res;
      }).catch(() => cached);
      return cached || network;
    })
  );
});