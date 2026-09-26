# DebateAI — Pravilnik o zasebnosti

<!-- legal-chrome
summaryTitle: Na kratko
eyebrow: PRAVILNIK O ZASEBNOSTI · v3.0 · VELJA OD [DATE]
title: Kaj hranimo in zakaj
lede: Vaše pravice in naše obveznosti po GDPR (EU) 2016/679 v razumljivem jeziku. Štirinajst razdelkov in Priloga B — pomaknite se do konca.
endMarker: KONEC PRAVILNIKA · GDPR (EU) 2016/679 · v3.0
bodyLabel: Besedilo pravilnika o zasebnosti
annexTitle: Priloga B — Regionalne določbe o zasebnosti
jumps:
01 UPRAVLJAVEC
02 KAJ ZBIRAMO
04 PRAVNA PODLAGA
05 MODELI IN PRENOSI
06 OBJAVA
07 HRAMBA
10 VAŠE PRAVICE PO GDPR
13 PIŠKOTKI
-->

2026-09-21 · @Someone

**Osnutek v3.0 za pravni pregled — nadomešča uvedeno različico v2.1 (`apps/ui/lib/privacyPolicy.ts`). To ni pravni nasvet.** Ta različica opisuje dejansko delovanje kode in popravlja pet navedb v različici v2.1, ki so bile v nasprotju s kodo: podatke o sejah, obdobja hrambe, analitiko, izvoz in posledice izbrisa za objavljene razprave. Oglati oklepaji označujejo podatke, ki jih lahko vnesete le vi; [pending] označuje funkcijo, ki jo pravilnik opisuje, vendar še ni razvita in mora obstajati pred objavo pravilnika.

**Version 3.0 · Effective [date] · Prejšnje različice na dezbatere.ro/privacy/versions · Upravljavec: DebateAIRO S.R.L., Bukarešta**

**In short.** Zbiramo podatke, ki jih potrebuje račun, in to, kar se odločite vnesti. Vaša vprašanja se pošljejo ponudnikom umetne inteligence, navedenim v našem Registru; ne uporabljajo se za učenje modelov. Razprave so zasebne, razen če jih objavite. Z izbrisom računa se uničijo ključi do vaših podatkov in umaknejo vaše objavljene razprave. Dosegljivi smo na privacy@dezbatere.ro, osebe, navedene v razpravi, pa lahko zahtevajo odstranitev brez računa.

## 1. Kdo je odgovoren za vaše podatke

Upravljavec vaših osebnih podatkov je **DebateAIRO S.R.L.**, [address], Bukarešta, Romunija, poslovni register [J40/…], CUI […]. Za vse zadeve iz tega pravilnika pišite na **privacy@dezbatere.ro**; odgovorimo v enem mesecu. Pooblaščene osebe za varstvo podatkov nismo imenovali, ker nam tega zakon ne nalaga; ta naslov spremlja [role]. Če smo za posamezno državo imenovali predstavnika ali osebo, odgovorno za zasebnost, sta navedena v Prilogi B.

## 2. Katere podatke zbiramo in od kod izvirajo

Zbiramo samo podatke, ki jih račun potrebuje za delovanje, podatke, ki nam jih sami posredujete, in podatke, ki jih moramo hraniti po zakonu.

