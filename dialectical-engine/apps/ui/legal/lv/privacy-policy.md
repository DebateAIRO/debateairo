# DebateAI — Privātuma politika

<!-- legal-chrome
summaryTitle: Īsumā
eyebrow: PRIVĀTUMA POLITIKA · v3.0 · SPĒKĀ NO [DATE]
title: Ko mēs glabājam un kāpēc
lede: Jūsu tiesības un mūsu pienākumi saskaņā ar GDPR (EU) 2016/679, izklāstīti vienkāršā valodā. Četrpadsmit sadaļas un B pielikums — ritiniet līdz beigām.
endMarker: POLITIKAS BEIGAS · GDPR (EU) 2016/679 · v3.0
bodyLabel: Privātuma politikas teksts
annexTitle: B pielikums — Reģionālie privātuma noteikumi
jumps:
01 PĀRZINIS
02 KO MĒS VĀCAM
04 TIESISKAIS PAMATS
05 MODEĻI UN NOSŪTĪŠANA
06 PUBLICĒŠANA
07 GLABĀŠANA
10 JŪSU GDPR TIESĪBAS
13 SĪKDATNES
-->

2026-09-21 · @Someone

**v3.0 projekts juridiskā konsultanta pārskatīšanai — aizstāj ieviesto v2.1 (`apps/ui/lib/privacyPolicy.ts`). Tā nav juridiska konsultācija.** Šī versija ir izstrādāta atbilstoši tam, ko kods faktiski dara, un tajā ir izlaboti pieci v2.1 apgalvojumi, kuriem kods bija pretrunā: sesiju dati, glabāšanas termiņi, analītika, eksportēšana un tas, kas pēc dzēšanas notiek ar publicētajām debatēm. Kvadrātiekavas apzīmē informāciju, kuru varat aizpildīt tikai jūs; \[pending\] apzīmē politikā aprakstītu funkciju, kas vēl nav izstrādāta un kurai jābūt pieejamai pirms politikas publicēšanas.

**Version 3.0 · Effective \[date\] · Iepriekšējās versijas: dezbatere.ro/privacy/versions · Pārzinis: DebateAIRO S.R.L., Bukareste**

**In short.** Mēs vācam konta darbībai nepieciešamo informāciju un to, ko izvēlaties ievadīt. Jūsu jautājumi tiek nosūtīti mūsu Reģistrā norādītajiem MI pakalpojumu sniedzējiem; tie netiek izmantoti modeļu apmācībai. Debates ir privātas, ja vien jūs tās nepublicējat. Dzēšot kontu, tiek iznīcinātas jūsu datu atslēgas un noņemtas jūsu publicētās debates. Varat ar mums sazināties, rakstot uz privacy@dezbatere.ro, un debatēs minētās personas var pieprasīt satura noņemšanu arī bez konta.

## 1. Kas atbild par jūsu datiem

Jūsu personas datu pārzinis ir **DebateAIRO S.R.L.**, \[address\], Bukareste, Rumānija, Komercreģistra numurs \[J40/…\], CUI \[…\]. Par jebkuru ar šo politiku saistītu jautājumu rakstiet uz **privacy@dezbatere.ro**; mēs atbildēsim viena mēneša laikā. Mēs neesam iecēluši datu aizsardzības speciālistu, jo tiesību akti to no mums neprasa; šo adresi uzrauga \[role\]. Ja esam iecēluši pārstāvi vai privātuma speciālistu konkrētā valstī, tas ir norādīts B pielikumā.

## 2. Ko mēs vācam un no kurienes tas tiek iegūts

Mēs vācam tikai to, kas nepieciešams konta darbībai, ko jūs izvēlaties mums sniegt un ko saskaņā ar tiesību aktiem mums ir pienākums glabāt.

