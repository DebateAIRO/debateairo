# S3d successor-channel refutation — fresh Claude Opus adjudication

Read-only rescue seat. No product, policy, test, packet, progress, or board file
was edited. No mutation was applied, so no restore was required. No test was
executed. Nothing committed, pushed, commented, or moved on Kanban.

## 0. Scope, snapshot integrity, and one deliberate deviation

**Deviation.** The launch instruction forbade inspecting any sibling formal
r2/r3 verdict, and the packet repeats that ban. I did not open
`S3d-r2-opus-verdict.md`, `S3d-r2-grok-verdict.md`, `S3d-r2-claude-review-packet.md`,
or any r3 sibling. Everything below is derived from the packet's own "read in
full" list, the frozen `packages/db/src/identity.ts` and
`packages/crypto/src/index.ts` (read for mechanism only, not edited), and the
three raw measurement lines recovered from `logs/S3-codex.log`.

**Hashes — all eight matched at entry and at exit. Zero drift during this
review.**

| path | SHA-256 (entry == exit) | packet |
|---|---|---|
| `apps/api/src/registration.ts` | `c5846a86b64b1941d917be6dd9f2d27b06fab400f6ca9fdfd036b8d72ec2b27e` | match |
| `packages/register/src/auth-policy.ts` | `160462afa4f30b189387f2e2640d21c0ce161553e6292abd7eb73f69affbc94b` | match |
| `tests/integration/registration-database.test.ts` | `482b7a53ef1229a9762c281e389b8302d847056db76a66e636c56519200aa5c5` | match |
| `tests/unit/registration.test.ts` | `1b48cf8de59ceab24d3a464d1251bb40c57dc123f0a29040723b6a738226182a` | match |
| `apps/api/src/mail-channel.ts` | `2a0fe03910bdbb4629138722b136164d5f1a156181bd0d7b90e460e8dc0131c8` | frozen gold, exact |
| `packages/db/src/identity.ts` | `c57266d3bb8314ca63d5635db88057ec0d5aa20dc319546c49735725572e9c5b` | frozen gold, exact |
| `migrations/0033_verification_token_credentials.sql` | `34fadf7cd618c165d82d71536001628f7dff9165648c10c03f51beb6c4d94e2f` | frozen gold, exact |
| `tests/integration/identity-database.test.ts` | `05ebf0c907ceb6efe532c7eef367dcc731d4ee33138c53e495153a44590e9432` | frozen gold, exact |

**Evidence integrity check.** The three `[S3d REWORK4 SUCCESSOR-LABELLED SHALLOW]`
lines exist in `logs/S3-codex.log` exactly as the packet describes:
`:5243329` is the inadmissible first run (`sends 32/16`, and note it also predates
the permit-to-activation fields entirely); `:5264054` is run 1
(`5256.5/5254.7`, `154.4/152.1`, `.5547/.6250` vs `.7500/.7500`, `32/32`); and
`:5280043` is run 2 (`5253.7/5256.1`, `151.5/153.3`, `.6641/.6875` vs
`.7578/.7500`, `32/32`). The packet's summary is faithful to the log.

**No live test was run.** It was not indispensable. The decisive parts of this
adjudication are structural (a `max()` identity in `register()` and a branch
asymmetry in frozen `identity.ts`), and the one thing a live run could add —
proof that the new probe is capable of going RED — cannot be obtained without
editing product or test files, which this packet forbids. That missing proof is
itself part of the finding.

---

## 1. Summary of the finding

The worker's causal claim is **correct against the model it was asked to test,
and I can state the old model's false premise exactly**. The predicted "up to
600 ms of successor clamp residue" cannot exist in any operating point, for a
reason stronger than the measurement.

