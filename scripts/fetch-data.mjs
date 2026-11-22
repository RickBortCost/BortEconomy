// Scarica notizie, quotazioni, storici, fondamentali e calendario e scrive JSON statici in site/data/.
// Eseguito da GitHub Actions a intervalli regolari. Solo moduli standard di Node (>= 20).
//
// Yahoo limita le raffiche di richieste dagli IP dei runner: le richieste sono quindi poche alla
// volta, con pause e backoff sui 429. Ciò che non si scarica viene preso dall'ultima pubblicazione
// (SITE_URL), così il sito non resta mai vuoto. Lo stato dell'esecuzione è in data/health.json.
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { pool, previous, sleep } from "./lib/http.mjs";
import { buildNews, companyFeeds } from "./lib/news.mjs";
import { buildDirectory } from "./lib/directory.mjs";
import { chart, summarize, scalePts, SERIES, encodeSeries, decodeSeries } from "./lib/markets.mjs";
import { fundamentals, profiles } from "./lib/fundamentals.mjs";
import { macroCalendar, earningsCalendar } from "./lib/calendar.mjs";
import { evaluate as evaluateAlerts } from "./lib/alerts.mjs";
import { buildMacro } from "./lib/macro.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "site", "data");
const config = JSON.parse(await readFile(join(ROOT, "site", "config.json"), "utf8"));
const { version } = JSON.parse(await readFile(join(ROOT, "package.json"), "utf8"));
const write = (name, data) => writeFile(join(OUT, name), JSON.stringify(data));
const fileFor = (sym) => sym.replace(/[^A-Za-z0-9.-]/g, "_");

const DAY_REFRESH_MS = 6 * 3600e3;   // serie giornaliera/settimanale
const NEWS_REFRESH_MS = 3 * 3600e3;  // notizie per singola società
const NEWS_PER_RUN = Number(process.env.COMPANY_NEWS_PER_RUN ?? 80);

const health = { version, started: new Date().toISOString(), warnings: [] };
const warn = (msg) => { health.warnings.push(msg); console.log(`::warning::${msg}`); };

await mkdir(join(OUT, "hist"), { recursive: true });
const updated = new Date().toISOString();
await write("meta.json", { version, updated });

// ---------- Notizie ----------
const newsCount = {};
async function newsFile(key, feeds) {
  let items = await buildNews(feeds);
  if (!items.length) { items = (await previous(`data/news-${key}.json`))?.items ?? []; warn(`Notizie ${key}: nessun risultato, usata la pubblicazione precedente`); }
  await write(`news-${key}.json`, { updated, items });
  newsCount[key] = items.length;
}
await newsFile("WORLD", config.world.feeds);
for (const [code, c] of Object.entries(config.countries)) {
  const feeds = [
    { lang: c.hl.slice(0, 2), url: `https://news.google.com/rss/headlines/section/topic/BUSINESS?hl=${c.hl}&gl=${c.gl}&ceid=${c.ceid}` },
    { lang: c.hl.slice(0, 2), q: c.q, hl: c.hl, gl: c.gl, ceid: c.ceid },
  ];
  if (code !== "IT") feeds.push({ lang: "it", q: c.qit, hl: "it", gl: "IT", ceid: "IT:it" });
  await newsFile(code, feeds);
}
if (config.metals?.news) await newsFile("METALS", config.metals.news);
console.log("news:", JSON.stringify(newsCount));

// ---------- Directory mondiale ----------
const FIELDS = ["symbol", "name", "exchange", "currency", "price", "changePct", "marketCap", "region"];
try {
  const { items, failed } = await buildDirectory(() => {});
  if (failed.length) {
    const prev = await previous("data/directory.json");
    const have = new Set(items.map((i) => i[0]));
    for (const it of prev?.items ?? []) if (failed.includes(it[7]) && !have.has(it[0])) items.push(it);
    if (failed.length > 5) warn(`Directory: ${failed.length} regioni non scaricate (${failed.join(", ")})`);
  }
  if (items.length) await write("directory.json", { updated, fields: FIELDS, items });
  health.directory = { items: items.length, failedRegions: failed };
  console.log(`directory: ${items.length} titoli`);
} catch (e) {
  const prev = await previous("data/directory.json");
  if (prev) await write("directory.json", prev);
  health.directory = { error: e.message };
  warn(`Directory non aggiornata (${e.message})`);
}

// ---------- Mercati ----------
const groupOf = new Map();
for (const [k, g] of Object.entries(config.catalog ?? {})) for (const sym of g.symbols) if (!groupOf.has(sym)) groupOf.set(sym, k);
const allSymbols = [...new Set([
  ...config.globalIndices, ...config.macro, ...config.globalStocks,
  ...Object.values(config.countries).flatMap((c) => [c.index, ...c.stocks]),
  ...Object.values(config.catalog ?? {}).flatMap((g) => g.symbols),
])];

