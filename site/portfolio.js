// Portafoglio personale: posizioni salvate nel browser, valori in euro, guadagni/perdite,
// ripartizione, andamento storico, importazione/esportazione e avvisi di prezzo.
import { loadHist } from "./detail.js";

let H; // helper dell'app (bySymbol, nf, pctHtml, esc, $, store, openDetail, searchQuotes, ask, setTab, config…)
const KEY = "portfolio";
const pf = { alloc: "type", range: 365, editId: null };

// ---------- archivio ----------
const load = () => { try { return JSON.parse(H.store.get(KEY, "[]")); } catch { return []; } };
const save = (l) => H.store.set(KEY, JSON.stringify(l));
export const positions = load;

// ---------- valute ----------
// Tasso EURxxx (unità di valuta per 1 euro) dalle quotazioni dei cambi
export function toEUR(amount, cur) {
  if (amount == null || !isFinite(amount)) return null;
  if (!cur || cur === "EUR") return amount;
  const r = H.bySymbol(`EUR${cur}=X`)?.price;
  return r ? amount / r : null;
}
const eur = (v, d = 2) => (v == null || !isFinite(v) ? "–" : `${H.nf(v, d)} €`);
const sign = (v) => (v > 0 ? "+" : "");
const pctCls = (v) => (v == null ? "" : v >= 0 ? "pos" : "neg");

// ---------- calcoli ----------
const TYPE_LABEL = { EQUITY: "Azioni", ETF: "ETF / ETC", INDEX: "Indici", FUTURE: "Materie prime", CURRENCY: "Valute", CRYPTOCURRENCY: "Cripto", MUTUALFUND: "Fondi" };

function rowsData() {
  const byId = new Map();
  for (const lot of load()) {
    const r = byId.get(lot.sym) ?? { sym: lot.sym, qty: 0, cost: 0, lots: [] };
    r.qty += lot.qty; r.cost += lot.qty * lot.price; r.lots.push(lot);
    byId.set(lot.sym, r);
  }
  return [...byId.values()].map((r) => {
    const q = H.bySymbol(r.sym);
    const cur = q?.currency ?? r.lots[0].cur ?? "EUR";
    const price = q?.price ?? null;
    const value = price != null ? toEUR(r.qty * price, cur) : null;
    const costEUR = toEUR(r.cost, cur); // costo convertito al cambio attuale
    const prev = q?.prevClose ?? (price != null && q?.changePct != null ? price / (1 + q.changePct / 100) : null);
    const dayEUR = price != null && prev != null ? toEUR(r.qty * (price - prev), cur) : null;
    return {
      ...r, q, cur, price, value, costEUR, avg: r.cost / r.qty,
      pl: value != null && costEUR != null ? value - costEUR : null,
      plPct: price != null ? (price / (r.cost / r.qty) - 1) * 100 : null,
      dayEUR, dayPct: q?.changePct ?? null,
    };
  }).sort((a, b) => (b.value ?? 0) - (a.value ?? 0));
}

function groupOf(r, by) {
  const q = r.q ?? {};
  if (by === "type") return TYPE_LABEL[q.type] ?? "Altro";
  if (by === "currency") return r.cur;
  if (by === "sector") return H.sectorOf(r.sym) ?? (TYPE_LABEL[q.type] && q.type !== "EQUITY" ? TYPE_LABEL[q.type] : "Non classificato");
  // area: gruppo del catalogo o regione della directory
  return q.region ? H.config.regions?.[q.region] ?? q.region : H.config.catalog?.[q.group]?.name ?? q.exchange ?? "Altro";
}

// Pesi attuali delle posizioni (per valore in euro) e valore totale, usati da Composizione e Laboratorio
export function positionWeights() {
  const rows = rowsData().filter((r) => r.value > 0);
  const tot = rows.reduce((s, r) => s + r.value, 0);
  return tot ? rows.map((r) => ({ sym: r.sym, w: r.value / tot })) : [];
}
export const positionsValue = () => rowsData().reduce((s, r) => s + (r.value ?? 0), 0);

