// script/ui-handler.js
import { formatDate, escapeHTML } from './utils.js';

let addEditor, editEditor; // Instance Quill

// --- Editor Setup ---
export function initializeEditors() {
    const toolbarOptions = [
        [{ 'header': [1, 2, false] }],
        ['bold', 'italic', 'underline', 'strike'],
        ['blockquote', 'code-block'],
        [{ 'list': 'ordered'}, { 'list': 'bullet' }],
        ['clean']
    ];

    // Cek elemen dulu biar gak error
    if(document.getElementById('addEditorContainer')) {
        addEditor = new Quill('#addEditorContainer', {
            theme: 'snow', placeholder: 'Tulis catatanmu...', modules: { toolbar: toolbarOptions }
        });
    }
    if(document.getElementById('editEditorContainer')) {
        editEditor = new Quill('#editEditorContainer', {
            theme: 'snow', modules: { toolbar: toolbarOptions }
        });
    }
}

export function getEditorContent(type) {
    if (type === 'add') return { html: addEditor.root.innerHTML, text: addEditor.getText() };
    if (type === 'edit') return { html: editEditor.root.innerHTML, text: editEditor.getText() };
}

export function resetAddEditor() {
    if(addEditor) addEditor.setText('');
    
    // --- TAMBAHAN BRI: Reset Tombol Simpan ---
    // Pastikan tombol aktif kembali saat mau nulis baru
    const btn = document.querySelector('#addNoteForm button[type="submit"]');
    if(btn) {
        btn.disabled = false;
        btn.innerHTML = 'Simpan'; // Kembalikan teks asli
    }
}

export function setEditEditorContent(html) {
    if(editEditor) editEditor.root.innerHTML = html;
}

