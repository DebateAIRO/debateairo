# DebateAI — Pravila o privatnosti

<!-- legal-chrome
summaryTitle: Ukratko
eyebrow: PRAVILA O PRIVATNOSTI · v3.0 · NA SNAZI OD [DATE]
title: Što pohranjujemo i zašto
lede: Vaša prava i naše obveze prema Uredbi GDPR (EU) 2016/679, jednostavnim jezikom. Četrnaest odjeljaka i Prilog B — pomaknite se do kraja.
endMarker: KRAJ PRAVILA · GDPR (EU) 2016/679 · v3.0
bodyLabel: Tekst Pravila o privatnosti
annexTitle: Prilog B — Regionalne odredbe o privatnosti
jumps:
01 VODITELJ OBRADE
02 ŠTO PRIKUPLJAMO
04 PRAVNA OSNOVA
05 MODELI I PRIJENOSI
06 OBJAVLJIVANJE
07 ČUVANJE
10 VAŠA PRAVA PREMA GDPR-U
13 KOLAČIĆI
-->

2026-09-21 · @Someone

**Nacrt v3.0 za pravni pregled — zamjenjuje objavljenu v2.1 (`apps/ui/lib/privacyPolicy.ts`). Ne predstavlja pravni savjet.** Ova je verzija napisana prema onome što kôd doista radi te ispravlja pet tvrdnji u v2.1 kojima je kôd proturječio: podatke o sesijama, rokove čuvanja, analitiku, izvoz i ono što se događa s objavljenim raspravama nakon brisanja. Uglate zagrade označavaju ono što samo vi možete ispuniti; \[pending\] označava značajku koju pravila opisuju, ali koja još nije izrađena i mora postojati prije objavljivanja pravila.

**Version 3.0 · Effective \[date\] · Prethodne verzije na dezbatere.ro/privacy/versions · Voditelj obrade: DebateAIRO S.R.L., Bukurešt**

**In short.** Prikupljamo ono što je potrebno za račun i ono što odlučite upisati. Vaša se pitanja šalju pružateljima usluga umjetne inteligencije navedenima u našem Registru; ne upotrebljavaju se za treniranje modela. Rasprave su privatne osim ako ih objavite. Brisanjem računa uništavaju se ključevi vaših podataka, a vaše se objavljene rasprave uklanjaju. Možete nam se obratiti na privacy@dezbatere.ro, a osobe imenovane u raspravi mogu zatražiti uklanjanje i bez računa.

## 1. Tko je odgovoran za vaše podatke

Voditelj obrade vaših osobnih podataka jest **DebateAIRO S.R.L.**, \[address\], Bukurešt, Rumunjska, Trgovački registar \[J40/…\], CUI \[…\]. Pišite na **privacy@dezbatere.ro** o bilo čemu iz ovih pravila; odgovaramo u roku od jednog mjeseca. Nismo imenovali službenika za zaštitu podataka jer zakon to od nas ne zahtijeva; ovu adresu nadzire \[role\]. Ako smo imenovali predstavnika ili službenika za privatnost za određenu državu, podaci o njemu navedeni su u Prilogu B.

## 2. Što prikupljamo i odakle potječe

Prikupljamo samo ono što je potrebno za rad računa, ono što nam odlučite dati i ono što nam zakon nalaže čuvati.

