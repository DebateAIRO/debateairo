# DebateAI — Zásady ochrany osobných údajov

<!-- legal-chrome
summaryTitle: Stručne
eyebrow: ZÁSADY OCHRANY OSOBNÝCH ÚDAJOV · v3.0 · ÚČINNÉ OD [DATE]
title: Čo uchovávame a prečo
lede: Vaše práva a naše povinnosti podľa GDPR (EU) 2016/679 zrozumiteľne. Štrnásť častí a príloha B — prejdite až na koniec.
endMarker: KONIEC ZÁSAD · GDPR (EU) 2016/679 · v3.0
bodyLabel: Text zásad ochrany osobných údajov
annexTitle: Príloha B — Regionálne podmienky ochrany osobných údajov
jumps:
01 PREVÁDZKOVATEĽ
02 ČO ZHROMAŽĎUJEME
04 PRÁVNY ZÁKLAD
05 MODELY A PRENOSY
06 ZVEREJŇOVANIE
07 DOBA UCHOVÁVANIA
10 VAŠE PRÁVA PODĽA GDPR
13 SÚBORY COOKIE
-->

2026-09-21 · @Someone

**Návrh v3.0 na posúdenie právnym poradcom — nahrádza nasadenú verziu v2.1 (`apps/ui/lib/privacyPolicy.ts`). Nejde o právne poradenstvo.** Táto verzia opisuje skutočné fungovanie kódu a opravuje päť tvrdení vo verzii v2.1, ktoré boli v rozpore s kódom: údaje o reláciách, doby uchovávania, analytiku, export a následky odstránenia účtu pre zverejnené debaty. Hranaté zátvorky označujú údaje, ktoré môžete doplniť iba vy; [pending] označuje funkciu opísanú v týchto zásadách, ktorá ešte nebola vytvorená a musí existovať pred zverejnením zásad.

**Version 3.0 · Effective [date] · Predchádzajúce verzie na dezbatere.ro/privacy/versions · Prevádzkovateľ: DebateAIRO S.R.L., Bukurešť**

**In short.** Zhromažďujeme údaje potrebné pre účet a to, čo sa rozhodnete napísať. Vaše otázky sa odosielajú poskytovateľom umelej inteligencie uvedeným v našom registri; nepoužívajú sa na trénovanie modelov. Debaty sú súkromné, pokiaľ ich nezverejníte. Odstránením účtu sa zničia kľúče k vašim údajom a vaše zverejnené debaty sa stiahnu z verejného prístupu. Môžete nás kontaktovať na privacy@dezbatere.ro a osoby uvedené v debate môžu požiadať o odstránenie aj bez účtu.

## 1. Kto zodpovedá za vaše údaje

Prevádzkovateľom vašich osobných údajov je **DebateAIRO S.R.L.**, [address], Bukurešť, Rumunsko, obchodný register [J40/…], CUI […]. Vo všetkých záležitostiach týkajúcich sa týchto zásad nám napíšte na **privacy@dezbatere.ro**; odpovieme do jedného mesiaca. Neurčili sme zodpovednú osobu pre ochranu osobných údajov, pretože nám to zákon neukladá; túto adresu sleduje [role]. Ak sme pre konkrétnu krajinu určili zástupcu alebo zodpovednú osobu pre ochranu osobných údajov, uvádza ich príloha B.

## 2. Aké údaje zhromažďujeme a odkiaľ pochádzajú

Zhromažďujeme iba údaje potrebné na fungovanie účtu, údaje, ktoré sa nám rozhodnete poskytnúť, a údaje, ktoré nám zákon ukladá uchovávať.

