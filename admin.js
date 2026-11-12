import { initializeApp } from "https://www.gstatic.com/firebasejs/12.5.0/firebase-app.js";

import {
    getFirestore,
    collection,
    addDoc,
    onSnapshot,
    serverTimestamp,
    doc,
    deleteDoc,
    getDocs,
    query,
    where,
    writeBatch
} from "https://www.gstatic.com/firebasejs/12.5.0/firebase-firestore.js";

import {
    getAuth,
    signInWithEmailAndPassword,
    onAuthStateChanged,
    signOut
} from "https://www.gstatic.com/firebasejs/12.5.0/firebase-auth.js";

// ---------------- Config: script.js wali same values yahan paste karo ----------------
const firebaseConfig = {
    apiKey: "AIzaSyA8kmNVPwfCh0Ya-exylf0ef1KiV9uJVqI",
    authDomain: "happy--singh.firebaseapp.com",
    projectId: "happy--singh",
    storageBucket: "happy--singh.firebasestorage.app",
    messagingSenderId: "816851062510",
    appId: "1:816851062510:web:d2eeb6b731bb5edb142dff",
    measurementId: "G-V0KB66W9FZ"
};

const ADMIN_UID = "Cgr034JE6rgFsNikElALAp3CEPG3";
const CLOUD_NAME = "avyiho22";
const UPLOAD_PRESET = "happysingh_bheshkitaang";


// Cloudinary free plan ke hisaab se limits (MB). Zaroorat ho to badlo.
const MAX_MB = { image: 10, audio: 20, video: 100, file: 10 };

// ---------------- Firebase ----------------
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

const $ = (id) => document.getElementById(id);

function isAdmin() {
    return !!auth.currentUser && auth.currentUser.uid === ADMIN_UID;
}

// ---------------- State ----------------
let foldersPublic = [];
let foldersAdmin = [];
let files = [];
let currentFolder = null; // { id, name, section }
let unsubPublic = null;
let unsubAdmin = null;
let unsubFiles = null;

// ---------------- Admin login / logout ----------------
async function adminLogin() {
    const email = prompt("Enter Admin Email:");
    if (!email) return;

    const password = prompt("Enter Admin Password:");
    if (!password) return;

    try {
        const result = await signInWithEmailAndPassword(auth, email, password);

        if (result.user.uid !== ADMIN_UID) {
            alert("Access Denied!");
            await signOut(auth);
            return;
        }
    } catch (error) {
        alert("Login Error: " + error.message);
    }
}

async function adminLogout() {
    try {
        await signOut(auth);
    } catch (error) {
        alert(error.message);
    }
}

// ---------------- Page show/hide ----------------
// Ye sirf dikhawa hai. Asli suraksha Firestore Rules se hoti hai.
function updateUI() {
    const admin = isAdmin();

    $("loginBtn").hidden = admin;
    $("logoutBtn").hidden = !admin;
    document.querySelectorAll(".admin-only").forEach((el) => { el.hidden = !admin; });

    $("adminLock").hidden = admin;
    $("adminBox").hidden = !admin;

    if (admin) {
        if (!unsubAdmin) startFolders("admin");
    } else {
        if (unsubAdmin) { unsubAdmin(); unsubAdmin = null; }
        foldersAdmin = [];
        if (currentFolder && currentFolder.section === "admin") closeFolder();
    }

    renderFolders();
    renderFiles();
}

onAuthStateChanged(auth, () => updateUI());

// ---------------- Helpers ----------------
function getFileKind(file) {
    if (file.type.startsWith("image/")) return "image";
    if (file.type.startsWith("video/")) return "video";
    if (file.type.startsWith("audio/")) return "audio";
    return "file";
}

function fileIcon(kind) {
    if (kind === "image") return "🖼";
    if (kind === "video") return "🎬";
    if (kind === "audio") return "🎵";
    return "📄";
}

function formatSize(bytes) {
    if (!bytes) return "";
    if (bytes < 1024 * 1024) return Math.round(bytes / 1024) + " KB";
    return (bytes / (1024 * 1024)).toFixed(1) + " MB";
}

function safeCloudUrl(url) {
    return typeof url === "string" && url.startsWith("https://res.cloudinary.com/");
}

function setStatus(text) {
    $("status").textContent = text;
}

function byNewest(a, b) {
    return (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0);
}

