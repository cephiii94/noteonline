// script/script.js

// Impor konfigurasi Firebase dan Modul yang dibutuhkan
import { auth, db } from '../firebase-config.js';
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
// Tambahkan 'getDocs' di sini 👇
import { collection, addDoc, onSnapshot, doc, getDoc, updateDoc, deleteDoc, setLogLevel, query, orderBy, where, getDocs } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

// Matikan log berisik jika perlu, atau biarkan default
// setLogLevel('silent');

// --- Variabel Global ---
let userId = null;
let notesCollectionRef = null;
let allNotes = [];
let currentCategory = "All"; 
let currentFilter = "all"; // 'all' atau 'archived'
let currentViewMode = "grid"; 
let notesListener = null; 
let addEditor, editEditor; // Instance Quill Editor

// --- 1. INISIALISASI LISTENER DOM (Pusat Kontrol Event) ---
function initializeDOMListeners() {

    // Helper: Pasang listener dengan aman (cek elemen ada atau tidak)
    function safeAddListener(id, event, handler) {
        const el = document.getElementById(id);
        if (el) {
            el.addEventListener(event, handler);
        }
    }

    // Helper: Assign fungsi aksi ke tombol berdasarkan ID
    function assignAction(id, actionFn) {
        const el = document.getElementById(id);
        if (el) {
            el.addEventListener('click', (e) => {
                // Ambil ID dari dataset tombol tersebut
                const noteId = e.currentTarget.dataset.id;
                if (noteId) actionFn(noteId);
            });
        }
    }

    // --- A. LOGIKA TEMA (DARK MODE) ---
    safeAddListener('themeToggle', 'click', () => {
        if (document.body.classList.contains('dark-mode')) {
            setTheme('light');
        } else {
            setTheme('dark');
        }
    });

    // Load tema tersimpan
    const currentTheme = localStorage.getItem('theme');
    if (currentTheme === 'dark') setTheme('dark');
    else setTheme('light');

    // --- B. PWA INSTALL ---
    const installAppContainer = document.getElementById('installAppContainer');
    let deferredPrompt; 
    window.addEventListener('beforeinstallprompt', (e) => {
        e.preventDefault();
        deferredPrompt = e;
        if (installAppContainer) installAppContainer.classList.remove('hidden');
    });
    safeAddListener('installAppSidebarBtn', 'click', async (e) => {
        e.preventDefault();
        if (installAppContainer) installAppContainer.classList.add('hidden');
        if (deferredPrompt) {
            deferredPrompt.prompt();
            deferredPrompt = null;
        }
    });

    // --- C. NAVIGATION & SIDEBAR (DUAL BUTTON LOGIC) ---
    // 1. Tombol Mobile (di Header)
    safeAddListener('mobile-menu-toggle', 'click', toggleSidebar);
    // 2. Tombol Desktop (di Sidebar)
    safeAddListener('desktop-menu-toggle', 'click', toggleSidebar);
    
    safeAddListener('sidebar-overlay', 'click', closeSidebar);

    // Dropdown Kategori di Sidebar
    const kategoriHeader = document.getElementById('kategori-header');
    const kategoriToggleBtn = document.getElementById('kategori-toggle-btn');
    const kategoriList = document.getElementById('kategori-list');
    if (kategoriHeader && kategoriToggleBtn && kategoriList) {
        kategoriHeader.addEventListener('click', () => {
            kategoriToggleBtn.classList.toggle('collapsed');
            kategoriList.classList.toggle('collapsed');
        });
    }

    // --- D. VIEW MODE (GRID/LIST) ---
    initializeViewMode(); 
    safeAddListener('gridViewBtn', 'click', () => setViewMode('grid'));
    safeAddListener('listViewBtn', 'click', () => setViewMode('list'));

    // --- E. SEARCH & FILTER ---
    safeAddListener('searchInput', 'input', filterAndRenderNotes);
    safeAddListener('mobileSearchInput', 'input', filterAndRenderNotes);

    // Filter Kategori (Sidebar)
    document.querySelectorAll('.category-filter').forEach(filter => {
        filter.addEventListener('click', (e) => {
            e.preventDefault();
            currentFilter = "all"; 
            currentCategory = e.currentTarget.dataset.category;
            
            // Update UI Header
            const headerEl = document.getElementById('notesHeader');
            if(headerEl) headerEl.textContent = currentCategory === 'All' ? 'Semua Catatan' : `Kategori: ${currentCategory}`;
            
            // Update Active State
            document.querySelectorAll('.nav-link').forEach(f => f.classList.remove('active-link'));
            e.currentTarget.classList.add('active-link');
            
            loadNotes(); 
            if (window.innerWidth < 768) closeSidebar();
        });
    });

    // Filter Arsip
    const archiveFilter = document.querySelector('.archive-filter');
    if (archiveFilter) {
        archiveFilter.addEventListener('click', (e) => {
            e.preventDefault();
            currentFilter = "archived"; 
            currentCategory = "All"; 
            
            const headerEl = document.getElementById('notesHeader');
            if(headerEl) headerEl.textContent = 'Arsip Catatan';

            document.querySelectorAll('.nav-link').forEach(f => f.classList.remove('active-link'));
            e.currentTarget.classList.add('active-link');
            
            loadNotes(); 
            if (window.innerWidth < 768) closeSidebar();
        });
    }

    // --- F. CRUD LISTENERS (LIST UTAMA) ---
    const notesListContainer = document.getElementById('notesList');
    if (notesListContainer) {
        notesListContainer.addEventListener('click', async (e) => {
            const button = e.target.closest('.note-action-btn'); 
            const card = e.target.closest('.note-card');

            // Jika Tombol Aksi (Pin, Archive, Delete) di Kartu diklik
            if (button) { 
                e.stopPropagation(); 
                const noteId = button.dataset.id;
                
                if (button.classList.contains('pin-btn')) togglePinAction(noteId);
                else if (button.classList.contains('archive-btn')) archiveNoteAction(noteId);
                else if (button.classList.contains('unarchive-btn')) unarchiveNoteAction(noteId);
                else if (button.classList.contains('delete-btn')) deleteNoteAction(noteId);
                else if (button.classList.contains('edit-btn')) editNoteAction(noteId);
                
            } 
            // Jika Kartu diklik (Buka Detail)
            else if (card) { 
                const noteId = card.dataset.id;
                const note = allNotes.find(n => n.id === noteId);
                if (note) showViewModal(note);
            }
        });
    }

    // --- G. MODAL ACTIONS (HEADER & FOOTER & MENU) ---
    // Mapping tombol ke fungsi aksi
    
    // 1. Edit
    assignAction('viewHeaderEditBtn', editNoteAction);
    assignAction('viewMenuEdit', editNoteAction);
    assignAction('viewFooterEditBtn', editNoteAction); // Desktop Footer
    assignAction('editFab', editNoteAction); // FAB

    // 2. Delete
    assignAction('viewHeaderDeleteBtn', deleteNoteAction);
    assignAction('viewMenuDelete', deleteNoteAction);
    assignAction('viewFooterDeleteBtn', deleteNoteAction); // Desktop Footer

    // 3. Archive
    assignAction('viewHeaderArchiveBtn', archiveNoteAction);
    assignAction('viewMenuArchive', archiveNoteAction);
    assignAction('viewFooterArchiveBtn', archiveNoteAction); // Desktop Footer

    // 4. Unarchive
    assignAction('viewHeaderUnarchiveBtn', unarchiveNoteAction);
    assignAction('viewMenuUnarchive', unarchiveNoteAction);
    assignAction('viewFooterUnarchiveBtn', unarchiveNoteAction); // Desktop Footer


    // --- H. MODAL CONTROL (BUKA/TUTUP/SUBMIT) ---
    const addModal = document.getElementById('addModal');
    const editModal = document.getElementById('editModal');
    const viewModal = document.getElementById('viewModal');
    const viewNoteDropdownMenu = document.getElementById('viewNoteDropdownMenu');

    // Tombol Tambah
    safeAddListener('openAddModalBtnMobile', 'click', openAddModal);
    safeAddListener('openAddModalBtn', 'click', openAddModal); 
    safeAddListener('cancelAdd', 'click', () => addModal.classList.remove('is-visible'));

    // Submit Tambah
    safeAddListener('addNoteForm', 'submit', async (e) => {
        e.preventDefault();
        const tags = document.getElementById('noteTags').value.split(',').map(tag => tag.trim()).filter(Boolean);
        try {
            await addDoc(notesCollectionRef, {
                title: document.getElementById('noteTitle').value,
                content: addEditor.root.innerHTML,
                plainText: addEditor.getText(),
                category: document.getElementById('noteCategory').value,
                tags: tags,
                productLink: document.getElementById('noteLink').value,
                createdAt: new Date(),
                isPinned: false,   
                isArchived: false   
            });
            addModal.classList.remove('is-visible');
            e.target.reset();
            addEditor.setText('');
            // Optional: Show toast success
        } catch (error) {
            console.error("Error adding note: ", error);
            alert("Gagal menambah catatan: " + error.message);
        }
    });

    // Edit Modal
    safeAddListener('cancelEdit', 'click', () => editModal.classList.remove('is-visible'));
    
    // Submit Edit
    safeAddListener('editNoteForm', 'submit', async (e) => {
        e.preventDefault();
        const noteId = document.getElementById('editNoteId').value;
        const noteRef = doc(db, notesCollectionRef.path, noteId);
        const tags = document.getElementById('editNoteTags').value.split(',').map(tag => tag.trim()).filter(Boolean);
        try {
            await updateDoc(noteRef, {
                title: document.getElementById('editNoteTitle').value,
                content: editEditor.root.innerHTML,
                plainText: editEditor.getText(),
                category: document.getElementById('editNoteCategory').value,
                tags: tags,
                productLink: document.getElementById('editNoteLink').value,
                updatedAt: new Date()
            });
            editModal.classList.remove('is-visible');
            // Jika view modal sedang terbuka, update kontennya atau tutup
            if (viewModal.classList.contains('is-visible')) {
                // Refresh data view modal manual atau biarkan onSnapshot yang bekerja
                // closeView...
            }
        } catch (error) {
            console.error("Error updating note: ", error);
            alert("Gagal update: " + error.message);
        }
    });

    // View Modal Controls
    const closeViewModal = () => {
        viewModal.classList.remove('is-visible');
        if(viewNoteDropdownMenu) viewNoteDropdownMenu.classList.remove('is-visible'); 
    };
    safeAddListener('closeView', 'click', closeViewModal);
    safeAddListener('viewBackBtn', 'click', closeViewModal);

    // Toggle Menu Dropdown (Titik Tiga)
    safeAddListener('viewMenuBtn', 'click', (e) => {
        e.stopPropagation(); 
        if(viewNoteDropdownMenu) viewNoteDropdownMenu.classList.toggle('is-visible');
    });

    // [BARU] Click Outside Logic untuk Dropdown
    window.addEventListener('click', (e) => {
        if (viewNoteDropdownMenu && viewNoteDropdownMenu.classList.contains('is-visible')) {
            if (!viewNoteDropdownMenu.contains(e.target) && !e.target.closest('#viewMenuBtn')) {
                viewNoteDropdownMenu.classList.remove('is-visible');
            }
        }
    });

    // Close Modals on Overlay Click
    [addModal, editModal, viewModal].forEach(modal => {
        if (modal) {
            modal.addEventListener('click', (e) => {
                if (e.target === modal) modal.classList.remove('is-visible');
            });
        }
    });

    // Keyboard Shortcut (ESC)
    window.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' || e.key === 'Esc') {
            const confirmModal = document.getElementById('customConfirmModal');
            if (confirmModal) {
                // Tutup confirm modal dulu jika ada
                const cancelBtn = confirmModal.querySelector('.btn-secondary');
                if (cancelBtn) cancelBtn.click();
                return; 
            }
            if (addModal && addModal.classList.contains('is-visible')) addModal.classList.remove('is-visible');
            if (editModal && editModal.classList.contains('is-visible')) editModal.classList.remove('is-visible');
            if (viewModal && viewModal.classList.contains('is-visible')) closeViewModal();
        }
    });

    // --- I. USER & LOGOUT ---
    safeAddListener('logoutBtn', 'click', async () => {
        try {
            await signOut(auth);
            window.location.href = 'login.html';
        } catch (error) {
            console.error('Logout error:', error);
        }
    });

} // End initializeDOMListeners


