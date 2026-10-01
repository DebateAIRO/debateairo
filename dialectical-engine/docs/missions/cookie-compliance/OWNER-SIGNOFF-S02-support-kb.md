# OWNER sign-off — S02 support catalogue labels, 8 help articles, 16 recovery texts (cookie-compliance)

Status: DRAFT for V0 — not signed. The API refuses to start until the orchestrator records V's answer.
What changes: since the 2026-09-29 signature (ffd72986…) the catalogue changes only the 30 en/ro labels of 20 rows listed under "catalogue labels" (old -> new; V-17: each label is the one the screen shows); 8 article files are rewritten; 15 of the 16 recovery texts are rewritten (14 carried the false wording, SPEC-v2 §2 M12; the Romanian settings-help-menus fallback named controls by their English labels, V-17); the English settings-help-menus fallback text keeps its words and is re-signed because its article's hash changed (K7).

### catalogue labels
~~~text
action sign-in en: Sign in -> Log in
action sign-in ro: Autentificare -> Autentificați-vă
action sign-up ro: Creează un cont -> Creați un cont
action help en: Help desk -> Help
action help ro: Centrul de ajutor -> Ajutor
action support-status en: Support status -> Service status
action support-status ro: Starea serviciului de asistență -> Starea serviciului
action method en: How it works -> Method
action method ro: Cum funcționează -> Metodă
action sample-transcript en: Sample debate -> Transcripts
action sample-transcript ro: Exemplu de dezbatere -> Transcrieri
action privacy-preferences en: Privacy preferences -> Privacy
action privacy-preferences ro: Preferințe de confidențialitate -> Confidențialitate
action claim-legacy ro: Revendică dezbaterile vechi -> Revendicați dezbaterile vechi
action delete-account ro: Șterge contul -> Ștergeți contul
action your-debates ro: Dezbaterile tale -> Dezbaterile dvs.
action owner-debate ro: Deschide dezbaterea ta -> Deschideți dezbaterea dumneavoastră
action public-debate ro: Deschide dezbaterea publică -> Deschideți dezbaterea publică
capability ai-transparency ro: Transparență AI -> Transparență privind IA
capability legal-terms ro: Termeni și condiții -> Termenii serviciului
capability legal-terms-versions en: Earlier versions of the terms -> Terms versions
capability legal-terms-versions ro: Versiunile anterioare ale termenilor -> Versiunile termenilor
capability legal-health-data en: US consumer health data privacy policy -> US health data privacy
capability legal-health-data ro: Politica privind datele de sănătate ale consumatorilor din SUA -> Datele de sănătate (SUA)
capability legal-cookies ro: Politica privind cookie-urile -> Politica privind modulele cookie
capability legal-providers en: AI model providers -> Model providers
capability legal-providers ro: Furnizorii de modele AI -> Furnizori de modele
capability sign-in en: Sign in and saved MFA recovery -> Log in and saved MFA recovery
capability sign-up en: Create an account -> Create account
capability sign-up ro: Creează un cont -> Creați un cont
~~~

### article privacy-consent.en
~~~text
---
id: privacy-consent
lang: en
title: "What DebateAI stores in your browser"
status: shipped
sources:
  - apps/ui/messages/en/consent.json:8
  - apps/ui/messages/en/consent.json:14
  - apps/ui/messages/en/legal.json:57
  - apps/ui/messages/en/legal.json:91
  - apps/ui/messages/en/legal.json:92
  - apps/ui/messages/en/chrome.json:63
  - apps/ui/messages/en/consent.json:2
  - apps/ui/components/consent/CookieBar.tsx:61
  - apps/ui/components/SiteFooter.tsx:49
  - apps/ui/components/consent/ConsentSettingsPanel.tsx:38
  - apps/ui/components/support/Assistant.tsx:864
  - apps/ui/app/cookies/page.tsx:8
  - apps/ui/app/privacy/page.tsx:9
  - apps/ui/app/terms/page.tsx:9
  - apps/ui/app/legal/page.tsx:9
verified_against: "e089b63e9"
ratified_by: ""
ratified_on: ""
---

