// script/sw-register.js
// Modul Pendaftaran & Manajemen Auto-Update PWA Service Worker

function injectUpdateToast() {
    if (document.getElementById('pwa-update-toast')) return;

    const toastHTML = `
        <div id="pwa-update-toast" class="pwa-update-toast">
            <div class="pwa-toast-inner">
                <div class="pwa-toast-info">
                    <div class="pwa-toast-icon">
                        <i class="fas fa-sparkles"></i>
                    </div>
                    <div class="pwa-toast-text">
                        <p class="pwa-toast-title">Fitur Baru Tersedia!</p>
                        <p class="pwa-toast-desc">Pembaruan Notonlen siap diterapkan.</p>
                    </div>
                </div>
                <div class="pwa-toast-actions">
                    <button id="pwaReloadBtn" class="pwa-toast-reload-btn">
                        <i class="fas fa-sync-alt"></i> Perbarui Now
                    </button>
                    <button id="pwaDismissBtn" class="pwa-toast-close-btn" title="Nanti Saja">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
            </div>
        </div>
    `;

    document.body.insertAdjacentHTML('beforeend', toastHTML);
}

export function registerServiceWorker() {
    if (!('serviceWorker' in navigator)) return;

    window.addEventListener('load', async () => {
        try {
            const reg = await navigator.serviceWorker.register('/sw.js');
            console.log('SW: Registered successfully with scope:', reg.scope);

            // 1. Jika ada Service Worker baru yang sudah 'waiting'
            if (reg.waiting) {
                showUpdatePrompt(reg.waiting);
            }

            // 2. Deteksi jika ditemukan Service Worker baru yang sedang diunduh
            reg.addEventListener('updatefound', () => {
                const newWorker = reg.installing;
                if (!newWorker) return;

                newWorker.addEventListener('statechange', () => {
                    if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                        // SW baru sudah terinstall dan siap menggantikan SW lama
                        showUpdatePrompt(newWorker);
                    }
                });
            });

            // 3. Cek pembaruan secara berkala saat tab fokus kembali
            window.addEventListener('focus', () => {
                reg.update().catch(() => {});
            });

        } catch (err) {
            console.warn('SW: Registration failed:', err);
        }
    });

    // 4. Reload otomatis saat controller berubah (Service Worker baru aktif)
    let refreshing = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (!refreshing) {
            refreshing = true;
            window.location.reload();
        }
    });
}

function showUpdatePrompt(worker) {
    injectUpdateToast();

    const toast = document.getElementById('pwa-update-toast');
    const reloadBtn = document.getElementById('pwaReloadBtn');
    const dismissBtn = document.getElementById('pwaDismissBtn');

    if (toast) {
        // Tampilkan dengan animasi fade-in / slide-up
        requestAnimationFrame(() => {
            toast.classList.add('show');
        });
    }

    if (reloadBtn) {
        reloadBtn.onclick = () => {
            reloadBtn.disabled = true;
            reloadBtn.innerHTML = `<i class="fas fa-spinner fa-spin"></i> Memperbarui...`;
            
            if (worker) {
                worker.postMessage({ type: 'SKIP_WAITING' });
            } else {
                window.location.reload();
            }
        };
    }

    if (dismissBtn) {
        dismissBtn.onclick = () => {
            if (toast) {
                toast.classList.remove('show');
            }
        };
    }
}

// Inisialisasi otomatis jika dimuat sebagai script standar
if (document.readyState === 'complete' || document.readyState === 'interactive') {
    registerServiceWorker();
} else {
    document.addEventListener('DOMContentLoaded', registerServiceWorker);
}
