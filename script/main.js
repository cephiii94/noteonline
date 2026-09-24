// script/main.js
import { auth } from '../firebase-config.js';
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import * as Utils from './utils.js';
import * as FirebaseService from './firebase-service.js';
import * as UI from './ui-handler.js';
import { initAllCustomDropdowns } from './custom-select.js';

// --- Global State ---
let userId = null;
let allNotes = [];       // Menyimpan SEMUA data mentah dari Firebase
let currentFilteredNotes = []; // Menyimpan data catatan yang sedang tampil di layar
let currentViewNoteId = null;  // ID catatan yang sedang dibuka di modal
let currentCategory = "All";
let currentFilter = "all"; // 'all' (Utama), 'archived' (Arsip), atau 'vault' (Brankas)
let isVaultUnlocked = false; // Status apakah Brankas terbuka di sesi ini
let isSelectMode = false;
let selectedNoteIds = new Set();

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

    // 2. FILTER (Memisahkan Aktif vs Arsip vs Brankas)
    let filteredNotes = allNotes.filter(note => {
        const isNoteArchived = note.isArchived === true; 
        const isNoteVault = note.isVault === true || note.category === 'Brankas';

        if (currentFilter === 'vault') {
            // Logika Menu Brankas: Hanya tampilkan catatan Brankas
            if (!isNoteVault) return false;
        } else if (currentFilter === 'archived') {
            // Logika Menu Arsip: Sembunyikan catatan Brankas & Tampilkan hanya Arsip
            if (isNoteVault) return false;
            if (!isNoteArchived) return false;
        } else {
            // Logika Menu Utama / Kategori: Sembunyikan catatan Brankas & Sembunyikan Arsip
            if (isNoteVault) return false;
            if (isNoteArchived) return false;

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
        // A. Prioritas Pin (Hanya di menu utama & brankas)
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
    currentFilteredNotes = filteredNotes;
    UI.renderNotesList(filteredNotes, currentFilter, 'notesList', isSelectMode, selectedNoteIds);
    updateBulkActionBar();
}

function updateBulkActionBar() {
    const bar = document.getElementById('bulkActionBar');
    const selectModeBtn = document.getElementById('selectModeBtn');
    const countBadge = document.getElementById('bulkSelectCount');
    const selectAllText = document.getElementById('bulkSelectAllText');
    const archiveText = document.getElementById('bulkArchiveText');
    const notesListEl = document.getElementById('notesList');

    if (selectModeBtn) {
        if (isSelectMode) selectModeBtn.classList.add('active');
        else selectModeBtn.classList.remove('active');
    }

    if (notesListEl) {
        if (isSelectMode) notesListEl.classList.add('selection-mode');
        else notesListEl.classList.remove('selection-mode');
    }

    if (bar) {
        if (isSelectMode) {
            bar.classList.remove('hidden');
        } else {
            bar.classList.add('hidden');
        }
    }

    if (countBadge) {
        countBadge.textContent = `${selectedNoteIds.size} dipilih`;
    }

    if (selectAllText) {
        const allSelected = currentFilteredNotes.length > 0 && selectedNoteIds.size === currentFilteredNotes.length;
        selectAllText.textContent = allSelected ? 'Batal Pilih Semua' : 'Pilih Semua';
    }

    if (archiveText) {
        archiveText.textContent = currentFilter === 'archived' ? 'Kembalikan' : 'Arsip';
    }

    const vaultBtnLabel = document.querySelector('#bulkMoveToVaultBtn .btn-label');
    const vaultBtnIcon = document.querySelector('#bulkMoveToVaultBtn i');
    const bulkMoveToVaultBtn = document.getElementById('bulkMoveToVaultBtn');
    if (vaultBtnLabel && vaultBtnIcon && bulkMoveToVaultBtn) {
        if (currentFilter === 'vault') {
            vaultBtnIcon.className = 'fas fa-lock-open';
            vaultBtnLabel.textContent = 'Keluarkan';
            bulkMoveToVaultBtn.title = 'Keluarkan dari Brankas';
        } else {
            vaultBtnIcon.className = 'fas fa-lock';
            vaultBtnLabel.textContent = 'Brankas';
            bulkMoveToVaultBtn.title = 'Pindah ke Brankas';
        }
    }

    const catSelect = document.getElementById('bulkCategorySelect');
    if (catSelect) catSelect.value = '';
}


// --- 2. EVENT LISTENERS (Menghubungkan Tombol dengan Fungsi) ---
function initializeEventListeners() {
    initAllCustomDropdowns();

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
        
        if (action === 'unvault') {
            FirebaseService.updateNoteInFirestore(userId, id, {
                isVault: false,
                category: 'Personal'
            });
            UI.closeModal('viewModal');
            Utils.showToast('Catatan berhasil dikeluarkan dari Brankas', 'success');
        }

        if (action === 'vault') {
            FirebaseService.updateNoteInFirestore(userId, id, {
                isVault: true,
                category: 'Brankas'
            });
            UI.closeModal('viewModal');
            Utils.showToast('Catatan berhasil dipindahkan ke Brankas', 'success');
        }
        
        if (action === 'delete') {
            Utils.showConfirm({
                title: 'Hapus Catatan',
                message: 'Apakah Anda yakin ingin menghapus catatan ini selamanya?',
                confirmText: 'Hapus',
                cancelText: 'Batal',
                type: 'danger'
            }).then(confirmed => {
                if (confirmed) {
                    FirebaseService.deleteNoteFromFirestore(userId, id);
                    UI.closeModal('viewModal');
                    Utils.showToast('Catatan berhasil dihapus', 'success');
                }
            });
        }
        
        if (action === 'edit') {
            UI.fillEditForm(note);
            UI.openModal('editModal');
            UI.closeModal('viewModal');
        }
        
        if (action === 'view') {
            currentViewNoteId = id;
            UI.showViewModal(note, handleChecklistToggle);
            updateNavState();
        }
    };

    // Auto-save toggle checklist saat diklik langsung di view modal
    const handleChecklistToggle = async (note, newHtml, newPlainText) => {
        try {
            await FirebaseService.updateNoteInFirestore(userId, note.id, {
                content: newHtml,
                plainText: newPlainText
            });

            // Update memori lokal
            const noteInAll = allNotes.find(n => n.id === note.id);
            if (noteInAll) {
                noteInAll.content = newHtml;
                noteInAll.plainText = newPlainText;
            }
            const noteInFiltered = currentFilteredNotes.find(n => n.id === note.id);
            if (noteInFiltered) {
                noteInFiltered.content = newHtml;
                noteInFiltered.plainText = newPlainText;
            }

            // Re-render kartu catatan di latar belakang agar badge dan pratinjau diperbarui
            UI.renderNotesList(currentFilteredNotes, currentFilter, 'notesList', isSelectMode, selectedNoteIds);
        } catch (err) {
            console.error("Gagal update status checklist:", err);
        }
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
            isSelectMode = false;
            selectedNoteIds.clear();
            
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
            isSelectMode = false;
            selectedNoteIds.clear();

            const headerEl = document.getElementById('notesHeader');
            if(headerEl) headerEl.textContent = 'Arsip Catatan';

            document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active-link'));
            e.currentTarget.classList.add('active-link');
            
            filterAndRender();
            if (window.innerWidth < 768) Utils.closeSidebar();
        });
    }

    // --- Logika Selection Mode & Bulk Actions ---
    Utils.safeAddListener('selectModeBtn', 'click', () => {
        isSelectMode = !isSelectMode;
        if (!isSelectMode) {
            selectedNoteIds.clear();
        }
        filterAndRender();
    });

    Utils.safeAddListener('bulkSelectAllBtn', 'click', () => {
        const allSelected = currentFilteredNotes.length > 0 && selectedNoteIds.size === currentFilteredNotes.length;
        if (allSelected) {
            selectedNoteIds.clear();
        } else {
            currentFilteredNotes.forEach(n => selectedNoteIds.add(n.id));
        }
        filterAndRender();
    });

    Utils.safeAddListener('bulkCancelBtn', 'click', () => {
        isSelectMode = false;
        selectedNoteIds.clear();
        filterAndRender();
    });

    const bulkCategorySelect = document.getElementById('bulkCategorySelect');
    if (bulkCategorySelect) {
        bulkCategorySelect.addEventListener('change', async (e) => {
            const newCat = e.target.value;
            if (!newCat || selectedNoteIds.size === 0) return;

            const count = selectedNoteIds.size;
            const isVault = newCat === 'Brankas';

            for (const id of selectedNoteIds) {
                try {
                    await FirebaseService.updateNoteInFirestore(userId, id, {
                        category: newCat,
                        isVault: isVault
                    });
                } catch (err) {
                    console.error("Gagal update kategori bulk:", err);
                }
            }

            Utils.showToast(`${count} catatan dipindahkan ke kategori "${newCat}"`, 'success');
            selectedNoteIds.clear();
            isSelectMode = false;
            filterAndRender();
        });
    }

    Utils.safeAddListener('bulkMoveToVaultBtn', 'click', async () => {
        if (selectedNoteIds.size === 0) {
            return Utils.showToast('Pilih setidaknya satu catatan terlebih dahulu', 'warning');
        }

        const count = selectedNoteIds.size;
        const isRemovingFromVault = currentFilter === 'vault';

        for (const id of selectedNoteIds) {
            try {
                if (isRemovingFromVault) {
                    await FirebaseService.updateNoteInFirestore(userId, id, {
                        category: 'Personal',
                        isVault: false
                    });
                } else {
                    await FirebaseService.updateNoteInFirestore(userId, id, {
                        category: 'Brankas',
                        isVault: true
                    });
                }
            } catch (err) {
                console.error("Gagal update vault bulk:", err);
            }
        }

        Utils.showToast(`${count} catatan ${isRemovingFromVault ? 'dikeluarkan dari Brankas' : 'dipindahkan ke Brankas'}!`, 'success');
        selectedNoteIds.clear();
        isSelectMode = false;
        filterAndRender();
    });

    Utils.safeAddListener('bulkArchiveBtn', 'click', async () => {
        if (selectedNoteIds.size === 0) {
            return Utils.showToast('Pilih setidaknya satu catatan terlebih dahulu', 'warning');
        }

        const count = selectedNoteIds.size;
        const targetArchiveStatus = currentFilter !== 'archived';

        for (const id of selectedNoteIds) {
            try {
                await FirebaseService.setArchiveStatus(userId, id, targetArchiveStatus);
            } catch (err) {
                console.error("Gagal arsip bulk:", err);
            }
        }

        Utils.showToast(`${count} catatan ${targetArchiveStatus ? 'diarsipkan' : 'dikembalikan'}`, 'success');
        selectedNoteIds.clear();
        isSelectMode = false;
        filterAndRender();
    });

    Utils.safeAddListener('bulkDeleteBtn', 'click', () => {
        if (selectedNoteIds.size === 0) {
            return Utils.showToast('Pilih setidaknya satu catatan terlebih dahulu', 'warning');
        }

        const count = selectedNoteIds.size;
        Utils.showConfirm({
            title: 'Hapus Catatan Terpilih',
            message: `Apakah Anda yakin ingin menghapus ${count} catatan yang dipilih secara permanen?`,
            confirmText: 'Hapus All',
            cancelText: 'Batal',
            type: 'danger'
        }).then(async (confirmed) => {
            if (confirmed) {
                for (const id of selectedNoteIds) {
                    try {
                        await FirebaseService.deleteNoteFromFirestore(userId, id);
                    } catch (err) {
                        console.error("Gagal hapus bulk:", err);
                    }
                }

                Utils.showToast(`${count} catatan berhasil dihapus`, 'success');
                selectedNoteIds.clear();
                isSelectMode = false;
                filterAndRender();
            }
        });
    });

    // --- Logika Menu Brankas (Vault) ---
    let vaultMode = 'enter'; // 'enter' atau 'create'

    // Filter otomatis input PIN hanya menerima angka
    ['vaultInputPassword', 'vaultNewPassword', 'vaultConfirmPassword'].forEach(id => {
        const inputEl = document.getElementById(id);
        if (inputEl) {
            inputEl.addEventListener('input', (e) => {
                e.target.value = e.target.value.replace(/\D/g, '');
            });
        }
    });

    const openVaultModal = (mode) => {
        vaultMode = mode;
        const modalTitle = document.getElementById('vaultModalTitle');
        const modalSubtitle = document.getElementById('vaultModalSubtitle');
        const enterGroup = document.getElementById('vaultEnterPwdGroup');
        const createGroup = document.getElementById('vaultCreatePwdGroup');
        const resetContainer = document.getElementById('vaultResetLinkContainer');
        const submitBtn = document.getElementById('vaultSubmitBtn');
        const errorEl = document.getElementById('vaultPasswordError');

        if (errorEl) { errorEl.style.display = 'none'; errorEl.textContent = ''; }
        const inputPwd = document.getElementById('vaultInputPassword');
        const newPwd = document.getElementById('vaultNewPassword');
        const confirmPwd = document.getElementById('vaultConfirmPassword');
        if (inputPwd) inputPwd.value = '';
        if (newPwd) newPwd.value = '';
        if (confirmPwd) confirmPwd.value = '';

        if (mode === 'create') {
            if (modalTitle) modalTitle.textContent = 'Buat PIN Brankas';
            if (modalSubtitle) modalSubtitle.textContent = 'Silakan buat PIN angka baru (min. 4 angka) untuk mengamankan catatan rahasia.';
            if (enterGroup) enterGroup.classList.add('hidden');
            if (createGroup) createGroup.classList.remove('hidden');
            if (resetContainer) resetContainer.classList.add('hidden');
            if (submitBtn) submitBtn.textContent = 'Simpan PIN & Buka';
        } else {
            if (modalTitle) modalTitle.textContent = 'Masukkan PIN Brankas';
            if (modalSubtitle) modalSubtitle.textContent = 'Masukkan PIN angka untuk membuka catatan rahasia.';
            if (enterGroup) enterGroup.classList.remove('hidden');
            if (createGroup) createGroup.classList.add('hidden');
            if (resetContainer) resetContainer.classList.remove('hidden');
            if (submitBtn) submitBtn.textContent = 'Buka Brankas';
        }

        UI.openModal('vaultPasswordModal');

        // Otomatis fokus ke input password & aktifkan keyboard HP
        setTimeout(() => {
            const targetInput = mode === 'create' ? newPwd : inputPwd;
            if (targetInput) {
                targetInput.focus();
                if (typeof targetInput.select === 'function' && targetInput.value) {
                    targetInput.select();
                }
            }
        }, 150);
    };

    const activateVaultView = () => {
        currentFilter = 'vault';
        currentCategory = 'All';
        isSelectMode = false;
        selectedNoteIds.clear();

        const headerEl = document.getElementById('notesHeader');
        if (headerEl) headerEl.textContent = '🔒 Brankas Catatan';

        document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active-link'));
        const vaultBtn = document.getElementById('vaultFilterBtn');
        if (vaultBtn) vaultBtn.classList.add('active-link');

        filterAndRender();
        if (window.innerWidth < 768) Utils.closeSidebar();
    };

    // Filter Brankas Klik Listener
    const vaultBtn = document.getElementById('vaultFilterBtn');
    if (vaultBtn) {
        vaultBtn.addEventListener('click', (e) => {
            e.preventDefault();
            if (isVaultUnlocked) {
                activateVaultView();
            } else {
                const savedPwd = localStorage.getItem('vault_pwd_' + userId);
                if (!savedPwd) {
                    openVaultModal('create');
                } else {
                    openVaultModal('enter');
                }
            }
        });
    }

    // Tombol Batal Modal Vault
    Utils.safeAddListener('vaultCancelBtn', 'click', () => {
        UI.closeModal('vaultPasswordModal');
    });

    // Form Submit Password Brankas
    const vaultForm = document.getElementById('vaultPasswordForm');
    if (vaultForm) {
        vaultForm.addEventListener('submit', (e) => {
            e.preventDefault();
            const errorEl = document.getElementById('vaultPasswordError');
            const showError = (msg) => {
                if (errorEl) {
                    errorEl.textContent = msg;
                    errorEl.style.display = 'block';
                }
            };

            if (vaultMode === 'create') {
                const newPwdVal = document.getElementById('vaultNewPassword').value.trim();
                const confirmPwdVal = document.getElementById('vaultConfirmPassword').value.trim();

                if (!newPwdVal || !/^\d+$/.test(newPwdVal) || newPwdVal.length < 4) {
                    return showError('PIN harus berupa angka (minimal 4 angka)!');
                }
                if (newPwdVal !== confirmPwdVal) {
                    return showError('Konfirmasi PIN tidak cocok!');
                }

                localStorage.setItem('vault_pwd_' + userId, newPwdVal);
                isVaultUnlocked = true;
                UI.closeModal('vaultPasswordModal');
                activateVaultView();
                Utils.showToast('PIN Brankas berhasil dibuat!', 'success');
            } else {
                const inputPwdVal = document.getElementById('vaultInputPassword').value.trim();
                const savedPwdVal = localStorage.getItem('vault_pwd_' + userId);

                if (inputPwdVal === savedPwdVal) {
                    isVaultUnlocked = true;
                    UI.closeModal('vaultPasswordModal');
                    activateVaultView();
                    Utils.showToast('Brankas terbuka', 'success');
                } else {
                    showError('PIN salah! Silakan coba lagi.');
                }
            }
        });
    }

    // Reset Password Listener (dengan WARNING Hapus Data)
    const resetPwdBtn = document.getElementById('vaultResetPwdBtn');
    if (resetPwdBtn) {
        resetPwdBtn.addEventListener('click', (e) => {
            e.preventDefault();
            UI.closeModal('vaultPasswordModal');

            Utils.showConfirm({
                title: '⚠️ RESET PIN BRANKAS',
                message: 'PERINGATAN! Mereset PIN akan MENGHAPUS SEMUA CATATAN di dalam Brankas secara permanen dan tidak dapat dikembalikan.\n\nApakah Anda yakin ingin mereset PIN dan menghapus semua catatan Brankas?',
                confirmText: 'Ya, Hapus Semua & Reset',
                cancelText: 'Batal',
                type: 'danger'
            }).then(async (confirmed) => {
                if (confirmed) {
                    // Hapus semua catatan di Brankas dari Firestore
                    const vaultNotes = allNotes.filter(n => n.isVault === true || n.category === 'Brankas');
                    for (const note of vaultNotes) {
                        try {
                            await FirebaseService.deleteNoteFromFirestore(userId, note.id);
                        } catch (err) {
                            console.error("Gagal hapus vault note:", err);
                        }
                    }

                    localStorage.removeItem('vault_pwd_' + userId);
                    isVaultUnlocked = false;

                    Utils.showToast('PIN direset & catatan Brankas telah dihapus.', 'warning');
                    
                    setTimeout(() => {
                        openVaultModal('create');
                    }, 500);
                }
            });
        });
    }

    // Kunci Brankas Otomatis saat pindah ke menu lain
    document.querySelectorAll('.category-filter, .archive-filter').forEach(btn => {
        btn.addEventListener('click', () => {
            isVaultUnlocked = false;
        });
    });

    // --- Modal Controls ---
    Utils.safeAddListener('openAddModalBtnMobile', 'click', () => { UI.resetAddEditor(); UI.openModal('addModal'); });
    Utils.safeAddListener('openAddModalBtn', 'click', () => { UI.resetAddEditor(); UI.openModal('addModal'); });
    Utils.safeAddListener('cancelAdd', 'click', () => UI.closeModal('addModal'));
    Utils.safeAddListener('cancelEdit', 'click', () => UI.closeModal('editModal'));
    Utils.safeAddListener('closeView', 'click', () => UI.closeModal('viewModal'));
    Utils.safeAddListener('viewBackBtn', 'click', () => UI.closeModal('viewModal'));

    // --- Mode Switcher: Catatan Teks vs Mode Checklist (Add Modal) ---
    const addTypeTextBtn = document.getElementById('addTypeTextBtn');
    const addTypeChecklistBtn = document.getElementById('addTypeChecklistBtn');
    const addTypeHint = document.getElementById('addTypeHint');
    if (addTypeTextBtn && addTypeChecklistBtn) {
        addTypeTextBtn.addEventListener('click', () => {
            addTypeTextBtn.classList.add('active');
            addTypeChecklistBtn.classList.remove('active');
            if (addTypeHint) addTypeHint.textContent = 'Tulis bebas dengan format teks';
            UI.setEditorChecklistMode('add', false);
        });
        addTypeChecklistBtn.addEventListener('click', () => {
            addTypeChecklistBtn.classList.add('active');
            addTypeTextBtn.classList.remove('active');
            if (addTypeHint) addTypeHint.textContent = 'Mode Checklist: Setiap baris otomatis menjadi daftar tugas centang';
            UI.setEditorChecklistMode('add', true);
        });
    }

    // --- Mode Switcher: Catatan Teks vs Mode Checklist (Edit Modal) ---
    const editTypeTextBtn = document.getElementById('editTypeTextBtn');
    const editTypeChecklistBtn = document.getElementById('editTypeChecklistBtn');
    const editTypeHint = document.getElementById('editTypeHint');
    if (editTypeTextBtn && editTypeChecklistBtn) {
        editTypeTextBtn.addEventListener('click', () => {
            editTypeTextBtn.classList.add('active');
            editTypeChecklistBtn.classList.remove('active');
            if (editTypeHint) editTypeHint.textContent = 'Tulis bebas dengan format teks';
            UI.setEditorChecklistMode('edit', false);
        });
        editTypeChecklistBtn.addEventListener('click', () => {
            editTypeChecklistBtn.classList.add('active');
            editTypeTextBtn.classList.remove('active');
            if (editTypeHint) editTypeHint.textContent = 'Mode Checklist: Setiap baris otomatis menjadi daftar tugas centang';
            UI.setEditorChecklistMode('edit', true);
        });
    }

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

    // --- Navigasi Antar Catatan (Arrow Kiri / Kanan) ---
    function updateNavState() {
        if (!currentViewNoteId || currentFilteredNotes.length === 0) return;
        const idx = currentFilteredNotes.findIndex(n => n.id === currentViewNoteId);
        const total = currentFilteredNotes.length;

        const prevBtns = [document.getElementById('viewPrevBtn'), document.getElementById('viewFooterPrevBtn')];
        const nextBtns = [document.getElementById('viewNextBtn'), document.getElementById('viewFooterNextBtn')];
        const counters = [document.getElementById('viewNavCounter'), document.getElementById('viewFooterNavCounter')];

        counters.forEach(c => {
            if (c) c.textContent = total > 0 && idx !== -1 ? `${idx + 1} / ${total}` : '';
        });

        prevBtns.forEach(btn => {
            if (btn) {
                btn.disabled = (idx <= 0);
                btn.style.opacity = (idx <= 0) ? '0.3' : '1';
                btn.style.cursor = (idx <= 0) ? 'not-allowed' : 'pointer';
            }
        });

        nextBtns.forEach(btn => {
            if (btn) {
                btn.disabled = (idx >= total - 1 || idx === -1);
                btn.style.opacity = (idx >= total - 1 || idx === -1) ? '0.3' : '1';
                btn.style.cursor = (idx >= total - 1 || idx === -1) ? 'not-allowed' : 'pointer';
            }
        });
    }

    function navigateNote(direction) {
        if (!currentViewNoteId || currentFilteredNotes.length <= 1) return;
        const currentIndex = currentFilteredNotes.findIndex(n => n.id === currentViewNoteId);
        if (currentIndex === -1) return;

        const targetIndex = currentIndex + direction;
        if (targetIndex >= 0 && targetIndex < currentFilteredNotes.length) {
            const targetNote = currentFilteredNotes[targetIndex];
            currentViewNoteId = targetNote.id;
            UI.showViewModal(targetNote, handleChecklistToggle);
            updateNavState();
        }
    }

    // Event listener tombol navigasi (header & footer)
    ['viewPrevBtn', 'viewFooterPrevBtn'].forEach(id => {
        Utils.safeAddListener(id, 'click', (e) => {
            e.stopPropagation();
            navigateNote(-1);
        });
    });
    ['viewNextBtn', 'viewFooterNextBtn'].forEach(id => {
        Utils.safeAddListener(id, 'click', (e) => {
            e.stopPropagation();
            navigateNote(1);
        });
    });

    // --- Keyboard Navigation: ESC (Tutup) & Arrow Kiri/Kanan (Ganti Catatan) ---
    window.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            // 1. Tutup Dropdown Menu jika sedang aktif
            const drop = document.getElementById('viewNoteDropdownMenu');
            if (drop && drop.classList.contains('is-visible')) {
                drop.classList.remove('is-visible');
                return;
            }

            // 2. Tutup Modal yang sedang terbuka
            let modalClosed = false;
            ['editModal', 'addModal', 'viewModal'].forEach(id => {
                const m = document.getElementById(id);
                if (m && m.classList.contains('is-visible')) {
                    UI.closeModal(id);
                    modalClosed = true;
                }
            });

            // 3. Tutup Sidebar mobile jika tidak ada modal yang ditutup
            if (!modalClosed) {
                Utils.closeSidebar();
            }
            return;
        }

        // Navigasi Arrow Kiri & Kanan antar catatan (hanya saat viewModal terbuka)
        const viewModal = document.getElementById('viewModal');
        if (viewModal && viewModal.classList.contains('is-visible')) {
            // Hindari tombol arrow saat mengetik di dalam input/textarea/editable
            if (['INPUT', 'TEXTAREA'].includes(document.activeElement.tagName) || document.activeElement.isContentEditable) {
                return;
            }

            if (e.key === 'ArrowLeft') {
                e.preventDefault();
                navigateNote(-1);
            } else if (e.key === 'ArrowRight') {
                e.preventDefault();
                navigateNote(1);
            }
        }
    });

    // --- Tombol Back Mobile (Hardware Back / Gesture Android / Browser Back) ---
    window.addEventListener('popstate', () => {
        const openModals = document.querySelectorAll('.modal-overlay.is-visible');
        if (openModals.length > 0) {
            openModals.forEach(m => {
                m.classList.remove('is-visible');
            });
            const dropdown = document.getElementById('viewNoteDropdownMenu');
            if (dropdown) dropdown.classList.remove('is-visible');
        } else {
            Utils.closeSidebar();
        }
    });

    // --- Delegasi Event Klik pada Notes List (Selection Mode & Individual Actions) ---
    const listContainer = document.getElementById('notesList');
    if (listContainer) {
        listContainer.addEventListener('click', (e) => {
            const card = e.target.closest('.note-card');
            if (!card) return;
            const noteId = card.dataset.id;
            if (!noteId) return;

            const btn = e.target.closest('.note-action-btn');
            const isCheckbox = e.target.classList.contains('note-card-checkbox') || e.target.closest('.note-card-checkbox-container');

            // A. Jika sedang dalam Selection Mode ATAU mengklik Checkbox:
            if (isSelectMode || isCheckbox) {
                e.stopPropagation();
                e.preventDefault();

                if (selectedNoteIds.has(noteId)) {
                    selectedNoteIds.delete(noteId);
                } else {
                    selectedNoteIds.add(noteId);
                }

                // Otomatis aktifkan select mode saat checkbox dicentang pertama kali
                if (selectedNoteIds.size > 0 && !isSelectMode) {
                    isSelectMode = true;
                }

                filterAndRender();
                return;
            }

            // B. Jika dalam Mode Normal (Bukan Selection Mode):
            if (btn) {
                e.stopPropagation();
                const id = btn.dataset.id;
                if (btn.classList.contains('pin-btn')) handleNoteAction('pin', id);
                if (btn.classList.contains('archive-btn')) handleNoteAction('archive', id);
                if (btn.classList.contains('unarchive-btn')) handleNoteAction('unarchive', id);
                if (btn.classList.contains('vault-btn')) handleNoteAction('vault', id);
                if (btn.classList.contains('unvault-btn')) handleNoteAction('unvault', id);
                if (btn.classList.contains('delete-btn')) handleNoteAction('delete', id);
                if (btn.classList.contains('edit-btn')) handleNoteAction('edit', id);
            } else {
                // Klik pada card dalam mode biasa -> Buka modal view
                handleNoteAction('view', noteId);
            }
        });
    }

    // --- Delegasi Tombol Aksi (Dalam Modal View) ---
    const actionIds = [
        'viewHeaderEditBtn', 'viewMenuEdit', 'viewFooterEditBtn', 'editFab',
        'viewHeaderDeleteBtn', 'viewMenuDelete', 'viewFooterDeleteBtn',
        'viewHeaderArchiveBtn', 'viewMenuArchive', 'viewFooterArchiveBtn',
        'viewHeaderUnarchiveBtn', 'viewMenuUnarchive', 'viewFooterUnarchiveBtn',
        'viewHeaderVaultBtn', 'viewMenuVault', 'viewFooterVaultBtn',
        'viewHeaderUnvaultBtn', 'viewMenuUnvault', 'viewFooterUnvaultBtn'
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
                if(id.includes('Vault') && !id.includes('Unvault')) handleNoteAction('vault', noteId);
                if(id.includes('Unvault')) handleNoteAction('unvault', noteId);
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

            const isVault = categoryVal === 'Brankas' || currentFilter === 'vault';

            // D. KIRIM DATA DARI VARIABEL (Bukan document.getElementById lagi)
            FirebaseService.addNoteToFirestore(userId, {
                title: titleVal,       // Pakai variabel
                category: categoryVal, // Pakai variabel
                productLink: linkVal,  // Pakai variabel
                content: editorContent.html,
                plainText: editorContent.text,
                tags: tags,
                isVault: isVault
            })
            .then(() => {
                console.log("✅ Sukses tersimpan");
                Utils.showToast("Catatan berhasil disimpan!", "success");
            })
            .catch(err => {
                console.error("❌ Gagal simpan:", err);
                Utils.showAlert({
                    title: 'Gagal Menyimpan',
                    message: err.message,
                    type: 'danger'
                });
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

            const isVault = categoryVal === 'Brankas' || currentFilter === 'vault';

            FirebaseService.updateNoteInFirestore(userId, noteId, {
                title: titleVal,
                category: categoryVal,
                productLink: linkVal,
                content: editorContent.html,
                plainText: editorContent.text,
                tags: tags,
                isVault: isVault
            })
            .then(() => {
                console.log("✅ Update sukses");
                Utils.showToast("Catatan berhasil diperbarui!", "success");
            })
            .catch(err => {
                console.error("❌ Gagal update:", err);
                Utils.showAlert({
                    title: 'Gagal Update',
                    message: err.message,
                    type: 'danger'
                });
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