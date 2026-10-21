# NETOPIA retry rules and first-card safety (B1–B3) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make saved-card renewals obey NETOPIA's answers of 2026-10-21: at most 2 saved-card sends per card in 24 hours, no endless resends after our own setup refusal, automatic dunning retries only for refusal code 20, and no lost first-payment card.

**Architecture:** No database migration. Send counting is derived from the charge events that already exist (a pure function over the call markers). NETOPIA's refusal code and the retry decision travel with the dunning attempt, in the PAST_DUE subscription event's content-free `data` (written in the same transaction as the FAILED charge event). A setup refusal parks the charge until the owner runs a new command. Verified notifications whose database write fails go to an encrypted file spool that is replayed at start and every 10 minutes; a token in a status read is stored; a first payment with no card raises one owner alert.

**Tech Stack:** TypeScript (Node, ESM), PostgreSQL via `pg`, vitest 5 (embedded Postgres in integration tests), pnpm workspace under `dialectical-engine/`.

**Spec:** `/Users/stefannour/DebateAIRO/docs/business/2026-10-21-netopia-answers-code-check.md` ("Changes to build" 1–3, rows (4), (11), (15), (22)) and section 8 of `/Users/stefannour/DebateAIRO/docs/business/2026-10-19-netopia-testing-plan-and-questions.md` (B1–B3). Both are outside the repo; read them first.

## Global Constraints

- All paths below are relative to `dialectical-engine/` unless they start with `/`.
- **No migration.** Nothing under `migrations/`, `packages/db/src/migration-forward*.ts` or `migrations/lineage/` changes. `billing.subscription_event.data` is content-free jsonb (codes, ids, ISO dates, integers) and may take new keys; `billing.charge_event.error_code` must match `^[A-Z0-9_:-]{1,96}$`.
- NETOPIA facts (answers of 2026-10-21): at most **3** saved-card (token) tries a day → we allow **2** sends per card in any 24 hours (one spare); only refusal code **`"20"`** (insufficient funds) is worth retrying; resent notifications (5 copies, 5 minutes apart) carry **no** token; a token payment always gets an answer.
- Owner-facing sentences (O3 `nextSteps`, CLI output, owner summary) are **English only**: the owner catalogue exists only in English by design (`apps/api/src/mail-channel.ts:365`). Plain words, no internal jargon beyond the codes already used.
- Customer-facing sentences go in **all 35 locales** (`packages/mail-templates/messages/<locale>/mail.json`, locales = the folders there). Translation is a mechanical fan-out: split into 3–4 parallel `model: "haiku"`, `effort: "xhigh"` subagents by language group, then ONE `model: "opus"` spot-check of mt, ga, et, lv, lt, ar, he, hi, ja, zh, ko and formal Romanian.
- Audit lines and event data stay content-free: codes, counts, ids we mint; never a token, email, name or card number.
- Out of scope, do not touch: the live base address (`deploy/vps/billing-setup.sh:55`, README §14 base lines), refunds by API (`client.ts` refund, RefundDesk), status 10 behaviour and its O3 wording (`verify-payment.ts:122-133`, `chargebackLostSteps`).
- No hard-coded machine paths in code or tests: the spool directory comes from `BILLING_NOTICE_SPOOL_PATH`; tests use `os.tmpdir()`-based folders. Deploy files (`deploy/vps/**`) may name the VPS layout as they already do.
- Test values that look like keys or tokens are built from pieces (`["tok", "x", id].join("-")`); never put a `…_KEY, "literal"` pair on one line (gitleaks false positive).
- Match the surrounding code: dense doc comments that cite the rule (`NETOPIA answers 2026-10-21 (Q22)` style), `Object.freeze` results, `Readonly<…>` types, typed `TypedDomainError` codes.
- **Machine rules (16 GB Mac):** ONE heavy command at a time (an integration file, typecheck, a large unit run); never the whole suite (CI is the judge). Run every vitest and typecheck through `/Users/stefannour/DebateAIRO/debateairo/.claude/worktrees/netopia-retry-rules/.superpowers/sdd/2026-10-21-netopia-retry-rules/run-clean.sh` (`run-clean.sh vitest <log> <files…>` or `run-clean.sh typecheck <log>`); it waits for a quiet host, uses its own TMPDIR and moves it to the Trash. A "host client may be unreachable" tool result means stop at once and report `HOST_UNREACHABLE`.
- Commits: one per task (fix-ups allowed), message ends with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Never push.

## Review Focus

