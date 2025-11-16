// Impor konfigurasi Firebase dari file terpisah
import { auth, db } from '../firebase-config.js';
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
// Impor query, orderBy, dan where
import { collection, addDoc, onSnapshot, doc, getDoc, updateDoc, deleteDoc, setLogLevel, query, orderBy, where } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

setLogLevel('debug');

// --- Variabel Global ---
// PERBAIKAN: Definisikan semua variabel di sini (di luar)
// agar bisa diakses oleh semua fungsi
let userId = null;
let notesCollectionRef = null;
let allNotes = [];
let currentCategory = "All"; 
let currentFilter = "all"; 
let currentViewMode = "grid"; 
let notesListener = null; 
let addEditor, editEditor; // <-- INI PERBAIKAN UNTUK ERROR 'addEditor'

// --- PERBAIKAN: Jalankan kode DOM setelah HTML siap ---
// Kita akan panggil fungsi ini di dalam onAuthStateChanged
function initializeDOMListeners() {

    // --- LOGIKA DARK MODE ---
    const themeToggleBtn = document.getElementById('themeToggle');
    if (themeToggleBtn) {
        themeToggleBtn.addEventListener('click', () => {
            if (document.body.classList.contains('dark-mode')) {
                setTheme('light'); // Matikan
            } else {
                setTheme('dark'); // Aktifkan
            }
        });
    }

    // Terapkan tema yang tersimpan saat halaman dimuat
    const currentTheme = localStorage.getItem('theme');
    if (currentTheme === 'dark') {
        setTheme('dark');
    } else {
        setTheme('light');
    }

    // --- PWA INSTALL PROMPT LOGIC ---
    const installAppContainer = document.getElementById('installAppContainer');
    const installAppSidebarBtn = document.getElementById('installAppSidebarBtn');
    let deferredPrompt; // Pindahkan ke sini

    window.addEventListener('beforeinstallprompt', (e) => {
        e.preventDefault();
        deferredPrompt = e;
        if (installAppContainer) {
            installAppContainer.classList.remove('hidden');
        }
    });

    if (installAppSidebarBtn) {
        installAppSidebarBtn.addEventListener('click', async (e) => {
            e.preventDefault();
            if (installAppContainer) {
                installAppContainer.classList.add('hidden');
            }
            if (deferredPrompt) {
                deferredPrompt.prompt();
                const { outcome } = await deferredPrompt.userChoice;
                console.log(`User response to the install prompt: ${outcome}`);
                deferredPrompt = null;
            }
        });
    }

    window.addEventListener('appinstalled', () => {
        if (installAppContainer) {
            installAppContainer.classList.add('hidden');
        }
        deferredPrompt = null;
        console.log('PWA was installed');
    });

    // --- UI & EVENT LISTENERS ---
    const menuToggle = document.getElementById('menu-toggle');
    const sidebarOverlay = document.getElementById('sidebar-overlay');
    const sidebar = document.getElementById('sidebar');

    menuToggle.addEventListener('click', toggleSidebar);
    sidebarOverlay.addEventListener('click', closeSidebar); 

    // --- Logika Dropdown Kategori ---
    const kategoriHeader = document.getElementById('kategori-header');
    const kategoriToggleBtn = document.getElementById('kategori-toggle-btn');
    const kategoriList = document.getElementById('kategori-list');

    if (kategoriHeader && kategoriToggleBtn && kategoriList) {
        kategoriHeader.addEventListener('click', () => {
            kategoriToggleBtn.classList.toggle('collapsed');
            kategoriList.classList.toggle('collapsed');
        });
    }

    // --- Fitur 3: Tampilan Grid/List ---
    const gridViewBtn = document.getElementById('gridViewBtn');
    const listViewBtn = document.getElementById('listViewBtn');

    if (gridViewBtn && listViewBtn) {
        initializeViewMode(); // Terapkan mode grid/list
        gridViewBtn.addEventListener('click', () => setViewMode('grid'));
        listViewBtn.addEventListener('click', () => setViewMode('list'));
    }

    // --- SEARCH & FILTER LOGIC ---
    document.getElementById('searchInput').addEventListener('input', filterAndRenderNotes);
    document.getElementById('mobileSearchInput').addEventListener('input', filterAndRenderNotes);

    // Listener untuk Kategori
    document.querySelectorAll('.category-filter').forEach(filter => {
        filter.addEventListener('click', (e) => {
            e.preventDefault();
            currentFilter = "all"; 
            currentCategory = e.currentTarget.dataset.category;
            
            if (currentCategory !== "All") {
                document.getElementById('notesHeader').textContent = `Kategori: ${currentCategory}`;
            }
            
            document.querySelectorAll('.nav-link').forEach(f => f.classList.remove('active-link'));
            e.currentTarget.classList.add('active-link');
            
            loadNotes(); 
            
            if (window.innerWidth < 768) {
                closeSidebar();
            }
        });
    });

    // Listener untuk Arsip (BARU)
    document.querySelector('.archive-filter').addEventListener('click', (e) => {
        e.preventDefault();
        currentFilter = "archived"; 
        currentCategory = "All"; 
        
        document.querySelectorAll('.nav-link').forEach(f => f.classList.remove('active-link'));
        e.currentTarget.classList.add('active-link');
        
        loadNotes(); 
        
        if (window.innerWidth < 768) {
            closeSidebar();
        }
    });

    // --- CRUD ACTIONS (DIPERBARUI) ---
    const notesListContainer = document.getElementById('notesList');
    notesListContainer.addEventListener('click', async (e) => {
        const button = e.target.closest('.note-action-btn'); 
        const card = e.target.closest('.note-card');

        if (button) { // Tombol Aksi diklik
            e.stopPropagation(); 
            const noteId = button.dataset.id;
            const noteRef = doc(db, notesCollectionRef.path, noteId);
            const note = allNotes.find(n => n.id === noteId);

            if (button.classList.contains('pin-btn')) {
                await updateDoc(noteRef, { isPinned: !note.isPinned });
            }
            else if (button.classList.contains('archive-btn')) {
                await updateDoc(noteRef, { isArchived: true, isPinned: false }); 
            }
            else if (button.classList.contains('unarchive-btn')) {
                await updateDoc(noteRef, { isArchived: false });
            }
            else if (button.classList.contains('delete-btn')) {
                showConfirmModal('Anda yakin ingin menghapus catatan ini?', async () => {
                    await deleteDoc(noteRef);
                });
            }
            else if (button.classList.contains('edit-btn')) {
                if (note) showEditModal(note);
            }
        } else if (card) { // Kartu catatan diklik
            const noteId = card.dataset.id;
            const note = allNotes.find(n => n.id === noteId);
            if (note) showViewModal(note);
        }
    });

    // --- MODAL CONTROLS ---
    const addModal = document.getElementById('addModal');
    const editModal = document.getElementById('editModal');
    const viewModal = document.getElementById('viewModal');

    // Variabel Tombol View Modal (Hybrid)
    const viewBackBtn = document.getElementById('viewBackBtn');
    const viewMenuBtn = document.getElementById('viewMenuBtn');
    const viewNoteDropdownMenu = document.getElementById('viewNoteDropdownMenu');
    // Tombol Desktop
    const viewHeaderEditBtn = document.getElementById('viewHeaderEditBtn');
    const viewHeaderDeleteBtn = document.getElementById('viewHeaderDeleteBtn');
    const viewHeaderArchiveBtn = document.getElementById('viewHeaderArchiveBtn');
    const viewHeaderUnarchiveBtn = document.getElementById('viewHeaderUnarchiveBtn');
    // Tombol Mobile
    const viewMenuEdit = document.getElementById('viewMenuEdit');
    const viewMenuDelete = document.getElementById('viewMenuDelete');
    const viewMenuArchive = document.getElementById('viewMenuArchive');
    const viewMenuUnarchive = document.getElementById('viewMenuUnarchive');


    // --- Logika Tombol ESC ---
    window.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' || e.key === 'Esc') {
            const confirmModal = document.getElementById('customConfirmModal');
            if (confirmModal) {
                const cancelBtn = confirmModal.querySelector('.btn-secondary');
                if (cancelBtn) {
                    cancelBtn.click();
                }
                return; 
            }
            if (addModal.classList.contains('is-visible')) {
                addModal.classList.remove('is-visible');
            } else if (editModal.classList.contains('is-visible')) {
                editModal.classList.remove('is-visible');
            } else if (viewModal.classList.contains('is-visible')) {
                viewModal.classList.remove('is-visible');
                viewNoteDropdownMenu.classList.remove('is-visible');
            }
        }
    });

    // Add Modal
    document.getElementById('openAddModalBtnMobile').addEventListener('click', openAddModal);
    document.getElementById('openAddModalBtn').addEventListener('click', openAddModal); 
    document.getElementById('cancelAdd').addEventListener('click', () => addModal.classList.remove('is-visible'));

    document.getElementById('addNoteForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const tags = document.getElementById('noteTags').value.split(',').map(tag => tag.trim()).filter(Boolean);
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
    });

    // Edit Modal
    document.getElementById('cancelEdit').addEventListener('click', () => editModal.classList.remove('is-visible'));
    document.getElementById('editNoteForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const noteId = document.getElementById('editNoteId').value;
        const noteRef = doc(db, notesCollectionRef.path, noteId);
        const tags = document.getElementById('editNoteTags').value.split(',').map(tag => tag.trim()).filter(Boolean);
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
    });

    // Tombol 'X' View Modal
    document.getElementById('closeView').addEventListener('click', () => {
        viewModal.classList.remove('is-visible');
        viewNoteDropdownMenu.classList.remove('is-visible'); 
    });

    // --- Listener Baru untuk View Modal (Hybrid) ---
    viewBackBtn.addEventListener('click', () => {
        viewModal.classList.remove('is-visible');
        viewNoteDropdownMenu.classList.remove('is-visible'); 
    });

    viewMenuBtn.addEventListener('click', (e) => {
        e.stopPropagation(); 
        viewNoteDropdownMenu.classList.toggle('is-visible');
    });

    // --- Terapkan fungsi Aksi ke tombol-tombolnya ---
    viewHeaderEditBtn.addEventListener('click', (e) => editNoteAction(e.currentTarget.dataset.id));
    viewMenuEdit.addEventListener('click', (e) => editNoteAction(e.currentTarget.dataset.id));

    viewHeaderDeleteBtn.addEventListener('click', (e) => deleteNoteAction(e.currentTarget.dataset.id));
    viewMenuDelete.addEventListener('click', (e) => deleteNoteAction(e.currentTarget.dataset.id));

    viewHeaderArchiveBtn.addEventListener('click', (e) => archiveNoteAction(e.currentTarget.dataset.id));
    viewMenuArchive.addEventListener('click', (e) => archiveNoteAction(e.currentTarget.dataset.id));

    viewHeaderUnarchiveBtn.addEventListener('click', (e) => unarchiveNoteAction(e.currentTarget.dataset.id));
    viewMenuUnarchive.addEventListener('click', (e) => unarchiveNoteAction(e.currentTarget.dataset.id));

    document.getElementById('editFab').addEventListener('click', (e) => {
        editNoteAction(e.currentTarget.dataset.id);
    });

    // Logika untuk menutup modal saat klik overlay
    [addModal, editModal, viewModal].forEach(modal => {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) { 
                modal.classList.remove('is-visible');
            }
        });
    });

} // --- AKHIR DARI initializeDOMListeners ---


