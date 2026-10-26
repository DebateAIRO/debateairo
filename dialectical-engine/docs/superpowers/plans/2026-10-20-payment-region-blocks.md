# Payment Region Blocks Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refuse payment (never sign-up) for buyers whose billing address is in a closed region (a Canadian province, a US state, or an EU territory outside EU VAT), with a plain sentence in 35 languages. Opening a region is a new register version.

**Architecture:** A pure geography module in `@debateai/kernel` turns a billing address (country + postal code + typed region) into region ids, or "postal code doesn't fit". The sealed `countryPolicy` row gains an optional `regions` member saying which ids are closed. One API function, `decidePaymentRegion`, applies the two at the quote, checkout start and upgrade, beside today's country check. The website maps the two new refusal codes to two new sentences.

**Tech Stack:** TypeScript (ESM), zod, Fastify, Next.js, vitest, pnpm workspace (`dialectical-engine/`).

**Spec:** `dialectical-engine/docs/superpowers/specs/2026-10-20-payment-region-blocks-design.md` (approved by the owner on 2026-10-20). Read it first: it carries the why, the anti-goals and the designer's calls.

## Global Constraints

- **Region ids (closed list, used everywhere):**
  - US: `US-<state>` for all 50 states plus DC, e.g. `US-MD`, `US-DC`.
  - Canada: `CA-<code>` for AB, BC, MB, NB, NL, NS, ON, PE, QC, SK, YT, plus one id **`CA-NT-NU`** (postal letter `X` is shared by the Northwest Territories and Nunavut).
  - `ES-CN` Canary Islands, `ES-CE` Ceuta, `ES-ML` Melilla.
  - `FR-971` Guadeloupe (also Saint-Martin and Saint-Barthélemy written as FR), `FR-972` Martinique, `FR-973` French Guiana, `FR-974` Réunion, `FR-976` Mayotte.
  - `FI-01` Åland, `GR-69` Mount Athos.
  - `IT-LIVIGNO`, `IT-CAMPIONE`.
  - `DE-HELGOLAND`, `DE-BUESINGEN`.
