# Terms 2.4: payment methods and delivery (NETOPIA eligibility) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Terms §12 and the legal notice's payment line name the accepted cards (Visa and Mastercard, no American Express), and Terms §12 gains a delivery sentence for a digital service, released as Terms version 2.4 in all 35 locales.

**Architecture:** The Terms are sealed, versioned drafts (`apps/ui/legal/<locale>/terms-of-service.md`). `pnpm generate:legal` turns them into the UI modules, the manifest (`packages/legal-manifest/src/manifest.json`: version + sha256 per locale) and the byte-for-byte archive (`apps/ui/legal/archive/<locale>/<sha256>.md`). A text change is a new version: version line + chrome (`eyebrow`, `endMarker`) in every locale, `versionAnchor` in the generator, a new row in `TERMS_VERSIONS`, then regenerate. The legal notice line is an ordinary catalogue string (`legal.notice.s04.payments` in `apps/ui/messages/<locale>/legal.json`), not sealed.

**Tech Stack:** Markdown drafts, Node generator (`apps/ui/scripts/generate-legal-data.mjs`), vitest (`tests/unit`, `tests/render`), node:test (`apps/ui/lib/i18n/billing.test.mjs`).

**Spec:** the task brief of 2026-10-22 and section 9 of `DebateAIRO/docs/business/2026-10-19-netopia-testing-plan-and-questions.md` (outside the repo); NETOPIA's list at https://netopia-payments.com/conditii-eligibilitate/ ("Termeni și condiții … modalitățile de plată oferite"; "politică de livrare").

## Global Constraints

- Accepted cards: Visa and Mastercard; American Express is not accepted (NETOPIA, 22 October 2026). Brand names stay in Latin script in every locale: `Visa`, `Mastercard`, `American Express`.
- Delivery: nothing is shipped; paid features are available in the account as soon as the payment is confirmed (true: checkout cannot continue unless "Start my plan now" is ticked, `CheckoutFlow.tsx:319`).
- Terms version 2.3 → **2.4**. Re-acceptance floor stays **2.1** (`reacceptanceFrom` unchanged): the change adds information and reduces no right (Terms §14), so nobody is asked to accept again. Effective date unchanged ("12 October 2026", as the 2.3 release did); counsel sets the launch date at go-live row 24.
- English and Romanian wording first; the other 33 locales are translated only after the owner approves the wording. No merge before the owner's yes; merge as `--merge`, never squash.
- V-29: only texts current at merge are archived. Before the final regenerate, restore `manifest.json` and `apps/ui/legal/archive/` from `origin/dev` so no intermediate draft is archived.
- One heavy command at a time; never the full suite; per-run `TMPDIR` moved to the Trash after each run. No machine paths.

## Review Focus

- A locale translates the brand names (e.g. "Виза", "فيزا") → the every-locale check requires the Latin names (Task 1).
- A locale keeps the old §12 shape (one paragraph fewer) → `legal-locale-check` block-kind parity fails (existing `legal-documents-locale-complete` test).
- The chrome says v2.3 while the body says 2.4 → existing `legal-chrome-version` test.
- An intermediate draft lands in the archive → Task 4 step restoring the archive before the final regenerate; the manifest freshness test then pins it.
- The 2.3 text disappears from /terms/versions → `TERMS_VERSIONS` row for 2.3 + the archive-agree tests in `legal-manifest.test.ts`.

---

### Task 1: Tests that pin the new content and version (red first)

**Files:**
- Create: `tests/unit/legal-terms-payment-delivery.test.ts`
- Modify: `tests/unit/legal-manifest.test.ts:88` (`"2.3"` → `"2.4"`)
- Modify: `tests/unit/legal-documents-data.test.ts:72,77` (`v2.3` → `v2.4`)
- Modify: `tests/render/legal-pages.test.tsx:320` (length 4 → 5)
- Modify: `apps/ui/lib/i18n/billing.test.mjs:338` (notice line also names the three brands)

