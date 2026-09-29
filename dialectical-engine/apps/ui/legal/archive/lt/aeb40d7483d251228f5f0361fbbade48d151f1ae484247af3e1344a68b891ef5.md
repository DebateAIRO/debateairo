# DebateAI — Privatumo politika

<!-- legal-chrome
summaryTitle: Trumpai
eyebrow: PRIVATUMO POLITIKA · v3.0 · ĮSIGALIOJA [DATE]
title: Ką saugome ir kodėl
lede: Jūsų teisės ir mūsų pareigos pagal GDPR (EU) 2016/679, paaiškintos paprastai. Keturiolika skyrių ir B priedas — slinkite iki pabaigos.
endMarker: POLITIKOS PABAIGA · GDPR (EU) 2016/679 · v3.0
bodyLabel: Privatumo politikos tekstas
annexTitle: B priedas — Regioninės privatumo sąlygos
jumps:
01 DUOMENŲ VALDYTOJAS
02 KĄ RENKAME
04 TEISINIS PAGRINDAS
05 MODELIAI IR PERDAVIMAI
06 PASKELBIMAS
07 SAUGOJIMO TERMINAI
10 JŪSŲ TEISĖS PAGAL GDPR
13 SLAPUKAI
-->

2026-09-21 · @Someone

**v3.0 projektas teisininkų peržiūrai — pakeičia išleistą v2.1 (`apps/ui/lib/privacyPolicy.ts`). Tai nėra teisinė konsultacija.** Ši versija parengta pagal tai, kaip kodas faktiškai veikia, ir joje ištaisyti penki v2.1 teiginiai, kuriems kodas prieštaravo: apie seanso duomenis, saugojimo laikotarpius, analitiką, eksportą ir tai, kas nutinka paskelbtiems debatams ištrynus paskyrą. Laužtiniuose skliaustuose pažymėta tai, ką galite užpildyti tik jūs; \[pending\] žymi politikoje aprašytą, bet dar nesukurtą funkciją, kuri turi veikti prieš paskelbiant politiką.

**Version 3.0 · Effective \[date\] · Ankstesnės versijos adresu dezbatere.ro/privacy/versions · Duomenų valdytojas: DebateAIRO S.R.L., Bukareštas**

**In short.** Renkame tai, ko reikia paskyrai, ir tai, ką nusprendžiate įvesti. Jūsų klausimai perduodami mūsų Registre išvardytiems DI paslaugų teikėjams; jie nenaudojami modeliams mokyti. Debatai yra privatūs, nebent juos paskelbiate. Ištrynus paskyrą sunaikinami jūsų duomenų raktai, o paskelbti debatai pašalinami. Su mumis galite susisiekti adresu privacy@dezbatere.ro, o debatuose paminėti asmenys gali prašyti pašalinti duomenis ir neturėdami paskyros.

## 1. Kas atsako už jūsų duomenis

Jūsų asmens duomenų valdytojas yra **DebateAIRO S.R.L.**, \[address\], Bukareštas, Rumunija, Prekybos registras \[J40/…\], CUI \[…\]. Visais su šia politika susijusiais klausimais rašykite **privacy@dezbatere.ro**; atsakome per vieną mėnesį. Duomenų apsaugos pareigūno nepaskyrėme, nes teisės aktai to nereikalauja; šį adresą prižiūri \[role\]. Jei konkrečioje šalyje esame paskyrę atstovą ar privatumo pareigūną, jis nurodytas B priede.

## 2. Ką renkame ir iš kur tai gauname

Renkame tik tai, ko reikia paskyrai veikti, ką nusprendžiate mums pateikti ir ką privalome saugoti pagal įstatymus.