- **Closed at launch (the owner's list):**
  - all buyers: `CA-SK`, `CA-MB`, `US-DC`, `US-HI`, `US-MD`, `US-RI`, `US-VT`, `US-WV`, `US-NJ`, and every `ES-`, `FR-`, `FI-`, `GR-`, `IT-` and `DE-` id above;
  - business buyers only: `US-OH`.
- **A region rule's shape:** `{ "pay": false, "reason": "TAX_NOT_READY" }`, plus `"buyers": "business"` for `US-OH`. Sign-up is never affected.
- **New refusal codes:**
  - `REGION_PAYMENT_UNAVAILABLE`, HTTP **403**;
  - `BILLING_POSTCODE_INVALID`, HTTP **422**.
- **Exact English sentences:**
  - `billing.checkout.regionUnavailable` = "Paid plans aren't available in your region yet. You can keep using the Free plan."
  - `billing.checkout.postalCodeInvalid` = "Please check your postal code."
- **Audit line:** event `billing.region.refused` with `{ code, country, region }`. Never the postal code, the address or the typed region.
- **Not to be done:**
  - no database migration;
  - no reading of `identity.registration_region`;
  - no change to `us_states` (sign-up, Tennessee) or `countries`;
  - no change to the card change (`card-change.ts`) or to renewals.
- **Machine safety (the owner's rules):**
  - One heavy command at a time (integration suites, typecheck, whole-folder vitest).
  - Never run the full suite; every vitest command names its files, and the script refuses an empty list.
  - Run vitest under its own `TMPDIR` inside the user temp dir, then move that folder to `~/.Trash/`.
  - The tool shell is zsh. Use `pgrep -f 'vitest[ ]run'`, never `ps | grep`.
  - No machine-specific paths in code.
- **Commits** end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. **The pricing page's first quote has no address.** It must not be refused and must not ask for a postal code. The region check runs only when a postal code or a typed region is present; checkout start then enforces it on the full address (Task 3).
2. **A Canadian code typed lower-case with a space** (`s4p 3y2`) is Saskatchewan and refused. A US ZIP+4 (`21201-1234`) is Maryland and refused (Task 1).
3. **A US ZIP that lost its leading zero** (`2903` for Rhode Island) or any short or long code gets `BILLING_POSTCODE_INVALID`, so the buyer is asked to fix it, never allowed through (Tasks 1, 3).
4. **The typed region matches only by exact code or full name.**
   - "Saskatchewan" typed with an Alberta postcode is refused, because either signal refuses.
   - "Indiana", "Maine St" and "Hawaiian Gardens" must NOT match HI, ME or IA (Task 1).
5. **The places the rule must not touch:**
   - An Ohio consumer can pay; an Ohio company is refused.
   - A Romanian, German-mainland or Irish buyer (Ireland: postcode optional) is unaffected.
   - An upgrade by a subscriber whose stored address is in a closed region is refused (Task 3).

---

### Task 1: Region geography (`@debateai/kernel`)

**Files:**
- Create: `packages/kernel/src/payment-regions.ts`
- Modify: `packages/kernel/src/index.ts` (export the module)
- Test: `tests/unit/payment-regions.test.ts`

**Interfaces:**
- Produces:
  - `PAYMENT_REGION_IDS: readonly string[]`, the closed list from Global Constraints, sorted.
  - `type PaymentRegionId = string` (a member of that list).
  - `POSTCODE_CHECKED_COUNTRIES: ReadonlySet<string>` = `US, CA, ES, FR, FI, GR, IT, DE`.
  - `paymentRegionsOf(address: Readonly<{ country: string; postalCode: string | null; region: string | null }>): Readonly<{ kind: "POSTCODE_INVALID"; regions: readonly PaymentRegionId[] } | { kind: "REGIONS"; regions: readonly PaymentRegionId[] }>`
    - `REGIONS` holds every region either signal names, de-duplicated (empty for a mainland address).
    - `POSTCODE_INVALID` is returned when the country is in `POSTCODE_CHECKED_COUNTRIES`, a postal code is present, and it doesn't fit after normalisation. Its `regions` are the ones the **typed region** names, so a closed region can still refuse (preflight ruling R1).

- [ ] **Step 1: Write the failing tests** in `tests/unit/payment-regions.test.ts`:
  - **Normalisation:** upper-case; spaces and dashes removed; a leading country prefix `F`, `E`, `D`, `I`, `GR`, `AX` or `FI` followed by `-` is stripped.
  - **Formats:**
    - US: 5 digits or ZIP+4.
    - CA: `A9A9A9`.
    - ES, FR, FI, GR, IT, DE: 5 digits.
    - Anything else in those countries → `POSTCODE_INVALID`, e.g. `2903`, `123456`, `S4P3Y`.
    - Every other country is never `POSTCODE_INVALID`, e.g. IE with no code, RO `010011`, GB-style text.
  - **Canada:** each of the 18 first letters maps to its id. `S`→`CA-SK`, `R`→`CA-MB`, `X`→`CA-NT-NU`; the letters D, F, I, O, Q, U, W and Z are invalid as first letters → `POSTCODE_INVALID`.
  - **US:** for each of the 8 owner-listed states (DC, HI, MD, RI, VT, WV, NJ, OH), the first and last ZIP3 of every range maps to the state, and the ZIP3 just outside each range does not.
  - **EU:**
    - `35001`, `38001` → `ES-CN`; `51001` → `ES-CE`; `52001` → `ES-ML`; `28001` → no region.
    - `97100`, `97200`, `97300`, `97400`, `97600` → `FR-971`…`FR-976`; `75001` and `97500` → no region.
    - `22100` → `FI-01`.
    - `63086` → `GR-69`.
    - `23041` → `IT-LIVIGNO`; `22061` → `IT-CAMPIONE`.
    - `27498` → `DE-HELGOLAND`; `78266` → `DE-BUESINGEN`.
  - **Typed region (US and CA only):**
    - exact code or full English name, plus the French names `Québec`, `Colombie-Britannique`, `Nouvelle-Écosse`, `Nouveau-Brunswick`, `Terre-Neuve-et-Labrador`, `Île-du-Prince-Édouard`, `Territoires du Nord-Ouest`;
    - case- and accent-insensitive, trimmed;
    - `Saskatchewan`/`sk` → `CA-SK`; `maryland`/`MD` → `US-MD`;
    - `Indiana`, `Maine St`, `Hawaiian Gardens`, `Washington DC area` → no region (no substrings).
  - **Both signals:** `{CA, T5J0N3, "Saskatchewan"}` → regions contain `CA-SK` and `CA-AB`.
  - **Bad postal code, closed typed region:** `{US, 2903, "Rhode Island"}` → `POSTCODE_INVALID` with regions `[US-RI]`.
  - **Closed-list sanity:** every id the mapping can return is in `PAYMENT_REGION_IDS`, and the list has 51 US + 12 CA + 14 EU-territory ids = **77**.

- [ ] **Step 2: Run the test, expect FAIL** (module missing): `node_modules/.bin/vitest run tests/unit/payment-regions.test.ts`

- [ ] **Step 3: Implement `packages/kernel/src/payment-regions.ts`.**
  - The ZIP3 → state table covers all states plus DC. Build it from the USPS three-digit ZIP prefix matrix (USPS "L002"), or from the Census ZCTA relationship file if USPS can't be read. Put the source URL and the date read in the file header.
  - The Greek, Italian and German special-territory postcodes: confirm each against an official postal source and record it in a comment. If one cannot be confirmed, keep the spec's value and say UNVERIFIED in the comment.
  - Canadian first letters per Canada Post: A NL, B NS, C PE, E NB, G/H/J QC, K/L/M/N/P ON, R MB, S SK, T AB, V BC, X NT/NU, Y YT.
  - The table is data plus one lookup function, with no I/O.

- [ ] **Step 4: Run the test, expect PASS.** Also run `pnpm exec tsc -p packages/kernel --noEmit` (or the package's typecheck script) on its own.

- [ ] **Step 5: Commit:** `feat(kernel): payment region geography from the billing address (postal code, typed region)`

---

### Task 2: The `regions` member of `countryPolicy`, the launch list, and its docs

**Files:**
- Modify: `packages/register/src/country-policy.ts`
- Modify: `packages/register/src/index.ts` (exports)
- Modify: `deploy/vps/register/country-policy.example.json`
- Modify: `deploy/vps/register/README.md` (the `countryPolicy` member table: the new member)
- Modify: `deploy/vps/README.md` §14.6 "Switching a country's payments on": how to open a region
- Test: `tests/unit/country-policy.test.ts` (extend)

**Interfaces:**
- Consumes: `PAYMENT_REGION_IDS`, `PaymentRegionId` (Task 1).
- Produces:
  - `type RegionRule = Readonly<{ pay: boolean; reason: CountryReason; buyers: "all" | "business" }>`
  - `CountryPolicy.regions: Readonly<Record<PaymentRegionId, RegionRule>>` (empty when the member is absent)
  - `regionRule(policy: CountryPolicy, region: PaymentRegionId): RegionRule | null`

- [ ] **Step 1: Write the failing tests** (extend `tests/unit/country-policy.test.ts`):
  - A value with `regions` parses.
  - An unknown id → `COUNTRY_POLICY_INVALID`.
  - A rule with `blocked`, or with `signup` → invalid. Region rules carry neither, because sign-up is never region-gated.
  - `buyers` other than `"business"` → invalid. Absent means all buyers.
  - A value without `regions` still parses, with `regions` equal to `{}`. This is the old sealed versions' shape: they must keep parsing.
  - `COUNTRY_POLICY_DEPLOYMENT_REGISTER_ROW.value.regions` equals exactly the launch list in Global Constraints.
  - `deploy/vps/register/country-policy.example.json` parses, and its `regions` equals the code row's.

- [ ] **Step 2: Run, expect FAIL:** `node_modules/.bin/vitest run tests/unit/country-policy.test.ts`

- [ ] **Step 3: Implement.**
  - Add the strict zod member `regions: z.record(regionIdSchema, regionRuleSchema).optional()`.
  - Map it to `CountryPolicy.regions` with `buyers` defaulted to `"all"`, and add `regionRule`.
  - Add the launch list to the code row and to the example file, with a comment: the owner's decision of 20 October 2026; the research is in the spec.
  - Update the two READMEs, in plain words: what the member does, and how to open a region (publish a version without its entry).

- [ ] **Step 4: Run, expect PASS.** Then run, one at a time, the other unit tests that parse or pin this row:
  - `tests/unit/country-gate.test.ts`
  - `tests/unit/country-gate-service.test.ts`
  - `tests/unit/hosted-register-publish.test.ts`
  - `tests/unit/registration-region-api.test.ts`
  - `tests/unit/payments-netopia-tables.test.ts`
  - `tests/architecture/vps-billing-runbook.test.ts`

  Update only pins that name the row's value, and say which ones in the commit message. Then run `tests/integration/hosted-register-publish.test.ts` on its own (heavy).

- [ ] **Step 5: Commit:** `feat(register): countryPolicy.regions closes payment by region; the owner's launch list (2026-10-20)`

---

### Task 3: Enforcement at the quote, checkout start and upgrade

**Files:**
- Modify: `apps/api/src/billing/place.ts` (new function)
- Modify: `apps/api/src/billing/refusal.ts` (two codes)
- Modify: `apps/api/src/billing/quote.ts` (`QuoteService.create`)
- Modify: `apps/api/src/billing/checkout.ts` (`CheckoutService.start`)
- Modify: `apps/api/src/billing/upgrade.ts` (`gateCardAction`)
- Test: `tests/unit/billing-payment-region.test.ts` (new)
- Test: extend `tests/unit/billing-quote-route.test.ts`, and the existing unit tests of checkout start and the upgrade quote (find them with `grep -l "gateCardAction\|CheckoutService" tests/unit`)

**Interfaces:**
- Consumes: `paymentRegionsOf` (Task 1); `regionRule`, `CountryPolicy` (Task 2).
- Produces: `decidePaymentRegion(input: Readonly<{ policy: CountryPolicy; location: Readonly<{ country: string; postalCode: string | null; region: string | null; company: unknown | null }>; postcodeMustFit: boolean }>): Readonly<{ kind: "ALLOW" } | { kind: "REFUSE"; code: "REGION_PAYMENT_UNAVAILABLE"; region: PaymentRegionId } | { kind: "POSTCODE_INVALID" }>`
  - A region refuses when its rule has `pay: false` and either `buyers` is `"all"` or `location.company !== null`.
  - The order (preflight ruling R1):
    1. Any refusing region among the geography's `regions` → `REFUSE`, even when the postal code doesn't fit.
    2. Else a `POSTCODE_INVALID` answer → `POSTCODE_INVALID` when `postcodeMustFit` is true.
    3. Else `ALLOW`.
- Produces: `regionRefusal(decision, country, audit): BillingRefusal`. It writes one `billing.region.refused` audit line and returns `BillingRefusal(403, "REGION_PAYMENT_UNAVAILABLE")`.

- [ ] **Step 1: Write the failing tests:**
  - `decidePaymentRegion`:
    - `CA S4P3Y2` → REFUSE `CA-SK`.
    - `US 43004` consumer → ALLOW; with a company → REFUSE `US-OH`.
    - `US 2903` with `postcodeMustFit: true` → `POSTCODE_INVALID`; with `false` → ALLOW.
    - `US 2903` + typed `Rhode Island` → REFUSE `US-RI`, with either `postcodeMustFit` value.
    - `RO 010011` → ALLOW.
    - A policy without `regions` → ALLOW for every case.
  - **Quote route:**
    - A `CA S4P 3Y2` quote → 403 `REGION_PAYMENT_UNAVAILABLE`, and the tax engine is never called.
    - The first quote with no postal code and no region → not refused by the region check.
    - `US 2903` → 422 `BILLING_POSTCODE_INVALID`.
  - **Checkout start:** a stored quote whose location is in `US-MD` → 403, and no charge or subscription is written.
  - **Upgrade quote:** a stored location in `ES-CN` → 403.
  - **Audit:** the line holds `code`, `country` and `region` only.

- [ ] **Step 2: Run, expect FAIL.**

- [ ] **Step 3: Implement.** Wire it in at these points:
  - **Quote:** right after the country check. Run only when `input.postalCode !== null || input.region !== null`, with `postcodeMustFit: true`.
  - **Checkout start:** after the country check, on the stored `location`, with `postcodeMustFit: true`.
  - **Upgrade** (`gateCardAction`): on `context.location`, with `postcodeMustFit: false`, so an existing subscriber is never told to fix an old postcode.

  `POSTCODE_INVALID` → `BillingRefusal(422, "BILLING_POSTCODE_INVALID")`. Add the two codes to `BillingRefusalCode` with one-line doc comments.

- [ ] **Step 4: Run, expect PASS**, one file at a time. Then run `tests/integration/billing-quote.test.ts` on its own (heavy).

- [ ] **Step 5: Commit:** `feat(billing): refuse payment in a closed region at the quote, checkout start and upgrade`

---

### Task 4: The website's two sentences, in 35 languages

**Files:**
- Modify: `apps/ui/lib/billing/checkoutFailure.ts`
- Modify: `apps/ui/messages/<locale>/billing.json` for all 35 locales
- Test: extend the existing unit test of `checkoutFailureKey` (find it with `grep -rl checkoutFailureKey tests`), and the locale-completeness check that covers `billing.json` (find how `billing.checkout.countryUnavailable` is checked across locales; if no such check exists, add `tests/unit/billing-region-copy.test.ts` asserting both keys exist and are non-empty in every locale folder)

**Interfaces:**
- Consumes: the two codes (Task 3).

- [ ] **Step 1: Write the failing tests:**
  - `checkoutFailureKey` maps `REGION_PAYMENT_UNAVAILABLE` → `billing.checkout.regionUnavailable` and `BILLING_POSTCODE_INVALID` → `billing.checkout.postalCodeInvalid`.
  - Both keys exist in all 35 locales.
  - The English values equal the Global Constraints sentences exactly.

- [ ] **Step 2: Run, expect FAIL.**

- [ ] **Step 3: Implement.**
  - Add the mapping, and the English sentences to `en/billing.json`.
  - Translate into the other 34 locales: **3–4 parallel `haiku` sub-agents split by language group, then one `opus` spot-check** of mt, ga, et, lv, lt, ar, he, hi, ja, zh, ko, and formal Romanian.
  - Keep each locale's established tone and terms: reuse that locale's existing words for "paid plans", "Free plan" and "postal code" from the same file.

- [ ] **Step 4: Run, expect PASS.** Then render-test the checkout if a render test of `CheckoutFlow` exists (find it with `grep -rl CheckoutFlow tests/render`).

- [ ] **Step 5: Commit:** `feat(ui): the region and postal-code sentences in 35 languages`
