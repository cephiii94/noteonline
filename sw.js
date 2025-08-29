// Nama cache
const CACHE_NAME = 'notonlen-cache-v2'; // Versi cache diperbarui untuk memastikan pembaruan

// Daftar file inti yang akan di-cache
// CATATAN: File 'login.html' dan 'firebase-config.js' dihapus karena tidak ditemukan,
// yang menyebabkan service worker gagal diinstal.
// Pastikan semua file dalam daftar ini ada di server Anda.
const urlsToCache = [
  '/',
  './', // Menambahkan './' untuk merujuk ke root direktori
  './index.html',
  './style.css',
  './script.js',
  './manifest.json', // Menambahkan manifest ke dalam cache
  // Menambahkan ikon placeholder ke cache agar PWA dapat diinstal
  'https://placehold.co/192x192/2563EB/FFFFFF?text=Icon',
  'https://placehold.co/512x512/2563EB/FFFFFF?text=Icon',
  
  // Aset dari CDN (opsional, tapi bagus untuk offline)
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
      .catch(error => {
        // Log error jika ada file yang gagal di-cache
        console.error('Gagal menambahkan file ke cache:', error);
      })
  );
  // Langsung aktifkan service worker baru setelah instalasi berhasil
  self.skipWaiting(); 
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
            console.log('Menghapus cache lama:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => self.clients.claim()) // Ambil alih kontrol halaman
  );
});

// Event 'fetch': dipanggil setiap kali ada permintaan jaringan (request) dari aplikasi
self.addEventListener('fetch', event => {
  // Hanya tangani request GET
  if (event.request.method !== 'GET') {
    return;
  }
  
  event.respondWith(
    caches.open(CACHE_NAME).then(cache => {
      return fetch(event.request)
        .then(networkResponse => {
          // Jika berhasil dari jaringan, simpan salinannya ke cache
          if (networkResponse.ok) {
            cache.put(event.request, networkResponse.clone());
          }
          return networkResponse;
        })
        .catch(() => {
          // Jika jaringan gagal, coba ambil dari cache
          return cache.match(event.request);
        });
    })
  );
});
