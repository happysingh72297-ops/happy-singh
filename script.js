import { initializeApp } from "https://www.gstatic.com/firebasejs/12.5.0/firebase-app.js";

import {
    getFirestore,
    collection,
    addDoc,
    onSnapshot,
    serverTimestamp,
    doc,
    getDoc,
    setDoc,
    deleteDoc,
    getDocs,
    query,
    orderBy
} from "https://www.gstatic.com/firebasejs/12.5.0/firebase-firestore.js";

import {
    getAuth,
    signInWithEmailAndPassword,
    onAuthStateChanged,
    signOut,
    signInAnonymously
} from "https://www.gstatic.com/firebasejs/12.5.0/firebase-auth.js";

// ---------------- Firebase Configuration ----------------
const firebaseConfig = {
    apiKey: "AIzaSyA8kmNVPwfCh0Ya-exylf0ef1KiV9uJVqI",
    authDomain: "happy--singh.firebaseapp.com",
    projectId: "happy--singh",
    storageBucket: "happy--singh.firebasestorage.app",
    messagingSenderId: "816851062510",
    appId: "1:816851062510:web:d2eeb6b731bb5edb142dff",
    measurementId: "G-V0KB66W9FZ"
};

// Admin UID
const ADMIN_UID = "F3GYbmtWPDfionqf7BnBMohNATz2";

// ---------------- Firebase Initialize ----------------
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

function isAdmin() {
    return !!auth.currentUser && auth.currentUser.uid === ADMIN_UID;
}

// ---------------- Admin panel show/hide (sirf dikhawa, asli security Firestore Rules se hoti hai) ----------------
function updateAdminUI() {
    const postBox = document.querySelector(".admin-post");
    if (postBox) postBox.style.display = isAdmin() ? "block" : "none";
}

// ---------------- Auth listener ----------------
onAuthStateChanged(auth, async (user) => {
    if (!user) {
        try {
            await signInAnonymously(auth);
        } catch (error) {
            console.error("Guest Login Error:", error);
        }
        return;
    }
    updateAdminUI();
    renderPosts(); // login/logout ke baad Delete button apne aap dikhe/chhupe
});

// ---------------- Admin Login ----------------
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

        alert("Welcome Admin!");
    } catch (error) {
        alert("Login Error: " + error.message);
    }
}

// ---------------- Admin Logout ----------------
async function adminLogout() {
    try {
        await signOut(auth);
        alert("Logged Out");
    } catch (error) {
        alert(error.message);
    }
}

// ---------------- File Upload (Cloudinary, free plan) ----------------
const CLOUD_NAME = "avyiho22";
const UPLOAD_PRESET = "happysingh_unsigned";

// Free plan bachane ke liye chhoti limits (MB mein). Zaroorat ho to badal sakte ho.
const MAX_MB = { image: 5, audio: 20, video: 50, file: 10 };

function getFileKind(file) {
    if (file.type.startsWith("image/")) return "image";
    if (file.type.startsWith("video/")) return "video";
    if (file.type.startsWith("audio/")) return "audio";
    return "file"; // pdf, apk, zip waghera
}

async function uploadFile(file) {
    const kind = getFileKind(file);
    const limit = MAX_MB[kind];

    if (file.size > limit * 1024 * 1024) {
        throw new Error("Is type ki file " + limit + "MB se chhoti honi chahiye.");
    }

    const formData = new FormData();
    formData.append("file", file);
    formData.append("upload_preset", UPLOAD_PRESET);

    // "auto" se Cloudinary khud photo, video, audio ya file pehchan leta hai
    const res = await fetch(
        "https://api.cloudinary.com/v1_1/" + CLOUD_NAME + "/auto/upload",
        { method: "POST", body: formData }
    );
    const data = await res.json();

    if (!res.ok || !data.secure_url) {
        throw new Error((data.error && data.error.message) || "File upload fail ho gayi.");
    }
    return { url: data.secure_url, kind: kind, name: file.name };
}

// Link ko saaf karo: sirf http ya https wale link allowed (javascript: jaise khatarnak link band)
function cleanLink(text) {
    try {
        const u = new URL(String(text).trim());
        if (u.protocol === "https:" || u.protocol === "http:") return u.href;
    } catch (e) {}
    return "";
}

