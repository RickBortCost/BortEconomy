// Vista di dettaglio di un titolo: grafico interattivo (ore / giorni / settimane), statistiche e storico.
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const nf = (v, d = 2) => v == null || !isFinite(v) ? "–" : v.toLocaleString("it-IT", { minimumFractionDigits: d, maximumFractionDigits: d });
const dec = (v) => (v != null && Math.abs(v) < 10 ? 4 : 2);
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

const st = { sym: null, quote: null, hist: null, gran: "day", range: "6M", showAll: false, onAsk: null, favs: null };
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

function drawChart(pts) {
  const box = $("#dt-chart");
  if (pts.length < 2) { box.innerHTML = '<div class="empty">Storico non disponibile per questo intervallo.</div>'; return; }
  const W = Math.max(box.clientWidth, 280), H = 260, padL = 8, padR = 58, padT = 12, padB = 26, volH = 34;
  const closes = pts.map((p) => p[1]);
  let min = Math.min(...closes), max = Math.max(...closes);
  const pad = (max - min) * 0.08 || max * 0.01; min -= pad; max += pad;
  const plotH = H - padT - padB - volH;
  const x = (i) => padL + (i / (pts.length - 1)) * (W - padL - padR);
  const y = (v) => padT + (1 - (v - min) / (max - min)) * plotH;
  const up = closes.at(-1) >= closes[0];
  const color = `var(${up ? "--up" : "--down"})`;
  const line = pts.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(p[1]).toFixed(1)}`).join("");
  const area = `${line}L${x(pts.length - 1).toFixed(1)},${padT + plotH}L${x(0).toFixed(1)},${padT + plotH}Z`;
  const ticks = niceTicks(min, max);
  const d = dec(max);
  const span = pts.at(-1)[0] - pts[0][0];
  const nx = Math.min(W < 420 ? 3 : 5, pts.length - 1);
  const xIdx = Array.from({ length: nx + 1 }, (_, k) => Math.round((k / nx) * (pts.length - 1)));
  const vols = pts.map((p) => p[2] || 0), vmax = Math.max(...vols);
  const bw = Math.max(1, (W - padL - padR) / pts.length - 1);
  const volBase = H - padB;
  box.innerHTML = `
  <svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="Grafico prezzo">
    <defs><linearGradient id="dtg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${color}" stop-opacity=".25"/><stop offset="1" stop-color="${color}" stop-opacity="0"/></linearGradient></defs>
    ${ticks.map((t) => `<line x1="${padL}" x2="${W - padR}" y1="${y(t)}" y2="${y(t)}" class="grid"/>
      <text x="${W - padR + 6}" y="${y(t) + 4}" class="ax">${nf(t, d)}</text>`).join("")}
    <line x1="${padL}" x2="${W - padR}" y1="${y(closes[0])}" y2="${y(closes[0])}" class="ref"/>
    ${vmax ? vols.map((v, i) => v ? `<rect x="${(x(i) - bw / 2).toFixed(1)}" y="${(volBase - (v / vmax) * volH).toFixed(1)}" width="${bw.toFixed(1)}" height="${((v / vmax) * volH).toFixed(1)}" class="vol"/>` : "").join("") : ""}
    <path d="${area}" fill="url(#dtg)"/>
    <path d="${line}" fill="none" stroke="${color}" stroke-width="2" stroke-linejoin="round"/>
    ${xIdx.map((i, k) => `<text x="${x(i)}" y="${H - 8}" class="ax" text-anchor="${k === 0 ? "start" : k === nx ? "end" : "middle"}">${esc(fmtX(pts[i][0], st.gran, span))}</text>`).join("")}
    <g id="dt-cross" style="display:none">
      <line id="dt-cx" y1="${padT}" y2="${padT + plotH}" class="cross"/>
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
    $("#dt-cc").setAttribute("cx", x(i)); $("#dt-cc").setAttribute("cy", y(p[1]));
    const chg = ((p[1] - closes[0]) / closes[0]) * 100;
    tip.hidden = false;
    tip.innerHTML = `<b>${nf(p[1], dec(p[1]))}</b> ${pct(chg)}<br><small>${esc(fmtFull(p[0], st.gran))}${p[2] ? ` · vol. ${compact(p[2])}` : ""}</small>`;
    const left = (x(i) / W) * r.width;
    tip.style.left = `${Math.min(Math.max(left - tip.offsetWidth / 2, 0), r.width - tip.offsetWidth)}px`;
  };
  const hide = () => { cross.style.display = "none"; tip.hidden = true; };
  hit.addEventListener("pointermove", show);
  hit.addEventListener("pointerdown", show);
  hit.addEventListener("pointerleave", hide);
}