But the probe is green for a reason the worker did not identify, and that reason
does not generalise off this host. The successor's permit-to-activation gap is
**un-floored serialized channel time between two grants**, it publishes
`provisionPendingAccount` duration into the scored interval **1:1**, and the two
address branches of `createPendingAccount` are **not** structurally
equal-cost: the create (missing) branch performs nine filesystem operations that
the duplicate (existing) branch never performs, inside the same transaction and
inside that same un-floored gap. On this machine those nine operations happen to
be cancelled by the duplicate branch's one extra database round trip, which is
why both arms measure ~152 ms. Nothing in the code, the policy, the derivation,
or the executable cross-row check bounds that difference. The candidate's
successor-arm indistinguishability is therefore an accident of local filesystem
latency at I/O concurrency 1, not a property of the design.

That is a real channel the new test misses, it is materially different from the
old model, and it has a predictable sign. **BLOCK.**

---

## 2. Answers to the eight required questions

### Q1 — Does the test hold the predecessor/target arm constant and vary only the successor/marker arm? Any hidden varying input?

**The arm-holding is done correctly.** Every target is a fresh address
(`s3d-successor-${markerArm}-timeout-target-${index}`, `test:1866`, with `index`
counted per arm at `test:1864` so no `(arm,index)` pair repeats). The `markerArm`
token appears in the target's *string* but never in its *branch*: all targets take
the create path. The console line correctly declares `target_arm=missing`. Marker
arm is the only branch axis (`test:1873-1875`).

Four inputs do vary with the marker arm. I traced each and **none of them can
reach the scored interval**, for one shared reason developed in Q4: the target's
grant is pinned by the response clamp and the scored interval equals
`registration_minimum_reservation_ms + marker permit-to-activation`, so anything
happening before the target's grant is invisible to the statistic.

1. **Source IP / User-Agent / request-id** (`test:1828-1832`). `arm.length.toString(16)`
   gives `f` for `existing-target`/`existing-marker` and `e` for the missing pair,
   so target and marker share one source IP per iteration. Two admissions on a
   20-per-window budget with a frozen clock — no refusal, and the limiter path is
   an HMAC over typed arrays. Pre-queue, and negligible.
2. **`findAuditIdentityByBlindIndex` hit vs miss** (`registration.ts:905`). Genuinely
   arm-dependent, and genuinely excluded: it runs before `reserveMailDispatchPermit`
   at `registration.ts:922`, and the harness only starts the scored window after
   `waitFor(queued === 2)` (`test:1879`). Legitimate exclusion — in production it
   moves when a request *enters* the queue, not the grant-to-grant interval.
3. **The balancing register**, existing arm only (`test:1884-1889`). Answered in Q3.
4. **The replacement filler**, existing arm only (`test:1915-1920`). Issued after
   both capture arrays are set to `undefined` (`test:1910-1911`), so it is outside
   the window by construction.

**The hidden varying input that does matter is inside the quantity the test
intends to vary, and the test neither declares nor bounds it.** `provisionPendingAccount`
is not a uniform-cost operation across branches — see Q5 and §3.

### Q2 — Are the two hooks measuring the claimed events, in the right order? Can unrelated work enter either array?

**Yes on ordering; no on contamination. Both hooks are correct.**

- `instrumentedService.activateMailDispatch = …` (`test:1795-1801`) installs an own
  property that shadows the prototype method. Both call sites reach it through
  `this.activateMailDispatch(...)` inside `scheduleMailDispatchActivation`
  (`registration.ts:596`), so the immediate-permit path (`registration.ts:647`) and
  the handoff path (`registration.ts:574`) are both captured. No activation on
  `flow.service` escapes the hook.
- `reserveMailDispatchPermit` is wrapped with `.then()` (`test:1802-1810`), so the
  stamp lands one microtask after the underlying promise settles. The target's
  permit settles when the released filler's `.then()` runs `next.resolve(...)`
  (`registration.ts:570-577`); the marker's settles ~5.1 s later. Order is
  therefore target-then-marker with no possible inversion.
