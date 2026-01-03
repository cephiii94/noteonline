// script/main.js
import { auth } from '../firebase-config.js';
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import * as Utils from './utils.js';
import * as FirebaseService from './firebase-service.js';
import * as UI from './ui-handler.js';

// --- Global State ---
let userId = null;
let allNotes = [];       // Menyimpan SEMUA data mentah dari Firebase
let currentCategory = "All";
let currentFilter = "all"; // 'all' (Utama) atau 'archived' (Arsip)

// --- 1. SETUP AWAL (Si Bos Masuk Kantor) ---
onAuthStateChanged(auth, (user) => {
    if (user) {
        // 1. Set Identitas
        userId = user.uid;
        document.getElementById('userNameDisplay').textContent = user.displayName || user.email.split('@')[0];
        document.getElementById('userEmailDisplay').textContent = user.email;

        // 2. Siapkan Alat
        try { UI.initializeEditors(); } catch(e) { console.error("Editor Error:", e); }
        initializeEventListeners();
        
        // 3. Ambil Data
        refreshNotesData(); 
    } else {
        window.location.href = 'login.html';
    }
});

function refreshNotesData() {
    // Panggil Service Firebase (yang sekarang mengambil SEMUA data)
    FirebaseService.subscribeToNotes(userId, currentFilter, currentCategory, (notes) => {
        // console.log("🔥 Data masuk:", notes.length); // Uncomment untuk debug
        allNotes = notes; // Simpan data mentah
        filterAndRender(); // Lanjut ke penyaringan
    }, (error) => {
        console.error("Error Database:", error);
    });
}

// --- LOGIKA PENYARINGAN CERDAS ---
function filterAndRender() {
    // 1. Ambil Text Pencarian
    const searchValDesktop = document.getElementById('searchInput') ? document.getElementById('searchInput').value.toLowerCase() : '';
    const searchValMobile = document.getElementById('mobileSearchInput') ? document.getElementById('mobileSearchInput').value.toLowerCase() : '';
    const searchQuery = searchValDesktop || searchValMobile;

    // 2. FILTER (Memisahkan Aktif vs Arsip)
    let filteredNotes = allNotes.filter(note => {
        // PENTING: Catatan lama 'isArchived'-nya undefined. Kita anggap false (Aktif).
        const isNoteArchived = note.isArchived === true; 

        // Logika Menu Arsip vs Menu Utama
        if (currentFilter === 'archived') {
            if (!isNoteArchived) return false; // Hanya tampilkan yang BENAR-BENAR arsip
        } else {
            if (isNoteArchived) return false;  // Sembunyikan yang arsip
            // Filter Kategori (Hanya di menu utama)
            if (currentCategory !== 'All' && note.category !== currentCategory) return false;
        }

        // Filter Pencarian (Search)
        if (searchQuery) {
            const title = note.title ? note.title.toLowerCase() : '';
            const content = note.plainText ? note.plainText.toLowerCase() : '';
            const tags = note.tags ? note.tags.join(' ').toLowerCase() : '';
            return title.includes(searchQuery) || content.includes(searchQuery) || tags.includes(searchQuery);
        }

        return true;
    });

    // 3. SORTING (Urutkan Data - BAGIAN YANG DIPERBAIKI BRI)
    filteredNotes.sort((a, b) => {
        // A. Prioritas Pin (Hanya di menu utama)
        if (currentFilter !== 'archived') {
            const pinA = a.isPinned === true ? 1 : 0;
            const pinB = b.isPinned === true ? 1 : 0;
            if (pinA !== pinB) return pinB - pinA; // Yang dipin naik ke atas
        }
        
        // B. Prioritas Waktu (Terbaru di atas)
        // --- HELP FUNCTION PINTAR: Handle Date vs Timestamp ---
        const getTime = (dateObj) => {
            if (!dateObj) return 0;
            // Kalau punya toDate() pakai itu, kalau tidak anggap Date biasa
            return typeof dateObj.toDate === 'function' ? dateObj.toDate().getTime() : new Date(dateObj).getTime();
        };

        const timeA = getTime(a.updatedAt);
        const timeB = getTime(b.updatedAt);
        
        return timeB - timeA; // Urutkan dari yang paling besar (terbaru)
    });

    // 4. Tampilkan ke Layar
    UI.renderNotesList(filteredNotes, currentFilter, 'notesList');
}


