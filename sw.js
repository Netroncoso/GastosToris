/* Service worker liviano: cachea estáticos de GitHub Pages.
   HTML/JS/CSS van network-first para no quedar con versiones viejas en el teléfono. */
const CACHE = 'torisapp-static-v34';
const PRECACHE = [
  './',
  './index.html',
  './circulo.html',
  './gastos.html',
  './listas.html',
  './tareas.html',
  './css/shared.css',
  './js/supabase-client.js',
  './js/auth.js',
  './js/utils.js',
  './js/gasto-form.js',
  './js/listas-plantillas.js',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(PRECACHE)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

function cacheResponse(req, res) {
  if (res && res.ok) {
    const clone = res.clone();
    caches.open(CACHE).then((cache) => cache.put(req, clone));
  }
  return res;
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  if (
    url.hostname.includes('supabase.co') ||
    url.hostname.includes('googleapis.com') ||
    url.hostname.includes('google.com')
  ) {
    return;
  }

  if (url.origin !== self.location.origin) return;

  const path = url.pathname;
  const isAppCode = /\.(html|js|css)$/.test(path) || path.endsWith('/');

  if (isAppCode) {
    event.respondWith(
      fetch(req)
        .then((res) => cacheResponse(req, res))
        .catch(() => caches.match(req))
    );
    return;
  }

  event.respondWith(
    caches.match(req).then((cached) => {
      if (cached) return cached;
      return fetch(req).then((res) => cacheResponse(req, res));
    })
  );
});
