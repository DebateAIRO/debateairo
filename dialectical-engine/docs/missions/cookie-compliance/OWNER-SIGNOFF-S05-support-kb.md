# OWNER sign-off — S05 help-bot control names: 12 help articles, 13 recovery rows (cookie-compliance)

Status: DRAFT for V1 — not signed. The API refuses to start until the orchestrator records V's answer.
What changes (SPEC-v4 R06-R08): in 12 of the 12 article files and 22 of the 26 recovery texts below, only control names change — each becomes the label the screen shows in that language (V-17, V-18). The one exception to names-only: account-access no longer names a "Forgot password" control; it says a password reset flow exists but Support does not offer it yet (R06). A recovery text marked "unchanged" keeps its words and is re-signed because its row's article hash changed. Not in this signature: the catalogue (signed at S02's V0) and the templates (they carry no owner digest).

### article account-access.en

base -> new (changed lines; [-removed-] {+added+}):
~~~text
~ Use `/login` to sign in with your password and then complete the required second verification step with an authenticator code or a saved unused recovery code. The login page offers **Use a recovery code** after the password step. Use `/sign-up` to register; email verification and authenticator enrollment continue only from their valid account-flow state. The product owner confirms a separate [-Forgot-]{+password+} [-password-]{+reset+} flow, but Support keeps that action unavailable until its exact existing destination is verified. Never put a password, verification token, authenticator secret, or recovery code in Support.
~~~

full text:
~~~text
---
id: account-access
lang: en
title: "Sign in, register, and recover MFA access"
status: shipped
sources:
  - apps/ui/components/LoginFlow.tsx:62
  - apps/ui/components/LoginFlow.tsx:289
  - apps/ui/components/SignUpFlow.tsx:183
  - apps/ui/app/verify-email/page.tsx:1
  - apps/ui/app/enroll-mfa/page.tsx:75
verified_against: "b7ca2c41"
ratified_by: ""
ratified_on: ""
---

Use `/login` to sign in with your password and then complete the required second verification step with an authenticator code or a saved unused recovery code. The login page offers **Use a recovery code** after the password step. Use `/sign-up` to register; email verification and authenticator enrollment continue only from their valid account-flow state. The product owner confirms a separate password reset flow, but Support keeps that action unavailable until its exact existing destination is verified. Never put a password, verification token, authenticator secret, or recovery code in Support.
~~~

### article account-access.ro

base -> new (changed lines; [-removed-] {+added+}):
~~~text
~ Folosește `/login` pentru a te autentifica prin parolă, apoi finalizează al doilea pas obligatoriu de verificare cu un cod de autentificator sau cu un cod de recuperare salvat și nefolosit. Pagina de autentificare oferă [-**Use-]{+**Folosiți+} [-a-]{+un+} [-recovery-]{+cod+} [-code**-]{+de recuperare**+} după pasul parolei. Folosește `/sign-up` pentru înregistrare; verificarea emailului și înscrierea autentificatorului continuă numai din starea validă a fluxului contului. Proprietarul produsului confirmă un flux separat pentru parola uitată, dar Asistența păstrează această acțiune indisponibilă până la verificarea destinației existente exacte. Nu introduce în Asistență parola, tokenul de verificare, secretul autentificatorului sau codul de recuperare.
~~~

full text:
~~~text
---
id: account-access
lang: ro
title: "Autentificare, înregistrare și recuperarea accesului MFA"
status: shipped
sources:
  - apps/ui/components/LoginFlow.tsx:62
  - apps/ui/components/LoginFlow.tsx:289
  - apps/ui/components/SignUpFlow.tsx:183
  - apps/ui/app/verify-email/page.tsx:1
  - apps/ui/app/enroll-mfa/page.tsx:75
verified_against: "b7ca2c41"
ratified_by: ""
ratified_on: ""
---

Folosește `/login` pentru a te autentifica prin parolă, apoi finalizează al doilea pas obligatoriu de verificare cu un cod de autentificator sau cu un cod de recuperare salvat și nefolosit. Pagina de autentificare oferă **Folosiți un cod de recuperare** după pasul parolei. Folosește `/sign-up` pentru înregistrare; verificarea emailului și înscrierea autentificatorului continuă numai din starea validă a fluxului contului. Proprietarul produsului confirmă un flux separat pentru parola uitată, dar Asistența păstrează această acțiune indisponibilă până la verificarea destinației existente exacte. Nu introduce în Asistență parola, tokenul de verificare, secretul autentificatorului sau codul de recuperare.
~~~

### article ai-transparency.ro

base -> new (changed lines; [-removed-] {+added+}):
~~~text
~ Pagina AI transparency, la care duce legătura [-How-]{+Cum+} [-we-]{+etichetăm+} [-label-]{+conținutul+} [-AI-]{+generat+} [-content,-]{+de IA,+} arată că argumentele, recenziile, scorurile, verdictele și răspunsurile asistenței sunt generate de modele AI și pot fi inexacte sau incomplete. Tratează-le ca pe un material de analizat, nu ca pe fapte, și verifică afirmațiile și sursele lor înainte să te bazezi pe ele. Scorurile și verdictele evaluează argumentele; nu sunt o garanție a adevărului. Publicarea nu este precedată de nicio revizuire editorială umană, iar nicio persoană anume nu poartă responsabilitatea editorială pentru conținutul generat.
~ Notificările privind AI apar înainte de pornirea unei dezbateri, în bibliotecă, în dezbaterile private și publicate și în conversațiile de asistență, iar atribuirea înregistrată a modelului însoțește argumentele atunci când există. Conținutul generat poartă și un marcaj într-un format citibil automat, iar descărcările JSON ale dezbaterilor includ o declarație privind AI. Întrebarea ta și mesajele tale către asistență nu sunt etichetate ca generate de AI. Aceste marcaje nu sunt un filigran și nici un certificat de autenticitate, iar copierea textului simplu le poate elimina. Asistentul de suport este un sistem AI. Pentru a cere ajutorul unei persoane, folosește [-Talk-]{+Vorbiți+} [-to-]{+cu+} [-a-]{+o+} [-human-]{+persoană+} sau [-Escalate-]{+Escaladați+} [-to-]{+către+} [-a-]{+o+} [-human-]{+persoană+} în Ajutor.
~~~

full text:
~~~text
---
id: ai-transparency
lang: ro
title: "Cum este etichetat conținutul generat de AI"
status: shipped
sources:
  - apps/ui/app/ai-transparency/page.tsx:13
  - apps/ui/app/ai-transparency/page.tsx:16
  - apps/ui/app/ai-transparency/page.tsx:19
  - apps/ui/app/ai-transparency/page.tsx:22
  - apps/ui/app/ai-transparency/page.tsx:26
  - apps/ui/app/ai-transparency/page.tsx:29
  - apps/ui/app/ai-transparency/page.tsx:32
  - apps/ui/components/AiNotice.tsx:24
  - apps/ui/lib/aiDisclosure.ts:5
verified_against: "776359c3"
ratified_by: ""
ratified_on: ""
---

Pagina AI transparency, la care duce legătura Cum etichetăm conținutul generat de IA, arată că argumentele, recenziile, scorurile, verdictele și răspunsurile asistenței sunt generate de modele AI și pot fi inexacte sau incomplete. Tratează-le ca pe un material de analizat, nu ca pe fapte, și verifică afirmațiile și sursele lor înainte să te bazezi pe ele. Scorurile și verdictele evaluează argumentele; nu sunt o garanție a adevărului. Publicarea nu este precedată de nicio revizuire editorială umană, iar nicio persoană anume nu poartă responsabilitatea editorială pentru conținutul generat.

