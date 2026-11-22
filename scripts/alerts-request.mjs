// Crea o rimuove avvisi di prezzo da una richiesta (issue) del sito.
// Titoli: "Avviso prezzo: SIMBOLO sopra|sotto|above|below|up|down VALORE"  ·  "Rimuovi avviso: ID"
import { readFile, writeFile } from "node:fs/promises";
import { randomBytes } from "node:crypto";
import { UA } from "./lib/yahoo.mjs";
import { OPS, OP_ALIASES, describe } from "./lib/alerts.mjs";

const [title = ""] = process.argv.slice(2);
const ISSUE = Number(process.env.ISSUE) || undefined;
const ALERTS = "site/alerts.json", CONFIG = "site/config.json";
const data = JSON.parse(await readFile(ALERTS, "utf8").catch(() => '{"alerts":[]}'));
const config = JSON.parse(await readFile(CONFIG, "utf8"));
let report, added = [];

async function validSymbol(sym) {
  const r = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?range=5d&interval=1d`, { headers: { "User-Agent": UA } }).catch(() => null);
  const m = r?.ok ? (await r.json()).chart?.result?.[0]?.meta : null;
  return m ? { symbol: m.symbol, name: m.longName || m.shortName || m.symbol, currency: m.currency } : null;
}

if (/^rimuovi avviso/i.test(title)) {
  const id = title.replace(/^[^:]*:/, "").trim();
  const a = data.alerts.find((x) => x.id === id);
  if (a) {
    data.alerts = data.alerts.filter((x) => x.id !== id);
    report = `🗑️ Avviso rimosso: ${describe(a)}`;
  } else report = `Nessun avviso con codice \`${id}\`.`;
} else {
  const m = title.replace(/^[^:]*:/, "").trim().match(/^(\S+)\s+(\S+)\s+([\d.,]+)\s*%?$/);
  const op = m && OP_ALIASES[m[2].toLowerCase()];
  const value = m && +m[3].replace(",", ".");
  const q = m && op && value > 0 ? await validSymbol(m[1].toUpperCase()) : null;
  if (m && op && value > 0 && !q) {
    report = `❌ Il simbolo \`${m[1].toUpperCase()}\` non è stato trovato su Yahoo Finance. Cerca il titolo nel sito e crea l'avviso dalla sua scheda.`;
  } else if (!q) {
    report = "❌ Richiesta non valida. Formato: `Avviso prezzo: SIMBOLO sopra|sotto|up|down VALORE` (es. `Avviso prezzo: GC=F sotto 3400`).";
  } else {
    const a = { id: randomBytes(4).toString("hex"), symbol: q.symbol, op, value, createdAt: new Date().toISOString(), issue: ISSUE };
    data.alerts.push(a);
    report = `✅ Avviso creato: **${describe(a, q)}** (codice \`${a.id}\`).\n\nRiceverai una notifica (nuova issue che ti menziona) quando la condizione si verifica, al primo aggiornamento dei dati successivo (ogni 30 minuti).`;
    // il titolo deve essere monitorato per essere valutato
    const monitored = new Set([...config.globalIndices, ...config.macro, ...config.globalStocks,
      ...Object.values(config.countries).flatMap((c) => [c.index, ...c.stocks]), ...Object.values(config.catalog ?? {}).flatMap((g) => g.symbols)]);
    if (!monitored.has(q.symbol)) {
      config.catalog.USER ??= { name: "Aggiunti dagli utenti", symbols: [] };
      config.catalog.USER.symbols.push(q.symbol);
      added.push(q.symbol);
      await writeFile(CONFIG, JSON.stringify(config, null, 1) + "\n");
      report += `\n\nℹ️ ${q.name} non era monitorato: è stato aggiunto al catalogo.`;
    }
    if (!OPS[op]) throw new Error("operatore sconosciuto");
  }
}
await writeFile(ALERTS, JSON.stringify(data, null, 1) + "\n");
await writeFile("add-result.md", report + "\n");
await writeFile("add-symbols.txt", added.join(" ") || "avvisi");
console.log(report);
