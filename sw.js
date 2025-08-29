// Nama cache diperbarui untuk memicu pembaruan
const CACHE_NAME = 'notonlen-cache-v3';

// Daftar file inti yang akan di-cache
const urlsToCache = [
  '/',
  './',
  './index.html',
  './style.css',
  './script.js',
  './manifest.json',
  'https://placehold.co/192x192/2563EB/FFFFFF?text=Icon',
  'https://placehold.co/512x512/2563EB/FFFFFF?text=Icon',
  
  // Aset dari CDN
  'https://cdn.tailwindcss.com',
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css',
  'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap',
  'https://cdn.quilljs.com/1.3.6/quill.snow.css',
  'https://cdn.quilljs.com/1.3.6/quill.js',
  'https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js',
  'https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js',
  'https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js'
];

// Event 'install': dipanggil saat service worker pertama kali diinstal
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('Cache dibuka untuk instalasi.');
        // PERBAIKAN: Menggunakan fetch dengan mode 'no-cors' untuk aset dari domain lain
        // Ini mencegah error CORS saat proses caching.
        const cachePromises = urlsToCache.map(urlToCache => {
          const request = new Request(urlToCache, { mode: 'no-cors' });
          return fetch(request).then(response => {
            return cache.put(urlToCache, response);
          }).catch(err => {
            console.warn(`Gagal caching ${urlToCache}:`, err);
          });
        });
        return Promise.all(cachePromises);
      })
      .then(() => {
        console.log('Semua aset berhasil di-cache.');
        // Langsung aktifkan service worker baru
        return self.skipWaiting();
      })
      .catch(error => {
        console.error('Gagal saat proses instalasi cache:', error);
      })
  );
});

// Event 'activate': Hapus cache lama
self.addEventListener('activate', event => {
  const cacheWhitelist = [CACHE_NAME];
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheWhitelist.indexOf(cacheName) === -1) {
            console.log('Menghapus cache lama:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Event 'fetch': Strategi Network falling back to cache
self.addEventListener('fetch', event => {
  event.respondWith(
    fetch(event.request)
      .then(networkResponse => {
        // Jika fetch berhasil, update cache dan kembalikan respons jaringan
        return caches.open(CACHE_NAME).then(cache => {
          // Hanya cache request GET yang berhasil
          if(event.request.method === 'GET' && networkResponse.ok) {
            cache.put(event.request, networkResponse.clone());
          }
          return networkResponse;
        });
      })
      .catch(() => {
        // Jika fetch gagal (misalnya, offline), coba ambil dari cache
        console.log('Jaringan gagal, mencoba mengambil dari cache untuk:', event.request.url);
        return caches.match(event.request);
      })
  );
});

