// sw.js
const CACHE_NAME = 'notonlen-v3'; // Naikkan versi agar cache lama dibersihkan

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
  '/script/firebase-service.js',
  '/script/kanban.js',
  '/firebase-config.js',
  
  // PWA Assets
  '/manifest.json',
  '/icons/icon-192.png',
  '/icons/icon-512.png'
];

const EXTERNAL_ASSETS = [
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css',
  'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap',
  'https://cdn.quilljs.com/1.3.6/quill.snow.css',
  'https://cdn.quilljs.com/1.3.6/quill.js'
];

// 1. Install Service Worker
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(async (cache) => {
      console.log('SW: Caching local assets');
      // Cache aset lokal utama terlebih dahulu (wajib berhasil)
      await cache.addAll(LOCAL_ASSETS);
      
      // Cache aset CDN eksternal secara bertahap (tidak menggagalkan instalasi SW jika salah satu CDN timeout)
      await Promise.allSettled(EXTERNAL_ASSETS.map(url => cache.add(url)));
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