function renderSegs() {
  $("#dt-gran").innerHTML = Object.keys(RANGES).map((g) => `<button data-v="${g}" class="${g === st.gran ? "on" : ""}">${LABELS[g]}</button>`).join("");
  $("#dt-range").innerHTML = RANGES[st.gran].map(([k]) => `<button data-v="${k}" class="${k === st.range ? "on" : ""}">${k}</button>`).join("");
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

  $("#dt-period").innerHTML = pts.length
    ? `Variazione ${esc(st.range)}: ${pct(rangeChg)} · max ${nf(Math.max(...closes), dec(last))} · min ${nf(Math.min(...closes), dec(last))}`
    : "";
  drawChart(pts);

  const stats = [
    ["Chiusura prec.", nf(q.prevClose, dec(q.prevClose))],
    ["Min – max giorno", `${nf(q.dayLow, dec(q.dayLow))} – ${nf(q.dayHigh, dec(q.dayHigh))}`],
    ["Min – max 52 sett.", `${nf(q.low52, dec(q.low52))} – ${nf(q.high52, dec(q.high52))}`],
    ["Volume", compact(q.volume)],
    ["1 settimana", pct(q.weekPct)],
    ["1 mese", pct(q.monthPct)],
    ["1 anno", pct(q.yearPct)],
    ["Borsa", esc(q.exchange ?? "–")],
  ];
  $("#dt-stats").innerHTML = stats.map(([k, v]) => `<div><small>${k}</small><b>${v}</b></div>`).join("");

  // Storico: righe del periodo, dalla più recente
  const rows = pts.map((p, i) => [p, i ? ((p[1] - pts[i - 1][1]) / pts[i - 1][1]) * 100 : null]).reverse();
  const shown = st.showAll ? rows : rows.slice(0, 30);
  $("#dt-hist-title").textContent = `Storico (${LABELS[st.gran].toLowerCase()}, ${st.range}) · ${rows.length} rilevazioni`;
  $("#dt-hist").innerHTML = shown.map(([p, c]) => `<tr><td>${esc(fmtFull(p[0], st.gran))}</td><td>${nf(p[1], dec(p[1]))}</td><td>${pct(c)}</td><td>${p[2] ? compact(p[2]) : "–"}</td></tr>`).join("")
    || '<tr><td colspan="4" class="empty">Nessun dato.</td></tr>';
  $("#dt-hist-more").hidden = st.showAll || rows.length <= 30;
}

async function loadHist(sym) {
  if (!cache.has(sym)) {
    const file = sym.replace(/[^A-Za-z0-9.-]/g, "_");
    cache.set(sym, fetch(`data/hist/${file}.json?t=${Math.floor(Date.now() / 300000)}`).then((r) => (r.ok ? r.json() : null)).catch(() => null));
  }
  return cache.get(sym);
}

function setFavBtn() {
  const on = !!st.favs?.has(st.sym);
  const b = $("#dt-fav");
  b.setAttribute("aria-pressed", on);
  b.textContent = on ? "★ Preferito" : "☆ Preferito";
}

export async function openDetail(sym, quote) {
  st.sym = sym; st.quote = quote; st.showAll = false;
  setFavBtn();
  st.gran = pref("dt-gran", "day");
  st.range = pref(`dt-range-${st.gran}`, DEFAULT_RANGE[st.gran]);
  const q = quote ?? { name: sym };
  $("#dt-name").textContent = q.longName || q.name || sym;
  $("#dt-sym").textContent = [sym, q.type === "INDEX" ? "Indice" : q.type === "CURRENCY" ? "Valuta" : q.type === "FUTURE" ? "Future" : q.type === "CRYPTOCURRENCY" ? "Cripto" : null].filter(Boolean).join(" · ");
  $("#dt-price").innerHTML = `${nf(q.price, dec(q.price))} <small>${esc(q.currency ?? "")}</small> ${pct(q.changePct)}`;
  $("#dt-time").textContent = q.time ? `Ultima quotazione: ${new Date(q.time).toLocaleString("it-IT")}${q.stale ? " (dato non aggiornato)" : ""} · dati ritardati` : "";
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

export function initDetail({ onAsk, quoteFor, favs }) {
  st.onAsk = onAsk; st.favs = favs;
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
  $("#dt-ask").addEventListener("click", () => {
    const q = st.quote ?? {};
    closeDetail();
    st.onAsk?.(`Analizza ${q.longName || q.name || st.sym} (${st.sym}): andamento recente (oggi ${nf(q.changePct)}%, 1 settimana ${nf(q.weekPct)}%, 1 mese ${nf(q.monthPct)}%, 1 anno ${nf(q.yearPct)}%), notizie e fattori che lo influenzano. Cerca sul web le notizie più recenti.`);
  });
  addEventListener("popstate", () => {
    const m = location.hash.match(/^#q=(.+)$/);
    if (m) { const s = decodeURIComponent(m[1]); openDetail(s, quoteFor(s)); } else closeDetail(true);
  });
  addEventListener("keydown", (e) => { if (e.key === "Escape") closeDetail(); });
  let rt; addEventListener("resize", () => { clearTimeout(rt); rt = setTimeout(() => { if (!$("#detail").hidden && st.hist) render(); }, 150); });
  const m = location.hash.match(/^#q=(.+)$/);
  if (m) { const s = decodeURIComponent(m[1]); history.replaceState(null, "", location.pathname); openDetail(s, quoteFor(s)); }
}
