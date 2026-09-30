# DebateAI — Datenschutzerklärung

<!-- legal-chrome
summaryTitle: Kurz gesagt
eyebrow: DATENSCHUTZERKLÄRUNG · v3.0 · GÜLTIG AB [DATE]
title: Was wir speichern und warum
lede: DSGVO – GDPR (EU) 2016/679: Ihre Rechte und unsere Pflichten, verständlich formuliert. Vierzehn Abschnitte und Anhang B – scrollen Sie bis zum Ende.
endMarker: ENDE DER DATENSCHUTZERKLÄRUNG · DSGVO – GDPR (EU) 2016/679 · v3.0
bodyLabel: Text der Datenschutzerklärung
annexTitle: Anhang B – Regionale Datenschutzbestimmungen
jumps:
01 VERANTWORTLICHER
02 WAS WIR ERHEBEN
04 RECHTSGRUNDLAGE
05 MODELLE & ÜBERMITTLUNGEN
06 VERÖFFENTLICHUNG
07 SPEICHERDAUER
10 IHRE DSGVO-RECHTE
13 COOKIES
-->

2026-09-21 · @Someone

**Entwurf v3.0 zur anwaltlichen Prüfung — ersetzt die ausgelieferte v2.1 (`apps/ui/lib/privacyPolicy.ts`). Keine Rechtsberatung.** Diese Fassung beschreibt, was der Code tatsächlich tut, und berichtigt die fünf Aussagen in v2.1, denen der Code widersprach: Sitzungsdaten, Speicherfristen, Analysen, Export und die Folgen einer Löschung für veröffentlichte Debatten. Eckige Klammern kennzeichnen Angaben, die nur Sie ergänzen können; \[pending\] kennzeichnet eine in der Datenschutzerklärung beschriebene Funktion, die noch nicht umgesetzt ist und vor Veröffentlichung der Datenschutzerklärung vorhanden sein muss.

**Version 3.0 · Effective \[date\] · Frühere Fassungen unter dezbatere.ro/privacy/versions · Verantwortlicher: DebateAIRO S.R.L., Bukarest**

**In short.** Wir erheben, was für ein Konto erforderlich ist und was Sie freiwillig eingeben. Ihre Fragen werden an die in unserem Verzeichnis aufgeführten KI-Anbieter übermittelt; sie werden nicht zum Trainieren von Modellen verwendet. Debatten sind privat, sofern Sie sie nicht veröffentlichen. Durch die Löschung Ihres Kontos werden die Schlüssel zu Ihren Daten vernichtet und Ihre veröffentlichten Debatten entfernt. Sie erreichen uns unter privacy@dezbatere.ro; in einer Debatte genannte Personen können auch ohne Konto die Entfernung verlangen.

## 1. Wer für Ihre Daten verantwortlich ist

Verantwortlicher für Ihre personenbezogenen Daten ist **DebateAIRO S.R.L.**, \[address\], Bukarest, Rumänien, Handelsregister \[J40/…\], CUI \[…\]. Schreiben Sie bei allen Anliegen zu dieser Datenschutzerklärung an **privacy@dezbatere.ro**; wir antworten innerhalb eines Monats. Wir haben keinen Datenschutzbeauftragten benannt, weil wir hierzu gesetzlich nicht verpflichtet sind; diese Adresse wird von \[role\] betreut. Soweit wir für ein bestimmtes Land einen Vertreter oder Datenschutzbeauftragten benannt haben, ist dieser in Anhang B aufgeführt.

## 2. Was wir erheben und woher es stammt

Wir erheben nur, was für die Funktionsfähigkeit eines Kontos erforderlich ist, was Sie uns freiwillig zur Verfügung stellen und was wir gesetzlich aufbewahren müssen.