| Kategorija | Točno određeni podaci | Izvor |
| --- | --- | --- |
| **Račun** | Adresa e-pošte i adresa e-pošte za oporavak (pohranjene u šifriranom obliku, s indeksom s ključem kako bismo mogli pronaći račun bez čitanja adrese); lozinka (pohranjena kao sažetak, nikada u čitljivom obliku); vaša tajna za dvofaktorsku autentifikaciju (šifrirana); deset kodova za oporavak (pohranjeni kao sažeci); vaš pseudonim; vrijeme kada ste potvrdili da imate 18 ili više godina | Vi, pri registraciji |
| **Sesije i sigurnost** | Sažeti token sesije; sažetak s ključem niza korisničkog agenta vašeg preglednika koji služi za uočavanje premještanja sesije u drugi preglednik; vremenske oznake stvaranja, posljednje uporabe i isteka. **Ne** pohranjujemo vašu IP adresu, naziv uređaja ni pojedinosti o pregledniku uz sesiju, a popis sesija koji vidite u Postavkama prikazuje samo vremenske oznake | Vaš preglednik |
| **Sigurnosni revizijski trag** | Dnevnik sigurnosno važnih događaja u koji se zapisi mogu samo dodavati — registracija, potvrda, pokušaji prijave, oporavak, objava, brisanje. IP adresa i korisnički agent svakog događaja pohranjuju se samo kao jednosmjerni sažeci s ključem (Argon2id), pa ih nije moguće ponovno pročitati, ali ih je unutar određenog razdoblja moguće međusobno uspoređivati. Signali rizika pri prijavi i oporavku pohranjuju se šifrirano 90 dana | Vaš preglednik, u trenutku svakog događaja |
| **Sadržaj rasprave** | Pitanje koje upišete; usmjeravajuće bilješke koje postavite; tvrdnje, kritike, upućivanja na dokaze, rezultati i presude koje sustav stvara; doslovan zapis onoga što je svaki pružatelj usluga umjetne inteligencije vratio; upiti za dohvaćanje i upućivanja na izvore. Sve se to pohranjuje šifrirano ključem koji je specifičan za vaš račun | Vi i modeli umjetne inteligencije koji obrađuju vaše pitanje |
| **Podrška** | Poruke koje razmjenjujete s pomoćnikom za podršku ili osobom, pohranjene šifrirano; upotrijebljeni jezik; jeste li pomoćniku dopustili da vidi status (nikada sadržaj) vaših rasprava; ocjene koje dajete. Ako poruka aktivira kontrole zlouporabe, čuvamo sažetak poruke i sažetak IP adrese s koje je poslana | Vi |
| **Evidencija prihvaćanja i privola** | Verzija i sažetak sadržaja Uvjeta koje ste prihvatili i pravila koja su vam prikazana; vrijeme; upotrijebljeni zaslon i mehanizam; vaš jezik; vaša IP adresa i korisnički agent u tom trenutku; svaka privola koju ste dali ili povukli i kada ste to učinili | Vaš preglednik, pri registraciji i svaki put kada promijenite odabir |
| **Plaćanja** \[pending — once a paid plan exists\] | Tarifa, cijena, obračunsko razdoblje, upućivanja na transakcije, dokazi o poreznoj lokaciji. Podatke o kartici čuva naš pružatelj platnih usluga, a nikada mi | Vi i pružatelj platnih usluga |
| **Osobe koje nisu naši korisnici** | Osobni podaci o drugim osobama koje uključite u pitanje ili koje sustav stvori odgovarajući na njega. Molimo vas da to ne činite; odjeljak 11 objašnjava što činimo kada se to ipak dogodi | Vi, neizravno |

**Ne** prikupljamo analitičke ni telemetrijske podatke o načinu na koji upotrebljavate proizvod i u tu svrhu ne postavljamo kolačiće. Ako se to promijeni, najprije će se promijeniti ova Pravila i Pravila o kolačićima te ćemo vas pitati.

## 3. Osjetljive informacije

Sustav za rasprave potiče pitanja o politici, vjeri, zdravlju, seksualnosti i uvjerenjima. To su posebne kategorije podataka prema članku 9. GDPR-a i mogu se pojaviti u vašim pitanjima neovisno o tome namjeravamo li ih prikupljati.

**O vama.** Pri registraciji u zasebnoj rečenici dajete izričitu privolu za našu obradu osjetljivih informacija koje odlučite uključiti u vlastita pitanja radi vođenja vaših rasprava. Možete je povući u bilo kojem trenutku tako da ne uključite takve informacije ili izbrišete raspravu. Ono što objavite o sebi podaci su koje ste odlučili učiniti javnima.

**O drugim osobama.** Nijedan pravni uvjet ne dopušta nam obradu osjetljivih podataka o trećoj osobi koju imenujete u pitanju, a takav uvjet nema ni jedan od naših pružatelja usluga umjetne inteligencije. Zato je to zabranjeno Uvjetima, zato svodimo na najmanju mjeru ono što šaljemo i zato takav sadržaj brzo uklanjamo na zahtjev — odjeljak 11.

**Zdravstvene informacije.** Neke države podatke povezane sa zdravljem, uključujući zaključke, uređuju posebnim zakonima. Ako živite u \[the State of Washington\], primjenjuje se zasebna \[Consumer Health Data Privacy Notice\].

## 4. Zašto upotrebljavamo vaše podatke i na kojoj osnovi

Svaka svrha ima jednu pravnu osnovu prema članku 6. stavku 1. GDPR-a i podatke prikupljene u jednu svrhu ne upotrebljavamo ponovno u drugu.

