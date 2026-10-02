# DebateAI — Privacybeleid

<!-- legal-chrome
summaryTitle: In het kort
eyebrow: PRIVACYBELEID · v3.0 · VAN KRACHT OP [DATE]
title: Wat wij opslaan en waarom
lede: Uw rechten en onze verplichtingen krachtens de GDPR (EU) 2016/679, in begrijpelijke taal. Veertien hoofdstukken en Bijlage B — scrol tot het einde.
endMarker: EINDE VAN HET BELEID · GDPR (EU) 2016/679 · v3.0
bodyLabel: Tekst van het privacybeleid
annexTitle: Bijlage B — Regionale privacybepalingen
jumps:
01 VERWERKINGSVERANTWOORDELIJKE
02 WAT WIJ VERZAMELEN
04 RECHTSGROND
05 MODELLEN & DOORGIFTEN
06 PUBLICATIE
07 BEWAARTERMIJNEN
10 UW GDPR-RECHTEN
13 COOKIES
-->

2026-09-21 · @Someone

**Conceptversie v3.0 voor juridische beoordeling — vervangt de uitgebrachte v2.1 (`apps/ui/lib/privacyPolicy.ts`). Geen juridisch advies.** Deze versie beschrijft wat de code daadwerkelijk doet en corrigeert de vijf verklaringen in v2.1 die in tegenspraak waren met de code: sessiegegevens, bewaartermijnen, analyse, export en wat er bij verwijdering gebeurt met gepubliceerde debatten. Vierkante haken markeren wat alleen u kunt invullen; [pending] markeert een functie die in het beleid wordt beschreven maar nog niet is gebouwd en die moet bestaan voordat het beleid wordt gepubliceerd.

**Version 3.0 · Effective [date] · Eerdere versies op dezbatere.ro/privacy/versions · Verwerkingsverantwoordelijke: DebateAIRO S.R.L., Boekarest**

**In short.** Wij verzamelen wat nodig is voor een account en wat u zelf invoert. Uw vragen gaan naar de AI-aanbieders die in ons Register staan en worden niet gebruikt om modellen te trainen. Debatten zijn privé, tenzij u ze publiceert. Wanneer u uw account verwijdert, worden de sleutels tot uw gegevens vernietigd en worden uw gepubliceerde debatten uit de openbare toegang verwijderd. U kunt ons bereiken via privacy@dezbatere.ro, en personen die in een debat worden genoemd, kunnen zonder account om verwijdering verzoeken.

## 1. Wie verantwoordelijk is voor uw gegevens

De verwerkingsverantwoordelijke voor uw persoonsgegevens is **DebateAIRO S.R.L.**, [address], Boekarest, Roemenië, Handelsregister [J40/…], CUI […]. Schrijf voor alles wat dit beleid betreft naar **privacy@dezbatere.ro**; wij antwoorden binnen één maand. Wij hebben geen functionaris voor gegevensbescherming aangesteld omdat de wet ons daartoe niet verplicht; dit adres wordt beheerd door [role]. Indien wij voor een bepaald land een vertegenwoordiger of privacyfunctionaris hebben aangesteld, worden deze in Bijlage B genoemd.

## 2. Wat wij verzamelen en waar het vandaan komt

Wij verzamelen uitsluitend wat nodig is om een account te laten functioneren, wat u ons zelf verstrekt en wat de wet ons verplicht te bewaren.