| Kategorie | Genaue Angaben | Quelle |
| --- | --- | --- |
| **Konto** | E-Mail-Adresse und Wiederherstellungs-E-Mail-Adresse (verschlüsselt gespeichert, mit einem schlüsselbasierten Index, damit wir das Konto finden können, ohne die Adresse zu lesen); Passwort (als Hash gespeichert, niemals im Klartext); Ihr Geheimnis für die Zwei-Faktor-Authentifizierung (verschlüsselt); zehn Wiederherstellungscodes (als Hashes gespeichert); Ihr Pseudonym; der Zeitpunkt, zu dem Sie bestätigt haben, mindestens 18 Jahre alt zu sein | Sie, bei der Registrierung |
| **Sitzungen und Sicherheit** | Ein gehashtes Sitzungstoken; ein schlüsselbasierter Hash der User-Agent-Zeichenfolge Ihres Browsers, mit dem erkannt wird, wenn eine Sitzung zu einem anderen Browser wechselt; Zeitstempel der Erstellung, letzten Nutzung und des Ablaufs. Wir speichern **weder** Ihre IP-Adresse noch den Gerätenamen oder Browserdetails zusammen mit einer Sitzung, und die Sitzungsliste in den Einstellungen zeigt nur Zeitstempel | Ihr Browser |
| **Sicherheitsprotokoll** | Ein nur ergänzbares Protokoll sicherheitsrelevanter Ereignisse – Registrierung, Bestätigung der E-Mail-Adresse, Anmeldeversuche, Wiederherstellung, Veröffentlichung, Löschung. Die IP-Adresse und der User-Agent jedes Ereignisses werden ausschließlich als schlüsselbasierte Einweg-Digests (Argon2id) gespeichert, sodass sie nicht ausgelesen, jedoch innerhalb eines Zeitraums abgeglichen werden können. Risikoindikatoren für Anmeldung und Wiederherstellung werden 90 Tage lang verschlüsselt gespeichert | Ihr Browser zum Zeitpunkt des jeweiligen Ereignisses |
| **Debatteninhalte** | Die von Ihnen eingegebene Frage; die von Ihnen festgelegten Steuerungsanmerkungen; die Behauptungen, Kritiken, Evidenzverweise, Bewertungen und Urteile, die das System erzeugt; eine wortgetreue Aufzeichnung der Antworten jedes KI-Anbieters; Suchabfragen und Quellenverweise. All dies wird mit einem kontospezifischen Schlüssel verschlüsselt gespeichert | Sie und die KI-Modelle, die Ihre Frage bearbeiten |
| **Support** | Nachrichten, die Sie mit dem Support-Assistenten oder einer Person austauschen, verschlüsselt gespeichert; die verwendete Sprache; ob Sie dem Assistenten erlaubt haben, den Status (niemals den Inhalt) Ihrer Debatten einzusehen; von Ihnen abgegebene Bewertungen. Löst eine Nachricht Maßnahmen zur Missbrauchskontrolle aus, speichern wir einen Hash der Nachricht und einen Hash der IP-Adresse, von der sie stammt | Sie |
| **Nachweise über Annahme und Einwilligung** | Version und Inhalts-Hash der von Ihnen angenommenen Nutzungsbedingungen und der Ihnen angezeigten Datenschutzerklärung; Zeitpunkt; verwendeter Bildschirm und Mechanismus; Ihre Sprache; Ihre IP-Adresse und Ihr User-Agent zu diesem Zeitpunkt; jede von Ihnen erteilte oder widerrufene Einwilligung sowie der jeweilige Zeitpunkt | Ihr Browser, bei der Registrierung und bei jeder Änderung einer Auswahl |
| **Zahlungen** \[pending — once a paid plan exists\] | Tarif, Preis, Abrechnungszeitraum, Transaktionsreferenzen, Nachweise zum Steuerstandort. Kartendaten werden von unserem Zahlungsanbieter gespeichert, niemals von uns | Sie und der Zahlungsanbieter |
| **Personen, die unseren Dienst nicht nutzen** | Personenbezogene Daten über andere Personen, die Sie in eine Frage aufnehmen oder die das System bei deren Beantwortung erzeugt. Wir bitten Sie, dies nicht zu tun; Abschnitt 11 erläutert, was wir unternehmen, wenn es dennoch geschieht | Sie, mittelbar |

Wir erheben **keine** Analyse- oder Telemetriedaten darüber, wie Sie das Produkt nutzen, und setzen zu diesem Zweck keine Cookies. Sollte sich dies ändern, werden zuerst diese Datenschutzerklärung und die Cookie-Richtlinie geändert und Sie werden um Ihre Entscheidung gebeten.

## 3. Sensible Informationen

Eine Debattenplattform lädt zu Fragen über Politik, Religion, Gesundheit, Sexualität und Überzeugungen ein. Dabei handelt es sich gemäß Artikel 9 DSGVO um besondere Kategorien personenbezogener Daten, die in Ihren Fragen enthalten sein können, unabhängig davon, ob wir sie erheben wollen.

**Über Sie.** Bei der Registrierung willigen Sie in einem gesonderten Satz ausdrücklich ein, dass wir sensible Informationen verarbeiten, die Sie zur Durchführung Ihrer Debatten in Ihre eigenen Fragen aufnehmen. Sie können diese Einwilligung jederzeit widerrufen, indem Sie solche Informationen nicht aufnehmen oder eine Debatte löschen. Informationen über sich selbst, die Sie veröffentlichen, sind Daten, die Sie selbst öffentlich gemacht haben.

**Über andere Personen.** Keine gesetzliche Ausnahme erlaubt uns, sensible Daten einer von Ihnen in einer Frage genannten dritten Person zu verarbeiten; das gilt auch für jeden unserer KI-Anbieter. Deshalb untersagen die Nutzungsbedingungen dies, deshalb minimieren wir die übermittelten Daten und deshalb entfernen wir solche Inhalte auf Anfrage unverzüglich – Abschnitt 11.

**Gesundheitsinformationen.** In einigen Ländern unterliegen gesundheitsbezogene Daten einschließlich Schlussfolgerungen besonderen Gesetzen. Wenn Sie in \[the State of Washington\] leben, gilt eine gesonderte \[Consumer Health Data Privacy Notice\].

## 4. Warum und auf welcher Grundlage wir Ihre Daten verwenden

Jeder Zweck beruht auf genau einer Rechtsgrundlage gemäß Artikel 6 Absatz 1 DSGVO, und wir verwenden für einen Zweck erhobene Daten nicht für einen anderen Zweck weiter.

