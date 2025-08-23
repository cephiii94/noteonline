// firebase-config.js

// Impor fungsi-fungsi dasar yang diperlukan dari Firebase SDK
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

// --- KONFIGURASI FIREBASE ANDA ---
// Ini adalah satu-satunya tempat Anda perlu menyimpan konfigurasi ini.
const firebaseConfig = {
    apiKey: "AIzaSyDlOea99ikDbHSEQ8XswmjyXMCk0P8lFtY",
    authDomain: "project-notonlen.firebaseapp.com",
    projectId: "project-notonlen",
    storageBucket: "project-notonlen.appspot.com",
    messagingSenderId: "592072676592",
    appId: "1:592072676592:web:e544183f12c61a9d261e35",
    measurementId: "G-VL7HDPL94M"
};

// Inisialisasi Firebase
const app = initializeApp(firebaseConfig);

// Inisialisasi layanan Firebase (Authentication dan Firestore)
const auth = getAuth(app);
const db = getFirestore(app);

// Ekspor variabel auth dan db agar bisa digunakan di file lain
export { auth, db };