| Kategorija | Precīzi kādi dati | Avots |
| --- | --- | --- |
| **Konts** | E-pasta adrese un atkopšanas e-pasta adrese (glabātas šifrētā veidā, izmantojot ar atslēgu aizsargātu indeksu, lai mēs varētu atrast kontu, nelasot adresi); parole (glabāta kā jaucējvērtība, nekad ne atklātā tekstā); jūsu divfaktoru autentifikācijas slepenā atslēga (šifrēta); desmit atkopšanas kodi (glabāti kā jaucējvērtības); jūsu pseidonīms; laiks, kad apstiprinājāt, ka esat vismaz 18 gadus vecs | Jūs, reģistrācijas laikā |
| **Sesijas un drošība** | Sesijas pilnvara jaucējvērtības veidā; ar atslēgu aizsargāta jūsu pārlūkprogrammas user-agent virknes jaucējvērtība, ko izmanto, lai pamanītu sesijas pāreju uz citu pārlūkprogrammu; izveides, pēdējās izmantošanas un termiņa beigu laikspiedoli. Mēs **neglabājam** jūsu IP adresi, ierīces nosaukumu vai pārlūkprogrammas informāciju kopā ar sesiju, un sesiju sarakstā, ko redzat Iestatījumos, ir norādīti tikai laikspiedoli | Jūsu pārlūkprogramma |
| **Drošības audita pieraksts** | Tikai papildināms drošībai nozīmīgu notikumu žurnāls — reģistrācija, verifikācija, pierakstīšanās mēģinājumi, atkopšana, publicēšana, dzēšana. Katra notikuma IP adrese un user-agent tiek glabāti tikai kā vienvirziena ar atslēgu aizsargāti īssavilkumi (Argon2id), tādēļ tos nevar atkal nolasīt, bet noteiktā laikposmā var salīdzināt. Pierakstīšanās un atkopšanas riska signāli tiek glabāti šifrētā veidā 90 dienu | Jūsu pārlūkprogramma katra notikuma laikā |
| **Debašu saturs** | Jūsu ievadītais jautājums; jūsu iestatītās vadības piezīmes; dzinēja ģenerētie apgalvojumi, kritika, pierādījumu atsauces, vērtējumi un spriedumi; katra MI pakalpojumu sniedzēja atbildes precīzs ieraksts; izguves vaicājumi un avotu atsauces. Tas viss tiek glabāts šifrētā veidā, izmantojot tieši jūsu kontam paredzētu atslēgu | Jūs un MI modeļi, kas apstrādā jūsu jautājumu |
| **Atbalsts** | Ziņojumi, ar kuriem apmaināties ar atbalsta asistentu vai personu un kuri tiek glabāti šifrētā veidā; izmantotā valoda; tas, vai atļāvāt asistentam redzēt savu debašu statusu (nekad to saturu); jūsu sniegtie vērtējumi. Ja ziņojums iedarbina ļaunprātīgas izmantošanas kontroles mehānismus, mēs saglabājam ziņojuma jaucējvērtību un tās IP adreses jaucējvērtību, no kuras tas nosūtīts | Jūs |
| **Piekrišanas un akceptēšanas ieraksti** | Jūsu akceptēto Noteikumu un jums parādītās politikas versija un satura jaucējvērtība; laiks; izmantotais ekrāns un mehānisms; jūsu valoda; jūsu IP adrese un user-agent tajā brīdī; katra jūsu sniegtā vai atsauktā piekrišana un tās laiks | Jūsu pārlūkprogramma reģistrācijas laikā un ikreiz, kad maināt izvēli |
| **Maksājumi** \[pending — once a paid plan exists\] | Plāns, cena, norēķinu periods, darījumu atsauces, pircēja atrašanās vietas pierādījumi nodokļu vajadzībām. Kartes datus glabā mūsu maksājumu pakalpojumu sniedzējs, bet mēs tos nekad neglabājam | Jūs un maksājumu pakalpojumu sniedzējs |
| **Personas, kuras nav mūsu lietotāji** | Personas dati par citām personām, kurus iekļaujat jautājumā vai kurus dzinējs ģenerē, uz to atbildot. Mēs lūdzam jūs tā nerīkoties; 11. sadaļā ir paskaidrots, ko mēs darām, ja tas tomēr notiek | Jūs, netieši |

Mēs **nevācam** analītikas vai telemetrijas datus par to, kā izmantojat produktu, un šādam nolūkam neiestatām sīkdatnes. Ja tas mainīsies, vispirms tiks mainītas šī politika un Sīkdatņu politika un jums tiks lūgta piekrišana.

## 3. Sensitīva informācija

Debašu dzinējs rosina uzdot jautājumus par politiku, reliģiju, veselību, seksualitāti un pārliecību. Tās ir īpašas datu kategorijas saskaņā ar GDPR 9. pantu, un tās var parādīties jūsu jautājumos neatkarīgi no tā, vai mēs tās plānojam vākt.

**Par jums.** Reģistrējoties jūs atsevišķā teikumā sniedzat nepārprotamu piekrišanu tam, ka mēs apstrādājam sensitīvu informāciju, kuru izvēlaties iekļaut savos jautājumos, lai vadītu jūsu debates. Jūs jebkurā laikā varat piekrišanu atsaukt, neiekļaujot šādu informāciju vai dzēšot debates. Informācija, ko publicējat par sevi, ir dati, kurus esat izvēlējies publiskot.

**Par citām personām.** Neviens juridiskais nosacījums mums neļauj apstrādāt sensitīvus datus par trešo personu, kuru minat jautājumā, un šāda nosacījuma nav arī nevienam mūsu MI pakalpojumu sniedzējam. Tādēļ Noteikumi to aizliedz, mēs samazinām nosūtāmās informācijas apjomu un pēc pieprasījuma šādu saturu ātri noņemam — 11. sadaļa.

**Veselības informācija.** Dažās valstīs uz veselības datiem, tostarp secinājumiem, attiecas īpaši tiesību akti. Ja dzīvojat \[the State of Washington\], ir piemērojams atsevišķs \[Consumer Health Data Privacy Notice\].

## 4. Kāpēc mēs izmantojam jūsu datus un uz kāda pamata

Katram nolūkam ir viens tiesiskais pamats saskaņā ar GDPR 6. panta 1. punktu, un mēs vienam nolūkam savāktos datus atkārtoti neizmantojam citam nolūkam.