// ---------- grafici ----------
const COLORS = ["#2563eb", "#059669", "#f59e0b", "#dc2626", "#7c3aed", "#0891b2", "#db2777", "#65a30d", "#ea580c", "#64748b"];
export function donut(parts) {
  const total = parts.reduce((s, p) => s + p.v, 0);
  if (!total) return "";
  let a = -Math.PI / 2;
  const R = 52, r = 32, cx = 60, cy = 60;
  const arcs = parts.map((p, i) => {
    const da = (p.v / total) * Math.PI * 2, a2 = a + da, large = da > Math.PI ? 1 : 0;
    const P = (ang, rad) => `${(cx + rad * Math.cos(ang)).toFixed(2)},${(cy + rad * Math.sin(ang)).toFixed(2)}`;
    const d = parts.length === 1
      ? `M${cx - R},${cy}A${R},${R} 0 1 1 ${cx + R},${cy}A${R},${R} 0 1 1 ${cx - R},${cy}M${cx - r},${cy}A${r},${r} 0 1 0 ${cx + r},${cy}A${r},${r} 0 1 0 ${cx - r},${cy}Z`
      : `M${P(a, R)}A${R},${R} 0 ${large} 1 ${P(a2, R)}L${P(a2, r)}A${r},${r} 0 ${large} 0 ${P(a, r)}Z`;
    a = a2;
    return `<path d="${d}" fill="${COLORS[i % COLORS.length]}" fill-rule="evenodd"><title>${H.esc(p.k)}: ${H.nf((p.v / total) * 100, 1)}%</title></path>`;
  }).join("");
  const legend = parts.map((p, i) => `<li><i style="background:${COLORS[i % COLORS.length]}"></i>${H.esc(p.k)}<b>${H.nf((p.v / total) * 100, 1)}%</b></li>`).join("");
  return `<svg viewBox="0 0 120 120" class="pf-donut" role="img" aria-label="Ripartizione">${arcs}</svg><ul class="pf-legend">${legend}</ul>`;
}

// Valore storico del portafoglio: per ogni data, quantità detenuta × ultima chiusura nota (cambio attuale).
// L'ultimo prezzo noto copre i giorni senza contrattazioni (fine settimana, festività locali).
async function history(rows, days) {
  const from = Date.now() / 1000 - days * 86400;
  const day = (t) => Math.floor(t / 86400) * 86400;
  const series = (await Promise.all(rows.filter((r) => r.q && !r.q.dir).map(async (r) => {
    const h = await loadHist(r.sym);
    const pts = (days > 400 ? h?.week : h?.day) ?? [];
    return { r, fx: toEUR(1, r.cur) ?? 0, closes: new Map(pts.map(([t, c]) => [day(t), c])) };
  }))).filter((x) => x.closes.size);
  const dates = [...new Set(series.flatMap((x) => [...x.closes.keys()]))].sort((a, b) => a - b);
  const last = new Map();
  const out = [];
  for (const d of dates) {
    let v = 0, any = false;
    for (const x of series) {
      if (x.closes.has(d)) last.set(x, x.closes.get(d));
      const held = x.r.lots.reduce((s, l) => s + (!l.date || Date.parse(l.date) / 1000 <= d + 86400 ? l.qty : 0), 0);
      if (held && last.has(x)) { v += held * last.get(x) * x.fx; any = true; }
    }
    if (any && d >= from) out.push([d, v]);
  }
  return out;
}

