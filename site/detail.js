import { sma, bollinger, rsi } from "./indicators.js";
// Vista di dettaglio di un titolo: grafico interattivo (ore / giorni / settimane), statistiche e storico.
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const nf = (v, d = 2) => v == null || !isFinite(v) ? "–" : v.toLocaleString("it-IT", { minimumFractionDigits: d, maximumFractionDigits: d });
const dec = (v) => { const a = Math.abs(v ?? 0); return a >= 10 ? 2 : a >= 1 ? 4 : a > 0 ? Math.min(10, Math.max(4, 3 - Math.floor(Math.log10(a)))) : 2; };
const pct = (v) => v == null || !isFinite(v) ? '<span class="chg">–</span>'
  : `<span class="chg ${v >= 0 ? "pos" : "neg"}">${v >= 0 ? "+" : ""}${nf(v)}%</span>`;
const compact = (v) => v == null ? "–" : v.toLocaleString("it-IT", { notation: "compact", maximumFractionDigits: 1 });

// Intervalli disponibili per ogni granularità
const RANGES = {
  hour: [["1G", { sessions: 1 }], ["3G", { sessions: 3 }], ["1S", { sessions: 5 }], ["1M", { all: true }]],
  day: [["1M", { days: 31 }], ["3M", { days: 92 }], ["6M", { days: 183 }], ["1A", { days: 365 }], ["2A", { all: true }]],
  week: [["1A", { days: 366 }], ["3A", { days: 1096 }], ["5A", { days: 1827 }], ["10A", { all: true }]],
};
const LABELS = { hour: "Ore", day: "Giorni", week: "Settimane" };
const DEFAULT_RANGE = { hour: "1G", day: "6M", week: "5A" };

const st = { sym: null, quote: null, hist: null, gran: "day", range: "6M", showAll: false, onAsk: null, favs: null,
  ind: new Set(), cmp: [], cmpHist: new Map(), profiles: null };
const cache = new Map();
const $ = (s) => document.querySelector(s);

function pref(k, d) { try { return localStorage.getItem(k) ?? d; } catch { return d; } }
function setPref(k, v) { try { localStorage.setItem(k, v); } catch {} }

function slice(points, tz, spec) {
  if (!points.length || spec.all) return points;
  if (spec.sessions) {
    const day = (t) => Math.floor((t + tz) / 86400);
    const days = [...new Set(points.map((p) => day(p[0])))];
    const keep = new Set(days.slice(-spec.sessions));
    return points.filter((p) => keep.has(day(p[0])));
  }
  const from = points.at(-1)[0] - spec.days * 86400;
  return points.filter((p) => p[0] >= from);
}

function fmtX(t, gran, span) {
  const d = new Date(t * 1000);
  if (gran === "hour") {
    if (span > 8 * 86400) return d.toLocaleDateString("it-IT", { day: "numeric", month: "short" });
    if (span > 1.5 * 86400) return d.toLocaleDateString("it-IT", { weekday: "short", day: "numeric" });
    return d.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" });
  }
  if (span > 1500 * 86400) return String(d.getFullYear());
  if (span > 300 * 86400) return d.toLocaleDateString("it-IT", { month: "short", year: "2-digit" });
  return d.toLocaleDateString("it-IT", { day: "numeric", month: "short" });
}
function fmtFull(t, gran) {
  const d = new Date(t * 1000);
  if (gran === "hour") return d.toLocaleString("it-IT", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
  if (gran === "week") return `sett. del ${d.toLocaleDateString("it-IT", { day: "numeric", month: "short", year: "numeric" })}`;
  return d.toLocaleDateString("it-IT", { weekday: "short", day: "numeric", month: "short", year: "numeric" });
}

function niceTicks(min, max, n = 4) {
  const span = max - min || Math.abs(max) || 1;
  const step0 = span / n, mag = 10 ** Math.floor(Math.log10(step0));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= step0);
  const out = [];
  for (let v = Math.ceil(min / step) * step; v <= max + 1e-9; v += step) out.push(+v.toPrecision(10));
  return out;
}

