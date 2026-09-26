# DebateAI — Tietosuojakäytäntö

<!-- legal-chrome
summaryTitle: Lyhyesti
eyebrow: TIETOSUOJAKÄYTÄNTÖ · v3.0 · VOIMASSA [DATE]
title: Mitä säilytämme ja miksi
lede: Oikeutesi ja velvollisuutemme GDPR (EU) 2016/679 -asetuksen nojalla selkeällä kielellä. Neljätoista osiota ja liite B — vieritä loppuun asti.
endMarker: TIETOSUOJAKÄYTÄNNÖN LOPPU · GDPR (EU) 2016/679 · v3.0
bodyLabel: Tietosuojakäytännön teksti
annexTitle: Liite B — Alueelliset tietosuojaehdot
jumps:
01 REKISTERINPITÄJÄ
02 MITÄ KERÄÄMME
04 OIKEUSPERUSTE
05 MALLIT JA SIIRROT
06 JULKAISEMINEN
07 SÄILYTYSAJAT
10 GDPR-OIKEUTESI
13 EVÄSTEET
-->

2026-09-21 · @Someone

**Luonnos v3.0 oikeudellisen neuvonantajan tarkastettavaksi — korvaa julkaistun version v2.1 (`apps/ui/lib/privacyPolicy.ts`). Ei oikeudellista neuvontaa.** Tämä versio kuvaa sitä, mitä koodi tosiasiallisesti tekee, ja korjaa version v2.1 viisi väitettä, joiden kanssa koodi oli ristiriidassa: istuntotiedot, säilytysajat, analytiikka, tietojen vienti ja se, mitä julkaistuille väittelyille tapahtuu poistamisen yhteydessä. Hakasulkeet osoittavat kohdat, jotka vain sinä voit täyttää; \[pending\] osoittaa käytännössä kuvatun ominaisuuden, jota ei ole vielä toteutettu ja jonka on oltava olemassa ennen käytännön julkaisemista.

**Version 3.0 · Effective \[date\] · Aiemmat versiot osoitteessa dezbatere.ro/privacy/versions · Rekisterinpitäjä: DebateAIRO S.R.L., Bukarest**

**In short.** Keräämme tilin toimintaan tarvittavat tiedot sekä sen, mitä itse päätät kirjoittaa. Kysymyksesi lähetetään Rekisterissämme luetelluille tekoälypalveluntarjoajille; niitä ei käytetä mallien kouluttamiseen. Väittelyt ovat yksityisiä, ellet julkaise niitä. Tilisi poistaminen tuhoaa tietojesi avaimet ja poistaa julkaistut väittelysi näkyvistä. Voit ottaa meihin yhteyttä osoitteessa privacy@dezbatere.ro, ja väittelyssä nimetyt henkilöt voivat pyytää sisällön poistamista ilman tiliä.

## 1. Kuka vastaa tiedoistasi

Henkilötietojesi rekisterinpitäjä on **DebateAIRO S.R.L.**, \[address\], Bukarest, Romania, kaupparekisterinumero \[J40/…\], CUI \[…\]. Kirjoita osoitteeseen **privacy@dezbatere.ro** kaikissa tätä käytäntöä koskevissa asioissa; vastaamme kuukauden kuluessa. Emme ole nimittäneet tietosuojavastaavaa, koska laki ei sitä meiltä edellytä; tätä osoitetta valvoo \[role\]. Jos olemme nimittäneet edustajan tai tietosuojavastaavan tiettyä maata varten, hänet nimetään liitteessä B.

## 2. Mitä keräämme ja mistä tiedot ovat peräisin

Keräämme vain tilin toimintaan tarvittavat tiedot, tiedot, jotka päätät antaa meille, sekä tiedot, jotka laki velvoittaa meidät säilyttämään.