| Kategória | Konkrétne údaje | Zdroj |
| --- | --- | --- |
| **Účet** | E-mailová adresa a e-mailová adresa na obnovenie (uložené šifrovane, s kľúčovaným indexom, aby sme účet našli bez prečítania adresy); heslo (uložené ako haš, nikdy nie v otvorenom tvare); váš tajný údaj dvojfaktorového overovania (šifrovaný); desať obnovovacích kódov (uložených ako haše); váš pseudonym; čas, keď ste potvrdili, že máte aspoň 18 rokov | Vy, pri registrácii |
| **Relácie a bezpečnosť** | Hašovaný token relácie; kľúčovaný haš reťazca user-agent vášho prehliadača, používaný na zistenie presunu relácie do iného prehliadača; časové pečiatky vytvorenia, posledného použitia a skončenia platnosti. S vašou reláciou **neuchovávame** IP adresu, názov zariadenia ani údaje o prehliadači a zoznam relácií v Nastaveniach zobrazuje iba časové pečiatky | Váš prehliadač |
| **Bezpečnostný auditný záznam** | Nemenný záznam udalostí dôležitých pre bezpečnosť — registrácie, overenia, pokusy o prihlásenie, obnovenia, zverejnenia a vymazania. IP adresa a user-agent každej udalosti sa uchovávajú iba ako kľúčované jednosmerné súhrny (Argon2id), takže ich nemožno spätne prečítať, ale možno ich v rámci obdobia porovnať. Rizikové signály prihlásenia a obnovenia sa uchovávajú šifrovane 90 dní | Váš prehliadač v čase každej udalosti |
| **Obsah debaty** | Otázka, ktorú napíšete; vami nastavené usmerňujúce poznámky; tvrdenia, kritiky, odkazy na dôkazy, hodnotenia a verdikty vytvorené systémom; doslovný záznam odpovede každého poskytovateľa umelej inteligencie; vyhľadávacie dopyty a odkazy na zdroje. Všetko sa uchováva šifrovane pomocou kľúča určeného pre váš účet | Vy a modely umelej inteligencie pracujúce na vašej otázke |
| **Podpora** | Správy, ktoré si vymieňate s asistentom podpory alebo s osobou, uložené šifrovane; použitý jazyk; či ste asistentovi dovolili vidieť stav (nikdy nie obsah) vašich debát; vaše hodnotenia. Ak správa aktivuje opatrenia proti zneužitiu, uchováme haš správy a haš IP adresy, z ktorej prišla | Vy |
| **Záznamy o prijatí a súhlase** | Verzia a haš obsahu podmienok, ktoré ste prijali, a zásad, ktoré vám boli zobrazené; čas; použitá obrazovka a mechanizmus; váš jazyk; vaša IP adresa a user-agent v danom okamihu; každý súhlas, ktorý ste udelili alebo odvolali, a čas tejto udalosti | Váš prehliadač pri registrácii a pri každej zmene voľby |
| **Platby** [pending — once a paid plan exists] | Program, cena, fakturačné obdobie, referencie transakcií, doklady o mieste zdanenia. Údaje o karte uchováva náš poskytovateľ platobných služieb, nikdy nie my | Vy a poskytovateľ platobných služieb |
| **Osoby, ktoré nie sú našimi používateľmi** | Osobné údaje o iných osobách, ktoré uvediete v otázke alebo ktoré systém vytvorí pri odpovedi. Žiadame vás, aby ste to nerobili; časť 11 vysvetľuje, čo urobíme, ak sa tak napriek tomu stane | Vy, nepriamo |

**Nezhromažďujeme** analytické ani telemetrické údaje o používaní produktu a na tento účel nenastavujeme súbory cookie. Ak sa to zmení, najskôr zmeníme tieto zásady a Zásady používania súborov cookie a požiadame vás o rozhodnutie.

## 3. Citlivé informácie

Systém na debaty podnecuje otázky o politike, náboženstve, zdraví, sexualite a presvedčení. Podľa článku 9 GDPR ide o osobitné kategórie údajov, ktoré sa môžu objaviť vo vašich otázkach bez ohľadu na to, či ich zamýšľame zhromažďovať.

**O vás.** Pri registrácii udeľujete samostatnou vetou výslovný súhlas so spracúvaním citlivých informácií, ktoré sa rozhodnete uviesť vo vlastných otázkach, na účely uskutočnenia vašich debát. Súhlas môžete kedykoľvek odvolať tým, že takéto informácie neuvediete, alebo odstránením debaty. Informácie, ktoré o sebe zverejníte, sú údaje, ktoré ste sa rozhodli sprístupniť verejnosti.

**O iných osobách.** Žiadna právna podmienka nám neumožňuje spracúvať citlivé údaje o tretej osobe, ktorú uvediete v otázke, a takú podmienku nemá ani žiadny z našich poskytovateľov umelej inteligencie. Preto to podmienky zakazujú, preto minimalizujeme odosielané údaje a preto takýto obsah na požiadanie rýchlo odstránime — pozri časť 11.

**Informácie o zdraví.** Niektoré krajiny upravujú údaje súvisiace so zdravím vrátane odvodených záverov osobitnými zákonmi. Ak žijete v [the State of Washington], uplatňuje sa samostatné [Consumer Health Data Privacy Notice].

## 4. Prečo vaše údaje používame a na akom základe

Každý účel má jeden právny základ podľa článku 6 ods. 1 GDPR a údaje zhromaždené na jeden účel nepoužívame na iný.