DebateAI keeps four cookies and four items in your browser's storage, each needed for the service to work. Nothing is optional, and nothing is shared with anyone else. We set no analytics, advertising or tracking cookies. The full list, with how long each item is kept, is on the Cookies page at `/cookies` and in the What we store card. The card opens from the cookie notice, from the Cookies we store control in the site footer, from Settings, then Privacy, for signed-in users at `/settings#consent-privacy-heading`, and from the Cookies we store shortcut in the Help panel. `/privacy`, `/terms`, `/cookies` and `/legal` are pages of this site. There is no switch to turn any of these items off. To refuse them, block or delete cookies and site data for this site in your browser settings; signing in and the remembering of your language and display choices then stop working.
~~~

### article privacy-consent.ro
~~~text
---
id: privacy-consent
lang: ro
title: "Ce stochează DebateAI în browserul tău"
status: shipped
sources:
  - apps/ui/messages/ro/consent.json:8
  - apps/ui/messages/ro/consent.json:14
  - apps/ui/messages/ro/legal.json:57
  - apps/ui/messages/ro/legal.json:91
  - apps/ui/messages/ro/legal.json:92
  - apps/ui/messages/ro/chrome.json:63
  - apps/ui/messages/ro/consent.json:2
  - apps/ui/components/consent/CookieBar.tsx:61
  - apps/ui/components/SiteFooter.tsx:49
  - apps/ui/components/consent/ConsentSettingsPanel.tsx:38
  - apps/ui/components/support/Assistant.tsx:864
  - apps/ui/app/cookies/page.tsx:8
  - apps/ui/app/privacy/page.tsx:9
  - apps/ui/app/terms/page.tsx:9
  - apps/ui/app/legal/page.tsx:9
verified_against: "e089b63e9"
ratified_by: ""
ratified_on: ""
---

DebateAI păstrează patru module cookie și patru elemente în spațiul de stocare al browserului tău, fiecare necesar pentru funcționarea serviciului. Nimic nu este opțional și nimic nu este partajat cu altcineva. Nu setăm cookie-uri analitice, publicitare sau de urmărire. Lista completă, cu durata de păstrare a fiecărui element, se află pe pagina „Cookie-uri” la `/cookies` și în cardul „Ce stocăm”. Cardul se deschide din notificarea privind modulele cookie, din controlul „Modulele cookie pe care le stocăm” din subsolul site-ului, din „Setări”, apoi „Confidențialitate”, pentru utilizatorii autentificați, la `/settings#consent-privacy-heading`, și din scurtătura „Modulele cookie pe care le stocăm” din panoul „Ajutor”. `/privacy`, `/terms`, `/cookies` și `/legal` sunt pagini ale acestui site. Nu există niciun comutator pentru dezactivarea acestor elemente. Ca să le refuzi, blochează sau șterge modulele cookie și datele site-ului pentru acest site din setările browserului tău; atunci autentificarea și memorarea limbii și a opțiunilor de afișare nu mai funcționează.
~~~

### article settings-help-menus.en
~~~text
---
id: settings-help-menus
lang: en
title: "Use Settings and human Help"
status: shipped
sources:
  - apps/ui/components/TopBar.tsx:98
  - apps/ui/components/SessionControls.tsx:181
  - apps/ui/components/consent/ConsentSettingsPanel.tsx:38
  - apps/ui/components/LegacyRunClaimControls.tsx:53
  - apps/ui/components/AccountErasureControls.tsx:137
  - apps/ui/components/support/Assistant.tsx:869
verified_against: "e089b63e9"
ratified_by: ""
ratified_on: ""
---

Account or Settings opens the signed-in account settings page. Active sessions lets the visitor review devices, revoke one session, or sign out everywhere. Privacy opens a read-only list of the cookies and browser storage DebateAI keeps. Claim legacy debates accepts an old debate access token to attach matching unclaimed debates. Delete account shows the deletion schedule and cancellation controls; deletion begins after seven full days and requires a verified email or recovery-email channel.

Support can navigate directly to these fixed Settings sections and explain their visible prerequisites. It cannot read the visitor's sessions, token, account, debate list, deletion state, or other private records. It never asks for, receives, repeats, validates, or submits a password, access token, authenticator code, or recovery code, and it cannot revoke sessions, claim debates, or schedule or cancel deletion for the visitor.

The Help conversation answers from public product guidance. Topic pills are optional shortcuts. Report a bug primes ordinary public-guide text in the composer and does not create a human case. Escalate to a human creates the separate human handoff, and email support is a separate mail workflow; a human case can include the conversation thread, while the public guide model does not receive private case records or case tokens.
~~~

