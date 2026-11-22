// Composizione del portafoglio (quote percentuali) e Laboratorio macro: andamento storico del mix,
// rischio, correlazioni, sensibilità a tassi/inflazione/cambio/materie prime, scenari e stress test.
import { loadHist } from "./detail.js";

let H;
const KEY = "composition";
const lab = { period: 260, source: "model", shocks: {}, macro: null };
const WEEK = 7 * 86400;
const BENCH = "SWDA.MI";

// ---------- archivio ----------
export const model = {
  get() { try { return JSON.parse(H.store.get(KEY, "null")) ?? { capital: 10000, items: [] }; } catch { return { capital: 10000, items: [] }; } },
  set(m) { H.store.set(KEY, JSON.stringify(m)); },
};

const PRESETS = [
  ["Tutto azionario mondo", [["VWCE.MI", 100]]],
  ["60/40 globale", [["SWDA.MI", 60], ["AGGH.MI", 40]]],
  ["Prudente", [["VWCE.MI", 30], ["XGLE.MI", 40], ["IBCI.MI", 10], ["XEON.MI", 20]]],
  ["All weather semplificato", [["SWDA.MI", 30], ["IBGL.MI", 40], ["IBGM.MI", 15], ["SGLD.MI", 7.5], ["CMOD.MI", 7.5]]],
  ["Crescita", [["CSSPX.MI", 50], ["SMEA.MI", 20], ["EIMI.MI", 15], ["CSNDX.MI", 15]]],
];

// ---------- metadati: classe e area ----------
let etfMeta = null;
function meta(sym) {
  etfMeta ??= new Map((H.config.etfs?.groups ?? []).flatMap((g) => g.items.map((i) => [i.s, i])));
  const e = etfMeta.get(sym);
  if (e) return { cls: e.cls, reg: e.reg };
  const q = H.bySymbol(sym) ?? {};
  const cls = q.type === "CRYPTOCURRENCY" ? "Cripto" : q.type === "FUTURE" ? (/^(GC|SI|PL|PA)=F/.test(sym) ? "Oro e metalli" : "Materie prime")
    : q.type === "CURRENCY" ? "Valute" : q.type === "ETF" ? "ETF" : "Azioni";
  const reg = q.region ? H.config.regions?.[q.region] : H.config.catalog?.[q.group]?.name ?? "Altro";
  return { cls, reg };
}

// ---------- serie settimanali ----------
// Chiave della settimana (giorno del lunedì). Si aggiunge un giorno perché le barre settimanali di future e
// cambi iniziano la domenica sera (UTC), quelle delle borse il lunedì: così cadono nella stessa settimana.
const weekKey = (t0) => { const t = t0 + 86400, d = new Date(t * 1000); return Math.floor((t - ((d.getUTCDay() + 6) % 7) * 86400) / 86400); };
async function weekly(sym) {
  const h = await loadHist(sym);
  const m = new Map();
  for (const [t, c] of h?.week ?? []) m.set(weekKey(t), c);
  return m;
}
// rendimenti settimanali (%) sulle settimane comuni a tutte le serie
function returns(maps, keys) {
  return maps.map((m) => keys.slice(1).map((k, i) => (m.get(k) / m.get(keys[i]) - 1) * 100));
}
const commonKeys = (maps) => [...maps[0].keys()].filter((k) => maps.every((m) => m.has(k))).sort((a, b) => a - b);

