DIAGNOSIS — BLOCK

# S3d final-gate rescue — independent Claude Opus diagnosis

Ticket `t_cc197ed2`, board `accounts-phase1`. Read-only rescue seat. No product,
policy, or test file was edited. No mutation was applied, so no restore was
required. Nothing committed, pushed, or moved on the board.

## 0. Scope deviation and snapshot integrity — read this first

**Deviation from the packet's "Read first" list.** The packet lists
`reviews/S3d-r2-opus-verdict.md`. My launch instruction explicitly forbade
inspecting the sibling r2 verdict (blind-seat condition). I honoured the launch
instruction and did **not** open it. Everything below was derived independently
from the code, the tests, `S3d-progress.log`, `S3d-rework3-packet.md`,
`S3d-live-mail-rescue-opus.md`, and raw measurement lines recovered from
`logs/S3-codex.log`. If the r2 verdict contains a constraint I have not
reproduced, this report has not accounted for it.

**Start hashes — all eight matched the packet exactly.** No drift at entry.

| path | SHA-256 at start | packet |
|---|---|---|
| `apps/api/src/registration.ts` | `815e1bb309ca74c0dc56b370befcc69044530dff987414e80823678e82372524` | match |
| `packages/register/src/auth-policy.ts` | `83c83c19364df95c1004910c835f322c04052d22d2786fc2f83a9448a4501deb` | match |
| `tests/integration/registration-database.test.ts` | `bf420a934863ff91fd1c691b2228560886dbf4123ad5d2dff211dc0ab271113f` | match |
| `tests/unit/registration.test.ts` | `eab6cd811886ea4c22b51725c43675bf2fea84306be9864757f0fcf0aa34d045` | match |
| `apps/api/src/mail-channel.ts` | `2a0fe03910bdbb4629138722b136164d5f1a156181bd0d7b90e460e8dc0131c8` | frozen gold, match |
| `packages/db/src/identity.ts` | `c57266d3bb8314ca63d5635db88057ec0d5aa20dc319546c49735725572e9c5b` | frozen gold, match |
| `migrations/0033_verification_token_credentials.sql` | `34fadf7cd618c165d82d71536001628f7dff9165648c10c03f51beb6c4d94e2f` | frozen gold, match |
| `tests/integration/identity-database.test.ts` | `05ebf0c907ceb6efe532c7eef367dcc731d4ee33138c53e495153a44590e9432` | frozen gold, match |

**End hashes — three of four candidate files drifted mid-review** (owning session
wrote at mtime 23:49:04):

| path | SHA-256 at end | drift |
|---|---|---|
| `apps/api/src/registration.ts` | `d3a50762b8b4bd2be4bc1263c40b2f229cf6a3462ad32bf685fab27ef076dd5d` | **CHANGED** (1094 → 1096 lines) |
| `packages/register/src/auth-policy.ts` | `524baad4e6aa59a66750eedf6baad637813364f19c34416f42c718dfcbea99ab` | **CHANGED** |
| `tests/unit/registration.test.ts` | `801b41737d5d11899b1b19bdd645fb336ea3e31abd443a51aa3a9b725a937762` | **CHANGED** |
| `tests/integration/registration-database.test.ts` | `bf420a934863ff91fd1c691b2228560886dbf4123ad5d2dff211dc0ab271113f` | unchanged |
| all four frozen gold files | unchanged | exact gold retained |

**Everything below is a diagnosis of the packet-pinned snapshot
(`registration.ts` @ `815e1bb3…`, `auth-policy.ts` @ `83c83c19…`), which I read in
full. Line numbers refer to that snapshot. This is not a verdict on the
post-23:49 code.** Two facts about the drifted code that I did check, because they
change how this report must be consumed:

1. **The ruled dispatch constants did not move.** `registration_minimum_reservation_ms`
   is still `5_100`, `minimum_reservation_ms` still `5_700`,
   `registration_activation_spacing_ms` still `45`, `activation_spacing_ms` still
   `60`, and the executable cross-row check at `auth-policy.ts:502-511` is
   structurally unchanged. The root cause identified in §1 is therefore still
   present in the drifted candidate.
