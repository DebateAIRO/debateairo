# DebateAI — Zásady ochrany osobních údajů

<!-- legal-chrome
summaryTitle: Stručně
eyebrow: ZÁSADY OCHRANY OSOBNÍCH ÚDAJŮ · v3.0 · ÚČINNÉ OD [DATE]
title: Co uchováváme a proč
lede: Vaše práva a naše povinnosti podle GDPR (EU) 2016/679 srozumitelným jazykem. Čtrnáct oddílů a příloha B — přejděte až na konec.
endMarker: KONEC ZÁSAD · GDPR (EU) 2016/679 · v3.0
bodyLabel: Text zásad ochrany osobních údajů
annexTitle: Příloha B — Regionální podmínky ochrany osobních údajů
jumps:
01 SPRÁVCE
02 CO SHROMAŽĎUJEME
04 PRÁVNÍ ZÁKLAD
05 MODELY A PŘEDÁVÁNÍ
06 ZVEŘEJŇOVÁNÍ
07 DOBA UCHOVÁNÍ
10 VAŠE PRÁVA PODLE GDPR
13 SOUBORY COOKIE
-->

2026-09-21 · @Someone

**Návrh v3.0 ke kontrole právním poradcem — nahrazuje nasazenou verzi v2.1 (`apps/ui/lib/privacyPolicy.ts`). Nejedná se o právní poradenství.** Tato verze popisuje skutečné fungování kódu a opravuje pět tvrzení ve verzi v2.1, která byla s kódem v rozporu: údaje o relacích, doby uchovávání, analytiku, export a to, co se při výmazu stane se zveřejněnými debatami. Hranaté závorky označují údaje, které můžete doplnit pouze vy; \[pending\] označuje funkci popsanou v těchto zásadách, která dosud nebyla vytvořena a musí existovat před zveřejněním zásad.

**Version 3.0 · Effective \[date\] · Předchozí verze na dezbatere.ro/privacy/versions · Správce: DebateAIRO S.R.L., Bukurešť**

**In short.** Shromažďujeme údaje nezbytné pro účet a údaje, které se rozhodnete zadat. Vaše otázky jsou předávány poskytovatelům AI uvedeným v našem Registru; nepoužívají se k trénování modelů. Debaty jsou soukromé, dokud je nezveřejníte. Výmaz účtu zničí klíče k vašim údajům a odstraní vaše zveřejněné debaty. Můžete nás kontaktovat na privacy@dezbatere.ro a osoby uvedené v debatě mohou požádat o odstranění i bez účtu.

## 1. Kdo odpovídá za vaše údaje

Správcem vašich osobních údajů je **DebateAIRO S.R.L.**, \[address\], Bukurešť, Rumunsko, obchodní rejstřík \[J40/…\], CUI \[…\]. Ve všech záležitostech týkajících se těchto zásad pište na **privacy@dezbatere.ro**; odpovíme do jednoho měsíce. Pověřence pro ochranu osobních údajů jsme nejmenovali, protože nám to zákon neukládá; tuto adresu sleduje \[role\]. Pokud jsme pro konkrétní zemi jmenovali zástupce nebo pracovníka pro ochranu soukromí, jsou uvedeni v příloze B.

## 2. Jaké údaje shromažďujeme a odkud pocházejí

Shromažďujeme pouze údaje, které účet potřebuje ke svému fungování, které se nám rozhodnete poskytnout a které nám zákon ukládá uchovávat.