Notificările privind AI apar înainte de pornirea unei dezbateri, în bibliotecă, în dezbaterile private și publicate și în conversațiile de asistență, iar atribuirea înregistrată a modelului însoțește argumentele atunci când există. Conținutul generat poartă și un marcaj într-un format citibil automat, iar descărcările JSON ale dezbaterilor includ o declarație privind AI. Întrebarea ta și mesajele tale către asistență nu sunt etichetate ca generate de AI. Aceste marcaje nu sunt un filigran și nici un certificat de autenticitate, iar copierea textului simplu le poate elimina. Asistentul de suport este un sistem AI. Pentru a cere ajutorul unei persoane, folosește Vorbiți cu o persoană sau Escaladați către o persoană în Ajutor.
~~~

### article budget-tier-choice.ro

base -> new (changed lines; [-removed-] {+added+}):
~~~text
~ Nivelul bugetului de compoziție înregistrează câtă muncă poate aloca procesul de compoziție. Planul [-Free-]{+Gratuit+} păstrează valoarea implicită curentă fixă. Cu planul Premium selectat, poți alege [-**Low**,-]{+**Redus**,+} [-**Medium**-]{+**Mediu**+} sau [-**High**-]{+**Ridicat**+} înainte să pornești rularea. Acest control nu dovedește un abonament plătit, o plată sau disponibilitatea garantată a modelelor.
~~~

full text:
~~~text
---
id: budget-tier-choice
lang: ro
title: "Alege nivelul bugetului de compoziție"
status: shipped
sources:
  - apps/ui/app/new/page.tsx:87
  - apps/ui/app/new/page.tsx:111
  - apps/ui/app/new/page.tsx:257
verified_against: "b7ca2c41"
ratified_by: ""
ratified_on: ""
---

Nivelul bugetului de compoziție înregistrează câtă muncă poate aloca procesul de compoziție. Planul Gratuit păstrează valoarea implicită curentă fixă. Cu planul Premium selectat, poți alege **Redus**, **Mediu** sau **Ridicat** înainte să pornești rularea. Acest control nu dovedește un abonament plătit, o plată sau disponibilitatea garantată a modelelor.
~~~

### article debate-topic-and-description.ro

base -> new (changed lines; [-removed-] {+added+}):
~~~text
~ Scrie în [-**Topic**-]{+**Subiect**+} întrebarea sau afirmația pe care vrei să o examinezi. Formularul cere mai mult de șase caractere. Planul Premium îți permite și să adaugi câte o selecție de îndrumare pe linie și adnotări libere. Planul [-Free-]{+Gratuit+} golește și dezactivează aceste câmpuri de îndrumare. Formularul curent nu are un câmp separat pentru descriere.
~~~

full text:
~~~text
---
id: debate-topic-and-description
lang: ro
title: "Scrie subiectul și îndrumările dezbaterii"
status: shipped
sources:
  - apps/ui/app/new/page.tsx:130
  - apps/ui/app/new/page.tsx:215
  - apps/ui/app/new/page.tsx:278
verified_against: "b7ca2c41"
ratified_by: ""
ratified_on: ""
---

Scrie în **Subiect** întrebarea sau afirmația pe care vrei să o examinezi. Formularul cere mai mult de șase caractere. Planul Premium îți permite și să adaugi câte o selecție de îndrumare pe linie și adnotări libere. Planul Gratuit golește și dezactivează aceste câmpuri de îndrumare. Formularul curent nu are un câmp separat pentru descriere.
~~~

### article debate-workspace-menus.ro

base -> new (changed lines; [-removed-] {+added+}):
~~~text
~ După ce dezbaterea are un arbore, [-Thread-]{+Fir+} arată argumentul ca o succesiune, [-Split-]{+Divizat+} compară ramurile, [-Tree-]{+Arbore+} arată ierarhia, iar [-Map-]{+Hartă+} arată relațiile. Informațiile de evaluare apar împreună cu dezbaterea când sunt disponibile. Categoriile publice ale diagnosticului pot arăta disponibilitatea, starea încărcării și a reîmprospătării; furnizorul și modelul împreună cu momentele verificării sau generării; cache sau învechire; numărul afirmațiilor curente, evaluate, omise și trunchiate și filtrele bazate pe scor; golurile nerezolvate și marcajele fatale; și investigațiile recomandate. O categorie sau o valoare poate lipsi când datele de evaluare nu sunt disponibile. Asistența poate explica aceste categorii publice, dar nu poate citi dezbaterea sau valorile ei de evaluare. [-Library-]{+Bibliotecă+} revine la pagina Acasă.
~ [-Replay-]{+Reluare+} pornește o altă generare din spațiul curent al proprietarului. [-Workspace-]{+Spațiu de lucru+} deschide artefactele locale ale dezbaterii, iar [-Honesty-]{+Onestitate+} deschide detaliile despre proveniență și limitări. Export este disponibil numai când există un răspuns exportabil. [-How-]{+Cum+} [-it works-]{+funcționează+} deschide ghidul din pagină. Dezbaterile publicate pot afișa un set mai mic de vizualizări, numai pentru citire.
~~~

full text:
~~~text
---
id: debate-workspace-menus
lang: ro
title: "Folosește meniurile spațiului de dezbatere"
status: shipped
sources:
  - apps/ui/app/debate/[id]/DebatePageClient.tsx:1031
  - apps/ui/app/debate/[id]/DebatePageClient.tsx:1119
  - apps/ui/app/debate/[id]/DebatePageClient.tsx:1577
  - apps/ui/app/debate/[id]/DebatePageClient.tsx:1586
  - apps/ui/app/debate/[id]/DebatePageClient.tsx:1595
  - apps/ui/app/debate/[id]/DebatePageClient.tsx:1742
  - apps/ui/components/DebateWorkspaceDrawer.tsx:24
  - apps/ui/components/AnswerHonestyDrawer.tsx:64
verified_against: "714c7aa9"
ratified_by: ""
ratified_on: ""
---

După ce dezbaterea are un arbore, Fir arată argumentul ca o succesiune, Divizat compară ramurile, Arbore arată ierarhia, iar Hartă arată relațiile. Informațiile de evaluare apar împreună cu dezbaterea când sunt disponibile. Categoriile publice ale diagnosticului pot arăta disponibilitatea, starea încărcării și a reîmprospătării; furnizorul și modelul împreună cu momentele verificării sau generării; cache sau învechire; numărul afirmațiilor curente, evaluate, omise și trunchiate și filtrele bazate pe scor; golurile nerezolvate și marcajele fatale; și investigațiile recomandate. O categorie sau o valoare poate lipsi când datele de evaluare nu sunt disponibile. Asistența poate explica aceste categorii publice, dar nu poate citi dezbaterea sau valorile ei de evaluare. Bibliotecă revine la pagina Acasă.

Reluare pornește o altă generare din spațiul curent al proprietarului. Spațiu de lucru deschide artefactele locale ale dezbaterii, iar Onestitate deschide detaliile despre proveniență și limitări. Export este disponibil numai când există un răspuns exportabil. Cum funcționează deschide ghidul din pagină. Dezbaterile publicate pot afișa un set mai mic de vizualizări, numai pentru citire.

Aceste controale acționează asupra dezbaterii deja deschise în browserul vizitatorului. Asistența poate explica scopul, condițiile și limitele lor, dar nu poate citi o dezbatere privată, alege identificatorul ei, reporni generarea, inspecta artefactele sau opera controalele proprietarului. O legătură către dezbaterea proprietarului este disponibilă numai când aplicația furnizează o referință validată pentru proprietarul curent.
~~~

