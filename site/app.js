import { initDetail, openDetail, loadHist } from "./detail.js";

const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];
const store = {
  get(k, d) { try { return localStorage.getItem(k) ?? d; } catch { return d; } },
  set(k, v) { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch {} },
};
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const DAY = 864e5;

const state = {
  config: null, markets: null, news: {},
  country: store.get("country", "IT"),
  scope: "country", period: "day", query: "", shown: 40,
  mkField: "changePct",
};

// ---------------- preferiti ----------------
const favs = {
  list() { try { return JSON.parse(store.get("favs", "[]")); } catch { return []; } },
  has(sym) { return this.list().includes(sym); },
  toggle(sym) {
    const l = this.list(); const i = l.indexOf(sym);
    i >= 0 ? l.splice(i, 1) : l.push(sym);
    store.set("favs", JSON.stringify(l));
    renderMarkets(); renderSearch();
    return i < 0;
  },
};
const starBtn = (sym) => { const on = favs.has(sym);
  return `<button class="star" data-star="${esc(sym)}" aria-pressed="${on}" aria-label="${on ? "Rimuovi dai" : "Aggiungi ai"} preferiti">${on ? "★" : "☆"}</button>`; };

async function getJSON(url) {
  const res = await fetch(`${url}?t=${Math.floor(Date.now() / 300000)}`);
  if (!res.ok) throw new Error(`${url}: ${res.status}`);
  return res.json();
}

// ---------------- formattazione ----------------
const nf = (v, d = 2) => v == null ? "–" : v.toLocaleString("it-IT", { minimumFractionDigits: d, maximumFractionDigits: d });
const pctHtml = (v) => v == null ? '<span class="chg">–</span>'
  : `<span class="chg ${v >= 0 ? "pos" : "neg"}">${v >= 0 ? "+" : ""}${nf(v)}%</span>`;