const IND = { sma50: ["MM 50", "#f59e0b"], sma200: ["MM 200", "#7c3aed"], boll: ["Bollinger", "#0891b2"], rsi: ["RSI 14", "#db2777"] };
const CMP_COLORS = ["#f59e0b", "#7c3aed", "#0891b2"];

// opt: { overlays: [{ vals, color, dash }], band: { up, lo }, rsi: [...], compare: [{ name, vals, color }] }
// In modalità confronto i valori sono variazioni % dal primo punto del periodo.
function drawChart(pts, opt = {}) {
  const box = $("#dt-chart");
  if (pts.length < 2) { box.innerHTML = '<div class="empty">Storico non disponibile per questo intervallo.</div>'; return; }
  const cmp = opt.compare?.length ? opt.compare : null;
  const base = pts[0][1];
  const main = pts.map((p) => (cmp ? (p[1] / base - 1) * 100 : p[1]));
  const W = Math.max(box.clientWidth, 280), rsiH = opt.rsi ? 64 : 0;
  const H = 260 + rsiH, padL = 8, padR = 58, padT = 12, padB = 26, volH = cmp ? 0 : 34;
  const series = [main, ...(cmp ? cmp.map((c) => c.vals) : []), ...(opt.overlays ?? []).map((o) => o.vals), ...(opt.band ? [opt.band.up, opt.band.lo] : [])];
  const all = series.flat().filter((v) => v != null && isFinite(v));
  let min = Math.min(...all), max = Math.max(...all);
  const pad = (max - min) * 0.08 || Math.abs(max) * 0.01 || 1; min -= pad; max += pad;
  const plotH = 260 - padT - padB - volH;
  const x = (i) => padL + (i / (pts.length - 1)) * (W - padL - padR);
  const y = (v) => padT + (1 - (v - min) / (max - min)) * plotH;
  const path = (vals) => { let d = "", pen = false; vals.forEach((v, i) => { if (v == null || !isFinite(v)) { pen = false; return; } d += `${pen ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`; pen = true; }); return d; };
  const up = main.at(-1) >= main[0];
  const color = cmp ? "var(--accent)" : `var(${up ? "--up" : "--down"})`;
  const line = path(main);
  const area = cmp ? "" : `${line}L${x(pts.length - 1).toFixed(1)},${padT + plotH}L${x(0).toFixed(1)},${padT + plotH}Z`;
  const ticks = niceTicks(min, max);
  const d = cmp ? 1 : dec(max);
  const span = pts.at(-1)[0] - pts[0][0];
  const nx = Math.min(W < 420 ? 3 : 5, pts.length - 1);
  const xIdx = Array.from({ length: nx + 1 }, (_, k) => Math.round((k / nx) * (pts.length - 1)));
  const vols = pts.map((p) => p[2] || 0), vmax = volH ? Math.max(...vols) : 0;
  const bw = Math.max(1, (W - padL - padR) / pts.length - 1);
  const volBase = 260 - padB;
  const rsiTop = 260 + 4, ry = (v) => rsiTop + (1 - v / 100) * (rsiH - 12);
  let band = "";
  if (opt.band) {
    const upP = [], loP = [];
    opt.band.up.forEach((v, i) => { if (v != null) { upP.push(`${x(i).toFixed(1)},${y(v).toFixed(1)}`); loP.unshift(`${x(i).toFixed(1)},${y(opt.band.lo[i]).toFixed(1)}`); } });
    if (upP.length > 1) band = `<polygon points="${[...upP, ...loP].join(" ")}" fill="${IND.boll[1]}" opacity=".10"/>`;
  }
  box.innerHTML = `
  <svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="Grafico prezzo">
    <defs><linearGradient id="dtg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${color}" stop-opacity=".25"/><stop offset="1" stop-color="${color}" stop-opacity="0"/></linearGradient></defs>
    ${ticks.map((t) => `<line x1="${padL}" x2="${W - padR}" y1="${y(t)}" y2="${y(t)}" class="grid"/>
      <text x="${W - padR + 6}" y="${y(t) + 4}" class="ax">${cmp ? `${t > 0 ? "+" : ""}${nf(t, Math.abs(max - min) < 10 ? 1 : 0)}%` : nf(t, d)}</text>`).join("")}
    <line x1="${padL}" x2="${W - padR}" y1="${y(main[0])}" y2="${y(main[0])}" class="ref"/>
    ${vmax ? vols.map((v, i) => v ? `<rect x="${(x(i) - bw / 2).toFixed(1)}" y="${(volBase - (v / vmax) * volH).toFixed(1)}" width="${bw.toFixed(1)}" height="${((v / vmax) * volH).toFixed(1)}" class="vol"/>` : "").join("") : ""}
    ${band}
    ${area ? `<path d="${area}" fill="url(#dtg)"/>` : ""}
    ${(opt.overlays ?? []).map((o) => `<path d="${path(o.vals)}" fill="none" stroke="${o.color}" stroke-width="1.5" ${o.dash ? 'stroke-dasharray="4 3"' : ""}/>`).join("")}
    ${(cmp ?? []).map((c) => `<path d="${path(c.vals)}" fill="none" stroke="${c.color}" stroke-width="2"/>`).join("")}
    <path d="${line}" fill="none" stroke="${color}" stroke-width="2" stroke-linejoin="round"/>
    ${opt.rsi ? `<g class="rsi">
      <rect x="${padL}" y="${rsiTop}" width="${W - padL - padR}" height="${rsiH - 12}" class="rsi-bg"/>
      <rect x="${padL}" y="${ry(70)}" width="${W - padL - padR}" height="${ry(30) - ry(70)}" class="rsi-zone"/>
      ${[30, 70].map((v) => `<line x1="${padL}" x2="${W - padR}" y1="${ry(v)}" y2="${ry(v)}" class="grid"/><text x="${W - padR + 6}" y="${ry(v) + 4}" class="ax">${v}</text>`).join("")}
      <path d="${opt.rsi.map((v, i) => (v == null ? "" : `${i && opt.rsi[i - 1] != null ? "L" : "M"}${x(i).toFixed(1)},${ry(v).toFixed(1)}`)).join("")}" fill="none" stroke="${IND.rsi[1]}" stroke-width="1.5"/>
      <text x="${padL + 4}" y="${rsiTop + 11}" class="ax">RSI 14</text></g>` : ""}
    ${xIdx.map((i, k) => `<text x="${x(i)}" y="${260 - 8}" class="ax" text-anchor="${k === 0 ? "start" : k === nx ? "end" : "middle"}">${esc(fmtX(pts[i][0], st.gran, span))}</text>`).join("")}
    <g id="dt-cross" style="display:none">
      <line id="dt-cx" y1="${padT}" y2="${H - 8}" class="cross"/>
      <circle id="dt-cc" r="4.5" fill="${color}" stroke="var(--card)" stroke-width="2"/>
    </g>
    <rect x="${padL}" y="0" width="${W - padL - padR}" height="${H}" fill="transparent" id="dt-hit"/>
  </svg>
  <div class="tip" id="dt-tip" hidden></div>`;

  const hit = $("#dt-hit"), cross = $("#dt-cross"), tip = $("#dt-tip"), svg = box.querySelector("svg");
  const show = (ev) => {
    const r = svg.getBoundingClientRect();
    const px = ((ev.clientX - r.left) / r.width) * W;
    const i = Math.max(0, Math.min(pts.length - 1, Math.round(((px - padL) / (W - padL - padR)) * (pts.length - 1))));
    const p = pts[i];
    cross.style.display = "";
    $("#dt-cx").setAttribute("x1", x(i)); $("#dt-cx").setAttribute("x2", x(i));
    $("#dt-cc").setAttribute("cx", x(i)); $("#dt-cc").setAttribute("cy", y(main[i]));
    tip.hidden = false;
    const extra = [];
    if (cmp) for (const c of cmp) extra.push(`<span style="color:${c.color}">●</span> ${esc(c.name)} ${c.vals[i] == null ? "–" : pct(c.vals[i])}`);
    for (const o of opt.overlays ?? []) if (o.vals[i] != null) extra.push(`<span style="color:${o.color}">●</span> ${o.name} ${nf(o.vals[i], dec(o.vals[i]))}`);
    if (opt.rsi?.[i] != null) extra.push(`RSI ${nf(opt.rsi[i], 1)}`);
    tip.innerHTML = `<b>${nf(p[1], dec(p[1]))}</b> ${pct(((p[1] - base) / base) * 100)}${extra.length ? `<br><small>${extra.join(" · ")}</small>` : ""}<br><small>${esc(fmtFull(p[0], st.gran))}${p[2] ? ` · vol. ${compact(p[2])}` : ""}</small>`;
    const left = (x(i) / W) * r.width;
    tip.style.left = `${Math.min(Math.max(left - tip.offsetWidth / 2, 0), r.width - tip.offsetWidth)}px`;
  };
  const hide = () => { cross.style.display = "none"; tip.hidden = true; };
  hit.addEventListener("pointermove", show);
  hit.addEventListener("pointerdown", show);
  hit.addEventListener("pointerleave", hide);
}