| Zweck | Daten | Grundlage |
| --- | --- | --- |
| Einrichtung und Führung Ihres Kontos, Authentifizierung, Durchführung und Speicherung Ihrer Debatten, damit Sie diese erneut öffnen und wiedergeben können | Konto, Sitzungen, Debatteninhalte | **Vertrag** – Art. 6(1)(b) |
| Übermittlung Ihrer Frage und der Aussagen des Systems an KI-Anbieter zur Erzeugung einer Debatte | Debatteninhalte | **Vertrag** – Art. 6(1)(b) |
| Sicherung des Dienstes, Erkennung von Missbrauch, Ermöglichung der Erkennung einer nicht von Ihnen vorgenommenen Anmeldung, Führung eines Prüfprotokolls | Sitzungen, Sicherheitsprotokoll, Support-Hashes zur Missbrauchskontrolle | **Berechtigte Interessen** – Art. 6(1)(f): unsere und Ihre Interessen an einem sicheren Dienst. Sie können Widerspruch einlegen; Abschnitt 10 |
| Nachweis, dass Sie die Nutzungsbedingungen angenommen und eine Einwilligung erteilt oder widerrufen haben | Nachweise über Annahme und Einwilligung | **Rechtliche Verpflichtung** – Art. 6(1)(c), unsere Pflicht zum Nachweis der Einwilligung gemäß Art. 7(1) – sowie berechtigte Interessen am Nachweis des Vertrags |
| Bearbeitung von Support-Anfragen | Support | **Vertrag** – Art. 6(1)(b) |
| Verarbeitung sensibler Informationen, die Sie über sich selbst aufnehmen | Debatteninhalte | **Ausdrückliche Einwilligung** – Art. 9(2)(a), bei der Registrierung gesondert erteilt |
| Veröffentlichung einer Debatte, die Sie veröffentlichen möchten | Debatteninhalte, Pseudonym | **Vertrag** – Art. 6(1)(b), auf Ihre Weisung; bei sensiblen Daten über Sie Art. 9(2)(e) – Daten, die Sie offensichtlich öffentlich gemacht haben |
| Zusendung von Produktneuigkeiten | E-Mail-Adresse | **Einwilligung** – Art. 6(1)(a), ein nicht vorausgewähltes Kästchen; jederzeit über jede E-Mail oder die Einstellungen widerrufbar |
| Erfüllung steuerlicher, buchhalterischer und rechtlicher Verpflichtungen \[pending paid plans\] | Zahlungen, Nachweise über die Annahme der Nutzungsbedingungen | **Rechtliche Verpflichtung** – Art. 6(1)(c) |
| Bearbeitung rechtlicher Anfragen, Meldungen rechtswidriger Inhalte und unserer Verpflichtungen als Hostingdienst | Alle für die Anfrage relevanten Daten | **Rechtliche Verpflichtung** – Art. 6(1)(c) – und berechtigte Interessen |

Wir erstellen keine Profile von Ihnen, verwenden Ihre Daten nicht für Werbung und verkaufen sie nicht. Wir verwenden Ihre Inhalte nicht zum Trainieren von Modellen und gestatten dies auch unseren Anbietern nicht – Abschnitt 5.

## 5. KI-Anbieter und internationale Übermittlungen

**Welche Daten übermittelt werden.** Zur Durchführung einer Debatte übermitteln wir Text an einen oder mehrere externe KI-Anbieter: Ihre Frage, die von Ihnen festgelegten Steuerungsanmerkungen und Aussagen, die das System im Verlauf der Debatte verfasst. Ein Anbieter sieht daher Text, der aus Ihren Eingaben abgeleitet und um diese herum aufgebaut ist. Er erhält niemals Ihre E-Mail-Adresse, Ihre Konto- oder Sitzungskennungen, Ihre IP-Adresse oder Ihre Zahlungsdaten.

**Welche Anbieter.** Sie sind in unserem **Verzeichnis der KI-Anbieter** unter \[dezbatere.ro/providers\] aufgeführt, das Bestandteil dieser Datenschutzerklärung ist. Das Verzeichnis nennt für jeden Anbieter dessen Rechtsträger und Sitzstaat; welche Daten er zu welchem Zweck erhält; die Länder oder Regionen der Verarbeitung; seine Aufbewahrungsbedingungen und ob für den von uns verwendeten Endpunkt und die verwendeten Funktionen eine Null-Daten-Aufbewahrung aktiv ist; ob er Eingaben nach unserem Vertrag für Trainingszwecke verwenden darf; den von uns herangezogenen Übermittlungsmechanismus; sowie das Datum der letzten Überprüfung jedes Eintrags. Anbieter können wechseln; das Verzeichnis wird versioniert und Änderungen werden dort vermerkt.

**Training und Aufbewahrung sind unterschiedliche Dinge.** Unsere Verträge mit den Anbietern schließen eine Nutzung Ihrer Inhalte zum Trainieren oder Verbessern ihrer Modelle aus. \[Publish only once verified per route.\] Einige Anbieter bewahren Eingaben und Antworten für einen begrenzten Zeitraum zur Sicherheit, Missbrauchsprävention oder zur Erfüllung eigener rechtlicher Verpflichtungen auf; das Verzeichnis gibt Dauer und Grund an. Wo eine Null-Daten-Aufbewahrung aktiv ist, nennt das Verzeichnis dies und die betroffenen Funktionen. Wir werden Inhalte nicht als ungespeichert bezeichnen, wenn sie gespeichert werden.

**Übermittlungen außerhalb des EWR.** Anbieter mit Sitz in den Vereinigten Staaten erhalten Daten über einen der Mechanismen nach Kapitel V DSGVO: den Datenschutzrahmen EU–USA, sofern der konkrete Vertragspartner für diese Daten zertifiziert ist, oder die Standardvertragsklauseln der Europäischen Kommission (Modul Zwei, Verantwortlicher an Auftragsverarbeiter), ergänzt durch eine Risikobewertung der Übermittlung und zusätzliche Maßnahmen. Das Verzeichnis nennt den Mechanismus für jeden Anbieter. Eine Kopie der von uns verwendeten Klauseln erhalten Sie auf Anfrage an privacy@dezbatere.ro. Wird ein von uns herangezogener Mechanismus für ungültig erklärt, wechseln wir vor der Fortsetzung der Übermittlungen zu einem anderen und informieren Sie.