| Účel | Údaje | Základ |
| --- | --- | --- |
| Vytvorenie a prevádzkovanie účtu, vaše overenie, uskutočnenie a uchovávanie debát, aby ste ich mohli znova otvoriť a prehrať | Účet, relácie, obsah debaty | **Zmluva** — Art. 6(1)(b) |
| Odoslanie vašej otázky a vyjadrení systému poskytovateľom umelej inteligencie na vytvorenie debaty | Obsah debaty | **Zmluva** — Art. 6(1)(b) |
| Zabezpečenie služby, odhaľovanie zneužitia, umožnenie rozpoznať prihlásenie, ktoré ste nevykonali, a vedenie auditného záznamu | Relácie, bezpečnostný auditný záznam, haše z podpory súvisiace so zneužitím | **Oprávnené záujmy** — Art. 6(1)(f): naše aj vaše záujmy na bezpečnej službe. Môžete namietať; pozri časť 10 |
| Preukázanie, že ste prijali podmienky a udelili alebo odvolali súhlas | Záznamy o prijatí a súhlase | **Zákonná povinnosť** — Art. 6(1)(c), naša povinnosť preukázať súhlas podľa Art. 7(1) — a oprávnené záujmy na preukázaní zmluvy |
| Vybavovanie žiadostí o podporu | Podpora | **Zmluva** — Art. 6(1)(b) |
| Spracúvanie citlivých informácií, ktoré o sebe uvediete | Obsah debaty | **Výslovný súhlas** — Art. 9(2)(a), udelený samostatne pri registrácii |
| Zverejnenie debaty, ktorú sa rozhodnete zverejniť | Obsah debaty, pseudonym | **Zmluva** — Art. 6(1)(b), na váš pokyn; v prípade citlivých údajov o vás Art. 9(2)(e) — údaje, ktoré ste preukázateľne zverejnili |
| Zasielanie noviniek o produkte | E-mailová adresa | **Súhlas** — Art. 6(1)(a), nezačiarknuté políčko; môžete ho kedykoľvek odvolať v ktoromkoľvek e-maile alebo v Nastaveniach |
| Plnenie daňových, účtovných a zákonných povinností [pending paid plans] | Platby, záznamy o prijatí | **Zákonná povinnosť** — Art. 6(1)(c) |
| Vybavovanie právnych žiadostí a hlásení nezákonného obsahu a plnenie našich povinností poskytovateľa hostingu | Všetky údaje relevantné pre žiadosť | **Zákonná povinnosť** — Art. 6(1)(c) — a oprávnené záujmy |

Nevytvárame váš profil, nepoužívame vaše údaje na reklamu a nepredávame ich. Váš obsah nepoužívame na trénovanie modelov a nedovoľujeme to ani našim poskytovateľom — pozri časť 5.

## 5. Poskytovatelia umelej inteligencie a medzinárodné prenosy

**Čo sa odosiela.** Na uskutočnenie debaty odosielame text jednému alebo viacerým externým poskytovateľom umelej inteligencie: vašu otázku, vami nastavené usmerňujúce poznámky a vyjadrenia, ktoré systém vytvára počas vývoja debaty. Poskytovateľ preto vidí text odvodený od toho, čo ste napísali, a založený na tom. Nikdy nedostane vašu e-mailovú adresu, identifikátory účtu alebo relácie, IP adresu ani platobné údaje.

**Ktorí poskytovatelia.** Sú uvedení v našom **Registri poskytovateľov umelej inteligencie** na [dezbatere.ro/providers], ktorý je súčasťou týchto zásad. Pri každom poskytovateľovi register uvádza jeho právnickú osobu a krajinu usadenia; čo dostáva a na aký účel; krajiny alebo regióny, v ktorých údaje spracúva; jeho podmienky uchovávania a či je pre koncový bod a funkcie, ktoré používame, aktívne nulové uchovávanie údajov; či môže podľa našej zmluvy používať vstupy na trénovanie; mechanizmus prenosu, na ktorý sa spoliehame; a dátum posledného overenia každej položky. Poskytovatelia sa môžu meniť; register má jednotlivé verzie a zmena sa v ňom zaznamená.

**Trénovanie a uchovávanie sú rozdielne veci.** Naše zmluvy s poskytovateľmi vylučujú použitie vášho obsahu na trénovanie alebo zlepšovanie ich modelov. [Publish only once verified per route.] Niektorí poskytovatelia uchovávajú zadania a odpovede obmedzený čas z dôvodov bezpečnosti, predchádzania zneužitiu alebo vlastných zákonných povinností; register uvádza dobu a dôvod. Ak je aktívne nulové uchovávanie údajov, register to uvádza spolu s príslušnými funkciami. Nebudeme tvrdiť, že sa obsah neuchováva, ak to nie je pravda.

**Prenosy mimo EHP.** Poskytovatelia usadení v Spojených štátoch dostávajú údaje na základe jedného z mechanizmov podľa kapitoly V GDPR: rámca ochrany osobných údajov medzi EÚ a USA, ak je konkrétna zmluvná právnická osoba certifikovaná pre tieto údaje, alebo štandardných zmluvných doložiek Európskej komisie (modul dva, prevádzkovateľ spracovateľovi) podporených posúdením rizika prenosu a doplnkovými opatreniami. Register uvádza mechanizmus pre každého poskytovateľa. Kópiu doložiek, o ktoré sa opierame, môžete získať napísaním na privacy@dezbatere.ro. Ak sa mechanizmus, o ktorý sa opierame, zruší, pred pokračovaním prenosov prejdeme na iný a informujeme vás.

