// Improved Service Worker for WebXR support with large file handling
const CACHE_NAME = 'vr-lip-sync-cache-v3';
const STATIC_CACHE = 'static-cache-v3';
const DYNAMIC_CACHE = 'dynamic-cache-v3';

// Core app shell files that must be cached for offline use
const coreAppFiles = [
  '/',
  '/index.html',
  '/src/styles.css'
];

// Files that should be cached but aren't critical
const secondaryFiles = [
  '/src/vr-initializer.js',
  '/src/modelLoader.js'
];

// Large files that should be handled separately (network-first approach)
const largeFiles = [
  '/assets/models/model_full.glb',
  '/assets/models/room.glb',
  '/assets/main-'  // Partial match for dynamically named chunks
];

// WebXR required headers
const xrHeaders = {
  'Feature-Policy': 'xr-spatial-tracking *',
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Embedder-Policy': 'require-corp'
};

// Check if a URL matches any of the large files patterns
function isLargeFile(url) {
  return largeFiles.some(pattern => url.includes(pattern));
}

// Install event - cache basic files
self.addEventListener('install', (event) => {
  console.log('[ServiceWorker] Installing');
  
  // Skip waiting to activate immediately
  self.skipWaiting();
  
  // Cache core files
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) => {
      console.log('[ServiceWorker] Caching app shell');
      return cache.addAll(coreAppFiles);
    })
    .then(() => {
      // Cache secondary files in a separate operation to prevent blocking install
      return caches.open(STATIC_CACHE).then((cache) => {
        console.log('[ServiceWorker] Caching secondary files');
        return cache.addAll(secondaryFiles);
      });
    })
  );
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
  console.log('[ServiceWorker] Activating');
  
  // List of cache names to keep
  const cacheAllowlist = [STATIC_CACHE, DYNAMIC_CACHE];
  
  event.waitUntil(
    // Remove old caches
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.filter((cacheName) => {
          return !cacheAllowlist.includes(cacheName);
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

// Improved fetch handler with different strategies based on resource type
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  
  // Don't handle non-GET requests
  if (event.request.method !== 'GET') return;
  
  // Don't intercept Chrome extensions or other origins
  if (url.origin !== location.origin && !url.hostname.endsWith('.buildship.com')) {
    return;
  }
  
  // For navigation requests, use a cache-first approach
  if (event.request.mode === 'navigate') {
    event.respondWith(
      caches.match('/index.html')
        .then(cachedResponse => {
          if (cachedResponse) {
            // Return cached version immediately
            // But also fetch a fresh copy in the background
            fetch(event.request)
              .then(response => {
                if (response && response.status === 200) {
                  caches.open(STATIC_CACHE).then(cache => {
                    cache.put('/index.html', response);
                  });
                }
              })
              .catch(() => {/* Ignore fetch errors */});
              
            return cachedResponse;
          }
          return fetch(event.request);
        })
        .catch(() => {
          // If both cache and network fail, return a simple offline page
          return new Response('You are offline. Please check your internet connection.', {
            headers: { 'Content-Type': 'text/html' }
          });
        })
    );
    return;
  }
  
  // For large files (like models and main JS bundle), use a network-first approach
  if (isLargeFile(event.request.url)) {
    event.respondWith(
      fetch(event.request)
        .then(response => {
          // Clone the response for caching
          const responseToCache = response.clone();
          
          // Cache the response with retry logic
          caches.open(DYNAMIC_CACHE)
            .then(cache => cache.put(event.request, responseToCache))
            .catch(err => console.error('Error caching large file:', err));
            
          return response;
        })
        .catch(() => {
          // If network fails, try from cache
          return caches.match(event.request);
        })
    );
    return;
  }
  
  // For all other requests (scripts, styles, etc.), use a cache-first approach
  event.respondWith(
    caches.match(event.request)
      .then(cachedResponse => {
        if (cachedResponse) {
          // Return cached version
          return cachedResponse;
        }
        
        // If not in cache, fetch from network
        return fetch(event.request)
          .then(response => {
            // Only cache successful responses
            if (response && response.status === 200) {
              const responseToCache = response.clone();
              caches.open(DYNAMIC_CACHE)
                .then(cache => cache.put(event.request, responseToCache))
                .catch(err => console.warn('Error caching resource:', err));
            }
            return response;
          });
      })
      .catch(err => {
        console.warn('Fetch handler failed:', err);
        // Return a fallback response for images if needed
        if (event.request.url.match(/\.(jpg|jpeg|png|gif|svg)$/)) {
          return new Response('', { status: 404 });
        }
        throw err;
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
  } else if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
}); 