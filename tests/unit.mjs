// Test unitari delle funzioni dati (senza rete). Uso: node tests/unit.mjs
import { evaluate, describe } from "../scripts/lib/alerts.mjs";
import { encodeSeries, decodeSeries, scalePts } from "../scripts/lib/markets.mjs";

let failed = 0;
const check = (name, cond) => { console.log(`${cond ? "✓" : "✗"} ${name}`); if (!cond) failed++; };
const now = new Date().toISOString();

// avvisi
const quotes = [
  { symbol: "GC=F", name: "Oro", price: 3390, changePct: -3.2, currency: "USD", time: now },
  { symbol: "ENI.MI", name: "ENI", price: 24.1, changePct: 5.1, currency: "EUR", time: now },
  { symbol: "OLD", name: "Vecchio", price: 1, changePct: 0, time: "2020-01-01T00:00:00Z" },
  { symbol: "STALE", name: "Non aggiornato", price: 1, changePct: 0, time: now, stale: true },
];
const alerts = [
  { id: "a", symbol: "GC=F", op: "below", value: 3400 },
  { id: "b", symbol: "GC=F", op: "above", value: 3400 },
  { id: "c", symbol: "ENI.MI", op: "up", value: 5 },
  { id: "d", symbol: "GC=F", op: "down", value: 3 },
  { id: "e", symbol: "OLD", op: "below", value: 5 },
  { id: "f", symbol: "STALE", op: "below", value: 5 },
  { id: "g", symbol: "GC=F", op: "below", value: 9999, triggeredAt: now },
];
const fired = evaluate(alerts, quotes).map((a) => a.id).sort().join("");
check(`avvisi scattati corretti (atteso acd, ottenuto ${fired})`, fired === "acd");
check("avviso scattato marcato con data e prezzo", alerts[0].triggeredAt && alerts[0].triggerPrice === 3390);
check("descrizione leggibile", describe(alerts[0], quotes[0]) === "Oro (GC=F) sotto 3400 USD");

// storici compatti
const pts = [[1000, 10.5, 300], [1060, 10.7], [1200, 11, 500]];
check("codifica/decodifica storici", JSON.stringify(decodeSeries(encodeSeries(pts))) === JSON.stringify(pts));
check("decodifica formato classico", decodeSeries(pts) === pts);
check("conversione da centesimi", scalePts([[1, 13412, 5]], 100)[0][1] === 134.12);

console.log(failed ? `\n${failed} test falliti` : "\nTutti i test unitari superati");
process.exit(failed ? 1 : 0);