| Kategorija | Natančni podatki | Vir |
| --- | --- | --- |
| **Račun** | E-poštni naslov in e-poštni naslov za obnovitev (shranjena šifrirano, z indeksom s ključem, da lahko račun najdemo, ne da bi naslov prebrali); geslo (shranjeno kot zgoščena vrednost, nikoli v čisti obliki); vaša skrivnost za dvostopenjsko preverjanje pristnosti (šifrirana); deset obnovitvenih kod (shranjenih kot zgoščene vrednosti); vaš psevdonim; čas, ko ste potrdili, da ste stari najmanj 18 let | Vi, ob registraciji |
| **Seje in varnost** | Zgoščen žeton seje; zgoščena vrednost s ključem, izračunana iz niza user-agent vašega brskalnika, s katero zaznavamo prenos seje v drug brskalnik; časovni žigi nastanka, zadnje uporabe in poteka veljavnosti. Znotraj seje **ne** hranimo vašega naslova IP, imena naprave ali podatkov o brskalniku, seznam sej v Nastavitvah pa prikazuje samo časovne žige | Vaš brskalnik |
| **Varnostna revizijska sled** | Dnevnik varnostno pomembnih dogodkov, ki omogoča samo dodajanje — registracije, preverjanja, poskusov prijave, obnovitve, objave in izbrisa. Naslov IP in user-agent vsakega dogodka sta shranjena samo kot enosmerna povzetka s ključem (Argon2id), zato ju ni mogoče prebrati, mogoče pa ju je primerjati znotraj določenega obdobja. Signali tveganja ob prijavi in obnovitvi se šifrirano hranijo 90 dni | Vaš brskalnik ob vsakem dogodku |
| **Vsebina razprave** | Vprašanje, ki ga vnesete; usmerjevalne opombe, ki jih nastavite; trditve, kritike, sklici na dokaze, ocene in razsodbe, ki jih ustvari sistem; dobesedni zapis odgovora vsakega ponudnika umetne inteligence; iskalne poizvedbe in sklici na vire. Vse to je shranjeno šifrirano s ključem, ki je poseben za vaš račun | Vi in modeli umetne inteligence, ki obravnavajo vaše vprašanje |
| **Podpora** | Sporočila, ki jih izmenjate s pomočnikom za podporo ali osebo, shranjena šifrirano; uporabljeni jezik; ali ste pomočniku dovolili vpogled v stanje (nikoli v vsebino) svojih razprav; vaše ocene. Če sporočilo sproži ukrepe proti zlorabi, hranimo zgoščeno vrednost sporočila in zgoščeno vrednost naslova IP, s katerega je bilo poslano | Vi |
| **Evidence sprejetja in privolitev** | Različica in zgoščena vrednost vsebine Pogojev, ki ste jih sprejeli, ter pravilnika, ki vam je bil prikazan; čas; uporabljeni zaslon in mehanizem; vaš jezik; vaš naslov IP in user-agent v tistem trenutku; vsaka privolitev, ki ste jo dali ali preklicali, in čas dogodka | Vaš brskalnik ob registraciji in ob vsaki spremembi izbire |
| **Plačila** [pending — once a paid plan exists] | Paket, cena, obračunsko obdobje, sklici transakcij, dokazila o davčni lokaciji. Podatke o kartici hrani naš ponudnik plačilnih storitev, mi pa nikoli | Vi in ponudnik plačilnih storitev |
| **Osebe, ki niso naši uporabniki** | Osebni podatki o drugih osebah, ki jih vključite v vprašanje ali jih sistem ustvari pri odgovarjanju. Prosimo vas, da tega ne počnete; razdelek 11 pojasnjuje, kako ravnamo, če se to kljub temu zgodi | Vi, posredno |

**Ne** zbiramo analitičnih ali telemetričnih podatkov o vaši uporabi izdelka in v ta namen ne nameščamo piškotkov. Če se to spremeni, bomo najprej spremenili ta pravilnik in Pravilnik o piškotkih ter vas prosili za odločitev.

## 3. Občutljivi podatki

Sistem za razprave spodbuja vprašanja o politiki, veri, zdravju, spolnosti in prepričanjih. Po členu 9 GDPR so to posebne vrste podatkov, ki se lahko pojavijo v vaših vprašanjih ne glede na to, ali jih nameravamo zbirati.

**O vas.** Ob registraciji v ločenem stavku podate izrecno privolitev, da obdelujemo občutljive podatke, ki jih po lastni izbiri vključite v svoja vprašanja, zaradi izvajanja vaših razprav. Privolitev lahko kadar koli prekličete tako, da takih podatkov ne vključite, ali tako, da izbrišete razpravo. Kar objavite o sebi, so podatki, za katere ste se odločili, da jih boste javno objavili.

**O drugih osebah.** Noben pravni pogoj nam ne dovoljuje obdelave občutljivih podatkov o tretji osebi, ki jo navedete v vprašanju, prav tako ga nima noben od naših ponudnikov umetne inteligence. Zato Pogoji to prepovedujejo, zato zmanjšujemo količino poslanih podatkov in zato tako vsebino na zahtevo hitro odstranimo — glejte razdelek 11.

**Zdravstveni podatki.** Nekatere države podatke, povezane z zdravjem, vključno z izpeljanimi sklepi, urejajo s posebnimi zakoni. Če živite v [the State of Washington], se uporablja ločeno [Consumer Health Data Privacy Notice].

## 4. Zakaj uporabljamo vaše podatke in na kateri podlagi

Vsak namen ima eno pravno podlago po členu 6(1) GDPR in podatkov, zbranih za en namen, ne uporabimo za drugega.