// --- AUTH & INITIALIZATION (BAGIAN 2) ---
// PERBAIKAN: Pindahkan semua definisi fungsi ke ATAS
// sebelum dipanggil oleh onAuthStateChanged

// Fungsi untuk menerapkan tema
function setTheme(theme) {
    if (theme === 'dark') {
        document.body.classList.add('dark-mode');
        localStorage.setItem('theme', 'dark');
    } else {
        document.body.classList.remove('dark-mode');
        localStorage.setItem('theme', 'light');
    }
}

// Fungsi untuk menutup sidebar (mobile & desktop)
function closeSidebar() {
    const sidebar = document.getElementById('sidebar');
    const sidebarOverlay = document.getElementById('sidebar-overlay');
    if (sidebar) sidebar.classList.remove('is-open'); 
    if (sidebarOverlay) sidebarOverlay.classList.remove('is-visible'); 
    
    if (window.innerWidth >= 768) {
        if (sidebar) sidebar.classList.add('is-collapsed');
    }
}

// Fungsi untuk toggle (buka/tutup) sidebar
function toggleSidebar() {
    const sidebar = document.getElementById('sidebar');
    const sidebarOverlay = document.getElementById('sidebar-overlay');
    if (sidebar) sidebar.classList.toggle('is-open'); 
    if (sidebarOverlay) sidebarOverlay.classList.toggle('is-visible'); 
    
    if (window.innerWidth >= 768) {
        if (sidebar) sidebar.classList.toggle('is-collapsed');
    }
}

