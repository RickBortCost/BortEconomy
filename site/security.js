// Interfaccia di privacy e sicurezza: cassaforte (attivazione, sblocco, blocco automatico), condivisione con l'AI,
// backup cifrato, cancellazione di tutti i dati, informativa.
import { vault, strength, sealWithPassword, openWithPassword, PROTECTED } from "./vault.js";

let H;
const $ = (s) => document.querySelector(s);
const STRENGTH = ["molto debole", "debole", "discreta", "buona", "ottima"];

// ---------- password: finestra generica ----------
export function askPassword({ title, text = "", confirm = false, ok = "Conferma" }) {
  return new Promise((resolve) => {
    const d = $("#pw-dialog");
    $("#pw-title").textContent = title; $("#pw-text").textContent = text;
    $("#pw-1").value = ""; $("#pw-2").value = ""; $("#pw-err").textContent = ""; $("#pw-meter").hidden = !confirm;
    $("#pw-2-wrap").hidden = !confirm; $("#pw-ok").textContent = ok;
    const meter = () => { const s = strength($("#pw-1").value); $("#pw-meter").value = s; $("#pw-meter-l").textContent = `Robustezza: ${STRENGTH[s]}`; };
    $("#pw-1").oninput = confirm ? meter : null; if (confirm) meter();
    $("#pw-ok").onclick = (e) => {
      e.preventDefault();
      const p = $("#pw-1").value;
      if (confirm && p.length < 10) { $("#pw-err").textContent = "Usa almeno 10 caratteri (meglio una frase di più parole)."; return; }
      if (confirm && p !== $("#pw-2").value) { $("#pw-err").textContent = "Le due password non coincidono."; return; }
      if (!p) { $("#pw-err").textContent = "Inserisci la password."; return; }
      d.close(); resolve(p);
    };
    d.onclose = () => resolve(null);
    d.showModal(); $("#pw-1").focus();
  });
}

// ---------- sblocco ----------
export async function unlockFlow() {
  const d = $("#unlock-dialog");
  return new Promise((resolve) => {
    $("#unlock-pw").value = ""; $("#unlock-err").textContent = "";
    $("#unlock-ok").onclick = async (e) => {
      e.preventDefault();
      $("#unlock-ok").disabled = true; $("#unlock-err").textContent = "Verifica…";
      const ok = await vault.unlock($("#unlock-pw").value);
      $("#unlock-ok").disabled = false;
      if (!ok) { $("#unlock-err").textContent = "Password errata."; $("#unlock-pw").select(); return; }
      d.close(); H.refresh(); resolve(true);
    };
    $("#unlock-forgot").onclick = (e) => {
      e.preventDefault();
      if (!confirm("Senza password i dati protetti (chiavi API, portafoglio, composizione, preferiti) non si possono recuperare.\n\nVuoi eliminarli e disattivare la cassaforte?")) return;
      vault.destroy(); d.close(); H.refresh(); resolve(false);
    };
    d.onclose = () => resolve(vault.unlocked());
    d.showModal(); $("#unlock-pw").focus();
  });
}

// ---------- stato nella barra superiore ----------
export function renderLockState() {
  const b = $("#sec-btn"), en = vault.enabled(), un = vault.unlocked();
  b.innerHTML = `<svg class="ic" aria-hidden="true"><use href="#i-${!en ? "shield" : un ? "unlock" : "lock"}"/></svg>`;
  b.title = b.ariaLabel = !en ? "Privacy e sicurezza" : un ? "Cassaforte sbloccata – tocca per le opzioni" : "Dati protetti bloccati – tocca per sbloccare";
  b.classList.toggle("locked", en && !un);
  document.body.classList.toggle("vault-locked", en && !un);
}

// ---------- finestra Privacy e sicurezza ----------
function renderSecurity() {
  const en = vault.enabled(), un = vault.unlocked();
  $("#sec-vault-status").innerHTML = !en
    ? "<b>Non attiva.</b> Chiavi API, portafoglio, composizione e preferiti sono salvati in chiaro in questo browser."
    : un ? "<b>Attiva e sbloccata.</b> I dati protetti sono cifrati sul dispositivo e decifrati solo in memoria."
      : "<b>Attiva e bloccata.</b> Inserisci la password per usare i dati protetti.";
  $("#sec-enable").hidden = en;
  $("#sec-on").hidden = !en;
  $("#sec-lock").textContent = un ? "Blocca ora" : "Sblocca";
  for (const id of ["#sec-chpw", "#sec-disable", "#sec-autolock"]) $(id).disabled = !un;
  $("#sec-autolock").value = String(vault.autoLockMin());
  $("#sec-share-favs").checked = H.store.get("share-favs", "0") === "1";
  $("#sec-share-confirm").checked = H.store.get("share-confirm", "1") === "1";
}

