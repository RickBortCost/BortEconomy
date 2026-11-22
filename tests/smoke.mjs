// Test end-to-end dell'interfaccia (Playwright, viewport mobile). Uso: node tests/smoke.mjs
// Avvia un server statico su site/, esegue i controlli e termina con codice ≠ 0 se qualcosa fallisce.
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { chromium, devices } from "playwright";

const ROOT = "site";
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml", ".webmanifest": "application/manifest+json" };
const server = createServer(async (req, res) => {
  const path = normalize(decodeURIComponent(new URL(req.url, "http://x").pathname)).replace(/^(\.\.[/\\])+/, "");
  const file = join(ROOT, path.endsWith("/") ? `${path}index.html` : path);
  try { const body = await readFile(file); res.writeHead(200, { "Content-Type": TYPES[extname(file)] ?? "application/octet-stream" }); res.end(body); }
  catch { res.writeHead(404); res.end("not found"); }
}).listen(0);
const BASE = `http://localhost:${server.address().port}/`;

const results = [];
async function test(name, fn) {
  const t = Date.now();
  try { await fn(); results.push([true, name]); console.log(`✓ ${name} (${Date.now() - t} ms)`); }
  catch (e) { results.push([false, name]); console.log(`✗ ${name}\n    ${String(e.message).split("\n")[0]}`); if (process.env.DEBUG) console.log(e.stack); }
  // pulizia: chiude eventuali schede o finestre rimaste aperte, così un errore non si propaga ai test successivi
  await page.keyboard.press("Escape").catch(() => {});
  await page.evaluate(() => { document.querySelectorAll("dialog[open]").forEach((d) => d.close()); }).catch(() => {});
}
const assert = (cond, msg) => { if (!cond) throw new Error(msg); };

const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
const ctx = await browser.newContext({ ...devices["iPhone 13"] });
await ctx.route(/^https:\/\/(github\.com|api\.anthropic\.com|cdn\.jsdelivr\.net)\//, (r) => r.fulfill({ status: 200, body: "stub" }));
const page = await ctx.newPage();
page.setDefaultTimeout(10000);
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));

await test("la pagina si carica e mostra le notizie", async () => {
  await page.goto(BASE);
  await page.waitForSelector("#news-list li", { timeout: 10000 });
  assert(await page.$$eval("#news-list li a", (l) => l.length) > 0, "nessuna notizia");
  assert((await page.textContent("#foot")).includes("v"), "versione nel piè di pagina assente");
});

await test("mercati: indici, migliori e peggiori", async () => {
  await page.click("[data-tab=markets]");
  await page.waitForSelector("#mk-indices .tile");
  assert(await page.$$eval("#mk-gainers li[data-sym]", (l) => l.length) >= 5, "pochi titoli migliori");
});

await test("dettaglio titolo: grafico ore/giorni/settimane e storico", async () => {
  await page.click('#mk-indices .tile[data-sym="^GSPC"]');
  await page.waitForSelector("#dt-chart svg");
  for (const g of ["hour", "day", "week"]) {
    await page.click(`#dt-gran button[data-v=${g}]`);
    await page.waitForSelector("#dt-chart svg");
    assert(await page.$$eval("#dt-hist tr", (r) => r.length) > 0, `storico vuoto (${g})`);
  }
  await page.click("#dt-back");
});

await test("ricerca: titoli monitorati e directory mondiale", async () => {
  await page.fill("#q-input", "eni");
  await page.waitForSelector('#q-results li[data-sym="ENI.MI"]');
  await page.fill("#q-input", "ferragamo");
  await page.waitForSelector("#q-results li[data-sym]", { timeout: 10000 });
  await page.fill("#q-input", "");
});

await test("preferiti: aggiunta e persistenza", async () => {
  await page.fill("#q-input", "eni");
  await page.click('#q-results li[data-sym="ENI.MI"] [data-star]');
  await page.fill("#q-input", "");
  await page.reload(); await page.click("[data-tab=markets]");
  await page.waitForSelector('#mk-favs li[data-sym="ENI.MI"]');
});

await test("metalli: schede, rapporti e dettaglio", async () => {
  await page.click("[data-tab=metals]");
  await page.waitForSelector(".mt-card");
  assert(await page.$$eval(".mt-card", (c) => c.length) >= 4, "schede metalli mancanti");
  await page.waitForSelector(".mt-ratio .p", { timeout: 10000 });
  await page.click(".mt-card >> nth=0");
  await page.waitForSelector("#dt-chart svg");
  assert((await page.textContent("#dt-stats")).includes("grammo"), "prezzo al grammo assente");
  await page.click("#dt-back");
});

await test("tema scuro", async () => {
  await page.click("#theme-btn"); await page.click("#theme-btn");
  assert(await page.evaluate(() => document.documentElement.dataset.theme) === "dark", "tema scuro non applicato");
  await page.click("#theme-btn");
});

await test("nessuno scorrimento orizzontale su mobile", async () => {
  for (const tab of ["news", "markets", "metals", "portfolio", "ai"]) {
    await page.click(`[data-tab=${tab}]`);
    assert(!(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)), `overflow nella scheda ${tab}`);
  }
});

for (const extra of (await import("./extra.mjs").catch(() => ({ default: [] }))).default) {
  if (process.env.ONLY && !extra.name.includes(process.env.ONLY)) continue; // ONLY=testo esegue solo i test aggiuntivi che lo contengono
  await test(extra.name, () => extra.run({ page, ctx, BASE, assert }));
}

await test("nessun errore JavaScript", async () => assert(!errors.length, errors.join(" | ")));

await browser.close();
server.close();
const failed = results.filter(([ok]) => !ok);
console.log(`\n${results.length - failed.length}/${results.length} test superati`);
process.exit(failed.length ? 1 : 0);
