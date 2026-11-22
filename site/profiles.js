// Profili utente sullo stesso dispositivo.
//
// Ogni profilo ha un proprio spazio nel browser: preferiti, portafoglio, composizione, chiavi API, impostazioni e la
// propria cassaforte cifrata con password distinta. Il profilo "default" usa le chiavi senza prefisso (compatibile
// con le versioni precedenti); gli altri usano il prefisso "p.<id>.".
// In chiaro restano solo l'elenco dei profili (nome e colore) e il profilo attivo.

const LIST = "profiles", ACTIVE = "profile-active";
export const DEFAULT = "default";
export const MAX_PROFILES = 8;
const GLOBAL = new Set([LIST, ACTIVE]);
const COLORS = 6;

const raw = (s) => ({
  get(k) { try { return s().getItem(k); } catch { return null; } },
  set(k, v) { try { v == null ? s().removeItem(k) : s().setItem(k, v); } catch {} },
  keys() { try { return Object.keys(s()); } catch { return []; } },
});
const L = raw(() => localStorage), S = raw(() => sessionStorage);

export const profiles = {
  list() {
    try { const l = JSON.parse(L.get(LIST)); if (Array.isArray(l) && l.length) return l; } catch {}
    return [{ id: DEFAULT, name: "Principale", color: 0 }];
  },
  save(l) { L.set(LIST, JSON.stringify(l)); },
  get(id) { return this.list().find((p) => p.id === id) ?? null; },
  // Il profilo attivo viene fissato al caricamento della pagina: il cambio di profilo ricarica sempre l'app,
  // così nessun dato del profilo precedente (né la chiave della cassaforte) resta in memoria.
  activeId: null,
  active() { return this.get(this.activeId) ?? this.list()[0]; },
  prefix(id = this.activeId) { return id === DEFAULT ? "" : `p.${id}.`; },
  protectedProfile(id) { return !!L.get(`${this.prefix(id)}vault`); },
  vaultBox(id) { try { return JSON.parse(L.get(`${this.prefix(id)}vault`)); } catch { return null; } },

  create(name) {
    const l = this.list();
    if (l.length >= MAX_PROFILES) throw new Error(`Al massimo ${MAX_PROFILES} profili.`);
    const id = [...crypto.getRandomValues(new Uint8Array(5))].map((b) => b.toString(16).padStart(2, "0")).join("");
    const used = new Set(l.map((p) => p.color));
    const color = [...Array(COLORS).keys()].find((c) => !used.has(c)) ?? l.length % COLORS;
    l.push({ id, name: cleanName(name), color });
    this.save(l);
    return id;
  },
  rename(id, name) { const l = this.list(); const p = l.find((x) => x.id === id); if (p) { p.name = cleanName(name); this.save(l); } },
  // Chiavi del browser che appartengono a un profilo
  keysOf(id) {
    const all = L.keys();
    return id === DEFAULT ? all.filter((k) => !GLOBAL.has(k) && !k.startsWith("p.")) : all.filter((k) => k.startsWith(this.prefix(id)));
  },
  // Elimina dati e profilo (mai quello attivo: prima si passa a un altro)
  remove(id) {
    if (id === this.activeId) throw new Error("Non si può eliminare il profilo in uso.");
    for (const k of this.keysOf(id)) L.set(k, null);
    for (const k of S.keys()) if (id === DEFAULT ? !k.startsWith("p.") && !k.startsWith("profile-") : k.startsWith(this.prefix(id))) S.set(k, null);
    const l = this.list().filter((p) => p.id !== id);
    this.save(l.length ? l : [{ id: DEFAULT, name: "Principale", color: 0 }]);
  },
  // Cancella i dati del profilo attivo mantenendo il profilo
  clearActive() {
    for (const k of this.keysOf(this.activeId)) L.set(k, null);
    for (const k of S.keys()) if (this.activeId === DEFAULT ? !k.startsWith("p.") && !k.startsWith("profile-") : k.startsWith(this.prefix())) S.set(k, null);
  },
  switchTo(id) {
    L.set(ACTIVE, id); S.set("profile-chosen", "1");
    location.reload();
  },
  // Alla prima apertura della scheda, con più profili, si chiede chi sta usando l'app
  needsChoice() { return this.list().length > 1 && !S.get("profile-chosen"); },
  markChosen() { S.set("profile-chosen", "1"); },
  forgetChoice() { S.set("profile-chosen", null); },
  initials(p) { return (p?.name ?? "?").trim().slice(0, 1).toUpperCase() || "?"; },
};
{
  const a = L.get(ACTIVE);
  profiles.activeId = profiles.list().some((p) => p.id === a) ? a : profiles.list()[0].id;
}

function cleanName(s) { return String(s ?? "").replace(/[\u0000-\u001f<>]/g, "").trim().slice(0, 24) || "Profilo"; }

// Archivi del profilo attivo (stessa interfaccia per localStorage e sessionStorage)
const scoped = (R) => ({
  get: (k) => R.get(profiles.prefix() + k),
  set: (k, v) => R.set(profiles.prefix() + k, v),
});
export const pls = scoped(L);
export const pss = scoped(S);
