CODEX REVIEW TREL r2 — CHANGES · comments read through: trel-r2-2026-09-01

# CODEX REVIEW TREL r2

## VERDICT

CHANGES — one BLOCKING finding. The six requested `testOnlyCommand` regression arms are
fixed and D13 closes r1 B2, but the same precedence defect remains on Codex's existing
`testOnlySessionsRoot` typed-loud path. Round r3 is the last lawful rework round.

## FINDINGS

### B1

- **BLOCKING · WHAT:** lazy command resolution still pre-empts the pre-existing Codex
  sessions-root guard when no `testOnlyCommand` is supplied. Concrete input:
  `NODE_ENV=production`, `ACCEPTANCE_CODEX_BINARY=" "`,
  `testOnlySessionsRoot=<fixture>`, and `testOnlyCommand` absent. At r2,
  `resolveTestGuardedCommand` sees no command seam and forces the default thunk, so the
  outcome is `CODEX_CLI_BINARY_UNRESOLVED`. At base `1c9578a`, the constant default cannot
  throw and the next check yields the required
  `TEST_ONLY_CODEX_SESSIONS_ROOT_FORBIDDEN`.
- **WHERE:** `dialectical-engine/acceptance/model-shim.ts:176-185`; the r2 tests at
  `model-shim.test.ts:289-320` cover only cases where `testOnlyCommand` is supplied.
- **WHY:** D10 (`DECISIONS.md:136-146`) requires typed-loud failure paths unchanged. R1 B1
  identified eager default resolution as the cause; r2 moved it behind the command-seam
  guard but not behind this second existing guard. The report's claim that malformed binary
  configuration no longer pre-empts the test guards is therefore incomplete.
- **EVIDENCE:** static evaluation-order probe against current lines 176-185 and base
  `1c9578a:model-shim.ts:163-172`. Repository search found exactly four relevant guard
  codes across the touched relays: the three `TEST_ONLY_*_COMMAND_FORBIDDEN` paths now
  covered, plus `TEST_ONLY_CODEX_SESSIONS_ROOT_FORBIDDEN`, which is not.
- **SUGGESTED FIX:** preserve the baseline ordering for both Codex seams: when a command
  seam exists, its selector/rejection remains first; when it is absent, reject a forbidden
  `testOnlySessionsRoot` before forcing the binary-default thunk. Add a no-provider RED→GREEN
  arm using the concrete input above and asserting the exact sessions-root code. Both the
  current failure and the desired result occur before any CLI invocation.

## R1 FINDING DISPOSITION

- **B1:** partially fixed. The lazy thunk and all six requested command-seam arms are
  correct; B1 above is the remaining Codex sibling path.
- **B2:** closed by D13 (`DECISIONS.md:222-231`), which assigns the authoritative full
  `pnpm test` to the serial judge stage before integration. The worker no longer overclaims
  a completed full suite.
- **N1/N2:** ticketed and cured by board F12.
- **N3:** did not recur. The line-2 body hash matched on both reads, and the report remained
  408 lines / 24,046 bytes during this review.

## PACKET REVIEW

CONFORMANT. The ticket status, absolute writable paths, r1 convergence artifact, commit
range, D13 disposition, r2 marker/cursor, static-only restriction, and maximum-round warning
all resolve and agree with the authoritative artifacts. Mandatory outputs fit the two-file
writable surface.

## EVIDENCE CHECKED

- Revised-report integrity command output, verbatim on both reads:

```text
3f0ca65893ee31008e4ae792da99b9328c590abadd792d2b27f585bc166c21e3  -
```

  This equals the embedded line-2 hash for body lines 4 through EOF.
- Git log output, verbatim:

```text
848deb4 TREL r2: resolve the env-backed default lazily so the test seam guard stays authoritative
7583464 TREL: resolve maker CLI binaries from ACCEPTANCE_*_BINARY overrides
```

  HEAD is `848deb484c7552bcbfd3968b9a14f39731a3c822`; worktree status was clean.
  The r2-only diff is 7 files, 112 insertions / 5 deletions, all under
  `dialectical-engine/acceptance/`. The full base diff remains inside `acceptance/`, the
  outside-surface check returned `OUTSIDE_ACCEPTANCE_DIFF_EXIT=0`, and `git diff --check`
  emitted no diagnostics.
- Static call trace: `resolveTestGuardedCommand` has exactly three callers; all now pass
  lazy thunks. Claude and Grok have only the command seam. Codex additionally checks
  `testOnlySessionsRoot` after the thunk may be forced, producing B1.
- R2 RED log summary, copied verbatim:

```text
 Test Files  3 failed | 1 passed (4)
      Tests  6 failed | 52 passed (58)
   Duration  10.65s (transform 138ms, setup 0ms, import 1.06s, tests 8.68s, environment 0ms)

R2RED_EXIT=1
```

  The six failures are exactly the two new command-seam arms for Claude, Grok, and Codex
  against the r1 implementation.
- R2 GREEN tee logs: runs 1-3 each report 4/4 files and 58/58 tests with exits 0;
  durations are 10.73s, 10.39s, and 10.13s. M6 reproduces exactly 6/58 failures; M1 kills
  1/58, M2's clean rerun kills 5/58, and M3 kills 4/58, matching the revised report.
- R2 typecheck log contains `TYPECHECK_EXIT=0`. The blast-radius log reports the same two
  base-attributed failures and 98/100 tests; no new failure membership was introduced.
- Provider-spend boundary: every new r2 arm supplies `testOnlyCommand`; test-mode arms use
  local fake CLIs, and production-mode arms reject before invocation. No r2 test adds a
  default Codex spawn. No test, build, provider process, or git mutation was run by this
  reviewer.

## NOT VERIFIED

The full `pnpm test` was not run or claimed here; D13 reserves its authoritative execution
for the serial judge stage. Dynamic verification of B1 was prohibited by the r2 packet, so
the counterexample is a static evaluation-order proof and must receive RED→GREEN evidence
in r3.

## PREDICTIONS

I expect another lens may approve because the r2 packet's named two-arm matrix is complete
for every `testOnlyCommand` and M6 discriminates it cleanly. I expect it may miss that Codex
alone has a second test-only option whose guard comes after default resolution. I would
first inventory every `TEST_ONLY_*` code in the touched start path, then test exception
precedence with each other test-only option absent and present.
