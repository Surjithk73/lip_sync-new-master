// Minimal Service Worker for WebXR support
const CACHE_NAME = 'vr-lip-sync-cache-v2';
const urlsToCache = [
  '/',
  '/index.html',
  '/src/main.js',
  '/src/modelLoader.js',
  '/src/vr-initializer.js',
  '/styles.css',
  '/assets/models/model_full.glb',
  '/assets/models/room.glb'
];

// WebXR required headers
const xrHeaders = {
  'Feature-Policy': 'xr-spatial-tracking *',
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Embedder-Policy': 'require-corp'
};

// Install event - cache basic files
self.addEventListener('install', (event) => {
  console.log('[ServiceWorker] Installing');
  
  // Skip waiting to activate immediately
  self.skipWaiting();
  
  // Cache core files
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[ServiceWorker] Caching app shell');
      return cache.addAll(urlsToCache);
    })
  );
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
  console.log('[ServiceWorker] Activating');
  
  event.waitUntil(
    // Remove old caches
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.filter((cacheName) => {
          return cacheName !== CACHE_NAME;
        }).map((cacheName) => {
          console.log('[ServiceWorker] Removing old cache', cacheName);
          return caches.delete(cacheName);
        })
      );
    }).then(() => {
      // Ensure this service worker takes control immediately
      return self.clients.claim();
    })
  );
});

// Simplified fetch handler with minimal processing
self.addEventListener('fetch', (event) => {
  // Don't handle non-GET requests
  if (event.request.method !== 'GET') return;
  
  // For navigation requests, serve the cached index.html if offline
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request).catch(() => {
        return caches.match('/index.html');
      })
    );
    return;
  }
  
  // For all other requests, try network first with cache fallback
  event.respondWith(
    fetch(event.request)
      .then(response => {
        // Only cache successful responses
        if (response && response.status === 200) {
          const responseToCache = response.clone();
          caches.open(CACHE_NAME).then(cache => {
            cache.put(event.request, responseToCache);
          });
        }
        return response;
      })
      .catch(() => {
        return caches.match(event.request);
      })
  );
});

// Handle WebXR requests specially
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'ENABLE_XR') {
    console.log('[ServiceWorker] Received request to enable XR mode');
    
    // Notify all clients that XR was requested
    self.clients.matchAll().then(clients => {
      clients.forEach(client => {
        client.postMessage({
          type: 'XR_REQUESTED',
          timestamp: new Date().getTime()
        });
      });
    });
  }
}); 