**Andere Empfänger.** Unser Hostinganbieter \[Hetzner, Germany — region …\]; unser Anbieter für Inhaltsauslieferung und Datenübertragung \[Cloudflare\]; unser E-Mail-Relay \[…\]; \[our payment provider, once a paid plan exists\]. Jeder handelt auf Grundlage unserer dokumentierten Weisungen im Rahmen eines Auftragsverarbeitungsvertrags mit den nach Artikel 28 erforderlichen Garantien und ist mit Standort und Übermittlungsmechanismus im Verzeichnis aufgeführt. Wir gestatten keinem Auftragsverarbeiter, Ihre Daten für eigene Zwecke zu verwenden. Würde ein Anbieter dies tun, wäre er selbst Verantwortlicher, und wir würden ihm Ihre Daten nicht übermitteln.

**Behörden.** Wir legen personenbezogene Daten Gerichten, Aufsichts- oder Strafverfolgungsbehörden offen, wenn das Gesetz dies verlangt, und informieren Sie, sofern uns das Gesetz daran nicht hindert.

## 6. Veröffentlichung und Sichtbarkeit

Debatten sind privat, bis Sie sie veröffentlichen. Die Veröffentlichung ist eine bewusste, gesondert bestätigte Handlung. Eine veröffentlichte Debatte zeigt Ihr **Pseudonym**, Ihre Frage in Ihrem Wortlaut, den Argumentationsbaum, die Bewertungen, das Urteil und den Konfidenzbereich sowie einen sichtbaren Hinweis, dass der Inhalt KI-generiert ist. Ihre E-Mail-Adresse, Ihre Sitzungsaufzeichnungen und Ihr Kontoverlauf werden niemals angezeigt. \[Published debates are / are not\] von Suchmaschinen indexiert \[unless you choose\].

Durch die Aufhebung der Veröffentlichung wird die Debatte aus DebateAI entfernt und der Schlüssel zu unserer öffentlichen Kopie vernichtet. Bereits von Dritten, Suchmaschinen oder Archiven angefertigte Kopien liegen außerhalb unserer Kontrolle und können von uns nicht zurückgerufen werden.

Wenn Sie Ihr Konto löschen, entfernen wir jede von Ihnen veröffentlichte Debatte unverzüglich und spätestens innerhalb von 30 Tagen aus dem öffentlichen Zugriff, sofern wir nicht gesetzlich zur Aufbewahrung eines bestimmten Inhalts verpflichtet sind. \[Option B — a product change; see the Terms, section 9.\]

## 7. Wie lange wir Daten aufbewahren

| Daten | Dauer | Danach |
| --- | --- | --- |
| Konto | Solange das Konto besteht, zuzüglich einer siebentägigen Schonfrist nach Ihrem Schließungsantrag | Schlüssel vernichtet; Datensatz gelöscht |
| Sitzungsaufzeichnungen | 14 Tage nach der letzten Nutzung oder 90 Tage nach der Erstellung, je nachdem, was zuerst eintritt | Gelöscht |
| Links zur Bestätigung der E-Mail-Adresse | 24 Stunden | Gelöscht |
| Risikoindikatoren für Anmeldung und Wiederherstellung | 90 Tage, durch die Datenbank durchgesetzt | Bereinigt |
| Sicherheitsprotokoll | Für die Lebensdauer des Dienstes | Nur ergänzbar; IP und User-Agent sind Einweg-Digests und können nicht ausgelesen werden |
| Debatteninhalte (privat) | Solange das Konto besteht | Schlüssel bei Schließung vernichtet, wodurch die Inhalte unlesbar werden |
| Debatteninhalte (veröffentlicht) | Solange sie veröffentlicht sind und das Konto besteht | Bei Aufhebung der Veröffentlichung oder Schließung aus dem öffentlichen Zugriff entfernt; Schlüssel vernichtet |
| Aufzeichnungen der Antworten der Anbieter und Suchreferenzen | So lange wie die zugehörige Debatte | Ebenso |
| Support-Gespräche und -fälle | \[Until closed plus 12 months\] | Schlüssel vernichtet |
| Nachweise über Annahme und Einwilligung | Lebensdauer des Kontos zuzüglich 6 Jahren – die längste für uns geltende Verjährungsfrist | Gelöscht |
| Zahlungsunterlagen \[pending\] | 10 Jahre, wie nach rumänischem Rechnungslegungsrecht vorgeschrieben | Gelöscht |
| Sicherungen \[pending\] | \[… days\] nach Löschung der aktiven Kopie | Überschrieben |

**Was die Löschung tatsächlich bewirkt.** Ihre Debatten und Kontodaten sind mit Schlüsseln verschlüsselt, die jeweils Ihrem Konto und der einzelnen Debatte zugeordnet sind. Bei der Löschung Ihres Kontos werden diese Schlüssel vernichtet; anschließend können die verschlüsselten Datensätze weder von uns noch von anderen gelesen werden, und wir löschen Ihren Kontodatensatz. Wir bezeichnen dies als Löschung, weil es diese Wirkung hat, und verfügen hierzu über eine dokumentierte Bewertung; wenn Sie mehr erfahren möchten, fragen Sie uns. Drei Punkte sind zu beachten: Das Sicherheitsprotokoll ist nur ergänzbar und wird nicht gelöscht, enthält jedoch keine lesbaren Kennungen Ihrer Person; eine geringe Anzahl älterer Debatten entstand vor unserem aktuellen Verschlüsselungsverfahren, und sollte dies Ihr Konto betreffen, erläutern wir Ihnen, was die Schließung für diese Daten bewirkt; Kopien von Daten, die bereits an einen KI-Anbieter übermittelt wurden, unterliegen den Aufbewahrungsbedingungen dieses Anbieters im Verzeichnis und nicht unserer Löschung.