| Namen | Podatki | Podlaga |
| --- | --- | --- |
| Ustvarjanje in upravljanje računa, preverjanje vaše pristnosti, izvajanje in shranjevanje razprav, da jih lahko znova odprete in si ogledate njihovo ponovitev | Račun, seje, vsebina razprave | **Pogodba** — Art. 6(1)(b) |
| Pošiljanje vašega vprašanja in izjav sistema ponudnikom umetne inteligence za pripravo razprave | Vsebina razprave | **Pogodba** — Art. 6(1)(b) |
| Zagotavljanje varnosti storitve, odkrivanje zlorab, omogočanje prepoznave prijave, ki je niste izvedli, in vodenje revizijske sledi | Seje, varnostna revizijska sled, zgoščene vrednosti v podpori, povezane z zlorabo | **Zakoniti interesi** — Art. 6(1)(f): naši in vaši interesi za varno storitev. Ugovarjate lahko; glejte razdelek 10 |
| Dokazovanje, da ste sprejeli Pogoje ter dali ali preklicali privolitev | Evidence sprejetja in privolitev | **Pravna obveznost** — Art. 6(1)(c), naša dolžnost dokazati privolitev po Art. 7(1) — in zakoniti interesi za dokazovanje pogodbe |
| Obravnavanje zahtev za podporo | Podpora | **Pogodba** — Art. 6(1)(b) |
| Obdelava občutljivih podatkov, ki jih vključite o sebi | Vsebina razprave | **Izrecna privolitev** — Art. 9(2)(a), podana ločeno ob registraciji |
| Objava razprave, ki se jo odločite objaviti | Vsebina razprave, psevdonim | **Pogodba** — Art. 6(1)(b), po vašem navodilu; za občutljive podatke o vas Art. 9(2)(e) — podatki, ki ste jih očitno objavili sami |
| Pošiljanje novic o izdelku | E-poštni naslov | **Privolitev** — Art. 6(1)(a), neoznačeno polje; kadar koli jo lahko prekličete v katerem koli e-poštnem sporočilu ali Nastavitvah |
| Izpolnjevanje davčnih, računovodskih in pravnih obveznosti [pending paid plans] | Plačila, evidence sprejetja | **Pravna obveznost** — Art. 6(1)(c) |
| Obravnavanje pravnih zahtev, prijav nezakonite vsebine in naših obveznosti ponudnika gostovanja | Vsi podatki, pomembni za zahtevo | **Pravna obveznost** — Art. 6(1)(c) — in zakoniti interesi |

Ne profiliramo vas, vaših podatkov ne uporabljamo za oglaševanje in jih ne prodajamo. Vaše vsebine ne uporabljamo za učenje modelov in tega ne dovolimo niti svojim ponudnikom — glejte razdelek 5.

## 5. Ponudniki umetne inteligence in mednarodni prenosi

**Kaj se pošlje.** Za izvedbo razprave pošljemo besedilo enemu ali več zunanjim ponudnikom umetne inteligence: vaše vprašanje, usmerjevalne opombe, ki jih nastavite, in izjave, ki jih sistem sestavlja med razvojem razprave. Ponudnik zato vidi besedilo, izpeljano iz tega, kar ste vnesli, in zgrajeno okoli tega. Nikoli ne prejme vašega e-poštnega naslova, identifikatorjev računa ali seje, naslova IP ali podatkov o plačilu.

**Kateri ponudniki.** Navedeni so v našem **Registru ponudnikov umetne inteligence** na [dezbatere.ro/providers], ki je del tega pravilnika. Register za vsakega ponudnika navaja njegovo pravno osebo in državo ustanovitve; kaj prejema in za kakšen namen; države ali regije, v katerih obdeluje podatke; njegove pogoje hrambe ter ali je za končno točko in funkcije, ki jih uporabljamo, vključena ničelna hramba podatkov; ali sme po naši pogodbi uporabljati vhodne podatke za učenje; mehanizem prenosa, na katerega se opiramo; in datum zadnjega preverjanja vsakega vnosa. Ponudniki se lahko spremenijo; Register vsebuje različice in sprememba je v njem zabeležena.

**Učenje in hramba sta različni stvari.** Naše pogodbe s ponudniki izključujejo uporabo vaše vsebine za učenje ali izboljševanje njihovih modelov. [Publish only once verified per route.] Nekateri ponudniki navodila in odgovore hranijo omejeno obdobje zaradi varnosti, preprečevanja zlorab ali lastnih pravnih obveznosti; Register navaja trajanje in razlog. Če je vključena ničelna hramba podatkov, Register to navede skupaj s funkcijami, za katere velja. Za vsebino ne bomo trdili, da se ne hrani, kadar se dejansko hrani.

**Prenosi zunaj EGP.** Ponudniki s sedežem v Združenih državah prejemajo podatke na podlagi enega od mehanizmov iz poglavja V GDPR: okvira za varstvo podatkov med EU in ZDA, če je določena pogodbena pravna oseba certificirana za te podatke, ali standardnih pogodbenih določil Evropske komisije (modul dva, upravljavec obdelovalcu), podprtih z oceno tveganja prenosa in dopolnilnimi ukrepi. Register navaja mehanizem za vsakega ponudnika. Izvod določil, na katera se opiramo, lahko dobite tako, da pišete na privacy@dezbatere.ro. Če je mehanizem, na katerega se opiramo, razveljavljen, pred nadaljevanjem prenosov preidemo na drugega in vas o tem obvestimo.