// ---------- statistica ----------
const mean = (a) => a.reduce((s, v) => s + v, 0) / a.length;
const std = (a) => { const m = mean(a); return Math.sqrt(a.reduce((s, v) => s + (v - m) ** 2, 0) / (a.length - 1)); };
function corr(a, b) { const ma = mean(a), mb = mean(b); let n = 0, da = 0, db = 0; for (let i = 0; i < a.length; i++) { n += (a[i] - ma) * (b[i] - mb); da += (a[i] - ma) ** 2; db += (b[i] - mb) ** 2; } return n / Math.sqrt(da * db); }
// minimi quadrati multivariati (con intercetta) via equazioni normali
function ols(y, X) {
  const n = y.length, k = X.length + 1;
  const row = (i) => [1, ...X.map((x) => x[i])];
  const A = Array.from({ length: k }, () => new Array(k).fill(0)), b = new Array(k).fill(0);
  for (let i = 0; i < n; i++) { const r = row(i); for (let p = 0; p < k; p++) { b[p] += r[p] * y[i]; for (let q = 0; q < k; q++) A[p][q] += r[p] * r[q]; } }
  for (let p = 0; p < k; p++) A[p][p] += 1e-9; // stabilità numerica
  for (let c = 0; c < k; c++) { // eliminazione di Gauss con pivot
    let piv = c; for (let r = c + 1; r < k; r++) if (Math.abs(A[r][c]) > Math.abs(A[piv][c])) piv = r;
    [A[c], A[piv]] = [A[piv], A[c]]; [b[c], b[piv]] = [b[piv], b[c]];
    for (let r = 0; r < k; r++) if (r !== c) { const f = A[r][c] / A[c][c]; for (let q = c; q < k; q++) A[r][q] -= f * A[c][q]; b[r] -= f * b[c]; }
  }
  const beta = b.map((v, i) => v / A[i][i]);
  const fit = y.map((_, i) => row(i).reduce((s, v, j) => s + v * beta[j], 0));
  const my = mean(y), ssTot = y.reduce((s, v) => s + (v - my) ** 2, 0), ssRes = y.reduce((s, v, i) => s + (v - fit[i]) ** 2, 0);
  return { beta: beta.slice(1), r2: ssTot ? 1 - ssRes / ssTot : 0 };
}

// ---------- grafici ----------
function lines(series, { pct = false } = {}) {
  const all = series.flatMap((s) => s.pts.map((p) => p[1]));
  if (!all.length) return '<div class="empty">Dati insufficienti.</div>';
  const W = 640, Hh = 190, min = Math.min(...all), max = Math.max(...all), r = max - min || 1;
  const n = Math.max(...series.map((s) => s.pts.length));
  const x = (i) => (i / (n - 1)) * W, y = (v) => 8 + (1 - (v - min) / r) * (Hh - 16);
  const paths = series.map((s) => `<path d="${s.pts.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(p[1]).toFixed(1)}`).join("")}" fill="none" stroke="${s.color}" stroke-width="${s.w ?? 2}" vector-effect="non-scaling-stroke" ${s.dash ? 'stroke-dasharray="5 4"' : ""}/>`).join("");
  const base = pct ? "" : `<line x1="0" x2="${W}" y1="${y(100)}" y2="${y(100)}" stroke="var(--muted)" stroke-dasharray="3 4" opacity=".5" vector-effect="non-scaling-stroke"/>`;
  const p0 = series[0].pts;
  return `<svg viewBox="0 0 ${W} ${Hh}" preserveAspectRatio="none" class="lab-line" role="img">${base}${paths}</svg>
    <div class="pf-line-ax"><span>${new Date(p0[0][0] * 1000).toLocaleDateString("it-IT", { month: "short", year: "numeric" })}</span>
    <span>${series.map((s) => `<i style="background:${s.color}"></i>${H.esc(s.name)}`).join(" ")}</span>
    <span>${new Date(p0.at(-1)[0] * 1000).toLocaleDateString("it-IT", { month: "short", year: "numeric" })}</span></div>`;
}
function miniLine(data, color = "var(--accent)") {
  if (data.length < 2) return "";
  const v = data.map((d) => d[1]), min = Math.min(...v), max = Math.max(...v), r = max - min || 1;
  const pts = v.map((val, i) => `${((i / (v.length - 1)) * 100).toFixed(2)},${(28 - ((val - min) / r) * 26).toFixed(2)}`).join(" ");
  return `<svg viewBox="0 0 100 30" preserveAspectRatio="none" aria-hidden="true"><polyline points="${pts}" fill="none" stroke="${color}" stroke-width="2" vector-effect="non-scaling-stroke"/></svg>`;
}
// Nome leggibile: nome completo senza sigle tecniche degli ETF
const niceName = (sym) => { const q = H.bySymbol(sym); return String(q?.longName || q?.name || sym)
  .replace(/\b(UCITS|ETF|ETC|\(Acc\)|\(Dist\)|Acc|Dist|Accumulation|Distributing|PLC|II|VII|1C)\b/g, "").replace(/\s+-\s+/g, " ").replace(/\s{2,}/g, " ").trim(); };
const pctTxt = (v, d = 1) => (v == null || !isFinite(v) ? "–" : `${v >= 0 ? "+" : ""}${H.nf(v, d)}%`);
const cls = (v) => (v == null ? "" : v >= 0 ? "pos" : "neg");
const eur = (v) => (v == null || !isFinite(v) ? "–" : `${H.nf(v, Math.abs(v) >= 1000 ? 0 : 2)} €`);

