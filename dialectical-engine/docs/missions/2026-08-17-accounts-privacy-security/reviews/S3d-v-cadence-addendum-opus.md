# S3d Decision-3 cadence addendum — fresh Claude Opus advisor

Read-only product-decision advisor for V and Router. This is **not** a formal
peer review and carries no authority over product, policy, tests, progress,
packets, Kanban, or git state. No test was run, no mutation applied, no file
other than this memo created or edited. Nothing committed, pushed, commented, or
transitioned.

I did not open any prior formal Grok or Opus verdict. Everything below derives
from the packet's read-in-full list: the prior advisor memo, the cadence-repeat
packet, `S3d-progress.log`, `auth-policy.ts`, the exact cadence test at
`registration-database.test.ts:3410-3611`, and ticket `t_cc197ed2` through the
`worker-blocked — CADENCE REPEAT DATA READY FOR V/ROUTER` handoff.

## 0. Frozen integrity

All eight paths hashed identical at entry and exit; zero drift.

| path | SHA-256 (entry == exit) | packet |
|---|---|---|
| `apps/api/src/registration.ts` | `c5846a86b64b1941d917be6dd9f2d27b06fab400f6ca9fdfd036b8d72ec2b27e` | match |
| `packages/register/src/auth-policy.ts` | `ed57e4d75b189bbf45b0c1f0a508ec64ba342423e84f9ae6e99a0b9213b0efe4` | match |
| `tests/integration/registration-database.test.ts` | `d51af60a81e80326bdb806ab74ebcb3cd51ca1eb7eaac95f31f1f179779e59be` | match |
| `tests/unit/registration.test.ts` | `2c8b4458037fafb54183ed4e0d3524d3788343665c42736481bdb7612a9b340b` | match |
| `apps/api/src/mail-channel.ts` | `2a0fe03910bdbb4629138722b136164d5f1a156181bd0d7b90e460e8dc0131c8` | match |
| `packages/db/src/identity.ts` | `c57266d3bb8314ca63d5635db88057ec0d5aa20dc319546c49735725572e9c5b` | match |
| `migrations/0033_verification_token_credentials.sql` | `34fadf7cd618c165d82d71536001628f7dff9165648c10c03f51beb6c4d94e2f` | match |
| `tests/integration/identity-database.test.ts` | `05ebf0c907ceb6efe532c7eef367dcc731d4ee33138c53e495153a44590e9432` | match |

---

## 1. Retraction and replacement of the midpoint claim

**Retracted, without reservation.** The prior memo (my predecessor seat's
§ Decision 3) argued that `30 < cadence < 60` was a *two-sided admissible
interval* and that 45 sits at its interior midpoint. The lower edge of that
interval rested entirely on one 30 ms RED. The repeat data destroys that reading:
the exact same title, at the same cadence, on unchanged source, produced RED once
and GREEN once. A boundary that moves between runs is not an interval edge.

The correct count is worse than "split," and V should have it stated plainly:
across **all three** 30 ms observations the result is **2 RED / 1 GREEN**
(historical 102.2 ms RED, repeat-1 115.8 ms RED, repeat-2 59.6 ms GREEN). That is
a failure *rate*, not a failure *threshold*, and at n=3 the rate is estimated to
essentially no precision at all.

### What remains proven

1. **The upper bound, executably.** `derivedClampHeadroomMs = 600 − (480 + N*·cadence)`
   is computed at `auth-policy.ts:560-564` and must be both equal to the published
   `binding_headroom_ms` and strictly positive, or `authPolicyFromRegisterRows`
   throws `AUTH_POLICY_INVALID` (`:576-577`). At `N*=2` this forces `cadence < 60`;
   at exactly 60 the headroom is 0 and the row is rejected. The `30 → 29` headroom
   mutant went RED and was restored, so the check is load-bearing.
   **Caveat V should carry:** this is a *derivation-consistency* bound, not an
   independent physical one. Its inputs (436 ms measured maximum, 110 % safety,
   hence the 480 ms ruled bound) are themselves measurements. It proves the ruled
   tuple is internally coherent and that 45 fits inside it; it does not prove 45
   is physically necessary.