| Luokka | Tarkka sisältö | Lähde |
| --- | --- | --- |
| **Tili** | Sähköpostiosoite ja palautussähköpostiosoite (säilytetään salattuina ja avaimellisella indeksillä, jotta löydämme tilin lukematta osoitetta); salasana (säilytetään tiivisteenä, ei koskaan selväkielisenä); kaksivaiheisen tunnistautumisen salaisuus (salattu); kymmenen palautuskoodia (säilytetään tiivisteinä); nimimerkkisi; ajankohta, jolloin vahvistit olevasi vähintään 18-vuotias | Sinulta rekisteröitymisen yhteydessä |
| **Istunnot ja turvallisuus** | Istuntotunnisteen tiiviste; selaimesi user-agent-merkkijonon avaimellinen tiiviste, jonka avulla havaitsemme istunnon siirtymisen toiseen selaimeen; luonti-, viimeisin käyttö- ja vanhenemisajankohdat. **Emme** tallenna istunnon yhteyteen IP-osoitettasi, laitteen nimeä tai selaimen tietoja, ja Asetuksissa näkyvä istuntoluettelo näyttää vain ajankohdat | Selaimeltasi |
| **Turvallisuuden kirjausketju** | Vain lisäyksiä salliva loki turvallisuuden kannalta merkityksellisistä tapahtumista — rekisteröitymisestä, vahvistamisesta, kirjautumisyrityksistä, palautuksesta, julkaisemisesta ja poistamisesta. Kunkin tapahtuman IP-osoite ja user-agent tallennetaan vain yksisuuntaisina avaimellisina tiivisteinä (Argon2id), joten niitä ei voi lukea takaisin mutta niitä voidaan verrata tietyn ajanjakson sisällä. Kirjautumisen ja palautuksen riskisignaalit säilytetään salattuina 90 päivän ajan | Selaimeltasi kunkin tapahtuman yhteydessä |
| **Väittelyn sisältö** | Kirjoittamasi kysymys; asettamasi ohjaavat huomautukset; väitteet, kritiikit, todistusaineistoviitteet, pisteet ja ratkaisut, jotka järjestelmä tuottaa; sanatarkka tallenne kunkin tekoälypalveluntarjoajan vastauksesta; hakukyselyt ja lähdeviitteet. Kaikki nämä säilytetään salattuina tilillesi ominaisella avaimella | Sinulta ja kysymystäsi käsitteleviltä tekoälymalleilta |
| **Tuki** | Tukiohjelmiston tai henkilön kanssa vaihtamasi viestit, jotka säilytetään salattuina; käytetty kieli; annoitko tukiohjelmistolle luvan nähdä väittelyjesi tilan (ei koskaan niiden sisältöä); antamasi arviot. Jos viesti laukaisee väärinkäytön torjunnan, säilytämme viestin tiivisteen ja sen lähettämiseen käytetyn IP-osoitteen tiivisteen | Sinulta |
| **Hyväksyntä- ja suostumustiedot** | Hyväksymiesi Ehtojen versio ja sisällön tiiviste sekä sinulle näytetty käytäntö; ajankohta; käytetty näkymä ja menetelmä; kielesi; kyseisen hetken IP-osoitteesi ja user-agent; jokainen antamasi tai peruuttamasi suostumus ja sen ajankohta | Selaimeltasi rekisteröitymisen yhteydessä ja aina, kun muutat valintaa |
| **Maksut** \[pending — once a paid plan exists\] | Tilaus, hinta, laskutuskausi, maksutapahtumaviitteet, näyttö verotuksellisesta sijainnista. Korttitiedot ovat maksupalveluntarjoajamme hallussa, eivät koskaan meidän | Sinulta ja maksupalveluntarjoajalta |
| **Henkilöt, jotka eivät ole käyttäjiämme** | Muita henkilöitä koskevat henkilötiedot, jotka sisällytät kysymykseen tai jotka järjestelmä tuottaa siihen vastatessaan. Pyydämme, ettet tee näin; osiossa 11 selitetään, mitä teemme, jos näin kuitenkin tapahtuu | Sinulta välillisesti |

**Emme** kerää analytiikkaa tai telemetriatietoja siitä, miten käytät tuotetta, emmekä aseta evästeitä tähän tarkoitukseen. Jos tämä muuttuu, tämä käytäntö ja Evästekäytäntö muutetaan ensin ja sinulta pyydetään lupa.

## 3. Arkaluonteiset tiedot

Väittelyjärjestelmä kannustaa esittämään kysymyksiä politiikasta, uskonnosta, terveydestä, seksuaalisuudesta ja vakaumuksesta. Nämä ovat GDPR:n 9 artiklassa tarkoitettuja erityisiä henkilötietoryhmiä, ja niitä voi sisältyä kysymyksiisi riippumatta siitä, aiommeko kerätä niitä.

**Sinua koskevat tiedot.** Rekisteröityessäsi annat erillisellä lausekkeella nimenomaisen suostumuksesi siihen, että käsittelemme omiin kysymyksiisi halutessasi sisällyttämiäsi arkaluonteisia tietoja väittelyjesi toteuttamista varten. Voit peruuttaa suostumuksesi milloin tahansa jättämällä tällaiset tiedot pois tai poistamalla väittelyn. Itsestäsi julkaisemasi tiedot ovat tietoja, jotka olet päättänyt julkistaa.

**Muita henkilöitä koskevat tiedot.** Mikään oikeudellinen edellytys ei anna meille lupaa käsitellä kysymyksessä nimeämäsi kolmannen osapuolen arkaluonteisia tietoja, eikä tällainen edellytys koske myöskään tekoälypalveluntarjoajiamme. Siksi Ehdot kieltävät sen, siksi minimoimme lähettämämme tiedot ja siksi poistamme tällaisen sisällön pyynnöstä nopeasti — osio 11.

**Terveystiedot.** Joissakin maissa terveyteen liittyviin tietoihin, päätelmät mukaan lukien, sovelletaan erityislakeja. Jos asut \[the State of Washington\], sinuun sovelletaan erillistä asiakirjaa \[Consumer Health Data Privacy Notice\].

## 4. Miksi käytämme tietojasi ja millä perusteella

Jokaisella tarkoituksella on yksi GDPR:n 6 artiklan 1 kohdassa tarkoitettu oikeusperuste, emmekä käytä yhteen tarkoitukseen kerättyjä tietoja uudelleen toiseen tarkoitukseen.

