# S3d REWORK 1 — Opus lens verdict: **BLOCK**

Ticket t_cc197ed2, board `accounts-phase1`. Author Codex, session 01a019e7. HEAD `b2324d6`.
Blind lens: no sibling verdict read. Read-only on product source. No commit, no push.

**Headline.** Four of my five round-1 blockers are genuinely fixed, and two of them I verified by
re-deriving the proof myself. The first one is not. The 5.1 s handoff lease closes the
address-existence oracle only while the arm's work stays *under* the lease. At the **ruled 5 s
sendmail transport timeout** — the exact condition D1 exists to handle — the send arm's reservation
runs 5 270 ms because the lease budgets 100 ms for post-transport work that actually costs ~270 ms,
and the channel returns at **AUC 1.0000 / best-single-threshold accuracy 1.0000 on both routes**,
with zero overlap. Separately, **Codex's own headline B1 test fails on a clean re-run of the gates**,
and the "92/92 sends in both arms" equal-work claim is manufactured by compensating registrations
issued outside the measurement window.

---

## 0. Concurrency protocol — gold baseline

Recorded **before any work**, 2026-08-20 10:49:41, and re-verified after every mutation:

| sha256 | file |
|---|---|
| `8a757722fd6fb9f35fddc95ef2b1643177933b888f327d8f922d64d7a13c8d31` | `apps/api/src/registration.ts` |
| `2a0fe03910bdbb4629138722b136164d5f1a156181bd0d7b90e460e8dc0131c8` | `apps/api/src/mail-channel.ts` |
| `c57266d3bb8314ca63d5635db88057ec0d5aa20dc319546c49735725572e9c5b` | `packages/db/src/identity.ts` |
| `ddf2cc21314512930928c3913db531ffc80f477143a1a056c9a6eee81f15a2d2` | `packages/register/src/auth-policy.ts` |
| `34fadf7cd618c165d82d71536001628f7dff9165648c10c03f51beb6c4d94e2f` | `migrations/0033_verification_token_credentials.sql` |
| `b54245402417473c7a34a0acafd9ac1625fdfcd92f8cf3145ee58a00829f1253` | `tests/unit/registration.test.ts` |
| `b7f36e7e9268f3e3dcbc11949f941c0f903f08c7e7e99e3f6f87aae67a8b29a9` | `tests/integration/registration-database.test.ts` |
| `05ebf0c907ceb6efe532c7eef367dcc731d4ee33138c53e495153a44590e9432` | `tests/integration/identity-database.test.ts` |

**Cross-check against Codex's recorded gold** (`logs/S3d-progress.log`, 09:40): its baseline was the
*pre-rework* state — registration `478f4e5c`, mail-channel `7e35e6f`, identity `c57266d3`,
auth-policy `3b576d34`, migration `34fadf7c`. Mine is the *post-rework* state. The two agree exactly
where they must: **`identity.ts` c57266d3 and `migration 0033` 34fadf7c are unchanged**, which is
the frozen-D2/D3/D4 guarantee, and the three D1 files moved as claimed.

**Mutations** were applied one at a time, gold re-verified before each run and after each restore.
**No divergence I did not cause was observed on any of the eight gold files at any point.** Final
state: **byte-identical to gold on all eight**, `pnpm typecheck` clean.

**One concurrency artefact I did observe, outside my gold set:** the other lens created
`tests/integration/s3d-r1-grok-lens.test.ts` (35 047 bytes, mtime 11:20) in the shared tree. It
**fails to collect**, which is why my clean gate run reports 111 files / 2 failed files. I did not
read it (blind-lens rule) and I exclude it from every number below. Codex's own file count of 110
is the correct one for its change set.

## 0b. Change set by mtime (`git diff` is blind — `migrations/0033` is untracked)

`identity.ts` 10:33:25, `auth-policy.ts` 10:33:41, `tests/unit/registration.test.ts` 10:35:26,
`mail-channel.ts` 10:36:14, `registration.ts` and `tests/integration/registration-database.test.ts`
10:37:04. `identity.ts` was touched but its content is byte-identical to the pre-rework gold —
mutated and restored. `mail-channel.ts` changed by exactly the two-line CRLF comment
(`mail-channel.ts:49-50`). **T9 untouched** — no deadlock/retry handling anywhere; not re-reported.
Frozen S3a/S3b/S3c/T4/crypto/identity-schema: nothing moved.

