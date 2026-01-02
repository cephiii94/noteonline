// script/firebase-service.js
import { db, auth } from '../firebase-config.js';
import { 
    collection, addDoc, onSnapshot, doc, updateDoc, deleteDoc, query, where, orderBy 
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { signOut } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";

let notesListenerUnsubscribe = null;

// --- CRUD Operations (Fungsi Database) ---

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
    // Saat di-pin, update juga tanggalnya biar triggernya responsif
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

// --- Realtime Listener (Penyebab Masalah Tadi) ---

export function subscribeToNotes(userId, filterType, category, onUpdateCallback, onErrorCallback) {
    // Bersihkan listener lama biar gak numpuk
    if (notesListenerUnsubscribe) {
        notesListenerUnsubscribe();
    }

    const notesRef = collection(db, 'users', userId, 'notes');
    let q;

    // --- SOLUSI CATATAN HANTU ---
    // Kita minta SEMUA data, diurutkan tanggal update terbaru.
    // Kita TIDAK memfilter "isArchived" di sini, supaya catatan lama (yang gak punya field isArchived) ikut terambil.
    try {
        q = query(notesRef);
    } catch (e) {
        // Fallback kalau Index belum siap
        console.warn("Index Firestore belum siap, mengambil data tanpa sorting server.");
        q = query(notesRef);
    }

    // Pasang Telinga (Listener)
    notesListenerUnsubscribe = onSnapshot(q, (snapshot) => {
        const notes = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        onUpdateCallback(notes); // Kirim data mentah ke Main.js
    }, (error) => {
        if (onErrorCallback) onErrorCallback(error);
    });
}