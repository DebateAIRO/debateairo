# Card payments through NETOPIA: design

- **Date:** 5 October 2026 (revision 2, after the independent review of revision 1)
- **Branch:** `feat/2026-10-05-netopia-switch`, off `origin/dev` 7b91df4f1. Nothing is pushed.
- **Owner goal (5 October 2026):** change the card processor from xMoney to NETOPIA Payments, because NETOPIA's rates
  are better for us. Do everything that can be done without NETOPIA's answers; ask only where we are stuck or where a
  value is private to the business; give the owner one simple way to enter those private values.
- **Builds on:** `2026-09-29-paid-plans-and-payments-design.md` (the paid-plans design, "the 29 September design").
  Everything there stays true **except** what this document replaces (§2.1.2). Where the two differ, this document
  wins. The 29 September design carries amendment **A32**, which points here.
- **Owner decisions:** §1.8.
- **Status:** written spec, revised after an independent review (34 findings, all resolved here); awaiting the owner's
  review. No product code has been written.
- **Research behind it:** a NETOPIA API v2 reference, an xMoney coupling map and the review, in the session's SDD
  folder (`.superpowers/sdd/2026-10-05-netopia-switch/`, private working notes, not committed). Facts marked
  **[N-x]** are open NETOPIA questions (§2.24); everything else is confirmed by NETOPIA's published OpenAPI file, its
  official SDKs and plugins, or our own code.

This document has two parts. **Part 1** is for the owner and uses plain words. **Part 2** is for the people and agents
who build it.

---

## Part 1 — For the owner

### 1.1 In one paragraph

A person picks a plan, types their billing details on our checkout page (name, phone, address), ticks the two boxes and
presses **Continue to payment**. They land on NETOPIA's own payment page and pay there; their bank may ask for its
security check on that page. NETOPIA then sends our server a signed message. Our server checks NETOPIA's signature,
stores the saved-card code NETOPIA includes (encrypted), and starts the plan. Every month our server charges the saved
card itself, as a payment the person agreed to in advance. Nothing else changes: the same plans, limits, tax, invoices,
emails, cancelling and withdrawal rules. Billing stays switched off until you switch it on.

### 1.2 What the person paying sees

| Step | Before (xMoney) | Now (NETOPIA) |
|---|---|---|
| Checkout | card form inside our page | billing details on our page, then NETOPIA's payment page |
| Billing details | country; name and address only for Romania and companies | first and last name, phone and full address for everyone (NETOPIA requires them for the monthly payments) |
| Paying | card | card, or Apple Pay or Google Pay on NETOPIA's page. A wallet may not leave a saved card behind (N-17); if so, the site asks for a card before the first renewal |
| Upgrade | charged at once to the saved card | pays the difference on NETOPIA's page; the new plan starts as soon as it is paid |
| Change of card | a $1.00 hold, released at once | a check for 0 on NETOPIA's page: no money is held. It must be a card, not a wallet (N-11, N-17) |
| Monthly renewal | our server charged the saved card | the same |
| Card about to expire | nothing | an email 10 days before a renewal the card would not survive |

### 1.3 What stays exactly the same

The plans and their credit, the daily, weekly and monthly limits with the 110% leeway, the models chosen to fit, the
tax worked out by Quaderno, one legal invoice per payment (SmartBill for Romania, Quaderno for everyone else), the
retries after a failed payment (after 1, 3 and 7 days), every email, cancelling, the 14-day withdrawal and its formula,
the dispute pause, account deletion, the quarterly tax summary and the owner commands.

### 1.4 Refunds, while NETOPIA's refund feature is unconfirmed

NETOPIA's API lists a refund call, but marks it "available at a future date", and none of NETOPIA's own plugins uses
it. Until NETOPIA confirms it works for our account (N-10), **you make refunds in NETOPIA's admin**:

1. When a refund is owed (for example, a withdrawal within 14 days), the site emails you at once: which payment,
   exactly how much, why, the deadline when there is one, and the one command to run once you have refunded.
2. You refund exactly that amount in NETOPIA's admin, in one refund.
3. **A full refund** (the whole payment) is recorded by the site itself as soon as NETOPIA reports it. **A partial
   refund** (most withdrawals are partial) is recorded when you run the command from the email, because NETOPIA has not
   said whether it reports partial refunds and their amount (N-8). Either way, the site then sends the customer's email
   and issues the credit note by itself.
4. The site reminds you of every refund still open, and every day once a withdrawal's deadline is three days away.

When NETOPIA confirms the refund call, the site makes refunds by itself, the way it did with xMoney.

### 1.5 Your private settings: one guided command

You run one command on the server. It asks for each value in plain words, one at a time, and says where to find it in
NETOPIA's admin:

1. Test (sandbox) or live.
2. Your POS signature (five groups of four characters).
3. Your API key. You type it at a hidden prompt; it never shows on the screen.
4. NETOPIA's public key, which proves NETOPIA's messages are genuine. You paste the block NETOPIA gives you, or you
   choose the key NETOPIA publishes in its own shop plugins, after checking its fingerprint with NETOPIA.

The same command can also take the Quaderno key, the SmartBill login and your report email address. It stores each one
with the right protection, then checks everything and prints a plain list: what is ready, what is missing, and whether
NETOPIA accepted the key (it makes a harmless call that charges nothing). You can run it again at any time to change a
value. No agent ever sees a key.

### 1.6 What you need to do (nothing blocks the build)

| # | What | When |
|---|---|---|
| 1 | Send NETOPIA the email drafted for you in Romanian (kept outside this public repository, with your business papers). It asks them to switch on recurring payments for your account and asks the questions in §2.24. | now |
| 2 | Tell me NETOPIA's answers as they come. Each one closes a row of §2.24. | as they come |
| 3 | Choose the currency once NETOPIA says what your account can take (§1.8, §2.16). | after NETOPIA answers |
| 4 | On a separate test server, run the guided command with NETOPIA's sandbox values and do the sandbox test run in the runbook. Let NETOPIA test our flow there, as they asked. | after the build |
| 5 | Ask NETOPIA whether their shop check can be done on that test server, or with the paid plans still hidden on the live site (N-26). If they need the plans visible on the live site, you rule how. | after the build |
| 6 | Do the small live test, with billing still switched off: one real 1.00 payment with your own card, one saved-card charge of 1.00, then refund both in NETOPIA's admin (§2.21). NETOPIA says the monthly payments can only be tested this way. | after NETOPIA switches on recurring payments |
| 7 | The website items NETOPIA checks before approving a shop: NETOPIA's logo and the card marks, the consumer-protection (ANPC) links, Terms, privacy, cancellation rules (§2.21, go-live rows). | before billing goes on |
| 8 | Your colleague and the lawyer: the Privacy Policy must name NETOPIA and the details it receives (name, email, phone, address, internet address at each payment), and confirm the card-saving wording (§2.22). | before billing goes on |
| 9 | Sign the support assistant's page list again, because the checkout entries change their wording (§2.18). | before billing goes on |

### 1.7 Questions only NETOPIA can answer

NETOPIA's public documents leave 26 points open. For each one the build makes the safe choice and records it in the
table of §2.24, with what it assumes until NETOPIA answers and whether it keeps billing off until then. Most answers
change one named place in the code; a few (N-8, N-12, N-15) change a rule, and the table says which. The email in §1.6
item 1 asks all of them.

### 1.8 Your decisions (5 October 2026)

| Question | Your choice |
|---|---|
| The processor | NETOPIA, instead of xMoney (better rates) |
| The currency | build for USD, EUR or RON; you choose one when NETOPIA answers, by publishing the prices in it. Until then the plans stay $20, $50 and $200 + VAT |
| The design (§1.1–§1.5) | approved: "write it up" |
| xMoney | removed from the code (it stays in the history) |

