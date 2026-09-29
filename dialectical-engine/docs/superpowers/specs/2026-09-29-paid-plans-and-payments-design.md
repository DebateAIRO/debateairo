# Paid plans, payments and fair limits: design

- **Date:** 29 September 2026
- **Branch:** `design/2026-09-29-paid-plans-xmoney`, off `origin/dev` 24be86f5. It also carries the 28 September design
  "A debate is (almost) never stopped for money" (commit 302ceec9), because Part 1 of this program builds it. Nothing is
  pushed.
- **Owner goal (29 September 2026):** a payment system through xMoney. Registration and payment must be easy and
  flawless. The plans are $20, $50 and $200 a month plus VAT. The owner must be able to see where the VAT has to be
  paid. The site must block the countries our Terms and our AI providers do not allow. Each person gets a monthly,
  weekly and daily limit with a small leeway so a running debate can finish. The engine must choose the models
  **before** a debate starts, so the debate fits the person's budget.
- **Owner decisions:** all taken on 29 September 2026. They are listed in §1.10.
- **Status:** written spec, awaiting the owner's review. No code has been written.

This document has two parts. **Part 1** is for the owner and uses plain words. **Part 2** is for the people and agents
who build it, with file and line references.

---

## Part 1 — For the owner

### 1.1 In one paragraph

A person signs up, picks a plan, and pays with a card in a card form that sits inside our own page. The form belongs to
xMoney, so the card number never touches our servers. Before they pay, they see the full price including their
country's tax, worked out by a tax service called Quaderno. From then on our server charges the saved card once a month
and emails an invoice. Each plan gives a monthly amount of AI credit, with a daily and a weekly slice so it cannot all
be used up in one day. Before each debate, the engine estimates its cost and chooses models that fit what is left. A
debate that is already running may go 10% over to finish, and we pay that extra. When there is no room left, the
question waits and starts by itself at the next reset, or the person can upgrade straight away. Every country has two
switches: whether people there may sign up, and whether they may pay. Nothing changes on the live site until you
switch billing on. People who run the code on their own computer never see billing at all.

### 1.2 The plans

| Plan | Price before tax | AI credit per month | Daily cap | Weekly cap | What it unlocks |
|---|---|---|---|---|---|
| **Free** | $0 | $0.20 | — | — | 2 debaters, the cheapest models, fixed settings |
| **Plus** | $20 | $5 | $1 (20%) | $2.50 (50%) | everything: 3 debaters, all settings, the best models |
| **Pro** | $50 | $20 | $4 | $10 | everything |
| **Max** | $200 | $150 | $30 | $75 | everything |

- **AI credit** means what the AI companies charge us for that person's debates, including the verdict story, at the
  prices we configure. The help chat is free.
- **When limits reset.** The month starts on the day the person subscribed. For Free, it starts on the day they signed
  up. Weeks are 7-day blocks counted from that start. Days are 24-hour blocks that begin at the same time of day. So
  every reset has a fixed time, and the person sees it in their own time zone.
- **The leeway (110%).** A debate that is already running may take the person up to 110% of any limit so it can
  finish. The engine tries cheaper models first. The extra is on us; it is not taken from next month. New questions
  still wait once a limit reaches 100%.
- **What people see.** Three bars, for example: "Today 40% · This week 22% · This month 15%", with the reset times.
  No dollar amounts of credit are shown anywhere. The pricing page shows prices, and describes the allowance as a
  multiple, the way other AI products do: "Pro: 4× the Plus allowance", "Max: 30×".
- **All prices and credits are settings, not code.** Changing them means publishing a new version of the site's
  settings. The same applies to the list of countries.
- **Free, measured honestly.** Nobody has measured a real debate's cost yet. The first estimate says a small debate
  on cheap models costs about $0.19, so Free covers roughly one small debate a month. We will check this after the
  first paid test debates (§1.8).

### 1.3 What a person sees and does

**Signing up**

1. They choose a plan on the pricing page, or just sign up for Free.
2. They fill in the sign-up form. It is the same as today: email, recovery email, password, and the three tick boxes.
   The server now keeps a record of which version of the Terms and the Privacy Policy they accepted.
3. They confirm their email and set up two-step login. Nothing changes here.
4. They sign in and land directly on the checkout for the plan they chose.

If their country does not allow sign-up, the form says so in plain words before they type anything.

**Paying**

1. On the checkout page we pre-fill their country from their internet address. For the US and Canada we also ask for
   a state or postal code. People buying as a company can open "Buying as a company?" and enter the company name,
   address and VAT number. The VAT number is checked live.
2. The page shows the full price, for example: "Plus — $20.00 + $4.20 VAT (21%, Romania) = $24.20 per month. Renews on
   the 29th of each month until you cancel."
3. Two tick boxes: one accepts the renewal terms, the other says "Start now" and explains the 14-day withdrawal rule.
4. They type their card into xMoney's card form on our page. Their bank may ask for its security check in a small
   window.
5. They press **Subscribe and pay**. The plan is active as soon as xMoney confirms, which is usually within seconds. A
   confirmation email follows, with the Terms and the withdrawal form attached.

**Using the plan**

- The usage bars appear in Settings and on the ask page.
- Before a question starts, the engine picks models that fit what is left.
- When a limit is close, the ask page says so. The debate still runs in full.
- When a limit is full, they can still ask. The question waits and starts by itself at the reset time. Only one
  question can wait at a time. The page also offers an upgrade.

**Changing, cancelling, leaving**

| What they do | What happens |
|---|---|
| **Upgrade** | Takes effect immediately. They pay the difference for the rest of the month, and the bigger allowance applies at once. Credit already spent this month still counts. |
| **Downgrade** | Takes effect at the next renewal. |
| **Cancel** | One click in Settings → Subscription, or on a `/cancel` page that works without signing in (we email them a link). They keep the plan until the paid month ends. There are no further charges. |
| **Withdraw (EU/EEA/UK, first 14 days)** | They get back the price minus the part already used. "Used" is whichever is larger: the share of days gone, or the share of credit spent. The money goes back to the card and the plan ends at once. |
| **Card fails at renewal** | We retry after 1, 3 and 7 days and email each time. They keep the plan during the retries. After the last retry they move to Free. Their debates are never deleted. |
| **Card dispute (chargeback)** | Paid features pause while the dispute lasts. |
| **Delete account** | The renewal stops at once. Invoices and tax records stay for the 10 years the law requires, kept apart from the account. |

### 1.4 Tax and invoices: who does what

| Job | Who does it |
|---|---|
| Working out the tax for each person (EU VAT, UK VAT, US sales tax, Canadian GST, …) | **Quaderno**, asked by our server before every charge |
| Proving where the customer is (EU and UK rules need two agreeing pieces of evidence) | Our server stores three for 10 years: the country of the internet address, the country of the card's bank (from xMoney), and the country the person chose. If the address and the chosen country disagree, we ask the person. If the card is from a blocked country, we refund and cancel automatically. |
| Checking a company's VAT number | Quaderno |
| The legal invoice | **Exactly one per charge.** Romanian customers: **SmartBill**, which also sends it to ANAF's e-Factura and shows the VAT in lei. Everyone else: **Quaderno**, as a PDF in their own language, attached to our receipt email. |
| Refund documents | Quaderno or SmartBill, whichever issued the invoice, issues the credit note. |
| **Where to send the tax** | See the table below. |

**Where the tax goes**

| Customers in | You pay | How and when |
|---|---|---|
| Romania | ANAF, in your normal Romanian VAT return (D300) | as today; the accountant uses SmartBill's data |
| Other EU countries (consumers) | **ANAF, once, for all of them**, through the EU One-Stop Shop (form 398) | every quarter, by the end of the following month (30 Apr, 31 Jul, 31 Oct, 31 Jan), in euro at the ECB rate of the quarter's last day. ANAF passes each country its share. Quaderno's "EU OSS report" has the figures. |
| EU companies with a valid VAT number | nothing: the invoice says "Reverse charge" | declared in the monthly D390 statement; the accountant uses Quaderno's list |
| Norway, Iceland | nothing until sales pass NOK 50,000 or ISK 2,000,000 a year; after that, their simplified schemes (VOEC, VOES) | Quaderno warns you when a limit is crossed |
| US, Canada, Australia, New Zealand, Singapore, Japan | nothing until you pass each place's threshold; after that, a registration there | Quaderno watches the thresholds and warns you |
| UK, South Korea, India, UAE, Saudi Arabia, Mexico, Argentina, Colombia, Chile, Thailand, Philippines | tax is due from the first sale | payment stays **switched off** in these countries until you register there and mark it done (§1.5) |

**You get the answer three ways:**

1. **Quaderno's dashboard.** It has the tax reports and the threshold warnings.
2. **A plain summary email every quarter.** For each country or state it shows the tax collected, whether we are
   registered there, and where and by when to pay.
3. **The same summary on demand**, from one command on the server. It is built from our own copy of every charge, so
   it does not depend on one vendor.

### 1.5 Countries

Every country has two switches: **"can sign up / use Free"** and **"can pay"**. When a switch is off, we record why:
the Terms, sanctions, or an AI provider's rules.

| Group | Sign up / Free | Pay | Why |
|---|---|---|---|
| EU 27, Norway, Iceland | on | on | Covered by the Terms (Annex A.1); one EU return for all of the EU |
| US, Canada, Australia, New Zealand, Singapore, Japan | on | on | Covered by the Terms; tax only past thresholds, which Quaderno watches |
| UK, South Korea, India, UAE, Saudi Arabia, Mexico, Argentina, Colombia, Chile, Thailand, Philippines | on | **off** until you mark the tax registration done | Covered by the Terms; tax from the first sale, or not yet checked |
| Liechtenstein | on | off | It shares Switzerland's VAT, which needs a Swiss tax representative |
| Switzerland, Israel, Taiwan, Ukraine | off, for later | off | The Terms have no section for them yet. Ukraine also needs the occupied regions blocked, which Anthropic requires. |
| Turkey, Brazil, Indonesia | off | off | The Terms keep them out until a local annex exists |
| Russia, Belarus, China, Hong Kong, Macau, Iran, North Korea, Cuba, Syria, Venezuela, Vietnam | **blocked** | blocked | Sanctions, the Terms, and the AI providers' country lists |
| Everywhere else | off | off | The Terms do not cover them |

**How we tell where someone is**

- **Their internet address,** looked up in DB-IP's free country database. It is refreshed every month, and the site
  footer carries the credit link its free licence requires.
- **A daily list of Tor exit points,** so anonymous connections are refused.
- **VPNs cannot be detected perfectly,** and regulators do not expect it. The card's country is the second lock.