**Iní príjemcovia.** Náš poskytovateľ hostingu [Hetzner, Germany — region …]; náš poskytovateľ distribúcie obsahu a prenosu [Cloudflare]; náš e-mailový sprostredkovateľ […]; [our payment provider, once a paid plan exists]. Každý koná podľa našich zdokumentovaných pokynov na základe zmluvy o spracúvaní údajov so zárukami vyžadovanými článkom 28 a každý je uvedený v registri spolu s miestom a mechanizmom prenosu. Žiadnemu sprostredkovateľovi nedovoľujeme používať vaše údaje na vlastné účely. Ak by tak poskytovateľ konal, bol by samostatným prevádzkovateľom a vaše údaje mu neposielame.

**Orgány verejnej moci.** Osobné údaje poskytujeme súdom, regulačným orgánom alebo orgánom presadzovania práva, ak to vyžaduje zákon, a informujeme vás o tom, pokiaľ nám to zákon nezakazuje.

## 6. Zverejňovanie a viditeľnosť

Debaty sú súkromné, kým ich nezverejníte. Zverejnenie je úmyselný krok, ktorý sa potvrdzuje samostatne. Zverejnená debata zobrazuje váš **pseudonym**, otázku v znení, v akom ste ju napísali, strom argumentov, hodnotenia, verdikt a pásmo spoľahlivosti a obsahuje viditeľné označenie, že obsah vytvorila umelá inteligencia. Nikdy nezobrazuje vašu e-mailovú adresu, záznamy relácií ani históriu účtu. [Published debates are / are not] indexované vyhľadávačmi [unless you choose].

Zrušením zverejnenia sa debata odstráni zo služby DebateAI a zničí sa kľúč k našej verejnej kópii. Kópie, ktoré už vytvorili čitatelia, vyhľadávače alebo archívy, sú mimo našej kontroly a nemôžeme ich stiahnuť späť.

Keď odstránite účet, bez zbytočného odkladu a najneskôr do 30 dní odstránime z verejného prístupu každú debatu, ktorú ste zverejnili, pokiaľ nám zákon neukladá uchovať konkrétnu položku. [Option B — a product change; see the Terms, section 9.]

## 7. Ako dlho údaje uchovávame

| Údaje | Ako dlho | Potom |
| --- | --- | --- |
| Účet | Počas existencie účtu a 7-dňová ochranná lehota po žiadosti o jeho odstránenie | Kľúče sa zničia; záznam sa vymaže |
| Záznamy relácií | 14 dní od posledného použitia alebo 90 dní od vytvorenia, podľa toho, čo nastane skôr | Vymažú sa |
| Odkazy na overenie e-mailu | 24 hodín | Vymažú sa |
| Rizikové signály prihlásenia a obnovenia | 90 dní, vynútené databázou | Odstránia sa |
| Bezpečnostný auditný záznam | Počas životnosti služby | Je nemenný; IP adresa a user-agent sú jednosmerné súhrny a nemožno ich spätne prečítať |
| Obsah debaty (súkromný) | Počas existencie účtu | Pri odstránení účtu sa zničia kľúče, čím sa obsah stane nečitateľným |
| Obsah debaty (zverejnený) | Počas zverejnenia a existencie účtu | Pri zrušení zverejnenia alebo odstránení účtu sa stiahne z verejného prístupu; kľúče sa zničia |
| Záznamy odpovedí poskytovateľa a odkazy na vyhľadávanie | Rovnako dlho ako debata, ku ktorej patria | Rovnako |
| Konverzácie a prípady podpory | [Until closed plus 12 months] | Kľúče sa zničia |
| Záznamy o prijatí a súhlase | Počas existencie účtu a ďalších 6 rokov — najdlhšia premlčacia lehota, ktorá sa na nás vzťahuje | Vymažú sa |
| Záznamy o platbách [pending] | 10 rokov podľa rumunských účtovných predpisov | Vymažú sa |
| Zálohy [pending] | [… days] po vymazaní živej kópie | Prepíšu sa |

**Čo vymazanie skutočne spôsobí.** Vaše debaty a údaje účtu sú šifrované pomocou kľúčov určených pre váš účet a jednotlivé debaty. Odstránením účtu sa tieto kľúče zničia, takže my ani nikto iný už nedokáže šifrované záznamy prečítať, a záznam vášho účtu vymažeme. Označujeme to ako vymazanie, pretože taký je jeho účinok, a máme preň zdokumentované posúdenie; ak chcete vedieť viac, opýtajte sa. Mali by ste vedieť tri veci: bezpečnostný auditný záznam je nemenný a nevymazáva sa, neobsahuje však žiadne vaše čitateľné identifikátory; malý počet starších debát vznikol pred našou súčasnou schémou šifrovania, a ak sa to týka vášho účtu, oznámime vám, čo odstránenie účtu znamená pre tieto debaty; a kópie údajov, ktoré už boli odoslané poskytovateľovi umelej inteligencie, sa riadia podmienkami uchovávania daného poskytovateľa uvedenými v registri, nie naším vymazaním.