| Kategorie | Přesný obsah | Zdroj |
| --- | --- | --- |
| **Účet** | E-mailová adresa a e-mailová adresa pro obnovení (uložené šifrovaně, s indexem založeným na klíči, abychom mohli účet vyhledat bez přečtení adresy); heslo (uložené jako hash, nikdy v otevřené podobě); tajný údaj pro dvoufaktorové ověřování (šifrovaný); deset obnovovacích kódů (uložených jako hashe); váš pseudonym; okamžik, kdy jste potvrdili, že je vám alespoň 18 let | Vy při registraci |
| **Relace a zabezpečení** | Hashovaný token relace; hash řetězce user-agent vašeho prohlížeče založený na klíči, který slouží ke zjištění přesunu relace do jiného prohlížeče; časové údaje o vytvoření, posledním použití a skončení platnosti. S relací **neukládáme** vaši IP adresu, název zařízení ani podrobnosti o prohlížeči a seznam relací, který vidíte v Nastavení, zobrazuje pouze časové údaje | Váš prohlížeč |
| **Bezpečnostní auditní stopa** | Protokol bezpečnostně významných událostí pouze s možností připojování — registrace, ověření, pokusy o přihlášení, obnovení, zveřejnění a výmaz. IP adresa a user-agent každé události se ukládají pouze jako jednosměrné hashe založené na klíči (Argon2id), takže je nelze zpětně přečíst, ale lze je v určitém období porovnat. Rizikové signály přihlášení a obnovení se uchovávají šifrovaně po dobu 90 dnů | Váš prohlížeč v okamžiku každé události |
| **Obsah debaty** | Otázka, kterou zadáte; řídicí anotace, které nastavíte; tvrzení, kritiky, odkazy na důkazy, hodnocení a závěry vytvořené systémem; doslovný záznam odpovědí jednotlivých poskytovatelů AI; vyhledávací dotazy a odkazy na zdroje. Vše je uloženo šifrovaně pod klíčem určeným konkrétně pro váš účet | Vy a modely AI pracující na vaší otázce |
| **Podpora** | Zprávy, které si vyměníte s asistentem podpory nebo osobou, uložené šifrovaně; použitý jazyk; zda jste asistentovi dovolili zobrazit stav (nikoli obsah) vašich debat; vámi udělená hodnocení. Pokud zpráva aktivuje kontrolní mechanismy proti zneužití, uchováme hash zprávy a hash IP adresy, ze které pochází | Vy |
| **Záznamy o přijetí a souhlasech** | Verze a hash obsahu Podmínek, které jste přijali, a zásad, jež vám byly zobrazeny; čas; použitá obrazovka a mechanismus; váš jazyk; vaše IP adresa a user-agent v daném okamžiku; každý udělený či odvolaný souhlas a okamžik tohoto úkonu | Váš prohlížeč při registraci a při každé změně volby |
| **Platby** \[pending — once a paid plan exists\] | Tarif, cena, fakturační období, odkazy na transakce a doklady o místě zdanění. Údaje o kartě uchovává náš poskytovatel platebních služeb, nikoli my | Vy a poskytovatel platebních služeb |
| **Osoby, které nejsou našimi uživateli** | Osobní údaje o jiných osobách, které uvedete v otázce nebo které systém vytvoří při odpovědi. Žádáme vás, abyste tak nečinili; oddíl 11 vysvětluje, jak postupujeme, pokud k tomu přesto dojde | Vy, nepřímo |

**Neshromažďujeme** analytické ani telemetrické údaje o vašem používání produktu a za tímto účelem nenastavujeme žádné soubory cookie. Pokud se to změní, nejprve změníme tyto zásady a Zásady používání souborů cookie a požádáme vás o vyjádření.

## 3. Citlivé informace

Debatní systém vybízí k otázkám o politice, náboženství, zdraví, sexualitě a přesvědčení. Jde o zvláštní kategorie údajů podle článku 9 GDPR a mohou se objevit ve vašich otázkách bez ohledu na to, zda je zamýšlíme shromažďovat.

**O vás.** Při registraci udělujete samostatnou větou výslovný souhlas se zpracováním citlivých informací, které se rozhodnete zahrnout do vlastních otázek, za účelem vedení vašich debat. Souhlas můžete kdykoli odvolat tím, že takové informace nebudete uvádět, nebo výmazem debaty. Informace, které o sobě zveřejníte, jsou údaje, které jste se rozhodli zveřejnit.

**O jiných osobách.** Žádná právní podmínka nám neumožňuje zpracovávat citlivé údaje o třetí osobě, kterou uvedete v otázce, a žádnou takovou podmínku nemá ani žádný z našich poskytovatelů AI. Proto to Podmínky zakazují, proto minimalizujeme předávané údaje a proto takový obsah na žádost rychle odstraňujeme — viz oddíl 11.

**Informace o zdravotním stavu.** Některé země upravují údaje související se zdravím, včetně odvozených závěrů, zvláštními právními předpisy. Pokud žijete ve \[the State of Washington\], použije se samostatné \[Consumer Health Data Privacy Notice\].

## 4. Proč vaše údaje používáme a na jakém základě

Každý účel má jeden právní základ podle článku 6 odst. 1 GDPR a údaje shromážděné pro jeden účel nepoužíváme znovu pro jiný účel.