**Where it is checked**

| When | What is checked |
|---|---|
| Sign-up | the internet address |
| Checkout | the internet address, the chosen country, and afterwards the card's country |
| Each new debate | only the always-blocked list |

Signing in is allowed everywhere, so people can always reach their own data. A subscriber travelling in a blocked
country can read their debates but cannot start new ones.

### 1.6 The money check

Your own calculation: 1,000 people on Plus bring $20,000 a month. The API credit is $5,000 and the fixed costs are
$12,000, so $3,000 is left. With the running costs of this design:

| Line | Monthly |
|---|---|
| 1,000 × Plus | $20,000 |
| API credit, if everyone uses all of it | −$5,000 |
| The 10% leeway, in the worst case (everyone overshoots every month) | up to −$500 |
| Card fees (xMoney publishes no price list; 1.5–2.5% is typical) | about −$300 to −$500 |
| Quaderno (plan for 1,000 charges a month) | −$99 |
| SmartBill (API plan; only Romanian invoices use it) | about −$10 |
| Your fixed costs | −$12,000 |
| **Left** | **about $1,900–2,100**, before unused credit is counted |

- **Unused credit raises the margin.** Most people do not spend their whole allowance.
- **Free users cost up to $0.20 each.** 10,000 Free users would cost up to $2,000 a month.
- **Per plan, what is left after the full credit and about 2% card fees:**
  - Plus: about $14.35
  - Pro: about $28.75
  - Max: about $45.75, or about $30.75 if the full 10% leeway is used every month.
- **Quaderno's price depends on volume:** about $99 a month at 1,000 charges, $149 at 2,500 and $249 at 5,000. The
  $49 plan covers only 250 charges.
- **Taxes are not income.** We collect them and pass them on.

### 1.7 What you need to do (nothing blocks the build)

| # | Who | What |
|---|---|---|
| 1 | You | Open an xMoney merchant account (a Romanian S.R.L. qualifies). Ask them: are AI subscriptions accepted? Which card countries are refused? What is the key format for decrypting their payment notices? Does the card-country field come back? Do renewals, retries and disputes send notices? Can a "managed" order be charged again without the bank's security check? What are the fees? |
| 2 | You | Open Quaderno (Business plan to start) and SmartBill (Platinum, which is the plan with the API). Create the API keys; they go onto the server as protected files. No agent ever sees them. |
| 3 | Accountant | Confirm: the One-Stop Shop registration (ANAF), two invoice series (SmartBill for Romania, Quaderno for the rest), the VAT in lei on USD invoices, the e-Factura scope, and how Quaderno's exports go into the books and SAF-T. |
| 4 | Your colleague and the lawyer | The list in §2.12: Terms §2 country list, the §12 blanks, the new §13 refund formula, the Privacy Policy's new recipients (xMoney, Quaderno, SmartBill, DB-IP), 10-year evidence storage, the company details page, Gemini's paid tier for EU users, and where the Chinese-made models are hosted. |
| 5 | You | Register for tax in each "pay off" country you want to open, then switch it on in the country settings. |
| 6 | You | Run the test checkout in xMoney's sandbox with its test cards; the runbook in §2.11 has the steps. |
| 7 | You | Switch billing on: publish the settings version that turns it on. |

### 1.8 What is deliberately left out

| Left out | Why | What covers it |
|---|---|---|
| Crypto payments | Your ruling: cards and ordinary currencies only at launch | Later, as a one-off "pay a month in crypto" option |
| Credit packs (top-ups) | Your ruling: upgrade only | Upgrading is immediate and prorated |
| Yearly plans | Not asked for; they bring extra reminder rules | Later |
| Changing the price for existing subscribers | They keep their price. Changing it needs 30 days' notice by email (Terms §12) | A command for this is built the first time you change a price |
| A website login for the owner | None exists today (owner-only routes always refuse). Building one is its own security design. | Quaderno's dashboard, the quarterly email, the server command |
| Switzerland, Israel, Taiwan, Ukraine; Turkey, Brazil, Indonesia | The Terms do not cover them yet | A settings change once the Terms are ready. Ukraine also needs region blocking (§2.4.4). |
| Detecting VPNs | Cannot be done reliably; not expected | The card's country is checked too |
| Pausing a half-finished debate and resuming it later | Left out in the 28 September design | Its approach 3, only if paid debates show it is needed |
| A real debate's measured cost | Needs real paid API calls, which only you can start | The first paid test debates. The plan numbers can be revised after them. |

### 1.9 Your model list, priced (reference only; never written into code)

Prices are in dollars per million tokens, input / output, as read on 29 September 2026. Models, providers and prices
are configuration, so the cheapest good provider can replace any of them.

| Model | Input | Output | Note |
|---|---|---|---|
| Qwen 3.8 Flash (Alibaba) | $0.11–0.15 | $0.38–0.47 | cheaper in the Frankfurt/Virginia region |
| GLM 5.3 Flash (Z.ai) | $0.15 | $0.50 | its parent company is on the US Entity List (lawyer item, §2.12) |
| Cohere Command A+ | ~$0.30 | ~$1.50 | through OpenRouter; open weights, so it can be self-hosted in the EU |
| Amazon Nova Lite | $0.06 | $0.24 | Nova 2 Lite: $0.30 / $2.50 |
| Gemini 3.8 Flash Lite | — | — | **exists only as a voice model.** The nearest text models are 3.5 Flash-Lite ($0.30 / $2.50) and 3.8 Flash ($0.75 / $3.75 until 31 Dec 2026, then double) |
| ChatGPT 6 Luna | $0.10 | $0.50 | |
| DeepSeek V4 Flash | $0.30 | $1.20 | half price off-peak |
| Grok 4.7 | $2.00 | $6.00 | |
| ChatGPT 6 Astra | $10 | $50 | |
| Claude Opus 5.5 | $4 | $20 | |

A rough sense of scale: a three-debater debate makes about 114 AI calls. On the cheap models above it costs cents. On
Opus 5.5 or Astra it can cost several dollars, which is why the engine picks models to fit each person's remaining
room.

### 1.10 Your decisions (29 September 2026)

| Question | Your choice |
|---|---|
| What paid plans unlock | the same features on every plan, only the credit differs; Free = 2 debaters, cheapest models, fixed settings |
| Daily and weekly caps | day 20%, week 50% of the monthly credit; Free has only its monthly $0.20 |
| Leeway | up to 110% of each limit to finish a running debate; the extra is on us |
| How usage is shown | percentage bars with reset times |
| Where we sell | the US and more, "almost the full list of languages"; then: every region the Terms already cover |
| Who handles tax | a tax service at checkout, not our own code; then: Quaderno |
| Currency | USD, tax added per country |
| The company's VAT status | already VAT-registered in Romania |
| Invoices | through an invoicing service API; SmartBill for Romania (you changed this from Oblio) |
| Company customers | yes, at launch |
| Withdrawal refund | price × (1 − the larger of days used or credit used) |
| Crypto | none at first, "only normal cards with FIAT currency" |
| Out of credit | upgrade only |
| Plan names | Free / Plus / Pro / Max |
| How to build it | one program in 3 parts, in order |
| Where the card is typed | xMoney's card form inside our page |
| Sections A–D | approved |

---

## Part 2 — For the builders

Paths are relative to `dialectical-engine/`. Line numbers are at `origin/dev` 24be86f5 unless marked otherwise.
"Budget spec" means `docs/superpowers/specs/2026-09-28-budget-never-stops-a-debate-design.md` (on this branch).
"Scorecard" means the unmerged branch `design/2026-09-26-model-scorecard` (worktree
`.claude/worktrees/model-scorecard-design`, HEAD 75a34420).

### 2.1 Starting point (verified 29 September 2026)

**Money**

- **Units.** Money is integer USD micros: `COST_MICROS_PER_USD` (`packages/budget/src/cost-envelope.ts:27`), stored
  as `bigint`.
- **Spend ledger.** `ledger.model_spend` (`migrations/0066_model_spend_ledger.sql:43-64`, plus `spend_phase` in
  0075).
  - It has no owner column.
  - Sources: RUN and STORY are written; SUPPORT is defined but never written.
  - The owner is derived through `core.run.asker_id = 'owner:'||owner_ref` (`packages/db/src/index.ts:1235-1237`) or
    through the latest `core.run_ownership_event` (`migrations/0037_run_ownership.sql:172-182`).
  - There is no index on `owner_ref`.
- **Ceilings.** The per-run and daily ceilings come from one deployment-wide policy (`CostEnvelopeGuard`,
  `packages/budget/src/model-spend.ts:326-569`; values `packages/register/src/cost-envelope-policy.ts:297-313`):
  - per run: $0.25
  - per day: $2
  - reserve: 30%
  - overrun: 20%
  - These are provisional values.
- **Prices.** They are flat input/output micros per million tokens, carried on each `PROVIDER_DISCOVERY_TARGETS_JSON`
  target (`packages/providers/src/index.ts:152-197`). Hosted mode requires a non-zero price
  (`assertPricedProviderTargets`, `:686-708`).

**Plans, the ask and ownership**

- **Plan tier.** `plan_tier` is **client-supplied and never checked against an account**.
  - Schema: `packages/contract/src/index.ts:147`; checked only against the roster in
    `apps/api/src/index.ts:2588-2610`.
  - Free "fixed gauges" exist only as disabled UI controls (`apps/ui/app/new/NewDebatePageClient.tsx:261-383`).
  - The roster is hard-coded in `PLAN_TIER_ROSTERS` (`packages/contract/src/plan-tiers.ts:8-11`).
  - `core.run.plan_tier` is a plaintext column made "for billing" (`migrations/0067_plan_tier_on_run.sql`).
- **Admission.** `evaluateAskAdmission` (`apps/api/src/index.ts:2559-2641`) does not receive the owner. `submit`
  resolves ownership first (`:2713-2718`). The per-owner advisory lease `withOwnerAskAdmissionLease`
  (`packages/db/src/index.ts:1007`) is taken **after** admission (`apps/api/src/index.ts:2727`).

**Sign-up, legal documents and account deletion**

- **Sign-up.**
  - `POST /v1/auth/register` (`apps/api/src/index.ts:1986`, `apps/api/src/registration.ts:1359`) accepts `email`,
    `password`, `recovery_email` and `adult_affirmed`.
  - **Terms and Privacy acceptance are not recorded on the server.** Only `identity.user.adult_affirmed_at` is stored.
  - The UI's two tick boxes (`apps/ui/components/SignUpFlow.tsx:170-176, 382, 408`) never reach the server.
  - The Terms claim such a record exists (`apps/ui/legal/en/terms-of-service.md:57`), as does the Privacy Policy
    (`privacy-policy.md:45, 115`).
