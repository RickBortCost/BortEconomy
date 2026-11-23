// Sincronizzazione dei dati del profilo tra dispositivi (es. iPhone e iPad), cifrata end-to-end.
//
// - Una "chiave di sincronizzazione" casuale (125 bit, es. ABCDE-FGHJK-…) generata sul primo dispositivo e inserita sugli
//   altri. Dalla chiave si derivano l'identificativo sul server (SHA-256) e la chiave di cifratura (PBKDF2 → AES-256-GCM):
//   il server (Cloudflare, /api/sync/<id>) riceve solo dati cifrati e non può leggerli.
// - Ogni dato ha l'ora dell'ultima modifica: a ogni sincronizzazione vince la modifica più recente, dato per dato.
// - Si sincronizza all'apertura, dopo ogni modifica (3 s), quando l'app torna in primo piano e ogni 2 minuti.
// - Le chiavi API si sincronizzano solo se l'utente lo sceglie.
import { changes, pls } from "./profiles.js";
import { vault } from "./vault.js";

let H; // { store, refresh, reload, $, esc }
const BASE_KEYS = ["favs", "portfolio", "composition", "home-layout", "theme", "country", "mt-cur", "pendingAdds", "share-favs", "share-confirm",
  "ai-provider", "model", "model.openai", "model.gemini", "web"];
const SECRET_KEYS = ["apiKey", "apiKey.openai", "apiKey.gemini", "proxyCode"];
const RELOAD_KEYS = ["theme", "country"];
const ALPHA = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const enc = new TextEncoder(), dec = new TextDecoder();
const b64 = (u8) => btoa(String.fromCharCode(...new Uint8Array(u8)));
const unb64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
const st = { busy: false, timer: null, error: "", creds: null, showKey: false, linking: false };

// ---------------------------------------------------------------- chiave e crittografia
export function newSyncKey() {
  const r = crypto.getRandomValues(new Uint8Array(25));
  const s = [...r].map((x) => ALPHA[x & 31]).join("");
  return s.match(/.{5}/g).join("-");
}
export const normKey = (k) => String(k ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
export const validKey = (k) => normKey(k).length === 25 && [...normKey(k)].every((c) => ALPHA.includes(c));
export async function deriveSync(key) {
  const n = normKey(key);
  const id = [...new Uint8Array(await crypto.subtle.digest("SHA-256", enc.encode(`bortsync-id:${n}`)))].map((b) => b.toString(16).padStart(2, "0")).join("");
  const base = await crypto.subtle.importKey("raw", enc.encode(n), "PBKDF2", false, ["deriveKey"]);
  const k = await crypto.subtle.deriveKey({ name: "PBKDF2", hash: "SHA-256", salt: enc.encode("bortsync-enc-v1"), iterations: 200000 }, base,
    { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
  return { id, key: k };
}
export async function seal(obj, key) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  return { v: 1, iv: b64(iv), ct: b64(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, enc.encode(JSON.stringify(obj)))) };
}
export async function open(box, key) {
  return JSON.parse(dec.decode(await crypto.subtle.decrypt({ name: "AES-GCM", iv: unb64(box.iv) }, key, unb64(box.ct))));
}

// Unione dato per dato: vince l'ora di modifica più recente. Restituisce il documento unito, i dati da applicare
// in locale e se il server va aggiornato. I dati presenti sul server ma non gestiti qui (es. chiavi API) restano.
export function merge(local, remote) {
  const merged = { ...remote }, apply = {};
  for (const [k, L] of Object.entries(local)) {
    const R = remote[k];
    if (R && R.t > L.t) { if (R.v !== L.v) apply[k] = R; }
    else if (L.t > 0 || L.v != null) merged[k] = L;
  }
  const push = JSON.stringify(merged) !== JSON.stringify(remote);
  return { merged, apply, push };
}

// ---------------------------------------------------------------- stato locale
const configured = () => pls.get("sync-on") === "1";
const keys = () => (pls.get("sync-secrets") === "1" ? [...BASE_KEYS, ...SECRET_KEYS] : BASE_KEYS);
const meta = () => { try { return JSON.parse(pls.get("sync-meta")) ?? {}; } catch { return {}; } };
const saveMeta = (m) => pls.set("sync-meta", JSON.stringify(m));
const apiBase = () => (/\.pages\.dev$/.test(location.hostname) ? new URL("api/sync/", location.href).href : "https://borteconomy.pages.dev/api/sync/");
let applying = false;

async function creds() {
  const k = H.store.get("sync-key");
  if (!k) throw new Error("Chiave di sincronizzazione non disponibile.");
  if (st.creds?.k !== k) st.creds = { k, ...(await deriveSync(k)) };
  return st.creds;
}
async function fetchRemote(id, key) {
  const r = await fetch(apiBase() + id, { cache: "no-store" });
  if (r.status === 404) return null;
  if (!r.ok) throw new Error(`Server di sincronizzazione: errore ${r.status}`);
  const j = await r.json();
  try { return { doc: await open(j.box, key), updated: j.updated }; } catch { throw new Error("Dati sul server illeggibili con questa chiave."); }
}
async function pushRemote(id, key, doc) {
  const r = await fetch(apiBase() + id, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ box: await seal(doc, key) }) });
  if (!r.ok) throw new Error(r.status === 429 ? "Troppe sincronizzazioni: riprovo più tardi." : `Server di sincronizzazione: errore ${r.status}`);
}