| Tarkoitus | Tiedot | Peruste |
| --- | --- | --- |
| Tilisi luominen ja ylläpito, tunnistautumisesi, väittelyjesi toteuttaminen ja tallentaminen, jotta voit avata ja toistaa ne uudelleen | Tili, istunnot, väittelyn sisältö | **Sopimus** — Art. 6(1)(b) |
| Kysymyksesi ja järjestelmän väitteiden lähettäminen tekoälypalveluntarjoajille väittelyn tuottamiseksi | Väittelyn sisältö | **Sopimus** — Art. 6(1)(b) |
| Palvelun suojaaminen, väärinkäytön havaitseminen, sellaisen kirjautumisen havaitsemisen mahdollistaminen, jota et itse tehnyt, ja kirjausketjun ylläpito | Istunnot, turvallisuuden kirjausketju, tukipalvelun väärinkäyttötiivisteet | **Oikeutetut edut** — Art. 6(1)(f): meidän ja sinun etusi turvalliseen palveluun. Voit vastustaa käsittelyä; osio 10 |
| Sen todistaminen, että hyväksyit Ehdot ja annoit tai peruutit suostumuksen | Hyväksyntä- ja suostumustiedot | **Lakisääteinen velvoite** — Art. 6(1)(c), velvollisuutemme osoittaa suostumus Art. 7(1) nojalla — sekä oikeutettu etu sopimuksen todentamiseen |
| Tukipyyntöihin vastaaminen | Tuki | **Sopimus** — Art. 6(1)(b) |
| Itsestäsi antamiesi arkaluonteisten tietojen käsitteleminen | Väittelyn sisältö | **Nimenomainen suostumus** — Art. 9(2)(a), annetaan erikseen rekisteröitymisen yhteydessä |
| Julkaistavaksi valitsemasi väittelyn julkaiseminen | Väittelyn sisältö, nimimerkki | **Sopimus** — Art. 6(1)(b), antamasi ohjeen perusteella; sinua koskevien arkaluonteisten tietojen osalta Art. 9(2)(e) — tiedot, jotka olet nimenomaisesti saattanut julkisiksi |
| Tuoteuutisten lähettäminen sinulle | Sähköpostiosoite | **Suostumus** — Art. 6(1)(a), valmiiksi valitsematon valintaruutu; peruuta milloin tahansa mistä tahansa sähköpostista tai Asetuksista |
| Vero-, kirjanpito- ja oikeudellisten velvoitteiden täyttäminen \[pending paid plans\] | Maksut, hyväksyntätiedot | **Lakisääteinen velvoite** — Art. 6(1)(c) |
| Oikeudellisten pyyntöjen, laitonta sisältöä koskevien ilmoitusten ja säilytyspalvelun tarjoajan velvoitteidemme hoitaminen | Kaikki pyynnön kannalta merkitykselliset tiedot | **Lakisääteinen velvoite** — Art. 6(1)(c) — sekä oikeutetut edut |

Emme profiloi sinua, emme käytä tietojasi mainontaan emmekä myy niitä. Emme käytä sisältöäsi mallien kouluttamiseen emmekä salli palveluntarjoajiemme tehdä niin — osio 5.

## 5. Tekoälypalveluntarjoajat ja kansainväliset siirrot

**Mitä lähetetään.** Väittelyn toteuttamiseksi lähetämme tekstiä yhdelle tai useammalle ulkopuoliselle tekoälypalveluntarjoajalle: kysymyksesi, asettamasi ohjaavat huomautukset ja väitteet, jotka järjestelmä muodostaa väittelyn edetessä. Palveluntarjoaja näkee siis kirjoittamastasi tekstistä johdettua ja sen ympärille rakennettua tekstiä. Se ei koskaan saa sähköpostiosoitettasi, tili- tai istuntotunnisteitasi, IP-osoitettasi tai maksutietojasi.

**Mitkä palveluntarjoajat.** Ne luetellaan **tekoälypalveluntarjoajien rekisterissämme** osoitteessa \[dezbatere.ro/providers\], joka on osa tätä käytäntöä. Rekisterissä ilmoitetaan jokaisen palveluntarjoajan oikeushenkilö ja sijoittautumismaa; mitä tietoja se saa ja mihin tarkoitukseen; maat tai alueet, joissa se käsittelee tietoja; sen säilytysehdot ja se, onko tietojen nollasäilytys käytössä käyttämässämme päätepisteessä ja käyttämissämme ominaisuuksissa; saako se sopimuksemme nojalla käyttää syötteitä kouluttamiseen; siirtomekanismi, johon tukeudumme; sekä päivä, jolloin viimeksi tarkistimme tiedot. Palveluntarjoajat voivat vaihtua; Rekisteri on versioitu, ja muutos merkitään siihen.

**Kouluttaminen ja säilyttäminen ovat eri asioita.** Palveluntarjoajien kanssa tekemämme sopimukset estävät sisältösi käyttämisen niiden mallien kouluttamiseen tai parantamiseen. \[Publish only once verified per route.\] Jotkin palveluntarjoajat säilyttävät kehotteita ja vastauksia rajoitetun ajan turvallisuuden, väärinkäytön estämisen tai omien oikeudellisten velvoitteidensa vuoksi; Rekisterissä kerrotaan, kuinka kauan ja miksi. Jos tietojen nollasäilytys on käytössä, Rekisterissä kerrotaan tämä sekä ominaisuudet, joita se koskee. Emme kuvaa sisältöä säilyttämättömäksi, jos sitä tosiasiassa säilytetään.

**Siirrot ETA:n ulkopuolelle.** Yhdysvaltoihin sijoittautuneet palveluntarjoajat saavat tietoja jonkin GDPR:n V luvussa tarkoitetun mekanismin nojalla: EU:n ja Yhdysvaltojen tietosuojakehyksen perusteella, jos kyseinen sopimusosapuoli on sertifioitu näitä tietoja varten, tai Euroopan komission vakiosopimuslausekkeiden (moduuli kaksi, rekisterinpitäjältä henkilötietojen käsittelijälle) perusteella, joita tukevat siirtoriskiä koskeva arviointi ja täydentävät suojatoimet. Rekisterissä nimetään kunkin palveluntarjoajan mekanismi. Saat jäljennöksen käyttämistämme lausekkeista kirjoittamalla osoitteeseen privacy@dezbatere.ro. Jos käyttämämme mekanismi mitätöidään, siirrymme toiseen ennen siirtojen jatkamista ja ilmoitamme siitä sinulle.