// --- 2. EVENT LISTENERS (Menghubungkan Tombol dengan Fungsi) ---
function initializeEventListeners() {

    // --- Helper untuk Tombol Aksi ---
    const handleNoteAction = (action, id) => {
        if(!id) return;
        const note = allNotes.find(n => n.id === id);
        
        if (action === 'pin') FirebaseService.togglePinNote(userId, id, note.isPinned);
        
        if (action === 'archive') {
            FirebaseService.setArchiveStatus(userId, id, true);
            UI.closeModal('viewModal');
        }
        
        if (action === 'unarchive') {
            FirebaseService.setArchiveStatus(userId, id, false);
            UI.closeModal('viewModal');
        }
        
        if (action === 'delete') {
            if(confirm('Hapus catatan ini selamanya?')) {
                FirebaseService.deleteNoteFromFirestore(userId, id);
                UI.closeModal('viewModal');
            }
        }
        
        if (action === 'edit') {
            UI.fillEditForm(note);
            UI.openModal('editModal');
            UI.closeModal('viewModal');
        }
        
        if (action === 'view') UI.showViewModal(note);
    };

    // --- UI Dasar ---
    Utils.safeAddListener('mobile-menu-toggle', 'click', Utils.toggleSidebar);
    Utils.safeAddListener('desktop-menu-toggle', 'click', Utils.toggleSidebar);
    Utils.safeAddListener('sidebar-overlay', 'click', Utils.closeSidebar);
    Utils.safeAddListener('logoutBtn', 'click', FirebaseService.logoutUser);

    // Dark Mode
    Utils.safeAddListener('themeToggle', 'click', () => {
        const isDark = document.body.classList.contains('dark-mode');
        Utils.setTheme(isDark ? 'light' : 'dark');
    });
    const savedTheme = localStorage.getItem('theme');
    if(savedTheme) Utils.setTheme(savedTheme);

    // View Mode (Grid/List)
    const savedView = localStorage.getItem('viewMode') || 'grid';
    UI.setViewMode(savedView);
    Utils.safeAddListener('gridViewBtn', 'click', () => UI.setViewMode('grid'));
    Utils.safeAddListener('listViewBtn', 'click', () => UI.setViewMode('list'));

    // Search
    Utils.safeAddListener('searchInput', 'input', filterAndRender);
    Utils.safeAddListener('mobileSearchInput', 'input', filterAndRender);

    // --- Filter Kategori ---
    document.querySelectorAll('.category-filter').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            currentFilter = 'all';
            currentCategory = e.currentTarget.dataset.category;
            
            // Update Teks Header
            const headerEl = document.getElementById('notesHeader');
            if(headerEl) headerEl.textContent = currentCategory === 'All' ? 'Semua Catatan' : `Kategori: ${currentCategory}`;
            
            // Update Tombol Aktif
            document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active-link'));
            e.currentTarget.classList.add('active-link');
            
            // Render ulang (tanpa fetch ulang, karena data sudah ada di allNotes)
            filterAndRender(); 
            if (window.innerWidth < 768) Utils.closeSidebar();
        });
    });

    // --- Filter Arsip ---
    const archiveBtn = document.querySelector('.archive-filter');
    if(archiveBtn) {
        archiveBtn.addEventListener('click', (e) => {
            e.preventDefault();
            currentFilter = 'archived';
            currentCategory = 'All';

            const headerEl = document.getElementById('notesHeader');
            if(headerEl) headerEl.textContent = 'Arsip Catatan';

            document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active-link'));
            e.currentTarget.classList.add('active-link');
            
            filterAndRender();
            if (window.innerWidth < 768) Utils.closeSidebar();
        });
    }

    // --- Modal Controls ---
    Utils.safeAddListener('openAddModalBtnMobile', 'click', () => { UI.resetAddEditor(); UI.openModal('addModal'); });
    Utils.safeAddListener('openAddModalBtn', 'click', () => { UI.resetAddEditor(); UI.openModal('addModal'); });
    Utils.safeAddListener('cancelAdd', 'click', () => UI.closeModal('addModal'));
    Utils.safeAddListener('cancelEdit', 'click', () => UI.closeModal('editModal'));
    Utils.safeAddListener('closeView', 'click', () => UI.closeModal('viewModal'));
    Utils.safeAddListener('viewBackBtn', 'click', () => UI.closeModal('viewModal'));

    // Menu Dropdown & Klik Luar
    Utils.safeAddListener('viewMenuBtn', 'click', (e) => {
        e.stopPropagation();
        document.getElementById('viewNoteDropdownMenu').classList.toggle('is-visible');
    });
    window.addEventListener('click', (e) => {
        const drop = document.getElementById('viewNoteDropdownMenu');
        if(drop && drop.classList.contains('is-visible')) {
            if(!drop.contains(e.target) && !e.target.closest('#viewMenuBtn')) {
                drop.classList.remove('is-visible');
            }
        }
        ['addModal', 'editModal', 'viewModal'].forEach(id => {
            const m = document.getElementById(id);
            if(m && e.target === m) UI.closeModal(id);
        });
    });

    // --- Delegasi Tombol Aksi (List Utama) ---
    const listContainer = document.getElementById('notesList');
    if(listContainer) {
        listContainer.addEventListener('click', (e) => {
            const btn = e.target.closest('.note-action-btn');
            const card = e.target.closest('.note-card');
            
            if(btn) {
                e.stopPropagation();
                const id = btn.dataset.id;
                if(btn.classList.contains('pin-btn')) handleNoteAction('pin', id);
                if(btn.classList.contains('archive-btn')) handleNoteAction('archive', id);
                if(btn.classList.contains('unarchive-btn')) handleNoteAction('unarchive', id);
                if(btn.classList.contains('delete-btn')) handleNoteAction('delete', id);
                if(btn.classList.contains('edit-btn')) handleNoteAction('edit', id);
            } else if (card) {
                handleNoteAction('view', card.dataset.id);
            }
        });
    }

    // --- Delegasi Tombol Aksi (Dalam Modal View) ---
    const actionIds = [
        'viewHeaderEditBtn', 'viewMenuEdit', 'viewFooterEditBtn', 'editFab',
        'viewHeaderDeleteBtn', 'viewMenuDelete', 'viewFooterDeleteBtn',
        'viewHeaderArchiveBtn', 'viewMenuArchive', 'viewFooterArchiveBtn',
        'viewHeaderUnarchiveBtn', 'viewMenuUnarchive', 'viewFooterUnarchiveBtn'
    ];
    actionIds.forEach(id => {
        const btn = document.getElementById(id);
        if(btn) {
            btn.addEventListener('click', (e) => {
                const noteId = e.currentTarget.dataset.id;
                // Mapping ID ke Action
                if(id.includes('Edit') || id.includes('Fab')) handleNoteAction('edit', noteId);
                if(id.includes('Delete')) handleNoteAction('delete', noteId);
                if(id.includes('Archive') && !id.includes('Unarchive')) handleNoteAction('archive', noteId);
                if(id.includes('Unarchive')) handleNoteAction('unarchive', noteId);
            });
        }
    });

