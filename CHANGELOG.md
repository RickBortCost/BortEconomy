# Changelog

Tutte le modifiche rilevanti di BortEconomy sono documentate qui.
Formato: [Keep a Changelog](https://keepachangelog.com/it-IT/1.1.0/) · Versionamento: [Semantic Versioning](https://semver.org/lang/it/).

## [Non rilasciato]

## [1.1.0] - 2026-11-22

### Aggiunto
- **Dettaglio titolo**: tocca qualsiasi indice, valuta, materia prima o azione per aprire la scheda completa.
  - Grafico interattivo con granularità **Ore** (1G, 3G, 1S, 1M), **Giorni** (1M, 3M, 6M, 1A, 2A) e **Settimane** (1A, 3A, 5A, 10A), volumi, linea di riferimento e cursore con prezzo, data e variazione (anche al tocco su mobile).
  - Statistiche: chiusura precedente, min/max del giorno e 52 settimane, volume, variazioni 1 settimana / 1 mese / 1 anno, borsa.
  - Tabella storico del periodo con chiusura, variazione e volume.
  - Pulsante "Chiedi a Claude" per l'analisi del titolo; link diretto condivisibile (`#q=SIMBOLO`) e tasto Indietro del browser.
- Storici per ogni simbolo in `data/hist/` (orario 1 mese, giornaliero 2 anni, settimanale 10 anni).

### Corretto
- Quotazioni vuote quando aggiornate da GitHub Actions: Yahoo Finance limitava le richieste in parallelo. Ora le richieste sono distribuite nel tempo con backoff, e se un simbolo non si scarica vengono mantenuti gli ultimi dati pubblicati.
- Simbolo Roche aggiornato (`RO.SW`).

## [1.0.1] - 2026-11-22

### Corretto
- Pubblicazione su GitHub Pages tramite branch `gh-pages`: il sito è online senza configurazione manuale.
- Aggiornate le azioni `checkout` e `setup-node` alla v5 (Node.js 20 deprecato sui runner).

## [1.0.0] - 2026-11-22

### Aggiunto
- Web app statica responsive, installabile su mobile (PWA), pubblicata su GitHub Pages.
- **Notizie**: notizie economiche delle ultime 24 ore e dei 7 giorni, per il mondo e per 14 paesi selezionabili (Italia, Stati Uniti, Regno Unito, Germania, Francia, Spagna, Svizzera, Giappone, Cina, India, Brasile, Canada, Australia, Corea del Sud), con ricerca testuale. Fonte: Google News RSS in lingua locale e in italiano.
- **Mercati**: indici mondiali, valute, materie prime, tassi, Bitcoin e VIX con grafico a 1 mese; migliori e peggiori titoli mondiali (giorno/settimana); titoli principali del paese selezionato. Fonte: Yahoo Finance (dati ritardati).
- **Claude AI**: chat in streaming con contesto di notizie e mercati, ricerca web, scelta del modello (Opus 5.5, Sonnet 5.5, Haiku 5.5), richieste rapide predefinite. Chiave API conservata solo nel browser.
- Aggiornamento automatico dei dati ogni 30 minuti tramite GitHub Actions.
- Release automatica con tag e note dal changelog a ogni nuova versione su `main`.

[Non rilasciato]: https://github.com/RickBortCost/BortEconomy/compare/v1.1.0...HEAD
[1.1.0]: https://github.com/RickBortCost/BortEconomy/compare/v1.0.1...v1.1.0
[1.0.1]: https://github.com/RickBortCost/BortEconomy/compare/v1.0.0...v1.0.1
[1.0.0]: https://github.com/RickBortCost/BortEconomy/releases/tag/v1.0.0