function lineSvg(pts) {
  if (pts.length < 2) return '<div class="empty">Storico non disponibile: aggiungi posizioni su titoli monitorati con data di acquisto.</div>';
  const W = 600, Hh = 160, vals = pts.map((p) => p[1]);
  const min = Math.min(...vals), max = Math.max(...vals), r = max - min || 1;
  const x = (i) => (i / (pts.length - 1)) * W, y = (v) => 8 + (1 - (v - min) / r) * (Hh - 16);
  const up = vals.at(-1) >= vals[0], col = `var(${up ? "--up" : "--down"})`;
  const d = pts.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(p[1]).toFixed(1)}`).join("");
  return `<svg viewBox="0 0 ${W} ${Hh}" preserveAspectRatio="none" class="pf-line" role="img" aria-label="Andamento del portafoglio">
    <path d="${d}L${W},${Hh}L0,${Hh}Z" fill="${col}" opacity=".12"/><path d="${d}" fill="none" stroke="${col}" stroke-width="2" vector-effect="non-scaling-stroke"/></svg>
    <div class="pf-line-ax"><span>${new Date(pts[0][0] * 1000).toLocaleDateString("it-IT", { day: "numeric", month: "short", year: "2-digit" })}</span>
    <span>min ${eur(min, 0)} · max ${eur(max, 0)}</span><span>${new Date(pts.at(-1)[0] * 1000).toLocaleDateString("it-IT", { day: "numeric", month: "short" })}</span></div>`;
}

// ---------- rendering ----------
export async function renderPortfolio() {
  const $ = H.$;
  const rows = rowsData();
  const total = rows.reduce((s, r) => s + (r.value ?? 0), 0);
  const cost = rows.reduce((s, r) => s + (r.costEUR ?? 0), 0);
  const day = rows.reduce((s, r) => s + (r.dayEUR ?? 0), 0);
  const pl = total - cost;
  $("#pf-empty").hidden = rows.length > 0;
  $("#pf-body").hidden = !rows.length;
  if (!rows.length) { renderAlerts(); return; }

  $("#pf-summary").innerHTML = `
    <div class="tile"><div class="n">Valore</div><div class="p">${eur(total)}</div></div>
    <div class="tile"><div class="n">Investito</div><div class="p">${eur(cost)}</div></div>
    <div class="tile"><div class="n">Guadagno / perdita</div><div class="p ${pctCls(pl)}">${sign(pl)}${eur(pl)}</div><span class="chg ${pctCls(pl)}">${sign(pl)}${H.nf(cost ? (pl / cost) * 100 : 0)}%</span></div>
    <div class="tile"><div class="n">Oggi</div><div class="p ${pctCls(day)}">${sign(day)}${eur(day)}</div><span class="chg ${pctCls(day)}">${sign(day)}${H.nf(total - day ? (day / (total - day)) * 100 : 0)}%</span></div>`;

  $("#pf-rows").innerHTML = rows.map((r) => `
    <tr data-sym="${H.esc(r.sym)}">
      <td><b>${H.esc(r.q?.name ?? r.sym)}</b>
        <small>${H.nf(r.qty, r.qty % 1 ? 4 : 0)} × ${H.nf(r.avg, r.avg < 10 ? 4 : 2)} → ${r.price != null ? H.nf(r.price, r.price < 10 ? 4 : 2) : "–"} ${H.esc(r.cur)} ${H.pctHtml(r.dayPct)}</small></td>
      <td>${eur(r.value)}<small>${total && r.value ? H.nf((r.value / total) * 100, 1) : "–"}%</small></td>
      <td class="${pctCls(r.pl)}">${r.pl != null ? `${sign(r.pl)}${eur(r.pl, Math.abs(r.pl) >= 1000 ? 0 : 2)}` : "–"}<small>${r.plPct != null ? `${sign(r.plPct)}${H.nf(r.plPct)}%` : ""}</small></td>
      <td><button class="icon-btn pf-edit" data-edit="${H.esc(r.sym)}" aria-label="Modifica ${H.esc(r.sym)}">✎</button></td>
    </tr>`).join("");
  $("#pf-note").textContent = `Valori in euro al cambio attuale${rows.some((r) => r.value == null) ? "; alcune posizioni non hanno un prezzo o un cambio disponibile" : ""}. Il guadagno percentuale di ogni posizione è nella sua valuta.`;

  const groups = new Map();
  for (const r of rows) if (r.value) groups.set(groupOf(r, pf.alloc), (groups.get(groupOf(r, pf.alloc)) ?? 0) + r.value);
  const parts = [...groups.entries()].map(([k, v]) => ({ k, v })).sort((a, b) => b.v - a.v);
  $("#pf-alloc").innerHTML = donut(parts.length > 9 ? [...parts.slice(0, 8), { k: "Altro", v: parts.slice(8).reduce((s, p) => s + p.v, 0) }] : parts);

  $("#pf-hist").innerHTML = '<div class="empty">Calcolo dell\'andamento…</div>';
  history(rows, pf.range).then((pts) => { $("#pf-hist").innerHTML = lineSvg(pts); });
  renderAlerts();
}

// ---------- dialog posizione ----------
function openForm({ sym = "", id = null } = {}) {
  const $ = H.$;
  const dlg = $("#pf-dialog");
  pf.editId = id;
  const lot = id ? load().find((l) => l.id === id) : null;
  const q = H.bySymbol(lot?.sym ?? sym);
  $("#pf-sym").value = lot?.sym ?? sym;
  $("#pf-sym-name").textContent = q ? `${q.name} · ${q.currency ?? ""}` : "";
  $("#pf-qty").value = lot?.qty ?? "";
  $("#pf-price").value = lot?.price ?? (q?.price != null ? +q.price.toPrecision(6) : "");
  $("#pf-date").value = lot?.date ?? new Date().toISOString().slice(0, 10);
  $("#pf-delete").hidden = !id;
  $("#pf-sym-results").innerHTML = "";
  dlg.showModal();
  (lot || sym ? $("#pf-qty") : $("#pf-sym")).focus();
}

function lotsDialog(sym) {
  const lots = load().filter((l) => l.sym === sym);
  if (lots.length === 1) return openForm({ id: lots[0].id });
  const $ = H.$;
  $("#pf-lots-title").textContent = `Acquisti di ${H.bySymbol(sym)?.name ?? sym}`;
  $("#pf-lots").dataset.sym = sym;
  $("#pf-lots-list").innerHTML = lots.map((l) => `<li><button type="button" class="ghost" data-lot="${l.id}">${H.esc(l.date || "senza data")} · ${H.nf(l.qty, l.qty % 1 ? 4 : 0)} × ${H.nf(l.price, 4)}</button></li>`).join("");
  $("#pf-lots").showModal();
}

// ---------- import / export ----------
function download(name, text, type) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([text], { type }));
  a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
function exportCSV() {
  const lines = [["simbolo", "quantita", "prezzo_carico", "valuta", "data"].join(";"),
    ...load().map((l) => [l.sym, l.qty, l.price, l.cur ?? "", l.date ?? ""].join(";"))];
  download(`portafoglio-${new Date().toISOString().slice(0, 10)}.csv`, lines.join("\n"), "text/csv");
}
async function importText(text) {
  let lots = [];
  try {
    let j = JSON.parse(text);
    if (j.encrypted) { j = await H.openImport(j.encrypted); if (!j) return; } // file cifrato: serve la password
    lots = (Array.isArray(j) ? j : j.positions ?? []).map((l) => ({ sym: l.sym ?? l.symbol, qty: +l.qty, price: +l.price, cur: l.cur, date: l.date }));
  } catch {
    const rows = text.trim().split(/\r?\n/).map((l) => l.split(/[;,\t]/).map((x) => x.trim()));
    const head = rows[0].map((h) => h.toLowerCase());
    const has = head.some((h) => /simbolo|symbol/.test(h));
    const idx = (re, d) => { const i = head.findIndex((h) => re.test(h)); return has && i >= 0 ? i : d; };
    const [is, iq, ip, ic, id] = [idx(/simbolo|symbol/, 0), idx(/quant|qty/, 1), idx(/prezzo|price/, 2), idx(/valuta|curr/, 3), idx(/data|date/, 4)];
    lots = rows.slice(has ? 1 : 0).map((r) => ({ sym: r[is], qty: +String(r[iq]).replace(",", "."), price: +String(r[ip]).replace(",", "."), cur: r[ic] || undefined, date: r[id] || undefined }));
  }
  lots = lots.filter((l) => l.sym && l.qty > 0 && l.price >= 0).map((l) => ({ ...l, sym: l.sym.toUpperCase(), id: crypto.randomUUID() }));
  if (!lots.length) { alert("Nessuna posizione valida trovata nel file."); return; }
  const replace = confirm(`Trovate ${lots.length} posizioni.\nOK = sostituisci il portafoglio attuale · Annulla = aggiungi alle posizioni esistenti`);
  save(replace ? lots : [...load(), ...lots]);
  H.ensureQuotes(lots.map((l) => l.sym)).then(renderPortfolio);
}

// ---------- avvisi di prezzo ----------
const OPS = { above: "sopra", below: "sotto", up: "variazione giornaliera ≥ +", down: "variazione giornaliera ≤ −" };
let alertsData = null;
async function loadAlerts() {
  alertsData ??= fetch(`alerts.json?t=${Math.floor(Date.now() / 60000)}`).then((r) => (r.ok ? r.json() : { alerts: [] })).catch(() => ({ alerts: [] }));
  return alertsData;
}
function alertText(a) {
  const q = H.bySymbol(a.symbol);
  const v = a.op === "up" || a.op === "down" ? `${H.nf(a.value, 1)}%` : `${H.nf(a.value, a.value < 10 ? 4 : 2)} ${q?.currency ?? ""}`;
  return `${q?.name ?? a.symbol} ${OPS[a.op] ?? a.op}${a.op === "up" || a.op === "down" ? "" : " "}${v}`;
}
async function renderAlerts() {
  const $ = H.$;
  const { alerts = [] } = await loadAlerts();
  $("#al-list").innerHTML = alerts.length ? alerts.map((a) => {
    const q = H.bySymbol(a.symbol);
    let dist = "";
    if (q?.price != null && (a.op === "above" || a.op === "below")) dist = `prezzo attuale ${H.nf(q.price, q.price < 10 ? 4 : 2)} (${sign(a.value / q.price - 1)}${H.nf((a.value / q.price - 1) * 100, 1)}% dalla soglia)`;
    if (q?.changePct != null && (a.op === "up" || a.op === "down")) dist = `oggi ${sign(q.changePct)}${H.nf(q.changePct)}%`;
    return `<li class="${a.triggeredAt ? "done" : ""}" data-sym="${H.esc(a.symbol)}">
      <div class="nm"><b>${a.triggeredAt ? "🔔" : "⏳"} ${H.esc(alertText(a))}</b>
      <small>${a.triggeredAt ? `scattato il ${new Date(a.triggeredAt).toLocaleString("it-IT")}` : `attivo · ${dist}`}</small></div>
      <button class="ghost" data-del-alert="${H.esc(a.id)}">Rimuovi</button></li>`;
  }).join("") : '<li class="empty">Nessun avviso. Apri un titolo e tocca 🔔 per crearne uno.</li>';
}
export function openAlertForm(sym) {
  const $ = H.$;
  const q = H.bySymbol(sym);
  $("#al-sym").textContent = q ? `${q.name} (${sym}) · ${H.nf(q.price, q.price < 10 ? 4 : 2)} ${q.currency ?? ""}` : sym;
  $("#al-dialog").dataset.sym = sym;
  $("#al-op").value = "below";
  $("#al-value").value = q?.price != null ? +(q.price * 0.95).toPrecision(5) : "";
  $("#al-dialog").showModal();
}

// ---------- inizializzazione ----------
export function initPortfolio(helpers) {
  H = helpers;
  const $ = H.$;
  $("#pf-add").addEventListener("click", () => openForm());
  $("#pf-add-empty").addEventListener("click", () => openForm());
  $("#pf-rows").addEventListener("click", (e) => {
    const ed = e.target.closest("[data-edit]");
    if (ed) { e.stopPropagation(); lotsDialog(ed.dataset.edit); return; }
    const tr = e.target.closest("tr[data-sym]");
    if (tr) H.openDetail(tr.dataset.sym, H.bySymbol(tr.dataset.sym));
  });
  $("#pf-lots-list").addEventListener("click", (e) => { const b = e.target.closest("[data-lot]"); if (b) { $("#pf-lots").close(); openForm({ id: b.dataset.lot }); } });
  $("#pf-lots-add").addEventListener("click", () => { const sym = $("#pf-lots").dataset.sym; $("#pf-lots").close(); openForm({ sym }); });

  // ricerca del simbolo nel modulo
  $("#pf-sym").addEventListener("input", (e) => {
    const res = e.target.value.trim().length > 1 ? H.searchQuotes(e.target.value, 6) : [];
    $("#pf-sym-results").innerHTML = res.map((q) => `<li><button type="button" data-pick="${H.esc(q.symbol)}">${H.esc(q.name)} <small>${H.esc(q.symbol)} · ${H.nf(q.price)} ${H.esc(q.currency ?? "")}</small></button></li>`).join("");
  });
  $("#pf-sym").addEventListener("focus", () => H.ensureDirectory());
  $("#pf-sym-results").addEventListener("click", (e) => {
    const b = e.target.closest("[data-pick]"); if (!b) return;
    const q = H.bySymbol(b.dataset.pick);
    $("#pf-sym").value = b.dataset.pick;
    $("#pf-sym-name").textContent = q ? `${q.name} · ${q.currency ?? ""}` : "";
    if (q?.price != null && !$("#pf-price").value) $("#pf-price").value = +q.price.toPrecision(6);
    $("#pf-sym-results").innerHTML = "";
    $("#pf-qty").focus();
  });
  $("#pf-dialog").addEventListener("close", () => {
    const rv = $("#pf-dialog").returnValue;
    const list = load();
    if (rv === "delete" && pf.editId) save(list.filter((l) => l.id !== pf.editId));
    if (rv === "save") {
      const sym = $("#pf-sym").value.trim().toUpperCase();
      const qty = +$("#pf-qty").value, price = +$("#pf-price").value;
      if (!sym || !(qty > 0) || !(price >= 0)) { alert("Indica simbolo, quantità e prezzo di carico."); return; }
      const lot = { id: pf.editId ?? crypto.randomUUID(), sym, qty, price, date: $("#pf-date").value || undefined, cur: H.bySymbol(sym)?.currency };
      save(pf.editId ? list.map((l) => (l.id === pf.editId ? lot : l)) : [...list, lot]);
    }
    pf.editId = null;
    renderPortfolio();
  });
  H.seg("#pf-alloc-by", (v) => { pf.alloc = v; renderPortfolio(); });
  H.seg("#pf-range", (v) => { pf.range = +v; renderPortfolio(); });
  $("#pf-export-json").addEventListener("click", () => download(`portafoglio-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify({ app: "BortEconomy", exported: new Date().toISOString(), positions: load() }, null, 2), "application/json"));
  $("#pf-export-csv").addEventListener("click", exportCSV);
  $("#pf-export-enc").addEventListener("click", async () => {
    const box = await H.sealExport({ app: "BortEconomy", exported: new Date().toISOString(), positions: load() });
    if (box) download(`portafoglio-${new Date().toISOString().slice(0, 10)}-cifrato.json`, JSON.stringify({ app: "BortEconomy", encrypted: box }), "application/json");
  });
  for (const id of ["#pf-import", "#pf-import-empty"]) {
    $(id).addEventListener("change", async (e) => { const f = e.target.files[0]; if (f) importText(await f.text()); e.target.value = ""; });
  }
  $("#pf-ask").addEventListener("click", () => {
    if (!H.confirmShare("le tue posizioni (titoli, quantità, prezzi di carico e valori)")) return;
    const rows = rowsData(), total = rows.reduce((s, r) => s + (r.value ?? 0), 0);
    const lines = rows.map((r) => `- ${r.q?.name ?? r.sym} (${r.sym}): ${H.nf(r.qty, 4)} a ${H.nf(r.avg, 4)} ${r.cur}, prezzo ${H.nf(r.price, 4)}, valore ${eur(r.value)} (${total ? H.nf((r.value / total) * 100, 1) : 0}%), P/L ${r.plPct != null ? H.nf(r.plPct) : "–"}%`).join("\n");
    H.setTab("ai");
    H.ask(`Analizza il mio portafoglio (valore totale ${eur(total)}):\n${lines}\n\nValuta diversificazione per area, settore e valuta, rischi di concentrazione, esposizione ai temi di mercato attuali e notizie rilevanti sulle posizioni. Considerazioni generali, non consigli personalizzati.`);
  });

  // avvisi
  $("#al-list").addEventListener("click", (e) => {
    const b = e.target.closest("[data-del-alert]");
    if (b) { e.stopPropagation(); H.openIssue(`Rimuovi avviso: ${b.dataset.delAlert}`, "Richiesta inviata da BortEconomy."); return; }
    const li = e.target.closest("li[data-sym]"); if (li) H.openDetail(li.dataset.sym, H.bySymbol(li.dataset.sym));
  });
  $("#al-dialog").addEventListener("close", () => {
    if ($("#al-dialog").returnValue !== "save") return;
    const sym = $("#al-dialog").dataset.sym, op = $("#al-op").value, value = +String($("#al-value").value).replace(",", ".");
    if (!(value > 0)) { alert("Indica un valore valido."); return; }
    H.openIssue(`Avviso prezzo: ${sym} ${op} ${value}`, `Richiesta inviata da BortEconomy.\n\nTitolo: ${sym}\nCondizione: ${OPS[op]} ${value}`);
  });
  $("#al-op").addEventListener("change", () => {
    const q = H.bySymbol($("#al-dialog").dataset.sym), op = $("#al-op").value;
    $("#al-value").value = op === "up" || op === "down" ? 3 : q?.price != null ? +(q.price * (op === "above" ? 1.05 : 0.95)).toPrecision(5) : "";
    $("#al-unit").textContent = op === "up" || op === "down" ? "%" : q?.currency ?? "";
  });
}
export { openForm as openPositionForm };
