# DebateAI — Informativa sulla privacy

<!-- legal-chrome
summaryTitle: In breve
eyebrow: INFORMATIVA SULLA PRIVACY · v3.0 · IN VIGORE DAL [DATE]
title: Cosa conserviamo e perché
lede: I tuoi diritti e i nostri obblighi ai sensi del GDPR (EU) 2016/679, in un linguaggio chiaro. Quattordici sezioni e Allegato B — scorri fino alla fine.
endMarker: FINE DELL'INFORMATIVA · GDPR (EU) 2016/679 · v3.0
bodyLabel: Testo dell'Informativa sulla privacy
annexTitle: Allegato B — Condizioni regionali sulla privacy
jumps:
01 TITOLARE
02 COSA RACCOGLIAMO
04 BASE GIURIDICA
05 MODELLI E TRASFERIMENTI
06 PUBBLICAZIONE
07 CONSERVAZIONE
10 I TUOI DIRITTI GDPR
13 COOKIE
-->

2026-09-21 · @Someone

**Bozza v3.0 per la revisione del consulente legale — sostituisce la v2.1 distribuita (`apps/ui/lib/privacyPolicy.ts`). Non costituisce consulenza legale.** Questa versione descrive ciò che il codice fa effettivamente e corregge le cinque affermazioni della v2.1 contraddette dal codice: dati di sessione, periodi di conservazione, analisi, esportazione e ciò che accade ai dibattiti pubblicati in caso di cancellazione. Le parentesi quadre contrassegnano ciò che solo tu puoi compilare; \[pending\] contrassegna una funzionalità descritta dall'informativa che non è ancora stata realizzata e che deve esistere prima della pubblicazione dell'informativa.

**Version 3.0 · Effective \[date\] · Versioni precedenti su dezbatere.ro/privacy/versions · Titolare del trattamento: DebateAIRO S.R.L., Bucarest**

**In short.** Raccogliamo ciò che serve a un account e ciò che scegli di digitare. Le tue domande vengono inviate ai fornitori di IA elencati nel nostro Registro; non sono utilizzate per addestrare i modelli. I dibattiti sono privati, salvo che tu non li pubblichi. La cancellazione dell'account distrugge le chiavi dei tuoi dati e rimuove i dibattiti pubblicati. Puoi contattarci all'indirizzo privacy@dezbatere.ro e le persone nominate in un dibattito possono chiederne la rimozione senza avere un account.

## 1. Chi è responsabile dei tuoi dati

Il titolare del trattamento dei tuoi dati personali è **DebateAIRO S.R.L.**, \[address\], Bucarest, Romania, Registro delle imprese \[J40/…\], CUI \[…\]. Scrivi a **privacy@dezbatere.ro** per qualsiasi questione relativa alla presente informativa; rispondiamo entro un mese. Non abbiamo nominato un responsabile della protezione dei dati perché la legge non ce lo impone; questo indirizzo è monitorato da \[role\]. Laddove abbiamo nominato un rappresentante o un responsabile della privacy per un determinato Paese, i relativi dati sono indicati nell'Allegato B.

## 2. Cosa raccogliamo e da dove proviene

Raccogliamo esclusivamente ciò che serve al funzionamento di un account, ciò che scegli di fornirci e ciò che la legge ci impone di conservare.

