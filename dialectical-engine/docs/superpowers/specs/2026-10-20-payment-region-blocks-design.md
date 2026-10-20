# Payment region blocks: design

Date: 20 October 2026. Owner: V (stefan.nour@dezbatere.ro). Status: draft for the owner's approval.

## 1. Intent

The site must never take a payment at 0% tax in a place where the company would owe tax from the first sale, or in
a place the owner chose to keep closed until the company registers there. Today the site can only switch payment off
for a whole **country**. Several places that must be closed are **parts** of countries that stay open: a Canadian
province, a US state, an EU island or enclave.

Research behind the list (20 October 2026, eight passes, official sources where readable) is the owner's note
`DebateAIRO/docs/business/2026-10-20-launch-country-tax-rules.md` (outside this repository). In short:
- Saskatchewan taxes SaaS from the first sale for sellers outside the province (bulletin PST-5).
- Manitoba probably does too for us (bulletin RST 004 / notice RST 24-01 exclude businesses whose out-of-province
  suppliers do not collect RST).
- The EU islands and enclaves outside the EU VAT area are not covered by the One-Stop Shop, and their own rules are
  unclear.
- Seven US states that tax SaaS still use a "200 sales a year" limit. Monthly billing reaches it at about 17
  subscribers in one state.

## 2. The owner's decisions (20 October 2026)

1. Close payment in these places at launch, for every buyer unless a line below says otherwise:
   - **Canada:** Saskatchewan, Manitoba.
   - **US:** District of Columbia, Hawaii, Maryland, Rhode Island, Vermont, West Virginia, New Jersey; **Ohio for
     business buyers only** (Ohio taxes SaaS only when it is bought for business use).
   - **EU territories outside the EU VAT area:**
     - Spain: Canary Islands, Ceuta, Melilla.
     - France: the overseas departments Guadeloupe, Martinique, French Guiana, Réunion, Mayotte.
     - Finland: Åland.
     - Greece: Mount Athos.
     - Italy: Livigno, Campione d'Italia.
     - Germany: Heligoland, Büsingen.
2. The owner opens each place when the company registers there.
3. The United Kingdom stays closed as today (country level, unchanged).

## 3. Goals

- G1. A buyer in a closed place cannot pay: not at the quote, not at checkout start, not through an upgrade.
- G2. The buyer learns it right after entering the billing address, before any card page, in plain words in their
  own language: **"Paid plans aren't available in your region yet. You can keep using the Free plan."**
- G3. Opening (or closing) a place is a settings change the owner publishes as a new register version, with no code
  release.
- G4. Each refusal leaves one content-free audit line: the code, the country, the region id, never the address.

## 4. Non-goals