### article getting-started-debate.ro

base -> new (changed lines; [-removed-] {+added+}):
~~~text
~ Autentifică-te și deschide `/new` pentru formularul complet al dezbaterii. Introdu o întrebare sau o afirmație cu mai mult de șase caractere. Planul [-Free-]{+Gratuit+} păstrează valori fixe pentru controalele vizibile de risc, buget, adâncime și îndrumare. Planul Premium îți permite să modifici controalele curente de risc, buget, adâncime și îndrumare înainte să selectezi [-**Start-]{+**Începeți+} [-run**.-]{+rularea**.+} Compozitorul din pagina principală poate transfera subiectul la `/new` când pornirea directă nu este disponibilă; Asistența nu pornește dezbaterea în locul tău.
~~~

full text:
~~~text
---
id: getting-started-debate
lang: ro
title: "Pornește o dezbatere"
status: shipped
sources:
  - apps/ui/app/new/page.tsx:73
  - apps/ui/app/new/page.tsx:111
  - apps/ui/app/new/page.tsx:130
  - apps/ui/app/new/page.tsx:184
  - apps/ui/app/new/page.tsx:237
  - apps/ui/components/LibraryComposer.tsx:23
verified_against: "b7ca2c41"
ratified_by: ""
ratified_on: ""
---

Autentifică-te și deschide `/new` pentru formularul complet al dezbaterii. Introdu o întrebare sau o afirmație cu mai mult de șase caractere. Planul Gratuit păstrează valori fixe pentru controalele vizibile de risc, buget, adâncime și îndrumare. Planul Premium îți permite să modifici controalele curente de risc, buget, adâncime și îndrumare înainte să selectezi **Începeți rularea**. Compozitorul din pagina principală poate transfera subiectul la `/new` când pornirea directă nu este disponibilă; Asistența nu pornește dezbaterea în locul tău.
~~~

### article guide-how-it-works.ro

base -> new (changed lines; [-removed-] {+added+}):
~~~text
~ Spațiul de lucru poate prezenta arborele argumentelor, fire, vizualizarea împărțită, o hartă, starea răspunsului, dovezile și detaliile de onestitate atunci când aceste artefacte există. Cardurile afirmațiilor indică modelul și partea. Acțiunea [-Challenge-]{+Contestați+} schimbă starea locală de examinare și investigație din pagina curentă; nu dovedește o rulare durabilă de răspuns. Istoricul generărilor poate fi indisponibil, iar un panou gol nu dovedește că nu au existat versiuni mai vechi. [-Exportul-]{+Export+} este JSON condiționat, nu Markdown.
~~~

full text:
~~~text
---
id: guide-how-it-works
lang: ro
title: "Cum citești o dezbatere"
status: shipped
sources:
  - apps/ui/app/debate/[id]/DebatePageClient.tsx:1164
  - apps/ui/app/debate/[id]/DebatePageClient.tsx:1169
  - apps/ui/app/debate/[id]/DebatePageClient.tsx:1174
  - apps/ui/components/NodeDetailDrawer.tsx:121
  - apps/ui/components/NodeDetailDrawer.tsx:281
verified_against: "b7ca2c41"
ratified_by: ""
ratified_on: ""
---

Spațiul de lucru poate prezenta arborele argumentelor, fire, vizualizarea împărțită, o hartă, starea răspunsului, dovezile și detaliile de onestitate atunci când aceste artefacte există. Cardurile afirmațiilor indică modelul și partea. Acțiunea Contestați schimbă starea locală de examinare și investigație din pagina curentă; nu dovedește o rulare durabilă de răspuns. Istoricul generărilor poate fi indisponibil, iar un panou gol nu dovedește că nu au existat versiuni mai vechi. Export este JSON condiționat, nu Markdown.
~~~

### article risk-tier-choice.ro

base -> new (changed lines; [-removed-] {+added+}):
~~~text
~ [-Nivelul-]{+Nivel+} de risc înregistrează cât de mult depinde de răspuns. Planul [-Free-]{+Gratuit+} îl fixează la **Standard**. Cu planul Premium selectat, poți alege [-**Casual**,-]{+**Informal**,+} **Standard** sau [-**High-]{+**Miză+} [-stakes**-]{+ridicată**+} înainte să pornești rularea. Rularea trimisă înregistrează selecția efectivă; Asistența nu o poate schimba după trimitere.
~~~

full text:
~~~text
---
id: risk-tier-choice
lang: ro
title: "Alege nivelul de risc"
status: shipped
sources:
  - apps/ui/app/new/page.tsx:85
  - apps/ui/app/new/page.tsx:111
  - apps/ui/app/new/page.tsx:243
verified_against: "b7ca2c41"
ratified_by: ""
ratified_on: ""
---

Nivel de risc înregistrează cât de mult depinde de răspuns. Planul Gratuit îl fixează la **Standard**. Cu planul Premium selectat, poți alege **Informal**, **Standard** sau **Miză ridicată** înainte să pornești rularea. Rularea trimisă înregistrează selecția efectivă; Asistența nu o poate schimba după trimitere.
~~~

### article support-cases.ro

base -> new (changed lines; [-removed-] {+added+}):
~~~text
~ Folosește [-**Talk-]{+**Vorbiți+} [-to-]{+cu+} [-a-]{+o+} [-human**-]{+persoană**+} sau [-**Escalate-]{+**Escaladați+} [-to-]{+către+} [-a-]{+o+} [-human**-]{+persoană**+} în Asistență pentru a crea un caz asincron. Cazul nu este un apel telefonic. Emailul de asistență este un flux separat de mail: emailul de asistență nu creează acest caz și nu primește confirmarea, termenul de răspuns sau legătura privată a cazului. Confirmarea serverului pentru caz indică un termen țintă de răspuns de 48 de ore, iar un alt panou din Asistență spune în prezent că răspunsurile sosesc într-o zi lucrătoare, în zilele lucrătoare. Bazează-te pe confirmarea cazului până când textele sunt aliniate. Păstrează confirmarea cazului privată deoarece ea controlează accesul la caz. Asistența nu verifică livrarea în inbox.
~~~

full text:
~~~text
---
id: support-cases
lang: ro
title: "Cere ajutorul unei persoane"
status: shipped
sources:
  - apps/api/src/support/index.ts:165
  - apps/ui/components/support/Assistant.tsx:680
verified_against: "b7ca2c41"
ratified_by: ""
ratified_on: ""
---

Folosește **Vorbiți cu o persoană** sau **Escaladați către o persoană** în Asistență pentru a crea un caz asincron. Cazul nu este un apel telefonic. Emailul de asistență este un flux separat de mail: emailul de asistență nu creează acest caz și nu primește confirmarea, termenul de răspuns sau legătura privată a cazului. Confirmarea serverului pentru caz indică un termen țintă de răspuns de 48 de ore, iar un alt panou din Asistență spune în prezent că răspunsurile sosesc într-o zi lucrătoare, în zilele lucrătoare. Bazează-te pe confirmarea cazului până când textele sunt aliniate. Păstrează confirmarea cazului privată deoarece ea controlează accesul la caz. Asistența nu verifică livrarea în inbox.
~~~

### article support-status-limits.ro

