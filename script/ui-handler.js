// script/ui-handler.js
import { formatDate, escapeHTML, linkifyHTML, getChecklistStats } from './utils.js';

let addEditor, editEditor; // Instance Quill

// --- Editor Setup ---
export function initializeEditors() {
    const toolbarOptions = [
        [{ 'header': [1, 2, false] }],
        ['bold', 'italic', 'underline', 'strike'],
        ['blockquote', 'code-block'],
        [{ 'list': 'ordered'}, { 'list': 'bullet'}, { 'list': 'check' }],
        ['clean']
    ];

    if(document.getElementById('addEditorContainer')) {
        addEditor = new Quill('#addEditorContainer', {
            theme: 'snow', placeholder: 'Tulis catatan atau daftar tugasmu...', modules: { toolbar: toolbarOptions }
        });
        const toolbarEl = document.querySelector('#addModal .ql-toolbar');
        const targetContainer = document.getElementById('addToolbarContainer');
        if (toolbarEl && targetContainer) {
            targetContainer.appendChild(toolbarEl);
        }
    }
    if(document.getElementById('editEditorContainer')) {
        editEditor = new Quill('#editEditorContainer', {
            theme: 'snow', modules: { toolbar: toolbarOptions }
        });
        const toolbarEl = document.querySelector('#editModal .ql-toolbar');
        const targetContainer = document.getElementById('editToolbarContainer');
        if (toolbarEl && targetContainer) {
            targetContainer.appendChild(toolbarEl);
        }
    }
}

export function setEditorChecklistMode(type, isChecklist) {
    const editor = type === 'add' ? addEditor : editEditor;
    if (!editor) return;

    if (isChecklist) {
        const text = editor.getText().trim();
        if (!text) {
            editor.setText('');
            editor.format('list', 'check');
            editor.focus();
        } else {
            editor.formatText(0, editor.getLength(), 'list', 'check');
            editor.focus();
        }
    } else {
        editor.formatText(0, editor.getLength(), 'list', false);
        editor.focus();
    }
}

export function getEditorContent(type) {
    if (type === 'add') return { html: addEditor.root.innerHTML, text: addEditor.getText() };
    if (type === 'edit') return { html: editEditor.root.innerHTML, text: editEditor.getText() };
}

