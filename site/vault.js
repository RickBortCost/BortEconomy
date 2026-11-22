// Cassaforte: cifratura dei dati personali salvati nel browser (chiavi API, portafoglio, composizione, preferiti).
//
// - Chiave derivata dalla password con PBKDF2-SHA-256 (600.000 iterazioni, sale casuale di 16 byte).
// - Dati cifrati con AES-256-GCM (IV casuale di 12 byte a ogni salvataggio, autenticazione integrata:
//   una password errata o un dato manomesso vengono rifiutati).
// - Da sbloccata, la chiave resta solo in memoria (CryptoKey non esportabile): ricaricando la pagina o dopo
//   il blocco automatico per inattività serve di nuovo la password. Nulla viene inviato in rete.
// - La password non è recuperabile: senza di essa i dati protetti si possono solo cancellare.

export const PROTECTED = ["portfolio", "composition", "favs", "apiKey", "apiKey.openai", "apiKey.gemini", "proxyCode"];
import { pls, pss, profiles } from "./profiles.js";

const VKEY = "vault";
const ITER = 600000;
const enc = new TextEncoder(), dec = new TextDecoder();
const b64 = (u8) => btoa(String.fromCharCode(...new Uint8Array(u8)));
const unb64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
// Archivio del profilo attivo: ogni profilo ha la propria cassaforte, con password e chiave distinte
const ls = pls;

async function deriveKey(password, salt, iter = ITER) {
  const base = await crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey({ name: "PBKDF2", hash: "SHA-256", salt, iterations: iter }, base, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
}
export async function encryptJSON(obj, key, salt, iter = ITER) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, enc.encode(JSON.stringify(obj)));
  return { v: 1, alg: "AES-256-GCM/PBKDF2-SHA256", iter, salt: b64(salt), iv: b64(iv), ct: b64(ct) };
}
export async function decryptJSON(box, key) {
  const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv: unb64(box.iv) }, key, unb64(box.ct));
  return JSON.parse(dec.decode(pt));
}
// Cifratura con password "usa e getta" (es. backup esportati)
export async function sealWithPassword(obj, password) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  return encryptJSON(obj, await deriveKey(password, salt), salt);
}
export async function openWithPassword(box, password) {
  return decryptJSON(box, await deriveKey(password, unb64(box.salt), box.iter ?? ITER));
}

// Valutazione semplice della robustezza della password (0–4)
export function strength(pw) {
  let s = 0;
  if (pw.length >= 10) s++;
  if (pw.length >= 14) s++;
  if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) s++;
  if (/\d/.test(pw) && /[^A-Za-z0-9]/.test(pw)) s++;
  if (/^(.)\1+$/.test(pw) || /^(password|12345|qwerty)/i.test(pw)) s = 0;
  return Math.min(s, 4);
}

const state = { key: null, salt: null, data: null, timer: null, lockAfterMin: 15, onLock: null, saving: Promise.resolve(), failures: 0 };

export const vault = {
  enabled: () => !!ls.get(VKEY),
  unlocked: () => !!state.data,
  locked() { return this.enabled() && !this.unlocked(); },

  // Lettura/scrittura dei dati protetti: in chiaro se la cassaforte non è attiva, in memoria (e cifrati su disco) se è sbloccata
  get(k) {
    if (!this.enabled()) return ls.get(k);
    return state.data ? state.data[k] ?? null : null;
  },
  set(k, v) {
    if (!this.enabled()) { ls.set(k, v); return; }
    if (!state.data) return; // bloccata: le modifiche non sono possibili
    if (v == null) delete state.data[k]; else state.data[k] = v;
    this.persist();
  },
  persist() {
    state.saving = state.saving.then(async () => {
      if (!state.key) return;
      ls.set(VKEY, JSON.stringify(await encryptJSON(state.data, state.key, state.salt)));
    });
    return state.saving;
  },

  async enable(password) {
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const data = {};
    for (const k of PROTECTED) { const v = ls.get(k); if (v != null) data[k] = v; }
    const ses = Object.fromEntries(PROTECTED.map((k) => [k, pss.get(k)]).filter(([, v]) => v));
    Object.assign(data, ses); // le chiavi tenute solo per la sessione entrano nella cassaforte
    state.key = await deriveKey(password, salt); state.salt = salt; state.data = data;
    await this.persist();
    for (const k of PROTECTED) { ls.set(k, null); pss.set(k, null); }
    this.touch();
  },

  async unlock(password) {
    if (state.failures >= 5) await new Promise((r) => setTimeout(r, Math.min(30000, 1000 * 2 ** (state.failures - 5)))); // freno ai tentativi ripetuti
    const box = JSON.parse(ls.get(VKEY));
    const salt = unb64(box.salt);
    const key = await deriveKey(password, salt, box.iter ?? ITER);
    try { state.data = await decryptJSON(box, key); } catch { state.failures++; return false; }
    state.key = key; state.salt = salt; state.failures = 0;
    this.touch();
    return true;
  },

  lock() {
    state.key = null; state.data = null;
    clearTimeout(state.timer);
    state.onLock?.();
  },

  async changePassword(newPassword) {
    if (!state.data) throw new Error("Cassaforte bloccata");
    state.salt = crypto.getRandomValues(new Uint8Array(16));
    state.key = await deriveKey(newPassword, state.salt);
    await this.persist();
  },

  // Disattiva la cassaforte riportando i dati in chiaro nel browser
  async disable() {
    if (!state.data) throw new Error("Cassaforte bloccata");
    await state.saving;
    for (const [k, v] of Object.entries(state.data)) ls.set(k, v);
    ls.set(VKEY, null);
    state.key = null; state.data = null; clearTimeout(state.timer);
  },

  // Nuovo profilo protetto: cassaforte vuota creata direttamente con la sua password
  async createFor(id, password) {
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const box = await encryptJSON({}, await deriveKey(password, salt), salt);
    try { localStorage.setItem(`${profiles.prefix(id)}${VKEY}`, JSON.stringify(box)); } catch {}
  },
  // Verifica la password della cassaforte di un altro profilo (es. per eliminarlo)
  async check(id, password) {
    const box = profiles.vaultBox(id); if (!box) return true;
    try { await openWithPassword(box, password); return true; } catch { return false; }
  },

  // Password dimenticata: i dati protetti sono irrecuperabili, si possono solo eliminare
  destroy() { ls.set(VKEY, null); state.key = null; state.data = null; clearTimeout(state.timer); },

  // Blocco automatico dopo inattività
  setAutoLock(min) { state.lockAfterMin = min; ls.set("vault-autolock", String(min)); this.touch(); },
  autoLockMin() { return +(ls.get("vault-autolock") ?? 15); },
  touch() {
    clearTimeout(state.timer);
    const m = this.autoLockMin();
    if (this.unlocked() && m > 0) state.timer = setTimeout(() => this.lock(), m * 60000);
  },
  onLock(fn) { state.onLock = fn; },
};