| Nolūks | Dati | Pamats |
| --- | --- | --- |
| Jūsu konta izveide un darbības nodrošināšana, jūsu autentificēšana, jūsu debašu vadīšana un glabāšana, lai jūs tās varētu atkārtoti atvērt un atskaņot | Konts, sesijas, debašu saturs | **Līgums** — GDPR 6. panta 1. punkta b) apakšpunkts (Art. 6(1)(b)) |
| Jūsu jautājuma un dzinēja apgalvojumu nosūtīšana MI pakalpojumu sniedzējiem, lai ģenerētu debates | Debašu saturs | **Līgums** — GDPR 6. panta 1. punkta b) apakšpunkts (Art. 6(1)(b)) |
| Pakalpojuma drošības uzturēšana, ļaunprātīgas izmantošanas atklāšana, iespēja jums pamanīt pierakstīšanos, ko neesat veicis, audita pieraksta glabāšana | Sesijas, drošības audita pieraksts, atbalsta sistēmas ļaunprātīgas izmantošanas jaucējvērtības | **Leģitīmās intereses** — GDPR 6. panta 1. punkta f) apakšpunkts (Art. 6(1)(f)): mūsu un jūsu interese par drošu pakalpojumu. Jūs varat iebilst; 10. sadaļa |
| Pierādīšana, ka akceptējāt Noteikumus un sniedzāt vai atsaucāt piekrišanu | Piekrišanas un akceptēšanas ieraksti | **Juridisks pienākums** — GDPR 6. panta 1. punkta c) apakšpunkts (Art. 6(1)(c)), mūsu pienākums pierādīt piekrišanu saskaņā ar 7. panta 1. punktu (Art. 7(1)) — un leģitīmās intereses apliecināt līgumu |
| Atbildēšana uz atbalsta pieprasījumiem | Atbalsts | **Līgums** — GDPR 6. panta 1. punkta b) apakšpunkts (Art. 6(1)(b)) |
| Sensitīvas informācijas, kuru iekļaujat par sevi, apstrāde | Debašu saturs | **Nepārprotama piekrišana** — GDPR 9. panta 2. punkta a) apakšpunkts (Art. 9(2)(a)), kas atsevišķi sniegta reģistrācijas laikā |
| To debašu publicēšana, kuras izvēlaties publicēt | Debašu saturs, pseidonīms | **Līgums** — GDPR 6. panta 1. punkta b) apakšpunkts (Art. 6(1)(b)), pēc jūsu norādījuma; attiecībā uz sensitīviem datiem par jums — 9. panta 2. punkta e) apakšpunkts (Art. 9(2)(e)): dati, kurus esat apzināti publiskojis |
| Produkta jaunumu nosūtīšana jums | E-pasta adrese | **Piekrišana** — GDPR 6. panta 1. punkta a) apakšpunkts (Art. 6(1)(a)), neatzīmēta izvēles rūtiņa; to var atsaukt jebkurā laikā jebkurā e-pasta ziņojumā vai Iestatījumos |
| Nodokļu, grāmatvedības un juridisko pienākumu izpilde \[pending paid plans\] | Maksājumi, akceptēšanas ieraksti | **Juridisks pienākums** — GDPR 6. panta 1. punkta c) apakšpunkts (Art. 6(1)(c)) |
| Juridisku pieprasījumu un ziņojumu par nelikumīgu saturu apstrāde un mūsu kā mitināšanas pakalpojuma pienākumu izpilde | Viss, kas attiecas uz pieprasījumu | **Juridisks pienākums** — GDPR 6. panta 1. punkta c) apakšpunkts (Art. 6(1)(c)) — un leģitīmās intereses |

Mēs jūs neprofilējam, neizmantojam jūsu datus reklāmai un tos nepārdodam. Mēs neizmantojam jūsu saturu modeļu apmācībai un neatļaujam to darīt mūsu pakalpojumu sniedzējiem — 5. sadaļa.

## 5. MI pakalpojumu sniedzēji un starptautiska datu nosūtīšana

**Kas tiek nosūtīts.** Lai vadītu debates, mēs nosūtām tekstu vienam vai vairākiem ārējiem MI pakalpojumu sniedzējiem: jūsu jautājumu, jūsu iestatītās vadības piezīmes un apgalvojumus, kurus dzinējs izveido debašu gaitā. Tādējādi pakalpojumu sniedzējs redz tekstu, kas ir atvasināts no jūsu ievadītā satura un veidots ap to. Tas nekad nesaņem jūsu e-pasta adresi, konta vai sesijas identifikatorus, IP adresi vai maksājumu datus.

**Kuri pakalpojumu sniedzēji.** Tie ir norādīti mūsu **MI pakalpojumu sniedzēju reģistrā** vietnē \[dezbatere.ro/providers\], kas ir šīs politikas daļa. Par katru pakalpojumu sniedzēju Reģistrā ir norādīta tā juridiskā persona un dibināšanas valsts; ko tas saņem un kādam nolūkam; valstis vai reģioni, kuros tas apstrādā datus; tā glabāšanas noteikumi un tas, vai mūsu izmantotajam galapunktam un funkcijām ir ieslēgts datu neglabāšanas režīms; vai saskaņā ar mūsu līgumu tas var izmantot ievaddatus apmācībai; mūsu izmantotais datu nosūtīšanas mehānisms; kā arī katra ieraksta pēdējās pārbaudes datums. Pakalpojumu sniedzēji var mainīties; Reģistram ir versijas, un izmaiņas tajā tiek atzīmētas.

**Apmācība un glabāšana ir atšķirīgas lietas.** Mūsu līgumi ar pakalpojumu sniedzējiem izslēdz jūsu satura izmantošanu to modeļu apmācībai vai uzlabošanai. \[Publish only once verified per route.\] Daži pakalpojumu sniedzēji ierobežotu laiku glabā uzvednes un atbildes drošības, ļaunprātīgas izmantošanas novēršanas vai savu juridisko pienākumu dēļ; Reģistrā ir norādīts, cik ilgi un kāpēc. Ja ir ieslēgts datu neglabāšanas režīms, Reģistrā tas ir norādīts, kā arī funkcijas, uz kurām tas attiecas. Mēs neapgalvosim, ka saturs netiek glabāts, ja tas neatbilst patiesībai.

**Datu nosūtīšana ārpus EEZ.** Amerikas Savienotajās Valstīs reģistrēti pakalpojumu sniedzēji saņem datus saskaņā ar vienu no GDPR V nodaļā paredzētajiem mehānismiem: ES un ASV datu privātuma regulējumu, ja konkrētā līgumslēdzēja vienība ir sertificēta attiecībā uz šiem datiem, vai Eiropas Komisijas līguma standartklauzulām (otrais modulis, nosūtīšana no pārziņa apstrādātājam), ko papildina datu nosūtīšanas riska novērtējums un papildu pasākumi. Reģistrā ir norādīts katram pakalpojumu sniedzējam piemērojamais mehānisms. Rakstot uz privacy@dezbatere.ro, varat saņemt mūsu izmantoto klauzulu kopiju. Ja mūsu izmantotais mehānisms tiek atzīts par spēkā neesošu, pirms datu nosūtīšanas turpināšanas mēs pārejam uz citu mehānismu un jūs par to informējam.

