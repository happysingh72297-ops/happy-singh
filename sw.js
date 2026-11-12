// Offline support: site ek baar online khulne par files phone mein save ho jati hain
var CACHE = "happy-singh-v1";
var FILES = [
    "./", "index.html", "admin.html", "games.html",
    "style.css", "games.js", "script.js", "admin.js", "logo.png"
];

self.addEventListener("install", function (e) {
    e.waitUntil(
        caches.open(CACHE).then(function (cache) {
            // Ek file na mile to baaki phir bhi save hoti hain
            return Promise.all(FILES.map(function (f) {
                return cache.add(f).catch(function () {});
            }));
        }).then(function () { return self.skipWaiting(); })
    );
});

self.addEventListener("activate", function (e) {
    e.waitUntil(
        caches.keys().then(function (keys) {
            return Promise.all(keys.filter(function (k) { return k !== CACHE; })
                .map(function (k) { return caches.delete(k); }));
        }).then(function () { return self.clients.claim(); })
    );
});

self.addEventListener("fetch", function (e) {
    var req = e.request;
    if (req.method !== "GET") return;

    var url = new URL(req.url);
    if (url.origin !== location.origin) return; // Firebase, Cloudinary waghera ko na chhedo

    e.respondWith(
        fetch(req).then(function (res) {
            if (res && res.ok) {
                var copy = res.clone();
                caches.open(CACHE).then(function (c) { c.put(req, copy); });
            }
            return res;
        }).catch(function () {
            return caches.match(req).then(function (r) {
                return r || caches.match("games.html");
            });
        })
    );
});