### article settings-help-menus.ro
~~~text
---
id: settings-help-menus
lang: ro
title: "Folosește Setările și Ajutorul uman"
status: shipped
sources:
  - apps/ui/components/TopBar.tsx:98
  - apps/ui/components/SessionControls.tsx:181
  - apps/ui/components/consent/ConsentSettingsPanel.tsx:38
  - apps/ui/components/LegacyRunClaimControls.tsx:53
  - apps/ui/components/AccountErasureControls.tsx:137
  - apps/ui/components/support/Assistant.tsx:869
verified_against: "e089b63e9"
ratified_by: ""
ratified_on: ""
---

„Cont” sau „Setări” deschide pagina de setări a contului autentificat. „Sesiuni active” permite vizitatorului să examineze dispozitivele, să revoce o sesiune sau să se deconecteze de peste tot. „Confidențialitate” deschide o listă, doar pentru citire, cu modulele cookie și elementele din spațiul de stocare al browserului pe care le păstrează DebateAI. „Revendicați dezbaterile vechi” acceptă un token vechi de acces la dezbatere pentru a atașa dezbaterile nerevendicate care corespund. „Ștergeți contul” arată programarea și anularea ștergerii; ștergerea începe după șapte zile complete și necesită un canal verificat de email sau email de recuperare.

Asistența poate naviga direct la aceste secțiuni fixe din Setări și poate explica cerințele vizibile. Nu poate citi sesiunile, tokenul, contul, lista de dezbateri, starea ștergerii sau alte date private ale vizitatorului. Nu cere, nu primește, nu repetă, nu validează și nu trimite o parolă, un token de acces, un cod de autentificare sau un cod de recuperare și nu poate revoca sesiuni, revendica dezbateri ori programa sau anula ștergerea în locul vizitatorului.

Conversația din Ajutor răspunde din ghidul public al produsului. Pastilele de subiect sunt scurtături opționale. „Raportați o eroare” completează text obișnuit pentru ghidul public în caseta de compunere și nu creează un caz uman. „Escaladați către o persoană” creează transferul separat către o persoană, iar emailul de asistență este un flux separat de mail; un caz uman poate include conversația, dar modelul ghidului public nu primește înregistrările private sau tokenurile cazului.
~~~

### article app-navigation.en
~~~text
---
id: app-navigation
lang: en
title: "Navigate Dialectical Engine"
status: shipped
sources:
  - apps/ui/components/landing/LandingChrome.tsx:35
  - apps/ui/components/TopBar.tsx:98
  - apps/ui/app/page.tsx:136
  - apps/ui/components/support/Assistant.tsx:106
  - apps/ui/components/SiteFooter.tsx:49
verified_against: "e089b63e9"
ratified_by: ""
ratified_on: ""
---

The landing page links to Method and Transcripts (the sample debate transcript). Pricing is an informational section, not a checkout. Start a round and New debate open the debate creator after sign-in; a signed-out visitor is taken to sign in first.

Home is the debate library. Your debates is the signed-in visitor's private list, while Public debates is the published catalog. Support can explain these tabs and offer their fixed navigation, but it cannot read either visitor-specific list or invent a debate link. Account and Settings open account settings for a signed-in visitor. The theme control (☀/☾) changes only this browser's display.

Help opens the free-text Support conversation. Topic buttons and suggested questions are optional shortcuts that fill or send ordinary Support text; they are not the only questions Support accepts. The small panel that the Help button opens, Cookies we store (it opens the What we store list), and the theme control stay in the page or browser and are described in prose rather than as remote operations. Report a bug primes ordinary public-guide text in the Support composer and does not create a human case. Email support and Escalate to a human are separate human-support workflows.
~~~

### article app-navigation.ro
~~~text
---
id: app-navigation
lang: ro
title: "Navighează în Dialectical Engine"
status: shipped
sources:
  - apps/ui/components/landing/LandingChrome.tsx:35
  - apps/ui/components/TopBar.tsx:98
  - apps/ui/app/page.tsx:136
  - apps/ui/components/support/Assistant.tsx:106
  - apps/ui/components/SiteFooter.tsx:49
verified_against: "e089b63e9"
ratified_by: ""
ratified_on: ""
---

Pagina de prezentare oferă legături către „Metodă” și „Transcrieri” (exemplul de dezbatere și transcriere). „Tarife” este o secțiune informativă, nu o pagină de plată. „Începeți o rundă” și „Dezbatere nouă” deschid creatorul de dezbateri după autentificare; un vizitator neautentificat este trimis mai întâi la autentificare.

