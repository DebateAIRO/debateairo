# OWNER sign-off — S02 support catalogue line, 8 help articles, 16 recovery texts (cookie-compliance)

Status: DRAFT for V0 — not signed. The API refuses to start until the orchestrator records V's answer.
What changes: the catalogue's only change since the 2026-09-29 signature (ffd72986…) is the privacy-preferences label; 8 article files are rewritten; 14 of the 16 recovery texts are rewritten (they carried the false wording, SPEC-v2 §2 M12); the 2 settings-help-menus fallback texts keep their words and are re-signed because their article's hash changed (K7).

### catalog privacy-preferences
~~~text
en: Privacy preferences -> Privacy
ro: Preferințe de confidențialitate -> Confidențialitate
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

DebateAI păstrează patru module cookie și patru elemente în spațiul de stocare al browserului tău, fiecare necesar pentru funcționarea serviciului. Nimic nu este opțional și nimic nu este partajat cu altcineva. Nu setăm cookie-uri analitice, publicitare sau de urmărire. Lista completă, cu durata de păstrare a fiecărui element, se află pe pagina Cookie-uri la `/cookies` și în cardul Ce stocăm. Cardul se deschide din notificarea privind modulele cookie, din controlul Modulele cookie pe care le stocăm din subsolul site-ului, din Setări, apoi Confidențialitate, pentru utilizatorii autentificați, la `/settings#consent-privacy-heading`, și din scurtătura Modulele cookie pe care le stocăm din panoul Ajutor. `/privacy`, `/terms`, `/cookies` și `/legal` sunt pagini ale acestui site. Nu există niciun comutator pentru dezactivarea acestor elemente. Ca să le refuzi, blochează sau șterge modulele cookie și datele site-ului pentru acest site din setările browserului tău; atunci autentificarea și memorarea limbii și a opțiunilor de afișare nu mai funcționează.
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

Account sau Settings deschide pagina de setări a contului autentificat. Active sessions permite vizitatorului să examineze dispozitivele, să revoce o sesiune sau să se deconecteze de peste tot. Confidențialitate deschide o listă, doar pentru citire, cu modulele cookie și elementele din spațiul de stocare al browserului pe care le păstrează DebateAI. Claim legacy debates acceptă un token vechi de acces la dezbatere pentru a atașa dezbaterile nerevendicate care corespund. Delete account arată programarea și anularea ștergerii; ștergerea începe după șapte zile complete și necesită un canal verificat de email sau email de recuperare.

Asistența poate naviga direct la aceste secțiuni fixe din Setări și poate explica cerințele vizibile. Nu poate citi sesiunile, tokenul, contul, lista de dezbateri, starea ștergerii sau alte date private ale vizitatorului. Nu cere, nu primește, nu repetă, nu validează și nu trimite o parolă, un token de acces, un cod de autentificare sau un cod de recuperare și nu poate revoca sesiuni, revendica dezbateri ori programa sau anula ștergerea în locul vizitatorului.

Conversația din Ajutor răspunde din ghidul public al produsului. Pastilele de subiect sunt scurtături opționale. Report a bug completează text obișnuit pentru ghidul public în caseta de compunere și nu creează un caz uman. Escalate to a human creează transferul separat către o persoană, iar emailul de asistență este un flux separat de mail; un caz uman poate include conversația, dar modelul ghidului public nu primește înregistrările private sau tokenurile cazului.
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

Home is the debate library. Your debates is the signed-in visitor's private list, while Public debates is the published catalog. Support can explain these tabs and offer their fixed navigation, but it cannot read either visitor-specific list or invent a debate link. Account and Settings open account settings for a signed-in visitor. The theme control changes only this browser's display.

Help opens the free-text Support conversation. Topic buttons and suggested questions are optional shortcuts that fill or send ordinary Support text; they are not the only questions Support accepts. Compact Help, Cookies we store (it opens the What we store list), and theme controls stay in the page or browser and are described in prose rather than as remote operations. Report a bug primes ordinary public-guide text in the Support composer and does not create a human case. Email support and Escalate to a human are separate human-support workflows.
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

Pagina de prezentare oferă legături către Method și Transcripts (exemplul de dezbatere și transcriere). Pricing este o secțiune informativă, nu o pagină de plată. Start a round și New debate deschid creatorul de dezbateri după autentificare; un vizitator neautentificat este trimis mai întâi la autentificare.

