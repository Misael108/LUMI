const CACHE = 'lumi-final-v3';
const APP_ASSETS = ['lumi_control_inteligente_esp32.html','style.css','manifest.webmanifest'];
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(APP_ASSETS)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key !== CACHE).map(key => caches.delete(key)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  // Nunca cachear APIs ni JavaScript: el frontend debe usar siempre la versión actual.
  if (url.pathname.startsWith('/api/') || url.pathname.endsWith('/script.js')) {
    event.respondWith(fetch(event.request, { cache: 'no-store' }));
    return;
  }
  event.respondWith(fetch(event.request).catch(() => caches.match(event.request)));
});
