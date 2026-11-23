# BortEconomy

Web app (anche mobile, installabile come PWA) con:

- **Notizie economiche** del giorno e della settimana: mondo e paese selezionabile (14 paesi), da Google News RSS in lingua locale + italiano.
- **Mercati**: indici mondiali, valute/materie prime/tassi, migliori e peggiori titoli mondiali (giorno/settimana), titoli principali del paese. Fonte: Yahoo Finance (dati ritardati).
- **Ricerca e preferiti**: ricerca tra i titoli monitorati (indici, valute, materie prime, cripto, ETF, azioni) e una directory mondiale di oltre 11.000 azioni; preferiti salvati nel browser.
- **Nuovi titoli**: "➕ Aggiungi al monitoraggio" apre una richiesta su GitHub; il workflow `Aggiungi titoli` aggiunge il titolo al catalogo e ripubblica il sito con storico e grafico (solo proprietario/collaboratori del repository).
- **Metalli preziosi**: oro, argento, platino, palladio e rame in € o $ per oncia e grammo, rendimenti, rapporti oro/argento e altri, ETC fisici, società minerarie, notizie dedicate; stessa scheda di dettaglio dei titoli.
- **Dettaglio titolo**: grafico interattivo per ore, giorni e settimane con indicatori tecnici (medie mobili, Bollinger, RSI) e confronto tra titoli, statistiche, fondamentali, profilo, notizie e storico (link diretto `#q=SIMBOLO`).
- **Tema chiaro/scuro**: automatico secondo il sistema o scelto manualmente (pulsante 🌓 in alto).
- **ETF e indici**: 45 ETF UCITS per categoria con rendimenti fino a 5 anni.
- **Composizione e Laboratorio**: portafoglio per pesi percentuali con andamento storico e rischio; indicatori macro ufficiali (BCE, Eurostat, BLS), sensibilità a tassi, inflazione, cambio e materie prime, scenari e stress test.
- **Portafoglio**: posizioni salvate nel browser, valore e guadagni in euro, ripartizione, andamento, import/export.
- **Avvisi di prezzo**: notifiche GitHub quando un titolo supera una soglia o si muove oltre una percentuale.
- **Mappa, valute, cripto**: mappa delle società per capitalizzazione e variazione, convertitore e cambi, 23 criptovalute.
- **Calendario economico**: dati macro della settimana e utili societari.
- **Il punto del giorno**: riepilogo mattutino scritto da Claude.
- **Assistenti AI** (Claude, ChatGPT, Gemini): chat con analisi basata sulle notizie e i dati caricati, con ricerca web.

## Come funziona

Sito statico in `site/`. Un workflow GitHub Actions (`.github/workflows/pages.yml`) ogni 30 minuti e a ogni push su `main` esegue `scripts/fetch-data.mjs`, genera i JSON in `site/data/` e pubblica il sito sul branch `gh-pages` (un solo commit, sostituito a ogni esecuzione). Su `main` non vengono committati dati.

Sito: https://rickbortcost.github.io/BortEconomy/

## GitHub Pages

Già attivo: Settings → Pages → Source "Deploy from a branch", branch `gh-pages`, cartella `/ (root)`. Per un aggiornamento immediato: Actions → "Aggiorna dati e pubblica su GitHub Pages" → Run workflow.

## Aggiungere titoli

Dal sito: cerca il titolo, aprilo e tocca **➕ Aggiungi al monitoraggio** (oppure "Non lo trovi? Cerca su Yahoo Finance"). In alternativa crea direttamente una issue con titolo `Aggiungi titolo: SIMBOLO` (es. `Aggiungi titolo: SFER.MI`); più simboli o nomi possono andare nel corpo, uno per riga. I simboli validi vengono aggiunti a `catalog.USER` in `site/config.json`; per i nomi il workflow risponde con i risultati della ricerca e un link per aggiungere ciascuno.

## Avvisi di prezzo

Dalla scheda di un titolo tocca 🔔, scegli la condizione e conferma la richiesta su GitHub (issue `Avviso prezzo: SIMBOLO sopra|sotto|up|down VALORE`). Gli avvisi sono in `site/alerts.json`; a ogni aggiornamento (ogni 30 minuti) vengono controllati e quando scattano si apre una issue che ti menziona. Per rimuoverne uno: pulsante "Rimuovi" nella scheda Portafoglio (issue `Rimuovi avviso: CODICE`).

## Il punto del giorno

