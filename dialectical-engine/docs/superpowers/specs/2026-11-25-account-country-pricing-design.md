# Prices for the country on the account — design

2026-11-25 · for the owner's approval · nothing is built yet · branch `feat/2026-11-25-account-country-pricing`,
cut from `origin/dev` at `728f9a723`

## What this is for

A visitor should see what they will really pay. Before sign-up the only thing we know is where their connection is,
so the landing page prices for that country, with its tax, in the currency that country is charged in. That works
today and does not change.

After sign-up we know something better: the country the person said they live in. The sign-up form's Region field
stores it, one row per account (`identity.registration_region`, migration `0095`). Today nothing reads that row for
prices, so a signed-in person is still priced by their connection, on the pricing page and at checkout.

Example. Ana lives in Romania and picked Romania at sign-up. Signed in, she opens the pricing page from a hotel in
Berlin. Today she sees EUR prices with German VAT. She should see RON prices with Romanian VAT, because that is what her invoice will
say.

The owner's words, 25 November 2026: "it should show the price of the country they are in right now, but when they
make an account they select their country and the price is for their country." Asked whether the account country is
fixed or a starting point the person can still change, the owner chose **starting point**.

## The design in five lines

1. The plans list prices for a place. The country of that place is picked in this order: the country the visitor
   chose on the page, else the signed-in account's sign-up country, else the connection's country, else none.
2. The checkout's first quote, which today starts from the connection's country, starts from the account's sign-up
   country when there is one.
3. Everything after that first pick is as today: the person can choose another country on the pricing page, and
   checkout charges the tax of the billing address they enter.
4. An account with no sign-up country (created before the Region field, 0095 has no backfill) is priced by its
   connection, as today.
5. No new field at sign-up, no new setting, no new text on the pages, no new currency.

## Goals, non-goals, anti-goals

**Goals**

- A signed-in person with a sign-up country sees that country's price, tax and currency on the pricing page,
  wherever they connect from.
- The checkout opens with that country already filled in.
- One rule, in the API, so the pricing page, the checkout and any later client get the same answer.

**Non-goals**

- The landing page. Only a signed-out visitor ever sees it: `apps/ui/app/page.tsx:134` renders it when there is
  no session cookie, and a signed-in person gets their library at the same address. It keeps pricing by the
  connection and is not touched.
- Changing the account's country after sign-up. There is no such control today and this adds none. A person who
  moved picks the new country on the pricing page or at checkout, as anyone can today.
- New currencies or converted "about £17" prices. The three charged currencies (RON, EUR, USD, ruling PR-60) stay.
- Using the stored US state. Tax in the US and Canada needs a postal code, which sign-up does not ask for, so a US
  or Canadian account still sees "enter your postal code", with the country already set.
- A subscriber's price. A live subscription keeps the place and currency it was sold in (ruling C-6); this touches
  only the plans list and a new subscription's first quote.
- The country gate. Who may use the service is still decided by the connection (ADR-0029). Nothing here reads the
  account country to open or close anything.

**Anti-goals** (it has failed if any of these happens, even if the price is right)

- The account country becomes a lock: a signed-in person can no longer choose another country on the pricing page
  or type another billing country at checkout.
- A signed-out visitor, or someone with a dead session, gets an error or no price where they get a price today.
- The tax charged at checkout is decided by anything other than what decides it today.
- The plans list tells anyone a country that is not theirs: one person's account country must never be served to
  another person from a cache.

## How it works today (verified on `origin/dev` at `728f9a723`)

- `GET /v1/billing/plans` (`apps/api/src/billing/index.ts:233`) is public and takes no session. It calls
  `pricingPlace` (`apps/api/src/billing/place.ts:67`), whose country is `input.country ?? connectionCountry(...)`:
  the country in the query, else the connection's. It answers with `Cache-Control: private, max-age=60`.
- The landing page (`apps/ui/app/page.tsx:67`, `landingPlans`) and the pricing page
  (`apps/ui/app/pricing/page.tsx:34`, `readPlans`) call it from the server with
  `createServerContractClient(fetch, undefined, userAgent, clientIp)`. The second argument is the session cookie,
  and both pages pass none. The landing page is rendered only when there is no session cookie (`page.tsx:134`); the
  pricing page is rendered for everyone.
- `POST /v1/billing/quote` needs a session. The checkout's first quote sends no country, and
  `decidePaymentPlace` (`apps/api/src/billing/place.ts`) then uses the connection's country as the declared one.
  When the declared country and the connection's differ, the answer is `CONFIRM_COUNTRY` and the checkout asks
  "Your connection looks like it's from {ipCountry}. Do you live in {declaredCountry}?".
