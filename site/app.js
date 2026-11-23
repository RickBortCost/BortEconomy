import { initDetail, openDetail, loadHist } from "./detail.js";
import { initPortfolio, renderPortfolio, openPositionForm, openAlertForm, positionWeights, positionsValue, donut } from "./portfolio.js";
import { initLab, renderComposition, renderLab } from "./lab.js";
import { PROVIDERS, aiSettings, errorText, server } from "./ai.js";
import { vault, PROTECTED } from "./vault.js";
import { pls } from "./profiles.js";
import { initSecurity, confirmShare, askPassword } from "./security.js";
import { sealWithPassword, openWithPassword } from "./vault.js";
import { initCalendar, renderCalendar, upcoming } from "./calendar.js";
import { initMarketsExtra, renderHeatmap, renderForex, renderCrypto, renderEtf } from "./markets-extra.js";
import { initHome, renderHome } from "./home.js";

const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];
// Archivio locale del profilo attivo: i dati personali (portafoglio, composizione, preferiti) passano dalla cassaforte cifrata se attiva
const store = {
  get(k, d) { if (PROTECTED.includes(k)) return vault.get(k) ?? d; return pls.get(k) ?? d; },
  set(k, v) { if (PROTECTED.includes(k)) { vault.set(k, v); return; } pls.set(k, v); },
};
// Link esterni: solo http(s), mai javascript: o altri schemi
const safeUrl = (u) => (/^https?:\/\//i.test(String(u ?? "")) ? String(u) : "#");
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const DAY = 864e5;

const state = {
  config: null, markets: null, news: {},
  country: store.get("country", "IT"),
  scope: "country", period: "day", query: "", shown: 40, topic: "all",
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
    if (store.get("tab") === "home") renderHome();
    return i < 0;
  },
};
const starBtn = (sym) => { const on = favs.has(sym);
  return `<button class="star" data-star="${esc(sym)}" aria-pressed="${on}" aria-label="${on ? "Rimuovi dai" : "Aggiungi ai"} preferiti"><svg class="ic" aria-hidden="true"><use href="#i-star"/></svg></button>`; };

async function getJSON(url) {
  const res = await fetch(`${url}?t=${Math.floor(Date.now() / 300000)}`);
  if (!res.ok) throw new Error(`${url}: ${res.status}`);
  return res.json();
}

// ---------------- formattazione ----------------
const pdec = (v) => { const a = Math.abs(v ?? 0); return a >= 10 ? 2 : a >= 1 ? 4 : a > 0 ? Math.min(10, Math.max(4, 3 - Math.floor(Math.log10(a)))) : 2; };
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
  const pts = arr.map((v, i) => `${((i / (arr.length - 1)) * 100).toFixed(2)},${(28 - ((v - min) / r) * 26).toFixed(2)}`);
  const col = `var(${up ? "--up" : "--down"})`;
  return `<svg viewBox="0 0 100 30" preserveAspectRatio="none" aria-hidden="true">
    <polygon points="0,30 ${pts.join(" ")} 100,30" fill="${col}" opacity=".10"/>
    <polyline points="${pts.join(" ")}" fill="none" stroke="${col}" stroke-width="2" stroke-linejoin="round" vector-effect="non-scaling-stroke"/></svg>`;
}