&#91;The support retention period and the backup line describe policies to implement; the system currently keeps support records indefinitely and has no backup-expiry mechanism. Do not publish figures that are not enforced.\]

## 8. Automatisierte Entscheidungen und Profiling

Die Bewertungen, Bedingungsmarkierungen und Urteile in einer Debatte sind automatisierte Beurteilungen von **Argumenten, nicht von Personen**. Sie entfalten Ihnen gegenüber keine rechtliche Wirkung und beeinträchtigen Sie auch nicht in vergleichbar erheblicher Weise. Wir treffen keine Entscheidung über Sie, die ausschließlich auf automatisierter Verarbeitung beruht und rechtliche oder vergleichbar erhebliche Auswirkungen hat, und wir erstellen kein Profil von Ihnen.

Sollten wir jemals eine Entscheidung über Ihr Konto automatisieren – etwa dessen Sperrung oder die Ablehnung der Veröffentlichung einer Debatte –, wird eine Person jede solche Entscheidung vor ihrem Wirksamwerden oder auf Ihren Antrag überprüfen; Sie können Ihren Standpunkt darlegen und die Entscheidung anfechten. Die Nutzungsbedingungen beschreiben das Verfahren.

## 9. Sicherheit und Vorgehen bei Störungen

Passwörter werden mit Argon2id gehasht. Die Zwei-Faktor-Authentifizierung ist verpflichtend. Ihre E-Mail-Adresse, Debatten, Support-Gespräche und Authentifizierungsgeheimnisse werden im Ruhezustand mit kontospezifischen Schlüsseln verschlüsselt; die Schlüssel für veröffentlichte Debatten werden getrennt von denen für private Debatten aufbewahrt. Zugriffe auf Produktionsdaten werden protokolliert. IP-Adressen und Browserdetails in unserem Sicherheitsprotokoll werden ausschließlich als Einweg-Digests gespeichert.

Kommt es zu einer Verletzung des Schutzes personenbezogener Daten, melden wir diese der rumänischen Aufsichtsbehörde innerhalb von 72 Stunden, soweit gesetzlich vorgeschrieben, und informieren Sie direkt und unverzüglich, wenn die Verletzung voraussichtlich ein hohes Risiko für Ihre Rechte und Freiheiten zur Folge hat. Anhang B führt die Meldevorschriften der anderen Regionen auf, in denen wir den Dienst anbieten.

## 10. Ihre Rechte und ihre Ausübung

Sie können jedes dieser Rechte unentgeltlich ausüben, indem Sie an **privacy@dezbatere.ro** schreiben oder, soweit ein entsprechendes Bedienelement verfügbar ist, über **Einstellungen → Datenschutz**. Wir antworten innerhalb eines Monats; bei komplexen Anträgen können wir bis zu zwei weitere Monate benötigen und teilen Ihnen den Grund mit. Wir können Sie bitten, Ihre Identität über Ihr Konto zu bestätigen.

| Recht | Bedeutung in diesem Zusammenhang |
| --- | --- |
| **Auskunft** (Art. 15) | Eine Kopie der personenbezogenen Daten, die wir über Sie gespeichert haben, sowie diese Informationen. \[Pending: a JSON export from Settings. Until it exists, we compile the copy manually within the month.\] |
| **Berichtigung** (Art. 16) | Korrigieren Sie Ihre E-Mail- oder Wiederherstellungs-E-Mail-Adresse in den Einstellungen. Ihr Pseudonym kann aus den in den Nutzungsbedingungen genannten Gründen nicht geändert werden; Sie können das Konto schließen und ein neues eröffnen |
| **Löschung** (Art. 17) | Löschen Sie eine private Debatte jederzeit auf der Debattenseite. Schließen Sie Ihr Konto in den Einstellungen; Abschnitt 7 erläutert die Folgen genau. Verlangen Sie von uns die Entfernung einer veröffentlichten Debatte, die Ihre Daten enthält, unabhängig davon, ob Sie sie verfasst haben |
| **Einschränkung** (Art. 18) | Verlangen Sie, dass wir die Verarbeitung bestimmter Daten aussetzen, solange eine Streitigkeit darüber geklärt wird |
| **Widerspruch** (Art. 21) | Widersprechen Sie einer Verarbeitung auf Grundlage berechtigter Interessen, nämlich der Sicherheits- und Prüfverarbeitung in Abschnitt 4; wir stellen sie ein, sofern wir keine zwingenden Gründe nachweisen können. Der Werbung können Sie jederzeit widersprechen; wir stellen sie ein |
| **Datenübertragbarkeit** (Art. 20) | Ihre Debatten und Kontodaten in einem gängigen, maschinenlesbaren Format. \[Pending: same export as Access.\] Von Ihnen erstellte nicht personenbezogene Inhalte, etwa Ihre Fragen, werden Ihnen auf Antrag bei Vertragsende herausgegeben |
| **Einwilligung widerrufen** (Art. 7(3)) | Widerrufen Sie die Einwilligung in den Erhalt von Werbung über jede E-Mail oder die Einstellungen; widerrufen Sie die Einwilligung zu sensiblen Daten, indem Sie solche Daten nicht aufnehmen oder eine Debatte löschen. Der Widerruf berührt bereits erfolgte Verarbeitungen nicht |
| **Beschwerde** | Bei der rumänischen Aufsichtsbehörde **ANSPDCP**, B-dul G-ral Gheorghe Magheru 28–30, Bukarest, <anspdcp@dataprotection.ro>, oder bei der Behörde in Ihrem Wohnsitzland. Wir würden es vorziehen, zunächst von Ihnen zu hören |