| Categorie | Wat precies | Bron |
| --- | --- | --- |
| **Account** | E-mailadres en herstel-e-mailadres (versleuteld opgeslagen, met een index op basis van een sleutel zodat wij het account kunnen vinden zonder het adres te lezen); wachtwoord (opgeslagen als hash, nooit in leesbare tekst); uw geheim voor tweefactorauthenticatie (versleuteld); tien herstelcodes (opgeslagen als hashes); uw pseudoniem; het tijdstip waarop u bevestigde dat u 18 jaar of ouder bent | U, bij registratie |
| **Sessies en beveiliging** | Een gehasht sessietoken; een met een sleutel berekende hash van de user-agentstring van uw browser, gebruikt om op te merken wanneer een sessie naar een andere browser wordt verplaatst; tijdstippen van aanmaak, laatste gebruik en verloop. Wij slaan uw IP-adres, apparaatnaam of browsergegevens **niet** bij een sessie op, en de sessielijst die u in Instellingen ziet, toont alleen tijdstippen | Uw browser |
| **Beveiligingsauditlogboek** | Een logboek waaraan alleen kan worden toegevoegd, met beveiligingsrelevante gebeurtenissen — registratie, verificatie, aanmeldpogingen, herstel, publicatie en verwijdering. Het IP-adres en de user-agent van elke gebeurtenis worden uitsluitend opgeslagen als eenrichtingsdigests op basis van een sleutel (Argon2id), zodat zij niet kunnen worden teruggelezen, maar gedurende een bepaalde periode wel kunnen worden vergeleken. Risicosignalen voor aanmelden en herstel worden 90 dagen versleuteld opgeslagen | Uw browser, op het moment van elke gebeurtenis |
| **Debatinhoud** | De vraag die u invoert; de sturende annotaties die u instelt; de stellingen, kritieken, bewijsverwijzingen, scores en oordelen die de engine genereert; een woordelijk verslag van wat elke AI-aanbieder heeft teruggestuurd; zoekopdrachten en bronverwijzingen. Dit alles wordt versleuteld opgeslagen onder een sleutel die specifiek is voor uw account | U en de AI-modellen die uw vraag verwerken |
| **Ondersteuning** | Berichten die u uitwisselt met de ondersteuningsassistent of een persoon, versleuteld opgeslagen; de gebruikte taal; of u de assistent toestemming gaf om de status (nooit de inhoud) van uw debatten te zien; beoordelingen die u geeft. Als een bericht misbruikcontroles activeert, bewaren wij een hash van het bericht en een hash van het IP-adres waarvan het afkomstig is | U |
| **Vastleggingen van aanvaarding en toestemming** | De versie en inhoudshash van de Voorwaarden die u aanvaardde en van het beleid dat aan u werd getoond; het tijdstip; het gebruikte scherm en mechanisme; uw taal; uw IP-adres en user-agent op dat moment; elke toestemming die u gaf of introk en het tijdstip daarvan | Uw browser, bij registratie en telkens wanneer u een keuze wijzigt |
| **Betalingen** [pending — once a paid plan exists] | Abonnement, prijs, factureringsperiode, transactiereferenties en bewijs van fiscale locatie. Kaartgegevens worden door onze betalingsaanbieder bewaard, nooit door ons | U en de betalingsaanbieder |
| **Personen die geen gebruiker van ons zijn** | Persoonsgegevens over andere personen die u in een vraag opneemt of die de engine bij de beantwoording genereert. Wij vragen u dit niet te doen; hoofdstuk 11 legt uit wat wij doen als het toch gebeurt | Indirect, via u |

Wij verzamelen **geen** analyse- of telemetriegegevens over hoe u het product gebruikt en plaatsen daarvoor geen cookies. Als dat verandert, worden eerst dit beleid en het Cookiebeleid gewijzigd en wordt uw toestemming gevraagd.

## 3. Gevoelige informatie

Een debatengine nodigt uit tot vragen over politiek, religie, gezondheid, seksualiteit en levensovertuiging. Dit zijn bijzondere categorieën van gegevens krachtens artikel 9 GDPR, en zij kunnen in uw vragen voorkomen, ongeacht of wij van plan zijn ze te verzamelen.

**Over u.** Wanneer u zich registreert, geeft u in een afzonderlijke zin uitdrukkelijk toestemming voor onze verwerking van gevoelige informatie die u in uw eigen vragen wenst op te nemen, met als doel uw debatten uit te voeren. U kunt die toestemming te allen tijde intrekken door dergelijke informatie niet op te nemen of door een debat te verwijderen. Wat u over uzelf publiceert, zijn gegevens die u zelf bewust openbaar hebt gemaakt.

**Over andere personen.** Geen enkele rechtsgrond staat ons toe gevoelige gegevens te verwerken over een derde die u in een vraag noemt, en geen van onze AI-aanbieders beschikt over een dergelijke rechtsgrond. Daarom verbieden de Voorwaarden dit, beperken wij tot een minimum wat wij versturen en verwijderen wij dergelijke inhoud op verzoek snel — hoofdstuk 11.

**Gezondheidsinformatie.** Sommige landen behandelen gezondheidsgerelateerde gegevens, met inbegrip van afleidingen, op grond van specifieke wetgeving. Als u in [the State of Washington] woont, is een afzonderlijke [Consumer Health Data Privacy Notice] van toepassing.

## 4. Waarom wij uw gegevens gebruiken en op welke grondslag

Elk doel heeft één rechtsgrond krachtens artikel 6(1) GDPR, en wij hergebruiken gegevens die voor het ene doel zijn verzameld niet voor een ander doel.