// ---------------- nastro degli indici ----------------
function renderTicker() {
  const syms = [state.config.countries[state.country]?.index, "^GSPC", "^IXIC", "^STOXX50E", "FTSEMIB.MI", "^GDAXI", "^FTSE", "^N225", "^HSI", "EURUSD=X", "GC=F", "CL=F", "BTC-USD", "^TNX", "^VIX"];
  const qs = [...new Set(syms)].map(bySymbol).filter(Boolean);
  if (!qs.length) return;
  const item = (q) => `<button data-sym="${esc(q.symbol)}"><b>${esc(q.name)}</b><span class="px">${nf(q.price, pdec(q.price))}</span>${pctHtml(q.changePct)}</button>`;
  const html = qs.map(item).join("");
  $("#ticker-track").innerHTML = html + html; // duplicato per lo scorrimento continuo
  $("#ticker").hidden = false;
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

// ---------------- notizie: argomenti, fonti, titoli citati ----------------
// [chiave, etichetta del filtro, regex, etichetta breve sulla notizia]
const TOPICS = [
  ["borsa", "Borsa", /borsa|borse|piazza affari|ftse|nasdaq|dow jones|s&p|wall street|stocks?\b|azion[ei]|titoli|listino|rally|sell-?off|börse|dax|aktie|bourse|cac 40|bolsa|ibex|ibovespa|nikkei|sensex|株|증시|코스피|股市|港股/i],
  ["tassi", "Tassi e banche centrali", /\bbce\b|\becb\b|\bfed\b|federal reserve|tass[oi]|interest rate|rate (cut|hike)|rendiment|yields?\b|spread|\bbtp|\bbund|bonds?\b|treasur|obbligaz|lagarde|powell|banca centrale|central bank|zins|ezb|\btaux\b|tipos de interés|juros|selic|日銀|금리|央行/i],
  ["macro", "Macroeconomia", /inflazion|inflation|\bpil\b|\bgdp\b|recession|occupazion|disoccupaz|unemployment|payrolls|jobs report|istat|consumi|\bcpi\b|\bpmi\b|konjunktur|\bbip\b|\bpib\b|dazi|tariff|debito pubblico|deficit|manovra|legge di bilancio|budget|crescita|growth|景気|물가|经济/i],
  ["aziende", "Aziende e utili", /utili|ricavi|fatturato|trimestral|semestral|bilancio|earnings|revenue|profit|guidance|dividend|\bipo\b|\bopa\b|fusion[ei]|acquisizion|merger|acquisition|takeover|buyback|quotazione|gewinn|umsatz|übernahme|résultats|beneficio|lucro|決算|실적|财报/i],
  ["energia", "Energia e materie prime", /petrolio|\boil\b|crude|brent|\bwti\b|\bgas\b|energia|energy|bollett|\boro\b|gold|argento|silver|rame|copper|acciaio|steel|commodit|materie prime|ölpreis|pétrole|petróleo|原油|유가/i],
  ["cripto", "Cripto", /bitcoin|crypto|cripto|ether(eum)?\b|stablecoin|blockchain|krypto/i],
  ["valute", "Valute", /euro\/dollaro|dollaro|\bdollar\b|\byen\b|sterlina|forex|tasso di cambio|valut[ae]|devisen|currency|円安|円高|환율|汇率/i],
];
const SHORT = { borsa: "Borsa", tassi: "Tassi", macro: "Macro", aziende: "Aziende", energia: "Materie prime", cripto: "Cripto", valute: "Valute", altro: "Economia" };
const topicOf = (t) => { const k = (TOPICS.find(([, , re]) => re.test(t)) ?? ["altro"])[0]; return [k, SHORT[k]]; };
const cleanSource = (s) => String(s).split(/\s+[-|–]\s+/)[0].trim();
const hueOf = (s) => { let h = 0; for (const c of String(s)) h = (h * 31 + c.codePointAt(0)) % 360; return h; };
const initialsOf = (s) => {
  const w = cleanSource(s).replace(/\.(com|it|de|net|org|co\.uk|fr|es)\b/gi, "").replace(/^(the|il|la|le|lo|der|die|das)\s+/i, "")
    .split(/\s+/).filter((x) => /^\p{L}/u.test(x));
  return (w.length >= 2 ? w[0][0] + w[1][0] : (w[0] ?? "•").slice(0, 2)).toUpperCase();
};

// Titoli monitorati citati nel titolo della notizia (per nome della società)
const NAME_STOP = new Set(["banca", "banco", "bank", "general", "american", "united", "first", "china", "international", "global", "national", "royal", "deutsche", "new", "the", "group", "energy", "holdings", "capital", "financial", "media", "health", "digital", "intesa", "unicredit"]);
let nameIndex = null;
function buildNameIndex() {
  const out = [];
  for (const q of state.markets?.quotes ?? []) {
    if (q.type !== "EQUITY") continue;
    const clean = String(q.longName || q.name).replace(/,?\s+(S\.?p\.?A\.?|Inc\.?|Corp(oration)?\.?|plc|N\.?V\.?|S\.?A\.?|AG|SE|Ltd\.?|Limited|Holdings?|Group|Company|Co\.?|& Co\.?|New|Oyj|AB|ASA|\(publ\))\b\.?/gi, "").replace(/[,.]+$/, "").trim();
    const names = new Set([clean]);
    const first = clean.split(/\s+/)[0];
    if (first.length >= 4 && !NAME_STOP.has(first.toLowerCase())) names.add(first);
    if (["intesa", "unicredit"].includes(first.toLowerCase())) names.add(first);
    // maiuscole rispettate e niente apostrofo dopo il nome: "Dell" non deve coincidere con "dell'"
    for (const n of names) if (n.length >= 3) out.push([new RegExp(`(?<![\\p{L}])${n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![\\p{L}'’])`, "u"), q.symbol]);
  }
  return out;
}
function mentions(title) {
  nameIndex ??= buildNameIndex();
  const found = [];
  for (const [re, sym] of nameIndex) if (!found.includes(sym) && re.test(title)) { found.push(sym); if (found.length === 3) break; }
  return found;
}
function tickerChip(sym) {
  const q = bySymbol(sym); if (!q) return "";
  const v = q.changePct;
  return `<button class="nw-tk ${v == null ? "" : v >= 0 ? "pos" : "neg"}" data-sym="${esc(sym)}" title="${esc(q.longName || q.name)}">${esc(q.name.replace(/,?\s+(S\.p\.A\.|Inc\.|Corporation|plc|N\.V\.|S\.A\.|AG|SE)\.?$/i, ""))} <b>${v == null ? "" : `${v >= 0 ? "+" : ""}${nf(v)}%`}</b></button>`;
}
const dayLabel = (iso) => {
  const d = new Date(iso), now = new Date(), min = (now - d) / 60000;
  if (min < 60) return "Ultima ora";
  const k = (x) => x.toDateString(), y = new Date(now - DAY);
  if (k(d) === k(now)) return "Oggi";
  if (k(d) === k(y)) return "Ieri";
  return d.toLocaleDateString("it-IT", { weekday: "long", day: "numeric", month: "long" });
};
function newsCard(n, hero = false) {
  const [tk, tl] = topicOf(n.title), tickers = mentions(n.title).map(tickerChip).join("");
  return `<li class="nw${hero ? " nw-hero" : ""}" data-topic="${tk}">
    <a class="nw-link" href="${esc(safeUrl(n.link))}" target="_blank" rel="noopener noreferrer">
      <span class="nw-av" style="--h:${hueOf(n.source)}" aria-hidden="true">${esc(initialsOf(n.source))}</span>
      <span class="nw-body">
        <span class="nw-top"><span class="nw-cat c-${tk}">${esc(tl)}</span><span class="nw-src">${esc(cleanSource(n.source))}</span><span class="nw-time">${ago(n.date)}</span></span>
        <span class="nw-title">${esc(n.title)}</span>
      </span>
    </a>${tickers ? `<div class="nw-tks">${tickers}</div>` : ""}</li>`;
}

async function renderNews() {
  const list = $("#news-list");
  const { data, items: all } = await filteredNews();
  const c = state.scope === "world" ? state.config.world : state.config.countries[state.country];
  const counts = {};
  for (const n of all) { const t = topicOf(n.title)[0]; counts[t] = (counts[t] ?? 0) + 1; }
  if (state.topic !== "all" && !counts[state.topic]) state.topic = "all";
  $("#news-topics").innerHTML = [["all", "Tutte", all.length], ...TOPICS.map(([k, l]) => [k, l, counts[k] ?? 0]), ["altro", "Economia", counts.altro ?? 0]]
    .filter(([k, , n]) => k === "all" || n)
    .map(([k, l, n]) => `<button class="chip c-${k}${state.topic === k ? " on" : ""}" data-topic="${k}" aria-pressed="${state.topic === k}">${esc(l)} <small>${n}</small></button>`).join("");
  const items = state.topic === "all" ? all : all.filter((n) => topicOf(n.title)[0] === state.topic);
  $("#news-meta").textContent = `${c.flag} ${c.name} · ${state.period === "day" ? "ultime 24 ore" : "ultimi 7 giorni"} · ${items.length} notizie` +
    (data.updated ? ` · aggiornato ${fmtTime(data.updated)}` : "");
  if (!items.length) { list.innerHTML = `<li class="empty">Nessuna notizia trovata.</li>`; $("#news-more").hidden = true; return; }
  const shown = items.slice(0, state.shown);
  let html = newsCard(shown[0], true), last = null;
  for (const n of shown.slice(1)) {
    const g = dayLabel(n.date);
    if (g !== last) { html += `<li class="nw-day" role="presentation">${esc(g)}</li>`; last = g; }
    html += newsCard(n);
  }
  list.innerHTML = html;
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

// Mercato aperto/chiuso: stato rilevato all'ultimo aggiornamento se recente, altrimenti calcolato
// dall'orario della seduta (stessa fascia oraria nei giorni feriali, nel fuso della borsa). Festività non considerate.
function marketStatus(q) {
  if (!q || q.dir) return null;
  if (q.type === "CRYPTOCURRENCY") return "open";
  const st = q.f?.state, age = Date.now() - Date.parse(state.markets?.updated ?? 0);
  if (st && age < 45 * 60e3) return st === "REGULAR" ? "open" : st === "PRE" || st === "PREPRE" ? "pre" : st === "POST" || st === "POSTPOST" ? "post" : "closed";
  const s = q.session; if (!s) return null;
  const now = Date.now() / 1000, len = s[1] - s[0];
  const off = (((now - s[0]) % 86400) + 86400) % 86400;
  const dow = new Date((now + (s[2] ?? 0)) * 1000).getUTCDay();
  return off <= len && dow !== 0 && dow !== 6 ? "open" : "closed";
}
const STATUS_LABEL = { open: "aperto", closed: "chiuso", pre: "pre-apertura", post: "after-hours" };
const statusDot = (q) => { const m = marketStatus(q); return m ? `<i class="mdot ${m}" title="Mercato ${STATUS_LABEL[m]}"></i>` : ""; };

function tiles(symbols) {
  return symbols.map(bySymbol).filter(Boolean).map((q) => `
    <div class="tile" data-sym="${esc(q.symbol)}" tabindex="0" role="button" title="Dettaglio ${esc(q.name)}">
      <div class="n">${statusDot(q)}${esc(q.name)}</div>
      <div class="p">${nf(q.price, pdec(q.price))}</div>
      ${pctHtml(q[state.mkField])}
      ${spark(q.spark, (q[state.mkField] ?? 0) >= 0)}
    </div>`).join("") || `<div class="empty">Dati non disponibili.</div>`;
}

function rows(quotes, { star = false, empty = "Dati non disponibili.", group = false, field = state.mkField } = {}) {
  return quotes.map((q) => `
    <li data-sym="${esc(q.symbol)}" tabindex="0" role="button" class="${star ? "has-star" : ""}">${star ? starBtn(q.symbol) : ""}
      <div class="nm"><b>${esc(q.name)}</b><small>${statusDot(q)}${esc(q.symbol)}${group ? ` · <span class="grp">${esc(groupLabel(q))}</span>` : ""}${q.dir
        ? ` <span class="tag ${pending.get(q.symbol) ? "wait" : "new"}">${pending.get(q.symbol) ? "richiesto" : "non monitorato"}</span>` : ""}</small></div>
      <div class="px">${nf(q.price, pdec(q.price))} <small>${esc(q.currency ?? "")}</small></div>${pctHtml(q[field])}</li>`).join("")
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
    empty: "Nessun preferito. Cerca un titolo o aprine uno e tocca la stella per aggiungerlo qui." });
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

// ---------------- il punto del giorno ----------------
async function renderBrief() {
  const b = await getJSON("data/brief.json").catch(() => null);
  if (!b?.markdown) return;
  const days = (Date.now() - Date.parse(b.generatedAt)) / 864e5;
  if (days > 3) return; // troppo vecchio: meglio non mostrarlo
  $("#brief").hidden = false;
  $("#brief-date").textContent = new Date(b.generatedAt).toLocaleDateString("it-IT", { weekday: "long", day: "numeric", month: "long" });
  $("#brief-body").innerHTML = md(b.markdown);
  $("#brief-foot").innerHTML = `Scritto da Claude alle ${new Date(b.generatedAt).toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" })} dai dati e dalle notizie del sito${b.sources?.length ? ` · Fonti: ${b.sources.map((x) => `<a href="${esc(safeUrl(x.url))}" target="_blank" rel="noopener noreferrer">${esc(x.title)}</a>`).join(" · ")}` : ""} · Non è consulenza finanziaria.`;
  const open = store.get("brief-open", "0") === "1";
  $("#brief").classList.toggle("open", open);
  $("#brief-toggle").textContent = open ? "Riduci" : "Leggi tutto";
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
const unitShort = (m) => m.short ?? (m.unit === "libbra" ? "lb" : "oz");
// Prezzo per unità piccola: grammo per i metalli preziosi, kg per quelli quotati a tonnellata
const perSmall = (m) => (m.grams >= 1e5 || m.industrial ? ["kg", 1000] : ["grammo", 1]);

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
  $("#mt-meta").textContent = `Future continui COMEX/NYMEX in USD (acciaio: coils laminati a caldo, tonnellata corta USA = 907 kg)${mt.cur === "EUR" && fx ? `, convertiti in euro al cambio EUR/USD ${nf(fx, 4)}` : ""} · variazione ${label} · aggiornato ${fmtTime(state.markets.updated)} · dati ritardati`;

  $("#mt-cards").innerHTML = items.map(({ q, ...m }) => `
    <div class="tile mt-card" data-sym="${esc(q.symbol)}" tabindex="0" role="button" title="Dettaglio ${esc(m.name)}">
      <div class="hd"><span class="ic">${m.icon}</span><span class="nm">${esc(m.name)}</span></div>
      ${m.industrial || m.sub ? `<small class="mt-sub">${m.industrial ? '<span class="tag">industriale</span> ' : ""}${esc(m.sub ?? "")}</small>` : ""}
      <div class="p">${money(inCur(q.price))} <span class="u">/${unitShort(m)}</span></div>
      ${pctHtml(q[f])}
      <div class="g">${(() => { const [u, k] = perSmall(m); const v = inCur(q.price) / m.grams * k; return `${money(v, mt.cur, v < 1 ? 4 : undefined)} al ${u}`; })()}</div>
      ${spark(q.spark, (q[f] ?? 0) >= 0)}
    </div>`).join("") || `<div class="empty">Dati non disponibili.</div>`;

  $("#mt-h-unit").textContent = "Unità di quotazione";
  $("#mt-units").innerHTML = items.map(({ q, ...m }) => {
    const u = inCur(q.price), g = u == null ? null : u / m.grams;
    return `<tr data-sym="${esc(q.symbol)}"><td>${m.icon} ${esc(m.name)}</td><td>${money(u)} <small>/${unitShort(m)}</small></td><td>${money(g, mt.cur, g != null && g < 1 ? 4 : undefined)}</td><td>${money(g == null ? null : g * 1000)}</td></tr>`;
  }).join("");

  $("#mt-perf").innerHTML = items.map(({ q, ...m }) => `<tr data-sym="${esc(q.symbol)}"><td>${m.icon} ${esc(m.name)}</td>
    <td>${pctHtml(q.changePct)}</td><td>${pctHtml(q.weekPct)}</td><td>${pctHtml(q.monthPct)}</td><td>${pctHtml(q.yearPct)}</td>
    <td>${pctHtml(q.high52 ? (q.price / q.high52 - 1) * 100 : null)}</td></tr>`).join("");

  $("#mt-etc").innerHTML = rows(M.etc.map(bySymbol).filter(Boolean), { star: true, field: f });
  $("#mt-miners").innerHTML = rows(M.miners.map(bySymbol).filter(Boolean), { star: true, field: f });
  if (M.steel) $("#mt-steel-groups").innerHTML = M.steel.groups.map((g) => `<h3 class="mt-h3">${esc(g.title)}</h3>
    <ul class="rows">${rows(g.symbols.map(bySymbol).filter(Boolean), { star: true, field: f }) || '<li class="empty">Dati disponibili dal prossimo aggiornamento.</li>'}</ul>`).join("");

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
    <li><a href="${esc(safeUrl(n.link))}" target="_blank" rel="noopener noreferrer">${esc(n.title)}</a>
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
// conversazioni separate per fornitore (ognuna nel formato della propria API)
const chat = { conv: { claude: [], openai: [], gemini: [] }, busy: false };

function md(text) {
  const inline = (s) => esc(s)
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>')
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
${await upcoming(7)}
${store.get("share-favs", "0") === "1" ? `Preferiti dell'utente: ${favs.list().map(q).filter(Boolean).join("; ") || "nessuno"}` : ""}
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
  const p = aiSettings.provider(), P = PROVIDERS[p];
  if (vault.locked()) { document.querySelector("#sec-btn").click(); return; }
  const acc = aiSettings.access(p);
  if (!acc) { openSettings(p); return; }
  if (chat.busy || !text.trim()) return;
  chat.busy = true; $("#send").disabled = true;
  addMsg("user", esc(text).replace(/\n/g, "<br>"));
  const bot = addMsg("bot", `<span class="ai-who">${esc(P.label)}</span><span class="status">${esc(P.label)} sta analizzando…</span>`);
  const head = `<span class="ai-who">${esc(P.label)} · ${esc(aiSettings.model(p))}${acc.via ? " · server" : ""}</span>`;
  try {
    const r = await P.send({
      key: acc.key, via: acc.via, model: aiSettings.model(p), system: systemPrompt(await buildContext()), conv: chat.conv[p], text,
      web: store.get("web", "1") === "1",
      onText: (t) => { bot.innerHTML = head + md(t); },
      onStatus: (msg) => { bot.innerHTML = `${head}<span class="status">${esc(msg)}</span>`; },
    });
    if (r.refused) { bot.classList.add("err"); bot.textContent = `${P.label} ha declinato questa richiesta. Prova a riformularla.`; return; }
    bot.innerHTML = head + md(r.text) + (r.sources?.size
      ? `<div class="sources"><b>Fonti:</b> ${[...r.sources].slice(0, 8).map(([u, t]) => `<a href="${esc(safeUrl(u))}" target="_blank" rel="noopener noreferrer">${esc(t)}</a>`).join(" · ")}</div>`
      : "");
    if (r.truncated) bot.innerHTML += '<p class="status">Risposta troncata.</p>';
  } catch (e) {
    bot.classList.add("err");
    if (acc.via && e && typeof e === "object") { e.via = true; e.message = e.error?.error?.message ?? e.message; }
    bot.textContent = errorText(e, p);
  } finally {
    chat.busy = false; $("#send").disabled = false;
  }
}

// ---------------- impostazioni AI ----------------
let setP = "claude"; // fornitore mostrato nella finestra impostazioni
function fillModels(p, list) {
  const cur = aiSettings.model(p);
  const opts = list.some(([id]) => id === cur) ? list : [[cur, `${cur} (attuale)`], ...list];
  $("#model").innerHTML = opts.map(([id, label]) => `<option value="${esc(id)}" ${id === cur ? "selected" : ""}>${esc(label)}</option>`).join("");
}
function showSettingsFor(p) {
  setP = p; const P = PROVIDERS[p];
  $$("#set-provider button").forEach((b) => b.classList.toggle("on", b.dataset.v === p));
  $("#set-title").textContent = `Collegamento a ${P.label}`;
  $("#api-key-label").firstChild.textContent = `Chiave API ${P.vendor} `;
  $("#api-key").placeholder = P.keyHint;
  $("#api-key").value = aiSettings.key(p);
  $("#remember-key").checked = !aiSettings.key(p) || aiSettings.persistent(p);
  $("#key-warn").textContent = P.keyAdvice ?? "";
  $("#key-warn").hidden = !P.keyAdvice;
  if (vault.enabled()) { $("#remember-key").checked = true; $("#remember-key").disabled = true; } else $("#remember-key").disabled = false;
  $("#key-hint").innerHTML = `La chiave resta solo in questo browser e viene inviata direttamente a ${esc(P.host)}. Usa una chiave con limite di spesa. Creala su <b>${esc(P.keyUrl)}</b>.`;
  $("#proxy-box").hidden = !server.available();
  if (server.available()) {
    $("#proxy-code").value = aiSettings.code();
    $("#proxy-info").textContent = server.has(p)
      ? `Questa copia del sito ha un server con ${P.label} già collegato: con il codice di accesso ricevuto dal proprietario puoi usarlo senza chiave personale (massimo ${server.info.dailyLimit} richieste al giorno). Se inserisci anche una chiave personale, viene usata quella.`
      : `${P.label} non è disponibile sul server: serve una chiave personale.`;
  }
  $("#load-models").hidden = p === "claude";
  $("#models-msg").textContent = p === "claude" ? "" : `Predefinito: ${P.defaultModel} (punta sempre al modello più recente). Tocca "Carica modelli" per scegliere tra quelli attivi sul tuo account.`;
  fillModels(p, p === "claude" ? P.models : []);
}
function openSettings(p = aiSettings.provider()) { showSettingsFor(p); $("#settings").showModal(); }
function renderProviderBar() {
  const p = aiSettings.provider(), ok = aiSettings.configured();
  $("#ai-provider").innerHTML = Object.values(PROVIDERS).map((P) => `<button data-v="${P.id}" class="${P.id === p ? "on" : ""}">${esc(P.label)}${ok.includes(P.id) ? "" : ' <small title="Chiave non configurata">·</small>'}</button>`).join("");
  $("#ai-intro").textContent = `${PROVIDERS[p].label} (${PROVIDERS[p].vendor}) analizza le notizie e i dati caricati e può cercare sul web informazioni aggiornate. Modello: ${aiSettings.model(p)}.`;
  $("#prompt").placeholder = `Chiedi a ${PROVIDERS[p].label}…`;
}

// ---------------- tema ----------------
const THEMES = { auto: ["auto", "automatico (sistema)"], light: ["sun", "chiaro"], dark: ["moon", "scuro"] };
const darkMQ = matchMedia("(prefers-color-scheme: dark)");
function applyTheme(t) {
  if (t === "light" || t === "dark") document.documentElement.dataset.theme = t;
  else delete document.documentElement.dataset.theme;
  const dark = t === "dark" || (t === "auto" && darkMQ.matches);
  document.querySelector('meta[name="theme-color"]').content = dark ? "#070b16" : "#f3f5fa";
  const b = $("#theme-btn");
  b.innerHTML = `<svg class="ic" aria-hidden="true"><use href="#i-${THEMES[t][0]}"/></svg>`;
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

// Sotto-sezioni del portafoglio (disponibili solo dopo l'inizializzazione dei moduli)
let pfReady = false, homeReady = false;
function showPfView(v) {
  $$("#pf-subnav button").forEach((b) => b.classList.toggle("on", b.dataset.v === v));
  $$(".pf-view").forEach((el) => { el.hidden = el.id !== `pf-view-${v}`; });
  store.set("pf-view", v);
  if (v === "positions") renderPortfolio();
  if (v === "composition") renderComposition();
  if (v === "lab") renderLab();
}

// ---------------- UI ----------------
function setTab(t) {
  $$(".tabs button").forEach((b) => b.setAttribute("aria-selected", b.dataset.tab === t));
  $$(".panel").forEach((p) => p.classList.toggle("active", p.id === `tab-${t}`));
  document.body.classList.toggle("ai", t === "ai");
  store.set("tab", t);
  if (t === "metals") renderMetals();
  if (t === "home" && homeReady) renderHome();
  if (t === "portfolio" && pfReady) showPfView(store.get("pf-view", "positions"));
}

function seg(id, onChange) {
  $(id).addEventListener("click", (e) => {
    const b = e.target.closest("button"); if (!b) return;
    $$(`${id} button`).forEach((x) => x.classList.toggle("on", x === b));
    onChange(b.dataset.v);
  });
}

// Ridisegna le parti che dipendono dai dati protetti (dopo sblocco, blocco o cambio della cassaforte)
function refreshProtected() {
  const locked = vault.locked();
  document.querySelectorAll(".lock-card").forEach((el) => { el.hidden = !locked; });
  document.querySelectorAll("#tab-portfolio > :not(.lock-card), #tab-ai > :not(.lock-card)").forEach((el) => { el.classList.toggle("vault-hidden", locked); });
  if (!state.markets) return;
  renderMarkets(); renderProviderBar();
  if (store.get("tab") === "portfolio" && pfReady) showPfView(store.get("pf-view", "positions"));
  if (store.get("tab") === "home" && homeReady) renderHome();
}
function download(name, text, type) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([text], { type }));
  a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

async function init() {
  initTheme();
  if ("serviceWorker" in navigator && location.protocol === "https:") navigator.serviceWorker.register("sw.js").catch(() => {});
  const offline = () => document.body.classList.toggle("offline", !navigator.onLine);
  addEventListener("online", offline); addEventListener("offline", offline); offline();
  state.config = await getJSON("config.json");
  if (!state.config.countries[state.country]) state.country = "IT";
  const sel = $("#country");
  sel.innerHTML = Object.entries(state.config.countries).map(([k, c]) => `<option value="${k}">${c.flag} ${c.name}</option>`).join("");
  sel.value = state.country;
  sel.addEventListener("change", () => { state.country = sel.value; store.set("country", sel.value); state.shown = 40; renderNews(); renderMarkets(); renderTicker(); });

  $$(".tabs button").forEach((b) => b.addEventListener("click", () => setTab(b.dataset.tab)));
  setTab(store.get("tab", "home"));
  seg("#scope", (v) => { state.scope = v; state.shown = 40; renderNews(); });
  seg("#period", (v) => { state.period = v; state.shown = 40; renderNews(); });
  seg("#mk-period", (v) => { state.mkField = v; renderMarkets(); });
  seg("#mt-period", (v) => { mt.field = v; renderMetals(); });
  seg("#mt-cur", (v) => { mt.cur = v; store.set("mt-cur", v); renderMetals(); });
  $$("#mt-cur button").forEach((b) => b.classList.toggle("on", b.dataset.v === mt.cur));
  $("#mt-ask").addEventListener("click", () => { setTab("ai"); ask("Fai un'analisi del mercato dei metalli preziosi (oro, argento, platino, palladio, rame): andamento recente, rapporti oro/argento e platino/palladio, fattori che li muovono (tassi, dollaro, banche centrali, domanda industriale) e notizie della settimana. Cerca sul web le notizie più recenti."); });
  $("#search").addEventListener("input", (e) => { state.query = e.target.value; state.shown = 40; renderNews(); });
  $("#news-more").addEventListener("click", () => { state.shown += 40; renderNews(); });
  $("#news-topics").addEventListener("click", (e) => { const b = e.target.closest("[data-topic]"); if (!b) return; state.topic = b.dataset.topic; state.shown = 40; renderNews(); });

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
  for (const id of ["#tab-markets", "#tab-metals", "#tab-portfolio", "#tab-news", "#tab-home"]) {
    $(id).addEventListener("click", openFrom);
    $(id).addEventListener("keydown", openFrom);
  }

  // Assistenti AI
  const dlg = $("#settings");
  $("#ai-settings-btn").addEventListener("click", () => openSettings());
  $("#set-provider").innerHTML = Object.values(PROVIDERS).map((P) => `<button type="button" data-v="${P.id}">${esc(P.label)}</button>`).join("");
  $("#set-provider").addEventListener("click", (e) => { const b = e.target.closest("button"); if (b) showSettingsFor(b.dataset.v); });
  $("#load-models").addEventListener("click", async () => {
    const key = $("#api-key").value.trim(), code = $("#proxy-code").value.trim();
    const via = !key && code && server.has(setP) ? { base: server.base(setP), headers: { "x-bort-code": code } } : null;
    if (!key && !via) { $("#models-msg").textContent = "Inserisci prima la chiave API."; return; }
    $("#models-msg").textContent = "Caricamento dei modelli…";
    try {
      const list = await PROVIDERS[setP].listModels(key || "proxy", via);
      fillModels(setP, list);
      $("#models-msg").textContent = `${list.length} modelli disponibili sul tuo account.`;
    } catch (e) { $("#models-msg").textContent = errorText(e, setP); }
  });
  dlg.addEventListener("close", () => {
    if (dlg.returnValue === "save") {
      aiSettings.setKey(setP, $("#api-key").value.trim(), $("#remember-key").checked);
      aiSettings.setModel(setP, $("#model").value);
      store.set("web", $("#web").checked ? "1" : "0");
      if (server.available()) aiSettings.setCode($("#proxy-code").value.trim());
      if (aiSettings.access(setP)) aiSettings.setProvider(setP);
    } else if (dlg.returnValue === "clear") {
      aiSettings.setKey(setP, null); $("#api-key").value = "";
    }
    renderProviderBar();
  });
  $("#web").checked = store.get("web", "1") === "1";
  $("#ai-provider").addEventListener("click", (e) => {
    const b = e.target.closest("button"); if (!b) return;
    aiSettings.setProvider(b.dataset.v); renderProviderBar();
    if (!aiSettings.access(b.dataset.v)) openSettings(b.dataset.v);
  });
  renderProviderBar();
  const srv = server.load().then((i) => { if (i) renderProviderBar(); });
  initSecurity({ store, refresh: refreshProtected, download });
  document.querySelectorAll("[data-unlock]").forEach((b) => b.addEventListener("click", () => document.querySelector("#sec-btn").click()));
  refreshProtected();
  $("#ai-chips").addEventListener("click", (e) => {
    const b = e.target.closest("button"); if (!b) return;
    ask(b.dataset.p.replaceAll("{country}", state.config.countries[state.country].name));
  });
  const ta = $("#prompt");
  ta.addEventListener("input", () => { ta.style.height = "auto"; ta.style.height = `${ta.scrollHeight}px`; });
  ta.addEventListener("keydown", (e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); $("#composer").requestSubmit(); } });
  $("#composer").addEventListener("submit", (e) => { e.preventDefault(); const v = ta.value; ta.value = ""; ta.style.height = "auto"; ask(v); });
  srv.then(() => { if (!aiSettings.configured().length) addMsg("bot", server.available() ? "<p>Scegli un assistente (Claude, ChatGPT o Gemini) e, in <b>Impostazioni</b>, inserisci il codice di accesso al server BortEconomy oppure una tua chiave API.</p>" : "<p>Scegli un assistente (Claude, ChatGPT o Gemini) e inserisci la sua chiave API in <b>Impostazioni</b>. Puoi configurarne più di uno e passare dall'uno all'altro.</p>"); });

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
  renderTicker();
  $("#ticker").addEventListener("click", (e) => { const b = e.target.closest("[data-sym]"); if (b) openDetail(b.dataset.sym, bySymbol(b.dataset.sym)); });
  if (store.get("tab", "home") === "metals") renderMetals();
  initCalendar({ $, esc, seg });
  initMarketsExtra({ $, esc, nf, pdec, seg, store, pctHtml, spark, tiles, bySymbol, config: state.config,
    rows: (qs, o) => rows(qs, o), loadDirectory: () => loadDirectory(), updated: () => state.markets?.updated, allQuotes: () => state.markets?.quotes ?? [] });
  const showView = (v) => {
    $$("#mk-subnav button").forEach((b) => b.classList.toggle("on", b.dataset.v === v));
    $$(".mk-view").forEach((el) => { el.hidden = el.id !== `mk-view-${v}`; });
    store.set("mk-view", v);
    if (v === "calendar") renderCalendar();
    if (v === "map") renderHeatmap();
    if (v === "etf") renderEtf();
    if (v === "forex") renderForex();
    if (v === "crypto") renderCrypto();
  };
  $("#mk-subnav").addEventListener("click", (e) => { const b = e.target.closest("button"); if (b) showView(b.dataset.v); });
  showView(store.get("mk-view", "overview"));
  renderBrief();
  $("#brief-toggle").addEventListener("click", () => {
    const open = !$("#brief").classList.contains("open");
    store.set("brief-open", open ? "1" : "0");
    $("#brief").classList.toggle("open", open);
    $("#brief-toggle").textContent = open ? "Riduci" : "Leggi tutto";
  });
  initPortfolio({
    $, esc, nf, pctHtml, store, seg, bySymbol, searchQuotes, setTab, ask, openDetail, config: state.config,
    sectorOf: (sym) => bySymbol(sym)?.sector,
    ensureDirectory: () => loadDirectory(),
    ensureQuotes: async (syms) => { if (syms.some((x) => !isMonitored(x))) await loadDirectory(); },
    openIssue: (title, body) => window.open(issueUrl(title, body), "_blank", "noopener"),
    confirmShare: (what) => confirmShare(what, PROVIDERS[aiSettings.provider()].label),
    sealExport: async (obj) => { const pw = await askPassword({ title: "Password del file", text: "Il file sarà cifrato (AES-256): servirà questa password per reimportarlo.", confirm: true, ok: "Esporta" }); return pw ? sealWithPassword(obj, pw) : null; },
    openImport: async (box) => { const pw = await askPassword({ title: "Password del file", ok: "Apri" }); if (!pw) return null; try { return await openWithPassword(box, pw); } catch { alert("Password errata o file danneggiato."); return null; } },
  });
  // posizioni su titoli non monitorati: serve la directory per il prezzo
  try { if (JSON.parse(store.get("portfolio", "[]")).some((l) => !isMonitored(l.sym))) loadDirectory().then(() => { if (store.get("tab") === "portfolio") renderPortfolio(); }); } catch {}
  initLab({ $, esc, nf, store, seg, bySymbol, searchQuotes, setTab, ask, openDetail, config: state.config, donut, positionWeights, positionsValue,
    confirmShare: (what) => confirmShare(what, PROVIDERS[aiSettings.provider()].label) });
  $("#pf-subnav").addEventListener("click", (e) => { const b = e.target.closest("button"); if (b) showPfView(b.dataset.v); });
  pfReady = true;
  initHome({ $, esc, nf, pdec, pctHtml, spark, rows: (qs, o) => rows(qs, o), tiles, bySymbol, favs, store, state, searchQuotes,
    movers: (n) => { const saved = state.mkField; state.mkField = "changePct"; const r = movers(n); state.mkField = saved; return r; },
    loadNews, getJSON, md, safeUrl, ago, setTab });
  homeReady = true;
  if (store.get("tab", "home") === "home") renderHome();
  if (store.get("tab", "news") === "portfolio") showPfView(store.get("pf-view", "positions"));
  pending.prune();
  if (favs.list().some((sym) => !isMonitored(sym))) loadDirectory().then(() => renderMarkets());
  initDetail({
    extraStats: (q) => { const m = metal(q.symbol); if (!m) return [];
      const eur = inCur(q.price, "EUR");
      return [[`Prezzo €/${unitShort(m)}`, money(eur, "EUR")], ["€ al grammo", money(eur == null ? null : eur / m.grams, "EUR", m.industrial ? 4 : undefined)], ["$ al grammo", money(q.price / m.grams, "USD", m.industrial ? 4 : undefined)]]; },
    askPrompt: (q) => { const m = metal(q.symbol); return m ? `Analizza il mercato di ${m.name.toLowerCase()} (${q.symbol}): prezzo attuale ${nf(q.price)} USD/${unitShort(m)}, variazioni giorno ${nf(q.changePct)}%, settimana ${nf(q.weekPct)}%, mese ${nf(q.monthPct)}%, anno ${nf(q.yearPct)}%. Spiega i fattori che lo muovono (tassi reali, dollaro, banche centrali, domanda industriale e da investimento), livelli tecnici e notizie recenti. Cerca sul web.` : null; },
    onPortfolio: (sym) => openPositionForm({ sym }), onAlert: (sym) => openAlertForm(sym),
    quoteFor: bySymbol, searchQuotes, marketStatus: (q) => { const m = marketStatus(q); return m && STATUS_LABEL[m]; }, onAsk: (text) => { setTab("ai"); ask(text); }, favs,
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
