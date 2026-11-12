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

(function () {
    "use strict";

    function $(id) { return document.getElementById(id); }
    function load(k, d) { try { var v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } }
    function save(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }

    // ---------- Tabs ----------
    var tabs = document.querySelectorAll(".game-tabs button");
    var panels = document.querySelectorAll(".game-panel");

    function show(id) {
        tabs.forEach(function (t) { t.classList.toggle("on", t.getAttribute("data-g") === id); });
        panels.forEach(function (p) { p.hidden = p.id !== "g-" + id; });
        if (id !== "snake") snakeStop();
    }
    tabs.forEach(function (t) {
        t.addEventListener("click", function () { show(t.getAttribute("data-g")); });
    });

    // ---------- Online / Offline badge ----------
    function net() {
        var b = $("netBadge");
        var on = navigator.onLine;
        b.textContent = on ? "🟢 Online" : "🔴 Offline: games phir bhi chalenge";
        b.className = "net " + (on ? "on" : "off");
    }
    window.addEventListener("online", net);
    window.addEventListener("offline", net);
    net();

    // =====================================================
    // 1. Tic Tac Toe (aap X, computer O)
    // =====================================================
    var tb, tOver, tScore = { w: 0, l: 0, d: 0 };
    var LINES = [[0,1,2],[3,4,5],[6,7,8],[0,3,6],[1,4,7],[2,5,8],[0,4,8],[2,4,6]];

    function tWinner(b) {
        for (var i = 0; i < LINES.length; i++) {
            var l = LINES[i];
            if (b[l[0]] && b[l[0]] === b[l[1]] && b[l[0]] === b[l[2]]) return b[l[0]];
        }
        return b.indexOf("") < 0 ? "draw" : null;
    }

    function tFind(mark) {
        for (var i = 0; i < LINES.length; i++) {
            var c = 0, e = -1;
            LINES[i].forEach(function (x) {
                if (tb[x] === mark) c++;
                else if (tb[x] === "") e = x;
            });
            if (c === 2 && e > -1) return e;
        }
        return -1;
    }

    function tCpu() {
        var m = tFind("O");
        if (m < 0) m = tFind("X");
        if (m < 0 && tb[4] === "") m = 4;
        if (m < 0) {
            var free = [];
            tb.forEach(function (v, i) { if (!v) free.push(i); });
            m = free[Math.floor(Math.random() * free.length)];
        }
        tb[m] = "O";
    }

    function tRender() {
        var cells = $("tttBoard").children;
        for (var i = 0; i < 9; i++) {
            cells[i].textContent = tb[i];
            cells[i].className = tb[i] === "X" ? "x" : (tb[i] === "O" ? "o" : "");
        }
        $("tttScore").textContent = "Jeet: " + tScore.w + " · Haar: " + tScore.l + " · Draw: " + tScore.d;
    }

    function tCheck() {
        var r = tWinner(tb);
        if (!r) return false;
        tOver = true;
        if (r === "X") { tScore.w++; $("tttInfo").textContent = "Aap jeet gaye! 🎉"; }
        else if (r === "O") { tScore.l++; $("tttInfo").textContent = "Computer jeet gaya 😅"; }
        else { tScore.d++; $("tttInfo").textContent = "Draw!"; }
        return true;
    }

    function tReset() {
        tb = ["", "", "", "", "", "", "", "", ""];
        tOver = false;
        $("tttInfo").textContent = "Aap X ho. Pehli chaal aapki.";
        tRender();
    }

    (function () {
        var board = $("tttBoard");
        for (var i = 0; i < 9; i++) {
            (function (i) {
                var b = document.createElement("button");
                b.type = "button";
                b.setAttribute("aria-label", "Cell " + (i + 1));
                b.addEventListener("click", function () {
                    if (tOver || tb[i]) return;
                    tb[i] = "X";
                    if (!tCheck()) { tCpu(); tCheck(); }
                    tRender();
                });
                board.appendChild(b);
            })(i);
        }
        $("tttReset").addEventListener("click", tReset);
        tReset();
    })();

    // =====================================================
    // 2. Snake
    // =====================================================
    var cv = $("snakeCv"), cx = cv.getContext("2d");
    var N = 15, S = 20;
    var sn, dir, nd, food, sScore = 0, timer = null, alive = false;
    var sBest = load("hs_snake_best", 0);
    $("snakeBest").textContent = "Best: " + sBest;

    function placeFood() {
        do {
            food = { x: Math.floor(Math.random() * N), y: Math.floor(Math.random() * N) };
        } while (sn.some(function (p) { return p.x === food.x && p.y === food.y; }));
    }

    function draw() {
        cx.fillStyle = "#0b1020";
        cx.fillRect(0, 0, cv.width, cv.height);

        cx.fillStyle = "#f43f5e";
        cx.beginPath();
        cx.arc(food.x * S + S / 2, food.y * S + S / 2, S / 2 - 3, 0, Math.PI * 2);
        cx.fill();

        sn.forEach(function (p, i) {
            cx.fillStyle = i === 0 ? "#86efac" : "#22c55e";
            cx.fillRect(p.x * S + 1, p.y * S + 1, S - 2, S - 2);
        });
    }

    function snakeReset() {
        sn = [{ x: 7, y: 7 }, { x: 6, y: 7 }, { x: 5, y: 7 }];
        dir = { x: 1, y: 0 };
        nd = dir;
        sScore = 0;
        placeFood();
        draw();
        $("snakeScore").textContent = "Score: 0";
    }

    function snakeStop() {
        if (timer) { clearInterval(timer); timer = null; }
        alive = false;
    }

    function snakeEnd() {
        snakeStop();
        if (sScore > sBest) { sBest = sScore; save("hs_snake_best", sBest); }
        $("snakeBest").textContent = "Best: " + sBest;
        $("snakeMsg").textContent = "Game over! Score: " + sScore + ". Phir se Start dabao.";
    }

    function tick() {
        dir = nd;
        var h = { x: sn[0].x + dir.x, y: sn[0].y + dir.y };

        if (h.x < 0 || h.y < 0 || h.x >= N || h.y >= N ||
            sn.some(function (p) { return p.x === h.x && p.y === h.y; })) {
            snakeEnd();
            return;
        }

        sn.unshift(h);
        if (h.x === food.x && h.y === food.y) {
            sScore++;
            $("snakeScore").textContent = "Score: " + sScore;
            placeFood();
        } else {
            sn.pop();
        }
        draw();
    }

    function snakeStart() {
        snakeStop();
        snakeReset();
        alive = true;
        $("snakeMsg").textContent = "Khelo! Swipe ya arrow se mudo.";
        timer = setInterval(tick, 140);
    }

    function setDir(dx, dy) {
        if (!alive) return;
        if (dx + dir.x === 0 && dy + dir.y === 0) return; // ulta nahi mud sakte
        nd = { x: dx, y: dy };
    }

    var DIRS = { u: [0, -1], d: [0, 1], l: [-1, 0], r: [1, 0] };
    document.querySelectorAll(".dpad button").forEach(function (b) {
        b.addEventListener("click", function () {
            var d = DIRS[b.getAttribute("data-d")];
            setDir(d[0], d[1]);
        });
    });

    document.addEventListener("keydown", function (e) {
        if ($("g-snake").hidden) return;
        var map = { ArrowUp: "u", ArrowDown: "d", ArrowLeft: "l", ArrowRight: "r" };
        if (map[e.key]) {
            e.preventDefault();
            var d = DIRS[map[e.key]];
            setDir(d[0], d[1]);
        }
    });

    var tx = 0, ty = 0;
    cv.addEventListener("touchstart", function (e) {
        tx = e.touches[0].clientX; ty = e.touches[0].clientY;
    }, { passive: true });
    cv.addEventListener("touchend", function (e) {
        var dx = e.changedTouches[0].clientX - tx;
        var dy = e.changedTouches[0].clientY - ty;
        if (Math.max(Math.abs(dx), Math.abs(dy)) < 20) return;
        if (Math.abs(dx) > Math.abs(dy)) setDir(dx > 0 ? 1 : -1, 0);
        else setDir(0, dy > 0 ? 1 : -1);
    }, { passive: true });

    $("snakeStart").addEventListener("click", snakeStart);
    snakeReset();

    // =====================================================
    // 3. Memory Match
    // =====================================================
    var EMO = ["🍎", "🍌", "🍇", "🍒", "🍉", "🥝"];
    var deck, first, lock, moves, matched;

    function memBest() {
        var b = load("hs_mem_best", 0);
        $("memBest").textContent = b ? "Best: " + b + " chaal" : "";
    }

    function memReset() {
        deck = EMO.concat(EMO);
        for (var i = deck.length - 1; i > 0; i--) {
            var j = Math.floor(Math.random() * (i + 1));
            var t = deck[i]; deck[i] = deck[j]; deck[j] = t;
        }
        first = null; lock = false; moves = 0; matched = 0;
        $("memInfo").textContent = "Jodiyan milao. Chaal: 0";

        var board = $("memBoard");
        board.replaceChildren();
        deck.forEach(function (v, i) {
            var b = document.createElement("button");
            b.type = "button";
            b.setAttribute("aria-label", "Card " + (i + 1));
            b.addEventListener("click", function () { flip(b, i); });
            board.appendChild(b);
        });
        memBest();
    }

    function flip(btn, i) {
        if (lock || btn.classList.contains("up") || btn.classList.contains("done")) return;
        btn.classList.add("up");
        btn.textContent = deck[i];

        if (!first) { first = { b: btn, i: i }; return; }

        moves++;
        $("memInfo").textContent = "Jodiyan milao. Chaal: " + moves;
        var a = first;
        first = null;

        if (deck[a.i] === deck[i]) {
            a.b.classList.add("done"); btn.classList.add("done");
            matched++;
            if (matched === EMO.length) {
                $("memInfo").textContent = "Jeet gaye! 🎉 " + moves + " chaal mein.";
                var best = load("hs_mem_best", 0);
                if (!best || moves < best) save("hs_mem_best", moves);
                memBest();
            }
        } else {
            lock = true;
            setTimeout(function () {
                a.b.classList.remove("up"); a.b.textContent = "";
                btn.classList.remove("up"); btn.textContent = "";
                lock = false;
            }, 700);
        }
    }

    $("memReset").addEventListener("click", memReset);
    memReset();

    // =====================================================
    // 4. Tap Speed (10 second)
    // =====================================================
    var tapN = 0, tapT = 0, tapRun = false, tapTimer = null;
    var tapBestV = load("hs_tap_best", 0);

    function tapShowBest() {
        $("tapBest").textContent = tapBestV ? "Best: " + tapBestV + " tap" : "";
    }

    $("tapBtn").addEventListener("click", function () {
        var btn = $("tapBtn");

        if (!tapRun) {
            tapRun = true; tapN = 0; tapT = 10;
            $("tapInfo").textContent = "Time: 10 second";
            tapTimer = setInterval(function () {
                tapT--;
                $("tapInfo").textContent = "Time: " + tapT + " second";
                if (tapT <= 0) {
                    clearInterval(tapTimer);
                    tapRun = false;
                    $("tapInfo").textContent = "Time up! Aapne " + tapN + " tap kiye.";
                    btn.textContent = "Phir se shuru karo";
                    if (tapN > tapBestV) { tapBestV = tapN; save("hs_tap_best", tapBestV); }
                    tapShowBest();
                }
            }, 1000);
        }

        tapN++;
        if (tapRun) btn.textContent = "Tap: " + tapN;
    });
    tapShowBest();
})();