| Doel | Gegevens | Grondslag |
| --- | --- | --- |
| Uw account aanmaken en beheren, u authenticeren en uw debatten uitvoeren en opslaan zodat u ze opnieuw kunt openen en afspelen | Account, sessies, debatinhoud | **Overeenkomst** — Art. 6(1)(b) |
| Uw vraag en de verklaringen van de engine naar AI-aanbieders sturen om een debat te genereren | Debatinhoud | **Overeenkomst** — Art. 6(1)(b) |
| De dienst beveiligen, misbruik opsporen, u een niet door u verrichte aanmelding laten herkennen en een auditlogboek bijhouden | Sessies, beveiligingsauditlogboek, hashes voor misbruik bij ondersteuning | **Gerechtvaardigde belangen** — Art. 6(1)(f): die van ons en van u bij een beveiligde dienst. U kunt bezwaar maken; hoofdstuk 10 |
| Bewijzen dat u de Voorwaarden hebt aanvaard en toestemming hebt gegeven of ingetrokken | Vastleggingen van aanvaarding en toestemming | **Wettelijke verplichting** — Art. 6(1)(c), onze plicht om toestemming aan te tonen krachtens Art. 7(1) — en gerechtvaardigde belangen bij het bewijzen van de overeenkomst |
| Ondersteuningsverzoeken beantwoorden | Ondersteuning | **Overeenkomst** — Art. 6(1)(b) |
| Gevoelige informatie verwerken die u over uzelf opneemt | Debatinhoud | **Uitdrukkelijke toestemming** — Art. 9(2)(a), afzonderlijk gegeven bij registratie |
| Een debat publiceren dat u wenst te publiceren | Debatinhoud, pseudoniem | **Overeenkomst** — Art. 6(1)(b), op uw instructie; voor gevoelige gegevens over u, Art. 9(2)(e) — gegevens die u kennelijk openbaar hebt gemaakt |
| U productnieuws sturen | E-mailadres | **Toestemming** — Art. 6(1)(a), een niet vooraf aangevinkt vakje; te allen tijde intrekbaar vanuit elke e-mail of via Instellingen |
| Voldoen aan fiscale, boekhoudkundige en wettelijke verplichtingen [pending paid plans] | Betalingen, vastleggingen van aanvaarding | **Wettelijke verplichting** — Art. 6(1)(c) |
| Juridische verzoeken en meldingen van illegale inhoud behandelen en onze verplichtingen als hostingdienst nakomen | Alles wat relevant is voor het verzoek | **Wettelijke verplichting** — Art. 6(1)(c) — en gerechtvaardigde belangen |

Wij profileren u niet, gebruiken uw gegevens niet voor reclame en verkopen ze niet. Wij gebruiken uw inhoud niet om modellen te trainen en staan onze aanbieders dat evenmin toe — hoofdstuk 5.

## 5. AI-aanbieders en internationale doorgiften

**Wat wordt verzonden.** Om een debat uit te voeren, sturen wij tekst naar een of meer externe AI-aanbieders: uw vraag, de sturende annotaties die u instelt en verklaringen die de engine opstelt naarmate het debat zich ontwikkelt. Een aanbieder ziet dus tekst die is afgeleid van en opgebouwd rond wat u hebt ingevoerd. De aanbieder ontvangt nooit uw e-mailadres, account- of sessie-identificatoren, IP-adres of betalingsgegevens.

**Welke aanbieders.** Zij staan vermeld in ons **Register van AI-aanbieders** op [dezbatere.ro/providers], dat deel uitmaakt van dit beleid. Voor elke aanbieder vermeldt het Register diens juridische entiteit en vestigingsland; wat die ontvangt en met welk doel; de landen of regio's waar de verwerking plaatsvindt; de bewaartermijnen en of er geen gegevens worden bewaard voor het eindpunt en de functies die wij gebruiken; of de aanbieder op grond van onze overeenkomst invoer voor training mag gebruiken; het doorgiftemechanisme waarop wij ons baseren; en de datum waarop wij elke vermelding voor het laatst hebben gecontroleerd. Aanbieders kunnen veranderen; het Register heeft versiebeheer en de wijziging wordt daarin vermeld.

**Training en bewaring zijn verschillende zaken.** Onze overeenkomsten met aanbieders sluiten het gebruik van uw inhoud voor het trainen of verbeteren van hun modellen uit. [Publish only once verified per route.] Sommige aanbieders bewaren prompts en antwoorden gedurende een beperkte periode voor beveiliging, het voorkomen van misbruik of hun eigen wettelijke verplichtingen; het Register vermeldt hoe lang en waarom. Waar geen gegevens worden bewaard, vermeldt het Register dit en voor welke functies. Wij zullen niet stellen dat inhoud niet wordt bewaard wanneer dat wel het geval is.

**Doorgiften buiten de EER.** In de Verenigde Staten gevestigde aanbieders ontvangen gegevens op grond van een van de mechanismen in hoofdstuk V GDPR: het EU–US Data Privacy Framework wanneer de specifieke contracterende entiteit voor deze gegevens is gecertificeerd, of de standaardcontractbepalingen van de Europese Commissie (Module Twee, verwerkingsverantwoordelijke aan verwerker), ondersteund door een doorgifterisicobeoordeling en aanvullende maatregelen. Het Register noemt het mechanisme voor elke aanbieder. U kunt een kopie verkrijgen van de bepalingen waarop wij ons baseren door te schrijven naar privacy@dezbatere.ro. Als een mechanisme waarop wij ons baseren ongeldig wordt verklaard, stappen wij over op een ander voordat wij doorgiften voortzetten en stellen wij u daarvan op de hoogte.