// ---------------- Cloudinary upload ----------------
async function uploadFile(file) {
    const kind = getFileKind(file);
    const limit = MAX_MB[kind];

    if (file.size > limit * 1024 * 1024) {
        throw new Error(file.name + ": ye file " + limit + "MB se chhoti honi chahiye.");
    }

    const formData = new FormData();
    formData.append("file", file);
    formData.append("upload_preset", UPLOAD_PRESET);

    const res = await fetch(
        "https://api.cloudinary.com/v1_1/" + CLOUD_NAME + "/auto/upload",
        { method: "POST", body: formData }
    );
    const data = await res.json();

    if (!res.ok || !data.secure_url) {
        throw new Error((data.error && data.error.message) || "Upload fail ho gaya.");
    }
    return { url: data.secure_url, kind: kind, name: file.name, size: file.size };
}

// ---------------- Folders ----------------
// section = "public" (sabko dikhe) ya "admin" (sirf admin ko)
function startFolders(section) {
    const unsub = onSnapshot(
        query(collection(db, "folders"), where("section", "==", section)),
        (snapshot) => {
            const list = snapshot.docs
                .map((d) => ({ id: d.id, ...d.data() }))
                .sort(byNewest);

            if (section === "public") foldersPublic = list;
            else foldersAdmin = list;

            renderFolders();
        },
        (error) => console.error("Folders Loading Error (" + section + "):", error)
    );

    if (section === "public") unsubPublic = unsub;
    else unsubAdmin = unsub;
}

async function createFolder(section, inputId) {
    if (!isAdmin()) return;

    const input = $(inputId);
    const name = input.value.trim().slice(0, 40);
    if (!name) {
        alert("Folder ka naam likho.");
        return;
    }

    try {
        await addDoc(collection(db, "folders"), {
            name: name,
            section: section,
            createdAt: serverTimestamp()
        });
        input.value = "";
    } catch (error) {
        alert("Folder Error: " + error.message);
    }
}

function renderGrid(list, boxId, emptyText) {
    const box = $(boxId);
    box.replaceChildren();

    if (!list.length) {
        const p = document.createElement("p");
        p.textContent = emptyText;
        box.appendChild(p);
        return;
    }

    list.forEach((f) => {
        const card = document.createElement("button");
        card.className = "folder-card";
        card.type = "button";

        const icon = document.createElement("span");
        icon.className = "folder-icon";
        icon.textContent = "📁";

        const name = document.createElement("span");
        name.className = "folder-name";
        name.textContent = f.name;

        card.append(icon, name);
        card.onclick = () => openFolder({ id: f.id, name: f.name, section: f.section });
        box.appendChild(card);
    });
}

function renderFolders() {
    renderGrid(foldersPublic, "foldersPublic", "Abhi koi public folder nahi hai.");
    renderGrid(foldersAdmin, "foldersAdmin", "Abhi koi admin folder nahi hai.");
}

function openFolder(folder) {
    currentFolder = folder;
    files = [];

    $("listBox").hidden = true;
    $("folderBox").hidden = false;
    $("folderTitle").textContent =
        (folder.section === "public" ? "🌍 Public / " : "🔒 Admin / ") + folder.name;
    setStatus("");
    renderFiles();

    if (unsubFiles) unsubFiles();
    unsubFiles = onSnapshot(
        query(
            collection(db, "files"),
            where("folderId", "==", folder.id),
            where("section", "==", folder.section)
        ),
        (snapshot) => {
            files = snapshot.docs
                .map((d) => ({ id: d.id, ...d.data() }))
                .sort(byNewest);
            renderFiles();
        },
        (error) => console.error("Files Loading Error:", error)
    );
}

function closeFolder() {
    if (unsubFiles) { unsubFiles(); unsubFiles = null; }
    currentFolder = null;
    files = [];

    $("folderBox").hidden = true;
    $("listBox").hidden = false;
}

async function deleteFolder() {
    if (!isAdmin() || !currentFolder) return;

    if (!confirm("Folder aur uski saari files delete karni hain?")) return;

    try {
        const snap = await getDocs(
            query(
                collection(db, "files"),
                where("folderId", "==", currentFolder.id),
                where("section", "==", currentFolder.section)
            )
        );

        const batch = writeBatch(db);
        snap.forEach((d) => batch.delete(d.ref));
        batch.delete(doc(db, "folders", currentFolder.id));
        await batch.commit();

        closeFolder();
    } catch (error) {
        alert("Delete Folder Error: " + error.message);
    }
}

