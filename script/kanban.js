// script/kanban.js

// Naik satu level (../) untuk akses firebase-config di root
import { auth, db } from '../firebase-config.js';
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { doc, addDoc, updateDoc, deleteDoc, onSnapshot, collection, setLogLevel } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

import * as Utils from './utils.js'; 

// --- Integrasi Sidebar & Tema ---
Utils.safeAddListener('mobile-menu-toggle', 'click', Utils.toggleSidebar);
Utils.safeAddListener('desktop-menu-toggle', 'click', Utils.toggleSidebar);
Utils.safeAddListener('sidebar-overlay', 'click', Utils.closeSidebar);

const savedTheme = localStorage.getItem('theme');
if(savedTheme) Utils.setTheme(savedTheme);
Utils.safeAddListener('themeToggle', 'click', () => {
    const isDark = document.body.classList.contains('dark-mode');
    Utils.setTheme(isDark ? 'light' : 'dark');
});

// --- LOGIKA KANBAN ---
let userId = null;
let kanbanCollectionRef;
let isAuthReady = false;

const els = {
    newTitle: document.getElementById('newTitle'),
    newColumn: document.getElementById('newColumn'),
    addBtn: document.getElementById('addBtn'),
    search: document.getElementById('search'),
    resetBtn: document.getElementById('resetBtn'),
    exportBtn: document.getElementById('exportBtn'),
    importBtn: document.getElementById('importBtn'),
    importFile: document.getElementById('importFile'),
    board: document.getElementById('board'), // Container Board
    loading: document.getElementById('loading'),
    userEmailDisplay: document.getElementById('userEmailDisplay'),
    userNameDisplay: document.getElementById('userNameDisplay'),
    logoutBtn: document.getElementById('logoutBtn')
};

let allTasks = [];

// --- FITUR BARU: AUTO SCROLL (Matematika Penggeser Layar) ---
// Fungsi ini akan dipanggil saat drag (Mouse & Touch)
function autoScrollBoard(clientX) {
    if (!els.board) return;
    
    const { left, right } = els.board.getBoundingClientRect();
    const buffer = 80; // Jarak 80px dari pinggir untuk mulai scroll
    const speed = 15;  // Kecepatan geser

    // Jika mouse/jari ada di sisi KANAN layar -> Geser Kanan
    if (clientX > right - buffer) {
        els.board.scrollLeft += speed;
    }
    // Jika mouse/jari ada di sisi KIRI layar -> Geser Kiri
    else if (clientX < left + buffer) {
        els.board.scrollLeft -= speed;
    }
}

function initFirebase() {
    onAuthStateChanged(auth, (user) => {
        if (user) {
            userId = user.uid;
            if(els.userEmailDisplay) els.userEmailDisplay.textContent = user.email;
            if(els.userNameDisplay) els.userNameDisplay.textContent = user.displayName || user.email.split('@')[0];
            
            kanbanCollectionRef = collection(db, `kanban/users/${userId}`); 
            isAuthReady = true;
            if(els.loading) els.loading.style.display = 'none';
            if(els.board) els.board.style.display = 'flex'; // Flex row (samping)
            listenForTasks();
        } else {
            isAuthReady = false;
            window.location.href = 'login.html';
        }
    });
}

if(els.logoutBtn) {
    els.logoutBtn.addEventListener('click', () => {
        signOut(auth).then(() => window.location.href = 'login.html');
    });
}

function listenForTasks() {
    onSnapshot(kanbanCollectionRef, (snapshot) => {
        allTasks = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        render();
    }, (error) => console.error("Error fetching tasks:", error));
}

function render(){
    const q = els.search.value.trim().toLowerCase();
    document.querySelectorAll('.dropzone').forEach(z => z.innerHTML = '');
    
    const filteredTasks = allTasks.filter(t => !q || (t.title + " " + (t.note || '')).toLowerCase().includes(q));

    filteredTasks.forEach(task => {
        const card = document.createElement('div');
        card.className = 'kanban-card'; 
        card.draggable = true;
        card.dataset.id = task.id;

        const h = document.createElement('div');
        h.className = 'card-header';
        
        const title = document.createElement('div');
        title.className = 'card-title';
        title.contentEditable = 'true';
        title.innerText = task.title;
        title.addEventListener('input', () => {
            updateDoc(doc(db, kanbanCollectionRef.path, task.id), { title: title.innerText, updatedAt: new Date() });
        });
        
        const actions = document.createElement('div');
        actions.className = 'card-actions';

        // Dropdown Pindah (Mobile Friendly)
        const moveSelect = document.createElement('select');
        moveSelect.className = 'mobile-move-select';
        moveSelect.innerHTML = `
            <option value="" disabled selected>Pindah..</option>
            <option value="backlog">📋 Backlog</option>
            <option value="doing">🔥 Proses</option>
            <option value="done">✅ Selesai</option>
        `;
        const currentOpt = moveSelect.querySelector(`option[value="${task.column}"]`);
        if(currentOpt) currentOpt.remove();

        moveSelect.addEventListener('change', (e) => {
            const newCol = e.target.value;
            if(newCol) {
                updateDoc(doc(db, kanbanCollectionRef.path, task.id), { column: newCol, updatedAt: new Date() });
            }
        });
        actions.appendChild(moveSelect);

        if (task.column !== 'done') {
            const doneBtn = document.createElement('button');
            doneBtn.className = 'icon-btn success';
            doneBtn.innerHTML = '<i class="fas fa-check"></i>';
            doneBtn.addEventListener('click', () => {
                updateDoc(doc(db, kanbanCollectionRef.path, task.id), { column: 'done', updatedAt: new Date() });
            });
            actions.appendChild(doneBtn);
        }

        const delBtn = document.createElement('button');
        delBtn.className = 'icon-btn danger';
        delBtn.innerHTML = '<i class="fas fa-trash"></i>';
        delBtn.addEventListener('click', () => {
            if(confirm('Hapus tugas ini?')) deleteDoc(doc(db, kanbanCollectionRef.path, task.id));
        });
        actions.appendChild(delBtn);

        h.append(title, actions);

        const note = document.createElement('textarea');
        note.className = 'card-note';
        note.placeholder = 'Catatan...';
        note.value = task.note || '';
        note.addEventListener('change', () => { 
            updateDoc(doc(db, kanbanCollectionRef.path, task.id), { note: note.value, updatedAt: new Date() });
        });

        card.append(h, note);
        
        // --- DRAG START (DESKTOP) ---
        card.addEventListener('dragstart', e => { 
            e.dataTransfer.setData('text/plain', task.id); 
        });

        // --- DRAG (DESKTOP) UNTUK AUTO SCROLL ---
        // Saat kita drag card, kita cek posisi mouse untuk scroll
        card.addEventListener('drag', (e) => {
            // e.clientX bernilai 0 saat drag selesai, jadi kita cek if > 0
            if(e.clientX > 0) autoScrollBoard(e.clientX);
        });

        setupTouchDrag(card, task);

        const zone = document.querySelector(`.dropzone[data-col="${task.column}"]`);
        if(zone) zone.appendChild(card);
    });
}