async function exportBackup() {
  if (vault.locked()) { await unlockFlow(); if (vault.locked()) return; }
  const pw = await askPassword({ title: "Password del backup", text: "Il file sarà cifrato (AES-256): servirà questa password per reimportarlo. Può essere diversa da quella della cassaforte.", confirm: true, ok: "Esporta" });
  if (!pw) return;
  const data = {};
  for (const k of [...PROTECTED, "theme", "country", "mt-cur", "pendingAdds", "share-favs", "share-confirm", "ai-provider", "model", "model.openai", "model.gemini", "web"]) {
    const v = PROTECTED.includes(k) ? vault.get(k) : localStorage.getItem(k);
    if (v != null) data[k] = v;
  }
  const box = await sealWithPassword({ app: "BortEconomy", exported: new Date().toISOString(), data }, pw);
  H.download(`borteconomy-backup-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify({ app: "BortEconomy", encrypted: box }), "application/json");
}

async function importBackup(file) {
  try {
    const j = JSON.parse(await file.text());
    if (!j.encrypted) { alert("Il file non è un backup cifrato di BortEconomy."); return; }
    const pw = await askPassword({ title: "Password del backup", ok: "Importa" });
    if (!pw) return;
    let content;
    try { content = await openWithPassword(j.encrypted, pw); } catch { alert("Password errata o file danneggiato."); return; }
    if (vault.locked()) { await unlockFlow(); if (vault.locked()) return; }
    for (const [k, v] of Object.entries(content.data ?? {})) {
      if (PROTECTED.includes(k)) vault.set(k, v); else localStorage.setItem(k, v);
    }
    alert("Backup importato."); location.reload();
  } catch { alert("File non valido."); }
}

async function wipeAll() {
  if (!confirm("Eliminare tutti i dati di BortEconomy da questo browser?\n\nChiavi API, portafoglio, composizione, preferiti, avvisi richiesti, impostazioni e dati salvati per l'uso offline verranno cancellati. L'operazione non è reversibile.")) return;
  vault.destroy();
  try { localStorage.clear(); sessionStorage.clear(); } catch {}
  try { for (const k of await caches.keys()) await caches.delete(k); } catch {}
  try { for (const r of (await navigator.serviceWorker?.getRegistrations()) ?? []) await r.unregister(); } catch {}
  location.reload();
}

// Conferma prima di inviare dati personali a un assistente AI
export function confirmShare(what, provider) {
  if (H.store.get("share-confirm", "1") !== "1") return true;
  return confirm(`Stai per inviare a ${provider} ${what}.\n\nI dati vanno direttamente al fornitore dell'assistente con la tua chiave e sono trattati secondo la sua informativa. Continuare?`);
}

export function initSecurity(helpers) {
  H = helpers;
  vault.onLock(() => { H.refresh(); renderLockState(); });
  // attività dell'utente: rinvia il blocco automatico
  let last = 0;
  for (const ev of ["pointerdown", "keydown", "scroll"]) addEventListener(ev, () => { const n = Date.now(); if (n - last > 20000) { last = n; vault.touch(); } }, { passive: true });

  $("#sec-btn").addEventListener("click", () => {
    if (vault.locked()) { unlockFlow().then(renderLockState); return; }
    renderSecurity(); $("#sec-dialog").showModal();
  });
  $("#sec-enable").addEventListener("click", async () => {
    const pw = await askPassword({ title: "Crea la password della cassaforte", text: "Protegge chiavi API, portafoglio, composizione e preferiti. Non è recuperabile: conservala in un gestore di password.", confirm: true, ok: "Attiva" });
    if (!pw) return;
    await vault.enable(pw); renderSecurity(); renderLockState(); H.refresh();
  });
  $("#sec-lock").addEventListener("click", async () => {
    if (vault.unlocked()) { vault.lock(); $("#sec-dialog").close(); }
    else { $("#sec-dialog").close(); await unlockFlow(); }
    renderLockState();
  });
  $("#sec-chpw").addEventListener("click", async () => {
    const pw = await askPassword({ title: "Nuova password", confirm: true, ok: "Cambia" });
    if (pw) { await vault.changePassword(pw); alert("Password cambiata."); }
  });
  $("#sec-disable").addEventListener("click", async () => {
    if (!confirm("Disattivare la cassaforte? I dati protetti torneranno salvati in chiaro in questo browser.")) return;
    await vault.disable(); renderSecurity(); renderLockState(); H.refresh();
  });
  $("#sec-autolock").addEventListener("change", (e) => vault.setAutoLock(+e.target.value));
  $("#sec-share-favs").addEventListener("change", (e) => H.store.set("share-favs", e.target.checked ? "1" : "0"));
  $("#sec-share-confirm").addEventListener("change", (e) => H.store.set("share-confirm", e.target.checked ? "1" : "0"));
  $("#sec-export").addEventListener("click", exportBackup);
  $("#sec-import").addEventListener("change", (e) => { const f = e.target.files[0]; if (f) importBackup(f); e.target.value = ""; });
  $("#sec-wipe").addEventListener("click", wipeAll);
  for (const b of document.querySelectorAll("[data-open-sec]")) b.addEventListener("click", (e) => { e.preventDefault(); renderSecurity(); $("#sec-dialog").showModal(); });
  renderLockState();
  if (vault.locked()) unlockFlow().then(renderLockState);
}