**Drugi prejemniki.** Naš ponudnik gostovanja [Hetzner, Germany — region …]; naš ponudnik dostave vsebin in prenosa [Cloudflare]; naš ponudnik posredovanja e-pošte […]; [our payment provider, once a paid plan exists]. Vsak deluje po naših dokumentiranih navodilih na podlagi pogodbe o obdelavi podatkov z zaščitnimi ukrepi, ki jih zahteva člen 28, in vsak je v Registru naveden z lokacijo in mehanizmom prenosa. Nobenemu obdelovalcu ne dovolimo uporabe vaših podatkov za lastne namene. Če bi ponudnik tako ravnal, bi bil samostojen upravljavec in mu vaših podatkov ne bi pošiljali.

**Javni organi.** Osebne podatke razkrijemo sodiščem, regulatorjem ali organom kazenskega pregona, kadar to zahteva zakon, in vas obvestimo, razen če nam zakon to prepoveduje.

## 6. Objava in vidnost

Razprave so zasebne, dokler jih ne objavite. Objava je namerno in ločeno potrjeno dejanje. Objavljena razprava prikazuje vaš **psevdonim**, vaše vprašanje v obliki, v kateri ste ga vnesli, drevo argumentov, ocene, razsodbo in pas gotovosti ter ima vidno oznako, da je vsebino ustvarila umetna inteligenca. Nikoli ne prikazuje vašega e-poštnega naslova, zapisov o sejah ali zgodovine računa. [Published debates are / are not] indeksirane v iskalnikih [unless you choose].

Umik objave odstrani razpravo iz storitve DebateAI in uniči ključ do naše javne kopije. Kopije, ki so jih že naredili bralci, iskalniki ali arhivi, niso pod našim nadzorom in jih ne moremo priklicati.

Ko izbrišete račun, brez nepotrebnega odlašanja in najpozneje v 30 dneh iz javnega dostopa odstranimo vse razprave, ki ste jih objavili, razen če nam zakon nalaga hrambo posamezne postavke. [Option B — a product change; see the Terms, section 9.]

## 7. Kako dolgo hranimo podatke

| Podatki | Kako dolgo | Nato |
| --- | --- | --- |
| Račun | Dokler račun obstaja, in 7-dnevno obdobje odloga po vaši zahtevi za zaprtje | Ključi se uničijo; zapis se izbriše |
| Evidence sej | 14 dni po zadnji uporabi ali 90 dni po nastanku, kar nastopi prej | Izbrišejo se |
| Povezave za preverjanje e-pošte | 24 ur | Izbrišejo se |
| Signali tveganja ob prijavi in obnovitvi | 90 dni, kar zagotavlja podatkovna zbirka | Odstranijo se |
| Varnostna revizijska sled | Za celotno življenjsko dobo storitve | Omogoča samo dodajanje; naslov IP in user-agent sta enosmerna povzetka in ju ni mogoče prebrati |
| Vsebina razprave (zasebna) | Dokler račun obstaja | Ob zaprtju se ključi uničijo, zato vsebine ni mogoče prebrati |
| Vsebina razprave (objavljena) | Dokler je objavljena in račun obstaja | Ob umiku objave ali zaprtju se odstrani iz javnega dostopa; ključi se uničijo |
| Evidence odgovorov ponudnikov in sklici za pridobivanje | Enako kot razprava, ki ji pripadajo | Enako |
| Pogovori in primeri podpore | [Until closed plus 12 months] | Ključi se uničijo |
| Evidence sprejetja in privolitev | Življenjska doba računa in še 6 let — najdaljši zastaralni rok, ki velja za nas | Izbrišejo se |
| Evidence plačil [pending] | 10 let, kot zahteva romunska računovodska zakonodaja | Izbrišejo se |
| Varnostne kopije [pending] | [… days] po izbrisu žive kopije | Prepišejo se |

**Kaj izbris dejansko naredi.** Vaše razprave in podatki računa so šifrirani s ključi, posebnimi za vaš račun in posamezno razpravo. Izbris računa uniči te ključe, zato šifriranih zapisov ne moremo več prebrati ne mi ne kdo drug, zapis vašega računa pa izbrišemo. To opisujemo kot izbris, ker je tak njegov učinek, in imamo dokumentirano oceno, ki to podpira; če želite izvedeti več, vprašajte. Vedeti morate tri stvari: varnostna revizijska sled omogoča samo dodajanje in se ne izbriše, vendar ne vsebuje vaših berljivih identifikatorjev; majhno število starejših razprav je nastalo pred našo sedanjo shemo šifriranja in če to velja za vaš račun, vam pojasnimo učinek zaprtja; kopije podatkov, ki so že bile poslane ponudniku umetne inteligence, pa urejajo pogoji hrambe tega ponudnika v Registru, ne naš izbris.