Wir erheben niemals Gebühren für einen Antrag und benachteiligen Sie niemals, weil Sie einen Antrag gestellt haben.

## 11. In Debatten genannte Personen, die unseren Dienst nicht nutzen

Wenn jemand DebateAI eine Frage stellt, in der Sie genannt werden, können wir personenbezogene Daten über Sie speichern, obwohl Sie den Dienst nie genutzt haben. Die Nutzungsbedingungen untersagen dies allen nutzenden Personen, und wir minimieren die an KI-Anbieter übermittelten Daten; dennoch kann es geschehen.

Dieser Abschnitt ist die Information, die wir Ihnen gemäß Artikel 14 DSGVO schulden. Die Daten bestehen aus den Eingaben der nutzenden Person und den vom System als Antwort erzeugten Inhalten; die Quelle ist diese Person; Zwecke und Rechtsgrundlage ergeben sich aus Abschnitt 4; Empfänger sind die KI-Anbieter im Verzeichnis; die Speicherung richtet sich nach Abschnitt 7. Ihnen stehen alle Rechte aus Abschnitt 10 zu; insbesondere können Sie von uns verlangen, eine veröffentlichte oder private Debatte, die Ihre Daten enthält, zu entfernen und Ihnen mitzuteilen, welche Daten wir speichern. Hierfür benötigen Sie kein Konto. Schreiben Sie an **privacy@dezbatere.ro** oder verwenden Sie die Schaltfläche **Melden** bei einer veröffentlichten Debatte; wir bearbeiten begründete Anträge unverzüglich. Wir können Sie in solchen Fällen nicht einzeln benachrichtigen, weil wir weder wissen, wer Sie sind, noch wie wir Sie erreichen können; diese öffentliche Information und der Entfernungsweg sind die Maßnahmen, die wir stattdessen ergreifen.

Dasselbe gilt für sensible Informationen über Sie – Politik, Gesundheit, Religion –, die in der Frage einer anderen Person erscheinen. Keine gesetzliche Ausnahme erlaubt uns, sie nach Ihrem Widerspruch weiter zu verarbeiten, und wir stellen die Verarbeitung ein.

## 12. Kinder

DebateAI ist für Erwachsene bestimmt. Bei der Registrierung bestätigen Sie, mindestens 18 Jahre alt zu sein; wir verarbeiten nicht wissentlich Daten von Personen unter 18 Jahren. Erfahren wir, dass ein Konto einer Person unter 18 Jahren gehört, schließen wir es und löschen die Daten wie in Abschnitt 7 beschrieben. In einigen Ländern gilt eine Bestätigung als unzureichend oder es gelten weitergehende Anforderungen; Anhang B erläutert die jeweils geltenden Regeln, die Nutzungsbedingungen unser Vorgehen.

## 13. Cookies

Wir setzen zwei Cookies, die beide unbedingt erforderlich sind: eines hält Ihre Anmeldung aufrecht, das andere schützt Formulare vor Fälschung. Wir setzen keine Analyse-, Werbe- oder Tracking-Cookies. Die **Cookie-Richtlinie** unter \[dezbatere.ro/cookies\] führt sie samt Laufzeiten auf, erläutert die Speicherung Ihrer Auswahl und wird geändert, bevor ein weiteres Cookie hinzukommt. Soweit das Recht Ihrer Region bestimmte Cookies anders behandelt – beispielsweise die Opt-out-Regel des Vereinigten Königreichs für Analysen –, wird dies in der Cookie-Richtlinie erläutert.

## 14. Änderungen dieser Datenschutzerklärung

Wenn wir diese Datenschutzerklärung ändern, veröffentlichen wir die neue Fassung mit einer Zusammenfassung der Änderungen und einem neuen Gültigkeitsdatum und bewahren die früheren Fassungen unter \[dezbatere.ro/privacy/versions\] auf. Bei einer Änderung, durch die ein neuer Zweck oder ein neuer Empfänger hinzukommt, informieren wir Sie vor Beginn der neuen Verarbeitung per E-Mail und im Produkt und geben Ihnen Zeit zum Widerspruch. Hängt ein neuer Zweck von Ihrer Einwilligung ab – etwa wenn wir Inhalte jemals zur Verbesserung von Modellen nutzen wollten –, holen wir diese Einwilligung gesondert und ausdrücklich ein; die Annahme aktualisierter Nutzungsbedingungen behandeln wir niemals als Einwilligung in eine neue Verarbeitung. Bei Klarstellungen, die nichts an unserem Vorgehen ändern, veröffentlichen wir lediglich die neue Fassung.

Diese Datenschutzerklärung wurde zuletzt am \[date\] aktualisiert. Version 3.0 ersetzte Version 2.1, in der Sitzungsdaten, Speicherfristen, Analysen, Export und die Auswirkung der Löschung auf veröffentlichte Debatten in einer Weise beschrieben waren, die den Dienst nicht mehr zutreffend wiedergab.

## Annex B — Regionale Datenschutzbestimmungen

Jeder Eintrag gilt nur, wenn seine Region in Abschnitt 2 der Nutzungsbedingungen aufgeführt ist, und nennt ausschließlich Abweichungen vom Hauptteil dieser Datenschutzerklärung.