- [ ] **Step 1:** In the new file, for every locale in `LOCALES`: the text of Terms §12 (between `^## 12\.` and `^## 13\.`) contains `Visa`, `Mastercard`, `American Express` and `NETOPIA Payments`; for `en` and `ro`, it contains the approved sentences verbatim (the payment-methods paragraph and the delivery paragraph); for `en`, the "Taxes, and who you pay" paragraph no longer names NETOPIA (it moved to the payment-methods paragraph).
- [ ] **Step 2:** In `billing.test.mjs`, for every locale `legal.notice.s04.payments` includes `Visa`, `Mastercard` and `American Express`; `en` and `ro` equal the approved sentence.
- [ ] **Step 3:** Run each changed file alone; expect red on the new assertions only.

### Task 2: English and Romanian drafts (owner gate)

**Files:**
- Modify: `apps/ui/legal/en/terms-of-service.md`, `apps/ui/legal/ro/terms-of-service.md` (§12 + version line + chrome)
- Modify: `apps/ui/messages/en/legal.json`, `apps/ui/messages/ro/legal.json` (`legal.notice.s04.payments`)

- [ ] **Step 1:** §12: drop the NETOPIA sentence from "Taxes, and who you pay"; add "**Payment methods.**" and "**Delivery.**" right after it. Version line, `eyebrow`, `endMarker` → 2.4.
- [ ] **Step 2:** Notice line names the cards.
- [ ] **Step 3:** Show the owner the English and Romanian text. **Stop until the owner approves the wording.**
- [ ] **Step 4:** Commit (WIP, not pushed).

### Task 3: The other 33 locales (after the owner's yes)

**Files:** `apps/ui/legal/<locale>/terms-of-service.md` and `apps/ui/messages/<locale>/legal.json` for the 33 locales other than en and ro.

- [ ] **Step 1:** Same three edits per locale (moved NETOPIA sentence, two new labelled paragraphs, version 2.4 in version line + chrome), in each locale's existing register and paragraph-label style; notice line names the cards.
- [ ] **Step 2:** Run `node apps/ui/scripts/legal-locale-check.mjs --locale <code> --document terms` per locale (structure parity with English).
- [ ] **Step 3:** Commit.

### Task 4: Release 2.4 (generator, versions page, regenerate)

**Files:**
- Modify: `apps/ui/scripts/generate-legal-data.mjs:71` (`versionAnchor: "Version 2.4"`; `reacceptanceFrom` stays `"2.1"`)
- Modify: `apps/ui/lib/legal/pages.ts:505` (`TERMS_VERSIONS`: new current row 2.4; 2.3 becomes a past row linking `/terms/versions/0535525218bb7c975ea4f8459bc2011a494efed363bee79d6382805ad5981f6c`, noteKey `legal.archive.meta`)
- Regenerated: `apps/ui/lib/termsOfService.ts`, `apps/ui/lib/legal/<locale>/termsOfService.ts`, `packages/legal-manifest/src/manifest.json`, `apps/ui/legal/archive/<locale>/<new sha256>.md`

- [ ] **Step 1:** `git checkout origin/dev -- packages/legal-manifest/src/manifest.json apps/ui/legal/archive` (V-29), then `pnpm generate:legal`.
- [ ] **Step 2:** Run, one at a time: `tests/unit/legal-terms-payment-delivery.test.ts`, `legal-manifest`, `legal-documents-data`, `legal-documents-locale-complete`, `legal-documents-locale`, `legal-chrome-version`, `legal-reacceptance`, `legal-signup`, `tests/render/legal-pages.test.tsx`, then `billing.test.mjs`; `pnpm typecheck`. All green.
- [ ] **Step 3:** Commit.

### Task 5: Finish

- [ ] Merge the latest `origin/dev`, rerun Task 4 step 2 if legal files moved, push, open the PR to `dev`, Auto-fix on. Merge only on the owner's yes, as `--merge`.