&#91;The support retention period and the backup line describe policies to implement; the system currently keeps support records indefinitely and has no backup-expiry mechanism. Do not publish figures that are not enforced.\]

## 8. Avtomatizirane odločitve in profiliranje

Ocene, oznake stanja in razsodbe v razpravi so avtomatizirane ocene **argumentov, ne oseb**. Za vas nimajo pravnih učinkov in na vas ne vplivajo na podobno pomemben način. O vas ne sprejmemo nobene odločitve, ki bi temeljila izključno na avtomatizirani obdelavi in bi imela pravne ali podobno pomembne učinke, ter vas ne profiliramo.

Če bomo kadar koli avtomatizirali odločitev o vašem računu — njegovo začasno onemogočitev ali zavrnitev objave razprave — bo oseba tako odločitev pregledala, preden začne učinkovati, ali na vašo zahtevo; lahko boste podali svoje stališče in odločitev izpodbijali. Postopek opisujejo Pogoji.

## 9. Varnost in ravnanje ob težavah

Gesla se zgoščujejo z Argon2id. Dvostopenjsko preverjanje pristnosti je obvezno. Vaš e-poštni naslov, razprave, pogovori s podporo in skrivnosti za preverjanje pristnosti so med hrambo šifrirani s ključi, posebnimi za vaš račun, ključi objavljenih razprav pa se hranijo ločeno od ključev zasebnih razprav. Dostop do produkcijskih podatkov se beleži. Naslovi IP in podatki o brskalnikih se v našem varnostnem dnevniku hranijo samo kot enosmerni povzetki.

Če pride do kršitve varstva osebnih podatkov, o njej v 72 urah obvestimo romunski nadzorni organ, kadar to zahteva zakon, vas pa obvestimo neposredno in brez nepotrebnega odlašanja, kadar je verjetno, da bo kršitev pomenila veliko tveganje za vaše pravice in svoboščine. Priloga B navaja pravila obveščanja, ki veljajo v drugih regijah, v katerih ponujamo storitev.

## 10. Vaše pravice in njihovo uveljavljanje

Katero koli od teh pravic lahko brezplačno uveljavite tako, da pišete na **privacy@dezbatere.ro**, ali v **Nastavitvah → Zasebnost**, kjer obstaja ustrezni kontrolnik. Odgovorimo v enem mesecu; če je zahteva zapletena, lahko rok podaljšamo za največ dva dodatna meseca in vam pojasnimo razlog. Lahko vas prosimo, da prek računa potrdite svojo identiteto.

| Pravica | Kaj pomeni tukaj |
| --- | --- |
| **Dostop** (Art. 15) | Kopija osebnih podatkov, ki jih hranimo o vas, in te informacije. [Pending: a JSON export from Settings. Until it exists, we compile the copy manually within the month.] |
| **Popravek** (Art. 16) | V Nastavitvah popravite svoj e-poštni naslov ali e-poštni naslov za obnovitev. Psevdonima zaradi razlogov, navedenih v Pogojih, ni mogoče spremeniti; račun lahko zaprete in odprete novega |
| **Izbris** (Art. 17) | Zasebno razpravo lahko kadar koli izbrišete na strani razprave. Račun zaprete v Nastavitvah; razdelek 7 natančno pojasnjuje posledice. Prosite nas lahko, naj odstranimo objavljeno razpravo, ki vsebuje vaše podatke, ne glede na to, ali ste njen avtor |
| **Omejitev** (Art. 18) | Prosite nas lahko, naj prenehamo obdelovati določene podatke, dokler se spor o njih ne razreši |
| **Ugovor** (Art. 21) | Ugovarjate lahko obdelavi na podlagi zakonitih interesov — varnostni in revizijski obdelavi iz razdelka 4 — in prenehali bomo, razen če lahko dokažemo nujne razloge. Trženju lahko ugovarjate kadar koli in prenehali bomo |
| **Prenosljivost** (Art. 20) | Vaše razprave in podatki računa v splošno uporabljani, strojno berljivi obliki. [Pending: same export as Access.] Neosebna vsebina, ki ste jo ustvarili, na primer vaša vprašanja, vam bo na zahtevo vrnjena ob prenehanju pogodbe |
| **Preklic privolitve** (Art. 7(3)) | Privolitev za trženje prekličete v katerem koli e-poštnem sporočilu ali Nastavitvah; privolitev za občutljive podatke prekličete tako, da takih podatkov ne vključujete, ali tako, da izbrišete razpravo. Preklic ne vpliva na obdelavo, ki je že bila izvedena |
| **Pritožba** | Romunskemu nadzornemu organu **ANSPDCP**, B-dul G-ral Gheorghe Magheru 28–30, Bukarešta, <anspdcp@dataprotection.ro>, ali organu v državi, v kateri živite. Raje bi videli, da se najprej obrnete na nas |