// ---------------- Create Post ----------------
async function createPost() {
    const user = auth.currentUser;

    if (!user || user.uid !== ADMIN_UID) {
        alert("Only Admin can publish posts.");
        return;
    }

    const postInput = document.getElementById("postText");
    const fileInput = document.getElementById("postFile");
    const linkInput = document.getElementById("postLink");
    const publishBtn = document.getElementById("publishBtn");

    const text = postInput.value.trim();
    const file = fileInput && fileInput.files[0];
    const rawLink = linkInput ? linkInput.value.trim() : "";
    const link = rawLink ? cleanLink(rawLink) : "";

    if (rawLink && !link) {
        alert("Link sahi nahi hai. Wo https:// se shuru hona chahiye.");
        return;
    }

    if (!text && !file && !link) {
        alert("Kuch likho, file chuno ya link daalo.");
        return;
    }

    if (publishBtn) publishBtn.disabled = true;

    try {
        let upload = null;
        if (file) upload = await uploadFile(file);

        await addDoc(collection(db, "posts"), {
            text: text,
            linkUrl: link,
            fileUrl: upload ? upload.url : "",
            fileType: upload ? upload.kind : "",
            fileName: upload ? upload.name : "",
            authorUid: user.uid,
            createdAt: serverTimestamp()
        });

        postInput.value = "";
        if (fileInput) fileInput.value = "";
        if (linkInput) linkInput.value = "";
        alert("Post Published!");
    } catch (error) {
        alert("Post Error: " + error.message);
    }

    if (publishBtn) publishBtn.disabled = false;
}

// ---------------- Delete Post ----------------
async function deletePost(postId) {
    if (!isAdmin()) {
        alert("Only Admin can delete posts.");
        return;
    }

    if (!confirm("Are you sure you want to delete this post?")) return;

    try {
        await deleteDoc(doc(db, "posts", postId));
        alert("Post Deleted!");
    } catch (error) {
        alert("Delete Error: " + error.message);
    }
}

// ---------------- Like / Unlike ----------------
async function likePost(postId) {
    const user = auth.currentUser;
    if (!user) {
        alert("Please wait for guest login.");
        return;
    }

    const likeRef = doc(db, "posts", postId, "likes", user.uid);

    try {
        const existingLike = await getDoc(likeRef);

        if (existingLike.exists()) {
            await deleteDoc(likeRef);
        } else {
            await setDoc(likeRef, {
                userId: user.uid,
                createdAt: serverTimestamp()
            });
        }

        const likes = await getDocs(collection(db, "posts", postId, "likes"));
        const el = document.getElementById("like-count-" + postId);
        if (el) el.textContent = likes.size + " Likes";
    } catch (error) {
        alert("Like Error: " + error.message);
    }
}

// ---------------- Add Comment ----------------
async function commentPost(postId) {
    const user = auth.currentUser;
    if (!user) {
        alert("Please wait for guest login.");
        return;
    }

    // Blocked user check
    try {
        const blocked = await getDoc(doc(db, "blockedUsers", user.uid));
        if (blocked.exists()) {
            alert("You are blocked from commenting.");
            return;
        }
    } catch (error) {
        console.error("Block check error:", error);
    }

    const name = prompt("Enter your name:");
    if (!name || !name.trim()) return;

    const text = prompt("Write your comment:");
    if (!text || !text.trim()) return;

    try {
        await addDoc(collection(db, "posts", postId, "comments"), {
            authorName: name.trim().slice(0, 40),
            authorUid: user.uid,
            text: text.trim().slice(0, 500),
            createdAt: serverTimestamp()
        });

        alert("Comment Added!");
        showComments(postId);
    } catch (error) {
        alert("Comment Error: " + error.message);
    }
}

// ---------------- Delete Comment (Sirf Admin) ----------------
async function deleteComment(postId, commentId) {
    if (!isAdmin()) {
        alert("Only Admin can delete comments.");
        return;
    }

    if (!confirm("Are you sure you want to delete this comment?")) return;

    try {
        await deleteDoc(doc(db, "posts", postId, "comments", commentId));
        alert("Comment Deleted!");
        showComments(postId);
    } catch (error) {
        alert("Delete Comment Error: " + error.message);
    }
}

