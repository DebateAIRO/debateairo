# Turn 15 — Legal pages and footer (intake and record)

**Asked (V, 2026-09-29, /goal):** "turn 15 implementation. /heartbeat-orchestrator if necessary.
we need the pages and they will suffer modifications afterwards."

**Source of truth for the design:** `ui_designs/DebateAI Design Document (standalone).html`, TURN 15
— 15a legal page + full footer, 15b in-app one-line footer, 15c mobile footer. Six pages share
one layout (side navigation, numbered text column, full footer).

**Lane:** `.worktrees/legal-pages`, branch `feat/legal-pages`, off `origin/dev` @ `beb3178bc`.
Local only; nothing pushed.

## Rulings taken while building (V may overturn any of them)

- **R1 — no heartbeat fleet.** One vertical UI slice whose mock already exists (V's Turn 15), so
  it was built directly, test-first (Turn 14 precedent). The translation fan-out used one careful
  pass per locale.
- **R2 — `/terms` and `/privacy` render the real documents.** They show the same generated data
  the sign-up modals show (`lib/termsOfService.ts`, `lib/privacyPolicy.ts` and the 34 localized
  editions via `loadLegalDocument`), so page and modal cannot disagree. The mock's shortened text
  is not used. Page section ids are `legal-section-*` so they never collide with the modal's.
  Editing the legal text stays in `apps/ui/legal/**` (another lane, `fix/legal-false-lines`, is
  editing those files now; this lane does not touch them).
- **R3 — facts, not the mock's illustrations.** The mock's cookie table (`de_session`, `de_mfa`,
  analytics cookies…), its five terms versions and its provider bases describe a product that does
  not exist yet. The pages state what the code does, and `tests/render/legal-pages.test.tsx` pins
  each fact to its source:
  - cookies: `__Host-debateai-session`, `__Host-debateai-csrf` (API, 14-day idle Max-Age) and
    `debateai.locale` (language switcher, one year); browser storage: `debateai.consent`,
    `debateai.mode`;
  - providers: one row per model family in `lib/models.ts` (Anthropic, OpenAI, Google, xAI, Qwen);
  - terms versions: only v2.0, the version the terms document carries.
- **R4 — brackets for what nobody has verified.** Following the drafts' convention, unconfirmed
  facts render bracketed: the terms' effective `[date]`, each US provider's transfer mechanism,
  the Qwen hosting region, and the training-exclusion claim ("[publish only once verified for each
  provider]", the privacy policy's own mark).
- **R5 — the US health data page is V's mock text,** with three corrections for truth: "claim or
  challenge" → "question or challenge"; section 4 names the hosting provider too (the mock said
  "No one else", but the host stores the text); section 6 says "From Settings" (there is no
  health-data control under Settings → Privacy).
- **R6 — footers.** The root layout renders the one-line footer (15b) after every page, including
  the debate canvas (the mock labels 15b "Debate canvas, settings, help"). Legal pages and the
  signed-out landing render the full footer (15a), and `app/legal.css` hides the line footer
  wherever a full one is present (`.appShell:has(.siteFooterFull) > .siteFooterLine`). On phones
  the full footer stacks as 15c: brand, legal grid with 44px targets, copyright and language.