**Andere ontvangers.** Onze hostingprovider [Hetzner, Germany — region …]; onze aanbieder voor contentlevering en transport [Cloudflare]; ons e-mailrelais […]; [our payment provider, once a paid plan exists]. Elk van hen handelt volgens onze gedocumenteerde instructies op grond van een verwerkersovereenkomst met de waarborgen die artikel 28 vereist, en elk staat met locatie en doorgiftemechanisme in het Register. Wij staan geen enkele verwerker toe uw gegevens voor eigen doeleinden te gebruiken. Wanneer een aanbieder dit wel zou doen, is deze zelfstandig verwerkingsverantwoordelijke en sturen wij uw gegevens niet naar die aanbieder.

**Overheidsinstanties.** Wij verstrekken persoonsgegevens aan rechtbanken, toezichthouders of rechtshandhavingsinstanties wanneer de wet dit vereist, en stellen u daarvan op de hoogte tenzij de wet ons dat verbiedt.

## 6. Publicatie en zichtbaarheid

Debatten zijn privé totdat u ze publiceert. Publicatie is een bewuste handeling die afzonderlijk wordt bevestigd. Een gepubliceerd debat toont uw **pseudoniem**, uw vraag zoals u die hebt geschreven, de argumentboom, de scores, het oordeel en de zekerheidsband, en draagt een zichtbaar label dat de inhoud door AI is gegenereerd. Het toont nooit uw e-mailadres, sessiegegevens of accountgeschiedenis. [Published debates are / are not] geïndexeerd door zoekmachines [unless you choose].

Door de publicatie in te trekken, wordt het debat uit DebateAI verwijderd en wordt de sleutel tot onze openbare kopie vernietigd. Kopieën die reeds door lezers, zoekmachines of archieven zijn gemaakt, vallen buiten onze controle en kunnen wij niet terugroepen.

Wanneer u uw account verwijdert, verwijderen wij elk door u gepubliceerd debat zonder onnodige vertraging en uiterlijk binnen 30 dagen uit de openbare toegang, tenzij de wet ons verplicht een specifiek item te bewaren. [Option B — a product change; see the Terms, section 9.]

## 7. Hoe lang wij gegevens bewaren

| Gegevens | Hoe lang | Daarna |
| --- | --- | --- |
| Account | Zolang het account bestaat, plus een respijtperiode van 7 dagen nadat u om sluiting hebt gevraagd | Sleutels vernietigd; vastlegging verwijderd |
| Sessiegegevens | 14 dagen na het laatste gebruik of 90 dagen na aanmaak, afhankelijk van wat het eerst plaatsvindt | Verwijderd |
| E-mailverificatielinks | 24 uur | Verwijderd |
| Risicosignalen voor aanmelden en herstel | 90 dagen, afgedwongen door de database | Gewist |
| Beveiligingsauditlogboek | Gedurende de levensduur van de dienst | Alleen toevoegingen; IP-adres en user-agent zijn eenrichtingsdigests en kunnen niet worden teruggelezen |
| Debatinhoud (privé) | Zolang het account bestaat | Sleutels worden bij sluiting vernietigd, waardoor de inhoud onleesbaar wordt |
| Debatinhoud (gepubliceerd) | Zolang deze is gepubliceerd en het account bestaat | Uit de openbare toegang verwijderd wanneer de publicatie wordt ingetrokken of het account wordt gesloten; sleutels vernietigd |
| Door aanbieders geretourneerde gegevens en zoekreferenties | Even lang als het debat waartoe zij behoren | Hetzelfde |
| Ondersteuningsgesprekken en ondersteuningsverzoeken | [Until closed plus 12 months] | Sleutels vernietigd |
| Vastleggingen van aanvaarding en toestemming | Levensduur van het account plus 6 jaar — de langste verjaringstermijn die op ons van toepassing is | Verwijderd |
| Betalingsgegevens [pending] | 10 jaar, zoals de Roemeense boekhoudwetgeving voorschrijft | Verwijderd |
| Back-ups [pending] | [… days] nadat de actuele kopie is verwijderd | Overschreven |

**Wat verwijdering daadwerkelijk doet.** Uw debatten en accountgegevens zijn versleuteld met sleutels die specifiek zijn voor uw account en elk debat. Wanneer u uw account verwijdert, worden die sleutels vernietigd, waarna de versleutelde gegevens niet meer door ons of anderen kunnen worden gelezen, en verwijderen wij de vastlegging van uw account. Wij omschrijven dit als verwijdering omdat dit het effect ervan is, en wij beschikken over een gedocumenteerde beoordeling die dit onderbouwt; vraag het ons als u meer wilt weten. Drie zaken die u moet weten: het beveiligingsauditlogboek is uitsluitend voor toevoegingen bestemd en wordt niet verwijderd, maar bevat geen leesbare identificatoren van u; een klein aantal oudere debatten dateert van vóór ons huidige versleutelingsschema, en als dit voor uw account geldt, vertellen wij u wat sluiting voor die debatten bewerkstelligt; en kopieën van gegevens die reeds naar een AI-aanbieder zijn gestuurd, vallen onder de bewaarbepalingen van die aanbieder in het Register, niet onder onze verwijdering.

