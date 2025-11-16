// Impor konfigurasi Firebase dari file terpisah
import { auth, db } from '../firebase-config.js';
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { collection, addDoc, onSnapshot, doc, getDoc, updateDoc, deleteDoc, setLogLevel } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

setLogLevel('debug');

let userId = null;
let notesCollectionRef = null;
let allNotes = [];
let currentCategory = "All";
let addEditor, editEditor;

// --- PWA INSTALL PROMPT LOGIC ---
let deferredPrompt;
const installAppContainer = document.getElementById('installAppContainer');
const installAppSidebarBtn = document.getElementById('installAppSidebarBtn');

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


// --- AUTH & INITIALIZATION ---
onAuthStateChanged(auth, (user) => {
    if (user) {
        userId = user.uid;
        document.getElementById('userNameDisplay').textContent = user.displayName || user.email.split('@')[0];
        document.getElementById('userEmailDisplay').textContent = user.email;
        setupNotesCollection();
        loadNotes();
        initializeEditors();
    } else {
        window.location.href = 'login.html';
    }
});

document.getElementById('logoutBtn').addEventListener('click', () => signOut(auth));

// --- UI & EVENT LISTENERS (LOGIKA BARU UNTUK VANILLA CSS) ---
const menuToggle = document.getElementById('menu-toggle');
const sidebarOverlay = document.getElementById('sidebar-overlay');
const sidebar = document.getElementById('sidebar');

// Fungsi untuk menutup sidebar (mobile & desktop)
function closeSidebar() {
    sidebar.classList.remove('is-open'); // Sembunyikan sidebar mobile
    sidebarOverlay.classList.remove('is-visible'); // Sembunyikan overlay
    
    // Di desktop, kita tambahkan class 'is-collapsed'
    if (window.innerWidth >= 768) {
        sidebar.classList.add('is-collapsed');
    }
}

// Fungsi untuk toggle (buka/tutup) sidebar
function toggleSidebar() {
    sidebar.classList.toggle('is-open'); // Buka/tutup sidebar mobile
    sidebarOverlay.classList.toggle('is-visible'); // Tampilkan/sembunyikan overlay
    
    // Di desktop, kita toggle class 'is-collapsed'
    if (window.innerWidth >= 768) {
        sidebar.classList.toggle('is-collapsed');
    }
}

menuToggle.addEventListener('click', toggleSidebar);
sidebarOverlay.addEventListener('click', closeSidebar); // Klik overlay *selalu* menutup


// --- Logika Dropdown Kategori ---
const kategoriHeader = document.getElementById('kategori-header');
const kategoriToggleBtn = document.getElementById('kategori-toggle-btn');
const kategoriList = document.getElementById('kategori-list');

// Cek apakah elemennya ada sebelum menambahkan listener
if (kategoriHeader && kategoriToggleBtn && kategoriList) {
    
    kategoriHeader.addEventListener('click', () => {
        // 'toggle' artinya 'bolak-balik'
        // Ini akan menambah/menghapus kelas 'collapsed' saat diklik
        kategoriToggleBtn.classList.toggle('collapsed');
        kategoriList.classList.toggle('collapsed');
    });
}


// --- RICH TEXT EDITOR SETUP ---
function initializeEditors() {
    const toolbarOptions = [
        [{ 'header': [1, 2, 3, false] }],
        ['bold', 'italic', 'underline'],
        [{ 'list': 'ordered'}, { 'list': 'bullet' }],
        ['clean']
    ];
    addEditor = new Quill('#add-editor', { theme: 'snow', modules: { toolbar: toolbarOptions } });
    editEditor = new Quill('#edit-editor', { theme: 'snow', modules: { toolbar: toolbarOptions } });
}

// --- NOTES LOGIC ---
function setupNotesCollection() {
    if (userId) notesCollectionRef = collection(db, `/users/${userId}/notes`);
}

function loadNotes() {
    if (!notesCollectionRef) return;
    onSnapshot(notesCollectionRef, (snapshot) => {
        allNotes = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        filterAndRenderNotes();
        const loadingMessage = document.getElementById('loadingMessage');
        if (loadingMessage) {
            loadingMessage.style.display = 'none';
        }
    });
}