| Svrha | Podaci | Osnova |
| --- | --- | --- |
| Stvaranje i vođenje vašeg računa, autentifikacija, vođenje i pohrana vaših rasprava kako biste ih mogli ponovno otvoriti i reproducirati | Račun, sesije, sadržaj rasprave | **Ugovor** — Art. 6(1)(b) |
| Slanje vašeg pitanja i izjava sustava pružateljima usluga umjetne inteligencije radi stvaranja rasprave | Sadržaj rasprave | **Ugovor** — Art. 6(1)(b) |
| Održavanje sigurnosti usluge, otkrivanje zlouporabe, omogućavanje uočavanja prijave koju niste izvršili, vođenje revizijskog traga | Sesije, sigurnosni revizijski trag, sažeci iz podrške povezani sa zlouporabom | **Legitimni interesi** — Art. 6(1)(f): naši i vaši interesi za sigurnu uslugu. Možete uložiti prigovor; odjeljak 10 |
| Dokazivanje da ste prihvatili Uvjete te dali ili povukli privolu | Evidencija prihvaćanja i privola | **Pravna obveza** — Art. 6(1)(c), naša dužnost dokazivanja privole prema Art. 7(1) — i legitimni interesi za dokazivanje ugovora |
| Odgovaranje na zahtjeve za podršku | Podrška | **Ugovor** — Art. 6(1)(b) |
| Obrada osjetljivih informacija koje uključite o sebi | Sadržaj rasprave | **Izričita privola** — Art. 9(2)(a), dana zasebno pri registraciji |
| Objavljivanje rasprave koju odlučite objaviti | Sadržaj rasprave, pseudonim | **Ugovor** — Art. 6(1)(b), prema vašoj uputi; za osjetljive podatke o vama, Art. 9(2)(e) — podaci koje ste očito učinili javnima |
| Slanje novosti o proizvodu | Adresa e-pošte | **Privola** — Art. 6(1)(a), neoznačeno polje; povucite je u bilo kojem trenutku iz bilo koje poruke e-pošte ili u Postavkama |
| Ispunjavanje poreznih, računovodstvenih i pravnih obveza \[pending paid plans\] | Plaćanja, evidencija prihvaćanja | **Pravna obveza** — Art. 6(1)(c) |
| Postupanje po pravnim zahtjevima, prijavama nezakonitog sadržaja i našim obvezama kao usluge smještaja sadržaja | Sve što je relevantno za zahtjev | **Pravna obveza** — Art. 6(1)(c) — i legitimni interesi |

Ne izrađujemo vaš profil, ne upotrebljavamo vaše podatke za oglašavanje i ne prodajemo ih. Ne upotrebljavamo vaš sadržaj za treniranje modela i to ne dopuštamo svojim pružateljima — odjeljak 5.

## 5. Pružatelji usluga umjetne inteligencije i međunarodni prijenosi

**Što se šalje.** Za vođenje rasprave šaljemo tekst jednom ili više vanjskih pružatelja usluga umjetne inteligencije: vaše pitanje, usmjeravajuće bilješke koje postavite i izjave koje sustav sastavlja tijekom razvoja rasprave. Pružatelj stoga vidi tekst koji proizlazi iz onoga što ste upisali i koji je oblikovan oko toga. Nikada ne prima vašu adresu e-pošte, identifikatore računa ili sesije, IP adresu ni podatke o plaćanju.

**Koji pružatelji.** Navedeni su u našem **Registru pružatelja usluga umjetne inteligencije** na \[dezbatere.ro/providers\], koji je dio ovih pravila. Za svakog pružatelja Registar navodi njegov pravni subjekt i državu poslovnog nastana; što prima i u koju svrhu; države ili regije u kojima obrađuje podatke; njegove uvjete čuvanja i je li za krajnju točku i značajke koje upotrebljavamo aktivno nulto zadržavanje podataka; smije li prema našem ugovoru upotrebljavati ulazne podatke za treniranje; mehanizam prijenosa na koji se oslanjamo; te datum posljednje provjere svakog unosa. Pružatelji se mogu promijeniti; Registar ima verzije, a promjena se u njemu bilježi.

**Treniranje i čuvanje različite su stvari.** Naši ugovori s pružateljima isključuju uporabu vašeg sadržaja za treniranje ili poboljšavanje njihovih modela. \[Publish only once verified per route.\] Neki pružatelji određeno vrijeme čuvaju upite i odgovore radi sigurnosti, sprječavanja zlouporabe ili vlastitih pravnih obveza; u Registru je navedeno koliko dugo i zašto. Ako je aktivno nulto zadržavanje podataka, u Registru je navedeno i na koje se značajke odnosi. Nećemo opisati sadržaj kao sadržaj koji se ne čuva ako to nije tako.

**Prijenosi izvan EGP-a.** Pružatelji s poslovnim nastanom u Sjedinjenim Američkim Državama primaju podatke na temelju jednog od mehanizama iz poglavlja V. GDPR-a: Okvira za zaštitu privatnosti podataka između EU-a i SAD-a ako je određeni ugovorni subjekt certificiran za te podatke ili standardnih ugovornih klauzula Europske komisije (Modul dva, voditelj obrade izvršitelju obrade), potkrijepljenih procjenom rizika prijenosa i dodatnim mjerama. Registar navodi mehanizam za svakog pružatelja. Primjerak klauzula na koje se oslanjamo možete dobiti ako pišete na privacy@dezbatere.ro. Ako mehanizam na koji se oslanjamo bude proglašen nevaljanim, prije nastavka prijenosa prelazimo na drugi i obavještavamo vas.