- `identity.registration_region` holds `user_id`, `country_code`, `us_state`. It is written once, inside the
  sign-up transaction, by `identity.record_registration_region` (email sign-up) and
  `identity.record_social_registration_region` (social sign-up). No application code reads it; only the data export
  does (`migrations/0115_data_export.sql:202`). No runtime role may select from the table.
  `tests/architecture/region-picker-scope.test.ts` pins the exact list of files that name the table.
- The API already supports a public route that looks at a session when one is presented: route policy
  `session: "optional"` (`apps/api/src/index.ts:2995`), used by `GET /v1/support/status`. A missing or dead session
  leaves the request anonymous; it is not an error. Two things about that hook matter here: a session lookup that
  throws (the session store or the database is down) fails the request, and a successful lookup always moves the
  session's idle expiry forward (`apps/api/src/sessions.ts:371`).
- Since migration `0171` (fix F5), a database function that reads one account's data for the API's requests does
  not believe the account the API names: it asks `identity.request_owner_matches(...)`, so the database itself
  confirms that the connection's live session belongs to that account, and refuses otherwise
  (`REQUEST_OWNER_MISMATCH`, 42501). `identity.read_age_check_outcome` is the model.

## Approaches

**A. One rule in the API (chosen).** The plans route takes an optional session, and the place's country gets one
more step between "chosen on the page" and "the connection's". The first quote uses the same step. The pricing
page only has to forward the session cookie the browser already sent it. It needs one small database change, because the API can
write the sign-up country but not read it. One place decides, so the pricing page, the checkout and any later
client cannot disagree.

**B. Each page passes the country.** The pages read the account country from a new account route and send it as
`?country=` to the plans route, which stays as it is. Rejected: it still needs the same new read in the API, every
page has to remember to do it, the checkout's first quote would not get it without a second change, and the page
could no longer tell "the person chose this country here" from "we filled it in".

**C. A "billing country" setting on the account.** A new editable field in settings, read by pricing. Rejected for
now: it is a larger feature, and it overlaps with the billing details checkout already keeps. It is the natural next
step if people who moved country ask for it.

The owner speaks in outcomes and left the how to the builder, so A is the builder's pick, stated here for approval.

## The rule

The place the plans list prices for (`pricingPlace`):

| Step | Country comes from | When |
|---|---|---|
| 1 | the query (`country`, and `postal_code` in the US and Canada) | the visitor chose a place on the page |
| 2 | the account's sign-up country | a live session is presented and the account has a region row |
| 3 | the connection (`connectionCountry`) | otherwise; not for Tor exits or an unknown address, as today |
| 4 | none: `COUNTRY_NEEDED` | nothing above answered |

After the country is known nothing changes: US and Canada wait for a postal code, tax is read for the place, the
currency is `priceCurrencyFor(plans, country)`, and a place with no tax answer shows no price.

The first quote (`POST /v1/billing/quote` with no `country`): the declared country is the account's sign-up
country when there is one, else the connection's, as today. It then goes through `decidePayment` exactly as a
country the person typed would. So Ana in Berlin gets the existing question, "Your connection looks like it's from
Germany. Do you live in Romania?", and a connection over Tor or with no known country is refused as it is today for
any declared country (`TOR_REFUSED`, `COUNTRY_UNKNOWN`).

A sign-up country the price list cannot use is treated as any chosen country would be: the plans list shows what it
shows today for that country (no price where there is no tax answer), and the quote refuses with today's codes.

## What changes, part by part

**Database (one migration, next free number after `0190`).** A read function modelled on
`identity.read_age_check_outcome` as `0171` left it: `SECURITY DEFINER`, `search_path=pg_catalog`, takes the
account, and as its first statement refuses unless `identity.request_owner_matches` says the connection's live
session is that account's (`REQUEST_OWNER_MISMATCH`, 42501). It then returns the country code, or NULL when the
account has no region row. It returns the country only, never the US state: pricing has no use for the state.
`EXECUTE` goes to the one role the billing routes run as and to no other, matching how the write function is
granted (`0095:48-50`). No table grant is added. The repository's pinned lists gain the new function and the new
files: the forward migration checks under `packages/db/src/migration-forward*.ts`, `migrations/lineage/`,
`tests/integration/registration-region-database.test.ts`, and the file list in
`tests/architecture/region-picker-scope.test.ts`.

**API.**
- A small port, "the sign-up country of this account", composed where billing is composed, backed by the new
  function. It is given to the plans route and to the quote service. Its read runs inside the request, on the
  request's own database login with the session's credential set, so the function's owner check passes for the
  account's own session and for no other.
