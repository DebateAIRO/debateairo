# WORKER PACKET — lane/h-diag continued · F-H-2 · diagnose the ORIGINAL T0 failure

Same seat, same worktree, same DIAGNOSIS-ONLY contract as `h-diagnosis-worker.md`. Read the
ticket `board/F-H-2-archived-revived-regression.md` first. **rework rounds: max 3.**

**Working directory (absolute, provisioned, clean at `7dda3cc0`):**
`/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/.worktrees/lane-h-diag/dialectical-engine`

**Mission directory (absolute — D41(b); my h-diag packet quoted relative paths and that was a
defect):**
`/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop`

## The failure you found behind the first one

```
tests/integration/database.test.ts:3990
  expected { …(36) } to match object { staleness_state: 'ARCHIVED_REVIVED' }
  received                                staleness_state: 'UNDER_REVIEW'
```

Your own reasoning, now orchestrator-verified: T11 (`7e5ac0d7`, 2026-09-01) is NOT an ancestor
of the T0 baseline `1c9578a` (2026-08-28), so the label assertion PASSED at T0. This staleness
assertion is the strong candidate for what T0 actually recorded, and `packages/liveness/` has
zero diff across `1c9578a..HEAD`. So if it is a product defect, it predates the mission.

## OUTCOME REQUIRED — the same shape as your last verdict

1. **Which transition the revival path takes, with persisted evidence.** The test archives a run
   and expects revival to land in `ARCHIVED_REVIVED`; it lands in `UNDER_REVIEW`. Instrument the
   scratch copy: what does the liveness state machine see at revival — the prior state, the
   trigger, the row it writes — and which branch produces `UNDER_REVIEW`?
2. **Does the expectation or the product encode the intended behaviour?** `git log -S` on the
   assertion and on the `ARCHIVED_REVIVED` transition in `packages/liveness/`. Was there ever a
   point at which this test passed? If never — the assertion may have been written for a
   transition that was never implemented, which is a third possibility beyond STALE TEST and
   PRODUCT DEFECT: **UNIMPLEMENTED EXPECTATION.**
3. **Your verdict: STALE TEST | PRODUCT DEFECT | UNIMPLEMENTED EXPECTATION**, with the one
   measurement that decides it, and what the fix lane needs.

**Do not fix.** Same rule as before, same reason.

## Contract (unchanged: READ-ONLY on product and tests) — with the file I forgot last time

```yaml
allowed:
  - /Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/logs/h-diag/**
  - /Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/agent-reports/h-diag.md          # APPEND an F-H-2 section; do not rewrite the F-H-1 diagnosis
  - /Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/agent-reports/h-diag-self.md     # same
  - /Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/TOOLING-TRAPS.md   # NOW GRANTED — append only; another lane also appends, so append, never rewrite
readonly: everything else
forbidden: any edit to product or test files
```

## Stall guard

Only `-t "claims, judges through the HTTP gateway"`. Logs under `logs/h-diag/` with an `f-h-2-`
prefix. Nothing over a few minutes in one call. Three-run law on the RED.

## Output skeleton — append to the existing report under a new h1

```
# H-DIAG — F-H-2 · round 1
## Which transition fired, with the persisted evidence
## Has this assertion ever passed
## VERDICT: STALE TEST | PRODUCT DEFECT | UNIMPLEMENTED EXPECTATION — the deciding measurement
## What the fix lane needs
## Not verified
## PREDICTIONS
```


> **Orchestrator correction 2026-09-05:** the contract block above originally used `<mission>/` placeholders — a relative-path defect (D41(b)) committed in the packet written immediately after admitting the same defect. Replaced with absolute paths. The seat received absolute paths inline in its dispatch message, so no seat action was affected; the record was wrong.