// --- RICH TEXT EDITOR SETUP ---
function initializeEditors() {
    const toolbarOptions = [
        [{ 'header': [1, 2, 3, false] }],
        ['bold', 'italic', 'underline'],
        [{ 'list': 'ordered'}, { 'list': 'bullet' }],
        ['clean']
    ];
    // Hanya inisialisasi jika container ada dan belum diinisialisasi
    try {
        const addContainer = document.getElementById('add-editor');
        const editContainer = document.getElementById('edit-editor');

        if (addContainer && !addEditor && typeof Quill !== 'undefined') {
            addEditor = new Quill(addContainer, { theme: 'snow', modules: { toolbar: toolbarOptions } });
        }
        if (editContainer && !editEditor && typeof Quill !== 'undefined') {
            editEditor = new Quill(editContainer, { theme: 'snow', modules: { toolbar: toolbarOptions } });
        }
    } catch (err) {
        console.warn('initializeEditors error (ignored):', err);
        // fallback ringan agar kode lain tidak crash
        if (!addEditor) addEditor = { root: { innerHTML: '' }, getText: () => '', setText: () => {} };
        if (!editEditor) editEditor = { root: { innerHTML: '' }, getText: () => '', setText: () => {} };
    }
}

// --- TAMBAHAN: buka modal Add ---
function openAddModal() {
    const addModal = document.getElementById('addModal');
    if (!addModal) {
        console.warn('openAddModal: addModal not found');
        return;
    }
    // pastikan editor siap
    initializeEditors();
    addModal.classList.add('is-visible');

    const titleInput = document.getElementById('noteTitle');
    if (titleInput) titleInput.focus();
}

