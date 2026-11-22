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
function bySymbol(sym) { return state.markets?.quotes.find((q) => q.symbol === sym); }

function tiles(symbols) {
  return symbols.map(bySymbol).filter(Boolean).map((q) => `
    <div class="tile" title="${esc(q.symbol)}">
      <div class="n">${esc(q.name)}</div>
      <div class="p">${nf(q.price, q.price < 10 ? 4 : 2)}</div>
      ${pctHtml(q[state.mkField])}
      ${spark(q.spark, (q[state.mkField] ?? 0) >= 0)}
    </div>`).join("") || `<div class="empty">Dati non disponibili.</div>`;
}

function rows(quotes) {
  return quotes.map((q) => `
    <li><div class="nm"><b>${esc(q.name)}</b><small>${esc(q.symbol)}</small></div>
      <div class="px">${nf(q.price)} <small>${esc(q.currency ?? "")}</small></div>${pctHtml(q[state.mkField])}</li>`).join("")
    || `<li class="empty">Dati non disponibili.</li>`;
}

function movers(n = 8) {
  const f = state.mkField;
  const qs = state.config.globalStocks.map(bySymbol).filter((q) => q && q[f] != null).sort((a, b) => b[f] - a[f]);
  return { gainers: qs.slice(0, n), losers: qs.slice(-n).reverse() };
}

function renderMarkets() {
  if (!state.markets) { $("#mk-meta").textContent = "Dati di mercato non disponibili."; return; }
  const c = state.config.countries[state.country];
  $("#mk-meta").textContent = `Quotazioni ritardate · aggiornato ${fmtTime(state.markets.updated)} · variazione ${state.mkField === "changePct" ? "giornaliera" : "settimanale"}`;
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

// ---------------- UI ----------------
function setTab(t) {
  $$(".tabs button").forEach((b) => b.setAttribute("aria-selected", b.dataset.tab === t));
  $$(".panel").forEach((p) => p.classList.toggle("active", p.id === `tab-${t}`));
  document.body.classList.toggle("ai", t === "ai");
  store.set("tab", t);
}

function seg(id, onChange) {
  $(id).addEventListener("click", (e) => {
    const b = e.target.closest("button"); if (!b) return;
    $$(`${id} button`).forEach((x) => x.classList.toggle("on", x === b));
    onChange(b.dataset.v);
  });
}

async function init() {
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
  $("#search").addEventListener("input", (e) => { state.query = e.target.value; state.shown = 40; renderNews(); });
  $("#news-more").addEventListener("click", () => { state.shown += 40; renderNews(); });

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
  renderMarkets();
  await renderNews();
}

init().catch((e) => { $("#news-meta").textContent = `Errore nel caricamento dei dati: ${e.message}`; });