| Categoria | Dati esatti | Fonte |
| --- | --- | --- |
| **Account** | Indirizzo email e indirizzo email di recupero (conservati in forma cifrata, con un indice dotato di chiave che ci consente di trovare l'account senza leggere l'indirizzo); password (conservata come hash, mai in chiaro); il segreto per l'autenticazione a due fattori (cifrato); dieci codici di recupero (conservati come hash); il tuo pseudonimo; il momento in cui hai confermato di avere almeno 18 anni | Tu, al momento della registrazione |
| **Sessioni e sicurezza** | Un token di sessione sottoposto a hash; un hash con chiave della stringa user-agent del tuo browser, utilizzato per rilevare quando una sessione passa a un browser diverso; data e ora di creazione, ultimo utilizzo e scadenza. **Non** conserviamo con una sessione il tuo indirizzo IP, il nome del dispositivo o i dettagli del browser; l'elenco delle sessioni visualizzato nelle Impostazioni mostra soltanto data e ora | Il tuo browser |
| **Registro di controllo della sicurezza** | Un registro di sola aggiunta degli eventi rilevanti per la sicurezza — registrazione, verifica, tentativi di accesso, recupero, pubblicazione, cancellazione. L'indirizzo IP e lo user-agent di ciascun evento sono conservati esclusivamente come digest unidirezionali con chiave (Argon2id), pertanto non possono essere letti ma possono essere confrontati entro un determinato periodo. I segnali di rischio relativi all'accesso e al recupero sono conservati in forma cifrata per 90 giorni | Il tuo browser, al momento di ciascun evento |
| **Contenuto dei dibattiti** | La domanda che digiti; le annotazioni di orientamento che imposti; le affermazioni, le critiche, i riferimenti probatori, i punteggi e i verdetti generati dal motore; una registrazione letterale di quanto restituito da ciascun fornitore di IA; le query di ricerca e i riferimenti alle fonti. Tutto ciò è conservato in forma cifrata con una chiave specifica per il tuo account | Tu e i modelli di IA che elaborano la tua domanda |
| **Assistenza** | I messaggi scambiati con l'assistente di supporto o con una persona, conservati in forma cifrata; la lingua utilizzata; se hai consentito all'assistente di vedere lo stato (mai il contenuto) dei tuoi dibattiti; le valutazioni che fornisci. Se un messaggio attiva i controlli sugli abusi, conserviamo un hash del messaggio e un hash dell'indirizzo IP da cui proviene | Tu |
| **Registri di accettazione e consenso** | La versione e l'hash del contenuto delle Condizioni accettate e dell'informativa che ti è stata mostrata; il momento; la schermata e il meccanismo utilizzati; la tua lingua; il tuo indirizzo IP e lo user-agent in quel momento; ciascun consenso prestato o revocato e il relativo momento | Il tuo browser, all'iscrizione e ogni volta che modifichi una scelta |
| **Pagamenti** \[pending — once a paid plan exists\] | Piano, prezzo, periodo di fatturazione, riferimenti delle transazioni, prove della località fiscale. I dati della carta sono detenuti dal nostro fornitore di servizi di pagamento, mai da noi | Tu e il fornitore di servizi di pagamento |
| **Persone che non sono nostri utenti** | Dati personali relativi ad altre persone che includi in una domanda o che il motore genera nel rispondere. Ti chiediamo di non farlo; la sezione 11 spiega cosa facciamo quando accade comunque | Tu, indirettamente |

**Non** raccogliamo dati analitici o di telemetria sul modo in cui utilizzi il prodotto e non impostiamo cookie a tale scopo. Se ciò dovesse cambiare, modificheremo prima la presente informativa e l'Informativa sui cookie e ti verrà chiesto il consenso.

## 3. Informazioni sensibili

Un motore di dibattito invita a porre domande su politica, religione, salute, sessualità e convinzioni personali. Si tratta di categorie particolari di dati ai sensi dell'Articolo 9 GDPR e possono comparire nelle tue domande indipendentemente dal fatto che intendiamo raccoglierle o meno.

**Informazioni che ti riguardano.** Quando ti registri, presti il consenso esplicito, mediante una frase separata, al trattamento da parte nostra delle informazioni sensibili che scegli di includere nelle tue domande, allo scopo di svolgere i tuoi dibattiti. Puoi revocarlo in qualsiasi momento non includendo tali informazioni o cancellando un dibattito. Ciò che pubblichi su di te costituisce un insieme di dati che hai scelto di rendere pubblico.

**Informazioni che riguardano altre persone.** Nessuna condizione giuridica ci consente di trattare dati sensibili relativi a una terza persona che nomini in una domanda e nessuno dei nostri fornitori di IA dispone di una tale condizione. Per questo motivo le Condizioni lo vietano, riduciamo al minimo ciò che inviamo e rimuoviamo rapidamente tali contenuti su richiesta — sezione 11.

**Informazioni sulla salute.** Alcuni Paesi disciplinano i dati relativi alla salute, comprese le inferenze, mediante leggi specifiche. Se vivi nello \[the State of Washington\], si applica una distinta \[Consumer Health Data Privacy Notice\].

## 4. Perché utilizziamo i tuoi dati e su quale base

Ciascuna finalità ha una base giuridica ai sensi dell'Articolo 6(1) GDPR e non riutilizziamo per una finalità diversa dati raccolti per una determinata finalità.