- **R7 — the footer's language control is the existing `LanguageSwitcher`,** opening upward. The
  mock shows a flag; V ruled flags out of the switcher (PR #22), so it shows the code only.
- **R8 — "Cookie preferences" reopens the existing card** through `requestPreferences`, the same
  channel Settings → Privacy uses; no second consent surface.

## V's gate before this can merge

1. **Sign the support catalogue.** Adding page routes changes the owner-signed catalogue digest;
   the API refuses to boot until the new digest is signed. Packet:
   `OWNER-SIGNOFF-legal-pages-catalog.md` (six entries, en/ro labels, before/after sha256).
   Answer "signed" (or name the label to change) and the coordinator records it.
2. **Privacy policy §13 says "we set two cookies".** The product sets three (the interface-language
   cookie too). The cookie page states three. The policy text belongs to counsel / the
   `fix/legal-false-lines` lane.
3. **Bracketed facts** (R4) need V/counsel: effective date, transfer mechanism per provider, Qwen
   hosting region, per-provider training exclusion.
4. **The US health data text** is a draft for counsel review (the mock says so too).
5. **Not built:** `/privacy/versions` (named by the privacy policy §14 but not in Turn 15), and the
   policy's full "AI Provider Register" fields (retention, zero-data-retention, verified-on date);
   `/providers` shows the four columns the design draws.

## More for V (found while verifying)

6. **The existing cookie bar and preferences card (consent-UI work) describe cookies the product
   does not set** ("session, MFA state and device record", `de_session · de_mfa · de_device`,
   optional analytics / model-quality telemetry). The new `/cookies` page states what the code
   sets; the bar and card copy should be brought in line (their own mission, not changed here).
7. **The top bar overflows a 375px phone** by ~50px on every non-auth page (measured the same on
   untouched `/ai-transparency`), so legal pages scroll sideways on phones. Pre-existing.
8. **Translations:** all 34 locales translated one locale per careful pass, each aligned to that
   locale's own ToS/Privacy Policy terms, all pass the salad gate. Two consistent choices to know:
   the `[date]` mark is translated on the pages (e.g. ro `[data]`) while the legal documents keep
   `[date]` in English; Japanese names the policy `クッキーポリシー` (as its legal documents do)
   but writes `Cookie` elsewhere (as its consent copy does). No per-locale Opus fluency review has
   run yet (V's standard for a push).

## Record

- **Code:** 6 routes (`app/terms`, `app/terms/versions`, `app/privacy`, `app/privacy/us-health-data`,
  `app/cookies`, `app/providers`), `components/SiteFooter.tsx`, `components/legal/*`,
  `lib/legal/pages.ts` + `pageCatalogs.ts`, `app/legal.css`; layout, TopBar titles and landing
  wired; `legal` namespace registered; 6 support-catalogue capabilities.
- **Tests (2026-09-29):** new `tests/render/legal-pages.test.tsx` (17) and
  `apps/ui/lib/i18n/legal.test.mjs` (5), both green. Render suite: only the 3 files already red on
  `origin/dev` (t1-canvas, t3-library, ui02e). UI node suite 234/234 (baseline 229/229). Both
  typechecks clean. Unit + architecture vs a clean `origin/dev` worktree: the only new reds are the
  support suites that need the catalogue signature (see the sign-off packet, which records the
  local proof); the shipped-file manifest gained exactly the 13 new files.
- **Seen in the browser** (lane dev server, port 4700): all six pages, full footer, one-line
  footer on the library and help screens (help desk resized so the page does not scroll), phone
  15c footer, Arabic right-to-left, dark mode, cookie-preferences button, footer language panel
  opening upward, no horizontal overflow from the new code, no hydration errors. Not seen: the
  debate canvas (needs the API, which cannot boot here until the catalogue is signed); its footer
  fit is CSS-only (`app/legal.css`).

## Legal notice — `/legal` (2026-09-29, V's goal `docs/legal-research/prompts/legal-notice-page.md`)

A seventh page, first in the side navigation and both footers: the company and seller details
required by Romanian Law 365/2002 Art. 5, DSA Arts. 11–12, CRD Art. 6 and Japan's Specified
Commercial Transactions Act Art. 11. Content work on the existing layout; nothing redesigned.

### Rulings taken (V may overturn any of them)

- **R9 — one constant.** Every fact is in `COMPANY` (`lib/legal/pages.ts`); the catalogues carry
  only labels and sentences with placeholders, and a test fails if a `legal.notice.*` string in
  any locale contains a company fact. The footer now reads `COMPANY` too, so its copyright shows
  the legal name "DebateAIRO S.R.L." (it said "DebateAIRO SRL").
- **R10 — brackets render as written; a bracketed address is text, never a link.** Only
  privacy@dezbatere.ro is a mailto link today.
- **R11 — the office is written in the Trade Register form** "[…], București, România" in every
  locale (a postal address, not prose). The city comes from the drafts, not from a register extract.
- **R12 — the two DSA contact points:** authorities (Art. 11) = [dsa@]; users (Art. 12) = the
  Terms' "General contact" [hello@]. Legal, privacy and reports rows follow the Terms' §1 table.
- **R13 — the CUI row uses each edition's own Terms label** ("Sole registration code (CUI)" in
  English), so the page and the Terms name the code the same way in all 35 locales.
- **R14 — complaints:** reports + legal addresses first, then ANPC's SAL service
  (reclamatiisal.anpc.ro) for consumers in Romania, then a link to Terms §18. The EU ODR platform
  (closed 20 July 2025) is not linked; a test pins its absence.
- **R15 — right-to-left safety:** every fact is isolated in `<bdi>` (the language switcher's
  precedent). Without it Arabic showed ".DebateAIRO S.R.L" and "[…/…/J40]".
- **R16 — withdrawal and disputes link to `/terms#legal-section-13` and `#legal-section-18`**;
  a test pins that those numbers are still those sections.

### For V

9. **Bracketed facts to fill in `COMPANY`** (once, for all 35 locales): street address; Trade
   Register number; CUI; VAT status (set `vat` to `registered` + number, or `not-registered`);
   share capital; the person responsible; phone; and confirm hello@, legal@, abuse@, dsa@ exist
   (privacy@ is the only confirmed address). The Japanese statute also expects the representative's
   name and a phone number to be shown; both are brackets today.
10. **Support catalogue digest moved again** (seventh capability `legal-notice`) to `ffd72986…`
    (the six-page `b0180850…` was superseded). Label count 74 → 76. **SIGNED by V 2026-09-29**
    before the push; this also closes gate item 1 above (see the sign-off packet).
11. **`/providers` lists Google (Gemini), which is not wired.** Gemini exists only as a display
    name/colour in `lib/models.ts`, `ModelPresentation.tsx`, `globals.css` and the landing sample
    cards; no backend adapter, register row or deploy config names it (the gateways are generic
    OpenAI-compatible, with makers set per deployment). The row is false under R3. Not removed here:
    R3's provider list is pinned one-to-one to the `lib/models.ts` families, so removing it means
    deciding whether the UI registry keeps Gemini at all — V's call.
12. **Salad gate:** 33 of 34 locales pass on `legal` and `chrome`. `fr/legal` scores 0.13 against a
    0.10 floor (it was 0.09 before this page): the surviving words are correct French that equals
    English — "point de contact" (the DSA's own French term), "service", "section" (the French Terms
    say "section 13"), "questions", "verdict", "protection" and "ANPC". Same family V accepted for
    fr/auth; the French was not bent to pass the gate.
13. **The US health data page still writes privacy@dezbatere.ro inside 35 catalogues**
    (`legal.health.s06.body`), outside `COMPANY`. Not changed here (other page); a `{privacy}`
    placeholder would bring it under R9.
14. **Translations and the fluency review.** 34 locales, one Opus writer per 4–5 locales, each
    told to reuse its own Terms' words; then ONE round of independent Opus fluency review per
    locale, where the reviewer fixed findings in place (ar, ga, ja passed as written; the rest had
    1–6 fixes: calques, wrong prepositions, "users"/"you" switches, Terms-term drift). This is one
    round, not the multi-round loop of the i18n mission. Title choices to know: bg, cs, et, it, lt,
    lv, mt, ru, sk, uk use "company/operator details" style titles (e.g. it "Dati societari", lv
    "Rekvizīti") because their literal "Legal information" equals the footer column heading
    `chrome.legalPages`. **ro keeps V's "Informații legale", which is identical to the ro footer
    heading**, so the ro footer shows that phrase twice — V may prefer "Date de identificare"
    (the reviewer's pick) or renaming the heading. Japanese is 特定商取引法に基づく表記 in the title,
    the tab title, the side navigation and both footers. Reviewer notes left open: de/fr "Person
    responsible" could become the local term ("Vertretungsberechtigte Person", "Directeur de la
    publication") — that changes what the row claims; ru's Terms say "Контактное лицо" (contact
    person) for "point of contact".

### Record (legal notice)

- **Code:** `app/legal/page.tsx`; `LegalNoticeBody` + a shared `LegalSection` in
  `components/legal/LegalBodies.tsx`; `COMPANY`, `isUnverified`, `ANPC_ADR_URL`, the `notice`
  entry in `lib/legal/pages.ts`; footer reads `COMPANY`; TopBar title; four CSS rules in
  `app/legal.css`; `legal-notice` support capability; 42 `legal.notice.*` keys + `chrome.legal.notice`
  × 35 locales.
- **Tests (2026-09-29):** `tests/render/legal-pages.test.tsx` 26/26 (9 new); `legal.test.mjs` and
  the catalog tests green; UI node suite 234/234; both typechecks clean; render suite red only in
  the 3 files already red (t1-canvas, t3-library, ui02e — the same on a clean copy of 6db316c50);
  architecture red only in the 3 pre-existing tests (scaffold F31, role-token-map ×2 — the same on
  the clean copy); support-catalog-coverage and support-response-policy green; the other support
  unit reds are the catalogue signature, as before.
- **Seen in the browser** (lane dev server :4700): en/ro/ja/ar at 1280px and 375px; seven sections;
  bracketed facts as text, privacy@ the only mailto link; Arabic facts in order after `<bdi>`;
  side nav, full footer (4×2 phone grid), one-line footer on `/ai-transparency` all list the page;
  no console errors. The 375px page is 427px wide only because of the pre-existing top bar
  (item 7); the page's own column is 343px.
