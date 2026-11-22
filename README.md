# BortEconomy

Web app (anche mobile, installabile come PWA) con:

- **Notizie economiche** del giorno e della settimana: mondo e paese selezionabile (14 paesi), da Google News RSS in lingua locale + italiano.
- **Mercati**: indici mondiali, valute/materie prime/tassi, migliori e peggiori titoli mondiali (giorno/settimana), titoli principali del paese. Fonte: Yahoo Finance (dati ritardati).
- **Claude AI**: chat con analisi basata sulle notizie e i dati caricati, con ricerca web.

## Come funziona

Sito statico in `site/`. Un workflow GitHub Actions (`.github/workflows/pages.yml`) ogni 30 minuti esegue `scripts/fetch-data.mjs`, genera i JSON in `site/data/` e pubblica su GitHub Pages. Nessun dato viene committato.

## Attivazione GitHub Pages

1. Unisci il codice nel branch `main`.
2. Repository → **Settings → Pages → Source: GitHub Actions**.
3. Avvia il workflow (Actions → "Aggiorna dati e pubblica" → Run workflow) o attendi il prossimo push/esecuzione.
4. Il sito sarà su `https://<utente>.github.io/BortEconomy/`.

GitHub Pages su repository privati richiede un piano a pagamento.

## Claude

In **Claude AI → ⚙️ Impostazioni** inserisci una chiave API Anthropic (console.anthropic.com). La chiave resta nel `localStorage` del browser e viene inviata solo a `api.anthropic.com`. Usa una chiave con limite di spesa. Modelli: Opus 5.5 (predefinito), Sonnet 5.5, Haiku 5.5.

## Sviluppo locale

```bash
node scripts/fetch-data.mjs
cd site && python3 -m http.server 8000
```

Paesi e titoli monitorati sono configurabili in `site/config.json`.