- Sign-up is not affected: people in closed places can still create an account and use Free.
- No tax calculation changes and no tax registration automation.
- No change for subscriptions that already exist (there are none at launch). If a place is closed later, its
  existing subscribers keep renewing, and the owner decides case by case. *(Designer's call.)*
- No change to the country-level switches (`countries`) or to the sign-up state rule (`us_states`, Tennessee).

## 5. Anti-goals (a failure even if it "works")

- A buyer from an **open** place refused because of a loose match (e.g. "MD" found inside a street name, or a
  postcode prefix that is too short).
- A buyer from a **closed** place charged because they typed the region differently ("Sask.", "Québec" spelled
  oddly, a lower-case postcode).
- The owner needing a code release to open a place.

## 6. How the site knows where the buyer is

The server decides; the website only shows the result.

**Postal code is the main signal.** It is already required at checkout for these countries. It is normalised:
upper case, spaces and dashes removed. The mapping (geography) lives in code, as tables with a unit test for every
boundary.

**The tables cover every place, not only the ones closed at launch.** *(Designer's call, so G3 holds for closing as
well as opening.)*
- **All 50 US states plus DC**, from the USPS three-digit ZIP list.
- **All 13 Canadian provinces and territories**, from the postal code's first letter. `X` is shared by the Northwest
  Territories and Nunavut, so they are one region.
- **The EU territories outside the VAT area** listed below.

The settings parser accepts exactly these region ids. A wrong range for a place that stays open has no effect, so the
verification effort goes first to the places closed at launch.

| Place | Rule |
|---|---|
| Canada, Saskatchewan | postal code starts with `S` |
| Canada, Manitoba | starts with `R` |
| US states | first three ZIP digits, by state, from USPS ranges. Expected: DC `200, 202–205, 569`; MD `206–212, 214–219`; HI `967–968`; RI `028–029`; VT `050–054, 056–059`; WV `247–268`; NJ `070–089`; OH `430–459`. **The builder verifies every range against USPS data**: these were written from memory. |
| Spain | Canary Islands `35xxx`, `38xxx`; Ceuta `51xxx`; Melilla `52xxx` |
| France | `971`, `972`, `973`, `974`, `976` (`971` also covers Saint-Martin and Saint-Barthélemy addresses written as France) |
| Finland | Åland `22xxx` |
| Greece | Mount Athos `63086`, `63087` (UNVERIFIED: builder checks) |
| Italy | Livigno `23041`, Campione d'Italia `22061` (UNVERIFIED: builder checks) |
| Germany | Heligoland `27498`, Büsingen `78266` |

**Second signal, used only to refuse, never to allow:** the checkout's free-text **region** for the US and Canada. It
matches only when it equals a state or province code or its full English or French name (case-insensitive, trimmed,
accents ignored): never by substring.

**Not used: the state chosen at sign-up.** *(Designer's call.)* Billing cannot read it by design: it sits in
`identity.registration_region` (migration 0095), which no runtime role may read, and
`migrations/lineage/verify-effective-capabilities.sql` fails the deploy if one gains access. Using it would mean a
new migration that widens who reads personal data, against the "two doors" privacy rule. It also cannot be changed,
so a person who signed up in Maryland and later moved could never pay.

**The rule:** refuse when **either** signal (the postal code or the typed region) points to a closed place.

**A postal code that doesn't fit its country's format is sent back for correction**, not guessed. *(Designer's
call.)* This keeps both anti-goals.
- It applies only to countries with a table: US (5 digits, or ZIP+4), Canada (letter-digit-letter digit-letter-digit),
  Spain, France, Finland, Greece, Italy and Germany (5 digits).
- A leading country prefix such as `F-`, `E-`, `D-`, `I-`, `GR-`, `AX-` or `FI-` is stripped first.
- A code that still doesn't fit gets **422 `BILLING_POSTCODE_INVALID`**, and the website shows a new sentence,
  **"Please check your postal code."** (`billing.checkout.postalCodeInvalid`, 35 locales), on the postal-code field.
- Every other country keeps today's rule (required except Ireland).

**Ohio, business buyers:** a purchase counts as a business purchase when the checkout's company block (company name,
VAT/tax ID, company address) is filled in. A consumer in Ohio can buy.

## 7. Where the decisions live

- **Geography** (which postcodes and names belong to which place): code-owned tables, versioned with the code.
- **Policy** (which places are closed, and why): the sealed register row `countryPolicy`, with a new optional member.
  The suggested name is `regions`, keyed by a closed list of region ids such as `US-MD`, `CA-SK`, `ES-CANARY`,
  `FR-971`. Each entry is shaped like today's rules: `pay: false`, `reason: "TAX_NOT_READY"`, plus an optional
  `buyers: "business"` (Ohio). `signup` stays true, because sign-up is not affected. An id unknown to the code is
  refused at parse time, like today's state codes.
- Opening a place means publishing a version without its entry (sealed rows are never edited; a new version
  supersedes).
- The launch list goes in **both** places that hold the row today:
  - the code's own row `COUNTRY_POLICY_DEPLOYMENT_REGISTER_ROW` (`packages/register/src/country-policy.ts`);
  - `deploy/vps/register/country-policy.example.json` (the hosted kit's file).
- The preview publish kits (v2 and v3) and the hosted file's parser carry the new member like the rest of the row.

## 8. Where it is enforced

- **The quote** (`apps/api/src/billing/quote.ts`, `QuoteService`), for a new subscription **and** for an upgrade
  quote.
- **Checkout start**, which re-checks on the server, so a crafted request cannot skip the quote.
- At checkout start the region check runs right after the country check and **before** the "confirm your country"
  question: a refusal makes that question moot.
- Ruling R5: the "check your postal code" answer (`BILLING_POSTCODE_INVALID`) is given only in a country where the
  policy closes at least one region; elsewhere the postal code cannot change the outcome.
- A new refusal code **`REGION_PAYMENT_UNAVAILABLE`** (HTTP 403), next to `COUNTRY_PAYMENT_UNAVAILABLE` in
  `apps/api/src/billing/refusal.ts` and `place.ts`. Also **`BILLING_POSTCODE_INVALID`** (HTTP 422) for a postal code
  that doesn't fit its country's format (§6), which the website maps to `billing.checkout.postalCodeInvalid`.
- The website maps it in `apps/ui/lib/billing/checkoutFailure.ts` to a new sentence key
  `billing.checkout.regionUnavailable`, in all **35** locales (`apps/ui/messages/<locale>/billing.json`).
- The card change (`/settings/card`) keeps the subscription's stored tax location, so it is unaffected.

## 9. Testing

- Unit:
  - every table boundary (first and last prefix of each range, and the neighbours just outside);
  - normalisation (lower case, spaces, dashes);
  - the postal-code format check per country (prefixes stripped, short or long codes sent back with
    `BILLING_POSTCODE_INVALID`);
  - the free-text region match, including near-misses that must NOT match;
  - parsing the new row member (valid and invalid);
  - the rule "any signal refuses";
  - Ohio: business refused, consumer allowed.
- API: the quote and checkout refuse each closed place, an open place in the same country still quotes, and an
  upgrade is refused.
- Website: the code maps to the new sentence, and every locale has it (the existing locale-completeness checks).
- The owner's rule before any upload to the test site: the practice debate must pass. This change touches no debate
  code, but the release still carries the usual practice.

## 10. Roll-out

1. PR to `dev` (the owner's finishing rule: latest `dev` merged first, Auto-fix on, merged on the owner's yes).
2. On the test site (hosted, NETOPIA sandbox), the next release carries the code. Then a new register version
   (publish kit v3, `--hosted-billing` with the same values, `--checker deepseek --deepseek-enabled-on-gate yes`)
   carries the closed list, and the delta shows only `countryPolicy` and the runtime reference.
3. On the live site, the row is published with the rest of billing's settings before billing goes on.

## 11. Follow-ups outside this change

- **Terms §2 / Annex A:** the legal text should say that paid plans are not available in these places yet (go-live row
  24: the Terms list exactly what the site offers). This is for the colleague and counsel.
- **The EU buyer before the One-Stop Shop starts** still sees "We can't work out the price right now. Please try again
  in a minute." (`quote.ts` refuses a tax country in another currency). A clearer sentence and an owner alert are a
  small separate change.
- **The help assistant's articles** mention which countries can pay. Update them if they list places now closed.

## 12. Left to the builder

- The exact member and region-id names.
- Where the matcher lives: `packages/geo`, `packages/register` or `packages/billing-core`, whichever keeps today's
  boundaries.
- The table format.
- Whether the website also offers a state/province picker for the US and Canada. Not required: the server rule stands
  on the postal code.
- The audit line's event name.
