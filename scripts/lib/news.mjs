// Notizie da Google News RSS: parsing, deduplica e filtro sugli ultimi 7 giorni.
import { get, pool } from "./http.mjs";

const WEEK_MS = 7 * 24 * 3600 * 1000;

const decode = (s) => s
  .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
  .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'")
  .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n)).replace(/&amp;/g, "&").trim();
const tag = (xml, t) => { const m = xml.match(new RegExp(`<${t}[^>]*>([\\s\\S]*?)</${t}>`)); return m ? decode(m[1]) : ""; };

export function feedUrl(f) {
  if (f.url) return f.url;
  const q = encodeURIComponent(`${f.q} when:${f.when ?? "7d"}`);
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

export async function buildNews(feeds, limit = 250) {
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
    .slice(0, limit);
}

// Lingua/edizione di Google News per regione di quotazione
const EDITION = {
  it: ["it", "IT", "IT:it"], us: ["en-US", "US", "US:en"], gb: ["en-GB", "GB", "GB:en"], de: ["de", "DE", "DE:de"],
  fr: ["fr", "FR", "FR:fr"], es: ["es", "ES", "ES:es"], ch: ["de", "CH", "CH:de"], nl: ["nl", "NL", "NL:nl"],
  jp: ["ja", "JP", "JP:ja"], in: ["en-IN", "IN", "IN:en"], br: ["pt-BR", "BR", "BR:pt-419"], ca: ["en-CA", "CA", "CA:en"],
  au: ["en-AU", "AU", "AU:en"], kr: ["ko", "KR", "KR:ko"],
};

// Notizie su una singola società: edizione italiana + edizione del mercato di quotazione
export function companyFeeds(name, region) {
  const clean = String(name).replace(/\b(S\.?p\.?A\.?|Inc\.?|Corp(oration)?\.?|plc|N\.?V\.?|S\.?A\.?|AG|SE|Ltd\.?|Limited|Holdings?|Group)\b/gi, "").replace(/[,.]+$/, "").trim();
  const q = `"${clean}"`;
  const feeds = [{ lang: "it", q, hl: "it", gl: "IT", ceid: "IT:it" }];
  const ed = EDITION[region];
  if (ed && region !== "it") feeds.push({ lang: ed[0].slice(0, 2), q, hl: ed[0], gl: ed[1], ceid: ed[2] });
  else if (!ed) feeds.push({ lang: "en", q, hl: "en-US", gl: "US", ceid: "US:en" });
  return feeds;
}
