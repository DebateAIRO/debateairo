# S3d — Opus lens verdict: **BLOCK**

Ticket t_cc197ed2, board `accounts-phase1`. Author Codex, session 01a019e7. HEAD `b2324d6`.
Blind lens: no sibling verdict read. Read-only on product source; every mutation restored and
verified byte-identical. No commit, no push.

**Headline.** D2, D3 and D4 are sound and I could not break them. D1 is not. The bounded
dispatcher that fixes the unbounded token Set replaces it with a **bounded shared resource whose
occupancy is a deterministic function of whether the probed address exists**, and that converts
into a black-box address-existence oracle with **AUC = 1.0000 and best-single-threshold accuracy
= 1.0000** against a same-arm null, at production policy, through the opaque public response.
S3b's dual-greenlit equal-work property is regressed. Separately, D1's own headline proof
(`raw tokens outside an active send = 0`) is measurably incapable of failing.

---

## 0. Change set (established by mtime, never `git diff`)

`git diff` is blind here — `migrations/0033_…sql` is untracked, and most of the tree is untracked.
Files with mtime after the HEAD commit (`2026-08-20 04:34:40`), excluding node_modules/.next/.pgdata
and sibling-lens scratch:

| mtime | path | content vs HEAD blob |
|---|---|---|
| 07:59:25 | `apps/api/src/mail-channel.ts` | **byte-identical** (touched, restored) |
| 08:00:23 | `packages/db/src/identity.ts` | changed |
| 08:05:41 | `tests/unit/registration.test.ts` | changed |
| 08:07:08 | `migrations/0033_verification_token_credentials.sql` | new (untracked) |
| 08:08:48 | `tests/integration/identity-database.test.ts` | changed |
| 08:11:27 | `tests/integration/registration-database.test.ts` | changed |
| 08:12:08 | `apps/api/src/registration.ts` | changed |
| 08:13:04 | `packages/register/src/auth-policy.ts` | changed |
| 08:18:16 | `reports/orphan-audit.json` | lint artifact |

`mail-channel.ts` is byte-identical to HEAD (`7e35e6f8…`), corroborating "no Sendmail source
rewrite" — it was mutated and restored. `tools/orphan-audit/src/index.ts` is dirty but its mtime
is `2026-08-19 15:19:59`, i.e. S3-era, not S3d. **Frozen scope is clean**: nothing under S3a,
S3b's durability/oracle work, S3c's limiter or its ruled row, T4, crypto, or the identity schema
beyond the additive ledger moved. **T9 untouched** — no deadlock/retry handling exists anywhere in
the tree; not re-reported.

Gates reproduced on my machine: `pnpm test` → **110 files / 812 tests passed, 252.85 s, exit 0**.
VR-3 holds (`audit_rows=1144 forbidden_matches=0 chain_valid=true`). S3b's 100-request durable
burst: `concurrent=100 successes=100 committed_at_response=100`. S3b F3: `before_commit_calls=0
persisted_accounts=0`. S3b equal-work oracle: AUC 68.8 / 63.7 / 65.1 % for N=1/4/8, under the
80 % ceiling.

---

## PRIMARY QUESTION 1 — does the new refusal shape leak address existence?

**The refusal does not. The queue does. Answer: yes, it leaks, perfectly.**

### 1.1 The refusal itself is clean (Codex is right about this part)

`reserveMailDispatch` is called *before* the arm is known — `registration.ts:696` (register, before
`provisionPendingAccount`) and `registration.ts:794` (resend, before `prepareVerificationResend`) —
so the 503 is arm-blind by construction.

Measured at full saturation (32 active + 96 queued), n = 30/arm, existing vs non-existent address:

| | status | refusal rate | median | cross-arm AUC | **same-arm null AUC** |
|---|---|---|---|---|---|
| existing | `AUTH_MAIL_BUSY`/503 | 30/30 | 0.26 ms | 0.6433 | 0.6356 |
| missing | `AUTH_MAIL_BUSY`/503 | 30/30 | 0.25 ms | (best acc 0.6500) | (best acc 0.6667) |