**Muut vastaanottajat.** Säilytyspalveluntarjoajamme \[Hetzner, Germany — region …\]; sisällönjakelu- ja tiedonsiirtopalveluntarjoajamme \[Cloudflare\]; sähköpostinvälittäjämme \[…\]; \[our payment provider, once a paid plan exists\]. Kukin toimii dokumentoitujen ohjeidemme mukaisesti henkilötietojen käsittelyä koskevan sopimuksen nojalla GDPR:n 28 artiklan edellyttämin suojatoimin, ja kukin on merkitty Rekisteriin sijainteineen ja siirtomekanismeineen. Emme salli yhdenkään henkilötietojen käsittelijän käyttää tietojasi omiin tarkoituksiinsa. Jos palveluntarjoaja tekisi niin, se olisi itsenäinen rekisterinpitäjä, emmekä lähettäisi sille tietojasi.

**Viranomaiset.** Luovutamme henkilötietoja tuomioistuimille, sääntelyviranomaisille tai lainvalvontaviranomaisille, kun laki sitä edellyttää, ja ilmoitamme siitä sinulle, ellei laki estä ilmoittamista.

## 6. Julkaiseminen ja näkyvyys

Väittelyt ovat yksityisiä, kunnes julkaiset ne. Julkaiseminen on tietoinen, erikseen vahvistettava toimi. Julkaistu väittely näyttää **nimimerkkisi**, kysymyksesi kirjoittamassasi muodossa, argumenttipuun, pisteet, ratkaisun ja luottamusvälin, ja siinä on näkyvä merkintä tekoälyn tuottamasta sisällöstä. Se ei koskaan näytä sähköpostiosoitettasi, istuntotietojasi tai tilihistoriaasi. \[Published debates are / are not\] hakukoneiden indeksoimia \[unless you choose\].

Julkaisun peruuttaminen poistaa väittelyn DebateAI-palvelusta ja tuhoaa julkisen kopiomme avaimen. Lukijoiden, hakukoneiden tai arkistojen jo tekemät kopiot eivät ole hallinnassamme, emmekä voi kutsua niitä takaisin.

Kun poistat tilisi, poistamme kaikki julkaisemasi väittelyt julkisesta käytöstä ilman aiheetonta viivytystä ja viimeistään 30 päivän kuluessa, ellei laki velvoita meitä säilyttämään tiettyä kohdetta. \[Option B — a product change; see the Terms, section 9.\]

## 7. Kuinka kauan säilytämme tietoja

| Tiedot | Säilytysaika | Sen jälkeen |
| --- | --- | --- |
| Tili | Niin kauan kuin tili on olemassa sekä 7 päivän lisäaika sulkemispyyntösi jälkeen | Avaimet tuhotaan; tietue poistetaan |
| Istuntotiedot | 14 päivää viimeisestä käytöstä tai 90 päivää luomisesta sen mukaan, kumpi täyttyy ensin | Poistetaan |
| Sähköpostin vahvistuslinkit | 24 tuntia | Poistetaan |
| Kirjautumisen ja palautuksen riskisignaalit | 90 päivää, tietokannan teknisesti valvomana | Hävitetään |
| Turvallisuuden kirjausketju | Palvelun koko elinkaaren ajan | Vain lisäyksiä salliva; IP-osoite ja user-agent ovat yksisuuntaisia tiivisteitä, eikä niitä voi lukea takaisin |
| Väittelyn sisältö (yksityinen) | Niin kauan kuin tili on olemassa | Avaimet tuhotaan tilin sulkemisen yhteydessä, jolloin sisältöä ei voi lukea |
| Väittelyn sisältö (julkaistu) | Niin kauan kuin se on julkaistu ja tili on olemassa | Poistetaan julkisesta käytöstä julkaisun peruuttamisen tai tilin sulkemisen yhteydessä; avaimet tuhotaan |
| Palveluntarjoajan vastaustiedot ja hakuviitteet | Yhtä kauan kuin väittely, johon ne kuuluvat | Sama |
| Tukikeskustelut ja -tapaukset | \[Until closed plus 12 months\] | Avaimet tuhotaan |
| Hyväksyntä- ja suostumustiedot | Tilin elinkaari sekä 6 vuotta — pisin meihin sovellettava vanhentumisaika | Poistetaan |
| Maksutiedot \[pending\] | 10 vuotta Romanian kirjanpitolainsäädännön edellyttämällä tavalla | Poistetaan |
| Varmuuskopiot \[pending\] | \[… days\] aktiivisen kopion poistamisen jälkeen | Korvataan uusilla tiedoilla |

**Mitä poistaminen tosiasiassa tekee.** Väittelysi ja tilitietosi salataan tilillesi ja kullekin väittelylle ominaisilla avaimilla. Tilisi poistaminen tuhoaa nämä avaimet, minkä jälkeen me tai kukaan muukaan ei voi lukea salattuja tietueita, ja poistamme tilitietueesi. Kutsumme tätä poistamiseksi, koska sen vaikutus on tämä, ja meillä on sen tueksi dokumentoitu arviointi; jos haluat lisätietoja, kysy meiltä. Kolme huomioitavaa asiaa: turvallisuuden kirjausketju on vain lisäyksiä salliva eikä sitä poisteta, mutta se ei sisällä luettavia tunnistetietojasi; pieni määrä vanhempia väittelyjä edeltää nykyistä salausjärjestelmäämme, ja jos tämä koskee tiliäsi, kerromme, mitä tilin sulkeminen niiden osalta saa aikaan; ja tekoälypalveluntarjoajalle jo lähetettyihin tietokopioihin sovelletaan kyseisen palveluntarjoajan Rekisterissä ilmoitettuja säilytysehtoja, ei meidän tekemäämme poistamista.