2. **N\*=2 on shipped code, executably.** The 45 ms branch at `:3577-3587` asserts
   N=2 hash+provisioning ≤ 480 ms, N=2 clamp headroom ≥ 30 ms, and N=3 headroom
   < 0. This block runs *only* when the cadence is 45 (`:3577`), which is why the
   30 ms runs are silent on it.
3. **Every 45 ms observation is GREEN.** Across the definitive full suite
   (818 tests, 00:35), the shipped-code cadence check (02:41), and the dedicated
   confirmation (03:17), no run at 45 ms has ever gone RED on this gate.

### What is now merely observed

The **lower bound, entirely.** There is no evidence that 30 ms is inadmissible —
only that it fails often. And there is no evidence that 45 ms is *required*; there
is only evidence that it has not yet failed.

### What survives that the prior memo did not use

The binary RED/GREEN bracket is gone, but the underlying continuous measures still
order the three cadence settings in the safe direction, and that ordering does not
depend on the single RED:

| cadence | N=8 median gap (ms), ceiling 100 | N=8 AUC, ceiling .800 |
|---|---|---|
| 30 ms | 59.6, 102.2, 115.8 (mean 92.5, sd 29.3) | .620, .716, .774 (mean .703, sd .078) |
| 45 ms | 51.4 published; two further runs known ≤ 100 | .525, .618, .642 (mean .595, sd .062) |
| 60 ms | 12.1 (n=1) | .529 (n=1) |

Central tendency falls monotonically as cadence rises, on both measures, at every
step. That is a consistent *ordering*, not a proof: the AUC separation between 30
and 45 is ≈ .108 with pooled sd ≈ .070 at n=3 per arm — Welch t ≈ 1.9, p ≈ .13.
**Suggestive, not significant.** I will not dress it up as more.

One further correction to the record, because it cuts against the row rather than
for it: the row's `NON_MONOTONIC_SENSITIVITY` conclusion is now a *worse*
description than the data supports in either direction. Nothing observed is
non-monotonic. What is true is "monotone in central tendency, with run-to-run
noise comparable to the entire effect."

---

## 2. Can 45 ms still be recommended at N\*=2?

**Yes — and the new evidence, correctly read, is not evidence against 45 ms.**

The split removes a *reason to prefer* 45 over 30. It produces no observation at
45 ms that is worse than before, no product change, and no change to the
executable upper bound. The worst gap ever recorded on this gate (115.8 ms) came
from 30 ms; the risk ordering is unchanged and, if anything, reinforced.

But V must accept two honest consequences, and neither is optional:

**(a) The real new risk is instrument flakiness, not a privacy channel.** The
30 ms repeats establish that this harness can move an N=8 median gap by 56 ms
between identical runs (sd ≈ 29 ms). Nothing about the cadence parameter changes
the measurement variance — that noise process operates at 45 ms too. The single
published 45 ms margin is 100 − 51.4 = **48.6 ms ≈ 1.7 of those standard
deviations.** I will not convert that into a failure probability: the sd comes
from n=3, the 45 ms variance has never been measured (one published gap value,
two further runs known only to be ≤ 100), and the packet is right that confidence
must not be manufactured from this boundary. The honest statement is: **a future
RED at 45 ms with no code change is plausible and unquantified.** It would be a
false alarm on a CI gate, not a security regression, but a formal reviewer who
hits it will read it as a defect.