Cross-arm separation is inside the same-arm null band. Status code, error code and refusal rate are
identical. `AUTH_MAIL_BUSY` surfaces as HTTP 503 `{error:"AUTH_MAIL_BUSY"}` (`apps/api/src/index.ts:184-189`)
and the operator line carries only a correlation UUID (`registration.ts:483`).

### 1.2 …but the *release* of a slot is arm-dependent, and that is the channel — **BLOCKER 1**

The reservation is taken arm-blind and **released arm-dependently**:

* `register`, existing address → `provisionPendingAccount` returns `kind:"duplicate"`
  (`registration.ts:599-606`) → the dispatch is `recordDuplicateRegistrationPostwork`, a short audit
  transaction (`registration.ts:536-540`). **No MTA work.**
* `register`, new address → `deliverVerification` → a full mail send (`registration.ts:626-631`).
* `resend`, non-existent (or non-pending) address → `prepared.status !== "send"` → `pendingDelivery`
  stays `undefined` → `releaseMailDispatch?.()` fires immediately (`registration.ts:820-825`).
  **Zero dispatcher occupancy.**

Measured slot occupancy per arm, production policy:

| route | transport | existing | new/absent | **AUC** |
|---|---|---|---|---|
| register | 400 ms | **58.5 ms** median (59,59,59,60,58,57) | **459.4 ms** (460,459,460,458,457,460) | **1.0000** |
| resend | 1500 ms | **1582 ms** median (1572…1586) | **0 ms** (0,0,0,0,0,0,0,0) | **1.0000** |

Because `activateMailDispatch`'s release hands the freed slot straight to the head of the wait queue
(`registration.ts:468-474`), *the next caller's admission time is a function of the previous
caller's arm*. That makes it observable from outside.

### 1.3 The outsider-only measurement — nothing but the attacker's own response latency

Black box. The attacker occupies the 32 active slots, lets exactly one recycle, sends **one probe**
for the target address, then **one marker** request, and times only the marker. Production policy,
**real 500+100 ms clamp active**, n = 6/arm:

| probe arm | marker latencies (ms) | median |
|---|---|---|
| target **exists** | 601, 602, 602, 602, 601, 602 | **602** |
| target **does not exist** | 2137, 2022, 2204, 1976, 1949, 1964 | **1999** |

**cross-arm AUC = 1.0000, best single-threshold accuracy = 1.0000, median separation 1397 ms**,
against a **same-arm null AUC of 0.7778** (that null is pure tie-noise between 601 and 602 ms).
Mail sends per round were **33 for the existing arm and 34 for the missing arm** — the arms
demonstrably do unequal MTA work, which is precisely what S3b's equal-work property forbids.

Same experiment on `resend` (real 500 ms floor): existing-pending 1703 ms median vs non-existent
501 ms, **AUC 0.9375**, separation 1202 ms. (One round is a setup artefact of my own cooldown
reset; rounds 2-7 separate perfectly: 1706/1701/1916 vs 501/501/501.)

`holdRegistrationEnumerationClamp` cannot mask this: it is anchored at request start
(`registration.ts:405-410`), so once the queue wait alone exceeds 600 ms it contributes nothing.
The clamp was sized for a *work* difference of tens of ms; this is a *scheduling* difference of
seconds, and at the ruled sendmail timeout of 5000 ms (`auth-policy.ts:356`) the separation is
larger still, not smaller.

This is the same failure mode the packet warned about, in a new place: the property holds only
while the dispatcher is below capacity, and the attacker controls that condition.

### 1.4 Saturation is reachable more cheaply for one arm — **BLOCKER 2**

The packet's own rule: *"If saturation is reachable more cheaply for one arm than the other, that is
a BLOCK."* Measured, it is not merely cheaper — on `resend` the non-existent arm consumes **0 ms**
of dispatcher time and **cannot saturate the dispatcher at all**, while the existing-pending arm
consumes a full send. On `register` the ratio is 459.4 / 58.5 = **7.9×**.

Cost of holding all 128 slots (register admission is 20/source/15 min, `auth-policy.ts:338`;
ruled transport timeout 5000 ms):