// --- 2. DEFINISI FUNGSI AKSI (CRUD WRAPPERS) ---

const togglePinAction = async (id) => {
    const note = allNotes.find(n => n.id === id);
    if (!note) return;
    try {
        await updateDoc(doc(db, notesCollectionRef.path, id), { isPinned: !note.isPinned });
    } catch (e) { console.error(e); }
};

const archiveNoteAction = async (id) => {
    try {
        await updateDoc(doc(db, notesCollectionRef.path, id), { isArchived: true, isPinned: false });
        // Jika dilakukan dari dalam View Modal, tutup modalnya
        const viewModal = document.getElementById('viewModal');
        if (viewModal && viewModal.classList.contains('is-visible')) viewModal.classList.remove('is-visible');
    } catch (e) { console.error(e); }
};

const unarchiveNoteAction = async (id) => {
    try {
        await updateDoc(doc(db, notesCollectionRef.path, id), { isArchived: false });
        // Jika dilakukan dari dalam View Modal (misal user melihat arsip), tutup modal
        const viewModal = document.getElementById('viewModal');
        if (viewModal && viewModal.classList.contains('is-visible')) viewModal.classList.remove('is-visible');
    } catch (e) { console.error(e); }
};

const deleteNoteAction = (id) => {
    showConfirmModal('Anda yakin ingin menghapus catatan ini?', async () => {
        try {
            await deleteDoc(doc(db, notesCollectionRef.path, id));
            const viewModal = document.getElementById('viewModal');
            if (viewModal && viewModal.classList.contains('is-visible')) viewModal.classList.remove('is-visible');
        } catch (e) { console.error(e); }
    });
};