function filterAndRenderNotes() {
    const searchTerm = (document.getElementById('searchInput').value || document.getElementById('mobileSearchInput').value).toLowerCase();
    let filtered = allNotes;

    if (currentCategory !== "All") {
        filtered = filtered.filter(note => note.category === currentCategory);
    }

    if (searchTerm) {
        filtered = filtered.filter(note => 
            note.title.toLowerCase().includes(searchTerm) || 
            (note.plainText && note.plainText.toLowerCase().includes(searchTerm)) ||
            (note.tags && note.tags.some(tag => tag.toLowerCase().includes(searchTerm)))
        );
    }
    renderNotes(filtered);
}

function renderNotes(notesToRender) {
    const notesList = document.getElementById('notesList');
    // Kita ganti kelas grid Tailwind dengan kelas CSS kita
    notesList.className = 'notes-grid';
    
    notesList.innerHTML = ''; 
    if (notesToRender.length === 0) {
        notesList.innerHTML = `<p class="notes-empty-message">Tidak ada catatan ditemukan.</p>`;
    } else {
        notesToRender.forEach(note => {
            // Kita gunakan kelas .note-card dari style.css
            const noteElement = document.createElement('div');
            noteElement.className = 'note-card'; 
            noteElement.dataset.id = note.id;
            
            const tagsHTML = (note.tags || []).map(tag => `<span class="note-tag">${escapeHTML(tag)}</span>`).join('');
            
            const dateToDisplay = note.updatedAt ? note.updatedAt.toDate() : note.createdAt.toDate();
            const dateOptions = { year: 'numeric', month: 'long', day: 'numeric' };
            const formattedDate = dateToDisplay.toLocaleDateString('id-ID', dateOptions);

            // Strukturnya kita sesuaikan sedikit
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
                        <button data-id="${note.id}" class="note-action-btn edit-btn" title="Edit"><i class="fas fa-pencil-alt"></i></button>
                        <button data-id="${note.id}" class="note-action-btn delete-btn" title="Hapus"><i class="fas fa-trash"></i></button>
                    </div>
                </div>
            `;
            notesList.appendChild(noteElement);
        });
    }
}

// --- SEARCH & FILTER LOGIC ---
document.getElementById('searchInput').addEventListener('input', filterAndRenderNotes);
document.getElementById('mobileSearchInput').addEventListener('input', filterAndRenderNotes);

document.querySelectorAll('.category-filter').forEach(filter => {
    filter.addEventListener('click', (e) => {
        e.preventDefault();
        currentCategory = e.currentTarget.dataset.category;
        document.getElementById('notesHeader').textContent = currentCategory === 'All' ? 'Semua Catatan' : `Kategori: ${currentCategory}`;
        
        // Ganti class active-link dari style.css
        document.querySelectorAll('.category-filter').forEach(f => f.classList.remove('active-link'));
        e.currentTarget.classList.add('active-link');
        
        filterAndRenderNotes();
        
        // LOGIKA BARU: Tutup sidebar di mobile setelah klik
        if (window.innerWidth < 768) {
            closeSidebar();
        }
    });
});

// --- CRUD ACTIONS ---
document.getElementById('notesList').addEventListener('click', async (e) => {
    // Kita cari .note-action-btn
    const button = e.target.closest('.note-action-btn'); 
    const card = e.target.closest('.note-card');

    if (button) { // Tombol Edit atau Hapus diklik
        e.stopPropagation(); // Mencegah modal view terbuka
        const noteId = button.dataset.id;
        const noteRef = doc(db, notesCollectionRef.path, noteId);
        if (button.classList.contains('delete-btn')) {
            showConfirmModal('Anda yakin ingin menghapus catatan ini?', async () => {
                await deleteDoc(noteRef);
            });
        }
        if (button.classList.contains('edit-btn')) {
            const note = allNotes.find(n => n.id === noteId);
            if (note) showEditModal(note);
        }
    } else if (card) { // Kartu catatan itu sendiri yang diklik
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
// Tombol-tombol di header (Desktop)
const viewHeaderEditBtn = document.getElementById('viewHeaderEditBtn');
const viewHeaderDeleteBtn = document.getElementById('viewHeaderDeleteBtn');
// Tombol-tombol di dropdown (Mobile)
const viewMenuEdit = document.getElementById('viewMenuEdit');
const viewMenuDelete = document.getElementById('viewMenuDelete');

// === TAMBAHAN BARU: Menutup Modal dengan Tombol Esc ===
window.addEventListener('keydown', (e) => {
    // Cek apakah tombol yang ditekan adalah 'Escape'
    if (e.key === 'Escape' || e.key === 'Esc') {

        // 1. Cek apakah modal konfirmasi (hapus) sedang terbuka
        // Modal ini adalah prioritas utama untuk ditutup
        const confirmModal = document.getElementById('customConfirmModal');
        if (confirmModal) {
            // Kita "klik" tombol batal secara programatik
            // Ini lebih aman daripada .remove()
            const cancelBtn = confirmModal.querySelector('.btn-secondary');
            if (cancelBtn) {
                cancelBtn.click();
            }
            return; // Hentikan di sini
        }

        // 2. Jika tidak, cek modal lain yang terbuka
        if (addModal.classList.contains('is-visible')) {
            addModal.classList.remove('is-visible');
        } else if (editModal.classList.contains('is-visible')) {
            editModal.classList.remove('is-visible');
        } else if (viewModal.classList.contains('is-visible')) {
            viewModal.classList.remove('is-visible');
            // Pastikan dropdown menunya juga tertutup
            viewNoteDropdownMenu.classList.remove('is-visible');
        }
    }
});
// === AKHIR TAMBAHAN ===


function openAddModal() {
    // Kita ganti class 'hidden' dengan 'is-visible'
    addModal.classList.add('is-visible'); 
}

// Add Modal
document.getElementById('openAddModalBtnMobile').addEventListener('click', openAddModal);
// Listener Tombol Header Diaktifkan
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
        createdAt: new Date()
    });
    addModal.classList.remove('is-visible');
    e.target.reset();
    addEditor.setText('');
});

// Edit Modal
function showEditModal(note) {
    document.getElementById('editNoteId').value = note.id;
    document.getElementById('editNoteTitle').value = note.title;
    editEditor.root.innerHTML = note.content;
    document.getElementById('editNoteCategory').value = note.category;
    document.getElementById('editNoteTags').value = (note.tags || []).join(', ');
    document.getElementById('editNoteLink').value = note.productLink || '';
    editModal.classList.add('is-visible'); // Ganti class
}
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

// View Modal
function showViewModal(note) {
    const contentContainer = document.getElementById('viewNoteContent');
    const productLinkContainer = document.getElementById('productLinkContainer');
    const viewProductLink = document.getElementById('viewProductLink');
    
    document.getElementById('viewNoteTitle').textContent = note.title;
    document.getElementById('viewNoteCategory').textContent = note.category;
    contentContainer.innerHTML = note.content;
    linkifyContainer(contentContainer); // Panggil fungsi perbaikan link
    
    const dateToDisplay = note.updatedAt ? note.updatedAt.toDate() : note.createdAt.toDate();
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

    // --- Tambahkan ID ke SEMUA Tombol Edit/Delete ---
    
    // 1. Simpan ID di tombol header (Desktop)
    viewHeaderEditBtn.dataset.id = note.id;
    viewHeaderDeleteBtn.dataset.id = note.id;
    
    // 2. Simpan ID di tombol dropdown (Mobile)
    viewMenuEdit.dataset.id = note.id;
    viewMenuDelete.dataset.id = note.id;
    
    // 3. Pastikan dropdown tertutup saat modal dibuka
    viewNoteDropdownMenu.classList.remove('is-visible');
    // --- Akhir Penambahan ID ---

    viewModal.classList.add('is-visible'); 
}

// Tombol 'X' (jika masih ada, tidak akan terpakai karena 'desktop-only')
document.getElementById('closeView').addEventListener('click', () => {
    viewModal.classList.remove('is-visible');
    viewNoteDropdownMenu.classList.remove('is-visible'); // Pastikan menu tertutup
});

// --- Listener Baru untuk View Modal (Hybrid) ---

// Listener untuk tombol 'Kembali'
viewBackBtn.addEventListener('click', () => {
    viewModal.classList.remove('is-visible');
    viewNoteDropdownMenu.classList.remove('is-visible'); // Pastikan menu tertutup
});

// Listener untuk tombol 'Menu ...' (Mobile)
viewMenuBtn.addEventListener('click', (e) => {
    e.stopPropagation(); // Mencegah klik 'menembus' ke modal
    viewNoteDropdownMenu.classList.toggle('is-visible');
});

// --- Kita buat fungsi Aksi agar tidak duplikat kode ---

// Fungsi Aksi untuk EDIT
const editNoteAction = (noteId) => {
    if (noteId) {
        const note = allNotes.find(n => n.id === noteId);
        if (note) {
            viewModal.classList.remove('is-visible');
            viewNoteDropdownMenu.classList.remove('is-visible'); // Tutup menu
            showEditModal(note); // Buka modal edit
        }
    }
};

// Fungsi Aksi untuk DELETE
const deleteNoteAction = (noteId) => {
    const noteRef = doc(db, notesCollectionRef.path, noteId);
    viewNoteDropdownMenu.classList.remove('is-visible'); // Tutup menu dulu
    
    showConfirmModal('Anda yakin ingin menghapus catatan ini?', async () => {
        await deleteDoc(noteRef);
        viewModal.classList.remove('is-visible'); // Tutup modal view
    });
};

// --- Terapkan fungsi Aksi ke tombol-tombolnya ---

// Listener untuk 'Edit' Desktop (Header)
viewHeaderEditBtn.addEventListener('click', (e) => {
    editNoteAction(e.currentTarget.dataset.id);
});
// Listener untuk 'Edit' Mobile (Dropdown)
viewMenuEdit.addEventListener('click', (e) => {
    editNoteAction(e.currentTarget.dataset.id);
});

// Listener untuk 'Hapus' Desktop (Header)
viewHeaderDeleteBtn.addEventListener('click', (e) => {
    deleteNoteAction(e.currentTarget.dataset.id);
});
// Listener untuk 'Hapus' Mobile (Dropdown)
viewMenuDelete.addEventListener('click', (e) => {
    deleteNoteAction(e.currentTarget.dataset.id);
});

// Listener untuk FAB Edit (Tombol ini sudah disembunyikan oleh CSS)
document.getElementById('editFab').addEventListener('click', (e) => {
    editNoteAction(e.currentTarget.dataset.id);
});

// Logika untuk menutup modal saat klik overlay
[addModal, editModal, viewModal].forEach(modal => {
    modal.addEventListener('click', (e) => {
        // Jika yang diklik adalah overlay-nya (bukan .modal-content)
        if (e.target === modal) { 
            modal.classList.remove('is-visible');
        }
    });
});

// --- CUSTOM CONFIRM MODAL (Tidak ada perubahan) ---
function showConfirmModal(message, onConfirm) {
    const existingModal = document.getElementById('customConfirmModal');
    if (existingModal) {
        existingModal.remove();
    }

    const modalOverlay = document.createElement('div');
    modalOverlay.id = 'customConfirmModal';
    modalOverlay.className = 'modal-overlay is-visible'; 
    modalOverlay.style.zIndex = "100"; // Pastikan di atas modal lain

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
        if (e.target === modalOverlay) {
            closeModal();
        }
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
        
        // --- PERBAIKAN LINK DARI TURN 17 ---
        const urlRegex = /\b((https?:\/\/|www\.)[^\s,"<>()]+|[a-zA-Z0-9.-]+\.(com|id|org|net|io|dev|app|co\.id)([^\s,"<>()]*))\b/gi;
        // --- AKHIR PERBAIKAN ---
        
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