// ---------------- Block User (Sirf Admin) ----------------
async function blockUser(userId) {
    if (!isAdmin()) {
        alert("Only Admin can block users.");
        return;
    }

    if (!confirm("Are you sure you want to block this user from commenting?")) return;

    try {
        await setDoc(doc(db, "blockedUsers", userId), {
            blockedAt: serverTimestamp(),
            blockedBy: auth.currentUser.uid
        });

        alert("User blocked successfully!");
    } catch (error) {
        alert("Error blocking user: " + error.message);
    }
}

// ---------------- Show Comments ----------------
async function showComments(postId) {
    try {
        const q = query(
            collection(db, "posts", postId, "comments"),
            orderBy("createdAt", "asc")
        );
        const snapshot = await getDocs(q);
        const container = document.getElementById("comments-" + postId);
        if (!container) return;

        container.innerHTML = "";

        if (snapshot.empty) {
            container.textContent = "No comments yet.";
            return;
        }

        snapshot.forEach((commentDoc) => {
            const data = commentDoc.data();

            const commentDiv = document.createElement("div");
            commentDiv.style.display = "flex";
            commentDiv.style.justifyContent = "space-between";
            commentDiv.style.alignItems = "center";
            commentDiv.style.gap = "8px";
            commentDiv.style.margin = "8px 0";
            commentDiv.style.padding = "5px";
            commentDiv.style.background = "#eee";
            commentDiv.style.borderRadius = "5px";

            const textSpan = document.createElement("span");
            textSpan.textContent = (data.authorName || "Guest") + ": " + data.text;
            commentDiv.appendChild(textSpan);

            if (isAdmin()) {
                const btnBox = document.createElement("div");

                const deleteBtn = document.createElement("button");
                deleteBtn.textContent = "Delete";
                deleteBtn.style.background = "#444";
                deleteBtn.style.color = "white";
                deleteBtn.style.padding = "3px 6px";
                deleteBtn.onclick = () => deleteComment(postId, commentDoc.id);

                const blockBtn = document.createElement("button");
                blockBtn.textContent = "Block User";
                blockBtn.style.background = "red";
                blockBtn.style.color = "white";
                blockBtn.style.padding = "3px 6px";
                blockBtn.onclick = () => blockUser(data.authorUid);

                btnBox.append(deleteBtn, blockBtn);
                commentDiv.appendChild(btnBox);
            }

            container.appendChild(commentDiv);
        });
    } catch (error) {
        console.error("Comment Loading Error:", error);
    }
}

// ---------------- Share ----------------
function sharePost(postId) {
    const url = window.location.origin + window.location.pathname + "#post-" + postId;

    if (navigator.share) {
        navigator.share({
            title: "HAPPY SINGH",
            text: "Check out this post!",
            url: url
        }).catch(error => console.log(error));
    } else {
        navigator.clipboard.writeText(url);
        alert("Post link copied!");
    }
}

// ---------------- Post ka attachment dikhana ----------------
function makeLink(url, label) {
    const a = document.createElement("a");
    a.href = url;
    a.textContent = label;
    a.target = "_blank";
    a.rel = "noopener noreferrer";
    a.className = "post-link";
    return a;
}

function getYouTubeId(link) {
    const m = link.match(/(?:youtube\.com\/(?:watch\?(?:.*&)?v=|shorts\/|embed\/)|youtu\.be\/)([\w-]{11})/);
    return m ? m[1] : "";
}

