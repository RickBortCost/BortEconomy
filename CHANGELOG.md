# Changelog

Tutte le modifiche rilevanti di BortEconomy sono documentate qui.
Formato: [Keep a Changelog](https://keepachangelog.com/it-IT/1.1.0/) · Versionamento: [Semantic Versioning](https://semver.org/lang/it/).

## [Non rilasciato]

## [1.6.0] - 2026-11-22

### Aggiunto
- **Avviso automatico sui dati**: se un aggiornamento scarica meno della metà delle quotazioni (o lo script si interrompe) viene aperta una issue "⚠️ Aggiornamento dati degradato" che menziona il proprietario (notifica GitHub anche sul telefono); si aggiorna al massimo ogni 3 ore e si chiude da sola quando i dati tornano regolari. Stato di ogni esecuzione in `data/health.json`.
- **Test automatici** (Playwright, viewport mobile) su ogni pull request e prima di ogni pubblicazione dovuta a un rilascio: caricamento, mercati, dettaglio con grafici, ricerca, preferiti, metalli, tema scuro, assenza di scorrimento orizzontale ed errori JavaScript. `npm test` in locale.
- **App offline**: service worker che conserva interfaccia e ultimi dati; barra di avviso quando si è offline.
- **Stato del mercato**: indicatore aperto / chiuso / pre-apertura / after-hours su schede, elenchi e dettaglio.
- **Chiave di Claude solo per la sessione**: opzione "Ricorda la chiave su questo dispositivo" (disattivandola la chiave si cancella alla chiusura della scheda).
- Dati raccolti per le prossime funzioni: fondamentali (P/E, dividendo, EPS, rating analisti, medie mobili), profilo e settore delle società, calendario economico e degli utili, notizie per singola società.

### Modificato
- Prezzi in centesimi convertiti nella valuta principale: Londra in sterline (es. "134,12 GBP" invece di "13.412 GBp"), Johannesburg in rand, Tel Aviv in shekel.
- Storici in formato compatto (colonne e date incrementali, senza volumi settimanali): circa il 35% in meno di dati.
- Script di aggiornamento suddiviso in moduli (`scripts/lib/`).

## [1.5.0] - 2026-11-22

### Aggiunto
- **Sezione Metalli** (nuova scheda 🥇): oro, argento, platino, palladio e rame (future continui COMEX/NYMEX).
  - Schede con prezzo per oncia/libbra e al grammo, variazione e grafico a 1 mese; variazione selezionabile giorno / settimana / mese / anno; prezzi in **euro** (al cambio EUR/USD corrente) o dollari.
  - Tabella prezzi per oncia, grammo e chilogrammo; tabella rendimenti 1G / 1S / 1M / 1A e distanza dal massimo a 52 settimane.
  - **Rapporti** oro/argento, oro/platino, platino/palladio con grafico a 1 anno, media, minimo e massimo.
  - ETC fisici (Borsa Italiana, Xetra) ed ETF; società minerarie e di royalty.
  - Notizie dedicate ai metalli preziosi (italiano e inglese) e analisi con Claude.
- Ogni metallo ha la stessa scheda di dettaglio dei titoli (grafico per ore, giorni, settimane, statistiche, storico, preferiti, Claude), con in più prezzo in €/oncia, € e $ al grammo.
- I dati dei metalli sono inclusi nel contesto inviato a Claude.

### Modificato
- Nomi dei metalli in italiano anche nei Mercati (prima "Gold Dec 26", ora "Oro").
- Barra delle schede su 4 voci, con etichette sotto le icone sugli schermi più stretti.

## [1.4.1] - 2026-11-22

### Corretto
- Richieste di aggiunta: un termine ripetuto (es. nel titolo e nel corpo) compare una sola volta nella risposta.

## [1.4.0] - 2026-11-22

### Aggiunto
- **Ricerca di nuovi titoli**: la ricerca copre ora una directory mondiale di **oltre 11.000 azioni** (borse principali di 33 paesi, capitalizzazione sopra soglie per area) con prezzo, variazione e capitalizzazione, aggiornata a ogni pubblicazione e caricata solo alla prima ricerca.
- **Aggiunta al monitoraggio**: i titoli non monitorati hanno una scheda con prezzo e capitalizzazione e il pulsante "➕ Aggiungi al monitoraggio", che apre su GitHub una richiesta già compilata. Il nuovo workflow `Aggiungi titoli` la verifica su Yahoo Finance, aggiunge il titolo al catalogo (`catalog.USER`), ripubblica il sito con storico e grafico e risponde nella richiesta. Il titolo viene anche aggiunto ai preferiti.
- **Ricerca libera**: se un titolo non è nella directory, "Cerca su Yahoo Finance e aggiungilo" invia il termine al workflow, che risponde con i titoli trovati e un link per aggiungere ciascuno.
- Capitalizzazione nella scheda dei titoli.

### Modificato
- Ordinamento dei risultati: corrispondenza del simbolo, poi del nome; a parità prima i titoli monitorati e le società più grandi.

## [1.3.0] - 2026-11-22

### Aggiunto
- **Tema scuro**: pulsante nella barra superiore che alterna Automatico (🌓, segue il sistema) → Chiaro (☀️) → Scuro (🌙). Scelta salvata nel browser e applicata prima del caricamento della pagina (nessun lampo di colore); aggiorna anche il colore della barra del browser su mobile e i controlli nativi.

### Modificato
- Colori del tema centralizzati in variabili (testo su pulsanti, ombre, stella preferiti) per un contrasto corretto in entrambi i temi.
- Tooltip del grafico leggibile in tema scuro.
- Su schermi stretti: pulsanti della scheda titolo compatti (solo icone) e nome dell'app nascosto nella barra superiore.

## [1.2.0] - 2026-11-22

### Aggiunto
- **Ricerca titoli**: barra di ricerca nella sezione Mercati (e pulsante 🔍 in alto, da qualsiasi sezione) per nome, simbolo, borsa o paese, anche con termini in italiano (es. "oro", "petrolio", "Ferrari"). Invio apre il primo risultato.
- **Preferiti**: stella ☆ nei risultati di ricerca e nella scheda del titolo; sezione "⭐ Preferiti" in cima ai Mercati. Salvati nel browser; inclusi nel contesto inviato a Claude.
- Catalogo esteso a **461 simboli**: principali azioni di Stati Uniti, Italia (FTSE MIB), Germania (DAX), Francia (CAC 40), Regno Unito, Spagna, Svizzera, Paesi Bassi, Nord Europa, Giappone, Cina/Hong Kong, India, Brasile, Canada, Australia, Corea, Taiwan, più indici, materie prime, valute, cripto ed ETF.

### Modificato
- "Migliori/peggiori azioni mondiali" calcolati su tutte le azioni del catalogo.
- Scaricamento incrementale: serie oraria a ogni aggiornamento, serie giornaliera e settimanale ogni 6 ore, per ridurre le richieste a Yahoo Finance.

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

[Non rilasciato]: https://github.com/RickBortCost/BortEconomy/compare/v1.6.0...HEAD
[1.6.0]: https://github.com/RickBortCost/BortEconomy/compare/v1.5.0...v1.6.0
[1.5.0]: https://github.com/RickBortCost/BortEconomy/compare/v1.4.1...v1.5.0
[1.4.1]: https://github.com/RickBortCost/BortEconomy/compare/v1.4.0...v1.4.1
[1.4.0]: https://github.com/RickBortCost/BortEconomy/compare/v1.3.0...v1.4.0
[1.3.0]: https://github.com/RickBortCost/BortEconomy/compare/v1.2.0...v1.3.0
[1.2.0]: https://github.com/RickBortCost/BortEconomy/compare/v1.1.0...v1.2.0
[1.1.0]: https://github.com/RickBortCost/BortEconomy/compare/v1.0.1...v1.1.0
[1.0.1]: https://github.com/RickBortCost/BortEconomy/compare/v1.0.0...v1.0.1
[1.0.0]: https://github.com/RickBortCost/BortEconomy/releases/tag/v1.0.0