| Kategorija | Kokie būtent duomenys | Šaltinis |
| --- | --- | --- |
| **Paskyra** | El. pašto adresas ir atkūrimo el. pašto adresas (saugomi užšifruoti, su raktiniu indeksu, kad galėtume rasti paskyrą neskaitydami adreso); slaptažodis (saugomas kaip maiša, niekada atviruoju tekstu); jūsų dviejų veiksnių autentifikavimo paslaptis (užšifruota); dešimt atkūrimo kodų (saugomi kaip maišos); jūsų slapyvardis; laikas, kada patvirtinote, kad jums yra 18 metų ar daugiau | Jūs, registracijos metu |
| **Seansai ir saugumas** | Seanso prieigos rakto maiša; jūsų naršyklės naudotojo agento eilutės raktinė maiša, naudojama pastebėti, kai seansas perkeliamas į kitą naršyklę; sukūrimo, paskutinio naudojimo ir galiojimo pabaigos laiko žymos. Su seansu **nesaugome** jūsų IP adreso, įrenginio pavadinimo ar naršyklės duomenų, o Nustatymuose matomame seansų sąraše rodomos tik laiko žymos | Jūsų naršyklė |
| **Saugumo audito žurnalas** | Žurnalas, į kurį tik pridedami su saugumu susijusių įvykių įrašai — registracija, patvirtinimas, bandymai prisijungti, atkūrimas, paskelbimas, ištrynimas. Kiekvieno įvykio IP adresas ir naudotojo agentas saugomi tik kaip vienkryptės raktinės santraukos (Argon2id), todėl jų negalima atkurti, tačiau per tam tikrą laikotarpį galima palyginti. Prisijungimo ir atkūrimo rizikos signalai 90 dienų saugomi užšifruoti | Jūsų naršyklė kiekvieno įvykio metu |
| **Debatų turinys** | Jūsų įvestas klausimas; jūsų nustatytos valdymo pastabos; variklio sugeneruoti teiginiai, kritika, įrodymų nuorodos, įverčiai ir verdiktai; pažodinis kiekvieno DI paslaugų teikėjo atsakymo įrašas; paieškos užklausos ir šaltinių nuorodos. Visa tai saugoma užšifruota jūsų paskyrai būdingu raktu | Jūs ir su jūsų klausimu dirbantys DI modeliai |
| **Pagalba** | Žinutės, kuriomis keičiatės su pagalbos asistentu ar asmeniu, saugomos užšifruotos; vartota kalba; ar leidote asistentui matyti jūsų debatų būseną (niekada ne turinį); jūsų įvertinimai. Jei žinutė suaktyvina piktnaudžiavimo kontrolę, saugome žinutės maišą ir IP adreso, iš kurio ji gauta, maišą | Jūs |
| **Sutikimo su sąlygomis ir kitų sutikimų įrašai** | Sąlygų, su kuriomis sutikote, versija ir turinio maiša bei jums parodyta politika; laikas; naudotas ekranas ir būdas; jūsų kalba; tuo metu naudotas IP adresas ir naudotojo agentas; kiekvienas jūsų duotas ar atšauktas sutikimas ir jo laikas | Jūsų naršyklė registruojantis ir kaskart pakeitus pasirinkimą |
| **Mokėjimai** \[pending — once a paid plan exists\] | Planas, kaina, atsiskaitymo laikotarpis, operacijų nuorodos, mokesčių vietos įrodymai. Kortelės duomenis saugo mūsų mokėjimo paslaugų teikėjas, o ne mes | Jūs ir mokėjimo paslaugų teikėjas |
| **Asmenys, kurie nėra mūsų naudotojai** | Kitų asmenų duomenys, kuriuos įtraukiate į klausimą arba kuriuos variklis sugeneruoja į jį atsakydamas. Prašome to nedaryti; 11 skyriuje paaiškinta, ką darome, jei taip vis dėlto nutinka | Netiesiogiai iš jūsų |

**Nerenkame** analitikos ar telemetrijos duomenų apie tai, kaip naudojatės produktu, ir šiuo tikslu nenustatome slapukų. Jei tai pasikeis, pirmiausia bus pakeista ši politika ir Slapukų politika, o jūsų bus paprašyta pasirinkti.

## 3. Neskelbtina informacija

Debatų variklis skatina kelti klausimus apie politiką, religiją, sveikatą, seksualumą ir įsitikinimus. Pagal GDPR 9 straipsnį tai yra specialių kategorijų duomenys, kurie gali patekti į jūsų klausimus nepriklausomai nuo to, ar ketiname juos rinkti.

**Apie jus.** Registruodamiesi atskiru sakiniu duodate aiškų sutikimą, kad debatų vykdymo tikslu tvarkytume neskelbtiną informaciją, kurią nusprendžiate įtraukti į savo klausimus. Sutikimą galite bet kada atšaukti tokios informacijos neįtraukdami arba ištrindami debatus. Tai, ką paskelbiate apie save, yra duomenys, kuriuos patys nusprendėte paviešinti.

**Apie kitus asmenis.** Jokia teisinė sąlyga neleidžia mums tvarkyti neskelbtinų duomenų apie trečiąjį asmenį, kurį įvardijate klausime, ir tokios sąlygos neturi nė vienas mūsų DI paslaugų teikėjas. Todėl Sąlygos tai draudžia, todėl kuo labiau ribojame siunčiamus duomenis ir todėl gavę prašymą tokį turinį greitai pašaliname — žr. 11 skyrių.

**Sveikatos informacija.** Kai kurios šalys su sveikata susijusius duomenis, įskaitant išvadas, reglamentuoja specialiais įstatymais. Jei gyvenate \[the State of Washington\], taikomas atskiras \[Consumer Health Data Privacy Notice\].

## 4. Kodėl naudojame jūsų duomenis ir kokiu pagrindu

Kiekvienas tikslas turi vieną teisinį pagrindą pagal GDPR 6 straipsnio 1 dalį, o vienu tikslu surinktų duomenų pakartotinai nenaudojame kitu tikslu.