* one-shot fill of 128 slots: `ceil(128/20)` = **7 source IPs**;
* worst-case recycle 5 s → 6.4 admissions/s to keep the active set full → 5,760 requests per 15-min
  window → **288 distinct source IPs to hold the service saturated indefinitely**.

(These two are arithmetic from the ruled inputs — admission 20/source/15 min and the 5 s transport
timeout — not a live flood; I measured the 128-slot fill itself repeatedly, which is what the
arithmetic rests on.)

And the wait has **no dispatcher-side deadline**. Measured: with a hung transport, a queued register
request was still queued after **15 s** (`occupancy={"inFlight":32,"activeSends":32,"queued":1}`)
and never returned. In production it is bounded only transitively by sendmail's own 5 s timeout;
the `recordVerificationDelivery` transaction that follows it has no timeout at all, so a stalled
database holds slots without limit. While saturated, every registration and resend on that process
is either delayed by the full queue or refused 503 — a cheap availability attack, and 96 clients
are held open.

### 1.5 What proof lifts BLOCKERS 1 and 2

Make dispatcher occupancy arm-independent — e.g. hold the reservation for an arm-independent
minimum, run the duplicate/ignored arm through an occupancy-equivalent path, or decouple queue
admission from release so one caller's arm cannot time another caller's admission. Then re-measure
with S3b's statistic, **n ≥ 30 per arm, dispatcher pinned at capacity, slow transport, real clamp**,
and show cross-arm AUC inside a same-arm null band — on **both** `register` and `resend`, and on
**slot-hold time** as well as response latency. A range check on two samples will not do.

---

## PRIMARY QUESTION 2 — is "many live tokens" safe, and is the trade honestly stated?

**Substantially yes. This is the strong part of the ticket.** No blocker here.

### 2.1 The arithmetic and the bound — confirmed

`token_ttl_ms = 24 h`, `resend_cooldown_ms = 20 min` (`auth-policy.ts:223-224`) →
`1 + 1440/20 = 73` = `maximum_live_hashes_per_account` (`auth-policy.ts:234`, schema literal at
`auth-policy.ts:44`). Pruning is delete-expired-then-insert inside the minting transaction
(`identity.ts:455-463`); the cooldown write is in that same transaction (`identity.ts:464-470`),
under `FOR UPDATE OF c,u` (`identity.ts:447`).

Measured, exact 20-minute spacing (the strict `<` cooldown boundary, i.e. the worst case), 120
resends: **MAX live hashes = 73, MAX total rows = 73.** The bound is exactly attained and never
exceeded. Codex's 72 comes from testing at cooldown+1 ms — correct but one short of the real edge;
I hit 73.

Edges checked:
* **Expiry boundary.** Prune uses `expires_at < occurredAt` (strict, `identity.ts:457`), consume
  uses `expires_at >= occurredAt` (`identity.ts:397`). Consistent, so a token expiring exactly now
  is still valid and still counted — measured `ACCEPTED_AT_EXPIRY_INSTANT`. This is what makes the
  bound exactly 73 rather than 72 or 74.
* **Concurrency.** 3 rounds × 12 simultaneous resends at the cooldown edge minted exactly **3**
  mails (4 credentials including registration). `FOR UPDATE` serialises correctly.
* **Clock skew** moves `cooling` in the safe direction (a backwards step refuses).
* `recordVerificationDelivery` only ever moves `verification_last_sent_at` later
  (`identity.ts:301-305`), widening spacing.

I could not drive the live set above 73 by any sequence.

### 2.2 Is a consumed token invalidated, and are its siblings? — **yes, both**

`consumeVerification` marks the **whole family** consumed, not just the presented token:
`UPDATE identity.verification_token_credential SET consumed_at=$2 WHERE channel_binding_id=$1 AND
consumed_at IS NULL` (`identity.ts:401-404`), plus `user.state='active'` (`identity.ts:411`), and
validity requires `user_state === 'pending_verification'` (`identity.ts:398`).

Measured: owner registers, attacker triggers the full allowance, 4 live tokens; owner consumes
token #1 → `{"status":"active"}`; tokens #2/#3/#4 → `VERIFICATION_TOKEN_INVALID`, and `consumed_at`
is set on **4/4** rows. So "73 live tokens" never means 73 usable logins — the first successful
verification kills the family. **This is the fact that makes the design acceptable, and it is the
one thing the ticket does not test** (see F-b).