Rulings made by the controller (this design's author), which you can overturn:

| # | Ruling | Why |
|---|---|---|
| C-1 | Upgrades are paid on NETOPIA's page, not charged silently to the saved card | an upgrade is started by the person, so the bank may ask for its security check, which only NETOPIA's page can show |
| C-2 | The card change is a 0 check on NETOPIA's page, and it succeeds only once a saved card has arrived | NETOPIA's API describes amount 0 as "account verification"; no money is held. A wallet that leaves no saved card fails with a sentence asking for a card |
| C-3 | Refunds by you in NETOPIA's admin until the refund call is confirmed (§1.4) | NETOPIA marks the call "future" and none of its own plugins uses it |
| C-4 | A message whose signature does not check is answered "try again later", never "OK", and it is kept, sealed, for 14 days | NETOPIA sends the saved-card code only once. If our key were wrong, an "OK" would lose every card for good; "try again" keeps NETOPIA sending, and the kept copy is checked again as soon as you fix the key |
| C-5 | A saved-card code is deleted the day after it stops being the card of a live plan | data minimisation; refunds and disputes use NETOPIA's payment number, never the card code |
| C-6 | Each subscription keeps the currency it was sold in; publishing another currency affects only new subscriptions; a plan change between two currencies is refused with a sentence | a live plan keeps the price it was sold at (Terms §12) |
| C-7 | NETOPIA statuses whose meaning is not confirmed (17 "reversed", 10 "charge-back accepted") never act on their own: they record what is safe and email you | a wrong guess would issue a credit note or end a plan for good |
| C-8 | A NETOPIA refusal caused by our own setup (merchant settings, recurring payments off, an unknown code) never starts the failed-payment emails: the renewal waits and you are emailed | otherwise one setup mistake would end every subscriber's plan |
| C-9 | The small live test runs with billing switched off: NETOPIA's message reaches the server for the test tool's own orders only | so the live checkout never opens to the public before you switch billing on |

---

## Part 2 — For the builders

### 2.1 Starting point and scope

#### 2.1.1 Verified on `origin/dev` 7b91df4f1 (5 October 2026)

- Billing is built and switched off: the `billingPolicy` row says `enabled: false`
  (`packages/register/src/billing-policy.ts:110-132`). Billing exists only when the deployment is hosted AND that row
  says enabled (`apps/api/src/main.ts:608-628`); without it every billing route answers 404 (`index.ts:19-29`).
- **There is no payment port.** `packages/billing-core/src/ports.ts` defines only `TaxEngine` and `InvoiceIssuer`. 14
  API files call `XMoneyClient` directly (`checkout.ts`, `connectors.ts`, `invoice-cli.ts`, `notice-intake.ts`,
  `reconcile.ts`, `refunds.ts`, `renewal.ts`, `runtime.ts`, `settlement.ts`, `stage-clock.ts`, `subscription-deps.ts`,
  `upgrade.ts`, `verify-payment.ts`, `withdraw-cli.ts`) and import xMoney's types and status words.
- **The fold knows xMoney.** `foldSubscription` refuses CREATED without `data.xmoney_environment`, ACTIVATED without an
  xMoney order and CARD_CHANGED without a new order (`packages/billing-core/src/subscription.ts:116, 234, 264-265`);
  `renewable()` and `createRetryCharge` need the xMoney order and customer ids (`renewal.ts:81-85, 547, 721`).
- Provider-neutral already, and kept as it is: the money rules in `packages/billing-core` (proration, A6 credit,
  withdrawal formula and deadline, windows, calendar); the outbox worker, its leases, retries, dead letters and the
  O1/O2/O3 owner emails; the quote and Quaderno pricing; SmartBill invoices and e-Factura; the renewal scheduler, A7
  notices, the Q-1 72-hour hold and the dunning `[1, 3, 7]`; cancel, revoke, downgrade, cancel links, dispute pause and
  resume, the erasure hook; the return page and `ChargeStatusPoller`; the owner commands' logic; systemd, the
  provisioner, the `debateai_billing_runtime` role (0093) and the register rows (none names xMoney).
- `git grep -il xmoney` lists 263 files (71 of them locale files).
- No xMoney sandbox recording was ever made (`tests/fixtures/xmoney/` does not exist), so no xMoney fact was ever
  measured, and no deployment has billing rows except, possibly, a developer database filled by the dev-stack fakes
  (`DEBATEAI_BILLING_FAKES=1`).
- The newest migration is `0095_registration_region.sql`. This design's migrations start at **0096**. The plan's first
  task re-checks the number against `dev` and the open pull requests.

#### 2.1.2 What this document replaces in the 29 September design

| 29 September design | Replaced by |
|---|---|
| §1.1, §1.3 "Paying" items 4–5, §1.10 "Where the card is typed" | §1.1, §1.2 here |
| §1.7 items 1 and 6 (xMoney account and sandbox run) | §1.6 here |
| §2.5.2 `billing.xmoney_notice`, `billing.customer_xmoney`, the `xmoney_*` columns | §2.5 |
| §2.5.3 "Starting the payment" and "The security policy for the checkout page only" | §2.6, §2.18 |
| §2.5.4 (the notice, VERIFY_PAYMENT's reads, the Quaderno processor fields, reconciliation) | §2.7, §2.8, §2.14 |
| §2.5.5 the rebill call | §2.9 |
| §2.5.6 `upgrade` step 2, `withdraw` steps (the xMoney calls), `card` | §2.10, §2.12, §2.11 |
| Amendments A1, A2, A4 (c)(d), A9, A10, A11, A12, A22's xMoney environment rule, A23, A24; A29 (a), (b), (c), (e), (f), (o), (p); A31 (b) and (j)'s card-check hold | the sections named in §2.5–§2.15 |
| Go-live rows 14, 15, 17–20, 23, 24 (payment recipients), 40, 46; open items P2-I1, P2-I2, P2-I3, P2-I12 (1), P2-I18, P2-I21, P2-M1/M2/M3/M5/M27 | §2.21 |

Everything else in the 29 September design, its amendments and the go-live checklist stays binding.

### 2.2 Rules that bind every task

1. **Billing stays off.** No task publishes a register version that switches it on.
2. **Keys.** No agent creates, reads, prints or handles a real key, token or POS signature. Tests generate their own
   RSA keys and use made-up values, built from pieces where they look like keys (the repository's leak scanner flags
   long key-like strings). Steps marked OWNER-RUN are the owner's.
3. **Migrations are forward-only and replayable.** An applied migration is never edited; every statement of a new one
   can run twice (guarded by catalogue checks where SQL has no `IF NOT EXISTS`). Every new billing table grants itself to
   `debateai_billing_runtime` in its own migration, and 0096 repeats 0093's contract check (§2.5.6).
4. **Sealed values are superseded, never edited** (register versions, the signed support catalogue, the legal
   manifest).
5. **No card data, no token and no full JWT ever reaches a log, an audit line, an email, an error message or a test
   snapshot.** A token travels between modules only inside a `SecretToken` value whose `toString`, `toJSON` and
   `util.inspect` print `[token]`; its plaintext is read with one explicit method, only to build the request.
6. **The browser never decides a payment, and neither does the return URL.** A payment counts only when NETOPIA's
   signed message or NETOPIA's status answer says so (§2.8).
7. **Money is integer micros** end to end; NETOPIA's decimal amounts are parsed exactly from the JSON text, never
   through a float (today's `parseJsonKeepingNumberText` rule).
8. **Customer sentences say only what is true** (A29 (m)); English defaults the owner may change, 35 locales.
9. **Local mode never bills.** Everything here exists only when the deployment is hosted.
10. **No redirect is ever followed** to or from NETOPIA's API (`fetch` with `redirect: "manual"`; a 3xx is a
    configuration error), and a payment URL is stored only when it is https on a NETOPIA host.

### 2.3 The payment port (`packages/billing-core/src/ports.ts`)

The rest of the code talks to NETOPIA only through this port. The NETOPIA package implements it; the protocol fake and
the tests implement it too.

```ts
export type PaymentProvider = "netopia";
export type PaymentEnvironment = "sandbox" | "live";
export type PriceCurrency = "USD" | "EUR" | "RON";          // Part C (§2.16); Part N keeps "USD"

/** The cardholder NETOPIA needs on every payment (mandatory for saved-card charges, [SALES]). */
export type Payer = Readonly<{
  firstName: string; lastName: string; email: string; phone: string;   // phone: E.164
  country: string;            // ISO 3166-1 alpha-2
  region: string | null; city: string; postalCode: string | null; street: string;
}>;

/** Redacts itself everywhere; `reveal()` is the only way to the plaintext (§2.2 rule 5). */
export interface SecretToken { reveal(): string; readonly fingerprint: string }

export type HostedPaymentStart = Readonly<{
  orderId: string;            // our charge id (32 lower-case hex)
  amountMicros: number;       // 0 only for a card check (§2.11)
  currency: PriceCurrency;
  description: string;        // the order line in the buyer's locale (order-text catalogue)
  payer: Payer;
  clientId: string;           // our customer's stable id (§2.6.4)
  returnUrl: string; notifyUrl: string;
  language: string;           // one NETOPIA page language (§2.4.2)
}>;
export type HostedPaymentStarted = Readonly<{ providerPaymentId: string; redirectUrl: string }>;

export type SavedCardCharge = Readonly<{
  orderId: string; amountMicros: number; currency: PriceCurrency; description: string;
  payer: Payer; cardToken: SecretToken; payerIp: string; returnUrl: string; notifyUrl: string; language: string;
}>;

export type PaymentState =
  | "PENDING" | "ACTION_REQUIRED" | "AUTHORIZED" | "PAID" | "DECLINED" | "FAILED" | "VOIDED" | "EXPIRED"
  | "REFUNDED" | "CHARGEBACK_OPENED" | "CHARGEBACK_LOST" | "CHARGEBACK_REPRESENTED"
  | "UNCLEAR";                // a status whose meaning NETOPIA has not confirmed (§2.4.4): never acted on alone

export type SavedCard = Readonly<{ token: SecretToken; expMonth: number | null; expYear: number | null; last4: string | null }>;

export type DeclineSide = "CARD" | "MERCHANT";   // §2.4.5: only CARD declines start the dunning

export type PaymentReport = Readonly<{
  orderId: string; providerPaymentId: string; state: PaymentState;
  providerStatus: string;     // NETOPIA's number, as text, for records and support
  amountMicros: number | null; currency: string | null;
  cardCountry: string | null; // ISO alpha-2, from the issuer's numeric code; null when absent
  savedCard: SavedCard | null;
  declineCode: string | null; declineSide: DeclineSide | null; bankDeclined: boolean;
  occurredAt: Date | null;    // §2.4.3's parsing rule; null when NETOPIA gives no usable time
  clientId: string | null;    // as NETOPIA echoes it, when it does
}>;

export interface CardPayments {
  readonly provider: PaymentProvider;
  readonly environment: PaymentEnvironment;
  startHostedPayment(i: HostedPaymentStart): Promise<HostedPaymentStarted>;
  chargeSavedCard(i: SavedCardCharge): Promise<PaymentReport>;
  status(i: Readonly<{ orderId: string; providerPaymentId: string | null }>): Promise<PaymentReport | "NO_SUCH_ORDER">;
  /** Absent until NETOPIA confirms its refund call (N-10). RefundDesk then hands refunds to the owner (§2.12). */
  refund?(i: Readonly<{ orderId: string; providerPaymentId: string; amountMicros: number }>): Promise<PaymentReport>;
}
```

- **Errors** are `TypedDomainError`s with exactly these codes, and every caller depends only on them:

  | Code | When |
  |---|---|
  | `PAYMENT_PROVIDER_UNAVAILABLE` | a read failed; or a write provably never left: connection refused, DNS failure, host or network unreachable, connect timeout, a TLS handshake failure, HTTP 429 |
  | `PAYMENT_OUTCOME_UNKNOWN` | a write may have reached NETOPIA: a timeout after sending, HTTP 408 or ≥500, a cut connection |
  | `PAYMENT_CREDENTIALS_REFUSED` | HTTP 401 or 403 |
  | `PAYMENT_CONFIGURATION_REFUSED:<detail>` | NETOPIA refused because of our side: HTTP 404, 405 or a 3xx (a wrong base URL), HTTP 400, error 99 (the same orderID with another amount), the merchant-settings codes 32 and 33, and any `error.code` the package does not know |
  | `PAYMENT_RESPONSE_INVALID` | an answer of an unexpected shape |

- A **decline is not an error**: it is a `PaymentReport` with state `DECLINED` and `declineSide` (§2.4.5).
- `status` answers `"NO_SUCH_ORDER"` only when NETOPIA says plainly that it knows no such order (the recorded answer
  pins how NETOPIA says it, §2.4.7); every other failure is an error.
- The **notice verifier** is not on the port. It is a pure function of the NETOPIA package (§2.4.6), injected into the
  notice intake the way `decryptNotice` is today (`notice-intake.ts:26`).
- **The sandbox clock.** A `TimeShiftedCardPayments` wrapper implements the port over another one, shifting every time
  sent and read by `BILLING_STAGE_CLOCK_OFFSET_DAYS`, as `StageShiftedXMoneyClient` does today (`stage-clock.ts:45-122`);
  a test fails if a port method is not wrapped. It runs only against a sandbox base (§2.17.1).

### 2.4 The NETOPIA package (`packages/payments-netopia`)

Plain `fetch`, JSON, no SDK dependency; depends only on `@debateai/kernel` and `@debateai/billing-core` (for the port
types). It replaces `packages/payments-xmoney` (removed in §2.19). The orphan audit's package graph and the scaffold's
package count change with it.

#### 2.4.1 Hosts, environments and authentication

- `NETOPIA_API_BASE_URL` must be https and one of four bases. The environment follows the host:

  | Base | Environment |
  |---|---|
  | `https://secure.netopia-payments.com/api` | live |
  | `https://secure.mobilpay.ro/pay` | live |
  | `https://secure-sandbox.netopia-payments.com` | sandbox |
  | `https://secure.sandbox.netopia-payments.com` | sandbox |

  Any other value refuses the boot with `BILLING_CONFIGURATION_INVALID:NETOPIA_API_BASE_URL`. Both pairs answer today
  (probed 5 October 2026); NETOPIA's newer code uses the first of each pair (N-1).
- Requests carry `Authorization: <API key>` (the raw key, no `Bearer`), `Content-Type: application/json` and
  `Accept: application/json`. The key is a custody text file read as a string (`readCustodyAuthorizationHeader`'s
  precedent), held for the process's life.
- `NETOPIA_POS_SIGNATURE` is not a secret but is private. It must match `^[A-Z0-9]{4}(-[A-Z0-9]{4}){4}$` (NETOPIA's
  examples; N-1 confirms), else `BILLING_CONFIGURATION_INVALID:NETOPIA_POS_SIGNATURE`.
- Timeouts: a hosted start 15 s, a saved-card charge 30 s (NETOPIA's own clients use 30 s), a status read 10 s.
- A payment URL in an answer must be https on `*.netopia-payments.com` or `*.mobilpay.ro`, else
  `PAYMENT_RESPONSE_INVALID`.

#### 2.4.2 The three requests

**Hosted start** — `POST {base}/payment/card/start`:

```json
{
  "config": {"emailTemplate": "", "notifyUrl": "<notifyUrl>", "redirectUrl": "<returnUrl>", "language": "<lang>"},
  "payment": {"options": {"installments": 0, "bonus": 0}, "instrument": {"type": "card"}},
  "order": {
    "ntpID": "", "posSignature": "<POS>", "dateTime": "<ISO 8601, UTC>", "description": "<description>",
    "orderID": "<orderId>", "amount": 24.20, "currency": "USD", "clientID": "<clientId>",
    "billing": {"email": "…", "phone": "…", "firstName": "…", "lastName": "…", "city": "…",
                "country": 642, "countryName": "Romania", "state": "…", "postalCode": "…", "details": "<street>"}
  }
}
```

- No card data: `instrument` carries only `type: "card"`. NETOPIA answers `error.code "101"` ("redirect user to
  payment page"), `payment.status 1` and `payment.paymentURL`. We keep `payment.ntpID` from the JSON (not the `p`
  parameter of the URL).
- No `cancelUrl`: NETOPIA's page sends every payer, successful or not, to `cancelUrl` when one is set.
- `clientID` sits at `order.clientID`, as NETOPIA's OpenAPI file has it. NETOPIA's Python and Node SDKs put it at
  `payment.instrument.clientID` instead (N-2). The location is ONE constant (§2.4.7).
- `amount` is a JSON number in major units with at most two decimals, written from micros by exact decimal text (the
  serializer never produces a value such as `24.199999`).
- `country` is the ISO 3166-1 **numeric** code and `countryName` its English name, both from a static table in the
  package (alpha-2 → numeric and name), covering every country `countryPolicy` can open.
- `state` is required by NETOPIA on every address: the region when the payer has one, else the city.
- `postalCode` is the payer's, or `""` for a country of the static no-postcode list (§2.6.1).
- `language`: the buyer's interface locale when it is one of NETOPIA's page languages (`ro`, `en`, `bg`, `es`, `hu`,
  `it`, `nl`, `de`, `fr`), else `en`.
- `emailTemplate: ""` selects no custom NETOPIA email template; whether NETOPIA then emails the payer at all is N-22.
- `installments` comes from one constant (§2.4.7), `0` until the recording shows which value keeps the payment in one
  go and leaves a saved card (N-24).

**Saved-card charge** (merchant-initiated) — the same route:

```json
{
  "config": {"emailTemplate": "", "notifyUrl": "<notifyUrl>", "redirectUrl": "<returnUrl>", "language": "<lang>"},
  "payment": {"options": {"installments": 0, "bonus": 0}, "instrument": {"type": "card", "token": "<token>"},
              "data": {"IP_ADDRESS": "<payerIp>"}},
  "order": {"ntpID": "", "posSignature": "<POS>", "dateTime": "…", "description": "…", "orderID": "<orderId>",
            "amount": 24.20, "currency": "USD", "scaExemptionInd": "MIT", "billing": {…the full payer…}}
}
```

- No `clientID` (the sales contact's instruction). `scaExemptionInd: "MIT"` inside `order`. A fresh `orderID` for every
  charge: it is our charge id, and every renewal, retry and upgrade is its own charge row already (A2's UNIQUE
  `(subscription_id, kind, period_start, attempt)`).
- The full payer is mandatory here ([SALES]); the package refuses to send a charge whose payer has an empty required
  field (`PAYMENT_PAYER_INCOMPLETE`, a programming error the caller must have prevented).

**Status read** — `POST {base}/operation/status` with `{"posID": "<POS>", "ntpID": "<id or empty>", "orderID": "<orderId>"}`.
NETOPIA's OpenAPI file calls the route "available at a future date", yet every official client calls it and it
answers. Whether it works with `orderID` alone is N-16; the caller sends the best `ntpID` it has (§2.8 step 2).

#### 2.4.3 Reading the answers

HTTP 200 carries business outcomes. `error.code` is a string; `payment.status`, when present, is read with §2.4.4:

| Answer | The package returns |
|---|---|
| `101` (start only) | `HostedPaymentStarted` |
| `00` or `0` | a `PaymentReport` from `payment` (so a status 12 reads `DECLINED`) |
| `100`, or a status 15 | a report with state `ACTION_REQUIRED` (the bank asks for 3-D Secure) |
| `102` | a report with state `PENDING` (locked while 3-D Secure is pending) |
| `56` ("Order closed", the orderID was used) | the existing payment's report, from the answer's `payment` when it has a status and an `ntpID`, else from a status read. Expected only on a resend (§2.9.3); on any first send it also writes the audit line `billing.payment.order_reused {orderId}` and alerts the owner (O3) |
| a card-side decline code (§2.4.5), with or without status 12 | a report with state `DECLINED` and `declineSide: "CARD"` |
| `32`, `33`, `99`, any code the package does not know | `PAYMENT_CONFIGURATION_REFUSED:<code>` |

- Every answer is parsed leniently (unknown members ignored: NETOPIA added a `card` member to status answers without
  notice in 2025), but the members we use are checked strictly: `ntpID` a string of 1–64 characters of
  `[A-Za-z0-9_.:-]`, `status` an integer 1–23, `amount` a decimal, `currency` three capital letters.
- **A saved card** in an answer: the first present of `payment.binding.token`, `payment.instrument.token`,
  `payment.token` (N-4), with `binding.expireMonth`/`expireYear` (0 means unknown) and the last four digits of
  `payment.instrument.panMasked` (only those four are kept). The token is an opaque string of 5–1,024 printable
  characters, wrapped at once in a `SecretToken`.
- **The card's country:** `payment.instrument.country` (ISO numeric), else `payment.data.ISSUER_COUNTRY` (numeric or
  alpha-2), mapped by the static table; unknown or 0 is `null`.
- **The payment time** (`occurredAt`): `payment.operationDate` only when it is an ISO date-time with `Z` or an offset,
  after 1 January 2020, and at most 5 minutes ahead of our clock; anything else (NETOPIA's placeholder
  `0001-01-01T00:00:00`, a time without a zone) is `null`, and the caller uses its own clock. A plan's month never
  starts after "now" (the caller clamps).
- **The amount's unit**: major units (NETOPIA's examples), although NETOPIA's schema text once says "1234 = 12.34". The
  recording pins it (§2.4.7).

#### 2.4.4 The status table

| NETOPIA `status` | Name | `PaymentState` |
|---|---|---|
| 1 | NEW | `PENDING` |
| 2 | OPENED (pre-authorised) | `AUTHORIZED` |
| 3 | PAID (captured) | `PAID` |
| 4 | CANCELED (void) | `VOIDED` |
| 5 | CONFIRMED | `PAID` |
| 6 | PENDING | `PENDING` |
| 8 | CREDIT (refunded) | `REFUNDED` |
| 9 | CHARGEBACK_INIT | `CHARGEBACK_OPENED` |
| 10 | CHARGEBACK_ACCEPT | `CHARGEBACK_LOST` |
| 11 | ERROR | `FAILED` |
| 12 | DECLINED | `DECLINED` |
| 13 | FRAUD (in review) | `PENDING` |
| 14 | PENDING_AUTH | `PENDING` |
| 15 | 3D_AUTH | `ACTION_REQUIRED` |
| 16 | CHARGEBACK_REPRESENTMENT | `CHARGEBACK_REPRESENTED` |
| 17 | REVERSED | `UNCLEAR` (ruling C-7) |
| 18 | PENDING_ANY | `PENDING` |
| 23 | EXPIRED | `EXPIRED` |
| 7, 19–22, any other | SMS, legacy recurrence, trial | `UNCLEAR`, plus the audit line `billing.payment.status_unexpected {status}` |

- Only `PAID` grants a plan or records money. `AUTHORIZED` counts as success only for a 0 card check (§2.11).
- Whether NETOPIA sends both 3 and 5 for one payment, and which comes last, is N-9. The table makes both `PAID`, and
  VERIFY_PAYMENT records one SUCCEEDED per charge whatever the order (A3 (d)'s index).
- A `VOIDED` payment that we had recorded SUCCEEDED is a full refund (A9's `void-ok` rule, kept).

#### 2.4.5 Decline codes

- **Card-side declines** (`declineSide: "CARD"`) start the dunning: 16 risk, 17 invalid card number, 18 closed card, 19
  expired card, 20 insufficient funds, 21 invalid CVV, 22 issuer error, 26 card limit exceeded, 34 transaction not
  allowed, 35 declined, 36 NETOPIA's antifraud, 37 hard decline, 39 3-D Secure failed, and a status 12 without a code.
- **`bankDeclined`** (A29 (m)'s "your bank refused the payment") is true only for the codes where NETOPIA's own page
  names the card or the bank: 17, 18, 19, 20, 21, 22, 26, 34, 35, 37. It is false for 16, 36 and 39.
- **Merchant-side** refusals (32, 33, 99, unknown codes, HTTP 400) are `PAYMENT_CONFIGURATION_REFUSED`, never a decline
  (ruling C-8, §2.9.2).
- Whether NETOPIA classes these the same way is N-12; the tables are constants.

#### 2.4.6 Verifying NETOPIA's message (the IPN)

`verifyNetopiaNotice(rawBody: Buffer, header: string | undefined, trust: Trust): VerifiedNotice | NoticeRejection`,
pure, using `node:crypto` only. `Trust` holds our POS signature and the list of trusted NETOPIA public keys.

1. The header is `Verification-token` (read case-insensitively). It must be three base64url parts. The JWT header's
   `typ`, when present, must be `JWT`; its `alg` must be exactly `RS512` (an allow-list of one: `none`, `HS*` and
   every other value are refused).
2. The signature over `header.payload` must verify (`RSA-SHA512`, PKCS#1 v1.5) under **one** of the trusted keys. The
   keys are PEM `PUBLIC KEY` or `CERTIFICATE` blocks; each must be RSA with at least 2,048 bits. The matching key's
   SPKI SHA-256 fingerprint is returned, so the record says which key verified it.
3. `iss` must equal `NETOPIA Payments`.
4. `aud` (a string or an array) must contain our POS signature.
5. `sub` must equal the standard, padded base64 of the SHA-512 of the **raw body bytes**, compared in constant time.
   The hash covers the bytes as received: the API reads them before any parsing (§2.7.1), and nothing re-encodes them
   on the way (the UI proxy forwards bytes, `apps/ui/app/api/[...path]/route.ts:203-227`).
6. **No time check.** NETOPIA's own code disagrees on the unit of `iat`/`exp`/`nbf` (milliseconds in PHP, seconds
   elsewhere, N-6); a wrong guess would refuse genuine messages and lose saved cards. `sub` binds the token to the
   body, and a replayed message is harmless: decisions use NETOPIA's current status (§2.8). `iat` is recorded as
   received.

Verification ends there. **Parsing the body is a separate, tolerant step** (§2.7.3): a verified message is never
refused for its content.

A rejection carries one reason code (`NOTICE_HEADER_MISSING`, `NOTICE_ALG_REFUSED`, `NOTICE_SIGNATURE_INVALID`,
`NOTICE_ISSUER_INVALID`, `NOTICE_AUDIENCE_INVALID`, `NOTICE_BODY_HASH_INVALID`) and nothing else. A separate pure
function, `quarantinable(rawBody, header, posSignature)`, says whether a rejected message is worth keeping: three JWT
parts, our POS signature in the (unverified) `aud`, and a JSON body whose `order.orderID` has our charge or tool-order
form.

**Which key.** NETOPIA's official WooCommerce and OpenCart plugins carry one RSA-2048 key for sandbox and live (SPKI
SHA-256 `eeba3b065067fb01c2389850c7a888456dfd31332d67ed9b630dae24753478d7`); third parties report that the certificate
under a POS's security settings does not verify v2 messages. N-5 asks NETOPIA for the official key or keys. The guided
setup (§2.17.2) offers that published key as a choice, shows its fingerprint, and accepts any other key the owner
pastes; the trust list may hold several keys, so a key change by NETOPIA needs no downtime.

#### 2.4.7 Facts the sandbox recording pins

The package keeps every uncertain fact in one named constant, each with a test that the recorded fixtures (§2.20.3)
check once they exist: `CLIENT_ID_LOCATION` (N-2), `TOKEN_PATHS` (N-4), `PAID_STATUSES` (N-9), `CARD_DECLINE_CODES`
and `BANK_DECLINE_CODES` (N-12), `INSTALLMENTS_VALUE` (N-24), the answer to a 0 card check (N-11), the status read
without `ntpID` and how NETOPIA says "no such order" (N-16), the amount's unit in messages and status answers, the
format of the card's country (`instrument.country` against `ISSUER_COUNTRY`; if neither ever parses, the always-blocked
card-country refusal would silently never fire), and the format of `operationDate`.

### 2.5 Data: migration `0096_billing_netopia.sql`

Principles:

- **Forward only and replayable.** The xMoney objects of 0085–0093 stay; this migration supersedes them. Every rename,
  column addition and constraint replacement is guarded by a catalogue check, so the file can run twice.
- **It applies on every database.** That means an empty billing schema (every real deployment) and a developer
  database that holds xMoney-era rows made by the dev-stack fakes. Such rows are kept as inert history: they are marked
  `payment_provider = 'xmoney'`, and no code acts on them (§2.5.4).
- New tables follow the billing rules: append-only, the truncate guard, the verify block, ciphertexts under the
  records key with their `key_id`, no foreign key to the user, and grants to `debateai_billing_runtime` only.

#### 2.5.1 Provider-neutral columns

| Table | Change |
|---|---|
| `billing.charge` | adds `payment_provider text NOT NULL` in two steps: `ADD COLUMN … DEFAULT 'xmoney'` (fills existing rows without an UPDATE, which the append-only guard would refuse), then `DROP DEFAULT`, so every new row must name it; CHECK `IN ('xmoney','netopia')`. Renames `xmoney_environment` to `payment_environment`; its CHECK becomes `(payment_provider = 'xmoney' AND payment_environment IN ('stage','live')) OR (payment_provider = 'netopia' AND payment_environment IN ('sandbox','live'))`; the unique key becomes `(charge_id, payment_provider, payment_environment)` |
| `billing.charge_event` | adds `payment_provider` the same way; renames `xmoney_environment` → `payment_environment`, `xmoney_transaction_id` → `provider_payment_id`, `xmoney_created_at` → `provider_created_at`; the FK to `charge` covers the three key columns; the digits-only CHECKs apply to `xmoney` rows only, `netopia` rows take `^[A-Za-z0-9_.:-]{1,64}$`; `refunds_transaction_id` must be NULL on `netopia` rows (NETOPIA reports a refund as a status of the payment itself); the unique indexes are re-keyed on the renamed columns plus `payment_provider`; the refund-sum trigger function (0086 `:100-176`, plpgsql that names the renamed columns) is replaced |
| `billing.subscription_event` | adds `card_token_id uuid NULL` (no foreign key, so a token can be deleted, §2.15); the kind CHECK adds `CARD_SAVED` (§2.5.5); `xmoney_order_id`, `xmoney_customer_id` and `card_ref` stay for old rows, and new code never writes them; the CHECK `subscription_event_activation_names_order` becomes `kind <> 'ACTIVATED' OR period_anchor_at IS NOT NULL` (an ACTIVATED needs its anchor, nothing provider-specific); the CREATED check accepts `data.payment_provider` + `data.payment_environment` (`'netopia'`, `'sandbox'`/`'live'`) besides the old `data.xmoney_environment` |
| `billing.outbox` | the kind CHECK adds `PAYMENT_REFUND` (`XMONEY_REFUND` stays for old rows; new jobs never use it) |
| `legal.acceptance` | `surface` adds `UPGRADE` and `CARD_CHANGE`, so the card-saving agreement can be recorded where a new card is saved (§2.18) |

The plan's migration task lists every object that names a renamed column (by catalogue query, not by memory) and
replaces each one in this migration; the review found the refund-sum trigger to be the only one today.

#### 2.5.2 New tables

| Table | Holds | Foreign keys and purge |
|---|---|---|
| `billing.payment_notice` | `notice_id uuid PK`, `payment_provider`, `payment_environment`, `received_at`, `body_sha256` UNIQUE, `order_id text` (whatever NETOPIA named, nullable when unreadable), `provider_payment_id`, `provider_status smallint`, `amount_text`, `currency`, `card_country` (every content column nullable: a verified message is stored whatever it holds), `key_fingerprint`, `jwt_iat text`, `allowed_ciphertext` + `key_id` (an **allow-list** of the body's fields, sealed: order id, ntpID, status, amount, currency, code, message, card country, panMasked's last four, the token's expiry; never the token, never any field not on the list) | none; ten-year purge |
| `billing.payment_notice_raw` | `notice_id PK` → `payment_notice`, `raw_ciphertext` + `key_id` (the verified bytes as received, sealed, token included), `stored_at` | deleted after 14 days by `billing.purge_short_lived(now)`; kept only so a message that failed to parse can be read again after a fix |
| `billing.notice_quarantine` | `quarantine_id uuid PK`, `received_at`, `reason`, `order_id` (as the unverified body names it), `raw_ciphertext` + `header_ciphertext` + `key_id` (sealed) | deleted after 14 days by `billing.purge_short_lived`; never acted on unless it verifies later (§2.7.4) |
| `billing.payment_notice_outcome` | `notice_id`, `at`, `outcome` (A21's pattern: processing is a following row) | → `payment_notice`; ten-year purge, before its notice |
| `billing.card_token` | `token_id uuid PK`, `customer_id` (NULL only for a tool order's card), `payment_provider`, `payment_environment`, `source_charge_id text NULL`, `source_tool_order text NULL`, `source_notice_id uuid NULL`, `source_paid_at timestamptz NULL` (the source payment's time, for ordering, §2.15.2), `token_ciphertext` + `key_id`, `exp_month smallint NULL` (1–12), `exp_year smallint NULL`, `last4 text NULL` (`^[0-9]{4}$`), `card_country` (nullable), `created_at` | no foreign keys, so a token can always be deleted; deleted by `billing.purge_revoked_card_tokens(now)` one day after revocation |
| `billing.card_token_revocation` | `token_id PK`, `at`, `reason` (`PLAN_ENDED`, `REPLACED`, `NOT_ADOPTED`, `TOOL_ORDER`, `OTHER_SYSTEM`, `ERASURE`, `OWNER`); inserted with `ON CONFLICT DO NOTHING` | none; content-free, kept ten years |
| `billing.hosted_payment` | `charge_id PK` → `charge`, `payment_provider`, `payment_environment`, `provider_payment_id`, `redirect_ciphertext` + `key_id` (NETOPIA's payment URL, sealed: it lets anyone pay our order), `started_at` | ten-year purge, before its charge |
| `billing.status_read` | `charge_id`, `at`, `outcome` (the state read, or the error code): one content-free row per status read (§2.14) | → `charge`; ten-year purge, before its charge |
| `billing.tool_order` | `order_id PK` (`^t-[0-9a-f]{30}$`), `payment_environment`, `created_at`, `purpose` (`SANDBOX_RECORDING`, `LIVE_TEST`): the owner-run tool's orders, which are not charges (§2.20.3) | ten-year purge |

- **The sanctioned delete paths** are SECURITY DEFINER functions under the A15 guard (`debateai.retention_purge`):
  `billing.purge_revoked_card_tokens(now)` and `billing.purge_short_lived(now)`, both called by the daily owner job, and
  the ten-year `billing.purge_expired_records`, replaced to cover the new tables in the order the table above gives.
  Their EXECUTE goes to `debateai_billing_runtime` only.
- **Indexes** for the checks (§2.14): open NETOPIA charges by next read, SUCCEEDED NETOPIA charges by age, notices by
  `(order_id, received_at)`, live tokens by customer, quarantine by `received_at`.

#### 2.5.3 The sealed records

- **The billing profile** (`records.ts` `BillingProfileSchema`, sealed JSON) gains `firstName`, `lastName`, `phone` and
  `paymentIp` (the internet address of the person's latest payment made in person: a checkout, an upgrade or a card
  change). They are nullable in the schema, so older profiles still open; a NETOPIA checkout always writes them. The
  old single `name` stays for older profiles.
- **The quote's location** (`QuoteLocationSchema`) gains `firstName`, `lastName` and `phone`; `name` becomes
  "first + last" for the invoice issuers (R-15 keeps working unchanged).
- **The payer** sent to NETOPIA is built from the newest profile: names, phone and address from it, the email from the
  account's **current** address (A29 (k)) while the account exists. Invoices and tax keep using the first checkout's
  sealed quote location (`stored-tax-context.ts:34-59`), so a correction made on the card page reaches NETOPIA only.

#### 2.5.4 Old xMoney rows and jobs

Every reader that acts on payments (VERIFY_PAYMENT, RefundDesk, renewals, the reconciler, the owner commands, the
other-system guards) reads `payment_provider` and `payment_environment` together, and treats a row of another provider
or environment exactly as A22's "other system" is treated today: DEAD `OTHER_PAYMENT_SYSTEM` for a job, skipped by the
timers, refused by the commands. Two job kinds need their own handler so that old rows end instead of staying queued:
`XMONEY_REFUND` jobs, and VERIFY_PAYMENT jobs whose ref is an xMoney number; both end DEAD `OTHER_PAYMENT_SYSTEM`. The
live boot's refusal while records of another system are open (`BILLING_STAGE_RECORDS_OPEN`) becomes
`BILLING_OTHER_SYSTEM_RECORDS_OPEN` and covers xMoney-era rows too.

#### 2.5.5 The subscription fold (`packages/billing-core/src/subscription.ts`)

- The provider and environment come from CREATED: `data.payment_provider` and `data.payment_environment`, or, for an
  old row, `data.xmoney_environment` read as provider `xmoney`. `SubscriptionState` replaces `xmoneyEnvironment` with
  `paymentProvider` and `paymentEnvironment`, and keeps `xmoneyOrderId`, `xmoneyCustomerId` and `cardRef` readable for
  old rows.
- **ACTIVATED** is legal without a card (a first payment whose message carried no token still starts the plan).
- **CARD_CHANGED** requires `card_token_id` on a NETOPIA subscription.
- **CARD_SAVED** (new kind) adopts a saved card that arrived after the deciding event; legal while ACTIVE, PAST_DUE or
  SUSPENDED; it changes nothing but the card.
- ACTIVATED, RENEWED, UPGRADED, CARD_CHANGED and CARD_SAVED may carry `card_token_id`; the state's `cardTokenId` is the
  newest one (§2.15.2).
- `renewable()` (`renewal.ts:81-85`) and `createRetryCharge` (`:547`) no longer need a payment handle: a plan with no
  usable card renews into a `CARD_NOT_SAVED` attempt (§2.9.2), never into silence.

#### 2.5.6 Grants

Each new table grants `SELECT, INSERT` to `debateai_billing_runtime` (and nothing to `debateai_runtime`), the purge
functions grant EXECUTE to the billing role only, and 0096 ends with a copy of 0093's contract block (`:87-155`), which
checks again that every billing table is granted to the billing role and to no one else. The outbox's column-level
UPDATE grant already covers `not_before` (A19), which §2.7.3 uses.

### 2.6 Checkout

#### 2.6.1 The quote (`POST /v1/billing/quote`)

- The request (`BillingQuoteRequestSchema`) gains `first_name`, `last_name` and `phone`, and requires `street`,
  `city` and `postal_code` for every paid checkout. `region` stays required for the US, Canada and Romania (A31 (h),
  R-15). The company block is unchanged.
- `postal_code` is optional only for countries in a static no-postcode list in billing-core (to start: `IE`, where
  many addresses are used without their Eircode); NETOPIA then receives `""`.
- `phone`: the page offers the country's calling code; the server stores `+` followed by 8–15 digits (E.164).
- `address_required` in the answer becomes always true for a paid checkout; the page shows the billing block from the
  start.
- Every quote now stores names and a phone number; go-live row 45 (the data of checkouts that never paid) says so.

#### 2.6.2 Starting the payment (`POST /v1/billing/checkout`)

The steps are today's (`checkout.ts:156-263`) with the xMoney parts replaced:

1. Quote, address, country gate, consents and the owner lock, unchanged. The rules of §2.6.3 replace
   `listedPaymentUnderway` and `reusableCharge`.
2. No customer is created at the processor (NETOPIA has no customer object). `ensureCustomer` keeps our own
   `billing.customer`; `billing.customer_xmoney` is no longer written.
3. The billing profile event is sealed with the payer and `paymentIp` = the request's address.
4. The CREATED event (with `data.payment_provider` and `data.payment_environment`), the INITIAL charge (with its
   `payment_provider`), its REQUESTED row and the quote's one use, as today.
5. `startHostedPayment` with the payer, `clientId` (§2.6.4), `returnUrl` = `PUBLIC_APP_URL/checkout/return?charge=<ref>`
   and `notifyUrl` = `PUBLIC_APP_URL/api/v1/billing/netopia/notify`.
6. Its answer writes, in one transaction, the `billing.hosted_payment` row and the charge's SUBMITTED event with
   `provider_payment_id` = NETOPIA's `ntpID`.
7. The answer is `{redirect_url, charge_ref, environment}` (`BillingCheckoutResponseSchema` replaced). The page sends
   the browser there with a top-level navigation (`window.location.assign`), never a frame or a fetch.
8. A start that fails with `PAYMENT_PROVIDER_UNAVAILABLE`, `PAYMENT_CREDENTIALS_REFUSED` or
   `PAYMENT_CONFIGURATION_REFUSED` writes FAILED on the charge (with that code) and answers **503
   `PAYMENT_PROVIDER_UNAVAILABLE`** (a configuration refusal also alerts the owner, O3). A `PAYMENT_OUTCOME_UNKNOWN`
   start leaves the charge REQUESTED with no payment URL: nobody can pay an order whose page never reached them, and
   §2.6.3 abandons it at the next checkout.

#### 2.6.3 One open checkout at a time

Today's rule (A3 (b), D7 #5) stays: a person has at most one CREATED subscription, and a payment already on its way
answers **409 `CHECKOUT_PENDING`** with its charge. With NETOPIA, under the owner lock, the open CREATED subscription's
INITIAL charge is classified from our rows and one status read (`status(orderId, best ntpID)`):

| The open charge | What the new checkout does |
|---|---|
| **paid or almost**: SUCCEEDED; or the newest stored message, or the status read, says `PAID`, `AUTHORIZED`, or `PENDING` with NETOPIA status 6, 13, 14 or 18; or the status read fails (the safe side) | 409 `CHECKOUT_PENDING`: the page shows the waiting screen |
| **reusable**: younger than 30 minutes, the same plan, total, environment and buyer, a stored payment URL, and not final (untouched (status 1), declined (the person may retry on the same page) or waiting for the bank's check (status 15)) | the same payment URL again; no second start |
| **anything else**: older, another purchase, no stored URL (an unknown start), or a final failure | `ENDED(ABANDONED, NEW_CHECKOUT)`, then a new checkout |

- `inFlightAttemptLifeMs` (20 minutes) still bounds how long a not-final payment counts as "almost paid".
- A payment that arrives for a checkout ended meanwhile follows A8 (c): it activates the plan when the person has no
  other live plan, and otherwise it is refunded in full as `ALREADY_SUBSCRIBED` (an owner refund while §2.12's owner
  mode applies). §2.14 keeps reading such charges for 30 days, so a late payment is never missed.

#### 2.6.4 The client id

`clientId` is our `billing.customer.customer_id` written as 32 lower-case hex characters (the uuid without its dashes),
the same for every payment of that customer. NETOPIA ties the saved card to it; NETOPIA says a token is valid across
the company. Whether NETOPIA accepts this format is N-2.

#### 2.6.5 The return page

`/checkout/return?charge=<ref>` is today's page and poller (`ChargeStatusPoller`, every 2 s for 2 minutes, then "We'll
email you as soon as your bank confirms"). NETOPIA's page sends the person back by itself 10 seconds after a success,
or when they press "Back to shop". Two changes:

- `GET /v1/billing/charges/{charge_ref}` also returns the charge's `kind`, so the same page words an upgrade's
  confirmation (§2.10).
- When the poller reads a charge that has been PENDING for more than 20 seconds since its SUBMITTED event, the route
  asks for a check now (§2.7.3 step 4's "bring forward"), so a late or lost message never leaves the person waiting.

### 2.7 NETOPIA's message: the route and the intake

#### 2.7.1 The route `POST /v1/billing/netopia/notify`

- Registered like today's notify route (`apps/api/src/billing/index.ts:317-328`): `auth: "public"` in the inventory
  (resource `billing`, action `notify`), no session, no CSRF; the route list and the `s7-authorization` pins renamed.
- **The raw body, whatever its content type.** For this one route a root-level content-type parser accepts any type and
  keeps the bytes (a `Buffer`, 64 KiB at most) without parsing them; every other route keeps Fastify's JSON parsing and
  its 415s. The form parser of the xMoney route goes.
- **The header.** NETOPIA's JWT arrives in `Verification-token`. The UI proxy forwards only allow-listed request headers
  (`apps/ui/app/api/[...path]/route.ts:14-31`); `verification-token` joins the list, and a proxy test proves the
  header and the exact body bytes reach the API.
- **Verification before admission.** The route verifies first. A verified message is never refused for volume. Only a
  message that fails verification is charged to the `billingNotify` budget (120 a minute per source network), and is
  answered 429 when over it.
- **No redirect on the way.** NETOPIA does not follow redirects for its message (third-party reports, N-18), so
  `PUBLIC_APP_URL` must be the exact public origin; the check command (§2.17.3) tests that the notify address answers
  a GET without a redirect.

#### 2.7.2 The answers

| Case | HTTP | Body |
|---|---|---|
| verified (stored now, or stored before: same body hash) | 200 | `{"errorType":0,"errorCode":0,"errorMessage":"OK"}` |
| not verified (any `NOTICE_*` reason) | 503 | `{"errorType":1,"errorCode":<NETOPIA's SDK constant for the reason, as a JSON number: 268435713 general, 268435714 signature, 268435717 audience, 268435718 tainted payload>,"errorMessage":"retry"}` |
| the database write failed | 503 | `{"errorType":1,"errorCode":1,"errorMessage":"retry"}` |
| not verified and over the admission budget | 429 | today's envelope |

- `Content-Type: application/json` on every answer. NETOPIA's official SDK answers with the three keys; NETOPIA's
  support told two integrators the body must hold `"errorCode": 0`; the success body satisfies both (N-7).
- **Why an unverified message is "try again", never "OK" (ruling C-4).** The saved card comes only once. If our trusted
  key were wrong or out of date, an "OK" would make NETOPIA stop sending, and every card of that period would be lost.
  A "try again" keeps NETOPIA sending while the owner fixes the key, and the quarantine (§2.7.4) keeps a copy in case
  NETOPIA stops first. A forged message gains nothing either way.

#### 2.7.3 The intake (`notice-intake.ts`) for a verified message

In **one** database transaction, before the answer:

1. Insert `billing.payment_notice` (`ON CONFLICT (body_sha256) DO NOTHING`, so a resent message is a no-op) and
   `billing.payment_notice_raw`. Parsing is tolerant: a field that cannot be read is stored as NULL, and a body that
   cannot be read at all is stored with the outcome `PARSE_FAILED`, the audit line `billing.notice.parse_failed` and an
   O3 to the owner; it is answered 200 like any verified message.
2. **Match the order.** A charge of ours: its `payment_provider` and `payment_environment` label the rows. A tool order
   (`billing.tool_order`): the tool's environment. Anything else: the API's environment and the outcome
   `UNKNOWN_ORDER`, with the audit line `billing.notice.unknown_order`.
3. If the message carries a saved card, insert `billing.card_token`: the token sealed, its expiry, the last four
   digits, the card's country, `source_notice_id`, `source_paid_at` (§2.4.3's time, else `received_at`) and, for a
   charge, `source_charge_id` and the charge's `customer_id`; for a tool order, `source_tool_order` and no customer. No
   token is stored for an unknown order, or for a charge of another provider or environment (`OTHER_SYSTEM`).
4. For a charge of ours, queue VERIFY_PAYMENT (ref = the charge id). If a live one is already queued, **bring it
   forward**: set its `not_before` to now. A tool order gets the outcome `TOOL_ORDER` and no job.
5. Commit, then answer 200 and kick the outbox.

The intake changes no subscription state. Storing the token before answering is the whole point of the
transaction: the sales contact says NETOPIA never sends it again.

**Provider-only mode (ruling C-9).** When the deployment is hosted, the NETOPIA settings are complete and billing is
off, the API builds the NETOPIA connector and serves only this route. The intake then handles tool orders only; every
other verified message is stored with the outcome `BILLING_OFF`, with no token and no job. The test tool and the check
command work in this mode; nothing else of billing runs.

#### 2.7.4 A message that fails verification

1. If `quarantinable` (§2.4.6) holds, the header and the raw bytes are sealed into `billing.notice_quarantine` (14
   days), with the reason.
2. **At every API start** (the trusted keys are read at start, so a fixed key list arrives with a restart), every
   quarantined message is verified again with the current keys. One that now verifies goes through §2.7.3 as if it had
   just arrived; its quarantine row is left to the purge.
3. **Alerts.** A rejected message that names one of our open charges emails the owner at once (O4, English only: the
   reason code, the time, our charge reference, and "check the NETOPIA key with the check command"), at most one O4 an
   hour. Every other rejection goes into a daily count in the owner's daily summary. Every rejection writes the
   content-free audit line `billing.notice.unverified {reason}`.

### 2.8 VERIFY_PAYMENT (`verify-payment.ts`)

The job's ref is our charge id. A notice, a saved-card charge's answer, the poller (§2.6.5) and the reconciler
(§2.14) all queue it or bring it forward; it always decides from NETOPIA's **current** status, so the order in which
messages arrive does not matter (NETOPIA may send several messages for one order: a person can retry a declined card on
the same page).

1. **The other-system guard** (§2.5.4).
2. **Read the status:** `status(orderId = charge_id, providerPaymentId = the best ntpID)`, where the best ntpID is the
   charge's SUBMITTED one, else the newest stored notice's for that order, else none (N-16). When the read fails, the
   job is retried on the not-final schedule (1 m, 5 m, 15 m, 1 h, 6 h, 24 h). When the schedule is spent and the newest
   stored notice for the charge was verified, the job decides from that notice (NETOPIA signed it) and records the
   outcome `DECIDED_BY_NOTICE`. A renewal's job is never left to die: §2.9.4 takes over.
3. **Decide by state** (§2.4.4):
   - `PENDING`, `ACTION_REQUIRED`, `AUTHORIZED`: not final, retried on the not-final schedule, then left to §2.14 —
     except a renewal's `ACTION_REQUIRED` (§2.9.2) and a 0 card check's `AUTHORIZED` (§2.11).
   - `PAID`: first **check the payment matches the charge**: the amount exactly (micros from NETOPIA's decimal text) and
     the currency; when NETOPIA echoes a `clientId`, it must be the charge's customer's. A mismatch is DEAD
     `PAYMENT_AMOUNT_MISMATCH` or `PAYMENT_CUSTOMER_MISMATCH` (one content-free audit line, O3). Then SUCCEEDED (dated by
     `occurredAt`, else now), today's settlement for the charge kind (INITIAL, RENEWAL, UPGRADE, CARD_CHECK), the
     location evidence with the card's country (`decideCardCountry`: unknown is MISMATCH, never BLOCKED), the invoice
     job and the emails, in one transaction (A3 (f)). The saved card is adopted as §2.15.2 says.
   - `DECLINED`: FAILED(`PAYMENT_DECLINED`, `bankDeclined`). For an INITIAL, UPGRADE or CARD_CHECK charge nothing else
     changes: the person may retry on NETOPIA's page, and the waiting screen says NEEDS_ACTION, as today.
   - `FAILED`: FAILED(`PAYMENT_FAILED`). `EXPIRED`: FAILED(`PAYMENT_EXPIRED`).
   - `VOIDED`: FAILED(`VOIDED`) before SUCCEEDED; a full REFUNDED after it (A9).
   - `REFUNDED`: §2.12.4. `CHARGEBACK_*`: §2.13.
   - `UNCLEAR` (ruling C-7): nothing is recorded on the charge; the outcome `OWNER_REVIEW`, the audit line and an O3
     naming the status. The owner decides with the existing commands.
4. Matching is simple now: NETOPIA's `orderID` is our charge id for every charge, so A1's order-id lookup, A29 (a)/(b)'s
   customer checks on an order, MAYBE_REBILL/DUPLICATE on one order and the separate refund and dispute transactions
   (A29 (f)) go. A second PAID charge of the same person (two orders paid in two tabs) is today's
   `ALREADY_SUBSCRIBED` or `DUPLICATE_PAYMENT` refund.
5. **The tax records.** Quaderno's sale and refund records (`packages/tax-quaderno/src/index.ts:173, 204-232`) send
   `processor: "netopia"` and `processor_id` = NETOPIA's `ntpID`, and look a duplicate up by that id. Whether Quaderno
   accepts the value `netopia` is checked by the existing connector recording; if it does not, the value is `other`.

### 2.9 Renewals, retries and unknown outcomes

#### 2.9.1 What stays

The renewal timer, the price (the subscriber's net plus a fresh tax quote), A7's notice and postponement, the Q-1
72-hour hold, the dunning `[1, 3, 7]` with M5A–C and M6, retries as new charge rows at the failed attempt's total
(A29 (g)), and every hold of `renewal-rules.ts` are unchanged. Only the call inside `RenewalService.submit`
(`renewal.ts:601-629`) and the recovery of §2.9.3 change.

#### 2.9.2 The charge

1. Before calling, the renewal needs a **usable saved card** (§2.15.2) and a **complete payer** (§2.5.3). Without one,
   the attempt fails with no call: FAILED(`CARD_NOT_SAVED`), which is not the bank (no "your bank refused" sentence),
   and the dunning begins, with M5's "update your card" line. §2.15.3's reminder normally prevents this.
2. The REQUESTED row and the call-started marker, fenced on the lease, as today.
3. `chargeSavedCard` with the token, `payerIp` = the profile's `paymentIp` (else the checkout quote's address) (N-12),
   the payer, and `orderId` = the new charge id.
4. The answer, in one transaction:
   - **A report:** SUBMITTED with its `ntpID`; **a saved card in the answer is stored at once** as a `card_token` row
     (`source_charge_id` = this charge), because NETOPIA issues a new token with each token payment; then
     VERIFY_PAYMENT for the charge. A `DECLINED` report also writes FAILED at once (with `bankDeclined`), as a 402 does
     today.
   - **`ACTION_REQUIRED`** (the bank wants its security check on a merchant-initiated payment), from this answer or from
     any later status or message: FAILED(`AUTHENTICATION_REQUIRED`), not the bank's refusal. Nobody is present to
     finish the check, so a renewal never waits for it. M5 then says "Your bank asked you to confirm this payment. Please
     confirm your card in Settings, and we'll try again." (`mail.M5.confirmCard`, 35 locales). The card change (§2.11)
     is that confirmation, and the next retry uses its new card.
   - **`PAYMENT_PROVIDER_UNAVAILABLE`, `PAYMENT_CREDENTIALS_REFUSED`, `PAYMENT_CONFIGURATION_REFUSED`** (ruling C-8):
     nothing was charged and the cause is not the person's card. REQUESTED with `CHARGE_NOT_SENT`,
     `CHARGE_CREDENTIALS_REFUSED` or `CHARGE_CONFIGURATION_REFUSED`, retried after 1, 5, 15 and 60 minutes and then
     hourly within the Q-1 hold (the plan stays paid, no email to the person). A credentials or configuration refusal
     also emails the owner at once (O3), once per code and hour.
   - **`PAYMENT_OUTCOME_UNKNOWN`:** SUBMIT_UNKNOWN, then §2.9.3.

#### 2.9.3 An unknown outcome

A2's listing adoption is gone; probing the same orderID replaces it. Every step probes **the same orderID**, so one
renewal can never become two payments:

1. After at least one minute: a **status read** by orderID, with the ntpID of any stored message for that order. A
   report decides (SUBMITTED with its ntpID, then VERIFY_PAYMENT); `NO_SUCH_ORDER` means the call never arrived.
2. When the read cannot answer, or answered `NO_SUCH_ORDER`, after 30 quiet minutes: a **resend with the same
   orderID**. NETOPIA either processes it (the first never arrived) or answers `56` with the existing payment (it did),
   which decides.
3. Steps 1 and 2 repeat hourly until there is a definite outcome or the window ends (72 hours for the first attempt,
   24 hours for a retry, as today).
4. At the window's end, the attempt is closed FAILED(`NO_TRANSACTION`) only when the last probe answered
   `NO_SUCH_ORDER` or a final unpaid state. **An order NETOPIA confirmed to exist (`56`, or a not-final status) is never
   closed:** the renewal keeps holding and the owner is emailed (O3 `RENEWAL_OUTCOME_OPEN`).
5. **Before any dunning retry** (a new charge with a new orderID), every earlier attempt of the same period is probed
   again; one found PAID settles the period (RECOVERED) and no retry is made.

The safety of step 2 rests on NETOPIA's documented error 56 holding for token payments, including while the first
payment is still being processed (N-15). Until NETOPIA confirms it, go-live row N-15 keeps billing off.

#### 2.9.4 A renewal that stays pending

A renewal whose status stays `PENDING` gets a deadline: the end of its window (72 hours for the first attempt, 24 hours
for a retry). Until then §2.14 reads it on its schedule. At the deadline, a status read that shows a final unpaid state
records FAILED and the dunning starts; anything else keeps the renewal held and emails the owner (O3
`RENEWAL_OUTCOME_OPEN`). Paid access never lapses silently: while a renewal is held, A8's `paid_through` follows the
Q-1 hold, and the owner knows.

### 2.10 Upgrades (ruling C-1)

- `upgrade-quote` is unchanged (A6 credit, proration, two Quaderno quotes).
- `POST /v1/billing/subscription/upgrade` records the card-saving agreement (§2.18), creates the UPGRADE charge (period
  from the quote's creation to the period end) and starts a **hosted payment** for the prorated total, with the payer
  from the profile, `clientId`, and `returnUrl` = `/checkout/return?charge=<ref>`. It answers
  `{redirect_url, charge_ref}`; Settings sends the browser there.
- VERIFY_PAYMENT's `PAID` runs today's upgrade settlement (UPGRADED with A6's credit and the same anchor). The upgrade's
  saved card becomes the subscription's card (§2.15.2). A declined upgrade stays payable on NETOPIA's page.
- **One open upgrade at a time.** A second request for the same quote while the first is reusable (under 30 minutes,
  not final) returns the same payment URL; one that is paid or almost (§2.6.3's first row) answers 409
  `UPGRADE_PENDING`. After the quote's lifetime (30 minutes) an unpaid upgrade **closes** (FAILED `NO_TRANSACTION`): it
  no longer blocks a new upgrade and no longer holds the renewal (today's Q-1 rule for an unsettled upgrade,
  `renewal.ts:306-316`, then lets the renewal go on).
- **A late payment** for a closed upgrade is still applied when the upgrade can still buy something (the same period,
  the same plan); otherwise today's settlement refunds it in full (`upgrade.ts:404-416`), and the person is emailed
  that it is being refunded (M11's refund line).

### 2.11 Changing the card (ruling C-2)

- `POST /v1/billing/subscription/card` records the card-saving agreement (§2.18), creates a CARD_CHECK charge with
  amount **0** (`cardCheckHoldMicros()` becomes 0) and starts a hosted payment with `clientId`, the payer and
  `returnUrl` = `/settings/card?charge=<ref>`. The page first shows the billing details, filled in from the profile, so
  the person can correct their name, phone and street (the country and region are shown but read-only: they are the
  tax location, §2.5.3); the request writes a new profile event with `paymentIp`.
- **A card check succeeds only once its saved card has arrived.** VERIFY_PAYMENT treats `PAID` or `AUTHORIZED` (nothing
  is captured at 0) as success **when a token from this charge is stored**; without one it stays not final for 15
  minutes (the message may come after the status), then FAILED(`CARD_NOT_SAVED`). The page then says "Your card was
  checked, but it couldn't be saved for your monthly payments. Please try again with a card instead of a wallet."
  (`billing.card.notSaved`, 35 locales), and nothing else changes: no dunning retry is used.
- On success: CARD_CHANGED with the new `card_token_id`; the old token is revoked (`REPLACED`); a 0 check needs no
  release (A31 (j)), so no refund and no owner email follow. For a plan behind on payment, today's `retry_now` then
  runs.
- The other CARD_CHECK outcomes (`CARD_CHECK_REFUSED` for an always-blocked country, `CARD_CHECK_DEFERRED`,
  `CARD_CHECK_NOT_LIVE`) are today's, without any refund, and their token is revoked (`NOT_ADOPTED`).
- If NETOPIA answers that a 0 check makes no saved card (N-11), go-live row N-11 keeps billing off and the owner rules
  again (a small charge refunded by the owner, or no separate card change).
- The card page's sentence is today's `billing.card.noHoldNote` ("no money is held"); `holdNote` goes.

### 2.12 Refunds (ruling C-3)

#### 2.12.1 What stays

RefundDesk stays the one executor (R-32): every reason it serves (`CARD_COUNTRY_BLOCKED`, `ALREADY_SUBSCRIBED`,
`SUBSCRIPTION_ENDED`, `WITHDRAWAL`, `CARD_CHECK_*`, `DUPLICATE_PAYMENT`), the `REFUND_REQUESTED` row written first in
its own transaction, the refund-sum guard (0086), the split newest-first (A4 (b)), the withdrawal's acknowledgements
(A29 (l)), and the follow-ups after REFUNDED (M8, M11, the credit note). Its job kind becomes `PAYMENT_REFUND`. The
0.00 card-check release stays recorded with no call, ahead of everything below, so a card change never emails the owner.

#### 2.12.2 The owner mode (while the port has no `refund`)

1. The job writes the stage `OWNER_REFUND_DUE` and emails the owner **O2_REFUND_DUE** (English only): the reason, our
   charge reference, NETOPIA's payment number, the exact amount and currency, whether it is the whole payment, what to do
   ("refund exactly this amount on this payment in NETOPIA's admin, in one refund"), for a withdrawal its legal deadline
   (`withdrew_at` + 14 days of 24 hours, art. 13(1), never moved to a weekday), and, for a partial refund, the exact
   command to run once it is done. The job is then done; the open `REFUND_REQUESTED` row is what stays open.
2. Daily, the reconciler reads the status of every charge with an open owner refund (§2.14).
3. Reminders: the daily pass emails the owner one list of the open owner refunds, on the day a refund becomes due, then
   every third day, and every day from three days before a withdrawal's deadline (O2_REFUND_REMINDER, English only).
4. `pnpm billing:refund-done --charge <ref> --amount <decimal> --confirm` records a refund the owner made: REFUNDED at
   `--amount` (never above the open request), then the same follow-ups. It first prints what it will record and what the
   person's email will say, and records only with `--confirm`. An amount below the request records that part and keeps
   the rest open (and reminded). It refuses a charge of another system and one with no open refund request.

#### 2.12.3 The API mode (once NETOPIA confirms its refund call, N-10)

The package then offers `refund` (`POST {base}/operation/credit` with `{ntpID, amount}`), RefundDesk calls it, and
today's look-before-retry rule (A4 (c)) uses the status read: a payment already `REFUNDED` is recorded, never refunded
again. Turning the API mode on is a code change made after the sandbox recording proves the call, never a setting.

#### 2.12.4 A refund NETOPIA reports

- A `REFUNDED` status on a charge whose open request covers **the whole payment** records REFUNDED at that amount.
- A `REFUNDED` status on a charge whose open request is **partial** records nothing on its own (NETOPIA may report a
  whole and a partial refund alike, N-8): the reminder says the refund was seen and asks for the command of §2.12.2
  item 4.
- A `REFUNDED` status with no request of ours is a refund made in NETOPIA's admin by hand: today's `PROVIDER_REFUND`
  path (A9, A29 (q), A31 (l), (o)), with the remaining amount as the upper bound, the owner's credit note recorded with
  `pnpm billing:invoice --amount`, and `REFUNDED_BEFORE_START` for a checkout that never started.
- N-8 (which statuses NETOPIA reports for refunds, and whether it reports the amount) is a gate: the automatic record
  of a whole refund relies on it.

### 2.13 Charge-backs (ruling C-7)

- `CHARGEBACK_OPENED` (status 9): CHARGEBACK, then today's SUSPENDED + FREE entitlement + M10 for a live plan, and no
  plan change for a second payment.
- `CHARGEBACK_LOST` (status 10, "chargeback accepted"): when no CHARGEBACK is recorded yet, CHARGEBACK and SUSPENDED
  first, as for status 9; then the outcome `OWNER_REVIEW` and an O3 saying NETOPIA reports the dispute lost. The owner
  ends the plan with `pnpm billing:dispute --outcome lost` (or `won`), as today. It is never automatic until NETOPIA
  confirms the status's meaning (N-8).
- `CHARGEBACK_REPRESENTED` (status 16): when no CHARGEBACK is recorded yet, CHARGEBACK and SUSPENDED first; then
  CHARGEBACK_REPRESENTED, no further change.
- `billing:dispute` keys on `provider_payment_id`.

### 2.14 The checks that replace the transaction listing

NETOPIA has no transaction listing (its API has no reporting route, N-19). The reconciler (`reconcile.ts`) reads
statuses instead, and queues or brings forward VERIFY_PAYMENT for every charge whose status says something our rows do
not yet record. Each read writes a `billing.status_read` row, and each charge's **next read** follows its own schedule:

| Charges | Read |
|---|---|
| open (REQUESTED with a stored payment URL, SUBMITTED, SUBMIT_UNKNOWN), not final | 10 min, 30 min, 1 h, 3 h after the submit, then daily up to 30 days |
| closed unpaid hosted payments (FAILED `NO_TRANSACTION` or ABANDONED checkouts and upgrades) | daily for 30 days, so a late payment is never missed (N-25 asks how long NETOPIA keeps a page payable) |
| renewals held under §2.9.3 or §2.9.4 | hourly until decided |
| SUCCEEDED | at 1, 7, 30, 60, 90 and 120 days after the payment, to catch refunds and charge-backs whose message was missed |
| with an open owner refund (§2.12.2) | daily until recorded |

- The frequent pass (every 10 minutes) takes the charges whose next read is due, **newest due first**, with a cursor
  across passes, at most 200 reads a pass; the rest wait for the next pass and none is starved (the cursor goes round).
- Each read is isolated: one that fails writes `billing.reconcile.status_failed {code}` and the pass goes on;
  `BILLING_RECONCILIATION_PENDING` still means only that the pass itself failed. A29 (o)'s listing failures and the
  hourly retry of refused listings go.
- At about 1,000 payments a month the reads stay near 300 a day; NETOPIA documents no limit (N-18).

### 2.15 The saved card

#### 2.15.1 Storage

`billing.card_token` (§2.5.2), sealed under the records key with the AAD naming the table, the column and the row, so
a ciphertext copied elsewhere does not open. Only VERIFY_PAYMENT, the renewal, the card-adoption step and the purge read
it. The plaintext lives only inside a `SecretToken`, between unsealing and the request.

#### 2.15.2 Which card a subscription uses

**One source of truth: the events.** The subscription's card is the `card_token_id` of its newest adopting event
(ACTIVATED, RENEWED, UPGRADED, CARD_CHANGED, CARD_SAVED), as long as that token is not revoked.

A token may be adopted only when **all** of these hold:

- its source charge belongs to this subscription and is SUCCEEDED;
- its source charge holds no refund request and no refusal (`CARD_CHECK_REFUSED`, `_DEFERRED`, `_NOT_LIVE`,
  `ALREADY_SUBSCRIBED`, `SUBSCRIPTION_ENDED`, `UPGRADE_CLOSED`, `DUPLICATE_PAYMENT`);
- a CARD_CHECK token only through the CARD_CHANGED that names its charge;
- its `source_paid_at` is not older than the current card's, and not older than the latest CARD_CHANGED (a late
  message from a replaced card never wins back).

Adoption happens in two places. **At the decision:** the settlement's event (ACTIVATED, RENEWED, UPGRADED,
CARD_CHANGED) carries the newest eligible token already stored for its charge. **After it:** when a token for an
eligible charge lands after the decision (a message after the status read), the intake's VERIFY_PAYMENT run writes
CARD_SAVED. A plan whose first message carried no token still starts; it simply has no saved card, and §2.15.3 asks for
one.

#### 2.15.3 Asking for a card before it is needed

A7's daily look-ahead job also checks, ten days before each renewal, whether the subscription has a usable card: one
exists, and its expiry month (when known) ends after the renewal. If not, it sends **M12** once per period (35
locales): "We'll need your card for your {plan} payment on {date}" with one of two lines: "The card we have expires
before then." or "We couldn't keep your card from your last payment." and a link to `/settings/card`.

#### 2.15.4 Deleting it (ruling C-5)

- A daily sweep revokes every token older than one day that is not the current card of a live plan (ACTIVE, PAST_DUE,
  SUSPENDED): the reason is `PLAN_ENDED`, `REPLACED`, `NOT_ADOPTED`, `TOOL_ORDER`, `OTHER_SYSTEM` or `ERASURE`, as it
  applies. A token whose source charge is not yet decided (no SUCCEEDED or final FAILED) is kept up to 30 days, so A8
  (c)'s late activation can still adopt it. An erasure commit revokes the owner's tokens at once.
- The daily owner job then calls `billing.purge_revoked_card_tokens`, so a revoked token is gone within about a day,
  and `billing.purge_short_lived`, which deletes raw messages and the quarantine after 14 days.
- The nightly backups keep deleted rows until the backups themselves expire; the Privacy Policy note says how long
  (§2.22).

### 2.16 Prices in USD, EUR or RON (Part C)

The owner chose to build for all three; one currency is published at a time (ruling C-6).

- **Only the price changes currency.** The AI credit stays in US dollars, because it is what the AI companies charge us
  (`monthly_credit_micros`, the cost envelopes, the budget package and the evaluator keep `"USD"`). A6's prorated
  credit and the withdrawal's credit share are ratios and do not change.
- `billingPlans.currency` becomes `"USD" | "EUR" | "RON"` (a new register version picks it; the example stays USD, $20 /
  $50 / $200). Prices are whole cents (or bani) as today.
- **Each subscription keeps its currency.** The quote records its currency (a column, Part C's migration) and CREATED
  records `data.currency`; every charge of a subscription (renewals, retries, upgrades) is made in the subscription's
  currency, at its own recurring price. Publishing another currency therefore changes only new subscriptions; no boot
  check and no publish refusal is needed.
- **A plan change between two currencies is refused:** an upgrade or downgrade whose target plan is now priced in
  another currency answers 409 `PLAN_CHANGE_CURRENCY_DIFFERS`, and Settings says "This plan change isn't available for
  your subscription. You can cancel and subscribe again in {currency}." (35 locales).
- `billing.charge.currency`'s CHECK becomes `IN ('USD','EUR','RON')`.
- Every `"USD"` literal on the price side follows the subscription's or the quote's currency: the contract
  (`BillingPlansResponseSchema`, the quote and charge answers), `TaxEngine.quote`, Quaderno's records, SmartBill's
  invoices (a RON invoice needs no BNR rate; EUR and USD keep today's BNR conversion), the mail renderer, the UI's money
  formatting, and the tax summary (every amount printed with its currency; a quarter with two currencies prints each
  separately).

### 2.17 Configuration, the guided setup and the check command

#### 2.17.1 Settings

| Setting | Where | Notes |
|---|---|---|
| `NETOPIA_API_BASE_URL` | `api.env` | one of §2.4.1's four; it also decides sandbox or live |
| `NETOPIA_POS_SIGNATURE` | `api.env` | private, not a secret |
| `NETOPIA_API_KEY_PATH` | `api.env` → custody file `/etc/debateai/api/billing/netopia-api-key` | secret, one line, 0600, owned by `debateai-api` |
| `NETOPIA_IPN_KEYS_PATH` | `api.env` → `/etc/debateai/api/billing/netopia-ipn-keys.pem` | not secret, but trusted: one or more PEM blocks, owned by root, mode 0644, never writable by `debateai-api` (a writable list would let anyone who controls the API user forge messages); the boot refuses otherwise |
| `XMONEY_*`, the UI's `XMONEY_SDK_ORIGIN` | — | removed; a boot that still finds one prints a warning naming it (never its value) |

- `BILLING_ENVIRONMENT_KEYS` and `readBillingEnvironmentGroup` (`runtime-environment.ts:639-710`) carry the new group,
  with today's codes (`BILLING_CONFIGURATION_INCOMPLETE:<KEY>`, `BILLING_CONFIGURATION_INVALID:<KEY>`). The owner
  commands that read the payment system's identity today through `XMONEY_API_BASE_URL` (`billing:withdraw`,
  `billing:invoice`, `runtime-environment.ts:339-368`) read `NETOPIA_API_BASE_URL`. The custody aliasing check covers
  the new files.
- **The sandbox clock** (`BILLING_STAGE_CLOCK_OFFSET_DAYS`) works only with a sandbox base and wraps the port
  (`TimeShiftedCardPayments`, §2.3).
- **The invoicer pairing guards** (`stage-clock.ts:130-169`, `main.ts:1133-1155`) are re-keyed on the payment
  environment: a sandbox base requires Quaderno's sandbox and a SmartBill address under `.invalid`; a live base allows
  neither. So a test payment can never reach a real fiscal invoice.

#### 2.17.2 The guided setup (`deploy/vps/billing-setup.sh`, run as root)

- Sections `netopia`, `quaderno`, `smartbill`, `owner-email`; run all, or one by name. Each section asks its values one
  at a time, in plain words, with where to find each one.
- **Secrets** are read with `systemd-ask-password` (never shown, never on a command line or in shell history) and
  written atomically (a temporary file in the same directory, then a rename) as custody files with `umask 0177`, owned
  by `debateai-api`, in the 0700 directory, as §14.2 of the runbook does by hand today. An existing key file is never
  replaced unless the owner asks (`--replace <section>`).
- **NETOPIA's public key:** the owner pastes the PEM block(s) NETOPIA gave (an empty line ends the paste), or chooses
  NETOPIA's published plugin key. The repository carries that key as `deploy/vps/netopia/published-ipn-key.pem`, with
  where it was read and its fingerprint in a comment. The script writes the file owned by root, mode 0644, and prints
  the fingerprint of every key in it.
- **Plain values** (the environment's base URL, the POS signature, the Quaderno and SmartBill addresses, the SmartBill
  series) go into one block of `/etc/debateai/api.env` between the lines `# >>> billing settings (billing-setup.sh) >>>`
  and `# <<< billing settings <<<`. The script replaces only that block, keeps a dated backup of the file with its
  original mode and owner, and comments out (with a note) any line outside the block that sets the same key, because
  systemd would use the later one.
- It ends by running the check command and printing its list.
- A test runs the script in a temporary root with answers on standard input (a test-only switch the script refuses
  outside its test root) and checks the files, their modes and owners, the block, the commented duplicates and that no
  answer is echoed.

#### 2.17.3 The check command (`pnpm billing:check`)

Run under `systemd-run` with the API's settings, like the other owner commands; it works with billing off. It prints
one line per item, a tick or a cross and a plain sentence, and **never a secret**:

- every billing setting present and well formed; the environment it implies;
- every custody file: exists, one line, mode and owner right (values never read into the output);
- the trusted-key file: owned by root, not writable by the API user, every key parses, RSA ≥ 2,048 bits, its
  fingerprint, and whether it is NETOPIA's published key;
- NETOPIA accepts the API key: one status read of a made-up order (401 means refused; a NETOPIA error answer means
  accepted; a redirect or any non-NETOPIA answer is a cross; nothing is charged);
- the notify address `PUBLIC_APP_URL/api/v1/billing/netopia/notify` answers a GET without a redirect (a GET never
  reaches the intake, which takes only POST);
- the published register version: `billingPolicy.enabled`, the plans' currency, `countryPolicy` present;
- the company facts are no longer in brackets (today's `BILLING_COMPANY_FACTS_UNVERIFIED` codes).

### 2.18 Pages, copy and emails

- **Checkout** (`CheckoutFlow.tsx`): the plan and price summary; the billing block (first name, last name, phone,
  street, city, postal code, region where needed, country filled in); "Buying as a company?"; the two consents; the
  button **Continue to payment** (`billing.checkout.continueToCard`'s new English). Pressing it starts the checkout and
  navigates. `XMoneyCardForm.tsx` and `lib/billing/xmoneySdk.ts` go.
- **The card-saving agreement.** NETOPIA's page has no "save card" box, so the agreement lives on our side. The renewal
  consent (`consent.renewal`, hashed per locale by the legal manifest) gains the saved card: English default "I agree
  that NETOPIA Payments keeps my card and that {total} is charged to it every month until I cancel." The **upgrade and
  card pages** show the same sentence with the subscription's current monthly total before the button, and record a
  RENEWAL_TERMS acceptance with the surface `UPGRADE` or `CARD_CHANGE` (§2.5.1). The owner may reword it; the manifest
  is regenerated (`pnpm generate:legal`); counsel confirms (§2.22).
- **Security policy:** the card-form additions to `script-src`, `frame-src`, `connect-src` and `form-action`
  (`content-security-policy.mjs:68-118`, `middleware.ts:24-29`) go; the three card pages keep the site's normal
  policy. The optional Caddy pop-up matcher and the TopBar's forced full navigation off the card pages
  (`TopBar.tsx:32-33`) go with them.
- **Settings:** the upgrade button says "Upgrade and pay {amount}" and navigates to NETOPIA; the card page shows the
  billing block (country and region read-only) and "Check my new card".
- **Copy in 35 locales:** `billing.checkout.cardNote` ("You pay on NETOPIA Payments' secure page. Your card number never
  reaches our servers."), `legal.notice.s04.payments` ("Card payments are processed by NETOPIA Payments. We never see or
  store your card number."), `billing.checkout.cardTitle`, `formUnavailable` ("The payment page could not be opened.
  Please try again in a minute."), the billing block's labels and errors, the upgrade and card-page lines,
  `billing.card.notSaved`, the return page's upgrade sentence, `mail.M5.confirmCard`, M12 and its two lines, and Part
  C's `PLAN_CHANGE_CURRENCY_DIFFERS` sentence. English and Romanian are written with care; the other 33 are machine
  translations for go-live row 36. The translators' note says "NETOPIA Payments is a brand name; keep it."
- **Owner emails (English):** O2's xMoney-dashboard wording becomes NETOPIA's admin; new O2_REFUND_DUE,
  O2_REFUND_REMINDER, O4, and the O3 codes `RENEWAL_OUTCOME_OPEN`, `PAYMENT_AMOUNT_MISMATCH`,
  `PAYMENT_CUSTOMER_MISMATCH`, `OWNER_REVIEW`, `CHARGE_CONFIGURATION_REFUSED`; the daily summary's count of rejected
  messages.
- **The marks** NETOPIA's shop approval requires (its logo, Visa and Mastercard) sit in the footer and on the checkout;
  the owner supplies the official artwork (go-live rows 17 and N-23).
- **The signed support catalogue:** the `/checkout`, `/checkout/return` and `/settings/card` entries change their label
  and search words ("Subscription checkout", "billing details", "NETOPIA payment page"), so `catalog.sha256` changes and
  the owner signs again before billing goes on (§1.6 item 9).

### 2.19 What is removed or renamed

- **Removed:** `packages/payments-xmoney`; the xMoney parts of the 14 API files (§2.1.1);
  `acceptance/billing-fakes/fake-xmoney.ts` and its re-export; `tools/billing/xmoney-sandbox.ts` and
  `scrub-xmoney-fixture.ts`; the xMoney-only tests (`payments-xmoney-*`, `billing-xmoney-*`, `billing-notify-route`'s
  form cases, `billing-stage-clock`'s xMoney host rules, `billing-xmoney-card-form` and the CSP pins);
  `XMoneyCardForm.tsx`, `xmoneySdk.ts`; the `XMONEY_*` settings and the UI's `XMONEY_SDK_ORIGIN`; the runbook's xMoney
  steps.
- **Renamed:** the audit lines `billing.xmoney.credentials_refused` and `billing.xmoney.row_rejected`
  (`audit.ts:78-80, 166-187`) become `billing.payment.credentials_refused` and `billing.payment.answer_rejected`; the
  code `OTHER_XMONEY_SYSTEM` becomes `OTHER_PAYMENT_SYSTEM` in jobs, owner lists, mails and the runbook.
- **Updated:** the shipped-corpus manifest, the orphan audit, the scaffold's package count, the dev-stack fakes and
  every pin that names them. The gitleaks entry for the plan's dummy xMoney key stays, because the plan document keeps
  that line.

### 2.20 Testing

#### 2.20.1 The NETOPIA protocol fake (`acceptance/billing-fakes/fake-netopia.ts`)

An independent implementation, not built from the package's code:

- `payment/card/start` for hosted starts (a payment URL to a fake page) and saved-card charges, with error 56 for a
  repeated `orderID` (also while the first is still processing) and 99 for a repeated one with another amount;
- the fake page's outcomes: approve, decline (with a code), 3-D Secure pending, retry on the same order, a wallet
  payment with no saved card;
- the message: signed RS512 with a key the test generates, `aud` as an array, `sub` over the exact bytes, any content
  type, a token on the first message of a payment made with a client id, a new token on every token payment, late and
  repeated deliveries;
- `operation/status` (with and without `ntpID`, and "no such order"); dashboard refunds, whole and partial (status 8
  and a message); charge-backs (9, 10, 16) and status 17;
- failure controls: unavailable, outcome unknown (the charge happens, the answer is lost), 401, a merchant-settings
  code, a message our key cannot verify, a lost first message.

It also backs the dev stack (`DEBATEAI_BILLING_FAKES=1`) in place of the xMoney fake.

#### 2.20.2 Suites

- **Unit:** the verifier (genuine; wrong key; `alg` `none`, `HS512` with the public key as the secret, `RS256`; wrong
  `iss`, `aud` and `sub`; `aud` as a string and as an array; the header in any letter case; a body with non-ASCII
  bytes; several trusted keys; a key below 2,048 bits) and `quarantinable`; the status, decline and country tables; the
  time-parsing rule (the placeholder date, a time without a zone, a future time); amounts from and to decimal text; the
  base-URL table; redirects refused; `SecretToken` never printing its value (`String`, `JSON.stringify`, `inspect`, an
  error message); the configuration reader; the setup script; the fold's new rules.
- **Integration:** migration 0096 on an empty schema, on one holding xMoney-era rows, and run twice; the 0093 contract
  check; checkout → page → message → VERIFY → ACTIVATED with a saved card; a lost first message (plan starts, M12 asks
  for a card); a late token (CARD_SAVED); the adoption rules (a refused card check, a refunded upgrade, a late message
  of a replaced card); a renewal paid, declined (bank and not bank), asking for 3-D Secure, refused for a merchant
  setting (held, owner emailed, no M5), pending to its deadline, and with an unknown outcome settled by a probe and by
  the resend's 56; a dunning retry that finds an earlier attempt paid; the 0 card check with and without a token; an
  upgrade on the page, abandoned and paid late; an owner-mode refund, whole (recorded by status) and partial (recorded by
  the command); a refund made by hand in the admin; status 17; the three charge-back statuses with and without status 9
  first; a verified message that does not parse; a rejected message quarantined and recovered after a key change; the
  provider-only mode; the bring-forward of a waiting check; the read schedule and its cursor; the token sweep and both
  purges; the invoicer pairing guards; the whole flow; and, in Part C, a checkout, renewal and invoices in EUR and in
  RON, and a refused plan change across currencies.
- **Render:** the checkout's billing block and its errors, the card page (read-only country and region, the agreement
  sentence, `notSaved`), the upgrade button and its agreement sentence.

#### 2.20.3 The sandbox recording (OWNER-RUN), replacing X0

`tools/billing/netopia-sandbox.ts`, run by the owner with the API's settings (on the throwaway test server, or on live
in provider-only mode for the small live test); it reads the key file itself and prints no secret. Subcommands:

- `check`: the check command's NETOPIA lines.
- `start --amount 1.00 [--client-id-at order|instrument] [--installments 0|1]`: registers a tool order
  (`billing.tool_order`) and starts a hosted payment for it; prints the payment URL for the owner to pay (a NETOPIA
  test card in the sandbox, the owner's own card on live).
- `zero`: a 0 card check as a tool order (N-11).
- `status --order <id> [--no-ntp-id]`: a status read (N-16).
- `charge --from-order <id> --amount 1.00`: a saved-card charge, as a new tool order, with the token the API stored for
  that tool order (N-4, N-12, N-15).
- On live, `start`, `zero` and `charge` refuse to run without `--live --i-understand-this-charges-my-card`.
- `fixture --order <id>`: writes a scrubbed fixture of what the API stored and NETOPIA answered
  (`tests/fixtures/netopia/`). The scrubber replaces with fixed fakes: tokens, the POS signature (it is in requests and
  in the JWT's `aud`), names, emails, phones, addresses, `IP_ADDRESS`, the BIN, the issuer, the expiry, the last four
  digits, the RRN and the authorisation code; it keeps the shapes, the status numbers, the codes and NETOPIA's own
  formats. A scrubbed body no longer matches its signature, so the fixtures test parsing and the pinned constants,
  never signatures (those use generated keys).

A recorded suite runs the package's parsers and §2.4.7's constants against the fixtures; it is skipped by name until
the owner commits them, as the xMoney one was.

### 2.21 Operations

**The runbook** (`deploy/vps/README.md` §14) is rewritten for NETOPIA:

- §14.1 what you need (a NETOPIA account with a POS, sandbox first);
- §14.2 the guided setup and the check command (replacing the hand-made key files);
- §14.5 NETOPIA's message (no admin setting: the address travels with every payment; no redirect; the answers; the
  quarantine and O4);
- §14.7 the website items NETOPIA checks (logo and card marks, ANPC links, Terms, privacy, cancellation, proof of the
  domain);
- §14.8 the switch from sandbox to live (the guided setup's `--replace netopia` with the live values), refunds in the
  owner mode and `billing:refund-done`, disputes, the journal lines (renamed ones included);
- §14.9 the sandbox run on its own throwaway server (§2.20.3), NETOPIA's own test of our flow there, and the **small
  live test** in provider-only mode with billing off: the tool's `start --live` (1.00, with a client id, the owner's
  own card), `charge --live` (1.00 with the stored token), both refunded in the admin, and the stored rows checked.

**Go-live rows** (`docs/missions/2026-09-01-security-hardening/GO-LIVE-CHECKLIST.md`): rows 14, 15, 17–20, 23, 24, 40
and 46 are rewritten or closed for NETOPIA, and the 29 September open items that only xMoney raised are closed as
"void: card processor changed to NETOPIA". New rows hold every question §2.24 marks as a gate (N-2, N-4, N-5, N-7, N-8,
N-11, N-14, N-15, N-17, N-23, N-24, N-26), the sandbox recording committed, NETOPIA's test of our flow, and the small
live test.

### 2.22 For the colleague and the lawyer

- The Privacy Policy's bracketed "payment provider" becomes NETOPIA Payments (the legal entity and its role — processor
  or independent controller — are counsel's), with what it receives: first and last name, email, phone, billing
  address, the internet address at each payment (including each renewal), the amount, and the card, which NETOPIA keeps
  for the monthly payments. Our side keeps the saved-card code only while it is the card of a live plan, plus about a
  day (§2.15.4), and the nightly backups keep it until they expire; the policy says how long.
- The Terms' payment clauses name NETOPIA where they name the processor.
- The card-saving agreement (§2.18), shown at the checkout, the upgrade and the card change, is the card-on-file
  agreement; counsel confirms its wording, and whether the checkout's agreement alone would cover the later cards.
- ANPC: the Terms' bracket "[the ANPC – named SAL entity, website]" and the site's ANPC links, which NETOPIA's shop
  approval checks (§2.21).
- Go-live row 45 (the data of checkouts that never paid) now covers names and phone numbers.

These are go-live row 24's; the build does not edit the legal drafts.

### 2.23 Order of work

- **Part N (NETOPIA)**, one pull request to `dev`, billing off: the port and the package; the fake; migration 0096 and
  the fold; configuration, the guided setup and the check command; checkout and the billing block; the notice route,
  the intake, the quarantine and the provider-only mode; VERIFY_PAYMENT; renewals and unknown outcomes; upgrades; the
  card change; refunds; charge-backs; the checks; the saved card; pages, copy, emails; the removals and renames; the
  runbook, the go-live rows and the records; the recording tool.
- **Part C (prices in USD, EUR or RON)**, its own pull request after Part N merges.
- Each part ends with a final review, a fix wave and the controller's records, as Parts 1–4 did.

### 2.24 Open NETOPIA facts and where each one bites

The email (§1.6 item 1) asks every one. "Gate" means a go-live row keeps billing off until it is answered. "Changes"
says what a different answer would change.

| # | Question | What the build assumes until answered | Gate | Changes |
|---|---|---|---|---|
| N-1 | Canonical base URLs; POS signature format | both pairs accepted; five groups of four | — | the host table, one pattern |
| N-2 | Where `clientID` goes; its format | `order.clientID`; 32 lower-case hex | yes | one constant |
| N-3 | `scaExemptionInd` values; anything else on the first payment | `"MIT"` on saved-card charges only | — | one constant |
| N-4 | Where the token is in the first message; is the new one in the charge's answer, its message, the status read | §2.4.3's three paths, in that order; every source stored | yes | one constant |
| N-5 | The official key(s) for the messages, sandbox and live; rotation | a trust list; the published plugin key offered | yes | the setup's default |
| N-6 | JWT time units | no time check (§2.4.6) | — | nothing |
| N-7 | The exact answer to a message; the resend policy; does a resent first message still carry the token | §2.7.2's bodies; 503 for "try again"; the quarantine | yes | the answer bodies |
| N-8 | Which status changes send a message; refunds: the status of a whole and of a partial refund, the amount reported; the meaning of 10 and 17 | statuses read daily (§2.14); a whole refund recorded by status, a partial one by command; 10 and 17 to the owner | yes | the refund and dispute rules |
| N-9 | Status 3 versus 5 | both are PAID | — | one constant |
| N-10 | Is the refund call available | no: owner mode (§2.12.2) | — | the API mode (§2.12.3) |
| N-11 | Does a 0 check with `clientID` give a saved card | yes | yes | the card change (owner rules again) |
| N-12 | Saved-card charges: mandatory fields; which IP; the answer when the bank wants 3-D Secure; which codes are card-side and retryable | the full payer; the latest in-person IP; 100/15 → `ACTION_REQUIRED`; §2.4.5's tables | — | the decline tables, the renewal's outcome rules |
| N-13 | `orderID` length and characters | 32 lower-case hex is accepted | — | the charge id form |
| N-14 | Currencies; settlement | USD until the owner publishes another (§2.16) | yes | the published currency |
| N-15 | Is a repeated `orderID` refused (56) for token payments, also while the first is still processing; can a declined orderID be reused | yes; no | yes | the unknown-outcome rule (§2.9.3) |
| N-16 | A status read by `orderID` alone; how "no such order" is said | tried; the recorded answer | — | §2.9.3 step 1 |
| N-17 | Do wallets, Click to Pay, BT Pay or instalment plans on a payment leave a saved card; can a payment be limited to card entry | not guaranteed: §2.11 and §2.15.3 handle a payment without one | yes | the card page's wording, maybe a card-only start |
| N-18 | Parameters added to the return address; `cancelUrl`; rate limits; message sources; TLS; redirects | none trusted; no `cancelUrl`; no limit; no redirects | — | nothing |
| N-19 | A reporting or listing API | none (§2.14) | — | the checks could use it |
| N-20 | Sandbox test cards | the two in NETOPIA's OpenAPI file | — | the runbook |
| N-21 | What the recurring flag switches on | token payments | — | nothing |
| N-22 | Does NETOPIA email the payer; can it be turned off | `emailTemplate: ""` | — | maybe a setting to send |
| N-23 | Merchant rules for subscriptions: notice before an amount change, site content, AI services accepted, refused card countries | A7's 7 business days kept; §2.21's site items | yes (site items) | the site items |
| N-24 | How to keep a payment in one go (instalments off); does an instalment payment leave a saved card | `installments: 0`; recorded both ways | yes | one constant |
| N-25 | How long a payment page stays payable | 30 days at most (§2.14 reads closed charges that long) | — | the read window |
| N-26 | Can NETOPIA's shop check and their test of our flow be done on the test server, or with the paid plans hidden on the live site | the test server | yes | maybe a preview the owner rules |