**Citi saņēmēji.** Mūsu mitināšanas pakalpojumu sniedzējs \[Hetzner, Germany — region …\]; mūsu satura piegādes un pārraides pakalpojumu sniedzējs \[Cloudflare\]; mūsu e-pasta pārsūtīšanas pakalpojums \[…\]; \[our payment provider, once a paid plan exists\]. Katrs no tiem rīkojas saskaņā ar mūsu dokumentētajiem norādījumiem un datu apstrādes līgumu, kurā paredzētas 28. pantā noteiktās garantijas, un katrs ir iekļauts Reģistrā, norādot tā atrašanās vietu un datu nosūtīšanas mehānismu. Mēs nevienam apstrādātājam neatļaujam izmantot jūsu datus saviem nolūkiem. Ja pakalpojumu sniedzējs to darītu, tas būtu patstāvīgs pārzinis, un mēs tam jūsu datus nesūtītu.

**Publiskās iestādes.** Mēs izpaužam personas datus tiesām, regulatoriem vai tiesībaizsardzības iestādēm, ja to prasa tiesību akti, un par to jūs informējam, ja vien tiesību akti mums to neaizliedz.

## 6. Publicēšana un redzamība

Debates ir privātas līdz brīdim, kad tās publicējat. Publicēšana ir apzināta, atsevišķi apstiprināta darbība. Publicētās debatēs tiek parādīts jūsu **pseidonīms**, jūsu jautājums tieši tādā veidā, kā to uzrakstījāt, argumentu koks, vērtējumi, spriedums un ticamības pakāpe, kā arī redzams marķējums, ka saturu ir ģenerējis MI. Tajās nekad netiek parādīta jūsu e-pasta adrese, sesiju ieraksti vai konta vēsture. \[Published debates are / are not\] indeksētas meklētājprogrammās \[unless you choose\].

Publikācijas atcelšana noņem debates no DebateAI un iznīcina mūsu publiskās kopijas atslēgu. Kopijas, kuras jau ir izveidojuši lasītāji, meklētājprogrammas vai arhīvi, nav mūsu kontrolē, un mēs nevaram tās atsaukt.

Kad dzēšat savu kontu, mēs bez nepamatotas kavēšanās un ne vēlāk kā 30 dienu laikā liedzam publisku piekļuvi visām jūsu publicētajām debatēm, ja vien tiesību akti neprasa mums saglabāt konkrētu vienumu. \[Option B — a product change; see the Terms, section 9.\]

## 7. Cik ilgi mēs glabājam datus

| Dati | Glabāšanas ilgums | Pēc tam |
| --- | --- | --- |
| Konts | Kamēr konts pastāv, kā arī 7 dienu labvēlības periods pēc tam, kad lūdzat to slēgt | Atslēgas tiek iznīcinātas; ieraksts tiek dzēsts |
| Sesiju ieraksti | 14 dienu pēc pēdējās izmantošanas vai 90 dienu pēc izveides atkarībā no tā, kurš termiņš iestājas pirmais | Tiek dzēsti |
| E-pasta verifikācijas saites | 24 stundas | Tiek dzēstas |
| Pierakstīšanās un atkopšanas riska signāli | 90 dienu; šo termiņu nodrošina datubāze | Tiek neatgriezeniski dzēsti |
| Drošības audita pieraksts | Visu pakalpojuma darbības laiku | Tikai papildināms; IP un user-agent ir vienvirziena īssavilkumi, un tos nevar atkal nolasīt |
| Debašu saturs (privāts) | Kamēr konts pastāv | Slēgšanas brīdī atslēgas tiek iznīcinātas, padarot saturu nenolasāmu |
| Debašu saturs (publicēts) | Kamēr tas ir publicēts un kamēr konts pastāv | Atceļot publikāciju vai slēdzot kontu, tam tiek liegta publiska piekļuve; atslēgas tiek iznīcinātas |
| Pakalpojumu sniedzēju atbilžu ieraksti un izguves atsauces | Tikpat ilgi kā debates, uz kurām tie attiecas | Tas pats |
| Atbalsta sarunas un lietas | \[Until closed plus 12 months\] | Atslēgas tiek iznīcinātas |
| Piekrišanas un akceptēšanas ieraksti | Konta darbības laiks plus 6 gadi — ilgākais mums piemērojamais noilguma termiņš | Tiek dzēsti |
| Maksājumu ieraksti \[pending\] | 10 gadu, kā to prasa Rumānijas grāmatvedības tiesību akti | Tiek dzēsti |
| Dublējumkopijas \[pending\] | \[… days\] pēc aktīvās kopijas dzēšanas | Tiek pārrakstītas |