// Allinea la serie di un altro titolo ai punti del grafico (stesso giorno o stessa ora; ultimo valore noto se manca)
function align(pts, other, gran) {
  const key = gran === "hour" ? (t) => Math.floor(t / 3600) : (t) => Math.floor(t / 86400);
  const m = new Map(other.map((p) => [key(p[0]), p[1]]));
  const firstT = pts[0][0];
  let last = other.filter((p) => p[0] <= firstT).at(-1)?.[1] ?? null;
  const vals = pts.map((p) => { const v = m.get(key(p[0])); if (v != null) last = v; return last; });
  const b = vals.find((v) => v != null);
  return vals.map((v) => (v == null || b == null ? null : (v / b - 1) * 100));
}

function renderSegs() {
  $("#dt-gran").innerHTML = Object.keys(RANGES).map((g) => `<button data-v="${g}" class="${g === st.gran ? "on" : ""}">${LABELS[g]}</button>`).join("");
  $("#dt-range").innerHTML = RANGES[st.gran].map(([k]) => `<button data-v="${k}" class="${k === st.range ? "on" : ""}">${k}</button>`).join("");
}

function renderTools(noHist) {
  $("#dt-ind").hidden = $("#dt-cmp").hidden = noHist;
  if (noHist) return;
  $("#dt-ind").innerHTML = Object.entries(IND).map(([k, [label, color]]) =>
    `<button data-ind="${k}" class="${st.ind.has(k) ? "on" : ""}" ${st.cmp.length && k !== "rsi" ? "disabled title=\"Non disponibile durante il confronto\"" : ""}><i style="background:${color}"></i>${label}</button>`).join("");
  $("#dt-cmp-list").innerHTML = st.cmp.length
    ? `<span class="dt-cmp-main"><i style="background:var(--accent)"></i>${esc(st.quote?.name ?? st.sym)}</span>` + st.cmp.map((c, i) => `<span class="dt-cmp-item"><i style="background:${CMP_COLORS[i]}"></i>${esc(c.name)}<button data-cmp-del="${esc(c.sym)}" aria-label="Togli ${esc(c.name)} dal confronto">✕</button></span>`).join("")
    : "";
  $("#dt-cmp-add").hidden = st.cmp.length >= 3;
}

