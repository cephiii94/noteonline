// sw.js
const CACHE_NAME = 'notonlen-v5'; // Versi cache otomatis terbarui

const LOCAL_ASSETS = [
  '/',
  '/index.html',
  '/login.html',
  '/kanban.html',
  '/style/style.css',
  '/style/login.css',
  '/style/kanban.css',
  
  // Modul JavaScript
  '/script/main.js',
  '/script/utils.js',
  '/script/ui-handler.js',
  '/script/custom-select.js',
  '/script/firebase-service.js',
  '/script/kanban.js',
  '/script/sw-register.js',
  '/firebase-config.js',
  
  // PWA Assets
  '/manifest.json',
  '/icons/icon-192.png',
  '/icons/icon-512.png'
];

const EXTERNAL_ASSETS = [
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css',
  'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap',
  'https://cdn.jsdelivr.net/npm/quill@2.0.2/dist/quill.snow.css',
  'https://cdn.jsdelivr.net/npm/quill@2.0.2/dist/quill.js'
];

// 1. Install Service Worker
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(async (cache) => {
      console.log('SW: Caching assets');
      await cache.addAll(LOCAL_ASSETS);
      await Promise.allSettled(EXTERNAL_ASSETS.map(url => cache.add(url)));
    })
  );
  self.skipWaiting(); // Paksa SW baru langsung masuk status aktif
});

// 2. Activate (Hapus cache lama)
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cache) => {
          if (cache !== CACHE_NAME) {
            console.log('SW: Clearing old cache:', cache);
            return caches.delete(cache);
          }
        })
      );
    })
  );
  self.clients.claim();
});

// 3. Listener pesan dari client (misal untuk skipWaiting manual)
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

// 4. Fetch Strategy Optimized (Network-First untuk HTML Navigasi, Stale-While-Revalidate untuk Aset Statis)
self.addEventListener('fetch', (event) => {
  // Abaikan request ke Firestore/Firebase SDK & Chrome Extensions
  const url = event.request.url;
  if (url.includes('firestore.googleapis.com') || 
      url.includes('firebase') || 
      url.startsWith('chrome-extension://')) {
    return;
  }

  // A. NAVIGASI HALAMAN (HTML): Network-First
  // Ambil halaman terbaru dari jaringan saat online. Jika offline, baru pakai cache.
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request)
        .then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            const responseToCache = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(event.request, responseToCache);
            });
          }
          return networkResponse;
        })
        .catch(() => {
          // Offline fallback
          return caches.match(event.request).then((cachedResponse) => {
            return cachedResponse || caches.match('/index.html');
          });
        })
    );
    return;
  }

  // B. ASET STATIS (JS, CSS, Images, Fonts): Stale-While-Revalidate
  // Tampilkan versi cache secara instan, lalu perbarui cache di latar belakang untuk kunjungan berikutnya.
  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      const fetchPromise = fetch(event.request)
        .then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200 && event.request.method === 'GET') {
            const responseToCache = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(event.request, responseToCache);
            });
          }
          return networkResponse;
        })
        .catch((err) => {
          console.warn('SW: Network fetch failed for asset:', event.request.url);
        });

      // Kembalikan cache secepatnya jika ada, atau tunggu network jika tidak ada cache
      return cachedResponse || fetchPromise;
    })
  );
});