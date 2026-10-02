# Owner sign-off — the support catalogue with the nine paid-plan pages (SIGNED 2026-10-02)

**Status: SIGNED by the owner on 2026-10-02.** V read the nine entries below (route, English and Romanian label) in chat
and answered "Signed" to the final fingerprint in the table. The manifest's `catalog` record points at this file. Under
the fallback V chose (P18, P19 and P20 went ahead unsigned), P21's catalogue commit applies the one fingerprint.

**Why a signature is needed:** paid plans Part 2 adds nine pages. The route-coverage test
(`tests/architecture/support-catalog-coverage.test.ts`) requires every page to be a catalogue capability, so the
catalogue's bytes change. The API loads the help corpus at boot with `requireReviewedRecovery: true`
(`apps/api/src/main.ts`); with a fingerprint the owner has not signed, the corpus admits no article and the load
refuses. **Without this signature, the API on this branch does not start.** No agent may sign in V's place.

**V's rulings before signing (2026-10-02):**
- The cancel page: A: the assistant may name it (public, no actions).
- Fingerprints: one, for the final catalogue only (the fallback).
- The articles `app-navigation` (its pricing sentence) and `budget-tier-choice` stay as they are in Part 2: both are
  true while billing is off. They are reworded, and signed again, before billing is switched on.