export async function syncNow() {
  if (!configured() || st.busy) return;
  if (vault.locked()) { st.error = ""; renderSyncBox(); return; }
  st.busy = true; renderSyncBox();
  try {
    const { id, key } = await creds();
    const remote = (await fetchRemote(id, key))?.doc ?? {};
    const m = meta(), local = {};
    for (const k of keys()) local[k] = { v: H.store.get(k, null), t: m[k] ?? 0 };
    const { merged, apply, push } = merge(local, remote);
    const changed = Object.keys(apply);
    if (changed.length) {
      applying = true;
      try { for (const k of changed) { H.store.set(k, apply[k].v); m[k] = apply[k].t; } } finally { applying = false; }
      saveMeta(m);
    }
    if (push) await pushRemote(id, key, merged);
    pls.set("sync-last", new Date().toISOString()); st.error = "";
    if (changed.length) changed.some((k) => RELOAD_KEYS.includes(k)) ? H.reload() : H.refresh();
  } catch (e) {
    st.error = e?.name === "TypeError" ? "Server di sincronizzazione non raggiungibile (sei offline?)." : e.message;
  } finally { st.busy = false; renderSyncBox(); }
}
const schedule = (ms = 3000) => { clearTimeout(st.timer); st.timer = setTimeout(syncNow, ms); };

function onChange(k) {
  if (applying || !configured() || !keys().includes(k)) return;
  const m = meta(); m[k] = Date.now(); saveMeta(m);
  schedule();
}

// Attiva su questo dispositivo con una chiave nuova: i dati presenti diventano la versione di partenza
async function enable() {
  const k = newSyncKey();
  H.store.set("sync-key", k);
  const m = {}, now = Date.now();
  for (const x of keys()) if (H.store.get(x, null) != null) m[x] = now;
  saveMeta(m); pls.set("sync-on", "1");
  st.showKey = true;
  await syncNow();
}
// Collega a una sincronizzazione esistente: i dati del server sostituiscono quelli di questo profilo
async function link(k) {
  if (!validKey(k)) { st.error = "Chiave non valida: sono 25 caratteri (lettere e numeri), es. ABCDE-FGHJK-LMNPQ-RSTUV-WXYZ2."; renderSyncBox(); return; }
  st.busy = true; st.error = ""; renderSyncBox();
  try {
    const d = await deriveSync(k);
    const r = await fetchRemote(d.id, d.key);
    if (!r) throw new Error("Nessun dato trovato per questa chiave: controlla di averla scritta correttamente.");
    H.store.set("sync-key", normKey(k).match(/.{5}/g).join("-"));
    saveMeta({}); pls.set("sync-on", "1");
    st.linking = false;
  } catch (e) { st.error = e?.name === "TypeError" ? "Server di sincronizzazione non raggiungibile." : e.message; st.busy = false; renderSyncBox(); return; }
  st.busy = false;
  await syncNow();
}
function disable() {
  pls.set("sync-on", null); pls.set("sync-meta", null); pls.set("sync-last", null); H.store.set("sync-key", null);
  st.creds = null; st.showKey = false; renderSyncBox();
}
async function wipeRemote() {
  const { id } = await creds();
  const r = await fetch(apiBase() + id, { method: "DELETE" });
  if (!r.ok && r.status !== 404) throw new Error(`Server di sincronizzazione: errore ${r.status}`);
}

