# WORKER PACKET — lane/h-diag · F-SEALEDROWS-H · diagnose, do not yet fix

**Working directory (verified to exist):**
`/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/.worktrees/lane-h-diag/dialectical-engine`
— branch `lane/h-diag`, base tip `7dda3cc0d3305c96e62dadb77f1eb941165d633a` (integration).

You run ALONGSIDE lane/sealedrows, which holds `tests/integration/database.test.ts` for WRITING.
You are READ-ONLY on it, in your own worktree. Concurrency is safe by measurement:
`tests/support/testDatabase.ts` allocates the embedded postgres port with `listen(0)` and a
`mkdtemp` data directory, so two worktrees running database tests cannot collide.

You are a WORKER seat in DIAGNOSIS mode. Load `heartbeat-protocol`, `heartbeat-worker`,
`superpowers:using-superpowers`, and `superpowers:systematic-debugging` — that last one is the
whole job. **rework rounds: max 3.**

## The failure — stable-red since T0, never diagnosed

```
× tests/integration/database.test.ts > apps/runner — legal command lifecycle >
  claims, judges through the HTTP gateway, propagates, serves, and settles
  → expected { …(36) } to match object { verdict_state: 'SUPPORTED', …(4) }
```

Observed: `CONTESTED` with mark `LABEL-BASIS-INCOMPLETE`. In T0's stable-red authority at
`t00-baseline.md:196` as `X | X | X`; `×` in D15 b11 and b12. Ticket:
`board/F-SEALEDROWS-H-known-red-unticketed.md`.

## A hypothesis to TEST, not to assume

`LABEL-BASIS-INCOMPLETE` is T11's arm 0 (S06 SPEC, goal lines 196-221): *margin ABSENT (single
root: no runner-up exists) OR disagreement ABSENT (fewer than two parseable judgements)*. The
test asserts `provider.calls()` is **3** — one author call plus a two-member panel on what looks
like a **single root**. A single root has no runner-up, so margin is ABSENT, so arm 0 fires, so
the label is CONTESTED **by design**. T11 landed in this mission; this test's `SUPPORTED`
expectation may predate it and encode the retired binary derivation.

**If that is true, the test is stale and the product is correct.** If it is false — the fixture
does seed two roots, or dispersion is what is absent — the product may be wrong on the path a
real run takes. **Distinguish these two. That is the deliverable.**

## OUTCOME REQUIRED

A diagnosis that names the ROOT CAUSE with evidence from the run, not from reading:
1. Which arm of the ladder fired and WHY — instrument or inspect the persisted `disagreement`,
   margin, and root set for this fixture's run.
2. Whether the expectation predates T11 — `git log -S "verdict_state: 'SUPPORTED'"` on the test
   against the T11 landing commit.
3. Your verdict: STALE TEST or PRODUCT DEFECT, with the one measurement that decides it.

**Do not fix it in this round.** A fix to a stale expectation and a fix to a product defect are
different lanes with different reviewers; a diagnosis that ships a fix has pre-judged which. File
the fix as the next ticket with its evidence attached.

## Contract (READ-ONLY on product and tests)

```yaml
allowed:
  - dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/logs/h-diag/**
  - dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/agent-reports/h-diag.md
  - dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/agent-reports/h-diag-self.md
readonly: everything else
forbidden: any edit to product or test files
```

Temporary instrumentation in a scratch copy is fine; nothing lands.

## Stall guard

Run ONLY `-t "claims, judges through the HTTP gateway"` — never the whole file, never the
cluster. Log every run. Nothing over a few minutes in one call.

## Output skeleton

```
# H-DIAG — round 1
## Which arm fired, with the persisted evidence
## Does the expectation predate T11
## VERDICT: STALE TEST | PRODUCT DEFECT — the one deciding measurement
## What the fix lane needs
## Not verified
## PREDICTIONS
```

Self-report at `agent-reports/h-diag-self.md` before FULLY DONE.