**Drugi primatelji.** Naš pružatelj usluga smještaja \[Hetzner, Germany — region …\]; naš pružatelj usluga isporuke i prijenosa sadržaja \[Cloudflare\]; naš posrednik za e-poštu \[…\]; \[our payment provider, once a paid plan exists\]. Svaki postupa prema našim dokumentiranim uputama na temelju ugovora o obradi podataka uz zaštitne mjere koje zahtijeva članak 28., a svaki je u Registru naveden s lokacijom i mehanizmom prijenosa. Nijednom izvršitelju obrade ne dopuštamo uporabu vaših podataka u vlastite svrhe. Ako bi pružatelj tako postupao, bio bi samostalan voditelj obrade i ne bismo mu slali vaše podatke.

**Javna tijela.** Osobne podatke otkrivamo sudovima, regulatornim tijelima ili tijelima kaznenog progona ako to nalaže zakon te vas obavještavamo osim ako nam zakon to zabranjuje.

## 6. Objavljivanje i vidljivost

Rasprave su privatne dok ih ne objavite. Objavljivanje je namjerna, zasebno potvrđena radnja. Objavljena rasprava prikazuje vaš **pseudonim**, vaše pitanje kako ste ga napisali, stablo argumenata, rezultate, presudu i raspon pouzdanosti te nosi vidljivu oznaku da je sadržaj generiran umjetnom inteligencijom. Nikada ne prikazuje vašu adresu e-pošte, zapise o sesijama ni povijest računa. \[Published debates are / are not\] indeksirane u tražilicama \[unless you choose\].

Povlačenjem objave rasprava se uklanja s DebateAI-ja i uništava se ključ naše javne kopije. Kopije koje su čitatelji, tražilice ili arhivi već izradili izvan su naše kontrole i ne možemo ih povratiti.

Kada izbrišete račun, svaku raspravu koju ste objavili uklanjamo iz javnog pristupa bez nepotrebne odgode, a najkasnije u roku od 30 dana, osim ako nam zakon nalaže čuvanje određenog sadržaja. \[Option B — a product change; see the Terms, section 9.\]

## 7. Koliko dugo čuvamo podatke

| Podaci | Koliko dugo | Nakon toga |
| --- | --- | --- |
| Račun | Dok račun postoji, uz razdoblje odgode od 7 dana nakon što zatražite njegovo zatvaranje | Ključevi se uništavaju; zapis se briše |
| Zapisi o sesijama | 14 dana nakon posljednje uporabe ili 90 dana nakon stvaranja, ovisno o tome što nastupi prije | Brišu se |
| Poveznice za potvrdu e-pošte | 24 sata | Brišu se |
| Signali rizika pri prijavi i oporavku | 90 dana, što provodi baza podataka | Uklanjaju se |
| Sigurnosni revizijski trag | Za cijelo vrijeme postojanja usluge | Može se samo dopunjavati; IP i korisnički agent jednosmjerni su sažeci i nije ih moguće ponovno pročitati |
| Sadržaj rasprave (privatan) | Dok račun postoji | Ključevi se uništavaju pri zatvaranju, čime sadržaj postaje nečitljiv |
| Sadržaj rasprave (objavljen) | Dok je objavljen i dok račun postoji | Uklanja se iz javnog pristupa pri povlačenju objave ili zatvaranju; ključevi se uništavaju |
| Zapisi odgovora pružatelja i upućivanja za dohvaćanje | Jednako kao rasprava kojoj pripadaju | Jednako |
| Razgovori i predmeti podrške | \[Until closed plus 12 months\] | Ključevi se uništavaju |
| Evidencija prihvaćanja i privola | Trajanje računa uz još 6 godina — najdulji rok zastare koji se na nas primjenjuje | Briše se |
| Evidencija plaćanja \[pending\] | 10 godina, kako zahtijeva rumunjsko računovodstveno pravo | Briše se |
| Sigurnosne kopije \[pending\] | \[… days\] nakon brisanja aktivnog primjerka | Prepisuju se |

**Što se brisanjem doista čini.** Vaše rasprave i podaci o računu šifrirani su ključevima specifičnima za vaš račun i za svaku raspravu. Brisanjem računa uništavaju se ti ključevi, nakon čega ni mi ni itko drugi ne može pročitati šifrirane zapise, a zapis o vašem računu brišemo. To opisujemo kao brisanje jer je takav njegov učinak i o tome imamo dokumentiranu procjenu; ako želite znati više, pitajte nas. Trebate znati tri stvari: sigurnosni revizijski trag može se samo dopunjavati i ne briše se, ali ne sadržava vaše čitljive identifikatore; mali broj starijih rasprava prethodi našoj trenutačnoj shemi šifriranja, a ako se to odnosi na vaš račun, obavijestit ćemo vas o tome što zatvaranje računa znači za te rasprave; te se na kopije podataka već poslane pružatelju usluga umjetne inteligencije primjenjuju uvjeti čuvanja tog pružatelja navedeni u Registru, a ne naše brisanje.