**(b) The published `cadence_sensitivity` row is no longer adequate.** This is
the one item I would make blocking, and it is cheap. The row at
`auth-policy.ts:429-443` (schema `:199-213`, mirrored in `tests/unit/registration.test.ts:393-407`)
publishes `minus_15_ms: { cadence_ms: 30, result: "RED", n8_median_gap_tenths_ms: 1022, n8_auc_ppm: 716000 }`
as an unqualified `z.literal`. As a record of one observation it is literally
true — and the `sizing_derivation` prose is carefully hedged with "30 ms was RED
once." But the structured field reads as a characterization of cadence 30, and it
now sits in the same repository as a progress line recording a wholly GREEN 30 ms
run. Any formal reviewer will find that in minutes and it will read as an
overclaim.

The upper datum has the same defect and nobody has said so: `plus_15_ms` GREEN is
also **n=1**. Worse, the 00:13 progress entry records that "the frozen S3b
distribution required a 45 ms registration cadence" — i.e. the distribution was
failing at the then-current 60 ms cadence. That run is **not** comparable to the
02:41 sweep (it predates the pre-clamp-activation fix landed in the same entry),
so it does not refute the 60 ms GREEN. But it does mean **both** published
sensitivity data points are single draws from an instrument now proven to have
run-to-run noise on the order of the effect.

I checked the blast radius before recommending this: `cadence_sensitivity` has
**zero product consumers** — it is read only by the Zod schema and one unit-test
assertion. Recutting it is four literal edits plus prose in three places, no
product behavior change, no re-derivation, and no re-running of the S3b
distribution set. The `sizing_derivation` regex at `:214` does not constrain the
disclosure clause, so honest text can be added without breaking it.

---

## 3. Trade of each live option

Quantified from the recorded numbers and from the mechanism in source. Where a
figure is my arithmetic rather than a measurement, it is labelled.

### 3A′ — Keep 45 ms at N\*=2; recut the sensitivity disclosure (advisor pick)

- **Security/privacy:** unchanged. No measured quantity got worse; no gate
  weakened. The published claim becomes strictly more truthful.
- **Availability:** **zero.** No product change.
- **Cost:** one contained policy-row + unit-test edit in the coding session,
  re-gated. All existing 45 ms distribution greens remain valid evidence because
  the value does not move.
- **Residual risk:** the gate carries an unquantified false-RED rate at 45 ms.
  Named, not eliminated.

### 3B — Recut to 60 ms with N\*=1

The prior memo called this "defensible, at the price of re-running S3b." Two
things it did not check make it materially worse than that.

- **It requires publishing a false measurement.** The executable check forces
  `first_measured_unabsorbed_concurrency = N* + 1` (`:578-579`). At `N*=1` that
  field must read 2. But the empirical absorption criterion is
  `600 − (measured max + N·cadence) < 0` (`:3532-3534`), and at cadence 60 with
  the measured N=2 maximum of 416–437 ms that is `600 − (437 + 120) = +43 ms` —
  **N=2 is still absorbed at 60 ms.** N\*=1 would understate capability in a
  field whose name asserts a measurement. Keeping the honest `N*=2` is not
  available either: `600 − (480 + 2·60) = 0`, which trips
  `derivedClampHeadroomMs <= 0` and throws `AUTH_POLICY_INVALID`. **Cadence 60 is
  reachable only by a row that contradicts its own measurement.**
- **Its availability cost lands on the thin margin and is probably fatal.**
  `scheduleMailDispatchActivation` (`registration.ts:583-596`) advances a single
  **global** cursor: `scheduledAt = max(now, nextActivationAt)`, then
  `nextActivationAt = scheduledAt + spacing`. Under saturation, activations are
  strictly serialized at one per cadence interval and the delay is **cumulative
  down the whole chain**, not per-wave. At burst 100 that is 99 × 15 ms ≈
  **+1.5 s** to the last activation (≥ +1.0 s even counting only the ~68 queued
  waiters), against a **measured 498 ms** queue-deadline margin (max accepted wait
  17.502 s vs the 18.000 s deadline, progress log 00:35). *This is my arithmetic
  from the recorded mechanism, not a measurement* — but the sign is certain and
  the magnitude is 2–3× the margin. 3B should be presumed to turn the availability
  gate RED until a B4 re-run says otherwise.