| Účel | Údaje | Právní základ |
| --- | --- | --- |
| Vytvoření a provoz vašeho účtu, ověřování vaší totožnosti a vedení a ukládání vašich debat, abyste je mohli znovu otevřít a přehrát | Účet, relace, obsah debaty | **Smlouva** — Art. 6(1)(b) |
| Předávání vaší otázky a výroků systému poskytovatelům AI za účelem vytvoření debaty | Obsah debaty | **Smlouva** — Art. 6(1)(b) |
| Zajištění bezpečnosti služby, odhalování zneužití, možnost rozpoznat přihlášení, které jste neprovedli, a vedení auditní stopy | Relace, bezpečnostní auditní stopa, hashe podpory související se zneužitím | **Oprávněné zájmy** — Art. 6(1)(f): naše i vaše na bezpečné službě. Můžete vznést námitku; viz oddíl 10 |
| Prokázání, že jste přijali Podmínky a udělili nebo odvolali souhlas | Záznamy o přijetí a souhlasech | **Právní povinnost** — Art. 6(1)(c), naše povinnost prokázat souhlas podle Art. 7(1) — a oprávněné zájmy na doložení smlouvy |
| Vyřizování žádostí o podporu | Podpora | **Smlouva** — Art. 6(1)(b) |
| Zpracování citlivých informací, které o sobě uvedete | Obsah debaty | **Výslovný souhlas** — Art. 9(2)(a), udělený samostatně při registraci |
| Zveřejnění debaty, kterou se rozhodnete zveřejnit | Obsah debaty, pseudonym | **Smlouva** — Art. 6(1)(b), na váš pokyn; u citlivých údajů o vás Art. 9(2)(e) — údaje, které jste zjevně zveřejnili |
| Zasílání novinek o produktu | E-mailová adresa | **Souhlas** — Art. 6(1)(a), předem nezaškrtnuté políčko; kdykoli jej odvolejte v kterémkoli e-mailu nebo v Nastavení |
| Plnění daňových, účetních a právních povinností \[pending paid plans\] | Platby, záznamy o přijetí | **Právní povinnost** — Art. 6(1)(c) |
| Vyřizování právních žádostí, hlášení nezákonného obsahu a našich povinností poskytovatele hostingových služeb | Vše, co je pro žádost relevantní | **Právní povinnost** — Art. 6(1)(c) — a oprávněné zájmy |

Nevytváříme o vás profily, nepoužíváme vaše údaje k reklamě a neprodáváme je. Váš obsah nepoužíváme k trénování modelů a nedovolujeme to ani našim poskytovatelům — viz oddíl 5.

## 5. Poskytovatelé AI a mezinárodní předávání údajů

**Co se odesílá.** Za účelem vedení debaty posíláme jednomu či více externím poskytovatelům AI text: vaši otázku, vámi nastavené řídicí anotace a výroky, které systém sestavuje v průběhu debaty. Poskytovatel tedy vidí text odvozený z toho, co jste zadali, a vytvořený na tomto základě. Nikdy neobdrží vaši e-mailovou adresu, identifikátory účtu nebo relace, IP adresu ani platební údaje.

**Kteří poskytovatelé.** Jsou uvedeni v našem **Registru poskytovatelů AI** na adrese \[dezbatere.ro/providers\], který je součástí těchto zásad. U každého poskytovatele Registr uvádí jeho právnickou osobu a zemi usazení; co přijímá a za jakým účelem; země nebo regiony, kde údaje zpracovává; jeho podmínky uchovávání a to, zda je pro koncový bod a funkce, které používáme, aktivní režim nulového uchovávání údajů; zda smí podle naší smlouvy používat vstupy k trénování; mechanismus předávání, o který se opíráme; a datum posledního ověření každého záznamu. Poskytovatelé se mohou měnit; Registr je verzován a změna je v něm zaznamenána.

**Trénování a uchovávání jsou odlišné věci.** Naše smlouvy s poskytovateli vylučují použití vašeho obsahu k trénování nebo zlepšování jejich modelů. \[Publish only once verified per route.\] Někteří poskytovatelé uchovávají zadání a odpovědi po omezenou dobu kvůli bezpečnosti, prevenci zneužití nebo vlastním právním povinnostem; Registr uvádí jak dlouho a proč. Je-li aktivní nulové uchovávání údajů, Registr uvádí tuto skutečnost i funkce, na které se vztahuje. Nebudeme tvrdit, že obsah není uchováván, pokud tomu tak není.

**Předávání mimo EHP.** Poskytovatelé usazení ve Spojených státech přijímají údaje na základě jednoho z mechanismů kapitoly V GDPR: rámce EU–USA pro ochranu osobních údajů, pokud je konkrétní smluvní subjekt pro tyto údaje certifikován, nebo standardních smluvních doložek Evropské komise (modul dva, správce zpracovateli), podpořených posouzením rizik předávání a doplňkovými opatřeními. Registr uvádí mechanismus pro každého poskytovatele. Kopii doložek, o které se opíráme, můžete získat písemnou žádostí na privacy@dezbatere.ro. Pokud je mechanismus, o který se opíráme, zneplatněn, před pokračováním v předávání přejdeme na jiný a informujeme vás.

