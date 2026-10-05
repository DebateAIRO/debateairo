# Card payments through NETOPIA: design

- **Date:** 5 October 2026
- **Branch:** `feat/2026-10-05-netopia-switch`, off `origin/dev` 7b91df4f1. Nothing is pushed.
- **Owner goal (5 October 2026):** change the card processor from xMoney to NETOPIA Payments, because NETOPIA's rates
  are better for us. Do everything that can be done without NETOPIA's answers; ask only where we are stuck or where a
  value is private to the business; give the owner one simple way to enter those private values.
- **Builds on:** `2026-09-29-paid-plans-and-payments-design.md` (the paid-plans design, "the 29 September design").
  Everything there stays true **except** what this document replaces (§2.1.2). Where the two differ, this document
  wins. The 29 September design gains amendment **A32**, which points here.
- **Owner decisions:** §1.8.
- **Status:** written spec, awaiting the owner's review. No product code has been written.
- **Research behind it:** NETOPIA's API v2 reference and an xMoney coupling map, both in the session's SDD folder
  (`.superpowers/sdd/2026-10-05-netopia-switch/`, private working notes, not committed). Facts marked **[N-x]** in
  this document are open NETOPIA questions (§2.24); everything else is confirmed by NETOPIA's published OpenAPI file,
  its official SDKs and plugins, or our own code.

This document has two parts. **Part 1** is for the owner and uses plain words. **Part 2** is for the people and agents
who build it.

---

## Part 1 — For the owner

### 1.1 In one paragraph

A person picks a plan, types their billing details on our checkout page (name, phone, address), ticks the two boxes and
presses **Continue to payment**. They land on NETOPIA's own payment page, where they pay by card, Apple Pay or Google
Pay; their bank may ask for its security check there. NETOPIA then sends our server a signed message. Our server checks
NETOPIA's signature, stores the saved-card code NETOPIA includes (encrypted), and starts the plan. Every month our server
charges the saved card itself, as a payment the person agreed to in advance. Nothing else changes: the same plans,
limits, tax, invoices, emails, cancelling and withdrawal rules. Billing stays switched off until you switch it on.

### 1.2 What the person paying sees

| Step | Before (xMoney) | Now (NETOPIA) |
|---|---|---|
| Checkout | card form inside our page | billing details on our page, then NETOPIA's payment page |
| Billing details | country; name and address only for Romania and companies | first and last name, phone and full address for everyone (NETOPIA requires them for the monthly payments) |
| Paying | card only | card, Apple Pay or Google Pay on NETOPIA's page (§2.24 N-15 may limit this to cards) |
| Upgrade | charged instantly to the saved card | pays the difference on NETOPIA's page; the new plan starts as soon as it is paid |
| Change of card | a $1.00 hold, released at once | a check for 0 on NETOPIA's page: no money is held (if NETOPIA confirms, N-11) |
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
   exactly how much, why, and the deadline when there is one.
2. You refund exactly that amount in NETOPIA's admin.
3. NETOPIA tells our server, and the site records the refund, sends the customer's email and issues the credit note by
   itself. If NETOPIA's message never comes, one command records it.
4. The site reminds you of every refund still open, and of any deadline that is close.

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
| 1 | Send NETOPIA the email the controller drafted for you in Romanian (kept outside this public repository, with your other business papers). It asks them to switch on recurring payments for your account and asks the technical questions in §2.24. | now |
| 2 | Tell me NETOPIA's answers as they come. Each one closes a row of §2.24. | as they come |
| 3 | Choose the currency once NETOPIA says what your account can take (§1.8, §2.16). | after NETOPIA answers |
| 4 | Run the guided command on a separate test server with NETOPIA's sandbox values, and do the sandbox test run in the runbook (§2.21). | after the build |
| 5 | Let NETOPIA test our flow, as they asked. | after the build |
| 6 | Do the small live test: one real payment with your own card, one saved-card charge of 1.00, then refund both in NETOPIA's admin (§2.21). NETOPIA says the monthly payments can only be tested this way. | after NETOPIA switches on recurring payments |
| 7 | The website items NETOPIA checks before approving a shop: NETOPIA's logo and the card marks, the consumer-protection (ANPC) links, Terms, privacy, cancellation rules (§2.21, go-live rows). | before billing goes on |
| 8 | Your colleague and the lawyer: the Privacy Policy must name NETOPIA and the details it receives (name, email, phone, address, internet address at each renewal) (§2.22). | before billing goes on |
| 9 | Sign the support assistant's page list again, because the checkout entries change their wording (§2.18). | before billing goes on |

### 1.7 Questions only NETOPIA can answer