base -> new (changed lines; [-removed-] {+added+}):
~~~text
~ Blocul [-Service-]{+Starea+} [-status-]{+serviciului+} din Ajutor publică trei indicatori limitați: [-Debate-]{+Motorul+} [-engine,-]{+de+} [-Scoring-]{+dezbatere,+} [-queue-]{+Coada de punctare+} și [-Model-]{+Flota+} [-fleet.-]{+de+} [-Debate-]{+modele.+} [-engine-]{+Motorul de dezbatere+} reflectă disponibilitatea cererii publice de stare, [-Scoring-]{+Coada+} [-queue-]{+de punctare+} îndrumă vizitatorul către starea din aplicație, iar [-Model-]{+Flota+} [-fleet-]{+de modele+} arată starea releului Asistenței sau faptul că verificarea este încă în curs.
~~~

full text:
~~~text
---
id: support-status-limits
lang: ro
title: "Înțelege starea Asistenței"
status: shipped
sources:
  - apps/ui/components/support/Assistant.tsx:706
  - apps/ui/components/support/Assistant.tsx:748
verified_against: "714c7aa9"
ratified_by: ""
ratified_on: ""
---

Blocul Starea serviciului din Ajutor publică trei indicatori limitați: Motorul de dezbatere, Coada de punctare și Flota de modele. Motorul de dezbatere reflectă disponibilitatea cererii publice de stare, Coada de punctare îndrumă vizitatorul către starea din aplicație, iar Flota de modele arată starea releului Asistenței sau faptul că verificarea este încă în curs.

Aceste etichete pot fi indisponibile, incomplete sau învechite. Ele nu dovedesc starea fiecărei dezbateri, sarcini de evaluare, model, furnizor sau implementare. Asistența poate explica indicatorii publici și poate naviga la ei, dar nu poate inspecta dezbaterea, sarcina din coadă, contul, înregistrarea furnizorului sau altă stare privată a vizitatorului.
~~~

### article unsupported-capabilities.ro

base -> new (changed lines; [-removed-] {+added+}):
~~~text
~ Produsul V3 curent nu are resurse pentru regenerarea nodului, feedback de evaluare, scrierea setărilor sau aprobarea adâncimii adaptive. Controalele pentru modul adâncimii, profunzimea examinării, lățimea ramificării, concurență și numărul maxim de tokeni sunt afișate ca opțiuni vechi, dar nu sunt trimise în contractul rulării V3. [-Challenge-]{+Contestați+} schimbă acum starea locală a paginii, fără să pornească un răspuns durabil. Încărcarea istoricului generărilor poate eșua și poate afișa un panou gol. Asistența nu poate transforma aceste limitări în acțiuni funcționale.
~~~

full text:
~~~text
---
id: unsupported-capabilities
lang: ro
title: "Acțiuni indisponibile sau doar locale"
status: shipped
sources:
  - apps/ui/lib/v3/missingCapabilities.ts:7
  - apps/ui/lib/v3/adapter.ts:686
  - apps/ui/app/new/page.tsx:335
  - apps/ui/app/debate/[id]/DebatePageClient.tsx:1444
  - apps/ui/components/NodeDetailDrawer.tsx:121
verified_against: "b7ca2c41"
ratified_by: ""
ratified_on: ""
---

Produsul V3 curent nu are resurse pentru regenerarea nodului, feedback de evaluare, scrierea setărilor sau aprobarea adâncimii adaptive. Controalele pentru modul adâncimii, profunzimea examinării, lățimea ramificării, concurență și numărul maxim de tokeni sunt afișate ca opțiuni vechi, dar nu sunt trimise în contractul rulării V3. Contestați schimbă acum starea locală a paginii, fără să pornească un răspuns durabil. Încărcarea istoricului generărilor poate eșua și poate afișa un panou gol. Asistența nu poate transforma aceste limitări în acțiuni funcționale.
~~~

### recovery account-access.en.modelProjection

(text unchanged; its row is re-signed because its article hash changed)

full text:
~~~text
Sign in begins on the account page with the password step. The required second step offers the configured authenticator code or a saved unused recovery code. Email verification is required for registration. Authenticator enrollment is also required. Both stages continue only from valid account-flow state. Support cannot receive passwords, verification tokens, authenticator secrets, or recovery codes.
~~~

### recovery account-access.en.fallback

base -> new (changed lines; [-removed-] {+added+}):
~~~text
~ Choose [-Sign-]{+Log+} in. After the password step, the required second step offers the configured authenticator code or a saved unused recovery code. Choose Create account to register. Email verification is required. Authenticator enrollment is also required. Both stages continue only from valid account-flow state. Support cannot receive passwords, verification tokens, authenticator secrets, or recovery codes.
~~~

full text:
~~~text
Choose Log in. After the password step, the required second step offers the configured authenticator code or a saved unused recovery code. Choose Create account to register. Email verification is required. Authenticator enrollment is also required. Both stages continue only from valid account-flow state. Support cannot receive passwords, verification tokens, authenticator secrets, or recovery codes.
~~~

### recovery account-access.ro.modelProjection

(text unchanged; its row is re-signed because its article hash changed)

full text:
~~~text
Autentificarea începe în pagina contului cu pasul parolei. Al doilea pas obligatoriu oferă un cod din autentificatorul configurat sau un cod de recuperare salvat și nefolosit. Verificarea emailului este obligatorie pentru înregistrare. Este obligatorie și înrolarea autentificatorului. Ambele etape continuă numai din starea validă a fluxului contului. Asistența nu poate primi parole, tokeni de verificare, secrete de autentificator sau coduri de recuperare.
~~~

### recovery account-access.ro.fallback

base -> new (changed lines; [-removed-] {+added+}):
~~~text
~ Alege [-Autentificare.-]{+Autentificați-vă.+} După pasul parolei, al doilea pas obligatoriu oferă un cod din autentificatorul configurat sau un cod de recuperare salvat și nefolosit. Alege [-Creează-]{+Creați+} un cont pentru înregistrare. Verificarea emailului este obligatorie. Este obligatorie și înrolarea autentificatorului. Ambele etape continuă numai din starea validă a fluxului contului. Nu introduce în Asistență parole, tokeni de verificare, secrete de autentificator sau coduri de recuperare.
~~~

full text:
~~~text
Alege Autentificați-vă. După pasul parolei, al doilea pas obligatoriu oferă un cod din autentificatorul configurat sau un cod de recuperare salvat și nefolosit. Alege Creați un cont pentru înregistrare. Verificarea emailului este obligatorie. Este obligatorie și înrolarea autentificatorului. Ambele etape continuă numai din starea validă a fluxului contului. Nu introduce în Asistență parole, tokeni de verificare, secrete de autentificator sau coduri de recuperare.
~~~

### recovery ai-transparency.ro.modelProjection

base -> new (changed lines; [-removed-] {+added+}):
~~~text
~ Pagina AI transparency, la care duce legătura [-How-]{+Cum+} [-we-]{+etichetăm+} [-label-]{+conținutul+} [-AI-]{+generat+} [-content,-]{+de IA,+} precizează că argumentele, recenziile, scorurile, verdictele și răspunsurile asistenței sunt generate de modele AI și pot fi inexacte sau incomplete. Pagina recomandă ca ele să fie tratate ca material de analizat, nu ca fapte, iar afirmațiile și sursele lor să fie verificate înainte de a fi folosite. Scorurile și verdictele evaluează argumentele și nu sunt o garanție a adevărului. Publicarea nu este precedată de nicio revizuire editorială umană, iar nicio persoană anume nu poartă responsabilitatea editorială pentru conținutul generat. Notificările privind AI apar înainte de pornirea unei dezbateri, în bibliotecă, în dezbaterile private și publicate și în conversațiile de asistență, iar atribuirea înregistrată a modelului însoțește argumentele atunci când există. Conținutul generat poartă un marcaj într-un format citibil automat, iar descărcările JSON ale dezbaterilor includ o declarație privind AI; întrebările și mesajele către asistență scrise de oameni nu sunt etichetate ca generate de AI. Aceste marcaje nu sunt un filigran sau un certificat de autenticitate, iar copierea textului simplu le poate elimina. Asistentul de suport este un sistem AI; [-Talk-]{+Vorbiți+} [-to-]{+cu+} [-a-]{+o+} [-human-]{+persoană+} sau [-Escalate-]{+Escaladați+} [-to-]{+către+} [-a-]{+o+} [-human-]{+persoană+} din Ajutor solicită ajutorul unei persoane.
~~~