const editNoteAction = (id) => {
    const note = allNotes.find(n => n.id === id);
    if (note) showEditModal(note);
};


// --- 3. MODAL LOGIC FUNCTIONS ---

function openAddModal() {
    const addModal = document.getElementById('addModal');
    addModal.classList.add('is-visible');
    document.getElementById('addNoteForm').reset();
    addEditor.setText(''); 
    // Reset kategori ke default
    const currentCat = currentCategory === 'All' ? 'Personal' : currentCategory;
    const catSelect = document.getElementById('noteCategory');
    if(catSelect) catSelect.value = currentCat;
}

function showEditModal(note) {
    const editModal = document.getElementById('editModal');
    document.getElementById('editNoteId').value = note.id;
    document.getElementById('editNoteTitle').value = note.title;
    document.getElementById('editNoteCategory').value = note.category;
    document.getElementById('editNoteTags').value = note.tags ? note.tags.join(', ') : '';
    document.getElementById('editNoteLink').value = note.productLink || '';
    
    // Set konten editor
    editEditor.root.innerHTML = note.content;
    
    editModal.classList.add('is-visible');
    
    // Tutup view modal jika terbuka (UX choice: edit menimpa view)
    const viewModal = document.getElementById('viewModal');
    if (viewModal.classList.contains('is-visible')) viewModal.classList.remove('is-visible');
}