---

## PRIMARY QUESTION 1 — is the oracle closed under MY harness?

**No. It is closed in the latency band Codex tested and open at the ruled transport timeout.**

### 1.1 The mechanism, and why 5.1 s is the wrong number

`activateMailDispatch` (`registration.ts:473-497`) pads a handed-off reservation to
`mailDispatchMinimumReservationMs` measured from activation. The ruled value is **5 100 ms**
(`auth-policy.ts:369`) and the derivation says so explicitly (`auth-policy.ts:378`):

> "the ruled 5-second sendmail timeout plus 100 ms tolerance makes every address arm hold one of 32
> handed-off reservations for at least 5.1 seconds"

"At least" is the flaw. The reservation is released in the `.finally` of `dispatchVerification`
(`registration.ts:571-598`), *after* `deliverVerification` has finished — and `deliverVerification`
awaits the transport **and then** `recordVerificationDelivery` (`registration.ts:636-659`), a
transaction that takes a `FOR UPDATE` lock, updates the binding, and appends an audit event behind
the global `pg_advisory_xact_lock('identity:audit-chain')` with two Argon2id hashes
(`identity.ts:103-107`). At 32-way saturation I measure that post-transport tail at **≈270 ms**.
The lease budgets **100 ms**. So whenever the transport runs within ~270 ms of its own ruled
timeout, the sending arm exceeds the lease and the duplicate/ignored arm does not.

### 1.2 Measured — my harness, production policy, real clamp

Method: 32 reservations held; their leases allowed to expire; then a **just-in-time chain** of
probes with exactly one queued caller at a time, so nothing hits the 18 s deadline. The observable is
**the interval between consecutive grants**, i.e. *the next caller's admission time as a function of
the previous caller's arm* — the precise mechanism from round 1. Same-arm null by splitting the
existing arm.

| route | transport | existing (ms) | missing (ms) | **cross AUC** | **cross acc** | same-arm null AUC / acc | overlap |
|---|---|---|---|---|---|---|---|
| register | 1 500 | 5 102.7 | 5 097.7 | 0.7857 | 0.8000 | 0.5625 / 0.7500 | full (Δ = −5 ms) |
| register | 4 900 | 5 125.5 | 5 170.0 | 0.9375 | 0.9677 | 0.7344 / 0.7500 | one sample |
| **register** | **5 000** | **5 126.1** | **5 270.5** | **1.0000** | **1.0000** | 0.6389 / 0.6667 | **none** |
| **resend** | **5 000** | **5 210.2** | **5 051.8** | **1.0000** | **1.0000** | 0.8056 / 0.8333 | **none** |

At 5 000 ms the register arms are cleanly disjoint — existing max **5 131**, missing min **5 263**,
a 132 ms gap with n = 12/11. Resend is disjoint in the opposite direction (existing min 5 151,
missing max 5 101), which is exactly right: on resend it is the *existing* address that sends.

Raw register@5000 samples —
existing `5131,5126,5122,5125,5125,5128,5129,5131,5131,5114,5126,5117`;
missing `5271,5270,5268,5268,5263,5271,5266,5268,5273,5273,5289`.

**The 1 500 ms row is the important control**: in Codex's tested regime the channel really is
closed (separation −5 ms, direction reversed, AUC inside noise). The fix works — it is just
calibrated to a transport that is 3.4 s faster than the one the system rules for.

### 1.3 Why Codex's RED was weaker than mine (the sensitivity gap)

Codex's reproduction measured **marker response latency** through the full request path — 600 ms
clamp, Argon2id password hash, provisioning, DB — in batches of 10 concurrent markers
(`registration-database.test.ts:1116-1135`). Every one of those adds variance that is common to both
arms, so the arm signal is diluted: its RED medians are ~7 500 ms with the effect buried inside.
I measure the **grant-to-grant interval** instead, which strips out everything except the quantity
that actually differs. That is why the same defect reads 0.87 on its instrument and 1.00 on mine —
and it is why 0.5367 on its instrument is not evidence that the channel is shut.

### 1.4 Sends are still unequal, and the "92/92" claim is manufactured