„Acasă” este biblioteca de dezbateri. „Dezbaterile dvs.” este lista privată a vizitatorului autentificat, iar „Dezbateri publice” este catalogul publicat. Asistența poate explica aceste file și poate oferi navigarea lor fixă, dar nu poate citi lista privată a vizitatorului și nu poate inventa o legătură către o dezbatere. „Cont” și „Setări” deschid setările contului pentru un vizitator autentificat. Controlul temei (☀/☾) schimbă numai aspectul din acest browser.

„Ajutor” deschide conversația liberă cu Asistența. Butoanele de subiect și întrebările sugerate sunt scurtături opționale care completează sau trimit text obișnuit; ele nu limitează întrebările acceptate. Panoul mic deschis de butonul „Ajutor”, „Modulele cookie pe care le stocăm” (deschide lista „Ce stocăm”) și tema rămân controale locale ale paginii sau browserului și sunt explicate în text, nu executate de la distanță. „Raportați o eroare” completează text obișnuit pentru ghidul public în caseta Asistenței și nu creează un caz uman. Emailul de asistență și „Escaladați către o persoană” sunt fluxuri separate de asistență umană.
~~~

### article account-settings.en
~~~text
---
id: account-settings
lang: en
title: "Use account settings"
status: shipped
sources:
  - apps/ui/components/SettingsPageClient.tsx:78
  - apps/ui/components/SettingsPageClient.tsx:79
  - apps/ui/components/SessionControls.tsx:181
  - apps/ui/components/LegacyRunClaimControls.tsx:53
  - apps/ui/components/AccountErasureControls.tsx:137
verified_against: "e089b63e9"
ratified_by: ""
ratified_on: ""
---

After signing in, `/settings` contains session review and revocation, a Privacy section that lists what this browser stores, legacy debate claim, and account-erasure controls. Sensitive actions ask for fresh authentication in the page that owns them. The current ordinary settings page does not offer active controls to change email, replace a password, regenerate active MFA, or edit deployment routing. Support can explain these controls but cannot perform them or accept their passwords, codes, tokens, or confirmation phrases.
~~~

### article account-settings.ro
~~~text
---
id: account-settings
lang: ro
title: "Folosește setările contului"
status: shipped
sources:
  - apps/ui/components/SettingsPageClient.tsx:78
  - apps/ui/components/SettingsPageClient.tsx:79
  - apps/ui/components/SessionControls.tsx:181
  - apps/ui/components/LegacyRunClaimControls.tsx:53
  - apps/ui/components/AccountErasureControls.tsx:137
verified_against: "e089b63e9"
ratified_by: ""
ratified_on: ""
---

După autentificare, `/settings` conține revizuirea și revocarea sesiunilor, secțiunea „Confidențialitate”, care arată ce stochează acest browser, revendicarea dezbaterilor vechi și controalele pentru ștergerea contului. Acțiunile sensibile cer o autentificare recentă în pagina care le gestionează. Pagina obișnuită de setări nu oferă acum controale active pentru schimbarea emailului, înlocuirea parolei, regenerarea MFA activă sau modificarea rutării implementării. Asistența poate explica aceste controale, dar nu le poate executa și nu poate primi parolele, codurile, tokenii sau frazele de confirmare.
~~~

### recovery privacy-consent.en.modelProjection
~~~text
DebateAI keeps four cookies and four items in the browser's storage, each needed for the service to work; nothing is optional and nothing is shared with anyone else. We set no analytics, advertising or tracking cookies. The full list, with how long each item is kept, is on the Cookies page and in the What we store card, which opens from the cookie notice, from the Cookies we store control in the site footer, from Settings, then Privacy, for signed-in users, and from the Cookies we store shortcut in the Help panel. The Privacy policy, Terms of service, Cookies and Legal notice pages are pages of this site. There is no switch: to refuse these items, block or delete cookies and site data for this site in the browser settings; signing in and the remembering of language and display choices then stop working.
~~~

### recovery privacy-consent.en.fallback
~~~text
DebateAI keeps four cookies and four browser storage items, all needed for the service to work; none is optional and none is shared. We set no analytics, advertising or tracking cookies. See the full list on the Cookies page or in the What we store card, which opens from the cookie notice, the site footer, Settings then Privacy after sign in, or the Help panel. There is no switch: to refuse, block or delete cookies and site data in the browser settings; signing in and the remembered language and display choices then stop working.
~~~