- `GET /v1/billing/plans` looks at a session when one is presented. When there is a live one and the query names
  no country, the handler reads the account's country and hands it to `pricingPlace` as step 2.
- The plans list must never break over any of this (it already never fails over its tax). Whatever goes wrong on
  the way to the account's country (no cookie, a dead or garbage cookie, a session lookup that throws, a read
  that throws or is refused), the route answers 200 with the connection's country, as it would for a signed-out
  visitor. Simply setting the route policy to `session: "optional"` does not give this, because the shared hook
  fails the request when the lookup throws; how to get it (authenticating inside the handler, or a variant of the
  policy for this route) is the builder's choice, without changing what the other optional-session routes do.
- Looking at the pricing page while signed in moves the session's idle expiry forward, like any other signed-in
  page the server renders (the library does the same through `page.tsx:181`). That is accepted: it is the person
  using the site.
- The answer keeps `Cache-Control: private, max-age=60` and adds `Vary: Cookie`, because it now depends on who
  asks.
- `POST /v1/billing/quote`: with no `country` in the body, the quote service asks the same port before falling
  back to the connection. Here a read that throws or is refused is the route's existing 503 "try again in a
  minute": a quote is about to be sealed, and guessing the country is worse than waiting. Only a clean "no region
  row" answer falls back to the connection.
- The response shape does not change. `place.country` already names the country the price is for.

**Pages.** The pricing page's `readPlans` passes the browser's session cookie as the second argument of
`createServerContractClient`, the way the library does (`page.tsx:181`). Nothing else on the page changes: with a
sign-up country the answer is `PRICED` for that country, which is the state a connection-priced visitor is in
today, and the place picker shows the account's country, ready to be changed. The landing page's `landingPlans` is
not touched: it runs only when there is no session.

**Texts.** None. The pricing page's one sentence ("You pay in the currency of your billing country. At checkout you
see the exact amount, with tax, before you pay.") stays true. The privacy policy already lists the declared country
under "Applying the consumer, privacy and tax rules for where you live" (`apps/ui/legal/en/privacy-policy.md:80`),
so this use is already described; the owner should confirm that reading.

**Documents.** `docs/superpowers/specs/2026-10-05-netopia-payments-design.md` §2.16.1 says the pricing page takes
the currency from "the connection's country". A dated note there points to this design: for a signed-in account
with a sign-up country, that country comes first.

## What must be proven

- `pricingPlace`, by unit test, for each step of the rule: chosen beats account beats connection; an account
  country in the US or Canada asks for the postal code; a Tor exit or unknown address with an account country is
  priced by the account country; with nothing, `COUNTRY_NEEDED`.
- The plans route: signed in with a row; signed in without a row (connection); signed out (connection); a dead or
  garbage session cookie (connection, status 200); a session lookup that throws (connection, status 200); a read
  of the country that throws or is refused (connection, status 200); a chosen country in the query wins over the
  account's; `Vary: Cookie` is present.
- The other optional-session routes behave exactly as before.
- The quote: no country in the body and an account country that differs from the connection gives the account
  country with `CONFIRM_COUNTRY`; equal gives `ALLOW`; no row gives today's behaviour; a country in the body wins;
  a read that throws or is refused gives 503 and writes nothing.
- The database: the function returns the country for the session's own account with a row and NULL without; a
  connection with no session, or with another account's session, is refused `REQUEST_OWNER_MISMATCH`; only the
  intended role may execute it; the table still has no direct grant.
- The pricing page forwards the session cookie to the plans call, and a render test shows a signed-in account
  priced for its account country while the connection is elsewhere. The landing page's call still sends none.
- Nothing in the existing billing, country-gate or Italy-approval tests changes its expectation.

## Left to the builder

- The number and name of the migration, and the exact way the function is added to the pinned lists.
- Whether the function takes the user id or the owner reference (the session carries both, `sessions.ts:36`;
  `request_owner_matches` takes the owner), and which runtime role is "the one the billing routes run as" on
  `origin/dev` today (`deploy/vps/README.md` § billing runtime role describes `debateai_billing_runtime`).
- How the plans route looks at the session so that a failing lookup leaves the request anonymous (above).
- The API may answer an optional-session request with refreshed cookies, which a server-side call from the page
  cannot pass on to the browser. The required outcome: looking at prices never signs anyone out.
- Names of the port, its file, and the tests.

## Open decision for the owner

One. An account's sign-up country is a declared residence, and this design reuses it to pick the price a person
sees. The privacy policy's existing line appears to cover that. If the owner or counsel reads it differently, the
policy needs a sentence before this ships; the build does not change.