// --- NOTES LOGIC ---
function setupNotesCollection() {
    if (userId) notesCollectionRef = collection(db, `/users/${userId}/notes`);
}

// --- Fitur 3: Tampilan Grid/List ---
function setViewMode(mode) {
    const notesListContainer = document.getElementById('notesList');
    const gridViewBtn = document.getElementById('gridViewBtn');
    const listViewBtn = document.getElementById('listViewBtn');
    
    if (mode === 'list') {
        currentViewMode = 'list';
        if (notesListContainer) notesListContainer.classList.add('notes-list-mode');
        if (gridViewBtn) gridViewBtn.classList.remove('active');
        if (listViewBtn) listViewBtn.classList.add('active');
        localStorage.setItem('viewMode', 'list');
    } else {
        currentViewMode = 'grid';
        if (notesListContainer) notesListContainer.classList.remove('notes-list-mode');
        if (listViewBtn) listViewBtn.classList.remove('active');
        if (gridViewBtn) gridViewBtn.classList.add('active');
        localStorage.setItem('viewMode', 'grid');
    }
}

function initializeViewMode() {
    // Terapkan mode yang tersimpan
    const savedViewMode = localStorage.getItem('viewMode');
    setViewMode(savedViewMode || 'grid'); // Default 'grid'
}


