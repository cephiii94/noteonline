// Nama cache
const CACHE_NAME = 'notonlen-cache-v1';

// Daftar file yang akan di-cache
const urlsToCache = [
  '/',
  '/index.html',
  '/login.html',
  '/style.css',
  '/script.js',
  '/firebase-config.js',
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
  // Tunggu sampai proses caching selesai
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('Cache dibuka');
        return cache.addAll(urlsToCache);
      })
  );
});

// Event 'fetch': dipanggil setiap kali ada permintaan jaringan (request) dari aplikasi
self.addEventListener('fetch', event => {
  event.respondWith(
    // Coba cari response dari cache terlebih dahulu
    caches.match(event.request)
      .then(response => {
        // Jika ditemukan di cache, kembalikan response dari cache
        if (response) {
          return response;
        }
        // Jika tidak, lakukan request ke jaringan
        return fetch(event.request);
      })
  );
});

// Event 'activate': dipanggil saat service worker diaktifkan
self.addEventListener('activate', event => {
  const cacheWhitelist = [CACHE_NAME];
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          // Hapus cache lama yang tidak digunakan lagi
          if (cacheWhitelist.indexOf(cacheName) === -1) {
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
});