- **Reversibility:** low-to-medium. Beyond the row, `registrationMailDispatchActivationSpacingMs`
  is a literal *type* (`:499`), so the change touches the interface, the
  derivation prose regex, the unit test, and requires re-running the full S3b
  distribution set at the new value.

### 3B′ — Interior recut (50 or 55 ms) at the honest N\*=2

Admissible on the executable check (`600 − (480 + 110) = +10`;
`600 − (480 + 100) = +20`). I raise it only to reject it: there is **zero**
measured evidence distinguishing 50 or 55 from 45, it shrinks the published ruled
headroom from 30 ms to 10–20 ms, and it discards every existing 45 ms green while
buying nothing observable. Strictly worse than 3A′.

### 3C — More evidence before review (repeat 45 ms n times)

- **Security:** no change either way; this buys calibration, not safety.
- **Cost:** each repetition of that title is a real-PostgreSQL run of the full
  N=1/2/3/4/8 sweep. To bound a false-RED rate to anything useful you need on the
  order of 10+ runs, and a handful would leave V roughly where the 30 ms data
  left the last memo — which is the exact failure mode being corrected.
- **Verdict:** poor value *before* review. Genuinely valuable *as* the
  recalibration trigger, which is where I route it.

### 3D — Structural redesign before review

Not recommended, and the new evidence does not move it. Nothing observed shows
the cadence mechanism is wrong. It shows one parameter is empirically ordered
rather than derived, on an instrument noisier than anyone had established. That
is a calibration and disclosure status, not a design defect.

---

## 4. Replacement Decision 3 block for V

```
S3d V RULING — DECISION 3 (REPLACES the 45 MS CADENCE block) — 2026-08-__

WHAT CHANGED: the 30 ms lower bound is not reproducible. Same title, same
source: 2 RED / 1 GREEN across three runs (gaps 102.2 / 115.8 / 59.6 ms).
The "30 < cadence < 60 two-sided interval" argument is RETRACTED.
STILL PROVEN: cadence < 60 at N*=2, executably, mutation-killed.
STILL TRUE: every 45 ms run ever recorded is GREEN.
NOW KNOWN: this gate's run-to-run noise (sd ~29 ms at N=8) is comparable to
45 ms's own 48.6 ms margin. A future false RED at 45 ms is plausible.

[ ] 3A'  KEEP 45 ms at N*=2.  Recut the cadence_sensitivity row to disclose
         30 ms as 2-of-3 RED with its range, mark the 60 ms GREEN as n=1,
         and replace "NON_MONOTONIC" with the honest description. Record a
         recalibration trigger (host/storage class change, or a first RED
         at 45 ms). No product change. Availability cost zero.  (ADVISOR PICK)

[ ] 3B   RECUT to 60 ms / N*=1.
         NOTE: forces first_measured_unabsorbed_concurrency = 2, which
         CONTRADICTS measurement (N=2 is still absorbed at 60 ms, +43 ms).
         N*=2 at 60 ms throws AUTH_POLICY_INVALID (headroom exactly 0).
         NOTE: est. +1.0-1.5 s at burst 100 on a measured 498 ms deadline
         margin — presume the availability gate goes RED. Requires B4 re-run
         plus the full S3b distribution set at the new value.

[ ] 3B'  RECUT to 50 / 55 ms at N*=2. No evidence distinguishes it from 45;
         shrinks ruled headroom to 10-20 ms; discards existing greens.

[ ] 3C   MORE EVIDENCE before review: repeat the 45 ms title ___ times.
         NOTE: needs ~10+ runs to bound a false-RED rate; fewer reproduces
         the n=1 error being corrected here.

[ ] 3D   STRUCTURAL REDESIGN before review.              (not recommended)

DISCLOSURE RECUT (required under 3A', independent of the above):
[ ] YES — recut cadence_sensitivity before formal review   (ADVISOR PICK)
[ ] NO  — ship the row as-is and let formal review rule on it
```

