// script/utils.js (formatter/helper)

// Helper: Format Tanggal Indonesia
export function formatDate(date) {
    if (!date) return '';
    return new Intl.DateTimeFormat('id-ID', {
        day: 'numeric', month: 'short', year: 'numeric'
    }).format(date);
}

// Helper: Mencegah XSS (Security)
export function escapeHTML(str) {
    if (!str) return '';
    return str.replace(/[&<>"']/g, function(m) {
        return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[m];
    });
}

// Helper: Aman menambahkan Event Listener (Cek elemen dulu)
export function safeAddListener(id, event, handler) {
    const el = document.getElementById(id);
    if (el) {
        el.addEventListener(event, handler);
    }
}

// Helper: Set Tema (Dark/Light)
export function setTheme(themeName) {
    localStorage.setItem('theme', themeName);
    const isDark = themeName === 'dark';
    if (isDark) {
        document.body.classList.add('dark-mode', 'dark');
        document.documentElement.classList.add('dark');
        document.documentElement.setAttribute('data-theme', 'dark');
    } else {
        document.body.classList.remove('dark-mode', 'dark');
        document.documentElement.classList.remove('dark');
        document.documentElement.setAttribute('data-theme', 'light');
    }
}

// Helper: Toggle Sidebar
export function toggleSidebar() {
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('sidebar-overlay');
    const isDesktop = window.innerWidth >= 768;

    if (isDesktop) {
        sidebar.classList.toggle('is-collapsed');
    } else {
        sidebar.classList.toggle('is-open');
        overlay.classList.toggle('is-visible');
    }
}

export function closeSidebar() {
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('sidebar-overlay');
    if (window.innerWidth < 768) {
        sidebar.classList.remove('is-open');
        overlay.classList.remove('is-visible');
    }
}

// Helper: Smart Linkify (Ubah link teks jadi anchor tag & paksa buka di tab baru)
export function linkifyHTML(html) {
    if (!html) return '';

    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');

    // 1. Pastikan semua tag <a> yang sudah ada membuka di tab baru
    doc.querySelectorAll('a').forEach(a => {
        a.setAttribute('target', '_blank');
        a.setAttribute('rel', 'noopener noreferrer');
    });

    // 2. Deteksi teks URL polos (http://, https://, www.) di luar tag <a>
    const urlRegex = /(https?:\/\/[^\s<]+|www\.[^\s<]+)/gi;

    function processTextNode(node) {
        if (node.nodeType === Node.TEXT_NODE) {
            const text = node.nodeValue;
            if (urlRegex.test(text)) {
                urlRegex.lastIndex = 0;
                const fragment = document.createDocumentFragment();
                let lastIndex = 0;
                let match;

                while ((match = urlRegex.exec(text)) !== null) {
                    let matchText = match[0];
                    const matchIndex = match.index;

                    // Bersihkan tanda baca di akhir URL jika ada (misal: "buka https://site.com.")
                    let trailingPunct = '';
                    const punctMatch = matchText.match(/[.,!?:;)]+$/);
                    if (punctMatch) {
                        trailingPunct = punctMatch[0];
                        matchText = matchText.substring(0, matchText.length - trailingPunct.length);
                    }

                    if (matchIndex > lastIndex) {
                        fragment.appendChild(document.createTextNode(text.substring(lastIndex, matchIndex)));
                    }

                    const a = document.createElement('a');
                    let href = matchText;
                    if (!/^https?:\/\//i.test(href)) {
                        href = 'https://' + href;
                    }
                    a.href = href;
                    a.target = '_blank';
                    a.rel = 'noopener noreferrer';
                    a.textContent = matchText;
                    fragment.appendChild(a);

                    if (trailingPunct) {
                        fragment.appendChild(document.createTextNode(trailingPunct));
                    }

                    lastIndex = matchIndex + match[0].length;
                }

                if (lastIndex < text.length) {
                    fragment.appendChild(document.createTextNode(text.substring(lastIndex)));
                }

                node.parentNode.replaceChild(fragment, node);
            }
        } else if (
            node.nodeType === Node.ELEMENT_NODE &&
            node.nodeName.toLowerCase() !== 'a' &&
            node.nodeName.toLowerCase() !== 'script' &&
            node.nodeName.toLowerCase() !== 'style'
        ) {
            Array.from(node.childNodes).forEach(processTextNode);
        }
    }

    processTextNode(doc.body);
    return doc.body.innerHTML;
}

// --- POPUP ALERT, CONFIRM & TOAST SYSTEM ---

export function showAlert(options) {
    const opts = typeof options === 'string' ? { message: options } : (options || {});
    const title = opts.title || 'Pemberitahuan';
    const message = opts.message || '';
    const type = opts.type || 'info';
    const confirmText = opts.confirmText || 'OK';

    return new Promise((resolve) => {
        const overlay = document.createElement('div');
        overlay.className = 'custom-alert-overlay';

        const iconClass = type === 'danger' ? 'fa-exclamation-circle' :
                          type === 'success' ? 'fa-check-circle' :
                          type === 'warning' ? 'fa-exclamation-triangle' : 'fa-info-circle';

        overlay.innerHTML = `
            <div class="custom-alert-card">
                <div class="custom-alert-icon-wrapper ${type}">
                    <i class="fas ${iconClass}"></i>
                </div>
                <h3 class="custom-alert-title">${escapeHTML(title)}</h3>
                <p class="custom-alert-message">${escapeHTML(message)}</p>
                <div class="custom-alert-actions">
                    <button class="custom-alert-btn custom-alert-btn-confirm ${type === 'danger' ? 'danger' : ''}" id="customAlertOkBtn">
                        ${escapeHTML(confirmText)}
                    </button>
                </div>
            </div>
        `;

        document.body.appendChild(overlay);
        requestAnimationFrame(() => overlay.classList.add('is-visible'));

        const okBtn = overlay.querySelector('#customAlertOkBtn');
        const close = () => {
            overlay.classList.remove('is-visible');
            setTimeout(() => {
                overlay.remove();
                resolve(true);
            }, 250);
        };

        if (okBtn) okBtn.addEventListener('click', close);
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) close();
        });

        const handleKeyDown = (e) => {
            if (e.key === 'Escape' || e.key === 'Enter') {
                window.removeEventListener('keydown', handleKeyDown);
                close();
            }
        };
        window.addEventListener('keydown', handleKeyDown);
    });
}

