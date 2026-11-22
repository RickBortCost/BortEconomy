// Scarica news (Google News RSS) e quotazioni (Yahoo Finance) e scrive JSON statici in site/data/.
// Eseguito da GitHub Actions a intervalli regolari. Nessuna dipendenza esterna (Node >= 20).
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "site", "data");
const config = JSON.parse(await readFile(join(ROOT, "site", "config.json"), "utf8"));
const UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Safari/537.36";
const WEEK_MS = 7 * 24 * 3600 * 1000;

async function get(url, tries = 3) {
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(url, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(20000) });
      if (res.ok) return await res.text();
      if (res.status === 404) return null;
    } catch {}
    await new Promise((r) => setTimeout(r, 800 * (i + 1)));
  }
  return null;
}

async function pool(items, size, fn) {
  const out = new Array(items.length);
  let i = 0;
  await Promise.all(Array.from({ length: size }, async () => {
    while (i < items.length) { const k = i++; out[k] = await fn(items[k]); }
  }));
  return out;
}

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
async function quote(symbol) {
  const txt = await get(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=1mo&interval=1d`)
    ?? await get(`https://query2.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=1mo&interval=1d`);
  if (!txt) return null;
  try {
    const r = JSON.parse(txt).chart.result[0];
    const m = r.meta;
    const closes = (r.indicators.quote[0].close || []).map((c, i) => [r.timestamp[i], c]).filter(([, c]) => c != null);
    const price = m.regularMarketPrice ?? closes.at(-1)?.[1];
    // ultima chiusura di un giorno precedente a quello della quotazione corrente
    const lastDay = new Date((m.regularMarketTime ?? closes.at(-1)[0]) * 1000).toISOString().slice(0, 10);
    const prior = closes.filter(([t]) => new Date(t * 1000).toISOString().slice(0, 10) < lastDay);
    const prev = prior.at(-1)?.[1] ?? m.chartPreviousClose;
    const weekRef = prior.at(-5)?.[1] ?? closes[0]?.[1];
    const pct = (a, b) => (a != null && b ? ((a - b) / b) * 100 : null);
    return {
      symbol,
      name: m.shortName || m.longName || symbol,
      currency: m.currency,
      price,
      changePct: m.regularMarketChangePercent ?? pct(price, prev),
      weekPct: pct(price, weekRef),
      time: m.regularMarketTime ? new Date(m.regularMarketTime * 1000).toISOString() : null,
      spark: closes.map(([, c]) => +c.toFixed(4)),
    };
  } catch { return null; }
}

const allSymbols = [...new Set([
  ...config.globalIndices, ...config.macro, ...config.globalStocks,
  ...Object.values(config.countries).flatMap((c) => [c.index, ...c.stocks]),
])];

await mkdir(OUT, { recursive: true });
const updated = new Date().toISOString();

const quotes = (await pool(allSymbols, 6, quote)).filter(Boolean);
await writeFile(join(OUT, "markets.json"), JSON.stringify({ updated, quotes }));
console.log(`markets: ${quotes.length}/${allSymbols.length} simboli`);

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