&#91;The support retention period and the backup line describe policies to implement; the system currently keeps support records indefinitely and has no backup-expiry mechanism. Do not publish figures that are not enforced.\]

## 8. Automatizované rozhodnutia a profilovanie

Hodnotenia, značky podmienok a verdikty v debate sú automatizovaným hodnotením **argumentov, nie osôb**. Nemajú voči vám právne účinky ani vás podobne významne neovplyvňujú. Neprijímame o vás žiadne rozhodnutie založené výlučne na automatizovanom spracúvaní, ktoré by malo právne alebo podobne významné účinky, a nevytvárame váš profil.

Ak by sme niekedy automatizovali rozhodnutie o vašom účte — jeho pozastavenie alebo odmietnutie zverejniť debatu — pred nadobudnutím účinnosti takého rozhodnutia alebo na vašu žiadosť ho preskúma osoba, budete môcť vyjadriť svoj názor a rozhodnutie napadnúť. Postup opisujú podmienky.

## 9. Bezpečnosť a postup pri problémoch

Heslá sa hašujú pomocou Argon2id. Dvojfaktorové overovanie je povinné. Vaša e-mailová adresa, vaše debaty, konverzácie s podporou a autentifikačné tajné údaje sa ukladajú v šifrovanej podobe pomocou kľúčov určených pre váš účet a kľúče zverejnených debát sa uchovávajú oddelene od kľúčov súkromných debát. Prístup k produkčným údajom sa zaznamenáva. IP adresy a údaje o prehliadači sa v našom bezpečnostnom zázname uchovávajú iba ako jednosmerné súhrny.

Ak dôjde k porušeniu ochrany osobných údajov, oznámime ho rumunskému dozornému orgánu do 72 hodín, ak to vyžaduje zákon, a informujeme vás priamo a bez zbytočného odkladu, ak je pravdepodobné, že porušenie spôsobí vysoké riziko pre vaše práva a slobody. Príloha B uvádza pravidlá oznamovania platné v ostatných regiónoch, v ktorých službu poskytujeme.

## 10. Vaše práva a spôsob ich uplatnenia

Ktorékoľvek z týchto práv môžete bezplatne uplatniť napísaním na **privacy@dezbatere.ro** alebo cez **Nastavenia → Súkromie**, ak je tam príslušný ovládací prvok. Odpovieme do jedného mesiaca; ak je žiadosť zložitá, môžeme lehotu predĺžiť najviac o ďalšie dva mesiace a vysvetlíme vám dôvod. Môžeme vás požiadať, aby ste prostredníctvom účtu potvrdili svoju totožnosť.

| Právo | Čo tu znamená |
| --- | --- |
| **Prístup** (Art. 15) | Kópia osobných údajov, ktoré o vás uchovávame, a tieto informácie. [Pending: a JSON export from Settings. Until it exists, we compile the copy manually within the month.] |
| **Oprava** (Art. 16) | V Nastaveniach môžete opraviť svoj e-mail alebo e-mail na obnovenie. Váš pseudonym nemožno zmeniť z dôvodov uvedených v podmienkach; účet môžete odstrániť a otvoriť si nový |
| **Vymazanie** (Art. 17) | Súkromnú debatu môžete kedykoľvek odstrániť na jej stránke. Účet môžete odstrániť v Nastaveniach; časť 7 presne vysvetľuje účinky. Môžete nás požiadať o odstránenie zverejnenej debaty obsahujúcej vaše údaje bez ohľadu na to, či ste jej autorom |
| **Obmedzenie** (Art. 18) | Môžete nás požiadať, aby sme prestali spracúvať konkrétne údaje, kým sa nevyrieši spor o ne |
| **Námietka** (Art. 21) | Môžete namietať proti spracúvaniu založenému na oprávnených záujmoch — bezpečnostnému a auditnému spracúvaniu podľa časti 4 — a my ho zastavíme, ak nepreukážeme závažné dôvody. Proti marketingu môžete namietať kedykoľvek a my ho zastavíme |
| **Prenosnosť** (Art. 20) | Vaše debaty a údaje účtu v bežne používanom, strojovo čitateľnom formáte. [Pending: same export as Access.] Neosobný obsah, ktorý ste vytvorili, napríklad vaše otázky, vám na požiadanie vrátime po skončení zmluvy |
| **Odvolanie súhlasu** (Art. 7(3)) | Marketingový súhlas môžete odvolať v ktoromkoľvek e-maile alebo v Nastaveniach; súhlas s citlivými údajmi odvoláte tak, že také údaje nebudete uvádzať, alebo odstránením debaty. Odvolanie nemá vplyv na spracúvanie, ktoré sa už uskutočnilo |
| **Sťažnosť** | Rumunskému dozornému orgánu **ANSPDCP**, B-dul G-ral Gheorghe Magheru 28–30, Bukurešť, <anspdcp@dataprotection.ro>, alebo orgánu v krajine, v ktorej žijete. Uprednostňujeme, aby ste sa najskôr obrátili na nás |

