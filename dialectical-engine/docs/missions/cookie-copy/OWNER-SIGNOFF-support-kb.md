# Owner sign-off: the help chat's cookie article (privacy-consent, en and ro)

Session: 2a26c595-52ab-425b-a334-89327d58f125 (Claude Code desktop, cookie-copy session; the owner answered the help-article question on 2026-11-18)
Date: 2026-11-18

## The question and the owner's answer

Asked in the session, as a question card:

> The help chat's knowledge-base article on cookies (privacy-consent, English and Romanian) still says "DebateAI keeps four cookies and four items in your browser's storage". It was owner-signed on 2026-10-01, and the API won't boot with a changed article unless the owner signs the new text. Proposed new text: "Dialectical Engine keeps 13 cookies and 8 items in your browser's storage, each needed for the service to work…", with the rest unchanged plus "the cookie notice will also show again". Do you sign off on updating it?

The owner's answer, word for word:

> update the knowledge base of the support chat in all languages

The knowledge base holds this article in English and Romanian only; every other language is answered from the English corpus (packages/support-kb/src/context.ts, the corpus a locale is answered from). "All languages" is therefore the two articles below, with their recovery texts.

## Why

The article said four cookies and four storage items, and named the product DebateAI. The inventory of record (apps/ui/lib/legal/pages.ts, LEGAL_COOKIES and LEGAL_BROWSER_STORAGE; tests/unit/cookie-inventory-drift.test.ts) holds 13 cookies and 8 browser-storage items, and the cookie notice, the What we store card, /cookies and Privacy Policy §13 say so in every language. Refusing cookies and site data also brings the cookie notice back, as /cookies and §13 now say.

## The signed bytes

### packages/support-kb/content/privacy-consent.en.md

sha256 4b7a40ee59a03bfb6aed19b3a959b4db8048d75aec19d3f3908f5e8ef0eea885

```markdown
---
id: privacy-consent
lang: en
title: "What Dialectical Engine stores in your browser"
status: shipped
sources:
  - apps/ui/messages/en/consent.json:8
  - apps/ui/messages/en/consent.json:14
  - apps/ui/messages/en/legal.json:75
  - apps/ui/messages/en/legal.json:110
  - apps/ui/messages/en/legal.json:111
  - apps/ui/messages/en/chrome.json:60
  - apps/ui/messages/en/consent.json:2
  - apps/ui/components/consent/CookieBar.tsx:61
  - apps/ui/components/SiteFooter.tsx:49
  - apps/ui/components/consent/ConsentSettingsPanel.tsx:38
  - apps/ui/components/support/Assistant.tsx:864
  - apps/ui/app/cookies/page.tsx:8
  - apps/ui/app/privacy/page.tsx:9
  - apps/ui/app/terms/page.tsx:9
  - apps/ui/app/legal/page.tsx:9
verified_against: "2b42a8db6"
ratified_by: ""
ratified_on: ""
---

Dialectical Engine keeps 13 cookies and 8 items in your browser's storage, each needed for the service to work. Nothing is optional, and nothing is shared with anyone else. We set no analytics, advertising or tracking cookies. The full list, with how long each item is kept, is on the Cookies page at `/cookies` and in the What we store card. The card opens from the cookie notice, from the Cookies we store control in the site footer, from Settings, then Privacy, for signed-in users at `/settings#consent-privacy-heading`, and from the Cookies we store shortcut in the Help panel. `/privacy`, `/terms`, `/cookies` and `/legal` are pages of this site. There is no switch to turn any of these items off. To refuse them, block or delete cookies and site data for this site in your browser settings; signing in and the remembering of your language and display choices then stop working, and the cookie notice shows again.
```

### recovery/components.json, privacy-consent.en

modelProjection sha256 152d4326ff7a99043e38bdacbdc74c63ab3d04179a75f59f751e5eadaf51d9d0

> Dialectical Engine keeps 13 cookies and 8 items in the browser's storage, each needed for the service to work; nothing is optional and nothing is shared with anyone else. We set no analytics, advertising or tracking cookies. The full list, with how long each item is kept, is on the Cookies page and in the What we store card, which opens from the cookie notice, from the Cookies we store control in the site footer, from Settings, then Privacy, for signed-in users, and from the Cookies we store shortcut in the Help panel. The Privacy policy, Terms of service, Cookies and Legal notice pages are pages of this site. There is no switch: to refuse these items, block or delete cookies and site data for this site in the browser settings; signing in and the remembering of language and display choices then stop working, and the cookie notice shows again.

fallback sha256 c629bac06d9aa1472debd1ee0b442f2c7bb71f07872fd79ce2e27bd2f8c71f91

> Dialectical Engine keeps 13 cookies and 8 browser storage items, all needed for the service to work; none is optional and none is shared. We set no analytics, advertising or tracking cookies. See the full list on the Cookies page or in the What we store card, which opens from the cookie notice, the site footer, Settings then Privacy after sign in, or the Help panel. There is no switch: to refuse, block or delete cookies and site data in the browser settings; signing in and the remembered language and display choices then stop working, and the cookie notice shows again.

### packages/support-kb/content/privacy-consent.ro.md

sha256 e56f0e678f2d1d55b04d2d8f7a1e51849212009db8f634c9d465e52018a97127

```markdown
---
id: privacy-consent
lang: ro
title: "Ce stochează Dialectical Engine în browserul tău"
status: shipped
sources:
  - apps/ui/messages/ro/consent.json:8
  - apps/ui/messages/ro/consent.json:14
  - apps/ui/messages/ro/legal.json:75
  - apps/ui/messages/ro/legal.json:110
  - apps/ui/messages/ro/legal.json:111
  - apps/ui/messages/ro/chrome.json:60
  - apps/ui/messages/ro/consent.json:2
  - apps/ui/components/consent/CookieBar.tsx:61
  - apps/ui/components/SiteFooter.tsx:49
  - apps/ui/components/consent/ConsentSettingsPanel.tsx:38
  - apps/ui/components/support/Assistant.tsx:864
  - apps/ui/app/cookies/page.tsx:8
  - apps/ui/app/privacy/page.tsx:9
  - apps/ui/app/terms/page.tsx:9
  - apps/ui/app/legal/page.tsx:9