### recovery privacy-consent.ro.modelProjection
~~~text
DebateAI păstrează patru module cookie și patru elemente în spațiul de stocare al browserului, fiecare necesar pentru funcționarea serviciului; nimic nu este opțional și nimic nu este partajat cu altcineva. Nu setăm cookie-uri analitice, publicitare sau de urmărire. Lista completă, cu durata de păstrare a fiecărui element, se află pe pagina „Cookie-uri” și în cardul „Ce stocăm”, care se deschide din notificarea privind modulele cookie, din controlul „Modulele cookie pe care le stocăm” din subsolul site-ului, din „Setări”, apoi „Confidențialitate”, pentru utilizatorii autentificați, și din scurtătura „Modulele cookie pe care le stocăm” din panoul „Ajutor”. Paginile „Politica de confidențialitate”, „Termenii serviciului”, „Cookie-uri” și „Informații legale” sunt pagini ale acestui site. Nu există niciun comutator: ca să refuzi aceste elemente, blochează sau șterge modulele cookie și datele site-ului pentru acest site din setările browserului; atunci autentificarea și memorarea limbii și a opțiunilor de afișare nu mai funcționează.
~~~

### recovery privacy-consent.ro.fallback
~~~text
DebateAI păstrează patru module cookie și patru elemente de stocare în browser, toate necesare pentru funcționarea serviciului; niciunul nu este opțional și niciunul nu este partajat. Nu setăm cookie-uri analitice, publicitare sau de urmărire. Lista completă este pe pagina „Cookie-uri” sau în cardul „Ce stocăm”, care se deschide din notificarea privind modulele cookie, din subsolul site-ului, din „Setări”, apoi „Confidențialitate” după autentificare, sau din panoul „Ajutor”. Nu există niciun comutator: ca să refuzi, blochează sau șterge modulele cookie și datele site-ului din setările browserului; atunci autentificarea și memorarea limbii și a opțiunilor de afișare nu mai funcționează.
~~~

### recovery settings-help-menus.en.modelProjection
~~~text
Account or Settings opens signed-in account settings. Active sessions lets the visitor review or revoke sessions; Privacy opens a read-only list of the cookies and browser storage DebateAI keeps; Claim legacy debates accepts an old access token; Delete account shows scheduling and cancellation controls. Support can offer these fixed section links and explain prerequisites, but cannot read private sessions, tokens, account or deletion state, receive credentials or security codes, or perform any account operation. Help uses public product guidance; optional topic pills are shortcuts. Report a bug primes ordinary public-guide text in the composer and does not create a human case. Escalate to a human creates the separate human handoff, and email support is a separate mail workflow.
~~~

### recovery settings-help-menus.en.fallback
~~~text
Sign in and open the relevant Settings section for Active sessions, Privacy, Claim legacy debates, or Delete account. Support can navigate and explain, but it cannot inspect private records, receive credentials or codes, revoke sessions, claim debates, or operate deletion controls. Report a bug primes ordinary public-guide text in the composer and does not create a human case. Human escalation and email support remain separate from the public guide.
~~~

### recovery settings-help-menus.ro.modelProjection
~~~text
„Cont” sau „Setări” deschide setările contului autentificat. „Sesiuni active” permite examinarea sau revocarea sesiunilor; „Confidențialitate” deschide o listă, doar pentru citire, cu modulele cookie și stocarea din browser pe care le păstrează DebateAI; „Revendicați dezbaterile vechi” acceptă un token vechi de acces; „Ștergeți contul” arată controalele de programare și anulare. Asistența poate oferi legături fixe către secțiuni și explica cerințele, dar nu poate citi sesiuni private, tokenuri, contul sau starea ștergerii, primi credențiale sau coduri de securitate ori executa operații asupra contului. „Ajutor” folosește ghidul public; pastilele opționale sunt scurtături. „Raportați o eroare” completează text obișnuit pentru ghidul public în caseta de compunere și nu creează un caz uman. „Escaladați către o persoană” creează transferul separat către o persoană, iar emailul de asistență este un flux separat de mail.
~~~

### recovery settings-help-menus.ro.fallback
~~~text
Autentifică-te și deschide secțiunea relevantă din „Setări” pentru „Sesiuni active”, „Confidențialitate”, „Revendicați dezbaterile vechi” sau „Ștergeți contul”. Asistența poate naviga și explica, dar nu poate inspecta date private, primi credențiale sau coduri, revoca sesiuni, revendica dezbateri ori opera ștergerea. „Raportați o eroare” completează text obișnuit pentru ghidul public în caseta de compunere și nu creează un caz uman. Escaladarea umană și emailul rămân separate de ghidul public.
~~~