function showViewModal(note) {
    const viewModal = document.getElementById('viewModal');
    
    // Set Konten Teks
    document.getElementById('viewNoteTitle').textContent = note.title;
    document.getElementById('viewNoteCategory').textContent = note.category;
    document.getElementById('viewNoteContent').innerHTML = note.content;
    
    // Render Tags
    const tagsContainer = document.getElementById('viewNoteTags');
    tagsContainer.innerHTML = '';
    if (note.tags && note.tags.length > 0) {
        note.tags.forEach(tag => {
            const span = document.createElement('span');
            span.className = 'note-tag';
            span.textContent = tag;
            tagsContainer.appendChild(span);
        });
    }

    // Render Link Produk
    const linkContainer = document.getElementById('productLinkContainer');
    const linkEl = document.getElementById('viewProductLink');
    if (note.productLink) {
        linkContainer.classList.remove('hidden');
        linkEl.href = note.productLink;
        linkEl.textContent = note.productLink;
    } else {
        linkContainer.classList.add('hidden');
    }

    // --- PENTING: Update Dataset ID untuk SEMUA Tombol Aksi ---
    // List ID tombol yang perlu tahu kita sedang buka catatan mana
    const actionButtonIds = [
        'viewHeaderEditBtn', 'viewHeaderDeleteBtn', 'viewHeaderArchiveBtn', 'viewHeaderUnarchiveBtn',
        'viewMenuEdit', 'viewMenuDelete', 'viewMenuArchive', 'viewMenuUnarchive',
        'editFab',
        // [BARU] Tombol Footer Desktop
        'viewFooterEditBtn', 'viewFooterDeleteBtn', 'viewFooterArchiveBtn', 'viewFooterUnarchiveBtn'
    ];

    actionButtonIds.forEach(btnId => {
        const btn = document.getElementById(btnId);
        if (btn) btn.dataset.id = note.id;
    });

    // --- LOGIKA VISIBILITAS TOMBOL ARSIP (Header & Footer) ---
    // Header Buttons
    const hArchive = document.getElementById('viewHeaderArchiveBtn');
    const hUnarchive = document.getElementById('viewHeaderUnarchiveBtn');
    // Menu Buttons
    const mArchive = document.getElementById('viewMenuArchive');
    const mUnarchive = document.getElementById('viewMenuUnarchive');
    // Footer Buttons (Desktop)
    const fArchive = document.getElementById('viewFooterArchiveBtn');
    const fUnarchive = document.getElementById('viewFooterUnarchiveBtn');

    // Helper toggle class
    const toggleHidden = (el, shouldHide) => {
        if(!el) return;
        if(shouldHide) el.classList.add('hidden');
        else el.classList.remove('hidden');
    };

    if (note.isArchived) {
        // Jika Arsip: Sembunyikan tombol Archive, Munculkan Unarchive
        toggleHidden(hArchive, true); toggleHidden(hUnarchive, false);
        toggleHidden(mArchive, true); toggleHidden(mUnarchive, false);
        toggleHidden(fArchive, true); toggleHidden(fUnarchive, false);
    } else {
        // Jika Aktif: Kebalikannya
        toggleHidden(hArchive, false); toggleHidden(hUnarchive, true);
        toggleHidden(mArchive, false); toggleHidden(mUnarchive, true);
        toggleHidden(fArchive, false); toggleHidden(fUnarchive, true);
    }

    viewModal.classList.add('is-visible');
}