&#91;The support retention period and the backup line describe policies to implement; the system currently keeps support records indefinitely and has no backup-expiry mechanism. Do not publish figures that are not enforced.\]

## 8. Automaattiset päätökset ja profilointi

Väittelyn pisteet, ehtomerkinnät ja ratkaisut ovat **argumenttien, eivät henkilöiden**, automaattisia arviointeja. Niillä ei ole sinuun kohdistuvia oikeusvaikutuksia eivätkä ne vaikuta sinuun vastaavalla tavalla merkittävästi. Emme tee sinua koskevia päätöksiä, jotka perustuvat yksinomaan automaattiseen käsittelyyn ja joilla on oikeusvaikutuksia tai vastaavalla tavalla merkittäviä vaikutuksia, emmekä profiloi sinua.

Jos joskus automatisoimme tiliäsi koskevan päätöksen — tilin jäädyttämisen tai väittelyn julkaisemisesta kieltäytymisen — henkilö tarkastaa tällaisen päätöksen ennen sen voimaantuloa tai pyynnöstäsi, voit esittää näkemyksesi ja riitauttaa päätöksen. Ehdot kuvaavat menettelyn.

## 9. Turvallisuus ja mitä tapahtuu, jos jokin menee vikaan

Salasanoista muodostetaan Argon2id-tiiviste. Kaksivaiheinen tunnistautuminen on pakollinen. Sähköpostiosoitteesi, väittelysi, tukikeskustelusi ja tunnistautumissalaisuutesi salataan levossa tilillesi ominaisilla avaimilla, ja julkaistujen väittelyjen avaimet säilytetään erillään yksityisten väittelyjen avaimista. Tuotantotietoihin pääsy kirjataan lokiin. Turvallisuuslokissamme olevat IP-osoitteet ja selaintiedot säilytetään vain yksisuuntaisina tiivisteinä.

Jos henkilötietojen tietoturvaloukkaus tapahtuu, ilmoitamme siitä Romanian valvontaviranomaiselle 72 tunnin kuluessa silloin, kun laki sitä edellyttää, ja ilmoitamme sinulle suoraan ilman aiheetonta viivytystä, jos loukkaus todennäköisesti aiheuttaa korkean riskin oikeuksillesi ja vapauksillesi. Liitteessä B luetellaan muilla palvelemillamme alueilla sovellettavat ilmoitussäännöt.

## 10. Oikeutesi ja niiden käyttäminen

Voit käyttää mitä tahansa näistä oikeuksista maksutta kirjoittamalla osoitteeseen **privacy@dezbatere.ro** tai kohdasta **Asetukset → Tietosuoja**, jos sitä varten on toiminto. Vastaamme kuukauden kuluessa; jos pyyntö on monimutkainen, voimme käyttää enintään kaksi kuukautta lisää ja kerromme syyn. Saatamme pyytää sinua vahvistamaan henkilöllisyytesi tilisi kautta.

| Oikeus | Mitä se tarkoittaa tässä yhteydessä |
| --- | --- |
| **Tarkastusoikeus** (Art. 15) | Jäljennös hallussamme olevista sinua koskevista henkilötiedoista sekä nämä tiedot. \[Pending: a JSON export from Settings. Until it exists, we compile the copy manually within the month.\] |
| **Oikeus tietojen oikaisemiseen** (Art. 16) | Korjaa sähköpostiosoitteesi tai palautussähköpostiosoitteesi Asetuksissa. Nimimerkkiäsi ei voi muuttaa Ehdoissa mainituista syistä; voit sulkea tilin ja avata uuden |
| **Oikeus tietojen poistamiseen** (Art. 17) | Poista yksityinen väittely milloin tahansa väittelysivulta. Sulje tilisi Asetuksista; osiossa 7 kerrotaan tarkasti, mitä silloin tapahtuu. Pyydä meitä poistamaan tietojasi sisältävä julkaistu väittely riippumatta siitä, oletko sen tekijä |
| **Oikeus käsittelyn rajoittamiseen** (Art. 18) | Pyydä meitä lopettamaan tiettyjen tietojen käsittely siksi aikaa, kun niitä koskeva erimielisyys ratkaistaan |
| **Vastustamisoikeus** (Art. 21) | Vastusta oikeutettuihin etuihin perustuvaa käsittelyä — osiossa 4 tarkoitettua turvallisuus- ja kirjauskäsittelyä — jolloin lopetamme käsittelyn, ellemme voi osoittaa pakottavia perusteita. Vastusta markkinointia milloin tahansa, jolloin lopetamme sen |
| **Oikeus siirtää tiedot järjestelmästä toiseen** (Art. 20) | Väittelysi ja tilitietosi yleisesti käytetyssä, koneellisesti luettavassa muodossa. \[Pending: same export as Access.\] Luomasi muu kuin henkilötieto, kuten kysymyksesi, palautetaan sinulle pyynnöstä sopimuksen päättyessä |
| **Suostumuksen peruuttaminen** (Art. 7(3)) | Peruuta markkinointisuostumus mistä tahansa sähköpostista tai Asetuksista; peruuta arkaluonteisia tietoja koskeva suostumus jättämällä tällaiset tiedot pois tai poistamalla väittely. Peruuttaminen ei vaikuta jo tapahtuneeseen käsittelyyn |
| **Valituksen tekeminen** | Romanian valvontaviranomaiselle **ANSPDCP**, B-dul G-ral Gheorghe Magheru 28–30, Bukarest, <anspdcp@dataprotection.ro>, tai asuinmaasi viranomaiselle. Toivomme kuitenkin, että otat ensin yhteyttä meihin |

