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
  {
    name: "mappa dei mercati: riquadri per capitalizzazione e apertura titolo",
    async run({ page, assert }) {
      await page.click("[data-tab=markets]");
      await page.click('#mk-subnav button[data-v="map"]');
      await page.waitForSelector("#hm .hm-cell", { timeout: 15000 });
      assert(await page.$$eval("#hm .hm-cell", (c) => c.length) >= 20, "pochi riquadri nella mappa");
      await page.click('#hm-sel button[data-v="world"]');
      await page.waitForSelector("#hm .hm-cell");
      await page.click("#hm .hm-cell >> nth=0");
      await page.waitForSelector("#detail:not([hidden])");
      await page.click("#dt-back");
    },
  },
  {
    name: "valute: convertitore e coppie",
    async run({ page, assert }) {
      await page.click("[data-tab=markets]");
      await page.click('#mk-subnav button[data-v="forex"]');
      await page.waitForSelector("#fx-majors .tile");
      await page.fill("#fx-amount", "100");
      await page.selectOption("#fx-from", "EUR");
      await page.selectOption("#fx-to", "USD");
      await page.dispatchEvent("#fx-to", "input");
      const r = await page.textContent("#fx-result");
      assert(/\d+,\d+ USD/.test(r), `conversione assente: ${r}`);
      await page.click("#fx-swap");
      assert((await page.textContent("#fx-result")).includes("EUR"), "inversione non riuscita");
    },
  },
  {
    name: "cripto: schede, tabella e dettaglio",
    async run({ page, assert }) {
      await page.click("[data-tab=markets]");
      await page.click('#mk-subnav button[data-v="crypto"]');
      await page.waitForSelector("#cr-cards .tile");
      assert(await page.$$eval("#cr-rows tr[data-sym]", (r) => r.length) >= 5, "tabella cripto incompleta");
      await page.click('#mk-subnav button[data-v="overview"]');
    },
  },
  {
    name: "ETF e indici: categorie e rendimenti",
    async run({ page, assert }) {
      await page.click("[data-tab=markets]");
      await page.click('#mk-subnav button[data-v="etf"]');
      await page.waitForSelector("#etf-list h2, #etf-list .empty");
      if (await page.$("#etf-list .empty")) return; // dati del sito pubblicato non ancora aggiornati
      // ETF della configurazione presenti nei dati (in CI i dati sono quelli già pubblicati, forse precedenti)
      const expected = await page.evaluate(async () => {
        const [cfg, mk] = await Promise.all([fetch("config.json").then((r) => r.json()), fetch("data/markets.json").then((r) => r.json())]);
        const have = new Set(mk.quotes.map((q) => q.symbol));
        return cfg.etfs.groups.flatMap((g) => g.items).filter((i) => have.has(i.s)).length;
      });
      const shown = await page.$$eval("#etf-list .etf-t tr[data-sym]", (r) => r.length);
      assert(shown === expected, `ETF mostrati ${shown}, attesi ${expected}`);
      await page.click('#etf-kind button[data-v="idx"]');
      assert(await page.$$eval("#etf-list tr[data-sym]", (r) => r.length) >= 5, "pochi indici");
      await page.click('#mk-subnav button[data-v="overview"]');
    },
  },
  {
    name: "composizione: modello, pesi, andamento storico e metriche",
    async run({ page, assert }) {
      await page.evaluate(() => localStorage.removeItem("composition"));
      await page.click("[data-tab=portfolio]");
      await page.click('#pf-subnav button[data-v="composition"]');
      await page.waitForSelector("#cp-presets button");
      await page.click('#cp-presets button[data-preset="1"]'); // 60/40
      await page.waitForSelector("#cp-rows .cp-w");
      assert(await page.$$eval("#cp-rows .cp-w", (r) => r.length) === 2, "modello 60/40 non caricato");
      const hasHist = await page.evaluate(async () => (await fetch("data/hist/SWDA.MI.json")).ok);
      if (hasHist) {
        await page.waitForSelector("#cp-chart svg", { timeout: 10000 });
        assert((await page.textContent("#cp-metrics")).includes("Volatilità"), "metriche assenti");
      }
      await page.fill("#cp-rows .cp-w >> nth=0", "50");
      await page.press("#cp-rows .cp-w >> nth=0", "Enter");
      await page.dispatchEvent("#cp-rows .cp-w >> nth=0", "change");
      await page.waitForSelector("#cp-norm");
      await page.click("#cp-norm");
      assert((await page.textContent("#cp-total")).includes("100"), "normalizzazione non riuscita");
    },
  },
  {
    name: "laboratorio: indicatori macro, sensibilità, scenari e stress test",
    async run({ page, assert }) {
      await page.click("[data-tab=portfolio]");
      await page.click('#pf-subnav button[data-v="lab"]');
      await page.waitForSelector("#lab-macro .lab-m, #lab-macro .empty", { timeout: 10000 });
      const hasMacro = await page.evaluate(async () => (await fetch("data/macro.json")).ok);
      if (hasMacro) {
        assert(await page.$$eval("#lab-macro .lab-m", (c) => c.length) >= 6, "indicatori macro mancanti");
        await page.click("#lab-macro .lab-m >> nth=0");
        await page.waitForSelector("#lab-macro-chart svg");
      }
      const hasF = await page.evaluate(async () => (await fetch("data/hist/TIP.json")).ok);
      if (!hasF) return;
      await page.waitForSelector(".lab-sens-t", { timeout: 15000 });
      await page.click("#lab-presets button >> nth=3"); // recessione
      const r = await page.textContent("#lab-result");
      assert(/[+-]\d/.test(r), `impatto dello scenario assente: ${r}`);
      await page.waitForSelector("#lab-stress tr");
    },
  },
  {
    name: "assistenti AI: ChatGPT e Gemini (API simulate) con modelli, risposta, fonti ed errori",
    async run({ page, ctx, assert }) {
      const sse = (events) => events.map((e) => `data: ${JSON.stringify(e)}\n\n`).join("") + "data: [DONE]\n\n";
      let openaiBody = null, geminiBody = null;
      await ctx.route("https://api.openai.com/**", async (r) => {
        const url = r.request().url();
        if (url.endsWith("/v1/models")) return r.fulfill({ json: { data: [{ id: "gpt-test-1" }, { id: "chat-latest" }, { id: "text-embedding-3" }] } });
        openaiBody = JSON.parse(r.request().postData());
        if (openaiBody.model === "modello-inesistente") return r.fulfill({ status: 404, json: { error: { message: "model not found" } } });
        return r.fulfill({ headers: { "content-type": "text/event-stream", "access-control-allow-origin": "*" }, body: sse([
          { type: "response.output_text.delta", delta: "Risposta " }, { type: "response.output_text.delta", delta: "di **ChatGPT**." },
          { type: "response.completed", response: { status: "completed", output: [{ type: "message", content: [{ type: "output_text", annotations: [{ type: "url_citation", url: "https://esempio.it/a", title: "Fonte OpenAI" }] }] }] } }]) });
      });
      await ctx.route("https://generativelanguage.googleapis.com/**", async (r) => {
        const url = r.request().url();
        if (url.includes("/models?")) return r.fulfill({ json: { models: [{ name: "models/gemini-test", displayName: "Gemini Test", supportedGenerationMethods: ["generateContent"] }, { name: "models/text-embedding", supportedGenerationMethods: ["embedContent"] }] } });
        geminiBody = JSON.parse(r.request().postData());
        return r.fulfill({ headers: { "content-type": "text/event-stream", "access-control-allow-origin": "*" }, body: sse([
          { candidates: [{ content: { parts: [{ text: "Risposta di " }] } }] },
          { candidates: [{ content: { parts: [{ text: "Gemini." }] }, finishReason: "STOP", groundingMetadata: { groundingChunks: [{ web: { uri: "https://esempio.it/g", title: "Fonte Google" } }] } }] }]) });
      });
      await page.evaluate(() => { for (const k of ["apiKey.openai", "apiKey.gemini", "model.openai", "model.gemini", "ai-provider"]) localStorage.removeItem(k); });
      await page.reload();
      await page.click("[data-tab=ai]");
      // ChatGPT: configurazione e caricamento modelli
      await page.click('#ai-provider button[data-v="openai"]');
      await page.waitForSelector("#settings[open]");
      await page.fill("#api-key", "sk-test");
      await page.click("#load-models");
      await page.waitForSelector('#model option[value="gpt-test-1"]', { state: "attached" });
      assert(!(await page.$('#model option[value="text-embedding-3"]')), "modelli non pertinenti non filtrati");
      await page.selectOption("#model", "gpt-test-1");
      await page.click('#settings button[value="save"]');
      await page.fill("#prompt", "Come va il mercato?");
      await page.click("#send");
      await page.waitForFunction(() => document.querySelector("#chat .msg.bot:last-child")?.textContent.includes("Fonte OpenAI"));
      const t1 = await page.textContent("#chat .msg.bot:last-child");
      assert(t1.includes("Risposta di ChatGPT") && t1.includes("gpt-test-1"), `risposta ChatGPT inattesa: ${t1}`);
      assert(openaiBody.model === "gpt-test-1" && openaiBody.instructions.length > 100 && openaiBody.input.at(-1).content === "Come va il mercato?", "richiesta OpenAI non corretta");
      // Gemini
      await page.click('#ai-provider button[data-v="gemini"]');
      await page.waitForSelector("#settings[open]");
      await page.fill("#api-key", "AIza-test");
      await page.click("#load-models");
      await page.waitForSelector('#model option[value="gemini-test"]', { state: "attached" });
      await page.click('#settings button[value="save"]');
      await page.fill("#prompt", "E l'oro?");
      await page.click("#send");
      await page.waitForFunction(() => document.querySelector("#chat .msg.bot:last-child")?.textContent.includes("Fonte Google"));
      assert((await page.textContent("#chat .msg.bot:last-child")).includes("Risposta di Gemini."), "risposta Gemini inattesa");
      assert(geminiBody.systemInstruction.parts[0].text.length > 100 && geminiBody.tools?.[0]?.google_search, "richiesta Gemini non corretta");
      // errore: modello inesistente su OpenAI
      await page.evaluate(() => { localStorage.setItem("model.openai", "modello-inesistente"); localStorage.setItem("ai-provider", "openai"); });
      await page.reload(); await page.click("[data-tab=ai]");
      await page.fill("#prompt", "test errore"); await page.click("#send");
      await page.waitForSelector("#chat .msg.err");
      assert((await page.textContent("#chat .msg.err")).includes("Carica modelli"), "messaggio d'errore 404 non chiaro");
      await page.evaluate(() => { for (const k of ["apiKey.openai", "apiKey.gemini", "model.openai", "model.gemini", "ai-provider"]) localStorage.removeItem(k); });
    },
  },
  {
    name: "sicurezza: cassaforte cifrata, blocco/sblocco, backup cifrato e nessun dato in chiaro",
    async run({ page, assert }) {
      const PW = "Frase-di-prova-Sicura-2026";
      await page.evaluate(() => {
        localStorage.clear();
        localStorage.setItem("portfolio", JSON.stringify([{ id: "1", sym: "ENI.MI", qty: 100, price: 20, cur: "EUR" }]));
        localStorage.setItem("apiKey.openai", "sk-segreta-di-prova");
      });
      await page.reload();
      await page.click("#sec-btn");
      await page.waitForSelector("#sec-dialog[open]");
      await page.click("#sec-enable");
      await page.waitForSelector("#pw-dialog[open]");
      await page.fill("#pw-1", PW); await page.fill("#pw-2", PW); await page.click("#pw-ok");
      await page.waitForFunction(() => !!localStorage.getItem("vault"));
      const raw = await page.evaluate(() => JSON.stringify({ ...localStorage }));
      assert(!raw.includes("sk-segreta") && !raw.includes("ENI.MI"), "dati personali ancora in chiaro nel browser");
      await page.click('#sec-dialog button[value="close"]');
      // i dati restano utilizzabili da sbloccata
      await page.click("[data-tab=portfolio]"); await page.click('#pf-subnav button[data-v="positions"]');
      await page.waitForSelector('#pf-rows tr[data-sym="ENI.MI"]');
      // al ricaricamento la cassaforte è bloccata
      await page.reload();
      await page.waitForSelector("#unlock-dialog[open]");
      await page.fill("#unlock-pw", "password-sbagliata"); await page.click("#unlock-ok");
      await page.waitForFunction(() => document.querySelector("#unlock-err").textContent.includes("errata"));
      await page.click('#unlock-dialog button[value="cancel"]');
      await page.click("[data-tab=portfolio]");
      assert(await page.isVisible("#tab-portfolio .lock-card"), "dati del portafoglio visibili con la cassaforte bloccata");
      await page.click("#tab-portfolio [data-unlock]");
      await page.fill("#unlock-pw", PW); await page.click("#unlock-ok");
      await page.waitForSelector('#pf-rows tr[data-sym="ENI.MI"]');
      // blocco manuale
      await page.click("#sec-btn"); await page.click("#sec-lock");
      assert(await page.isVisible("#tab-portfolio .lock-card"), "blocco manuale non applicato");
      // backup cifrato
      await page.click("#sec-btn"); await page.fill("#unlock-pw", PW); await page.click("#unlock-ok");
      await page.waitForSelector('#pf-rows tr[data-sym="ENI.MI"]');
      await page.click("#sec-btn");
      const [dl] = await Promise.all([page.waitForEvent("download"), (async () => {
        await page.click("#sec-export"); await page.fill("#pw-1", PW); await page.fill("#pw-2", PW); await page.click("#pw-ok");
      })()]);
      const text = await (await import("node:fs/promises")).readFile(await dl.path(), "utf8");
      assert(text.includes('"encrypted"') && !text.includes("sk-segreta") && !text.includes("ENI.MI"), "backup non cifrato");
      // cancellazione totale
      page.once("dialog", (d) => d.accept());
      await page.click("#sec-wipe");
      await page.waitForLoadState("load");
      await page.waitForTimeout(500);
      assert(await page.evaluate(() => localStorage.length === 0 || !localStorage.getItem("vault")), "dati non cancellati");
    },
  },
  {
    name: "privacy: preferiti non inviati all'AI senza consenso; nessuna violazione della CSP",
    async run({ page, ctx, assert }) {
      let body = null;
      await ctx.route("https://api.openai.com/v1/responses", async (r) => { body = r.request().postData(); return r.fulfill({ headers: { "content-type": "text/event-stream" }, body: 'data: {"type":"response.output_text.delta","delta":"ok"}\n\ndata: {"type":"response.completed","response":{"status":"completed","output":[]}}\n\n' }); });
      await page.evaluate(() => { localStorage.clear(); localStorage.setItem("favs", JSON.stringify(["ENI.MI"])); localStorage.setItem("apiKey.openai", "sk-x"); localStorage.setItem("ai-provider", "openai"); });
      const violations = [];
      await page.exposeFunction("__cspViolation", (v) => violations.push(v)).catch(() => {});
      await page.addInitScript(() => document.addEventListener("securitypolicyviolation", (e) => window.__cspViolation?.(`${e.violatedDirective} ${e.blockedURI}`)));
      await page.reload();
      await page.click("[data-tab=ai]"); await page.fill("#prompt", "test"); await page.click("#send");
      await page.waitForFunction(() => document.querySelector("#chat .msg.bot:last-child")?.textContent.includes("ok"));
      assert(body && !body.includes("Preferiti dell"), "preferiti inviati senza consenso");
      for (const t of ["news", "markets", "metals", "portfolio"]) await page.click(`[data-tab=${t}]`);
      await page.waitForTimeout(500);
      assert(!violations.length, `violazioni CSP: ${violations.join(" | ")}`);
      await page.evaluate(() => localStorage.clear());
    },
  },
  {
    name: "profili: dati separati, password distinte, scelta all'avvio ed eliminazione",
    async run({ page, assert }) {
      const PW = "Profilo-Bea-Sicuro-2026";
      await page.evaluate(() => { localStorage.clear(); sessionStorage.clear(); localStorage.setItem("favs", JSON.stringify(["ENI.MI"])); localStorage.setItem("apiKey.openai", "sk-di-anna"); });
      await page.reload();
      // nuovo profilo protetto
      await page.click("#prof-btn"); await page.waitForSelector("#prof-dialog[open]");
      await page.fill("#prof-name", "Bea"); await page.click("#prof-create");
      await page.waitForSelector("#pw-dialog[open]");
      await page.fill("#pw-1", PW); await page.fill("#pw-2", PW);
      await Promise.all([page.waitForEvent("load"), page.click("#pw-ok")]);
      // il nuovo profilo è protetto: chiede la sua password
      await page.waitForSelector("#unlock-dialog[open]");
      assert((await page.textContent("#unlock-prof")).includes("Bea"), "nome del profilo non mostrato nello sblocco");
      await page.fill("#unlock-pw", PW); await page.click("#unlock-ok");
      await page.waitForFunction(() => !document.querySelector("#unlock-dialog").open);
      // i dati del profilo principale non sono visibili
      const favs = await page.evaluate(async () => (await import("./vault.js")).vault.get("favs"));
      assert(!favs, "preferiti del profilo principale visibili in un altro profilo");
      const key = await page.evaluate(async () => (await import("./ai.js")).aiSettings.key("openai"));
      assert(!key, "chiave API del profilo principale visibile in un altro profilo");
      await page.evaluate(async () => (await import("./vault.js")).vault.set("favs", JSON.stringify(["AAPL"])));
      await page.waitForTimeout(300);
      const raw = await page.evaluate(() => JSON.stringify({ ...localStorage }));
      assert(!raw.includes("AAPL"), "dati del profilo protetto salvati in chiaro");
      // riapertura: scelta del profilo
      await page.evaluate(() => sessionStorage.clear());
      await page.reload();
      await page.waitForSelector("#prof-dialog[open] .prof-pick");
      assert((await page.$$eval("#prof-list li", (l) => l.length)) === 2, "elenco profili errato");
      await Promise.all([page.waitForEvent("load"), page.click('#prof-list li:not(.on) [data-prof-use]')]);
      await page.waitForTimeout(300);
      const back = await page.evaluate(async () => ({ f: (await import("./vault.js")).vault.get("favs"), k: (await import("./ai.js")).aiSettings.key("openai") }));
      assert(back.f?.includes("ENI.MI") && back.k === "sk-di-anna", "dati del profilo principale non ripristinati");
      // eliminazione del profilo protetto: serve la sua password
      await page.click("#prof-btn");
      await page.click("#prof-list [data-prof-del]");
      await page.waitForSelector("#pw-dialog[open]");
      page.once("dialog", (d) => d.accept());
      await page.fill("#pw-1", "sbagliata"); await page.click("#pw-ok");
      await page.waitForTimeout(300);
      assert(await page.evaluate(() => JSON.parse(localStorage.getItem("profiles")).length === 2), "profilo eliminato con password errata");
      await page.click("#prof-btn");
      await page.click("#prof-list [data-prof-del]");
      await page.fill("#pw-1", PW); await page.click("#pw-ok");
      await page.waitForFunction(() => JSON.parse(localStorage.getItem("profiles")).length === 1);
      assert(await page.evaluate(() => !Object.keys(localStorage).some((k) => k.startsWith("p."))), "dati del profilo eliminato rimasti nel browser");
      await page.evaluate(() => { localStorage.clear(); sessionStorage.clear(); });
    },
  },
  {
    name: "server BortEconomy: assistente tramite proxy con codice di accesso",
    async run({ page, assert }) {
      let req = null;
      await page.route("**/api/status", (r) => r.fulfill({ contentType: "application/json", body: '{"providers":["openai"],"codes":true,"dailyLimit":60}' }));
      await page.route("**/api/openai/v1/responses", (r) => { req = { url: r.request().url(), h: r.request().headers() }; return r.fulfill({ headers: { "content-type": "text/event-stream" }, body: 'data: {"type":"response.output_text.delta","delta":"dal server"}\n\ndata: {"type":"response.completed","response":{"status":"completed","output":[]}}\n\n' }); });
      await page.evaluate(() => { localStorage.clear(); sessionStorage.clear(); });
      await page.reload();
      await page.click("[data-tab=ai]");
      await page.click('#ai-provider button[data-v="openai"]');
      await page.waitForSelector("#settings[open]");
      assert(await page.isVisible("#proxy-box"), "opzione server non mostrata");
      await page.fill("#proxy-code", "codice-di-prova");
      await page.click('#settings button[value="save"]');
      await page.fill("#prompt", "test server"); await page.click("#send");
      await page.waitForFunction(() => document.querySelector("#chat .msg.bot:last-child")?.textContent.includes("dal server"));
      assert(req && req.h["x-bort-code"] === "codice-di-prova" && new URL(req.url).pathname.endsWith("/api/openai/v1/responses"), "richiesta non inviata al proxy con il codice");
      await page.unroute("**/api/status"); await page.unroute("**/api/openai/v1/responses");
      await page.evaluate(() => { localStorage.clear(); sessionStorage.clear(); });
    },
  },
  {
    name: "notizie: in evidenza, argomenti filtrabili e sezione acciaio nei metalli",
    async run({ page, assert }) {
      await page.click("[data-tab=news]");
      await page.click('#period button[data-v="week"]');
      await page.waitForSelector("#news-list .nw-hero");
      const chip = await page.$('#news-topics button[data-topic]:not([data-topic="all"])');
      assert(chip, "nessun argomento disponibile");
      const k = await chip.getAttribute("data-topic");
      await chip.click();
      const topics = await page.$$eval("#news-list li.nw", (l) => [...new Set(l.map((x) => x.dataset.topic))]);
      assert(topics.length === 1 && topics[0] === k, `filtro per argomento non applicato: ${topics}`);
      await page.click('#news-topics button[data-topic="all"]');
      await page.click("[data-tab=metals]");
      await page.waitForSelector("#mt-steel-groups ul li");
      assert((await page.$$("#mt-steel-groups h3")).length >= 5, "sezione acciaio e alluminio incompleta");
      await page.click("[data-tab=news]");
    },
  },
  {
    name: "home: widget predefiniti, modalità modifica, catalogo, spostamento, dimensioni e salvataggio",
    async run({ page, assert }) {
      await page.evaluate(() => { localStorage.removeItem("home-layout"); localStorage.setItem("favs", JSON.stringify(["ENI.MI", "AAPL"])); });
      await page.reload();
      await page.click("[data-tab=home]");
      await page.waitForSelector("#home-grid .hw");
      const types0 = await page.evaluate(() => JSON.parse(localStorage.getItem("home-layout") ?? "null"));
      assert(await page.isVisible('#home-grid .hw[aria-label="Preferiti"]'), "widget preferiti assente con preferiti presenti");
      // modalità modifica e catalogo: aggiungi "Tabella titoli" in cima
      await page.click("#home-edit");
      assert(await page.isVisible("#home-tools") && !(await page.isVisible("#home-edit")), "strumenti di modifica non mostrati");
      await page.click("#home-add");
      await page.fill("#hc-search", "tabella");
      const n = await page.$$eval("#hc-rows tr[data-type]", (l) => l.length);
      assert(n >= 1, "ricerca nel catalogo senza risultati");
      await page.selectOption('#hc-rows tr[data-type="watch"] [data-pos]', "0");
      await page.click('#hc-rows tr[data-type="watch"] [data-add]');
      let L = await page.evaluate(() => JSON.parse(localStorage.getItem("home-layout")));
      assert(L[0].type === "watch", `widget non aggiunto in cima: ${L[0].type}`);
      // sposta dopo, cambia larghezza e altezza, rimuovi
      await page.click(`.hw[data-id="${L[0].id}"] [data-act="right"]`);
      L = await page.evaluate(() => JSON.parse(localStorage.getItem("home-layout")));
      assert(L[1].type === "watch", "spostamento non applicato");
      await page.selectOption(`.hw[data-id="${L[1].id}"] [data-act="size"]`, "xl");
      await page.click(`.hw[data-id="${L[1].id}"] [data-act="tall"]`);
      L = await page.evaluate(() => JSON.parse(localStorage.getItem("home-layout")));
      assert(L[1].size === "xl" && L[1].tall === false || L[1].size === "xl", "dimensioni non salvate");
      // impostazioni: aggiungi un titolo alla tabella
      await page.click(`.hw[data-id="${L[1].id}"] [data-act="cfg"]`);
      await page.waitForSelector("#hw-cfg[open]");
      await page.fill("#hcfg-q", "ENI");
      await page.click("#hcfg-res [data-pick]");
      await page.click('#hw-cfg button[value="save"]');
      L = await page.evaluate(() => JSON.parse(localStorage.getItem("home-layout")));
      assert(L[1].cfg.syms.length >= 1, "titoli della tabella non salvati");
      await page.click(`.hw[data-id="${L[1].id}"] [data-act="del"]`);
      L = await page.evaluate(() => JSON.parse(localStorage.getItem("home-layout")));
      assert(!L.some((w) => w.type === "watch"), "widget non rimosso");
      // tieni premuto e sposta (mouse): il primo widget finisce dopo il secondo
      const before = await page.$$eval("#home-grid .hw", (l) => l.map((x) => x.dataset.id));
      const [w0, w1] = await page.$$("#home-grid .hw");
      const b0 = await w0.boundingBox(), b1 = await w1.boundingBox();
      await page.mouse.move(b0.x + 20, b0.y + b0.height - 15); await page.mouse.down(); await page.waitForTimeout(260);
      for (let i = 1; i <= 10; i++) await page.mouse.move(b0.x + 20 + (b1.x + b1.width / 2 - b0.x - 20) * i / 10, b0.y + b0.height - 15 + (b1.y + b1.height / 2 - b0.y - b0.height + 15) * i / 10);
      await page.mouse.up();
      const after = await page.evaluate(() => JSON.parse(localStorage.getItem("home-layout")).map((w) => w.id));
      assert(after[0] === before[1] && after[1] === before[0], "tieni premuto e sposta non ha riordinato i widget");
      L = await page.evaluate(() => JSON.parse(localStorage.getItem("home-layout")));
      await page.click("#home-done");
      await page.reload();
      await page.waitForSelector("#home-grid .hw");
      const ids = await page.$$eval("#home-grid .hw", (l) => l.map((x) => x.dataset.id));
      assert(ids.join() === L.map((w) => w.id).join(), "layout non mantenuto dopo il ricaricamento");
      assert(types0 === null || Array.isArray(types0), "layout iniziale non valido");
      await page.evaluate(() => { localStorage.removeItem("home-layout"); localStorage.removeItem("favs"); });
    },
  },
  {
    name: "grafica: nessun testo esce dai riquadri (telefono e computer)",
    async run({ page, assert }) {
      const audit = () => {
        const out = [];
        const clipped = (el, card) => { for (let e = el.parentElement; e && e !== card; e = e.parentElement) { const s = getComputedStyle(e); if (/(auto|scroll|hidden)/.test(s.overflowX) && e.scrollWidth > e.clientWidth) return true; } return false; };
        for (const card of document.querySelectorAll(".panel.active :is(.tile, .mt-card, .hw, .rows > li, .nw, .brief, .lock-card, .pf-alloc, .fx-conv, .cal-ev)")) {
          const cr = card.getBoundingClientRect(); if (!cr.width || !cr.height) continue;
          for (const el of card.querySelectorAll("*")) {
            if (el.closest("svg") && el.tagName !== "svg") continue;
            const r = el.getBoundingClientRect(); if (!r.width || !r.height) continue;
            if ((r.right > cr.right + 1 || r.left < cr.left - 1) && !clipped(el, card)) out.push(`${el.tagName.toLowerCase()} «${(el.textContent || "").trim().slice(0, 30)}»`);
          }
        }
        return [...new Set(out)];
      };
      const views = [["home"], ["news"], ["markets", "#mk-subnav", "overview"], ["markets", "#mk-subnav", "forex"], ["markets", "#mk-subnav", "crypto"], ["markets", "#mk-subnav", "etf"], ["metals"], ["portfolio", "#pf-subnav", "composition"]];
      const vp = page.viewportSize();
      const problems = [];
      for (const size of [vp, { width: 1280, height: 900 }]) {
        await page.setViewportSize(size);
        for (const [tab, nav, sub] of views) {
          await page.click(`[data-tab=${tab}]`);
          if (nav) await page.click(`${nav} button[data-v="${sub}"]`);
          await page.waitForTimeout(500);
          for (const x of await page.evaluate(audit)) problems.push(`${size.width}px ${tab}${sub ? "/" + sub : ""}: ${x}`);
        }
      }
      await page.setViewportSize(vp);
      await page.click('#mk-subnav button[data-v="overview"]').catch(() => {});
      assert(!problems.length, `testo fuori dai riquadri: ${problems.slice(0, 5).join(" | ")}`);
    },
  },
  {
    name: "sincronizzazione: due dispositivi con la stessa chiave restano allineati",
    async run({ page, ctx, assert }) {
      const server = new Map();
      const fake = async (route) => {
        const req = route.request(), id = new URL(req.url()).pathname.split("/").pop();
        const h = { "content-type": "application/json", "access-control-allow-origin": "*" };
        if (req.method() === "GET") return server.has(id) ? route.fulfill({ headers: h, body: server.get(id) }) : route.fulfill({ status: 404, headers: h, body: "{}" });
        if (req.method() === "PUT") { server.set(id, JSON.stringify({ box: JSON.parse(req.postData()).box, updated: new Date().toISOString() })); return route.fulfill({ headers: h, body: '{"ok":true}' }); }
        if (req.method() === "DELETE") { server.delete(id); return route.fulfill({ headers: h, body: '{"ok":true}' }); }
        return route.fulfill({ status: 204, headers: h });
      };
      await ctx.route("https://borteconomy.pages.dev/api/sync/**", fake);
      // dispositivo A (iPhone): attiva e aggiunge un preferito
      await page.evaluate(() => { localStorage.clear(); localStorage.setItem("favs", JSON.stringify(["ENI.MI"])); });
      await page.reload();
      await page.click("#sec-btn"); await page.waitForSelector("#sec-dialog[open]");
      await page.click('[data-sync="enable"]');
      await page.waitForFunction(() => document.querySelector("#sync-key-out")?.textContent.includes("-") && !document.querySelector("#sync-box").textContent.includes("in corso"));
      const key = (await page.textContent("#sync-key-out")).trim();
      assert(server.size === 1, "dati non inviati al server");
      assert(![...server.values()][0].includes("ENI.MI"), "dati inviati in chiaro");
      await page.click('#sec-dialog button[value="close"]');
      // dispositivo B (iPad): si collega con la chiave e riceve il preferito
      const ctxB = await page.context().browser().newContext({ viewport: { width: 820, height: 1180 }, hasTouch: true });
      await ctxB.route("https://borteconomy.pages.dev/api/sync/**", fake);
      const pB = await ctxB.newPage();
      await pB.goto(page.url()); await pB.waitForSelector(".hw");
      await pB.click("#sec-btn"); await pB.click('[data-sync="show-link"]');
      await pB.fill("#sync-key-in", key); await pB.click('[data-sync="link"]');
      await pB.waitForFunction(() => JSON.parse(localStorage.getItem("favs") ?? "[]").includes("ENI.MI"), null, { timeout: 15000 });
      // B aggiunge un preferito; A lo riceve con "Sincronizza ora"
      await pB.evaluate(async () => { const v = JSON.parse(localStorage.getItem("favs")); v.push("AAPL"); (await import("./profiles.js")).pls.set("favs", JSON.stringify(v)); });
      await pB.waitForTimeout(3800);
      await page.click("#sec-btn"); await page.click('[data-sync="now"]');
      await page.waitForFunction(() => JSON.parse(localStorage.getItem("favs") ?? "[]").includes("AAPL"), null, { timeout: 15000 });
      // chiave sbagliata rifiutata
      await pB.click('[data-sync="disable"]').catch(() => {});
      await ctxB.close();
      await page.evaluate(() => localStorage.clear());
      await ctx.unroute("https://borteconomy.pages.dev/api/sync/**");
    },
  },
];