// --- 4. CORE LOGIC (FIREBASE & UI) ---

function setupNotesCollection() {
    notesCollectionRef = collection(db, 'users', userId, 'notes');
    loadNotes();
}

function loadNotes() {
    if (notesListener) notesListener(); // Unsubscribe listener lama

    let q;
    // Logika Filter
    if (currentFilter === "archived") {
        // Query Arsip Sederhana
        q = query(notesCollectionRef, where("isArchived", "==", true));
    } else {
        // Query Utama Sederhana (Hapus sorting PIN dan Tanggal sementara)
        // Kita filter manual di client side nanti kalau perlu
        if (currentCategory === "All") {
             q = query(notesCollectionRef, where("isArchived", "==", false));
        } else {
             q = query(notesCollectionRef, where("isArchived", "==", false), where("category", "==", currentCategory));
        }
    }

    notesListener = onSnapshot(q, (snapshot) => {
        allNotes = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        filterAndRenderNotes();
    }, (error) => {
        console.error("Error fetching notes:", error);
        // Fallback jika index belum dibuat (sering terjadi di Firestore baru)
        if (error.code === 'failed-precondition') {
            console.warn("Mungkin index belum dibuat. Mencoba query tanpa sorting kompleks.");
            // Coba load raw data lalu sort di client side
            const simpleQ = query(notesCollectionRef);
            getDocs(simpleQ).then(snap => { // Perlu import getDocs jika mau pakai ini, tapi snapshot live lebih baik
                // Biarkan user melihat console link untuk build index
            });
        }
    });
}

function filterAndRenderNotes() {
    // Ambil keyword search
    const searchValDesktop = document.getElementById('searchInput') ? document.getElementById('searchInput').value.toLowerCase() : '';
    const searchValMobile = document.getElementById('mobileSearchInput') ? document.getElementById('mobileSearchInput').value.toLowerCase() : '';
    const searchQuery = searchValDesktop || searchValMobile;

    let filteredNotes = allNotes;

    if (searchQuery) {
        filteredNotes = allNotes.filter(note => {
            const title = note.title ? note.title.toLowerCase() : '';
            const content = note.plainText ? note.plainText.toLowerCase() : '';
            const tags = note.tags ? note.tags.join(' ').toLowerCase() : '';
            return title.includes(searchQuery) || content.includes(searchQuery) || tags.includes(searchQuery);
        });
    }

    renderNotes(filteredNotes);
}

