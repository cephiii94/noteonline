// script/kanban.js
import { auth } from '../firebase-config.js';
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import * as FirebaseService from './firebase-service.js';
import * as Utils from './utils.js'; 
import { initAllCustomDropdowns } from './custom-select.js';

// Initialize Custom Dropdowns (Sekali saat load)
initAllCustomDropdowns();

// --- Integrasi Sidebar & Tema ---
Utils.safeAddListener('mobile-menu-toggle', 'click', Utils.toggleSidebar);
Utils.safeAddListener('desktop-menu-toggle', 'click', Utils.toggleSidebar);
Utils.safeAddListener('sidebar-overlay', 'click', Utils.closeSidebar);

window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        Utils.closeSidebar();
    }
});

const savedTheme = localStorage.getItem('theme');
if(savedTheme) Utils.setTheme(savedTheme);
Utils.safeAddListener('themeToggle', 'click', () => {
    const isDark = document.body.classList.contains('dark-mode');
    Utils.setTheme(isDark ? 'light' : 'dark');
});

// --- LOGIKA KANBAN ---
let userId = null;
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

// --- FITUR AUTO SCROLL (Penggeser Layar saat Drag) ---
function autoScrollBoard(clientX) {
    if (!els.board) return;
    
    const { left, right } = els.board.getBoundingClientRect();
    const buffer = 80; // Jarak 80px dari pinggir untuk mulai scroll
    const speed = 15;  // Kecepatan geser

    if (clientX > right - buffer) {
        els.board.scrollLeft += speed;
    } else if (clientX < left + buffer) {
        els.board.scrollLeft -= speed;
    }
}

function initFirebase() {
    onAuthStateChanged(auth, (user) => {
        if (user) {
            userId = user.uid;
            if(els.userEmailDisplay) els.userEmailDisplay.textContent = user.email;
            if(els.userNameDisplay) els.userNameDisplay.textContent = user.displayName || user.email.split('@')[0];
            
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
        FirebaseService.logoutUser().then(() => window.location.href = 'login.html');
    });
}

function listenForTasks() {
    FirebaseService.subscribeToKanbanTasks(userId, (tasks) => {
        allTasks = tasks;
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
            FirebaseService.updateKanbanTask(userId, task.id, { title: title.innerText });
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
                FirebaseService.updateKanbanTask(userId, task.id, { column: newCol });
            }
        });
        actions.appendChild(moveSelect);

        if (task.column !== 'done') {
            const doneBtn = document.createElement('button');
            doneBtn.className = 'icon-btn success';
            doneBtn.innerHTML = '<i class="fas fa-check"></i>';
            doneBtn.addEventListener('click', () => {
                FirebaseService.updateKanbanTask(userId, task.id, { column: 'done' });
            });
            actions.appendChild(doneBtn);
        }

        const delBtn = document.createElement('button');
        delBtn.className = 'icon-btn danger';
        delBtn.innerHTML = '<i class="fas fa-trash"></i>';
        delBtn.addEventListener('click', () => {
            Utils.showConfirm({
                title: 'Hapus Tugas',
                message: 'Apakah Anda yakin ingin menghapus tugas ini?',
                confirmText: 'Hapus',
                cancelText: 'Batal',
                type: 'danger'
            }).then(confirmed => {
                if (confirmed) {
                    FirebaseService.deleteKanbanTask(userId, task.id);
                    Utils.showToast('Tugas berhasil dihapus', 'success');
                }
            });
        });
        actions.appendChild(delBtn);

        h.append(title, actions);

        const note = document.createElement('textarea');
        note.className = 'card-note';
        note.placeholder = 'Catatan...';
        note.value = task.note || '';
        note.addEventListener('change', () => { 
            FirebaseService.updateKanbanTask(userId, task.id, { note: note.value });
        });

        card.append(h, note);
        
        // --- DRAG START (DESKTOP) ---
        card.addEventListener('dragstart', e => { 
            e.dataTransfer.setData('text/plain', task.id); 
        });

        // --- DRAG (DESKTOP) UNTUK AUTO SCROLL ---
        card.addEventListener('drag', (e) => {
            if(e.clientX > 0) autoScrollBoard(e.clientX);
        });

        setupTouchDrag(card, task);

        const zone = document.querySelector(`.dropzone[data-col="${task.column}"]`);
        if(zone) zone.appendChild(card);
    });
}

// --- LOGIC DROPZONE (DESKTOP) ---
document.querySelectorAll('.dropzone').forEach(zone => {
    zone.addEventListener('dragover', e => { 
        e.preventDefault(); 
        zone.classList.add('dragover');
        autoScrollBoard(e.clientX);
    });
    
    zone.addEventListener('dragleave', () => zone.classList.remove('dragover'));
    
    zone.addEventListener('drop', e => {
        e.preventDefault();
        zone.classList.remove('dragover');
        const id = e.dataTransfer.getData('text/plain');
        const t = allTasks.find(x => x.id === id);
        if (t && isAuthReady) { 
            FirebaseService.updateKanbanTask(userId, t.id, { column: zone.dataset.col });
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
        
        moveGhost(t.clientX, t.clientY);
        autoScrollBoard(t.clientX); 
        
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
            FirebaseService.updateKanbanTask(userId, task.id, { column: currentZone.dataset.col });
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
            FirebaseService.addKanbanTask(userId, {
                title: title,
                note: '',
                column: els.newColumn.value
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
    els.importFile.addEventListener('change', async e => {
        const f = e.target.files[0];
        if (!f) return;
        const reader = new FileReader();
        reader.onload = async () => {
            try {
                const arr = JSON.parse(String(reader.result));
                if (Array.isArray(arr) && isAuthReady) {
                    for (const {id, ...data} of arr) {
                        await FirebaseService.addKanbanTask(userId, data);
                    }
                    Utils.showToast('Import Berhasil!', 'success');
                }
            } catch(e) { 
                Utils.showAlert({
                    title: 'Gagal Import',
                    message: 'Format file JSON tidak valid.',
                    type: 'danger'
                });
            }
        };
        reader.readAsText(f);
    });
}

initFirebase();