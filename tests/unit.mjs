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

// cifratura (stesse primitive WebCrypto del browser)
const { sealWithPassword, openWithPassword, strength } = await import("../site/vault.js");
const secret = { portafoglio: [{ sym: "ENI.MI", qty: 100 }], chiave: "sk-ant-segreta" };
const box = await sealWithPassword(secret, "una frase lunga e sicura 2026!");
check("il contenuto cifrato non contiene i dati in chiaro", !JSON.stringify(box).includes("sk-ant") && !JSON.stringify(box).includes("ENI"));
check("decifratura con la password corretta", JSON.stringify(await openWithPassword(box, "una frase lunga e sicura 2026!")) === JSON.stringify(secret));
check("password errata rifiutata", await openWithPassword(box, "sbagliata").then(() => false, () => true));
const tampered = { ...box, ct: box.ct.slice(0, -4) + (box.ct.slice(-4) === "AAAA" ? "BBBB" : "AAAA") };
check("dati manomessi rifiutati (autenticazione AES-GCM)", await openWithPassword(tampered, "una frase lunga e sicura 2026!").then(() => false, () => true));
const box2 = await sealWithPassword(secret, "una frase lunga e sicura 2026!");
check("sale e IV casuali a ogni cifratura", box2.salt !== box.salt && box2.iv !== box.iv);
check("valutazione robustezza password", strength("abc") === 0 && strength("Una-Frase-Lunga-2026") >= 3);

// proxy AI (Cloudflare Pages Function) con fetch simulato
{
  const { onRequest } = await import("../functions/api/[[path]].js");
  const kv = new Map();
  const env = { ACCESS_CODES: "anna:codice-anna-123,bea:codice-bea-456", OPENAI_API_KEY: "sk-server", DAILY_LIMIT: "2",
    USAGE: { get: async (k) => kv.get(k) ?? null, put: async (k, v) => { kv.set(k, v); } } };
  const real = globalThis.fetch; let sent = null;
  globalThis.fetch = async (url, init) => { sent = { url: String(url), init }; return new Response('{"ok":1}', { headers: { "content-type": "application/json", "set-cookie": "x=1" } }); };
  const call = (path, { code, origin = "https://bort.pages.dev", method = "POST" } = {}) => onRequest({ env, params: { path: path.split("/") },
    request: new Request(`https://bort.pages.dev/api/${path}?key=leak`, { method, body: method === "POST" ? "{}" : undefined,
      headers: { origin, "content-type": "application/json", ...(code ? { "x-bort-code": code } : {}), authorization: "Bearer proxy" } }) });
  const st = await (await call("status", { method: "GET" })).json();
  check("proxy: stato senza dati sensibili", st.providers.join() === "openai" && !JSON.stringify(st).includes("sk-server") && !JSON.stringify(st).includes("codice"));
  check("proxy: codice mancante o errato rifiutato", (await call("openai/v1/responses")).status === 401 && (await call("openai/v1/responses", { code: "sbagliato" })).status === 401);
  check("proxy: altra origine rifiutata", (await call("openai/v1/responses", { code: "codice-anna-123", origin: "https://evil.example" })).status === 403);
  check("proxy: percorsi non ammessi rifiutati", (await call("openai/v1/files", { code: "codice-anna-123" })).status === 404);
  check("proxy: fornitore non configurato", (await call("anthropic/v1/messages", { code: "codice-anna-123" })).status === 503);
  sent = null;
  const ok = await call("openai/v1/responses", { code: "codice-anna-123" });
  const h = sent?.init.headers ?? {};
  check("proxy: inoltro con chiave del server, senza codice né parametro key", ok.status === 200 && sent.url === "https://api.openai.com/v1/responses" && h.authorization === "Bearer sk-server" && !JSON.stringify(h).includes("codice") && !ok.headers.get("set-cookie"));
  await call("openai/v1/responses", { code: "codice-anna-123" });
  check("proxy: limite giornaliero per persona", (await call("openai/v1/responses", { code: "codice-anna-123" })).status === 429 && (await call("openai/v1/responses", { code: "codice-bea-456" })).status === 200);
  for (let i = 0; i < 25; i++) await call("openai/v1/responses", { code: "tentativo-" + i });
  check("proxy: blocco dopo troppi codici errati dallo stesso IP", (await call("openai/v1/responses", { code: "codice-bea-456" })).status === 429);
  globalThis.fetch = real;
}
{
  const { onRequestGet } = await import("../functions/data/[[path]].js");
  const real = globalThis.fetch; let url = null;
  globalThis.fetch = async (u) => { url = String(u); return new Response("{}"); };
  const r1 = await onRequestGet({ env: {}, params: { path: ["", "", "evil.example", "a.json"] }, request: new Request("https://x/") });
  const r2 = await onRequestGet({ env: {}, params: { path: ["meta.json"] }, request: new Request("https://x/") });
  check("dati: nessuna richiesta fuori dall'origine dei dati", r1.status === 404 && r2.status === 200 && url === "https://rickbortcost.github.io/BortEconomy/data/meta.json");
  globalThis.fetch = real;
}