Emme koskaan veloita pyynnöstä emmekä kohtele sinua epäedullisemmin pyynnön esittämisen vuoksi.

## 11. Väittelyissä nimetyt henkilöt, jotka eivät ole käyttäjiämme

Jos joku esittää DebateAI-palvelussa sinut nimeävän kysymyksen, hallussamme voi olla sinua koskevia henkilötietoja, vaikka et olisi koskaan käyttänyt palvelua. Ehdot kieltävät käyttäjiä tekemästä näin, ja minimoimme tekoälypalveluntarjoajille lähettämämme tiedot, mutta näin tapahtuu.

Tämä osio on GDPR:n 14 artiklan nojalla sinulle annettava ilmoitus. Tiedot ovat sitä, mitä käyttäjä kirjoitti ja mitä järjestelmä tuotti vastaukseksi; lähde on kyseinen käyttäjä; tarkoitukset ja oikeusperusteet ovat osiossa 4; vastaanottajat ovat Rekisterissä luetellut tekoälypalveluntarjoajat; säilytykseen sovelletaan osiota 7. Sinulla on kaikki osiossa 10 tarkoitetut oikeudet, ja voit erityisesti pyytää meitä poistamaan tietojasi sisältävän julkaistun tai yksityisen väittelyn sekä kertomaan, mitä tietoja meillä on. Et tarvitse siihen tiliä. Kirjoita osoitteeseen **privacy@dezbatere.ro** tai käytä minkä tahansa julkaistun väittelyn **Ilmoita**-toimintoa, niin käsittelemme perustellut pyynnöt ilman aiheetonta viivytystä. Emme voi ilmoittaa sinulle erikseen, kun näin tapahtuu, koska emme tiedä, kuka olet tai miten tavoittaisimme sinut; tämän sijasta toteutamme toimenpiteinä tämän julkisen ilmoituksen ja poistamisreitin.

Sama koskee sinua koskevia arkaluonteisia tietoja — politiikkaa, terveyttä ja uskontoa — jotka esiintyvät jonkun muun kysymyksessä. Mikään oikeudellinen edellytys ei anna meille lupaa jatkaa niiden käsittelyä sen jälkeen, kun vastustat sitä, emmekä jatka käsittelyä.

## 12. Lapset

DebateAI on tarkoitettu aikuisille. Vahvistat rekisteröityessäsi olevasi vähintään 18-vuotias, emmekä tietoisesti käsittele alle 18-vuotiaiden tietoja. Jos saamme tietää tilin kuuluvan alle 18-vuotiaalle, suljemme sen ja poistamme tiedot osiossa 7 kuvatulla tavalla. Joissakin maissa pelkkää vahvistusta ei pidetä riittävänä tai niissä vaaditaan enemmän; liitteessä B kerrotaan alueellisesti sovellettavat säännöt, ja Ehdoissa selitetään, mitä teemme asian suhteen.

## 13. Evästeet

Asetamme kaksi evästettä, jotka molemmat ovat ehdottoman välttämättömiä: toinen pitää sinut kirjautuneena sisään ja toinen suojaa lomakkeita väärentämiseltä. Emme aseta analytiikka-, mainonta- tai seurantaevästeitä. Osoitteessa \[dezbatere.ro/cookies\] oleva **Evästekäytäntö** luettelee evästeet ja niiden kestot, selittää, miten valintasi tallennetaan, ja sitä muutetaan ennen uuden evästeen lisäämistä. Jos alueesi lainsäädännössä joitakin evästeitä kohdellaan eri tavalla — esimerkiksi Yhdistyneen kuningaskunnan analytiikkaa koskevan kieltäytymisoikeuden vuoksi — tästä kerrotaan Evästekäytännössä.

## 14. Tämän käytännön muutokset

Kun muutamme tätä käytäntöä, julkaisemme uuden version, yhteenvedon muutoksista ja uuden voimaantulopäivän sekä säilytämme aiemmat versiot osoitteessa \[dezbatere.ro/privacy/versions\]. Jos muutos lisää uuden tarkoituksen tai uuden vastaanottajan, ilmoitamme sinulle sähköpostitse ja tuotteessa ennen uuden käsittelyn aloittamista ja annamme aikaa vastustaa sitä. Jos uusi tarkoitus perustuu suostumukseesi — esimerkiksi jos joskus haluaisimme käyttää sisältöä mallien parantamiseen — pyydämme suostumuksen erikseen ja yksilöidysti; emme koskaan pidä päivitettyjen Ehtojen hyväksymistä suostumuksena uuteen käsittelyyn. Jos selvennykset eivät muuta toimintaamme, julkaisemme vain uuden version.

Tämä käytäntö päivitettiin viimeksi \[date\]. Versio 3.0 korvasi version 2.1, jossa istuntotiedot, säilytysajat, analytiikka, tietojen vienti ja poistamisen vaikutus julkaistuihin väittelyihin kuvattiin tavalla, joka ei enää vastannut palvelua.

## Annex B — Alueelliset tietosuojaehdot