// pesi della composizione (normalizzati) e pesi in uso nel Laboratorio (composizione o posizioni reali)
function modelWeights() {
  const m = model.get();
  const tot = m.items.reduce((s, i) => s + (+i.w || 0), 0);
  return tot ? m.items.filter((i) => +i.w > 0).map((i) => ({ sym: i.sym, w: +i.w / tot })) : [];
}
const activeWeights = () => (lab.source === "positions" ? H.positionWeights() : modelWeights());

// =====================================================================
// COMPOSIZIONE
// =====================================================================
export async function renderComposition() {
  const $ = H.$, m = model.get();
  const tot = m.items.reduce((s, i) => s + (+i.w || 0), 0);
  $("#cp-capital").value = m.capital || "";
  $("#cp-presets").innerHTML = PRESETS.map(([n], i) => `<button data-preset="${i}">${H.esc(n)}</button>`).join("") + '<button data-preset="pos">Dalle mie posizioni</button>';
  $("#cp-rows").innerHTML = m.items.map((it, i) => {
    const q = H.bySymbol(it.sym), mt = meta(it.sym);
    return `<tr><td data-open="${H.esc(it.sym)}"><b>${H.esc(q ? niceName(it.sym) : it.sym)}</b><small>${H.esc(it.sym)} · ${H.esc(mt.cls)}</small></td>
      <td><input class="cp-w" data-i="${i}" type="number" min="0" max="100" step="0.5" inputmode="decimal" value="${it.w}" aria-label="Peso di ${H.esc(it.sym)}"><span>%</span></td>
      <td>${tot && m.capital ? eur((m.capital * it.w) / tot) : "–"}</td>
      <td><button class="icon-btn" data-del="${i}" aria-label="Rimuovi ${H.esc(it.sym)}">✕</button></td></tr>`;
  }).join("") || '<tr><td colspan="4" class="empty">Aggiungi gli asset che possiedi (ETF, indici, azioni, oro…) con il loro peso, oppure parti da un modello qui sopra.</td></tr>';
  const ok = Math.abs(tot - 100) < 0.01;
  $("#cp-total").innerHTML = m.items.length ? `Totale <b class="${ok ? "pos" : "neg"}">${H.nf(tot, 1)}%</b>${ok ? "" : ' · <button class="ghost" id="cp-norm">Riporta a 100%</button>'}` : "";
  $("#cp-results").hidden = !m.items.length;
  if (m.items.length) await renderBacktest();
}