Acasă este biblioteca de dezbateri. Your debates este lista privată a vizitatorului autentificat, iar Public debates este catalogul publicat. Asistența poate explica aceste file și poate oferi navigarea lor fixă, dar nu poate citi lista privată a vizitatorului și nu poate inventa o legătură către o dezbatere. Account și Settings deschid setările contului pentru un vizitator autentificat. Controlul temei schimbă numai aspectul din acest browser.

Help deschide conversația liberă cu Asistența. Butoanele de subiect și întrebările sugerate sunt scurtături opționale care completează sau trimit text obișnuit; ele nu limitează întrebările acceptate. Compact Help, Modulele cookie pe care le stocăm (deschide lista Ce stocăm) și tema rămân controale locale ale paginii sau browserului și sunt explicate în text, nu executate de la distanță. Report a bug completează text obișnuit pentru ghidul public în caseta Asistenței și nu creează un caz uman. Emailul de asistență și Escalate to a human sunt fluxuri separate de asistență umană.
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

După autentificare, `/settings` conține revizuirea și revocarea sesiunilor, secțiunea Confidențialitate, care arată ce stochează acest browser, revendicarea dezbaterilor vechi și controalele pentru ștergerea contului. Acțiunile sensibile cer o autentificare recentă în pagina care le gestionează. Pagina obișnuită de setări nu oferă acum controale active pentru schimbarea emailului, înlocuirea parolei, regenerarea MFA activă sau modificarea rutării implementării. Asistența poate explica aceste controale, dar nu le poate executa și nu poate primi parolele, codurile, tokenii sau frazele de confirmare.
~~~

### recovery privacy-consent.en.modelProjection
~~~text
DebateAI keeps four cookies and four items in the browser's storage, each needed for the service to work; nothing is optional and nothing is shared with anyone else. We set no analytics, advertising or tracking cookies. The full list, with how long each item is kept, is on the Cookies page and in the What we store card, which opens from the cookie notice, from the Cookies we store control in the site footer, from Settings, then Privacy, for signed-in users, and from the Cookies we store shortcut in the Help panel. The Privacy, Terms, Cookies and Legal pages are pages of this site. There is no switch: to refuse these items, block or delete cookies and site data for this site in the browser settings; signing in and the remembering of language and display choices then stop working.
~~~

### recovery privacy-consent.en.fallback
~~~text
DebateAI keeps four cookies and four browser storage items, all needed for the service to work; none is optional and none is shared. We set no analytics, advertising or tracking cookies. See the full list on the Cookies page or in the What we store card, which opens from the cookie notice, the site footer, Settings then Privacy after sign in, or the Help panel. There is no switch: to refuse, block or delete cookies and site data in the browser settings; signing in and the remembered language and display choices then stop working.
~~~

### recovery privacy-consent.ro.modelProjection
~~~text
DebateAI păstrează patru module cookie și patru elemente în spațiul de stocare al browserului, fiecare necesar pentru funcționarea serviciului; nimic nu este opțional și nimic nu este partajat cu altcineva. Nu setăm cookie-uri analitice, publicitare sau de urmărire. Lista completă, cu durata de păstrare a fiecărui element, se află pe pagina Cookie-uri și în cardul Ce stocăm, care se deschide din notificarea privind modulele cookie, din controlul Modulele cookie pe care le stocăm din subsolul site-ului, din Setări, apoi Confidențialitate, pentru utilizatorii autentificați, și din scurtătura Modulele cookie pe care le stocăm din panoul Ajutor. Paginile Confidențialitate, Termeni, Cookie-uri și Legal sunt pagini ale acestui site. Nu există niciun comutator: ca să refuzi aceste elemente, blochează sau șterge modulele cookie și datele site-ului pentru acest site din setările browserului; atunci autentificarea și memorarea limbii și a opțiunilor de afișare nu mai funcționează.
~~~