full text:
~~~text
Pagina AI transparency, la care duce legătura Cum etichetăm conținutul generat de IA, precizează că argumentele, recenziile, scorurile, verdictele și răspunsurile asistenței sunt generate de modele AI și pot fi inexacte sau incomplete. Pagina recomandă ca ele să fie tratate ca material de analizat, nu ca fapte, iar afirmațiile și sursele lor să fie verificate înainte de a fi folosite. Scorurile și verdictele evaluează argumentele și nu sunt o garanție a adevărului. Publicarea nu este precedată de nicio revizuire editorială umană, iar nicio persoană anume nu poartă responsabilitatea editorială pentru conținutul generat. Notificările privind AI apar înainte de pornirea unei dezbateri, în bibliotecă, în dezbaterile private și publicate și în conversațiile de asistență, iar atribuirea înregistrată a modelului însoțește argumentele atunci când există. Conținutul generat poartă un marcaj într-un format citibil automat, iar descărcările JSON ale dezbaterilor includ o declarație privind AI; întrebările și mesajele către asistență scrise de oameni nu sunt etichetate ca generate de AI. Aceste marcaje nu sunt un filigran sau un certificat de autenticitate, iar copierea textului simplu le poate elimina. Asistentul de suport este un sistem AI; Vorbiți cu o persoană sau Escaladați către o persoană din Ajutor solicită ajutorul unei persoane.
~~~

### recovery ai-transparency.ro.fallback

base -> new (changed lines; [-removed-] {+added+}):
~~~text
~ Pagina AI transparency explică faptul că argumentele, recenziile, scorurile, verdictele și răspunsurile asistenței sunt generate de modele AI și pot fi inexacte sau incomplete, așa că analizează-le în loc să le tratezi ca fapte. Scorurile și verdictele nu sunt o garanție a adevărului, iar publicarea nu este precedată de nicio revizuire editorială umană. Conținutul generat poartă un marcaj într-un format citibil automat, care nu este un filigran. Pentru a vorbi cu o persoană, folosește [-Talk-]{+Vorbiți+} [-to-]{+cu+} [-a-]{+o+} [-human-]{+persoană+} sau [-Escalate-]{+Escaladați+} [-to-]{+către+} [-a-]{+o+} [-human-]{+persoană+} în Ajutor.
~~~

full text:
~~~text
Pagina AI transparency explică faptul că argumentele, recenziile, scorurile, verdictele și răspunsurile asistenței sunt generate de modele AI și pot fi inexacte sau incomplete, așa că analizează-le în loc să le tratezi ca fapte. Scorurile și verdictele nu sunt o garanție a adevărului, iar publicarea nu este precedată de nicio revizuire editorială umană. Conținutul generat poartă un marcaj într-un format citibil automat, care nu este un filigran. Pentru a vorbi cu o persoană, folosește Vorbiți cu o persoană sau Escaladați către o persoană în Ajutor.
~~~

### recovery budget-tier-choice.ro.modelProjection

base -> new (changed lines; [-removed-] {+added+}):
~~~text
~ Nivelul bugetului de compoziție înregistrează câtă muncă poate aloca procesul. Planul [-Free-]{+Gratuit+} păstrează valoarea implicită fixă. Premium permite alegerea [-Low,-]{+Redus,+} [-Medium-]{+Mediu+} sau [-High-]{+Ridicat+} înainte de pornirea rulării. Alegerea nu dovedește un abonament plătit, o plată sau disponibilitatea garantată a unui model.
~~~

full text:
~~~text
Nivelul bugetului de compoziție înregistrează câtă muncă poate aloca procesul. Planul Gratuit păstrează valoarea implicită fixă. Premium permite alegerea Redus, Mediu sau Ridicat înainte de pornirea rulării. Alegerea nu dovedește un abonament plătit, o plată sau disponibilitatea garantată a unui model.
~~~

### recovery budget-tier-choice.ro.fallback

base -> new (changed lines; [-removed-] {+added+}):
~~~text
~ În formularul dezbaterii, [-Free-]{+Gratuit+} păstrează bugetul compoziției la valoarea implicită fixă. Cu Premium selectat, alege [-Low,-]{+Redus,+} [-Medium-]{+Mediu+} sau [-High-]{+Ridicat+} înainte de pornirea rulării. Selecția nu dovedește plata și nu garantează disponibilitatea unui model.
~~~

full text:
~~~text
În formularul dezbaterii, Gratuit păstrează bugetul compoziției la valoarea implicită fixă. Cu Premium selectat, alege Redus, Mediu sau Ridicat înainte de pornirea rulării. Selecția nu dovedește plata și nu garantează disponibilitatea unui model.
~~~

### recovery debate-topic-and-description.ro.modelProjection

base -> new (changed lines; [-removed-] {+added+}):
~~~text
~ Câmpul [-Topic-]{+Subiect+} conține întrebarea sau afirmația examinată și cere mai mult de șase caractere. Premium permite și câte o selecție de îndrumare pe linie plus adnotări libere. [-Free-]{+Gratuit+} golește și dezactivează aceste câmpuri. Formularul curent nu are un câmp separat pentru descriere.
~~~

full text:
~~~text
Câmpul Subiect conține întrebarea sau afirmația examinată și cere mai mult de șase caractere. Premium permite și câte o selecție de îndrumare pe linie plus adnotări libere. Gratuit golește și dezactivează aceste câmpuri. Formularul curent nu are un câmp separat pentru descriere.
~~~

### recovery debate-topic-and-description.ro.fallback

base -> new (changed lines; [-removed-] {+added+}):
~~~text
~ Scrie întrebarea sau afirmația în [-Topic-]{+Subiect+} folosind mai mult de șase caractere. Premium poate adăuga câte o selecție de îndrumare pe linie și adnotări libere; [-Free-]{+Gratuit+} golește și dezactivează aceste câmpuri. Formularul curent nu are un câmp separat pentru descriere.
~~~

full text:
~~~text
Scrie întrebarea sau afirmația în Subiect folosind mai mult de șase caractere. Premium poate adăuga câte o selecție de îndrumare pe linie și adnotări libere; Gratuit golește și dezactivează aceste câmpuri. Formularul curent nu are un câmp separat pentru descriere.
~~~

### recovery debate-workspace-menus.ro.modelProjection

base -> new (changed lines; [-removed-] {+added+}):
~~~text
~ Când dezbaterea are un arbore, [-Thread-]{+Fir+} arată o succesiune, [-Split-]{+Divizat+} compară ramurile, [-Tree-]{+Arbore+} arată ierarhia, iar [-Map-]{+Hartă+} arată relațiile. Evaluarea apare numai când este disponibilă. Diagnosticul public poate arăta disponibilitatea, starea încărcării și a reîmprospătării; furnizorul și modelul cu momentele verificării sau generării; cache sau învechire; numărul afirmațiilor curente, evaluate, omise și trunchiate și filtrele bazate pe scor; golurile nerezolvate și marcajele fatale; și investigațiile recomandate. O categorie sau o valoare poate lipsi când datele de evaluare nu sunt disponibile. Asistența poate explica aceste categorii publice, dar nu poate citi dezbaterea sau valorile ei. [-Replay,-]{+Reluare,+} [-Workspace,-]{+Spațiu+} [-Honesty,-]{+de lucru, Onestitate,+} Export și [-How-]{+Cum+} [-it works-]{+funcționează+} acționează asupra dezbaterii deja deschise; dezbaterile publice oferă un set mai mic, numai pentru citire.
~~~

