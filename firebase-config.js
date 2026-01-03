// firebase-config.js - FIX VERSION

// Import fungsi yang BENAR dari URL CDN
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
// Hapus 'indexedDbLocalCache', cukup 'persistentLocalCache' saja
import { 
    initializeFirestore, 
    persistentLocalCache 
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

const firebaseConfig = {
    apiKey: "AIzaSyDlOea99ikDbHSEQ8XswmjyXMCk0P8lFtY",
    authDomain: "project-notonlen.firebaseapp.com",
    projectId: "project-notonlen",
    storageBucket: "project-notonlen.appspot.com",
    messagingSenderId: "592072676592",
    appId: "1:592072676592:web:e544183f12c61a9d261e35",
    measurementId: "G-VL7HDPL94M"
};

// Inisialisasi Firebase App
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);

// --- BAGIAN INI YANG DIPERBAIKI BRI ---
// Kita inisialisasi Firestore dengan cache lokal yang persisten.
// persistentLocalCache() otomatis menggunakan IndexedDB di background.
const db = initializeFirestore(app, {
    localCache: persistentLocalCache() 
});

export { auth, db };