`registration-database.test.ts:1201` asserts `existing.sends === missing.sends`, where `sends` is
the whole-round total (`:1162`). But the round for `register`/`existing` appends **30 extra
`control-new-` registrations after the timed batches** (`:1143-1152`), and the round for
`resend`/`missing` appends **30 compensating resends** (`:1153-1160`). Those 30 sends are exactly
the number the existing arm did not perform inside the window. The totals match; the work does not.

My own chain, counting only probe sends: register existing **0** vs missing **15**; resend existing
**12** vs missing **0**. Equal work is not what makes the arms indistinguishable here — the lease is.
That is a legitimate design choice, but the claim as written is not supported by the assertion
offered for it.

### 1.5 What lifts this

Cover the whole ruled envelope, not a sampled point inside it: schedule the handoff from a **fixed
absolute deadline** measured at activation that no arm can exceed (transport timeout **plus** the
post-transport delivery-record write **plus** tolerance), or move the delivery-record write outside
the reservation. Then prove it at transport ∈ {0, 1 500, 4 900, 5 000} **and** on the
timeout-then-failure path, n ≥ 30/arm, both routes, AUC **and** best-threshold accuracy against a
same-arm null, reporting the overlap. Also either replace the compensating control batches with an
in-window equal-work measurement or drop the equal-sends claim.

---

## PRIMARY QUESTION 2 — what does the 5.1 s lease cost, and does the 18 s expiry leak?

### 2.1 Cost: severe, and it lands on legitimate users with a perfectly healthy MTA

No attacker, no slow MTA — a **5 ms** transport, one concurrent burst:

| burst | succeeded | refused | p50 latency | max |
|---|---|---|---|---|
| 100 | **99** | 1 × `AUTH_MAIL_BUSY`/503 | **13 438 ms** | 23 652 ms |
| 128 | **99** | **29** × 503 | 13 399 ms | 23 581 ms |
| 160 | **99** | **61** × 503 | 13 389 ms | 23 581 ms |

Effective concurrent-burst capacity is **~99 requests**, regardless of offered load, and an accepted
user waits a median of **13.4 s**. Before the lease, a 5 ms transport served the same burst in well
under a second. The queue is no longer a buffer that absorbs bursts — it is a 5.1 s-per-slot
metering device, so once any queue forms, throughput collapses to 32/5.1 s ≈ 6.3/s and stays there.

This shows up in Codex's own frozen D1 test too: `accepted=96 timed_out=32 committed_after_drain=96`
where the pre-rework run reported `accepted=128 ... committed_after_drain=128`. The assertion was
correspondingly relaxed from "all 128 admitted callers get an account" to "accepted + timed-out =
128" (`registration-database.test.ts:968-971`). That relaxation is honest — a timed-out caller gets
the opaque 503 *before* any account is committed, so nothing is lost or silently dropped — but the
capacity change is real and unruled.

Most concerning: **frozen S3b's 100-request durability burst now passes with essentially no margin.**
It reports 100/100 in the suite, but my equivalent 100-burst on a 5 ms transport lost one
(99/100). A dual-greenlit frozen property is now one slot-time away from failing.

Is it a worse availability trade than what it replaced? For the *hung-MTA* case it is better: the
old design queued callers indefinitely with no deadline (I measured >15 s and still pending in round
1), and the new one bounds that at 18 s. For the *healthy-MTA* case it is clearly worse, because the
lease applies whenever a queue exists, whether or not the MTA is slow. Making the lease conditional
on observed transport latency would reintroduce the channel, so this is a genuine trade — and at
99 accepted / 13.4 s p50 it is a **product decision that needs V, not a coder's calibration**.

### 2.2 The 18 s expiry does **not** leak — measured, not reasoned

48 queued callers alternating existing / non-existent, all driven to the deadline:

* existing: n = 24, median **19 821.3 ms**, all `AUTH_MAIL_BUSY/503`
* missing: n = 24, median **19 821.4 ms**, all `AUTH_MAIL_BUSY/503`
* **cross-arm AUC 0.5208, best accuracy 0.5208, against a same-arm null of 0.5417 / 0.5417**

Cross-arm separation is *below* the same-arm null. Expiry order was strictly FIFO by enqueue index
(`0,1,2,…,23`). The timer is armed on the queue node before the arm is knowable
(`registration.ts:518-528`) and the arm is never consulted, which is why it is clean.

Codex's own deadline test (`registration-database.test.ts:1219`) is titled "arm-neutral" but queues a
**single** address and never compares arms — it proves boundedness only. The measurement above is
the missing half, and it passes.