async function renderBacktest() {
  const $ = H.$;
  const ws = modelWeights();
  if (!ws.length) return;
  const maps = await Promise.all([...ws.map((w) => weekly(w.sym)), weekly(BENCH)]);
  const missing = ws.filter((_, i) => !maps[i].size).map((w) => w.sym);
  const valid = ws.filter((_, i) => maps[i].size);
  const vMaps = maps.slice(0, -1).filter((mm) => mm.size);
  if (!valid.length) { $("#cp-chart").innerHTML = '<div class="empty">Storico non disponibile per questi asset.</div>'; return; }
  let keys = commonKeys(vMaps);
  if (lab.period) keys = keys.slice(-lab.period - 1);
  const wsum = valid.reduce((s, w) => s + w.w, 0);
  const R = returns(vMaps, keys);
  const port = keys.slice(1).map((_, t) => valid.reduce((s, w, i) => s + (w.w / wsum) * R[i][t], 0));
  let v = 100; const idx = [[keys[0] * 86400, 100], ...port.map((r, t) => [keys[t + 1] * 86400, (v *= 1 + r / 100)])];
  const bm = maps.at(-1), bBase = bm.get(keys.find((k) => bm.has(k)));
  const bIdx = keys.filter((k) => bm.has(k)).map((k) => [k * 86400, (100 * bm.get(k)) / bBase]);
  const years = (keys.length - 1) / 52.18;
  let peak = 100, mdd = 0; for (const [, x] of idx) { peak = Math.max(peak, x); mdd = Math.min(mdd, (x / peak - 1) * 100); }
  const totalR = idx.at(-1)[1] - 100, cagr = (Math.pow(idx.at(-1)[1] / 100, 1 / years) - 1) * 100, vol = std(port) * Math.sqrt(52);
  const cap = model.get().capital;
  $("#cp-note").textContent = `${keys.length - 1} settimane (${H.nf(years, 1)} anni) comuni a tutti gli asset, pesi ribilanciati ogni settimana, rendimenti in euro dei prezzi (dividendi inclusi solo negli ETF ad accumulo)${missing.length ? ` · senza storico: ${missing.join(", ")}` : ""}.`;
  $("#cp-chart").innerHTML = lines([{ name: "Il tuo portafoglio", color: "var(--accent)", pts: idx, w: 2.5 }, { name: "MSCI World (SWDA)", color: "var(--muted)", pts: bIdx, dash: true }]);
  $("#cp-metrics").innerHTML = [
    ["Rendimento totale", `<span class="${cls(totalR)}">${pctTxt(totalR)}</span>`, cap ? `${eur((cap * totalR) / 100)} su ${eur(cap)}` : ""],
    ["Rendimento annuo", `<span class="${cls(cagr)}">${pctTxt(cagr)}</span>`, "medio composto"],
    ["Volatilità annua", `${H.nf(vol, 1)}%`, vol < 6 ? "bassa" : vol < 12 ? "media" : vol < 18 ? "alta" : "molto alta"],
    ["Massimo ribasso", `<span class="neg">${pctTxt(mdd)}</span>`, cap ? eur((cap * mdd) / 100) : "dal massimo precedente"],
    ["Rendimento / rischio", H.nf(vol ? cagr / vol : 0, 2), "rendimento annuo diviso volatilità"],
  ].map(([k, val, sub]) => `<div class="tile"><div class="n">${k}</div><div class="p">${val}</div><small>${H.esc(sub)}</small></div>`).join("");
  // ripartizione
  const by = (f) => { const g = new Map(); for (const w of ws) g.set(f(w.sym), (g.get(f(w.sym)) ?? 0) + w.w); return [...g.entries()].map(([k, v2]) => ({ k, v: v2 })).sort((a, b) => b.v - a.v); };
  $("#cp-alloc-cls").innerHTML = H.donut(by((s) => meta(s).cls));
  $("#cp-alloc-reg").innerHTML = H.donut(by((s) => meta(s).reg ?? "Altro"));
  // correlazioni
  if (valid.length > 1) {
    const names = valid.map((w) => w.sym.replace(/\.(MI|DE|AS|PA|L)$/, ""));
    $("#cp-corr").innerHTML = `<table class="cp-corr"><tr><th></th>${names.map((n) => `<th>${H.esc(n)}</th>`).join("")}</tr>${R.map((a, i) => `<tr><th>${H.esc(names[i])}</th>${R.map((b, j) => {
      const c = i === j ? 1 : corr(a, b);
      return `<td style="background:${c >= 0 ? `rgb(99 102 241 / ${(c * 0.55).toFixed(2)})` : `rgb(16 185 129 / ${(-c * 0.55).toFixed(2)})`}">${H.nf(c, 2)}</td>`;
    }).join("")}</tr>`).join("")}</table>`;
    $("#cp-corr-wrap").hidden = false;
  } else $("#cp-corr-wrap").hidden = true;
}

// =====================================================================
// LABORATORIO
// =====================================================================
async function loadMacro() {
  lab.macro ??= fetch(`data/macro.json?t=${Math.floor(Date.now() / 3600e3)}`).then((r) => (r.ok ? r.json() : null)).catch(() => null);
  return lab.macro;
}

async function factorSeries() {
  const F = H.config.factors;
  const out = {};
  for (const [k, f] of Object.entries(F)) {
    if (Array.isArray(f.s)) { const [a, b] = await Promise.all(f.s.map(weekly)); out[k] = { pair: [a, b], f }; }
    else out[k] = { map: await weekly(f.s), f };
  }
  return out;
}
// variazione settimanale di un fattore tra due chiavi
function fChange(fs, k0, k1) {
  const f = fs.f;
  if (fs.pair) { const [a, b] = fs.pair; return ((a.get(k1) / a.get(k0) - 1) - (b.get(k1) / b.get(k0) - 1)) * 100; }
  return f.diff ? fs.map.get(k1) - fs.map.get(k0) : (fs.map.get(k1) / fs.map.get(k0) - 1) * 100;
}
const hasF = (fs, k) => (fs.pair ? fs.pair.every((m) => m.has(k)) : fs.map.has(k));