| Finalità | Dati | Base giuridica |
| --- | --- | --- |
| Creare e gestire il tuo account, autenticarti, svolgere e conservare i tuoi dibattiti affinché tu possa riaprirli e riprodurli | Account, sessioni, contenuto dei dibattiti | **Contratto** — Art. 6(1)(b) |
| Inviare la tua domanda e le affermazioni del motore ai fornitori di IA per generare un dibattito | Contenuto dei dibattiti | **Contratto** — Art. 6(1)(b) |
| Mantenere sicuro il servizio, rilevare gli abusi, consentirti di individuare un accesso che non hai effettuato, conservare un registro di controllo | Sessioni, registro di controllo della sicurezza, hash relativi agli abusi segnalati all'assistenza | **Legittimi interessi** — Art. 6(1)(f): i nostri e i tuoi a disporre di un servizio sicuro. Puoi opporti; sezione 10 |
| Dimostrare che hai accettato le Condizioni e prestato o revocato un consenso | Registri di accettazione e consenso | **Obbligo legale** — Art. 6(1)(c), il nostro dovere di dimostrare il consenso ai sensi dell'Art. 7(1) — e legittimi interessi a comprovare il contratto |
| Rispondere alle richieste di assistenza | Assistenza | **Contratto** — Art. 6(1)(b) |
| Trattare le informazioni sensibili che includi su di te | Contenuto dei dibattiti | **Consenso esplicito** — Art. 9(2)(a), prestato separatamente all'iscrizione |
| Pubblicare un dibattito che scegli di pubblicare | Contenuto dei dibattiti, pseudonimo | **Contratto** — Art. 6(1)(b), su tua istruzione; per i dati sensibili che ti riguardano, Art. 9(2)(e) — dati che hai manifestamente reso pubblici |
| Inviarti notizie sul prodotto | Indirizzo email | **Consenso** — Art. 6(1)(a), una casella non preselezionata; revocabile in qualsiasi momento da qualunque email o dalle Impostazioni |
| Adempiere agli obblighi fiscali, contabili e legali \[pending paid plans\] | Pagamenti, registri di accettazione | **Obbligo legale** — Art. 6(1)(c) |
| Gestire richieste legali, segnalazioni di contenuti illegali e i nostri obblighi in qualità di servizio di hosting | Tutto ciò che è pertinente alla richiesta | **Obbligo legale** — Art. 6(1)(c) — e legittimi interessi |

Non effettuiamo profilazione, non utilizziamo i tuoi dati per la pubblicità e non li vendiamo. Non utilizziamo i tuoi contenuti per addestrare modelli e non permettiamo ai nostri fornitori di farlo — sezione 5.

## 5. Fornitori di IA e trasferimenti internazionali

**Cosa viene inviato.** Per svolgere un dibattito inviamo testo a uno o più fornitori esterni di IA: la tua domanda, le annotazioni di orientamento che imposti e le affermazioni formulate dal motore durante lo sviluppo del dibattito. Un fornitore vede pertanto testo derivato da ciò che hai digitato e costruito attorno a esso. Non riceve mai il tuo indirizzo email, gli identificativi del tuo account o della tua sessione, il tuo indirizzo IP o i tuoi dati di pagamento.

**Quali fornitori.** Sono elencati nel nostro **Registro dei fornitori di IA** all'indirizzo \[dezbatere.ro/providers\], che è parte integrante della presente informativa. Per ciascun fornitore, il Registro indica la persona giuridica e il Paese di stabilimento; cosa riceve e per quale finalità; i Paesi o le regioni in cui tratta i dati; le condizioni di conservazione e se la conservazione zero dei dati è attiva per l'endpoint e le funzionalità che utilizziamo; se, in base al nostro contratto, può utilizzare gli input per l'addestramento; il meccanismo di trasferimento su cui facciamo affidamento; e la data dell'ultima verifica di ciascuna voce. I fornitori possono cambiare; il Registro è versionato e ogni modifica vi viene annotata.

**Addestramento e conservazione sono concetti diversi.** I nostri contratti con i fornitori escludono l'uso dei tuoi contenuti per addestrare o migliorare i loro modelli. \[Publish only once verified per route.\] Alcuni fornitori conservano prompt e risposte per un periodo limitato a fini di sicurezza, prevenzione degli abusi o adempimento dei propri obblighi legali; il Registro indica per quanto tempo e perché. Laddove sia attiva la conservazione zero dei dati, il Registro lo specifica e indica per quali funzionalità. Non descriveremo i contenuti come non conservati quando non è così.

**Trasferimenti al di fuori del SEE.** I fornitori stabiliti negli Stati Uniti ricevono i dati in base a uno dei meccanismi previsti dal capo V GDPR: il quadro UE-USA per la protezione dei dati, laddove la specifica entità contraente sia certificata per tali dati, oppure le clausole contrattuali tipo della Commissione europea (Modulo due, da titolare a responsabile del trattamento), corredate di una valutazione del rischio di trasferimento e di misure supplementari. Il Registro indica il meccanismo applicabile a ciascun fornitore. Puoi ottenere una copia delle clausole su cui facciamo affidamento scrivendo a privacy@dezbatere.ro. Se un meccanismo su cui facciamo affidamento viene invalidato, passiamo a un altro prima di proseguire i trasferimenti e te ne diamo comunicazione.