### recovery privacy-consent.ro.fallback
~~~text
DebateAI păstrează patru module cookie și patru elemente de stocare în browser, toate necesare pentru funcționarea serviciului; niciunul nu este opțional și niciunul nu este partajat. Nu setăm cookie-uri analitice, publicitare sau de urmărire. Lista completă este pe pagina Cookie-uri sau în cardul Ce stocăm, care se deschide din notificarea privind modulele cookie, din subsolul site-ului, din Setări, apoi Confidențialitate după autentificare, sau din panoul Ajutor. Nu există niciun comutator: ca să refuzi, blochează sau șterge modulele cookie și datele site-ului din setările browserului; atunci autentificarea și memorarea limbii și a opțiunilor de afișare nu mai funcționează.
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
Account sau Settings deschide setările contului autentificat. Active sessions permite examinarea sau revocarea sesiunilor; Confidențialitate deschide o listă, doar pentru citire, cu modulele cookie și stocarea din browser pe care le păstrează DebateAI; Claim legacy debates acceptă un token vechi de acces; Delete account arată controalele de programare și anulare. Asistența poate oferi legături fixe către secțiuni și explica cerințele, dar nu poate citi sesiuni private, tokenuri, contul sau starea ștergerii, primi credențiale sau coduri de securitate ori executa operații asupra contului. Help folosește ghidul public; pastilele opționale sunt scurtături. Report a bug completează text obișnuit pentru ghidul public în caseta de compunere și nu creează un caz uman. Escalate to a human creează transferul separat către o persoană, iar emailul de asistență este un flux separat de mail.
~~~

### recovery settings-help-menus.ro.fallback
~~~text
Autentifică-te și deschide secțiunea relevantă din Settings pentru Active sessions, Privacy, Claim legacy debates sau Delete account. Asistența poate naviga și explica, dar nu poate inspecta date private, primi credențiale sau coduri, revoca sesiuni, revendica dezbateri ori opera ștergerea. Report a bug completează text obișnuit pentru ghidul public în caseta de compunere și nu creează un caz uman. Escaladarea umană și emailul rămân separate de ghidul public.
~~~

### recovery app-navigation.en.modelProjection
~~~text
The landing page links to Method and Transcripts (the sample debate transcript); Pricing is informational, not checkout. Start a round and New debate open the debate creator after authentication. Home is the library: Your debates is private to the authenticated visitor and Public debates is the published catalog. Account and Settings open account settings. Theme, Compact Help, and Cookies we store (it opens the What we store list) are local page or browser controls. Help accepts free text; topic buttons and suggested questions are optional shortcuts. Support can explain and offer fixed navigation but cannot read visitor lists or invent debate links. Report a bug primes ordinary public-guide text in the Support composer and does not create a human case. Email support and Escalate to a human are separate human-support workflows.
~~~

### recovery app-navigation.en.fallback
~~~text
Use Home for the debate library, Public debates for the published catalog, and Help for a free-text Support conversation. Sign in before opening New debate, Your debates, Account, or Settings. Pricing is informational; theme, Compact Help, and Cookies we store (it opens the What we store list) are local controls. Support cannot read private lists or invent a debate link.
~~~

### recovery app-navigation.ro.modelProjection
~~~text
Pagina de prezentare oferă Method și Transcripts (exemplul de dezbatere și transcriere); Pricing este informativ, nu o pagină de plată. Start a round și New debate deschid creatorul după autentificare. Acasă este biblioteca: Your debates este lista privată a vizitatorului autentificat, iar Public debates este catalogul publicat. Account și Settings deschid setările contului. Tema, Compact Help și Modulele cookie pe care le stocăm (deschide lista Ce stocăm) sunt controale locale. Help acceptă text liber; butoanele de subiect și întrebările sugerate sunt scurtături opționale. Asistența poate explica și oferi navigare fixă, dar nu poate citi listele vizitatorului sau inventa legături către dezbateri. Report a bug completează text obișnuit pentru ghidul public în caseta Asistenței și nu creează un caz uman. Emailul de asistență și Escalate to a human sunt fluxuri separate de asistență umană.
~~~

### recovery app-navigation.ro.fallback
~~~text
Folosește Acasă pentru bibliotecă, Public debates pentru catalogul publicat și Help pentru o conversație liberă cu Asistența. Autentifică-te înainte de New debate, Your debates, Account sau Settings. Pricing este informativ; tema, Compact Help și Modulele cookie pe care le stocăm (deschide lista Ce stocăm) sunt controale locale. Asistența nu poate citi liste private sau inventa o legătură către o dezbatere.
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
După autentificare, Setări conține revizuirea și revocarea sesiunilor, secțiunea Confidențialitate, care arată ce stochează acest browser, revendicarea dezbaterilor vechi și controalele pentru ștergerea contului. Controalele sensibile cer autentificare recentă în pagina care le gestionează. Pagina obișnuită nu are acum controale active pentru înlocuirea emailului, înlocuirea parolei, regenerarea MFA activă sau rutarea implementării. Asistența poate explica limitele, dar nu poate executa controalele și nu poate primi date de autentificare ori fraze de confirmare.
~~~