// --- Render Notes (BAGIAN YANG DIPERBAIKI BRI) ---
export function renderNotesList(notes, currentFilter, containerId) {
    const container = document.getElementById(containerId);
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
        // --- PERBAIKAN TANGGAL OFFLINE VS ONLINE ---
        let safeDate;
        if (note.updatedAt) {
            // Cek: Apakah ini format Server (punya .toDate) atau Lokal?
            if (typeof note.updatedAt.toDate === 'function') {
                safeDate = note.updatedAt.toDate(); // Dari Server
            } else {
                safeDate = new Date(note.updatedAt); // Dari Lokal (Offline)
            }
        }
        const dateStr = safeDate ? formatDate(safeDate) : '';
        // ---------------------------------------------

        const pinnedClass = note.isPinned ? 'is-pinned' : '';
        const pinIconClass = note.isPinned ? 'active' : '';

        // Tentukan tombol aksi
        let actionButtonsHTML = '';
        if (currentFilter === 'archived') {
            actionButtonsHTML = `
                <button class="note-action-btn unarchive-btn" data-id="${note.id}" title="Kembalikan"><i class="fas fa-box-open"></i></button>
                <button class="note-action-btn delete-btn" data-id="${note.id}" title="Hapus Permanen"><i class="fas fa-trash"></i></button>
            `;
        } else {
            actionButtonsHTML = `
                <button class="note-action-btn pin-btn ${pinIconClass}" data-id="${note.id}" title="Pin"><i class="fas fa-thumbtack"></i></button>
                <button class="note-action-btn archive-btn" data-id="${note.id}" title="Arsipkan"><i class="fas fa-box-archive"></i></button>
                <button class="note-action-btn delete-btn" data-id="${note.id}" title="Hapus"><i class="fas fa-trash"></i></button>
                <button class="note-action-btn edit-btn" data-id="${note.id}" title="Edit"><i class="fas fa-pencil-alt"></i></button>
            `;
        }

        const tagsHTML = note.tags && note.tags.length > 0 
            ? `<div class="note-card-tags">${note.tags.slice(0, 3).map(tag => `<span class="note-tag">${escapeHTML(tag)}</span>`).join('')}${note.tags.length > 3 ? `<span class="note-tag">+${note.tags.length - 3}</span>` : ''}</div>` 
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
                    <div class="note-card-actions">${actionButtonsHTML}</div>
                </div>
            </div>`;
        container.innerHTML += cardHTML;
    });
}

// --- Modals ---
export function openModal(modalId) {
    const modal = document.getElementById(modalId);
    if(modal) modal.classList.add('is-visible');
}

export function closeModal(modalId) {
    const modal = document.getElementById(modalId);
    if(modal) modal.classList.remove('is-visible');
    
    // Khusus viewModal, tutup juga dropdown menu
    if(modalId === 'viewModal') {
        const dropdown = document.getElementById('viewNoteDropdownMenu');
        if(dropdown) dropdown.classList.remove('is-visible');
    }
}

export function showViewModal(note) {
    const viewModal = document.getElementById('viewModal');
    
    // Set Content
    document.getElementById('viewNoteTitle').textContent = note.title;
    document.getElementById('viewNoteCategory').textContent = note.category;
    document.getElementById('viewNoteContent').innerHTML = note.content;
    
    // Set Tags
    const tagsContainer = document.getElementById('viewNoteTags');
    tagsContainer.innerHTML = '';
    if (note.tags) {
        note.tags.forEach(tag => {
            const span = document.createElement('span');
            span.className = 'note-tag';
            span.textContent = tag;
            tagsContainer.appendChild(span);
        });
    }

    // Set Link
    const linkContainer = document.getElementById('productLinkContainer');
    const linkEl = document.getElementById('viewProductLink');
    if (note.productLink) {
        linkContainer.classList.remove('hidden');
        linkEl.href = note.productLink;
        linkEl.textContent = note.productLink;
    } else {
        linkContainer.classList.add('hidden');
    }

    // Update Dataset ID semua tombol aksi
    const actionButtonIds = [
        'viewHeaderEditBtn', 'viewHeaderDeleteBtn', 'viewHeaderArchiveBtn', 'viewHeaderUnarchiveBtn',
        'viewMenuEdit', 'viewMenuDelete', 'viewMenuArchive', 'viewMenuUnarchive',
        'editFab', 'viewFooterEditBtn', 'viewFooterDeleteBtn', 'viewFooterArchiveBtn', 'viewFooterUnarchiveBtn'
    ];
    actionButtonIds.forEach(id => {
        const btn = document.getElementById(id);
        if(btn) btn.dataset.id = note.id;
    });

    // Handle visibility Tombol Arsip (Header & Footer)
    const toggleHidden = (ids, hide) => ids.forEach(id => {
        const el = document.getElementById(id);
        if(el) hide ? el.classList.add('hidden') : el.classList.remove('hidden');
    });

    const archiveBtns = ['viewHeaderArchiveBtn', 'viewMenuArchive', 'viewFooterArchiveBtn'];
    const unarchiveBtns = ['viewHeaderUnarchiveBtn', 'viewMenuUnarchive', 'viewFooterUnarchiveBtn'];

    if (note.isArchived) {
        toggleHidden(archiveBtns, true); // Sembunyikan tombol arsip
        toggleHidden(unarchiveBtns, false); // Munculkan tombol unarchive
    } else {
        toggleHidden(archiveBtns, false);
        toggleHidden(unarchiveBtns, true);
    }

    openModal('viewModal');
}

// script/ui-handler.js (Bagian Bawah)

// 1. Masukkan kode Reset Tombol ke sini (YANG BENAR)
export function fillEditForm(note) {
    document.getElementById('editNoteId').value = note.id;
    document.getElementById('editNoteTitle').value = note.title;
    document.getElementById('editNoteCategory').value = note.category;
    document.getElementById('editNoteTags').value = note.tags ? note.tags.join(', ') : '';
    document.getElementById('editNoteLink').value = note.productLink || '';
    setEditEditorContent(note.content);

    // --- TAMBAHAN BRI: Reset Tombol Update (PINDAHKAN KE SINI) ---
    // Pastikan tombol aktif kembali saat mau edit
    const btn = document.querySelector('#editNoteForm button[type="submit"]');
    if(btn) {
        btn.disabled = false;
        btn.innerHTML = 'Update'; // Kembalikan teks asli
    }
}

// 2. Bersihkan fungsi setViewMode (Hapus kode reset tombol dari sini)
export function setViewMode(mode) {
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
    // (Kode reset tombol edit SUDAH DIHAPUS dari sini)
}