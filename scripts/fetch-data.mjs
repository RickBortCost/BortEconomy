// Scarica news (Google News RSS) e quotazioni/storici (Yahoo Finance) e scrive JSON statici in site/data/.
// Eseguito da GitHub Actions a intervalli regolari. Nessuna dipendenza esterna (Node >= 20).
//
// Yahoo limita le raffiche di richieste dagli IP dei runner: le richieste sono quindi
// poche alla volta, con pause e backoff sui 429. Se un simbolo non si scarica, si
// riusano i dati dell'ultima pubblicazione (SITE_URL) così il sito non resta mai vuoto.
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "site", "data");
const config = JSON.parse(await readFile(join(ROOT, "site", "config.json"), "utf8"));
const { version } = JSON.parse(await readFile(join(ROOT, "package.json"), "utf8"));
const SITE_URL = (process.env.SITE_URL ?? "https://rickbortcost.github.io/BortEconomy").replace(/\/$/, "");
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";
const WEEK_MS = 7 * 24 * 3600 * 1000;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function get(url, { tries = 3, headers = {} } = {}) {
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(url, { headers: { "User-Agent": UA, ...headers }, signal: AbortSignal.timeout(20000) });
      if (res.ok) return await res.text();
      if (res.status === 404 || res.status === 400) return null;
      await sleep(res.status === 429 ? 4000 * (i + 1) : 800 * (i + 1));
    } catch { await sleep(800 * (i + 1)); }
  }
  return null;
}

async function pool(items, size, fn) {
  const out = new Array(items.length);
  let i = 0;
  await Promise.all(Array.from({ length: size }, async () => {
    while (i < items.length) { const k = i++; out[k] = await fn(items[k], k); }
  }));
  return out;
}

const previous = async (path) => {
  const txt = await get(`${SITE_URL}/${path}`, { tries: 1 });
  try { return txt ? JSON.parse(txt) : null; } catch { return null; }
};

// ---------- NEWS ----------
const decode = (s) => s
  .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
  .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'")
  .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n)).replace(/&amp;/g, "&").trim();
const tag = (xml, t) => { const m = xml.match(new RegExp(`<${t}[^>]*>([\\s\\S]*?)</${t}>`)); return m ? decode(m[1]) : ""; };

function feedUrl(f) {
  if (f.url) return f.url;
  const q = encodeURIComponent(`${f.q} when:7d`);
  return `https://news.google.com/rss/search?q=${q}&hl=${f.hl}&gl=${f.gl}&ceid=${f.ceid}`;
}

function parseRss(xml, lang) {
  if (!xml) return [];
  return [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].map(([, it]) => {
    const source = tag(it, "source");
    let title = tag(it, "title");
    if (source && title.endsWith(` - ${source}`)) title = title.slice(0, -(source.length + 3));
    const date = new Date(tag(it, "pubDate"));
    return { title, link: tag(it, "link"), source, date: isNaN(date) ? null : date.toISOString(), lang };
  }).filter((n) => n.title && n.date);
}

async function buildNews(feeds) {
  const lists = await pool(feeds, 4, async (f) => parseRss(await get(feedUrl(f)), f.lang));
  const seen = new Set();
  const now = Date.now();
  return lists.flat()
    .filter((n) => now - new Date(n.date) < WEEK_MS)
    .sort((a, b) => b.date.localeCompare(a.date))
    .filter((n) => {
      const key = n.title.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim().slice(0, 80);
      if (seen.has(key)) return false;
      seen.add(key); return true;
    })
    .slice(0, 250);
}

// ---------- MERCATI ----------
// Nome file sicuro per un simbolo (^GSPC -> _GSPC, EURUSD=X -> EURUSD_X)
const fileFor = (sym) => sym.replace(/[^A-Za-z0-9.-]/g, "_");

// Serie storiche: ore (1 mese, 60m), giorni (2 anni, 1d), settimane (10 anni, 1wk)
const SERIES = { hour: ["1mo", "60m"], day: ["2y", "1d"], week: ["10y", "1wk"] };

async function chart(symbol, range, interval) {
  const q = `${encodeURIComponent(symbol)}?range=${range}&interval=${interval}&includePrePost=false`;
  const txt = await get(`https://query1.finance.yahoo.com/v8/finance/chart/${q}`)
    ?? await get(`https://query2.finance.yahoo.com/v8/finance/chart/${q}`);
  if (!txt) return null;
  try {
    const r = JSON.parse(txt).chart.result[0];
    const qd = r.indicators.quote[0];
    const pts = (r.timestamp || []).map((t, i) => [t, qd.close?.[i], qd.volume?.[i]])
      .filter(([, c]) => c != null)
      .map(([t, c, v]) => (v ? [t, +c.toPrecision(7), v] : [t, +c.toPrecision(7)]));
    return { meta: r.meta, pts };
  } catch { return null; }
}

async function history(symbol) {
  const out = {};
  for (const [key, [range, interval]] of Object.entries(SERIES)) {
    out[key] = await chart(symbol, range, interval);
    await sleep(150);
  }
  return out;
}