&#91;The support retention period and the backup line describe policies to implement; the system currently keeps support records indefinitely and has no backup-expiry mechanism. Do not publish figures that are not enforced.]

## 8. Geautomatiseerde besluiten en profilering

De scores, conditiemarkeringen en oordelen in een debat zijn geautomatiseerde evaluaties van **argumenten, niet van personen**. Zij hebben voor u geen rechtsgevolgen en treffen u evenmin anderszins in aanmerkelijke mate. Wij nemen geen besluit over u dat uitsluitend op geautomatiseerde verwerking is gebaseerd en rechtsgevolgen of vergelijkbare aanmerkelijke gevolgen heeft, en wij profileren u niet.

Als wij ooit een besluit over uw account automatiseren — opschorting ervan of weigering een debat te publiceren — beoordeelt een persoon elk dergelijk besluit voordat het van kracht wordt of op uw verzoek, kunt u uw standpunt kenbaar maken en kunt u het besluit aanvechten. De Voorwaarden beschrijven hoe.

## 9. Beveiliging en wat er gebeurt als er iets misgaat

Wachtwoorden worden met Argon2id gehasht. Tweefactorauthenticatie is verplicht. Uw e-mailadres, debatten, ondersteuningsgesprekken en authenticatiegeheimen worden in rust versleuteld met sleutels die specifiek zijn voor uw account, en de sleutels voor gepubliceerde debatten worden gescheiden van de sleutels voor privédebatten bewaard. Toegang tot productiegegevens wordt geregistreerd. IP-adressen en browsergegevens in ons beveiligingslogboek worden uitsluitend als eenrichtingsdigests opgeslagen.

Als zich een inbreuk in verband met persoonsgegevens voordoet, melden wij deze binnen 72 uur bij de Roemeense toezichthoudende autoriteit wanneer de wet dit vereist en informeren wij u rechtstreeks en zonder onnodige vertraging wanneer de inbreuk waarschijnlijk een hoog risico voor uw rechten en vrijheden inhoudt. Bijlage B vermeldt de meldingsregels die gelden in andere regio's waar wij diensten aanbieden.

## 10. Uw rechten en hoe u ze uitoefent

U kunt al deze rechten kosteloos uitoefenen door te schrijven naar **privacy@dezbatere.ro**, of via **Instellingen → Privacy** wanneer daar een bedieningsmogelijkheid voor bestaat. Wij antwoorden binnen één maand; als een verzoek complex is, kunnen wij tot twee extra maanden nodig hebben en zullen wij u vertellen waarom. Wij kunnen u vragen uw identiteit via uw account te bevestigen.

| Recht | Wat het hier betekent |
| --- | --- |
| **Inzage** (Art. 15) | Een kopie van de persoonsgegevens die wij over u bewaren, en deze informatie. [Pending: a JSON export from Settings. Until it exists, we compile the copy manually within the month.] |
| **Rectificatie** (Art. 16) | Corrigeer uw e-mailadres of herstel-e-mailadres via Instellingen. Uw pseudoniem kan niet worden gewijzigd om de redenen in de Voorwaarden; u kunt het account sluiten en een nieuw account openen |
| **Wissing** (Art. 17) | Verwijder een privédebat op elk moment vanaf de debatpagina. Sluit uw account via Instellingen; hoofdstuk 7 legt precies uit wat dat doet. Vraag ons een gepubliceerd debat met uw gegevens te verwijderen, ongeacht of u de auteur bent |
| **Beperking** (Art. 18) | Vraag ons de verwerking van bepaalde gegevens stop te zetten terwijl een geschil daarover wordt beslecht |
| **Bezwaar** (Art. 21) | Maak bezwaar tegen verwerking op grond van gerechtvaardigde belangen — de beveiligings- en auditverwerking in hoofdstuk 4 — en wij stoppen tenzij wij dwingende gronden kunnen aantonen. Maak op elk moment bezwaar tegen marketing en wij stoppen |
| **Overdraagbaarheid** (Art. 20) | Uw debatten en accountgegevens in een gangbaar, machineleesbaar formaat. [Pending: same export as Access.] Niet-persoonlijke inhoud die u hebt gemaakt, zoals uw vragen, wordt op uw verzoek aan u teruggegeven wanneer de overeenkomst eindigt |
| **Toestemming intrekken** (Art. 7(3)) | Trek uw marketingtoestemming in via een e-mail of Instellingen; trek toestemming voor gevoelige gegevens in door dergelijke gegevens niet op te nemen of door een debat te verwijderen. Intrekking laat reeds uitgevoerde verwerking onverlet |
| **Klacht indienen** | Bij de Roemeense toezichthoudende autoriteit, **ANSPDCP**, B-dul G-ral Gheorghe Magheru 28–30, Boekarest, <anspdcp@dataprotection.ro>, of bij de autoriteit in het land waar u woont. Wij horen echter liever eerst van u |

