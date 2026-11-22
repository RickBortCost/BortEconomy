// Service worker: app installabile e consultabile offline.
// - Interfaccia (HTML, CSS, JS, icone): prima la rete, in mancanza la copia salvata (così gli aggiornamenti arrivano subito).
// - Dati (data/*.json, config.json): prima la rete con timeout breve, in mancanza l'ultima copia salvata.
const CACHE = "borteconomy-v2";
const SHELL = ["./", "index.html", "style.css", "app.js", "detail.js", "config.json", "icon.svg", "manifest.webmanifest"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

async function networkFirst(req, timeoutMs) {
  const cache = await caches.open(CACHE);
  const key = new URL(req.url); key.search = ""; // una sola copia per file, indipendente dai parametri anti-cache
  try {
    const res = await Promise.race([
      fetch(req),
      new Promise((_, rej) => setTimeout(() => rej(new Error("timeout")), timeoutMs)),
    ]);
    if (res.ok) cache.put(key.href, res.clone());
    return res;
  } catch (err) {
    const hit = await cache.match(key.href);
    if (hit) return hit;
    throw err;
  }
}

self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.origin !== location.origin) return; // API esterne (Claude, GitHub): mai in cache
  const isData = url.pathname.includes("/data/") || url.pathname.endsWith("config.json");
  e.respondWith(networkFirst(e.request, isData ? 6000 : 4000));
});
