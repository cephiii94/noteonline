// sw.js
const CACHE_NAME = 'notonlen-v2'; // Ganti versi biar cache lama terhapus
const ASSETS_TO_CACHE = [
  '/',
  '/index.html',
  '/login.html',
  '/style/style.css',
  '/style/login.css',
  
  // File JS Baru (Modular) - PENTING!
  '/script/main.js',
  '/script/utils.js',
  '/script/ui-handler.js',
  '/script/firebase-service.js',
  '/firebase-config.js',
  
  // Assets lain
  '/manifest.json',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  
  // External Libraries (Opsional, lebih baik di-cache biar kencang)
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css',
  'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap',
  'https://cdn.quilljs.com/1.3.6/quill.snow.css',
  'https://cdn.quilljs.com/1.3.6/quill.js'
];

// 1. Install Service Worker
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('SW: Caching assets');
      return cache.addAll(ASSETS_TO_CACHE);
    })
  );
  self.skipWaiting(); // Paksa SW baru langsung aktif
});

// 2. Activate (Hapus cache lama)
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cache) => {
          if (cache !== CACHE_NAME) {
            console.log('SW: Clearing old cache');
            return caches.delete(cache);
          }
        })
      );
    })
  );
  self.clients.claim();
});

// 3. Fetch (Strategi: Cache First, Network Fallback)
self.addEventListener('fetch', (event) => {
  // Abaikan request ke Firestore/Firebase (biar SDK Firebase yang urus)
  if (event.request.url.includes('firestore.googleapis.com') || 
      event.request.url.includes('firebase')) {
    return; 
  }

  event.respondWith(
    caches.match(event.request).then((response) => {
      // Kalau ada di cache, pakai cache
      if (response) {
        return response;
      }
      // Kalau gak ada, ambil dari internet
      return fetch(event.request).catch(() => {
        // Kalau internet mati dan file gak ada di cache (misal halaman baru)
        if (event.request.mode === 'navigate') {
          return caches.match('/index.html');
        }
      });
    })
  );
});