**What changes in the catalogue (nothing else does):** nine capabilities, appended in this order at the end of
`SUPPORT_CAPABILITIES`, **none with an action** (the assistant can at most name a page, never act through it), each
backed by an existing article pair (no new article text): `account-settings` for the paid-plan pages,
`privacy-consent` for the three versions pages, as for the legal pages. The three card pages (the checkout, its
return page and the card-change page, where xMoney's card form runs) are excluded: the assistant never names them.

| task | id | route | English label | Romanian label | the assistant |
|---|---|---|---|---|---|
| P18 | billing-pricing | /pricing | Plans and prices | Planuri și prețuri | may name it |
| P19 | billing-checkout | /checkout | Subscription card form | Formularul de card pentru abonament | never names it |
| P19 | billing-checkout-return | /checkout/return | Subscription confirmation | Confirmarea abonamentului | never names it |
| P20 | billing-card-change | /settings/card | Change the subscription card | Schimbă cardul abonamentului | never names it |
| P21 | billing-cancel | /cancel | Cancel a subscription by email link | Anulează un abonament prin link pe email | may name it |
| P21 | billing-withdraw | /withdraw | Withdrawal from a subscription | Retragerea din abonament | may name it |
| P21 | legal-privacy-versions | /privacy/versions | Earlier versions of the privacy policy | Versiunile anterioare ale politicii de confidențialitate | may name it |
| P21 | legal-terms-version-text | /terms/versions/[sha256] | One earlier version of the terms | O versiune anterioară a termenilor | may name it |
| P21 | legal-privacy-version-text | /privacy/versions/[sha256] | One earlier version of the privacy policy | O versiune anterioară a politicii de confidențialitate | may name it |

The exact entries, as signed (search terms included), in the order they are appended:

```ts
  capability({
    id: "billing-pricing",
    route: "/pricing",
    labels: labels("Plans and prices", "Planuri și prețuri"),
    audience: "any",
    availability: "public",
    disposition: "action",
    actionIds: [],
    articleIds: ["account-settings"],
    searchTerms: terms(
      ["pricing", "monthly price", "subscription", "Plus", "Pro", "Max"],
      ["prețuri", "preț lunar", "abonament", "Plus", "Pro", "Max"]
    ),
  }),
  capability({
    id: "billing-checkout",
    route: "/checkout",
    labels: labels("Subscription card form", "Formularul de card pentru abonament"),
    audience: "member",
    availability: "excluded",
    disposition: "excluded",
    actionIds: [],
    articleIds: ["account-settings"],
    searchTerms: terms(["card form", "subscribe", "card details"], ["formular de card", "abonare", "datele cardului"]),
  }),
  capability({
    id: "billing-checkout-return",
    route: "/checkout/return",
    labels: labels("Subscription confirmation", "Confirmarea abonamentului"),
    audience: "member",
    availability: "excluded",
    disposition: "excluded",
    actionIds: [],
    articleIds: ["account-settings"],
    searchTerms: terms(
      ["bank check", "card result", "waiting for the bank"],
      ["verificarea băncii", "rezultatul cardului", "așteptarea băncii"]
    ),
  }),
  capability({
    id: "billing-card-change",
    route: "/settings/card",
    labels: labels("Change the subscription card", "Schimbă cardul abonamentului"),
    audience: "member",
    availability: "excluded",
    disposition: "excluded",
    actionIds: [],
    articleIds: ["account-settings"],
    searchTerms: terms(["card change", "update card", "another card"], ["schimbare card", "actualizare card", "alt card"]),
  }),
  capability({
    id: "billing-cancel",
    route: "/cancel",
    labels: labels("Cancel a subscription by email link", "Anulează un abonament prin link pe email"),
    audience: "any",
    availability: "public",
    disposition: "action",
    actionIds: [],
    articleIds: ["account-settings"],
    searchTerms: terms(["cancel", "stop renewal", "end subscription"], ["anulare", "oprire reînnoire", "încheiere abonament"]),
  }),
  capability({
    id: "billing-withdraw",
    route: "/withdraw",
    labels: labels("Withdrawal from a subscription", "Retragerea din abonament"),
    audience: "any",
    availability: "public",
    disposition: "action",
    actionIds: [],
    articleIds: ["account-settings"],
    searchTerms: terms(["withdraw", "right of withdrawal", "14 days"], ["retragere", "dreptul de retragere", "14 zile"]),
  }),
  capability({
    id: "legal-privacy-versions",
    route: "/privacy/versions",
    labels: labels("Earlier versions of the privacy policy", "Versiunile anterioare ale politicii de confidențialitate"),
    audience: "any",
    availability: "public",
    disposition: "action",
    actionIds: [],
    articleIds: ["privacy-consent"],
    searchTerms: terms(
      ["privacy policy versions", "previous privacy policy", "changes to the privacy policy"],
      ["versiuni ale politicii de confidențialitate", "politica de confidențialitate anterioară", "modificări ale politicii de confidențialitate"]
    ),
  }),
  capability({
    id: "legal-terms-version-text",
    route: "/terms/versions/[sha256]",
    labels: labels("One earlier version of the terms", "O versiune anterioară a termenilor"),
    audience: "any",
    availability: "public",
    disposition: "action",
    actionIds: [],
    articleIds: ["privacy-consent"],
    searchTerms: terms(["archived terms", "terms text", "terms version"], ["termeni arhivați", "textul termenilor", "versiune a termenilor"]),
  }),
  capability({
    id: "legal-privacy-version-text",
    route: "/privacy/versions/[sha256]",
    labels: labels("One earlier version of the privacy policy", "O versiune anterioară a politicii de confidențialitate"),
    audience: "any",
    availability: "public",
    disposition: "action",
    actionIds: [],
    articleIds: ["privacy-consent"],
    searchTerms: terms(
      ["archived privacy policy", "privacy policy text", "privacy policy version"],
      ["politica de confidențialitate arhivată", "textul politicii de confidențialitate", "versiune a politicii de confidențialitate"]
    ),
  }),
```

| Record | sha256 |
|---|---|
| The support catalogue before (signed 2026-09-29, the seven legal pages) | `ffd729867aa1ed250d142f1a82aee386f493a56a224193adf387c231da111854` |
| After P18 (1 entry) | not signed (V signed the final catalogue only) |
| After P19 (3 entries) | not signed (V signed the final catalogue only) |
| After P20 (4 entries) | not signed (V signed the final catalogue only) |
| After P21 (9 entries) | `329c5c47cb4509bb5f259b26fe2a128698c8c3f80ed882cfb4e047faa918ae6d` |

The last row is `sha256(SUPPORT_CATALOG_CANONICAL)` from `packages/support-kb/src/catalog.ts` with all nine entries,
measured on 2 October 2026 in a scratch checkout of 3dfcfed44 that was then discarded. With that fingerprint swapped in
there, every `tests/unit/support-*.test.ts`, the injection corpus and the route-coverage test passed (33 files, 2,064
tests), and the boot-time corpus load admitted all 46 entries.

**Who / when:** V (OWNER), 2026-10-02, in session `b06da770-1b32-42dc-a45d-cbc280fccbe5` (the paid-plans session), answering "Signed" to the
message listing the nine entries and the final fingerprint, after P21's page commit 3dfcfed44 and before its catalogue
commit.

## The record each page task applies

`packages/support-kb/reviews/manifest.json` → `catalog`. Under the fallback, P21 writes it once, with the final
fingerprint:

```json
{
  "sha256": "329c5c47cb4509bb5f259b26fe2a128698c8c3f80ed882cfb4e047faa918ae6d",
  "reviewedBy": "OWNER",
  "reviewerSession": "b06da770-1b32-42dc-a45d-cbc280fccbe5 (paid-plans session; the owner read the nine billing-page entries and the catalogue fingerprints in chat and answered 'Signed')",
  "reviewedOn": "2026-10-02",
  "evidence": "docs/missions/paid-plans/OWNER-SIGNOFF-billing-pages-catalog.md",
  "ratifiedBy": "V",
  "ratifiedOn": "2026-10-02"
}
```

Then, in the same commit: `CATALOG_REVIEW` (the six fields after `sha256`) and the expected `sha256` in
`tests/unit/support-recovery-attestation.test.ts`, and `corpus.kbVersion` in `tests/unit/support-context.test.ts`,
recomputed after the record is written (it binds the record).

## Merge with origin/dev (2 October 2026)

Before Part 2's pull request, `origin/dev` brought in PR #62 (cookie compliance). It changed the catalogue too: its
S02 rewrote the existing entries' labels to the labels the screens show, and its S05 named every capability in the 33
locales without their own help texts (a KEY row takes the name of the screen link that opens the page, a TRANSLATE row
is written by hand). The owner signed #62's catalogue on 1 October 2026:
`83e5d6c08d5d23f7b2ec2cf82bd82f0a37e3b808086fd407a3260ac08894bec6`
(`docs/missions/cookie-compliance/OWNER-SIGNOFF-S02-support-kb.md`). #62 added no capability.

The merged catalogue keeps #62's entries byte for byte and appends the nine entries above, which now follow #62's
naming. Five of them are KEY rows, so their English and Romanian labels became their links' own text:

| id | route | English label (was) | Romanian label | the link |
|---|---|---|---|---|
| billing-pricing | /pricing | Pricing (Plans and prices) | Prețuri | the footer's `chrome.footer.pricing` |
| billing-card-change | /settings/card | Update card (Change the subscription card) | Actualizați cardul | Settings' `billing.subscription.updateCard` |
| billing-cancel | /cancel | Cancel a plan (Cancel a subscription by email link) | Anularea unui abonament | the footer's `chrome.footer.cancel` |
| billing-withdraw | /withdraw | Withdraw from a plan (Withdrawal from a subscription) | Retragerea dintr-un abonament | the footer's `chrome.footer.withdraw` |
| legal-privacy-versions | /privacy/versions | All versions of this policy (Earlier versions of the privacy policy) | Toate versiunile acestei politici | /privacy's `legal.privacyVersions.link` |

The other four (`billing-checkout`, `billing-checkout-return`, `legal-terms-version-text`,
`legal-privacy-version-text`) are TRANSLATE rows: their labels are unchanged, and their names in the 33 locales are
written by hand in `packages/support-kb/src/capability-names.ts` (a native check is go-live row 36). No search term,
audience, availability, disposition, action or article changed.

| Record | sha256 |
|---|---|
| #62's catalogue (signed 2026-10-01) | `83e5d6c08d5d23f7b2ec2cf82bd82f0a37e3b808086fd407a3260ac08894bec6` |
| The merged catalogue (signed 2026-10-02) | `55133fc55bf08f45d0cb674c8e89416ae749249eaef4291e985af82a270bb52a` |

With the merged fingerprint in place, every `tests/unit/support-*.test.ts`, the injection corpus and the
route-coverage test pass (37 files, 2,106 tests), and the boot-time corpus load admits all 46 entries.

**Who / when:** V (OWNER), 2026-10-02, in session `b06da770-1b32-42dc-a45d-cbc280fccbe5` (the paid-plans session),
answering "signed" to the message listing the nine entries and the merged fingerprint, before Part 2's pull request.
The manifest's `catalog` record now carries the merged fingerprint and this signature.