// ---------------------------------------------------------------- interfaccia (finestra Privacy e sicurezza)
export function renderSyncBox() {
  const box = document.getElementById("sync-box"); if (!box || !H) return;
  const e = H.esc, last = pls.get("sync-last");
  const err = st.error ? `<p class="hint err-text">${e(st.error)}</p>` : "";
  if (!configured()) {
    box.innerHTML = `<p class="hint">Tieni allineati preferiti, portafoglio, composizione, Home e impostazioni di questo profilo tra i tuoi dispositivi (es. iPhone e iPad). I dati vengono cifrati qui prima dell'invio: il server non può leggerli.</p>
      <div class="sec-row"><button type="button" class="primary" data-sync="enable" ${st.busy ? "disabled" : ""}>Attiva la sincronizzazione</button>
      <button type="button" class="ghost" data-sync="show-link">Ho già una chiave</button></div>
      <div class="sync-link" ${st.linking ? "" : "hidden"}><label>Chiave di sincronizzazione<input id="sync-key-in" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="XXXXX-XXXXX-XXXXX-XXXXX-XXXXX"></label>
      <p class="hint">I dati di questo profilo su questo dispositivo verranno sostituiti da quelli sincronizzati.</p>
      <button type="button" class="primary" data-sync="link" ${st.busy ? "disabled" : ""}>Collega questo dispositivo</button></div>${err}`;
    return;
  }
  if (vault.locked()) { box.innerHTML = `<p class="hint"><b>Attiva.</b> Sblocca la cassaforte per sincronizzare questo profilo.</p>`; return; }
  const k = H.store.get("sync-key") ?? "";
  box.innerHTML = `<p class="hint"><b>Attiva.</b> ${st.busy ? "Sincronizzazione in corso…" : last ? `Ultima sincronizzazione: ${new Date(last).toLocaleString("it-IT", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", second: "2-digit" })}.` : "Mai sincronizzato."}</p>${err}
    <label>Chiave di sincronizzazione (inseriscila sugli altri dispositivi, nello stesso profilo)
      <span class="sync-key"><code id="sync-key-out">${st.showKey ? e(k) : "•••••-•••••-•••••-•••••-•••••"}</code>
      <button type="button" class="ghost" data-sync="toggle-key">${st.showKey ? "Nascondi" : "Mostra"}</button><button type="button" class="ghost" data-sync="copy">Copia</button></span></label>
    <p class="hint">Conservala in un gestore di password: chi la conosce può leggere e modificare i dati sincronizzati.</p>
    <label class="check"><input type="checkbox" id="sync-secrets" ${pls.get("sync-secrets") === "1" ? "checked" : ""}> Sincronizza anche chiavi API e codice di accesso AI (cifrati)</label>
    <div class="sec-row"><button type="button" class="ghost" data-sync="now" ${st.busy ? "disabled" : ""}>↻ Sincronizza ora</button>
    <button type="button" class="ghost danger" data-sync="disable">Disattiva su questo dispositivo</button></div>
    <button type="button" class="ghost danger" data-sync="wipe">Elimina i dati sincronizzati dal server</button>`;
}

export function initSync(helpers) {
  H = helpers;
  changes.addEventListener("change", (e) => onChange(e.detail));
  addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") schedule(500); });
  addEventListener("online", () => schedule(500));
  setInterval(() => { if (document.visibilityState === "visible") syncNow(); }, 120000);
  document.addEventListener("click", async (e) => {
    const b = e.target.closest("[data-sync]"); if (!b) return;
    e.preventDefault();
    const a = b.dataset.sync;
    if ((a === "enable" || a === "link") && vault.locked()) { st.error = "Sblocca prima la cassaforte."; renderSyncBox(); return; }
    if (a === "enable") await enable();
    if (a === "show-link") { st.linking = !st.linking; st.error = ""; renderSyncBox(); document.getElementById("sync-key-in")?.focus(); }
    if (a === "link") await link(document.getElementById("sync-key-in").value);
    if (a === "now") await syncNow();
    if (a === "toggle-key") { st.showKey = !st.showKey; renderSyncBox(); }
    if (a === "copy") { try { await navigator.clipboard.writeText(H.store.get("sync-key") ?? ""); b.textContent = "Copiata"; } catch { st.showKey = true; renderSyncBox(); } }
    if (a === "disable" && confirm("Disattivare la sincronizzazione su questo dispositivo? I dati restano qui e sugli altri dispositivi.")) disable();
    if (a === "wipe" && confirm("Eliminare i dati sincronizzati dal server? Gli altri dispositivi smetteranno di ricevere aggiornamenti finché non riattivi la sincronizzazione.")) {
      try { await wipeRemote(); disable(); } catch (x) { st.error = x.message; renderSyncBox(); }
    }
  });
  document.addEventListener("change", (e) => {
    if (e.target.id !== "sync-secrets") return;
    pls.set("sync-secrets", e.target.checked ? "1" : "0");
    if (e.target.checked) { const m = meta(), now = Date.now(); for (const k of SECRET_KEYS) if (m[k] == null && H.store.get(k, null) != null) m[k] = now; saveMeta(m); }
    schedule(300);
  });
  renderSyncBox();
  if (configured()) schedule(800);
}