Wij brengen nooit kosten in rekening voor een verzoek en behandelen u nooit minder gunstig omdat u een verzoek indient.

## 11. Personen die in debatten worden genoemd maar geen gebruiker van ons zijn

Als iemand DebateAI een vraag stelt waarin u wordt genoemd, kunnen wij persoonsgegevens over u bewaren, ook al hebt u de dienst nooit gebruikt. De Voorwaarden verbieden gebruikers dit te doen en wij beperken wat wij naar AI-aanbieders sturen tot een minimum, maar het gebeurt.

Dit hoofdstuk is de kennisgeving die wij u krachtens artikel 14 GDPR verschuldigd zijn. De gegevens zijn wat de gebruiker heeft ingevoerd en wat de engine als antwoord heeft gegenereerd; de bron is die gebruiker; de doeleinden en rechtsgrondslagen staan in hoofdstuk 4; de ontvangers zijn de AI-aanbieders in het Register; de bewaring volgt hoofdstuk 7. U hebt alle rechten uit hoofdstuk 10 en kunt ons in het bijzonder vragen een gepubliceerd of privédebat dat uw gegevens bevat te verwijderen en u te vertellen wat wij bewaren. Daarvoor hebt u geen account nodig. Schrijf naar **privacy@dezbatere.ro** of gebruik de knop **Melden** bij een gepubliceerd debat; wij handelen onderbouwde verzoeken zonder onnodige vertraging af. Wij kunnen u niet individueel informeren wanneer dit gebeurt, omdat wij niet weten wie u bent of hoe wij u kunnen bereiken; deze openbare kennisgeving en de verwijderingsmogelijkheid zijn de maatregelen die wij in plaats daarvan nemen.

Hetzelfde geldt voor gevoelige informatie over u — politiek, gezondheid, religie — die in de vraag van iemand anders voorkomt. Geen enkele rechtsgrond staat ons toe deze te blijven verwerken nadat u bezwaar hebt gemaakt, en dat zullen wij niet doen.

## 12. Kinderen

DebateAI is bestemd voor volwassenen. Bij uw registratie bevestigt u dat u 18 jaar of ouder bent, en wij verwerken niet bewust gegevens van personen jonger dan 18 jaar. Als wij vernemen dat een account toebehoort aan iemand jonger dan 18, sluiten wij het en verwijderen wij de gegevens zoals beschreven in hoofdstuk 7. Sommige landen vinden een bevestiging onvoldoende of vereisen meer; Bijlage B vermeldt wat waar van toepassing is en de Voorwaarden leggen uit wat wij daaraan doen.

## 13. Cookies

Wij plaatsen twee cookies, die beide strikt noodzakelijk zijn: één waarmee u aangemeld blijft en één waarmee formulieren tegen vervalsing worden beschermd. Wij plaatsen geen analyse-, reclame- of trackingcookies. Het **Cookiebeleid** op [dezbatere.ro/cookies] vermeldt ze met hun looptijd en legt uit hoe uw keuze wordt opgeslagen. Voordat er een andere cookie wordt toegevoegd, wordt eerst het Cookiebeleid gewijzigd. Wanneer de wet in uw regio sommige cookies anders behandelt — bijvoorbeeld de Britse opt-outregel voor analyse — staat dit in het Cookiebeleid.

## 14. Wijzigingen in dit beleid

Wanneer wij dit beleid wijzigen, publiceren wij de nieuwe versie met een samenvatting van de wijzigingen en een nieuwe ingangsdatum, en bewaren wij eerdere versies op [dezbatere.ro/privacy/versions]. Bij een wijziging die een nieuw doel of een nieuwe ontvanger toevoegt, informeren wij u per e-mail en in het product voordat de nieuwe verwerking begint en geven wij u tijd om bezwaar te maken. Wanneer een nieuw doel afhankelijk is van uw toestemming — bijvoorbeeld als wij ooit inhoud zouden willen gebruiken om modellen te verbeteren — vragen wij die toestemming afzonderlijk en specifiek; wij beschouwen aanvaarding van bijgewerkte Voorwaarden nooit als toestemming voor nieuwe verwerking. Bij verduidelijkingen die niets veranderen aan wat wij doen, publiceren wij eenvoudigweg de nieuwe versie.

Dit beleid is voor het laatst bijgewerkt op [date]. Versie 3.0 verving versie 2.1, waarin sessiegegevens, bewaartermijnen, analyse, export en het effect van verwijdering op gepubliceerde debatten werden beschreven op manieren die niet langer met de dienst overeenkwamen.

## Annex B — Regionale privacybepalingen