**Ko dzēšana faktiski dara.** Jūsu debates un konta dati ir šifrēti, izmantojot tieši jūsu kontam un katrām debatēm paredzētas atslēgas. Dzēšot kontu, šīs atslēgas tiek iznīcinātas, pēc tam šifrētos ierakstus vairs nevar nolasīt ne mēs, ne kāds cits, un mēs dzēšam jūsu konta ierakstu. Mēs to saucam par dzēšanu, jo tāds ir šīs darbības rezultāts, un mūsu rīcībā ir to pamatojošs dokumentēts novērtējums; ja vēlaties uzzināt vairāk, jautājiet. Ir jāzina trīs lietas: drošības audita pieraksts ir tikai papildināms un netiek dzēsts, taču tajā nav lasāmu jūsu identifikatoru; neliels skaits vecāku debašu ir izveidots pirms mūsu pašreizējās šifrēšanas shēmas, un, ja tas attiecas uz jūsu kontu, mēs jums paskaidrosim, ko slēgšana panāk attiecībā uz tām; uz datu kopijām, kas jau nosūtītas MI pakalpojumu sniedzējam, attiecas Reģistrā norādītie šā pakalpojumu sniedzēja glabāšanas noteikumi, nevis mūsu veiktā dzēšana.

&#91;The support retention period and the backup line describe policies to implement; the system currently keeps support records indefinitely and has no backup-expiry mechanism. Do not publish figures that are not enforced.\]

## 8. Automatizēti lēmumi un profilēšana

Debašu vērtējumi, nosacījumu atzīmes un spriedumi ir automatizēti **argumentu, nevis personu** novērtējumi. Tie jums nerada juridiskas sekas un līdzīgā veidā jūs būtiski neietekmē. Mēs nepieņemam nevienu lēmumu par jums, kurš ir balstīts tikai uz automatizētu apstrādi un kuram ir juridiskas vai līdzīgi būtiskas sekas, un mēs jūs neprofilējam.

Ja mēs kādreiz automatizēsim lēmumu par jūsu kontu — tā darbības apturēšanu vai atteikumu publicēt debates — persona pārskatīs katru šādu lēmumu, pirms tas stājas spēkā, vai pēc jūsu pieprasījuma; jūs varēsiet izteikt savu viedokli un apstrīdēt lēmumu. Noteikumos ir aprakstīts, kā to izdarīt.

## 9. Drošība un rīcība, ja kaut kas noiet greizi

Paroles tiek pārveidotas jaucējvērtībās, izmantojot Argon2id. Divfaktoru autentifikācija ir obligāta. Jūsu e-pasta adrese, debates, atbalsta sarunas un autentifikācijas slepenās atslēgas miera stāvoklī tiek šifrētas ar tieši jūsu kontam paredzētām atslēgām, un publicēto debašu atslēgas tiek glabātas atsevišķi no privāto debašu atslēgām. Piekļuve produkcijas datiem tiek reģistrēta. IP adreses un pārlūkprogrammas informācija mūsu drošības žurnālā tiek glabātas tikai kā vienvirziena īssavilkumi.

Ja notiek personas datu aizsardzības pārkāpums, mēs 72 stundu laikā paziņojam Rumānijas uzraudzības iestādei, ja to prasa tiesību akti, un bez nepamatotas kavēšanās paziņojam jums tieši, ja pārkāpums var radīt augstu risku jūsu tiesībām un brīvībām. B pielikumā ir uzskaitīti paziņošanas noteikumi, kas piemērojami citos mūsu apkalpotajos reģionos.

## 10. Jūsu tiesības un to izmantošana

Jūs varat bez maksas izmantot jebkuras no šīm tiesībām, rakstot uz **privacy@dezbatere.ro** vai sadaļā **Iestatījumi → Privātums**, ja tajā ir pieejama attiecīgā vadīkla. Mēs atbildēsim viena mēneša laikā; ja pieprasījums ir sarežģīts, mums var būt vajadzīgi vēl divi mēneši, un mēs jums paskaidrosim iemeslu. Mēs varam lūgt jums apstiprināt savu identitāti, izmantojot kontu.

| Tiesības | Ko tās nozīmē šajā gadījumā |
| --- | --- |
| **Piekļuve** (GDPR 15. pants; Art. 15) | Mūsu rīcībā esošo jūsu personas datu kopija un šī informācija. \[Pending: a JSON export from Settings. Until it exists, we compile the copy manually within the month.\] |
| **Labošana** (GDPR 16. pants; Art. 16) | Savas e-pasta adreses vai atkopšanas e-pasta adreses labošana Iestatījumos. Jūsu pseidonīmu nevar mainīt Noteikumos izskaidroto iemeslu dēļ; varat slēgt kontu un atvērt jaunu |
| **Dzēšana** (GDPR 17. pants; Art. 17) | Privātu debašu dzēšana jebkurā laikā debašu lapā. Konta slēgšana Iestatījumos; 7. sadaļā ir precīzi paskaidrots, ko tas nozīmē. Pieprasījums mums noņemt publicētas debates, kas satur jūsu datus, neatkarīgi no tā, vai esat to autors |
| **Ierobežošana** (GDPR 18. pants; Art. 18) | Pieprasījums mums pārtraukt konkrētu datu apstrādi, kamēr tiek atrisināts strīds par tiem |
| **Iebildums** (GDPR 21. pants; Art. 21) | Iebildums pret apstrādi, kas balstīta uz leģitīmām interesēm — 4. sadaļā minēto drošības un audita apstrādi —, un mēs to pārtrauksim, ja vien nevarēsim pierādīt pārliecinošu pamatojumu. Jebkurā laikā varat iebilst pret tirgvedību, un mēs to pārtrauksim |
| **Pārnesamība** (GDPR 20. pants; Art. 20) | Jūsu debates un konta dati plaši izmantotā, mašīnlasāmā formātā. \[Pending: same export as Access.\] Jūsu radītais saturs, kas nav personas dati, piemēram, jūsu jautājumi, pēc pieprasījuma tiek jums atdots, beidzoties līgumam |
| **Piekrišanas atsaukšana** (GDPR 7. panta 3. punkts; Art. 7(3)) | Tirgvedības piekrišanas atsaukšana jebkurā e-pasta ziņojumā vai Iestatījumos; piekrišanas sensitīvu datu apstrādei atsaukšana, neiekļaujot šādus datus vai dzēšot debates. Atsaukšana neietekmē jau notikušu apstrādi |
| **Sūdzība** | Rumānijas uzraudzības iestādei **ANSPDCP**, B-dul G-ral Gheorghe Magheru 28–30, Bukareste, <anspdcp@dataprotection.ro>, vai jūsu dzīvesvietas valsts uzraudzības iestādei. Mēs vēlētos, lai jūs vispirms sazinātos ar mums |

