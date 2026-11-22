// Test aggiuntivi per le funzioni più recenti (importati da smoke.mjs).
export default [
  {
    name: "portafoglio: aggiunta posizioni, riepilogo in euro, ripartizione e andamento",
    async run({ page, assert }) {
      await page.evaluate(() => localStorage.removeItem("portfolio"));
      await page.click("[data-tab=portfolio]");
      await page.click("#pf-add-empty");
      await page.fill("#pf-sym", "eni");
      await page.click('#pf-sym-results [data-pick="ENI.MI"]');
      await page.fill("#pf-qty", "100");
      await page.fill("#pf-price", "20");
      await page.fill("#pf-date", "2025-01-15");
      await page.click('#pf-dialog button[value="save"]');
      await page.waitForSelector('#pf-rows tr[data-sym="ENI.MI"]');
      // seconda posizione in dollari: il valore deve essere convertito in euro
      await page.click("#pf-add");
      await page.fill("#pf-sym", "AAPL");
      await page.fill("#pf-qty", "10");
      await page.fill("#pf-price", "150");
      await page.click('#pf-dialog button[value="save"]');
      await page.waitForSelector('#pf-rows tr[data-sym="AAPL"]');
      const summary = await page.textContent("#pf-summary");
      assert(/Valore\s*[\d.]+,\d\d €/.test(summary), `riepilogo senza valore in euro: ${summary}`);
      assert(await page.$$eval(".pf-legend li", (l) => l.length) >= 1, "ripartizione assente");
      await page.waitForSelector("#pf-hist svg, #pf-hist .empty");
      await page.click('#pf-alloc-by button[data-v="currency"]');
      assert((await page.textContent(".pf-legend")).includes("USD"), "ripartizione per valuta senza USD");
    },
  },
  {
    name: "portafoglio: modifica, eliminazione ed esportazione CSV",
    async run({ page, assert }) {
      await page.click('#pf-rows tr[data-sym="AAPL"] [data-edit]');
      await page.waitForSelector("#pf-dialog[open]");
      await page.click('#pf-dialog button[value="delete"]');
      await page.waitForSelector('#pf-rows tr[data-sym="AAPL"]', { state: "detached" });
      const [dl] = await Promise.all([page.waitForEvent("download"), page.click("#pf-export-csv")]);
      const text = await (await import("node:fs/promises")).readFile(await dl.path(), "utf8");
      assert(text.includes("ENI.MI;100;20"), `CSV inatteso: ${text}`);
    },
  },
  {
    name: "avvisi di prezzo: modulo dalla scheda titolo e richiesta GitHub",
    async run({ page, ctx, assert }) {
      await page.click("[data-tab=markets]");
      await page.click('#mk-indices .tile[data-sym="^GSPC"]');
      await page.click("#dt-alert");
      await page.waitForSelector("#al-dialog[open]");
      await page.selectOption("#al-op", "above");
      await page.fill("#al-value", "7000");
      const [popup] = await Promise.all([ctx.waitForEvent("page"), page.click('#al-dialog button[value="save"]')]);
      const url = decodeURIComponent(popup.url());
      await popup.close();
      assert(url.includes("Avviso prezzo: ^GSPC above 7000"), `URL richiesta inatteso: ${url}`);
      await page.click("#dt-back");
    },
  },
];