1. **A renewal for one subscription reached from two passes at once** (the 60-second renewal tick's recovery and the 10-minute maintenance retry): the cap must be read inside the subscription lease, right before the marker is written, or two passes can both see "1 send" and send twice. Task 3 checks the call sites; the reviewer checks every gate runs under `withSubscriptionLease`.
2. **The spool folder is missing, read-only or full at the moment the database fails**: NETOPIA must still get its quick 503 and the API must not throw. Task 6 tests `put` throwing.
3. **A spooled file that is corrupt, or sealed under an older records key**: the replay keeps going with the other files and the bad one is dropped only after 14 days. Task 6 tests both.
4. **Dunnings already under way when this ships** (PAST_DUE rows without the new `auto_retry` key): they keep retrying as before. Task 2 tests it.
5. **The owner runs the resume command twice, or when nothing is held**: the second run releases nothing and sends nothing. Task 4 tests it.
6. **A card change on a day the old card already used both sends**: the new card's sends count from zero. Task 3 tests it.

---

### Task 1: Keep NETOPIA's refusal code with the failed attempt (B2, part 1)

**Files:**
- Modify: `apps/api/src/billing/renewal-rules.ts` (new `autoRetryAllowed`, `dunningProgress` gains `autoRetry`)
- Modify: `apps/api/src/billing/settlement.ts:65` (`failed` context gains `declineCode`)
- Modify: `apps/api/src/billing/settlement-renewal.ts` (`DunningAttempt.declineCode`, PAST_DUE data keys)
- Modify: `apps/api/src/billing/renewal.ts:692-718, 991-1006, 1210-1216` (`refused` takes and passes the code)
- Modify: `apps/api/src/billing/verify-payment.ts:74-89, 456-481` (`reportFromNotice` reads the notice's code; `netopiaFailed` passes it)
- Modify: `apps/api/src/billing/records.ts` (new `openNoticeAllowed`, the counterpart of `sealNoticeAllowed`)
- Modify (export only, if not exported): `packages/payments-netopia/src/index.ts` (`bankDeclined`, `declineSideOf`)
- Test: `tests/unit/billing-renewal-rules.test.ts`, `tests/integration/billing-renewal-netopia.test.ts`, `tests/integration/billing-verify-netopia.test.ts`

**Interfaces:**
- Produces: `export function autoRetryAllowed(failure: Readonly<{ chargeErrorCode: string | null; declineCode: string | null; reason: string | null }>): boolean` in `renewal-rules.ts`.
- Produces: `export const REFUSAL_NOT_RETRIED = "REFUSAL_NOT_RETRIED"` in `renewal-rules.ts` (the charge-less attempt reason Task 2 writes).
- Produces: `dunningProgress(...)` result gains `autoRetry: boolean` (`latest PAST_DUE data.auto_retry !== false`, so rows written before this change read `true`).
- Produces: `DunningAttempt` gains `declineCode: string | null`; `ChargeSettlement.failed` context gains optional `declineCode?: string | null`.
- Produces: PAST_DUE `data` gains `auto_retry: boolean` (always written) and `decline_code: string` (only when non-null).
- Produces: `export function openNoticeAllowed(key: Buffer, noticeId: string, ciphertext: Buffer): Readonly<Record<string, string | number | null>>` in `records.ts`.

- [ ] **Step 1: Write the failing unit tests** for `autoRetryAllowed` in `tests/unit/billing-renewal-rules.test.ts`:
  - `{ chargeErrorCode: "PAYMENT_DECLINED", declineCode: "20", reason: null }` → `true`
  - `PAYMENT_DECLINED` with `"22"`, `"21"`, `"020"` and `null` → `false`
  - `PAYMENT_FAILED`, `PAYMENT_EXPIRED`, `AUTHENTICATION_REQUIRED` with `"20"` → `true`; with `"99"` or `null` → `false`
  - `NO_TRANSACTION` / `CARD_NOT_SAVED` with `declineCode: null` → `true` (our own failure, NETOPIA never refused)
  - charge-less `{ chargeErrorCode: null, declineCode: null, reason: "TAX_SERVICE_UNAVAILABLE" }` and `"RETRY_TOTAL_CHANGED"` → `true`; `reason: "REFUSAL_NOT_RETRIED"` → `false`
  - `dunningProgress` over a history whose latest PAST_DUE has no `auto_retry` → `autoRetry: true`; with `auto_retry: false` → `false`.
- [ ] **Step 2: Write the failing integration tests** in `tests/integration/billing-renewal-netopia.test.ts` (new `describe("B2 NETOPIA's refusal code travels with the failed attempt")`):
  - the charge answers `report(orderId, "DECLINED", { declineCode: "20", bankDeclined: true })` → the PAST_DUE event's `data.decline_code === "20"`, `data.auto_retry === true`; the FAILED charge event's `errorCode` is still exactly `"PAYMENT_DECLINED"`.
  - the same with `declineCode: "22"` → `data.decline_code === "22"`, `data.auto_retry === false`.
  - `CARD_NOT_SAVED` (revoked card) → no `decline_code` key, `auto_retry === true`.
  And in `tests/integration/billing-verify-netopia.test.ts`: a RENEWAL decided from a stored notice (status read UNREADABLE until the schedule is spent, notice body `payment.status "12"`, `payment.code "20"`) → its PAST_DUE `data.decline_code === "20"`; the same notice with `payment.code "34"` → `auto_retry === false` and the M5 says the bank refused (`bankDeclined "true"`, 34 is a bank code).
- [ ] **Step 3: Run them to see them fail**
  Run: `run-clean.sh vitest <log> tests/unit/billing-renewal-rules.test.ts`, then (separately) each integration file.
  Expected: FAIL (`autoRetryAllowed` is not exported; no `decline_code`).
- [ ] **Step 4: Implement.**
  - `autoRetryAllowed`: `reason === REFUSAL_NOT_RETRIED` → false; `chargeErrorCode` in `{PAYMENT_DECLINED, PAYMENT_FAILED, PAYMENT_EXPIRED, AUTHENTICATION_REQUIRED}` → `declineCode === "20"`; anything else → true. Comment: NETOPIA answers 2026-10-21 (Q15): only 20 is worth retrying; our own failures (nothing reached NETOPIA, the tax service, a changed total) retry as before.
  - `writeDunningAttempt` writes `auto_retry: autoRetryAllowed({ chargeErrorCode: input.chargeErrorCode, declineCode: input.declineCode, reason: input.reason })` and `decline_code` when non-null, into the PAST_DUE data only (not into an ENDED row).
  - `createRenewalSettlement().failed` passes `context.declineCode ?? null`. `failUnpricedAttempt` passes `declineCode: null`.
  - `RenewalService.refused(charge, errorCode, providerPaymentId, now, bankDeclined?, declineCode?)` passes `declineCode` to `settlement.failed`; `recordAnswer` and `decidePendingRenewal` pass `answer.declineCode` / `read.declineCode`.
  - `VerifyPaymentHandler.netopiaFailed` passes `declineCode: report.declineCode`.
  - `reportFromNotice(orderId, notice, recordsKey)`: open `notice.allowedCiphertext` with `openNoticeAllowed`; `code` = the allowed `code` when it is a string; `declineCode` = that code unless it is an outcome code (`"00"`, `"0"`); `declineSide` = `declineSideOf(declineCode, providerStatus)` for DECLINED/FAILED; `bankDeclined` = state DECLINED and `bankDeclined(declineCode)`. A notice whose allowed fields cannot be opened keeps today's values (no code). Update the function's doc comment (it no longer "carries no decline code").
- [ ] **Step 5: Run the three test files** (one at a time). Expected: PASS. Then run `tests/integration/billing-dunning.test.ts`: tests that expected retries after a decline with no code now see `auto_retry: false` in the data but **no behaviour change yet** (Task 2 changes behaviour), so it must stay green.
- [ ] **Step 6: Typecheck** (`run-clean.sh typecheck <log>`). Expected: exit 0.
- [ ] **Step 7: Commit** `feat(billing): keep NETOPIA's refusal code with each failed renewal attempt (B2)`.

### Task 2: Retry automatically only on code 20; tell the person plainly (B2, part 2)

**Files:**
- Modify: `apps/api/src/billing/maintenance.ts:163-222` (`retry`)
- Modify: `apps/api/src/billing/settlement-renewal.ts:55-92` (`endDate` email param when no automatic retry)
- Modify: `packages/mail-templates/src/templates.ts:95-153` (M5A/M5B/M5C conditional paragraphs, optional `endDate`)
- Modify: `packages/mail-templates/messages/*/mail.json` (3 new keys × 35 locales)
- Modify: `apps/api/src/billing/tax-summary.ts:~60, ~600` (owner summary explains `REFUSAL_NOT_RETRIED`)
- Modify: `packages/db/src/billing.ts:~1371` (doc comment listing charge-less reasons)
- Test: `tests/integration/billing-dunning.test.ts`, the mail-template unit tests that pin M5's paragraphs (find them with `grep -rln "M5A" tests/unit tests/render`)

**Interfaces:**
- Consumes: `autoRetryAllowed`, `REFUSAL_NOT_RETRIED`, `dunningProgress().autoRetry` (Task 1).
- Produces: M5A/M5B/M5C accept optional param `endDate: "date"`; present = the no-retry wording.

The exact English (owner reviews it in the PR):
- `mail.M5.notTakenNoRetry`: `We couldn't take this month's payment for your {plan} plan, and we won't try this card again.`
- `mail.M5.addCard`: `You keep your plan until {endDate}. To keep it after that, add a card, and we'll take the payment from it straight away: {cardPageUrl}`
- `mail.M5.addCardLast`: `This is our last reminder. If you don't add a card by {endDate}, your account moves to the Free plan, and your debates are kept. To add a card, open: {cardPageUrl}`

Template shape: the first paragraph becomes `{ ifParam: "endDate", test: "present", then: "mail.M5.notTakenNoRetry", otherwise: "mail.M5.notTaken" }` (the bank / confirm-card conditional after it is unchanged); the last paragraph becomes `{ ifParam: "endDate", test: "present", then: "mail.M5.addCard", otherwise: <today's key> }` for M5A (`mail.M5.retry`) and M5B (`mail.M5.secondTry`), and `then: "mail.M5.addCardLast", otherwise: "mail.M5.lastTry"` for M5C.

- [ ] **Step 1: Write the failing integration tests** in `tests/integration/billing-dunning.test.ts` (new `describe("B2 only refusal 20 is retried by itself")`), scripting declines through the suite's existing fake so the codes are explicit:
  - **hard refusal:** the renewal answers DECLINED `declineCode: "22"` → M5A queued with `endDate` = first failure + 7 days (ISO, the policy's last retry day) and no `retryDate`-based "we will try again" paragraph in the rendered text; at +1 day and +3 days **no saved-card charge is sent** (the port's `charges` list does not grow), a charge-less PAST_DUE with `data.reason === "REFUSAL_NOT_RETRIED"`, `auto_retry === false` is written each time, with M5B then M5C (both carrying `endDate`); at +7 days ENDED(DUNNING), Free and M6.
  - **code 20:** the renewal answers DECLINED `declineCode: "20"` → at +1 day a NEW orderID is charged (today's behaviour, M5A/M5B without `endDate`).
  - **card change after a hard refusal:** DECLINED `"22"`, then a CARD_CHANGED with `retry_now: true` and a new usable card → the next maintenance pass charges at once with the new card.
  - **a dunning already under way** (Review Focus 4): a PAST_DUE written without `auto_retry` (append it through `subscriptionEvent` the way the suite seeds histories) → the retry at +1 day charges as before.
  - Existing tests that script a decline with no code but expect retries: give them `declineCode: "20"` and say so in the test name only if the name claims a code. Do not weaken any assertion.
- [ ] **Step 2: Write the failing template test**: rendering M5A, M5B, M5C in `en` with `endDate` present shows the three new sentences and none of `mail.M5.retry` / `secondTry` / `lastTry`; without `endDate` the output is byte-identical to today's.
- [ ] **Step 3: Run to see them fail.** Expected: FAIL (charges sent at +1 day; template has no `endDate`).
- [ ] **Step 4: Implement.**
  - `maintenance.retry`: right after the `erasureBlocks` check (so after the unchanged retry-day timing check: the charge-less attempts land on the same days retries would), when `!progress.autoRetry && !cardChangedSince`: first `earlierAttemptPaid(state, periodStart, next, now)`; anything but `"NONE"` → today's `billing.renewal.retry_held` audit and `return false`; `"NONE"` → `return (await this.deps.renewal.failUnpricedAttempt(state, periodStart, next, progress.firstFailedAt, now, REFUSAL_NOT_RETRIED)) ? "RETRIED" : false`. This branch never calls `retryPrice` (no tax call for an attempt that charges nothing). Every other case runs today's code unchanged.
  - `writeDunningAttempt`: when the attempt's `auto_retry` is false, add `endDate: addDays(firstFailedAt, Math.max(...retryDays)).toISOString()` to the M5 params (the same day the last attempt ends the dunning).
  - `templates.ts`: the conditionals above; add `endDate: "date"` to `retryOptional`. Update the W10 doc comment with one line on `endDate`.
  - Messages: add the 3 keys to `en/mail.json`, then all other 34 locales (delegate: Global Constraints). Keep each locale's own tone and its existing M5 wording for "card", "plan", "Free plan", "debates".
  - Owner summary (`tax-summary.ts`): explain `REFUSAL_NOT_RETRIED` next to `RETRY_TOTAL_CHANGED` in the same style: "NETOPIA refused the card for a reason other than missing funds, so it was not charged again; the person was emailed to add a card".
- [ ] **Step 5: Run** `tests/integration/billing-dunning.test.ts`, the template/catalogue unit tests (including the test that checks every locale has every key: find it with `grep -rln "messages" tests/unit | grep -i "mail\|catalog\|locale"`), and `tests/integration/mail-locale-billing-renewal.test.ts` (one at a time). Expected: PASS.
- [ ] **Step 6: Typecheck.** Expected: exit 0.
- [ ] **Step 7: Commit** `feat(billing): retry a refused renewal by itself only on NETOPIA's code 20 (B2)`.

### Task 3: Never more than 2 saved-card sends per card in 24 hours (B1, part 1)

**Files:**
- Create: `apps/api/src/billing/renewal-markers.ts`
- Modify: `apps/api/src/billing/renewal.ts` (move `RESEND_STARTED`, `NOT_SENT_CODES`, `OUR_SETUP_CODES` into the new module and import them; add `savedCardSendAllowed`; gate `renew` and `resend`)
- Modify: `apps/api/src/billing/maintenance.ts` (gate the retry; `MaintenanceDeps.renewal` Pick adds `"savedCardSendAllowed"`)
- Test: `tests/unit/billing-renewal-markers.test.ts` (create), `tests/integration/billing-renewal-netopia.test.ts`, `tests/integration/billing-dunning.test.ts`

**Interfaces:**
- Produces (in `renewal-markers.ts`, which imports nothing from `renewal.ts`):
  - `export const RESEND_STARTED = "RESEND_STARTED"`, `export const NOT_SENT_CODES: ReadonlySet<string>`, `export const OUR_SETUP_CODES: ReadonlySet<string>` (same members as today).
  - `export const SAVED_CARD_SENDS_PER_DAY = 2`.
  - `export function countedSavedCardSends(charges: ReadonlyArray<Readonly<{ kind: string; events: ReadonlyArray<Pick<ChargeEventRow, "kind" | "errorCode" | "at">> }>>, since: Date): number`
- Produces (in `RenewalService`): `async savedCardSendAllowed(state: SubscriptionState, now: Date): Promise<boolean>`.

Counting rule (`countedSavedCardSends`): only `RENEWAL` charges; events in the order the repository returns them; a **send marker** is a `REQUESTED` whose `errorCode` is `null` or `RESEND_STARTED`, with `at >= since`; it is **counted** unless the event right after it in the same charge is a `REQUESTED` with `CHARGE_NOT_SENT` (nothing reached NETOPIA: a transport failure before sending, NETOPIA's 429, or a preparation that could not read) or a `FAILED` with `CARD_NOT_SAVED` (no call was made). A marker with nothing after it yet (a call in flight) is counted.

`savedCardSendAllowed`: `usableSavedCard(...)` null → `true` (no NETOPIA call will be made; the CARD_NOT_SAVED path decides). Otherwise `since = max(now − 24 h, card.createdAt)` (a card's sends start when it was stored, so a new card after a card change starts from zero); read the subscription's RENEWAL charges created in the last 30 days with their events; allowed when `countedSavedCardSends(...) < SAVED_CARD_SENDS_PER_DAY`. When it answers false it writes `billing.renewal.send_capped` with `{ attempt }` or `{}` (content-free).

Gates (each runs inside the subscription lease its caller already holds):
- `renew()`: after the notice decision says CHARGE and before `createCharge`: not allowed → `holdPending(state, periodStart, now, "SAVED_CARD_DAILY_LIMIT")`, return `"skipped"`.
- `resend()`: after the card and payer are prepared, before the `RESEND_STARTED` marker is written: not allowed → return `false`.
- `maintenance.retry`: right before `createRetryCharge`: not allowed → audit `billing.renewal.retry_held` `{ code: "SAVED_CARD_DAILY_LIMIT" }`, return `false` (the next pass tries again).

- [ ] **Step 1: Write the failing unit tests** in `tests/unit/billing-renewal-markers.test.ts` for `countedSavedCardSends`: first marker counted; `RESEND_STARTED` counted; a marker followed by `REQUESTED CHARGE_NOT_SENT` not counted; a marker followed by `FAILED CARD_NOT_SAVED` not counted; a marker followed by `REQUESTED CHARGE_CONFIGURATION_REFUSED` counted; `SUBMIT_UNKNOWN` after a marker counted; a marker with `at` 1 ms before `since` not counted, at `since` counted; a non-RENEWAL charge ignored; two charges summed.
- [ ] **Step 2: Write the failing integration tests** in `tests/integration/billing-renewal-netopia.test.ts` (new `describe("B1 at most 2 saved-card sends per card in 24 hours (NETOPIA Q22)")`):
  - **unknown outcome:** the charge throws `paymentError("PAYMENT_OUTCOME_UNKNOWN", "timeout")` every time, status reads answer `NO_SUCH_ORDER`; tick `renewal.runOnce()` every 10 minutes for 72 hours of the test clock → in every 24-hour span the port's `charges` for this payer hold at most 2 entries, and a third send happens only once the first is more than 24 hours old.
  - **card change** (Review Focus 6): a PAST_DUE plan whose old card already used 2 counted sends in the last hour (seed them through the suite's existing helpers, or by letting two sends happen), then a CARD_CHANGED `retry_now: true` to a newly stored card → the maintenance pass charges the new card at once.
  - **outage is not counted:** the charge throws `PAYMENT_PROVIDER_UNAVAILABLE` 4 times then answers PENDING → the not-sent backoff resends happen (1, 5, 15 minutes…) and the 5th call goes out (none of the not-sent calls counted).
- [ ] **Step 3: Run to see them fail.** Expected: FAIL (more than 2 sends in 24 hours).
- [ ] **Step 4: Implement** the module, the method and the three gates as specified. `rebillOutcomeOpen` keeps its behaviour (it now imports `NOT_SENT_CODES`).
- [ ] **Step 5: Run** the unit file, then `billing-renewal-netopia.test.ts`, then `billing-dunning.test.ts` (one at a time). Expected: PASS.
- [ ] **Step 6: Typecheck.** Expected: exit 0.
- [ ] **Step 7: Commit** `feat(billing): at most two saved-card sends per card in 24 hours (B1)`.

### Task 4: After our own setup refusal, stop and wait for the owner (B1, part 2)

**Files:**
- Modify: `apps/api/src/billing/renewal-markers.ts` (add `CHARGE_RESUMED`, `heldForOwner`)
- Modify: `apps/api/src/billing/renewal.ts:142-168` (OWNER_STEPS texts), `:1074-1158` (`paymentWindowEnd`, `recoverNetopiaCharge`)
- Create: `apps/api/src/billing/renewal-resume.ts`, `apps/api/src/billing/renewal-resume-cli.ts`
- Modify: `package.json` (script `"billing:renewal-resume": "tsx apps/api/src/billing/renewal-resume-cli.ts"`)
- Modify: `deploy/vps/README.md` §14 (one paragraph next to `billing:check`: when to run the command, its host form)
- Test: `tests/integration/billing-renewal-netopia.test.ts` (rewrite the two C-8 tests at `:302-356`), `tests/unit/billing-renewal-markers.test.ts`, and any unit test pinning package.json billing scripts or OWNER_STEPS (`grep -rln "billing:check\|OWNER_STEPS" tests`)

**Interfaces:**
- Consumes: `NOT_SENT_CODES`, `OUR_SETUP_CODES`, `RESEND_STARTED`, `savedCardSendAllowed` (Task 3).
- Produces (in `renewal-markers.ts`): `export const CHARGE_RESUMED = "CHARGE_RESUMED"` (also added to `NOT_SENT_CODES`: the owner's marker sends nothing), and `export function heldForOwner(events: ReadonlyArray<Pick<ChargeEventRow, "kind" | "errorCode">>): boolean` = no SUCCEEDED/FAILED/SUBMITTED, and the last `REQUESTED`/`SUBMIT_UNKNOWN` event is a `REQUESTED` whose code is in `OUR_SETUP_CODES`.
- Produces (in `renewal-resume.ts`): `export async function resumeHeldRenewals(deps: Readonly<{ repository: Pick<BillingRepository, "charge" | "withTransaction" | "appendChargeEvent">; jobs: Pick<BillingJobQueries, "openPaymentCharges" | "withSubscriptionLease">; paymentEnvironment: "sandbox" | "live"; clock: () => Date; audit: BillingAudit }>): Promise<Readonly<{ resumed: number; busy: number }>>` — pages `openPaymentCharges` (NETOPIA, this environment, kind RENEWAL, created in the last 30 days) and, under each subscription lease, re-reads the charge and appends `REQUESTED` with `errorCode: CHARGE_RESUMED` when `heldForOwner` holds; a BUSY lease counts `busy`. One audit line `billing.renewal.resumed` `{ resumed, busy }`.

Behaviour:
- `recoverNetopiaCharge`: when the last trail event is a `REQUESTED` with a code in `OUR_SETUP_CODES`, never send again by itself — in both branches (no `resend`; status reads in the unknown-outcome branch go on). Drop the window-end `outcomeOpen` for such a charge (the owner was told at the refusal).
- When the last trail event is `REQUESTED CHARGE_RESUMED`: send again at once (no backoff), still through `resend()` (so the cap and the card/payer checks apply), when the plan is still live; a plan no longer live closes `NO_TRANSACTION` as today when nothing was ever sent.
- `paymentWindowEnd`: when the charge holds a `CHARGE_RESUMED`, the window ends at `max(today's end, newest CHARGE_RESUMED.at + 24 h)` (a resume gives the charge a fresh day; `decidePendingRenewal` uses the same function).
- `notSent()`: unchanged dedupe (`${code}:${hour}`), new texts.
- CLI (`renewal-resume-cli.ts`, modelled on `refund-done-cli.ts`'s environment loading, pool and exit codes; no arguments): prints exactly one of `Sent again: <n> held renewal(s) will each be tried once more within a minute.` / `Nothing to resume: no renewal is waiting for you.`, plus `Busy: <m> renewal(s) were being worked on; run the command again in a minute.` when `busy > 0`; exit 0.

New OWNER_STEPS English (both end with the two host-form lines, each on its own line, indented two spaces like today):
- `CHARGE_CONFIGURATION_REFUSED`: `NETOPIA refused a renewal because of our own setup (the merchant settings, recurring payments not switched on for the account, or a code we do not know). Nothing was charged and the customer was not emailed. NETOPIA allows only 3 tries a day on a saved card, so this renewal is not tried again by itself: it waits for you. The person keeps the plan for 72 hours from the renewal date; after that the paid features pause until the renewal goes through. Run the check command below as root on the server and fix the setting in NETOPIA's admin (or ask NETOPIA about the code). Then run the second command: it sends every renewal held like this once more.` + `\n  ${hostCommand("billing:check")}\n  ${hostCommand("billing:renewal-resume")}`
- `CHARGE_CREDENTIALS_REFUSED`: `NETOPIA refused our API key. Nothing was charged and the customer was not emailed. This renewal is not tried again by itself: it waits for you. The person keeps the plan for 72 hours from the renewal date; after that the paid features pause until the renewal goes through. Replace the key with the guided setup (deploy/vps/billing-setup.sh --replace netopia), restart the API and run the check command below as root on the server. Then run the second command: it sends every renewal held like this once more.` + the same two lines.

- [ ] **Step 1: Write the failing tests.** Unit: `heldForOwner` true for `[REQUESTED null, REQUESTED CHARGE_CONFIGURATION_REFUSED]` and for `…CHARGE_CREDENTIALS_REFUSED`; false after a later `REQUESTED CHARGE_RESUMED`, after `SUBMITTED`, and for `[REQUESTED null, REQUESTED CHARGE_NOT_SENT]`. Integration (replace the two C-8 tests):
  - **code 99:** the charge throws `paymentError("PAYMENT_CONFIGURATION_REFUSED", "99")`; tick the renewal every 10 minutes for 72 hours → exactly **1** send, exactly one O3 `CHARGE_CONFIGURATION_REFUSED` whose `nextSteps` names `billing:renewal-resume`, no M5, the RENEWAL_PENDING hold written once, the charge still open (no FAILED).
  - **resume:** then the port answers PENDING; `resumeHeldRenewals(...)` returns `{ resumed: 1, busy: 0 }`; the next tick sends once with the **same orderID** and records SUBMITTED; a second `resumeHeldRenewals` returns `{ resumed: 0, busy: 0 }` and nothing more is sent (Review Focus 5).
  - **resume past the window:** the same, resumed at 80 hours → it sends (not closed NO_TRANSACTION), and if the answer is again 99 it is held again with no further send.
  - **credentials:** the charge throws `paymentError("PAYMENT_CREDENTIALS_REFUSED", "401")` → the key alarm line, one O3, exactly 1 send in 72 hours.
  - **outage unchanged:** `PAYMENT_PROVIDER_UNAVAILABLE` throughout → today's backoff resends and, at the window's end, FAILED(NO_TRANSACTION) and the dunning.
- [ ] **Step 2: Run to see them fail.** Expected: FAIL (hourly resends; no `resumeHeldRenewals`).
- [ ] **Step 3: Implement** as specified. Keep `rebillOutcomeOpen`'s meaning (a charge parked for the owner is "nothing sent"; one resumed is too until its next marker).
- [ ] **Step 4: Run** the unit file, then `billing-renewal-netopia.test.ts`, then `tests/integration/billing-card-change-netopia.test.ts` (card change reads `rebillOutcomeOpen`). Expected: PASS.
- [ ] **Step 5: Typecheck.** Expected: exit 0.
- [ ] **Step 6: Commit** `feat(billing): a renewal NETOPIA refused for our own setup waits for the owner's resume command (B1)`.

### Task 5: Store a card token found in a status read (B3b)

**Files:**
- Create: `apps/api/src/billing/card-store.ts`
- Modify: `apps/api/src/billing/renewal.ts:1008-1027` (`storeAnsweredCard` delegates)
- Modify: `apps/api/src/billing/verify-payment.ts:226-247` (`netopiaJob` stores before deciding)
- Modify (only if it decides a payment itself rather than queueing VERIFY_PAYMENT): `apps/api/src/billing/reconcile.ts`
- Test: `tests/integration/billing-verify-netopia.test.ts`

**Interfaces:**
- Produces: `export async function storeReportedCard(deps: Readonly<{ repository: Pick<BillingRepository, "cardTokensFromCharge" | "customerByOwner" | "insertCardToken">; recordsKey: Buffer }>, client: PoolClient, charge: Pick<ChargeRow, "chargeId" | "ownerRef" | "paymentEnvironment">, report: Pick<PaymentReport, "savedCard" | "occurredAt" | "cardCountry">, at: Date): Promise<boolean>` — today's `storeAnsweredCard` body moved here (one row per charge; sealed with `sealCardToken`; `sourceChargeId` = the charge, `sourceNoticeId`/`sourceToolOrder` null; `sourcePaidAt = report.occurredAt ?? at`); returns whether it inserted.

- [ ] **Step 1: Write the failing integration tests** in `billing-verify-netopia.test.ts` (new `describe("B3 a card in a status read is kept")`):
  - an INITIAL charge with **no** notice stored; the status read answers PAID with a `savedCard` (token built from pieces, `expMonth 12`, `expYear 2031`, `last4 "4242"`) → after VERIFY_PAYMENT one `card_token` row with `sourceChargeId` = the charge and `sourceNoticeId` null, and the ACTIVATED subscription's `cardTokenId` is that row.
  - VERIFY_PAYMENT runs again on the same charge → still one row.
  - a charge already SUCCEEDED without a card, then a status read with a card → one row and a CARD_SAVED adopting it.
  - a status read answering DECLINED that happens to carry a token → no row.
- [ ] **Step 2: Run to see them fail.** Expected: FAIL (no row).
- [ ] **Step 3: Implement.** In `netopiaJob`, when the read is a report with `savedCard !== null` and state `PAID` or `AUTHORIZED`, call `storeReportedCard` in its own transaction under the owner lock before `decideNetopia`. `RenewalService.storeAnsweredCard` calls `storeReportedCard` (behaviour unchanged). Read `reconcile.ts`: if it only queues VERIFY_PAYMENT, no change; if it settles anything from its own read, store there too and add a test.
- [ ] **Step 4: Run** `billing-verify-netopia.test.ts`, then `billing-renewal-netopia.test.ts`, then `billing-reconcile-netopia.test.ts` (one at a time). Expected: PASS.
- [ ] **Step 5: Typecheck.** Expected: exit 0.
- [ ] **Step 6: Commit** `feat(billing): keep a saved card that NETOPIA's status answer carries (B3)`.

### Task 6: An encrypted spool for verified notifications the database could not take (B3a)

**Files:**
- Create: `apps/api/src/billing/notice-spool.ts`
- Modify: `apps/api/src/billing/records.ts` (`sealSpooledNotice` / `openSpooledNotice`)
- Modify: `apps/api/src/billing/netopia-intake.ts` (`spool` dep, `receive`, new `replaySpool`)
- Modify: `packages/register/src/runtime-environment.ts` (optional `BILLING_NOTICE_SPOOL_PATH: z.string().min(1).optional()`, next to the NETOPIA keys)
- Modify: `apps/api/src/main.ts` (build the spool when set; refuse to start with `BILLING_NOTICE_SPOOL_PATH_INVALID` when set but not an existing writable directory; pass it to both intakes; `replaySpool` at start next to `recheckQuarantine`; one `billing.notice.spool_off` line when an intake exists and the setting is absent)
- Modify: `apps/api/src/billing/runtime.ts` (and the provider-only intake's builder) — `replaySpool` on the 10-minute reconcile tick, single-flight (`single-flight.ts`)
- Modify: `deploy/vps/env/api.env.example` (a commented `BILLING_NOTICE_SPOOL_PATH=/var/lib/debateai/api/billing-notice-spool` with two lines of explanation), `deploy/vps/systemd/debateai-api.service:39` (add that folder to `ReadWritePaths`), `deploy/vps/README.md` §14 (create the folder `install -d -m 0700 -o debateai-api -g debateai-api …`, add the line, restart)
- Test: `tests/unit/billing-notice-spool.test.ts` (create), `tests/integration/billing-netopia-intake.test.ts`, and the unit tests that pin the API environment inventory or the systemd unit (`grep -rln "ReadWritePaths\|API_ENVIRONMENT_KEYS" tests`)

**Interfaces:**
- Produces: `export class NoticeSpool { constructor(deps: Readonly<{ directory: string; recordsKey: Buffer }>); put(input: Readonly<{ rawBody: Buffer; header: string | undefined; receivedAt: Date }>): Promise<string>; entries(limit: number): Promise<ReadonlyArray<Readonly<{ spoolId: string; receivedAt: Date }>>>; open(spoolId: string): Promise<Readonly<{ rawBody: Buffer; header: string | undefined; receivedAt: Date }>>; remove(spoolId: string): Promise<void> }`
- Produces: `NetopiaNoticeIntakeDeps.spool?: NoticeSpool`; `NetopiaNoticeIntake.replaySpool(now: Date): Promise<number>` (the number stored).

File format: one file per message, `<spoolId>.json` (spoolId = `randomUUID()`), mode `0600`, content `{"v":1,"receivedAt":"<ISO>","keyId":"…","raw":"<base64>","header":"<base64>"|null}` where `raw`/`header` are the records-key seals with AAD `{ table: "file:billing.notice_spool", column: "raw" | "header", rowId: spoolId }`. Written atomically: open `.<spoolId>.tmp` with flag `wx` and mode `0o600`, write, `fsync`, close, `rename`, then `fsync` the folder. `entries` lists `*.json` only (ignores `.tmp` leftovers), oldest `receivedAt` first, at most `limit`. A file that fails to parse is listed with `receivedAt` from its modification time.

Behaviour:
- `receive`: the store throws → with a spool, `put` (its failure is caught: audit `billing.notice.spool_failed`); success audits `billing.notice.spooled`. The answer is **always** today's `STORE_FAILED` 503: NETOPIA keeps resending, which costs nothing (bodies are deduplicated by SHA-256).
- `replaySpool(now)`: up to 500 entries per call. Older than 14 days → `remove`, counted `expired`. `open` fails → kept, counted `unreadable`. `verifyNetopiaNotice` with today's trust fails → kept, counted `unverified`. Else `store(rawBody, verdict, { arrival: "RECHECKED", receivedAt }, now)`: success (any outcome, DUPLICATE included) → `remove`, counted `stored`; a throw → kept. Wipe `rawBody` after use. One audit line `billing.notice.spool_replay` `{ stored, kept, expired }` only when anything was found; `kick()` when `stored > 0`. Never throws for one bad file.

- [ ] **Step 1: Write the failing unit tests** (`tests/unit/billing-notice-spool.test.ts`, folder from `mkdtemp(join(tmpdir(), "spool-"))`, removed in `afterEach`): put → entries → open round trip (bytes and header equal, receivedAt equal); the file's mode is `0o600`; a file whose ciphertext is changed by one byte fails `open`; a file renamed to another spoolId fails `open` (AAD); a `.tmp` leftover is not listed; entries are oldest first and capped at `limit`.
- [ ] **Step 2: Write the failing integration tests** in `billing-netopia-intake.test.ts` (wrap the suite's repository so `insertPaymentNotice` throws once):
  - the **first** IPN of a checkout, carrying a token, arrives while the write fails → answer 503; one spool file; then a resend **without** the token arrives and is stored (200); then `replaySpool` → a `card_token` row with that `sourceNoticeId`, the spool is empty, and VERIFY_PAYMENT is due for the charge; a second `replaySpool` stores nothing.
  - `put` itself throws (Review Focus 2: a spool whose folder was removed) → still 503, audit `billing.notice.spool_failed`, no exception.
  - a corrupt file and a file sealed under another records key (Review Focus 3) → replay stores the good file, keeps the two bad ones; with the clock 15 days later they are removed and counted `expired`.
  - no spool configured → today's behaviour exactly (503, nothing on disk).
- [ ] **Step 3: Run to see them fail.** Expected: FAIL.
- [ ] **Step 4: Implement** as specified. Boot check uses `fs.statSync(path).isDirectory()` and `fs.accessSync(path, fs.constants.W_OK)`.
- [ ] **Step 5: Run** the unit file, then `billing-netopia-intake.test.ts`, then the environment/deploy pinning unit tests found above (one at a time). Expected: PASS.
- [ ] **Step 6: Typecheck.** Expected: exit 0.
- [ ] **Step 7: Commit** `feat(billing): keep a verified NETOPIA message on disk when the database cannot take it, and replay it (B3)`.

### Task 7: Tell the owner when a first payment brought no card (B3c)

**Files:**
- Modify: `apps/api/src/billing/maintenance.ts` (`visit`, ACTIVE branch; new private `noCardAlert`)
- Test: `tests/integration/billing-dunning.test.ts` (or `billing-card-custody.test.ts`, whichever already seeds ACTIVE NETOPIA plans with and without a card)

**Interfaces:**
- Consumes: `queuePaymentAlert` (`payment-alert.ts`), `isThisPaymentSystem` via `this.served`.
- Produces: `export const NO_CARD_STEPS: string` in `maintenance.ts` (exported for the test).

Rule: on every pass, for a served ACTIVE subscription with `cardTokenId === null` whose ACTIVATED event is at least **30 minutes** old (NETOPIA's 5 copies over ~25 minutes, plus a spool replay tick) and at most **7 days** old (older plans predate this alert) → `queuePaymentAlert({ code: "FIRST_PAYMENT_NO_CARD", reference: \`subscription ${subscriptionId}\`, nextSteps: NO_CARD_STEPS, dedupeRef: \`FIRST_PAYMENT_NO_CARD:${subscriptionId}\`, now })` (once per subscription, ever).

`NO_CARD_STEPS` (English, exact): `This person's first payment went through, but NETOPIA sent no saved card with it. NETOPIA sends the card only once, in its first message about the payment. The plan works now. About 10 days before the renewal the person is emailed to add a card; if they don't, the renewal fails and the usual "update your card" emails follow. On the test site this is expected until NETOPIA turns on the setting that sends the card for our test account. On the live site, check that NETOPIA's messages reach the site (the notify address answers) and that recurring payments are switched on for the account.`

- [ ] **Step 1: Write the failing integration tests:** a plan ACTIVATED 10 minutes ago with no card → no O3; the same plan at 31 minutes → exactly one O3 with `reasonCode "FIRST_PAYMENT_NO_CARD"`; the next pass → still one; a plan with a card → none; a plan ACTIVATED 8 days ago with no card → none; a plan of the other NETOPIA environment → none.
- [ ] **Step 2: Run to see them fail.** Expected: FAIL.
- [ ] **Step 3: Implement** as specified.
- [ ] **Step 4: Run** the test file. Expected: PASS.
- [ ] **Step 5: Typecheck.** Expected: exit 0.
- [ ] **Step 6: Commit** `feat(billing): tell the owner once when a first payment brought no saved card (B3)`.

## Not built here (follow-ups)

- **B3d, an uptime alarm on the notify address:** no tooling here watches the site from outside and emails the owner (the observation agent watches debate runs on the developer machine). It needs an external monitor; listed for the owner.
- `deploy/vps/billing-setup.sh` writing `BILLING_NOTICE_SPOOL_PATH` into its block (today the owner adds the line by hand, README §14).
- B4–B7 of the 2026-10-21 report (B7's spec rows for the decisions built here are appended to the NETOPIA spec's decision log by the controller with the PR).