let sens = null; // { factors, port: {beta, r2}, assets: [{sym, w, beta}], n }
async function computeSensitivity(ws) {
  const fsAll = await factorSeries();
  const fKeys = Object.keys(fsAll);
  const maps = await Promise.all(ws.map((w) => weekly(w.sym)));
  const valid = ws.map((w, i) => ({ ...w, m: maps[i] })).filter((x) => x.m.size);
  const keys = [...valid[0]?.m.keys() ?? []].filter((k) => valid.every((x) => x.m.has(k)) && fKeys.every((f) => hasF(fsAll[f], k))).sort((a, b) => a - b).slice(-261);
  if (keys.length < 40) return null;
  const X = fKeys.map((f) => keys.slice(1).map((k, i) => fChange(fsAll[f], keys[i], k)));
  const wsum = valid.reduce((s, x) => s + x.w, 0);
  const assets = valid.map((x) => {
    const y = keys.slice(1).map((k, i) => (x.m.get(k) / x.m.get(keys[i]) - 1) * 100);
    return { sym: x.sym, w: x.w / wsum, y, ...ols(y, X) };
  });
  const yP = keys.slice(1).map((_, t) => assets.reduce((s, a) => s + a.w * a.y[t], 0));
  const port = ols(yP, X);
  return { factors: fKeys, port, assets, n: keys.length - 1, from: keys[0] };
}

const shockValue = (k, v) => (H.config.factors[k].scale ? v * H.config.factors[k].scale : v);

function renderScenario() {
  const $ = H.$;
  if (!sens) return;
  const cap = lab.source === "model" ? model.get().capital : H.positionsValue();
  const impact = (beta) => sens.factors.reduce((s, k, i) => s + beta[i] * shockValue(k, lab.shocks[k] ?? 0), 0);
  const tot = sens.assets.reduce((s, a) => s + a.w * impact(a.beta), 0);
  $("#lab-result").innerHTML = `<div class="lab-big ${cls(tot)}">${pctTxt(tot, 1)}</div><small>${cap ? `circa ${eur((cap * tot) / 100)} su ${eur(cap)}` : ""}</small>`;
  const contrib = sens.assets.map((a) => ({ sym: a.sym, v: a.w * impact(a.beta) })).sort((a, b) => Math.abs(b.v) - Math.abs(a.v));
  const mx = Math.max(0.01, ...contrib.map((c) => Math.abs(c.v)));
  $("#lab-contrib").innerHTML = contrib.map((c) => `<li><span>${H.esc(niceName(c.sym))}</span>
    <span class="lab-bar"><i class="${cls(c.v)}" style="width:${((Math.abs(c.v) / mx) * 100).toFixed(1)}%"></i></span><b class="${cls(c.v)}">${pctTxt(c.v, 2)}</b></li>`).join("");
  for (const k of sens.factors) { const el = document.querySelector(`#lab-sl-${k} output`); if (el) el.textContent = `${(lab.shocks[k] ?? 0) > 0 ? "+" : ""}${H.nf(lab.shocks[k] ?? 0, H.config.factors[k].step < 1 ? 2 : 0)} ${H.config.factors[k].unit}`; }
}

const SCENARIOS = [
  ["Rialzo dei tassi", { rates: 1, equity: -6, eurusd: 2 }],
  ["Taglio dei tassi", { rates: -1, equity: 6, gold: 4, eurusd: -2 }],
  ["Inflazione persistente", { inflation: 1, rates: 0.75, oil: 25, equity: -8, gold: 8 }],
  ["Recessione", { equity: -25, rates: -1.25, oil: -35, gold: 10, inflation: -0.5, eurusd: -5 }],
  ["Euro forte", { eurusd: 10 }],
  ["Crisi energetica", { oil: 50, inflation: 0.75, equity: -10, gold: 10, eurusd: -4 }],
  ["Rally azionario", { equity: 20, rates: 0.25, oil: 10 }],
];
const STRESS = [
  ["Calo di fine 2018", "2018-09-20", "2018-12-24"],
  ["Crollo Covid", "2020-02-19", "2020-03-23"],
  ["Ripresa post-Covid", "2020-03-23", "2021-03-23"],
  ["Rialzo dei tassi 2022", "2022-01-03", "2022-10-12"],
  ["Shock dei dazi 2025", "2025-03-28", "2025-04-11"],
  ["Ultimi 12 mesi", null, null],
];