&#91;The support retention period and the backup line describe policies to implement; the system currently keeps support records indefinitely and has no backup-expiry mechanism. Do not publish figures that are not enforced.\]

## 8. Automatizirane odluke i izrada profila

Rezultati, oznake uvjeta i presude u raspravi automatizirane su procjene **argumenata, a ne osoba**. Ne proizvode pravne učinke za vas niti na vas na sličan način znatno utječu. O vama ne donosimo odluku koja se temelji isključivo na automatiziranoj obradi i proizvodi pravne ili slične znatne učinke te ne izrađujemo vaš profil.

Ako ikada automatiziramo odluku o vašem računu — njegovu suspenziju ili odbijanje objave rasprave — osoba će pregledati svaku takvu odluku prije nego što stupi na snagu ili na vaš zahtjev, a vi ćete moći iznijeti svoje stajalište i osporiti je. Uvjeti opisuju kako.

## 9. Sigurnost i što se događa ako nešto pođe po zlu

Lozinke se sažimaju pomoću Argon2id. Dvofaktorska autentifikacija obvezna je. Vaša adresa e-pošte, rasprave, razgovori s podrškom i tajne za autentifikaciju šifrirani su u mirovanju ključevima specifičnima za vaš račun, a ključevi za objavljene rasprave čuvaju se odvojeno od ključeva za privatne rasprave. Pristup produkcijskim podacima bilježi se. IP adrese i pojedinosti o pregledniku u našem sigurnosnom dnevniku pohranjuju se samo kao jednosmjerni sažeci.

Ako dođe do povrede osobnih podataka, obavještavamo rumunjsko nadzorno tijelo u roku od 72 sata ako to zakon zahtijeva te izravno i bez nepotrebne odgode obavještavamo vas ako je vjerojatno da će povreda prouzročiti visok rizik za vaša prava i slobode. Prilog B navodi pravila obavješćivanja koja se primjenjuju u drugim regijama u kojima pružamo usluge.

## 10. Vaša prava i kako ih ostvariti

Svako od ovih prava možete besplatno ostvariti pisanjem na **privacy@dezbatere.ro** ili u odjeljku **Postavke → Privatnost** ako postoji odgovarajuća kontrola. Odgovaramo u roku od jednog mjeseca; ako je zahtjev složen, možemo uzeti do dva dodatna mjeseca i obavijestit ćemo vas zašto. Možemo zatražiti da putem računa potvrdite svoj identitet.

| Pravo | Što ovdje znači |
| --- | --- |
| **Pristup** (Art. 15) | Primjerak osobnih podataka koje imamo o vama i ove informacije. \[Pending: a JSON export from Settings. Until it exists, we compile the copy manually within the month.\] |
| **Ispravak** (Art. 16) | Ispravite adresu e-pošte ili adresu e-pošte za oporavak u Postavkama. Vaš pseudonim nije moguće promijeniti iz razloga navedenih u Uvjetima; možete zatvoriti račun i izraditi novi |
| **Brisanje** (Art. 17) | Izbrišite privatnu raspravu u bilo kojem trenutku sa stranice rasprave. Zatvorite račun u Postavkama; odjeljak 7 točno objašnjava što se time čini. Zatražite da uklonimo objavljenu raspravu koja sadržava vaše podatke bez obzira na to jeste li autor |
| **Ograničenje** (Art. 18) | Zatražite da prestanemo obrađivati određene podatke dok se ne riješi spor o njima |
| **Prigovor** (Art. 21) | Uložite prigovor na obradu koja se temelji na legitimnim interesima — sigurnosnu i revizijsku obradu iz odjeljka 4 — i prestat ćemo osim ako možemo dokazati uvjerljive razloge. Uložite prigovor na marketing u bilo kojem trenutku i prestat ćemo |
| **Prenosivost** (Art. 20) | Vaše rasprave i podaci o računu u uobičajenom, strojno čitljivom formatu. \[Pending: same export as Access.\] Neosobni sadržaj koji ste stvorili, kao što su vaša pitanja, vraća vam se na zahtjev nakon prestanka ugovora |
| **Povlačenje privole** (Art. 7(3)) | Povucite privolu za marketing iz bilo koje poruke e-pošte ili u Postavkama; povucite privolu za osjetljive podatke tako da takve podatke ne uključite ili izbrišete raspravu. Povlačenje ne utječe na obradu koja je već provedena |
| **Pritužba** | Rumunjskom nadzornom tijelu, **ANSPDCP**, B-dul G-ral Gheorghe Magheru 28–30, Bukurešt, <anspdcp@dataprotection.ro>, ili tijelu u državi u kojoj živite. Radije bismo da nam se prvo obratite |