Mēs nekad neprasām maksu par pieprasījumu un nekad neizturamies pret jums nelabvēlīgāk tā iesniegšanas dēļ.

## 11. Debatēs minētas personas, kuras nav mūsu lietotāji

Ja kāds pakalpojumam DebateAI uzdod jautājumu, kurā esat minēts, mūsu rīcībā var būt jūsu personas dati, lai gan jūs nekad neesat izmantojis pakalpojumu. Noteikumi aizliedz lietotājiem tā rīkoties, un mēs samazinām MI pakalpojumu sniedzējiem nosūtāmās informācijas apjomu, tomēr tas notiek.

Šī sadaļa ir paziņojums, kas mums jums jāsniedz saskaņā ar GDPR 14. pantu. Dati ir lietotāja ievadītais un dzinēja atbildē ģenerētais saturs; avots ir šis lietotājs; nolūki un tiesiskais pamats ir norādīti 4. sadaļā; saņēmēji ir Reģistrā minētie MI pakalpojumu sniedzēji; glabāšana notiek saskaņā ar 7. sadaļu. Jums ir visas 10. sadaļā minētās tiesības, un jo īpaši jūs varat pieprasīt mums noņemt publicētas vai privātas debates, kas satur jūsu datus, un paziņot, kādi dati ir mūsu rīcībā. Lai to darītu, jums nav vajadzīgs konts. Rakstiet uz **privacy@dezbatere.ro** vai izmantojiet vadīklu **Ziņot** jebkurās publicētās debatēs; mēs bez nepamatotas kavēšanās rīkojamies attiecībā uz pamatotiem pieprasījumiem. Mēs nevaram jūs individuāli informēt, kad tas notiek, jo nezinām, kas jūs esat vai kā ar jums sazināties; tā vietā mēs nodrošinām šo publisko paziņojumu un noņemšanas iespēju.

Tas pats attiecas uz sensitīvu informāciju par jums — politiku, veselību, reliģiju —, kas parādās citas personas jautājumā. Pēc tam, kad esat iebildis, neviens juridiskais nosacījums mums neļauj turpināt tās apstrādi, un mēs to nedarīsim.

## 12. Bērni

DebateAI ir paredzēts pieaugušajiem. Reģistrējoties jūs apstiprināt, ka esat vismaz 18 gadus vecs, un mēs apzināti neapstrādājam nevienas personas, kas jaunāka par 18 gadiem, datus. Ja uzzinām, ka konts pieder personai, kura ir jaunāka par 18 gadiem, mēs to slēdzam un dzēšam datus, kā aprakstīts 7. sadaļā. Dažās valstīs apstiprinājums tiek uzskatīts par nepietiekamu vai tiek prasīts vairāk; B pielikumā ir norādīts, kas ir piemērojams katrā vietā, un Noteikumos ir paskaidrota mūsu rīcība.

## 13. Sīkdatnes

Mēs iestatām divas sīkdatnes, un abas ir absolūti nepieciešamas: viena nodrošina, ka pierakstīšanās saglabājas aktīva, bet otra aizsargā veidlapas pret viltošanu. Mēs neiestatām analītikas, reklāmas vai izsekošanas sīkdatnes. **Sīkdatņu politikā** vietnē \[dezbatere.ro/cookies\] tās ir uzskaitītas kopā ar to darbības ilgumu, paskaidrots, kā tiek saglabāta jūsu izvēle, un Sīkdatņu politika tiks mainīta pirms jebkuras citas sīkdatnes pievienošanas. Ja jūsu reģiona tiesību aktos pret dažām sīkdatnēm izturas atšķirīgi — piemēram, Apvienotās Karalistes atteikšanās noteikums attiecībā uz analītikas sīkdatnēm —, tas ir norādīts Sīkdatņu politikā.

## 14. Šīs politikas izmaiņas

Mainot šo politiku, mēs publicējam jauno versiju kopā ar izmaiņu kopsavilkumu un jaunu spēkā stāšanās datumu un saglabājam iepriekšējās versijas vietnē \[dezbatere.ro/privacy/versions\]. Par izmaiņām, ar kurām tiek pievienots jauns nolūks vai jauns saņēmējs, mēs jūs informējam pa e-pastu un produktā pirms jaunās apstrādes sākšanas un dodam laiku iebilst. Ja jauns nolūks ir atkarīgs no jūsu piekrišanas — piemēram, ja mēs kādreiz vēlētos izmantot saturu modeļu uzlabošanai —, mēs šādu piekrišanu lūdzam atsevišķi un konkrēti; atjaunināto Noteikumu akceptēšanu mēs nekad neuzskatām par piekrišanu jaunai apstrādei. Ja precizējumi neko nemaina mūsu darbībās, mēs vienkārši publicējam jauno versiju.

Šī politika pēdējo reizi atjaunināta \[date\]. Versija 3.0 aizstāja versiju 2.1, kurā sesiju dati, glabāšanas termiņi, analītika, eksportēšana un dzēšanas ietekme uz publicētajām debatēm bija aprakstīti veidā, kas vairs neatspoguļoja pakalpojumu.