### 2.3 VR-3 erasure and account deletion — clean

`migrations/0033:7-8` — `channel_binding_id … REFERENCES identity.channel_binding ON DELETE CASCADE`,
and `channel_binding.user_id → user ON DELETE CASCADE` (`migrations/0030:49`). Measured: account
with 4 credentials deleted → **0 rows referencing the deleted user, 0 orphan rows table-wide**.
The table stores only `sha256:` hashes; the "no plaintext in any identity row" test now includes it
(`registration-database.test.ts:1857`). The identity table inventory was updated
(`identity-database.test.ts:54`).

### 2.4 The leaked-token trade — adequately stated, but it is a product decision

The ruled row states it explicitly and the schema forces it to be stated
(`auth-policy.ts:236`, regex-gated at `auth-policy.ts:46`):
`"A token believed leaked cannot be selectively revoked by an unauthenticated resend; every mailed
link instead expires at its own ruled 24-hour deadline or is consumed when the account activates.
Selective revocation requires a separately authenticated recovery action."`

On the merits: rotation never provided real revocation either — it was revocation-by-anyone, which
is exactly D2's blocker, and it could be re-triggered by the attacker. Replacing it with
"every link dies at its own 24 h deadline or when the account activates" is the better default, and
the residual exposure is bounded and small. My judgement is that Codex chose correctly.

But the packet asks whether this needs V rather than a coder. **It does, and Codex has in effect
already routed it there** by writing it into a ruled register row with provenance. What V should be
asked to confirm explicitly, because a coder cannot settle it: *for a pending, unverified account,
is a 24-hour window in which a leaked link stays live acceptable, given there is no authenticated
path to revoke it?* The row asserts the answer; it has not been ruled on the merits. I would not
close S3d without that confirmation — but I am not blocking on it, because the shipped behaviour is
strictly better than what it replaced.

### 2.5 Token entropy — unchanged materially

Tokens remain 32 random bytes rendered as 43 base64url chars (`crypto/src/index.ts:431-435`,
gate `/^[A-Za-z0-9_-]{43}$/` at `registration.ts:736`), hashed `sha256:<64 hex>`. Holding 73 live
hashes for one account multiplies a targeted guesser's per-attempt success by **73 ≈ 2^6.19**:
2^-256 → 73·2^-256 ≈ 8.4×10^-77. That is 6.19 bits out of 256, and the verify route is still
capped at 10 admissions/source/15 min. **Immaterial** — the settled entropy conclusion stands.

---

## Also-attack results

### A1 — the self-caught cross-ticket regression is genuinely repaired

I re-ran both myself. S3b 100-request durable burst: **100/100 committed at response**. S3b F3:
`before_commit_calls=0 persisted_accounts=0` — still pre-DEK-write. The equal-work oracle test
passes with AUC 68.8/63.7/65.1 % under its 80 % ceiling.

**On the widened repository boundary.** The widening is the CHECK on the new table:
`token_hash text PRIMARY KEY CHECK (token_hash ~ '^(sha256:)?[0-9a-f]{64}$')`
(`migrations/0033:6`). It exists because S3b's F3 fixture writes a *raw* hex hash
(`registration-database.test.ts:1733`: `createHash("sha256").update(…).digest("hex")`), and the new
credential INSERT (`identity.ts:221-230`) sits *before* the `appendAudit` call that F3 is meant to
trip (`identity.ts:236`).

Mutation-tested: tightening the CHECK to `'^sha256:[0-9a-f]{64}$'` makes F3 go **RED**. So the
widening is load-bearing for that test. My assessment:

* It does **not** weaken the audit rejection. `assertOpaqueToken` (`identity.ts:52-56`) is untouched,
  runs before `beforeCommit()` (`identity.ts:246`), and the whole thing is one transaction. With the
  tightened CHECK, F3 still rejects before the DEK write — just with a constraint error instead of
  `AUDIT_TOKEN_MUST_BE_RANDOM_UUID_V4`. The widening therefore *preserves* F3's intended reason
  rather than hiding a failure, which is the opposite of the pattern the packet fears.