Nikada ne naplaćujemo zahtjev i nikada prema vama ne postupamo nepovoljnije zato što ste ga podnijeli.

## 11. Osobe imenovane u raspravama koje nisu naši korisnici

Ako netko sustavu DebateAI postavi pitanje u kojem vas imenuje, možemo imati osobne podatke o vama iako nikada niste upotrebljavali uslugu. Uvjeti korisnicima zabranjuju da to čine i svodimo na najmanju mjeru ono što šaljemo pružateljima usluga umjetne inteligencije, ali to se događa.

Ovaj je odjeljak obavijest koju vam dugujemo prema članku 14. GDPR-a. Podaci su sve što je korisnik upisao i sve što je sustav stvorio u odgovoru; izvor je taj korisnik; svrhe i pravna osnova navedene su u odjeljku 4; primatelji su pružatelji usluga umjetne inteligencije iz Registra; čuvanje slijedi odjeljak 7. Imate sva prava iz odjeljka 10, a osobito možete zatražiti da uklonimo objavljenu ili privatnu raspravu koja sadržava vaše podatke i da vam kažemo što imamo. Za to vam nije potreban račun. Pišite na **privacy@dezbatere.ro** ili upotrijebite kontrolu **Prijavite** na bilo kojoj objavljenoj raspravi, a mi ćemo bez nepotrebne odgode postupiti po potkrijepljenim zahtjevima. Ne možemo vas pojedinačno obavijestiti kada se to dogodi jer ne znamo tko ste ni kako vam se obratiti; umjesto toga dajemo ovu javnu obavijest i omogućujemo uklanjanje.

Isto se odnosi na osjetljive informacije o vama — o vašim političkim stavovima, zdravlju ili vjeri — koje se pojave u tuđem pitanju. Nijedan pravni uvjet ne dopušta nam da ih nastavimo obrađivati nakon što uložite prigovor i nećemo to činiti.

## 12. Djeca

DebateAI namijenjen je odraslima. Pri registraciji potvrđujete da imate 18 ili više godina i ne obrađujemo svjesno podatke osoba mlađih od 18 godina. Ako saznamo da račun pripada osobi mlađoj od 18 godina, zatvaramo ga i brišemo podatke kako je opisano u odjeljku 7. Neke države potvrdu smatraju nedostatnom ili zahtijevaju više; Prilog B navodi što se primjenjuje na kojem području, a Uvjeti objašnjavaju što u vezi s tim činimo.

## 13. Kolačići

Postavljamo dva kolačića, oba strogo nužna: jedan vas zadržava prijavljenima, a drugi štiti obrasce od krivotvorenja. Ne postavljamo analitičke, oglasne ni prateće kolačiće. **Pravila o kolačićima** na \[dezbatere.ro/cookies\] navode ih s njihovim trajanjem, objašnjavaju kako se vaš odabir pohranjuje i promijenit će se prije dodavanja bilo kojeg drugog kolačića. Ako pravo vaše regije drukčije uređuje neke kolačiće — primjerice pravilo Ujedinjene Kraljevine o odustajanju od analitike — Pravila o kolačićima to navode.

## 14. Izmjene ovih pravila

Kada izmijenimo ova pravila, objavljujemo novu verziju sa sažetkom izmjena i novim datumom stupanja na snagu te čuvamo prethodne verzije na \[dezbatere.ro/privacy/versions\]. Za izmjenu kojom se dodaje nova svrha ili novi primatelj obavještavamo vas prije početka nove obrade, e-poštom i u proizvodu, te vam dajemo vrijeme za prigovor. Ako nova svrha ovisi o vašoj privoli — primjerice ako ikada poželimo upotrebljavati sadržaj za poboljšavanje modela — tu privolu tražimo zasebno i određeno; prihvaćanje ažuriranih Uvjeta nikada ne smatramo privolom za novu obradu. Za pojašnjenja koja ništa ne mijenjaju u vezi s našim postupanjem jednostavno objavljujemo novu verziju.

Ova su pravila posljednji put ažurirana \[date\]. Verzija 3.0 zamijenila je verziju 2.1, koja je podatke o sesijama, rokove čuvanja, analitiku, izvoz i učinak brisanja na objavljene rasprave opisivala na načine koji više nisu odražavali uslugu.

## Annex B — Regionalne odredbe o privatnosti

Svaki se unos primjenjuje samo ako je njegova regija navedena u odjeljku 2 Uvjeta i navodi samo ono što se razlikuje od glavnog dijela ovih pravila.