async function renderStress(ws) {
  const $ = H.$;
  const maps = await Promise.all([...ws.map((w) => weekly(w.sym)), weekly(BENCH), weekly("AGGH.MI")]);
  const near = (m, day) => { let best = null; for (const k of m.keys()) if (k <= day && (best == null || k > best)) best = k; return best; };
  const ret = (m, a, b) => { const ka = near(m, a), kb = near(m, b); return ka != null && kb != null && ka !== kb && b - kb < 10 ? (m.get(kb) / m.get(ka) - 1) * 100 : null; };
  const today = Math.floor(Date.now() / 864e5);
  $("#lab-stress").innerHTML = STRESS.map(([name, a, b]) => {
    const da = a ? Math.floor(Date.parse(a) / 864e5) : today - 365, db = b ? Math.floor(Date.parse(b) / 864e5) : today;
    const parts = ws.map((w, i) => ({ w: w.w, r: ret(maps[i], da, db) }));
    const known = parts.filter((p) => p.r != null), cov = known.reduce((s, p) => s + p.w, 0);
    const p = cov > 0.5 ? known.reduce((s, x) => s + x.w * x.r, 0) / cov : null;
    const per = `${new Date(da * 864e5).toLocaleDateString("it-IT", { day: "numeric", month: "short", year: "2-digit" })} – ${new Date(db * 864e5).toLocaleDateString("it-IT", { day: "numeric", month: "short", year: "2-digit" })}`;
    return `<tr><td><b>${name}</b><small>${per}${cov > 0.5 && cov < 0.999 ? ` · storico per il ${Math.round(cov * 100)}% del portafoglio` : ""}</small></td>
      <td class="${cls(p)}">${p == null ? "n/d" : pctTxt(p)}</td><td class="${cls(ret(maps.at(-2), da, db))}">${pctTxt(ret(maps.at(-2), da, db))}</td><td class="${cls(ret(maps.at(-1), da, db))}">${pctTxt(ret(maps.at(-1), da, db))}</td></tr>`;
  }).join("");
}

async function renderMacro() {
  const $ = H.$;
  const d = await loadMacro();
  if (!d) { $("#lab-macro").innerHTML = '<div class="empty">Indicatori non disponibili.</div>'; return; }
  const groups = new Map();
  for (const [k, s] of Object.entries(d.series)) { if (!s.data?.length) continue; if (!groups.has(s.group)) groups.set(s.group, []); groups.get(s.group).push([k, s]); }
  $("#lab-macro").innerHTML = [...groups.entries()].map(([g, list]) => `<h3>${H.esc(g)}</h3><div class="grid lab-macro-grid">${list.map(([k, s]) => {
    const last = s.data.at(-1), prev = s.data.findLast(([dt]) => dt <= `${+last[0].slice(0, 4) - 1}${last[0].slice(4)}`);
    const delta = prev ? last[1] - prev[1] : null;
    const dd = s.unit === "pb" ? 0 : 2;
    const mo = new Date(`${last[0]}-01T00:00:00Z`).toLocaleDateString("it-IT", { month: "short", year: "numeric" });
    return `<div class="tile lab-m" data-series="${k}" tabindex="0" role="button" title="Mostra lo storico">
      <div class="n">${H.esc(s.name)}</div>
      <div class="p">${H.nf(last[1], dd)}${s.unit === "pb" ? " pb" : "%"}</div>
      <small>${mo}${delta != null ? ` · <span class="${delta > 0 ? "neg" : "pos"}">${delta > 0 ? "+" : ""}${H.nf(delta, dd)}${s.unit === "pb" ? " pb" : " p.p."}</span> in un anno` : ""}</small>
      ${miniLine(s.data.slice(-60))}
    </div>`;
  }).join("")}</div>`).join("");
  $("#lab-macro-meta").textContent = `Fonti: BCE, Eurostat, BLS · aggiornato ${new Date(d.updated).toLocaleString("it-IT", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })} · tocca un indicatore per lo storico dal 2015`;
}

function macroDetail(k) {
  lab.macro.then((d) => {
    const s = d.series[k];
    H.$("#lab-macro-chart").hidden = false;
    H.$("#lab-macro-chart").innerHTML = `<div class="lab-mc-head"><b>${H.esc(s.name)}</b><button class="icon-btn" id="lab-mc-close" aria-label="Chiudi">✕</button></div>
      ${lines([{ name: s.name, color: "var(--accent)", pts: s.data.map(([dt, v]) => [Date.parse(`${dt}-01T00:00:00Z`) / 1000, v]) }], { pct: true })}
      <p class="meta">Min ${H.nf(Math.min(...s.data.map((x) => x[1])), 2)} · max ${H.nf(Math.max(...s.data.map((x) => x[1])), 2)} · ${s.data.length} osservazioni mensili</p>`;
    H.$("#lab-macro-chart").scrollIntoView({ block: "nearest", behavior: "smooth" });
  });
}