async function profiles() {
  st.profiles ??= fetch(`data/profiles.json?t=${Math.floor(Date.now() / 3600e3)}`).then((r) => (r.ok ? r.json() : {})).catch(() => ({}));
  return st.profiles;
}

const RATING = (r) => { if (!r) return null; const [v, txt] = String(r).split(" - "); const it = { "Strong Buy": "Acquisto forte", Buy: "Acquisto", Hold: "Mantenere", Underperform: "Sottoperformance", Sell: "Vendita" }[txt?.trim()] ?? txt; return `${it} (${v.trim()}/5)`; };

function renderExtra(q, h, noHist) {
  const f = q.f ?? {};
  const cur = esc(q.currency ?? "");
  const fund = [
    ["P/E (ultimi 12 mesi)", f.pe != null ? nf(f.pe, 1) : null],
    ["P/E atteso", f.fpe != null ? nf(f.fpe, 1) : null],
    ["Utile per azione", f.eps != null ? `${nf(f.eps)} ${cur}` : null],
    ["Rendimento dividendo", f.dy != null ? `${nf(f.dy)}%` : null],
    ["Prezzo / valore contabile", f.pb != null ? nf(f.pb) : null],
    ["Media mobile 50 gg", f.sma50 != null ? `${nf(f.sma50, dec(f.sma50))} (${q.price >= f.sma50 ? "sopra" : "sotto"})` : null],
    ["Media mobile 200 gg", f.sma200 != null ? `${nf(f.sma200, dec(f.sma200))} (${q.price >= f.sma200 ? "sopra" : "sotto"})` : null],
    ["Giudizio analisti", RATING(f.rating)],
    ["Prossimi risultati", f.earn && f.earn * 1000 > Date.now() - 864e5 ? `${new Date(f.earn * 1000).toLocaleDateString("it-IT", { day: "numeric", month: "long", year: "numeric" })}${f.earnEst ? " (stimata)" : ""}` : null],
  ].filter(([, v]) => v != null);
  $("#dt-fund-title").hidden = $("#dt-fund").hidden = !fund.length;
  $("#dt-fund").innerHTML = fund.map(([k, v]) => `<div><small>${k}</small><b>${v}</b></div>`).join("");

  $("#dt-profile-wrap").hidden = true;
  if (q.type === "EQUITY" || q.type === "ETF") profiles().then((all) => {
    const p = all[st.sym];
    if (st.quote !== q || !p || !(p.sector || p.summary)) return;
    $("#dt-profile-wrap").hidden = false;
    $("#dt-profile").innerHTML = `${p.sector ? `<p><b>${esc(p.sector)}</b>${p.industry ? ` · ${esc(p.industry)}` : ""}${p.country ? ` · ${esc(p.country)}` : ""}${p.employees ? ` · ${compact(p.employees)} dipendenti` : ""}</p>` : ""}
      ${p.summary ? `<p class="dt-summary" lang="en">${esc(p.summary)}${p.summary.length >= 600 ? "…" : ""}</p>` : ""}
      ${p.website ? `<p><a href="${esc(p.website)}" target="_blank" rel="noopener">${esc(p.website.replace(/^https?:\/\//, ""))}</a></p>` : ""}`;
  });

  const news = h?.news ?? [];
  $("#dt-news-title").hidden = $("#dt-news").hidden = !news.length;
  $("#dt-news").innerHTML = news.slice(0, 10).map((n) => `
    <li><a href="${esc(n.link)}" target="_blank" rel="noopener">${esc(n.title)}</a>
      <div class="src"><span>${esc(n.source)}</span><span>${new Date(n.date).toLocaleDateString("it-IT", { day: "numeric", month: "short" })}</span><span class="tag">${esc(n.lang)}</span></div></li>`).join("");
}

function render() {
  const q = st.quote ?? {};
  const h = st.hist;
  renderSegs();
  const all = h?.[st.gran] ?? [];
  const spec = Object.fromEntries(RANGES[st.gran])[st.range];
  const pts = slice(all, h?.tz ?? 0, spec);
  const first = pts[0]?.[1], last = pts.at(-1)?.[1];
  const closes = pts.map((p) => p[1]);
  const rangeChg = first ? ((last - first) / first) * 100 : null;

  setFavBtn();
  const noHist = !h || !(h.day?.length || h.hour?.length);
  for (const sel of ["#dt-gran", "#dt-range", "#dt-hist-title", ".dt-table"]) document.querySelector(sel).hidden = noHist;
  if (noHist) {
    const since = st.pendingSince?.(st.sym);
    $("#dt-period").innerHTML = "";
    $("#dt-chart").innerHTML = `<div class="dt-add">
      <p>${since ? `Richiesta di monitoraggio inviata ${new Date(since).toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" })}. Storico e grafico compariranno dopo l'aggiornamento del sito (di solito 5–10 minuti).`
        : "Questo titolo non è ancora monitorato: sono disponibili solo prezzo e variazione del giorno. Aggiungilo per avere storico, grafico e aggiornamenti."}</p>
      <button class="primary" id="dt-add-btn">${since ? "↻ Invia di nuovo la richiesta" : "➕ Aggiungi al monitoraggio"}</button>
      <small>Si apre GitHub con la richiesta già compilata: conferma con "Submit new issue". Serve l'accesso al repository.</small>
    </div>`;
    $("#dt-add-btn").addEventListener("click", () => { st.onAdd?.(st.sym); render(); });
  }
  $("#dt-period").innerHTML = noHist ? "" : pts.length
    ? `Variazione ${esc(st.range)}: ${pct(rangeChg)} · max ${nf(Math.max(...closes), dec(last))} · min ${nf(Math.min(...closes), dec(last))}`
    : "";
  if (!noHist) {
    // indicatori calcolati sull'intera serie (per avere i valori iniziali) e poi ritagliati sul periodo
    const off = all.indexOf(pts[0]);
    const closesAll = all.map((p) => p[1]);
    const cut = (arr) => arr.slice(off, off + pts.length);
    const opt = {};
    if (st.cmp.length) {
      opt.compare = st.cmp.map((c, i) => ({ name: c.name, color: CMP_COLORS[i], vals: align(pts, st.cmpHist.get(c.sym)?.[st.gran] ?? [], st.gran) }));
    } else {
      opt.overlays = [];
      if (st.ind.has("sma50")) opt.overlays.push({ name: "MM 50", color: IND.sma50[1], vals: cut(sma(closesAll, 50)) });
      if (st.ind.has("sma200")) opt.overlays.push({ name: "MM 200", color: IND.sma200[1], vals: cut(sma(closesAll, 200)) });
      if (st.ind.has("boll")) { const b = bollinger(closesAll, 20, 2); opt.band = { up: cut(b.up), lo: cut(b.lo) }; opt.overlays.push({ name: "Media 20", color: IND.boll[1], vals: cut(b.mid), dash: true }); }
    }
    if (st.ind.has("rsi")) opt.rsi = cut(rsi(closesAll, 14));
    drawChart(pts, opt);
  }
  renderTools(noHist);
  renderExtra(q, h, noHist);

  const stats = [
    ["Chiusura prec.", nf(q.prevClose, dec(q.prevClose))],
    ["Min – max giorno", `${nf(q.dayLow, dec(q.dayLow))} – ${nf(q.dayHigh, dec(q.dayHigh))}`],
    ["Min – max 52 sett.", `${nf(q.low52, dec(q.low52))} – ${nf(q.high52, dec(q.high52))}`],
    ["Volume", compact(q.volume)],
    ["1 settimana", pct(q.weekPct)],
    ["1 mese", pct(q.monthPct)],
    ["1 anno", pct(q.yearPct)],
    ["Borsa", esc(q.exchange ?? "–")],
    ...(st.extraStats?.(q) ?? []),
    ...(q.marketCap ? [["Capitalizzazione", `${compact(q.marketCap)} ${esc(q.currency ?? "")}`]] : []),
  ];
  $("#dt-stats").innerHTML = stats.filter(([, v]) => !/^(–|– – –|<span class="chg">–<\/span>)$/.test(v)).map(([k, v]) => `<div><small>${k}</small><b>${v}</b></div>`).join("");

  // Storico: righe del periodo, dalla più recente
  const rows = pts.map((p, i) => [p, i ? ((p[1] - pts[i - 1][1]) / pts[i - 1][1]) * 100 : null]).reverse();
  const shown = st.showAll ? rows : rows.slice(0, 30);
  $("#dt-hist-title").textContent = `Storico (${LABELS[st.gran].toLowerCase()}, ${st.range}) · ${rows.length} rilevazioni`;
  $("#dt-hist").innerHTML = shown.map(([p, c]) => `<tr><td>${esc(fmtFull(p[0], st.gran))}</td><td>${nf(p[1], dec(p[1]))}</td><td>${pct(c)}</td><td>${p[2] ? compact(p[2]) : "–"}</td></tr>`).join("")
    || '<tr><td colspan="4" class="empty">Nessun dato.</td></tr>';
  $("#dt-hist-more").hidden = noHist || st.showAll || rows.length <= 30;
}

// Storici in formato compatto (colonne + timestamp incrementali) o classico [[t, c, v], …]
function decodeSeries(s) {
  if (!s) return [];
  if (Array.isArray(s)) return s;
  let t = 0;
  return s.t.map((d, i) => { t += d; return s.v?.[i] ? [t, s.c[i], s.v[i]] : [t, s.c[i]]; });
}

export async function loadHist(sym) {
  if (!cache.has(sym)) {
    const file = sym.replace(/[^A-Za-z0-9.-]/g, "_");
    cache.set(sym, fetch(`data/hist/${file}.json?t=${Math.floor(Date.now() / 300000)}`).then((r) => (r.ok ? r.json() : null))
      .then((h) => h && { ...h, hour: decodeSeries(h.hour), day: decodeSeries(h.day), week: decodeSeries(h.week) }).catch(() => null));
  }
  return cache.get(sym);
}

function setFavBtn() {
  const on = !!st.favs?.has(st.sym);
  const b = $("#dt-fav");
  b.setAttribute("aria-pressed", on);
  b.innerHTML = `<svg class="ic" aria-hidden="true"><use href="#i-star"/></svg><span class="lbl">${on ? "Nei preferiti" : "Preferito"}</span>`;
  b.setAttribute("aria-label", on ? "Rimuovi dai preferiti" : "Aggiungi ai preferiti");
}

export async function openDetail(sym, quote) {
  st.sym = sym; st.quote = quote; st.showAll = false; st.cmp = [];
  $("#dt-cmp-box").hidden = true;
  setFavBtn();
  st.gran = pref("dt-gran", "day");
  st.range = pref(`dt-range-${st.gran}`, DEFAULT_RANGE[st.gran]);
  const q = quote ?? { name: sym };
  $("#dt-name").textContent = q.longName || q.name || sym;
  $("#dt-sym").textContent = [sym, q.type === "INDEX" ? "Indice" : q.type === "CURRENCY" ? "Valuta" : q.type === "FUTURE" ? "Future" : q.type === "CRYPTOCURRENCY" ? "Cripto" : null].filter(Boolean).join(" · ");
  $("#dt-price").innerHTML = `${nf(q.price, dec(q.price))} <small>${esc(q.currency ?? "")}</small> ${pct(q.changePct)}`;
  const ms = st.marketStatus?.(q);
  $("#dt-time").innerHTML = (ms ? `<span class="mstate ${ms === "aperto" ? "open" : ""}">● Mercato ${ms}</span> · ` : "")
    + (q.time ? `Ultima quotazione: ${new Date(q.time).toLocaleString("it-IT")}${q.stale ? " (dato non aggiornato)" : ""} · dati ritardati` : "");
  $("#detail").hidden = false;
  document.body.classList.add("dt-open");
  $("#dt-chart").innerHTML = '<div class="empty">Caricamento…</div>';
  if (location.hash !== `#q=${encodeURIComponent(sym)}`) history.pushState({ sym }, "", `#q=${encodeURIComponent(sym)}`);
  st.hist = await loadHist(sym);
  if (st.sym === sym) render();
}

export function closeDetail(fromPop = false) {
  if ($("#detail").hidden) return;
  $("#detail").hidden = true;
  document.body.classList.remove("dt-open");
  if (!fromPop && location.hash.startsWith("#q=")) history.back();
}

let search = null;
export function initDetail({ onAsk, quoteFor, favs, onAdd, pendingSince, loadDirectory, extraStats, askPrompt, marketStatus, onPortfolio, onAlert, searchQuotes }) {
  search = searchQuotes;
  $("#dt-pf").addEventListener("click", () => onPortfolio?.(st.sym));
  $("#dt-alert").addEventListener("click", () => onAlert?.(st.sym));
  st.marketStatus = marketStatus;
  st.extraStats = extraStats; st.askPrompt = askPrompt;
  st.onAsk = onAsk; st.favs = favs; st.onAdd = onAdd; st.pendingSince = pendingSince;
  $("#dt-fav").addEventListener("click", () => { favs.toggle(st.sym); setFavBtn(); });
  $("#dt-back").addEventListener("click", () => closeDetail());
  $("#dt-gran").addEventListener("click", (e) => {
    const b = e.target.closest("button"); if (!b) return;
    st.gran = b.dataset.v; st.range = pref(`dt-range-${st.gran}`, DEFAULT_RANGE[st.gran]); st.showAll = false;
    setPref("dt-gran", st.gran); render();
  });
  $("#dt-range").addEventListener("click", (e) => {
    const b = e.target.closest("button"); if (!b) return;
    st.range = b.dataset.v; st.showAll = false; setPref(`dt-range-${st.gran}`, st.range); render();
  });
  $("#dt-hist-more").addEventListener("click", () => { st.showAll = true; render(); });
  try { st.ind = new Set(JSON.parse(pref("dt-ind", "[]"))); } catch {}
  $("#dt-ind").addEventListener("click", (e) => {
    const b = e.target.closest("[data-ind]"); if (!b || b.disabled) return;
    st.ind.has(b.dataset.ind) ? st.ind.delete(b.dataset.ind) : st.ind.add(b.dataset.ind);
    setPref("dt-ind", JSON.stringify([...st.ind])); render();
  });
  $("#dt-cmp-add").addEventListener("click", () => { $("#dt-cmp-box").hidden = false; $("#dt-cmp-q").value = ""; $("#dt-cmp-res").innerHTML = ""; $("#dt-cmp-q").focus(); });
  $("#dt-cmp-q").addEventListener("input", (e) => {
    const res = (search?.(e.target.value, 12) ?? []).filter((q) => !q.dir && q.symbol !== st.sym && !st.cmp.some((c) => c.sym === q.symbol)).slice(0, 6);
    $("#dt-cmp-res").innerHTML = res.map((q) => `<li><button type="button" data-cmp="${esc(q.symbol)}">${esc(q.name)} <small>${esc(q.symbol)}</small></button></li>`).join("")
      || (e.target.value.trim().length > 1 ? '<li class="meta">Nessun titolo monitorato trovato.</li>' : "");
  });
  $("#dt-cmp-res").addEventListener("click", async (e) => {
    const b = e.target.closest("[data-cmp]"); if (!b) return;
    const sym = b.dataset.cmp, q = quoteFor(sym);
    $("#dt-cmp-box").hidden = true;
    st.cmpHist.set(sym, await loadHist(sym));
    st.cmp.push({ sym, name: q?.name ?? sym });
    render();
  });
  $("#dt-cmp-list").addEventListener("click", (e) => {
    const b = e.target.closest("[data-cmp-del]"); if (!b) return;
    st.cmp = st.cmp.filter((c) => c.sym !== b.dataset.cmpDel); render();
  });
  $("#dt-ask").addEventListener("click", () => {
    const q = st.quote ?? {};
    closeDetail();
    st.onAsk?.(st.askPrompt?.(q) ?? `Analizza ${q.longName || q.name || st.sym} (${st.sym}): andamento recente (oggi ${nf(q.changePct)}%, 1 settimana ${nf(q.weekPct)}%, 1 mese ${nf(q.monthPct)}%, 1 anno ${nf(q.yearPct)}%), notizie e fattori che lo influenzano. Cerca sul web le notizie più recenti.`);
  });
  addEventListener("popstate", () => {
    const m = location.hash.match(/^#q=(.+)$/);
    if (m) { const s = decodeURIComponent(m[1]); openDetail(s, quoteFor(s)); } else closeDetail(true);
  });
  addEventListener("keydown", (e) => { if (e.key === "Escape") closeDetail(); });
  let rt; addEventListener("resize", () => { clearTimeout(rt); rt = setTimeout(() => { if (!$("#detail").hidden && st.hist) render(); }, 150); });
  const m = location.hash.match(/^#q=(.+)$/);
  if (m) {
    const s = decodeURIComponent(m[1]); history.replaceState(null, "", location.pathname);
    if (quoteFor(s)) openDetail(s, quoteFor(s));
    else loadDirectory?.().then(() => openDetail(s, quoteFor(s)));
  }
}
