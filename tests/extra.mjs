// Test aggiuntivi per le funzioni più recenti (importati da smoke.mjs).
export default [
  {
    name: "calendario: dati macro tradotti, filtri e utili societari",
    async run({ page, assert }) {
      await page.click("[data-tab=markets]");
      await page.click('#mk-subnav button[data-v="calendar"]');
      await page.waitForSelector("#cal-list .cal-ev, #cal-list .empty");
      await page.click('#cal-impact button[data-v="0"]');
      const n = await page.$$eval("#cal-list .cal-ev", (l) => l.length);
      const meta = await page.textContent("#cal-meta");
      assert(n > 0 || meta.includes("aggiornato"), "calendario vuoto");
      await page.click('#cal-kind button[data-v="earnings"]');
      await page.waitForSelector("#cal-list .cal-ev, #cal-list .empty");
      await page.click('#mk-subnav button[data-v="overview"]');
      assert(!(await page.isHidden("#mk-view-overview")), "panoramica non ripristinata");
    },
  },
  {
    name: "il punto del giorno (se pubblicato)",
    async run({ page, assert }) {
      const has = await page.evaluate(async () => (await fetch("data/brief.json")).ok);
      if (!has) return;
      await page.click("[data-tab=news]");
      await page.reload();
      const gen = await page.evaluate(async () => (await (await fetch("data/brief.json")).json()).generatedAt);
      if (Date.now() - Date.parse(gen) > 3 * 864e5) {
        await page.waitForSelector("#news-list li");
        return assert(await page.isHidden("#brief"), "riepilogo vecchio mostrato");
      }
      await page.waitForSelector("#brief:not([hidden])", { timeout: 5000 });
      await page.click("#brief-toggle");
      assert(await page.evaluate(() => document.querySelector("#brief").classList.contains("open")), "espansione non funzionante");
    },
  },
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
  {
    name: "grafico avanzato: indicatori tecnici e RSI",
    async run({ page, assert }) {
      await page.click("[data-tab=markets]");
      await page.click('#mk-indices .tile[data-sym="^GSPC"]');
      await page.waitForSelector("#dt-chart svg");
      await page.click('#dt-gran button[data-v="day"]');
      await page.click('#dt-range button[data-v="1A"]');
      for (const k of ["sma50", "sma200", "boll", "rsi"]) await page.click(`#dt-ind [data-ind="${k}"]`);
      const paths = await page.$$eval("#dt-chart svg path", (p) => p.length);
      assert(paths >= 6, `linee degli indicatori mancanti (${paths})`);
      assert(await page.$("#dt-chart .rsi"), "pannello RSI assente");
      for (const k of ["sma50", "sma200", "boll", "rsi"]) await page.click(`#dt-ind [data-ind="${k}"]`);
    },
  },
  {
    name: "confronto tra titoli in base percentuale",
    async run({ page, assert }) {
      await page.click("[data-tab=markets]");
      await page.click('#mk-indices .tile[data-sym="^GSPC"]');
      await page.waitForSelector("#dt-chart svg");
      await page.click("#dt-cmp-add");
      await page.fill("#dt-cmp-q", "eni");
      await page.click('#dt-cmp-res [data-cmp="ENI.MI"]');
      await page.waitForSelector(".dt-cmp-item");
      const ax = await page.$$eval("#dt-chart text.ax", (t) => t.map((x) => x.textContent).join(" "));
      assert(ax.includes("%"), "asse non in percentuale durante il confronto");
      await page.click("[data-cmp-del]");
      assert(!(await page.$(".dt-cmp-item")), "confronto non rimosso");
    },
  },
  {
    name: "fondamentali e notizie nella scheda titolo (se disponibili)",
    async run({ page, assert }) {
      await page.click("[data-tab=markets]");
      await page.fill("#q-input", "eni");
      await page.click('#q-results li[data-sym="ENI.MI"]');
      await page.waitForSelector("#dt-chart svg");
      const hasF = await page.evaluate(async () => !!(await (await fetch("data/markets.json")).json()).quotes.find((q) => q.symbol === "ENI.MI")?.f);
      if (hasF) assert(!(await page.isHidden("#dt-fund")) && (await page.textContent("#dt-fund")).includes("P/E"), "fondamentali non mostrati");
      await page.click("#dt-back");
      await page.fill("#q-input", "");
    },
  },
];