verified_against: "2b42a8db6"
ratified_by: ""
ratified_on: ""
---

Dialectical Engine păstrează 13 module cookie și 8 elemente în spațiul de stocare al browserului tău, fiecare necesar pentru funcționarea serviciului. Nimic nu este opțional și nimic nu este partajat cu altcineva. Nu setăm cookie-uri analitice, publicitare sau de urmărire. Lista completă, cu durata de păstrare a fiecărui element, se află pe pagina „Cookie-uri” la `/cookies` și în cardul „Ce stocăm”. Cardul se deschide din notificarea privind modulele cookie, din controlul „Modulele cookie pe care le stocăm” din subsolul site-ului, din „Setări”, apoi „Confidențialitate”, pentru utilizatorii autentificați, la `/settings#consent-privacy-heading`, și din scurtătura „Modulele cookie pe care le stocăm” din panoul „Ajutor”. `/privacy`, `/terms`, `/cookies` și `/legal` sunt pagini ale acestui site. Nu există niciun comutator pentru dezactivarea acestor elemente. Ca să le refuzi, blochează sau șterge modulele cookie și datele site-ului pentru acest site din setările browserului tău; atunci autentificarea și memorarea limbii și a opțiunilor de afișare nu mai funcționează, iar notificarea privind modulele cookie apare din nou.
```

### recovery/components.json, privacy-consent.ro

modelProjection sha256 71a638afab059c57c52ea80e3a0dac381daac063dd0039c425ff434bd0f2cc33

> Dialectical Engine păstrează 13 module cookie și 8 elemente în spațiul de stocare al browserului, fiecare necesar pentru funcționarea serviciului; nimic nu este opțional și nimic nu este partajat cu altcineva. Nu setăm cookie-uri analitice, publicitare sau de urmărire. Lista completă, cu durata de păstrare a fiecărui element, se află pe pagina „Cookie-uri” și în cardul „Ce stocăm”, care se deschide din notificarea privind modulele cookie, din controlul „Modulele cookie pe care le stocăm” din subsolul site-ului, din „Setări”, apoi „Confidențialitate”, pentru utilizatorii autentificați, și din scurtătura „Modulele cookie pe care le stocăm” din panoul „Ajutor”. Paginile „Politica de confidențialitate”, „Termenii serviciului”, „Cookie-uri” și „Informații legale” sunt pagini ale acestui site. Nu există niciun comutator: ca să refuzi aceste elemente, blochează sau șterge modulele cookie și datele site-ului pentru acest site din setările browserului; atunci autentificarea și memorarea limbii și a opțiunilor de afișare nu mai funcționează, iar notificarea privind modulele cookie apare din nou.

fallback sha256 7b510da9840b2dbc9161ea095ccd4a0bd9d2cc7c2a68477084aec18f6708c2d3

> Dialectical Engine păstrează 13 module cookie și 8 elemente de stocare în browser, toate necesare pentru funcționarea serviciului; niciunul nu este opțional și niciunul nu este partajat. Nu setăm cookie-uri analitice, publicitare sau de urmărire. Lista completă este pe pagina „Cookie-uri” sau în cardul „Ce stocăm”, care se deschide din notificarea privind modulele cookie, din subsolul site-ului, din „Setări”, apoi „Confidențialitate” după autentificare, sau din panoul „Ajutor”. Nu există niciun comutator: ca să refuzi, blochează sau șterge modulele cookie și datele site-ului din setările browserului; atunci autentificarea și memorarea limbii și a opțiunilor de afișare nu mai funcționează, iar notificarea privind modulele cookie apare din nou.