// filtro notizie: solo economia e mercati
{
  const { isFinance } = await import("../scripts/lib/finance-filter.mjs");
  const yes = [["it", "Piazza Affari chiude in calo, FTSE MIB -2%", "ANSA"], ["it", "Mutui più cari, tassi ai massimi da un anno e mezzo", "QuiFinanza"],
    ["en", "Bond Market's Go-To Trade for Fed Hikes Roiled by Stocks Retreat", "Bloomberg.com"], ["de", "DAX-Wochenausblick: Was folgt nach 2.000 Punkten Minus?", "stock3"],
    ["fr", "La Bourse de Paris recule, le CAC 40 perd 2%", "Le Figaro"], ["ja", "日経平均が急落、円高進む", "NHK"]];
  const no = [["it", "Che tempo che fa: le auto sportive di Grillo sono da sogno", "Virgilio"], ["it", "Studenti indagati senza borsa di studio", "Stylo24"],
    ["it", "Amazon al Black Friday 2026: le migliori offerte tra moda e casa", "Vogue"], ["en", "How to sanitize your cutting board", "AP News"],
    ["de", "Lidl hat ab Montag die coolen Angebote in den Sonderregalen", "TAG24"], ["en", "Lakers beat Celtics in overtime", "ESPN"]];
  check("filtro notizie: tiene economia e borsa", yes.every(([lang, title, source]) => isFinance({ lang, title, source })));
  check("filtro notizie: scarta cronaca, sport, offerte e moda", no.every(([lang, title, source]) => !isFinance({ lang, title, source })));
}

// timer degli aggiornamenti (Worker Cloudflare)
{
  const { default: worker } = await import("../workers/scheduler/index.js");
  const env = { GH_DISPATCH_TOKEN: "ghp_test", REPO: "o/r", WORKFLOW: "pages.yml", DATA_URL: "https://x/data/meta.json", MAX_AGE_MIN: "25" };
  const real = globalThis.fetch; const calls = [];
  const run = async (minutesAgo) => {
    calls.length = 0;
    globalThis.fetch = async (url, init) => { calls.push({ url: String(url), init });
      return String(url).includes("meta.json") ? Response.json({ updated: new Date(Date.now() - minutesAgo * 60000).toISOString() }) : new Response(null, { status: 204 }); };
    await worker.scheduled({}, env, {});
  };
  await run(10);
  check("timer: dati recenti, nessun avvio", calls.length === 1);
  await run(40);
  const d = calls[1];
  check("timer: dati vecchi, avvia pages.yml su main", d?.url === "https://api.github.com/repos/o/r/actions/workflows/pages.yml/dispatches" && JSON.parse(d.init.body).ref === "main" && d.init.headers.Authorization === "Bearer ghp_test");
  globalThis.fetch = real;
}

console.log(failed ? `\n${failed} test falliti` : "\nTutti i test unitari superati");
process.exit(failed ? 1 : 0);
