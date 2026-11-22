// Aggiunge titoli al catalogo monitorato (site/config.json → catalog.USER) a partire dal testo di una richiesta.
// Uso: node scripts/add-symbols.mjs "<titolo issue>" "<corpo issue>"  → scrive il resoconto in add-result.md
// Ogni riga/termine può essere un simbolo Yahoo (es. SFER.MI), aggiunto subito se valido, oppure un nome
// (es. "Ferragamo"): in quel caso si risponde con i risultati della ricerca Yahoo, ciascuno con un link per aggiungerlo.
import { readFile, writeFile } from "node:fs/promises";
import { search, UA } from "./lib/yahoo.mjs";

const [title = "", body = ""] = process.argv.slice(2);
const CONFIG = "site/config.json";
const config = JSON.parse(await readFile(CONFIG, "utf8"));
const OK_TYPES = new Set(["EQUITY", "ETF", "INDEX", "CURRENCY", "CRYPTOCURRENCY", "FUTURE", "MUTUALFUND"]);

// Termini: dal titolo dopo i due punti, poi le righe del corpo (ignorate quelle di commento)
const terms = [title.replace(/^[^:]*:/, ""), ...body.split(/\r?\n/)]
  .flatMap((l) => l.split(/[,;]/))
  .map((t) => t.replace(/[`*_<>]/g, "").trim())
  .filter((t) => t && !t.startsWith("#") && !/^(-{2,}|richiesta|inviata|aggiungi)/i.test(t) && t.length <= 60)
  .slice(0, 10);

async function valid(sym) {
  const r = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?range=5d&interval=1d`, {
    headers: { "User-Agent": UA }, signal: AbortSignal.timeout(15000) }).catch(() => null);
  if (!r?.ok) return null;
  const res = (await r.json()).chart?.result?.[0];
  const m = res?.meta;
  return m && res.indicators?.quote?.[0]?.close?.some((c) => c != null)
    ? { symbol: m.symbol, name: m.longName || m.shortName || m.symbol, exchange: m.fullExchangeName, type: m.instrumentType } : null;
}

const already = new Set([
  ...config.globalIndices, ...config.macro, ...config.globalStocks,
  ...Object.values(config.countries).flatMap((c) => [c.index, ...c.stocks]),
  ...Object.values(config.catalog ?? {}).flatMap((g) => g.symbols),
]);
config.catalog ??= {};
config.catalog.USER ??= { name: "Aggiunti dagli utenti", symbols: [] };

const REPO = process.env.GITHUB_REPOSITORY ?? "RickBortCost/BortEconomy";
const addLink = (sym) => `[➕ aggiungi](https://github.com/${REPO}/issues/new?title=${encodeURIComponent(`Aggiungi titolo: ${sym}`)}&labels=aggiungi-titolo)`;
const lines = [];
const added = [];
for (const term of terms) {
  // 1) simbolo esatto → aggiunto direttamente
  const hit = /^[\w^.=-]{1,25}$/.test(term) ? await valid(term.toUpperCase()) : null;
  if (hit) {
    if (already.has(hit.symbol)) { lines.push(`| ${term} | \`${hit.symbol}\` ${hit.name} | ℹ️ già monitorato |`); continue; }
    config.catalog.USER.symbols.push(hit.symbol);
    already.add(hit.symbol); added.push(hit.symbol);
    lines.push(`| ${term} | \`${hit.symbol}\` ${hit.name} (${hit.exchange}) | ✅ aggiunto |`);
    continue;
  }
  // 2) nome o simbolo non valido → ricerca su Yahoo e proposte da confermare
  const found = (await search(term, 10)).filter((q) => OK_TYPES.has(q.quoteType)).slice(0, 6);
  if (!found.length) { lines.push(`| ${term} | — | ❌ nessun titolo trovato su Yahoo Finance |`); continue; }
  const opts = found.map((q) => `\`${q.symbol}\` ${q.longname || q.shortname || ""} (${q.exchDisp || q.exchange}, ${q.typeDisp || q.quoteType}) ${already.has(q.symbol) ? "— già monitorato" : addLink(q.symbol)}`);
  lines.push(`| ${term} | ${opts.join("<br>")} | 🔎 scegli il titolo da aggiungere |`);
}

if (added.length) await writeFile(CONFIG, JSON.stringify(config, null, 1) + "\n");
const report = terms.length
  ? `| Richiesta | Titolo | Esito |\n|---|---|---|\n${lines.join("\n")}\n\n${added.length
    ? "I titoli aggiunti saranno disponibili sul sito, con storico e grafico, entro pochi minuti."
    : "Nessun titolo aggiunto automaticamente."}`
  : "Nessun titolo indicato. Scrivi il simbolo (es. `SFER.MI`) o il nome dopo `Aggiungi titolo:` nel titolo della richiesta.";
await writeFile("add-result.md", report + "\n");
await writeFile("add-symbols.txt", added.join(" "));
console.log(report);
