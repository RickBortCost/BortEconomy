# Changelog

Tutte le modifiche rilevanti di BortEconomy sono documentate qui.
Formato: [Keep a Changelog](https://keepachangelog.com/it-IT/1.1.0/) · Versionamento: [Semantic Versioning](https://semver.org/lang/it/).

## [Non rilasciato]

## [1.0.0] - 2026-11-22

### Aggiunto
- Web app statica responsive, installabile su mobile (PWA), pubblicata su GitHub Pages.
- **Notizie**: notizie economiche delle ultime 24 ore e dei 7 giorni, per il mondo e per 14 paesi selezionabili (Italia, Stati Uniti, Regno Unito, Germania, Francia, Spagna, Svizzera, Giappone, Cina, India, Brasile, Canada, Australia, Corea del Sud), con ricerca testuale. Fonte: Google News RSS in lingua locale e in italiano.
- **Mercati**: indici mondiali, valute, materie prime, tassi, Bitcoin e VIX con grafico a 1 mese; migliori e peggiori titoli mondiali (giorno/settimana); titoli principali del paese selezionato. Fonte: Yahoo Finance (dati ritardati).
- **Claude AI**: chat in streaming con contesto di notizie e mercati, ricerca web, scelta del modello (Opus 5.5, Sonnet 5.5, Haiku 5.5), richieste rapide predefinite. Chiave API conservata solo nel browser.
- Aggiornamento automatico dei dati ogni 30 minuti tramite GitHub Actions.
- Release automatica con tag e note dal changelog a ogni nuova versione su `main`.

[Non rilasciato]: https://github.com/RickBortCost/BortEconomy/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/RickBortCost/BortEconomy/releases/tag/v1.0.0
