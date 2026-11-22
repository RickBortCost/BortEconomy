// Home personalizzabile: griglia di widget (grafici, tabelle di titoli, notizie, mercati) scelti e disposti dall'utente.
//
// Layout salvato per profilo ("home-layout"): elenco ordinato di { id, type, size, tall, cfg }.
//   size: "s" = 1/4, "m" = 1/2, "l" = 3/4, "xl" = intera larghezza (su telefono ogni widget occupa la riga intera)
//   tall: altezza doppia
// Modalità modifica (solo nella pagina Home): spostamento (trascinamento o frecce), dimensioni, impostazioni,
// rimozione e catalogo dei widget con ricerca e scelta della posizione.
import { loadHist } from "./detail.js";
import { positionsValue, positions } from "./portfolio.js";
import { vault } from "./vault.js";

let H; // helper dell'app
const KEY = "home-layout";
const SIZES = [["s", "1/4"], ["m", "1/2"], ["l", "3/4"], ["xl", "Intera"]];
const st = { edit: false, drag: null, catalogOpen: false, query: "", cfgId: null, cfgDraft: null };
const uid = () => Math.random().toString(36).slice(2, 9);

// ---------------------------------------------------------------- widget disponibili
const RANGES = [["7", "1S"], ["30", "1M"], ["90", "3M"], ["365", "1A"], ["1825", "5A"]];
const defaultSym = () => H.favs.list()[0] ?? H.state.config.countries[H.state.country]?.index ?? "^GSPC";

