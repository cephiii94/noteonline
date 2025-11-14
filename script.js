         // Impor konfigurasi Firebase dari file terpisah
        import { auth, db } from './firebase-config.js';
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
          // Mencegah browser menampilkan prompt default
          e.preventDefault();
          // Simpan event untuk digunakan nanti
          deferredPrompt = e;
          // Tampilkan tombol install di sidebar jika elemennya ada
          if (installAppContainer) {
            installAppContainer.classList.remove('hidden');
          }
        });

        if (installAppSidebarBtn) {
            installAppSidebarBtn.addEventListener('click', async (e) => {
              e.preventDefault();
              // Sembunyikan tombol setelah diklik
              if (installAppContainer) {
                 installAppContainer.classList.add('hidden');
              }
              // Tampilkan prompt instalasi
              if (deferredPrompt) {
                  deferredPrompt.prompt();
                  // Tunggu hasil pilihan pengguna
                  const { outcome } = await deferredPrompt.userChoice;
                  console.log(`User response to the install prompt: ${outcome}`);
                  // Kosongkan variabel deferredPrompt karena hanya bisa digunakan sekali
                  deferredPrompt = null;
              }
            });
        }

        window.addEventListener('appinstalled', () => {
          // Sembunyikan tombol jika aplikasi sudah diinstal
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

// --- UI & EVENT LISTENERS ---
        const menuToggle = document.getElementById('menu-toggle');
        const sidebarOverlay = document.getElementById('sidebar-overlay');
        
        // Pertama, kita ambil elemen sidebar-nya dulu agar lebih mudah
        const sidebar = document.getElementById('sidebar'); 

        menuToggle.addEventListener('click', () => {
            // Sama seperti di kanban.html, kita gunakan .toggle()
            sidebar.classList.toggle('-translate-x-full');
            sidebarOverlay.classList.toggle('hidden');
        });

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
                // PERBAIKAN: Menambahkan pengecekan untuk memastikan elemen ada sebelum dimanipulasi
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
            notesList.innerHTML = ''; 
            if (notesToRender.length === 0) {
                notesList.innerHTML = `<p class="text-slate-500 col-span-full text-center py-10">Tidak ada catatan ditemukan.</p>`;
            } else {
                notesToRender.forEach(note => {
                    const noteElement = document.createElement('div');
                    noteElement.className = 'note-card rounded-xl p-4 sm:p-5 flex flex-col justify-between';
                    noteElement.dataset.id = note.id;
                    
                    const tagsHTML = (note.tags || []).map(tag => `<span class="note-tag text-xs font-medium mr-2 px-2.5 py-0.5 rounded-full">${escapeHTML(tag)}</span>`).join('');
                    
                    const dateToDisplay = note.updatedAt ? note.updatedAt.toDate() : note.createdAt.toDate();
                    const dateOptions = { year: 'numeric', month: 'long', day: 'numeric' };
                    const formattedDate = dateToDisplay.toLocaleDateString('id-ID', dateOptions);

                    noteElement.innerHTML = `
                        <div class="note-card-body">
                            <div class="flex justify-between items-center mb-2">
                                <p class="text-sm font-semibold text-blue-600">${escapeHTML(note.category || 'Uncategorized')}</p>
                                <p class="text-xs text-slate-400">${formattedDate}</p>
                            </div>
                            <h3 class="text-lg font-bold text-slate-800 mb-2 break-words">${escapeHTML(note.title)}</h3>
                            <p class="text-slate-600 text-sm break-words">${escapeHTML((note.plainText || '').substring(0, 100))}${ (note.plainText || '').length > 100 ? '...' : ''}</p>
                        </div>
                        <div class="flex-grow"></div>
                        <div class="pt-4 mt-4 border-t border-slate-100">
                            <div class="flex flex-wrap gap-2 mb-4">${tagsHTML}</div>
                            <div class="flex justify-end gap-2">
                                <button data-id="${note.id}" class="edit-btn text-yellow-500 hover:text-yellow-600 w-8 h-8 rounded-full hover:bg-yellow-100 flex items-center justify-center transition" title="Edit"><i class="fas fa-pencil-alt"></i></button>
                                <button data-id="${note.id}" class="delete-btn text-red-500 hover:text-red-600 w-8 h-8 rounded-full hover:bg-red-100 flex items-center justify-center transition" title="Hapus"><i class="fas fa-trash"></i></button>
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
                document.querySelectorAll('.category-filter').forEach(f => f.classList.remove('active-link'));
                e.currentTarget.classList.add('active-link');
                filterAndRenderNotes();
            });
        });

        // --- CRUD ACTIONS ---
        document.getElementById('notesList').addEventListener('click', async (e) => {
            const button = e.target.closest('button');
            const card = e.target.closest('.note-card');

            if (button) { // Tombol Edit atau Hapus diklik
                const noteId = button.dataset.id;
                const noteRef = doc(db, notesCollectionRef.path, noteId);
                if (button.classList.contains('delete-btn')) {
                    // PERBAIKAN: Menggunakan modal kustom, bukan `confirm()` bawaan browser
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

        function openAddModal() {
            addModal.classList.remove('hidden');
        }

        // Add Modal
        document.getElementById('openAddModalBtn').addEventListener('click', openAddModal);
        document.getElementById('openAddModalBtnMobile').addEventListener('click', openAddModal);
        document.getElementById('cancelAdd').addEventListener('click', () => addModal.classList.add('hidden'));
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
            addModal.classList.add('hidden');
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
            editModal.classList.remove('hidden');
        }
        document.getElementById('cancelEdit').addEventListener('click', () => editModal.classList.add('hidden'));
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
            editModal.classList.add('hidden');
        });

        // View Modal
        function showViewModal(note) {
            const contentContainer = document.getElementById('viewNoteContent');
            const productLinkContainer = document.getElementById('productLinkContainer');
            const viewProductLink = document.getElementById('viewProductLink');
            
            document.getElementById('viewNoteTitle').textContent = note.title;
            document.getElementById('viewNoteCategory').textContent = note.category;
            contentContainer.innerHTML = note.content;
            linkifyContainer(contentContainer);
            
            const dateToDisplay = note.updatedAt ? note.updatedAt.toDate() : note.createdAt.toDate();
            const options = { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' };
            const dateLabel = note.updatedAt ? 'Terakhir diubah' : 'Dibuat pada';
            document.getElementById('viewNoteDate').textContent = `${dateLabel} ${dateToDisplay.toLocaleDateString('id-ID', options)}`;

            const tagsContainer = document.getElementById('viewNoteTags');
            tagsContainer.innerHTML = (note.tags || []).map(tag => `<span class="note-tag text-xs font-medium px-2.5 py-0.5 rounded-full">${escapeHTML(tag)}</span>`).join('');
            
            if (note.productLink) {
                viewProductLink.href = note.productLink;
                viewProductLink.textContent = note.productLink;
                productLinkContainer.classList.remove('hidden');
            } else {
                productLinkContainer.classList.add('hidden');
            }

            document.getElementById('editFab').dataset.id = note.id;

            viewModal.classList.remove('hidden');
        }
        document.getElementById('closeView').addEventListener('click', () => viewModal.classList.add('hidden'));
        
        document.getElementById('editFab').addEventListener('click', (e) => {
            const noteId = e.currentTarget.dataset.id;
            if (noteId) {
                const note = allNotes.find(n => n.id === noteId);
                if (note) {
                    viewModal.classList.add('hidden');
                    showEditModal(note);
                }
            }
        });

        [addModal, editModal, viewModal].forEach(modal => {
            modal.addEventListener('click', (e) => {
                if (e.target === modal) {
                    modal.classList.add('hidden');
                }
            });
        });

        // --- CUSTOM CONFIRM MODAL ---
        function showConfirmModal(message, onConfirm) {
            // Hapus modal yang mungkin sudah ada
            const existingModal = document.getElementById('customConfirmModal');
            if (existingModal) {
                existingModal.remove();
            }

            // Buat elemen-elemen modal
            const modalOverlay = document.createElement('div');
            modalOverlay.id = 'customConfirmModal';
            modalOverlay.className = 'fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50';

            const modalContent = document.createElement('div');
            modalContent.className = 'bg-white rounded-2xl shadow-xl w-full max-w-sm p-6';

            const messageP = document.createElement('p');
            messageP.className = 'text-slate-700 text-lg mb-6';
            messageP.textContent = message;

            const buttonContainer = document.createElement('div');
            buttonContainer.className = 'flex justify-end gap-4';

            const cancelBtn = document.createElement('button');
            cancelBtn.textContent = 'Batal';
            cancelBtn.className = 'bg-slate-200 hover:bg-slate-300 text-slate-800 font-bold py-2 px-6 rounded-lg transition';

            const confirmBtn = document.createElement('button');
            confirmBtn.textContent = 'Hapus';
            confirmBtn.className = 'bg-red-500 hover:bg-red-600 text-white font-bold py-2 px-6 rounded-lg transition';

            // Gabungkan elemen-elemen
            buttonContainer.appendChild(cancelBtn);
            buttonContainer.appendChild(confirmBtn);
            modalContent.appendChild(messageP);
            modalContent.appendChild(buttonContainer);
            modalOverlay.appendChild(modalContent);
            document.body.appendChild(modalOverlay);

            // Tambahkan event listener
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
                const urlRegex = /\b((https?:\/\/|www\.)[^\s,."<>()]+|[a-zA-Z0-9.-]+\.(com|id|org|net|io|dev|app|co\.id)([^\s,."<>()]*))\b/g;
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
                    a.className = 'text-blue-500 hover:underline';
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