full text:
~~~text
Când dezbaterea are un arbore, Fir arată o succesiune, Divizat compară ramurile, Arbore arată ierarhia, iar Hartă arată relațiile. Evaluarea apare numai când este disponibilă. Diagnosticul public poate arăta disponibilitatea, starea încărcării și a reîmprospătării; furnizorul și modelul cu momentele verificării sau generării; cache sau învechire; numărul afirmațiilor curente, evaluate, omise și trunchiate și filtrele bazate pe scor; golurile nerezolvate și marcajele fatale; și investigațiile recomandate. O categorie sau o valoare poate lipsi când datele de evaluare nu sunt disponibile. Asistența poate explica aceste categorii publice, dar nu poate citi dezbaterea sau valorile ei. Reluare, Spațiu de lucru, Onestitate, Export și Cum funcționează acționează asupra dezbaterii deja deschise; dezbaterile publice oferă un set mai mic, numai pentru citire.
~~~

### recovery debate-workspace-menus.ro.fallback

(text unchanged; its row is re-signed because its article hash changed)

full text:
~~~text
Diagnosticul de evaluare poate arăta disponibilitatea, starea încărcării și a reîmprospătării; furnizorul și modelul; cache sau învechire; numărul afirmațiilor și filtrele; golurile nerezolvate, marcajele fatale și investigațiile recomandate când datele sunt disponibile. Asistența poate explica aceste categorii, dar nu poate citi dezbaterea sau valorile ei.
~~~

### recovery getting-started-debate.ro.modelProjection

base -> new (changed lines; [-removed-] {+added+}):
~~~text
~ Formularul complet al dezbaterii cere autentificare și un subiect mai lung de șase caractere. [-Free-]{+Gratuit+} păstrează fixe controalele vizibile pentru risc, buget, adâncime și îndrumare. Premium permite modificarea controalelor curente înainte de [-Start-]{+Începeți+} [-run.-]{+rularea.+} Compozitorul din Acasă poate transfera subiectul în formularul complet când pornirea directă nu este disponibilă. Asistența nu pornește dezbaterea pentru vizitator.
~~~

full text:
~~~text
Formularul complet al dezbaterii cere autentificare și un subiect mai lung de șase caractere. Gratuit păstrează fixe controalele vizibile pentru risc, buget, adâncime și îndrumare. Premium permite modificarea controalelor curente înainte de Începeți rularea. Compozitorul din Acasă poate transfera subiectul în formularul complet când pornirea directă nu este disponibilă. Asistența nu pornește dezbaterea pentru vizitator.
~~~

### recovery getting-started-debate.ro.fallback

base -> new (changed lines; [-removed-] {+added+}):
~~~text
~ Autentifică-te, alege Pornește o dezbatere și introdu o întrebare sau afirmație cu mai mult de șase caractere. [-Free-]{+Gratuit+} păstrează fixe controalele vizibile pentru risc, buget, adâncime și îndrumare. Premium permite modificarea lor înainte de [-Start-]{+Începeți+} [-run.-]{+rularea.+} Acasă poate transfera subiectul în formularul complet când pornirea directă nu este disponibilă. Asistența nu pornește dezbaterea în locul tău.
~~~

full text:
~~~text
Autentifică-te, alege Pornește o dezbatere și introdu o întrebare sau afirmație cu mai mult de șase caractere. Gratuit păstrează fixe controalele vizibile pentru risc, buget, adâncime și îndrumare. Premium permite modificarea lor înainte de Începeți rularea. Acasă poate transfera subiectul în formularul complet când pornirea directă nu este disponibilă. Asistența nu pornește dezbaterea în locul tău.
~~~

### recovery guide-how-it-works.ro.modelProjection

base -> new (changed lines; [-removed-] {+added+}):
~~~text
~ Când artefactele există, spațiul dezbaterii poate afișa arborele argumentelor, fire, vizualizarea împărțită, o hartă, starea răspunsului, dovezi și detalii de onestitate. Cardurile afirmațiilor indică modelul și partea. [-Challenge-]{+Contestați+} schimbă starea locală de examinare și investigație, dar nu dovedește o rulare durabilă de răspuns. Istoricul poate fi indisponibil, iar un panou gol nu dovedește că nu au existat versiuni mai vechi. [-Exportul-]{+Export+} este JSON condiționat, nu Markdown.
~~~

full text:
~~~text
Când artefactele există, spațiul dezbaterii poate afișa arborele argumentelor, fire, vizualizarea împărțită, o hartă, starea răspunsului, dovezi și detalii de onestitate. Cardurile afirmațiilor indică modelul și partea. Contestați schimbă starea locală de examinare și investigație, dar nu dovedește o rulare durabilă de răspuns. Istoricul poate fi indisponibil, iar un panou gol nu dovedește că nu au existat versiuni mai vechi. Export este JSON condiționat, nu Markdown.
~~~

### recovery guide-how-it-works.ro.fallback

base -> new (changed lines; [-removed-] {+added+}):
~~~text
~ Spațiul dezbaterii poate afișa arborele argumentelor, fire, vizualizarea împărțită, harta, starea răspunsului, dovezile și detaliile de onestitate când sunt disponibile. Cardurile arată modelul și partea. [-Challenge-]{+Contestați+} schimbă examinarea locală; nu dovedește o rulare durabilă de răspuns. Istoricul gol nu dovedește absența versiunilor mai vechi. [-Exportul-]{+Export+} este JSON condiționat, nu Markdown.
~~~

full text:
~~~text
Spațiul dezbaterii poate afișa arborele argumentelor, fire, vizualizarea împărțită, harta, starea răspunsului, dovezile și detaliile de onestitate când sunt disponibile. Cardurile arată modelul și partea. Contestați schimbă examinarea locală; nu dovedește o rulare durabilă de răspuns. Istoricul gol nu dovedește absența versiunilor mai vechi. Export este JSON condiționat, nu Markdown.
~~~

### recovery risk-tier-choice.ro.modelProjection

base -> new (changed lines; [-removed-] {+added+}):
~~~text
~ [-Nivelul-]{+Nivel+} de risc înregistrează cât de mult depinde de răspuns. [-Free-]{+Gratuit+} îl fixează la Standard. Premium permite alegerea [-Casual,-]{+Informal,+} Standard sau [-High-]{+Miză+} [-stakes-]{+ridicată+} înainte de pornirea rulării. Rularea trimisă înregistrează selecția efectivă, iar Asistența nu o poate schimba după trimitere.
~~~

full text:
~~~text
Nivel de risc înregistrează cât de mult depinde de răspuns. Gratuit îl fixează la Standard. Premium permite alegerea Informal, Standard sau Miză ridicată înainte de pornirea rulării. Rularea trimisă înregistrează selecția efectivă, iar Asistența nu o poate schimba după trimitere.
~~~

### recovery risk-tier-choice.ro.fallback

base -> new (changed lines; [-removed-] {+added+}):
~~~text
~ În formularul dezbaterii, [-Free-]{+Gratuit+} fixează riscul la Standard. Cu Premium selectat, alege [-Casual,-]{+Informal,+} Standard sau [-High-]{+Miză+} [-stakes-]{+ridicată+} înainte de pornirea rulării. Rularea trimisă înregistrează selecția efectivă, iar Asistența nu o poate schimba ulterior.
~~~

