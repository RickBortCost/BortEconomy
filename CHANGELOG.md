# Changelog

Tutte le modifiche rilevanti di BortEconomy sono documentate qui.
Formato: [Keep a Changelog](https://keepachangelog.com/it-IT/1.1.0/) · Versionamento: [Semantic Versioning](https://semver.org/lang/it/).

## [Non rilasciato]

## [1.13.0] - 2026-11-22

### Aggiunto
- **Più assistenti AI**: oltre a Claude (Anthropic) ora si possono usare **ChatGPT** (OpenAI) e **Gemini** (Google), ciascuno con la propria chiave API (salvata solo nel browser, anche solo per la sessione) e la scelta del modello. Selettore dell'assistente in cima alla chat; ogni assistente ha la propria conversazione.
  - ChatGPT: API Responses di OpenAI con ricerca web (`web_search`) e fonti citate; modello predefinito `chat-latest`.
  - Gemini: API Gemini di Google con ricerca Google integrata (`google_search`) e fonti; modello predefinito `gemini-flash-latest`.
  - Pulsante "Carica modelli" che elenca i modelli disponibili sul proprio account; messaggi d'errore specifici per chiave non valida, modello non disponibile, limite o credito esaurito.
- Ogni risposta indica assistente e modello usati.

### Modificato
- La scheda "Claude" diventa "AI"; i pulsanti "Chiedi a Claude" diventano "Chiedi all'AI" e usano l'assistente selezionato. Il punto del giorno resta generato da Claude.
- Le chiavi e il modello di Claude già salvati restano validi.

### Corretto
- Riaprendo l'app direttamente sulla scheda Portafoglio la vista poteva generare un errore prima del caricamento dei moduli.

## [1.12.0] - 2026-11-22

### Aggiunto
- **ETF e indici** (Mercati → ETF e indici): 45 ETF UCITS quotati in Europa (soprattutto Borsa Italiana), divisi in azionari mondo, USA, Europa e Italia, emergenti, settoriali, obbligazionari governativi, societari e globali, legati all'inflazione, liquidità, oro e materie prime; rendimenti a 1 giorno, da inizio anno, 1, 3 e 5 anni, dividendo. Vista "Indici" con tutti gli indici ordinati per rendimento a 5 anni.
- **Composizione del portafoglio** (Portafoglio → Composizione): inserisci gli asset che possiedi con il loro peso percentuale (senza prezzi né quantità) e il capitale; modelli di partenza (tutto azionario, 60/40, prudente, all weather, crescita) o importazione dalle posizioni. Andamento storico del mix fino a 10 anni rispetto all'MSCI World, rendimento totale e annuo, volatilità, massimo ribasso, rapporto rendimento/rischio, ripartizione per classe e area, matrice delle correlazioni.
- **Laboratorio** (Portafoglio → Laboratorio):
  - **Indicatori macroeconomici** da fonti ufficiali (BCE, Eurostat, BLS), con storico dal 2015: tasso BCE sui depositi, rendimenti BTP e Bund a 10 anni, spread BTP-Bund, tasso reale, inflazione area euro, Italia e USA (anche core), disoccupazione area euro, Italia e USA.
  - **Sensibilità** del portafoglio (composizione o posizioni reali) ad azioni mondiali, tassi a lungo termine, inflazione attesa, cambio euro/dollaro, petrolio e oro, stimata con regressione multipla sui rendimenti settimanali degli ultimi 5 anni, con quota di oscillazioni spiegata.
  - **Simulatore di scenari** con cursori e scenari pronti (rialzo e taglio dei tassi, inflazione persistente, recessione, euro forte, crisi energetica, rally azionario): impatto stimato in percentuale e in euro e contributo di ogni asset.
  - **Stress test storici**: comportamento del portafoglio nel calo di fine 2018, crollo Covid, ripresa post-Covid, rialzo dei tassi 2022, shock dei dazi 2025 e ultimi 12 mesi, confrontato con azioni mondiali e obbligazioni globali.
  - Analisi con Claude dell'impatto delle variabili macro sul portafoglio.
- Rendimenti da inizio anno, a 3 e a 5 anni per tutti i titoli monitorati.

### Modificato
- Il Portafoglio è diviso in tre sezioni: Posizioni, Composizione, Laboratorio.

## [1.11.0] - 2026-11-22

### Modificato
- **Nuova grafica**:
  - carattere Inter; palette indaco/viola/ciano con sfumature; tema scuro più profondo;
  - schede con angoli più ampi, ombre morbide e leggera elevazione al passaggio;
  - variazioni percentuali come "pillole" colorate; controlli segmentati in stile iOS; pulsanti principali con sfumatura.
- **Icone vettoriali** al posto delle emoji nella navigazione, nella barra superiore e nella scheda titolo; stella dei preferiti piena quando attiva.
- **Navigazione in basso su telefono**, come in un'app, con barra superiore e inferiore traslucide; su desktop le schede restano in alto.
- **Nastro scorrevole degli indici** sotto la barra superiore (indice del paese scelto, principali indici, euro/dollaro, oro, petrolio, Bitcoin, Treasury, VIX): si ferma al passaggio del mouse, tocco per aprire il titolo; statico se il sistema riduce le animazioni.
- **Nuova icona dell'app**: sfumatura indaco-viola-ciano con barre ascendenti e linea di tendenza luminosa; versioni PNG per la schermata Home di iPhone (180 px, a tutta superficie perché iOS arrotonda da sé gli angoli) e Android (192/512 px), versione adattiva "maskable", favicon 32 px; manifest e meta tag iOS aggiornati.
- Prima notizia in evidenza; riquadro "Il punto del giorno" con bordo sfumato; grafici sintetici con area ombreggiata; animazioni di apertura per schede, finestre e dettaglio.

## [1.10.0] - 2026-11-22

### Aggiunto
- **Mappa dei mercati** (Mercati → 🗺️ Mappa): riquadri delle società più grandi di Italia, Stati Uniti, Europa, Asia o mondo, con dimensione proporzionale alla capitalizzazione (convertita in euro) e colore in base alla variazione di oggi; media ponderata del mercato; tocco per aprire il titolo.
- **Valute** (Mercati → 💱 Valute): convertitore tra 23 valute, principali coppie (EUR/USD, GBP/USD, USD/JPY, indice del dollaro…) con grafico, euro contro tutte le altre valute.
- **Criptovalute** (Mercati → ₿ Cripto): 23 criptovalute (Bitcoin, Ethereum, XRP, Solana, stablecoin…) con prezzo in dollari ed euro, variazioni giorno/settimana/mese/anno e scheda di dettaglio con le stesse analisi dei titoli.

### Modificato
- Decimali dei prezzi in base all'ordine di grandezza (es. valute e criptovalute con prezzi molto piccoli).

## [1.9.0] - 2026-11-22

### Aggiunto
- **Indicatori tecnici** nel grafico di ogni titolo: medie mobili a 50 e 200 periodi, bande di Bollinger (20, 2) e pannello RSI (14), attivabili singolarmente; i valori compaiono nel cursore. Calcolati sull'intera serie, quindi corretti anche all'inizio del periodo. Scelta ricordata.
- **Confronto** fino a 3 titoli monitorati con il titolo aperto: linee in variazione percentuale dall'inizio del periodo, legenda con rimozione, valori di tutte le serie nel cursore.
- **Fondamentali** nella scheda titolo: P/E corrente e atteso, utile per azione, rendimento del dividendo, prezzo/valore contabile, medie mobili a 50 e 200 giorni (con posizione del prezzo), giudizio medio degli analisti, data dei prossimi risultati.
- **Profilo della società**: settore, industria, paese, dipendenti, descrizione e sito web.
- **Notizie del titolo** nella scheda (stampa italiana e del mercato di quotazione, aggiornate a rotazione).

## [1.8.0] - 2026-11-22

### Aggiunto
- **Calendario economico** (Mercati → 📅 Calendario): dati macro della settimana (inflazione, PIL, occupazione, PMI, decisioni sui tassi…) con titoli tradotti in italiano, impatto, valori previsti, precedenti ed effettivi, filtri per importanza e valuta; utili societari dei titoli monitorati nei prossimi 45 giorni (tocco per aprire il titolo). Orari nel fuso del dispositivo.
- **Il punto del giorno**: ogni mattina dalle 7:00 (ora italiana) Claude scrive un riepilogo di mercati, Italia, mondo, metalli e agenda della giornata, dai dati del sito più qualche ricerca web; mostrato in cima alle Notizie, espandibile, con le fonti. Richiede il secret `ANTHROPIC_API_KEY` nel repository; si può rigenerare manualmente dal workflow "Aggiorna dati e pubblica" (opzione "Rigenera subito il punto del giorno").
- L'agenda dei prossimi 7 giorni (eventi di impatto medio/alto e utili) è inclusa nel contesto di Claude.
- Sotto-sezioni nella scheda Mercati (Panoramica, Calendario).

## [1.7.0] - 2026-11-22

### Aggiunto
- **Portafoglio** (nuova scheda 💼): posizioni con quantità, prezzo di carico e data di acquisto (anche più acquisti dello stesso titolo), su titoli monitorati o della directory mondiale.
  - Riepilogo in euro al cambio attuale: valore, investito, guadagno/perdita totale, variazione di oggi.
  - Tabella posizioni con valore, peso, guadagno in euro e percentuale; tocco per aprire il titolo, ✎ per modificare o eliminare.
  - Ripartizione per tipo, area, settore o valuta (grafico ad anello).
  - Andamento del valore su 1 mese, 3 mesi, 1 anno, 5 anni (ultima chiusura nota nei giorni senza contrattazioni).
  - Esportazione JSON/CSV e importazione da file (JSON o CSV con colonne simbolo, quantità, prezzo, valuta, data).
  - "Analizza con Claude" per una valutazione di diversificazione e rischi.
  - Pulsante 💼 nella scheda di ogni titolo.
- **Avvisi di prezzo**: pulsante 🔔 nella scheda di ogni titolo (prezzo sopra/sotto una soglia, rialzo o ribasso giornaliero oltre una percentuale). La richiesta passa da GitHub; a ogni aggiornamento dei dati gli avvisi vengono controllati e, quando scattano, una issue che ti menziona invia la notifica (anche push sull'app GitHub). Elenco degli avvisi attivi e scattati nella scheda Portafoglio, con rimozione.
- Cambi EUR per 22 valute, usati per convertire il portafoglio.
- Test unitari (avvisi, formato storici, valute) e test dell'interfaccia per portafoglio e avvisi.

### Modificato
- Il workflow "Aggiungi titoli" diventa "Richieste dal sito" e gestisce anche creazione e rimozione degli avvisi.
- Pulsanti della scheda titolo compatti su schermi stretti.
- Le quotazioni in centesimi di dollaro (alcune materie prime agricole) sono convertite in dollari.

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

[Non rilasciato]: https://github.com/RickBortCost/BortEconomy/compare/v1.13.0...HEAD
[1.13.0]: https://github.com/RickBortCost/BortEconomy/compare/v1.12.0...v1.13.0
[1.12.0]: https://github.com/RickBortCost/BortEconomy/compare/v1.11.0...v1.12.0
[1.11.0]: https://github.com/RickBortCost/BortEconomy/compare/v1.10.0...v1.11.0
[1.10.0]: https://github.com/RickBortCost/BortEconomy/compare/v1.9.0...v1.10.0
[1.9.0]: https://github.com/RickBortCost/BortEconomy/compare/v1.8.0...v1.9.0
[1.8.0]: https://github.com/RickBortCost/BortEconomy/compare/v1.7.0...v1.8.0
[1.7.0]: https://github.com/RickBortCost/BortEconomy/compare/v1.6.0...v1.7.0
[1.6.0]: https://github.com/RickBortCost/BortEconomy/compare/v1.5.0...v1.6.0
[1.5.0]: https://github.com/RickBortCost/BortEconomy/compare/v1.4.1...v1.5.0
[1.4.1]: https://github.com/RickBortCost/BortEconomy/compare/v1.4.0...v1.4.1
[1.4.0]: https://github.com/RickBortCost/BortEconomy/compare/v1.3.0...v1.4.0
[1.3.0]: https://github.com/RickBortCost/BortEconomy/compare/v1.2.0...v1.3.0
[1.2.0]: https://github.com/RickBortCost/BortEconomy/compare/v1.1.0...v1.2.0
[1.1.0]: https://github.com/RickBortCost/BortEconomy/compare/v1.0.1...v1.1.0
[1.0.1]: https://github.com/RickBortCost/BortEconomy/compare/v1.0.0...v1.0.1
[1.0.0]: https://github.com/RickBortCost/BortEconomy/releases/tag/v1.0.0