| Tikslas | Duomenys | Pagrindas |
| --- | --- | --- |
| Sukurti ir tvarkyti jūsų paskyrą, patvirtinti jūsų tapatybę, vykdyti ir saugoti debatus, kad galėtumėte juos vėl atverti ir pakartoti | Paskyra, seansai, debatų turinys | **Sutartis** — Art. 6(1)(b) |
| Siųsti jūsų klausimą ir variklio teiginius DI paslaugų teikėjams, kad būtų sugeneruoti debatai | Debatų turinys | **Sutartis** — Art. 6(1)(b) |
| Užtikrinti paslaugos saugumą, nustatyti piktnaudžiavimą, leisti jums pastebėti ne jūsų atliktą prisijungimą, tvarkyti audito žurnalą | Seansai, saugumo audito žurnalas, pagalbos piktnaudžiavimo maišos | **Teisėti interesai** — Art. 6(1)(f): mūsų ir jūsų interesas naudotis saugia paslauga. Galite nesutikti; žr. 10 skyrių |
| Įrodyti, kad sutikote su Sąlygomis ir davėte arba atšaukėte sutikimą | Sutikimo su sąlygomis ir kitų sutikimų įrašai | **Teisinė prievolė** — Art. 6(1)(c), mūsų pareiga įrodyti sutikimą pagal Art. 7(1), ir teisėtas interesas įrodyti sutarties sudarymą |
| Atsakyti į pagalbos prašymus | Pagalbos duomenys | **Sutartis** — Art. 6(1)(b) |
| Tvarkyti neskelbtiną informaciją, kurią apie save įtraukiate | Debatų turinys | **Aiškus sutikimas** — Art. 9(2)(a), duotas atskirai registruojantis |
| Paskelbti debatus, kuriuos nusprendžiate paskelbti | Debatų turinys, slapyvardis | **Sutartis** — Art. 6(1)(b), pagal jūsų nurodymą; jūsų neskelbtiniems duomenims — Art. 9(2)(e), duomenys, kuriuos akivaizdžiai paviešinote |
| Siųsti jums produkto naujienas | El. pašto adresas | **Sutikimas** — Art. 6(1)(a), iš anksto nepažymėtas langelis; bet kada atšaukite bet kuriame el. laiške arba Nustatymuose |
| Vykdyti mokestines, apskaitos ir teisines prievoles \[pending paid plans\] | Mokėjimai, sutikimo įrašai | **Teisinė prievolė** — Art. 6(1)(c) |
| Nagrinėti teisinius prašymus, pranešimus apie neteisėtą turinį ir vykdyti mūsų, kaip prieglobos paslaugos teikėjo, prievoles | Visi su prašymu susiję duomenys | **Teisinė prievolė** — Art. 6(1)(c) — ir teisėti interesai |

Mes jūsų neprofiliuojame, nenaudojame jūsų duomenų reklamai ir jų neparduodame. Nenaudojame jūsų turinio modeliams mokyti ir neleidžiame to daryti savo paslaugų teikėjams — žr. 5 skyrių.

## 5. DI paslaugų teikėjai ir tarptautinis duomenų perdavimas

**Kas siunčiama.** Debatams vykdyti tekstą siunčiame vienam ar keliems išoriniams DI paslaugų teikėjams: jūsų klausimą, jūsų nustatytas valdymo pastabas ir teiginius, kuriuos variklis sudaro plėtojantis debatams. Todėl paslaugų teikėjas mato iš jūsų įvesto teksto išvestą ir aplink jį sudarytą tekstą. Jis niekada negauna jūsų el. pašto adreso, paskyros ar seanso identifikatorių, IP adreso ar mokėjimo duomenų.

**Kurie paslaugų teikėjai.** Jie išvardyti mūsų **DI paslaugų teikėjų registre** adresu \[dezbatere.ro/providers\], kuris yra šios politikos dalis. Apie kiekvieną teikėją Registre nurodomas jo juridinis asmuo ir įsisteigimo šalis; ką ir kokiu tikslu jis gauna; šalys ar regionai, kuriuose jis tvarko duomenis; jo saugojimo sąlygos ir ar mūsų naudojamam prieigos taškui bei funkcijoms taikomas visiškas duomenų nesaugojimas; ar pagal sutartį jis gali naudoti įvestis mokymui; perdavimo mechanizmas, kuriuo remiamės; ir data, kada paskutinį kartą patikrinome kiekvieną įrašą. Teikėjai gali keistis; Registro versijos išsaugomos, o pakeitimas jame pažymimas.

**Mokymas ir saugojimas yra skirtingi dalykai.** Mūsų sutartys su paslaugų teikėjais draudžia naudoti jūsų turinį jų modeliams mokyti ar tobulinti. \[Publish only once verified per route.\] Kai kurie teikėjai ribotą laiką saugo užklausas ir atsakymus saugumo, piktnaudžiavimo prevencijos arba savo teisinių prievolių tikslais; Registre nurodyta, kiek laiko ir kodėl. Kai taikomas visiškas duomenų nesaugojimas, Registre nurodoma, kurioms funkcijoms jis taikomas. Neapibūdinsime turinio kaip nesaugomo, jei jis iš tiesų saugomas.

**Perdavimas už EEE ribų.** Jungtinėse Amerikos Valstijose įsisteigę paslaugų teikėjai gauna duomenis pagal vieną iš GDPR V skyriuje numatytų mechanizmų: ES ir JAV duomenų privatumo sistemą, jei konkretus sutartį sudarantis subjektas yra sertifikuotas šiems duomenims, arba Europos Komisijos standartines sutarčių sąlygas (antras modulis, valdytojo perdavimas tvarkytojui), paremtas perdavimo rizikos vertinimu ir papildomomis priemonėmis. Registre įvardytas kiekvienam teikėjui taikomas mechanizmas. Sąlygų, kuriomis remiamės, kopiją galite gauti parašę privacy@dezbatere.ro. Jei mechanizmas, kuriuo remiamės, pripažįstamas negaliojančiu, prieš tęsdami perdavimą pereiname prie kito mechanizmo ir jus informuojame.

