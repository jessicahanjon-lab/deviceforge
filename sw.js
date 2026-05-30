// DeviceForge Service Worker v2.0
const CACHE_VERSION = 'deviceforge-v2.0.0';
const STATIC_CACHE = `${CACHE_VERSION}-static`;
const DYNAMIC_CACHE = `${CACHE_VERSION}-dynamic`;

const STATIC_ASSETS = [
  './index.html',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/apple-touch-icon.png'
];

const CDN_ASSETS = [
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css',
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/webfonts/fa-solid-900.woff2',
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/webfonts/fa-regular-400.woff2'
];

// ── Install: Cache static shell
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(STATIC_CACHE)
      .then(cache => {
        console.log('[SW] Caching static shell');
        return Promise.allSettled([
          cache.addAll(STATIC_ASSETS),
          cache.addAll(CDN_ASSETS)
        ]);
      })
      .then(() => self.skipWaiting())
  );
});

// ── Activate: Clean old caches
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => {
      return Promise.all(
        keys.filter(key => key.startsWith('deviceforge-') && key !== STATIC_CACHE && key !== DYNAMIC_CACHE)
            .map(key => {
              console.log('[SW] Removing old cache:', key);
              return caches.delete(key);
            })
      );
    }).then(() => self.clients.claim())
  );
});

// ── Fetch: Network-first for API, Cache-first for assets
self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET and Chrome extensions
  if (request.method !== 'GET') return;
  if (url.protocol === 'chrome-extension:') return;

  // Anthropic API: network only, no cache
  if (url.hostname === 'api.anthropic.com') {
    event.respondWith(fetch(request));
    return;
  }

  // Google Fonts: stale-while-revalidate
  if (url.hostname.includes('fonts.')) {
    event.respondWith(staleWhileRevalidate(request, DYNAMIC_CACHE));
    return;
  }

  // CDN assets: cache-first
  if (url.hostname.includes('cdnjs.') || url.hostname.includes('cdn.')) {
    event.respondWith(cacheFirst(request, DYNAMIC_CACHE));
    return;
  }

  // App shell: stale-while-revalidate
  if (url.pathname.includes('index.html') || url.pathname === '/' || url.pathname.endsWith('/')) {
    event.respondWith(staleWhileRevalidate(request, STATIC_CACHE));
    return;
  }

  // Everything else: cache-first with network fallback
  event.respondWith(cacheFirst(request, STATIC_CACHE));
});

// ── Strategies ──────────────────────────────────

async function cacheFirst(request, cacheName) {
  const cached = await caches.match(request);
  if (cached) return cached;

  try {
    const response = await fetch(request);
    if (response && response.ok) {
      const cache = await caches.open(cacheName);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    return offlineFallback(request);
  }
}

async function staleWhileRevalidate(request, cacheName) {
  const cached = await caches.match(request);
  const fetchPromise = fetch(request).then(response => {
    if (response && response.ok) {
      caches.open(cacheName).then(cache => cache.put(request, response.clone()));
    }
    return response;
  }).catch(() => null);

  return cached || fetchPromise || offlineFallback(request);
}

async function offlineFallback(request) {
  if (request.destination === 'document') {
    const cached = await caches.match('./index.html');
    return cached || new Response('Offline', { headers: { 'Content-Type': 'text/plain' } });
  }
  return new Response('', { status: 408 });
}

// ── Background Sync (for future use)
self.addEventListener('sync', event => {
  if (event.tag === 'sync-setups') {
    console.log('[SW] Background sync: setups');
  }
});

// ── Push Notifications (future)
self.addEventListener('push', event => {
  const data = event.data?.json() || { title: 'DeviceForge', body: 'New theme available!' };
  event.waitUntil(
    self.registration.showNotification(data.title || 'DeviceForge', {
      body: data.body,
      icon: './icons/icon-192.png',
      badge: './icons/icon-192.png',
      vibrate: [100, 50, 100],
      data: { url: data.url || './' }
    })
  );
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil(
    clients.openWindow(event.notification.data?.url || './')
  );
});