## Annex B — Reģionālie privātuma noteikumi

Katrs ieraksts ir piemērojams tikai tad, ja tā reģions ir norādīts Noteikumu 2. sadaļā, un tajā ir norādītas tikai atšķirības no šīs politikas pamatdaļas.

### B.1 Eiropas Savienība un Eiropas Ekonomikas zona

Šīs politikas pamatdaļa ir paredzēta jums. Mūsu uzraudzības iestāde ir Rumānijas **ANSPDCP**; jūs varat iesniegt sūdzību arī savas dzīvesvietas valsts uzraudzības iestādei. Lietotājiem Rumānijā: šī politika rumāņu valodā ir pieejama vietnē \[URL\].

### B.2 Apvienotā Karaliste *(tikai tad, ja norādīta)*

Mūsu pārstāvis Apvienotajā Karalistē saskaņā ar UK GDPR 27. pantu ir **\[name, address, email\]**; varat ar to sazināties par jebkuru jautājumu saistībā ar šo politiku. Uzraudzības iestāde ir **Information Commissioner's Office**, [ico.org.uk](https://ico.org.uk). Jūs varat iesniegt mums sūdzību, izmantojot veidlapu vietnē \[URL\], un mēs 30 dienu laikā apstiprināsim tās saņemšanu. Jūsu datu nosūtīšana no Apvienotās Karalistes uz MI pakalpojumu sniedzējiem Amerikas Savienotajās Valstīs balstās uz \[the UK Extension to the EU–US Data Privacy Framework, where the provider is certified / the UK International Data Transfer Addendum to the EU standard contractual clauses\], ko papildina datu nosūtīšanas riska novērtējums. Ja mēs kādreiz iestatītu analītikas sīkdatnes, Apvienotajā Karalistē uz tām attiektos atteikšanās, nevis piekrišanas prasība; pašlaik mēs tādas neiestatām. Ja esat jaunāks par 18 gadiem un piekļūstat pakalpojumam, neraugoties uz mūsu vecuma ierobežojumu, uz mūsu veikto jūsu datu apstrādi attiecas ICO Bērnu kodeksa standarti.

### B.3 Amerikas Savienotās Valstis *(tikai tad, ja norādītas)*

**Paziņojums datu vākšanas brīdī.** 2. sadaļas tabulā ir norādīta katra mūsu vāktās personas informācijas kategorija, tās nolūks un glabāšanas ilgums (7. sadaļa). Mēs vācam šādas *sensitīvas* personas informācijas kategorijas tikai tad, ja tās iekļaujat savos jautājumos: \[health, religious or philosophical beliefs, sexual orientation, union membership, political views\], un izmantojam tās tikai jūsu debašu vadīšanai. **Mēs nepārdodam un nekopīgojam personas informāciju un neesam to darījuši iepriekšējos divpadsmit mēnešos.** Mēs neizmantojam sensitīvu personas informāciju nekādiem nolūkiem, izņemot jūsu pieprasītā pakalpojuma sniegšanu. **Atteikšanās izvēles signāli:** mēs ievērojam Global Privacy Control signālus kā lūgumu atteikties no pārdošanas vai kopīgošanas, ko mēs nekādā gadījumā neveicam. **Jūsu tiesības:** zināt, dzēst, labot, atteikties, ierobežot sensitīvas personas informācijas izmantošanu un netikt diskriminētam šo tiesību izmantošanas dēļ; iesniedziet pieprasījumu, rakstot uz privacy@dezbatere.ro vai izmantojot \[toll-free number / form\]. **Finansiāli stimuli:** mēs tādus nepiedāvājam; bezmaksas un maksas plānos attieksme pret jūsu datiem neatšķiras. **Glabāšana** ir aprakstīta 7. sadaļā. Šis paziņojums tiek atjaunināts vismaz reizi divpadsmit mēnešos; pēdējo reizi atjaunināts \[date\].

*Vašingtona:* mūsu atsevišķais dokuments **Patērētāju veselības datu privātuma paziņojums** vietnē \[URL\] attiecas uz jebkādu ar veselību saistītu informāciju, tostarp secinājumiem. *Teksasa un Nebraska:* mēs nepārdodam sensitīvus personas datus; ja tas kādreiz mainītos, mēs vispirms saņemtu jūsu piekrišanu \[statutory language\]. *Kolorādo, Konektikuta, Virdžīnija un citi štati ar visaptverošiem privātuma tiesību aktiem:* iepriekš minētās tiesības jums ir piemērojamas, ja attiecīgie tiesību akti ir piemērojami mums; pārsūdziet atteikumu izpildīt pieprasījumu, rakstot uz \[appeals@dezbatere.ro\].

### B.4 Kanāda un Kvebeka *(tikai tad, ja norādītas)*

Mūsu privātuma speciālists ir **\[name, email\]**. Mēs saglabājam atbildību par personas informāciju, ko nosūtām MI pakalpojumu sniedzējiem ārpus Kanādas, un ar līgumiem pieprasām līdzvērtīgu aizsardzību; uz šiem pakalpojumu sniedzējiem var attiekties to darbības valstu tiesību akti, tostarp iestāžu likumīga piekļuve. Tirgvedības e-pasta ziņojumi tiek sūtīti tikai ar jūsu nepārprotamu piekrišanu saskaņā ar CASL. **Kvebeka:** pirms personas informācijas nosūtīšanas ārpus Kvebekas mēs veicam privātuma ietekmes novērtējumu; iestatījumi, kas nodrošina jūsu debašu privātumu, ir ieslēgti pēc noklusējuma; varat mums lūgt atcelt indeksēšanu vai pārtraukt personas informācijas izplatīšanu par jums; varat pieprasīt savus datus strukturētā, plaši izmantotā formātā; 8. sadaļā ir aprakstīta mūsu automatizētā apstrāde.