**Kiti gavėjai.** Mūsų prieglobos paslaugų teikėjas \[Hetzner, Germany — region …\]; mūsų turinio pristatymo ir perdavimo paslaugų teikėjas \[Cloudflare\]; mūsų el. pašto perdavimo paslauga \[…\]; \[our payment provider, once a paid plan exists\]. Kiekvienas jų veikia pagal mūsų dokumentuotus nurodymus, vadovaudamasis duomenų tvarkymo sutartimi, kurioje numatytos 28 straipsnyje reikalaujamos apsaugos priemonės, ir kiekvienas nurodytas Registre kartu su savo vieta bei perdavimo mechanizmu. Neleidžiame jokiam duomenų tvarkytojui naudoti jūsų duomenų savais tikslais. Jei teikėjas taip darytų, jis būtų savarankiškas duomenų valdytojas, ir mes jam jūsų duomenų nesiunčiame.

**Valdžios institucijos.** Asmens duomenis atskleidžiame teismams, reguliavimo ar teisėsaugos institucijoms, kai to reikalauja įstatymai, ir jus informuojame, nebent įstatymai mums tai draudžia.

## 6. Paskelbimas ir matomumas

Debatai yra privatūs, kol jų nepaskelbiate. Paskelbimas yra sąmoningas, atskirai patvirtinamas veiksmas. Paskelbtuose debatuose rodomas jūsų **slapyvardis**, jūsų klausimas toks, kokį jį parašėte, argumentų medis, įverčiai, verdiktas bei pasitikėjimo lygis ir aiškiai nurodoma, kad turinį sugeneravo DI. Juose niekada nerodomas jūsų el. pašto adresas, seansų įrašai ar paskyros istorija. \[Published debates are / are not\] indeksuojami paieškos sistemų \[unless you choose\].

Atšaukus paskelbimą debatai pašalinami iš DebateAI ir sunaikinamas mūsų viešos kopijos raktas. Skaitytojų, paieškos sistemų ar archyvų jau padarytos kopijos nuo mūsų nepriklauso ir negalime jų atšaukti.

Kai ištrinate paskyrą, nepagrįstai nedelsdami ir ne vėliau kaip per 30 dienų pašaliname iš viešos prieigos visus jūsų paskelbtus debatus, nebent pagal įstatymus privalome išsaugoti konkretų elementą. \[Option B — a product change; see the Terms, section 9.\]

## 7. Kiek laiko saugome duomenis

| Duomenys | Kiek laiko | Kas vyksta paskui |
| --- | --- | --- |
| Paskyra | Kol paskyra egzistuoja, ir dar 7 dienų lengvatinį laikotarpį po prašymo ją uždaryti | Raktai sunaikinami; įrašas ištrinamas |
| Seansų įrašai | 14 dienų nuo paskutinio naudojimo arba 90 dienų nuo sukūrimo, atsižvelgiant į tai, kuris terminas sueina pirmas | Ištrinami |
| El. pašto patvirtinimo nuorodos | 24 valandas | Ištrinamos |
| Prisijungimo ir atkūrimo rizikos signalai | 90 dienų; terminą užtikrina duomenų bazė | Ištrinami |
| Saugumo audito žurnalas | Visą paslaugos gyvavimo laiką | Įrašai tik pridedami; IP adresai ir naudotojo agentai yra vienkryptės santraukos ir negali būti atkurti |
| Debatų turinys (privatus) | Kol paskyra egzistuoja | Uždarius paskyrą raktai sunaikinami ir turinio perskaityti nebegalima |
| Debatų turinys (paskelbtas) | Kol yra paskelbtas ir kol paskyra egzistuoja | Atšaukus paskelbimą ar uždarius paskyrą pašalinamas iš viešos prieigos; raktai sunaikinami |
| Paslaugų teikėjų atsakymų įrašai ir paieškos nuorodos | Tiek pat, kiek saugomi debatai, kuriems jie priklauso | Tas pats |
| Pagalbos pokalbiai ir atvejai | \[Until closed plus 12 months\] | Raktai sunaikinami |
| Sutikimo su sąlygomis ir kitų sutikimų įrašai | Paskyros gyvavimo laiką ir dar 6 metus — ilgiausią mums taikomą senaties terminą | Ištrinami |
| Mokėjimų įrašai \[pending\] | 10 metų, kaip reikalauja Rumunijos apskaitos teisė | Ištrinami |
| Atsarginės kopijos \[pending\] | \[… days\] po to, kai aktyvioji kopija ištrinama | Perrašomos |

**Ką ištrynimas iš tikrųjų reiškia.** Jūsų debatų ir paskyros duomenys užšifruojami jūsų paskyrai ir kiekvieniems debatams būdingais raktais. Ištrynus paskyrą šie raktai sunaikinami, todėl nei mes, nei kas nors kitas nebegali perskaityti užšifruotų įrašų, be to, ištriname jūsų paskyros įrašą. Tai vadiname ištrynimu, nes toks yra šio veiksmo rezultatas, ir turime jį pagrindžiantį dokumentuotą vertinimą; jei norite sužinoti daugiau, klauskite. Svarbu žinoti tris dalykus: į saugumo audito žurnalą įrašai tik pridedami, esamų įrašų negalima keisti, o pats žurnalas neištrinamas, tačiau jame nėra perskaitomų jūsų identifikatorių; nedidelis skaičius senesnių debatų sukurtas anksčiau nei dabartinė šifravimo schema, ir jei tai taikoma jūsų paskyrai, paaiškinsime, ką jiems reiškia paskyros uždarymas; o DI paslaugų teikėjui jau išsiųstoms duomenų kopijoms taikomos to teikėjo Registre nurodytos saugojimo sąlygos, o ne mūsų atliekamas ištrynimas.