const prevMarkets = await previous("data/markets.json");
const prevQuotes = new Map((prevMarkets?.quotes ?? []).map((q) => [q.symbol, q]));
let fresh = 0, reused = 0, dayCalls = 0, newsCalls = 0;
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
  // Serie riprese dall'ultima pubblicazione: se erano in centesimi e non ancora normalizzate, si convertono
  const centsOld = (hour ?? day)?.cents && !old?.norm ? 100 : 1;
  const merged = {
    symbol: sym, norm: 1,
    tz: (hour ?? day)?.meta.gmtoffset ?? old?.tz ?? 0,
    updated: hour ? updated : old?.updated ?? null,
    dayUpdated: day && week ? updated : old?.dayUpdated ?? null,
    hour: hour?.pts ?? scalePts(decodeSeries(old?.hour), centsOld),
    day: day?.pts ?? scalePts(decodeSeries(old?.day), centsOld),
    week: week?.pts ?? scalePts(decodeSeries(old?.week), centsOld),
    news: old?.news, newsAt: old?.newsAt,
  };
  const q = summarize(sym, hour?.meta ?? day?.meta, merged.day, merged.week);
  const quote = q ? { ...q, group: groupOf.get(sym) } : prevQuotes.get(sym) ? { ...prevQuotes.get(sym), group: groupOf.get(sym), stale: true } : null;
  if (q) fresh++; else if (quote) reused++;

  // Notizie della società (solo azioni), a rotazione per contenere le richieste
  if (quote?.type === "EQUITY" && newsCalls < NEWS_PER_RUN && (!merged.newsAt || Date.now() - Date.parse(merged.newsAt) > NEWS_REFRESH_MS)) {
    newsCalls++;
    const region = groupOf.get(sym)?.toLowerCase();
    const items = await buildNews(companyFeeds(quote.longName || quote.name, region), 15);
    if (items.length || !merged.news) { merged.news = items; merged.newsAt = updated; }
  }
  if (merged.day.length || merged.hour.length) {
    await write(`hist/${fileFor(sym)}.json`, { ...merged, fmt: 2,
      hour: encodeSeries(merged.hour), day: encodeSeries(merged.day), week: encodeSeries(merged.week, false) });
  }
  return quote;
})).filter(Boolean);

// ---------- Fondamentali e profili ----------
const fund = await fundamentals(allSymbols);
const prevFund = new Map((prevMarkets?.quotes ?? []).filter((q) => q.f).map((q) => [q.symbol, q.f]));
for (const q of quotes) {
  const f = fund.get(q.symbol) ?? prevFund.get(q.symbol);
  if (f) q.f = Object.fromEntries(Object.entries(f).filter(([, v]) => v != null));
}
if (fund.size < allSymbols.length / 2) warn(`Fondamentali: solo ${fund.size}/${allSymbols.length} simboli`);

const equities = quotes.filter((q) => q.type === "EQUITY" || q.type === "ETF").map((q) => q.symbol);
const prevProfiles = (await previous("data/profiles.json")) ?? {};
const { profiles: prof, refreshed } = await profiles(equities, prevProfiles, { limit: Number(process.env.PROFILES_PER_RUN ?? 60) });
await write("profiles.json", prof);
for (const q of quotes) if (prof[q.symbol]?.sector) q.sector = prof[q.symbol].sector;

await write("markets.json", { updated, quotes });
console.log(`markets: ${quotes.length}/${allSymbols.length} (aggiornati ${fresh}, precedenti ${reused}, serie lunghe ${dayCalls}, notizie società ${newsCalls}, fondamentali ${fund.size}, profili aggiornati ${refreshed})`);

// ---------- Avvisi di prezzo ----------
// site/alerts.json è la fonte (nel repository); gli avvisi scattati vengono marcati e notificati dal workflow
const ALERTS = join(ROOT, "site", "alerts.json");
const alertsData = JSON.parse(await readFile(ALERTS, "utf8").catch(() => '{"alerts":[]}'));
const fired = evaluateAlerts(alertsData.alerts ?? [], quotes);
if (fired.length) await writeFile(ALERTS, JSON.stringify(alertsData, null, 1) + "\n");
await write("alerts-fired.json", fired);
health.alerts = { active: (alertsData.alerts ?? []).filter((a) => !a.triggeredAt).length, fired: fired.length };
if (fired.length) console.log(`avvisi scattati: ${fired.map((a) => a.text).join(" | ")}`);

// ---------- Indicatori macroeconomici (BCE, Eurostat, BLS), aggiornati ogni 6 ore ----------
const prevMacro = await previous("data/macro.json");
if (!prevMacro?.updated || Date.now() - Date.parse(prevMacro.updated) > 6 * 3600e3 || process.env.MACRO_FORCE) {
  const { series, failed } = await buildMacro(prevMacro);
  await write("macro.json", { updated, series, failed });
  if (failed.length > 4) warn(`Indicatori macro: ${failed.length} serie non aggiornate (${failed.join(", ")})`);
  health.macro = { failed };
} else {
  await write("macro.json", prevMacro);
}

// ---------- Calendario ----------
const macro = await macroCalendar();
if (!macro) warn("Calendario macro non disponibile: usata la pubblicazione precedente");
const prevCal = macro ? null : await previous("data/calendar.json");
await write("calendar.json", { updated, macro: macro ?? prevCal?.macro ?? [], earnings: earningsCalendar(quotes, fund) });

// ---------- Stato dell'esecuzione ----------
Object.assign(health, {
  finished: new Date().toISOString(),
  markets: { total: allSymbols.length, fresh, reused, missing: allSymbols.length - quotes.length },
  news: newsCount,
  fundamentals: fund.size,
  calendar: { macro: macro?.length ?? 0 },
});
const freshRatio = fresh / allSymbols.length;
if (freshRatio < 0.5) warn(`Quotazioni: aggiornate solo ${fresh}/${allSymbols.length} (${Math.round(freshRatio * 100)}%)`);
if ((newsCount.WORLD ?? 0) < 20) warn(`Notizie mondo: solo ${newsCount.WORLD ?? 0}`);
health.status = health.warnings.length ? (freshRatio < 0.5 ? "degraded" : "warning") : "ok";
await write("health.json", health);
console.log(`stato: ${health.status}${health.warnings.length ? ` — ${health.warnings.join(" | ")}` : ""}`);