- **Legal documents.** They are Markdown in `apps/ui/legal/<locale>/`, generated into `apps/ui/lib/legal/**` by
  `pnpm generate:legal`, and shown only in modals. The `LegalDocument` type has no version or hash field
  (`apps/ui/lib/legalDocument.ts:31-49`).
- **Erasure.**
  - `identity.finalize_account_erasure` runs `DELETE FROM identity."user"` (`migrations/0040_account_erasure.sql:5679-5836`).
  - A child table with `ON DELETE CASCADE` loses its rows. A `RESTRICT` foreign key blocks erasure.
  - The records that survive use `ON DELETE SET NULL` (`0040:790-793`) or have no foreign key.
  - Anything under the user DEK becomes unreadable.

**Network path, security headers, mail and timers**

- **Client IP.** The chain is Caddy (`deploy/vps/Caddyfile:50-60`) → `apps/ui/trusted-client-ip.mjs:124-156` →
  Next proxy `apps/ui/app/api/[...path]/route.ts` (header allowlist `:8-25`; `content-type` passes; body up to 1 MiB)
  → Fastify `trustProxy` loopback (`apps/api/src/client-ip.ts:9-12`) → `request.ip`.
  - No Cloudflare sits in front. `cf-*` headers are stripped.
  - There is no geo logic anywhere.
- **API server.** Fastify 5.12.1 (`apps/api/src/index.ts:1467`).
  - Every route must appear in `authorizationPolicyInventory` (`:1069-1126`).
  - Operator routes always answer 403 `OPERATOR_REQUIRED` (`:1635`).
  - Only JSON and text parsers exist; there is no raw body; no inbound webhook exists.
  - A template for an authenticated POST: `POST /v1/account/erasure/cancel` (`:1877-1896`).
- **Content security policy.**
  - `apps/ui/content-security-policy.mjs:17-27`: `default-src 'self'`, `connect-src 'self'`, `form-action 'self'`,
    `frame-ancestors 'none'`, and no `frame-src`.
  - `Permissions-Policy … payment=()` (`apps/ui/next.config.mjs:32`).
  - Caddy sends `Cross-Origin-Opener-Policy: same-origin`.
- **Mail.** `sendmail` with English-only hardcoded text (`apps/api/src/mail-channel.ts`). The durable-outbox template
  is `identity.account_erasure_notification_outbox` (`0040:890-919`, claim `:5913-5955`).
- **Timers.** Each follows the same pattern: `setInterval(...).unref()`, a single-flight wrapper, cleared on close,
  and a first run after listen (`apps/api/src/main.ts:485-555`, `:766-770`, `:835-836`). Production runs one API
  instance (`deploy/vps/README.md:986`).

**Configuration and code rules**

- **Configuration and secrets.**
  - `/etc/debateai/api.env` → `apiEnvironmentShape` (`packages/register/src/runtime-environment.ts:312-367`, zod
    strict) → `validateApiEnvironment`.
  - Secret files go through `readCustodyFile` loaders (`packages/crypto/src/index.ts:740-924`), inside
    `boot.runSync` plus `boot.hold` (`apps/api/src/main.ts:146-180, 341`).
  - Non-secret policy lives in sealed register rows at `REGISTER_VERSION`.
- **Source rules.**
  - No `process.env` outside `runtime-environment.ts` (`tools/orphan-audit/src/index.ts:675`).
  - No exported numeric constants outside `packages/published-arithmetic`.
  - Every `switch` has `default:` plus `exhaustive(`.
- **Migrations.**
  - Forward-only, sorted by filename. The highest is `0076_serve_disclosure`; 0070 is missing.
  - The budget spec claims 0077. The scorecard's `0072_model_scorecard` collides with dev's 0072.
  - The append-only template is 0066 (`:81-158`): truncate guard, `reject_mutation`, and a verify block.

**Locales**

- 35 locales (`apps/ui/lib/i18n/locales.ts:21-57`), each with 14 namespaces.
- Parity checks: `apps/ui/lib/i18n/catalogContractAssertions.mjs:26-65`.

**External facts**

- **xMoney** (docs.xmoney.com; OpenAPI `/_bundle/api/reference.yaml`, a copy in the session scratchpad):
  - Stage API `https://api-stage.xmoney.com` / live `https://api.xmoney.com`. Stage SDK
    `https://secure-stage.xmoney.com` / live `https://secure.xmoney.com`.
  - Bearer auth with the site's private key. Form-encoded bodies; JSON replies `{code,message,data}`.
  - Embedded form: `https://secure.xmoney.com/sdk/v2/xmoney.js` → `window.XMoney.paymentForm()`. The backend signs a
    base64 order JSON with HMAC-SHA512 (private key) and hands `publicKey`, `orderPayload` and `orderChecksum` to the
    browser.
  - Order types: `purchase | recurring | managed`. The `managed` type is charged again with
    `PATCH /order-rebill/{id} {customerId, amount}`.
  - Cancel: `DELETE /order/{id}` with `terminateOrder=yes`. Refund: `DELETE /transaction/{id}` with an `amount`
    (partial refunds allowed).
  - Card country: `GET /card/{id}` → `binInfo.countryCode`. Customer IP: `GET /transaction/{id}` → `ip`.
  - The notice is a POST with `opensslResult` = `"<iv b64>,<cipher b64>"`, AES-256-CBC keyed with the private key.
    It must be answered `200 OK`. Retries come at 1 minute, 5 minutes, 1 hour and 24 hours, then stop.
  - `signature` is undocumented. There is no MAC.
  - Merchant rules: consent text, confirmation within 2 business days, and a notice at least 7 business days before
    a charge whose amount or date changed. Consent is kept 18 months after the last charge.
  - The website must show the merchant's name and address, refund, cancellation, delivery and privacy policies,
    phone and email, the Visa and Mastercard logos, and a T&C tick box at checkout.
- **Quaderno** (developers.quaderno.io):
  - `GET /tax_rates/calculate` takes `to_country`, `to_postal_code`, `tax_id`, `tax_code` (saas), `amount`,
    `currency`, `tax_behavior`. It returns a `status`: `taxable | non_taxable | not_registered | reverse_charge`.
  - Sales are recorded with `POST /transactions` (`type: sale | refund`, `processor`, `processor_id`, `evidence`).
  - Tax IDs are checked with `GET /tax_ids/validate`.
  - Reports are requested with `POST /api/reporting/requests`.
  - Login is HTTP Basic with the API key. A sandbox exists. There is no Node SDK.
  - All target countries are covered except Brazil. It does not do Romanian e-Factura.
- **SmartBill:**
  - The API needs the Platinum plan (€8.94 a month, 700 documents included, then €0.017 each).
  - Invoices in any currency at the BNR rate, with automatic e-Factura sending.
  - The limit is 3 calls a second; going over blocks access for 10 minutes.
  - The exact endpoints are confirmed in plan task P2-SB-0.
- **DB-IP Lite country database:** CC BY 4.0 with a required credit link, MMDB format, monthly, no account needed.

### 2.2 Rules that bind every part

1. **Hosted only.**
   - Everything in this document runs only when `DEPLOYMENT_MODE === "hosted"` **and** the published `billingPolicy`
     row says `enabled: true`.
   - Local mode keeps today's behaviour exactly: no country gate, no allowance, no billing routes (they answer 404),
     and `plan_tier` is taken from the client.
   - With billing off in hosted mode, the site behaves as it does after Part 1 of the budget spec: the site's day
     only.
2. **Settings are sealed register versions,** never edited: `billingPlans`, `billingPolicy`, `countryPolicy`, and
   the budget spec's `costEnvelopePolicy` members. Development constants sit next to their parsers, like
   `COST_ENVELOPE_POLICY_DEPLOYMENT_REGISTER_ROW`. Hosted versions are published with `pnpm register:publish-hosted`.
3. **No number literals exported as constants** outside `packages/published-arithmetic`. Prices, credits, basis
   points and retry days live in register rows.
4. **Money tables are append-only.** Each has the truncate guard, `reject_mutation` and a verify block (0066 pattern).
   The current state is a fold over events, or a view over them. Amounts are `bigint` micros.
5. **The database survives erasure.**
   - No money or legal table has a foreign key to `identity."user"`. Rows are keyed by `owner_ref uuid` with no
     foreign key.
   - Personal fields on them are encrypted under the new **records key** (§2.3.1), never the user DEK.
   - Scheduling an erasure stops renewals at once (§2.5.6).
6. **Logs are content-free.** Codes, identifiers and counts only; never an email, name, address, card detail or
   free text.
7. **Every user-facing sentence exists in all 35 locales** and passes the parity checks. There are no figures of our
   API cost. The owner's look-gate rule of 26 September 2026 applies to engine text.
8. **Every secret is a custody-checked file,** loaded with `readCustodyAuthorizationHeader` or `loadSecretKey`,
   held and zeroed through `boot.hold`, and listed in the support KEK's `protectedKeyPaths`. No agent ever sees a
   real key.
9. **A new route** is declared in `authorizationPolicyInventory`, has a zod schema in `packages/contract`, and
   appears in `contractInventory.routes` (`pnpm generate:contract`).
10. **Migrations start at 0078.** 0077 belongs to the budget spec. The scorecard renumbers after the last billing
    migration when it merges (Part 3).

### 2.3 Part 1a — Legal groundwork

#### 2.3.1 The records key

- **What it is.** A new 32-byte key file, `RECORDS_KEY_PATH`, loaded with `loadSecretKey`.
- **What it protects.** The personal fields that must outlive an account: acceptance evidence, billing profile, and
  location evidence.
- **The encryption.** AES-256-GCM through the crypto package's AEAD helpers. The AAD names the table, the column and
  the row id, the way user-DEK AADs do (`apps/api/src/registration.ts:1262-1270`).
- **Which service holds it.** The API only. The runner never needs it.
- **Wiring.** It is added to `apiEnvironmentShape` (required when hosted), `api.env.example`, the dev secret
  generator (`apps/runner/src/dev-secret-files.ts`) and `assertPublicationSecretDomains({additionalSecrets})`, so it
  must differ from every other key.
- **Rotation is left out.** A `key_id` column is kept on each ciphertext so rotation can be added later.

#### 2.3.2 Recording acceptance of the Terms and the Privacy Policy

**The document manifest**

- `pnpm generate:legal` also writes `packages/legal-manifest/src/manifest.json`, in a new package. For each locale and
  each document (`TERMS`, `PRIVACY`) it holds `{version, sha256}`, where `sha256` is the hash of the exact Markdown
  bytes.