### 2.3 FIFO and starvation-free — confirmed

A late arrival that appeared while three callers were already queued was served **after all three**
(completion order `0,2,1,999`). No barging is possible: the release path decrements the reservation
and shifts the queue head **synchronously**, with no await between them
(`registration.ts:487-493`), so a new arrival cannot observe the free slot.

### 2.4 Interaction with S3b's clamp and S3c's limiter

S3b's 100-burst: **100/100 committed at response**. S3b F3: pre-DEK-write. VR-3: `audit_rows=2347
forbidden_matches=0 chain_valid=true`. The S3b enumeration oracle tests pass on the clean run.
No reopening — but see 2.1 on the vanished margin.

---

## Also-attack results

### A1 — gates do **not** reproduce: Codex's own B1 test fails

Clean run, nothing else on the machine: **814 passed / 1 failed**, 458.43 s.

```
FAIL  S3d rework1 B1 makes saturation-boundary admission independent of the prior address arm
AssertionError: expected 0.8 to be less than or equal to 0.7333333333333333
[S3d REWORK1 B1 SATURATION BOUNDARY] register:n=30 existing_median_ms=7515.9 missing_median_ms=7533.5
  cross_auc=0.6044 same_arm_null_auc=0.5956 cross_accuracy=0.8000 same_arm_null_accuracy=0.6333
```

An earlier run of mine — with a probe of my own competing for CPU, so I do not count it against
Codex — passed the same assertion at `cross_accuracy=0.7500 ≤ 0.7667`. Either way the margin is
~0.02 and the outcome flips between runs. The ceiling is `same_arm_null + 0.10`
(`registration-database.test.ts:1195`, `:1206-1207`) with the 0.10 chosen, not derived. **A headline
security assertion that passes or fails depending on machine load is not evidence.**

I also saw `S3 rework4 B2 overlaps existing and missing N=1/N=4` fail (`n4Gap 145.9 > 100`) in the
contended run. It **passed on the clean run**, so that one was my own confound and I do not report
it as a regression.

### A2 — the RSS ceiling is now structurally wave-size-independent, and my round-1 number was confounded

The new ceiling is `max(nullEnvelope, 64 KiB) × 8` where `nullEnvelope` is the spread of eight
GC-settled at-rest samples (`registration-database.test.ts:1374-1383`), and the plateau is the spread
of waves 2-4 after a 250-refusal warm-up (`:1396-1397`). Nothing in it scales with the number of
refusals. **My round-1 BLOCKER 5's structural objection is correctly fixed.** Clean-run evidence:
`null_envelope=0.234 fixed_ceiling=0.625 waves=[396.0,396.1,396.0,396.1] heap_used=[39.1,39.2,39.2,39.2]
external=[166.8×4] plateau_spread` under ceiling.

Pushed to **4 000 refusals (2× what Codex proves)** with a fixed source set: RSS
`396.1,400.5,400.6,400.7,400.8,401.0,401.2,401.4,401.4,401.4` — a 4.4 MiB warm-up then a
**0.906 MiB spread across the remaining 3 600 refusals**. Flat. No linear term.

**On the isolation, honestly:** I scrutinised it expecting to find it excluded the thing under test.
It does not — it explains my own round-1 number. Fixing the source set stops 2 000 distinct IPs from
demand-paging S3c's 138 MiB `slotExpiries` array, which is very plausibly all my round-1
"+42 MiB / 21.6 KiB per refusal" was. That growth belongs to S3c's separately-ruled sketch, not to
D1. My round-1 structural criticism stands; **my round-1 leak number does not, and I withdraw it.**

One real limit: 125 sources × 20 admissions per 15 min = 2 500, and the test spends 2 250 of them
(90 %). My 4 000-refusal extension produced `AUTH_RATE_LIMITED` alongside `AUTH_MAIL_BUSY` for
exactly this reason. The isolation therefore caps the provable refusal count at ~2 500; going beyond
it requires widening the source set, which reintroduces the sketch. Worth recording in the row.

### A3 — the heap-snapshot proof and its positive control: re-derived, genuine

The proof takes a baseline snapshot, a saturated snapshot, subtracts the token-shaped strings, and
requires the difference to be exactly the 32 active tokens (`:791-793`, `:878-889`, `:930-933`),
with a 43-char canary proving the extractor can see such a string at all.

I re-derived the real control myself, as the packet asked — **mutant: retain one generated raw token
per queued waiter** (`registration.ts:527`):

```
M2 retain one generated raw token per queued waiter :: RED
   expected [ …(128) ] to have a length of 32 but got 128 :: restored_gold=True