Elke vermelding is alleen van toepassing als de betreffende regio in hoofdstuk 2 van de Voorwaarden wordt genoemd en vermeldt uitsluitend wat afwijkt van de hoofdtekst van dit beleid.

### B.1 Europese Unie en Europese Economische Ruimte

De hoofdtekst van dit beleid is voor u geschreven. Onze toezichthoudende autoriteit is de Roemeense **ANSPDCP**; u kunt ook een klacht indienen bij de autoriteit in het land waar u woont. Roemeense gebruikers: dit beleid is in het Roemeens beschikbaar op [URL].

### B.2 Verenigd Koninkrijk *(alleen indien vermeld)*

Onze vertegenwoordiger in het VK krachtens artikel 27 UK GDPR is **[name, address, email]**; u kunt met deze vertegenwoordiger contact opnemen over alles in dit beleid. De toezichthoudende autoriteit is het **Information Commissioner's Office**, [ico.org.uk](https://ico.org.uk). U kunt bij ons een klacht indienen met het formulier op [URL], en wij bevestigen de ontvangst binnen 30 dagen. Doorgiften van uw gegevens vanuit het VK naar AI-aanbieders in de Verenigde Staten berusten op [the UK Extension to the EU–US Data Privacy Framework, where the provider is certified / the UK International Data Transfer Addendum to the EU standard contractual clauses], ondersteund door een doorgifterisicobeoordeling. Als wij ooit analysecookies zouden plaatsen, zouden deze in het VK onder een opt-out in plaats van toestemming vallen; momenteel plaatsen wij er geen. Als u jonger bent dan 18 en ondanks onze leeftijdsregel toegang krijgt tot de dienst, gelden de normen van de Children's Code van de ICO voor de manier waarop wij uw gegevens behandelen.

### B.3 Verenigde Staten *(alleen indien vermeld)*

**Kennisgeving bij verzameling.** De tabel in hoofdstuk 2 vermeldt elke categorie persoonsgegevens die wij verzamelen, het doel ervan en hoe lang wij deze bewaren (hoofdstuk 7). Wij verzamelen deze categorieën *gevoelige* persoonsgegevens alleen wanneer u ze in uw eigen vragen opneemt: [health, religious or philosophical beliefs, sexual orientation, union membership, political views], en gebruiken ze uitsluitend om uw debatten uit te voeren. **Wij verkopen of delen geen persoonsgegevens en hebben dit in de voorgaande twaalf maanden niet gedaan.** Wij gebruiken gevoelige persoonsgegevens niet voor andere doeleinden dan het leveren van de door u gevraagde dienst. **Voorkeurssignalen voor opt-out:** wij respecteren Global Privacy Control-signalen als een verzoek om af te zien van verkoop of delen, wat wij in geen geval doen. **Uw rechten:** kennisneming, verwijdering, correctie, opt-out, beperking van het gebruik van gevoelige persoonsgegevens en vrijwaring van discriminatie wegens de uitoefening daarvan; dien een verzoek in via privacy@dezbatere.ro of [toll-free number / form]. **Financiële stimulansen:** die bieden wij niet; de gratis en betaalde abonnementen verschillen niet in de wijze waarop wij uw gegevens behandelen. **Bewaring** staat in hoofdstuk 7. Deze kennisgeving wordt ten minste elke twaalf maanden bijgewerkt; laatst bijgewerkt op [date].

*Washington:* onze **Consumer Health Data Privacy Notice** op [URL] is een afzonderlijk document dat van toepassing is op alle gezondheidsgerelateerde informatie, met inbegrip van afleidingen. *Texas en Nebraska:* wij verkopen geen gevoelige persoonsgegevens; als dit ooit zou veranderen, zouden wij eerst uw toestemming verkrijgen [statutory language]. *Colorado, Connecticut, Virginia en andere staten met uitgebreide privacywetgeving:* bovenstaande rechten gelden voor u wanneer de wet op ons van toepassing is; teken beroep aan tegen een afgewezen verzoek door te schrijven naar [appeals@dezbatere.ro].

### B.4 Canada en Quebec *(alleen indien vermeld)*

Onze privacyfunctionaris is **[name, email]**. Wij blijven verantwoordelijk voor persoonsgegevens die wij aan AI-aanbieders buiten Canada doorgeven en verplichten hen contractueel tot vergelijkbare bescherming; deze aanbieders kunnen onderworpen zijn aan de wetgeving van de landen waar zij actief zijn, met inbegrip van rechtmatige toegang door autoriteiten. Marketing-e-mail wordt krachtens CASL alleen met uw uitdrukkelijke toestemming verzonden. **Quebec:** voordat wij persoonsgegevens buiten Quebec bekendmaken, voeren wij een gegevensbeschermingseffectbeoordeling uit; de instellingen die uw debatten privé houden, zijn standaard ingeschakeld; u kunt ons vragen uw persoonsgegevens niet meer te indexeren of te verspreiden; u kunt uw gegevens in een gestructureerd, gangbaar formaat opvragen; hoofdstuk 8 beschrijft onze geautomatiseerde verwerking.