export async function renderLab() {
  const $ = H.$;
  renderMacro();
  const hasModel = model.get().items.some((i) => +i.w > 0), hasPos = H.positionWeights().length > 0;
  if (lab.source === "model" && !hasModel && hasPos) lab.source = "positions";
  if (lab.source === "positions" && !hasPos && hasModel) lab.source = "model";
  $("#lab-src").innerHTML = `<button data-v="model" class="${lab.source === "model" ? "on" : ""}" ${hasModel ? "" : "disabled"}>Composizione</button><button data-v="positions" class="${lab.source === "positions" ? "on" : ""}" ${hasPos ? "" : "disabled"}>Posizioni</button>`;
  const ws = activeWeights();
  $("#lab-empty").hidden = !!ws.length;
  $("#lab-body").hidden = !ws.length;
  if (!ws.length) return;
  $("#lab-sens").innerHTML = '<div class="empty">Calcolo delle sensibilità…</div>';
  sens = await computeSensitivity(ws);
  if (!sens) { $("#lab-sens").innerHTML = '<div class="empty">Storico insufficiente per stimare le sensibilità (servono almeno 40 settimane comuni).</div>'; return; }
  const F = H.config.factors;
  const unitShock = { equity: 10, rates: 1, inflation: 1, eurusd: 10, oil: 20, gold: 10 };
  $("#lab-sens").innerHTML = `<table class="mt-table lab-sens-t"><tr><th>Fattore</th><th>Se varia di</th><th>Impatto stimato</th></tr>${sens.factors.map((k, i) => {
    const sh = unitShock[k] ?? 1, v = sens.port.beta[i] * shockValue(k, sh);
    return `<tr><td>${H.esc(F[k].name)}</td><td>+${H.nf(sh, 0)} ${F[k].unit}</td><td class="${cls(v)}"><b>${pctTxt(v, 2)}</b></td></tr>`;
  }).join("")}</table>
  <p class="meta">Stima statistica su ${sens.n} settimane (dal ${new Date(sens.from * 864e5).toLocaleDateString("it-IT", { month: "short", year: "numeric" })}) con regressione multipla sui rendimenti settimanali: i fattori spiegano il ${H.nf(sens.port.r2 * 100, 0)}% delle oscillazioni del portafoglio. Relazioni medie del passato, non previsioni.</p>`;
  $("#lab-presets").innerHTML = SCENARIOS.map(([n], i) => `<button data-sc="${i}">${H.esc(n)}</button>`).join("") + '<button data-sc="reset">Azzera</button>';
  $("#lab-sliders").innerHTML = sens.factors.map((k) => { const f = F[k]; return `<label id="lab-sl-${k}"><span>${H.esc(f.name)}</span>
    <input type="range" min="${f.range[0]}" max="${f.range[1]}" step="${f.step}" value="${lab.shocks[k] ?? 0}" data-f="${k}"><output></output></label>`; }).join("");
  renderScenario();
  renderStress(ws);
}