```

It sees 128 where 32 is required. The proof genuinely detects retention. **My round-1 BLOCKER 3 is
fixed.**

### A4 — the new ruled retention statement is **TRUE**

`auth-policy.ts:372` now says plaintext is retained in suspended request frames *"until grant or
18s timeout"*. I measured it the same way I measured the old claim false — and I had to correct my
own first attempt, which built the comparison strings **before** the second snapshot and so
self-fulfilled at 96/96. With both snapshots taken before any comparison string exists in the
process:

| | queued plaintext emails | queued raw IPs | active-send emails |
|---|---|---|---|
| while queued | **96/96** | **96/96** | 32/32 |
| after the 18 s deadline | **0/96** | **0/96** | 32/32 |

The statement holds exactly as written. **My round-1 BLOCKER 4 is fixed**, and the row is now
accurate rather than reassuring.

### A5 — the operator alarm is bounded but no longer sizeable

`signalMailCapacity` (`registration.ts:497-507`) emits at most one line per ruled 60 s window.
Measured: **4 000 capacity refusals produced exactly 1 operator line.** The line carries a
correlation UUID and nothing else — no count, no rate, no duration. An operator watching a sustained
flood sees one identical line per minute and cannot tell 40 refusals from 40 000.

The codebase already has the right shape for this: `recordRateLimitRefusal` aggregates over a 60 s
window and carries `count`, `ip_count` and `address_count` into a durable audit row
(`identity.ts:508-518`). The memory fix borrowed the window and dropped the counter. Detection
survives; sizing does not. Non-blocking, but it should carry a count before this closes.

### A6 — VR-10 mutants re-derived (gold verified before each, restored after each)

| mutant | file:line | guard | result |
|---|---|---|---|
| zero the saturation lease | `registration.ts:480-482` | rework1 B1 | **RED** — `expected 1 to be less than or equal to 0.7133` (AUC/accuracy back to 1.0000) |
| retain one raw token per queued waiter | `registration.ts:527` | D1 heap proof | **RED** — 128 vs 32 |
| halve the queue deadline 18 000→9 000 | `auth-policy.ts:370` | deadline test | inconclusive (my `-t` filter matched no test; not pursued) |

Both substantive mutants confirm the fixes are load-bearing, and the first independently reproduces
my round-1 finding: with the lease removed the oracle is perfect.

### A7 — frozen D2/D3/D4 survived

`identity.ts` and `migrations/0033` are byte-identical to the pre-rework gold, so the mechanisms
cannot have changed. Evidence from my clean run: `[S3d D2] messages=4 live_hashes=4
first_token_still_valid=true siblings_invalid=3 consumed_at=4/4` — the sibling-family assertion I
asked for in round 1 (F-b) is now present and passing. VR-3 chain valid over 2 347 rows.
Not re-litigated.

---

## Findings

### Blocking

1. **The oracle is not closed at the ruled transport timeout.** `register` @5 000 ms transport:
   **AUC 1.0000, best accuracy 1.0000**, existing 5 126.1 ms vs missing 5 270.5 ms, zero overlap,
   same-arm null 0.6389/0.6667. `resend` @5 000 ms: **AUC 1.0000, accuracy 1.0000**, zero overlap,
   null 0.8056/0.8333. @4 900 ms: 0.9375/0.9677 vs null 0.7344/0.7500. Cause: the 5.1 s lease
   (`auth-policy.ts:369`) budgets 100 ms of tolerance over the 5 000 ms transport timeout, but the
   reservation also covers `recordVerificationDelivery` (`registration.ts:571-598`, `:636-659`),
   measured at ≈270 ms under 32-way saturation.
2. **The gates do not reproduce — Codex's own headline B1 test fails on a clean run.**
   814 passed / 1 failed: `expected 0.8 to be less than or equal to 0.7333`
   (`registration-database.test.ts:1206-1207`). The ceiling is `null + 0.10` with the 0.10 undecided by any derivation,
   and the verdict flips with machine load.
3. **"92/92 sends in both arms" does not show equal work.** The equality is created by 30
   compensating registrations (`:1143-1152`) and 30 compensating resends (`:1153-1160`) issued
   *after* the timed batches, then asserted on the round total (`:1162`, `:1201`). In-window the
   arms differ by exactly `samplesPerArm`; my chain measured 0 vs 15 and 12 vs 0.
4. **The lease's availability cost is unruled and lands on legitimate users.** Healthy 5 ms
   transport, no attacker: burst 128 → **99 succeed, 29 refused 503**; burst 160 → **99 succeed,
   61 refused**; p50 accepted latency **13.4 s**. Frozen S3b's 100-burst now passes with ~zero
   margin (my equivalent measured 99/100). This is a product decision for V, not a coder's
   calibration.

### Non-blocking

* **F-a** — the "arm-neutral deadline" test (`registration-database.test.ts:1219`) never compares
  arms; it proves boundedness only. My §2.2 supplies the missing measurement and it passes.
* **F-b** — the capacity signal carries no count/rate/duration (`registration.ts:497-507`);
  4 000 refusals → 1 line. `recordRateLimitRefusal` (`identity.ts:508-518`) already shows the
  aggregate-with-count shape to copy.
* **F-c** — the fixed-125-source isolation spends 90 % of the register admission budget
  (2 250 of 2 500), so the RSS proof cannot be extended past ~2 500 refusals without failing for an
  unrelated reason. Record the limit in the row.
* **F-d** — `registration-database.test.ts:918-920` still compares **one** sample per arm with
  `Math.abs(Δ) < 100 ms` in a `sleep`-stubbed test where both arms refuse before any arm-dependent
  work. Carried over from round 1 (F-f); harmless now that B1 exists, but it should go.
* **F-e** — I withdraw my round-1 RSS leak number (+42 MiB / 21.6 KiB per refusal). Codex's
  isolation is legitimate and that growth was S3c's demand-paged sketch, not D1.

### Confirmed fixed (round-1 blockers 3, 4, 5) and confirmed good

Heap proof with a working positive control (re-derived: 128 vs 32, RED). Ruled retention statement
measured **true** (96/96 while queued → **0/96** after the deadline). RSS ceiling structurally
wave-size-independent and flat at 2× the proved load. 18 s expiry arm-neutral (AUC 0.5208 vs null
0.5417), FIFO, starvation-free, no barging. Lease load-bearing (zeroing it → AUC 1.0000).
D2/D3/D4 frozen and intact; T9 untouched; tree byte-identical to gold; typecheck clean.

---

## What lifts the BLOCK

1. **Cover the whole ruled envelope.** Release the handoff at a fixed absolute deadline from
   activation that no arm can exceed — transport timeout **plus** the in-reservation
   delivery-record write **plus** tolerance — or take the delivery-record write out of the
   reservation. Re-measure at transport ∈ {0, 1 500, 4 900, 5 000} **and** on the
   timeout-then-failure path, n ≥ 30/arm, **both** routes, reporting AUC, best-threshold accuracy,
   the same-arm null, and whether the arm ranges overlap at all.
2. **Make B1 reproducible.** Run it enough times to state its margin, and derive the ceiling instead
   of `null + 0.10`. A security assertion that flips with machine load is not a gate.
3. **Fix the equal-work claim.** Either measure sends inside the window and make them equal, or drop
   "92/92 in both arms" and state plainly that indistinguishability comes from the lease.
4. **Get the availability trade ruled.** 99-request effective burst capacity and 13.4 s p50 on a
   healthy MTA, with frozen S3b's 100-burst at ~zero margin, needs V's sign-off — including whether
   the 18 s deadline should scale with the lease rather than sitting at 3.5× it.

## Measurement provenance

All numbers are mine, on real embedded PostgreSQL 18.4 (`tests/support/testDatabase.ts`),
Node v22.23.1 darwin-arm64, shipped production policy, the 600 ms/500 ms enumeration clamp **enabled**
wherever a latency claim is made, transport latency the only variable. Separation statistics use
S3b's own estimators, and every cross-arm figure is reported against a same-arm null. Harnesses were
standalone scripts under the repo root, deleted afterwards. Gate numbers come from a run with
nothing else executing on the machine; the one earlier run that had my own probe competing is
labelled as such and not counted against Codex.