2. **`register()` moved `activateMailDispatch()` from before the enumeration clamp
   to after it** (pinned `registration.ts:957`, drifted `registration.ts:982`,
   now inside the `finally` after `holdRegistrationEnumerationClamp`). This
   suppresses one of the two leak paths in §1 *as the rework-2 B1 harness labels
   it*, and makes the other one strictly larger. See §1.5 — it is very likely to
   turn the harness green without closing the channel, and it must be re-measured
   with the successor-labelled probe in §1.6 before anyone reads a green
   rework-2 B1 as proof.

---

## A. Real shallow registration channel remains

### A.1 — Verdict: PRODUCT, not evidence. The gate is real. Do not retire it.

The decisive fact is a clean A/B already recorded in `logs/S3-codex.log`, on the
same harness, same measured quantity, same machine:

| log line | `registration_minimum_reservation_ms` | register existing / missing median | register AUC | resend medians | resend AUC |
|---|---|---|---|---|---|
| `S3-codex.log:4433032` (rework-2) | **5700** | 5701.5 / 5701.4 | **0.5664** ✅ | 5701.0 / 5700.7 | 0.5156 |
| `S3-codex.log:4905886` (rework-3) | **5100** | 5254.1 / 5381.3 | **1.0000** ❌ | 5701.9 / 5701.7 | 0.5859 |
| `S3-codex.log:4951443` (packet's run) | **5100** | 5256.0 / 5385.8 | **1.0000** ❌ | 5701.8 / 5701.8 | 0.5039 |
| `S3-codex.log:4993719` (rework-3) | **5100** | 5204.2 / 5380.4 | **1.0000** ❌ | 5701.8 / 5702.2 | 0.6094 |

Three independent confirmations of one variable. **Resend, which still carries the
5700 ms floor, is flat at 5701.x/5701.x in every one of those same runs, including
the runs where register is at AUC 1.0000.** The harness is not broken, the null is
not mis-sized, and the machine is not drifting. The register route lost its cover
when rework-3 cut its reservation from 5700 to 5100.

### A.2 — The causal chain, one register target → marker

The scored observable in `tests/integration/registration-database.test.ts:1669` is
`capturedGrantTimes[1] − capturedGrantTimes[0]`, captured at
`registration.ts:552` (`activateMailDispatch` entry) for two consecutive callers:
the **target** (arm under test) and the **marker** that inherits the reservation.
Decompose it exactly:

```
interval  =  L_target                       (target's lease, floored)
          +  G_marker                       (marker's permit→activation gap)

L_target  =  max( F_route , C_target + transportTimeoutMs )
G_marker  =  provision(marker) + cadence
C_target  =  max( 0 , clampMs − a_target )        clampMs = 600
a_target  =  time from the target's request arrival to its own grant
```

with `F_register = 5100` (`auth-policy.ts:383`, consumed at `registration.ts:936`)
and `F_resend = 5700` (`auth-policy.ts:384`).

The two arm-dependent terms and where each is produced:

**Leak 1 — enumeration-clamp residue inside the lease.**
`register()` stamps `activatedAt` at `registration.ts:957`
(`releaseMailDispatch = await activateMailDispatch()`), *before* the `finally`
block runs `holdRegistrationEnumerationClamp(startedAt)` at
`registration.ts:981`, and `dispatchVerification` — which starts the 5000 ms
transport-equal occupancy (`registration.ts:738` no-send arm,
`registration.ts:747` send arm) — only runs at `registration.ts:986`, *after* the
clamp. So the wall time from `activatedAt` to the release invocation is
`max(0, 600 − a) + 5000`. `holdRegistrationEnumerationClamp`
(`registration.ts:439-444`) pads to a fixed 600 ms **measured from request
arrival**, so this term carries the caller's own arm-dependent pre-grant latency
into the lease with a *negative* coefficient. The 5700 ms resend floor
(600 + 5000 + 100) absorbs the whole clamp for any value of `a`. The 5100 ms
registration floor (5000 + 100) absorbs only 100 ms of it, leaving up to **500 ms
of arm-dependent clamp residue published directly on the wire**.

**Leak 2 — the successor's pre-activation provisioning gap.**
`register()` obtains a permit at `registration.ts:934`
(`reserveMailDispatchPermit`), then runs `provisionPendingAccount` at
`registration.ts:954`, and only *then* activates at `registration.ts:957`. The
predecessor's release blocks on `await handoffActivated` (`registration.ts:588`)
until that activation lands, so this gap is serialized channel time sitting
between two grants, covered by **no floor at all**.
`resendVerification` has no such gap — `reserveMailDispatch`
(`registration.ts:683-686`) activates immediately on permit — which is precisely
why resend pins at exactly `5700 + ~1.8 ms` in every run while register does not.

The ~129.8 ms is `median(interval_missing) − median(interval_existing) =
5385.8 − 5256.0`. Structurally it is the difference in `a` between the two arms,
re-published through leak 1 once the floor stops covering it. The two arms' `a`
differ because `createPendingAccount` (`packages/db/src/identity.ts:154-254`) runs
materially different work per branch:

- **create branch** (`identity.ts:208-246`): `INSERT user` + `INSERT channel_binding(email)`
  + `INSERT verification_token_credential` + `INSERT channel_binding(recovery_email)`
  + `appendAudit` + `beforeCommit` (DEK write) + COMMIT.
- **duplicate branch** (`identity.ts:177-206`): `INSERT ON CONFLICT` (0 rows) +
  `SELECT` + three no-op `UPDATE … SET state=state` + `appendAudit` + COMMIT —
  **more round-trips than the create branch**, and in this harness always against
  the *same* seed row (`test:1630`, `registerSeed`), which additionally accumulates
  dead tuples and row-lock contention across the 16 iterations and races the
  previous iteration's `recordDuplicateRegistrationPostwork`.

Both branches perform exactly one `appendAudit`, whose two blocking `argon2id`
KDFs (`identity.ts:103-106`) were measured at ~49 ms per audit write by the
live-mail rescue seat. **Attributing the 129.8 ms between duplicate-branch row
contention and create-branch extra INSERTs requires an instrumented run this seat
is not authorized to perform.** That attribution gap does not affect the fix,
because the fix is not to equalize the branches — it is to make the floor cover
whatever they cost.

### A.3 — Is it a genuine second operating point? Yes.

It is the **shallow single-waiter handoff**: a channel that is at capacity with a
small queue, releasing reservations one at a time as individual transports
complete. That is the ordinary steady state of a busy-but-not-thrashing mail
channel, not a contrived harness state. The rework-2 harness reproduces it
directly (`test:1635` waits for `queued === 1`, `test:1644` for `queued === 2`,
`test:1661` releases exactly one holder).

### A.4 — Why rework-3 B1/B3 miss it

Three independent reasons, each sufficient on its own:

1. **rework-3 B1 measures the same quantity but only in the batched operating
   point.** `record.handoffAfterMs` (`test:1088`) is grant-to-grant, but the
   harness releases **all 32 targets simultaneously**
   (`test:1258`, `Promise.all(dummyReleases.slice(0, samples).map(r => r()))`).
   All 32 successors then queue behind the single
   `nextMailDispatchActivationAt` cadence chain (`registration.ts:600-607`), so
   `scheduledAt = max(now, nextActivationAt)` is dominated by a common 45 ms
   backlog rather than by any individual successor's provisioning — leak 2 is
   averaged away. The same batching also drives every target's `a` far past
   600 ms, so `max(0, 600 − a) = 0` for all of them and leak 1 is switched off by
   construction. Both channels are structurally invisible in this harness.
2. **rework-3 B1's hard gate cannot see leak 2 at all.**
   `nonTransportWork = releaseInvokedAfterMs − 5000` (`test:1277-1279`) is purely
   the *in-lease* portion. The successor's pre-activation gap lives in
   `handoffAfterMs − releaseInvokedAfterMs` and is never asserted. And at a 600 ms
   tolerance (`test:1471`) the gate would pass a full 600 ms clamp residue anyway.
   The reported maxima (127.7–157.4 ms) are consistent with a wide-open channel.
3. **rework-3 B3 labels by the wrong caller and the wrong route.** `markerRecords`
   are labelled by `targetArms[index]` (`test:1417-1422`), i.e. by the
   **predecessor's** arm, and its targets are `resendVerification` calls
   (`test:1376`) while its markers are always fresh-email `register()` calls
   (`test:1383`). The register route's own permit→activation gap is never labelled
   by a register target's arm anywhere in the suite.

**Net: no test in the file exercises `register` route × shallow single-waiter
handoff × arm-labelled grant-to-grant except rework-2 B1 — which is exactly the
one that is red.**

### A.5 — What the 23:49 drift does, and why it is not a fix

The drifted `registration.ts` moves `activateMailDispatch()` to *after*
`holdRegistrationEnumerationClamp` (now `registration.ts:982`). Consequences:

- **Leak 1 is closed as the rework-2 B1 harness labels it.** `activatedAt` now
  starts at the beginning of the dispatch, so `L_target = max(5100, 5000) = 5100`
  for both arms and the target-arm term drops out of the interval.
- **Leak 2 is made strictly larger, and is now the whole channel.** The gap
  between the predecessor's handoff and the successor's grant now contains
  `provision(successor) + clampResidue(successor)` — up to 600 ms of
  arm-dependent time, outside every floor. The channel has been *relabelled* from
  "previous caller's arm" to "this caller's own arm", not removed.

**Predicted outcome: rework-2 B1 goes green, and the enumeration channel is still
open.** A green rework-2 B1 on the drifted candidate must not be accepted without
the successor-labelled probe in §A.6.

### A.6 — Smallest authorized correction

Scope stays inside `registration.ts` / `auth-policy.ts` / the two tests.

**Fix (product), in this order:**

1. **Delete the route-specific registration reservation.** Set
   `registration_minimum_reservation_ms` to the general derived value
   `pre_transport_work_budget_ms + transport_timeout_ms + handoff_scheduler_tolerance_ms`
   = 600 + 5000 + 100 = **5700**, and change the executable check at
   `auth-policy.ts:500-501` so `derivedRegistrationMinimumReservationMs` is that
   same expression rather than `transport + tolerance`. The current derivation
   encodes the claim "durable provisioning is pre-activation, therefore the
   600 ms pre-transport budget is not needed" (`auth-policy.ts:394`). That claim
   is false as a *security* argument: pre-activation work is not outside the
   observable, it is the observable.
2. **Activate at permit grant, not after provisioning.** In `register()`, call
   the activation thunk immediately when `reserveMailDispatchPermit` resolves —
   the shape `resendVerification` already uses via `reserveMailDispatch`
   (`registration.ts:683-686`) — and run `provisionPendingAccount` inside the
   activated lease. This eliminates the un-floored handoff gap entirely rather
   than relabelling it. Measured in-lease non-transport work at depth 32 is
   127.7–157.4 ms, comfortably inside the 600 ms budget.
3. **Take the clamp out of the serial path.** Hand `pendingPostwork` to
   `dispatchVerification` *before* awaiting `holdRegistrationEnumerationClamp` in
   the `finally`, and await the clamp only for the response. `dispatchVerification`
   already defers via `setImmediate` (`registration.ts:735`), so this is a
   reordering, not a behaviour change. It removes the clamp from the lease budget
   and starts transport up to 600 ms earlier, which *improves* availability.

**Fix (evidence), same change-set:**

4. **Keep rework-2 B1 in the gate set permanently.** It is currently the only
   probe of the shallow operating point. Retiring it is the one move that must
   not happen.
5. **Add the successor-labelled variant.** Same shallow harness, but vary the
   **marker's** arm and hold the target's arm constant, scoring
   `grant(target) → grant(marker)`. This is the probe that would have caught
   leak 2 and is the probe that will catch the 23:49 relabelling. Roughly ten
   lines: `test:1638-1640` already computes `markerEmail` per arm — it needs an
   independent marker-arm axis and a second `byArm` accumulator.
6. **Add the missing mutation.** Drift `registration_minimum_reservation_ms`
   5700 → 5100 and show rework-2 B1 goes RED. The rework-3 mutation set
   (progress log 21:27) never mutated a reservation constant; it mutated the
   cadence, the null size, the audit ordering, the derivation, and the count. The
   one constant that actually broke this gate was never mutation-tested.

**Availability consequence — state it plainly to V, do not resolve it here.**
Raising the registration lease 5100 → 5700 is an ~11.8 % throughput cut on a
channel whose production-equivalent request margin is already exactly **zero**
(`test:1855`, `expect(hundred.successes).toBe(100)`), with effective burst
tolerance now ~103. Naively that predicts burst-100 dropping to ~92 and the hard
assertion going red. **But that arithmetic is probably too pessimistic**, for a
mechanism reason worth checking: work placed between handoff and activation is
*serialized dead time added to every reservation cycle* (the predecessor blocks on
`await handoffActivated`, `registration.ts:588`), whereas work placed inside the
lease is absorbed by the floor at zero throughput cost. Rework-3 moved ~130–160 ms
per cycle from "absorbed" to "serialized" in exchange for a 600 ms smaller floor —
and the measured effective burst tolerance went **down**, from 121–126 at
reservation 5700 (progress log, rework-2 final gates) to ~103 at 5100. The 5100
special case did not buy the availability it was introduced to buy. Fixes 2 and 3
push that work back under the floor. Net effect must be measured, not argued.

---

## B. D1 memory proof remains RED

### B.1 — Verdict: EVIDENCE. A mismatched mini-wave statistic, with a heap/RSS phase effect as the physical cause of the 1.0 MiB. Not product retention.

The two statistics are not the same statistic and the ceiling is not transferable:

| | 8,000-refusal plateau (`test:2035-2163`) | D1 mini-wave |
|---|---|---|
| statistic | **spread** `max − min` of 4 samples (`test:2132`, `waveRssMib.slice(12)`) | **growth** `RSS(after 24) − RSS(after 8)` |
| regime | tail of the run: 512 priming + 6,000 refusals of warm-up before the first plateau sample | first 32 refusals of process life, no warm-up |
| load | 2,000 refusals across the measured window | 32 refusals |
| what it bounds | residual drift inside a converged allocator regime | allocator/heap growth during the warm-up phase |

Applying a ceiling derived for the first to the second is a category error. The
repo's own recorded data shows the D1 mini-wave has *always* measured ~0.9–1.3 MiB
and never changed:

- progress log 07:55 — D1 RSS 185.4 → 185.9 (8-refusal null) → 187.2 MiB, **1.3 MiB**;
- progress log 08:13 — 171.0 → 171.4 → 172.3 MiB, **sustained +0.9 MiB**;
- progress log 10:01 — the r1 variant grew **15.703 MiB** over 2,000 early refusals,
  against a converged-regime plateau spread of 0.063–0.234 MiB in the same file.

**The measurement did not change. Only the ceiling did.** It passed before because
the ambient null multiplier scaled with the warm-up noise it was measuring — that
is exactly why the r2/r3 packets ordered it removed. Removing a noise-scaled
ceiling from a noise-dominated statistic does not make the statistic sound; it
makes it fail. That is the whole of Failure B.

### B.2 — The mini-wave has no statistical power in either direction

The product claim under test is `retained_objects_per_occupied_slot: 0`
(`auth-policy.ts:289`) and `maximum_retained_aggregates: 1`
(`auth-policy.ts:392`) — a claim about *zero* per-refusal retention. Per refusal
the retained state is one slot in preallocated typed arrays
(`registration.ts:106-118`, never grown), at most one `RefusalAggregate` per route
(three routes, `registration.ts:90`) and at most one `MailCapacitySignalAggregate`
(`registration.ts:408`). 32 refusals × any plausible per-refusal retention
(~200 B) is ~6 KiB — **well under a single 16 KiB page on this platform**. The
mini-wave cannot distinguish "0 bytes retained" from "20 KiB retained per
refusal". It is vacuous when it passes and noise-driven when it fails. There is no
constant that repairs it, which is why the packet's ban on "an arbitrary larger
constant" is correct and why raising it was never an option.

### B.3 — Is the named 12-quanta factor justified? No. Neither factor is.

`test:2116-2118`:

```ts
const rssMeasurementQuantumMib = 64 / 1024;   // "RSS measurement quantum"
const maximumToleratedRssQuanta = 12;
const fixedPlateauCeilingMib = rssMeasurementQuantumMib * maximumToleratedRssQuanta;
```

- **The quantum is misnamed and wrong for this platform.** Verified on the review
  machine: `getconf PAGESIZE` = **16384** (16 KiB), `node v22.23.1 darwin arm64` —
  the same runtime the policy pins at `auth-policy.ts:294` and `:306`.
  `process.memoryUsage().rss` is page-granular, so the actual RSS measurement
  quantum here is 16 KiB, not 64 KiB. The declared ceiling of 0.750 MiB is **48
  real pages**, not 12 quanta of anything the platform produces.
- **The multiplier is a bare literal.** `12` is traceable to no threat quantity, no
  proof quantity, and no measurement. Its provenance is visible in the progress
  log: the plateau ceiling has been re-picked at least eight times across this
  ticket — 1.5, 1.188, 0.5, 0.625, 1.0, 1.5, 0.5, 0.75 MiB — each time after
  seeing the run. That is calibration, not derivation.

The rework-3 fold-in required "make the RSS plateau ceiling genuinely fixed **or**
derive every factor from a named threat/proof quantity". The candidate satisfied
the first clause (it no longer depends on ambient null — `nullEnvelopeMib` at
`test:2115` is printed but correctly never asserted) and **did not satisfy the
second**. As written, the plateau test proves "RSS drifted less than an arbitrary
0.750 MiB", which is a statement about the allocator, not about the dispatcher.

### B.4 — Non-vacuous correction: count the retained objects, do not weigh them

The correct proof for a "zero retained objects" claim is a **counting** proof, and
this file already contains a working template for one. D1 itself
(`test:841-846`, `test:926-961`) takes a `writeHeapSnapshot`, filters against a
baseline snapshot, uses an explicit positive control (`heapCanary`,
`test:841`, asserted found at `test:846`), and proves
`rawTokensOutsideActiveSend === 0`. Apply exactly that technique to retention:

1. Baseline heap snapshot after saturation, before the measured refusals.
2. Drive N refusals; snapshot again.
3. Assert the count of retained `RefusalAggregate` / `MailCapacitySignalAggregate`
   / queue-node objects is `<= maximum_retained_aggregates` **per route** and
   **does not scale with N** — run at two values of N (e.g. 500 and 4,000) and
   assert the count is identical. That is the derived bound: it comes from the
   named policy quantities `maximum_retained_aggregates: 1` and
   `retained_objects_per_occupied_slot: 0`, not from a constant.
4. Positive control: a deliberately retained object per refusal must make the
   count scale with N and go RED. This is the mutation that is currently missing.

This proof is N-independent, immune to allocator phase, immune to GC timing, and
carries a real threat interpretation ("an attacker cannot make the process retain
one object per refusal"). Keep the 8,000-refusal RSS plateau as a coarse secondary
sanity check, but stop treating it as the primary bound, and either derive its
ceiling from the measured page size × the number of pages the positive control
proves are needed to detect one retained object, or state in the test that it is a
tuned regression tripwire rather than a derivation.

### B.5 — Integrity flag on the current D1 test

At the pinned snapshot, `S3d D1` (`test:804-1022`) **contains no memory assertion
at all.** `nullWave` (8) and `sustainedWave` (24) at `test:920-921` are now only
refusal-code assertions, and the console line at `test:1007` reads
`rss_proof=S3d_rework3_fixed_8000_refusal_plateau`. The failing mini-wave was
answered by **deleting the measurement and pointing at a different test**, and the
vestigial `nullWave`/`sustainedWave` names still imply a memory proof that is no
longer performed.

I judge the deletion itself defensible on the merits — §B.2 shows the statistic
was worthless — but it must be reported as an explicit, justified retirement with
the counting proof in §B.4 put in its place, and the variable names must stop
implying a null/sustained memory comparison. It must **not** be reported as
"D1 memory proof green". The 8,000-refusal plateau is intact and unweakened; I am
not recommending any change to its assertions beyond deriving its ceiling.

---

## C. Additional scrutiny — the 45 ms cadence

**45 ms is empirically tuned, has no derivation, and the executable guard does not
constrain it.** The cross-row check at `auth-policy.ts:510-511` only requires

```
registration_activation_spacing_ms * maximum_concurrent <= registration_minimum_reservation_ms
   →   45 * 32 = 1440  <=  5100
```

Any value in `[0, 159]` passes. The constraint that actually governs the frozen
S3b gate is a different, unwritten one. `S3b keeps live-mail N=1/N=4/N=8`
(`test:2808-2952`) runs on an **unsaturated** channel, so `minimum` is 0 at
`registration.ts:561` and no reservation floor applies at all; the only
dispatcher-side timing left is the cadence, and it is awaited *inside* the request
at `registration.ts:957`. For the gate to hold, every request must still finish
under the 600 ms clamp:

```
password_hash (~132 ms, blocking) + provisioning + k * 45 ms  <  600 ms      for k < N
```

At N = 8 that is 132 + provisioning + 360, leaving well under 100 ms of headroom —
and the reported N=8 median gap is **57.0 ms against the 100 ms ceiling**, i.e.
the clamp is *already* being breached at N=8 and the gate is passing on 43 ms of
margin. At 60 ms cadence, 8 × 60 = 480 pushes the total past 600 and the gate
breaks. **That is the actual derivation of 45: `(600 − work) / 8`.** Nothing names
8 as a threat quantity — it is the N the frozen test happens to use.

Missing derivation and repeatability requirements, concretely:

1. **Name the concurrency the clamp is claimed to hold at.** The policy must state
   the maximum unsaturated concurrency `N*` at which
   `clamp > work + N* * cadence` is asserted, and the executable check must test
   *that* inequality — not `cadence * 32 <= reservation`, which is 3.5× looser
   than the binding constraint and is satisfied by values that break S3b.
2. **Prove sensitivity.** Mutate the cadence by ±15 ms and show S3b actually
   moves. If 30 ms and 60 ms both pass, 45 is not load-bearing and the gate is not
   measuring what it claims; if 60 ms fails, the 43 ms margin at N=8 is the real
   headroom and must be published as such.
3. **Prove repeatability under load.** This family of gates is already known to be
   load-sensitive in this very ticket: progress log 13:40 records that two
   sustained CPU workers flipped a green register measurement to AUC/accuracy
   0.9375/0.9688. The current S3b numbers (AUC 0.500/0.570/0.627, gaps
   0.0/10.7/57.0 ms) are a single clean run. Require N repetitions plus one
   sustained-load repetition before 45 is treated as settled.
4. **Note the shape of the tuning.** The live-mail rescue seat measured the
   arm-dependent serialized unit at ~59 ms and the cadence was then 120 ms; it is
   now 45 ms. Choosing a cadence in the same magnitude band as the per-request
   serialized work is calibration against the symptom, not a defence with a
   derivation behind it.

**Availability, for V, not for this seat:** 100/100 with **zero** request margin,
~103/128 and ~103–104/160, accepted p99 ~30.5 s at burst 100 and ~35.2 s above it.
Two things V should see: the effective burst tolerance has *regressed* from
121–126 (rework-2, reservation 5700) to ~103 (rework-3, reservation 5100), so the
5100 special case cost availability rather than buying it; and a p99 registration
response of 30.5 s at the burst the product hard-asserts is a product fact
independent of any enumeration question.

---

## D. Focused verification order — avoids another premature full suite

Ordered so the cheapest disproof runs first and no full suite runs until the two
gates that have actually been failing are green twice.

1. **Re-pin the snapshot.** Re-hash `registration.ts`, `auth-policy.ts`, and both
   tests. Three of four moved during this review (§0). Nothing below is meaningful
   against a moving candidate.
2. **Seconds, no Postgres — confirm the two platform constants** this report
   depends on: `getconf PAGESIZE` (expect 16384) and the `argon2id` cost at
   64 MiB/t=3 with a 1 ms `setInterval` tick counter to confirm main-thread
   blocking. If either differs materially, re-derive §A.2 and §B.3 before trusting
   any fix.
3. **`vitest -t "S3d rework2 B1"`** — the failing gate, unmodified. Must show
   register medians within the resend-like flat band and AUC ≤ the exact-size
   q99. Run it **twice**; the recorded existing-arm medians vary 5204–5256 across
   runs, so a single green is not evidence.
4. **The successor-labelled variant (§A.6 item 5)** — new probe, marker arm
   varied, target arm held constant. This is the one that distinguishes "channel
   closed" from "channel relabelled by the 23:49 change". If step 3 is green and
   this is red, the fix is not done.
5. **`vitest -t "S3d rework2 B1"` reservation mutation** — drift
   `registration_minimum_reservation_ms` 5700 → 5100, confirm RED, restore
   byte-identically and hash-check. Without this the gate is not proven
   load-bearing.
6. **`vitest -t "S3b keeps live-mail"`** — N=1/4/8, must hold median gap ≤ 100 ms,
   AUC ≤ 0.80, `min(all) ≥ 580`. Then the ±15 ms cadence sensitivity mutations
   (§C item 2), each restored and hash-checked.
7. **`vitest -t "S3d rework3 B1/B3"`** — must stay green; confirm
   `nonTransportWork ≤ 600 ms` on both arms at depth ≥ 32 and the interleaved
   two-step B3.
8. **`vitest -t "S3d rework2 B4"`** — the availability gate. `hundred.successes`
   must still be 100, and the printed 128/160 figures must be compared against the
   recorded ~103 baseline. **This is the step most likely to go red under the §A.6
   fix**; if it does, stop and escalate the trade to V rather than weakening the
   enumeration gate.
9. **`vitest -t "S3d rework3 fold-in plateaus RSS"`** plus the new counting proof
   (§B.4) with its positive-control mutation.
10. **`vitest -t "S3d D1"`** and **`vitest -t "S3b returns 100 burst successes"`**.
11. Only after 3–10 are green: `pnpm typecheck`, `pnpm lint`, then the definitive
    full suite.

---

## Verdict

**BLOCK.**

- **Failure A is product and the gate is real.** The register route's grant-to-grant
  interval carries two arm-dependent terms — the enumeration-clamp residue inside
  the lease and the successor's un-floored pre-activation provisioning gap — and
  the 5100 ms registration reservation covers neither. It is decisively confirmed
  by a same-harness A/B in the project's own logs (5700 → AUC 0.5664; 5100 → AUC
  1.0000, three times) and by resend, which retains the 5700 floor and stays flat
  at 5701.x in the very same runs. An in-scope fix exists (§A.6) and it is not a
  tolerance widening; its cost is availability, and that trade is V's call.
- **Failure B is evidence, not product.** The D1 mini-wave is a mismatched
  statistic with no statistical power at 32 refusals; the 1.0 MiB is warm-up heap
  phase, not retention. The corrective is a counting proof derived from the named
  policy quantities (§B.4), not a larger constant. Separately, the named
  `12 × 64 KiB` factor is **not** justified: the platform's RSS quantum is 16 KiB,
  and `12` traces to no threat or proof quantity.
- **The 45 ms cadence is empirically tuned with no derivation**, the executable
  guard is 3.5× looser than the constraint that actually binds, and the frozen
  S3b gate is passing on 43 ms of margin at the single N the test happens to use,
  from one unloaded run.
- **The candidate moved under this review.** Three of four files were rewritten at
  23:49:04, the defective ruled constants are unchanged, and the one structural
  change I observed relabels Failure A's channel rather than closing it. Nothing
  here is a verdict on that code, and a green rework-2 B1 on it must not be
  accepted without the successor-labelled probe.

No commit. No push. No board mutation. No file edited other than this report.