### B.1 Europska unija i Europski gospodarski prostor

Glavni dio ovih pravila napisan je za vas. Naše je nadzorno tijelo rumunjski **ANSPDCP**; možete se također pritužiti tijelu u državi u kojoj živite. Rumunjski korisnici: ova su pravila dostupna na rumunjskom jeziku na \[URL\].

### B.2 Ujedinjeno Kraljevstvo *(samo ako je navedeno)*

Naš predstavnik u Ujedinjenoj Kraljevini prema članku 27. UK GDPR-a jest **\[name, address, email\]**; možete mu se obratiti o bilo čemu iz ovih pravila. Nadzorno je tijelo **Ured povjerenika za informacije**, [ico.org.uk](https://ico.org.uk). Možete nam podnijeti pritužbu putem obrasca na \[URL\], a mi potvrđujemo primitak u roku od 30 dana. Prijenosi vaših podataka iz Ujedinjene Kraljevine pružateljima usluga umjetne inteligencije u Sjedinjenim Američkim Državama temelje se na \[the UK Extension to the EU–US Data Privacy Framework, where the provider is certified / the UK International Data Transfer Addendum to the EU standard contractual clauses\], uz procjenu rizika prijenosa. Ako ikada postavimo analitičke kolačiće, u Ujedinjenoj Kraljevini podlijegali bi odustajanju umjesto privoli; danas ih ne postavljamo. Ako ste mlađi od 18 godina i pristupite usluzi unatoč našem dobnom pravilu, standardi ICO-ova Kodeksa za djecu primjenjuju se na način na koji postupamo s vašim podacima.

### B.3 Sjedinjene Američke Države *(samo ako su navedene)*

**Obavijest pri prikupljanju.** Tablica u odjeljku 2 navodi svaku kategoriju osobnih podataka koju prikupljamo, njezinu svrhu i koliko je dugo čuvamo (odjeljak 7). Sljedeće kategorije *osjetljivih* osobnih podataka prikupljamo samo ako ih uključite u vlastita pitanja: \[health, religious or philosophical beliefs, sexual orientation, union membership, political views\], a upotrebljavamo ih samo za vođenje vaših rasprava. **Ne prodajemo niti dijelimo osobne podatke i to nismo činili u prethodnih dvanaest mjeseci.** Osjetljive osobne podatke ne upotrebljavamo ni u koju svrhu osim pružanja usluge koju zatražite. **Signali želje za odustajanjem:** signale Global Privacy Control prihvaćamo kao zahtjev za odustajanje od prodaje ili dijeljenja, što ionako ne činimo. **Vaša prava:** pravo na informaciju, brisanje, ispravak, odustajanje, ograničenje uporabe osjetljivih osobnih podataka i zaštitu od diskriminacije zbog njihova ostvarivanja; podnesite zahtjev na privacy@dezbatere.ro ili \[toll-free number / form\]. **Financijski poticaji:** ne nudimo ih; besplatne i plaćene tarife ne razlikuju se prema načinu na koji postupamo s vašim podacima. **Čuvanje** je navedeno u odjeljku 7. Ova se obavijest ažurira najmanje svakih dvanaest mjeseci; posljednji put ažurirana \[date\].

*Washington:* naša zasebna **Obavijest o privatnosti zdravstvenih podataka potrošača** na \[URL\] primjenjuje se na sve informacije povezane sa zdravljem, uključujući zaključke. *Teksas i Nebraska:* ne prodajemo osjetljive osobne podatke; ako se to ikada promijeni, najprije ćemo dobiti vašu privolu \[statutory language\]. *Colorado, Connecticut, Virginia i druge savezne države sa sveobuhvatnim zakonima o privatnosti:* navedena prava primjenjuju se na vas ako se zakon primjenjuje na nas; na odbijeni zahtjev žalite se pisanjem na \[appeals@dezbatere.ro\].

### B.4 Kanada i Quebec *(samo ako su navedeni)*

Naš službenik za privatnost jest **\[name, email\]**. Ostajemo odgovorni za osobne podatke koje prenosimo pružateljima usluga umjetne inteligencije izvan Kanade i ugovorima zahtijevamo usporedivu zaštitu; na te se pružatelje mogu primjenjivati zakoni država u kojima posluju, uključujući zakonit pristup tijela vlasti. Marketinška e-pošta šalje se samo uz vašu izričitu privolu prema CASL-u. **Quebec:** prije priopćavanja osobnih podataka izvan Quebeca provodimo procjenu učinka na privatnost; postavke kojima se vaše rasprave zadržavaju privatnima uključene su prema zadanom; možete zatražiti da uklonimo iz indeksa ili prestanemo širiti osobne podatke o vama; možete zatražiti svoje podatke u strukturiranom, uobičajenom formatu; odjeljak 8 opisuje našu automatiziranu obradu.

### B.5 Australija i Novi Zeland *(samo ako su navedeni)*

**Australija.** Inozemni primatelji vaših osobnih podataka pružatelji su usluga umjetne inteligencije i izvršitelji obrade navedeni u Registru, smješteni u \[the United States and the European Union\]; poduzimamo razumne korake kako bismo osigurali da s njima postupaju u skladu s Australskim načelima privatnosti. **Automatizirane odluke:** od 10. prosinca 2026. ova pravila utvrđuju vrste odluka računalnih programa koje znatno utječu na vaša prava ili interese — takvih nema; rezultati i presude odnose se na argumente, a ne na vas — i osobne podatke koji se u njima upotrebljavaju. Pritužbe se mogu podnijeti **Uredu australskog povjerenika za informacije**. **Novi Zeland.** Naš službenik za privatnost jest \[name\]. Ako osobne podatke o vama prikupljamo neizravno — jer ih je drugi korisnik uključio u pitanje — ova pravila i odjeljak 11 obavijest su koju vam dajemo. Podatke otkrivamo pružateljima usluga umjetne inteligencije iz Registra kao svojim zastupnicima, na temelju ugovora koji zahtijevaju usporedive zaštitne mjere. Pritužbe se mogu podnijeti **Uredu povjerenika za privatnost**.

### B.6 Latinska Amerika *(prilog na španjolskom jeziku; samo ako je navedeno)*

&#91;Published in Spanish.\] Privola je osnova za obradu ako ne postoji ugovorna nužnost. Prava ARCO — pristup, ispravak, poništenje, prigovor — mogu se ostvariti na privacy@dezbatere.ro, a odgovori se daju u roku od \[per country\]. *Meksiko:* potpuni *aviso de privacidad* s obveznim elementima nalazi se na \[URL\]. *Argentina:* \[AAIP mandatory legend\]; podaci su registrirani pri \[…\]. *Kolumbija:* naša *política de tratamiento de datos* nalazi se na \[URL\]; nadležno tijelo jest SIC. *Čile* (od 1. prosinca 2026.): kontakt Agencije jest \[…\]; odjeljak 8 objašnjava našu automatiziranu obradu.

### B.7 Zaljev — UAE i Saudijska Arabija *(samo ako su navedeni)*

Ako vaše podatke obrađujemo u svrhe koje nisu pružanje usluge, oslanjamo se na vašu privolu, koju možete povući. Vaši podaci napuštaju \[UAE / Kingdom of Saudi Arabia\] i obrađuju se u Europskoj uniji i Sjedinjenim Američkim Državama prema \[SDAIA standard contractual clauses / the mechanism in the Register\]. Marketing se šalje samo uz vašu privolu. Ne uključujte osjetljive osobne podatke u svoja pitanja.

### B.8 Azijsko-pacifička regija *(samo retci za navedene regije)*

*Singapur:* naš službenik za zaštitu podataka jest **\[name, email\]**; prijenosi se temelje na ugovornim obvezama koje pružaju zaštitu usporedivu s PDPA-om; o povredama koje podliježu obavješćivanju obavještavamo PDPC u roku od 3 dana. *Japan:* vaše osobne podatke upotrebljavamo za svrhe iz odjeljka 4 i ni za koje druge; vaš se sadržaj prenosi pružateljima u \[named countries — e.g. the United States\], čiji su sustavi privatnosti i zaštitne mjere opisani u Registru, a na to pristajete pri registraciji. *Južna Koreja:* naš službenik za privatnost jest **\[name\]**; stavke, odredište, vrijeme, primatelj, svrha i čuvanje prekograničnih prijenosa nalaze se u Registru; politička mišljenja u vašim pitanjima osjetljive su informacije i obrađujemo ih samo za vođenje vaših rasprava; privole za neobveznu obradu prikupljaju se zasebno. *Indija* (nakon početka primjene pravila DPDP-a): primjenjuje se zasebna obavijest o privoli na \[URL\]; na zahtjeve se odgovara u roku od 90 dana; korisnicima mlađima od 18 godina potrebna je provjerljiva roditeljska privola. *Filipini:* naš službenik za zaštitu podataka jest \[name\]; pritužbe se mogu podnijeti Nacionalnom povjerenstvu za privatnost; odjeljak 8 opisuje automatiziranu obradu. *Tajland:* naš predstavnik jest \[name\] \[if appointed\].

### B.9 Rezervirano

Turska, Brazil i Indonezija zahtijevaju obavijest na lokalnom jeziku, predstavnika ili registraciju i podneske, pa ovdje nisu izrađeni. Kina, Vijetnam i Rusija nisu obuhvaćeni uslugom.