// =====================================================================
export function initLab(helpers) {
  H = helpers;
  const $ = H.$;
  // composizione
  $("#cp-capital").addEventListener("change", (e) => { const m = model.get(); m.capital = +e.target.value || 0; model.set(m); renderComposition(); });
  $("#cp-presets").addEventListener("click", (e) => {
    const b = e.target.closest("[data-preset]"); if (!b) return;
    const m = model.get();
    if (b.dataset.preset === "pos") { const ws = H.positionWeights(); if (!ws.length) { alert("Non hai ancora posizioni nel portafoglio."); return; } m.items = ws.map((w) => ({ sym: w.sym, w: +(w.w * 100).toFixed(1) })); m.capital = Math.round(H.positionsValue()); }
    else m.items = PRESETS[+b.dataset.preset][1].map(([sym, w]) => ({ sym, w }));
    model.set(m); renderComposition();
  });
  $("#cp-rows").addEventListener("change", (e) => { const i = e.target.dataset.i; if (i == null) return; const m = model.get(); m.items[+i].w = Math.max(0, +e.target.value || 0); model.set(m); renderComposition(); });
  $("#cp-rows").addEventListener("click", (e) => {
    const d = e.target.closest("[data-del]"); if (d) { const m = model.get(); m.items.splice(+d.dataset.del, 1); model.set(m); renderComposition(); return; }
    const o = e.target.closest("[data-open]"); if (o) H.openDetail(o.dataset.open, H.bySymbol(o.dataset.open));
  });
  $("#cp-total").addEventListener("click", (e) => {
    if (e.target.id !== "cp-norm") return;
    const m = model.get(), tot = m.items.reduce((s, i) => s + (+i.w || 0), 0);
    if (tot) m.items.forEach((i) => { i.w = +((i.w / tot) * 100).toFixed(2); });
    model.set(m); renderComposition();
  });
  $("#cp-add").addEventListener("input", (e) => {
    const res = e.target.value.trim().length > 1 ? H.searchQuotes(e.target.value, 10).filter((q) => !q.dir).slice(0, 6) : [];
    $("#cp-add-res").innerHTML = res.map((q) => `<li><button type="button" data-pick="${H.esc(q.symbol)}">${H.esc(q.name)} <small>${H.esc(q.symbol)} · ${H.esc(meta(q.symbol).cls)}</small></button></li>`).join("")
      || (e.target.value.trim().length > 1 ? '<li class="meta">Nessun asset monitorato trovato: aggiungi prima il titolo dalla ricerca dei Mercati.</li>' : "");
  });
  $("#cp-add-res").addEventListener("click", (e) => {
    const b = e.target.closest("[data-pick]"); if (!b) return;
    const m = model.get();
    if (!m.items.some((i) => i.sym === b.dataset.pick)) {
      const tot = m.items.reduce((s, i) => s + (+i.w || 0), 0);
      m.items.push({ sym: b.dataset.pick, w: Math.max(0, +(100 - tot).toFixed(1)) || 10 });
    }
    model.set(m); $("#cp-add").value = ""; $("#cp-add-res").innerHTML = ""; renderComposition();
  });
  H.seg("#cp-period", (v) => { lab.period = +v; renderComposition(); });
  // laboratorio
  $("#lab-src").addEventListener("click", (e) => { const b = e.target.closest("button[data-v]"); if (!b || b.disabled) return; lab.source = b.dataset.v; renderLab(); });
  $("#lab-presets").addEventListener("click", (e) => {
    const b = e.target.closest("[data-sc]"); if (!b) return;
    lab.shocks = b.dataset.sc === "reset" ? {} : { ...SCENARIOS[+b.dataset.sc][1] };
    for (const inp of document.querySelectorAll("#lab-sliders input")) inp.value = lab.shocks[inp.dataset.f] ?? 0;
    $$all("#lab-presets button").forEach((x) => x.classList.toggle("on", x === b && b.dataset.sc !== "reset"));
    renderScenario();
  });
  $("#lab-sliders").addEventListener("input", (e) => { const f = e.target.dataset.f; if (!f) return; lab.shocks[f] = +e.target.value; renderScenario(); });
  $("#lab-macro").addEventListener("click", (e) => { const t = e.target.closest("[data-series]"); if (t) macroDetail(t.dataset.series); });
  $("#lab-macro-chart").addEventListener("click", (e) => { if (e.target.closest("#lab-mc-close")) $("#lab-macro-chart").hidden = true; });
  $("#lab-ask").addEventListener("click", async () => {
    const ws = activeWeights(), d = await loadMacro();
    const comp = ws.map((w) => `${niceName(w.sym)} (${w.sym}) ${H.nf(w.w * 100, 1)}%`).join("; ");
    const macro = d ? Object.values(d.series).filter((s) => s.data.length).map((s) => `${s.name}: ${s.data.at(-1)[1]}${s.unit === "pb" ? " pb" : "%"} (${s.data.at(-1)[0]})`).join("; ") : "";
    const sv = sens ? sens.factors.map((k, i) => `${H.config.factors[k].name}: beta ${H.nf(sens.port.beta[i], 3)}`).join("; ") : "";
    H.setTab("ai");
    H.ask(`Analizza come le variabili macroeconomiche pesano sul mio portafoglio.\nComposizione: ${comp}.\nIndicatori attuali: ${macro}.\nSensibilità stimate (regressione settimanale, variazioni in %; tassi e inflazione in punti percentuali): ${sv}.\nSpiega in modo chiaro quali rischi (tassi, inflazione, cambio, materie prime, ciclo economico) sono più rilevanti, cosa potrebbe succedere nei prossimi mesi secondo lo scenario macro attuale e quali aspetti della diversificazione valutare. Considerazioni generali, non consigli personalizzati.`);
  });
}
const $$all = (s) => [...document.querySelectorAll(s)];