### B.1 Europäische Union und Europäischer Wirtschaftsraum

Der Hauptteil dieser Datenschutzerklärung richtet sich an Sie. Für uns zuständige Aufsichtsbehörde ist die rumänische **ANSPDCP**; Sie können sich auch bei der Behörde in Ihrem Wohnsitzland beschweren. Personen in Rumänien: Diese Datenschutzerklärung ist auf Rumänisch unter \[URL\] verfügbar.

### B.2 Vereinigtes Königreich *(nur wenn aufgeführt)*

Unser Vertreter im Vereinigten Königreich gemäß Artikel 27 UK GDPR ist **\[name, address, email\]**; Sie können ihn zu allen Fragen dieser Datenschutzerklärung kontaktieren. Aufsichtsbehörde ist das **Information Commissioner's Office (ICO)**, [ico.org.uk](https://ico.org.uk). Sie können sich über das Formular unter \[URL\] bei uns beschweren; wir bestätigen den Eingang innerhalb von 30 Tagen. Übermittlungen Ihrer Daten aus dem Vereinigten Königreich an KI-Anbieter in den Vereinigten Staaten beruhen auf \[the UK Extension to the EU–US Data Privacy Framework, where the provider is certified / the UK International Data Transfer Addendum to the EU standard contractual clauses\], unterstützt durch eine Risikobewertung der Übermittlung. Sollten wir jemals Analyse-Cookies setzen, unterlägen diese im Vereinigten Königreich einem Opt-out statt einer Einwilligung; derzeit setzen wir keine. Falls Sie unter 18 Jahre alt sind und trotz unserer Altersregel Zugang zum Dienst erhalten, gelten für unseren Umgang mit Ihren Daten die Standards des Children's Code (Age Appropriate Design Code) des ICO.

### B.3 Vereinigte Staaten *(nur wenn aufgeführt)*

**Hinweis bei der Erhebung.** Die Tabelle in Abschnitt 2 führt jede von uns erhobene Kategorie personenbezogener Informationen, ihren Zweck und ihre Speicherdauer (Abschnitt 7) auf. Folgende Kategorien *sensibler* personenbezogener Informationen erheben wir nur, wenn Sie sie in Ihre eigenen Fragen aufnehmen: \[health, religious or philosophical beliefs, sexual orientation, union membership, political views\]; wir verwenden sie ausschließlich zur Durchführung Ihrer Debatten. **Wir verkaufen personenbezogene Informationen nicht und geben sie nicht weiter; dies haben wir auch in den vorangegangenen zwölf Monaten nicht getan.** Wir verwenden sensible personenbezogene Informationen ausschließlich zur Erbringung des von Ihnen angeforderten Dienstes. **Opt-out-Präferenzsignale:** Wir berücksichtigen Global-Privacy-Control-Signale als Antrag auf Widerspruch gegen Verkauf oder Weitergabe, die wir ohnehin nicht vornehmen. **Ihre Rechte:** Auskunft, Löschung, Berichtigung, Opt-out, Beschränkung der Verwendung sensibler personenbezogener Informationen sowie Schutz vor Benachteiligung wegen der Ausübung dieser Rechte; stellen Sie einen Antrag unter privacy@dezbatere.ro oder \[toll-free number / form\]. **Finanzielle Anreize:** Wir bieten keine; kostenlose und kostenpflichtige Tarife unterscheiden sich nicht in unserem Umgang mit Ihren Daten. **Speicherdauer** siehe Abschnitt 7. Dieser Hinweis wird mindestens alle zwölf Monate aktualisiert; zuletzt aktualisiert am \[date\].

*Washington:* Unser gesonderter **Datenschutzhinweis zu Verbrauchergesundheitsdaten** unter \[URL\] gilt für alle gesundheitsbezogenen Informationen einschließlich Schlussfolgerungen. *Texas und Nebraska:* Wir verkaufen keine sensiblen personenbezogenen Daten; sollte sich dies jemals ändern, würden wir zuvor Ihre Einwilligung einholen \[statutory language\]. *Colorado, Connecticut, Virginia und andere Bundesstaaten mit umfassenden Datenschutzgesetzen:* Die vorstehenden Rechte stehen Ihnen zu, soweit das jeweilige Recht auf uns Anwendung findet; gegen die Ablehnung eines Antrags können Sie unter \[appeals@dezbatere.ro\] Einspruch einlegen.

### B.4 Kanada und Quebec *(nur wenn aufgeführt)*

Unser Datenschutzbeauftragter ist **\[name, email\]**. Wir bleiben für personenbezogene Informationen verantwortlich, die wir an KI-Anbieter außerhalb Kanadas übermitteln, und verpflichten sie vertraglich zu einem vergleichbaren Schutz; diese Anbieter können den Gesetzen ihrer jeweiligen Tätigkeitsländer unterliegen, einschließlich des rechtmäßigen Behördenzugriffs. Werbe-E-Mails werden gemäß CASL nur mit Ihrer ausdrücklichen Einwilligung versandt. **Quebec:** Vor der Übermittlung personenbezogener Informationen außerhalb Quebecs führen wir eine Datenschutz-Folgenabschätzung durch; die Einstellungen, die Ihre Debatten privat halten, sind standardmäßig aktiviert; Sie können verlangen, dass wir personenbezogene Informationen über Sie aus Suchindizes entfernen oder ihre Verbreitung einstellen; Sie können Ihre Daten in einem strukturierten, gängigen Format anfordern; Abschnitt 8 beschreibt unsere automatisierte Verarbeitung.