Za žiadosť nikdy neúčtujeme poplatok a nikdy s vami pre jej podanie nezaobchádzame menej priaznivo.

## 11. Osoby uvedené v debatách, ktoré nie sú našimi používateľmi

Ak niekto položí službe DebateAI otázku, v ktorej vás uvedie, môžeme uchovávať vaše osobné údaje, hoci ste službu nikdy nepoužili. Podmienky používateľom takéto konanie zakazujú a minimalizujeme údaje odosielané poskytovateľom umelej inteligencie, napriek tomu k tomu dochádza.

Táto časť predstavuje oznámenie, ktoré vám musíme poskytnúť podľa článku 14 GDPR. Údaje zahŕňajú všetko, čo používateľ napísal, a všetko, čo systém vytvoril v odpovedi; zdrojom je daný používateľ; účely a právny základ sú uvedené v časti 4; príjemcami sú poskytovatelia umelej inteligencie v registri; doba uchovávania sa riadi časťou 7. Máte všetky práva uvedené v časti 10 a predovšetkým nás môžete požiadať o odstránenie zverejnenej alebo súkromnej debaty, ktorá obsahuje vaše údaje, a o oznámenie údajov, ktoré uchovávame. Nepotrebujete na to účet. Napíšte na **privacy@dezbatere.ro** alebo použite ovládací prvok **Nahlásiť** pri ktorejkoľvek zverejnenej debate a odôvodnené žiadosti vybavíme bez zbytočného odkladu. Keď k tomu dôjde, nemôžeme vás informovať individuálne, pretože nevieme, kto ste ani ako vás kontaktovať; namiesto toho zverejňujeme toto oznámenie a ponúkame možnosť odstránenia.

To isté platí pre citlivé informácie o vás — politické názory, zdravie, náboženstvo — uvedené v otázke inej osoby. Po vznesení námietky nám žiadna právna podmienka neumožňuje pokračovať v ich spracúvaní a nebudeme v ňom pokračovať.

## 12. Deti

DebateAI je určená dospelým. Pri registrácii potvrdzujete, že máte aspoň 18 rokov, a vedome nespracúvame údaje žiadnej osoby mladšej ako 18 rokov. Ak zistíme, že účet patrí osobe mladšej ako 18 rokov, odstránime ho a údaje vymažeme spôsobom opísaným v časti 7. Niektoré krajiny považujú potvrdenie za nedostatočné alebo vyžadujú viac; príloha B uvádza pravidlá platné v daných krajinách a podmienky vysvetľujú náš postup.

## 13. Súbory cookie

Nastavujeme dva súbory cookie, pričom oba sú nevyhnutné: jeden zachováva vaše prihlásenie a druhý chráni formuláre pred falšovaním. Nenastavujeme analytické, reklamné ani sledovacie súbory cookie. **Zásady používania súborov cookie** na [dezbatere.ro/cookies] uvádzajú tieto súbory a dobu ich platnosti, vysvetľujú uchovávanie vašej voľby a zmenia sa pred pridaním akéhokoľvek ďalšieho súboru cookie. Ak právo vášho regiónu upravuje niektoré súbory cookie odlišne — napríklad pravidlo Spojeného kráľovstva o odmietnutí analytiky — uvádzajú to Zásady používania súborov cookie.

## 14. Zmeny týchto zásad

Keď tieto zásady zmeníme, zverejníme novú verziu so zhrnutím zmien a novým dátumom účinnosti a predchádzajúce verzie ponecháme na [dezbatere.ro/privacy/versions]. O zmene, ktorá pridáva nový účel alebo nového príjemcu, vás informujeme e-mailom aj v produkte pred začatím nového spracúvania a poskytneme vám čas na vznesenie námietky. Ak nový účel závisí od vášho súhlasu — napríklad ak by sme niekedy chceli obsah používať na zlepšovanie modelov — požiadame vás o tento súhlas samostatne a konkrétne; prijatie aktualizovaných podmienok nikdy nepovažujeme za súhlas s novým spracúvaním. Pri spresneniach, ktoré nemenia naše postupy, jednoducho zverejníme novú verziu.

Tieto zásady boli naposledy aktualizované [date]. Verzia 3.0 nahradila verziu 2.1, ktorá opisovala údaje o reláciách, doby uchovávania, analytiku, export a účinky odstránenia účtu na zverejnené debaty spôsobom, ktorý už nezodpovedal službe.

## Annex B — Regionálne podmienky ochrany osobných údajov