Kukin kohta soveltuu vain, jos sen alue on lueteltu Ehtojen osiossa 2, ja siinä ilmoitetaan vain, mikä poikkeaa tämän käytännön varsinaisesta osasta.

### B.1 Euroopan unioni ja Euroopan talousalue

Tämän käytännön varsinainen osa on kirjoitettu sinua varten. Meitä valvova viranomainen on Romanian **ANSPDCP**; voit tehdä valituksen myös asuinmaasi viranomaiselle. Romanialaiset käyttäjät: tämä käytäntö on saatavilla romaniaksi osoitteessa \[URL\].

### B.2 Yhdistynyt kuningaskunta *(vain jos lueteltu)*

Yhdistyneessä kuningaskunnassa UK GDPR:n 27 artiklan mukainen edustajamme on **\[name, address, email\]**; voit ottaa häneen yhteyttä kaikissa tätä käytäntöä koskevissa asioissa. Valvontaviranomainen on **Information Commissioner's Office**, [ico.org.uk](https://ico.org.uk). Voit tehdä meille valituksen osoitteessa \[URL\] olevalla lomakkeella, ja vahvistamme sen vastaanoton 30 päivän kuluessa. Tietojesi siirrot Yhdistyneestä kuningaskunnasta Yhdysvalloissa toimiville tekoälypalveluntarjoajille perustuvat \[the UK Extension to the EU–US Data Privacy Framework, where the provider is certified / the UK International Data Transfer Addendum to the EU standard contractual clauses\], jota tukee siirtoriskiä koskeva arviointi. Jos joskus asettaisimme analytiikkaevästeitä, niihin sovellettaisiin Yhdistyneessä kuningaskunnassa kieltäytymisoikeutta suostumuksen sijasta; tällä hetkellä emme aseta niitä. Jos olet alle 18-vuotias ja pääset palveluun ikäsäännöstämme huolimatta, tietojesi käsittelyyn sovelletaan ICO:n Children's Code -säännöstön vaatimuksia.

### B.3 Yhdysvallat *(vain jos lueteltu)*

**Ilmoitus tietojen keräämisen yhteydessä.** Osion 2 taulukossa luetellaan kaikki keräämämme henkilötietoluokat, niiden tarkoitus ja säilytysaika (osio 7). Keräämme seuraavia *arkaluonteisten* henkilötietojen luokkia vain, jos sisällytät niitä omiin kysymyksiisi: \[health, religious or philosophical beliefs, sexual orientation, union membership, political views\], ja käytämme niitä vain väittelyjesi toteuttamiseen. **Emme myy tai jaa henkilötietoja emmekä ole tehneet niin edeltävien kahdentoista kuukauden aikana.** Emme käytä arkaluonteisia henkilötietoja muuhun tarkoitukseen kuin pyytämäsi palvelun tarjoamiseen. **Kieltäytymisvalintaa ilmaisevat signaalit:** noudatamme Global Privacy Control -signaaleja pyyntönä kieltäytyä myynnistä tai jakamisesta, joita emme missään tapauksessa harjoita. **Oikeutesi:** oikeus saada tietää, poistaa ja oikaista tietoja, kieltäytyä käsittelystä, rajoittaa arkaluonteisten henkilötietojen käyttöä sekä olla joutumatta syrjityksi näiden oikeuksien käyttämisen vuoksi; esitä pyyntö osoitteessa privacy@dezbatere.ro tai \[toll-free number / form\]. **Taloudelliset kannustimet:** emme tarjoa niitä; ilmaisten ja maksullisten tilausten välillä ei ole eroa siinä, miten käsittelemme tietojasi. **Säilytysajat** esitetään osiossa 7. Tämä ilmoitus päivitetään vähintään kahdentoista kuukauden välein; viimeksi päivitetty \[date\].

*Washington:* erillinen **Consumer Health Data Privacy Notice** -asiakirjamme osoitteessa \[URL\] koskee kaikkia terveyteen liittyviä tietoja, päätelmät mukaan lukien. *Texas ja Nebraska:* emme myy arkaluonteisia henkilötietoja; jos tämä joskus muuttuisi, hankkisimme ensin suostumuksesi \[statutory language\]. *Colorado, Connecticut, Virginia ja muut osavaltiot, joissa on kattava tietosuojalainsäädäntö:* edellä mainitut oikeudet koskevat sinua, jos meihin sovellettava laki niin määrää; hae muutosta hylättyyn pyyntöön kirjoittamalla osoitteeseen \[appeals@dezbatere.ro\].

### B.4 Kanada ja Quebec *(vain jos lueteltu)*

Tietosuojavastaavamme on **\[name, email\]**. Vastaamme edelleen Kanadan ulkopuolella toimiville tekoälypalveluntarjoajille siirtämistämme henkilötiedoista ja edellytämme sopimuksilla vastaavaa suojaa; näihin palveluntarjoajiin voidaan soveltaa niiden toimintamaiden lakeja, mukaan lukien viranomaisten laillinen pääsy tietoihin. Markkinointisähköpostia lähetetään vain CASL:n mukaisella nimenomaisella suostumuksellasi. **Quebec:** ennen henkilötietojen välittämistä Quebecin ulkopuolelle teemme tietosuojaa koskevan vaikutustenarvioinnin; väittelysi yksityisinä pitävät asetukset ovat oletusarvoisesti käytössä; voit pyytää meitä poistamaan sinua koskevat henkilötiedot hakemistoista tai lopettamaan niiden levittämisen; voit pyytää tietosi jäsennellyssä, yleisesti käytetyssä muodossa; osiossa 8 kuvataan automaattinen käsittelymme.

