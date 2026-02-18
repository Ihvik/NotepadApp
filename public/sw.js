const CACHE_NAME = 'yarishi-cache-v1';
const ASSETS_TO_CACHE = [
    '/',
    '/login',
    '/favicon.ico',
    '/manifest.json',
    '/icon-192.svg',
    '/icon-512.svg',
    '/icon.svg'
];
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            return cache.addAll(ASSETS_TO_CACHE);
        })
    );
    self.skipWaiting();
});
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames.map((cacheName) => {
                    if (cacheName !== CACHE_NAME) {
                        return caches.delete(cacheName);
                    }
                })
            );
        })
    );
    self.clients.claim();
});
self.addEventListener('fetch', (event) => {
    // We only want to handle GET requests
    if (event.request.method !== 'GET') return;
    // Avoid caching Supabase API calls or other external dynamic data
    if (event.request.url.includes('supabase.co')) {
        return;
    }
    event.respondWith(
        caches.match(event.request).then((response) => {
            // Return cached response if found
            if (response) {
                return response;
            }
            // Otherwise fetch from network
            return fetch(event.request).then((networkResponse) => {
                // Only cache valid successful responses for our own origin
                if (
                    !networkResponse ||
                    networkResponse.status !== 200 ||
                    networkResponse.type !== 'basic'
                ) {
                    return networkResponse;
                }
                const responseToCache = networkResponse.clone();
                caches.open(CACHE_NAME).then((cache) => {
                    cache.put(event.request, responseToCache);
                });
                return networkResponse;
            }).catch(() => {
                // If both fail, and it's a page navigation, we could return an offline page
                // For now, let the browser handle it
            });
        })
    );
});