function summarize(symbol, h) {
  const meta = h.day?.meta ?? h.hour?.meta ?? h.week?.meta;
  const daily = h.day?.pts ?? [];
  if (!meta || !daily.length) return null;
  const price = meta.regularMarketPrice ?? daily.at(-1)[1];
  const lastDay = new Date((meta.regularMarketTime ?? daily.at(-1)[0]) * 1000).toISOString().slice(0, 10);
  const prior = daily.filter(([t]) => new Date(t * 1000).toISOString().slice(0, 10) < lastDay);
  const prev = meta.previousClose ?? prior.at(-1)?.[1] ?? meta.chartPreviousClose;
  const pct = (a, b) => (a != null && b ? ((a - b) / b) * 100 : null);
  const ref = (days) => daily.findLast(([t]) => t <= daily.at(-1)[0] - days * 86400)?.[1];
  return {
    symbol,
    name: meta.shortName || meta.longName || symbol,
    longName: meta.longName || meta.shortName || symbol,
    type: meta.instrumentType,
    exchange: meta.fullExchangeName || meta.exchangeName,
    currency: meta.currency,
    price,
    prevClose: prev,
    changePct: meta.regularMarketChangePercent ?? pct(price, prev),
    weekPct: pct(price, prior.at(-5)?.[1]),
    monthPct: pct(price, ref(30)),
    yearPct: pct(price, ref(365)),
    dayHigh: meta.regularMarketDayHigh, dayLow: meta.regularMarketDayLow,
    high52: meta.fiftyTwoWeekHigh, low52: meta.fiftyTwoWeekLow,
    volume: meta.regularMarketVolume,
    time: meta.regularMarketTime ? new Date(meta.regularMarketTime * 1000).toISOString() : null,
    spark: daily.slice(-23).map((p) => p[1]),
  };
}

const allSymbols = [...new Set([
  ...config.globalIndices, ...config.macro, ...config.globalStocks,
  ...Object.values(config.countries).flatMap((c) => [c.index, ...c.stocks]),
])];

await mkdir(join(OUT, "hist"), { recursive: true });
const updated = new Date().toISOString();
await writeFile(join(OUT, "meta.json"), JSON.stringify({ version, updated }));

// News prima (veloci e indipendenti da Yahoo)
const worldNews = await buildNews(config.world.feeds);
await writeFile(join(OUT, "news-WORLD.json"), JSON.stringify({ updated, items: worldNews }));
console.log(`news WORLD: ${worldNews.length}`);
for (const [code, c] of Object.entries(config.countries)) {
  const feeds = [
    { lang: c.hl.slice(0, 2), url: `https://news.google.com/rss/headlines/section/topic/BUSINESS?hl=${c.hl}&gl=${c.gl}&ceid=${c.ceid}` },
    { lang: c.hl.slice(0, 2), q: c.q, hl: c.hl, gl: c.gl, ceid: c.ceid },
  ];
  if (code !== "IT") feeds.push({ lang: "it", q: c.qit, hl: "it", gl: "IT", ceid: "IT:it" });
  const items = await buildNews(feeds);
  await writeFile(join(OUT, `news-${code}.json`), JSON.stringify({ updated, items }));
  console.log(`news ${code}: ${items.length}`);
}

// Mercati
const prevMarkets = await previous("data/markets.json");
const prevQuotes = new Map((prevMarkets?.quotes ?? []).map((q) => [q.symbol, q]));
let fresh = 0, reused = 0;
const quotes = (await pool(allSymbols, 2, async (sym) => {
  const h = await history(sym);
  const file = join(OUT, "hist", `${fileFor(sym)}.json`);
  const q = summarize(sym, h);
  if (q && h.hour && h.week) {
    fresh++;
    await writeFile(file, JSON.stringify({ symbol: sym, updated, tz: h.day.meta.gmtoffset ?? 0, hour: h.hour.pts, day: h.day.pts, week: h.week.pts }));
    return q;
  }
  // Fallback: ultimi dati pubblicati, integrati con le serie scaricate ora
  const old = await previous(`data/hist/${fileFor(sym)}.json`);
  const merged = { symbol: sym, updated: old?.updated ?? updated, tz: h.day?.meta.gmtoffset ?? old?.tz ?? 0,
    hour: h.hour?.pts ?? old?.hour ?? [], day: h.day?.pts ?? old?.day ?? [], week: h.week?.pts ?? old?.week ?? [] };
  if (merged.day.length || merged.hour.length) await writeFile(file, JSON.stringify(merged));
  const pq = q ?? prevQuotes.get(sym);
  if (pq) { reused++; return { ...pq, stale: !q }; }
  return null;
})).filter(Boolean);

await writeFile(join(OUT, "markets.json"), JSON.stringify({ updated, quotes }));
console.log(`markets: ${quotes.length}/${allSymbols.length} simboli (aggiornati ${fresh}, da pubblicazione precedente ${reused})`);
if (!fresh) console.log("::warning::Nessun simbolo aggiornato da Yahoo Finance: pubblicati gli ultimi dati disponibili.");
