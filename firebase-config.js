import { initializeApp } from "https://www.gstatic.com/firebasejs/12.5.0/firebase-app.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/12.5.0/firebase-firestore.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/12.5.0/firebase-auth.js";

// ====== script.js wali wahi values yahan paste karein ======
const firebaseConfig = {
   apiKey: "AIzaSyA8kmNVPwfCh0Ya-exylf0ef1KiV9uJVqI",
    authDomain: "happy--singh.firebaseapp.com",
    projectId: "happy--singh",
    storageBucket: "happy--singh.firebasestorage.app",
    messagingSenderId: "816851062510",
    appId: "1:816851062510:web:d2eeb6b731bb5edb142dff",
    measurementId: "G-V0KB66W9FZ"
};
export const ADMIN_UID = "Cgr034JE6rgFsNikElALAp3CEPG3";
// ===========================================================

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const auth = getAuth(app);