// script/main.js - Bagian paling bawah (Submit Forms)

    // 1. Tambah Catatan (FIX: Data diambil DULUAN sebelum reset)
    Utils.safeAddListener('addNoteForm', 'submit', (e) => {
        e.preventDefault();
        
        const submitBtn = e.target.querySelector('button[type="submit"]');
        const originalBtnText = submitBtn ? submitBtn.innerHTML : 'Simpan';

        // A. KUNCI TOMBOL
        if(submitBtn) {
            submitBtn.disabled = true;
            submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Proses...';
        }

        try {
            // B. AMBIL DATA DULUAN (PENTING: Masukkan ke variabel agar tidak hilang saat reset)
            const titleVal = document.getElementById('noteTitle').value; // Ambil Judul
            const categoryVal = document.getElementById('noteCategory').value; // Ambil Kategori
            const linkVal = document.getElementById('noteLink').value; // Ambil Link
            const editorContent = UI.getEditorContent('add');
            const tags = document.getElementById('noteTags').value.split(',').map(t=>t.trim()).filter(Boolean);
            
            // C. TUTUP MODAL & RESET FORM
            UI.closeModal('addModal'); 
            e.target.reset(); 
            if (typeof UI.resetAddEditor === 'function') UI.resetAddEditor();

            // D. KIRIM DATA DARI VARIABEL (Bukan document.getElementById lagi)
            FirebaseService.addNoteToFirestore(userId, {
                title: titleVal,       // Pakai variabel
                category: categoryVal, // Pakai variabel
                productLink: linkVal,  // Pakai variabel
                content: editorContent.html,
                plainText: editorContent.text,
                tags: tags
            })
            .then(() => console.log("✅ Sukses tersimpan"))
            .catch(err => {
                console.error("❌ Gagal simpan:", err);
                alert("Gagal menyimpan: " + err.message);
            })
            .finally(() => {
                // E. KEMBALIKAN TOMBOL
                if(submitBtn) {
                    submitBtn.disabled = false;
                    submitBtn.innerHTML = originalBtnText;
                }
            });

        } catch (error) {
            console.error("Error Sistem:", error);
            if(submitBtn) {
                submitBtn.disabled = false;
                submitBtn.innerHTML = originalBtnText;
            }
        }
    });

    // 2. Edit Catatan (FIX: Data diambil DULUAN)
    Utils.safeAddListener('editNoteForm', 'submit', (e) => {
        e.preventDefault();
        
        const submitBtn = e.target.querySelector('button[type="submit"]');
        const originalBtnText = submitBtn ? submitBtn.innerHTML : 'Update';

        if(submitBtn) {
            submitBtn.disabled = true;
            submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Proses...';
        }

        try {
            // Ambil Data ke Variabel
            const noteId = document.getElementById('editNoteId').value;
            const titleVal = document.getElementById('editNoteTitle').value;
            const categoryVal = document.getElementById('editNoteCategory').value;
            const linkVal = document.getElementById('editNoteLink').value;
            const editorContent = UI.getEditorContent('edit');
            const tags = document.getElementById('editNoteTags').value.split(',').map(t=>t.trim()).filter(Boolean);

            UI.closeModal('editModal');

            FirebaseService.updateNoteInFirestore(userId, noteId, {
                title: titleVal,
                category: categoryVal,
                productLink: linkVal,
                content: editorContent.html,
                plainText: editorContent.text,
                tags: tags
            })
            .then(() => console.log("✅ Update sukses"))
            .catch(err => {
                console.error("❌ Gagal update:", err);
                alert("Gagal update: " + err.message);
            })
            .finally(() => {
                if(submitBtn) {
                    submitBtn.disabled = false;
                    submitBtn.innerHTML = originalBtnText;
                }
            });
        } catch (error) {
            console.error("Error Sistem:", error);
            if(submitBtn) {
                submitBtn.disabled = false;
                submitBtn.innerHTML = originalBtnText;
            }
        }
    });
}