**Altri destinatari.** Il nostro fornitore di hosting \[Hetzner, Germany — region …\]; il nostro fornitore di distribuzione dei contenuti e trasporto \[Cloudflare\]; il nostro servizio di inoltro email \[…\]; \[our payment provider, once a paid plan exists\]. Ciascuno agisce in base alle nostre istruzioni documentate, ai sensi di un accordo sul trattamento dei dati dotato delle garanzie richieste dall'Articolo 28, ed è incluso nel Registro con il luogo in cui si trova e il relativo meccanismo di trasferimento. Non permettiamo ad alcun responsabile del trattamento di utilizzare i tuoi dati per finalità proprie. Qualora un fornitore lo facesse, sarebbe un titolare del trattamento autonomo e non gli invieremmo i tuoi dati.

**Autorità pubbliche.** Comunichiamo dati personali a tribunali, autorità di regolamentazione o autorità di contrasto quando la legge lo impone e te ne diamo comunicazione, salvo che la legge ce lo vieti.

## 6. Pubblicazione e visibilità

I dibattiti sono privati fino a quando non li pubblichi. La pubblicazione è un'azione intenzionale e confermata separatamente. Un dibattito pubblicato mostra il tuo **pseudonimo**, la domanda così come l'hai formulata, l'albero argomentativo, i punteggi, il verdetto e la fascia di affidabilità e reca un'etichetta visibile che indica che il contenuto è generato dall'IA. Non mostra mai il tuo indirizzo email, i registri delle sessioni o la cronologia dell'account. \[Published debates are / are not\] indicizzati dai motori di ricerca \[unless you choose\].

La revoca della pubblicazione rimuove il dibattito da DebateAI e distrugge la chiave della nostra copia pubblica. Le copie già effettuate da lettori, motori di ricerca o archivi sfuggono al nostro controllo e non possiamo richiamarle.

Quando cancelli il tuo account, rimuoviamo dall'accesso pubblico ogni dibattito da te pubblicato senza ingiustificato ritardo e al più tardi entro 30 giorni, salvo che la legge ci imponga di conservare uno specifico elemento. \[Option B — a product change; see the Terms, section 9.\]

## 7. Per quanto tempo conserviamo i dati

| Dati | Durata | Successivamente |
| --- | --- | --- |
| Account | Finché l'account esiste, più un periodo di tolleranza di 7 giorni dopo la richiesta di chiusura | Chiavi distrutte; record cancellato |
| Registri delle sessioni | 14 giorni dall'ultimo utilizzo o 90 giorni dalla creazione, se precedente | Cancellati |
| Link per la verifica dell'email | 24 ore | Cancellati |
| Segnali di rischio relativi ad accesso e recupero | 90 giorni, applicati dal database | Eliminati definitivamente |
| Registro di controllo della sicurezza | Per tutta la durata del servizio | Di sola aggiunta; IP e user-agent sono digest unidirezionali e non possono essere riletti |
| Contenuto dei dibattiti (privato) | Finché l'account esiste | Chiavi distrutte alla chiusura, rendendo il contenuto illeggibile |
| Contenuto dei dibattiti (pubblicato) | Finché è pubblicato e finché l'account esiste | Rimosso dall'accesso pubblico alla revoca della pubblicazione o alla chiusura; chiavi distrutte |
| Registrazioni delle risposte dei fornitori e riferimenti di ricerca | Come il dibattito cui appartengono | Come per il dibattito cui appartengono |
| Conversazioni e casi di assistenza | \[Until closed plus 12 months\] | Chiavi distrutte |
| Registri di accettazione e consenso | Durata dell'account più 6 anni — il termine di prescrizione più lungo a noi applicabile | Cancellati |
| Registri dei pagamenti \[pending\] | 10 anni, come richiesto dalla normativa contabile rumena | Cancellati |
| Backup \[pending\] | \[… days\] dopo la cancellazione della copia attiva | Sovrascritti |

**Cosa comporta effettivamente la cancellazione.** I tuoi dibattiti e i dati del tuo account sono cifrati mediante chiavi specifiche per il tuo account e per ogni dibattito. La cancellazione dell'account distrugge tali chiavi, dopodiché i record cifrati non possono più essere letti da noi o da chiunque altro, e cancelliamo il record del tuo account. Definiamo questa operazione cancellazione perché tale è il suo effetto e disponiamo di una valutazione documentata che la supporta; se desideri saperne di più, chiedicelo. Vi sono tre aspetti da conoscere: il registro di controllo della sicurezza è di sola aggiunta e non viene cancellato, ma non contiene identificativi leggibili che ti riguardino; un numero limitato di dibattiti meno recenti precede il nostro attuale sistema di cifratura e, se ciò riguarda il tuo account, ti comunicheremo quale effetto produce la chiusura su di essi; le copie dei dati già inviate a un fornitore di IA sono disciplinate dalle condizioni di conservazione di tale fornitore indicate nel Registro, non dalla nostra cancellazione.