### recovery app-navigation.en.modelProjection
~~~text
The landing page links to Method and Transcripts (the sample debate transcript); Pricing is informational, not checkout. Start a round and New debate open the debate creator after authentication. Home is the library: Your debates is private to the authenticated visitor and Public debates is the published catalog. Account and Settings open account settings. The theme control, the small panel of the Help button, and Cookies we store (it opens the What we store list) are local page or browser controls. Help accepts free text; topic buttons and suggested questions are optional shortcuts. Support can explain and offer fixed navigation but cannot read visitor lists or invent debate links. Report a bug primes ordinary public-guide text in the Support composer and does not create a human case. Email support and Escalate to a human are separate human-support workflows.
~~~

### recovery app-navigation.en.fallback
~~~text
Use Home for the debate library, Public debates for the published catalog, and Help for a free-text Support conversation. Sign in before opening New debate, Your debates, Account, or Settings. Pricing is informational; the theme control, the small Help panel, and Cookies we store (it opens the What we store list) are local controls. Support cannot read private lists or invent a debate link.
~~~

### recovery app-navigation.ro.modelProjection
~~~text
Pagina de prezentare oferă „Metodă” și „Transcrieri” (exemplul de dezbatere și transcriere); „Tarife” este informativ, nu o pagină de plată. „Începeți o rundă” și „Dezbatere nouă” deschid creatorul după autentificare. „Acasă” este biblioteca: „Dezbaterile dvs.” este lista privată a vizitatorului autentificat, iar „Dezbateri publice” este catalogul publicat. „Cont” și „Setări” deschid setările contului. Tema, panoul mic al butonului „Ajutor” și „Modulele cookie pe care le stocăm” (deschide lista „Ce stocăm”) sunt controale locale. „Ajutor” acceptă text liber; butoanele de subiect și întrebările sugerate sunt scurtături opționale. Asistența poate explica și oferi navigare fixă, dar nu poate citi listele vizitatorului sau inventa legături către dezbateri. „Raportați o eroare” completează text obișnuit pentru ghidul public în caseta Asistenței și nu creează un caz uman. Emailul de asistență și „Escaladați către o persoană” sunt fluxuri separate de asistență umană.
~~~

### recovery app-navigation.ro.fallback
~~~text
Folosește „Acasă” pentru bibliotecă, „Dezbateri publice” pentru catalogul publicat și „Ajutor” pentru o conversație liberă cu Asistența. Autentifică-te înainte de „Dezbatere nouă”, „Dezbaterile dvs.”, „Cont” sau „Setări”. „Tarife” este informativ; tema, panoul mic al butonului „Ajutor” și „Modulele cookie pe care le stocăm” (deschide lista „Ce stocăm”) sunt controale locale. Asistența nu poate citi liste private sau inventa o legătură către o dezbatere.
~~~

### recovery account-settings.en.modelProjection
~~~text
After signing in, Settings contains session review and revocation, a Privacy section that lists what this browser stores, legacy debate claim, and account-erasure controls. Sensitive controls require fresh authentication in their owning page. The ordinary page does not offer active controls to change email, replace a password, regenerate active MFA, or edit deployment routing. Support can explain these limits but cannot perform the controls or receive credentials and confirmation phrases.
~~~

### recovery account-settings.en.fallback
~~~text
After signing in, choose Settings to review or revoke sessions, see what this browser stores under Privacy, claim legacy debates, or begin account erasure. Sensitive controls require fresh authentication on the page. The page does not offer controls to change email, replace a password, regenerate active MFA, or edit deployment routing. Support can explain the controls but cannot perform them or receive credentials.
~~~

### recovery account-settings.ro.modelProjection
~~~text
După autentificare, „Setări” conține revizuirea și revocarea sesiunilor, secțiunea „Confidențialitate”, care arată ce stochează acest browser, revendicarea dezbaterilor vechi și controalele pentru ștergerea contului. Controalele sensibile cer autentificare recentă în pagina care le gestionează. Pagina obișnuită nu are acum controale active pentru înlocuirea emailului, înlocuirea parolei, regenerarea MFA activă sau rutarea implementării. Asistența poate explica limitele, dar nu poate executa controalele și nu poate primi date de autentificare ori fraze de confirmare.
~~~

