# BortEconomy

Web app (anche mobile, installabile come PWA) con:

- **Notizie economiche** del giorno e della settimana: mondo e paese selezionabile (14 paesi), da Google News RSS in lingua locale + italiano.
- **Mercati**: indici mondiali, valute/materie prime/tassi, migliori e peggiori titoli mondiali (giorno/settimana), titoli principali del paese. Fonte: Yahoo Finance (dati ritardati).
- **Ricerca e preferiti**: ricerca tra i titoli monitorati (indici, valute, materie prime, cripto, ETF, azioni) e una directory mondiale di oltre 11.000 azioni; preferiti salvati nel browser.
- **Nuovi titoli**: "➕ Aggiungi al monitoraggio" apre una richiesta su GitHub; il workflow `Aggiungi titoli` aggiunge il titolo al catalogo e ripubblica il sito con storico e grafico (solo proprietario/collaboratori del repository).
- **Metalli preziosi**: oro, argento, platino, palladio e rame in € o $ per oncia e grammo, rendimenti, rapporti oro/argento e altri, ETC fisici, società minerarie, notizie dedicate; stessa scheda di dettaglio dei titoli.
- **Dettaglio titolo**: grafico interattivo per ore, giorni e settimane, statistiche e storico per ogni simbolo (link diretto `#q=SIMBOLO`).
- **Tema chiaro/scuro**: automatico secondo il sistema o scelto manualmente (pulsante 🌓 in alto).
- **Claude AI**: chat con analisi basata sulle notizie e i dati caricati, con ricerca web.

## Come funziona

Sito statico in `site/`. Un workflow GitHub Actions (`.github/workflows/pages.yml`) ogni 30 minuti e a ogni push su `main` esegue `scripts/fetch-data.mjs`, genera i JSON in `site/data/` e pubblica il sito sul branch `gh-pages` (un solo commit, sostituito a ogni esecuzione). Su `main` non vengono committati dati.

Sito: https://rickbortcost.github.io/BortEconomy/

## GitHub Pages

Già attivo: Settings → Pages → Source "Deploy from a branch", branch `gh-pages`, cartella `/ (root)`. Per un aggiornamento immediato: Actions → "Aggiorna dati e pubblica su GitHub Pages" → Run workflow.

## Aggiungere titoli

Dal sito: cerca il titolo, aprilo e tocca **➕ Aggiungi al monitoraggio** (oppure "Non lo trovi? Cerca su Yahoo Finance"). In alternativa crea direttamente una issue con titolo `Aggiungi titolo: SIMBOLO` (es. `Aggiungi titolo: SFER.MI`); più simboli o nomi possono andare nel corpo, uno per riga. I simboli validi vengono aggiunti a `catalog.USER` in `site/config.json`; per i nomi il workflow risponde con i risultati della ricerca e un link per aggiungere ciascuno.

## Claude

In **Claude AI → ⚙️ Impostazioni** inserisci una chiave API Anthropic (console.anthropic.com). La chiave resta nel `localStorage` del browser e viene inviata solo a `api.anthropic.com`. Usa una chiave con limite di spesa. Modelli: Opus 5.5 (predefinito), Sonnet 5.5, Haiku 5.5.

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