&#91;The support retention period and the backup line describe policies to implement; the system currently keeps support records indefinitely and has no backup-expiry mechanism. Do not publish figures that are not enforced.\]

## 8. Decisioni automatizzate e profilazione

I punteggi, gli indicatori di condizione e i verdetti di un dibattito sono valutazioni automatizzate di **argomentazioni, non di persone**. Non producono effetti giuridici nei tuoi confronti né incidono in modo analogo e significativo su di te. Non adottiamo alcuna decisione che ti riguardi basata unicamente sul trattamento automatizzato e che produca effetti giuridici o analogamente significativi e non effettuiamo profilazione nei tuoi confronti.

Se in futuro automatizzassimo una decisione relativa al tuo account — sospenderlo o rifiutare la pubblicazione di un dibattito — una persona riesaminerà tale decisione prima che produca effetti o su tua richiesta; potrai esprimere il tuo punto di vista e contestarla. Le Condizioni descrivono le modalità.

## 9. Sicurezza e cosa accade se qualcosa va storto

Le password sono sottoposte a hash mediante Argon2id. L'autenticazione a due fattori è obbligatoria. Il tuo indirizzo email, i tuoi dibattiti, le conversazioni con l'assistenza e i tuoi segreti di autenticazione sono cifrati a riposo mediante chiavi specifiche per il tuo account; le chiavi dei dibattiti pubblicati sono conservate separatamente da quelle dei dibattiti privati. Gli accessi ai dati di produzione sono registrati. Gli indirizzi IP e i dettagli del browser presenti nel nostro registro di sicurezza sono conservati esclusivamente come digest unidirezionali.

In caso di violazione dei dati personali, notifichiamo la violazione all'autorità di controllo rumena entro 72 ore quando la legge lo richiede e ti informiamo direttamente, senza ingiustificato ritardo, qualora sia probabile che la violazione comporti un rischio elevato per i tuoi diritti e le tue libertà. L'Allegato B elenca le norme di notifica applicabili nelle altre regioni in cui forniamo il servizio.

## 10. I tuoi diritti e come esercitarli

Puoi esercitare gratuitamente uno qualsiasi di questi diritti scrivendo a **privacy@dezbatere.ro** oppure da **Impostazioni → Privacy**, laddove sia disponibile un controllo. Rispondiamo entro un mese; se una richiesta è complessa, possiamo impiegare fino a due mesi aggiuntivi e ti spiegheremo perché. Potremmo chiederti di confermare la tua identità tramite il tuo account.

| Diritto | Cosa significa in questo contesto |
| --- | --- |
| **Accesso** (Art. 15) | Una copia dei dati personali che deteniamo su di te e le presenti informazioni. \[Pending: a JSON export from Settings. Until it exists, we compile the copy manually within the month.\] |
| **Rettifica** (Art. 16) | Correggere il tuo indirizzo email o l'indirizzo email di recupero dalle Impostazioni. Il tuo pseudonimo non può essere modificato, per i motivi indicati nelle Condizioni; puoi chiudere l'account e aprirne uno nuovo |
| **Cancellazione** (Art. 17) | Cancellare in qualsiasi momento un dibattito privato dalla pagina del dibattito. Chiudere il tuo account dalle Impostazioni; la sezione 7 spiega esattamente cosa comporta. Chiederci di rimuovere un dibattito pubblicato contenente i tuoi dati, indipendentemente dal fatto che tu ne sia l'autore |
| **Limitazione** (Art. 18) | Chiederci di interrompere il trattamento di determinati dati mentre viene risolta una controversia che li riguarda |
| **Opposizione** (Art. 21) | Opporti al trattamento basato su legittimi interessi — i trattamenti di sicurezza e controllo di cui alla sezione 4 — nel qual caso interrompiamo il trattamento, salvo che possiamo dimostrare motivi cogenti. Puoi opporti al marketing in qualsiasi momento e lo interromperemo |
| **Portabilità** (Art. 20) | I tuoi dibattiti e i dati del tuo account in un formato di uso comune e leggibile da dispositivo automatico. \[Pending: same export as Access.\] I contenuti non personali da te creati, come le tue domande, ti vengono restituiti su richiesta alla cessazione del contratto |
| **Revoca del consenso** (Art. 7(3)) | Revocare il consenso al marketing tramite qualsiasi email o dalle Impostazioni; revocare il consenso relativo ai dati sensibili non includendo tali dati o cancellando un dibattito. La revoca non pregiudica il trattamento già effettuato |
| **Reclamo** | All'autorità di controllo rumena, **ANSPDCP**, B-dul G-ral Gheorghe Magheru 28–30, Bucarest, <anspdcp@dataprotection.ro>, oppure all'autorità del Paese in cui vivi. Preferiremmo che ti rivolgessi prima a noi |