### recovery account-settings.ro.fallback
~~~text
După autentificare, alege „Setări” pentru revizuirea sau revocarea sesiunilor, secțiunea „Confidențialitate” cu ce stochează acest browser, revendicarea dezbaterilor vechi ori ștergerea contului. Controalele sensibile cer autentificare recentă în pagină. Pagina nu oferă schimbarea emailului, înlocuirea parolei, regenerarea MFA activă sau modificarea rutării implementării. Asistența poate explica aceste controale, dar nu le poate executa și nu poate primi date de autentificare.
~~~

## Fingerprints (sha256)

~~~text
catalog-canonical bbd47807cbbd1e7535de0c7828db2c29239f919357a4440d555d2fc2e14c0ddc
article privacy-consent.en 0fef2fa6fc9b8ac75ad7134d4b5f746b0be230a4292c9d983b24dfa00f42951f
article privacy-consent.ro a25a5f56268e7bdda4d1cbc0264e53cb332acfe592acc7260e6c1ff16f4d7eb6
article settings-help-menus.en 53b4612d883133874617b1a8647df9450dc75e2301e8f93a56e7eceaa169a084
article settings-help-menus.ro 362e226cabd7b26b69638fc8e968325408dfdc4ebcd952ede1510e31daee7711
article app-navigation.en e7be9ec44ca612d536736680bacd3b111c0871c41b1392bf40910b991974e6e6
article app-navigation.ro 53b85f28ff47512609e8c445e5e4542f4c47a948e38ac165604dabc86fdd95c8
article account-settings.en e4299c87f0dfe85c1063b1f37c1d3206ce5ed8862bbac75333a883cebcd49e81
article account-settings.ro ef8ba11070890552d5f0ba82c5c50d587f8fed04d05ef0218fb8b7daa1cd616c
recovery privacy-consent.en.modelProjection 8ba452e770941a43e53f7131cb1513f34ee787755d71a8b1900e171e5fbe269e
recovery privacy-consent.en.fallback 3fe7da1ecfe2848622b10234fac52d5283a30a4473a0adada8eb9e6555b24824
recovery privacy-consent.ro.modelProjection e64bb25be8385d23793bf41fb6e5c9d439ae56e47b9568fc9fba0d13bd407b33
recovery privacy-consent.ro.fallback d90423906e3d6502ae6585462f2a8e4fca9608c6c2bc99fba4be6e4c74ea0c4c
recovery settings-help-menus.en.modelProjection 291f2b5a3c95cf345d3d1794e2e0c2e7e5e88ccff5703a200ef89c8f28ad7108
recovery settings-help-menus.en.fallback ea5720fab4e9755c489c63daec5e85d0cf6b3a0fa9d30a97827dadc7d0e166b5
recovery settings-help-menus.ro.modelProjection 1eba8965421962503b0cb644043404c8e59bdb5722e8adc8999e5679d99520e5
recovery settings-help-menus.ro.fallback f3bd7bb6e653e6c62a820d05015043cbe56a9d511e4d3346b6cb36fe3156b578
recovery app-navigation.en.modelProjection 5e2c92c70089eb7124914df7f803715793b8995f6d20508b12f288df1e875a54
recovery app-navigation.en.fallback 5f72d0d447cb61481951585f2bc42d3a0c5450ab504c1c8204a0c1a78505360a
recovery app-navigation.ro.modelProjection 40203477a47372b13d7620dc056006a2adfd69d3de733bc3b054a8713e9aafaa
recovery app-navigation.ro.fallback ce9355e41bd2e02b7197e69b09391bc44c4e3f5dfd57859ae54aca289df630c1
recovery account-settings.en.modelProjection 974caea072e110bfa7f8940ab44bb2b60ea35db217c4c7eb4fa460a010ae943c
recovery account-settings.en.fallback cd6f4ffdcb225fa7bd8ca8f92b045f8fd8066288a752b51fa53121716150c852
recovery account-settings.ro.modelProjection fa20ef501c9e570895a4a849cf0987463be8994a769f1b5c55310cadac3771ff
recovery account-settings.ro.fallback f882a60898dc0a73e1ae850f05791a399c4451523afc4a9a7139afea82191e85
component-file 3bee596b83919014b4215d5b116d7356838e79da73bbaa1871297adbdd8a4300
~~~