Za zahtevo nikoli ne zaračunamo in vas zaradi njene vložitve nikoli ne obravnavamo manj ugodno.

## 11. Osebe, navedene v razpravah, ki niso naši uporabniki

Če nekdo storitvi DebateAI postavi vprašanje, v katerem vas navede, lahko hranimo vaše osebne podatke, čeprav storitve še nikoli niste uporabili. Pogoji uporabnikom to prepovedujejo in zmanjšujemo količino podatkov, ki jih pošiljamo ponudnikom umetne inteligence, vendar se to kljub temu dogaja.

Ta razdelek je obvestilo, ki vam ga dolgujemo po členu 14 GDPR. Podatki so vse, kar je uporabnik vnesel, in vse, kar je sistem ustvaril v odgovor; vir je ta uporabnik; nameni in pravna podlaga so navedeni v razdelku 4; prejemniki so ponudniki umetne inteligence v Registru; hramba sledi razdelku 7. Imate vse pravice iz razdelka 10, zlasti pa nas lahko prosite, naj odstranimo objavljeno ali zasebno razpravo, ki vsebuje vaše podatke, in vam povemo, katere podatke hranimo. Za to ne potrebujete računa. Pišite na **privacy@dezbatere.ro** ali uporabite kontrolnik **Prijavi** pri kateri koli objavljeni razpravi in na utemeljene zahteve ukrepamo brez nepotrebnega odlašanja. Kadar se to zgodi, vas ne moremo obvestiti posamično, ker ne vemo, kdo ste ali kako naj stopimo v stik z vami; namesto tega sprejmemo ta javni način obveščanja in možnost odstranitve.

Enako velja za občutljive podatke o vas — politiko, zdravje, vero — ki se pojavijo v vprašanju druge osebe. Noben pravni pogoj nam ne dovoljuje nadaljnje obdelave, potem ko ugovarjate, zato je ne bomo nadaljevali.

## 12. Otroci

DebateAI je namenjen odraslim. Ob registraciji potrdite, da ste stari najmanj 18 let, in zavestno ne obdelujemo podatkov nikogar, mlajšega od 18 let. Če izvemo, da račun pripada osebi, mlajši od 18 let, ga zapremo in podatke izbrišemo, kot je opisano v razdelku 7. Nekatere države potrditev štejejo za nezadostno ali zahtevajo več; Priloga B navaja pravila, ki veljajo v posameznih državah, Pogoji pa pojasnjujejo naše ravnanje.

## 13. Piškotki

Nastavimo dva piškotka, oba nujno potrebna: eden ohranja vašo prijavo, drugi pa varuje obrazce pred ponarejanjem. Ne nastavljamo analitičnih, oglaševalskih ali sledilnih piškotkov. **Pravilnik o piškotkih** na [dezbatere.ro/cookies] jih navaja skupaj z obdobjem veljavnosti, pojasnjuje, kako se shrani vaša izbira, in bo spremenjen, preden bo dodan kateri koli drug piškotek. Če pravo vaše regije nekatere piškotke obravnava drugače — na primer pravilo Združenega kraljestva o zavrnitvi analitike — je to navedeno v Pravilniku o piškotkih.

## 14. Spremembe tega pravilnika

Ko ta pravilnik spremenimo, objavimo novo različico s povzetkom sprememb in novim datumom začetka veljavnosti, prejšnje različice pa ohranimo na [dezbatere.ro/privacy/versions]. O spremembi, ki dodaja nov namen ali novega prejemnika, vas obvestimo po e-pošti in v izdelku pred začetkom nove obdelave ter vam damo čas za ugovor. Kadar je nov namen odvisen od vaše privolitve — na primer, če bi kadar koli želeli uporabiti vsebino za izboljševanje modelov — vas za to privolitev zaprosimo ločeno in posebej; sprejetja posodobljenih Pogojev nikoli ne obravnavamo kot privolitev za novo obdelavo. Pri pojasnilih, ki ničesar ne spremenijo glede našega ravnanja, preprosto objavimo novo različico.

Ta pravilnik je bil nazadnje posodobljen [date]. Različica 3.0 je nadomestila različico 2.1, ki je podatke o sejah, obdobja hrambe, analitiko, izvoz in posledice izbrisa za objavljene razprave opisovala na načine, ki niso več odražali storitve.

## Annex B — Regionalne določbe o zasebnosti

Vsak vnos velja le, če je njegova regija navedena v razdelku 2 Pogojev, in navaja samo razlike glede na glavni del tega pravilnika.