export function resetAddEditor() {
    if(addEditor) addEditor.setText('');
    
    // Reset toggle mode catatan
    const textBtn = document.getElementById('addTypeTextBtn');
    const checklistBtn = document.getElementById('addTypeChecklistBtn');
    const hint = document.getElementById('addTypeHint');
    if (textBtn && checklistBtn) {
        textBtn.classList.add('active');
        checklistBtn.classList.remove('active');
        if (hint) hint.textContent = 'Tulis bebas dengan format teks';
    }

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
export function renderNotesList(notes, currentFilter, containerId, isSelectionMode = false, selectedNoteIds = new Set()) {
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
        } else if (currentFilter === 'vault' || note.isVault === true || note.category === 'Brankas') {
            actionButtonsHTML = `
                <button class="note-action-btn unvault-btn" data-id="${note.id}" title="Keluarkan dari Brankas"><i class="fas fa-lock-open"></i></button>
                <button class="note-action-btn delete-btn" data-id="${note.id}" title="Hapus"><i class="fas fa-trash"></i></button>
                <button class="note-action-btn edit-btn" data-id="${note.id}" title="Edit"><i class="fas fa-pencil-alt"></i></button>
            `;
        } else {
            actionButtonsHTML = `
                <button class="note-action-btn vault-btn" data-id="${note.id}" title="Pindah ke Brankas"><i class="fas fa-lock"></i></button>
                <button class="note-action-btn pin-btn ${pinIconClass}" data-id="${note.id}" title="Pin"><i class="fas fa-thumbtack"></i></button>
                <button class="note-action-btn archive-btn" data-id="${note.id}" title="Arsipkan"><i class="fas fa-box-archive"></i></button>
                <button class="note-action-btn delete-btn" data-id="${note.id}" title="Hapus"><i class="fas fa-trash"></i></button>
                <button class="note-action-btn edit-btn" data-id="${note.id}" title="Edit"><i class="fas fa-pencil-alt"></i></button>
            `;
        }

        const tagsHTML = note.tags && note.tags.length > 0 
            ? `<div class="note-card-tags">${note.tags.slice(0, 3).map(tag => `<span class="note-tag">${escapeHTML(tag)}</span>`).join('')}${note.tags.length > 3 ? `<span class="note-tag">+${note.tags.length - 3}</span>` : ''}</div>` 
            : '';

        const isSelected = selectedNoteIds.has(note.id);
        const selectedClass = isSelected ? 'is-selected' : '';
        const checkboxVisibleClass = isSelectionMode ? 'is-visible' : '';

        // Deteksi apakah catatan memiliki format checklist
        const checklistStats = getChecklistStats(note.content);
        const hasChecklist = checklistStats.total > 0;
        const isChecklistComplete = hasChecklist && checklistStats.checked === checklistStats.total;

        const checklistBadgeHTML = hasChecklist
            ? `<span class="note-card-checklist-badge ${isChecklistComplete ? 'is-completed' : ''}" title="${checklistStats.checked} dari ${checklistStats.total} tugas selesai">
                 <i class="${isChecklistComplete ? 'fas fa-check-circle' : 'fas fa-tasks'}"></i>
                 <span>${checklistStats.checked}/${checklistStats.total}</span>
               </span>`
            : '';

        let contentBodyHTML = '';
        if (hasChecklist) {
            contentBodyHTML = `
                <div class="note-card-checklist-preview">
                    ${checklistStats.items.slice(0, 3).map(it => `
                        <div class="card-checklist-row ${it.checked ? 'is-checked' : ''}">
                            <i class="${it.checked ? 'fas fa-check-square' : 'far fa-square'}"></i>
                            <span class="card-checklist-text">${escapeHTML(it.text)}</span>
                        </div>
                    `).join('')}
                    ${checklistStats.total > 3 ? `<div class="card-checklist-more">+${checklistStats.total - 3} item lagi...</div>` : ''}
                </div>
                <div class="card-checklist-progress-bar">
                    <div class="card-checklist-progress-fill ${isChecklistComplete ? 'is-complete' : ''}" style="width: ${checklistStats.percent}%"></div>
                </div>
            `;
        } else {
            contentBodyHTML = `<div class="note-card-content">${note.plainText ? escapeHTML(note.plainText.substring(0, 150)) : ''}...</div>`;
        }

        const cardHTML = `
            <div class="note-card ${pinnedClass} ${selectedClass}" data-id="${note.id}">
                <div class="note-card-header">
                    <div class="note-card-header-left">
                        <div class="note-card-checkbox-container ${checkboxVisibleClass}">
                            <input type="checkbox" class="note-card-checkbox" data-id="${note.id}" ${isSelected ? 'checked' : ''}>
                        </div>
                        <span class="note-card-category">${escapeHTML(note.category)}</span>
                        ${checklistBadgeHTML}
                    </div>
                    <span class="note-card-date">${dateStr}</span>
                </div>
                <div class="note-card-body">
                    <h3 class="note-card-title">${escapeHTML(note.title)}</h3>
                    ${contentBodyHTML}
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
    if(modal) {
        modal.classList.add('is-visible');
        // Sinkronisasi history browser agar tombol back HP menutup popup
        if (!history.state || !history.state.modalOpen) {
            history.pushState({ modalOpen: modalId }, '');
        }
    }
}

export function closeModal(modalId) {
    const modal = document.getElementById(modalId);
    if(modal) {
        modal.classList.remove('is-visible');
        // Khusus viewModal, tutup juga dropdown menu
        if(modalId === 'viewModal') {
            const dropdown = document.getElementById('viewNoteDropdownMenu');
            if(dropdown) dropdown.classList.remove('is-visible');
        }
    }

    // Jika semua modal sudah tertutup dan ada history modalOpen, kembalikan state history
    const anyModalOpen = document.querySelector('.modal-overlay.is-visible');
    if (!anyModalOpen && history.state && history.state.modalOpen) {
        history.back();
    }
}

export function showViewModal(note, onChecklistToggle = null) {
    const viewModal = document.getElementById('viewModal');
    
    // Set Content (Smart Read Links)
    document.getElementById('viewNoteTitle').textContent = note.title;
    document.getElementById('viewNoteCategory').textContent = note.category;
    
    const viewContentEl = document.getElementById('viewNoteContent');
    viewContentEl.innerHTML = linkifyHTML(note.content);

    // Checklist Progress Box
    const checklistBox = document.getElementById('viewChecklistContainer');
    const checklistCountEl = document.getElementById('viewChecklistCount');
    const checklistFillEl = document.getElementById('viewChecklistFill');

    const updateChecklistUI = (stats) => {
        if (!checklistBox) return;
        if (stats.total > 0) {
            checklistBox.classList.remove('hidden');
            if (checklistCountEl) {
                checklistCountEl.textContent = `${stats.checked}/${stats.total} Selesai (${stats.percent}%)`;
            }
            if (checklistFillEl) {
                checklistFillEl.style.width = `${stats.percent}%`;
                if (stats.checked === stats.total) {
                    checklistFillEl.classList.add('is-complete');
                } else {
                    checklistFillEl.classList.remove('is-complete');
                }
            }
        } else {
            checklistBox.classList.add('hidden');
        }
    };

    let initialStats = getChecklistStats(note.content);
    updateChecklistUI(initialStats);

    // Handler klik interaktif untuk item checklist di modal baca
    viewContentEl.onclick = (e) => {
        const li = e.target.closest('li[data-list="checked"], li[data-list="unchecked"]');
        if (!li) return;

        // Toggle status centang
        const currentListType = li.getAttribute('data-list');
        const nextListType = currentListType === 'checked' ? 'unchecked' : 'checked';
        li.setAttribute('data-list', nextListType);

        // Update parent ul jika ada
        const parentUl = li.closest('ul[data-checked]');
        if (parentUl) {
            parentUl.setAttribute('data-checked', nextListType === 'checked' ? 'true' : 'false');
        }

        const newHTML = viewContentEl.innerHTML;
        const newPlainText = viewContentEl.innerText;
        note.content = newHTML;
        note.plainText = newPlainText;

        const updatedStats = getChecklistStats(newHTML);
        updateChecklistUI(updatedStats);

        if (typeof onChecklistToggle === 'function') {
            onChecklistToggle(note, newHTML, newPlainText);
        }
    };
    
    // Set Date
    let safeDate;
    if (note.updatedAt) {
        safeDate = typeof note.updatedAt.toDate === 'function' ? note.updatedAt.toDate() : new Date(note.updatedAt);
    }
    const dateEl = document.getElementById('viewNoteDate');
    if (dateEl) dateEl.textContent = safeDate ? formatDate(safeDate) : '';
    
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
        'viewHeaderEditBtn', 'viewHeaderDeleteBtn', 'viewHeaderArchiveBtn', 'viewHeaderUnarchiveBtn', 'viewHeaderVaultBtn', 'viewHeaderUnvaultBtn',
        'viewMenuEdit', 'viewMenuDelete', 'viewMenuArchive', 'viewMenuUnarchive', 'viewMenuVault', 'viewMenuUnvault',
        'editFab', 'viewFooterEditBtn', 'viewFooterDeleteBtn', 'viewFooterArchiveBtn', 'viewFooterUnarchiveBtn', 'viewFooterVaultBtn', 'viewFooterUnvaultBtn'
    ];
    actionButtonIds.forEach(id => {
        const btn = document.getElementById(id);
        if(btn) btn.dataset.id = note.id;
    });

    // Handle visibility Tombol Arsip & Brankas (Header & Footer)
    const toggleHidden = (ids, hide) => ids.forEach(id => {
        const el = document.getElementById(id);
        if(el) hide ? el.classList.add('hidden') : el.classList.remove('hidden');
    });

    const archiveBtns = ['viewHeaderArchiveBtn', 'viewMenuArchive', 'viewFooterArchiveBtn'];
    const unarchiveBtns = ['viewHeaderUnarchiveBtn', 'viewMenuUnarchive', 'viewFooterUnarchiveBtn'];
    const vaultBtns = ['viewHeaderVaultBtn', 'viewMenuVault', 'viewFooterVaultBtn'];
    const unvaultBtns = ['viewHeaderUnvaultBtn', 'viewMenuUnvault', 'viewFooterUnvaultBtn'];

    if (note.isArchived) {
        toggleHidden(archiveBtns, true); // Sembunyikan tombol arsip
        toggleHidden(unarchiveBtns, false); // Munculkan tombol unarchive
        toggleHidden(vaultBtns, true); // Sembunyikan tombol vault saat arsip
    } else {
        toggleHidden(archiveBtns, false);
        toggleHidden(unarchiveBtns, true);
    }

    const isVaultNote = note.isVault === true || note.category === 'Brankas';
    if (isVaultNote) {
        toggleHidden(vaultBtns, true);
        toggleHidden(unvaultBtns, false);
    } else {
        if (!note.isArchived) toggleHidden(vaultBtns, false);
        toggleHidden(unvaultBtns, true);
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

    // Sync switch mode catatan
    const stats = getChecklistStats(note.content);
    const isChecklist = stats.total > 0;
    const textBtn = document.getElementById('editTypeTextBtn');
    const checklistBtn = document.getElementById('editTypeChecklistBtn');
    const hint = document.getElementById('editTypeHint');
    if (textBtn && checklistBtn) {
        if (isChecklist) {
            textBtn.classList.remove('active');
            checklistBtn.classList.add('active');
            if (hint) hint.textContent = 'Mode Checklist: Setiap baris adalah item tugas centang';
        } else {
            textBtn.classList.add('active');
            checklistBtn.classList.remove('active');
            if (hint) hint.textContent = 'Tulis bebas dengan format teks';
        }
    }

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