function renderNotes(notes) {
    const container = document.getElementById('notesList');
    if (!container) return;
    
    container.innerHTML = '';

    if (notes.length === 0) {
        container.innerHTML = `
            <div class="notes-empty-message">
                <i class="fas fa-sticky-note" style="font-size: 3rem; margin-bottom: 1rem; color: var(--text-light);"></i>
                <p>Belum ada catatan di sini.</p>
            </div>`;
        return;
    }

    notes.forEach(note => {
        const dateStr = note.updatedAt ? formatDate(note.updatedAt.toDate()) : '';
        const pinnedClass = note.isPinned ? 'is-pinned' : '';
        const pinIconClass = note.isPinned ? 'active' : '';

        // Tentukan tombol apa yang muncul di kartu
        let actionButtonsHTML = '';
        
        if (currentFilter === 'archived') {
            // Jika di folder Arsip: Tombol Unarchive & Delete
            actionButtonsHTML = `
                <button class="note-action-btn unarchive-btn" data-id="${note.id}" title="Kembalikan">
                    <i class="fas fa-box-open"></i>
                </button>
                <button class="note-action-btn delete-btn" data-id="${note.id}" title="Hapus Permanen">
                    <i class="fas fa-trash"></i>
                </button>
            `;
        } else {
            // Jika di folder Utama: Pin, Archive, Edit, Delete
            actionButtonsHTML = `
                <button class="note-action-btn pin-btn ${pinIconClass}" data-id="${note.id}" title="Pin Catatan">
                    <i class="fas fa-thumbtack"></i>
                </button>
                <button class="note-action-btn archive-btn" data-id="${note.id}" title="Arsipkan">
                    <i class="fas fa-box-archive"></i>
                </button>
                <button class="note-action-btn delete-btn" data-id="${note.id}" title="Hapus">
                    <i class="fas fa-trash"></i>
                </button>
                 <button class="note-action-btn edit-btn" data-id="${note.id}" title="Edit">
                    <i class="fas fa-pencil-alt"></i>
                </button>
            `;
        }

        const tagsHTML = note.tags && note.tags.length > 0 
            ? `<div class="note-card-tags">
                ${note.tags.slice(0, 3).map(tag => `<span class="note-tag">${escapeHTML(tag)}</span>`).join('')}
                ${note.tags.length > 3 ? `<span class="note-tag">+${note.tags.length - 3}</span>` : ''}
               </div>` 
            : '';

        const cardHTML = `
            <div class="note-card ${pinnedClass}" data-id="${note.id}">
                <div class="note-card-header">
                    <span class="note-card-category">${escapeHTML(note.category)}</span>
                    <span class="note-card-date">${dateStr}</span>
                </div>
                <div class="note-card-body">
                    <h3 class="note-card-title">${escapeHTML(note.title)}</h3>
                    <div class="note-card-content">${note.plainText ? escapeHTML(note.plainText.substring(0, 150)) : ''}...</div>
                </div>
                <div class="note-card-footer">
                    ${tagsHTML}
                    <div class="note-card-actions">
                        ${actionButtonsHTML}
                    </div>
                </div>
            </div>
        `;
        container.innerHTML += cardHTML;
    });
}


// --- 5. HELPER FUNCTIONS ---

function initializeEditors() {
    const toolbarOptions = [
        [{ 'header': [1, 2, false] }],
        ['bold', 'italic', 'underline', 'strike'],
        ['blockquote', 'code-block'],
        [{ 'list': 'ordered'}, { 'list': 'bullet' }],
        ['clean']
    ];

    addEditor = new Quill('#addEditorContainer', {
        theme: 'snow',
        placeholder: 'Tulis catatanmu di sini...',
        modules: { toolbar: toolbarOptions }
    });

    editEditor = new Quill('#editEditorContainer', {
        theme: 'snow',
        modules: { toolbar: toolbarOptions }
    });
}

function formatDate(date) {
    return new Intl.DateTimeFormat('id-ID', {
        day: 'numeric', month: 'short', year: 'numeric'
    }).format(date);
}

