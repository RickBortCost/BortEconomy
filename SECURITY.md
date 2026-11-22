# Sicurezza e privacy

## Segnalare una vulnerabilità

Non aprire una issue pubblica: usa **Security → Report a vulnerability** (segnalazione privata di GitHub) su questo repository.

## Come sono protetti i dati

| Dato | Dove resta | Protezione |
|---|---|---|
| Chiavi API (Anthropic, OpenAI, Google) | Solo nel browser dell'utente | Cassaforte opzionale: AES-256-GCM, chiave da password con PBKDF2-SHA-256 (600.000 iterazioni); oppure solo per la sessione |
| Portafoglio, composizione, preferiti | Solo nel browser | Cassaforte opzionale (come sopra); backup esportabili cifrati |
| Domande agli assistenti AI | Inviate direttamente al fornitore scelto | Nessun salvataggio da parte del sito; preferiti esclusi per impostazione predefinita; conferma prima di inviare portafoglio o composizione |
| Avvisi di prezzo, richieste di titoli | Issue e `site/alerts.json` del repository | **Pubblici se il repository è pubblico** |
| Chiave per "Il punto del giorno" | Secret di GitHub Actions | Mai esposta al sito |

Il sito non usa account, cookie, statistiche o tracciamenti. Carattere e librerie sono ospitati sul sito stesso (nessuna richiesta a CDN o Google Fonts).

## Protezioni tecniche

- **Content Security Policy** (`site/index.html`): solo script del sito, connessioni solo verso il sito e le API di Anthropic, OpenAI e Google; nessun plugin, nessun `base` esterno.
- **Referrer** disattivato verso i siti esterni; link esterni accettati solo `http(s)` con `noopener noreferrer`.
- **Clickjacking**: il sito rifiuta di essere incorporato in altri siti (GitHub Pages non consente l'intestazione `frame-ancestors`).
- **Supply chain**: SDK Anthropic e carattere copiati nel repository (`npm run vendor`), azioni dei workflow bloccate per SHA, Dependabot per npm e azioni, permessi minimi dei workflow.
- **Workflow**: le richieste dal sito vengono accettate solo da proprietario e collaboratori; titolo e corpo delle issue passati come variabili d'ambiente, mai interpolati nella shell.

## Limiti noti

- Un'estensione del browser malevola o un dispositivo compromesso possono leggere i dati mentre la cassaforte è sbloccata.
- Le chiavi API nel browser sono inevitabili senza un server: limita spesa e permessi presso ogni fornitore.
- Con il repository pubblico, avvisi e richieste sono visibili a tutti.