Každá položka sa uplatňuje iba vtedy, ak je jej región uvedený v časti 2 podmienok, a uvádza iba odchýlky od hlavnej časti týchto zásad.

### B.1 Európska únia a Európsky hospodársky priestor

Hlavná časť týchto zásad je určená vám. Naším dozorným orgánom je rumunský orgán **ANSPDCP**; sťažnosť môžete podať aj orgánu v krajine, v ktorej žijete. Používatelia v Rumunsku: tieto zásady sú dostupné v rumunčine na [URL].

### B.2 Spojené kráľovstvo *(iba ak je uvedené)*

Naším zástupcom v Spojenom kráľovstve podľa článku 27 UK GDPR je **[name, address, email]**; môžete ho kontaktovať vo všetkých záležitostiach týkajúcich sa týchto zásad. Dozorným orgánom je **Úrad komisára pre informácie (ICO)**, [ico.org.uk](https://ico.org.uk). Sťažnosť nám môžete podať prostredníctvom formulára na [URL] a jej prijatie potvrdíme do 30 dní. Prenosy vašich údajov zo Spojeného kráľovstva poskytovateľom umelej inteligencie v Spojených štátoch sa zakladajú na [the UK Extension to the EU–US Data Privacy Framework, where the provider is certified / the UK International Data Transfer Addendum to the EU standard contractual clauses] a podporuje ich posúdenie rizika prenosu. Ak by sme niekedy nastavili analytické súbory cookie, v Spojenom kráľovstve by podliehali možnosti odmietnutia namiesto súhlasu; v súčasnosti ich nenastavujeme. Ak máte menej ako 18 rokov a napriek nášmu vekovému pravidlu získate prístup k službe, na naše zaobchádzanie s vašimi údajmi sa vzťahujú štandardy kódexu ICO pre deti.

### B.3 Spojené štáty *(iba ak sú uvedené)*

**Oznámenie pri zhromažďovaní.** Tabuľka v časti 2 uvádza každú kategóriu osobných informácií, ktoré zhromažďujeme, ich účel a dobu uchovávania (časť 7). Tieto kategórie *citlivých* osobných informácií zhromažďujeme iba vtedy, keď ich uvediete vo vlastných otázkach: [health, religious or philosophical beliefs, sexual orientation, union membership, political views], a používame ich iba na uskutočnenie vašich debát. **Osobné informácie nepredávame ani nezdieľame a neurobili sme tak ani počas predchádzajúcich dvanástich mesiacov.** Citlivé osobné informácie nepoužívame na žiadny účel nad rámec poskytovania požadovanej služby. **Signály preferencie odmietnutia:** signály Global Privacy Control rešpektujeme ako žiadosť o odmietnutie predaja alebo zdieľania, ktoré v žiadnom prípade nevykonávame. **Vaše práva:** vedieť, vymazať, opraviť, odmietnuť, obmedziť používanie citlivých osobných informácií a nebyť diskriminovaný za ich uplatnenie; žiadosť podajte na privacy@dezbatere.ro alebo cez [toll-free number / form]. **Finančné stimuly:** neposkytujeme žiadne; bezplatné a platené programy sa nelíšia v spôsobe zaobchádzania s vašimi údajmi. **Uchovávanie** je uvedené v časti 7. Toto oznámenie sa aktualizuje aspoň každých dvanásť mesiacov; naposledy bolo aktualizované [date].

*Washington:* naše **Oznámenie o ochrane údajov o zdraví spotrebiteľov** na [URL] je samostatný dokument vzťahujúci sa na všetky informácie súvisiace so zdravím vrátane odvodených záverov. *Texas a Nebraska:* citlivé osobné údaje nepredávame; ak by sa to zmenilo, najprv by sme získali váš súhlas [statutory language]. *Colorado, Connecticut, Virgínia a ďalšie štáty s komplexnými zákonmi o ochrane súkromia:* uvedené práva sa na vás vzťahujú, ak sa na nás vzťahuje príslušný zákon; proti zamietnutiu žiadosti sa odvolajte napísaním na [appeals@dezbatere.ro].

### B.4 Kanada a Quebec *(iba ak sú uvedené)*

Našou zodpovednou osobou pre ochranu osobných údajov je **[name, email]**. Naďalej zodpovedáme za osobné informácie, ktoré prenášame poskytovateľom umelej inteligencie mimo Kanady, a zmluvami vyžadujeme porovnateľnú ochranu; títo poskytovatelia môžu podliehať zákonom krajín, v ktorých pôsobia, vrátane zákonného prístupu orgánov. Marketingové e-maily zasielame iba s vaším výslovným súhlasom podľa CASL. **Quebec:** pred oznámením osobných informácií mimo Quebecu vykonáme posúdenie vplyvu na súkromie; nastavenia zachovávajúce súkromie vašich debát sú predvolene zapnuté; môžete nás požiadať o vyradenie z indexu alebo zastavenie šírenia vašich osobných informácií; môžete požiadať o svoje údaje v štruktúrovanom, bežne používanom formáte; časť 8 opisuje naše automatizované spracúvanie.

### B.5 Austrália a Nový Zéland *(iba ak sú uvedené)*

**Austrália.** Zahraničnými príjemcami vašich osobných informácií sú poskytovatelia umelej inteligencie a sprostredkovatelia uvedení v registri so sídlom v [the United States and the European Union]; prijímame primerané opatrenia, aby s nimi zaobchádzali v súlade s austrálskymi zásadami ochrany súkromia. **Automatizované rozhodnutia:** od 10. decembra 2026 tieto zásady identifikujú druhy rozhodnutí prijímaných počítačovými programami, ktoré významne ovplyvňujú vaše práva alebo záujmy — žiadne také nie sú; hodnotenia a verdikty sa týkajú argumentov, nie vás — a osobné informácie, ktoré sa pri nich používajú. Sťažnosti možno podať **Úradu austrálskeho komisára pre informácie**. **Nový Zéland.** Našou zodpovednou osobou pre ochranu osobných údajov je [name]. Ak o vás zhromažďujeme osobné informácie nepriamo — pretože ich iný používateľ uviedol v otázke — tieto zásady a časť 11 predstavujú oznámenie, ktoré vám poskytujeme. Poskytovateľom umelej inteligencie uvedeným v registri ich poskytujeme ako našim zástupcom na základe zmlúv vyžadujúcich porovnateľné záruky. Sťažnosti možno podať **Úradu komisára pre ochranu súkromia**.

### B.6 Latinská Amerika *(príloha v španielčine; iba ak je uvedená)*

&#91;Published in Spanish.\] Súhlas je základom spracúvania, ak spracúvanie nie je nevyhnutné na plnenie zmluvy. Práva ARCO — prístup, oprava, zrušenie, námietka — možno uplatniť na privacy@dezbatere.ro s odpoveďami v lehote [per country]. *Mexiko:* úplné *aviso de privacidad* s povinnými prvkami je na [URL]. *Argentína:* [AAIP mandatory legend]; údaje sú registrované u […]. *Kolumbia:* naša *política de tratamiento de datos* je na [URL]; orgánom je SIC. *Čile* (od 1. decembra 2026): kontakt agentúry je […]; časť 8 vysvetľuje naše automatizované spracúvanie.

### B.7 Záliv — SAE a Saudská Arábia *(iba ak sú uvedené)*

Ak vaše údaje spracúvame na iné účely než poskytovanie služby, opierame sa o váš súhlas, ktorý môžete odvolať. Vaše údaje opúšťajú [UAE / Kingdom of Saudi Arabia] a spracúvajú sa v Európskej únii a Spojených štátoch podľa [SDAIA standard contractual clauses / the mechanism in the Register]. Marketingové správy posielame iba s vaším súhlasom. Vo svojich otázkach neuvádzajte citlivé osobné údaje.

### B.8 Ázia a Tichomorie *(iba riadky pre uvedené regióny)*

*Singapur:* našou zodpovednou osobou pre ochranu osobných údajov je **[name, email]**; prenosy sa zakladajú na zmluvných povinnostiach poskytujúcich ochranu porovnateľnú s PDPA; porušenia podliehajúce oznámeniu hlásime PDPC do 3 dní. *Japonsko:* vaše osobné informácie používame na účely uvedené v časti 4 a na žiadne iné; váš obsah sa prenáša poskytovateľom v [named countries — e.g. the United States], ktorých režimy a záruky ochrany súkromia sú opísané v registri, a pri registrácii s tým súhlasíte. *Južná Kórea:* našou zodpovednou osobou pre ochranu osobných údajov je **[name]**; položky, miesto určenia, čas, príjemca, účel a doba uchovávania zahraničných prenosov sú uvedené v registri; politické názory vo vašich otázkach sú citlivými informáciami a spracúvame ich iba na uskutočnenie vašich debát; súhlasy s voliteľným spracúvaním sa získavajú samostatne. *India* (keď sa začnú uplatňovať pravidlá DPDP): platí samostatné oznámenie o súhlase na [URL]; žiadosti sa vybavujú do 90 dní; používatelia mladší ako 18 rokov potrebujú overiteľný súhlas rodiča. *Filipíny:* našou zodpovednou osobou pre ochranu osobných údajov je [name]; sťažnosti možno podať Národnej komisii pre ochranu súkromia; časť 8 opisuje automatizované spracúvanie. *Thajsko:* naším zástupcom je [name] [if appointed].

### B.9 Vyhradené

Turecko, Brazília a Indonézia vyžadujú oznámenie v miestnom jazyku, zástupcu alebo registráciu a podania; podmienky pre tieto krajiny tu nie sú vypracované. V Číne, Vietname a Rusku sa služba neposkytuje.