NETOPIA's public documents leave 22 points open. The build makes a safe choice for each one and records it, so that a
different answer from NETOPIA changes one place in the code. The table in §2.24 lists each question, what the build
assumes until it is answered, and which go-live row holds it. The email in §1.6 item 1 asks all of them.

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
| C-1 | Upgrades are paid on NETOPIA's page, not charged silently to the saved card | an upgrade is started by the person, so the bank may ask for its security check, which only NETOPIA's page can show; a silent charge could fail or break the card rules |
| C-2 | The card change is a 0 check on NETOPIA's page | NETOPIA's API describes amount 0 as "account verification"; no money is held. If NETOPIA says it gives no saved card, you rule again (N-11) |
| C-3 | Refunds by you in NETOPIA's admin until the refund call is confirmed (§1.4) | NETOPIA marks the call "future" and none of its own plugins uses it |
| C-4 | A message whose signature does not check is answered "try again later", never "OK" | NETOPIA sends the saved-card code only once; if our key were wrong, an "OK" would lose every card for good. A "try again" lets you fix the key while NETOPIA keeps sending |
| C-5 | The saved-card code is deleted the day after a plan ends | data minimisation; nothing needs it afterwards (refunds use NETOPIA's payment number) |
| C-6 | Prices change currency only while no paid plan is live | a live plan keeps the price it was sold at (Terms §12) |

---

## Part 2 — For the builders

### 2.1 Starting point and scope

#### 2.1.1 Verified on `origin/dev` 7b91df4f1 (5 October 2026)

- Billing is built and switched off: the `billingPolicy` row says `enabled: false`
  (`packages/register/src/billing-policy.ts:110-132`). Billing exists only when the deployment is hosted AND that row
  says enabled (`apps/api/src/main.ts:608-628`).
- **There is no payment port.** `packages/billing-core/src/ports.ts` defines only `TaxEngine` and `InvoiceIssuer`. 14
  API files call `XMoneyClient` directly (`checkout.ts`, `connectors.ts`, `invoice-cli.ts`, `notice-intake.ts`,
  `reconcile.ts`, `refunds.ts`, `renewal.ts`, `runtime.ts`, `settlement.ts`, `stage-clock.ts`, `subscription-deps.ts`,
  `upgrade.ts`, `verify-payment.ts`, `withdraw-cli.ts`) and import xMoney's types and status words.
- Provider-neutral already, and kept as it is: the money rules in `packages/billing-core` (proration, A6 credit,
  withdrawal formula and deadline, windows, calendar); the outbox worker, its leases, retries, dead letters and the
  O1/O2/O3 owner emails; the quote and Quaderno pricing; SmartBill invoices and e-Factura; the renewal scheduler, A7
  notices, the Q-1 72-hour hold and the dunning `[1, 3, 7]`; cancel, revoke, downgrade, cancel links, dispute pause and
  resume, the erasure hook; the return page and `ChargeStatusPoller`; the owner commands; systemd, the provisioner, the
  `debateai_billing_runtime` role (0093) and the register rows (none names xMoney).
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
| §2.5.2 `billing.xmoney_notice`, the `xmoney_*` columns | §2.5 |
| §2.5.3 "Starting the payment" and "The security policy for the checkout page only" | §2.6, §2.18 |
| §2.5.4 (the notice, VERIFY_PAYMENT's reads, reconciliation) | §2.7, §2.8, §2.14 |
| §2.5.5 the rebill call | §2.9 |
| §2.5.6 `upgrade` step 2, `withdraw` steps (the xMoney calls), `card` | §2.10, §2.12, §2.11 |
| Amendments A1, A2, A4 (c)(d), A9, A10, A11, A12, A22's xMoney environment rule, A23, A24; A29 (a), (b), (c), (e), (f), (o), (p); A31 (b) and (j)'s card-check hold | the sections named in each row of §2.24 and §2.5–§2.14 |
| Go-live rows 14, 15, 17–20, 23, 24 (payment recipients), 40, 46; open items P2-I1, P2-I2, P2-I3, P2-I12 (1), P2-I18, P2-I21, P2-M1/M2/M3/M5/M27 | §2.21 |

Everything else in the 29 September design, its amendments and the go-live checklist stays binding.

### 2.2 Rules that bind every task

1. **Billing stays off.** No task publishes a register version that switches it on.
2. **Keys.** No agent creates, reads, prints or handles a real key, token or POS signature. Tests generate their own
   RSA keys and use made-up values, built from pieces where they look like keys (the repository's leak scanner flags
   long key-like strings). Steps marked OWNER-RUN are the owner's.
3. **Migrations are forward-only.** An applied migration is never edited. Every new billing table grants itself to
   `debateai_billing_runtime` in its own migration (0093's contract block checks this).
4. **Sealed values are superseded, never edited** (register versions, the signed support catalogue, the legal
   manifest).
5. **No card data, no token and no full JWT ever reaches a log, an audit line, an email, an error message or a test
   snapshot.** A token exists in plaintext only in memory, between unsealing and the request that uses it.
6. **The browser never decides a payment, and neither does the return URL.** A payment counts only when NETOPIA's
   signed message or NETOPIA's status answer says so (§2.8).
7. **Money is integer micros** end to end; NETOPIA's decimal amounts are parsed exactly from the JSON text, never
   through a float (the xMoney package's `parseJsonKeepingNumberText` rule).
8. **Customer sentences say only what is true** (A29 (m)); English defaults the owner may change, 35 locales.
9. **Local mode never bills.** Everything here exists only when the deployment is hosted.

### 2.3 The payment port (`packages/billing-core/src/ports.ts`)

The rest of the code talks to NETOPIA only through this port. The NETOPIA package implements it; the protocol fake and
the tests implement it too.

```ts
export type PaymentProvider = "netopia";
export type PaymentEnvironment = "sandbox" | "live";
export type PriceCurrency = "USD" | "EUR" | "RON";          // Part C (§2.16); Part N keeps "USD"

/** The cardholder NETOPIA needs on every payment (mandatory for saved-card charges, [SALES]). */
export type Payer = Readonly<{
  firstName: string; lastName: string; email: string; phone: string;
  country: string;            // ISO 3166-1 alpha-2
  region: string | null; city: string; postalCode: string; street: string;
}>;

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
  payer: Payer; cardToken: string; payerIp: string; returnUrl: string; notifyUrl: string; language: string;
}>;

export type PaymentState =
  | "PENDING" | "ACTION_REQUIRED" | "AUTHORIZED" | "PAID" | "DECLINED" | "FAILED" | "VOIDED" | "EXPIRED"
  | "REFUNDED" | "CHARGEBACK_OPENED" | "CHARGEBACK_LOST" | "CHARGEBACK_REPRESENTED";

export type SavedCard = Readonly<{ token: string; expMonth: number | null; expYear: number | null; last4: string | null }>;

export type PaymentReport = Readonly<{
  orderId: string; providerPaymentId: string; state: PaymentState;
  providerStatus: string;     // NETOPIA's number, as text, for records and support
  amountMicros: number | null; currency: string | null;
  cardCountry: string | null; // ISO alpha-2, from the issuer's numeric code; null when absent
  savedCard: SavedCard | null;
  declineCode: string | null; bankDeclined: boolean;
  occurredAt: Date | null;
}>;

export interface CardPayments {
  readonly provider: PaymentProvider;
  readonly environment: PaymentEnvironment;
  startHostedPayment(i: HostedPaymentStart): Promise<HostedPaymentStarted>;
  chargeSavedCard(i: SavedCardCharge): Promise<PaymentReport>;
  status(i: Readonly<{ orderId: string; providerPaymentId: string | null }>): Promise<PaymentReport>;
  /** Absent until NETOPIA confirms its refund call (N-10). RefundDesk then hands refunds to the owner (§2.12). */
  refund?(i: Readonly<{ orderId: string; providerPaymentId: string; amountMicros: number }>): Promise<PaymentReport>;
}
```

- **Errors** are `TypedDomainError`s with exactly these codes, and every caller depends only on them:
  - `PAYMENT_PROVIDER_UNAVAILABLE`: a read failed, or a write provably never left (connection refused, DNS failure,
    host or network unreachable, connect timeout, HTTP 429).
  - `PAYMENT_OUTCOME_UNKNOWN`: a write may have reached NETOPIA (a timeout after sending, HTTP 408 or ≥500, a cut
    connection).
  - `PAYMENT_CREDENTIALS_REFUSED`: HTTP 401 or 403.
  - `PAYMENT_PROVIDER_REFUSED:<code>`: NETOPIA refused the request itself (HTTP 400, or business error 99, "another
    order with a different price").
  - `PAYMENT_RESPONSE_INVALID`: an answer of an unexpected shape.
- A **decline is not an error**: it is a `PaymentReport` with state `DECLINED` (§2.4.4).
- The **notice verifier** is not on the port. It is a pure function of the NETOPIA package (§2.4.6), injected into the
  notice intake the way `decryptNotice` is today (`notice-intake.ts:26`).

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
  `payment.instrument.clientID` instead (N-2). The location is ONE constant in the package; the sandbox recording
  (§2.20.3) proves which one yields a token, and a one-line change follows if needed.
- `amount` is a JSON number in major units with at most two decimals, written from micros by exact decimal text
  (`24.20` → `24.2` is the same number; the serializer must never produce `24.199999`).
- `country` is the ISO 3166-1 **numeric** code and `countryName` its English name, both from a static table in the
  package (alpha-2 → numeric and name), covering every country `countryPolicy` can open.
- `language`: the buyer's interface locale when it is one of NETOPIA's page languages (`ro`, `en`, `bg`, `es`, `hu`,
  `it`, `nl`, `de`, `fr`), else `en`.
- `emailTemplate: ""` asks NETOPIA for no email of its own (N-22). `installments: 0` keeps the payment in one go
  (N-16).

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
- The full payer is mandatory here ([SALES]); the package refuses to send a charge whose payer has an empty field
  (`PAYMENT_PAYER_INCOMPLETE`, a programming error the caller must have prevented).

**Status read** — `POST {base}/operation/status` with `{"posID": "<POS>", "ntpID": "<id or empty>", "orderID": "<orderId>"}`.
NETOPIA's OpenAPI file calls the route "available at a future date", yet every official client calls it and it
answers. Whether it works with `orderID` alone is N-16; the package always sends the `ntpID` when we have one.

#### 2.4.3 Reading the answers

- HTTP 200 carries business outcomes; `error.code` is a string:

  | `error.code` | Meaning | The package returns |
  |---|---|---|
  | `101` | hosted page ready | `HostedPaymentStarted` (start only) |
  | `00` or `0` | processed | a `PaymentReport` from `payment` |
  | `100` | the bank asks for 3-D Secure (saved-card charge) | a report with state `ACTION_REQUIRED` |
  | `102` | the payment is locked while 3-D Secure is pending | a report with state `PENDING` |
  | `56` | the orderID was already used ("Order closed") | the existing payment's report, from the answer's `payment` (status and `ntpID`), else from a status read. This makes a resent charge safe (§2.9.3) |
  | `99` | the same orderID with another amount | `PAYMENT_PROVIDER_REFUSED:99` |
  | a decline code (§2.4.5) | the card was declined | a report with state `DECLINED` |
  | anything else | — | `PAYMENT_PROVIDER_REFUSED:<code>` with the code only |

- Every answer is parsed leniently (unknown members ignored: NETOPIA added a `card` member to status answers without
  notice in 2025), but the members we use are checked strictly: `ntpID` a string of 1–64 characters of
  `[A-Za-z0-9_.:-]`, `status` an integer 1–23, `amount` a decimal, `currency` three capital letters.
- A saved card in an answer: the first present of `payment.binding.token`, `payment.instrument.token`, `payment.token`
  (N-4), with `binding.expireMonth`/`expireYear` (0 means unknown) and the last four digits of
  `payment.instrument.panMasked` (only the last four are kept). The token is an opaque string of 5–1,024 printable
  characters.
- The card's country: `payment.instrument.country` (ISO numeric), else `payment.data.ISSUER_COUNTRY`, mapped to alpha-2
  by the same static table; unknown or 0 is `null`.

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
| 17 | REVERSED | `VOIDED` |
| 18 | PENDING_ANY | `PENDING` |
| 23 | EXPIRED | `EXPIRED` |
| 7, 19–22, any other | SMS, legacy recurrence, trial | `PENDING`, plus the content-free audit line `billing.payment.status_unexpected {status}` |

- Only `PAID` grants a plan or records money. `AUTHORIZED` counts as success only for a 0 card check (§2.11).
- Whether NETOPIA sends both 3 and 5 for one payment, and which comes last, is N-9. The table makes both `PAID`, and
  VERIFY_PAYMENT records one SUCCEEDED per charge whatever the order (A3 (d)'s index).
- A `VOIDED` payment that we had recorded SUCCEEDED is a full refund (A9's `void-ok` rule, kept).

#### 2.4.5 Decline codes

A `DECLINED` report carries the code. `bankDeclined` (A29 (m)'s "your bank refused the payment") is true only for
codes where NETOPIA's own payment page names the card or the bank: 17 invalid card number, 18 closed card, 19 expired
card, 20 insufficient funds, 21 invalid CVV, 22 issuer error, 26 card limit exceeded, 34 transaction not allowed, 35
declined, 37 hard decline. It is false for 16 (risk), 36 (NETOPIA's antifraud), 39 (3-D Secure failed) and any other
code. Whether NETOPIA classes these the same way is N-12; the table is one constant.

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
   The hash covers the bytes as received: the API reads them before any JSON parsing (§2.7.1), and nothing re-encodes
   them on the way (the UI proxy forwards bytes, `apps/ui/app/api/[...path]/route.ts:203-227`).
6. **No time check.** NETOPIA's own code disagrees on the unit of `iat`/`exp`/`nbf` (milliseconds in PHP, seconds
   elsewhere, N-6); a wrong guess would refuse genuine messages and lose saved cards. `sub` binds the token to the
   body, and a replayed message is harmless: VERIFY_PAYMENT acts only on NETOPIA's current status (§2.8). `iat` is
   recorded as received.
7. Only then the body is parsed. It must hold `order.orderID`, `payment.ntpID` and `payment.status`; the saved card
   and the card's country are read as in §2.4.3.

A rejection carries one reason code (`NOTICE_HEADER_MISSING`, `NOTICE_ALG_REFUSED`, `NOTICE_SIGNATURE_INVALID`,
`NOTICE_ISSUER_INVALID`, `NOTICE_AUDIENCE_INVALID`, `NOTICE_BODY_HASH_INVALID`, `NOTICE_BODY_INVALID`) and nothing else.

**Which key.** NETOPIA's official WooCommerce and OpenCart plugins carry one RSA-2048 key for sandbox and live (SPKI
SHA-256 `eeba3b065067fb01c2389850c7a888456dfd31332d67ed9b630dae24753478d7`); third parties report that the certificate
under a POS's security settings does not verify v2 messages. N-5 asks NETOPIA for the official key or keys. The guided
setup (§2.17.2) offers that published key as a choice, shows its fingerprint, and accepts any other key the owner
pastes; the trust list may hold several keys, so a key change by NETOPIA needs no downtime.

#### 2.4.7 Facts the sandbox recording pins

The package keeps every uncertain fact in one named constant, each with a test that the recorded fixtures (§2.20.3)
check once they exist: `CLIENT_ID_LOCATION` (N-2), `TOKEN_PATHS` (N-4), `PAID_STATUSES` (N-9), `BANK_DECLINE_CODES`
(N-12), the answer to a 0 card check (N-11) and the status read without `ntpID` (N-16).

### 2.5 Data: migration `0096_billing_netopia.sql`

Principles:

- **Forward only.** The xMoney objects of 0085–0093 stay; this migration supersedes them.
- **It applies on every database.** That means an empty billing schema (every real deployment) and a developer
  database that holds xMoney-era rows made by the dev-stack fakes. Such rows are kept as inert history: they are marked
  `payment_provider = 'xmoney'`, and no code acts on them (§2.5.4).
- New tables follow the billing rules: append-only, the truncate guard, the verify block, ciphertexts under the
  records key with their `key_id`, no foreign key to the user, and grants to `debateai_billing_runtime` only.

#### 2.5.1 Provider-neutral columns

| Table | Change |
|---|---|
| `billing.charge` | adds `payment_provider text NOT NULL` (existing rows `'xmoney'`; new rows must name it, no default) with CHECK `IN ('xmoney','netopia')`; renames `xmoney_environment` to `payment_environment`; replaces its CHECK with `(payment_provider = 'xmoney' AND payment_environment IN ('stage','live')) OR (payment_provider = 'netopia' AND payment_environment IN ('sandbox','live'))`; the unique key becomes `(charge_id, payment_provider, payment_environment)` |
| `billing.charge_event` | adds `payment_provider`, likewise; renames `xmoney_environment` → `payment_environment`, `xmoney_transaction_id` → `provider_payment_id`, `xmoney_created_at` → `provider_created_at`; the FK to `charge` covers the three key columns; the digits-only CHECKs apply to `xmoney` rows only, and `netopia` rows take `^[A-Za-z0-9_.:-]{1,64}$`; `refunds_transaction_id` must be NULL on `netopia` rows (NETOPIA reports a refund as a status of the payment itself, not as a transaction of its own); the unique indexes are re-keyed on the renamed columns plus `payment_provider` |
| `billing.subscription_event` | adds `card_token_id uuid NULL` (no foreign key, so a token can be deleted, §2.15); `xmoney_order_id`, `xmoney_customer_id` and `card_ref` stay for old rows, and new code never writes them; the CHECK `subscription_event_activation_names_order` applies to xMoney-era subscriptions only; the CREATED check accepts `data.payment_provider` + `data.payment_environment` (`'netopia'`, `'sandbox'`/`'live'`) besides the old `data.xmoney_environment` |
| `billing.outbox` | the kind CHECK adds `PAYMENT_REFUND` (`XMONEY_REFUND` stays for old rows; new jobs never use it) |

Renaming a column fires no row trigger, so the append-only guards do not stand in the way. The plan's migration task
measures every CHECK, index, view, function and trigger that names a renamed column (0086's refund-sum trigger, the
purge function, 0092's indexes, the views) and replaces each in this migration.

#### 2.5.2 New tables

| Table | Holds |
|---|---|
| `billing.payment_notice` | `notice_id uuid PK`, `payment_provider`, `payment_environment`, `received_at`, `body_sha256` UNIQUE (hex of the raw body's SHA-256), `order_id text` (whatever NETOPIA named, ours or not, `^[A-Za-z0-9_.:-]{1,64}$`), `provider_payment_id`, `provider_status smallint`, `amount_text` (the decimal as NETOPIA wrote it), `currency`, `card_country` (nullable), `key_fingerprint` (the key that verified it), `jwt_iat text` (nullable, as received), `payload_ciphertext` + `key_id` (the verified body, sealed, **with every token member removed**) |
| `billing.payment_notice_outcome` | `notice_id`, `at`, `outcome` (A21's pattern: processing is a following row) |
| `billing.card_token` | `token_id uuid PK`, `customer_id` (NULL only for a tool order's card), `payment_provider`, `payment_environment`, `source_charge_id text NULL`, `source_notice_id uuid NULL`, `token_ciphertext` + `key_id`, `exp_month smallint NULL`, `exp_year smallint NULL`, `last4 text NULL` (`^[0-9]{4}$`), `card_country` (nullable), `created_at` |
| `billing.card_token_revocation` | `token_id PK`, `at`, `reason` (`PLAN_ENDED`, `REPLACED`, `ERASURE`, `OWNER`) |
| `billing.tool_order` | `order_id PK` (`^t-[0-9a-f]{30}$`), `payment_environment`, `created_at`, `purpose` (`SANDBOX_RECORDING`, `LIVE_TEST`): the orders of §2.20.3's owner-run tool, which are not charges |
| `billing.hosted_payment` | `charge_id PK`, `payment_provider`, `payment_environment`, `provider_payment_id`, `redirect_ciphertext` + `key_id` (NETOPIA's payment URL, sealed: it lets anyone pay our order, so it is kept out of plain columns), `started_at` |

- **The one sanctioned delete path for tokens.** `billing.purge_revoked_card_tokens(now timestamptz)` is SECURITY
  DEFINER and deletes `billing.card_token` rows revoked at least one day earlier, under the A15 guard
  (`debateai.retention_purge`). The revocation rows stay as content-free history. The ten-year
  `billing.purge_expired_records` is replaced to cover the new tables (`card_token` rows never live that long).
- **Indexes** for the frequent and daily checks (§2.14): open NETOPIA charges by age, SUCCEEDED NETOPIA charges by
  age, notices by `(order_id, received_at)`, and live tokens by customer.

#### 2.5.3 The sealed records

- **The billing profile** (`records.ts` `BillingProfileSchema`, sealed JSON) gains `firstName`, `lastName`, `phone` and
  `paymentIp` (the internet address of the person's latest payment made in person: a checkout, an upgrade or a card
  change). They are nullable in the schema, so older profiles still open; a NETOPIA checkout always writes them. The
  old single `name` stays for older profiles.
- **The quote's location** (`QuoteLocationSchema`) gains `firstName`, `lastName` and `phone`; `name` becomes
  "first + last" for the invoice issuers (R-15 keeps working unchanged).
- The **payer** sent to NETOPIA is built from the newest profile: names, phone and address from it, the email from the
  account's **current** address (A29 (k)), never from the profile, while the account exists.

#### 2.5.4 Old xMoney rows

Every reader that acts on payments (VERIFY_PAYMENT, RefundDesk, renewals, the reconciler, the owner commands, the
other-system guards) reads `payment_provider` and `payment_environment` together, and treats a row of another provider
or environment exactly as A22's "other system" is treated today: DEAD `OTHER_PAYMENT_SYSTEM` for a job, skipped by the
timers, refused by the commands. The live boot's refusal while records of another system are open
(`BILLING_STAGE_RECORDS_OPEN`) becomes `BILLING_OTHER_SYSTEM_RECORDS_OPEN` and covers xMoney-era rows too.

### 2.6 Checkout

#### 2.6.1 The quote (`POST /v1/billing/quote`)

- The request (`BillingQuoteRequestSchema`) gains `first_name`, `last_name` and `phone`, and requires `street`,
  `city` and `postal_code` (which the contract already has, `name` aside) for every paid checkout. `region` stays
  required for the US, Canada and Romania (A31 (h), R-15). The company block is unchanged.
- `phone`: the page offers the country's calling code; the server stores `+` followed by 8–15 digits (E.164).
- `address_required` in the answer becomes always true for a paid checkout; the page shows the billing block from the
  start.

#### 2.6.2 Starting the payment (`POST /v1/billing/checkout`)

The steps are today's (`checkout.ts:156-263`) with the xMoney parts replaced:

1. Quote, address, country gate, consents and the owner lock, unchanged. The **pending check** (§2.6.3) replaces
   `listedPaymentUnderway`.
2. No customer is created at the processor (NETOPIA has no customer object). `ensureCustomer` keeps our own
   `billing.customer`; `billing.customer_xmoney` is no longer written.
3. The billing profile event is sealed with the payer and `paymentIp` = the request's address.
4. The CREATED event (with `data.payment_provider`/`payment_environment`), the INITIAL charge, its REQUESTED row and the
   quote's one use, unchanged in substance.
5. `startHostedPayment` with the payer, `clientId` (§2.6.4), `returnUrl` = `PUBLIC_APP_URL/checkout/return?charge=<ref>`
   and `notifyUrl` = `PUBLIC_APP_URL/api/v1/billing/netopia/notify`.
6. Its answer writes, in one transaction, the `billing.hosted_payment` row and the charge's SUBMITTED event with
   `provider_payment_id` = NETOPIA's `ntpID`.
7. The answer is `{redirect_url, charge_ref, environment}` (`BillingCheckoutResponseSchema` replaced). The page sends
   the browser there with a top-level navigation (`window.location.assign`), never a frame or a fetch.
8. A start that fails with `PAYMENT_PROVIDER_UNAVAILABLE`, `PAYMENT_CREDENTIALS_REFUSED` or
   `PAYMENT_PROVIDER_REFUSED` writes FAILED on the charge (with that code) and answers **503
   `PAYMENT_PROVIDER_UNAVAILABLE`**; a `PAYMENT_OUTCOME_UNKNOWN` start leaves the charge REQUESTED (no payment can
   exist without the page, and the 24-hour close ends it) and answers the same 503.

#### 2.6.3 One open checkout at a time

Today's rule (A3 (b), D7 #5) stays: a person has at most one CREATED subscription, a young one (30 minutes) for the
same plan, total, environment and buyer is reused, an older one is ended `ENDED(ABANDONED, NEW_CHECKOUT)`, and a
payment already on its way answers **409 `CHECKOUT_PENDING`** with its charge. With NETOPIA:

- **Reuse** sends the person back to the stored payment URL (`billing.hosted_payment`), so they continue on the same
  NETOPIA order. No second start is made.
- **On its way** means any of: a stored notice for that charge; an open VERIFY_PAYMENT job; or a status read of the
  open charge (`status(orderId, ntpID)`) that answers anything but an untouched order (NETOPIA status 1) or a final
  failure (`DECLINED`, `FAILED`, `EXPIRED`, `VOIDED`). A status read that fails counts as "on its way" (the safe side),
  so a checkout never starts while it cannot tell. `inFlightAttemptLifeMs` (20 minutes) still bounds how long a not-final payment counts.
- A payment that arrives for a checkout ended meanwhile follows A8 (c): it activates the plan when the person has no
  other live plan, and otherwise it is refunded in full as `ALREADY_SUBSCRIBED` (an owner refund while §2.12's owner
  mode applies).

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
  queues a VERIFY_PAYMENT for it (`ON CONFLICT DO NOTHING`, so at most one runs), so a late or lost message never
  leaves the person waiting: our server asks NETOPIA itself.

### 2.7 NETOPIA's message: the route and the intake

#### 2.7.1 The route `POST /v1/billing/netopia/notify`

- Registered like today's notify route (`apps/api/src/billing/index.ts:317-328`): `auth: "public"` in the inventory
  (resource `billing`, action `notify`), no session, no CSRF, the `billingNotify` admission scope keyed by the source
  network (120 a minute), and the route list and `s7-authorization` pins renamed.
- **The raw body.** A root-level `application/json` parser that, for this one route, keeps the bytes (a `Buffer`,
  64 KiB at most) and does not parse them; every other route keeps Fastify's JSON parsing. The form parser of the
  xMoney route goes.
- **The header.** NETOPIA's JWT arrives in `Verification-token`. The UI proxy forwards only allow-listed request headers
  (`apps/ui/app/api/[...path]/route.ts:14-31`); `verification-token` joins the list, and a proxy test proves the
  header and the exact body bytes reach the API.
- **No redirect on the way.** NETOPIA does not follow redirects for its message (third-party reports, N-18), so
  `PUBLIC_APP_URL` must be the exact public origin; the check command (§2.17.3) tests that the notify address answers
  without a redirect.

#### 2.7.2 The answers

| Case | HTTP | Body |
|---|---|---|
| verified and stored, or stored before (same body hash) | 200 | `{"errorType":0,"errorCode":0,"errorMessage":"OK"}` |
| not verified (any `NOTICE_*` rejection) | 503 | `{"errorType":1,"errorCode":<NETOPIA's own constant for the reason, e.g. 0x10000102 for a bad signature>,"errorMessage":"retry"}` |
| the database write failed | 503 | `{"errorType":1,"errorCode":1,"errorMessage":"retry"}` |
| over the admission budget | 429 | today's envelope |

- `Content-Type: application/json` on every answer. NETOPIA's official SDK answers with the three keys; NETOPIA's
  support told two integrators the body must hold `"errorCode": 0`; the success body satisfies both (N-7).
- **Why an unverified message is "try again", never "OK" (ruling C-4).** The saved card comes only once. If our trusted
  key were wrong or out of date, an "OK" would make NETOPIA stop sending, and every card of that period would be lost.
  A "try again" keeps NETOPIA sending while the owner fixes the key. A forged message gains nothing either way. The
  first rejection of each hour also emails the owner (O4, English only: the reason code, the time, and "check the
  NETOPIA key with the check command"), and every rejection writes the content-free audit line
  `billing.notice.unverified {reason}`.

#### 2.7.3 The intake (`notice-intake.ts`)

In **one** database transaction, before the answer:

1. Insert the `billing.payment_notice` row: the content fields, the key fingerprint, `body_sha256`, and the sealed body
   with every token member removed. `ON CONFLICT (body_sha256) DO NOTHING` makes a resent message a no-op.
2. If the message carries a saved card, insert the `billing.card_token` row: the token sealed under the records key,
   its expiry, the last four digits and the card's country, with `source_notice_id`, `source_charge_id` and the
   charge's `customer_id`. A tool order's card (§2.20.3) is stored with no customer and is revoked after one day. A
   message whose order is neither a charge nor a tool order stores no token.
3. Enqueue `VERIFY_PAYMENT` with ref = the order id when the order is one of our charges (one live job per charge).
   A tool order gets the outcome `TOOL_ORDER` and no job; any other order gets `UNKNOWN_ORDER` and the content-free
   audit line `billing.notice.unknown_order`.
4. Commit, then answer 200 and kick the outbox.

The intake changes no subscription state. Storing the token before answering is the whole point of the
transaction: the sales contact says NETOPIA never sends it again.

### 2.8 VERIFY_PAYMENT (`verify-payment.ts`)

The job's ref is our charge id. A notice, a saved-card charge's answer, the poller (§2.6.5) and the reconciler
(§2.14) all queue it; it always decides from NETOPIA's **current** status, so the order in which messages arrive does
not matter (NETOPIA may send several messages for one order: a person can retry a declined card on the same page).

1. **The other-system guard** (§2.5.4).
2. **Read the status:** `status(orderId = charge_id, providerPaymentId = the charge's SUBMITTED ntpID)`. When the read
   fails, the job is retried on the not-final schedule (1 m, 5 m, 15 m, 1 h, 6 h, 24 h). When the schedule is spent and
   the newest stored notice for the charge is verified, the job decides from that notice instead (NETOPIA signed it),
   and records which source decided (`outcome` `DECIDED_BY_NOTICE`).
3. **Check the payment matches the charge:** the amount exactly (micros from NETOPIA's decimal text) and the currency.
   A mismatch is DEAD `PAYMENT_AMOUNT_MISMATCH` (one content-free audit line, O3 to the owner). When NETOPIA's answer
   names a `clientID`, it must be the charge's customer, else DEAD `PAYMENT_CUSTOMER_MISMATCH`.
4. **Decide by state** (§2.4.4):
   - `PENDING`, `ACTION_REQUIRED`, `AUTHORIZED` (except a 0 card check, §2.11): not final; retried on the not-final
     schedule, then left to the reconciler.
   - `PAID`: SUCCEEDED, then today's settlement for the charge kind (INITIAL, RENEWAL, UPGRADE, CARD_CHECK), the
     location evidence with the card's country (`decideCardCountry`: unknown is MISMATCH, never BLOCKED), the invoice
     job and the emails, in one transaction (A3 (f)). The saved card is adopted as in §2.15.
   - `DECLINED`: FAILED(`PAYMENT_DECLINED`, `bankDeclined`). For an INITIAL or CARD_CHECK charge nothing else changes:
     the person may retry on NETOPIA's page, and the waiting screen says NEEDS_ACTION, as today.
   - `FAILED`: FAILED(`PAYMENT_FAILED`). `EXPIRED`: FAILED(`PAYMENT_EXPIRED`).
   - `VOIDED`: FAILED(`VOIDED`) before SUCCEEDED; a full REFUNDED after it (A9).
   - `REFUNDED`: §2.12.4.
   - `CHARGEBACK_OPENED`, `CHARGEBACK_LOST`, `CHARGEBACK_REPRESENTED`: §2.13.
5. Matching is simple now: NETOPIA's `orderID` is our charge id for every charge, so A1's order-id lookup, A29 (a)/(b)'s
   customer checks on an order, MAYBE_REBILL/DUPLICATE on one order and the separate refund and dispute transactions
   (A29 (f)) have nothing left to do and go. A second PAID charge of the same person (two orders paid in two tabs) is
   today's `ALREADY_SUBSCRIBED` or `DUPLICATE_PAYMENT` refund.

### 2.9 Renewals, retries and unknown outcomes

#### 2.9.1 What stays

The renewal timer, the price (the subscriber's net plus a fresh tax quote), A7's notice and postponement, the Q-1
72-hour hold, the dunning `[1, 3, 7]` with M5A–C and M6, retries as new charge rows at the failed attempt's total
(A29 (g)), and every hold of `renewal-rules.ts` are unchanged. Only the call inside `RenewalService.submit`
(`renewal.ts:601-629`) changes.

#### 2.9.2 The charge

1. Before calling, the renewal needs a **usable saved card** (§2.15) and a **complete payer** (§2.5.3). Without one, the
   attempt fails with no call: FAILED(`CARD_NOT_SAVED`), which is not the bank (no "your bank refused" sentence), and
   the dunning begins, with M5's "update your card" line. §2.15.3's reminder normally prevents this.
2. The REQUESTED row and the call-started marker, fenced on the lease, as today.
3. `chargeSavedCard` with the token, `payerIp` = the profile's `paymentIp` (else the checkout quote's address) (N-12),
   the payer, and `orderId` = the new charge id.
4. The answer, in one transaction:
   - A report: SUBMITTED with its `ntpID`; **a new saved card in the answer is stored at once** as a `card_token` row
     (`source_charge_id` = this charge), because NETOPIA issues a new token with each token payment; then
     VERIFY_PAYMENT for the charge. A `DECLINED` or `FAILED` report also writes FAILED at once (with `bankDeclined`),
     as a 402 does today.
   - `ACTION_REQUIRED` (the bank wants its security check on a merchant-initiated payment): FAILED
     (`AUTHENTICATION_REQUIRED`), not the bank's refusal. M5 then says "Your bank asked you to confirm this payment.
     Please confirm your card in Settings, and we'll try again." (`mail.M5.confirmCard`, 35 locales). The card change
     (§2.11) is that confirmation, and the next retry uses its new card.
   - `PAYMENT_PROVIDER_UNAVAILABLE` or `PAYMENT_CREDENTIALS_REFUSED`: nothing was sent; REQUESTED with
     `CHARGE_NOT_SENT` / `CHARGE_CREDENTIALS_REFUSED`, retried after 1, 5, 15 and 60 minutes, as today's
     `REBILL_NOT_SENT`.
   - `PAYMENT_PROVIDER_REFUSED:<code>`: FAILED(`CHARGE_REFUSED`); `99` is our own error and is also DEAD with O3.
   - `PAYMENT_OUTCOME_UNKNOWN`: SUBMIT_UNKNOWN, then §2.9.3.

#### 2.9.3 An unknown outcome

A2's listing adoption is gone; NETOPIA's `orderID` uniqueness replaces it.

1. After at least one minute, a **status read** by `orderID` (with no `ntpID`, N-16). A report decides: SUBMITTED with
   the `ntpID`, then VERIFY_PAYMENT.
2. If that read cannot answer, after 30 quiet minutes, **one resend with the same orderID**. NETOPIA either processes it
   (the first never arrived) or answers `56` with the existing payment (it did), so one renewal can never be charged
   twice. Never a third call, and never a new orderID for the same attempt, as A2 required.
3. When the window ends (72 hours for the first attempt, 24 hours for a retry, as today), FAILED(`NO_TRANSACTION`) and
   the dunning starts.

The safety of step 2 rests on NETOPIA's documented error 56 holding for token payments (N-15). Until NETOPIA confirms
it, go-live row N-15 keeps billing off.

### 2.10 Upgrades (ruling C-1)

- `upgrade-quote` is unchanged (A6 credit, proration, two Quaderno quotes).
- `POST /v1/billing/subscription/upgrade` creates the UPGRADE charge (period from the quote's creation to the period
  end) and starts a **hosted payment** for the prorated total, with the payer from the profile, `clientId`, and
  `returnUrl` = `/checkout/return?charge=<ref>`. It answers `{redirect_url, charge_ref}`; Settings sends the browser
  there.
- VERIFY_PAYMENT's `PAID` runs today's upgrade settlement (UPGRADED with A6's credit and the same anchor). The upgrade's
  saved card becomes the subscription's card (§2.15.2).
- One open upgrade at a time per subscription: a second request within 30 minutes reuses the same payment URL; an
  upgrade still on its way answers 409 `UPGRADE_PENDING` with its charge; an unpaid one is FAILED(`NO_TRANSACTION`)
  after 24 hours and changes nothing.
- A renewal due while an upgrade is unsettled waits, as today (the Q-1 rule for an unsettled upgrade,
  `renewal.ts:306-316`). An unpaid upgrade closes after 24 hours, so the renewal then goes on; a payment that arrives
  for a closed upgrade is refunded in full (reason `UPGRADE_CLOSED`) and changes nothing.

### 2.11 Changing the card (ruling C-2)

- `POST /v1/billing/subscription/card` creates a CARD_CHECK charge with amount **0** (`cardCheckHoldMicros()` becomes
  0) and starts a hosted payment with `clientId`, the payer and `returnUrl` = `/settings/card?charge=<ref>`. The page
  first shows the billing details, filled in from the profile, so the person can correct them; the request writes a
  new profile event with `paymentIp`.
- VERIFY_PAYMENT treats `PAID` or `AUTHORIZED` as success for a 0 card check (nothing is captured, so there is
  nothing to release: A31 (j)), writes CARD_CHANGED with the new `card_token_id`, and revokes the old token
  (`REPLACED`). The other CARD_CHECK outcomes (`CARD_CHECK_REFUSED` for a blocked country, `CARD_CHECK_DEFERRED`,
  `CARD_CHECK_NOT_LIVE`) are today's, without any refund to make.
- If NETOPIA answers that a 0 check makes no saved card (N-11), go-live row N-11 keeps billing off and the owner rules
  again (a small charge refunded by the owner, or no separate card change).
- The card page's sentence is today's `billing.card.noHoldNote` ("no money is held"); `holdNote` goes.

### 2.12 Refunds (ruling C-3)

#### 2.12.1 What stays

RefundDesk stays the one executor (R-32): every reason it serves (`CARD_COUNTRY_BLOCKED`, `ALREADY_SUBSCRIBED`,
`SUBSCRIPTION_ENDED`, `WITHDRAWAL`, `CARD_CHECK_*`, `DUPLICATE_PAYMENT`), the `REFUND_REQUESTED` row written first in
its own transaction, the refund-sum guard (0086), the split newest-first (A4 (b)), the withdrawal's acknowledgements
(A29 (l)), and the follow-ups after REFUNDED (M8, M11, the credit note). Its job kind becomes `PAYMENT_REFUND`.

#### 2.12.2 The owner mode (while the port has no `refund`)

1. The job writes the stage `OWNER_REFUND_DUE` and emails the owner **O2_REFUND_DUE** (English only): the reason, our
   charge reference, NETOPIA's payment number, the exact amount and currency, what to do ("refund exactly this amount on
   this payment in NETOPIA's admin, in one refund"), and for a withdrawal its legal deadline (`withdrew_at` + 14 days of
   24 hours, art. 13(1), never moved to a weekday). The job is then done; the open `REFUND_REQUESTED` row is what
   stays open.
2. Daily, the reconciler reads the status of every charge with an open owner refund (§2.14). `REFUNDED` records it.
3. Reminders: the daily pass emails the owner one list of the open owner refunds, on the day a refund becomes due, then
   every third day, and every day from three days before a withdrawal's deadline (O2_REFUND_REMINDER, English only).
4. `pnpm billing:refund-done --charge <ref> [--amount <decimal>]` records a refund the owner made when NETOPIA's status
   does not show it: REFUNDED at the requested amount (or at `--amount`, never above what the payment still holds),
   then the same follow-ups. It refuses a charge of another system, one with no open refund request, and an amount above
   the request.

#### 2.12.3 The API mode (once NETOPIA confirms its refund call, N-10)

The package then offers `refund` (`POST {base}/operation/credit` with `{ntpID, amount}`), RefundDesk calls it, and
today's look-before-retry rule (A4 (c)) uses the status read: a payment already `REFUNDED` is recorded, never refunded
again. Turning the API mode on is a code change made after the sandbox recording proves the call, never a setting.

#### 2.12.4 A refund NETOPIA reports

- A `REFUNDED` status on a charge with an open refund request of ours records REFUNDED at the requested amount.
  NETOPIA's status may not say how much was refunded (N-8); the owner was asked to refund exactly that amount, in one
  refund.
- A `REFUNDED` status with no request of ours is a refund made in NETOPIA's admin by hand: today's `PROVIDER_REFUND`
  path (A9, A29 (q), A31 (l), (o)), with the remaining amount as the upper bound, the owner's credit note recorded with
  `pnpm billing:invoice --amount`, and `REFUNDED_BEFORE_START` for a checkout that never started.

### 2.13 Charge-backs

- `CHARGEBACK_OPENED` (status 9): CHARGEBACK, then today's SUSPENDED + FREE entitlement + M10 for a live plan, and no
  plan change for a second payment.
- `CHARGEBACK_LOST` (status 10, "chargeback accepted"): what `pnpm billing:dispute --outcome lost` does today:
  ENDED(DISPUTE).
- `CHARGEBACK_REPRESENTED` (status 16): CHARGEBACK_REPRESENTED, no state change.
- A won dispute has no status of its own: `pnpm billing:dispute --outcome won` stays the owner's step.
- Whether NETOPIA sends a message for each of these is N-8; the daily status reads catch them either way (§2.14).

### 2.14 The checks that replace the transaction listing

NETOPIA has no transaction listing (its API has no reporting route, N-19). The reconciler (`reconcile.ts`) reads
statuses instead, and queues VERIFY_PAYMENT for every charge whose status says something our rows do not yet record.

| Pass | Which charges | When |
|---|---|---|
| frequent (every 10 minutes) | NETOPIA charges that are SUBMITTED, SUBMIT_UNKNOWN or REQUESTED with a hosted payment, not final, older than 10 minutes and younger than 30 days | every pass, at most 200 a pass, oldest first |
| daily | SUCCEEDED charges at 1, 7, 30, 60, 90 and 120 days after the payment (one read each) | catches refunds and charge-backs whose message was missed |
| daily | charges with an open owner refund (§2.12.2) | every day until recorded |
| daily | checkouts and upgrades unpaid after 24 hours | a last read; not paid → FAILED(`NO_TRANSACTION`), as today |

- Each read is isolated: one that fails writes `billing.reconcile.status_failed {code}` and the pass goes on;
  `BILLING_RECONCILIATION_PENDING` still means only that the pass itself failed. A29 (o)'s listing failures and the
  hourly retry of refused listings go.
- At about 1,000 payments a month the daily pass makes about 200 reads; NETOPIA documents no limit (N-18).

### 2.15 The saved card

#### 2.15.1 Storage

`billing.card_token` (§2.5.2), sealed under the records key with the AAD naming the table, the column and the row, so
a ciphertext copied elsewhere does not open. Only VERIFY_PAYMENT, the renewal and the purge read it. The plaintext lives
only between unsealing and the request.

#### 2.15.2 Which card a subscription uses

The newest `card_token` that came from one of the subscription's own SUCCEEDED charges (INITIAL, RENEWAL, UPGRADE,
CARD_CHECK) and is not revoked. NETOPIA's newer token replaces the older one with every token payment (the old stays
valid at NETOPIA, but we use the newest). The adopting event (ACTIVATED, RENEWED, UPGRADED, CARD_CHANGED) records
`card_token_id`. A plan whose first message carried no token still starts (the person paid); it simply has no saved
card, and §2.15.3 asks for one.

#### 2.15.3 Asking for a card before it is needed

The renewal timer's look-ahead (A7's daily job) also checks, ten days before each renewal, whether the subscription
has a usable card: one exists, and its expiry month (when known) ends after the renewal. If not, it sends **M12** once
per period (35 locales): "We'll need your card for your {plan} payment on {date}" with one of two lines: "The card we
have expires before then." or "We couldn't keep your card from your last payment." and a link to `/settings/card`.

#### 2.15.4 Deleting it (ruling C-5)

- When a subscription ends (any ENDED, WITHDRAWN or ERASURE_STOPPED), its tokens are revoked (`PLAN_ENDED`); a card
  change revokes the replaced one (`REPLACED`); an erasure commit revokes them all (`ERASURE`).
- The daily owner job calls `billing.purge_revoked_card_tokens`, so a revoked token is gone within about a day.
- The Privacy Policy must say this (§2.22).

### 2.16 Prices in USD, EUR or RON (Part C)

The owner chose to build for all three; one currency is in force at a time.

- **Only the price changes currency.** The AI credit stays in US dollars, because it is what the AI companies charge us
  (`monthly_credit_micros`, the cost envelopes, the budget package and the evaluator keep `"USD"`). A6's prorated
  credit and the withdrawal's credit share are ratios and do not change.
- `billingPlans.currency` becomes `"USD" | "EUR" | "RON"` (a new register version picks it; the example stays USD, $20 /
  $50 / $200). Prices are whole cents (or bani) as today.
- `billing.charge.currency`'s CHECK becomes `IN ('USD','EUR','RON')` (a migration of Part C).
- Every `"USD"` literal on the price side follows the plan's currency: the contract (`BillingPlansResponseSchema` and
  the quote and charge answers), `TaxEngine.quote`, Quaderno's records, SmartBill's invoices (a RON invoice needs no
  BNR rate; EUR and USD keep today's BNR conversion), the mail renderer and the UI's money formatting, and the tax
  summary (every amount printed with its currency; a quarter with two currencies prints each separately).
- **A live plan keeps its currency (ruling C-6).** The API refuses to boot with `BILLING_CURRENCY_CHANGED_WITH_LIVE_PLANS`
  while any live paid subscription was sold in another currency than the published one; the runbook says to change the
  currency only before the first sale or after the last plan ends.

### 2.17 Configuration, the guided setup and the check command

#### 2.17.1 Settings

| Setting | Where | Notes |
|---|---|---|
| `NETOPIA_API_BASE_URL` | `api.env` | one of §2.4.1's four; it also decides sandbox or live |
| `NETOPIA_POS_SIGNATURE` | `api.env` | private, not a secret |
| `NETOPIA_API_KEY_PATH` | `api.env` → custody file `/etc/debateai/api/billing/netopia-api-key` | secret, one line, 0600, `debateai-api` |
| `NETOPIA_IPN_KEYS_PATH` | `api.env` → `/etc/debateai/api/billing/netopia-ipn-keys.pem` | not secret; one or more PEM blocks; 0644 allowed |
| `XMONEY_*`, the UI's `XMONEY_SDK_ORIGIN` | — | removed; a boot that still finds one prints a warning naming it (never its value) |

`BILLING_ENVIRONMENT_KEYS` and `readBillingEnvironmentGroup` (`runtime-environment.ts:639-710`) carry the new group,
with today's codes (`BILLING_CONFIGURATION_INCOMPLETE:<KEY>`, `BILLING_CONFIGURATION_INVALID:<KEY>`). The custody
aliasing check covers the new files. The sandbox clock (`BILLING_STAGE_CLOCK_OFFSET_DAYS`) works only with a sandbox
base.

#### 2.17.2 The guided setup (`deploy/vps/billing-setup.sh`, run as root)

- Sections `netopia`, `quaderno`, `smartbill`, `owner-email`; run all, or one by name. Each section asks its values one
  at a time, in plain words, with where to find each one.
- **Secrets** are read with `systemd-ask-password` (never shown, never on a command line or in shell history) and
  written as custody files with `umask 0177`, owned by `debateai-api`, in the 0700 directory, as §14.2 of the runbook
  does by hand today. An existing key file is never replaced unless the owner asks (`--replace <section>`).
- **NETOPIA's public key:** the owner pastes the PEM block(s) NETOPIA gave (an empty line ends the paste), or chooses
  NETOPIA's published plugin key. The repository carries that key as `deploy/vps/netopia/published-ipn-key.pem`, with
  where it was read and its fingerprint in a comment. The script prints the fingerprint of every key it writes.
- **Plain values** (the environment, the POS signature, the base URLs, the SmartBill series) go into one block of
  `/etc/debateai/api.env` between the lines `# >>> billing settings (billing-setup.sh) >>>` and `# <<< billing settings <<<`;
  the script replaces only that block and keeps a dated backup of the file.
- It ends by running the check command and printing its list.
- A test runs the script in a temporary root with answers on standard input (a test-only switch the script refuses
  outside its test root) and checks the files, their modes, the block and that no answer is echoed.

#### 2.17.3 The check command (`pnpm billing:check`)

Run under `systemd-run` with the API's settings, like the other owner commands. It prints one line per item, a tick or a
cross and a plain sentence, and **never a secret**:

- every billing setting present and well formed; the environment it implies;
- every custody file: exists, one line, mode and owner right (values never read into the output);
- every trusted NETOPIA key: parses, RSA ≥ 2,048 bits, its fingerprint, and whether it is NETOPIA's published key;
- NETOPIA accepts the API key: one status read of a made-up order (401 means refused; any other answer means
  accepted; nothing is charged);
- the notify address `PUBLIC_APP_URL/api/v1/billing/netopia/notify` answers without a redirect;
- the published register version: `billingPolicy.enabled`, the plans' currency, `countryPolicy` present;
- the company facts are no longer in brackets (today's `BILLING_COMPANY_FACTS_UNVERIFIED` codes).

### 2.18 Pages, copy and emails

- **Checkout** (`CheckoutFlow.tsx`): the plan and price summary; the billing block (first name, last name, phone,
  street, city, postal code, region where needed, country filled in); "Buying as a company?"; the two consents; the
  button **Continue to payment** (`billing.checkout.continueToCard`'s new English: "Continue to payment"). Pressing it
  starts the checkout and navigates. `XMoneyCardForm.tsx` and `lib/billing/xmoneySdk.ts` go.
- **The renewal consent** (`consent.renewal`, hashed per locale by the legal manifest) gains the saved card, because
  NETOPIA's page has no "save card" box and the card rules need the person's agreement on our side: English default
  "I agree that NETOPIA Payments keeps my card and that {total} is charged to it every month until I cancel." The
  owner may reword it; the manifest is regenerated (`pnpm generate:legal`).
- **Security policy:** the card-form additions to `script-src`, `frame-src`, `connect-src` and `form-action`
  (`content-security-policy.mjs:68-118`, `middleware.ts:24-29`) go; the three card pages keep the site's normal
  policy. The optional Caddy pop-up matcher and the TopBar's forced full navigation off the card pages
  (`TopBar.tsx:32-33`) go with them.
- **Settings:** the upgrade button says "Upgrade and pay {amount}" and navigates to NETOPIA; the card page shows the
  billing block and "Check my new card".
- **Copy in 35 locales:** `billing.checkout.cardNote` ("You pay on NETOPIA Payments' secure page. Your card number never
  reaches our servers."), `legal.notice.s04.payments` ("Card payments are processed by NETOPIA Payments. We never see or
  store your card number."), `billing.checkout.cardTitle`, `formUnavailable` ("The payment page could not be opened.
  Please try again in a minute."), the billing block's labels and errors, the upgrade and card-page lines, the return
  page's upgrade sentence, `mail.M5.confirmCard`, M12 and its two lines. English and Romanian are written with care;
  the other 33 are machine translations for go-live row 36. The translators' note says "NETOPIA Payments is a brand
  name; keep it."
- **Owner emails (English):** O2's xMoney-dashboard wording becomes NETOPIA's admin; new O2_REFUND_DUE,
  O2_REFUND_REMINDER and O4.
- **The marks** NETOPIA's shop approval requires (its logo, Visa and Mastercard) sit in the footer and on the checkout;
  the owner supplies the official artwork (go-live rows 17 and N-23).
- **The signed support catalogue:** the `/checkout`, `/checkout/return` and `/settings/card` entries change their label
  and search words ("Subscription checkout", "billing details", "NETOPIA payment page"), so `catalog.sha256` changes and
  the owner signs again before billing goes on (§1.6 item 9).

### 2.19 What is removed

`packages/payments-xmoney`; the xMoney parts of the 14 API files (§2.1.1); `acceptance/billing-fakes/fake-xmoney.ts`
and its re-export; `tools/billing/xmoney-sandbox.ts` and `scrub-xmoney-fixture.ts`; the xMoney-only tests
(`payments-xmoney-*`, `billing-xmoney-*`, `billing-notify-route`'s form cases, `billing-stage-clock`'s xMoney host
rules, `billing-xmoney-card-form` and the CSP pins); `XMoneyCardForm.tsx`, `xmoneySdk.ts`; the `XMONEY_*` settings and
the UI's `XMONEY_SDK_ORIGIN`; the runbook's xMoney steps. The shipped-corpus manifest, the orphan audit, the scaffold's
package count and every pin that names them are updated. The gitleaks entry for the plan's dummy xMoney key stays,
because the plan document keeps that line.

### 2.20 Testing

#### 2.20.1 The NETOPIA protocol fake (`acceptance/billing-fakes/fake-netopia.ts`)

An independent implementation, not built from the package's code:

- `payment/card/start` for hosted starts (a payment URL to a fake page) and saved-card charges, with error 56 for a
  repeated `orderID` and 99 for a repeated one with another amount;
- the fake page's outcomes: approve, decline (with a code), 3-D Secure pending, retry on the same order;
- the message: signed RS512 with a key the test generates, `aud` as an array, `sub` over the exact bytes, a token on
  the first message of a payment made with a client id, a new token on every token payment;
- `operation/status`; dashboard refunds (status 8 and a message); charge-backs (9, 10, 16);
- failure controls: unavailable, outcome unknown (the charge happens, the answer is lost), 401, a message our key cannot
  verify, a lost first message.

It also backs the dev stack (`DEBATEAI_BILLING_FAKES=1`) in place of the xMoney fake.

#### 2.20.2 Suites

- **Unit:** the verifier (genuine; wrong key; `alg` `none`, `HS512` with the public key as the secret, `RS256`; wrong
  `iss`, `aud` and `sub`; `aud` as a string and as an array; the header in any letter case; a body with non-ASCII bytes;
  several trusted keys; a key below 2,048 bits); the status and decline tables; the numeric country table; amounts from
  and to decimal text; the base-URL table; the configuration reader; the setup script.
- **Integration:** migration 0096 on an empty schema and on one holding xMoney-era rows; checkout → page → message →
  VERIFY → ACTIVATED with a saved card; a lost first message (plan starts, M12 asks for a card); a renewal paid,
  declined (bank and not bank), asking for 3-D Secure, and with an unknown outcome settled by the resend's 56; the 0
  card check; an upgrade on the page; an owner-mode refund through to M8 and the credit note; a refund made by hand in
  the admin; the three charge-back statuses; the frequent and daily checks; the token purge; the whole flow; and, in
  Part C, a checkout, renewal and invoices in EUR and in RON.
- **Render:** the checkout's billing block and its errors, the card page, the upgrade button.

#### 2.20.3 The sandbox recording (OWNER-RUN), replacing X0

`tools/billing/netopia-sandbox.ts`, run by the owner on the throwaway test server (runbook §14.9), with the API's
settings; it reads the key file itself and prints no secret. Subcommands:

- `check`: the check command's NETOPIA lines.
- `start --amount 1.00 [--client-id-at order|instrument]`: registers a tool order (`billing.tool_order`) and starts a
  hosted payment for it; prints the payment URL for the owner to pay with a NETOPIA test card.
- `zero`: a 0 card check (N-11).
- `status --order <id> [--no-ntp-id]`: a status read (N-16).
- `charge --from-order <id> --amount 1.00`: a saved-card charge, as a new tool order, with the token the API stored for
  that tool order (N-4, N-12, N-15).
- On live, `start` and `charge` refuse to run without `--live --i-understand-this-charges-my-card` (§2.21's small live
  test); `zero` and `status` need `--live` only.
- `fixture --order <id>`: writes a scrubbed fixture of what the API stored and answered (`tests/fixtures/netopia/`):
  tokens, names, emails, phones and addresses replaced by fixed fakes; ids kept.

A recorded suite runs the package's parsers and §2.4.7's constants against the fixtures; it is skipped by name until
the owner commits them, as the xMoney one was.

### 2.21 Operations

**The runbook** (`deploy/vps/README.md` §14) is rewritten for NETOPIA:

- §14.1 what you need (a NETOPIA account with a POS, sandbox first);
- §14.2 the guided setup and the check command (replacing the hand-made key files);
- §14.5 NETOPIA's message (no admin setting: the address travels with every payment; no redirect; the answers);
- §14.7 the website items NETOPIA checks (logo and card marks, ANPC links, Terms, privacy, cancellation, proof of the
  domain);
- §14.8 the switch from sandbox to live (the guided setup's `--replace netopia` with the live values), refunds in the
  owner mode, disputes, the journal lines;
- §14.9 the sandbox run on its own throwaway server (§2.20.3), NETOPIA's own test of our flow, and the **small live
  test**: one real 1.00 payment with the owner's card through the tool's `start --live` (with a client id), the
  `charge --live` saved-card charge of 1.00, both refunded in the admin, and every row checked.

**Go-live rows** (`docs/missions/2026-09-01-security-hardening/GO-LIVE-CHECKLIST.md`): rows 14, 15, 17–20, 23, 24, 40
and 46 are rewritten or closed for NETOPIA, and the 29 September open items that only xMoney raised are closed as
"void: card processor changed to NETOPIA". New rows hold §2.24's questions that gate billing (N-2, N-4, N-5, N-7, N-10,
N-11, N-14, N-15) and the small live test.

### 2.22 For the colleague and the lawyer

- The Privacy Policy's bracketed "payment provider" becomes NETOPIA Payments (the legal entity and its role — processor
  or independent controller — are counsel's), with what it receives: first and last name, email, phone, billing
  address, the internet address at each payment (including each renewal), the amount, and the card, which NETOPIA keeps
  for the monthly payments. Our side keeps the saved-card code only while the plan lives (§2.15.4).
- The Terms' payment clauses name NETOPIA where they name the processor.
- The renewal consent's new wording (§2.18) is the card-on-file agreement; counsel confirms it.
- ANPC: the Terms' bracket "[the ANPC – named SAL entity, website]" and the site's ANPC links, which NETOPIA's shop
  approval checks (§2.21).

These are go-live row 24's; the build does not edit the legal drafts.

### 2.23 Order of work

- **Part N (NETOPIA)**, one pull request to `dev`, billing off: the port and the package; the fake; migration 0096;
  configuration, the guided setup and the check command; checkout and the billing block; the notice route and intake;
  VERIFY_PAYMENT; renewals; upgrades; the card change; refunds; charge-backs; the checks; the saved card; pages, copy,
  emails; the removals; the runbook, the go-live rows and the records; the recording tool.
- **Part C (prices in USD, EUR or RON)**, its own pull request after Part N merges.
- Each part ends with a final review, a fix wave and the controller's records, as Parts 1–4 did.

### 2.24 Open NETOPIA facts and where each one bites

The email (§1.6 item 1) asks every one. "Gate" means a go-live row keeps billing off until it is answered.

| # | Question | What the build assumes until answered | Gate |
|---|---|---|---|
| N-1 | Canonical base URLs; POS signature format | both pairs accepted; the five-groups-of-four form | — |
| N-2 | Where `clientID` goes; its format | `order.clientID`; 32 lower-case hex | yes |
| N-3 | `scaExemptionInd` values; anything else on the first payment | `"MIT"` on saved-card charges only | — |
| N-4 | Where the token is in the first message; is the new one in the charge's answer, its message, the status read | the three paths of §2.4.3, in that order; every source stored | yes |
| N-5 | The official key(s) for the messages, sandbox and live; rotation | a trust list; the published plugin key offered | yes |
| N-6 | JWT time units | no time check (§2.4.6) | — |
| N-7 | The exact answer to a message; the resend policy; does a resent first message still carry the token | §2.7.2's bodies; 503 for "try again" | yes |
| N-8 | Which status changes send a message; the refunded amount | statuses read daily (§2.14); the requested amount | — |
| N-9 | Status 3 versus 5 | both are PAID | — |
| N-10 | Is the refund call available | no: owner mode (§2.12.2) | — (owner mode works) |
| N-11 | Does a 0 check with `clientID` give a saved card | yes | yes |
| N-12 | Saved-card charges: mandatory fields; which IP; the answer when the bank wants 3-D Secure; retryable codes | the full payer; the latest in-person IP; 100/15 → `ACTION_REQUIRED`; §2.4.5's table | — |
| N-13 | `orderID` length and characters | 32 lower-case hex is accepted | — |
| N-14 | Currencies; settlement | USD until the owner publishes another (§2.16) | yes |
| N-15 | Is a repeated `orderID` refused (56) for token payments too; may a resend reuse it | yes (§2.9.3) | yes |
| N-16 | A status read by `orderID` alone | tried; on failure, §2.9.3 step 2 | — |
| N-17 | Do wallets, Click to Pay, BT Pay or instalments on the first payment give a saved card; can the first payment be card-only | not guaranteed: a plan with no saved card asks for one (§2.15.3) | — |
| N-18 | Parameters added to the return address; `cancelUrl`; rate limits; message sources; TLS; redirects | none trusted; no `cancelUrl`; no limit; no redirects | — |
| N-19 | A reporting or listing API | none (§2.14) | — |
| N-20 | Sandbox test cards | the two in NETOPIA's OpenAPI file | — |
| N-21 | What the recurring flag switches on | token payments | — |
| N-22 | Does NETOPIA email the payer; can it be turned off | `emailTemplate: ""` | — |
| N-23 | Merchant rules for subscriptions: notice before an amount change, site content, AI services accepted, refused card countries | A7's 7 business days kept; §2.21's site items | yes (site items) |