function escapeHTML(str) {
    if (!str) return '';
    return str.replace(/[&<>"']/g, function(m) {
        return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[m];
    });
}

function toggleSidebar() {
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('sidebar-overlay');
    const isDesktop = window.innerWidth >= 768;

    if (isDesktop) {
        // Desktop: Mode Mini (Collapsed)
        sidebar.classList.toggle('is-collapsed');
        // Sesuaikan margin konten utama jika perlu (opsional, karena sidebar relative)
    } else {
        // Mobile: Slide In/Out
        sidebar.classList.toggle('is-open');
        overlay.classList.toggle('is-visible');
    }
}

function closeSidebar() {
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('sidebar-overlay');
    // Hanya tutup jika di mobile
    if (window.innerWidth < 768) {
        sidebar.classList.remove('is-open');
        overlay.classList.remove('is-visible');
    }
}

function setTheme(themeName) {
    localStorage.setItem('theme', themeName);
    if (themeName === 'dark') {
        document.body.classList.add('dark-mode');
    } else {
        document.body.classList.remove('dark-mode');
    }
}

function initializeViewMode() {
    const savedMode = localStorage.getItem('viewMode') || 'grid';
    setViewMode(savedMode);
}

function setViewMode(mode) {
    currentViewMode = mode;
    localStorage.setItem('viewMode', mode);
    
    const container = document.getElementById('notesList');
    const gridBtn = document.getElementById('gridViewBtn');
    const listBtn = document.getElementById('listViewBtn');

    if (mode === 'list') {
        container.classList.add('notes-list-mode');
        gridBtn.classList.remove('active');
        listBtn.classList.add('active');
    } else {
        container.classList.remove('notes-list-mode');
        gridBtn.classList.add('active');
        listBtn.classList.remove('active');
    }
}

// Modal Konfirmasi Sederhana
function showConfirmModal(message, onConfirm) {
    // Cek apakah modal confirm sudah ada di HTML, jika belum buat dinamis (opsional)
    // Untuk simpelnya, kita pakai confirm() bawaan browser atau buat elemen simple
    // Tapi karena Tuan Cecep user advance, kita pakai custom modal yang mungkin sudah ada atau inject
    
    // Inject Custom Modal on the fly jika belum ada
    let modal = document.getElementById('customConfirmModal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'customConfirmModal';
        modal.className = 'modal-overlay is-visible';
        modal.style.zIndex = '9999';
        modal.innerHTML = `
            <div class="modal-content" style="max-width: 400px; height: auto !important;">
                <div class="modal-body" style="text-align: center; padding: 2rem;">
                    <i class="fas fa-exclamation-triangle" style="font-size: 3rem; color: var(--warning); margin-bottom: 1rem;"></i>
                    <p id="confirmMessage" style="margin-bottom: 1.5rem; font-size: 1.1rem;">${message}</p>
                    <div style="display: flex; gap: 1rem; justify-content: center;">
                        <button class="btn btn-secondary cancel-btn">Batal</button>
                        <button class="btn btn-danger confirm-btn">Ya, Lanjutkan</button>
                    </div>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
    } else {
        document.getElementById('confirmMessage').textContent = message;
        modal.classList.add('is-visible');
    }

    const cancelBtn = modal.querySelector('.cancel-btn');
    const confirmBtn = modal.querySelector('.confirm-btn');

    // Reset listener (agar tidak menumpuk)
    const newCancel = cancelBtn.cloneNode(true);
    const newConfirm = confirmBtn.cloneNode(true);
    cancelBtn.parentNode.replaceChild(newCancel, cancelBtn);
    confirmBtn.parentNode.replaceChild(newConfirm, confirmBtn);

    newCancel.addEventListener('click', () => modal.classList.remove('is-visible'));
    newConfirm.addEventListener('click', () => {
        onConfirm();
        modal.classList.remove('is-visible');
    });
}


// --- MAIN ENTRY POINT ---
onAuthStateChanged(auth, (user) => {
    if (user) {
        userId = user.uid;
        document.getElementById('userNameDisplay').textContent = user.displayName || user.email.split('@')[0];
        document.getElementById('userEmailDisplay').textContent = user.email;
        
        setupNotesCollection();
        initializeEditors(); 
        initializeDOMListeners(); 
    } else {
        window.location.href = 'login.html';
    }
});