### B.5 Australien und Neuseeland *(nur wenn aufgeführt)*

**Australien.** Empfänger Ihrer personenbezogenen Informationen im Ausland sind die im Verzeichnis aufgeführten KI-Anbieter und Auftragsverarbeiter mit Sitz in \[the United States and the European Union\]; wir ergreifen angemessene Maßnahmen, damit sie diese im Einklang mit den australischen Datenschutzgrundsätzen behandeln. **Automatisierte Entscheidungen:** Ab dem 10. Dezember 2026 nennt diese Datenschutzerklärung die Arten von Entscheidungen, die durch Computerprogramme getroffen werden und Ihre Rechte oder Interessen erheblich beeinträchtigen – solche gibt es nicht; Bewertungen und Urteile betreffen Argumente, nicht Sie –, sowie die dabei verwendeten personenbezogenen Informationen. Beschwerden können beim **Office of the Australian Information Commissioner (OAIC)** eingereicht werden. **Neuseeland.** Unser Datenschutzbeauftragter ist \[name\]. Wenn wir personenbezogene Informationen über Sie mittelbar erheben – weil eine andere Person sie in eine Frage aufgenommen hat –, bilden diese Datenschutzerklärung und Abschnitt 11 die Ihnen erteilte Information. Wir legen Daten gegenüber den KI-Anbietern im Verzeichnis als unseren Beauftragten auf Grundlage von Verträgen offen, die vergleichbare Garantien verlangen. Beschwerden können beim **Office of the Privacy Commissioner (Neuseeland)** eingereicht werden.

### B.6 Lateinamerika *(spanischsprachiger Anhang; nur wenn aufgeführt)*

&#91;Published in Spanish.\] Die Einwilligung ist die Grundlage der Verarbeitung, soweit keine Notwendigkeit zur Vertragserfüllung besteht. Ihre ARCO-Rechte – Auskunft, Berichtigung, Löschung, Widerspruch – können Sie unter privacy@dezbatere.ro ausüben; Antworten erfolgen innerhalb von \[per country\]. *Mexiko:* Der vollständige *aviso de privacidad* mit seinen zwingenden Bestandteilen ist unter \[URL\] verfügbar. *Argentinien:* \[AAIP mandatory legend\]; die Daten sind bei \[…\] registriert. *Kolumbien:* Unsere *política de tratamiento de datos* ist unter \[URL\] verfügbar; zuständige Behörde ist die SIC. *Chile* (ab 1. Dezember 2026): Die Kontaktdaten der Behörde lauten \[…\]; Abschnitt 8 erläutert unsere automatisierte Verarbeitung.

### B.7 Golfregion — VAE und Saudi-Arabien *(nur wenn aufgeführt)*

Soweit wir Ihre Daten für andere Zwecke als die Erbringung des Dienstes verarbeiten, stützen wir uns auf Ihre Einwilligung, die Sie widerrufen können. Ihre Daten verlassen \[UAE / Kingdom of Saudi Arabia\] und werden in der Europäischen Union und den Vereinigten Staaten auf Grundlage von \[SDAIA standard contractual clauses / the mechanism in the Register\] verarbeitet. Werbung wird nur mit Ihrer Einwilligung versandt. Nehmen Sie keine sensiblen personenbezogenen Daten in Ihre Fragen auf.

### B.8 Asien-Pazifik *(nur die Zeilen für aufgeführte Regionen)*

*Singapur:* Unser Datenschutzbeauftragter ist **\[name, email\]**; Übermittlungen beruhen auf vertraglichen Pflichten, die einen mit dem PDPA vergleichbaren Schutz gewähren; wir melden dem PDPC meldepflichtige Verletzungen innerhalb von 3 Tagen. *Japan:* Wir verwenden Ihre personenbezogenen Informationen für die in Abschnitt 4 genannten Zwecke und keine anderen; Ihre Inhalte werden an Anbieter in \[named countries — e.g. the United States\] übermittelt, deren Datenschutzordnungen und Garantien im Verzeichnis beschrieben sind, und Sie willigen bei der Registrierung hierin ein. *Südkorea:* Unser Datenschutzbeauftragter ist **\[name\]**; übermittelte Datenkategorien, Bestimmungsort, Zeitpunkt, Empfänger, Zweck und Speicherdauer von Übermittlungen ins Ausland sind im Verzeichnis aufgeführt; politische Ansichten in Ihren Fragen sind sensible Informationen und werden von uns ausschließlich zur Durchführung Ihrer Debatten verarbeitet; Einwilligungen in optionale Verarbeitungen werden gesondert eingeholt. *Indien* (sobald die DPDP-Vorschriften gelten): Der gesonderte Einwilligungshinweis unter \[URL\] findet Anwendung; Anträge werden innerhalb von 90 Tagen beantwortet; Personen unter 18 Jahren benötigen eine nachprüfbare elterliche Einwilligung. *Philippinen:* Unser Datenschutzbeauftragter ist \[name\]; Beschwerden können bei der National Privacy Commission eingereicht werden; Abschnitt 8 beschreibt die automatisierte Verarbeitung. *Thailand:* Unser Vertreter ist \[name\] \[if appointed\].

### B.9 Vorbehalten

Die Türkei, Brasilien und Indonesien erfordern jeweils eine Mitteilung in der Landessprache, einen Vertreter oder eine Registrierung sowie Einreichungen; diese Länder sind hier nicht ausgearbeitet. In China, Vietnam und Russland wird der Dienst nicht angeboten.