Non addebitiamo mai costi per una richiesta e non ti riserviamo mai un trattamento meno favorevole per averla presentata.

## 11. Persone nominate nei dibattiti che non sono nostri utenti

Se qualcuno pone a DebateAI una domanda in cui ti nomina, potremmo detenere dati personali che ti riguardano anche se non hai mai utilizzato il servizio. Le Condizioni vietano agli utenti di farlo e riduciamo al minimo ciò che inviamo ai fornitori di IA, ma può accadere.

La presente sezione costituisce l'informativa che siamo tenuti a fornirti ai sensi dell'Articolo 14 GDPR. I dati sono costituiti da ciò che l'utente ha digitato e da quanto generato dal motore in risposta; la fonte è tale utente; le finalità e la base giuridica sono quelle indicate nella sezione 4; i destinatari sono i fornitori di IA elencati nel Registro; la conservazione segue la sezione 7. Ti spettano tutti i diritti indicati nella sezione 10 e, in particolare, puoi chiederci di rimuovere un dibattito pubblicato o privato che contenga i tuoi dati e di comunicarti quali dati deteniamo. Non devi disporre di un account per farlo. Scrivi a **privacy@dezbatere.ro** o utilizza il controllo **Segnala** presente su qualsiasi dibattito pubblicato; daremo seguito alle richieste motivate senza ingiustificato ritardo. Non possiamo informarti individualmente quando ciò accade, perché non sappiamo chi sei né come contattarti; la presente informativa pubblica e il percorso di rimozione sono le misure che adottiamo in alternativa.

Lo stesso vale per le informazioni sensibili che ti riguardano — politica, salute, religione — contenute nella domanda di un'altra persona. Nessuna condizione giuridica ci consente di continuare a trattarle dopo la tua opposizione e non lo faremo.

## 12. Minori

DebateAI è destinato agli adulti. Al momento della registrazione confermi di avere almeno 18 anni e non trattiamo consapevolmente i dati di persone di età inferiore ai 18 anni. Se veniamo a sapere che un account appartiene a una persona minore di 18 anni, lo chiudiamo e cancelliamo i dati come descritto nella sezione 7. Alcuni Paesi considerano insufficiente una conferma o richiedono ulteriori misure; l'Allegato B indica quanto applicabile nei vari casi e le Condizioni spiegano come procediamo.

## 13. Cookie

Impostiamo due cookie, entrambi strettamente necessari: uno mantiene attivo il tuo accesso e l'altro protegge i moduli dalla falsificazione. Non impostiamo cookie analitici, pubblicitari o di tracciamento. L'**Informativa sui cookie** disponibile su \[dezbatere.ro/cookies\] li elenca con le rispettive durate, spiega come viene memorizzata la tua scelta e sarà modificata prima dell'aggiunta di qualsiasi altro cookie. Laddove la normativa della tua regione disciplini diversamente alcuni cookie — ad esempio la regola di opt-out del Regno Unito per i cookie analitici — l'Informativa sui cookie lo specifica.

## 14. Modifiche alla presente informativa

Quando modifichiamo la presente informativa, pubblichiamo la nuova versione insieme a una sintesi delle modifiche e a una nuova data di entrata in vigore e conserviamo le versioni precedenti su \[dezbatere.ro/privacy/versions\]. Per una modifica che aggiunga una nuova finalità o un nuovo destinatario, ti informiamo per email e all'interno del prodotto prima dell'inizio del nuovo trattamento e ti concediamo il tempo necessario per opporti. Laddove una nuova finalità dipenda dal tuo consenso — ad esempio, se in futuro volessimo utilizzare i contenuti per migliorare i modelli — chiediamo tale consenso separatamente e in modo specifico; non consideriamo mai l'accettazione di Condizioni aggiornate come consenso a un nuovo trattamento. Per chiarimenti che non modificano in alcun modo le nostre attività, ci limitiamo a pubblicare la nuova versione.

La presente informativa è stata aggiornata da ultimo il \[date\]. La versione 3.0 ha sostituito la versione 2.1, che descriveva i dati di sessione, i periodi di conservazione, l'analisi, l'esportazione e l'effetto della cancellazione sui dibattiti pubblicati in modi che non riflettevano più il servizio.

## Annex B — Condizioni regionali sulla privacy