### B.5 Austrālija un Jaunzēlande *(tikai tad, ja norādītas)*

**Austrālija.** Jūsu personas informācijas saņēmēji ārvalstīs ir Reģistrā norādītie MI pakalpojumu sniedzēji un apstrādātāji, kas atrodas \[the United States and the European Union\]; mēs veicam pamatotus pasākumus, lai nodrošinātu, ka tie apstrādā šo informāciju saskaņā ar Austrālijas privātuma principiem. **Automatizēti lēmumi:** no 2026. gada 10. decembra šajā politikā ir norādīti datorprogrammu pieņemto lēmumu veidi, kas būtiski ietekmē jūsu tiesības vai intereses — tādu nav; vērtējumi un spriedumi attiecas uz argumentiem, nevis jums —, kā arī tajos izmantotā personas informācija. Sūdzības var iesniegt **Office of the Australian Information Commissioner**. **Jaunzēlande.** Mūsu privātuma speciālists ir \[name\]. Ja mēs personas informāciju par jums vācam netieši — jo cits lietotājs to ir iekļāvis jautājumā —, šī politika un 11. sadaļa ir paziņojums, ko jums sniedzam. Mēs izpaužam datus Reģistrā norādītajiem MI pakalpojumu sniedzējiem kā apstrādātājiem, kas rīkojas mūsu vārdā, saskaņā ar līgumiem, kuros noteiktas līdzvērtīgas garantijas. Sūdzības var iesniegt **Office of the Privacy Commissioner**.

### B.6 Latīņamerika *(pielikums spāņu valodā; tikai tad, ja norādīta)*

&#91;Published in Spanish.\] Piekrišana ir apstrādes pamats, ja nepastāv līgumiska nepieciešamība. ARCO tiesības — piekļuve, labošana, dzēšana, iebildums — var izmantot, rakstot uz privacy@dezbatere.ro, un atbildes tiek sniegtas \[per country\] laikā. *Meksika:* pilns *aviso de privacidad* ar obligātajiem elementiem ir pieejams vietnē \[URL\]. *Argentīna:* \[AAIP mandatory legend\]; dati ir reģistrēti \[…\]. *Kolumbija:* mūsu *política de tratamiento de datos* ir pieejama vietnē \[URL\]; iestāde ir SIC. *Čīle* (no 2026. gada 1. decembra): Aģentūras kontaktinformācija ir \[…\]; 8. sadaļā ir aprakstīta mūsu automatizētā apstrāde.

### B.7 Persijas līcis — AAE un Saūda Arābija *(tikai tad, ja norādītas)*

Ja apstrādājam jūsu datus citiem nolūkiem, nevis pakalpojuma sniegšanai, mēs balstāmies uz jūsu piekrišanu, ko varat atsaukt. Jūsu dati tiek nosūtīti ārpus \[UAE / Kingdom of Saudi Arabia\] un apstrādāti Eiropas Savienībā un Amerikas Savienotajās Valstīs saskaņā ar \[SDAIA standard contractual clauses / the mechanism in the Register\]. Tirgvedības informācija tiek sūtīta tikai ar jūsu piekrišanu. Neiekļaujiet savos jautājumos sensitīvus personas datus.

### B.8 Āzijas un Klusā okeāna reģions *(tikai rindas par norādītajiem reģioniem)*

*Singapūra:* mūsu datu aizsardzības speciālists ir **\[name, email\]**; datu nosūtīšanas pamatā ir līgumiskas saistības, kas nodrošina PDPA līdzvērtīgu aizsardzību; par paziņojamiem pārkāpumiem mēs informējam PDPC 3 dienu laikā. *Japāna:* mēs izmantojam jūsu personas informāciju 4. sadaļā minētajiem nolūkiem un nekādiem citiem; jūsu saturs tiek nosūtīts pakalpojumu sniedzējiem šādās valstīs: \[named countries — e.g. the United States\], kuru privātuma režīmi un garantijas ir aprakstīti Reģistrā, un jūs tam piekrītat reģistrācijas laikā. *Dienvidkoreja:* mūsu privātuma speciālists ir **\[name\]**; ārvalstu datu nosūtīšanas vienumi, galamērķis, laiks, saņēmējs, nolūks un glabāšana ir norādīti Reģistrā; jūsu jautājumos ietvertie politiskie uzskati ir sensitīva informācija, un mēs tos apstrādājam tikai jūsu debašu vadīšanai; piekrišanas neobligātai apstrādei tiek iegūtas atsevišķi. *Indija* (tiklīdz kļūst piemērojami DPDP noteikumi): ir piemērojams atsevišķais piekrišanas paziņojums vietnē \[URL\]; uz pieprasījumiem tiek atbildēts 90 dienu laikā; lietotājiem, kas jaunāki par 18 gadiem, nepieciešama pārbaudāma vecāku piekrišana. *Filipīnas:* mūsu datu aizsardzības speciālists ir \[name\]; sūdzības var iesniegt National Privacy Commission; 8. sadaļā ir aprakstīta automatizētā apstrāde. *Taizeme:* mūsu pārstāvis ir \[name\] \[if appointed\].

### B.9 Rezervēts

Katrā no šīm valstīm — Turcijā, Brazīlijā un Indonēzijā — ir vajadzīgs paziņojums vietējā valodā, pārstāvis vai reģistrācija un dokumentu iesniegšana; šīs valstis šeit nav aplūkotas. Ķīnā, Vjetnamā un Krievijā pakalpojums netiek sniegts.