- The package exports `currentDocument(kind, locale)` and a `requiresReacceptance` marker. The marker is the
  document version from which people who accepted older versions must accept again.
- The generated file is pinned by a test, like `tests/unit/legal-documents-data.test.ts`.

**The table**

`legal.acceptance` (migration 0078; append-only):

| Column | Type / values |
|---|---|
| `acceptance_id` | uuid |
| `owner_ref` | uuid, **no foreign key** |
| `kind` | `TERMS` \| `PRIVACY_SHOWN` \| `RENEWAL_TERMS` \| `IMMEDIATE_START` \| `ADULT` |
| `document_version` | text |
| `document_sha256` | char(64) |
| `locale` | text |
| `surface` | `SIGN_UP` \| `CHECKOUT` \| `REACCEPT` |
| `accepted_at` | timestamptz |
| `evidence_ciphertext` | bytea, under the records key: `{ip, user_agent}` |
| `key_id` | text |

It gets an index on `(owner_ref, kind, accepted_at DESC)`.

**Sign-up**

- The register request gains `terms: {version, sha256}`, `privacy: {version, sha256}` and `locale`.
- The server refuses `LEGAL_DOCUMENT_STALE` when either pair is not the manifest's current pair for that locale. The
  UI then reloads the document.
- It writes `ADULT`, `TERMS` and `PRIVACY_SHOWN` rows inside the same transaction as
  `identity.create_pending_account_with_audit`. That is a new SQL function in 0078 that wraps the old one; no applied
  migration is edited.
- `SignUpFlow.tsx` sends the pairs for the documents it displayed (the UI gets them from the generated modules, which
  gain `version` and `sha256`).

**Accepting again**

- `GET /v1/account/legal-status` returns the documents the person must accept again (none, unless the manifest's
  marker moved past their last acceptance).
- The UI shows a blocking accept screen after sign-in.
- `POST /v1/account/legal-accept` writes `REACCEPT` rows.
- Billing routes refuse `LEGAL_REACCEPTANCE_REQUIRED` until the person has accepted again.

**Checkout** writes `RENEWAL_TERMS` and `IMMEDIATE_START` (§2.5.3).

**What this does not do:** the legal text itself. Filling the brackets is the colleague's work (§2.12).

#### 2.3.3 The country gate

**The package**

- New package `packages/geo`: an MMDB reader (dependency `mmdb-lib`, MIT) over the DB-IP Lite country file at
  `GEOIP_COUNTRY_DB_PATH`, plus a Tor exit list at `TOR_EXIT_LIST_PATH` (one IP per line).
- Both paths are in `apiEnvironmentShape`, required when hosted and billing is on.
- The files are reloaded when their modification time changes, checked at most once a minute.
- `lookupCountry(ip) → {country: ISO-3166-1 alpha-2 | "XX", tor: boolean}`.
  - A private or loopback address gives `"XX"`.
  - IPv6 is supported.

**Refresh**

- `deploy/vps/systemd/debateai-geoip-refresh.{service,timer}` and `deploy/vps/geoip-refresh.sh`.
- Country file: monthly, from db-ip.com's documented Lite download URL.
- Tor list: daily, from `https://check.torproject.org/torbulkexitlist`.
- The script downloads to a temporary file, checks it (the MMDB magic bytes and a minimum size; at least 500 lines
  for the Tor list), then renames it into place.
- The operator runbook documents the attribution the footer must carry.

**The settings row: `countryPolicy` v1**

```ts
{
  kind: "countryPolicy",
  default: { signup: false, pay: false, reason: "NOT_OFFERED" },
  countries: Record<ISO2, {
    signup: boolean,
    pay: boolean,
    reason: "OFFERED" | "NOT_OFFERED" | "TAX_NOT_READY" | "SANCTIONS" | "PROVIDER_UNSUPPORTED" | "TERMS_EXCLUDED",
    blocked?: true            // always-blocked: no new debates either
  }>,
  unknownIp: "REFUSE",        // "XX"
  tor: "REFUSE"
}
```

- **The values** are those of §1.5. They are listed explicitly in the development constant and in
  `deploy/vps/register/hosted-register.example.json`.
- **Every ISO code of the EU, EEA and Annex A** is present. Always-blocked countries have `blocked: true`.
- **A refinement check** refuses a country with `pay: true` and `signup: false`, and a `blocked` country with either
  switch on.

**Decisions** (pure functions, `packages/geo/src/decide.ts`)

| Function | Returns | Refuses when | Refusal code |
|---|---|---|---|
| `decideSignup(policy, {ipCountry, tor})` | `ALLOW \| REFUSE(reason)` | the IP country does not allow sign-up, the IP is unknown, or it is Tor | `COUNTRY_SIGNUP_UNAVAILABLE`, `COUNTRY_UNKNOWN`, `TOR_REFUSED` |
| `decidePayment(policy, {ipCountry, tor, declaredCountry})` | `ALLOW \| CONFIRM_COUNTRY \| REFUSE(reason)` | see the order below | `COUNTRY_PAYMENT_UNAVAILABLE`, `COUNTRY_UNKNOWN`, `TOR_REFUSED`, `COUNTRY_BLOCKED` |
| `decideCardCountry(policy, {declaredCountry, cardCountry})` | `OK \| MISMATCH \| BLOCKED` | — | — |
| `decideAsk(policy, {ipCountry})` | `ALLOW \| REFUSE` | only for `blocked` countries | `COUNTRY_ASK_BLOCKED` |

`decidePayment` applies these rules in order, and the first that matches decides:

1. The declared country's `pay` is off → `REFUSE(COUNTRY_PAYMENT_UNAVAILABLE)`.
2. The IP is unknown (`XX`) or Tor → `REFUSE(COUNTRY_UNKNOWN | TOR_REFUSED)`.
3. The IP country is `blocked` → `REFUSE(COUNTRY_BLOCKED)`.
4. The IP country equals the declared country → `ALLOW`.
5. Otherwise, for example a Romanian resident on holiday in a country that is not offered → `CONFIRM_COUNTRY`. The
   person confirms that they live in the declared country (sentence G3), and the card's country is checked after
   payment.

`decideCardCountry` never refuses on a mismatch alone; §2.5.4 settles the evidence. `BLOCKED` means the card country
is on the always-blocked list.

**Where it is enforced**

- `POST /v1/auth/register` checks sign-up.
- The quote and checkout routes check payment (§2.5.3).
- Payment confirmation checks the card country (§2.5.4).
- `POST /v1/asks` checks `decideAsk`.
- Sign-in is never gated.
- Refusals are 403 with the code only.
- Each decision writes an audit event (content-free: the code, the country, and whether it came from the IP), using
  the existing audit-event writer.

**Ukraine, later.** Region-level blocking (UA-43, 40, 14, 09, 23, 65) needs the DB-IP Lite *city* file. The package
defines `lookupRegion` behind the same interface, but it stays unused until the owner opens Ukraine.

**UI.** `/sign-up` calls `GET /v1/geo/availability`, a public, rate-limited route that returns `{signup, pay}` as
booleans only. When sign-up is not available, it shows the plain sentence G1 (§2.9) instead of the form.

#### 2.3.4 The server decides the plan tier

When billing is on (hosted):

- `evaluateAskAdmission` receives the owner's **entitlement** (§2.4.3). The `plan_tier` sent by the client is ignored.
  Paid plans give `premium` and Free gives `free`.
- **Free gauges are enforced by the server.**
  - A Free ask whose risk tier, budget tier or depth differs from the Free defaults (`apps/ui/app/new/defaults.tsx`)
    is normalised to the defaults.
  - The accepted reply reports the applied values, and the UI keeps showing those controls disabled.
  - The defaults move into a register row (`billingPlans.free.fixedGauges`) so the API does not import UI code.
- Legacy askers with no `owner_ref` (no session) are refused with `ASK_SIGN_IN_REQUIRED` when billing is on.

### 2.4 Part 1b — The money engine with each person's limits

Build the budget spec (§2.2–§2.15 there) as written, with these amendments.

#### 2.4.1 Several windows per person

The budget spec's `PersonAllowanceSource.read` returned one period. It now returns a list:

```ts
interface PersonAllowanceSource {
  /** Empty list = no personal limit (billing off, local mode, legacy asker). */
  read(ownerRef: string, now: Date): Promise<ReadonlyArray<Readonly<{
    scope: "PERSON_DAY" | "PERSON_WEEK" | "PERSON_MONTH";
    limitMicros: number;
    periodStart: Date;
    resetsAt: Date;
    finishBasisPoints: number;   // from the plan row: 11000
    closeBasisPoints: number;    // the costEnvelopePolicy close edge: 9500
  }>>>;
}
```

- `decideRoom` runs per window. The admission takes the **worst** answer.
- `waits_until` is the **latest** `resetsAt` among the FULL windows. If the site's day is also full, it is the later
  of the two.
- `decideSharedWall` in the runner runs per window, with that window's finish edge.
- The site's `SITE_DAY` keeps its own 115% (budget spec §2.4). Person windows use 110% (the owner, 29 September).
- The Free plan returns only `PERSON_MONTH`.

#### 2.4.2 Person spend, and the ceiling pinned per run

New table `billing.run_charge_scope` (migration 0079; append-only):

| Column | Type / values |
|---|---|
| `run_id` | uuid, PRIMARY KEY, REFERENCES `core.run` |
| `owner_ref` | uuid, no foreign key to the user |
| `plan_id` | text |
| `entitlement_event_id` | uuid |
| `admitted_at` | timestamptz |

It gets an index on `(owner_ref, admitted_at)`.