// ---------------- Files ----------------
async function uploadFiles() {
    if (!isAdmin() || !currentFolder) return;

    const input = $("fileInput");
    const list = Array.from(input.files);

    if (!list.length) {
        alert("Pehle file chuno.");
        return;
    }

    $("uploadBtn").disabled = true;
    let done = 0;

    for (const file of list) {
        try {
            setStatus("Upload ho raha hai (" + (done + 1) + "/" + list.length + "): " + file.name);
            const up = await uploadFile(file);

            await addDoc(collection(db, "files"), {
                folderId: currentFolder.id,
                section: currentFolder.section,
                name: up.name,
                url: up.url,
                kind: up.kind,
                size: up.size,
                createdAt: serverTimestamp()
            });
            done++;
        } catch (error) {
            alert(error.message);
        }
    }

    input.value = "";
    setStatus(done + " file(s) upload ho gayi.");
    $("uploadBtn").disabled = false;
}

async function deleteFile(fileId) {
    if (!isAdmin()) return;
    if (!confirm("Ye file delete karni hai?")) return;

    try {
        await deleteDoc(doc(db, "files", fileId));
    } catch (error) {
        alert("Delete Error: " + error.message);
    }
}

async function copyLink(url) {
    try {
        await navigator.clipboard.writeText(url);
        setStatus("Link copy ho gaya.");
    } catch (error) {
        prompt("Link copy karo:", url);
    }
}

function renderFiles() {
    const box = $("files");
    box.replaceChildren();

    if (!currentFolder) return;

    if (!files.length) {
        const p = document.createElement("p");
        p.textContent = "Is folder mein abhi koi file nahi hai.";
        box.appendChild(p);
        return;
    }

    files.forEach((f) => {
        if (!safeCloudUrl(f.url)) return;

        const row = document.createElement("div");
        row.className = "file-row";

        if (f.kind === "image") {
            const img = document.createElement("img");
            img.className = "file-thumb";
            img.src = f.url.replace("/upload/", "/upload/f_auto,q_auto,w_120,h_120,c_fill/");
            img.alt = f.name;
            img.loading = "lazy";
            row.appendChild(img);
        } else {
            const icon = document.createElement("span");
            icon.className = "file-icon";
            icon.textContent = fileIcon(f.kind);
            row.appendChild(icon);
        }

        const info = document.createElement("div");
        info.className = "file-info";

        const name = document.createElement("div");
        name.className = "file-name";
        name.textContent = f.name;

        const meta = document.createElement("small");
        meta.textContent = formatSize(f.size);

        info.append(name, meta);
        row.appendChild(info);

        const actions = document.createElement("div");
        actions.className = "file-actions";

        const open = document.createElement("a");
        open.href = f.url;
        open.target = "_blank";
        open.rel = "noopener noreferrer";
        open.className = "file-btn";
        open.textContent = "Open";

        const copy = document.createElement("button");
        copy.type = "button";
        copy.textContent = "Copy link";
        copy.onclick = () => copyLink(f.url);

        actions.append(open, copy);

        // Delete button sirf admin ko
        if (isAdmin()) {
            const del = document.createElement("button");
            del.type = "button";
            del.className = "danger";
            del.textContent = "Delete";
            del.onclick = () => deleteFile(f.id);
            actions.appendChild(del);
        }

        row.appendChild(actions);
        box.appendChild(row);
    });
}

// ---------------- Buttons ----------------
$("loginBtn").addEventListener("click", adminLogin);
$("logoutBtn").addEventListener("click", adminLogout);
$("createFolderPublic").addEventListener("click", () => createFolder("public", "folderNamePublic"));
$("createFolderAdmin").addEventListener("click", () => createFolder("admin", "folderNameAdmin"));
$("folderNamePublic").addEventListener("keydown", (e) => { if (e.key === "Enter") createFolder("public", "folderNamePublic"); });
$("folderNameAdmin").addEventListener("keydown", (e) => { if (e.key === "Enter") createFolder("admin", "folderNameAdmin"); });
$("backBtn").addEventListener("click", closeFolder);
$("deleteFolderBtn").addEventListener("click", deleteFolder);
$("uploadBtn").addEventListener("click", uploadFiles);

// ---------------- Start ----------------
startFolders("public"); // public folders sabko dikhte hain (login ki zaroorat nahi)
updateUI();