&#91;The support retention period and the backup line describe policies to implement; the system currently keeps support records indefinitely and has no backup-expiry mechanism. Do not publish figures that are not enforced.\]

## 8. Automatizuoti sprendimai ir profiliavimas

Debatų įverčiai, sąlygų žymos ir verdiktai yra automatizuoti **argumentų, o ne žmonių** vertinimai. Jie jums nesukelia teisinių pasekmių ir nedaro panašaus reikšmingo poveikio. Nepriimame jokio vien automatizuotu tvarkymu pagrįsto sprendimo dėl jūsų, kuris sukeltų teisinių ar panašiai reikšmingų pasekmių, ir jūsų neprofiliuojame.

Jei kada nors automatizuosime sprendimą dėl jūsų paskyros — ją sustabdyti ar atsisakyti paskelbti debatus — asmuo peržiūrės tokį sprendimą prieš jam įsigaliojant arba jūsų prašymu, galėsite pareikšti savo nuomonę ir ginčyti sprendimą. Kaip tai daroma, aprašyta Sąlygose.

## 9. Saugumas ir kas nutinka, jei kas nors nepavyksta

Slaptažodžių maišos sudaromos naudojant Argon2id. Dviejų veiksnių autentifikavimas yra privalomas. Jūsų el. pašto adresas, debatai, pagalbos pokalbiai ir autentifikavimo paslaptys saugomi užšifruoti ramybės būsenoje naudojant jūsų paskyrai būdingus raktus, o paskelbtų debatų raktai laikomi atskirai nuo privačių debatų raktų. Prieiga prie gamybinių duomenų registruojama. IP adresai ir naršyklės duomenys mūsų saugumo žurnale saugomi tik kaip vienkryptės santraukos.

Įvykus asmens duomenų saugumo pažeidimui, kai to reikalauja įstatymai, per 72 valandas pranešame Rumunijos priežiūros institucijai, o jei pažeidimas gali kelti didelę riziką jūsų teisėms ir laisvėms, nepagrįstai nedelsdami informuojame jus tiesiogiai. B priede išvardytos pranešimo taisyklės, taikomos kituose mūsų aptarnaujamuose regionuose.

## 10. Jūsų teisės ir kaip jomis pasinaudoti

Bet kuria iš šių teisių galite pasinaudoti nemokamai parašę **privacy@dezbatere.ro** arba skiltyje **Nustatymai → Privatumas**, jei joje yra atitinkamas valdiklis. Atsakome per vieną mėnesį; jei prašymas sudėtingas, galime užtrukti dar iki dviejų mėnesių ir paaiškinsime kodėl. Galime paprašyti jūsų per paskyrą patvirtinti tapatybę.

| Teisė | Ką ji reiškia čia |
| --- | --- |
| **Teisė susipažinti** (Art. 15) | Mūsų turimų jūsų asmens duomenų kopija ir ši informacija. \[Pending: a JSON export from Settings. Until it exists, we compile the copy manually within the month.\] |
| **Teisė ištaisyti duomenis** (Art. 16) | Nustatymuose ištaisykite savo el. pašto ar atkūrimo el. pašto adresą. Dėl Sąlygose nurodytų priežasčių jūsų slapyvardžio pakeisti negalima; galite uždaryti paskyrą ir atidaryti naują |
| **Teisė reikalauti ištrinti duomenis** (Art. 17) | Bet kada debatų puslapyje ištrinkite privačius debatus. Uždarykite paskyrą Nustatymuose; 7 skyriuje tiksliai paaiškinta, ką tai reiškia. Paprašykite pašalinti paskelbtus debatus, kuriuose yra jūsų duomenų, nepriklausomai nuo to, ar esate jų autorius |
| **Teisė apriboti duomenų tvarkymą** (Art. 18) | Paprašykite sustabdyti konkrečių duomenų tvarkymą, kol bus išspręstas dėl jų kilęs ginčas |
| **Teisė nesutikti** (Art. 21) | Nesutikite, kad duomenys būtų tvarkomi remiantis teisėtais interesais — 4 skyriuje aprašytas saugumo ir audito duomenų tvarkymas — ir mes sustabdysime tvarkymą, nebent galėsime įrodyti įtikinamas priežastis. Bet kada nesutikite su rinkodara, ir ją nutrauksime |
| **Teisė į duomenų perkeliamumą** (Art. 20) | Jūsų debatai ir paskyros duomenys įprastai naudojamu, kompiuterio skaitomu formatu. \[Pending: same export as Access.\] Jūsų sukurtas neasmeninis turinys, pavyzdžiui, jūsų klausimai, pasibaigus sutarčiai jūsų prašymu grąžinamas jums |
| **Sutikimo atšaukimas** (Art. 7(3)) | Atšaukite rinkodaros sutikimą bet kuriame el. laiške arba Nustatymuose; atšaukite sutikimą tvarkyti neskelbtinus duomenis jų neįtraukdami arba ištrindami debatus. Atšaukimas neturi įtakos jau atliktam tvarkymui |
| **Skundo pateikimas** | Rumunijos priežiūros institucijai **ANSPDCP**, B-dul G-ral Gheorghe Magheru 28–30, Bukareštas, <anspdcp@dataprotection.ro>, arba šalies, kurioje gyvenate, institucijai. Norėtume, kad pirmiausia kreiptumėtės į mus |

