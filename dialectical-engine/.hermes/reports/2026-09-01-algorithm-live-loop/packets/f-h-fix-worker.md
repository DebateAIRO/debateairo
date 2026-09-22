# WORKER PACKET — lane/h-fix · F-H-2 (product) + F-H-1 (test) · one lane, one green test

**DO NOT DISPATCH until lane/sealedrows has merged into integration.** That lane edited
`tests/integration/database.test.ts`; this one edits the same file. Branch from the post-merge
integration tip, and re-derive every line number below against it before you rely on one.

**Working directory (absolute; the h-diag worktree, fast-forwarded to the post-merge tip before
dispatch — 0 local commits, `node_modules` present, so the ff is guaranteed and no re-provisioning):**
`/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/.worktrees/lane-h-diag/dialectical-engine`
— branch `lane/h-diag`. Verify `git rev-parse HEAD` equals the integration tip the orchestrator
names in your dispatch message before you start; if it does not, STOP. Your earlier diagnosis logs
under `logs/h-diag/` stay; write this lane's under `logs/h-fix/`.

You are a WORKER seat. Load `heartbeat-protocol`, `heartbeat-worker`, `superpowers:using-superpowers`;
floor `test-driven-development`, `verification-before-completion`, `systematic-debugging`,
`receiving-code-review`. **rework rounds: max 3.**

**Mission directory (absolute):**
`/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop`

Read first, in this order: `board/F-H-2-archived-revived-regression.md`,
`board/F-H-1-stale-supported-expectation.md`, then the diagnosis they rest on —
`agent-reports/h-diag.md` in full, both h1 sections. Everything in those was orchestrator-verified;
you inherit a diagnosis, not a hypothesis. **Your reviewer will ALSO verify that diagnosis** — if
you find it wrong anywhere, stop and say so before you fix anything.

## Why one lane

The lifecycle test `claims, judges through the HTTP gateway, propagates, serves, and settles` has
TWO independent causes stacked under one name. Fix the label alone and it stays red on staleness;
fix staleness alone and it stays red on the label. Neither fix can be PROVEN green without the
other. So both land here, and the deliverable is that test **green for the right reasons**.

## F-H-2 first — the product defect (the older cause)

`packages/liveness/src/index.ts:144` calls `core.run_private_content_is_live(run.run_id)`
unguarded. That helper is a v1-encrypted-run predicate wearing a general name: it returns `false`
for a run with no private content, which with encryption off by default is the ordinary run. So
`recordQuery` finds zero candidates, writes nothing, and a re-asked archived run stays archived.
Eleven sibling call sites guard it with `CASE WHEN content_encryption_version = 1 THEN … ELSE true END`
(e.g. `:205` in the same file). `2d1f86b8` (2026-08-28) introduced this by replacing two explicit
`NOT EXISTS` clauses.

**OUTCOME REQUIRED:** `recordQuery` treats a run with no private content as live, consistently
with its siblings, and a re-asked archived run reaches `ARCHIVED_REVIVED` with its `QUERY`
liveness event written. Mechanism is yours (D58) — guard the call, or restore the explicit
clauses `970870f3` wrote, or make the helper honest about its precondition; say which and why.

**Blast radius you must cover, not just the one test:** `recordQuery`'s `QUERY` event feeds
`sweep`'s `HAVING` and `decideRetirement`'s `lastQueriedAt`. Add or extend a test proving that
with encryption OFF, a query refreshes liveness. The lifecycle test alone does not pin that.

**RED first:** the RED exists — three-run law, the `ARCHIVED_REVIVED` assertion (`:3990` at the diagnosis tip `7dda3cc0`; **`:4035` in the post-sealedrows-merge tree** — re-derived by pattern against merge-tree object `c5850f73` (final lane tip `a6948439`; `e943e0b3` was the earlier tip's, same line numbers re-verified); the lifecycle test itself starts at `:3906` there). Capture it before touching
anything.

## F-H-1 second — the stale expectation (the newer cause)

Only after F-H-2 is green on staleness will the label assertion be the LAST thing red.
Replace `verdict_state: 'SUPPORTED'` with the ladder's actual output for a one-maker, one-judge
fixture — `CONTESTED` with the `LABEL-BASIS-INCOMPLETE` mark — and say in the assertion WHY (rung
0, both limbs absent, by design under T11; goal lines 196-221). **Do not touch the fixture** to
manufacture a runner-up; a single-root run is a legitimate shape and the test should pin what it
serves.

## Contract

```yaml
allowed:
  - dialectical-engine/packages/liveness/src/index.ts
  - dialectical-engine/packages/liveness/src/**            # if the honest-helper route needs a sibling
  - dialectical-engine/tests/integration/database.test.ts
  - dialectical-engine/tests/unit/**                         # a liveness unit test for the encryption-off path
  - dialectical-engine/tests/integration/liveness*.test.ts   # if one exists or you create one
  - dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/logs/h-fix/**
  - dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/agent-reports/h-fix.md
  - dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/agent-reports/h-fix-self.md
  - dialectical-engine/.hermes/TOOLING-TRAPS.md      # D61: APPEND ONLY — another lane also appends; append, never rewrite
forbidden: all_others
```

`packages/db/src/index.ts:485` (`assertPrivateContentLive`) is ALSO unguarded and has zero
callers. It is **not in your contract** and not this ticket: name it in your report if you
touch its neighbourhood, do not fix it.

No board or DECISIONS edits. No push, no merge, no self-Done. Never mint, read, or pass a
credential value; BLOCKED `waiting_human` if only a credential can unblock you.

## Stall guard

Scope every run: `-t "claims, judges through the HTTP gateway"` for the lifecycle test, single
files otherwise, logs under `logs/h-fix/`, nothing over a few minutes in one call. Never two
gate-runs in one worktree writing one log — that corrupted a record in the diagnosis lane and
`gate-run.sh`'s CLEAN-STATE check is what caught it.

## Output skeleton

```
# H-FIX — <round>
## What changed
## F-H-2 · VERDICT / CONFIDENCE / STRONGEST COUNTER
## F-H-1 · VERDICT / CONFIDENCE / STRONGEST COUNTER
## Blast radius: the encryption-off liveness refresh, proven
## RED evidence
## GREEN evidence
## Suites
## Not verified
## PREDICTIONS
```

Self-report at `agent-reports/h-fix-self.md` before FULLY DONE.