**Další příjemci.** Náš poskytovatel hostingu \[Hetzner, Germany — region …\]; náš poskytovatel doručování obsahu a přenosu \[Cloudflare\]; náš e-mailový přenosový poskytovatel \[…\]; \[our payment provider, once a paid plan exists\]. Každý jedná podle našich doložených pokynů na základě smlouvy o zpracování údajů se zárukami vyžadovanými článkem 28 a každý je uveden v Registru společně se svou lokalitou a mechanismem předávání. Žádnému zpracovateli nedovolujeme používat vaše údaje pro vlastní účely. Pokud by tak poskytovatel činil, byl by samostatným správcem a vaše údaje bychom mu neposílali.

**Orgány veřejné moci.** Osobní údaje zpřístupňujeme soudům, regulačním orgánům nebo donucovacím orgánům, pokud to vyžaduje zákon, a informujeme vás o tom, pokud nám v tom zákon nebrání.

## 6. Zveřejňování a viditelnost

Debaty jsou soukromé, dokud je nezveřejníte. Zveřejnění je úmyslný, samostatně potvrzený úkon. Zveřejněná debata zobrazuje váš **pseudonym**, otázku přesně tak, jak jste ji napsali, strom argumentů, hodnocení, závěr a interval spolehlivosti a nese viditelné označení, že obsah vytvořila AI. Nikdy nezobrazuje vaši e-mailovou adresu, záznamy relací ani historii účtu. \[Published debates are / are not\] indexovány vyhledávači \[unless you choose\].

Zrušení zveřejnění odstraní debatu z DebateAI a zničí klíč k naší veřejné kopii. Kopie, které již vytvořili čtenáři, vyhledávače nebo archivy, jsou mimo naši kontrolu a nemůžeme je vzít zpět.

Když svůj účet vymažete, bez zbytečného odkladu a nejpozději do 30 dnů odstraníme z veřejného přístupu každou vámi zveřejněnou debatu, pokud nám zákon neukládá uchovat konkrétní položku. \[Option B — a product change; see the Terms, section 9.\]

## 7. Jak dlouho údaje uchováváme

| Údaje | Doba uchování | Následný postup |
| --- | --- | --- |
| Účet | Po dobu existence účtu a sedmidenní ochrannou lhůtu poté, co požádáte o jeho uzavření | Klíče jsou zničeny; záznam je vymazán |
| Záznamy relací | 14 dnů od posledního použití nebo 90 dnů od vytvoření, podle toho, co nastane dříve | Vymazány |
| Odkazy pro ověření e-mailu | 24 hodin | Vymazány |
| Rizikové signály přihlášení a obnovení | 90 dnů, vynuceno databází | Odstraněny |
| Bezpečnostní auditní stopa | Po dobu existence služby | Pouze s možností připojování; IP adresa a user-agent jsou jednosměrné hashe a nelze je zpětně přečíst |
| Obsah debaty (soukromý) | Po dobu existence účtu | Při uzavření jsou zničeny klíče, čímž se obsah stane nečitelným |
| Obsah debaty (zveřejněný) | Po dobu zveřejnění a existence účtu | Při zrušení zveřejnění nebo uzavření účtu je odstraněn z veřejného přístupu; klíče jsou zničeny |
| Záznamy odpovědí poskytovatelů a odkazy pro vyhledávání | Stejně jako debata, ke které patří | Stejný postup |
| Konverzace a případy podpory | \[Until closed plus 12 months\] | Klíče jsou zničeny |
| Záznamy o přijetí a souhlasech | Po dobu existence účtu a dalších 6 let — nejdelší promlčecí lhůta, která se na nás vztahuje | Vymazány |
| Záznamy o platbách \[pending\] | 10 let, jak vyžadují rumunské účetní předpisy | Vymazány |
| Zálohy \[pending\] | \[… days\] po vymazání aktivní kopie | Přepsány |

**Co výmaz ve skutečnosti znamená.** Vaše debaty a údaje účtu jsou šifrovány pomocí klíčů určených konkrétně pro váš účet a jednotlivé debaty. Výmaz účtu tyto klíče zničí, po čemž zašifrované záznamy nemůžeme přečíst my ani nikdo jiný, a záznam účtu vymažeme. Označujeme to jako výmaz, protože takový je jeho účinek, a máme pro něj zdokumentované posouzení; chcete-li vědět více, zeptejte se. Je třeba vědět tři věci: bezpečnostní auditní stopa je pouze doplňována a nemaže se, neobsahuje však žádné vaše čitelné identifikátory; malý počet starších debat vznikl před naším současným systémem šifrování, a pokud se to týká vašeho účtu, sdělíme vám, čeho u nich uzavření účtu dosáhne; a kopie údajů, které již byly odeslány poskytovateli AI, se řídí podmínkami uchovávání daného poskytovatele v Registru, nikoli naším výmazem.

