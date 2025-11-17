// Nama cache diperbarui ke v5 untuk memicu pembaruan
const CACHE_NAME = 'notonlen-cache-v5.5.3'; 

// Daftar file inti yang akan di-cache (PATH SUDAH DIPERBAIKI)
const urlsToCache = [
  '/',
  './',
  './index.html',
  './login.html', 
  './style/style.css', // <-- PATH DIPERBAIKI
  './style/login.css', 
  './script/script.js', // <-- PATH DIPERBAIKI
  './firebase-config.js', 
  './manifest.json',
  './kanban.html',
  './icons/icon-192.png', // <-- PATH DIPERBAIKI
  './icons/icon-512.png', // <-- PATH DIPERBAIKI
  
  // Aset dari CDN
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
        console.log('Cache v5 dibuka untuk instalasi.');
        const cachePromises = urlsToCache.map(urlToCache => {
          return cache.add(urlToCache).catch(err => {
            console.warn(`Gagal caching ${urlToCache}:`, err);
          });
        });
        return Promise.all(cachePromises);
      })
      .then(() => {
        console.log('Semua aset baru berhasil di-cache.');
        // Langsung aktifkan service worker baru
        return self.skipWaiting();
      })
      .catch(error => {
        console.error('Gagal saat proses instalasi cache v5:', error);
      })
  );
});

// Event 'activate': Hapus cache lama
self.addEventListener('activate', event => {
  const cacheWhitelist = [CACHE_NAME]; // Hanya simpan v5
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
  // Hanya proses request GET
  if (event.request.method !== 'GET') {
    return;
  }

  // --- PERBAIKAN UNTUK CHROME-EXTENSION ---
  // Jangan proses request yang bukan http atau https
  if (!event.request.url.startsWith('http')) {
      return;
  }
  // --- AKHIR PERBAIKAN ---

  event.respondWith(
    fetch(event.request)
      .then(networkResponse => {
        // Jika fetch berhasil, update cache
        return caches.open(CACHE_NAME).then(cache => {
          if (networkResponse.ok) {
            cache.put(event.request, networkResponse.clone());
          }
          return networkResponse;
        });
      })
      .catch(() => {
        // Jika fetch gagal (offline), ambil dari cache
        return caches.match(event.request);
      })
  );
});

self.addEventListener('message', (event) => {
  if (!event.data) return;
  if (event.data.type === 'PING') {
    // kirim balasan ke semua client secara asinkron tanpa "return true"
    event.waitUntil(
      self.clients.matchAll({ includeUncontrolled: true }).then(clients => {
        clients.forEach(client => {
          client.postMessage({ type: 'PONG' });
        });
      })
    );
  }
});