Už prašymą niekada neimame mokesčio ir dėl jo pateikimo niekada nesielgiame su jumis nepalankiau.

## 11. Debatuose įvardyti asmenys, kurie nėra mūsų naudotojai

Jei kas nors pateikia DebateAI klausimą, kuriame jus įvardija, galime turėti jūsų asmens duomenų, nors paslauga niekada nesinaudojote. Sąlygos draudžia naudotojams taip elgtis, o mes kuo labiau ribojame DI paslaugų teikėjams siunčiamus duomenis, tačiau taip nutinka.

Šis skyrius yra pranešimas, kurį privalome jums pateikti pagal GDPR 14 straipsnį. Duomenys yra tai, ką įvedė naudotojas ir ką atsakydamas sugeneravo variklis; šaltinis yra tas naudotojas; tikslai ir teisinis pagrindas nurodyti 4 skyriuje; gavėjai yra Registre nurodyti DI paslaugų teikėjai; saugojimo terminai nustatyti 7 skyriuje. Turite visas 10 skyriuje nurodytas teises, ypač galite prašyti pašalinti paskelbtus ar privačius debatus, kuriuose yra jūsų duomenų, ir pranešti, ką apie jus turime. Tam jums nereikia paskyros. Rašykite **privacy@dezbatere.ro** arba bet kuriuose paskelbtuose debatuose naudokite valdiklį **Pranešti**, o mes nepagrįstai nedelsdami imsimės veiksmų pagal pagrįstus prašymus. Negalime jums pranešti asmeniškai, kai taip nutinka, nes nežinome, kas esate ar kaip su jumis susisiekti; vietoje to imamės šio viešo pranešimo ir suteikiame pašalinimo būdą.

Tas pats taikoma neskelbtinai informacijai apie jus — politinėms pažiūroms, sveikatai, religijai — kuri pateikiama kito asmens klausime. Jums paprieštaravus jokia teisinė sąlyga neleidžia mums toliau jos tvarkyti, todėl to nedarysime.

## 12. Vaikai

DebateAI skirta suaugusiesiems. Registruodamiesi patvirtinate, kad jums yra 18 metų ar daugiau, ir mes sąmoningai netvarkome jaunesnių nei 18 metų asmenų duomenų. Sužinoję, kad paskyra priklauso jaunesniam nei 18 metų asmeniui, ją uždarome ir duomenis ištriname, kaip aprašyta 7 skyriuje. Kai kuriose šalyse patvirtinimas laikomas nepakankamu arba reikalaujama daugiau; B priede nurodyta, kas taikoma konkrečioje vietoje, o Sąlygose paaiškinta, ką dėl to darome.

## 13. Slapukai

Nustatome du slapukus ir abu jie yra griežtai būtini: vienas padeda išlaikyti jus prisijungusius, o kitas apsaugo formas nuo klastojimo. Nenustatome analitikos, reklamos ar sekimo slapukų. **Slapukų politikoje** adresu \[dezbatere.ro/cookies\] jie išvardyti kartu su galiojimo trukme, paaiškinta, kaip saugomas jūsų pasirinkimas, ir ši politika bus pakeista prieš pridedant bet kokį kitą slapuką. Jei jūsų regiono teisėje tam tikri slapukai vertinami kitaip — pavyzdžiui, Jungtinėje Karalystėje taikoma teisė atsisakyti analitikos slapukų — tai nurodyta Slapukų politikoje.

## 14. Šios politikos pakeitimai

Pakeitę šią politiką paskelbiame naują versiją kartu su pakeitimų santrauka ir nauja įsigaliojimo data, o ankstesnes versijas saugome adresu \[dezbatere.ro/privacy/versions\]. Jei pakeitimu pridedamas naujas tikslas ar naujas gavėjas, prieš pradėdami naują tvarkymą informuojame jus el. paštu ir produkte bei suteikiame laiko nesutikti. Jei naujas tikslas priklauso nuo jūsų sutikimo — pavyzdžiui, jei kada nors norėtume naudoti turinį modeliams tobulinti — tokio sutikimo prašome atskirai ir konkrečiai; atnaujintų Sąlygų priėmimo niekada nelaikome sutikimu su nauju duomenų tvarkymu. Jei paaiškinimai nieko nekeičia mūsų veikloje, tiesiog paskelbiame naują versiją.

Ši politika paskutinį kartą atnaujinta \[date\]. 3.0 versija pakeitė 2.1 versiją, kurioje seanso duomenys, saugojimo laikotarpiai, analitika, eksportas ir ištrynimo poveikis paskelbtiems debatams buvo aprašyti taip, kad tai nebeatitiko paslaugos.

## Annex B — Regioninės privatumo sąlygos