&#91;The support retention period and the backup line describe policies to implement; the system currently keeps support records indefinitely and has no backup-expiry mechanism. Do not publish figures that are not enforced.\]

## 8. Automatizovaná rozhodnutí a profilování

Hodnocení, značky podmínek a závěry v debatě jsou automatizovaným hodnocením **argumentů, nikoli osob**. Nemají pro vás právní účinky ani vás obdobně významně neovlivňují. Nečiníme o vás žádná rozhodnutí, která by byla založena výhradně na automatizovaném zpracování a měla právní nebo obdobně významné účinky, a neprovádíme vaše profilování.

Pokud bychom někdy automatizovali rozhodnutí o vašem účtu — například jeho pozastavení nebo odmítnutí zveřejnit debatu — před nabytím účinku nebo na vaši žádost je přezkoumá člověk, budete moci vyjádřit svůj názor a rozhodnutí napadnout. Postup popisují Podmínky.

## 9. Zabezpečení a postup v případě problému

Hesla jsou hashována pomocí Argon2id. Dvoufaktorové ověřování je povinné. Vaše e-mailová adresa, debaty, konverzace s podporou a tajné ověřovací údaje jsou v úložišti šifrovány pomocí klíčů určených konkrétně pro váš účet a klíče zveřejněných debat jsou uchovávány odděleně od klíčů soukromých debat. Přístup k produkčním údajům se zaznamenává. IP adresy a podrobnosti o prohlížeči v našem bezpečnostním protokolu se ukládají pouze jako jednosměrné hashe.

Pokud dojde k porušení zabezpečení osobních údajů, oznámíme je rumunskému dozorovému úřadu do 72 hodin, vyžaduje-li to zákon, a bez zbytečného odkladu informujeme přímo vás, pokud je pravděpodobné, že porušení povede k vysokému riziku pro vaše práva a svobody. Příloha B uvádí pravidla oznamování platná v dalších regionech, ve kterých službu poskytujeme.

## 10. Vaše práva a způsob jejich uplatnění

Kterékoli z těchto práv můžete bezplatně uplatnit písemnou žádostí na **privacy@dezbatere.ro** nebo v nabídce **Nastavení → Soukromí**, pokud je příslušný ovládací prvek k dispozici. Odpovíme do jednoho měsíce; je-li žádost složitá, můžeme lhůtu prodloužit až o další dva měsíce a sdělíme vám proč. Můžeme vás požádat o potvrzení totožnosti prostřednictvím vašeho účtu.

| Právo | Co zde znamená |
| --- | --- |
| **Přístup** (Art. 15) | Kopie osobních údajů, které o vás uchováváme, a tyto informace. \[Pending: a JSON export from Settings. Until it exists, we compile the copy manually within the month.\] |
| **Oprava** (Art. 16) | Opravte svou e-mailovou adresu nebo e-mailovou adresu pro obnovení v Nastavení. Váš pseudonym nelze z důvodů uvedených v Podmínkách změnit; účet můžete uzavřít a otevřít nový |
| **Výmaz** (Art. 17) | Soukromou debatu můžete kdykoli vymazat na její stránce. Uzavřete účet v Nastavení; oddíl 7 přesně vysvětluje následky. Požádejte nás o odstranění zveřejněné debaty obsahující vaše údaje bez ohledu na to, zda jste jejím autorem |
| **Omezení zpracování** (Art. 18) | Požádejte nás, abychom přestali zpracovávat určité údaje, dokud nebude vyřešen spor, který se jich týká |
| **Námitka** (Art. 21) | Vzneste námitku proti zpracování založenému na oprávněných zájmech — bezpečnostnímu a auditnímu zpracování podle oddílu 4 — a my je ukončíme, pokud neprokážeme závažné oprávněné důvody. Proti marketingu můžete vznést námitku kdykoli a my jej ukončíme |
| **Přenositelnost** (Art. 20) | Vaše debaty a údaje účtu v běžně používaném, strojově čitelném formátu. \[Pending: same export as Access.\] Neosobní obsah, který jste vytvořili, například vaše otázky, vám na požádání vrátíme při skončení smlouvy |
| **Odvolání souhlasu** (Art. 7(3)) | Odvolejte souhlas s marketingem v kterémkoli e-mailu nebo v Nastavení; souhlas s citlivými údaji odvolejte tím, že takové údaje nebudete uvádět, nebo výmazem debaty. Odvolání nemá vliv na zpracování, které již proběhlo |
| **Stížnost** | Rumunskému dozorovému úřadu **ANSPDCP**, B-dul G-ral Gheorghe Magheru 28–30, Bukurešť, <anspdcp@dataprotection.ro>, nebo úřadu v zemi vašeho bydliště. Budeme raději, když se nejprve obrátíte na nás |