**One unambiguous advisor recommendation: 3A′ — keep 45 ms at N\*=2, with the
disclosure recut applied and re-gated before formal review.** The split is
evidence about the *instrument*, not about 45 ms. It removes a reason to prefer
45 over 30; it supplies no reason to leave 45. Every alternative either publishes
a claim the measurement contradicts (3B), spends the whole availability margin
(3B), buys nothing measurable (3B′), or repeats the sample-size error that
produced this addendum (3C at small n).

---

## 5. Effect on Decisions 1A, 2A, and the leaked-token ratification

**Decision 1A (successor provisioning residual) — unchanged.** The cadence
evidence comes from the S3b live-mail distribution probe; the successor residual
is a different probe measuring create-vs-duplicate provisioning. No cadence change
is proposed, so nothing propagates. Two honest notes, neither of which flips the
choice:

- The noise finding is a general caution about single greens from these timing
  harnesses, which makes 1A's own framing — *accept a named residual under an
  instrument of limited precision, with a revalidation trigger* — more clearly
  right, not less.
- It does **not** undercut the +25 ms sensitivity control. That control produced
  AUC/accuracy 1.0000/1.0000 twice against a q99 null near .75, with deltas of
  +27.9 and +26.6 ms against a predicted +25. That effect is far outside the noise
  band established here. The sensitivity floor survives intact.

**Decision 2A (availability target) — unchanged, but now explicitly coupled to
Decision 3.** No cadence evidence bears on the burst measurement. However, per
§ 3B, choosing any larger cadence consumes the 498 ms queue-deadline margin
through the global activation cursor. **2A stands as written only if V rules 3A′
or 3B′; under 3B, 2A must be re-measured before it can be accepted.** V should
see that dependency before ticking two boxes independently.

**Leaked-token ratification — unchanged.** Token TTL, resend semantics, and
selective-revocation absence (`auth-policy.ts:276`) have no connection to cadence
measurement. It still requires V's signature for the reasons the prior memo gave.

---

## 6. May S3d proceed to formal review?

**Yes, conditional on two things**, and only these two:

1. **V rules** on Decisions 1, 2, 3 and the leaked-token ratification. Unchanged
   from the prior memo.
2. **The `cadence_sensitivity` disclosure recut is applied and re-gated in the
   original coding session before review is scheduled.** As shipped, the row
   publishes an unqualified `result: "RED"` for cadence 30 alongside a progress
   log recording a GREEN 30 ms run, and an unqualified `result: "GREEN"` for
   cadence 60 that is n=1. Formal reviewers can rule on a disclosed limitation;
   they cannot be asked to ratify a row the repository's own evidence undercuts.
   The edit is contained — `cadence_sensitivity` has no product consumers — and
   does not require re-running the distribution set.

Nothing else in S3d is gated by this addendum. If V rules 3A′ and the recut is
made, S3d is ready for formal visible Grok plus fresh visible Claude Opus review
against the ruled positions. Any option requiring a value change (3B, 3B′, 3D)
returns to the original coding session and re-earns its gates — including a B4
availability re-run — before review is scheduled.

---

## 7. Advisor summary

The prior memo's two-sided bracket is retracted. What replaces it is narrower but
sturdier: an executable upper bound of `cadence < 60` at `N*=2`, an unbroken
record of greens at 45 ms, and a consistent but statistically insignificant
ordering of the continuous measures across 30 / 45 / 60. The 30 ms split is
evidence that the *instrument* is noisier than anyone had established — which is
a disclosure problem and a flakiness risk, not a privacy finding. 45 ms remains
the right value to carry into formal review, because every alternative costs
either a false published claim, the availability margin, or nothing bought at
all. The row must stop presenting single draws as characterizations before
reviewers are asked to rule on it.

No test run, no mutation, no product/policy/test/progress/packet/board edit, no
commit, no push, no comment, no Kanban transition. All eight paths hashed
identical at entry and exit. This memo is the only file created.

V must still rule.

BLOCK
