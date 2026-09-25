// script/firebase-service.js
import { db, auth } from '../firebase-config.js';
import { 
    collection, addDoc, onSnapshot, doc, updateDoc, deleteDoc, query 
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { signOut } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";

let notesListenerUnsubscribe = null;
let kanbanListenerUnsubscribe = null;

// --- CRUD Operations (Catatan) ---

export async function addNoteToFirestore(userId, noteData) {
    const notesRef = collection(db, 'users', userId, 'notes');
    return await addDoc(notesRef, {
        ...noteData,
        createdAt: new Date(),
        updatedAt: new Date(),
        isPinned: false,   // Default tidak dipin
        isArchived: false  // Default tidak diarsip
    });
}

export async function updateNoteInFirestore(userId, noteId, updateData) {
    const noteRef = doc(db, 'users', userId, 'notes', noteId);
    return await updateDoc(noteRef, {
        ...updateData,
        updatedAt: new Date()
    });
}

export async function deleteNoteFromFirestore(userId, noteId) {
    const noteRef = doc(db, 'users', userId, 'notes', noteId);
    return await deleteDoc(noteRef);
}

export async function togglePinNote(userId, noteId, currentStatus) {
    const noteRef = doc(db, 'users', userId, 'notes', noteId);
    // Saat di-pin, update juga tanggalnya biar responsif
    return await updateDoc(noteRef, { 
        isPinned: !currentStatus,
        updatedAt: new Date() 
    });
}

export async function setArchiveStatus(userId, noteId, isArchived) {
    const noteRef = doc(db, 'users', userId, 'notes', noteId);
    const data = { isArchived: isArchived, updatedAt: new Date() };
    
    // Kalau masuk arsip, otomatis lepas Pin-nya
    if (isArchived) data.isPinned = false;
    
    return await updateDoc(noteRef, data);
}

export async function logoutUser() {
    return await signOut(auth);
}

// --- Realtime Listener (Catatan) ---

export function subscribeToNotes(userId, onUpdateCallback, onErrorCallback) {
    // Bersihkan listener lama biar tidak menumpuk
    if (notesListenerUnsubscribe) {
        notesListenerUnsubscribe();
    }

    const notesRef = collection(db, 'users', userId, 'notes');
    const q = query(notesRef);

    // Pasang listener real-time
    notesListenerUnsubscribe = onSnapshot(q, (snapshot) => {
        const notes = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        onUpdateCallback(notes); // Kirim data mentah ke Main.js
    }, (error) => {
        if (onErrorCallback) onErrorCallback(error);
    });
    return notesListenerUnsubscribe;
}

// --- CRUD & Realtime Listener (Kanban Tasks) ---

export function subscribeToKanbanTasks(userId, onUpdateCallback, onErrorCallback) {
    if (kanbanListenerUnsubscribe) {
        kanbanListenerUnsubscribe();
    }

    const kanbanRef = collection(db, 'kanban', 'users', userId);
    kanbanListenerUnsubscribe = onSnapshot(kanbanRef, (snapshot) => {
        const tasks = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        onUpdateCallback(tasks);
    }, (error) => {
        if (onErrorCallback) onErrorCallback(error);
    });
    return kanbanListenerUnsubscribe;
}

export async function addKanbanTask(userId, taskData) {
    const kanbanRef = collection(db, 'kanban', 'users', userId);
    return await addDoc(kanbanRef, {
        ...taskData,
        createdAt: new Date(),
        updatedAt: new Date()
    });
}

export async function updateKanbanTask(userId, taskId, updateData) {
    const taskRef = doc(db, 'kanban', 'users', userId, taskId);
    return await updateDoc(taskRef, {
        ...updateData,
        updatedAt: new Date()
    });
}

export async function deleteKanbanTask(userId, taskId) {
    const taskRef = doc(db, 'kanban', 'users', userId, taskId);
    return await deleteDoc(taskRef);
}