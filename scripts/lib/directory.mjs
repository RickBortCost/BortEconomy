// Directory mondiale delle azioni quotate (borsa principale di ogni paese), con prezzo e variazione.
import { screener } from "./yahoo.mjs";

// [regione, borse principali, valuta, USD per unità (approssimato, solo per la soglia), soglia minima in USD]
export const REGIONS = [
  ["us", ["NMS", "NYQ", "NGM", "NCM", "ASE"], "USD", 1, 5e8],
  ["it", ["MIL"], "EUR", 1.08, 3e7],
  ["de", ["GER"], "EUR", 1.08, 2e8],
  ["fr", ["PAR"], "EUR", 1.08, 2e8],
  ["gb", ["LSE"], "GBP", 1.27, 2e8],
  ["es", ["MCE"], "EUR", 1.08, 2e8],
  ["ch", ["EBS"], "CHF", 1.13, 2e8],
  ["nl", ["AMS"], "EUR", 1.08, 2e8],
  ["be", ["BRU"], "EUR", 1.08, 2e8],
  ["pt", ["LIS"], "EUR", 1.08, 1e8],
  ["ie", ["ISE"], "EUR", 1.08, 1e8],
  ["at", ["VIE"], "EUR", 1.08, 2e8],
  ["se", ["STO"], "SEK", 0.095, 3e8],
  ["dk", ["CPH"], "DKK", 0.145, 3e8],
  ["no", ["OSL"], "NOK", 0.093, 3e8],
  ["fi", ["HEL"], "EUR", 1.08, 2e8],
  ["pl", ["WSE"], "PLN", 0.25, 3e8],
  ["gr", ["ATH"], "EUR", 1.08, 2e8],
  ["jp", ["JPX"], "JPY", 0.0066, 1e9],
  ["hk", ["HKG"], "HKD", 0.128, 1e9],
  ["cn", ["SHH", "SHZ"], "CNY", 0.138, 2e9],
  ["in", ["NSI"], "INR", 0.012, 1e9],
  ["kr", ["KSC", "KOE"], "KRW", 0.00072, 1e9],
  ["tw", ["TAI", "TWO"], "TWD", 0.031, 1e9],
  ["br", ["SAO"], "BRL", 0.18, 3e8],
  ["ca", ["TOR"], "CAD", 0.73, 3e8],
  ["au", ["ASX"], "AUD", 0.65, 3e8],
  ["sg", ["SES"], "SGD", 0.74, 3e8],
  ["mx", ["MEX"], "MXN", 0.055, 3e8],
  ["za", ["JNB"], "ZAc", 0.00054, 5e8],
  ["il", ["TLV"], "ILA", 0.0027, 3e8],
  ["tr", ["IST"], "TRY", 0.029, 5e8],
  ["sa", ["SAU"], "SAR", 0.27, 1e9],
];

const round = (v, d = 4) => (v == null ? null : +(+v).toPrecision(d + 2));

async function region([reg, exchanges, , fx, minUsd]) {
  const query = { operator: "AND", operands: [
    { operator: "eq", operands: ["region", reg] },
    { operator: "or", operands: exchanges.map((e) => ({ operator: "eq", operands: ["exchange", e] })) },
    { operator: "gt", operands: ["intradaymarketcap", minUsd / fx] },
  ] };
  const out = [];
  for (let offset = 0; offset < 5000; offset += 250) {
    const res = await screener({ offset, size: 250, sortField: "intradaymarketcap", sortType: "DESC", quoteType: "EQUITY", query });
    if (!res) return out.length ? out : null;
    for (const q of res.quotes ?? []) {
      out.push([q.symbol, q.longName || q.shortName || q.symbol, q.fullExchangeName || q.exchange, q.currency,
        round(q.regularMarketPrice, 6), round(q.regularMarketChangePercent, 3), q.marketCap ?? null, reg, q.regularMarketVolume ?? 0]);
    }
    if (offset + 250 >= (res.total ?? 0)) break;
    await new Promise((r) => setTimeout(r, 300));
  }
  return out;
}

// Nome normalizzato per riconoscere lo stesso emittente quotato su più borse
const SUFFIX = /\b(inc|corp|corporation|co|company|ltd|limited|plc|ag|se|sa|s\.?a|nv|n\.?v|spa|s\.?p\.?a|ab|asa|oyj|as|a\/s|kgaa|holdings?|group|the|class [a-z]|cl [a-z]|adr|bdr|cdr|drn|reg|registered|shares?|ordinary)\b/g;
export const normName = (n) => String(n).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
  .replace(/[.,'’()&-]/g, " ").replace(SUFFIX, " ").replace(/\s+/g, " ").trim();

// USD per unità di valuta di quotazione (approssimato: serve solo a confrontare i controvalori)
const FX = { USD: 1, EUR: 1.08, GBP: 1.27, GBp: 0.0127, CHF: 1.13, SEK: 0.095, DKK: 0.145, NOK: 0.093, PLN: 0.25,
  JPY: 0.0066, HKD: 0.128, CNY: 0.138, INR: 0.012, KRW: 0.00072, TWD: 0.031, BRL: 0.18, CAD: 0.73, AUD: 0.65,
  SGD: 0.74, MXN: 0.055, ZAc: 0.00054, ILA: 0.0027, TRY: 0.029, SAR: 0.27 };

// Restituisce { items, failed }; items: [simbolo, nome, borsa, valuta, prezzo, var%, capitalizzazione, regione]
// Tra più quotazioni dello stesso emittente si tengono quelle con controvalore >= 20% della principale.
export async function buildDirectory(log = console.log) {
  const all = [], failed = [], seen = new Set();
  for (const r of REGIONS) {
    const rows = await region(r);
    if (!rows) { failed.push(r[0]); continue; }
    for (const row of rows) if (!seen.has(row[0])) { seen.add(row[0]); all.push(row); }
    log(`directory ${r[0]}: ${rows.length}`);
  }
  const turnover = (row) => (row[4] ?? 0) * (row[8] ?? 0) * (FX[row[3]] ?? 1);
  const best = new Map();
  for (const row of all) { const k = normName(row[1]); best.set(k, Math.max(best.get(k) ?? 0, turnover(row))); }
  const items = all.filter((row) => { const m = best.get(normName(row[1])); return !m || turnover(row) >= 0.2 * m; })
    .map((row) => row.slice(0, 8));
  return { items, failed };
}