### B.5 Australië en Nieuw-Zeeland *(alleen indien vermeld)*

**Australië.** De buitenlandse ontvangers van uw persoonsgegevens zijn de AI-aanbieders en verwerkers die in het Register staan, gevestigd in [the United States and the European Union]; wij nemen redelijke maatregelen om te waarborgen dat zij deze behandelen in overeenstemming met de Australian Privacy Principles. **Geautomatiseerde besluiten:** vanaf 10 december 2026 vermeldt dit beleid de soorten besluiten van computerprogramma's die uw rechten of belangen aanmerkelijk treffen — die zijn er niet; scores en oordelen betreffen argumenten, niet u — en de persoonsgegevens die daarbij worden gebruikt. Klachten kunnen worden ingediend bij het **Office of the Australian Information Commissioner**. **Nieuw-Zeeland.** Onze privacyfunctionaris is [name]. Wanneer wij indirect persoonsgegevens over u verzamelen — omdat een andere gebruiker deze in een vraag heeft opgenomen — vormen dit beleid en hoofdstuk 11 de kennisgeving die wij u geven. Wij verstrekken gegevens aan de AI-aanbieders in het Register als onze gemachtigden, op grond van overeenkomsten die vergelijkbare waarborgen vereisen. Klachten kunnen worden ingediend bij het **Office of the Privacy Commissioner**.

### B.6 Latijns-Amerika *(Spaanstalige bijlage; alleen indien vermeld)*

&#91;Published in Spanish.] Toestemming is de grondslag voor verwerking wanneer er geen contractuele noodzaak bestaat. ARCO-rechten — inzage, rectificatie, annulering en bezwaar — kunnen via privacy@dezbatere.ro worden uitgeoefend, met antwoorden binnen [per country]. *Mexico:* het volledige *aviso de privacidad* met de verplichte onderdelen staat op [URL]. *Argentinië:* [AAIP mandatory legend]; de gegevens zijn geregistreerd bij […]. *Colombia:* onze *política de tratamiento de datos* staat op [URL]; de autoriteit is de SIC. *Chili* (vanaf 1 december 2026): de contactgegevens van het agentschap zijn […]; hoofdstuk 8 legt onze geautomatiseerde verwerking uit.

### B.7 Golfregio — VAE en Saoedi-Arabië *(alleen indien vermeld)*

Wanneer wij uw gegevens verwerken voor andere doeleinden dan het leveren van de dienst, baseren wij ons op uw toestemming, die u kunt intrekken. Uw gegevens verlaten de [UAE / Kingdom of Saudi Arabia] en worden in de Europese Unie en de Verenigde Staten verwerkt op grond van [SDAIA standard contractual clauses / the mechanism in the Register]. Marketing wordt uitsluitend met uw toestemming verzonden. Neem geen gevoelige persoonsgegevens op in uw vragen.

### B.8 Azië-Pacific *(alleen de regels voor vermelde regio's)*

*Singapore:* onze functionaris voor gegevensbescherming is **[name, email]**; doorgiften berusten op contractuele verplichtingen die vergelijkbare bescherming bieden als de PDPA; wij melden meldingsplichtige inbreuken binnen 3 dagen aan de PDPC. *Japan:* wij gebruiken uw persoonsgegevens voor de doeleinden in hoofdstuk 4 en geen andere; uw inhoud wordt doorgegeven aan aanbieders in [named countries — e.g. the United States], waarvan de privacyregimes en waarborgen in het Register worden beschreven, en u stemt hiermee in bij registratie. *Zuid-Korea:* onze privacyfunctionaris is **[name]**; de items, bestemming, timing, ontvanger, het doel en de bewaartermijn van buitenlandse doorgiften staan in het Register; politieke opvattingen in uw vragen zijn gevoelige informatie en wij verwerken deze uitsluitend om uw debatten uit te voeren; toestemmingen voor optionele verwerking worden afzonderlijk verkregen. *India* (zodra de DPDP-regels van toepassing zijn): de afzonderlijke toestemmingskennisgeving op [URL] is van toepassing; verzoeken worden binnen 90 dagen beantwoord; gebruikers jonger dan 18 hebben verifieerbare ouderlijke toestemming nodig. *Filipijnen:* onze functionaris voor gegevensbescherming is [name]; klachten kunnen worden ingediend bij de National Privacy Commission; hoofdstuk 8 beschrijft geautomatiseerde verwerking. *Thailand:* onze vertegenwoordiger is [name] [if appointed].

### B.9 Gereserveerd

Turkije, Brazilië en Indonesië vereisen elk een kennisgeving in de lokale taal, een vertegenwoordiger of registratie en indieningen, en zijn hier niet uitgewerkt. China, Vietnam en Rusland worden niet bediend.
