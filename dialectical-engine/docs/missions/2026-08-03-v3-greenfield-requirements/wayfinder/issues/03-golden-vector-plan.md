# 03 — Golden-vector harvest plan

Type: research
Status: resolved
Blocked by: none

## Question

How do we capture reference input→output vectors from V2's scoring machinery so
the clean-room V3 implementation can be (a) equivalence-tested where V2's
behavior is kept, and (b) difference-tested where the four indicted semantics
are replaced — i.e. vectors that separate "same" from "intentionally better"?

## Why

Clean-room reimplementation (charting Q3) risks silent divergence from the
trusted V2 results the race depends on. Golden vectors are the protection.

## Scope

- Which vector families are needed: graph shapes (deep/wide/degenerate), edge
  weights, dedup collision cases, unjudged-node cases, abstention cases.
- Capture method: do existing test fixtures suffice, or is a V2 run harness
  needed? (If a harness is needed, say so — it graduates into a task ticket;
  do NOT build it.)
- Marking scheme: per vector, `MUST-MATCH` vs `MUST-DIFFER (indicted semantic
  #n)`.

## Inputs (read-only)

- `apps/dialectical-engine/coordinator/` tests and fixtures; scoring modules.

## Deliverable

`../../research/03-golden-vector-plan.md`, marker `RESEARCH HANDOFF COMPLETE`
at top.

## Answer

Resolved by Opus research seat — plan at
[../../research/03-golden-vector-plan.md](../../research/03-golden-vector-plan.md).

Gist: existing fixtures are INSUFFICIENT (three assets; the two literature
DF-QuAD goldens are the gem — external ground truth, zero clean-room
contamination, transfer to V3 verbatim). Decisive: **the production SQLite DB
no longer exists** — richer fixtures cannot be re-exported unless V holds a
backup (asked in ticket [26](26-carryover-scope-confirmations.md)). Harness
needed: YES, but narrow — a deterministic fake-judge, DB-backed vector
RECORDER (~40% of the surface has no surviving source of truth; the other ~60%
is pure extraction) → task ticket
[27](27-golden-vector-recorder.md), blocked by 26 (the flag baseline defines
what to record). 10 vector families / 61 groups / ~140–180 vectors; marking is
three-way — MUST-MATCH / MUST-DIFFER(a–d) / UNPINNED — with zero-UNPINNED as a
spec-readiness gate, and every MUST-DIFFER carrying `v3_forbidden` +
`unchanged_elsewhere` (without which "intentionally better" is unfalsifiable).
Two indictment-scope findings routed to ticket 26: indicted semantic (a) is at
least FOUR distinct defects (incl. a fabricated 0.7 for contradicted
evidence), and a possible FIFTH indictment — `judge_weight(..., config=None)`
makes calibration unreachable, every judge weight a constant 1.0. The "second
parallel DF-QuAD" it flagged as unowned is ticket 26's Model B item.

## Comments