### B.1 Evropska unija in Evropski gospodarski prostor

Glavni del tega pravilnika je napisan za vas. Naš nadzorni organ je romunski **ANSPDCP**; pritožite se lahko tudi organu v državi, v kateri živite. Uporabniki v Romuniji: ta pravilnik je v romunščini na voljo na [URL].

### B.2 Združeno kraljestvo *(samo če je navedeno)*

Naš predstavnik v Združenem kraljestvu po členu 27 UK GDPR je **[name, address, email]**; z njim lahko stopite v stik glede česar koli iz tega pravilnika. Nadzorni organ je **Information Commissioner's Office**, [ico.org.uk](https://ico.org.uk). Pritožbo nam lahko pošljete z obrazcem na [URL] in prejem potrdimo v 30 dneh. Prenosi vaših podatkov iz Združenega kraljestva ponudnikom umetne inteligence v Združenih državah temeljijo na [the UK Extension to the EU–US Data Privacy Framework, where the provider is certified / the UK International Data Transfer Addendum to the EU standard contractual clauses] in jih podpira ocena tveganja prenosa. Če bi kdaj nastavili analitične piškotke, bi v Združenem kraljestvu zanje veljala možnost zavrnitve namesto privolitve; danes jih ne nastavljamo. Če ste mlajši od 18 let in kljub našemu starostnemu pravilu dostopate do storitve, se za ravnanje z vašimi podatki uporabljajo standardi kodeksa ICO za otroke.

### B.3 Združene države *(samo če so navedene)*

**Obvestilo ob zbiranju.** Preglednica v razdelku 2 navaja vsako kategorijo osebnih podatkov, ki jih zbiramo, njen namen in obdobje hrambe (razdelek 7). Te kategorije *občutljivih* osebnih podatkov zbiramo le, kadar jih vključite v svoja vprašanja: [health, religious or philosophical beliefs, sexual orientation, union membership, political views], in jih uporabljamo samo za izvajanje vaših razprav. **Osebnih podatkov ne prodajamo ali delimo in tega nismo storili niti v preteklih dvanajstih mesecih.** Občutljivih osebnih podatkov ne uporabljamo za noben namen, ki presega zagotavljanje storitve, ki jo zahtevate. **Signali želje za zavrnitev:** signale Global Privacy Control upoštevamo kot zahtevo za zavrnitev prodaje ali deljenja, česar v nobenem primeru ne počnemo. **Vaše pravice:** izvedeti, izbrisati, popraviti, zavrniti, omejiti uporabo občutljivih osebnih podatkov in ne biti diskriminirani zaradi njihovega uveljavljanja; zahtevo vložite na privacy@dezbatere.ro ali prek [toll-free number / form]. **Finančne spodbude:** ne ponujamo jih; brezplačni in plačljivi paketi se ne razlikujejo po načinu ravnanja z vašimi podatki. **Hramba** je navedena v razdelku 7. To obvestilo se posodobi najmanj vsakih dvanajst mesecev; nazadnje posodobljeno [date].

*Washington:* naše **Obvestilo o zasebnosti zdravstvenih podatkov potrošnikov** na [URL] je ločen dokument, ki velja za vse podatke, povezane z zdravjem, vključno z izpeljanimi sklepi. *Teksas in Nebraska:* občutljivih osebnih podatkov ne prodajamo; če bi se to kadar koli spremenilo, bi prej pridobili vašo privolitev [statutory language]. *Kolorado, Connecticut, Virginija in druge zvezne države s celovitimi zakoni o zasebnosti:* navedene pravice veljajo za vas, kjer zakon velja za nas; zoper zavrnjeno zahtevo se pritožite tako, da pišete na [appeals@dezbatere.ro].

### B.4 Kanada in Quebec *(samo če sta navedena)*

Naša oseba, odgovorna za zasebnost, je **[name, email]**. Še naprej smo odgovorni za osebne podatke, ki jih prenašamo ponudnikom umetne inteligence zunaj Kanade, in s pogodbami zahtevamo primerljivo zaščito; za te ponudnike lahko veljajo zakoni držav, v katerih poslujejo, vključno z zakonitim dostopom organov. Trženjska e-pošta se pošilja samo z vašo izrecno privolitvijo v skladu s CASL. **Quebec:** pred posredovanjem osebnih podatkov zunaj Quebeca izvedemo oceno učinka na zasebnost; nastavitve, ki vaše razprave ohranjajo zasebne, so privzeto vključene; zahtevate lahko, da vaše osebne podatke odstranimo iz indeksov ali prenehamo razširjati; zahtevate lahko svoje podatke v strukturirani, splošno uporabljani obliki; razdelek 8 opisuje našo avtomatizirano obdelavo.

