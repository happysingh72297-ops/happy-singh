import { db, auth, ADMIN_UID } from "./firebase-config.js";
import { signInWithEmailAndPassword, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/12.5.0/firebase-auth.js";
import { collection, query, orderBy, limit, onSnapshot, deleteDoc, doc } from "https://www.gstatic.com/firebasejs/12.5.0/firebase-firestore.js";

const $ = (id) => document.getElementById(id);
const isAdmin = () => !!auth.currentUser && auth.currentUser.uid === ADMIN_UID;
let unsub = null;

onAuthStateChanged(auth, () => {
    const a = isAdmin();
    $("loginBtn").hidden = a;
    $("logoutBtn").hidden = !a;
    $("lock").hidden = a;
    $("box").hidden = !a;
    if (unsub) { unsub(); unsub = null; }
    if (a) {
        $("list").textContent = "Sandesh load ho rahe hain...";
        unsub = onSnapshot(
            query(collection(db, "messages"), orderBy("createdAt", "desc"), limit(100)),
            (snap) => {
                try { render(snap); }
                catch (e) { $("list").textContent = "Display error: " + e.message; console.error(e); }
            },
            (err) => { $("list").textContent = "Messages nahi aa pa rahe: " + err.message; console.error(err); }
        );
    }
});

$("loginBtn").addEventListener("click", async () => {
    const email = prompt("Enter Admin Email:");
    if (!email) return;
    const password = prompt("Enter Admin Password:");
    if (!password) return;
    try {
        const r = await signInWithEmailAndPassword(auth, email, password);
        if (r.user.uid !== ADMIN_UID) { alert("Access Denied!"); await signOut(auth); }
    } catch (error) {
        alert("Login Error: " + error.message);
    }
});
$("logoutBtn").addEventListener("click", () => signOut(auth));

function fmt(v) {
    try {
        if (!v) return "";
        const d = typeof v.toDate === "function" ? v.toDate() : new Date(v);
        return isNaN(d) ? String(v) : d.toLocaleString("en-IN");
    } catch (e) { return ""; }
}

function render(snap) {
    const box = $("list");
    box.replaceChildren();
    if (snap.empty) {
        const p = document.createElement("p");
        p.textContent = "Abhi koi sandesh nahi aaya.";
        box.appendChild(p);
        return;
    }
    snap.forEach((d) => {
        const m = d.data();
        const row = document.createElement("div");
        row.className = "file-row";

        const info = document.createElement("div");
        info.className = "file-info";

        const name = document.createElement("div");
        name.className = "file-name";
        name.textContent = m.name || "(naam nahi)";

        const meta = document.createElement("small");
        const when = fmt(m.createdAt);
        meta.textContent = [when, m.contact ? "Sampark: " + m.contact : ""].filter(Boolean).join("  |  ");

        const text = document.createElement("p");
        text.style.whiteSpace = "pre-wrap";
        text.textContent = m.text || "";

        info.append(name, meta, text);

        const del = document.createElement("button");
        del.className = "danger";
        del.textContent = "Delete";
        del.onclick = async () => {
            if (!confirm("Ye sandesh delete karna hai?")) return;
            try { await deleteDoc(doc(db, "messages", d.id)); }
            catch (error) { alert("Delete Error: " + error.message); }
        };

        row.append(info, del);
        box.appendChild(row);
    });
}