### B.5 Australia ja Uusi-Seelanti *(vain jos lueteltu)*

**Australia.** Henkilötietojesi ulkomaiset vastaanottajat ovat Rekisterissä luetellut tekoälypalveluntarjoajat ja henkilötietojen käsittelijät, jotka sijaitsevat \[the United States and the European Union\]; ryhdymme kohtuullisiin toimiin varmistaaksemme, että ne käsittelevät tietoja Australian Privacy Principles -periaatteiden mukaisesti. **Automaattiset päätökset:** 10. joulukuuta 2026 alkaen tässä käytännössä yksilöidään tietokoneohjelmien tekemät päätöstyypit, jotka vaikuttavat merkittävästi oikeuksiisi tai etuihisi — sellaisia ei ole; pisteet ja ratkaisut koskevat argumentteja, eivät sinua — sekä niissä käytetyt henkilötiedot. Valituksia voi tehdä **Office of the Australian Information Commissioner** -viranomaiselle. **Uusi-Seelanti.** Tietosuojavastaavamme on \[name\]. Kun keräämme sinua koskevia henkilötietoja välillisesti — koska toinen käyttäjä sisällytti niitä kysymykseen — tämä käytäntö ja osio 11 ovat sinulle antamamme ilmoitus. Luovutamme tietoja Rekisterissä luetelluille tekoälypalveluntarjoajille edustajinamme sellaisten sopimusten nojalla, joissa edellytetään vastaavia suojatoimia. Valituksia voi tehdä **Office of the Privacy Commissioner** -viranomaiselle.

### B.6 Latinalainen Amerikka *(espanjankielinen liite; vain jos lueteltu)*

&#91;Published in Spanish.\] Suostumus on käsittelyn peruste, jos sopimuksen täytäntöönpano ei edellytä käsittelyä. ARCO-oikeuksia — tarkastamista, oikaisemista, poistamista ja vastustamista — voi käyttää osoitteessa privacy@dezbatere.ro, ja vastaukset annetaan \[per country\] kuluessa. *Meksiko:* kaikki pakolliset osat sisältävä *aviso de privacidad* on osoitteessa \[URL\]. *Argentiina:* \[AAIP mandatory legend\]; tiedot on rekisteröity taholle \[…\]. *Kolumbia:* *política de tratamiento de datos* -käytäntömme on osoitteessa \[URL\]; viranomainen on SIC. *Chile* (1. joulukuuta 2026 alkaen): viraston yhteystieto on \[…\]; osiossa 8 selitetään automaattinen käsittelymme.

### B.7 Persianlahden alue — Arabiemiirikunnat ja Saudi-Arabia *(vain jos lueteltu)*

Kun käsittelemme tietojasi muihin tarkoituksiin kuin palvelun tarjoamiseen, tukeudumme suostumukseesi, jonka voit peruuttaa. Tietosi siirretään pois alueelta \[UAE / Kingdom of Saudi Arabia\] ja käsitellään Euroopan unionissa ja Yhdysvalloissa mekanismin \[SDAIA standard contractual clauses / the mechanism in the Register\] nojalla. Markkinointia lähetetään vain suostumuksellasi. Älä sisällytä kysymyksiisi arkaluonteisia henkilötietoja.

### B.8 Aasian ja Tyynenmeren alue *(vain lueteltuja alueita koskevat rivit)*

*Singapore:* tietosuojavastaavamme on **\[name, email\]**; siirrot perustuvat sopimusvelvoitteisiin, jotka tarjoavat PDPA:ta vastaavan suojan; ilmoitamme PDPC:lle ilmoitettavista tietoturvaloukkauksista 3 päivän kuluessa. *Japani:* käytämme henkilötietojasi osiossa 4 tarkoitettuihin tarkoituksiin emmekä muihin; sisältösi siirretään palveluntarjoajille maihin \[named countries — e.g. the United States\], joiden tietosuojajärjestelmät ja suojatoimet kuvataan Rekisterissä, ja annat tähän suostumuksesi rekisteröityessäsi. *Etelä-Korea:* tietosuojavastaavamme on **\[name\]**; ulkomaille tehtävien siirtojen tietosisältö, kohde, ajankohta, vastaanottaja, tarkoitus ja säilytysaika esitetään Rekisterissä; kysymyksissäsi olevat poliittiset mielipiteet ovat arkaluonteisia tietoja, ja käsittelemme niitä vain väittelyjesi toteuttamiseksi; vapaaehtoista käsittelyä koskevat suostumukset kerätään erikseen. *Intia* (kun DPDP-sääntöjä ryhdytään soveltamaan): erillistä suostumusta koskevaa ilmoitusta osoitteessa \[URL\] sovelletaan; pyyntöihin vastataan 90 päivän kuluessa; alle 18-vuotiaat käyttäjät tarvitsevat todennettavan vanhemman suostumuksen. *Filippiinit:* tietosuojavastaavamme on \[name\]; valituksia voi tehdä National Privacy Commission -viranomaiselle; osiossa 8 kuvataan automaattinen käsittelymme. *Thaimaa:* edustajamme on \[name\] \[if appointed\].

### B.9 Varattu

Turkki, Brasilia ja Indonesia edellyttävät kukin paikalliskielistä ilmoitusta, edustajaa tai rekisteröintiä sekä viranomaisilmoituksia, eikä niitä ole laadittu tähän. Kiinaa, Vietnamia ja Venäjää ei palvella.