// --- LOGIC DROPZONE (DESKTOP) ---
document.querySelectorAll('.dropzone').forEach(zone => {
    // Kita tambahkan autoScroll juga di sini biar makin responsif
    zone.addEventListener('dragover', e => { 
        e.preventDefault(); 
        zone.classList.add('dragover');
        autoScrollBoard(e.clientX); // <-- Auto Scroll saat hover di zone lain
    });
    
    zone.addEventListener('dragleave', () => zone.classList.remove('dragover'));
    
    zone.addEventListener('drop', e => {
        e.preventDefault();
        zone.classList.remove('dragover');
        const id = e.dataTransfer.getData('text/plain');
        const t = allTasks.find(x => x.id === id);
        if (t && isAuthReady) { 
            updateDoc(doc(db, kanbanCollectionRef.path, t.id), { column: zone.dataset.col, updatedAt: new Date() });
        }
    });
});

// --- LOGIC TOUCH DRAG (MOBILE) ---
let ghost = null, currentZone = null;
function setupTouchDrag(card, task){
    let timer = null;
    card.addEventListener('touchstart', (e) => {
        if(e.touches.length !== 1) return;
        timer = setTimeout(() => {
            e.preventDefault(); 
            const t = e.touches[0];
            ghost = card.cloneNode(true);
            ghost.classList.add('ghost');
            ghost.style.width = card.offsetWidth + 'px';
            document.body.appendChild(ghost);
            moveGhost(t.clientX, t.clientY);
        }, 200);
    }, {passive: false});

    card.addEventListener('touchmove', (e) => {
        if(!ghost) { clearTimeout(timer); return; }
        e.preventDefault();
        const t = e.touches[0];
        
        // 1. Gerakkan Ghost
        moveGhost(t.clientX, t.clientY);
        
        // 2. Auto Scroll (PENTING BUAT HP)
        autoScrollBoard(t.clientX); 
        
        // 3. Highlight Zone
        const el = document.elementFromPoint(t.clientX, t.clientY);
        const zone = el ? el.closest('.dropzone') : null;
        if(currentZone && currentZone !== zone) currentZone.classList.remove('dragover');
        if(zone) zone.classList.add('dragover');
        currentZone = zone;
    }, {passive: false});

    const endDrag = () => {
        clearTimeout(timer);
        if(ghost) ghost.remove(); ghost = null;
        if(currentZone) {
            currentZone.classList.remove('dragover');
            updateDoc(doc(db, kanbanCollectionRef.path, task.id), { column: currentZone.dataset.col, updatedAt: new Date() });
            currentZone = null;
        }
    };
    card.addEventListener('touchend', endDrag);
    card.addEventListener('touchcancel', endDrag);
}

function moveGhost(x, y) {
    if(ghost) ghost.style.transform = `translate(${x}px, ${y}px) rotate(3deg)`;
}

// --- CONTROLS ---
if(els.addBtn) {
    els.addBtn.addEventListener('click', ()=>{
        const title = els.newTitle.value.trim();
        if(!title) return els.newTitle.focus();
        if (isAuthReady) {
            addDoc(kanbanCollectionRef, {
                title: title, note: '', column: els.newColumn.value, createdAt: new Date()
            });
        }
        els.newTitle.value = '';
    });
}

if(els.search) els.search.addEventListener('input', render);
if(els.resetBtn) els.resetBtn.addEventListener('click', ()=>{ els.search.value = ''; render(); });

if(els.exportBtn) {
    els.exportBtn.addEventListener('click', ()=>{
        const blob = new Blob([JSON.stringify(allTasks, null, 2)], {type:'application/json'});
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = `kanban-backup.json`;
        a.click(); URL.revokeObjectURL(url);
    });
}

if(els.importBtn) els.importBtn.addEventListener('click', ()=> els.importFile.click());
if(els.importFile) {
    els.importFile.addEventListener('change', e => {
        const f = e.target.files[0];
        if (!f) return;
        const reader = new FileReader();
        reader.onload = () => {
            try {
                const arr = JSON.parse(String(reader.result));
                if (Array.isArray(arr) && isAuthReady) {
                    arr.forEach(({id, ...data}) => addDoc(kanbanCollectionRef, data));
                    alert('Import Berhasil!');
                }
            } catch(e) { alert('Gagal Import'); }
        };
        reader.readAsText(f);
    });
}

initFirebase();