* Production never writes raw hex — `hashVerificationToken` always prefixes
  (`crypto/src/index.ts:435`), and the existing assertion at `registration-database.test.ts:2222-2233`
  pins that. A raw-hex row could never be matched by `consumeVerification`, which looks up the
  prefixed form.
* It is still the wrong direction: the fixture should carry the production format and the CHECK
  should be `'^sha256:[0-9a-f]{64}$'`. Recorded as F-d, not a blocker. (There is a defensible
  migration argument for the widening — `channel_binding.verification_token_hash` has no format
  CHECK at `migrations/0031:23`, so the backfill at `migrations/0033:19-28` could carry legacy raw
  values — but that argument is not the one made in the progress log.)

### A2 — the null-derived RSS ceiling — **BLOCKER 5 (evidence)**

`registration-database.test.ts:858-861` computes
`nullDerivedRssCeilingMib = nullWaveGrowthMib * 3 + 64/1024` from an 8-refusal wave, then asserts a
**24**-refusal wave stays under it (`:892`). 24 = 3 × 8. **The assertion is calibrated to permit
exactly linear growth**, so a perfectly linear, unbounded leak passes it. It does not test a plateau,
which is what D1 requirement 3 asks for.

It is also unstable: in my full-suite run `null_wave_growth_mib=0.0 → ceiling=0.063,
sustained=0.0`; in my isolated run `null=0.375 → ceiling=1.188` (Codex's exact published number),
and the measurement quantum is a 64 KiB page against a ~480 MiB RSS.

Pushed past what Codex tested — occupancy pinned at 32 active + 96 queued (`{"inFlight":32,
"activeSends":32,"queued":96}` throughout), **2000** further refusals instead of 24, all
`AUTH_MAIL_BUSY`, with a forced `global.gc()` settle between waves:

```
wave 0 (250 refusals) rss=172.1   wave 4 (1250) rss=194.1
wave 1 (500)          rss=178.3   wave 5 (1500) rss=198.7
wave 2 (750)          rss=184.1   wave 6 (1750) rss=202.5
wave 3 (1000)         rss=189.4   wave 7 (2000) rss=206.1  MiB
```

Monotone climb, **+42.14 MiB post-GC over 2000 refusals = 21.6 KiB/refusal**, against a
null-derived ceiling of 0.859 MiB in that run — **49× over**. A second, independent run gave
+48.83 MiB / 25.0 KiB per refusal. There is **no plateau at ~60× the tested load**.

I am careful here: RSS after GC cannot by itself separate retained live objects from pages V8 has
not returned to the OS, so I do not assert a live-object leak. What I do assert is that the shipped
assertion demonstrates neither boundedness nor a plateau, and that the plateau D1 requirement 3 asks
for does not appear when the occupancy is actually pushed. The honest instrument is post-GC
`heapUsed` at a stated occupancy, with a null that is not a linear rescale of the effect wave.

### A3 — D3's "already fixed" is correct, and I can name the change

Verified independently and by mutation:

* As shipped: register → immediate resend emits **1** mail total and the first link verifies
  (`FIRST_LINK_STILL_ACTIVE`).
* The fix is **S3c's**, not S3d's: `createPendingAccount` writes `verification_last_sent_at` at
  creation (`identity.ts:212`, the `$3` in the channel_binding INSERT), so an immediate resend is
  `cooling` and never rotates. Clearing that value in the creation transaction makes the immediate
  resend emit **2** mails — mutation goes RED against the D3 test.
* S3d now adds a **second, independent** protection: with the creation cooldown cleared and a real
  rotation happening, the first link is *still* `FIRST_LINK_STILL_ACTIVE`, because the D2 credential
  ledger keeps it. D3 is doubly protected.

### A4 — D4 under my own injection (no mock) — holds

I injected the delivery-record failure **in PostgreSQL**, with a `BEFORE UPDATE` trigger on
`identity.channel_binding` that raises on the delivery-record write, rather than stubbing the
repository method. Result:

* `verification_last_sent_at` remains armed from the minting transaction — the cooldown is **not**
  disabled;
* a resend inside the cooldown emitted **0** mails; after the cooldown, exactly **1**;
* **1** durable audit row, `justification = correlation:<uuid v4>;code:MAIL_RECORD_FAILED`
  (`identity.ts:331-340`);
* audit row contains the e-mail: **false**; raw IP: **false**; raw UA: **false** — only
  `ipArgon2id`/`userAgentArgon2id` (`identity.ts:103-106`).

Trigger dropped afterwards; test database is disposable.

### A5 — VR-10 mutants re-derived from scratch (14 mutants, all restored byte-identical)

| # | mutant | file | guard | result |
|---|---|---|---|---|
| S1 | recipient-shape validation removed | `mail-channel.ts:49` | unit "rejects malformed and CRLF recipients" | RED |
| S2 | **CRLF rejection removed** | `mail-channel.ts:50` | same | **GREEN — survives** |
| S3 | `--` argument terminator removed | `mail-channel.ts:71` | unit "terminates sendmail options before the recipient" | RED |
| S4 | transport timeout disabled | `mail-channel.ts:75-78` | unit "terminates a hung local mail process" | RED |
| R1 | ruled `maximum_concurrent` 32→31 | `auth-policy.ts:359` | unit :355 | RED |
| R2 | ruled `queue_capacity` 96→97 | `auth-policy.ts:360` | unit :355 | RED |
| R3 | ruled `maximum_live_hashes` 73→72 | `auth-policy.ts:234` | unit :311 | RED |
| C1 | active dispatch cap removed | `registration.ts:478` | integration D1 | RED |
| C2 | queue cap removed (unbounded waiters) | `registration.ts:481` | integration D1 | RED |
| C3 | consume restricted to newest token | `identity.ts:391` | integration D2 | RED |
| C4 | **sibling invalidation removed** | `identity.ts:401-404` | integration D2 | **GREEN — survives** |
| C5 | expiry pruning disabled | `identity.ts:457` | integration D2 lifetime | RED |
| C6 | credential CHECK tightened to prefixed-only | `migrations/0033:6` | integration S3b F3 | RED |
| C7 | creation-transaction cooldown cleared | `identity.ts:212` | integration D3 | RED |

**Tree-integrity note.** Midway through this mutation sweep I detected that a *concurrent process
in the same working tree* (another lens, presumably) had `packages/db/src/identity.ts` mutated —
`recordVerificationDeliveryRecordFailure` was logging `eventType:"identity.verification.sent"`
instead of `"identity.verification.delivery_record_failed"` — and restored it at 08:52:26. I caught
this because my harness's backup hash (`d385755a…`) disagreed with the hash I recorded before any of
my work (`c57266d3…`). None of my fourteen guards reads that event type, so no verdict is affected;
I nonetheless re-ran the two identity.ts mutants that carry findings (**C4** and **C7**) against a
hash-verified-gold baseline, with a gold-check before each run: **C4 GREEN (survives), C7 RED**,
both restored to gold. **Final tree state is byte-identical to Codex's**: all eight changed files
match the hashes I took before touching anything, and `pnpm typecheck` and `pnpm lint` are clean.
Anyone reading Codex's or a sibling's mutation evidence should be aware the tree was shared.

Twelve of fourteen are load-bearing. Two survive:

* **S2** — the explicit CRLF clause is dead code: the preceding `/^[^\s@]+@[^\s@]+$/` already
  rejects `\r` and `\n` via `\s`. The hardening is intact; the *claim* that CRLF validation is
  load-bearing is not supported by any test. Codex's mutant disabled both clauses at once, which
  hides this. Evidence-integrity finding, not a hole.
* **C4** — no test asserts that consuming one token kills its siblings. It survives because
  `user_state === 'pending_verification'` (`identity.ts:398`) independently blocks siblings after
  activation, so the property is doubly held; I measured it directly in §2.2. Coverage gap on the
  ticket's most safety-critical line.

### A6 — object graph under load — **BLOCKER 3 (evidence)**

Codex's metric (`registration-database.test.ts:843-850`) serialises the graph as
`JSON.stringify({occupancy, pendingPromiseObjects:[...pending], waitingResolverObjects: waiting})`
and counts active tokens found in it. Measured at saturation, the string is **719 bytes** and reads:

```
{"occupancy":{...},"pendingPromiseObjects":[{},{},…×32],"waitingResolverObjects":[null,null,…×96]}
```

`JSON.stringify` renders a Promise as `{}` and a function in an array as `null`. **The metric cannot
contain a token, so `expect(rawTokensOutsideActiveSend).toBe(0)` cannot fail for its believed
reason.** Control: planting a token into the same serialisation shape *is* detected (`true`), so the
detector works only for plain strings, which the graph never holds. This is exactly the class of
defect the packet says to assume is present.

I re-proved the property properly with a **V8 heap snapshot** (31.3 MB) taken at 32 active + 96
queued after a forced GC: **32/32 active-send raw tokens present, and no others** — the queued
waiters are genuinely pre-mint and hold no credential. **The property is true; the shipped proof is
vacuous and must be replaced.**

### A7 — the ruled `retained_payload` row is false as measured — **BLOCKER 4**

`auth-policy.ts:362` rules `retained_payload: "ACTIVE_SEND_CREDENTIALS_WAIT_QUEUE_RESOLVERS_ONLY"`,
and `tests/unit/registration.test.ts:355` asserts that string. From the same heap snapshot, at
32 active + 96 queued:

* queued (pre-mint) **plaintext e-mail addresses resident: 96/96**
* queued **raw source IPs resident: 96/96**

The wait-queue array does hold only resolver functions — but the 96 suspended `register()`
invocations that the queue exists to hold retain `input.email` and `rawSource.ip` in their async
frames for the entire wait, which §1.4 shows has no dispatcher-side deadline. (`input.password` is
in the same frame — suspension at `registration.ts:696` is *before* `hashPassword` at `:697` — but
my harness reused one password literal, so the heap count for it is 1 and I do not claim 96.) D1
requirement 2 is explicit that plaintext e-mail and raw IP must not sit in a process-local structure
longer than the dispatch needs them; queueing newly extends that residency from "one request" to
"one request plus the whole queue drain". The row as written tells an operator something measurably
untrue. Fix the row or fix the residency — but it cannot ship as ruled.

---

## Findings

### Blocking

1. **The bounded dispatcher is a perfect address-existence oracle under saturation.**
   Arm-dependent slot release (`registration.ts:536-540` vs `:626-631`; `registration.ts:820-825`)
   couples the next caller's admission to the previous caller's arm (`registration.ts:468-474`).
   Measured, production policy, real clamp: register marker latency **602 ms (exists) vs 1999 ms
   (does not)**, **AUC 1.0000**, best-threshold accuracy **1.0000**, same-arm null AUC 0.7778,
   separation 1397 ms; resend AUC 0.9375, separation 1202 ms; slot-hold AUC **1.0000** on both
   routes. S3b's dual-greenlit equal-work property is regressed.
2. **Saturation is reachable only via one arm and is cheap.** Resend's non-existent arm consumes
   **0 ms** of dispatcher time and cannot saturate; register's ratio is **7.9×**. 7 source IPs fill
   128 slots; ~288 hold them indefinitely. A queued request has no dispatcher deadline — measured
   still queued after 15 s under a hung transport.
3. **D1's headline proof cannot fail.** `registration-database.test.ts:843-850` searches a 719-byte
   string that contains only `{}` and `null`. Property re-proved true by heap snapshot; proof must
   be replaced.
4. **The ruled `retained_payload` row is false as measured** (`auth-policy.ts:362`, asserted at
   `tests/unit/registration.test.ts:355`): 96/96 queued plaintext e-mails and 96/96 raw source IPs
   are resident at saturation.
5. **The RSS ceiling tests linear growth, not a plateau** (`registration-database.test.ts:858-861,892`):
   `ceiling = 3 × null(8)` asserted against a wave of exactly 3×8, so linear unbounded growth passes.
   Pushed to 2000 refusals at pinned occupancy, RSS climbed monotonically 172.1 → 206.1 MiB —
   **+42.14 MiB post-GC, 21.6 KiB/refusal, 49× the run's own ceiling**; no plateau at ~60× the
   tested load.

### Non-blocking

* **F-a** — VR-10 mutant S2: the CRLF clause (`mail-channel.ts:50`) is dead code shadowed by the
  recipient-shape regex; its guard cannot fail for that reason. Hardening intact; claim overstated.
* **F-b** — no test asserts sibling invalidation on consume (`identity.ts:401-404`), the property
  that makes 73 live tokens acceptable. Verified correct by measurement; add the assertion.
* **F-c** — `73` is a literal (`auth-policy.ts:44,234`) with no coupling check to
  `1 + token_ttl_ms/resend_cooldown_ms`. `authPolicyFromRegisterRows` validates the outbound-ceiling
  relation (`auth-policy.ts:443-450`) but not this one; a cooldown change would silently falsify
  the ruled bound.
* **F-d** — the credential CHECK was widened to `'^(sha256:)?[0-9a-f]{64}$'` (`migrations/0033:6`)
  to accommodate a test fixture (`registration-database.test.ts:1733`). It does not weaken the audit
  rejection (mutation-confirmed), but the fixture should use the production format instead.
* **F-e** — consumed credential rows are never deleted: pruning only runs inside a permitted resend
  (`identity.ts:455-458`), and after activation resends are refused, so hashes persist for the life
  of the account. Harmless (hashes only, cascade-deleted), but unbounded in row count.
* **F-f** — `registration-database.test.ts:890-891` compares **one** sample per arm with
  `Math.abs(Δ) < 100 ms`, in a test where `sleep` is stubbed and both arms refuse before any
  arm-dependent work runs. It cannot detect the oracle it appears to be testing.

### Confirmed correct (attacked, held)

D2 bound 73 exactly attained and never exceeded over 120 exact-spaced resends; concurrent resends at
the cooldown edge minted exactly 3; sibling invalidation on consume; erasure/deletion cascade with
0 orphans; D3 fixed by S3c's creation-transaction cooldown and now doubly protected; D4 under a real
PostgreSQL trigger injection; sendmail recipient/`--`/timeout hardening load-bearing; frozen scope
clean; T9 untouched; gates 110 files / 812 tests reproduce.

---

## What lifts the BLOCK

1. Make dispatcher occupancy **arm-independent**, then prove it with S3b's statistic — n ≥ 30/arm,
   dispatcher pinned at capacity, slow transport, real clamp — showing **cross-arm AUC inside a
   same-arm null band** for (a) `register` response latency, (b) `resend` response latency, and
   (c) slot-hold time, on both routes. Include the same-arm null in the evidence.
2. Show the cost of driving saturation is equal for both arms, or that saturation cannot be reached
   at all by an unauthenticated caller.
3. Replace the `rawTokensOutsideActiveSend` proof with one that can fail — a heap snapshot or a real
   reference walk — and include a positive control that detects a deliberately retained token.
4. Correct `retained_payload` to match measurement, or stop retaining plaintext e-mail and raw IP
   across the queue wait; and give the wait a deadline that does not depend on the transport.
5. Re-derive the RSS ceiling from a null that is not a linear extrapolation of the effect wave, and
   demonstrate the plateau at an occupancy well past 24 refusals (I used 2000).

D2, D3 and D4 need no further proof from me — they held under everything I could throw at them.

---

## Measurement provenance

All numbers above are mine, produced on this machine against **real embedded PostgreSQL 18.4**
(`tests/support/testDatabase.ts`), Node v22.23.1 darwin-arm64, at the shipped production policy
(`AUTH_POLICY_REGISTER_ROWS`), with the enumeration clamp **enabled** wherever a latency claim is
made, and with the mail transport being the only thing I varied. Harnesses were standalone scripts
under the repo root, deleted afterwards; the repo tree is byte-identical to the state Codex left
(verified by sha256 against a pre-work sweep), `pnpm typecheck` and `pnpm lint` clean, nothing
committed, nothing pushed.

Separation statistics use S3b's own estimators — best-single-threshold classifier accuracy and
AUC — and every cross-arm figure is reported against a **same-arm null** computed by splitting one
arm's samples, exactly as S3b established.
