// Notizie da Google News RSS: parsing, deduplica e filtro sugli ultimi 7 giorni.
import { get, pool } from "./http.mjs";
import { isFinance } from "./finance-filter.mjs";

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

// finance = true: solo notizie di economia, finanza e mercati (filtro di pertinenza sul titolo e sulla fonte)
export async function buildNews(feeds, limit = 250, { finance = false } = {}) {
  const lists = await pool(feeds, 4, async (f) => parseRss(await get(feedUrl(f)), f.lang));
  const seen = new Set(), perSource = new Map();
  const now = Date.now();
  return lists.flat()
    .filter((n) => now - new Date(n.date) < WEEK_MS)
    .filter((n) => !finance || isFinance(n))
    .sort((a, b) => b.date.localeCompare(a.date))
    .filter((n) => {
      const key = n.title.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim().slice(0, 80);
      if (seen.has(key)) return false;
      seen.add(key); return true;
    })
    .filter((n) => { // al massimo 12 notizie per fonte: più varietà
      if (!finance) return true;
      const c = (perSource.get(n.source) ?? 0) + 1; perSource.set(n.source, c);
      return c <= 12;
    })
    .slice(0, limit);
}

// Ricerca aggiuntiva su borsa e mercati per lingua (compensa le notizie generiche scartate dal filtro)
export const MARKET_Q = {
  it: "\"Piazza Affari\" OR \"Borsa di Milano\" OR \"titoli azionari\" OR \"mercati finanziari\" OR spread OR BCE", en: "\"stock market\" OR stocks OR earnings OR \"bond yields\"",
  de: "Börse OR Aktien OR Anleihen OR Leitzins", fr: "Bourse OR actions OR \"marchés financiers\"", es: "Bolsa OR acciones OR \"mercados financieros\"",
  pt: "Bolsa OR ações OR \"mercado financeiro\"", ja: "株式市場 OR 株価 OR 日銀", zh: "股市 OR 股票 OR 央行", ko: "증시 OR 주식 OR 한국은행",
};

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