// --- Fitur 2 & 4: Pin & Arsip ---
function loadNotes() {
    if (!notesCollectionRef) {
        console.warn('loadNotes: notesCollectionRef belum diset, tidak dapat memuat catatan.');
        return;
    }

    // Hentikan listener lama jika ada
    if (typeof notesListener === 'function') {
        try { notesListener(); } catch(err){ /* ignore */ }
        notesListener = null;
    }

    const isArchived = (currentFilter === "archived");
    const headerTitle = isArchived ? "Arsip" : "Semua Catatan";
    const headerEl = document.getElementById('notesHeader');
    if (headerEl) headerEl.textContent = headerTitle;

    // Buat query (pastikan field yang dipakai ada di dokumen)
    const q = query(
        notesCollectionRef,
        where("isArchived", "==", isArchived),
        orderBy("isPinned", "desc"),
        orderBy("createdAt", "desc")
    );

    // Pasang onSnapshot dengan logging supaya mudah debug
    notesListener = onSnapshot(q,
        (snapshot) => {
            console.log('loadNotes onSnapshot — docs:', snapshot.size);
            // Map dokumen ke array yang konsisten
            allNotes = snapshot.docs.map(doc => {
                const data = doc.data();
                return {
                    id: doc.id,
                    title: data.title || '',
                    content: data.content || '',
                    plainText: data.plainText || '',
                    category: data.category || 'Uncategorized',
                    tags: Array.isArray(data.tags) ? data.tags : [],
                    productLink: data.productLink || '',
                    createdAt: data.createdAt || null,
                    isPinned: !!data.isPinned,
                    isArchived: !!data.isArchived
                };
            });

            console.log('Mapped allNotes:', allNotes);
            renderNotes(allNotes);
        },
        (error) => {
            console.error('loadNotes onSnapshot error:', error);
            const notesListContainer = document.getElementById('notesList');
            if (notesListContainer) {
                notesListContainer.innerHTML = '<p class="notes-empty-message">Gagal memuat catatan. Lihat console untuk detail.</p>';
            }
        }
    );
}

// --- Fitur 4: Arsip ---
function filterAndRenderNotes() {
    const searchTerm = (document.getElementById('searchInput').value || document.getElementById('mobileSearchInput').value).toLowerCase();
    let filtered = allNotes;

    // Hanya filter kategori JIKA kita TIDAK sedang di tampilan Arsip
    if (currentFilter !== "archived" && currentCategory !== "All") {
        filtered = filtered.filter(note => note.category === currentCategory);
    }

    // Filter pencarian tetap berjalan
    if (searchTerm) {
        filtered = filtered.filter(note => 
            note.title.toLowerCase().includes(searchTerm) || 
            (note.plainText && note.plainText.toLowerCase().includes(searchTerm)) ||
            (note.tags && note.tags.some(tag => tag.toLowerCase().includes(searchTerm)))
        );
    }
    renderNotes(filtered);
}

