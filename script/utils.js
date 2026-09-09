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