### B.5 Avstralija in Nova Zelandija *(samo če sta navedeni)*

**Avstralija.** Čezmorski prejemniki vaših osebnih podatkov so ponudniki umetne inteligence in obdelovalci, navedeni v Registru, ki se nahajajo v [the United States and the European Union]; sprejemamo razumne ukrepe, da z njimi ravnajo v skladu z avstralskimi načeli zasebnosti. **Avtomatizirane odločitve:** od 10. decembra 2026 ta pravilnik opredeljuje vrste odločitev, ki jih sprejemajo računalniški programi in pomembno vplivajo na vaše pravice ali interese — takih odločitev ni; ocene in razsodbe se nanašajo na argumente, ne na vas — ter osebne podatke, uporabljene pri njih. Pritožbe se lahko vložijo pri **Uradu avstralskega informacijskega pooblaščenca**. **Nova Zelandija.** Naša oseba, odgovorna za zasebnost, je [name]. Kadar osebne podatke o vas zbiramo posredno — ker jih je drug uporabnik vključil v vprašanje — sta ta pravilnik in razdelek 11 obvestilo, ki vam ga zagotovimo. Ponudnikom umetne inteligence v Registru jih razkrijemo kot svojim zastopnikom na podlagi pogodb, ki zahtevajo primerljive zaščitne ukrepe. Pritožbe se lahko vložijo pri **Uradu pooblaščenca za zasebnost**.

### B.6 Latinska Amerika *(priloga v španščini; samo če je navedena)*

&#91;Published in Spanish.\] Privolitev je podlaga za obdelavo, kadar ne obstaja pogodbena nujnost. Pravice ARCO — dostop, popravek, preklic, ugovor — se lahko uveljavijo na privacy@dezbatere.ro, odgovori pa so poslani v [per country]. *Mehika:* celovito *aviso de privacidad* z obveznimi elementi je na [URL]. *Argentina:* [AAIP mandatory legend]; podatki so registrirani pri […]. *Kolumbija:* naša *política de tratamiento de datos* je na [URL]; organ je SIC. *Čile* (od 1. decembra 2026): kontakt agencije je […]; razdelek 8 pojasnjuje našo avtomatizirano obdelavo.

### B.7 Zaliv — ZAE in Saudova Arabija *(samo če sta navedena)*

Kadar vaše podatke obdelujemo za namene, ki niso zagotavljanje storitve, se opiramo na vašo privolitev, ki jo lahko prekličete. Vaši podatki zapustijo [UAE / Kingdom of Saudi Arabia] ter se obdelujejo v Evropski uniji in Združenih državah na podlagi [SDAIA standard contractual clauses / the mechanism in the Register]. Trženje se pošilja samo z vašo privolitvijo. V vprašanja ne vključujte občutljivih osebnih podatkov.

### B.8 Azijsko-pacifiška regija *(samo vrstice za navedene regije)*

*Singapur:* naša pooblaščena oseba za varstvo podatkov je **[name, email]**; prenosi temeljijo na pogodbenih obveznostih, ki zagotavljajo zaščito, primerljivo s PDPA; o kršitvah, za katere velja obveznost obvestila, obvestimo PDPC v 3 dneh. *Japonska:* vaše osebne podatke uporabljamo za namene iz razdelka 4 in za nobene druge; vaša vsebina se prenese ponudnikom v [named countries — e.g. the United States], katerih ureditve in zaščitni ukrepi za zasebnost so opisani v Registru, s čimer ob registraciji soglašate. *Južna Koreja:* naša oseba, odgovorna za zasebnost, je **[name]**; postavke, namembni kraj, čas, prejemnik, namen in hramba čezmorskih prenosov so navedeni v Registru; politična mnenja v vaših vprašanjih so občutljivi podatki in jih obdelujemo samo za izvajanje vaših razprav; privolitve za neobvezno obdelavo se pridobijo ločeno. *Indija* (ko se začnejo uporabljati pravila DPDP): velja samostojno obvestilo o privolitvi na [URL]; na zahteve se odgovori v 90 dneh; uporabniki, mlajši od 18 let, potrebujejo preverljivo privolitev staršev. *Filipini:* naša pooblaščena oseba za varstvo podatkov je [name]; pritožbe se lahko vložijo pri nacionalni komisiji za zasebnost; razdelek 8 opisuje avtomatizirano obdelavo. *Tajska:* naš predstavnik je [name] [if appointed].

### B.9 Pridržano

Turčija, Brazilija in Indonezija zahtevajo obvestilo v lokalnem jeziku, predstavnika ali registracijo ter vložitve; določbe zanje tukaj niso pripravljene. Storitve ne ponujamo na Kitajskem, v Vietnamu ali Rusiji.