// --- Fitur 2 & 4: Tombol Pin & Arsip ---
function renderNotes(notesToRender) {
    const notesListContainer = document.getElementById('notesList');
    if (!notesListContainer) return; // Pengaman jika notesListContainer null
    
    setViewMode(currentViewMode); 
    
    notesListContainer.innerHTML = ''; 
    if (notesToRender.length === 0) {
        const message = (currentFilter === 'archived') ? "Arsip Tuan Cecep kosong." : "Tidak ada catatan ditemukan.";
        notesListContainer.innerHTML = `<p class="notes-empty-message">${message}</p>`;
    } else {
        notesToRender.forEach(note => {
            const noteElement = document.createElement('div');
            noteElement.className = 'note-card'; 
            noteElement.dataset.id = note.id;
            
            if (note.isPinned) {
                noteElement.classList.add('is-pinned');
            }
            
            const tagsHTML = (note.tags || []).map(tag => `<span class="note-tag">${escapeHTML(tag)}</span>`).join('');
            
            const dateToDisplay = (note.createdAt && note.createdAt.toDate) ? (note.updatedAt || note.createdAt).toDate() : new Date();
            const dateOptions = { year: 'numeric', month: 'long', day: 'numeric' };
            const formattedDate = dateToDisplay.toLocaleDateString('id-ID', dateOptions);

            const archiveButton = (note.isArchived)
                ? `<button data-id="${note.id}" class="note-action-btn unarchive-btn" title="Batal Arsip"><i class="fas fa-undo"></i></button>`
                : `<button data-id="${note.id}" class="note-action-btn archive-btn" title="Arsipkan"><i class="fas fa-archive"></i></button>`;

            const pinButtonClass = note.isPinned ? 'active' : '';
            const pinButton = (currentFilter !== 'archived')
                ? `<button data-id="${note.id}" class="note-action-btn pin-btn ${pinButtonClass}" title="Sematkan"><i class="fas fa-thumbtack"></i></button>`
                : '';

            noteElement.innerHTML = `
                <div class="note-card-body">
                    <div class="note-card-header">
                        <p class="note-card-category">${escapeHTML(note.category || 'Uncategorized')}</p>
                        <p class="note-card-date">${formattedDate}</p>
                    </div>
                    <h3 class="note-card-title">${escapeHTML(note.title)}</h3>
                    <p class="note-card-content">${escapeHTML((note.plainText || '').substring(0, 100))}${ (note.plainText || '').length > 100 ? '...' : ''}</p>
                </div>
                <div class="note-card-footer">
                    <div class="note-card-tags">${tagsHTML}</div>
                    <div class="note-card-actions">
                        ${pinButton} 
                        <button data-id="${note.id}" class="note-action-btn edit-btn" title="Edit"><i class="fas fa-pencil-alt"></i></button>
                        ${archiveButton} 
                        <button data-id="${note.id}" class="note-action-btn delete-btn" title="Hapus"><i class="fas fa-trash"></i></button>
                    </div>
                </div>
            `;
            notesListContainer.appendChild(noteElement);
        });
    }
}

// Edit Modal
function showEditModal(note) {
    const editModal = document.getElementById('editModal');
    document.getElementById('editNoteId').value = note.id;
    document.getElementById('editNoteTitle').value = note.title;
    editEditor.root.innerHTML = note.content;
    document.getElementById('editNoteCategory').value = note.category;
    document.getElementById('editNoteTags').value = (note.tags || []).join(', ');
    document.getElementById('editNoteLink').value = note.productLink || '';
    editModal.classList.add('is-visible');
}