Per attivarlo aggiungi una chiave API Anthropic come secret del repository: **Settings → Secrets and variables → Actions → New repository secret**, nome `ANTHROPIC_API_KEY`. Il riepilogo viene generato al primo aggiornamento dopo le 7:00 (ora italiana), una volta al giorno (`scripts/brief.mjs`, modello `claude-opus-5-5`, ricerca web limitata a 4 interrogazioni). Per rigenerarlo subito: Actions → "Aggiorna dati e pubblica su GitHub Pages" → Run workflow → "Rigenera subito il punto del giorno". Senza chiave il sito funziona normalmente e il riquadro non compare.

## Assistenti AI

Nella scheda **AI** scegli Claude, ChatGPT o Gemini e inserisci la chiave del fornitore in Impostazioni (console.anthropic.com, platform.openai.com, aistudio.google.com). Le chiamate partono dal browser direttamente verso l'API del fornitore. "Carica modelli" mostra i modelli attivi sul tuo account.

## Claude

In **Claude AI → ⚙️ Impostazioni** inserisci una chiave API Anthropic (console.anthropic.com). La chiave resta nel `localStorage` del browser e viene inviata solo a `api.anthropic.com`. Usa una chiave con limite di spesa. Modelli: Opus 5.5 (predefinito), Sonnet 5.5, Haiku 5.5.

## Privacy e sicurezza

Dal pulsante con lo scudo in alto: cassaforte cifrata con password (AES-256-GCM, PBKDF2 600.000 iterazioni) per chiavi API, portafoglio, composizione e preferiti; blocco automatico; backup cifrato; eliminazione di tutti i dati; scelta dei dati inviati agli assistenti AI. Il sito ha una Content Security Policy restrittiva e non contatta terze parti oltre alle API degli assistenti. I dati di un profilo si possono **sincronizzare tra dispositivi** (es. iPhone e iPad) con cifratura end-to-end. Più persone sullo stesso dispositivo possono usare **profili** separati (pulsante con l'iniziale in alto), ognuno con dati e password propri. Dettagli, limiti e segnalazione di vulnerabilità in [SECURITY.md](SECURITY.md).

## Cloudflare Pages e server AI

Il workflow **Pubblica su Cloudflare Pages** pubblica una copia del sito su `https://borteconomy.pages.dev` (o il sottodominio assegnato) con intestazioni di sicurezza HTTP e un proxy AI. Secret del repository:

| Secret | Uso |
|---|---|
| `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID` | Pubblicazione (token con Workers Scripts, Cloudflare Pages, Workers KV: Edit; Account Settings: Read) |
| `BORT_ACCESS_CODES` | Codici di accesso al proxy, `nome:codice,nome2:codice2` (codici lunghi e casuali) |
| `GH_DISPATCH_TOKEN` | Facoltativo: token GitHub (fine-grained, solo questo repository, Actions: Read and write) per il timer Cloudflare che avvia l'aggiornamento dei dati ogni 30 minuti |
| `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `GEMINI_API_KEY` | Facoltativi: abilitano il fornitore sul proxy (la prima serve anche al punto del giorno) |

Variabile facoltativa `BORT_DAILY_LIMIT` (richieste al giorno per persona, predefinito 60). Dopo aver cambiato un secret, rilancia il workflow da Actions.

## Affidabilità

- `data/health.json` riporta l'esito di ogni aggiornamento; se è degradato si apre automaticamente una issue di avviso (chiusa da sola al ritorno alla normalità).
- `npm test` esegue i test dell'interfaccia con Playwright (scarica dal sito pubblicato i dati che mancano in `site/data`); in CI girano su ogni pull request.

## Sviluppo locale

```bash
npm ci
node scripts/fetch-data.mjs     # oppure: npm test (usa i dati del sito pubblicato)
npm run serve                   # http://localhost:8000
```

Paesi, titoli monitorati (`catalog`) e sinonimi di ricerca (`aliases`) sono configurabili in `site/config.json`.

## Versioni e release

Versionamento [SemVer](https://semver.org/lang/it/); la versione è in `package.json` ed è mostrata nel piè di pagina dell'app. Le modifiche sono documentate in [`CHANGELOG.md`](CHANGELOG.md).

Per pubblicare una nuova versione:

1. Descrivi le modifiche nella sezione `## [Non rilasciato]` di `CHANGELOG.md` (`### Aggiunto`, `### Modificato`, `### Corretto`, `### Rimosso`).
2. Esegui `npm run release:patch` (correzioni), `release:minor` (nuove funzioni) o `release:major` (modifiche incompatibili).
3. Fai commit e merge su `main`.

Il workflow `.github/workflows/release.yml` crea automaticamente il tag `vX.Y.Z` e la GitHub Release con le note prese dal changelog; il workflow Pages ripubblica il sito.