export function showConfirm(options) {
    const opts = typeof options === 'string' ? { message: options } : (options || {});
    const title = opts.title || 'Konfirmasi';
    const message = opts.message || '';
    const type = opts.type || 'danger';
    const confirmText = opts.confirmText || 'Hapus';
    const cancelText = opts.cancelText || 'Batal';

    return new Promise((resolve) => {
        const overlay = document.createElement('div');
        overlay.className = 'custom-alert-overlay';

        const iconClass = type === 'danger' ? 'fa-trash-alt' :
                          type === 'warning' ? 'fa-exclamation-triangle' : 'fa-question-circle';

        overlay.innerHTML = `
            <div class="custom-alert-card">
                <div class="custom-alert-icon-wrapper ${type}">
                    <i class="fas ${iconClass}"></i>
                </div>
                <h3 class="custom-alert-title">${escapeHTML(title)}</h3>
                <p class="custom-alert-message">${escapeHTML(message)}</p>
                <div class="custom-alert-actions">
                    <button class="custom-alert-btn custom-alert-btn-cancel" id="customConfirmCancelBtn">
                        ${escapeHTML(cancelText)}
                    </button>
                    <button class="custom-alert-btn custom-alert-btn-confirm ${type === 'danger' ? 'danger' : ''}" id="customConfirmOkBtn">
                        ${escapeHTML(confirmText)}
                    </button>
                </div>
            </div>
        `;

        document.body.appendChild(overlay);
        requestAnimationFrame(() => overlay.classList.add('is-visible'));

        const okBtn = overlay.querySelector('#customConfirmOkBtn');
        const cancelBtn = overlay.querySelector('#customConfirmCancelBtn');

        const close = (result) => {
            overlay.classList.remove('is-visible');
            setTimeout(() => {
                overlay.remove();
                resolve(result);
            }, 250);
        };

        if (okBtn) okBtn.addEventListener('click', () => close(true));
        if (cancelBtn) cancelBtn.addEventListener('click', () => close(false));
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) close(false);
        });

        const handleKeyDown = (e) => {
            if (e.key === 'Escape') {
                window.removeEventListener('keydown', handleKeyDown);
                close(false);
            } else if (e.key === 'Enter') {
                window.removeEventListener('keydown', handleKeyDown);
                close(true);
            }
        };
        window.addEventListener('keydown', handleKeyDown);
    });
}

export function showToast(message, type = 'info', duration = 3000) {
    let container = document.querySelector('.custom-toast-container');
    if (!container) {
        container = document.createElement('div');
        container.className = 'custom-toast-container';
        document.body.appendChild(container);
    }

    const toast = document.createElement('div');
    toast.className = `custom-toast ${type}`;

    const iconClass = type === 'success' ? 'fa-check-circle' :
                      type === 'danger' ? 'fa-exclamation-circle' :
                      type === 'warning' ? 'fa-exclamation-triangle' : 'fa-info-circle';

    toast.innerHTML = `
        <i class="fas ${iconClass} custom-toast-icon"></i>
        <span>${escapeHTML(message)}</span>
    `;

    container.appendChild(toast);

    setTimeout(() => {
        toast.classList.add('toast-hiding');
        setTimeout(() => toast.remove(), 250);
    }, duration);
}

// Helper: Hitung statistik checklist dari konten HTML catatan
export function getChecklistStats(content) {
    if (!content) return { total: 0, checked: 0, percent: 0, items: [] };

    try {
        const parser = new DOMParser();
        const doc = parser.parseFromString(content, 'text/html');
        
        // Cari semua li dengan data-list='checked' atau 'unchecked' (format Quill)
        const listItems = doc.querySelectorAll('li[data-list="checked"], li[data-list="unchecked"]');
        if (listItems.length === 0) {
            return { total: 0, checked: 0, percent: 0, items: [] };
        }

        const items = [];
        let checkedCount = 0;
        listItems.forEach(li => {
            const isChecked = li.getAttribute('data-list') === 'checked';
            if (isChecked) checkedCount++;
            
            // Ambil teks bersih dari elemen li
            const clone = li.cloneNode(true);
            clone.querySelectorAll('.ql-ui').forEach(el => el.remove());
            const text = clone.textContent.trim();
            items.push({ text, checked: isChecked });
        });

        const total = listItems.length;
        const percent = total > 0 ? Math.round((checkedCount / total) * 100) : 0;

        return { total, checked: checkedCount, percent, items };
    } catch (e) {
        console.error("Error parsing checklist stats:", e);
        return { total: 0, checked: 0, percent: 0, items: [] };
    }
}