full text:
~~~text
În formularul dezbaterii, Gratuit fixează riscul la Standard. Cu Premium selectat, alege Informal, Standard sau Miză ridicată înainte de pornirea rulării. Rularea trimisă înregistrează selecția efectivă, iar Asistența nu o poate schimba ulterior.
~~~

### recovery support-cases.ro.modelProjection

base -> new (changed lines; [-removed-] {+added+}):
~~~text
~ [-Talk-]{+Vorbiți+} [-to-]{+cu+} [-a-]{+o+} [-human-]{+persoană+} sau [-Escalate-]{+Escaladați+} [-to-]{+către+} [-a-]{+o+} [-human-]{+persoană+} creează un caz asincron de Asistență, nu un apel telefonic. Emailul de asistență este un flux separat de mail și nu creează cazul din această aplicație și nu primește confirmarea, termenul de răspuns sau legătura privată. Confirmarea serverului oferă un termen țintă de patruzeci și opt de ore, iar alt panou spune în prezent o zi lucrătoare în zilele lucrătoare. Bazează-te pe confirmare până la alinierea textelor. Păstreaz-o privată deoarece controlează accesul la caz. Asistența nu verifică livrarea în inbox.
~~~

full text:
~~~text
Vorbiți cu o persoană sau Escaladați către o persoană creează un caz asincron de Asistență, nu un apel telefonic. Emailul de asistență este un flux separat de mail și nu creează cazul din această aplicație și nu primește confirmarea, termenul de răspuns sau legătura privată. Confirmarea serverului oferă un termen țintă de patruzeci și opt de ore, iar alt panou spune în prezent o zi lucrătoare în zilele lucrătoare. Bazează-te pe confirmare până la alinierea textelor. Păstreaz-o privată deoarece controlează accesul la caz. Asistența nu verifică livrarea în inbox.
~~~

### recovery support-cases.ro.fallback

base -> new (changed lines; [-removed-] {+added+}):
~~~text
~ Alege [-Talk-]{+Vorbiți+} [-to-]{+cu+} [-a-]{+o+} [-human-]{+persoană+} sau [-Escalate-]{+Escaladați+} [-to-]{+către+} [-a-]{+o+} [-human-]{+persoană+} pentru a crea un caz asincron; nu este un apel telefonic. Emailul de asistență este un flux separat și nu creează acel caz și nu primește confirmarea, termenul sau legătura privată. Bazează-te pe termenul de patruzeci și opt de ore din confirmarea serverului cât timp alt panou spune o zi lucrătoare și păstrează confirmarea privată.
~~~

full text:
~~~text
Alege Vorbiți cu o persoană sau Escaladați către o persoană pentru a crea un caz asincron; nu este un apel telefonic. Emailul de asistență este un flux separat și nu creează acel caz și nu primește confirmarea, termenul sau legătura privată. Bazează-te pe termenul de patruzeci și opt de ore din confirmarea serverului cât timp alt panou spune o zi lucrătoare și păstrează confirmarea privată.
~~~

### recovery support-status-limits.ro.modelProjection

base -> new (changed lines; [-removed-] {+added+}):
~~~text
~ Blocul [-Service-]{+Starea+} [-status-]{+serviciului+} din Ajutor publică trei indicatori limitați: [-Debate-]{+Motorul+} [-engine,-]{+de+} [-Scoring-]{+dezbatere,+} [-queue-]{+Coada de punctare+} și [-Model-]{+Flota+} [-fleet.-]{+de+} [-Debate-]{+modele.+} [-engine-]{+Motorul de dezbatere+} reflectă disponibilitatea cererii publice de stare, [-Scoring-]{+Coada+} [-queue-]{+de punctare+} indică starea din aplicație, iar [-Model-]{+Flota+} [-fleet-]{+de modele+} arată starea releului Asistenței sau CHECKING. Indicatorii pot fi indisponibili, incompleți sau învechiți și nu dovedesc starea fiecărei dezbateri, sarcini, model, furnizor sau implementare. Asistența nu poate inspecta înregistrări private despre dezbatere, coadă, cont sau furnizor.
~~~

full text:
~~~text
Blocul Starea serviciului din Ajutor publică trei indicatori limitați: Motorul de dezbatere, Coada de punctare și Flota de modele. Motorul de dezbatere reflectă disponibilitatea cererii publice de stare, Coada de punctare indică starea din aplicație, iar Flota de modele arată starea releului Asistenței sau CHECKING. Indicatorii pot fi indisponibili, incompleți sau învechiți și nu dovedesc starea fiecărei dezbateri, sarcini, model, furnizor sau implementare. Asistența nu poate inspecta înregistrări private despre dezbatere, coadă, cont sau furnizor.
~~~

### recovery support-status-limits.ro.fallback

base -> new (changed lines; [-removed-] {+added+}):
~~~text
~ Deschide [-Support-]{+Starea+} [-status-]{+serviciului+} în Ajutor pentru indicatorii publici [-Debate-]{+Motorul+} [-engine,-]{+de+} [-Scoring-]{+dezbatere,+} [-queue-]{+Coada de punctare+} și [-Model-]{+Flota+} [-fleet.-]{+de modele.+} Ei pot fi indisponibili, incompleți sau învechiți și nu dovedesc starea fiecărei dezbateri, sarcini, model, furnizor sau implementare. Asistența nu poate inspecta înregistrări private de stare.
~~~

full text:
~~~text
Deschide Starea serviciului în Ajutor pentru indicatorii publici Motorul de dezbatere, Coada de punctare și Flota de modele. Ei pot fi indisponibili, incompleți sau învechiți și nu dovedesc starea fiecărei dezbateri, sarcini, model, furnizor sau implementare. Asistența nu poate inspecta înregistrări private de stare.
~~~

### recovery unsupported-capabilities.ro.modelProjection

base -> new (changed lines; [-removed-] {+added+}):
~~~text
~ Produsul curent nu are resurse pentru regenerarea unui nod, feedback de evaluare, scrierea setărilor sau aprobarea adâncimii adaptive. Modul adâncimii, profunzimea examinării, lățimea ramificării, concurența și limita de tokeni sunt afișate ca opțiuni vechi, dar nu sunt trimise în contractul curent al rulării. [-Challenge-]{+Contestați+} schimbă starea locală a paginii în loc să pornească un răspuns durabil. Istoricul generărilor poate eșua la încărcare și poate apărea gol. Asistența nu poate transforma limitele în acțiuni funcționale.
~~~

full text:
~~~text
Produsul curent nu are resurse pentru regenerarea unui nod, feedback de evaluare, scrierea setărilor sau aprobarea adâncimii adaptive. Modul adâncimii, profunzimea examinării, lățimea ramificării, concurența și limita de tokeni sunt afișate ca opțiuni vechi, dar nu sunt trimise în contractul curent al rulării. Contestați schimbă starea locală a paginii în loc să pornească un răspuns durabil. Istoricul generărilor poate eșua la încărcare și poate apărea gol. Asistența nu poate transforma limitele în acțiuni funcționale.
~~~

### recovery unsupported-capabilities.ro.fallback

base -> new (changed lines; [-removed-] {+added+}):
~~~text
~ Produsul curent nu poate regenera un nod, trimite feedback de evaluare, scrie setări sau aproba adâncimea adaptivă. Mai multe controale de adâncime, lățime, concurență și tokeni sunt afișaje vechi și nu sunt trimise cu rularea curentă. [-Challenge-]{+Contestați+} schimbă numai starea locală, iar istoricul poate eșua la încărcare și poate apărea gol. Asistența nu poate transforma aceste limite în acțiuni funcționale.
~~~