### recovery account-settings.ro.fallback
~~~text
După autentificare, alege Setări pentru revizuirea sau revocarea sesiunilor, secțiunea Confidențialitate cu ce stochează acest browser, revendicarea dezbaterilor vechi ori ștergerea contului. Controalele sensibile cer autentificare recentă în pagină. Pagina nu oferă schimbarea emailului, înlocuirea parolei, regenerarea MFA activă sau modificarea rutării implementării. Asistența poate explica aceste controale, dar nu le poate executa și nu poate primi date de autentificare.
~~~

## Fingerprints (sha256)

~~~text
catalog-canonical 33bdc2ab16d94a704afc75d51531b1a9f534496c81a1301505b61817a374faa0
article privacy-consent.en 0fef2fa6fc9b8ac75ad7134d4b5f746b0be230a4292c9d983b24dfa00f42951f
article privacy-consent.ro 5bb725932c69bd7728c7b73080019e84fc90215af37e04ed2c2cbdc98890fa12
article settings-help-menus.en 53b4612d883133874617b1a8647df9450dc75e2301e8f93a56e7eceaa169a084
article settings-help-menus.ro 8eb4de26f2a64b2f5fc1c3ce3063e24b49976b8b98d533203146ec093257ff49
article app-navigation.en a6984eff34d2abffc97aeae10cd3366ceff6fb5e2de402b2159276e0b5f36999
article app-navigation.ro dce074a234a4e83788f2d22ac179a47c71a8bc7cd2fc4391433544c4fd52c8f5
article account-settings.en e4299c87f0dfe85c1063b1f37c1d3206ce5ed8862bbac75333a883cebcd49e81
article account-settings.ro 591f1b47696ab061e4c5b3f6542c7cacf54d33aa74ce9fa1f3f65c2e321e80a4
recovery privacy-consent.en.modelProjection 82d53e0bbffd4f4b5cf1e7be2d82fc8afaeb90e7f93c4365c90d788157baf3cb
recovery privacy-consent.en.fallback 3fe7da1ecfe2848622b10234fac52d5283a30a4473a0adada8eb9e6555b24824
recovery privacy-consent.ro.modelProjection 793e94a5071acdf65d0d5cc40b255f5a6970d2d83d24f3297538cf1dd780d693
recovery privacy-consent.ro.fallback 5f68ed2fc6291417ad46337bff6b82dc05cd512f0f6fac816d7b6319734eeea5
recovery settings-help-menus.en.modelProjection 291f2b5a3c95cf345d3d1794e2e0c2e7e5e88ccff5703a200ef89c8f28ad7108
recovery settings-help-menus.en.fallback ea5720fab4e9755c489c63daec5e85d0cf6b3a0fa9d30a97827dadc7d0e166b5
recovery settings-help-menus.ro.modelProjection 652be8fd40fc5d4ee4ef04e899c4239a120c0211a4bb9bc26f88120aac64e08f
recovery settings-help-menus.ro.fallback 574aef1c82b5203dcab7fd229ad3c6b9bcaa13c64a55924e7ffc49c5bab2d3cc
recovery app-navigation.en.modelProjection 3633136aac4a69337473bd7c218eca044f673496a6f5809f650f0809b43fd34d
recovery app-navigation.en.fallback eadb3349e83a67241543f151e3b035d9838c1d91d57ca1f1d495009634587e5c
recovery app-navigation.ro.modelProjection 9bb52ac9a822d19ae283340e3766d8e43261805aef8e15c8b0fde9b62496d683
recovery app-navigation.ro.fallback f413442c192e23c14e0d37a9d2072365c8e604ca0e316069d4204b96bec08567
recovery account-settings.en.modelProjection 974caea072e110bfa7f8940ab44bb2b60ea35db217c4c7eb4fa460a010ae943c
recovery account-settings.en.fallback cd6f4ffdcb225fa7bd8ca8f92b045f8fd8066288a752b51fa53121716150c852
recovery account-settings.ro.modelProjection 21c39fda0dc16e2f1a645c43f13cb667df5c160140ff3fb52c44d151b6e0fcf9
recovery account-settings.ro.fallback 6ccee10708d3ef136afc9a7782d2828c567ec4504af4ff5d1ebcc9e29858fe87
component-file 825684a751c7fd2dc487370717708c9206352d33f35b6906024b3f753737cf59
~~~