const W = {
  favs: {
    name: "Preferiti", icon: "⭐", size: "m", tall: true, tags: "titoli tabella stella watchlist",
    desc: "I tuoi titoli preferiti con prezzo e variazione del giorno.",
    render() {
      const qs = H.favs.list().map(H.bySymbol).filter(Boolean);
      return qs.length ? `<ul class="rows hw-rows">${H.rows(qs, { star: true, field: "changePct" })}</ul>`
        : empty("Nessun preferito. Apri un titolo e tocca la stella, oppure cercalo con la lente in alto.");
    },
  },
  watch: {
    name: "Tabella titoli", icon: "📋", size: "l", tall: true, tags: "titoli tabella azioni valori rendimenti watchlist personalizzata",
    desc: "Tabella con i titoli che scegli: prezzo e rendimenti a giorno, settimana, mese, anno.",
    cfg: { syms: "symbols", title: "text" },
    defaults: () => ({ syms: H.favs.list().slice(0, 8), title: "" }),
    title: (c) => c.title || "Tabella titoli",
    render(c) {
      const qs = (c.syms ?? []).map(H.bySymbol).filter(Boolean);
      if (!qs.length) return empty("Nessun titolo: apri le impostazioni del widget (⚙) per sceglierli.");
      const pc = (v) => H.pctHtml(v);
      return `<div class="hw-table"><table><thead><tr><th>Titolo</th><th>Prezzo</th><th>Giorno</th><th>Sett.</th><th>Mese</th><th>Anno</th></tr></thead><tbody>${qs.map((q) => `
        <tr data-sym="${H.esc(q.symbol)}" tabindex="0" role="button"><td><b>${H.esc(q.name)}</b><small>${H.esc(q.symbol)}</small></td>
        <td>${H.nf(q.price, H.pdec(q.price))} <small>${H.esc(q.currency ?? "")}</small></td><td>${pc(q.changePct)}</td><td>${pc(q.weekPct)}</td><td>${pc(q.monthPct)}</td><td>${pc(q.yearPct)}</td></tr>`).join("")}</tbody></table></div>`;
    },
  },
  chart: {
    name: "Grafico", icon: "📈", size: "m", tall: false, tags: "grafico andamento storico linea titolo indice",
    desc: "Andamento di un titolo, indice, metallo, valuta o cripto: 1 settimana, 1 mese, 3 mesi, 1 anno, 5 anni.",
    cfg: { sym: "symbol", range: "range" },
    defaults: () => ({ sym: defaultSym(), range: "90" }),
    title: (c) => H.bySymbol(c.sym)?.name ?? c.sym,
    async render(c) {
      const q = H.bySymbol(c.sym);
      const h = await loadHist(c.sym);
      const days = +c.range, from = Date.now() / 1000 - days * 86400;
      const src = days <= 7 ? h?.hour : days > 400 ? (h?.week?.length ? h.week : h?.day) : h?.day;
      const pts = (src ?? []).filter((p) => p[0] >= from);
      if (pts.length < 2) return empty("Storico non disponibile per questo titolo.");
      const first = pts[0][1], last = q?.price ?? pts.at(-1)[1], chg = (last / first - 1) * 100;
      return `<div class="hw-chart-hd" data-sym="${H.esc(c.sym)}" role="button" tabindex="0"><b>${H.nf(last, H.pdec(last))}</b> <small>${H.esc(q?.currency ?? "")}</small> ${H.pctHtml(chg)}
        <span class="hw-ranges">${RANGES.map(([v, l]) => `<button type="button" data-range="${v}" class="${v === c.range ? "on" : ""}">${l}</button>`).join("")}</span></div>
        ${lineChart(pts, chg >= 0)}`;
    },
  },
  quote: {
    name: "Scheda titolo", icon: "🏷️", size: "s", tall: false, tags: "titolo singolo prezzo scheda azione",
    desc: "Prezzo, variazione e mini grafico di un singolo titolo.",
    cfg: { sym: "symbol" },
    defaults: () => ({ sym: defaultSym() }),
    title: (c) => H.bySymbol(c.sym)?.name ?? c.sym,
    render(c) {
      const q = H.bySymbol(c.sym);
      if (!q) return empty("Titolo non disponibile.");
      return `<div class="hw-quote" data-sym="${H.esc(q.symbol)}" role="button" tabindex="0">
        <div class="p">${H.nf(q.price, H.pdec(q.price))} <small>${H.esc(q.currency ?? "")}</small></div>
        <div class="hw-q-chg">${H.pctHtml(q.changePct)} <small>oggi</small> ${H.pctHtml(q.weekPct)} <small>sett.</small></div>
        ${H.spark(q.spark, (q.changePct ?? 0) >= 0)}</div>`;
    },
  },
  favnews: {
    name: "Notizie dei preferiti", icon: "📰", size: "m", tall: true, tags: "notizie società preferiti titoli",
    desc: "Le ultime notizie sulle società che segui.",
    async render() {
      const syms = H.favs.list().slice(0, 8);
      if (!syms.length) return empty("Aggiungi titoli ai preferiti per vedere le notizie sulle società.");
      const lists = await Promise.all(syms.map(async (s) => ((await loadHist(s))?.news ?? []).map((n) => ({ ...n, sym: s }))));
      const items = lists.flat().sort((a, b) => b.date.localeCompare(a.date)).slice(0, 10);
      return items.length ? newsList(items, true) : empty("Nessuna notizia recente sui preferiti.");
    },
  },
  news: {
    name: "Notizie", icon: "🗞️", size: "m", tall: true, tags: "notizie economia borsa paese mondo",
    desc: "Le ultime notizie di economia e borsa del paese selezionato o del mondo.",
    cfg: { scope: "scope" },
    defaults: () => ({ scope: "country" }),
    title: (c) => (c.scope === "world" ? "Notizie dal mondo" : `Notizie – ${H.state.config.countries[H.state.country]?.name ?? ""}`),
    async render(c) {
      const d = await H.loadNews(c.scope === "world" ? "WORLD" : H.state.country);
      const items = (d.items ?? []).slice(0, 10);
      return items.length ? newsList(items) : empty("Nessuna notizia disponibile.");
    },
  },
  indices: {
    name: "Indici principali", icon: "🌍", size: "xl", tall: false, tags: "indici borsa mondo ftse s&p nasdaq dax",
    desc: "Gli indici del tuo paese e delle principali borse mondiali.",
    render() {
      const c = H.state.config.countries[H.state.country];
      return `<div class="grid hw-tiles">${H.tiles([...new Set([c?.index, ...H.state.config.globalIndices])].filter(Boolean).slice(0, 8))}</div>`;
    },
  },
  movers: {
    name: "Migliori e peggiori", icon: "🏆", size: "m", tall: true, tags: "rialzo ribasso migliori peggiori titoli oggi",
    desc: "I titoli monitorati con il maggior rialzo e ribasso di oggi.",
    render() {
      const { gainers, losers } = H.movers(6);
      const list = (qs) => `<ul class="hw-mini">${qs.map((q) => `<li data-sym="${H.esc(q.symbol)}" role="button" tabindex="0"><span><b>${H.esc(q.name)}</b><small>${H.esc(q.symbol)}</small></span>${H.pctHtml(q.changePct)}</li>`).join("")}</ul>`;
      return `<div class="hw-two"><div><h4 class="hw-sub pos">In rialzo</h4>${list(gainers)}</div><div><h4 class="hw-sub neg">In ribasso</h4>${list(losers)}</div></div>`;
    },
  },
  metals: {
    name: "Metalli", icon: "🥇", size: "m", tall: false, tags: "oro argento platino acciaio alluminio rame metalli",
    desc: "Oro, argento, platino, palladio, rame, acciaio e alluminio.",
    render() { return `<ul class="rows hw-rows">${H.rows(H.state.config.metals.items.map((m) => H.bySymbol(m.symbol)).filter(Boolean), { field: "changePct" })}</ul>`; },
  },
  forex: {
    name: "Valute", icon: "💱", size: "s", tall: true, tags: "cambi valute euro dollaro forex",
    desc: "I principali tassi di cambio.",
    render() { return `<ul class="rows hw-rows">${H.rows(H.state.config.forex.majors.slice(0, 8).map(H.bySymbol).filter(Boolean), { field: "changePct" })}</ul>`; },
  },
  crypto: {
    name: "Cripto", icon: "🪙", size: "s", tall: true, tags: "bitcoin ethereum criptovalute",
    desc: "Le criptovalute principali.",
    render() { return `<ul class="rows hw-rows">${H.rows(H.state.config.crypto.items.slice(0, 8).map(H.bySymbol).filter(Boolean), { field: "changePct" })}</ul>`; },
  },
  brief: {
    name: "Il punto del giorno", icon: "☀️", size: "m", tall: true, tags: "riepilogo giornata ai claude sintesi",
    desc: "La sintesi della giornata economica scritta dall'AI.",
    async render() {
      const b = await H.getJSON("data/brief.json").catch(() => null);
      if (!b?.markdown) return empty("Il punto del giorno non è ancora disponibile.");
      return `<div class="hw-brief">${H.md(b.markdown)}</div>`;
    },
  },
  calendar: {
    name: "Prossimi eventi", icon: "📅", size: "m", tall: true, tags: "calendario agenda macro utili eventi banche centrali",
    desc: "Agenda dei dati macroeconomici importanti e dei risultati societari dei prossimi giorni.",
    async render() {
      const d = await H.getJSON("data/calendar.json").catch(() => null);
      if (!d) return empty("Calendario non disponibile.");
      const now = Date.now(), until = now + 7 * 864e5;
      const ev = [
        ...(d.macro ?? []).filter((e) => e.impact >= 2).map((e) => ({ t: Date.parse(e.date), txt: `${e.cur} · ${e.title}`, hi: e.impact >= 3 })),
        ...(d.earnings ?? []).map((e) => ({ t: Date.parse(e.date), txt: `Utili · ${e.name}`, sym: e.symbol })),
      ].filter((e) => e.t >= now - 3600e3 && e.t <= until).sort((a, b) => a.t - b.t).slice(0, 12);
      if (!ev.length) return empty("Nessun evento importante nei prossimi giorni.");
      return `<ul class="hw-events">${ev.map((e) => `<li${e.sym ? ` data-sym="${H.esc(e.sym)}" role="button" tabindex="0"` : ""}><time>${new Date(e.t).toLocaleString("it-IT", { weekday: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}</time><span class="${e.hi ? "hi" : ""}">${H.esc(e.txt)}</span></li>`).join("")}</ul>`;
    },
  },
  portfolio: {
    name: "Portafoglio", icon: "💼", size: "s", tall: false, tags: "portafoglio valore posizioni investimenti",
    desc: "Valore del tuo portafoglio in euro e numero di posizioni.",
    render() {
      if (vault.locked()) return `<div class="hw-lock"><span>🔒</span><p>Dati protetti bloccati.</p><button type="button" class="ghost" data-unlock-home>Sblocca</button></div>`;
      const n = positions().length;
      if (!n) return `${empty("Nessuna posizione.")}<button type="button" class="ghost hw-go" data-go="portfolio">Apri il portafoglio</button>`;
      return `<div class="hw-pf"><div class="p">${H.nf(positionsValue(), 0)} €</div><small>${n} posizioni</small>
        <button type="button" class="ghost hw-go" data-go="portfolio">Dettagli</button></div>`;
    },
  },
};

const empty = (t) => `<p class="hw-empty">${t}</p>`;
function newsList(items, withSym = false) {
  return `<ul class="hw-news">${items.map((n) => `<li><a href="${H.esc(H.safeUrl(n.link))}" target="_blank" rel="noopener noreferrer">${H.esc(n.title)}</a>
    <small>${withSym ? `<b>${H.esc(H.bySymbol(n.sym)?.name ?? n.sym)}</b> · ` : ""}${H.esc(String(n.source).split(/\s+[-|–]\s+/)[0])} · ${H.ago(n.date)}</small></li>`).join("")}</ul>`;
}
function lineChart(pts, up) {
  const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
  const x0 = xs[0], x1 = xs.at(-1), lo = Math.min(...ys), hi = Math.max(...ys), r = hi - lo || 1;
  const P = pts.map(([x, y]) => `${(((x - x0) / (x1 - x0 || 1)) * 100).toFixed(2)},${(56 - ((y - lo) / r) * 52).toFixed(2)}`).join(" ");
  const col = `var(${up ? "--up" : "--down"})`;
  return `<div class="hw-chart"><svg viewBox="0 0 100 60" preserveAspectRatio="none" aria-hidden="true">
    <polygon points="0,60 ${P} 100,60" fill="${col}" opacity=".12"/>
    <polyline points="${P}" fill="none" stroke="${col}" stroke-width="2" vector-effect="non-scaling-stroke" stroke-linejoin="round"/></svg>
    <span class="hw-ax hi">${H.nf(hi, H.pdec(hi))}</span><span class="hw-ax lo">${H.nf(lo, H.pdec(lo))}</span></div>`;
}

// ---------------------------------------------------------------- layout
function defaultLayout() {
  const hasFavs = H.favs.list().length > 0;
  const w = (type, extra = {}) => ({ id: uid(), type, size: W[type].size, tall: W[type].tall, cfg: W[type].defaults?.() ?? {}, ...extra });
  return hasFavs
    ? [w("indices"), w("favs"), w("chart"), w("favnews"), w("movers"), w("news"), w("calendar"), w("metals")]
    : [w("indices"), w("movers"), w("news"), w("brief"), w("metals"), w("calendar"), w("forex"), w("crypto")];
}
function load() {
  try { const l = JSON.parse(H.store.get(KEY, "null")); if (Array.isArray(l)) return l.filter((x) => W[x.type]); } catch {}
  return null;
}
const save = (l) => H.store.set(KEY, JSON.stringify(l));
let layout = null;
const getLayout = () => (layout ??= load() ?? defaultLayout());
function update(fn) { const l = getLayout(); fn(l); save(l); renderHome(); }

// ---------------------------------------------------------------- disegno
const titleOf = (w) => W[w.type].title?.(w.cfg ?? {}) ?? W[w.type].name;
function frame(w, i, n) {
  const T = W[w.type];
  const ctl = st.edit ? `<div class="hw-ctl" data-ctl="${w.id}">
      <span class="hw-handle" title="Trascina per spostare" aria-hidden="true">⠿</span>
      <button type="button" data-act="left" aria-label="Sposta prima" ${i === 0 ? "disabled" : ""}>◀</button>
      <button type="button" data-act="right" aria-label="Sposta dopo" ${i === n - 1 ? "disabled" : ""}>▶</button>
      <select data-act="size" aria-label="Larghezza">${SIZES.map(([v, l]) => `<option value="${v}" ${v === w.size ? "selected" : ""}>${l}</option>`).join("")}</select>
      <button type="button" data-act="tall" aria-pressed="${!!w.tall}" title="Altezza doppia" aria-label="Altezza doppia">↕</button>
      ${T.cfg ? `<button type="button" data-act="cfg" aria-label="Impostazioni del widget">⚙</button>` : ""}
      <button type="button" data-act="del" class="danger" aria-label="Rimuovi widget">✕</button></div>` : "";
  return `<section class="hw" data-id="${w.id}" data-size="${w.size}" data-tall="${!!w.tall}" ${st.edit ? 'draggable="true"' : ""} aria-label="${H.esc(titleOf(w))}">
    <header class="hw-hd"><span class="hw-ic" aria-hidden="true">${T.icon}</span><h3>${H.esc(titleOf(w))}</h3></header>
    ${ctl}<div class="hw-body" id="hwb-${w.id}"><div class="hw-loading"></div></div></section>`;
}

export async function renderHome() {
  if (!H || !H.state.markets) return;
  const l = getLayout(), grid = H.$("#home-grid");
  document.querySelector("#tab-home").classList.toggle("editing", st.edit);
  H.$("#home-edit").hidden = st.edit;
  H.$("#home-tools").hidden = !st.edit;
  H.$("#home-catalog").hidden = !st.edit || !st.catalogOpen;
  H.$("#home-add").setAttribute("aria-expanded", st.edit && st.catalogOpen);
  grid.innerHTML = l.map((w, i) => frame(w, i, l.length)).join("")
    + (st.edit ? `<div class="hw-drop-end" data-drop-end>Trascina qui per mettere in fondo</div>` : "")
    + (!l.length ? `<div class="hw-empty-home">La Home è vuota. Tocca <b>Personalizza</b> e poi <b>Aggiungi widget</b>.</div>` : "");
  if (st.edit && st.catalogOpen) renderCatalog();
  await Promise.all(l.map(async (w) => {
    const body = document.getElementById(`hwb-${w.id}`); if (!body) return;
    try { body.innerHTML = await W[w.type].render(w.cfg ?? {}); }
    catch { body.innerHTML = empty("Widget non disponibile."); }
  }));
}

// ---------------------------------------------------------------- catalogo (modalità modifica)
function renderCatalog() {
  const q = st.query.trim().toLowerCase(), n = getLayout().length;
  const list = Object.entries(W).filter(([k, w]) => !q || `${w.name} ${w.desc} ${w.tags}`.toLowerCase().includes(q));
  const pos = `<option value="0">In cima</option>${getLayout().map((w, i) => `<option value="${i + 1}" ${i + 1 === n ? "selected" : ""}>Dopo “${H.esc(titleOf(w))}”</option>`).join("")}`;
  H.$("#hc-rows").innerHTML = list.map(([k, w]) => `<tr data-type="${k}" draggable="true">
      <td><span class="hw-ic">${w.icon}</span> <b>${H.esc(w.name)}</b><small>${H.esc(w.desc)}</small></td>
      <td class="hc-size">${SIZES.find(([v]) => v === w.size)[1]}${w.tall ? " · alto" : ""}</td>
      <td><select data-pos aria-label="Posizione di ${H.esc(w.name)}">${pos}</select></td>
      <td><button type="button" class="primary hc-add" data-add="${k}">Aggiungi</button></td></tr>`).join("")
    || `<tr><td colspan="4" class="hw-empty">Nessun widget per “${H.esc(st.query)}”.</td></tr>`;
}
function addWidget(type, at) {
  const T = W[type];
  const w = { id: uid(), type, size: T.size, tall: T.tall, cfg: T.defaults?.() ?? {} };
  update((l) => l.splice(Math.max(0, Math.min(at ?? l.length, l.length)), 0, w));
  setTimeout(() => document.querySelector(`.hw[data-id="${w.id}"]`)?.scrollIntoView({ behavior: "smooth", block: "center" }), 50);
  return w;
}
function move(id, to) {
  update((l) => {
    const i = l.findIndex((x) => x.id === id); if (i < 0) return;
    const [w] = l.splice(i, 1);
    l.splice(Math.max(0, Math.min(to > i ? to - 1 : to, l.length)), 0, w);
  });
}

// ---------------------------------------------------------------- impostazioni del widget
function openCfg(id) {
  const w = getLayout().find((x) => x.id === id); if (!w) return;
  const T = W[w.type];
  st.cfgId = id; st.cfgDraft = structuredClone(w.cfg ?? {});
  H.$("#hcfg-title").textContent = `${T.icon} ${T.name}`;
  const f = [];
  for (const [k, kind] of Object.entries(T.cfg)) {
    if (kind === "symbol") f.push(`<label>Titolo<input type="search" id="hcfg-q" placeholder="Cerca per nome o simbolo…" autocomplete="off"></label>
      <p class="hint" id="hcfg-cur">Selezionato: <b>${H.esc(H.bySymbol(st.cfgDraft.sym)?.name ?? st.cfgDraft.sym ?? "–")}</b></p><ul class="rows hcfg-res" id="hcfg-res"></ul>`);
    if (kind === "symbols") f.push(`<label>Aggiungi titoli<input type="search" id="hcfg-q" placeholder="Cerca per nome o simbolo…" autocomplete="off"></label>
      <ul class="rows hcfg-res" id="hcfg-res"></ul><div class="hcfg-chips" id="hcfg-chips"></div>`);
    if (kind === "range") f.push(`<label>Periodo<select id="hcfg-range">${RANGES.map(([v, l]) => `<option value="${v}" ${v === st.cfgDraft.range ? "selected" : ""}>${l}</option>`).join("")}</select></label>`);
    if (kind === "scope") f.push(`<label>Notizie<select id="hcfg-scope"><option value="country" ${st.cfgDraft.scope !== "world" ? "selected" : ""}>Paese selezionato</option><option value="world" ${st.cfgDraft.scope === "world" ? "selected" : ""}>Mondo</option></select></label>`);
    if (kind === "text") f.push(`<label>Titolo del widget<input id="hcfg-text" maxlength="40" value="${H.esc(st.cfgDraft.title ?? "")}" placeholder="${H.esc(T.name)}"></label>`);
  }
  H.$("#hcfg-fields").innerHTML = f.join("");
  renderChips();
  H.$("#hw-cfg").showModal();
}
function renderChips() {
  const box = document.getElementById("hcfg-chips"); if (!box) return;
  box.innerHTML = (st.cfgDraft.syms ?? []).map((s) => `<button type="button" class="chip" data-rm="${H.esc(s)}">${H.esc(H.bySymbol(s)?.name ?? s)} ✕</button>`).join("")
    || '<p class="hint">Nessun titolo scelto.</p>';
}

// ---------------------------------------------------------------- avvio
export function initHome(helpers) {
  H = helpers;
  const grid = H.$("#home-grid");

  H.$("#home-edit").addEventListener("click", () => { st.edit = true; st.catalogOpen = false; renderHome(); });
  H.$("#home-done").addEventListener("click", () => { st.edit = false; renderHome(); });
  H.$("#home-add").addEventListener("click", () => { st.catalogOpen = !st.catalogOpen; renderHome(); if (st.catalogOpen) setTimeout(() => H.$("#hc-search").focus(), 30); });
  H.$("#home-reset").addEventListener("click", () => {
    if (!confirm("Ripristinare la Home predefinita? I widget e la disposizione attuali verranno sostituiti.")) return;
    layout = defaultLayout(); save(layout); renderHome();
  });
  H.$("#hc-search").addEventListener("input", (e) => { st.query = e.target.value; renderCatalog(); });
  H.$("#hc-rows").addEventListener("click", (e) => {
    const b = e.target.closest("[data-add]"); if (!b) return;
    const at = +b.closest("tr").querySelector("[data-pos]").value;
    addWidget(b.dataset.add, at);
  });

  // controlli dei widget
  grid.addEventListener("click", (e) => {
    const go = e.target.closest("[data-go]"); if (go) { H.setTab(go.dataset.go); return; }
    if (e.target.closest("[data-unlock-home]")) { document.querySelector("#sec-btn").click(); return; }
    const rg = e.target.closest("[data-range]");
    if (rg) { e.stopPropagation(); const id = rg.closest(".hw").dataset.id; update((l) => { const w = l.find((x) => x.id === id); w.cfg.range = rg.dataset.range; }); return; }
    const b = e.target.closest("[data-act]"); if (!b || b.tagName === "SELECT") return;
    const id = b.closest("[data-ctl]").dataset.ctl, l = getLayout(), i = l.findIndex((x) => x.id === id);
    if (b.dataset.act === "left") move(id, i - 1);
    if (b.dataset.act === "right") move(id, i + 2);
    if (b.dataset.act === "tall") update((L) => { L[i].tall = !L[i].tall; });
    if (b.dataset.act === "del") update((L) => { L.splice(i, 1); });
    if (b.dataset.act === "cfg") openCfg(id);
  }, true);
  grid.addEventListener("change", (e) => {
    const s = e.target.closest('[data-act="size"]'); if (!s) return;
    const id = s.closest("[data-ctl]").dataset.ctl;
    update((l) => { l.find((x) => x.id === id).size = s.value; });
  });

  // trascinamento (mouse; su telefono si usano le frecce e la scelta della posizione)
  const clearMarks = () => document.querySelectorAll(".hw-over,.hw-drop-end.over").forEach((x) => x.classList.remove("hw-over", "over"));
  grid.addEventListener("dragstart", (e) => {
    const w = e.target.closest(".hw"); if (!w || !st.edit) return;
    st.drag = { id: w.dataset.id }; e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", w.dataset.id); w.classList.add("hw-dragging");
  });
  H.$("#hc-rows").addEventListener("dragstart", (e) => {
    const tr = e.target.closest("tr[data-type]"); if (!tr) return;
    st.drag = { type: tr.dataset.type }; e.dataTransfer.effectAllowed = "copy"; e.dataTransfer.setData("text/plain", tr.dataset.type);
  });
  document.addEventListener("dragend", () => { st.drag = null; clearMarks(); document.querySelectorAll(".hw-dragging").forEach((x) => x.classList.remove("hw-dragging")); });
  grid.addEventListener("dragover", (e) => {
    if (!st.drag) return;
    const t = e.target.closest(".hw, [data-drop-end]"); if (!t) return;
    e.preventDefault(); clearMarks(); t.classList.add(t.matches(".hw") ? "hw-over" : "over");
  });
  grid.addEventListener("drop", (e) => {
    if (!st.drag) return;
    e.preventDefault();
    const t = e.target.closest(".hw, [data-drop-end]"), l = getLayout();
    const at = !t || t.matches("[data-drop-end]") ? l.length : l.findIndex((x) => x.id === t.dataset.id);
    const d = st.drag; st.drag = null; clearMarks();
    if (d.type) addWidget(d.type, at); else if (d.id && d.id !== t?.dataset.id) move(d.id, at);
  });

  // impostazioni del widget
  const dlg = H.$("#hw-cfg");
  dlg.addEventListener("input", (e) => {
    if (e.target.id !== "hcfg-q") return;
    const res = H.searchQuotes(e.target.value, 8).filter((q) => !q.dir);
    H.$("#hcfg-res").innerHTML = e.target.value.trim() ? (res.map((q) => `<li data-pick="${H.esc(q.symbol)}" role="button" tabindex="0"><div class="nm"><b>${H.esc(q.name)}</b><small>${H.esc(q.symbol)}</small></div><div class="px">${H.nf(q.price, H.pdec(q.price))}</div></li>`).join("")
      || '<li class="empty">Nessun titolo monitorato trovato.</li>') : "";
  });
  dlg.addEventListener("click", (e) => {
    const p = e.target.closest("[data-pick]"), rm = e.target.closest("[data-rm]");
    if (p) {
      if ("syms" in st.cfgDraft) { if (!st.cfgDraft.syms.includes(p.dataset.pick)) st.cfgDraft.syms.push(p.dataset.pick); renderChips(); }
      else { st.cfgDraft.sym = p.dataset.pick; H.$("#hcfg-cur").innerHTML = `Selezionato: <b>${H.esc(H.bySymbol(p.dataset.pick)?.name ?? p.dataset.pick)}</b>`; }
      H.$("#hcfg-q").value = ""; H.$("#hcfg-res").innerHTML = "";
    }
    if (rm) { st.cfgDraft.syms = st.cfgDraft.syms.filter((s) => s !== rm.dataset.rm); renderChips(); }
  });
  dlg.addEventListener("close", () => {
    if (dlg.returnValue !== "save" || !st.cfgId) return;
    const d = st.cfgDraft;
    if (H.$("#hcfg-range")) d.range = H.$("#hcfg-range").value;
    if (H.$("#hcfg-scope")) d.scope = H.$("#hcfg-scope").value;
    if (H.$("#hcfg-text")) d.title = H.$("#hcfg-text").value.trim();
    const id = st.cfgId; st.cfgId = null;
    update((l) => { l.find((x) => x.id === id).cfg = d; });
  });
}

// Profilo cambiato o dati importati: rilegge il layout salvato
export function reloadHome() { layout = null; if (document.querySelector("#tab-home.active")) renderHome(); }