- **When it is written.** At admission, in the same locked transaction that decides START (or at the waker's start).
  A waiting run gets its row when it starts.
- **Spent in a window** = the sum of `ledger.model_spend.charge_micros` (RUN + STORY) whose `run_id` is in
  `run_charge_scope` for that owner and whose `recorded_at` falls inside the window. It is one indexed query per
  window, three at most.
- **Used** = spent + the counted holds of that owner's live runs. The holds are from the budget spec's
  `ledger.model_spend_hold` (0077), joined through `run_charge_scope`.
- **Locks.** The budget spec's person lock is `hashtextextended('debateai.cost_envelope.person:'||owner_ref)`, always
  taken after the day lock. It now also covers `withOwnerAskAdmissionLease`: the room decision runs inside the
  owner's lease, which moves **before** admission.
- **The runner's person wall** reads the run's `owner_ref` from `run_charge_scope`. It never reads billing tables.
  The `PersonAllowanceSource` reads its windows through a read-only database view `billing.person_windows_v` (§2.4.3)
  that the runner role may select.

#### 2.4.3 The entitlement: who has which plan, and when

The entitlement is derived, never stored as mutable state:

- **`billing.entitlement_event`** (migration 0079; append-only). Its columns are `event_id`, `owner_ref`,
  `plan_id`, `effective_at`, `period_anchor_at`, `cause`, and `subscription_id` (null for Free).
  - `cause` is one of `SIGNED_UP_FREE`, `SUBSCRIBED`, `UPGRADED`, `DOWNGRADED`, `RENEWED`, `ENDED_CANCEL`,
    `ENDED_WITHDRAWAL`, `ENDED_DUNNING`, `SUSPENDED_CHARGEBACK`, `RESUMED` or `ERASURE_STOPPED`.
- **The view `billing.person_windows_v`** folds the latest event per owner into `{plan_id, period_anchor_at}`.
- **The windows come from `computeWindows(anchor, now, plan)`** (pure, `packages/billing-core`). A code sketch
  follows the list.
  - **Month:** from the last anchor day-of-month at or before `now`. When the anchor day is past the end of a
    month, it is clamped to the month's last day.
  - **Week:** 7-day blocks counted from the month start. The last block may be shorter. It keeps the full weekly
    cap, which is slightly generous by design.
  - **Day:** 24-hour blocks counted from the month start.
  - **Limits:** credit × basis points ÷ 10000, rounded down, like every other ceiling share.
- **An owner with no event** (created before billing) counts as Free, anchored at `identity.user.created_at`. That is
  read once and written as a `SIGNED_UP_FREE` event on first use.
- **Upgrades keep the anchor.** Only the plan changes, and the new plan's limits apply at once.

```ts
computeWindows(anchor: Date, now: Date, plan: PlanRow):
  { month: {start, end}, week: {start, end}, day: {start, end} }
```

### 2.5 Part 2 — Plans, payments, tax and invoices

#### 2.5.1 Settings rows

**`billingPlans` v1:**

```ts
{
  kind: "billingPlans",
  currency: "USD",
  minor_units_per_unit: 1000000,
  plans: [
    { plan_id: "FREE", tier: "free",    net_price_micros: 0,         monthly_credit_micros: 200000,    day_bp: null, week_bp: null, finish_bp: 11000, fixed_gauges: {...} },
    { plan_id: "PLUS", tier: "premium", net_price_micros: 20000000,  monthly_credit_micros: 5000000,   day_bp: 2000, week_bp: 5000, finish_bp: 11000 },
    { plan_id: "PRO",  tier: "premium", net_price_micros: 50000000,  monthly_credit_micros: 20000000,  day_bp: 2000, week_bp: 5000, finish_bp: 11000 },
    { plan_id: "MAX",  tier: "premium", net_price_micros: 200000000, monthly_credit_micros: 150000000, day_bp: 2000, week_bp: 5000, finish_bp: 11000 }
  ]
}
```

- Each price must be a whole number of cents.
- Plan order is by price. An upgrade means a higher price.
- **Credit and the site's own limits.** `register:publish-hosted` **warns** (it does not refuse) when a plan's
  smallest window is below the site's per-run ceiling. The smallest window is the day cap, or the whole month for
  Free. Admission uses the estimate, so a small window still fits a small debate. At today's provisional $0.25 per
  run, Free's $0.20 month triggers the warning. The owner publishes a `costEnvelopePolicy` version with realistic
  per-run and daily ceilings before switching billing on.
- **The site's daily ceiling protects the company,** not the person. At launch it must be at least the expected daily
  spend of all subscribers. The runbook gives the formula: subscribers × day cap × 0.3, or better, the measured
  figure.

**`billingPolicy` v1:**

| Field | Value |
|---|---|
| `enabled` | false |
| `xmoney_environment` | `"stage" \| "live"` |
| `dunning_retry_days` | [1, 3, 7] |
| `withdrawal_days` | 14 |
| `renewal_notice_business_days` | 7 |
| `confirmation_business_days` | 2 |
| `quote_ttl_seconds` | 1800 |
| `tax_code` | `"saas"` |
| `invoice_issuer_rules` | `{RO: "SMARTBILL", "*": "QUADERNO"}` |
| `owner_report_email_ref` | the path of a custody text file holding the owner's address, so no email sits in the register |
| `merchant_display` | a pointer key into the UI catalogue for the company name, address and phone |

#### 2.5.2 The billing tables (migrations 0080–0082)

- **Schema** `billing`.
- **Every table is append-only,** with a truncate guard and a verify block.
- **Ciphertexts are under the records key** and carry a `key_id`.
- **Nothing has a foreign key to the user.**

| Table | Holds |
|---|---|
| `billing.customer` | `customer_id`, `owner_ref` UNIQUE, `created_at`, `xmoney_customer_id`, `quaderno_contact_id` (nullable), `locale` |
| `billing.customer_profile_event` | `customer_id`, `at`, `profile_ciphertext`: name, email for invoices, country, region, postal code, city and street when needed, company name, VAT ID and whether it was validated. This is the latest profile used for invoices. |
| `billing.quote` | `quote_id`, `owner_ref`, `plan_id`, `kind` (`SUBSCRIBE` / `UPGRADE`), net, tax and total micros, `tax_country`, `tax_region`, `tax_rate_bp`, `tax_status`, `tax_name`, `quaderno_ref`, `expires_at`, `created_at`, `location_ciphertext` |
| `billing.subscription_event` | `subscription_id`, `owner_ref`, `kind`, `at`, `plan_id`, `period_anchor_at`, `xmoney_order_id`, `card_ref`, `data` (content-free JSON) |
| `billing.charge` | `charge_id` (≤ 32 characters; it is xMoney's `orderId` / `externalOrderId`), `subscription_id`, `kind` (`INITIAL` / `RENEWAL` / `UPGRADE`), `period_start`, `period_end`, `quote_id`, net, tax and total micros, `currency`, `created_at` |
| `billing.charge_event` | `charge_id`, `kind` (`REQUESTED` / `SUCCEEDED` / `FAILED` / `REFUNDED` / `CHARGEBACK` / `CHARGEBACK_RESOLVED`), `at`, `xmoney_transaction_id`, `amount_micros`, `error_code`. UNIQUE on `(xmoney_transaction_id, kind)`. |
| `billing.location_evidence` | `charge_id`, `ip_country`, `declared_country`, `card_country`, `verdict` (`AGREED` / `CONFIRMED_BY_PERSON` / `CONFLICTING` / `BLOCKED`), `ip_ciphertext`, `at` |
| `billing.invoice` | `invoice_id`, `charge_id`, `issuer` (`QUADERNO` / `SMARTBILL`), `kind` (`INVOICE` / `CREDIT_NOTE`), `external_ref`, `series`, `number`, `efactura_status` (nullable), `at` |
| `billing.xmoney_notice` | `notice_id`, `received_at`, `payload_sha256` UNIQUE, `transaction_id`, `order_id`, `status`, `processed_at` (written by a following row), `outcome`. It stores the decrypted fields only, never card data. |
| `billing.outbox` | `job_id`, `kind`, `ref`, `not_before`, `attempts`, `claimed_by`, `claimed_at`, `done_at`, `last_error_code` |
| `billing.cancel_token` | `token_sha256` PRIMARY KEY, `subscription_id`, `issued_at`, `expires_at`; its use is recorded as a following row in `billing.cancel_token_use` |

- **`subscription_event.kind`** is one of `CREATED`, `ACTIVATED`, `RENEWED`, `PAST_DUE`, `RECOVERED`,
  `UPGRADED`, `DOWNGRADE_SCHEDULED`, `DOWNGRADED`, `CANCEL_REQUESTED`, `CANCEL_REVOKED`, `ENDED`, `WITHDRAWN`,
  `SUSPENDED`, `RESUMED`, `CARD_CHANGED` or `ERASURE_STOPPED`.
- **`outbox.kind`** is one of `VERIFY_PAYMENT`, `QUADERNO_RECORD_SALE`, `QUADERNO_RECORD_REFUND`, `SMARTBILL_INVOICE`,
  `SMARTBILL_STORNO`, `EMAIL`, `RENEWAL_NOTICE` or `OWNER_TAX_SUMMARY`.
- **The outbox exception.** It is a queue, so it needs updates. It uses the 0065 variant (c): no deletes, only claim
  columns may change, with a trigger that pins the other columns.
- **The erasure outbox is left as it is.** It is not reused.
- **The subscription's current state** is a SQL view, `billing.subscription_state_v`, that folds its events. Its
  state machine is in §2.5.6.

#### 2.5.3 Checkout (routes)

**Plans and the quote**

- **`GET /v1/billing/plans`** (public; cached 60 s) returns the plans with their net prices.
  - It never returns credit in dollars. Each plan carries `allowance_vs_plus`, a ratio (Free 0.04, Plus 1, Pro 4,
    Max 30), and the pricing page words it as "4× the Plus allowance", the way other AI products do.
  - It answers 404 when billing is off.
- **`POST /v1/billing/quote`** (user; CSRF).
  - **Body:** `{plan_id, country, region?, postal_code?, city?, company?: {name, vat_id, address}}`.
  - **Steps:**
    1. Legal status (§2.3.2).
    2. `decidePayment` using `request.ip`.
    3. Quaderno `GET /tax_ids/validate` when a company VAT ID is given.
    4. Quaderno calculate: the amount is the plan's net price, `tax_behavior=exclusive`, `tax_code` from the policy,
       and the location.
    5. Store the quote.
  - **Answer:** `{quote_ref, net, tax, total, tax_label, country_confirm_needed, renews_on, withdrawal_days}`.
    `tax_label` is "VAT 21% (Romania)" in the person's locale; the UI builds it from its parts.
  - **Refusals:** `COUNTRY_PAYMENT_UNAVAILABLE`, `TAX_ID_INVALID`, `TAX_SERVICE_UNAVAILABLE` (503, "try again in a
    minute"), `ALREADY_SUBSCRIBED` (use upgrade).
- **Rate limit:** a new admission scope `billingQuote`, keyed by owner (10 an hour), sealed in `admissionPolicy`'s
  next version.

**Starting the payment**

- **`POST /v1/billing/checkout`** (user; CSRF).
  - **Body:** `{quote_ref, consents: {renewal_terms: {version, sha256}, immediate_start: {version, sha256}},
    country_confirmed?: true}`.
  - **The consent texts** are catalogue sentences. The manifest (§2.3.2) also hashes the two consent sentences per
    locale, from `apps/ui/messages/<locale>/billing.json`, keys `consent.renewal` and `consent.immediateStart`.
  - **Steps:**
    1. Check the quote is unexpired and owned by the caller.
    2. Write the `RENEWAL_TERMS` and `IMMEDIATE_START` acceptance rows.
    3. Create the xMoney customer if there is none (`POST /customer`, identifier = `customer_id`, email = the
       person's account email decrypted with their DEK in the API). The email is also stored in the billing
       profile under the records key.
    4. Create `billing.charge` (INITIAL) and `subscription_event CREATED`.
    5. Build the order JSON: `order.type: "managed"`, `orderId: charge_id`, `amount` = the total in decimal dollars,
       `currency: "USD"`, `description` = a catalogue sentence for the plan, `saveCard: true` with the save option
       hidden, `customer: {identifier, email, country}`, `backUrl` = `/checkout/return?charge=<ref>`, and
       `publicKey`.
    6. Base64 it, sign it (HMAC-SHA512 with the private key, over the JSON string), and return
       `{public_key, order_payload, order_checksum, charge_ref, sdk_environment}`.
- The UI mounts `window.XMoney.paymentForm(...)` with these values. It never decides the outcome itself.
- **`GET /v1/billing/charges/{charge_ref}`** (user) returns `{state: PENDING | SUCCEEDED | FAILED | NEEDS_ACTION}` for
  the waiting screen. The UI polls it every 2 seconds for up to 2 minutes, then shows "We'll email you as soon as
  your bank confirms."

**The security policy for the checkout page only**

- Scope: `/checkout` and `/settings` (card change).
- The middleware adds `script-src https://secure(-stage).xmoney.com`, `frame-src https://secure(-stage).xmoney.com`,
  `connect-src https://secure(-stage).xmoney.com https://api(-stage).xmoney.com`, and adds the same origins to
  `form-action` for 3-D Secure pop-ups.
- The origin is chosen by `billingPolicy.xmoney_environment`.
- Exactly which directives are needed is measured in the sandbox (plan task P2-X-2). The test pins the result.
- `Permissions-Policy payment=()` stays unless the SDK needs the Payment Request API. The same task measures this.
- Every other page keeps today's policy.

#### 2.5.4 Payment confirmation (the notice and the check)

**`POST /v1/billing/xmoney/notify`** (public; no CSRF, no session)

- **Registration:** the route is in the inventory as `auth: "public"`, with its own admission scope keyed by IP
  (120 a minute).
- **Parser:** a route-scoped `application/x-www-form-urlencoded` parser with a 64 KiB limit. JSON is also accepted,
  because xMoney does not document which it sends.
- **The UI proxy** already passes `content-type` and the body. No header needs adding, because the payload carries
  its own encryption. `server.mjs` and the proxy need no change beyond this route existing.
- **Decrypting:**
  - Split `opensslResult` at the first comma, base64-decode both parts, and decrypt with AES-256-CBC using the
    private key's 32 bytes.
  - The key format is measured in the sandbox (P2-X-0). A boot check refuses a key that does not make 32 bytes, with
    `XMONEY_KEY_LENGTH_INVALID`.
  - If it fails, answer `200 OK` anyway (so xMoney stops retrying garbage), write an audit event
    `billing.notice.undecryptable` and store nothing.
- **Storing:** store the `billing.xmoney_notice` row. UNIQUE on the payload hash makes it idempotent. Enqueue
  `VERIFY_PAYMENT(transaction_id)` and answer `200` with the body `OK` within 1 s. **The notice itself never changes
  any state.**

**`VERIFY_PAYMENT`** (outbox worker)

1. Call `GET /transaction/{id}`. The `orderId` must name one of our charges, and the amount, currency and status must
   match our charge.
   - `complete-ok` on a transaction means paid. **An order's `complete-ok` is never read as paid.**
   - `complete-failed` means failed.
   - `refund-ok` and `charge-back` are handled below.
2. Call `GET /card/{cardId}`: `binInfo.countryCode` gives the card country.
3. Location evidence: run `decideCardCountry`, then set the verdict:

   | Verdict | When | What happens |
   |---|---|---|
   | `BLOCKED` | the card country is always-blocked | full refund (`DELETE /transaction/{id}`), cancelled order, email M11 |
   | `AGREED` | the declared country is backed by at least one of the IP country and the card country (two agreeing pieces, the EU rule) | normal |
   | `CONFIRMED_BY_PERSON` | the person confirmed at checkout (G3), and the card country equals the declared country | normal |
   | `CONFLICTING` | neither the IP country nor the card country equals the declared country | The charge stands and is taxed at the declared country. It is listed in the owner's quarterly summary for the accountant. |
4. Write `charge_event SUCCEEDED`, then the `subscription_event` (`ACTIVATED` / `RENEWED` / `RECOVERED` /
   `UPGRADED`), then the `entitlement_event`.
5. Enqueue the invoice job (issuer by `invoice_issuer_rules` on `tax_country`) and the emails.

**Invoice jobs**

- **`QUADERNO_RECORD_SALE`:** `POST /transactions` with `type: sale`, `processor: "xmoney"`,
  `processor_id: <transaction id>`, the customer, the items with `tax_code`, `evidence {billing_country, ip_address,
  bank_country}`, and `custom_metadata {charge_id}`.
  - Idempotent by `processor_id`: a duplicate is detected with a lookup before creating.
  - Store the invoice row, with the document id and number.
- **`SMARTBILL_INVOICE`** (for Romanian place of supply):
  - Series from the configuration, currency USD at the BNR rate, VAT 21%.
  - The client is the person or company. A person without a CNP gets 13 zeros.
  - SmartBill's own setting sends the invoice to e-Factura.
  - Store the number, and record the e-Factura status when SmartBill reports it.

**Reconciliation** (daily timer, single-flight)

- Call `GET /transaction` for the last 3 days, including `transactionType=chargeback`. Any transaction not yet
  confirmed goes through `VERIFY_PAYMENT`.
- Every chargeback writes `CHARGEBACK` and `subscription_event SUSPENDED` (the entitlement becomes Free) and emails
  the person.
- Charges still `REQUESTED` after 24 hours with no transaction are marked `FAILED(NO_TRANSACTION)`.

#### 2.5.5 Renewal, reminders and failed payments

**Timer** (60 s, single-flight, row claims with `FOR UPDATE SKIP LOCKED` on the outbox)

- **Due renewals:** subscriptions in `ACTIVE` whose period ends within the next 5 minutes and that have no open
  `RENEWAL` charge.
  1. Re-quote the tax with the stored location, because rates change.
  2. If the total differs from the last charged total and no `RENEWAL_NOTICE` with this amount was sent at least 7
     business days ago, send the notice (M3) now. Then **postpone** the charge by 7 business days. The plan stays
     active meanwhile (state `ACTIVE`, event data `{postponed: "NOTICE_PERIOD"}`). The new period still starts at the
     old period's end, so the windows do not move. Business days are Monday to Friday; public holidays are ignored,
     which errs on the long side.
     - To avoid most postponements, a daily look-ahead job re-quotes every renewal due within 10 business days and
       sends M3 early whenever the amount will change.
  3. Otherwise create the `RENEWAL` charge and call `PATCH /order-rebill/{orderId} {customerId, amount}`. The
     outcome goes through `VERIFY_PAYMENT` like any other.
- **Failures:** `PAST_DUE`, then retries at +1, +3 and +7 days (`dunning_retry_days`), with the emails M5a–c. After
  the last retry fails: `ENDED(DUNNING)` and the entitlement becomes Free (M6). Access stays paid during `PAST_DUE`.
- **Yearly reminder:** on each subscription anniversary, email M4 (Terms §12).
- **Confirmation:** email M1 goes out within minutes of `ACTIVATED`, well inside xMoney's 2 business days.

#### 2.5.6 The subscription's states and actions

```text
CREATED ──paid──▶ ACTIVE ──period end──▶ (renewal) ──paid──▶ ACTIVE
   │                │  └─fail─▶ PAST_DUE ──paid──▶ ACTIVE
   │                │              └─last retry fails─▶ ENDED(DUNNING)
   │                ├─cancel─▶ ACTIVE(cancel requested) ──period end──▶ ENDED(CANCEL)
   │                ├─withdraw (≤14 days after ACTIVATED)─▶ WITHDRAWN
   │                ├─chargeback─▶ SUSPENDED ──resolved in our favour─▶ ACTIVE
   │                └─erasure scheduled─▶ ENDED(ERASURE)
   └─no payment within 24 h─▶ ENDED(ABANDONED)
```

**Actions** (routes under `/v1/billing/subscription/*`, user with CSRF)

- **`upgrade {plan_id}`**
  1. Quote kind UPGRADE. The amount is (new net − old net) × remaining seconds ÷ period seconds, rounded to cents,
     then taxed.
  2. Charge the saved card with `order-rebill`.
  3. On success: `UPGRADED` plus an entitlement event with the new plan and the **same anchor**.
  4. On failure: nothing changes, and the UI shows the reason sentence.
- **`downgrade {plan_id}`** writes `DOWNGRADE_SCHEDULED`. At the next renewal the lower price is charged and
  `DOWNGRADED` is written.
- **`cancel`** writes `CANCEL_REQUESTED`: no renewal, access until the period ends.
- **`cancel/revoke`** writes `CANCEL_REVOKED`, allowed before the period ends.
- **`withdraw`**
  - Allowed within `withdrawal_days` of the first `ACTIVATED`, for tax countries in the EU, EEA or UK.
  - It asks for a step-up grant, `WITHDRAW` (a new step-up purpose in the next `authPolicy` version).
  - Refund = total paid × (1 − max(days used ÷ days in period, credit spent this month ÷ monthly credit)), rounded
    down to cents and never below zero.
  - Steps: `DELETE /transaction/{id} {amount}`, then `DELETE /order/{id} terminateOrder=yes`, then `WITHDRAWN`, the
    entitlement becomes Free, the credit-note job runs, and email M8 goes out.
- **`card`** starts a new `managed` order with `amount 0` and `cardTransactionMode=verifyCard` through the same
  embedded form. On success: `CARD_CHANGED`, and the subscription's `xmoney_order_id` moves to the new order.

**The public cancel route** (Terms §12: cancel without signing in)

- `POST /v1/billing/cancel-link {email}` (public, rate-limited by IP).
  - It always answers `202`.
  - If a subscription exists for the account with that blind-indexed email, it sends email M9 with a one-time link.
  - The link holds a 32-byte token; its hash is stored in `billing.cancel_token` (0082), and it is valid for 24 hours.
- `POST /v1/billing/cancel-by-token {token}` writes `CANCEL_REQUESTED`.
- The `/withdraw` page is the signed-in route; the page explains it and links to sign-in. The Terms' model withdrawal
  form arrives in M1.

**Erasure.** `DELETE /v1/account` (scheduling) writes `ERASURE_STOPPED`, which means no more renewals, and cancels the
xMoney order. If the person cancels the erasure, the renewal does not come back by itself; they subscribe again.
Billing tables keep their rows.

**Plan tier during states:** `ACTIVE`, `PAST_DUE`, and `ACTIVE` with a cancel requested give the paid plan.
`SUSPENDED`, `ENDED` and `WITHDRAWN` give Free.

#### 2.5.7 The tax connector

```ts
interface TaxEngine {
  quote(input: {netMicros, currency, location, taxId?, date}): Promise<TaxQuote>;
  validateTaxId(countryIso2, taxId): Promise<{valid: boolean, name?: string, checkedAt: Date, reference?: string}>;
  recordSale(input): Promise<{documentId, number, url}>;
  recordRefund(input): Promise<{documentId, number}>;
  requestReport(kind, period): Promise<{requestId}>;
}
```

- **Package** `packages/tax-quaderno`: plain REST with `fetch`. The API key is a custody text file,
  `QUADERNO_API_KEY_PATH`, and the base URL comes from the API environment (sandbox or live).
- **Timeouts** are 5 s. A 429 or 5xx gets one retry. The API is never called from the runner.
- **Money conversion:** Quaderno's decimal answers are parsed exactly into micros. A result that is not whole cents
  is refused.
- **`not_registered`:** we charge only if our `countryPolicy` says `pay: true`. The amount is Quaderno's (zero tax).
  The summary flags every such charge.
- **A fake `TaxEngine`** backs the tests. It gives fixed rates per country and `reverse_charge` for a VAT ID with
  "VALID" in it.

#### 2.5.8 The invoice connector for Romania

```ts
interface InvoiceIssuer {
  issue(input): Promise<{series, number, externalRef}>;
  storno(input): Promise<{series, number, externalRef}>;
}
```

- **Package** `packages/invoice-smartbill`: HTTP Basic auth (account email plus token). Both live in one custody
  text file, `SMARTBILL_CREDENTIALS_PATH`, as `email:token`.
- **Company data:** the CIF and series come from the API environment.
- **Rate limit:** 3 calls a second, so the worker keeps at most one call in flight and a 1 s gap.
- The exact endpoints and fields are confirmed by task P2-SB-0 against SmartBill's API documentation before any code
  is written.

#### 2.5.9 Where the tax goes: the summary

- **`pnpm billing:tax-summary --quarter 2026-Q4`** (a server command, run by the operator).
  - It reads our own `billing.charge`, `charge_event` and `quote` rows.
  - It groups them by `tax_country` and `tax_region` and prints, in plain words, one line for each country or state:
    net sales, tax collected, Quaderno's registration status, and "where and when to pay".
- **The "where and when" text** comes from a small table in the summary module. It is data, loaded from a register
  row `taxAuthorities` v1, with entries for:
  - EU OSS: ANAF, form 398, due dates;
  - Romania: D300;
  - EU reverse charge: D390;
  - Norway VOEC, Iceland VOES;
  - UK HMRC;
  - US states: "register with the state tax department once over threshold";
  - the others in §1.4.
- **Outbox job `OWNER_TAX_SUMMARY`:** runs on the 5th day after each quarter ends and emails the same text to
  `owner_report_email_ref`.
- **Threshold warnings** come from Quaderno's own emails and dashboard. We do not duplicate them.

#### 2.5.10 Emails

**Template package**

- New package `packages/mail-templates`. It holds per-locale catalogues (`messages/<locale>/mail.json`, 35 locales)
  with the same parity rules as the UI, checked by a copy of `catalogContractAssertions`.
- The renderer produces plain text plus a minimal HTML part, with no remote images.
- `mail-channel.ts` gains `sendTemplated(to, templateId, locale, params)` over the same sendmail path.
- The customer's locale is the interface locale stored at checkout. It falls back to English.

**The emails**

| Id | When | Contains |
|---|---|---|
| M1 | subscription activated | the plan, the total incl. tax, the renewal date, how to cancel, the Terms of the accepted version (link and attached text), the model withdrawal form |
| M2 | every successful charge | receipt plus invoice (Quaderno PDF link, or SmartBill number) |
| M3 | renewal amount changes | the new amount, the date, a cancel link |
| M4 | yearly reminder | the plan, the price, a cancel link |
| M5a–c | failed payment 1, 2, 3 | when we retry, and how to update the card |
| M6 | moved to Free after failed payments | debates are kept |
| M7 | cancelled (confirmation) | the date access ends |
| M8 | withdrawn and refunded | the refund amount |
| M9 | cancel link requested | the one-time link |
| M10 | paid features paused (chargeback) | — |
| M11 | payment refused: card from a country we cannot serve | refunded in full |
| O1 | owner's quarterly tax summary | English only; owner-facing |

### 2.6 Part 3 — Models chosen to fit the person's room

1. **Merge the scorecard branch** into this program's line, following its handover merge checklist:
   - renumber its `0072` after the last billing migration;
   - resolve the ~30 conflicts listed in its ledger;
   - port the visitor strings to the 35 catalogues;
   - `serve_reserve_attempts` versus DR-184-v5;
   - the `model_spend` columns (`attempt_id` next to `spend_phase`).
   The owner-run steps in its README stay the owner's.
2. **Feed the room.** `evaluateAskAdmission` computes `personRoom = min over windows (limit − used)`, at 100% (the
   finish edge is for running debates, not for planning). It passes `perRunCeilingMicros: min(siteCeiling,
   personRoom)` to `pickRoleAssignment`.
3. **Compare like with like.** The estimate's body part is compared with the body ceiling and its answer part with
   the serve ceiling (agent finding: the picker compared the total with the whole per-run ceiling).
4. **A null estimate** (a seat without a scorecard entry) counts as the run maximum (`mostOneRunMaySpendMicros`),
   never as "fits".
5. **When nothing fits even at ECONOMY** for a person scope, the question goes to the budget spec's **WAIT**, with
   the upgrade offer. It is not the `ASK_MODEL_STRENGTH_BUDGET_TOO_SMALL` refusal. The site's per-run refusal keeps
   its meaning for the site scope.
6. **Plan caps:** `planStrengthCaps` maps Free → ECONOMY, and every paid plan → BEST (the owner's "same features").
7. **Before the scorecard merges** (between Parts 2 and 3), dev's fit is coarse:
   - If the budget spec's estimate for the person's plan tier roster does not fit the room, and the Free roster
     does, the run uses the Free roster. That means cheaper models, recorded in `core.run_cost_substitution` with
     reason `PERSON`.
   - Otherwise it WAITs.

### 2.7 Security and privacy

- **Card data never reaches us.** The card fields live in xMoney's iframes, so card data never touches our
  JavaScript or servers. This keeps the PCI questionnaire at its smallest; which one exactly is not confirmed
  (xMoney question).
- **The browser never decides a payment,** and neither does a notice. Only `VERIFY_PAYMENT` does, using
  server-to-server reads.
- **Money-changing actions are idempotent:**
  - charge ids are our own;
  - notices are unique by payload hash;
  - charge events are unique by `(transaction_id, kind)`;
  - outbox jobs are claimed with `SKIP LOCKED`.
- **Refund safety:**
  - A refund needs a `SUCCEEDED` charge and a positive computed amount.
  - The total refunded per charge can never exceed the total charged. A check constraint over a summing trigger
    raises `REFUND_EXCEEDS_CHARGE`.
  - Withdrawal needs a step-up grant.
- **Rate limits:** quote, checkout, cancel-link and notify each get their own scope.
- **The public cancel route** never reveals whether an email has an account; it always answers 202.
- **Keys:** the xMoney private key, the Quaderno key, the SmartBill credentials, the records key and the owner's
  email file are all custody files. The runner reads none of them.
- **Privacy:**
  - New recipients: xMoney (customer id, email, country), Quaderno (name, email, country, postal code, VAT ID, IP
    address, card country) and SmartBill (the same for Romanian customers).
  - Retention: 10 years for payment and tax evidence.
  - The Privacy Policy rows marked "[pending]" become real (§2.12).
- **Audit events** (content-free) for: `billing.quote.refused`, `billing.checkout.started`,
  `billing.payment.verified`, `billing.payment.failed`, `billing.refund`, `billing.withdrawal`, `billing.chargeback`,
  `billing.cancel`, `billing.country.refused`, `billing.notice.undecryptable`.

### 2.8 Testing

**Pure (unit)**

- `computeWindows`: every month length, a day-31 anchor, a leap year, week blocks, and the last partial week.
- Room per window at 94.99, 95, 99.99, 100, 109.99, 110 and 110.01%.
- The upgrade proration and the withdrawal formula, both edges.
- The country decisions for every group in §1.5, and the policy refinements.
- The xMoney checksum and notice decryption against published or recorded test vectors (the sandbox recording is
  plan task P2-X-0).
- Quote-to-micros parsing.
- The subscription fold for every state transition.

**Database (integration, real Postgres; CI skips these, so run them before merging each migration)**

- Every guard in 0078–0082 is installed. Append-only holds for each table. The refund-sum trigger works.
- Erasure leaves billing and legal rows intact and readable with the records key. The user's DEK data becomes
  unreadable as before.
- The same notice twice gives one state change. A notice before its checkout row exists is retried by the
  reconciler.
- Renewal claims across two workers never double-charge.
- Person windows and holds: two concurrent asks for one owner under the lock.

**API**

- Each route's auth, CSRF and inventory entry.
- Refusal shapes. Figures never appear in the usage route. Local mode answers 404 everywhere.
- Billing off equals today's behaviour.

**Connectors**

- Contract tests against a fake xMoney server built from the OpenAPI copy (the order, rebill, transaction, card,
  refund and cancel shapes), a fake Quaderno and a fake SmartBill.
- One recorded sandbox run per connector, recorded by the owner in the sandbox, with the keys never shown to an
  agent. The fixtures are scrubbed.

**UI**

- Render tests for pricing, checkout (the SDK mocked), the subscription card, the usage bars, `/cancel` and
  `/withdraw`, and the room sentences.
- All 35 catalogues for `billing.json`, the new keys in `newDebate.json`, `settings.json` and `home.json`, and
  `mail.json`.
- The CSP tests for the checkout page and the untouched policy elsewhere.

**End to end (owner-run, xMoney sandbox)**

1. Sign up, pay with test card 4111…1111, check the plan is active, then renew by advancing the clock in the stage
   database (a documented command).
2. Try a failing card (5168…5780): the dunning sequence runs, then Free.
3. Withdraw: partial refund.
4. Cancel through the emailed link.
5. Try a card from a blocked country (simulated by the fake card lookup): automatic refund.

### 2.9 User-facing sentences (English; every one in 35 locales)

These are proposals. The owner may change any wording at spec review.

| Id | Where | Sentence |
|---|---|---|
| G1 | sign-up, country not open | "DebateAI isn't available in your country yet." |
| G2 | checkout, country can't pay | "Paid plans aren't available in your country yet. You can keep using the Free plan." |
| G3 | checkout, confirm country | "Your connection looks like it's from {ipCountry}. Do you live in {declaredCountry}?" |
| G4 | ask page, blocked place | "New debates can't be started from your current location. Your debates stay available to read." |
| P1 | ask page, a person limit full (day) | "You've reached today's limit for your plan. You can still ask: your debate will start by itself at {time}. Or upgrade to start now." |
| P2 | … (week) | "You've reached this week's limit for your plan. You can still ask: your debate will start by itself on {time}. Or upgrade to start now." |
| P3 | … (month) | "You've reached this month's limit for your plan. You can still ask: your debate will start by itself on {time}. Or upgrade to start now." |
| P4 | Free, month full | "You've used this month's free debate allowance. Your next debate can start on {time}, or choose a plan to continue now." |
| P5 | close to a person limit | "You're close to your plan's limit. This debate will still run in full." |
| U1 | usage bars | "Today {pct}% · This week {pct}% · This month {pct}%" with "Resets {time}" under each |
| B1 | checkout total | "{plan} — {net} + {taxLabel} = {total} per month. Renews on the {day} of each month until you cancel." |
| B2 | renewal consent | "I agree that my subscription renews automatically every month at the price shown, until I cancel. I can cancel at any time in Settings or at dezbatere.ro/cancel." |
| B3 | immediate start | "Start my plan now. I understand that if I withdraw within 14 days, I pay for the part already used: the larger of the days used or the credit used." |
| B4 | button | "Subscribe and pay" (Romanian: "Comandă cu obligație de plată", Terms §12) |
| B5 | waiting for the bank | "Waiting for your bank to confirm…" then, after 2 minutes, "We'll email you as soon as your bank confirms." |
| S1 | Settings → Subscription | plan, "Renews on {date} for {total}", buttons: Change plan · Update card · Cancel · Withdraw (while allowed) · Invoices |

The budget spec's sentences A–D stay as they are for the site's day. D ("one question can wait at a time") also covers
person limits.

### 2.10 Pages and components

**New pages**

- **`/pricing`**: the plan cards, the "allowance" wording (no dollars of credit), the FAQ, and links to the Terms.
- **`/checkout?plan=`**:
  - It requires sign-in. After sign-up, `/login` carries `?next=/checkout?plan=…` through the verify and 2-step flow,
    and the page it lands on after sign-in honours it.
  - Steps on the page: the country, region and postal code, the company block, the quote, the two consents, the
    xMoney form, and the waiting screen.
- **`/checkout/return`**: xMoney's `backUrl`. It shows the charge state; the state itself comes from the server.
- **`/cancel`** (public) and **`/withdraw`**.
- **`/legal`** (company details: name, address, trade register, CUI, VAT, phone, emails, the xMoney requirement),
  **`/terms`**, **`/privacy`** and **`/contact`**. Today these documents are modals only. xMoney requires visible
  pages; they render the generated legal modules.

**New components**

- `SubscriptionControls.tsx` in Settings, after the identity panel.
- `UsageBars.tsx`, shown in Settings and on the ask page.
- `RoomNotice` for P1–P5, next to the budget spec's A–D.

**Site-wide changes**

- The footer gains: the merchant name and address, the Visa and Mastercard marks (the official artwork files the
  owner supplies), the DB-IP credit link, and links to Terms, Privacy, Legal and Contact.
- The landing text placeholder (`apps/ui/messages/en/home.json:69`) becomes real in 35 locales.
- A new namespace `billing` in all 35 locales, registered in the namespace union, the loader and the parity tests.

### 2.11 Operations

**The API environment gains:**

- `XMONEY_PRIVATE_KEY_PATH`, `XMONEY_PUBLIC_KEY`, `XMONEY_SITE_ID`, `XMONEY_API_BASE_URL`
- `QUADERNO_API_KEY_PATH`, `QUADERNO_API_BASE_URL`
- `SMARTBILL_CREDENTIALS_PATH`, `SMARTBILL_COMPANY_CIF`, `SMARTBILL_SERIES`
- `RECORDS_KEY_PATH`
- `GEOIP_COUNTRY_DB_PATH`, `TOR_EXIT_LIST_PATH`
- `OWNER_REPORT_EMAIL_PATH`

The public key and the site id are not secrets. All of these are required when hosted and billing is on, and are
validated at boot.

**The development stack**

- A fake xMoney server that serves the embedded-form SDK stub, the notice sender and the API.
- A fake Quaderno and a fake SmartBill.
- A small test MMDB and a test Tor list.
- `pnpm dev:auth:up` starts them when `DEBATEAI_BILLING_FAKES=1`.

**The runbook** (`deploy/vps/README.md`, new section "Billing"):

- the keys and file modes;
- the GeoIP timer;
- publishing `billingPlans`, `billingPolicy`, `countryPolicy` and `taxAuthorities`;
- setting xMoney's notice URL (`https://<host>/api/v1/billing/xmoney/notify`) in the xMoney dashboard (Sites →
  Payment Page);
- the sandbox end-to-end steps (§2.8);
- turning on "pay" for a country;
- switching billing on;
- the tax-summary command.

**Caddy:** no change, because the notice travels the normal `/api/*` path. The `request_body max_size 1MB` already
covers it.

### 2.12 For the colleague (legal) and the lawyer

1. **Terms §2:** fill in the country list from `countryPolicy`. Explain that some countries allow sign-up without
   payment until tax registration is done.
2. **Terms §12:**
   - "exclude" VAT, with the total shown before payment;
   - no merchant-of-record clause, because xMoney is only a processor and DebateAIRO is the seller;
   - retries on days 1, 3 and 7;
   - the /cancel page;
   - the Free plan's allowance wording;
   - the chargeback pause;
   - the discretionary refund policy line.
3. **Terms §13:** the refund formula ("the larger of days used or credit used"). This is a change from the current
   time-only pro rata, and it needs counsel's view under the Consumer Rights Directive art. 14(3).
4. **Terms §1 and a new `/legal` page:** the company data (address, J number, CUI, **VAT: RO…**), phone and email
   (xMoney requires phone and email).
5. **The Privacy Policy "[pending]" rows:**
   - payments: xMoney, Quaderno and SmartBill as recipients;
   - location evidence (IP, card country, chosen country) kept 10 years for tax law (Art. 6(1)(c));
   - DB-IP lookups done locally (no data sent);
   - acceptance records, as now built.
6. **Terms §8 and the Provider Register:**
   - Gemini must be on the paid tier for EEA, Swiss and UK users (Gemini API terms);
   - OpenAI's clause that end users must be in supported countries (the country gate enforces it);
   - where Qwen, GLM and DeepSeek are hosted (first-party Chinese APIs versus EU/US hosts such as AWS Bedrock);
   - Z.ai's parent is on the US Entity List, which matters against OpenAI's restricted-party clause when one model's
     output is sent to another.
7. **The EU Blocking Statute:** word the Cuba and Iran exclusion as provider and commercial scope, not as compliance
   with US sanctions.
8. **The Annex A regions** switched to "pay" later: their own items (the UK representative, US arbitration, …).

### 2.13 Order of work and dependencies

There is **one implementation plan**, written in three parts, and the parts are built in this order.

**Part 1a — legal groundwork**

1. Records key.
2. Legal manifest and acceptance records (0078); re-acceptance.
3. Country gate (`packages/geo`, `countryPolicy`, refresh timer, sign-up and ask checks).
4. Server-decided plan tier and Free gauges.

**Part 1b — money engine:** the budget spec's steps 1–6, with the §2.4 amendments (0077, 0079).

**Part 2 — payments**

1. Research check tasks against the live documentation (P2-X-0 xMoney key and notice recording, P2-SB-0 SmartBill
   endpoints). The owner records the sandbox fixtures.
2. `billingPlans`, `billingPolicy` and `taxAuthorities` rows; `packages/billing-core` (windows, proration, withdrawal,
   fold).
3. Billing tables (0080–0082).
4. Connectors: `packages/payments-xmoney`, `packages/tax-quaderno`, `packages/invoice-smartbill`, and their fakes.
5. API routes: quote, checkout, notify, verify worker, reconcile, renewal, dunning, actions, public cancel, usage.
6. Mail templates and the 11 emails.
7. UI: pricing, checkout, return page, settings card, usage bars, room notices, cancel and withdraw pages, legal pages,
   footer, CSP.
8. Runbook, the hosted register example, the development fakes.

**Part 3 — model fit**

1. Merge the scorecard branch (renumber, conflicts, catalogues).
2. Feed the person room into the picker; ECONOMY and BEST caps; null estimate as the maximum; WAIT instead of the
   refusal.

**Dependencies**

- The budget spec's own dependencies still hold: the wording branch `fix/2026-09-28-plain-failure-reasons` and the
  scorecard branch.
- Part 2 needs Part 1 (entitlements feed the windows).
- Part 3 needs Part 2 (the plans decide the caps).
- **Shipping:** each part ends as its own PR to dev, following the owner's standing rule: merge the latest dev,
  green CI plus the local integration suites, then merge. Billing stays off, so each merge changes nothing live.

### 2.14 Known limits and open items

1. **xMoney unknowns:**
   - the key format and length, and the meaning of the `signature` field;
   - whether renewals, retries and chargebacks send notices (the reconciler covers it either way);
   - whether a `managed` rebill runs without the bank's security check;
   - whether AI subscriptions are accepted, and the card-country restrictions;
   - the fees.
   These are measured in the sandbox or asked by the owner before billing is switched on.
2. **Quaderno:**
   - which price list is current;
   - which webhook events exist (we do not rely on them);
   - duplicate protection on `POST /transactions` (we look up by `processor_id` first).
3. **SmartBill endpoints** are unconfirmed until P2-SB-0.
4. **No real debate cost has been measured.** The credit amounts and the site's per-run ceiling must be checked
   against the first paid debates.
5. **One API instance.** Renewal and outbox claims are safe for more than one, but the in-memory admission limits
   are not (go-live checklist line 4).
6. **Business days ignore public holidays.** That errs on the long side for notices.
7. **CONFLICTING location evidence** is taxed at the declared country and listed in the owner's summary. An
   accountant may prefer a stricter rule. It can be changed later without touching the code's shape.
8. **Proration and withdrawal round to cents.** Both favour the customer by less than a cent.