full text:
~~~text
Produsul curent nu poate regenera un nod, trimite feedback de evaluare, scrie setări sau aproba adâncimea adaptivă. Mai multe controale de adâncime, lățime, concurență și tokeni sunt afișaje vechi și nu sunt trimise cu rularea curentă. Contestați schimbă numai starea locală, iar istoricul poate eșua la încărcare și poate apărea gol. Asistența nu poate transforma aceste limite în acțiuni funcționale.
~~~

### recovery support-status-limits.en.modelProjection

(text unchanged; its row is re-signed because its article hash changed)

full text:
~~~text
The Help Service status block publishes three limited indicators: Debate engine, Scoring queue, and Model fleet. Debate engine reflects public status-request availability, Scoring queue points to status in the app, and Model fleet shows the Support relay state or CHECKING. These indicators can be unavailable, incomplete, or stale and do not prove every debate, job, model, provider, or deployment is healthy. Support cannot inspect private debate, queue, account, or provider records.
~~~

### recovery support-status-limits.en.fallback

base -> new (changed lines; [-removed-] {+added+}):
~~~text
~ Open [-Support-]{+Service+} status on Help for the public Debate engine, Scoring queue, and Model fleet indicators. They can be unavailable, incomplete, or stale and do not prove every debate, job, model, provider, or deployment is healthy. Support cannot inspect private status records.
~~~

full text:
~~~text
Open Service status on Help for the public Debate engine, Scoring queue, and Model fleet indicators. They can be unavailable, incomplete, or stale and do not prove every debate, job, model, provider, or deployment is healthy. Support cannot inspect private status records.
~~~

## Fingerprints (sha256)

~~~text
article account-access.en 9f7b29640233d9c395a65c9905bd4cec340a1483459550338d1c11bc14b66ac2
article account-access.ro cab1683e79fd20cf4cc1186f9e886acaa588b0fd60f989ce61c9e831116b5ec2
article ai-transparency.ro 6ef1353314bad0c456cf12ebc560d749dd5ed4ca477566e9acd51d60e62aea97
article budget-tier-choice.ro cf06b479e61a00510082943d904c7999e2375fba942c6fd2670894e34b20b89a
article debate-topic-and-description.ro 1a07bb0133eca4b8039984945b3f58137f1b6c1d77d74b59b30c37cb2aec2a64
article debate-workspace-menus.ro 722c996850311bc6a607fabd655dd26ed95cfa43dee4ec50ff4cd827ef0ec081
article getting-started-debate.ro 1edec9fe3ae21b3f1f4ea59e6be3e4124be7b5332bf5b29e1e2d31977cd4deca
article guide-how-it-works.ro a74f191c828c1f74bc7b1bb0d031e8c0df3169bad8ca297e2e8b95578bb51b69
article risk-tier-choice.ro 41d65efb7378a56a5727a34c93954134c869d29fa6d51c6b7a378b7d40a2dc82
article support-cases.ro 94112fb709ec5cf8a408106eef2d9efc43e51cfcd74b25cc7d6a41912a054749
article support-status-limits.ro ca0b2c95cbce0f684867a92c6f2551829b89c0c18e83b9c1af921a9f8af3d2be
article unsupported-capabilities.ro 0a9d8dd4ef03ac8d26b5398b5322cb4414fc256d36ca3a5dfe1ea226276dac7f
recovery account-access.en.modelProjection c138d4ed2ecd19847cb74b1fd7ad91eb9b047369cb2a391f15563e0915ec192a
recovery account-access.en.fallback 8d1e8ab2f22c91a590bd7a17b87edd6ffb5a5df3a857655f19da10dcec8c69b5
recovery account-access.ro.modelProjection e3ca804d9cd657ec82e9a9f81fd2dc1299997ee59cc4a752e757cd9e67d6ef98
recovery account-access.ro.fallback 2b0be203cb83ceec39af71240dcdc3368968d920eac715d7fb915e524307c7eb
recovery ai-transparency.ro.modelProjection a6f5d8e5a329c93be4475145866125709c9f7107f13c0949a81bde2bb1a5eaa7
recovery ai-transparency.ro.fallback 5baad9f99b31d6a98769fd580a6ad2982a1d94c94135be804e078e9e127db3b4
recovery budget-tier-choice.ro.modelProjection b593d7c0ed2d166849df568cb76bf3873a04d4fca4604908ccf6cd626d67e892
recovery budget-tier-choice.ro.fallback c32cf5a845ad6fa8d51cef9952430b27c8579ca9f4d42e8dfcb2e1ef58d10690
recovery debate-topic-and-description.ro.modelProjection 0dfb64e716c3c402ff62538e682d8b2ca04edfc45d840a140f20e4120585db32
recovery debate-topic-and-description.ro.fallback 7b8d200c8c31b60c633111556f4957847a0194069c4596be88600383d554cc6c
recovery debate-workspace-menus.ro.modelProjection b9a0bf0de664fcb0b6548121e532e4bcbf27861d68614fef9cbb00563f3f87ec
recovery debate-workspace-menus.ro.fallback 5e558ff25dda284435df41eca3e9de5f6b1f940f95cb0b8a3126801bba415e97
recovery getting-started-debate.ro.modelProjection fb31cb677b335d8d89b6d80e131baafd20f192696e58fe207b9410f7f6ff5e7d
recovery getting-started-debate.ro.fallback 66b838b553bc46d3e0971a143a0dbc619fe82e767b7e5dc6364a9a0347f479f2
recovery guide-how-it-works.ro.modelProjection f431615b47e0d90a1b87b6619bf1447dd727b080b7f847c40e396087a8201ff9
recovery guide-how-it-works.ro.fallback 33acc7c78b50ab0c68f43842aca5c73286ecdf07c8bd4cb357f53c78516e4095
recovery risk-tier-choice.ro.modelProjection 2c826f1a596a76a8f2acf47b0a5b2384f134d6dc9c96c961f976d334ede818c2
recovery risk-tier-choice.ro.fallback 3d938be89e4673f9958381aa1e652ce2ee377d38cb5701c689701391f8774874
recovery support-cases.ro.modelProjection 7c15fafb2b660050163590eadc31e070018bff46b25aa85fc4d3a78203c87551
recovery support-cases.ro.fallback 1d602c803bf564c94ebebff9ddbfc26ee1d1329bd090e73b177597c7ecc09c5b
recovery support-status-limits.ro.modelProjection 2796124487fceac55a1200ef7b64e65898bb9da4a7552dabf940d1892f4c52f0
recovery support-status-limits.ro.fallback f4a18f49bb1010aa86579a2eac64761a0ac85f6fbbe2afeba8495acbe2e084da
recovery unsupported-capabilities.ro.modelProjection ad8e72087a36842e2d6305aae296484fd0410d097ea9c3dcff1a0aeac6fc375c
recovery unsupported-capabilities.ro.fallback facce9231bff468b80ed53aed3efd4526a0d552fd6acb8107f47159925e2a41c
recovery support-status-limits.en.modelProjection 932f33969c279c6e7db4dc9d0d47fee7eb535b0d1cb593f9b9e9ccc743913385
recovery support-status-limits.en.fallback 875854ecea195464759705f8035052bd5389c71a1acc439713326784bb5e2981
component-file e863b4e17b8ed7c1d1b3b4b9b5551b87b818f523aa3c22f181798fbc4aeee99c
~~~