- **Contamination is structurally impossible.** The hooks are bound to
  `flow.service` only; `balancingFlow` is a separate `RegistrationService` with a
  separate instance, so its activations and permits cannot enter. Within the open
  window (`test:1890-1902`) the only in-flight `flow.service` work is the target
  and the marker: every filler activated during fill and is parked inside a held
  `sendVerification`, and the previous iteration's replacement filler was
  `await`ed to completion at `test:1916`. `capturedGrantTimes?.push` is
  optional-chained, so anything outside the window is dropped rather than
  mislabelled. The two `toHaveLength(2)` assertions (`test:1902-1903`) are real
  guards, not decoration.

**One methodological defect, no correctness defect.** The test computes the sharp
observable — `markerPermitToActivation` (`test:1907-1909`) — prints it, and then
**never asserts on it**. AUC and accuracy are computed only on
`grantIntervals` (`test:1930-1933`), which is `5100 ms + gap`. Adding a constant
does not change ranks, but the 5100 ms anchor is a real `setTimeout` on a real
event loop and contributes release-timer jitter that the gap statistic does not
carry. The test therefore asserts on a strictly noisier version of a series it
already holds in memory. That is free statistical power thrown away, and it
matters directly for the load condition in §4.

### Q3 — Is send accounting genuinely equal inside each scored interval, including the balancing flow? Does balancing invalidate the comparison?

**Send accounting is equal, honest, and correctly repaired. Balancing injects
genuinely asymmetric CPU/DB load, but it cannot bias either endpoint.**

Per iteration the existing arm books one send on `flow` (the target) plus one on
`balancingFlow`; the missing arm books two on `flow` (target and marker, the
existing marker being a duplicate that sends nothing). 16 iterations × 2 = 32/32,
asserted at `test:1956`. The first log line at `:5243329` shows `32/16` because
the marker's send starts asynchronously after activation and the snapshot was
taken too early; the `waitFor` at `test:1895-1899` (≥2 sends on the missing arm,
≥1 on the existing arm) is exactly the right repair, and the existing arm's
balancing send is counted only after `await balancingFlow.drainMailDispatches()`
(`test:1901`). The correction is sound and the rejection of the first run was
correct.