Za žádost nikdy neúčtujeme poplatek a za její podání s vámi nikdy nezacházíme méně příznivě.

## 11. Osoby uvedené v debatách, které nejsou našimi uživateli

Pokud někdo položí DebateAI otázku, ve které vás uvede, můžeme o vás uchovávat osobní údaje, přestože jste službu nikdy nepoužili. Podmínky uživatelům takový postup zakazují a minimalizujeme údaje předávané poskytovatelům AI, přesto k tomu dochází.

Tento oddíl je oznámením, které vám dlužíme podle článku 14 GDPR. Údaje představují vše, co uživatel zadal a co systém vytvořil jako odpověď; zdrojem je tento uživatel; účely a právní základy jsou uvedeny v oddílu 4; příjemci jsou poskytovatelé AI uvedení v Registru; uchovávání se řídí oddílem 7. Máte všechna práva uvedená v oddílu 10 a zejména nás můžete požádat o odstranění zveřejněné nebo soukromé debaty obsahující vaše údaje a o sdělení údajů, které uchováváme. Nepotřebujete k tomu účet. Napište na **privacy@dezbatere.ro** nebo použijte ovládací prvek **Nahlásit** u kterékoli zveřejněné debaty a na odůvodněné žádosti zareagujeme bez zbytečného odkladu. Nemůžeme vás individuálně informovat, když k tomu dojde, protože nevíme, kdo jste ani jak vás kontaktovat; místo toho přijímáme opatření v podobě tohoto veřejného oznámení a možnosti požádat o odstranění.

Totéž platí pro citlivé informace o vás — politické názory, zdraví či náboženství — které se objeví v otázce někoho jiného. Jakmile vznesete námitku, žádná právní podmínka nám neumožňuje pokračovat v jejich zpracování, a nebudeme tak činit.

## 12. Děti

DebateAI je určena dospělým. Při registraci potvrzujete, že je vám alespoň 18 let, a vědomě nezpracováváme údaje žádné osoby mladší 18 let. Zjistíme-li, že účet patří osobě mladší 18 let, uzavřeme jej a údaje vymažeme způsobem popsaným v oddílu 7. Některé země považují potvrzení za nedostatečné nebo vyžadují další opatření; příloha B uvádí platná pravidla a Podmínky vysvětlují náš postup.

## 13. Soubory cookie

Nastavujeme dva soubory cookie, oba nezbytně nutné: jeden vás udržuje přihlášené a druhý chrání formuláře před paděláním. Nenastavujeme žádné analytické, reklamní ani sledovací soubory cookie. **Zásady používání souborů cookie** na adrese \[dezbatere.ro/cookies\] je uvádějí společně s dobou platnosti, vysvětlují ukládání vaší volby a budou změněny před přidáním jakéhokoli dalšího souboru cookie. Pokud právní předpisy vašeho regionu zacházejí s některými soubory cookie odlišně — například britské pravidlo odhlášení analytiky — uvádějí to Zásady používání souborů cookie.

## 14. Změny těchto zásad

Při změně těchto zásad zveřejníme novou verzi se shrnutím změn a novým datem účinnosti a předchozí verze ponecháme na \[dezbatere.ro/privacy/versions\]. O změně, která přidává nový účel nebo nového příjemce, vás informujeme e-mailem a v produktu před zahájením nového zpracování a poskytneme vám čas vznést námitku. Pokud nový účel závisí na vašem souhlasu — například kdybychom někdy chtěli používat obsah ke zlepšování modelů — požádáme o tento souhlas samostatně a konkrétně; přijetí aktualizovaných Podmínek nikdy nepovažujeme za souhlas s novým zpracováním. Upřesnění, která nic nemění na našem postupu, pouze zveřejníme v nové verzi.

Tyto zásady byly naposledy aktualizovány dne \[date\]. Verze 3.0 nahradila verzi 2.1, která popisovala údaje o relacích, doby uchovávání, analytiku, export a účinek výmazu na zveřejněné debaty způsobem, jenž již neodpovídal službě.

## Annex B — Regionální podmínky ochrany osobních údajů

Každá položka se použije pouze tehdy, je-li její region uveden v oddílu 2 Podmínek, a uvádí pouze odchylky od hlavní části těchto zásad.