Ciascuna voce si applica soltanto se la relativa regione è elencata nella sezione 2 delle Condizioni e indica esclusivamente gli aspetti che differiscono dal corpo della presente informativa.

### B.1 Unione europea e Spazio economico europeo

Il corpo della presente informativa è redatto per te. L'autorità di controllo competente per noi è l'autorità rumena **ANSPDCP**; puoi inoltre presentare reclamo all'autorità del Paese in cui vivi. Utenti rumeni: la presente informativa è disponibile in rumeno all'indirizzo \[URL\].

### B.2 Regno Unito *(solo se elencato)*

Il nostro rappresentante nel Regno Unito ai sensi dell'Articolo 27 UK GDPR è **\[name, address, email\]**; puoi contattarlo per qualsiasi questione relativa alla presente informativa. L'autorità di controllo è l'**Information Commissioner's Office**, [ico.org.uk](https://ico.org.uk). Puoi presentarci un reclamo utilizzando il modulo disponibile su \[URL\] e ne confermeremo la ricezione entro 30 giorni. I trasferimenti dei tuoi dati dal Regno Unito ai fornitori di IA negli Stati Uniti si basano su \[the UK Extension to the EU–US Data Privacy Framework, where the provider is certified / the UK International Data Transfer Addendum to the EU standard contractual clauses\], con il supporto di una valutazione del rischio di trasferimento. Se in futuro impostassimo cookie analitici, nel Regno Unito sarebbero soggetti a opt-out anziché a consenso; attualmente non ne impostiamo. Se hai meno di 18 anni e accedi al servizio nonostante la nostra regola sull'età, al modo in cui trattiamo i tuoi dati si applicano gli standard del Codice per i minori dell'ICO.

### B.3 Stati Uniti *(solo se elencati)*

**Informativa al momento della raccolta.** La tabella nella sezione 2 elenca ciascuna categoria di informazioni personali che raccogliamo, la relativa finalità e il periodo di conservazione (sezione 7). Raccogliamo le seguenti categorie di informazioni personali *sensibili* solo quando le includi nelle tue domande: \[health, religious or philosophical beliefs, sexual orientation, union membership, political views\], e le utilizziamo esclusivamente per svolgere i tuoi dibattiti. **Non vendiamo né condividiamo informazioni personali e non lo abbiamo fatto nei dodici mesi precedenti.** Non utilizziamo informazioni personali sensibili per finalità diverse dalla fornitura del servizio da te richiesto. **Segnali di preferenza di opt-out:** rispettiamo i segnali Global Privacy Control come richiesta di rinuncia alla vendita o alla condivisione, attività che comunque non svolgiamo. **I tuoi diritti:** conoscere, cancellare, correggere, esercitare l'opt-out, limitare l'uso delle informazioni personali sensibili e non subire discriminazioni per averli esercitati; presenta una richiesta a privacy@dezbatere.ro o tramite \[toll-free number / form\]. **Incentivi finanziari:** non ne offriamo; i piani gratuiti e a pagamento non differiscono per il modo in cui trattiamo i tuoi dati. La **conservazione** è descritta nella sezione 7. La presente informativa è aggiornata almeno ogni dodici mesi; ultimo aggiornamento \[date\].

*Washington:* la nostra **Informativa sulla privacy dei dati sanitari dei consumatori** disponibile su \[URL\] è un documento distinto applicabile a tutte le informazioni relative alla salute, comprese le inferenze. *Texas e Nebraska:* non vendiamo dati personali sensibili; se ciò dovesse cambiare, otterremmo prima il tuo consenso \[statutory language\]. *Colorado, Connecticut, Virginia e altri Stati dotati di leggi organiche sulla privacy:* i diritti sopra indicati ti spettano laddove la legge si applichi a noi; puoi presentare ricorso contro il rigetto di una richiesta scrivendo a \[appeals@dezbatere.ro\].

### B.4 Canada e Québec *(solo se elencati)*

Il nostro responsabile della privacy è **\[name, email\]**. Restiamo responsabili delle informazioni personali che trasferiamo a fornitori di IA al di fuori del Canada e utilizziamo contratti per esigere una protezione comparabile; tali fornitori possono essere soggetti alle leggi dei Paesi in cui operano, compreso l'accesso lecito da parte delle autorità. Le email di marketing sono inviate esclusivamente con il tuo consenso esplicito ai sensi della CASL. **Québec:** prima di comunicare informazioni personali al di fuori del Québec effettuiamo una valutazione d'impatto sulla privacy; le impostazioni che mantengono privati i tuoi dibattiti sono attive per impostazione predefinita; puoi chiederci di deindicizzare le informazioni personali che ti riguardano o di cessarne la diffusione; puoi richiedere i tuoi dati in un formato strutturato e di uso comune; la sezione 8 descrive il nostro trattamento automatizzato.

### B.5 Australia e Nuova Zelanda *(solo se elencate)*

**Australia.** I destinatari esteri delle tue informazioni personali sono i fornitori di IA e i responsabili del trattamento elencati nel Registro, situati in \[the United States and the European Union\]; adottiamo misure ragionevoli per garantire che le trattino in conformità ai Principi australiani sulla privacy. **Decisioni automatizzate:** dal 10 dicembre 2026 la presente informativa identifica i tipi di decisioni adottate da programmi informatici che incidono significativamente sui tuoi diritti o interessi — non ve ne sono; i punteggi e i verdetti riguardano argomentazioni, non te — e le informazioni personali utilizzate per tali decisioni. È possibile presentare reclamo all'**Office of the Australian Information Commissioner**. **Nuova Zelanda.** Il nostro responsabile della privacy è \[name\]. Quando raccogliamo informazioni personali che ti riguardano indirettamente — perché un altro utente le ha incluse in una domanda — la presente informativa e la sezione 11 costituiscono l'informativa che ti forniamo. Comunichiamo i dati ai fornitori di IA indicati nel Registro in qualità di nostri agenti, in base a contratti che impongono garanzie comparabili. È possibile presentare reclamo all'**Office of the Privacy Commissioner**.

### B.6 America Latina *(allegato in lingua spagnola; solo se elencata)*

&#91;Published in Spanish.\] Il consenso costituisce la base del trattamento quando non ricorre la necessità contrattuale. I diritti ARCO — accesso, rettifica, cancellazione, opposizione — possono essere esercitati scrivendo a privacy@dezbatere.ro, con risposte entro \[per country\]. *Messico:* l'*aviso de privacidad* completo con i relativi elementi obbligatori è disponibile su \[URL\]. *Argentina:* \[AAIP mandatory legend\]; i dati sono registrati presso \[…\]. *Colombia:* la nostra *política de tratamiento de datos* è disponibile su \[URL\]; l'autorità competente è la SIC. *Cile* (dal 1º dicembre 2026): il contatto dell'Agenzia è \[…\]; la sezione 8 descrive il nostro trattamento automatizzato.

### B.7 Golfo — EAU e Arabia Saudita *(solo se elencati)*

Quando trattiamo i tuoi dati per finalità diverse dalla fornitura del servizio, ci basiamo sul tuo consenso, che puoi revocare. I tuoi dati lasciano gli \[UAE / Kingdom of Saudi Arabia\] e sono trattati nell'Unione europea e negli Stati Uniti in base a \[SDAIA standard contractual clauses / the mechanism in the Register\]. Il marketing viene inviato esclusivamente con il tuo consenso. Non includere dati personali sensibili nelle tue domande.

### B.8 Asia-Pacifico *(solo le righe relative alle regioni elencate)*

*Singapore:* il nostro Responsabile della protezione dei dati è **\[name, email\]**; i trasferimenti si basano su obblighi contrattuali che garantiscono una protezione comparabile a quella del PDPA; notifichiamo al PDPC le violazioni soggette a notifica entro 3 giorni. *Giappone:* utilizziamo le tue informazioni personali per le finalità indicate nella sezione 4 e per nessun'altra; i tuoi contenuti vengono trasferiti a fornitori in \[named countries — e.g. the United States\], i cui regimi di privacy e le cui garanzie sono descritti nel Registro, e tu acconsenti a ciò al momento dell'iscrizione. *Corea del Sud:* il nostro Responsabile della privacy è **\[name\]**; gli elementi, la destinazione, le tempistiche, il destinatario, la finalità e la conservazione dei trasferimenti all'estero sono indicati nel Registro; le opinioni politiche contenute nelle tue domande sono informazioni sensibili e le trattiamo esclusivamente per svolgere i tuoi dibattiti; i consensi ai trattamenti facoltativi sono raccolti separatamente. *India* (quando si applicheranno le norme DPDP): si applica l'informativa autonoma sul consenso disponibile su \[URL\]; le richieste ricevono risposta entro 90 giorni; per gli utenti di età inferiore a 18 anni è richiesto il consenso verificabile dei genitori. *Filippine:* il nostro DPO è \[name\]; i reclami possono essere presentati alla National Privacy Commission; la sezione 8 descrive il nostro trattamento automatizzato. *Thailandia:* il nostro rappresentante è \[name\] \[if appointed\].

### B.9 Riservato

Turchia, Brasile e Indonesia richiedono ciascuno un'informativa nella lingua locale, un rappresentante o una registrazione e adempimenti formali, e non sono trattati nella presente bozza. Cina, Vietnam e Russia non rientrano nell'offerta.