const fmtTime = (iso) => new Date(iso).toLocaleString("it-IT", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
function ago(iso) {
  const m = Math.round((Date.now() - new Date(iso)) / 60000);
  if (m < 60) return `${Math.max(m, 1)} min fa`;
  if (m < 1440) return `${Math.round(m / 60)} h fa`;
  return new Date(iso).toLocaleDateString("it-IT", { weekday: "short", day: "numeric", month: "short" });
}
function spark(arr, up) {
  if (!arr || arr.length < 2) return "";
  const min = Math.min(...arr), max = Math.max(...arr), r = max - min || 1;
  const pts = arr.map((v, i) => `${(i / (arr.length - 1)) * 100},${28 - ((v - min) / r) * 26}`).join(" ");
  return `<svg viewBox="0 0 100 30" preserveAspectRatio="none" aria-hidden="true"><polyline points="${pts}" fill="none" stroke="var(${up ? "--up" : "--down"})" stroke-width="2" vector-effect="non-scaling-stroke"/></svg>`;
}

// ---------------- notizie ----------------
async function loadNews(code) {
  if (!state.news[code]) state.news[code] = getJSON(`data/news-${code}.json`).catch(() => ({ items: [] }));
  return state.news[code];
}

function currentNewsKey() { return state.scope === "world" ? "WORLD" : state.country; }

async function filteredNews(key = currentNewsKey(), period = state.period) {
  const data = await loadNews(key);
  const limit = period === "day" ? DAY : 7 * DAY;
  const q = state.query.trim().toLowerCase();
  return { data, items: data.items.filter((n) => Date.now() - new Date(n.date) < limit && (!q || `${n.title} ${n.source}`.toLowerCase().includes(q))) };
}

async function renderNews() {
  const list = $("#news-list");
  const { data, items } = await filteredNews();
  const c = state.scope === "world" ? state.config.world : state.config.countries[state.country];
  $("#news-meta").textContent = `${c.flag} ${c.name} · ${state.period === "day" ? "ultime 24 ore" : "ultimi 7 giorni"} · ${items.length} notizie` +
    (data.updated ? ` · aggiornato ${fmtTime(data.updated)}` : "");
  list.innerHTML = items.length ? items.slice(0, state.shown).map((n) => `
    <li><a href="${esc(n.link)}" target="_blank" rel="noopener">${esc(n.title)}</a>
      <div class="src"><span>${esc(n.source)}</span><span>${ago(n.date)}</span><span class="tag">${esc(n.lang)}</span></div></li>`).join("")
    : `<li class="empty">Nessuna notizia trovata.</li>`;
  $("#news-more").hidden = items.length <= state.shown;
}

// ---------------- mercati ----------------
let quoteMap = null;
function bySymbol(sym) {
  if (!quoteMap && state.markets) quoteMap = new Map(state.markets.quotes.map((q) => [q.symbol, q]));
  return quoteMap?.get(sym) ?? dirMap?.get(sym);
}

// ---------------- directory mondiale (titoli non monitorati) ----------------
let dirMap = null, dirPromise = null;
function loadDirectory() {
  dirPromise ??= getJSON("data/directory.json").then((d) => {
    dirMap = new Map();
    for (const [symbol, name, exchange, currency, price, changePct, marketCap, region] of d.items) {
      dirMap.set(symbol, { symbol, name, longName: name, exchange, currency, price, changePct, marketCap, region, type: "EQUITY", dir: true });
    }
    // capitalizzazione anche per i titoli monitorati
    for (const q of state.markets?.quotes ?? []) { const x = dirMap.get(q.symbol); if (x) q.marketCap ??= x.marketCap; }
    state.dirUpdated = d.updated;
    searchIndex = null;
    return dirMap;
  }).catch(() => { dirPromise = null; return null; });
  return dirPromise;
}
const isMonitored = (sym) => { bySymbol(""); return !!quoteMap?.has(sym); };

// Richieste di aggiunta al monitoraggio (via issue GitHub, gestite dal workflow "Aggiungi titoli")
const pending = {
  all() { try { return JSON.parse(store.get("pendingAdds", "{}")); } catch { return {}; } },
  get(sym) { const t = this.all()[sym]; return t && Date.now() - t < 6 * 3600e3 ? t : null; },
  set(sym) { const a = this.all(); a[sym] = Date.now(); store.set("pendingAdds", JSON.stringify(a)); },
  prune() { const a = this.all(); for (const k of Object.keys(a)) if (isMonitored(k) || Date.now() - a[k] > 6 * 3600e3) delete a[k]; store.set("pendingAdds", JSON.stringify(a)); },
};
function issueUrl(title, body = "") {
  const repo = state.config.repo ?? "RickBortCost/BortEconomy";
  return `https://github.com/${repo}/issues/new?title=${encodeURIComponent(title)}&body=${encodeURIComponent(body)}`;
}
function requestAdd(sym) {
  window.open(issueUrl(`Aggiungi titolo: ${sym}`, `Richiesta inviata da BortEconomy.\n\n${sym}`), "_blank", "noopener");
  pending.set(sym);
  if (!favs.has(sym)) favs.toggle(sym);
}
function requestSearch(term) {
  window.open(issueUrl(`Aggiungi titolo: ${term}`, "Richiesta di ricerca inviata da BortEconomy: il workflow risponderà con i titoli trovati su Yahoo Finance."), "_blank", "noopener");
}

function tiles(symbols) {
  return symbols.map(bySymbol).filter(Boolean).map((q) => `
    <div class="tile" data-sym="${esc(q.symbol)}" tabindex="0" role="button" title="Dettaglio ${esc(q.name)}">
      <div class="n">${esc(q.name)}</div>
      <div class="p">${nf(q.price, q.price < 10 ? 4 : 2)}</div>
      ${pctHtml(q[state.mkField])}
      ${spark(q.spark, (q[state.mkField] ?? 0) >= 0)}
    </div>`).join("") || `<div class="empty">Dati non disponibili.</div>`;
}

function rows(quotes, { star = false, empty = "Dati non disponibili.", group = false, field = state.mkField } = {}) {
  return quotes.map((q) => `
    <li data-sym="${esc(q.symbol)}" tabindex="0" role="button" class="${star ? "has-star" : ""}">${star ? starBtn(q.symbol) : ""}
      <div class="nm"><b>${esc(q.name)}</b><small>${esc(q.symbol)}${group ? ` · <span class="grp">${esc(groupLabel(q))}</span>` : ""}${q.dir
        ? ` <span class="tag ${pending.get(q.symbol) ? "wait" : "new"}">${pending.get(q.symbol) ? "richiesto" : "non monitorato"}</span>` : ""}</small></div>
      <div class="px">${nf(q.price, q.price < 10 ? 4 : 2)} <small>${esc(q.currency ?? "")}</small></div>${pctHtml(q[field])}</li>`).join("")
    || `<li class="empty">${empty}</li>`;
}

const groupLabel = (q) => q.dir ? `${q.exchange} · ${state.config.regions?.[q.region] ?? ""}` : state.config.catalog?.[q.group]?.name ?? q.exchange ?? "";

// ---------------- ricerca titoli ----------------
const norm = (s) => String(s ?? "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
let searchIndex = null;
function buildIndex() {
  const al = state.config.aliases ?? {};
  const entry = (q) => ({ q, sym: norm(q.symbol), text: norm(`${q.name} ${q.longName} ${q.exchange} ${groupLabel(q)} ${al[q.symbol] ?? ""}`) });
  searchIndex = (state.markets?.quotes ?? []).map(entry);
  if (dirMap) for (const q of dirMap.values()) if (!quoteMap?.has(q.symbol)) searchIndex.push(entry(q));
}
function searchQuotes(term, limit = 30) {
  const t = norm(term).trim(); if (!t) return [];
  if (!searchIndex) buildIndex();
  const words = t.split(/\s+/);
  const tc = t.replace(/[^a-z0-9]/g, "");
  const wordRe = words.map((w) => new RegExp(`(^|[^a-z0-9])${w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`));
  const scored = [];
  for (const e of searchIndex) {
    let score = 0;
    if (e.sym === t) score = 100;
    else if (e.sym.startsWith(t)) score = t.length <= 5 ? 80 : 55; // i prefissi di simbolo contano solo per termini brevi
    else if (tc.length > 1 && tc.length <= 6 && e.sym.replace(/[^a-z0-9]/g, "").startsWith(tc)) score = 70;
    if (words.every((w) => e.text.includes(w) || e.sym.includes(w))) {
      if (wordRe.every((re) => re.test(e.text))) score = Math.max(score, 60);
      else if (t.length >= 4) score = Math.max(score, 40); // corrispondenze interne solo per termini lunghi
    }
    if (!score) continue;
    // a parità: prima i monitorati, poi le società più grandi
    scored.push([score + (e.q.dir ? 0 : 5) - (e.q.type === "EQUITY" ? 0 : 1), e.q.marketCap ?? 0, e.q]);
  }
  return scored.sort((a, b) => b[0] - a[0] || b[1] - a[1]).slice(0, limit).map((x) => x[2]);
}
function renderSearch() {
  const box = $("#q-results"), term = $("#q-input").value.trim();
  if (!term) { box.hidden = true; box.innerHTML = ""; return; }
  if (!dirMap) loadDirectory().then((m) => { if (m && $("#q-input").value.trim()) renderSearch(); });
  const res = searchQuotes(term);
  box.hidden = false;
  const total = (state.markets?.quotes.length ?? 0) + (dirMap ? dirMap.size : 0);
  box.innerHTML = rows(res, { star: true, group: true, empty: `Nessun titolo trovato per “${esc(term)}” tra ${total.toLocaleString("it-IT")} titoli.` })
    + (dirMap ? "" : `<li class="empty">Caricamento dell'elenco mondiale dei titoli…</li>`)
    + `<li class="q-more"><button type="button" data-req="${esc(term)}">🔎 Non lo trovi? Cerca “${esc(term)}” su Yahoo Finance e aggiungilo</button></li>`;
}

function movers(n = 8) {
  const f = state.mkField;
  const qs = (state.markets?.quotes ?? []).filter((q) => q.type === "EQUITY" && !q.stale && q[f] != null).sort((a, b) => b[f] - a[f]);
  return { gainers: qs.slice(0, n), losers: qs.slice(-n).reverse() };
}

function renderMarkets() {
  if (!state.markets) { $("#mk-meta").textContent = "Dati di mercato non disponibili."; return; }
  const c = state.config.countries[state.country];
  $("#mk-meta").textContent = `Quotazioni ritardate · aggiornato ${fmtTime(state.markets.updated)} · variazione ${state.mkField === "changePct" ? "giornaliera" : "settimanale"}`;
  $("#mk-favs").innerHTML = rows(favs.list().map(bySymbol).filter(Boolean), { star: true, group: true,
    empty: "Nessun preferito. Cerca un titolo o aprine uno e tocca ☆ per aggiungerlo qui." });
  const idx = [...new Set([c.index, ...state.config.globalIndices])];
  $("#mk-indices").innerHTML = tiles(idx);
  $("#mk-macro").innerHTML = tiles(state.config.macro);
  const { gainers, losers } = movers();
  $("#mk-gainers").innerHTML = rows(gainers);
  $("#mk-losers").innerHTML = rows(losers);
  $("#mk-country-title").textContent = `${c.flag} Titoli principali – ${c.name}`;
  const f = state.mkField;
  $("#mk-country").innerHTML = rows(c.stocks.map(bySymbol).filter(Boolean).sort((a, b) => (b[f] ?? -1e9) - (a[f] ?? -1e9)));
}

// ---------------- metalli preziosi ----------------
const mt = { field: "changePct", cur: store.get("mt-cur", "EUR"), ratios: new Map() };
const metal = (sym) => state.config.metals?.items.find((m) => m.symbol === sym);
const eurusd = () => bySymbol(state.config.metals?.fx ?? "EURUSD=X")?.price; // USD per 1 EUR
function inCur(usd, cur = mt.cur) {
  if (usd == null) return null;
  if (cur === "USD") return usd;
  const r = eurusd();
  return r ? usd / r : null;
}
const money = (v, cur = mt.cur, d) => v == null || !isFinite(v) ? "–" : `${nf(v, d ?? (Math.abs(v) < 10 ? 3 : 2))} ${cur === "EUR" ? "€" : "$"}`;
const unitShort = (m) => (m.unit === "libbra" ? "lb" : "oz");

// Rapporto tra due metalli su 1 anno (chiusure giornaliere allineate per data)
async function ratioSeries(a, b) {
  const key = `${a}/${b}`;
  if (!mt.ratios.has(key)) {
    mt.ratios.set(key, Promise.all([loadHist(a), loadHist(b)]).then(([ha, hb]) => {
      if (!ha?.day?.length || !hb?.day?.length) return [];
      const day = (t) => Math.floor(t / 86400);
      const mb = new Map(hb.day.map((p) => [day(p[0]), p[1]]));
      const from = ha.day.at(-1)[0] - 365 * 86400;
      return ha.day.filter((p) => p[0] >= from && mb.has(day(p[0]))).map((p) => [p[0], p[1] / mb.get(day(p[0]))]);
    }));
  }
  return mt.ratios.get(key);
}

function ratioSvg(series, avg) {
  const vals = series.map((p) => p[1]);
  const min = Math.min(...vals), max = Math.max(...vals), r = max - min || 1;
  const y = (v) => 44 - ((v - min) / r) * 40;
  const pts = vals.map((v, i) => `${(i / (vals.length - 1)) * 100},${y(v)}`).join(" ");
  return `<svg viewBox="0 0 100 46" preserveAspectRatio="none" aria-hidden="true">
    <line x1="0" x2="100" y1="${y(avg)}" y2="${y(avg)}" stroke="var(--muted)" stroke-dasharray="2 3" vector-effect="non-scaling-stroke"/>
    <polyline points="${pts}" fill="none" stroke="var(--accent)" stroke-width="2" vector-effect="non-scaling-stroke"/></svg>`;
}

async function renderMetals() {
  const M = state.config.metals;
  if (!M || !state.markets) return;
  const f = mt.field, fx = eurusd();
  const items = M.items.map((m) => ({ ...m, q: bySymbol(m.symbol) })).filter((x) => x.q);
  const label = { changePct: "giornaliera", weekPct: "settimanale", monthPct: "mensile", yearPct: "annuale" }[f];
  $("#mt-meta").textContent = `Future continui COMEX/NYMEX in USD${mt.cur === "EUR" && fx ? `, convertiti in euro al cambio EUR/USD ${nf(fx, 4)}` : ""} · variazione ${label} · aggiornato ${fmtTime(state.markets.updated)} · dati ritardati`;

  $("#mt-cards").innerHTML = items.map(({ q, ...m }) => `
    <div class="tile mt-card" data-sym="${esc(q.symbol)}" tabindex="0" role="button" title="Dettaglio ${esc(m.name)}">
      <div class="hd"><span class="ic">${m.icon}</span>${esc(m.name)}${m.industrial ? ' <small class="tag">industriale</small>' : ""}</div>
      <div class="p">${money(inCur(q.price))} <span class="u">/${unitShort(m)}</span></div>
      ${pctHtml(q[f])}
      <div class="g">${money(inCur(q.price) / m.grams, mt.cur, m.industrial ? 4 : undefined)} al grammo</div>
      ${spark(q.spark, (q[f] ?? 0) >= 0)}
    </div>`).join("") || `<div class="empty">Dati non disponibili.</div>`;

  $("#mt-h-unit").textContent = "Oncia troy / libbra";
  $("#mt-units").innerHTML = items.map(({ q, ...m }) => {
    const u = inCur(q.price), g = u == null ? null : u / m.grams;
    return `<tr data-sym="${esc(q.symbol)}"><td>${m.icon} ${esc(m.name)}</td><td>${money(u)} <small>/${unitShort(m)}</small></td><td>${money(g, mt.cur, g != null && g < 1 ? 4 : undefined)}</td><td>${money(g == null ? null : g * 1000)}</td></tr>`;
  }).join("");

  $("#mt-perf").innerHTML = items.map(({ q, ...m }) => `<tr data-sym="${esc(q.symbol)}"><td>${m.icon} ${esc(m.name)}</td>
    <td>${pctHtml(q.changePct)}</td><td>${pctHtml(q.weekPct)}</td><td>${pctHtml(q.monthPct)}</td><td>${pctHtml(q.yearPct)}</td>
    <td>${pctHtml(q.high52 ? (q.price / q.high52 - 1) * 100 : null)}</td></tr>`).join("");

  $("#mt-etc").innerHTML = rows(M.etc.map(bySymbol).filter(Boolean), { star: true, field: f });
  $("#mt-miners").innerHTML = rows(M.miners.map(bySymbol).filter(Boolean), { star: true, field: f });

  // Rapporti tra metalli (storico giornaliero di 1 anno)
  const box = $("#mt-ratios");
  if (!box.dataset.ready) {
    box.innerHTML = M.ratios.map(([, , name]) => `<div class="tile mt-ratio"><div class="n">${esc(name)}</div><div class="empty">Caricamento…</div></div>`).join("");
  }
  Promise.all(M.ratios.map(async ([a, b, name]) => {
    const qa = bySymbol(a), qb = bySymbol(b);
    const now = qa && qb ? qa.price / qb.price : null;
    const s = await ratioSeries(a, b);
    if (s.length < 2 || now == null) return `<div class="tile mt-ratio"><div class="n">${esc(name)}</div><div class="empty">Non disponibile</div></div>`;
    const vals = s.map((p) => p[1]);
    const avg = vals.reduce((x, y) => x + y, 0) / vals.length;
    const vsAvg = (now / avg - 1) * 100;
    const d = now < 10 ? 3 : 1;
    return `<div class="tile mt-ratio"><div class="n">${esc(name)}</div>
      <div class="p">${nf(now, d)}</div>
      <small>media 1 anno ${nf(avg, d)} (${vsAvg >= 0 ? "+" : ""}${nf(vsAvg, 1)}%) · min ${nf(Math.min(...vals), d)} · max ${nf(Math.max(...vals), d)}</small>
      ${ratioSvg(s, avg)}</div>`;
  })).then((html) => { box.innerHTML = html.join(""); box.dataset.ready = "1"; });

  const news = await loadNews("METALS");
  $("#mt-news").innerHTML = news.items.length ? news.items.slice(0, 12).map((n) => `
    <li><a href="${esc(n.link)}" target="_blank" rel="noopener">${esc(n.title)}</a>
      <div class="src"><span>${esc(n.source)}</span><span>${ago(n.date)}</span><span class="tag">${esc(n.lang)}</span></div></li>`).join("")
    : `<li class="empty">Nessuna notizia disponibile.</li>`;
}

function metalsContext() {
  const M = state.config.metals;
  if (!M) return "";
  return M.items.map((m) => {
    const q = bySymbol(m.symbol);
    if (!q) return null;
    return `${m.name}: ${nf(q.price)} USD/${unitShort(m)} (${money(inCur(q.price, "EUR") / m.grams, "EUR", 3)}/g; giorno ${nf(q.changePct)}%, settimana ${nf(q.weekPct)}%, mese ${nf(q.monthPct)}%, anno ${nf(q.yearPct)}%)`;
  }).filter(Boolean).join("; ");
}

// ---------------- Claude ----------------
let anthropicMod = null;
const chat = { messages: [], busy: false };

function md(text) {
  const inline = (s) => esc(s)
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>')
    .replace(/\*\*([^*]+)\*\*/g, "<b>$1</b>")
    .replace(/(^|[^*])\*([^*\n]+)\*/g, "$1<i>$2</i>");
  let html = "", list = null;
  for (const line of text.split("\n")) {
    const li = line.match(/^\s*(?:[-*•]|\d+[.)])\s+(.*)/);
    if (li) { if (!list) { html += "<ul>"; list = true; } html += `<li>${inline(li[1])}</li>`; continue; }
    if (list) { html += "</ul>"; list = null; }
    const h = line.match(/^#{1,6}\s+(.*)/);
    if (h) html += `<h4>${inline(h[1])}</h4>`;
    else if (line.trim()) html += `<p>${inline(line)}</p>`;
  }
  return html + (list ? "</ul>" : "");
}

async function buildContext() {
  const c = state.config.countries[state.country];
  const [local, world] = await Promise.all([filteredNews(state.country, "week"), filteredNews("WORLD", "week")]);
  const fmt = (arr, n) => arr.slice(0, n).map((x) => `- [${x.date.slice(0, 16).replace("T", " ")}] ${x.title} (${x.source})`).join("\n");
  const q = (s) => { const x = bySymbol(s); return x ? `${x.name}: ${nf(x.price)} (giorno ${nf(x.changePct)}%, settimana ${nf(x.weekPct)}%)` : null; };
  const saved = state.mkField; state.mkField = "changePct";
  const { gainers, losers } = movers(6); state.mkField = saved;
  return `Data e ora attuali: ${new Date().toLocaleString("it-IT")}. Paese selezionato dall'utente: ${c.name}.

<mercati aggiornati="${state.markets?.updated ?? "n/d"}">
Indici: ${[c.index, ...state.config.globalIndices].map(q).filter(Boolean).join("; ")}
Macro: ${state.config.macro.map(q).filter(Boolean).join("; ")}
Metalli: ${metalsContext()}
Preferiti dell'utente: ${favs.list().map(q).filter(Boolean).join("; ") || "nessuno"}
Migliori titoli oggi: ${gainers.map((x) => `${x.name} ${nf(x.changePct)}%`).join(", ")}
Peggiori titoli oggi: ${losers.map((x) => `${x.name} ${nf(x.changePct)}%`).join(", ")}
Titoli ${c.name}: ${c.stocks.map(q).filter(Boolean).join("; ")}
</mercati>

<notizie_paese paese="${c.name}">
${fmt(local.items, 60)}
</notizie_paese>

<notizie_mondo>
${fmt(world.items, 60)}
</notizie_mondo>`;
}

function systemPrompt(context) {
  return `Sei l'analista economico di BortEconomy, un'app di notizie finanziarie. Rispondi in italiano, in modo chiaro e sintetico, usando Markdown semplice (titoli brevi, elenchi puntati, grassetto).
Basati sui titoli di notizie e sui dati di mercato forniti qui sotto (raccolti automaticamente, possono essere incompleti o in lingue diverse). Se servono informazioni più recenti o dettagli non presenti, usa la ricerca web quando disponibile e cita le fonti.
Distingui i fatti dalle tue interpretazioni. Non dare consigli di investimento personalizzati; se richiesto, offri considerazioni generali e ricorda i rischi.

${context}`;
}

function addMsg(cls, html) {
  const d = document.createElement("div");
  d.className = `msg ${cls}`; d.innerHTML = html;
  $("#chat").append(d); d.scrollIntoView({ block: "end", behavior: "smooth" });
  return d;
}

async function ask(text) {
  const key = store.get("apiKey", "");
  if (!key) { $("#settings").showModal(); return; }
  if (chat.busy || !text.trim()) return;
  chat.busy = true; $("#send").disabled = true;
  addMsg("user", esc(text).replace(/\n/g, "<br>"));
  const bot = addMsg("bot", '<span class="status">Claude sta analizzando…</span>');
  chat.messages.push({ role: "user", content: text });

  try {
    anthropicMod ??= await import("https://cdn.jsdelivr.net/npm/@anthropic-ai/sdk@1.6.0/+esm");
    const Anthropic = anthropicMod.default ?? anthropicMod.Anthropic;
    const client = new Anthropic({ apiKey: key, dangerouslyAllowBrowser: true });
    const model = store.get("model", "claude-opus-5-5");
    const isHaiku = model.startsWith("claude-haiku");
    const params = {
      model,
      max_tokens: 16000,
      system: systemPrompt(await buildContext()),
      output_config: { effort: "medium" },
      messages: chat.messages,
    };
    if (store.get("web", "1") === "1") {
      params.tools = [{ type: isHaiku ? "web_search_20250305" : "web_search_20260209", name: "web_search", max_uses: 5 }];
    }
    if (!isHaiku) { params.betas = ["server-side-fallback-2026-07-01"]; params.fallbacks = "default"; }

    let final, live = "";
    for (let turn = 0; turn < 4; turn++) {
      const stream = client.beta.messages.stream(params);
      stream.on("text", (d) => { live += d; bot.innerHTML = md(live); });
      stream.on("contentBlock", (b) => {
        if (b.type === "server_tool_use" && !live) bot.innerHTML = '<span class="status">Ricerca sul web in corso…</span>';
      });
      final = await stream.finalMessage();
      chat.messages.push({ role: "assistant", content: final.content });
      if (final.stop_reason !== "pause_turn") break;
      live += "\n";
    }

    if (final.stop_reason === "refusal") {
      bot.classList.add("err");
      bot.textContent = "Claude ha declinato questa richiesta. Prova a riformularla.";
      chat.messages.splice(chat.messages.findLastIndex((m) => m.role === "user"));
    } else {
      // Mostra solo il testo dopo un eventuale passaggio al modello di fallback
      const blocks = final.content;
      const lastFb = blocks.map((b) => b.type).lastIndexOf("fallback");
      const text = blocks.slice(lastFb + 1).filter((b) => b.type === "text").map((b) => b.text).join("") || live;
      const sources = new Map();
      for (const b of blocks) {
        for (const c of b.citations ?? []) if (c.url) sources.set(c.url, c.title || c.url);
      }
      bot.innerHTML = md(text) + (sources.size
        ? `<div class="sources"><b>Fonti:</b> ${[...sources].slice(0, 8).map(([u, t]) => `<a href="${esc(u)}" target="_blank" rel="noopener">${esc(t)}</a>`).join(" · ")}</div>`
        : "");
      if (final.stop_reason === "max_tokens") bot.innerHTML += '<p class="status">Risposta troncata.</p>';
    }
  } catch (e) {
    chat.messages.splice(chat.messages.findLastIndex((m) => m.role === "user"));
    bot.classList.add("err");
    const status = e?.status;
    bot.textContent = status === 401 ? "Chiave API non valida. Controlla le impostazioni."
      : status === 429 ? "Limite di richieste raggiunto. Riprova tra poco."
      : status === 529 || status >= 500 ? "Servizio Claude momentaneamente sovraccarico. Riprova."
      : `Errore: ${e?.message ?? e}`;
  } finally {
    chat.busy = false; $("#send").disabled = false;
  }
}

// ---------------- tema ----------------
const THEMES = { auto: ["🌓", "automatico (sistema)"], light: ["☀️", "chiaro"], dark: ["🌙", "scuro"] };
const darkMQ = matchMedia("(prefers-color-scheme: dark)");
function applyTheme(t) {
  if (t === "light" || t === "dark") document.documentElement.dataset.theme = t;
  else delete document.documentElement.dataset.theme;
  const dark = t === "dark" || (t === "auto" && darkMQ.matches);
  document.querySelector('meta[name="theme-color"]').content = dark ? "#111827" : "#ffffff";
  const b = $("#theme-btn");
  b.textContent = THEMES[t][0];
  b.title = b.ariaLabel = `Tema: ${THEMES[t][1]} – tocca per cambiare`;
}
function initTheme() {
  let t = store.get("theme", "auto"); if (!THEMES[t]) t = "auto";
  applyTheme(t);
  $("#theme-btn").addEventListener("click", () => {
    const order = Object.keys(THEMES);
    t = order[(order.indexOf(t) + 1) % order.length];
    store.set("theme", t === "auto" ? null : t);
    applyTheme(t);
  });
  darkMQ.addEventListener("change", () => applyTheme(t));
}

// ---------------- UI ----------------
function setTab(t) {
  $$(".tabs button").forEach((b) => b.setAttribute("aria-selected", b.dataset.tab === t));
  $$(".panel").forEach((p) => p.classList.toggle("active", p.id === `tab-${t}`));
  document.body.classList.toggle("ai", t === "ai");
  store.set("tab", t);
  if (t === "metals") renderMetals();
}

function seg(id, onChange) {
  $(id).addEventListener("click", (e) => {
    const b = e.target.closest("button"); if (!b) return;
    $$(`${id} button`).forEach((x) => x.classList.toggle("on", x === b));
    onChange(b.dataset.v);
  });
}

async function init() {
  initTheme();
  state.config = await getJSON("config.json");
  if (!state.config.countries[state.country]) state.country = "IT";
  const sel = $("#country");
  sel.innerHTML = Object.entries(state.config.countries).map(([k, c]) => `<option value="${k}">${c.flag} ${c.name}</option>`).join("");
  sel.value = state.country;
  sel.addEventListener("change", () => { state.country = sel.value; store.set("country", sel.value); state.shown = 40; renderNews(); renderMarkets(); });

  $$(".tabs button").forEach((b) => b.addEventListener("click", () => setTab(b.dataset.tab)));
  setTab(store.get("tab", "news"));
  seg("#scope", (v) => { state.scope = v; state.shown = 40; renderNews(); });
  seg("#period", (v) => { state.period = v; state.shown = 40; renderNews(); });
  seg("#mk-period", (v) => { state.mkField = v; renderMarkets(); });
  seg("#mt-period", (v) => { mt.field = v; renderMetals(); });
  seg("#mt-cur", (v) => { mt.cur = v; store.set("mt-cur", v); renderMetals(); });
  $$("#mt-cur button").forEach((b) => b.classList.toggle("on", b.dataset.v === mt.cur));
  $("#mt-ask").addEventListener("click", () => { setTab("ai"); ask("Fai un'analisi del mercato dei metalli preziosi (oro, argento, platino, palladio, rame): andamento recente, rapporti oro/argento e platino/palladio, fattori che li muovono (tassi, dollaro, banche centrali, domanda industriale) e notizie della settimana. Cerca sul web le notizie più recenti."); });
  $("#search").addEventListener("input", (e) => { state.query = e.target.value; state.shown = 40; renderNews(); });
  $("#news-more").addEventListener("click", () => { state.shown += 40; renderNews(); });

  // Dettaglio titoli
  const openFrom = (e) => {
    const req = e.target.closest("[data-req]");
    if (req) { if (e.type === "click") requestSearch(req.dataset.req); return; }
    const star = e.target.closest("[data-star]");
    if (star) { if (e.type === "click") { e.preventDefault(); e.stopPropagation(); favs.toggle(star.dataset.star); } return; }
    const el = e.target.closest("[data-sym]"); if (!el) return;
    if (e.type === "keydown" && e.key !== "Enter" && e.key !== " ") return;
    e.preventDefault();
    openDetail(el.dataset.sym, bySymbol(el.dataset.sym));
  };
  for (const id of ["#tab-markets", "#tab-metals"]) {
    $(id).addEventListener("click", openFrom);
    $(id).addEventListener("keydown", openFrom);
  }

  // Claude
  const dlg = $("#settings");
  $("#ai-settings-btn").addEventListener("click", () => dlg.showModal());
  dlg.addEventListener("close", () => {
    if (dlg.returnValue === "save") {
      store.set("apiKey", $("#api-key").value.trim() || null);
      store.set("model", $("#model").value);
      store.set("web", $("#web").checked ? "1" : "0");
    } else if (dlg.returnValue === "clear") {
      store.set("apiKey", null); $("#api-key").value = "";
    }
  });
  $("#api-key").value = store.get("apiKey", "");
  $("#model").value = store.get("model", "claude-opus-5-5");
  $("#web").checked = store.get("web", "1") === "1";
  $("#ai-chips").addEventListener("click", (e) => {
    const b = e.target.closest("button"); if (!b) return;
    ask(b.dataset.p.replaceAll("{country}", state.config.countries[state.country].name));
  });
  const ta = $("#prompt");
  ta.addEventListener("input", () => { ta.style.height = "auto"; ta.style.height = `${ta.scrollHeight}px`; });
  ta.addEventListener("keydown", (e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); $("#composer").requestSubmit(); } });
  $("#composer").addEventListener("submit", (e) => { e.preventDefault(); const v = ta.value; ta.value = ""; ta.style.height = "auto"; ask(v); });
  if (!store.get("apiKey", "")) addMsg("bot", "<p>Per usare Claude inserisci la tua chiave API Anthropic in <b>⚙️ Impostazioni</b>.</p>");

  getJSON("data/meta.json").then((m) => {
    $("#foot").innerHTML = `BortEconomy <a href="https://github.com/RickBortCost/BortEconomy/releases/tag/v${esc(m.version)}" target="_blank" rel="noopener">v${esc(m.version)}</a> · Dati: Google News, Yahoo Finance · Non è consulenza finanziaria`;
  }).catch(() => {});
  state.markets = await getJSON("data/markets.json").catch(() => null);
  // Nomi italiani per i metalli (Yahoo usa il nome del contratto future, es. "Gold Dec 26")
  for (const m of state.config.metals?.items ?? []) {
    const q = state.markets?.quotes.find((x) => x.symbol === m.symbol);
    if (q) { q.longName = `${m.name} – future ${q.name}`; q.name = m.name; }
  }
  renderMarkets();
  if (store.get("tab", "news") === "metals") renderMetals();
  pending.prune();
  if (favs.list().some((sym) => !isMonitored(sym))) loadDirectory().then(() => renderMarkets());
  initDetail({
    extraStats: (q) => { const m = metal(q.symbol); if (!m) return [];
      const eur = inCur(q.price, "EUR");
      return [[`Prezzo €/${unitShort(m)}`, money(eur, "EUR")], ["€ al grammo", money(eur == null ? null : eur / m.grams, "EUR", m.industrial ? 4 : undefined)], ["$ al grammo", money(q.price / m.grams, "USD", m.industrial ? 4 : undefined)]]; },
    askPrompt: (q) => { const m = metal(q.symbol); return m ? `Analizza il mercato di ${m.name.toLowerCase()} (${q.symbol}): prezzo attuale ${nf(q.price)} USD/${unitShort(m)}, variazioni giorno ${nf(q.changePct)}%, settimana ${nf(q.weekPct)}%, mese ${nf(q.monthPct)}%, anno ${nf(q.yearPct)}%. Spiega i fattori che lo muovono (tassi reali, dollaro, banche centrali, domanda industriale e da investimento), livelli tecnici e notizie recenti. Cerca sul web.` : null; },
    quoteFor: bySymbol, onAsk: (text) => { setTab("ai"); ask(text); }, favs,
    onAdd: (sym) => { requestAdd(sym); renderSearch(); }, pendingSince: (sym) => pending.get(sym), loadDirectory });
  const qi = $("#q-input");
  qi.addEventListener("input", renderSearch);
  qi.addEventListener("focus", renderSearch);
  qi.addEventListener("keydown", (e) => {
    if (e.key === "Escape") { qi.value = ""; renderSearch(); qi.blur(); }
    if (e.key === "Enter") { const first = $("#q-results [data-sym]"); if (first) openDetail(first.dataset.sym, bySymbol(first.dataset.sym)); }
  });
  document.addEventListener("click", (e) => { if (!e.target.closest(".qsearch")) $("#q-results").hidden = true; });
  $("#search-btn").addEventListener("click", () => { setTab("markets"); qi.focus(); qi.scrollIntoView({ block: "center" }); });
  await renderNews();
}

init().catch((e) => { $("#news-meta").textContent = `Errore nel caricamento dei dati: ${e.message}`; });