Kiekvienas įrašas taikomas tik tuo atveju, jei jo regionas nurodytas Sąlygų 2 skyriuje, ir jame nurodoma tik tai, kas skiriasi nuo pagrindinės šios politikos dalies.

### B.1 Europos Sąjunga ir Europos ekonominė erdvė

Pagrindinė šios politikos dalis parengta jums. Mūsų priežiūros institucija yra Rumunijos **ANSPDCP**; taip pat galite pateikti skundą šalies, kurioje gyvenate, institucijai. Naudotojams Rumunijoje ši politika rumunų kalba pateikiama adresu \[URL\].

### B.2 Jungtinė Karalystė *(tik jei nurodyta)*

Mūsų atstovas Jungtinėje Karalystėje pagal JK GDPR 27 straipsnį yra **\[name, address, email\]**; su juo galite susisiekti bet kokiu su šia politika susijusiu klausimu. Priežiūros institucija yra **Informacijos komisaro biuras** [ico.org.uk](https://ico.org.uk). Skundą mums galite pateikti naudodami formą adresu \[URL\], o mes patvirtinsime jo gavimą per 30 dienų. Duomenų perdavimas iš Jungtinės Karalystės DI paslaugų teikėjams Jungtinėse Amerikos Valstijose grindžiamas \[the UK Extension to the EU–US Data Privacy Framework, where the provider is certified / the UK International Data Transfer Addendum to the EU standard contractual clauses\] ir perdavimo rizikos vertinimu. Jei kada nors nustatytume analitikos slapukus, Jungtinėje Karalystėje jiems būtų taikoma teisė atsisakyti, o ne sutikimo reikalavimas; šiandien jų nenustatome. Jei esate jaunesni nei 18 metų ir, nepaisydami mūsų amžiaus taisyklės, pasiekiate paslaugą, jūsų duomenis tvarkome pagal ICO Vaikų kodekso standartus.

### B.3 Jungtinės Amerikos Valstijos *(tik jei nurodyta)*

**Pranešimas duomenų rinkimo metu.** 2 skyriaus lentelėje nurodytos kiekviena renkamos asmeninės informacijos kategorija, jos tikslas ir saugojimo trukmė (7 skyrius). Šių kategorijų *neskelbtiną* asmeninę informaciją renkame tik tada, kai ją įtraukiate į savo klausimus: \[health, religious or philosophical beliefs, sexual orientation, union membership, political views\], ir naudojame ją tik jūsų debatams vykdyti. **Asmeninės informacijos neparduodame ir neperduodame dalijimosi tikslais, taip pat to nedarėme per ankstesnius dvylika mėnesių.** Neskelbtinos asmeninės informacijos nenaudojame jokiam kitam tikslui, išskyrus jūsų prašomos paslaugos teikimą. **Atsisakymo nuostatos signalai:** Global Privacy Control signalus laikome prašymu atsisakyti pardavimo ar dalijimosi, nors bet kuriuo atveju to nedarome. **Jūsų teisės:** žinoti, ištrinti, ištaisyti, atsisakyti, apriboti neskelbtinos asmeninės informacijos naudojimą ir nepatirti diskriminacijos naudojantis šiomis teisėmis; pateikite prašymą adresu privacy@dezbatere.ro arba \[toll-free number / form\]. **Finansinės paskatos:** jų nesiūlome; nemokami ir mokami planai nesiskiria tuo, kaip tvarkome jūsų duomenis. **Saugojimas** aprašytas 7 skyriuje. Šis pranešimas atnaujinamas bent kas dvylika mėnesių; paskutinį kartą atnaujintas \[date\].

*Vašingtonas:* mūsų atskiras **Vartotojų sveikatos duomenų privatumo pranešimas** adresu \[URL\] taikomas visai su sveikata susijusiai informacijai, įskaitant išvadas. *Teksasas ir Nebraska:* neparduodame neskelbtinų asmens duomenų; jei tai kada nors pasikeistų, pirmiausia gautume jūsų sutikimą \[statutory language\]. *Koloradas, Konektikutas, Virdžinija ir kitos išsamius privatumo įstatymus turinčios valstijos:* pirmiau nurodytos teisės taikomos jums, kai mums taikomas atitinkamas įstatymas; atsisakymą patenkinti prašymą apskųskite parašę \[appeals@dezbatere.ro\].

### B.4 Kanada ir Kvebekas *(tik jei nurodyta)*

Mūsų privatumo pareigūnas yra **\[name, email\]**. Mes ir toliau atsakome už asmeninę informaciją, kurią perduodame DI paslaugų teikėjams už Kanados ribų, ir sutartimis reikalaujame lygiavertės apsaugos; tiems teikėjams gali būti taikomi jų veiklos šalių įstatymai, įskaitant teisėtą valdžios institucijų prieigą. Rinkodaros el. laiškai siunčiami tik gavus jūsų aiškų sutikimą pagal CASL. **Kvebekas:** prieš perduodami asmeninę informaciją už Kvebeko ribų atliekame poveikio privatumui vertinimą; nustatymai, pagal kuriuos jūsų debatai lieka privatūs, yra įjungti pagal numatytuosius nustatymus; galite prašyti panaikinti jūsų asmeninės informacijos indeksavimą arba nustoti ją platinti; galite prašyti pateikti savo duomenis struktūrizuotu, įprastai naudojamu formatu; 8 skyriuje aprašytas mūsų automatizuotas tvarkymas.

### B.5 Australija ir Naujoji Zelandija *(tik jei nurodyta)*

**Australija.** Jūsų asmeninės informacijos gavėjai užsienyje yra Registre nurodyti DI paslaugų teikėjai ir duomenų tvarkytojai, esantys \[the United States and the European Union\]; imamės pagrįstų veiksmų užtikrinti, kad jie tvarkytų šią informaciją laikydamiesi Australijos privatumo principų. **Automatizuoti sprendimai:** nuo 2026 m. gruodžio 10 d. šioje politikoje nurodomos kompiuterių programų priimamų sprendimų, darančių reikšmingą poveikį jūsų teisėms ar interesams, rūšys — tokių sprendimų nėra; įverčiai ir verdiktai susiję su argumentais, o ne su jumis — ir juose naudojama asmeninė informacija. Skundus galima teikti **Australijos informacijos komisaro biurui**. **Naujoji Zelandija.** Mūsų privatumo pareigūnas yra \[name\]. Kai jūsų asmeninę informaciją renkame netiesiogiai — nes kitas naudotojas įtraukė ją į klausimą — šia politika ir 11 skyriumi pateikiame jums pranešimą. Informaciją Registre nurodytiems DI paslaugų teikėjams atskleidžiame kaip savo atstovams pagal sutartis, kuriose reikalaujama lygiaverčių apsaugos priemonių. Skundus galima teikti **Privatumo komisaro biurui**.

### B.6 Lotynų Amerika *(priedas ispanų kalba; tik jei nurodyta)*

&#91;Published in Spanish.\] Sutikimas yra duomenų tvarkymo pagrindas, kai nėra būtinybės vykdyti sutartį. ARCO teisėmis — susipažinti, ištaisyti, panaikinti, nesutikti — galima pasinaudoti adresu privacy@dezbatere.ro, o atsakymai pateikiami per \[per country\]. *Meksika:* visas *aviso de privacidad* su privalomais elementais pateikiamas adresu \[URL\]. *Argentina:* \[AAIP mandatory legend\]; duomenys registruoti \[…\]. *Kolumbija:* mūsų *política de tratamiento de datos* pateikiama adresu \[URL\]; institucija yra SIC. *Čilė* (nuo 2026 m. gruodžio 1 d.): Agentūros kontaktiniai duomenys yra \[…\]; 8 skyriuje paaiškintas mūsų automatizuotas tvarkymas.

### B.7 Persijos įlanka — JAE ir Saudo Arabija *(tik jei nurodyta)*

Kai jūsų duomenis tvarkome kitais tikslais nei paslaugai teikti, remiamės jūsų sutikimu, kurį galite atšaukti. Jūsų duomenys iškeliauja iš \[UAE / Kingdom of Saudi Arabia\] ir yra tvarkomi Europos Sąjungoje bei Jungtinėse Amerikos Valstijose pagal \[SDAIA standard contractual clauses / the mechanism in the Register\]. Rinkodaros pranešimai siunčiami tik gavus jūsų sutikimą. Į klausimus neįtraukite neskelbtinų asmens duomenų.

### B.8 Azijos ir Ramiojo vandenyno regionas *(tik išvardytų regionų eilutės)*

*Singapūras:* mūsų duomenų apsaugos pareigūnas yra **\[name, email\]**; perdavimas grindžiamas sutartinėmis prievolėmis, užtikrinančiomis PDPA lygiavertę apsaugą; apie pažeidimus, apie kuriuos privaloma pranešti, PDPC informuojame per 3 dienas. *Japonija:* jūsų asmeninę informaciją naudojame tik 4 skyriuje nurodytais tikslais; jūsų turinys perduodamas paslaugų teikėjams \[named countries — e.g. the United States\], kurių privatumo režimai ir apsaugos priemonės aprašyti Registre, ir registruodamiesi su tuo sutinkate. *Pietų Korėja:* mūsų privatumo pareigūnas yra **\[name\]**; į užsienį perduodamų duomenų elementai, paskirties vieta, laikas, gavėjas, tikslas ir saugojimo terminas nurodyti Registre; jūsų klausimuose pateiktos politinės pažiūros yra neskelbtina informacija ir ją tvarkome tik jūsų debatams vykdyti; sutikimai dėl neprivalomo tvarkymo renkami atskirai. *Indija* (kai bus taikomos DPDP taisyklės): taikomas atskiras pranešimas dėl sutikimo adresu \[URL\]; į prašymus atsakoma per 90 dienų; jaunesniems nei 18 metų naudotojams reikia patikrinamo tėvų sutikimo. *Filipinai:* mūsų duomenų apsaugos pareigūnas yra \[name\]; skundai gali būti teikiami Nacionalinei privatumo komisijai; 8 skyriuje aprašytas automatizuotas tvarkymas. *Tailandas:* mūsų atstovas yra \[name\] \[if appointed\].

### B.9 Rezervuota

Turkijai, Brazilijai ir Indonezijai reikia pranešimo vietos kalba, atstovo arba registracijos ir dokumentų pateikimo, todėl jų projektai čia neparengti. Kinijoje, Vietname ir Rusijoje paslaugos neteikiamos.
