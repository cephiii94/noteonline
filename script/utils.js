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
    if (themeName === 'dark') {
        document.body.classList.add('dark-mode');
    } else {
        document.body.classList.remove('dark-mode');
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