The load asymmetry is real: on existing iterations an extra full `register()`
runs — one hash-wasm Argon2id (`packages/crypto/src/index.ts:399-407`, main-thread
blocking; the packet's own 137.1 ms / three timer ticks confirms it), one create-branch
transaction, and one acquisition of the global `pg_advisory_xact_lock('identity:audit-chain')`
(`identity.ts:107`) against the same database. **It still cannot bias the
statistic**, and the reason is worth recording because it is what makes this
harness sound at all:

- All balancing work is confined to roughly `[t0, t0+800 ms]` — its own response
  clamp releases at `t0+600` and its send returns immediately.
- The target's grant is clamp-pinned at `t_target + 600` (Q4). Balancing
  contention would have to push the target's hash + provisioning past 600 ms to
  move it, and even if it did, the interval is anchored *from* the target's grant
  and would not move.
- The marker's provisioning runs at ≈ `t0 + 5.7 s`, with no overlap.

So the balancing flow is harmless here — but note the corollary, which is the
whole of §4: the harness proves that ~800 ms of concurrent load early in the
iteration is invisible, and says nothing about load *during* the marker's
provisioning window, where the loop and the audit-chain lock are completely idle.

### Q4 — Why did the old diagnosis predict up to 600 ms of successor clamp residue, and does `holdRegistrationEnumerationClamp(startedAt)` have zero residue at marker activation?

**Zero residue. And the old prediction is not merely unobserved here — it is
impossible in every operating point. This is the false premise.**

In the candidate, `register()` runs the clamp and *then* activates:

```
finally {
  await this.holdRegistrationEnumerationClamp(startedAt);   // registration.ts:967
  ...
  releaseMailDispatch = await activateMailDispatch();        // registration.ts:970
}
```

with `clampMs = enumeration_response_floor_ms + enumeration_tolerance_ms = 500 + 100 = 600`
(`registration.ts:439-444`, `auth-policy.ts:253-254`). Writing `s` for
`startedAt`, `p` for permit resolution and `v` for `provisionPendingAccount`
duration, the finally block is reached at `p + v`, so:

```
activation = max( s + 600 , p + v )
residue    = max( 0 , s + 600 − p − v )
```

The residue and the provisioning are **complementary through a `max()`, not
additive**. The old diagnosis (§A.5: "contains `provision(successor) + clampResidue(successor)`
— up to 600 ms of arm-dependent time") treated them as a sum. They are not. Every
millisecond the successor spends provisioning is a millisecond the clamp does not
sleep, up to the point the clamp is exhausted. Consequences:

- When `p + v < s + 600` (successor granted early), `activation = s + 600`
  exactly. The arm term cancels **completely** — the clamp *hides* the branch, it
  does not publish it. Residue is arm-dependent, but activation is not, and only
  activation is observable.
- When `p + v ≥ s + 600` (successor queued, the shallow case), residue is
  identically zero and `activation = p + v`. The observable is `v`, undiluted.

In the probe the marker waits ≈5.1 s behind the target's lease, so residue is
zero — confirmed by arithmetic, not just by assertion:
`registration_minimum_reservation_ms = 5100` (`auth-policy.ts:383`), and the
measured grant medians 5253.7–5256.5 ms minus the measured permit-to-activation
151.5–154.4 ms give 5100.1–5102.2 ms. The decomposition
`interval = 5100 + cadence + v_marker` (cadence 0, since
`nextMailDispatchActivationAt` is 5.1 s in the past) reproduces the raw numbers to
about 2 ms. The causal model is confirmed to that precision.

**So the probe is not merely at a fair operating point — it is at the maximally
exposed one.** Provisioning is published 1:1 there. That is why the two runs
constitute a genuine refutation of the clamp-residue model.

### Q5 — Are the 151–154 ms gaps arm-neutral evidence, or can the repeated existing row hide the channel through temporal/order confounding?

**The order design is sound and the accumulation confound is real but too small
to matter. This is not where the probe fails.**

Ordering is properly counterbalanced, not merely alternated: `test:1859-1863`
produces E,M,M,E,E,M,M,E… (an ABBA pattern from `existingFirst = pair % 2 === 0`),
which cancels linear ambient drift to second order. The exact-size null
(`sameArmRelabelingNull`, `test:107-137`) draws 2,048 same-arm bootstrap pairs at
the identical n=16-vs-16 group size and takes the q99 (`test:101-105`), so it
inherits each arm's own dispersion and cannot be gamed by a group-size mismatch —
the defect that was caught and fixed in rework 3.

Counterbalancing cancels *ambient* drift; it does not cancel **arm-intrinsic
accumulation**, and there is some. The existing marker is a single fixed row
(`test:1833`) hit 16 times, each duplicate transaction writing three no-op
`UPDATE … SET state=state` (`identity.ts:185-195`, each of which still produces a
new tuple version) plus one audit row plus one `recordDuplicateRegistrationPostwork`.
Dead-tuple accumulation on that row drifts the existing arm's cost upward over the
run, and — this is the part that would matter — it drifts it in the direction that
would **mask** a true `existing < missing` channel.

It does not appear to bite here. The sign of the difference flips between runs
(existing higher by 2.3 ms in run 1, lower by 1.8 ms in run 2), which is the
signature of noise, not of a monotone accumulation trend; and 16 mostly-HOT
updates on one narrow row is far too little to move a ~152 ms transaction.

**A cheap improvement is nevertheless available and should be taken**: seed 16
distinct existing addresses, one per sample, so the existing arm matches the
missing arm's freshness and the accumulation axis is removed outright. The
single-row shape is inherited from the rework-2 B1 harness and is defensible as a
threat model (an attacker does probe one address repeatedly), but it is not
required by the successor-labelled question.

### Q6 — Is there a realistic shallow operating point where a successor gets a permit <600 ms after arrival, inherits a predecessor boundary, and exposes marker-arm clamp residue?

**No — and I say that directly, because the answer follows from the `max()` in
Q4 rather than from any measurement.**

Take any operating point: unsaturated (permit immediate), shallow queue (permit
after a short wait), deep queue (permit after seconds), or hash-bound (32
concurrent Argon2id hashes delaying `Promise.all` at `registration.ts:930`). In
all of them `activation = max(s + 600, p + v)`. There are exactly two regimes:
residue positive and the arm term fully cancelled, or residue zero and `v`
published in full. **There is no intermediate regime in which residue is
partially exposed in an arm-dependent way**, because residue is defined as the
clipped complement of `p + v`, not as an independent addend. No queue geometry,
arrival phase, or concurrency level changes that identity.

So the clamp-residue channel does not exist, cannot be constructed, and no
harness will ever reproduce it on this candidate. The prior diagnosis's §A.6 item
5 asked for the successor-labelled probe precisely to settle this, the worker
built it correctly, and it settles it.

**The successor-arm exposure that *does* exist is `v` itself**, and the
aggravating condition is not a different queue shape — it is what `v` contains
and what the machine is doing while it runs. That is §3 and §4.

### Q7 — Does this evidence also refute the historical 5700-vs-5100 predecessor-arm channel?

**No, and it must not be read that way. The two channels live in different terms
and the historical fix is preserved intact.**

The predecessor leak existed because activation was stamped *before* the clamp.
With `a` the predecessor's own pre-activation work, `activatedAt = s + a` while
the transport could not start until `s + max(600, a)`, so the release resolved at
`max(activatedAt + F, s + 600 + transport)` and the in-lease term was
`max(F, 5600 − a)` — carrying the predecessor's own arm-dependent latency with a
negative coefficient. `F = 5700 = 600 + 5000 + 100` absorbs the entire clamp tail
for any `a`; `F = 5100 = 5000 + 100` absorbs only the tolerance, leaving the
difference on the wire. That is the historical A/B (`5700 → AUC 0.5664`;
`5100 → AUC 1.0000`, three times), and it is a **predecessor** term
(`clampEnd − activation`).

On the candidate, activation follows the clamp, so `clampEnd − activation ≤ 0`
and that term vanishes identically. The 5100 ms floor then only has to cover the
5000 ms transport plus 100 ms scheduler tolerance — which is *exactly* what
`derivedRegistrationMinimumReservationMs` encodes at `auth-policy.ts:500-501`.
The 5100 special case, unsound when activation preceded the clamp, is sound now,
and the load-bearing proof already exists in the record: restoring pre-clamp
activation drove the unchanged real-timeout assertion to AUC/accuracy 1.0000
(progress log 00:13, mutant restored and hash-checked at 00:37).

Distinguishing them matters for routing: the successor result says nothing about
the predecessor term, and the predecessor fix must not be reopened or re-derived
on the strength of it.

### Q8 — Do the D1 retained-object counting proof and the 45 ms cadence work remain required?

**Both remain required in full. Nothing here touches either, and nothing here is
grounds to waive either.**

- **D1 retained-object counting proof.** The claim under test is
  `retained_objects_per_occupied_slot: 0` and `maximum_retained_aggregates: 1`
  (`auth-policy.ts:289`, `:392`). A weighing statistic cannot prove a counting
  claim; at 32 refusals it cannot distinguish 0 bytes from ~20 KiB per refusal on
  a 16 KiB-page host. The rework-4 §D work stands: explicit retirement of the
  mini-wave, renaming the vestigial `nullWave`/`sustainedWave` variables, an
  N-independent count at two materially different N, a bound derived from the two
  named policy quantities, and a positive-control mutation that makes the count
  scale with N and go RED.
- **The `12 × 64 KiB` plateau threshold.** `getconf PAGESIZE` is 16384 on this
  host, confirmed in the packet, so `64 / 1024` is not this platform's RSS
  quantum and `12` traces to no threat or proof quantity. Either derive every
  factor from a named proof quantity and the real page size, or label the
  threshold truthfully as a tuned secondary tripwire. Unchanged.
- **The 45 ms cadence.** The executable guard
  `registration_activation_spacing_ms * 32 ≤ registration_minimum_reservation_ms`
  (`auth-policy.ts:510-511`) admits any value in `[0, 159]` and is not the binding
  constraint; the binding constraint is the unsaturated S3b inequality
  `hash + provisioning + k·cadence < 600` for `k < N`. Publish `N*`, encode that
  inequality, run the ±15 ms sensitivity mutations, and run the clean repetitions
  plus one sustained-load repetition. Unchanged. Note that §4 below asks for a
  sustained-load repetition of the successor probe on exactly the same principle;
  these are the same discipline applied to two gates.

---

## 3. What the probe misses: the create-branch-only DEK write inside the un-floored successor gap

Q4 establishes that in the queued regime the entire successor-arm observable is
`v` — the wall time of `provisionPendingAccount`, published 1:1 into the
grant-to-grant interval with **no floor of any kind covering it**. The 5100 ms
reservation is measured from activation and covers only the transport; the clamp
is exhausted; the cadence contributes zero. Whatever `v` differs by, the wire
differs by.

So the security question reduces to: is `v` equal across branches *by
construction*? Reading frozen `identity.ts:154-253`:

| | create (missing marker) | duplicate (existing marker) |
|---|---|---|
| DB round trips | `INSERT user`, `INSERT channel_binding(email)`, `INSERT verification_token_credential`, `INSERT channel_binding(recovery)` | `INSERT user` (0 rows), `SELECT`, 3 × no-op `UPDATE` |
| `appendAudit` | 2 Argon2id KDFs, advisory lock, head `SELECT`, `INSERT audit` | identical |
| **`beforeCommit()`** | **`FileUserDekStore.store` — 3 `mkdir`, 2 `chmod`, `mkdir`, `open`, `writeFile`, `close`** | **never called** |
| COMMIT | yes | yes |

Net: the duplicate branch has **one extra database round trip**; the create
branch has **nine extra filesystem operations**
(`packages/crypto/src/index.ts:467-495`), executed inside the transaction while
holding the global `identity:audit-chain` advisory lock, and inside the
successor's un-floored gap.

On the review host those nine operations are page-cache metadata writes to a
`mkdtemp` directory on local storage — sub-millisecond — and they are cancelled,
to within noise, by the duplicate branch's one extra round trip. That is the
whole content of `154.4/152.1` and `151.5/153.3`, and it explains why the sign
flips between runs.

**That cancellation is a property of this machine, not of the product.** Nothing
in `registration.ts`, `auth-policy.ts`, the `sizing_derivation` string
(`auth-policy.ts:394`), or the executable cross-row check at
`auth-policy.ts:502-511` bounds `|v_create − v_duplicate|`. The policy asserts
`EQUAL_TRANSPORT_WORK_EVERY_ADDRESS_ARM` and an arm-independent release, and both
are true of the *lease*; the pre-activation window is where the arm now lives, and
it carries no equal-work claim, no floor, and no assertion. On production storage
— journaled metadata, an encrypted volume, or anything with real `mkdir`/`chmod`
latency — nine metadata operations are tens of milliseconds, they appear on one
arm only, and they appear with a fixed sign.

For calibration on whether tens of milliseconds are detectable by this gate
family: progress log 13:40 records that two sustained CPU workers exposed a
**16.5 ms** register separation at AUC/accuracy 0.9375/0.9688 against a q99 of
0.8750/0.8750. This is not a hypothetical sensitivity.

I want to be precise about what I am and am not claiming. I am **not** claiming
the probe is wrong, that the worker mis-measured, or that a channel is presently
observable on this host. I am claiming that the candidate's successor-arm
indistinguishability rests on an unbounded, undeclared, host-dependent quantity
that happens to be near zero here, and that a security gate resting on an
accidental cancellation is exactly the false-green shape this seat was told to be
adversarial about.

**Aggravating factor, worth a separate look by Router:** those nine filesystem
operations are held *inside* the global audit-chain advisory lock
(`identity.ts:107`, `pg_advisory_xact_lock`, held to COMMIT). Every create-branch
registration therefore serialises every other registration's audit append behind
its DEK file write. That is an availability property independent of any
enumeration question, and it is the mechanism most likely to make `v` diverge
under real concurrency.

---

## 4. The corrected probe

Smallest change that settles it. All three items are inside the already-authorised
`tests/integration/registration-database.test.ts`, except item 3's temporary
mutation, which is one-at-a-time and restored with a hash check. No product change
is required to *run* this.

1. **Assert the sharp observable.** `markerPermitToActivation` is already
   collected (`test:1907-1909`) and already printed. Score it: AUC and
   best-threshold accuracy against its own exact-size same-arm q99 null, asserted
   alongside the existing `grantIntervals` assertions. This removes the 5100 ms
   release-timer jitter from the statistic and costs nothing — the data is in
   memory.

2. **One sustained-load repetition**, using the identical sustained-CPU-worker
   condition already used at 13:40, plus concurrent filesystem activity under
   `secretRoot`. Report both clean repetitions and the loaded one, exactly as
   rework-4 §E requires for the cadence.

3. **Positive control — this is the item that must not be skipped.** The new
   probe has never been shown capable of going RED: it was not RED-first, and the
   rework-4 §C mutant "remove or bypass the successor-labelled assertion" was not
   run. Inject a deliberate delay of **25 ms** inside `beforeCommit` only — i.e.
   in the create branch's DEK-store path, the exact asymmetry §3 identifies —
   run one iteration, restore byte-identically, and hash-check.

**Exact predicted RED observable for item 3.** Because
`interval = 5100 + v_marker` holds to ~2 ms (verified against three raw log lines
in Q4), a 25 ms create-branch-only delay must appear undiluted:

- `missing_marker_permit_to_activation_median_ms` − `existing_marker_permit_to_activation_median_ms`
  ≈ **+25 ms** (≈ 177 vs ≈ 152), with the same +25 ms shift in
  `missing_marker_median_ms` − `existing_marker_median_ms`;
- cross AUC and cross accuracy on the permit-to-activation series ≈ **1.0000**,
  against an exact-size q99 of ≈ **0.75/0.75**;
- `in_window_sends` must stay **32/32** — the injected delay is pre-activation and
  must not perturb send accounting.

If the probe does **not** go RED under a 25 ms create-branch-only delay, the probe
is vacuous and no green from it may be credited — that outcome would mean the
harness cannot see the one term it was built to see, and it must be rebuilt before
anything else proceeds. If item 3 goes RED as predicted and items 1 and 2 stay
green, the successor gap is proven both *observable* and *presently closed on
this host*, and the product blocker converts to a recorded residual with a named
platform dependency (DEK-store latency) rather than a defect.

---

## 5. What must NOT be done — the old fix list is not authorised by this analysis

The prior diagnosis's §A.6 product items were derived from the clamp-residue
model, and Q4 shows that model's premise is false. They must not be executed as
written on enumeration grounds:

- **§A.6 item 1 — raise `registration_minimum_reservation_ms` 5100 → 5700 and
  re-derive the cross-row check: do not do this on the strength of the old
  argument.** With activation after the clamp, `5100 = 5000 + 100` is exactly the
  correct derivation and is already encoded executably at `auth-policy.ts:500-501`.
  Raising it to 5700 buys no enumeration protection against the successor term and
  costs ~11.8 % throughput on a channel whose production-equivalent 100-request
  success margin is exactly zero (`test:1855`, effective burst tolerance ~103 in
  the rework-3 record). That is an availability sacrifice for a channel that does
  not exist.
- **§A.6 item 2 — activate at permit grant, provisioning inside the lease — must
  not be done alone.** It would move `v` and the clamp tail *into* the lease,
  where the 5100 ms floor covers only 5000 + 100; that reopens the predecessor
  term Q7 describes. Item 2 is only coherent paired with item 1, and the pair is
  the 600 ms throughput trade.
- **§A.6 item 3 — start `dispatchVerification` before awaiting the clamp — must
  not be done.** It decouples activation from the clamp and reinstates the
  pre-clamp oracle that the 00:13 mutation proved RED at AUC 1.0000.

**A cheaper structural option exists, and Router/V should see it before spending
600 ms.** The un-floored gap can be floored on its own terms rather than by
raising the lease: activate at `max(clampEnd, permit + B)` for a ruled
pre-activation provisioning budget `B` derived from the measured provisioning
maximum, which makes the successor gap a constant and arm-neutrality a floor
property instead of a measurement. At `B = 300 ms` against a measured `v ≈ 152 ms`
that costs ≈ 148 ms per handoff (~2.9 %) rather than 600 ms (~11.8 %). I have not
validated this against B4 or S3b and I am not prescribing it; I flag it because
the availability trade differs by a factor of four and the choice is V's.

Finally, **the existing rework-2 B1 shallow test must stay in the gate set**, and
the new successor-labelled probe must join it — but only after item 3 above
proves it can fail.

---

## Verdict

**BLOCK.**

- **The old causal model is refuted, and the false premise is nameable.**
  `holdRegistrationEnumerationClamp` and `provisionPendingAccount` compose through
  a `max()`, not a sum: `activation = max(startedAt + 600, permit + provisioning)`.
  Clamp residue is the clipped complement of provisioning, so it can never publish
  the successor's arm in any operating point — early grant and it cancels the arm
  entirely, late grant and it is identically zero. The predicted "up to 600 ms of
  successor clamp residue" does not exist and no harness will reproduce it. The
  worker's two-run trace is admissible, the hooks are correct, the send accounting
  is genuinely equal at 32/32, the ordering is properly counterbalanced, and the
  raw log lines match the packet.
- **The probe nonetheless misses a real channel.** In the queued regime the entire
  successor-arm observable is `provisionPendingAccount` duration, published 1:1
  with no floor covering it, and the two branches are not equal-cost by
  construction: the create branch performs nine filesystem operations
  (`FileUserDekStore.store`) that the duplicate branch never performs, inside the
  same transaction, inside that gap, and inside the global audit-chain advisory
  lock. On this host they are cancelled by the duplicate branch's one extra
  database round trip, which is the whole of the ~2 ms result. Nothing in the code,
  the policy, or the executable derivation bounds that difference; the candidate's
  indistinguishability is an accident of local filesystem latency at I/O
  concurrency 1.
- **The green has no demonstrated sensitivity.** The probe was not RED-first and
  the rework-4 §C "bypass the successor-labelled assertion" mutant was never run,
  so a green from it currently carries no information about whether it can fail.
- **Corrected probe (§4), materially different from the one already run:** assert
  on `markerPermitToActivation` rather than the 5100 ms-diluted interval; add one
  sustained-load repetition on the 13:40 condition; and inject a 25 ms delay in
  `beforeCommit` only, predicting `missing − existing` ≈ +25 ms, permit-to-activation
  AUC/accuracy ≈ 1.0000 against q99 ≈ 0.75/0.75, sends unchanged at 32/32.
- **The old fix list is not authorised** (§5). Items 1, 2-alone, and 3 must not be
  executed on enumeration grounds; a cheaper structural alternative that floors the
  gap directly is flagged for V at roughly a quarter of the availability cost.
- **Evidence work in rework-4 §D and §E is untouched and remains required** — the
  D1 N-independent retained-object counting proof with its positive control, the
  truthful RSS threshold on a 16 KiB-page host, and the 45 ms cadence derivation,
  sensitivity mutations, and loaded repetition.

All eight paths hashed identical at entry and exit. No test run, no mutation, no
file edited other than this report. No commit, no push, no comment, no Kanban
mutation.

**BLOCK**