### B.1 Evropská unie a Evropský hospodářský prostor

Hlavní část těchto zásad je určena pro vás. Naším dozorovým úřadem je rumunský **ANSPDCP**; stížnost můžete podat také úřadu v zemi svého bydliště. Rumunští uživatelé: tyto zásady jsou v rumunštině dostupné na \[URL\].

### B.2 Spojené království *(pouze je-li uvedeno)*

Naším zástupcem ve Spojeném království podle článku 27 britského GDPR je **\[name, address, email\]**; můžete jej kontaktovat ve všech záležitostech těchto zásad. Dozorovým úřadem je **Information Commissioner's Office**, [ico.org.uk](https://ico.org.uk). Stížnost nám můžete podat prostřednictvím formuláře na \[URL\] a její přijetí potvrdíme do 30 dnů. Předávání vašich údajů ze Spojeného království poskytovatelům AI ve Spojených státech je založeno na \[the UK Extension to the EU–US Data Privacy Framework, where the provider is certified / the UK International Data Transfer Addendum to the EU standard contractual clauses\] a podpořeno posouzením rizik předávání. Pokud bychom někdy nastavili analytické soubory cookie, ve Spojeném království by podléhaly možnosti odhlášení namísto souhlasu; v současnosti žádné nenastavujeme. Pokud jste mladší 18 let a navzdory našemu věkovému pravidlu získáte přístup ke službě, použijí se na zacházení s vašimi údaji standardy Kodexu pro děti úřadu ICO.

### B.3 Spojené státy *(pouze jsou-li uvedeny)*

**Oznámení při shromažďování.** Tabulka v oddílu 2 uvádí jednotlivé kategorie osobních údajů, které shromažďujeme, jejich účel a dobu uchovávání (oddíl 7). Tyto kategorie *citlivých* osobních údajů shromažďujeme pouze tehdy, pokud je uvedete ve vlastních otázkách: \[health, religious or philosophical beliefs, sexual orientation, union membership, political views\], a používáme je pouze k vedení vašich debat. **Osobní údaje neprodáváme ani nesdílíme a nečinili jsme tak ani v předchozích dvanácti měsících.** Citlivé osobní údaje nepoužíváme k žádnému účelu nad rámec poskytování služby, kterou požadujete. **Signály preferencí pro odhlášení:** signály Global Privacy Control respektujeme jako žádost o odhlášení z prodeje nebo sdílení, což v žádném případě neprovádíme. **Vaše práva:** právo vědět, právo na výmaz a opravu, právo odhlásit se, omezit používání citlivých osobních údajů a nebýt diskriminován za jejich uplatnění; žádost podejte na privacy@dezbatere.ro nebo prostřednictvím \[toll-free number / form\]. **Finanční pobídky:** žádné nenabízíme; bezplatné a placené tarify se neliší ve způsobu, jakým s vašimi údaji zacházíme. **Doba uchovávání** je uvedena v oddílu 7. Toto oznámení se aktualizuje nejméně jednou za dvanáct měsíců; naposledy aktualizováno \[date\].

*Washington:* naše samostatné **Oznámení o ochraně osobních údajů spotřebitelů v oblasti zdraví** na \[URL\] se vztahuje na veškeré informace související se zdravím včetně odvozených závěrů. *Texas a Nebraska:* citlivé osobní údaje neprodáváme; pokud by se to někdy změnilo, nejprve bychom získali váš souhlas \[statutory language\]. *Colorado, Connecticut, Virginia a další státy s komplexními zákony o ochraně soukromí:* výše uvedená práva se na vás vztahují tam, kde se na nás vztahuje zákon; proti zamítnutí žádosti se odvolejte písemně na \[appeals@dezbatere.ro\].

### B.4 Kanada a Québec *(pouze jsou-li uvedeny)*

Naším pracovníkem pro ochranu soukromí je **\[name, email\]**. Za osobní údaje, které předáváme poskytovatelům AI mimo Kanadu, nadále odpovídáme a smluvně vyžadujeme srovnatelnou ochranu; tito poskytovatelé mohou podléhat právním předpisům zemí, ve kterých působí, včetně zákonného přístupu orgánů. Marketingové e-maily zasíláme pouze s vaším výslovným souhlasem podle CASL. **Québec:** před sdělením osobních údajů mimo Québec provádíme posouzení dopadů na soukromí; nastavení, která uchovávají vaše debaty v soukromí, jsou ve výchozím stavu zapnuta; můžete nás požádat o odstranění z indexu nebo ukončení šíření osobních údajů o vás; můžete si vyžádat své údaje ve strukturovaném, běžně používaném formátu; oddíl 8 popisuje naše automatizované zpracování.