function buildMedia(post) {
    const box = document.createElement("div");
    box.className = "post-media";

    // Purani posts mein sirf imageUrl hota tha, isliye wo bhi chalta hai
    const url = post.fileUrl || post.imageUrl || "";
    const kind = post.fileType || (post.imageUrl ? "image" : "");

    // Sirf Cloudinary ki files dikhao
    if (url.startsWith("https://res.cloudinary.com/")) {
        if (kind === "image") {
            const img = document.createElement("img");
            img.src = url.replace("/upload/", "/upload/f_auto,q_auto,w_800/");
            img.alt = "Post photo";
            img.loading = "lazy";
            box.appendChild(img);
        } else if (kind === "video") {
            const video = document.createElement("video");
            video.src = url;
            video.controls = true;
            video.preload = "metadata";
            box.appendChild(video);
        } else if (kind === "audio") {
            const audio = document.createElement("audio");
            audio.src = url;
            audio.controls = true;
            audio.preload = "metadata";
            box.appendChild(audio);
        } else {
            box.appendChild(makeLink(url, "📎 " + (post.fileName || "File kholo")));
        }
    }

    // Koi bhi link: YouTube ho to video dikhao, nahi to clickable link
    const link = cleanLink(post.linkUrl || "");
    if (link) {
        const ytId = getYouTubeId(link);
        if (ytId) {
            const frame = document.createElement("iframe");
            frame.src = "https://www.youtube.com/embed/" + ytId;
            frame.loading = "lazy";
            frame.allowFullscreen = true;
            box.appendChild(frame);
        } else {
            box.appendChild(makeLink(link, "🔗 " + link));
        }
    }

    return box.children.length ? box : null;
}

// ---------------- Render Posts ----------------
const postsContainer = document.getElementById("posts");
let currentPosts = [];
let renderToken = 0;

async function renderPosts() {
    if (!postsContainer) return;

    const token = ++renderToken;
    const posts = currentPosts;

    // Likes count sab posts ke liye ek saath
    const likeTexts = await Promise.all(posts.map(async (post) => {
        try {
            const likes = await getDocs(collection(db, "posts", post.id, "likes"));
            return likes.size + " Likes";
        } catch (error) {
            return "Likes unavailable";
        }
    }));

    // Agar beech mein naya render shuru ho gaya, to ye purana wala chhod do
    if (token !== renderToken) return;

    const fragment = document.createDocumentFragment();

    posts.forEach((post, index) => {
        const postDiv = document.createElement("div");
        postDiv.className = "post";
        postDiv.id = "post-" + post.id;

        const heading = document.createElement("h3");
        heading.textContent = "HAPPY SINGH";

        const paragraph = document.createElement("p");
        paragraph.textContent = post.text || "";

        const likeButton = document.createElement("button");
        likeButton.textContent = "❤️ Like";
        likeButton.onclick = () => likePost(post.id);

        const likeCount = document.createElement("p");
        likeCount.id = "like-count-" + post.id;
        likeCount.textContent = likeTexts[index];

        const commentButton = document.createElement("button");
        commentButton.textContent = "💬 Comment";
        commentButton.onclick = () => commentPost(post.id);

        const showButton = document.createElement("button");
        showButton.textContent = "View Comments";
        showButton.onclick = () => showComments(post.id);

        const shareButton = document.createElement("button");
        shareButton.textContent = "🔗 Share";
        shareButton.onclick = () => sharePost(post.id);

        const commentsBox = document.createElement("div");
        commentsBox.id = "comments-" + post.id;

        postDiv.append(heading, paragraph);

        // Photo, video, audio, file ya link dikhao
        const media = buildMedia(post);
        if (media) postDiv.appendChild(media);

        postDiv.append(likeButton, likeCount, commentButton, showButton, shareButton);

        if (isAdmin()) {
            const deleteButton = document.createElement("button");
            deleteButton.textContent = "🗑 Delete";
            deleteButton.onclick = () => deletePost(post.id);
            postDiv.appendChild(deleteButton);
        }

        postDiv.appendChild(commentsBox);
        fragment.appendChild(postDiv);
    });

    postsContainer.replaceChildren(fragment);
}

// ---------------- Realtime Posts Listener ----------------
if (postsContainer) {
    onSnapshot(collection(db, "posts"), (snapshot) => {
        currentPosts = snapshot.docs.map(item => ({
            id: item.id,
            ...item.data()
        }));

        currentPosts.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));

        renderPosts();
    }, (error) => {
        console.error("Post Loading Error:", error);
    });
}

updateAdminUI();

// ---------------- HTML onclick ke liye functions ----------------
window.adminLogin = adminLogin;
window.adminLogout = adminLogout;
window.createPost = createPost;
window.deletePost = deletePost;