import { db, auth } from "./firebase-config.js";
import { onAuthStateChanged, signInAnonymously } from "https://www.gstatic.com/firebasejs/12.5.0/firebase-auth.js";
import { collection, addDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/12.5.0/firebase-firestore.js";

const $ = (id) => document.getElementById(id);
const say = (t) => { $("cstatus").textContent = t; };

onAuthStateChanged(auth, (u) => { if (!u) signInAnonymously(auth).catch(() => {}); });

$("cform").addEventListener("submit", async (e) => {
    e.preventDefault();
    if ($("hp").value) return; // bot pakadne ka chhupa hua box

    try {
        if (Date.now() - Number(localStorage.getItem("lastMsg") || 0) < 60000) {
            say("Thodi der baad dobara bhejein.");
            return;
        }
    } catch (err) {}

    const user = auth.currentUser;
    if (!user) { say("Connect ho raha hai, ek second baad dobara dabayein."); return; }

    $("cbtn").disabled = true;
    say("Bhej rahe hain...");
    try {
        await addDoc(collection(db, "messages"), {
            uid: user.uid,
            name: $("cn").value.trim().slice(0, 60),
            contact: $("cc").value.trim().slice(0, 100),
            text: $("cm").value.trim().slice(0, 1000),
            createdAt: serverTimestamp()
        });
        e.target.reset();
        try { localStorage.setItem("lastMsg", String(Date.now())); } catch (err) {}
        say("Sandesh bhej diya gaya. Dhanyavaad!");
    } catch (error) {
        say("Sandesh nahi gaya. Thodi der baad try karein.");
    }
    $("cbtn").disabled = false;
});