### B.5 Austrálie a Nový Zéland *(pouze jsou-li uvedeny)*

**Austrálie.** Zahraničními příjemci vašich osobních údajů jsou poskytovatelé AI a zpracovatelé uvedení v Registru, kteří se nacházejí v \[the United States and the European Union\]; podnikáme přiměřené kroky, abychom zajistili, že s nimi nakládají v souladu s australskými zásadami ochrany soukromí. **Automatizovaná rozhodnutí:** od 10. prosince 2026 tyto zásady označují druhy rozhodnutí přijímaných počítačovými programy, která významně ovlivňují vaše práva nebo zájmy — žádná taková nejsou; hodnocení a závěry se týkají argumentů, nikoli vás — a osobní údaje, které jsou při nich používány. Stížnosti lze podat **Office of the Australian Information Commissioner**. **Nový Zéland.** Naším pracovníkem pro ochranu soukromí je \[name\]. Pokud o vás shromažďujeme osobní údaje nepřímo — protože je jiný uživatel uvedl v otázce — představují tyto zásady a oddíl 11 oznámení, které vám poskytujeme. Údaje zpřístupňujeme poskytovatelům AI v Registru jako našim zástupcům na základě smluv vyžadujících srovnatelné záruky. Stížnosti lze podat **Office of the Privacy Commissioner**.

### B.6 Latinská Amerika *(příloha ve španělštině; pouze je-li uvedena)*

&#91;Published in Spanish.\] Souhlas je základem zpracování tam, kde neexistuje nezbytnost pro plnění smlouvy. Práva ARCO — přístup, oprava, výmaz a námitka — lze uplatnit na privacy@dezbatere.ro, přičemž odpovíme ve lhůtě \[per country\]. *Mexiko:* úplné *aviso de privacidad* s povinnými náležitostmi je na \[URL\]. *Argentina:* \[AAIP mandatory legend\]; údaje jsou registrovány u \[…\]. *Kolumbie:* naše *política de tratamiento de datos* je na \[URL\]; příslušným orgánem je SIC. *Chile* (od 1. prosince 2026): kontakt agentury je \[…\]; oddíl 8 vysvětluje naše automatizované zpracování.

### B.7 Perský záliv — SAE a Saúdská Arábie *(pouze jsou-li uvedeny)*

Pokud vaše údaje zpracováváme pro jiné účely než poskytování služby, opíráme se o váš souhlas, který můžete odvolat. Vaše údaje opouštějí \[UAE / Kingdom of Saudi Arabia\] a jsou zpracovávány v Evropské unii a Spojených státech podle \[SDAIA standard contractual clauses / the mechanism in the Register\]. Marketing zasíláme pouze s vaším souhlasem. Neuvádějte ve svých otázkách citlivé osobní údaje.

### B.8 Asie a Tichomoří *(pouze řádky pro uvedené regiony)*

*Singapur:* naším pověřencem pro ochranu osobních údajů je **\[name, email\]**; předávání je založeno na smluvních povinnostech poskytujících ochranu srovnatelnou s PDPA; oznamovaná porušení hlásíme PDPC do 3 dnů. *Japonsko:* vaše osobní údaje používáme pro účely podle oddílu 4 a žádné jiné; váš obsah je předáván poskytovatelům v \[named countries — e.g. the United States\], jejichž režimy ochrany soukromí a záruky popisuje Registr, a při registraci s tím souhlasíte. *Jižní Korea:* naším pracovníkem pro ochranu soukromí je **\[name\]**; položky, místo určení, načasování, příjemce, účel a doba uchovávání při zahraničních předáváních jsou uvedeny v Registru; politické názory ve vašich otázkách jsou citlivými informacemi a zpracováváme je pouze k vedení vašich debat; souhlasy s volitelným zpracováním získáváme samostatně. *Indie* (jakmile se použijí pravidla DPDP): platí samostatné oznámení o souhlasu na \[URL\]; žádosti vyřizujeme do 90 dnů; uživatelé mladší 18 let potřebují ověřitelný souhlas rodiče. *Filipíny:* naším DPO je \[name\]; stížnosti lze podat National Privacy Commission; oddíl 8 popisuje automatizované zpracování. *Thajsko:* naším zástupcem je \[name\] \[if appointed\].

### B.9 Vyhrazeno

Turecko, Brazílie a Indonésie vyžadují oznámení v místním jazyce, zástupce nebo registraci a příslušná podání a jejich úprava zde není navržena. V Číně, Vietnamu a Rusku službu neposkytujeme.