// View Modal
function showViewModal(note) {
    const viewModal = document.getElementById('viewModal');
    const viewNoteDropdownMenu = document.getElementById('viewNoteDropdownMenu');
    // Tombol Desktop
    const viewHeaderArchiveBtn = document.getElementById('viewHeaderArchiveBtn');
    const viewHeaderUnarchiveBtn = document.getElementById('viewHeaderUnarchiveBtn');
    // Tombol Mobile
    const viewMenuArchive = document.getElementById('viewMenuArchive');
    const viewMenuUnarchive = document.getElementById('viewMenuUnarchive');

    const contentContainer = document.getElementById('viewNoteContent');
    const productLinkContainer = document.getElementById('productLinkContainer');
    const viewProductLink = document.getElementById('viewProductLink');
    
    document.getElementById('viewNoteTitle').textContent = note.title;
    document.getElementById('viewNoteCategory').textContent = note.category;
    contentContainer.innerHTML = note.content;
    linkifyContainer(contentContainer); 
    
    const dateToDisplay = (note.createdAt && note.createdAt.toDate) ? (note.updatedAt || note.createdAt).toDate() : new Date();
    const options = { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' };
    const dateLabel = note.updatedAt ? 'Terakhir diubah' : 'Dibuat pada';
    document.getElementById('viewNoteDate').textContent = `${dateLabel} ${dateToDisplay.toLocaleDateString('id-ID', options)}`;

    const tagsContainer = document.getElementById('viewNoteTags');
    tagsContainer.innerHTML = (note.tags || []).map(tag => `<span class="note-tag">${escapeHTML(tag)}</span>`).join('');
    
    if (note.productLink) {
        viewProductLink.href = note.productLink;
        viewProductLink.textContent = note.productLink;
        productLinkContainer.classList.remove('hidden'); 
    } else {
        productLinkContainer.classList.add('hidden');
    }
    
    if (note.isArchived) {
        viewHeaderArchiveBtn.style.display = 'none';
        viewMenuArchive.style.display = 'none';
        viewHeaderUnarchiveBtn.style.display = 'flex'; 
        viewMenuUnarchive.style.display = 'flex'; 
    } else {
        viewHeaderArchiveBtn.style.display = 'flex';
        viewMenuArchive.style.display = 'flex';
        viewHeaderUnarchiveBtn.style.display = 'none';
        viewMenuUnarchive.style.display = 'none';
    }

    document.getElementById('viewHeaderEditBtn').dataset.id = note.id;
    document.getElementById('viewHeaderDeleteBtn').dataset.id = note.id;
    viewHeaderArchiveBtn.dataset.id = note.id;
    viewHeaderUnarchiveBtn.dataset.id = note.id;
    
    document.getElementById('viewMenuEdit').dataset.id = note.id;
    document.getElementById('viewMenuDelete').dataset.id = note.id;
    viewMenuArchive.dataset.id = note.id;
    viewMenuUnarchive.dataset.id = note.id;
    
    viewNoteDropdownMenu.classList.remove('is-visible');
    viewModal.classList.add('is-visible'); 
}

// --- Fungsi Aksi Terpusat ---

const editNoteAction = (noteId) => {
    if (noteId) {
        const note = allNotes.find(n => n.id === noteId);
        if (note) {
            document.getElementById('viewModal').classList.remove('is-visible');
            document.getElementById('viewNoteDropdownMenu').classList.remove('is-visible'); 
            showEditModal(note); 
        }
    }
};

const deleteNoteAction = (noteId) => {
    const noteRef = doc(db, notesCollectionRef.path, noteId);
    document.getElementById('viewNoteDropdownMenu').classList.remove('is-visible'); 
    
    showConfirmModal('Anda yakin ingin menghapus catatan ini?', async () => {
        await deleteDoc(noteRef);
        document.getElementById('viewModal').classList.remove('is-visible'); 
    });
};

const archiveNoteAction = (noteId) => {
    const noteRef = doc(db, notesCollectionRef.path, noteId);
    updateDoc(noteRef, { isArchived: true, isPinned: false });
    document.getElementById('viewModal').classList.remove('is-visible'); 
};
const unarchiveNoteAction = (noteId) => {
    const noteRef = doc(db, notesCollectionRef.path, noteId);
    updateDoc(noteRef, { isArchived: false });
    document.getElementById('viewModal').classList.remove('is-visible'); 
};

// --- CUSTOM CONFIRM MODAL ---
function showConfirmModal(message, onConfirm) {
    const existingModal = document.getElementById('customConfirmModal');
    if (existingModal) existingModal.remove();

    const modalOverlay = document.createElement('div');
    modalOverlay.id = 'customConfirmModal';
    modalOverlay.className = 'modal-overlay is-visible'; 
    modalOverlay.style.zIndex = "100"; 

    const modalContent = document.createElement('div');
    modalContent.className = 'modal-content';
    modalContent.style.maxWidth = '400px'; 

    const modalBody = document.createElement('div');
    modalBody.className = 'modal-body';
    modalBody.style.paddingBottom = '1.5rem';
    
    const messageP = document.createElement('p');
    messageP.textContent = message;
    modalBody.appendChild(messageP);

    const modalFooter = document.createElement('div');
    modalFooter.className = 'modal-footer';

    const cancelBtn = document.createElement('button');
    cancelBtn.textContent = 'Batal';
    cancelBtn.className = 'btn btn-secondary'; 

    const confirmBtn = document.createElement('button');
    confirmBtn.textContent = 'Hapus';
    confirmBtn.className = 'btn btn-danger'; 

    modalFooter.appendChild(cancelBtn);
    modalFooter.appendChild(confirmBtn);
    modalContent.appendChild(modalBody);
    modalContent.appendChild(modalFooter);
    modalOverlay.appendChild(modalContent);
    document.body.appendChild(modalOverlay);

    const closeModal = () => modalOverlay.remove();
    
    cancelBtn.addEventListener('click', closeModal);
    modalOverlay.addEventListener('click', (e) => {
        if (e.target === modalOverlay) closeModal();
    });
    confirmBtn.addEventListener('click', () => {
        onConfirm();
        closeModal();
    });
}

// --- HELPER FUNCTIONS ---
function linkifyContainer(container) {
    const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
    const nodesToProcess = [];
    let node;
    while (node = walker.nextNode()) {
        if (node.parentElement.tagName !== 'A') {
            nodesToProcess.push(node);
        }
    }

    nodesToProcess.forEach(node => {
        const text = node.nodeValue;
        const urlRegex = /\b((https?:\/\/|www\.)[^\s,"<>()]+|[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}([^\s,"<>()]*))\b/gi;
        if (!urlRegex.test(text)) return;

        const fragment = document.createDocumentFragment();
        let lastIndex = 0;
        text.replace(urlRegex, (match, ...args) => {
            const offset = args[args.length - 2];
            if (offset > lastIndex) {
                fragment.appendChild(document.createTextNode(text.substring(lastIndex, offset)));
            }
            const a = document.createElement('a');
            let href = match;
            if (!/^(https?:\/\/)/i.test(href)) {
                href = 'http://' + href;
            }
            a.href = href;
            a.target = '_blank';
            a.rel = 'noopener noreferrer';
            a.className = 'text-link'; 
            a.textContent = match;
            fragment.appendChild(a);
            lastIndex = offset + match.length;
        });

        if (lastIndex < text.length) {
            fragment.appendChild(document.createTextNode(text.substring(lastIndex)));
        }
        node.parentNode.replaceChild(fragment, node);
    });
}

function escapeHTML(str) {
    if (!str) return '';
    const p = document.createElement('p');
    p.appendChild(document.createTextNode(str));
    return p.innerHTML;
}


// --- TITIK MASUK SCRIPT ---
// Jalankan onAuthStateChanged untuk memulai aplikasi
onAuthStateChanged(auth, (user) => {
    if (user) {
        userId = user.uid;
        // Set info user di header
        document.getElementById('userNameDisplay').textContent = user.displayName || user.email.split('@')[0];
        document.getElementById('userEmailDisplay').textContent = user.email;
        
        // Panggil semua fungsi inisialisasi SETELAH user login
        setupNotesCollection();
        initializeEditors(); 
        initializeDOMListeners(); // <-- Ini akan memasang semua listener DOM
        loadNotes(); 
        
    } else {
        window.location.href = 'login.html';
    }
});