const CACHE = 'papjoy-v10';
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/style.css',
  '/favicon.svg',
  '/offline.html',
  '/js/config.js',
  '/js/helpers.js',
  '/js/storage.js',
  '/js/i18n.js',
  '/js/api.js',
  '/js/auth.js',
  '/js/navigation.js',
  '/js/cart.js',
  '/js/wishlist.js',
  '/js/ui.js',
  '/js/products.js',
  '/js/tracking.js',
  '/js/checkout.js',
  '/js/admin.js',
  '/js/account.js',
  '/js/product-editor.js',
  '/js/main.js'
];

const PRECACHE_PAGES = [
  '/index.html',
  '/product.html',
  '/cart.html',
  '/signin.html',
  '/tracking.html',
  '/offline.html'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => {
      return cache.addAll(STATIC_ASSETS).catch(() => {});
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)));
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  if (url.origin !== self.location.origin) return;
  if (request.method !== 'GET') return;

  if (url.pathname.startsWith('/api/')) {
    event.respondWith(
      fetch(request).catch(() => {
        return new Response(JSON.stringify({ error: 'You are offline' }), {
          status: 503,
          headers: { 'Content-Type': 'application/json' }
        });
      })
    );
    return;
  }

  if (url.pathname.match(/\.(css|js|svg|png|jpg|jpeg|webp|woff2?)$/)) {
    event.respondWith(
      caches.match(request).then((cached) => {
        return cached || fetch(request).then((response) => {
          const clone = response.clone();
          caches.open(CACHE).then((cache) => cache.put(request, clone));
          return response;
        });
      })
    );
    return;
  }

  if (url.pathname.endsWith('.html') || url.pathname === '/') {
    event.respondWith(
      fetch(request).then((response) => {
        const clone = response.clone();
        caches.open(CACHE).then((cache) => cache.put(request, clone));
        return response;
      }).catch(() => {
        return caches.match(request).then((cached) => {
          return cached || caches.match('/offline.html');
        });
      })
    );
    return;
  }

  event.respondWith(
    caches.match(request).then((cached) => {
      return cached || fetch(request).catch(() => {
        if (request.headers.get('Accept').includes('text/html')) {
          return caches.match('/offline.html');
        }
        return new Response('', { status: 503 });
      });
    })
  );
});
