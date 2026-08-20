# S3c REWORK 1 — re-review packet (outbound send bound, route-isolated sketches, non-vacuous flood proofs)

Ticket t_86938dd1, board `accounts-phase1`. Author: Codex, session 01a019e7.
You are ONE of two blind lenses. **Refute, don't rubber-stamp.** READ-ONLY on
source; running tests REQUIRED. Establish the change set from **mtimes**, never
`git diff`. HEAD is cff3dd5. Restore any mutation and confirm byte-identity. No
commit, no push. Write `reviews/S3c-r1-<lens>-verdict.md`.

**You blocked this ticket in round 0. Under P8 you verify the fixes to the defects
you found** — you already have the harness; reuse it rather than rebuilding.

## What Codex changed (claims — verify them)

**B1 — outbound send bound, not admission.** A **20-minute row-locked resend
cooldown** (3 sends in any half-open hour) with request admission unchanged.
Claimed measurement at N=20 sources over an hour: **3 victim mails, 3 token
versions, 2 rotations, 59/59 attacker requests still admitted, and the owner
completes activation.** RED first reproduced the reported defect exactly: 60
victim mails, 60 token versions, 59 rotations.

**B2 — route-isolated, threat-model-sized sketches.** Storage is now isolated per
route and sized from an explicit **20 000-source full-budget** model: target <1%
collateral, required row width 189 825, selected power-of-two **262 144 × 2 =
524 288 slots/route**. Stated fixed upper bound: 1 572 864 slot references plus
17 301 504 timestamps = **150 994 944 primitive bytes (~144 MiB)**, *excluding JS
object overhead*. Claimed 2 000-innocent real-stack curve at 1/5/10/20 requests
per source — register 0/0/0/0.45%, verify 0/0/0.40/0.95%, resend
0/0.45/0.60/0.40% — and a register-full-budget cross-route attack refusing
**0/2 000** verify and **0/2 000** resend. The table, arithmetic, cost and
beyond-threat residual are published in the ruled register row; `per_ip` /
`per_address` retired from runtime policy with provenance.

**B3 — non-vacuous proofs.** Unit and Postgres proofs now establish 20/10/3
refusal **before** saturation; the old proofs were separately shown green against
a no-per-key mutant. The single-innocent full-occupancy test was **replaced** by
the 2 000-innocent per-route population proof (Codex states the old one had become
a misleading ~66M-HMAC gate at the new capacity).

Six new VR-10 mutants killed and restored to recorded SHA-256s. Gates: **799 tests
/ 110 files** in 168 s, typecheck, lint 28/0, `git diff --check`, empty forbidden
diff for `packages/db`, lockfile and migrations.

---

## PRIMARY QUESTION 1 — what does ~144 MiB actually cost, and is that number real?
The collateral fix was bought with memory, and the stated figure **explicitly
excludes JS object overhead**. An in-process limiter that reserves ~144 MiB of
primitives — including **17.3 million timestamps** — may cost far more in real RSS,
and may hurt in ways a slot-count table does not show.

**Measure, don't reason:**
1. **Actual RSS / heap growth** from process start through a full attack, versus
   HEAD. If the true figure is materially above 144 MiB, that is a finding.
2. **Allocation and startup cost** — does building 17.3M timestamp entries stall
   boot or first request?
3. **GC pressure and steady-state latency.** T7 already records registration at
   602 ms (N=1) → 5 940 ms (N=32) from global-lock serialisation. Re-measure the
   concurrency curve; if this change added meaningfully to it, report it.
4. Is ~144 MiB × per-route × per-process **operationally acceptable**, and is the
   cost stated anywhere an operator would see before it surprises them?

A correct-but-unaffordable limiter is a finding, not a pass. If the cost is fine,
say so in numbers.

## PRIMARY QUESTION 2 — does the owner still get in, under attack, at the boundary?
B1 fixes the volume. The defect that mattered was that the **victim could not
verify**. Attack it directly:
1. With an attacker consuming the full 3 sends/hour, can the rightful owner still
   **complete verification** — and with which token? Confirm no `VERIFICATION_TOKEN_INVALID`
   for a token the owner legitimately holds.
2. **Boundary behaviour.** "3 sends in any half-open hour" plus a 20-minute
   cooldown: probe for a fixed-window edge that permits a burst across a boundary
   (e.g. 3 late in one window + 3 early in the next), and for clock-skew or
   straddle effects. State whether the bound is genuinely rolling.
3. **The row lock.** What does it lock, for how long, and can an attacker use it to
   serialise or stall legitimate resends? Does it interact with the S3b global
   advisory lock or deadlock under concurrency? Probe it.
4. Does the owner's *own* resend get consumed by the attacker's budget — i.e. is
   this still a denial, just quieter? The pre-existing residual (attacker rotates a
   pending victim's token up to the cap) is **S3d's**, but confirm it is no worse
   than the ruled 3/hour and that Codex recorded it.

## Also attack
- **The replaced test.** Codex deleted a test a lens had disproved and substituted
  another. Removing a vacuous test is legitimate; removing coverage is not. Confirm
  the replacement asserts **at least** what the original intended, and that the
  undersized-capacity mutant still dies.
- **Re-derive the six new VR-10 mutants yourself**, especially: cooldown restored
  to 60 s, all routes forced onto one route's slots, capacity reduced to
  4 096/route, and the per-key guard made a no-op. Confirm each goes RED.
- **Re-run your own round-0 measurements** — the mail/rotation ceiling at N≥20 and
  the per-route collateral population — against the new tree. Your numbers, not the
  progress log's.
- **Cross-route isolation:** verify it structurally, not just by the one attack
  direction tested (try each route flooding each other route).
- **The published operator table:** is it accurate against what you measure, and is
  the beyond-threat-model residual stated honestly? A published number that is
  wrong is worse than none.
- **Frozen scope by mtime:** S3a, S3b (durability + equal-work oracle), S3d mail
  semantics beyond the send cap, T4, crypto, identity schema, migrations, lockfile.
  **Re-run the S3b oracle and durability tests** — the send cap touches
  `packages/db/src/identity.ts` and sits on the registration path.
- Gates reproduce (799 tests / 110 files, lint 28/0); VR-3 still holds.
- Confirm D1 properties 1/2/4 and D3 still hold after the resize — they were
  verified on the old structure, and the structure changed.

## Verdict
GREENLIGHT or BLOCK + numbered findings with file:line evidence and measured
numbers. If BLOCK, state exactly what proof lifts it.
