// Scarica news (Google News RSS) e quotazioni/storici (Yahoo Finance) e scrive JSON statici in site/data/.
// Eseguito da GitHub Actions a intervalli regolari. Nessuna dipendenza esterna (Node >= 20).
//
// Yahoo limita le raffiche di richieste dagli IP dei runner: le richieste sono quindi
// poche alla volta, con pause e backoff sui 429. Se un simbolo non si scarica, si
// riusano i dati dell'ultima pubblicazione (SITE_URL) così il sito non resta mai vuoto.
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { buildDirectory } from "./lib/directory.mjs";

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

const DAY_REFRESH_MS = 6 * 3600 * 1000; // serie giornaliera/settimanale: aggiornate ogni 6 ore

function summarize(symbol, meta, daily) {
  if (!meta || !daily.length) return null;
  const price = meta.regularMarketPrice ?? daily.at(-1)[1];
  const lastDay = new Date((meta.regularMarketTime ?? daily.at(-1)[0]) * 1000).toISOString().slice(0, 10);
  const prior = daily.filter(([t]) => new Date(t * 1000).toISOString().slice(0, 10) < lastDay);
  const prev = meta.previousClose ?? prior.at(-1)?.[1] ?? meta.chartPreviousClose;
  const pct = (a, b) => (a != null && b ? ((a - b) / b) * 100 : null);
  const now = meta.regularMarketTime ?? daily.at(-1)[0];
  const ref = (days) => daily.findLast(([t]) => t <= now - days * 86400)?.[1];
  const spark = [...prior.slice(-22).map((p) => p[1]), price];
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
    spark,
  };
}

const groupOf = new Map();
for (const [k, g] of Object.entries(config.catalog ?? {})) for (const sym of g.symbols) if (!groupOf.has(sym)) groupOf.set(sym, k);
const allSymbols = [...new Set([
  ...config.globalIndices, ...config.macro, ...config.globalStocks,
  ...Object.values(config.countries).flatMap((c) => [c.index, ...c.stocks]),
  ...Object.values(config.catalog ?? {}).flatMap((g) => g.symbols),
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

// Directory mondiale per la ricerca (con fallback sulle regioni non scaricate)
try {
  const { items, failed } = await buildDirectory(() => {});
  if (failed.length) {
    const prev = await previous("data/directory.json");
    const have = new Set(items.map((i) => i[0]));
    for (const it of prev?.items ?? []) if (failed.includes(it[7]) && !have.has(it[0])) items.push(it);
  }
  if (items.length) {
    await writeFile(join(OUT, "directory.json"), JSON.stringify({ updated, fields: ["symbol", "name", "exchange", "currency", "price", "changePct", "marketCap", "region"], items }));
  }
  console.log(`directory: ${items.length} titoli${failed.length ? ` (regioni dalla pubblicazione precedente: ${failed.join(", ")})` : ""}`);
} catch (e) {
  const prev = await previous("data/directory.json");
  if (prev) await writeFile(join(OUT, "directory.json"), JSON.stringify(prev));
  console.log(`::warning::Directory non aggiornata (${e.message}); usata la pubblicazione precedente.`);
}

// Mercati
const prevMarkets = await previous("data/markets.json");
const prevQuotes = new Map((prevMarkets?.quotes ?? []).map((q) => [q.symbol, q]));
let fresh = 0, reused = 0, dayCalls = 0;
const quotes = (await pool(allSymbols, 2, async (sym) => {
  const old = await previous(`data/hist/${fileFor(sym)}.json`);
  const needDay = !old?.day?.length || !old.dayUpdated || Date.now() - Date.parse(old.dayUpdated) > DAY_REFRESH_MS;
  const hour = await chart(sym, ...SERIES.hour);
  await sleep(120);
  let day = null, week = null;
  if (needDay) {
    dayCalls++;
    day = await chart(sym, ...SERIES.day); await sleep(120);
    week = await chart(sym, ...SERIES.week); await sleep(120);
  }
  const merged = {
    symbol: sym,
    tz: (hour ?? day)?.meta.gmtoffset ?? old?.tz ?? 0,
    updated: hour ? updated : old?.updated ?? null,
    dayUpdated: day && week ? updated : old?.dayUpdated ?? null,
    hour: hour?.pts ?? old?.hour ?? [],
    day: day?.pts ?? old?.day ?? [],
    week: week?.pts ?? old?.week ?? [],
  };
  if (merged.day.length || merged.hour.length) await writeFile(join(OUT, "hist", `${fileFor(sym)}.json`), JSON.stringify(merged));
  const q = summarize(sym, hour?.meta ?? day?.meta, merged.day);
  const group = groupOf.get(sym);
  if (q) { fresh++; return { ...q, group }; }
  const pq = prevQuotes.get(sym);
  if (pq) { reused++; return { ...pq, group, stale: true }; }
  return null;
})).filter(Boolean);

await writeFile(join(OUT, "markets.json"), JSON.stringify({ updated, quotes }));
console.log(`markets: ${quotes.length}/${allSymbols.length} simboli (aggiornati ${fresh}, da pubblicazione precedente ${reused}, serie giornaliere/settimanali scaricate ${dayCalls})`);
if (!fresh) console.log("::warning::Nessun simbolo aggiornato da Yahoo Finance: pubblicati gli ultimi dati disponibili.");
