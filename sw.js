/* MedNama Service Worker — caches core assets for offline use */
const CACHE = 'mednama-v1';
const ASSETS = [
  './',
  './main.html',
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
    caches.open(CACHE).then(cache => cache.addAll(ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
  );
  event.waitUntil(self.clients.claim());
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

  // Cache-first for app assets
  event.respondWith(
    caches.match(request).then(cached => cached || fetch(request).catch(() => new Response('Offline', { status: 503 })))
  );
});
