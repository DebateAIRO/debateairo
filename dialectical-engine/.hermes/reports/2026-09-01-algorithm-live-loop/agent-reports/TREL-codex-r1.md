CODEX REVIEW TREL r1 — CHANGES · comments read through: trel-r1-2026-09-01

# CODEX REVIEW TREL r1

## VERDICT

CHANGES — round r1. Two BLOCKING findings require rework or missing verification; three
NON-BLOCKING process/packet findings require tickets. This is rework round 1 of the lawful
maximum 3.

## FINDINGS

### B1

- **BLOCKING · WHAT:** blank overrides change an existing typed-loud failure path. All
  three start functions eagerly evaluate `resolveXBinary()` as an argument to
  `resolveTestGuardedCommand`. Concrete input: `testOnlyCommand` supplied plus
  `ACCEPTANCE_*_BINARY=" "`. In `NODE_ENV=test`, the patched code throws
  `*_CLI_BINARY_UNRESOLVED` instead of selecting the fake command; outside test it throws
  that new code instead of the pre-existing `TEST_ONLY_*_COMMAND_FORBIDDEN`. The tests
  called “keeps the ... test command seam ahead” use a non-blank nonexistent path, so they
  do not exercise the throwing arm.
- **WHERE:** `dialectical-engine/acceptance/claude-relay.ts:177-182`,
  `grok-relay.ts:123-128`, `model-shim.ts:176-181`; the throw is
  `relay-core.ts:133-137`, while the preserved guard is `relay-core.ts:99-110`.
- **WHY:** worker packet `trel-relay.md:18-21` and DECISIONS D10 require typed-loud
  failure paths unchanged. The worker itself discloses the eager throw at
  `agent-reports/trel-relay.md:288-291`. Under the lane's hard bounds, this behavioral
  expansion is blocking.
- **SUGGESTED FIX:** resolve the environment-backed default lazily only when no
  `testOnlyCommand` is present, leaving `resolveTestGuardedCommand` authoritative for both
  selecting a test seam and rejecting it outside test. Add no-provider regression arms for
  blank overrides in test mode and for the exact `TEST_ONLY_*_COMMAND_FORBIDDEN` precedence
  outside test.

### B2

- **BLOCKING · CANNOT-ASSESS · WHAT:** the mandatory completed full-suite evidence is
  absent. The current READY report says `pnpm test` was abandoned after 20 tests and has no
  command exit or passed/total. Therefore the repository-wide regression result and full
  failure membership cannot be assessed from the authorized static evidence.
- **WHERE:** `agent-reports/trel-relay.md:150-185`; required by worker packet
  `trel-relay.md:27-33`.
- **WHY:** the packet requires exit code, passed/total, and every failure classified before
  handoff. Three stable 92/94 blast-radius runs, a clean 52/52 cluster, and typecheck improve
  confidence but do not substitute for the named full suite. The aborted log supports the
  worker's saturation diagnosis; it does not close the DoD.
- **SUGGESTED FIX:** route or run the required full suite at the reworked commit on an
  unsaturated machine, tee the complete log, record exit plus passed/total, and
  name/attribute every failure against a valid base run when needed. Re-review only against
  that stable evidence snapshot.

### N1

- **NON-BLOCKING · WHAT:** the worker packet uses relative report, self-report, and
  `logs/trel/**` paths that do not resolve from its stated working directory. The worker
  consequently created logs in the worktree first and later relocated them.
- **WHERE:** `packets/trel-relay.md:7-10,27,35-37,46,49`; impact recorded at
  `agent-reports/trel-relay.md:326-332`.
- **WHY:** reviewer contract §1 requires packet paths to resolve from the seat's working
  directory. Ambiguous artifact roots cost liveness visibility and retry effort.
- **SUGGESTED FIX:** render absolute report/self-report/log paths, or declare one absolute
  mission artifact root and state that every relative artifact path is anchored there.

### N2

- **NON-BLOCKING · WHAT:** the reviewer packet retains template-instantiation prose and
  cites “goal-prompt.md lines” without an actual line range.
- **WHERE:** `packets/trel-codex-r1.md:2,17-19`.
- **WHY:** reviewer contract §1 requires quoted constants and line numbers to be checkable.
  The missing range forced an unnecessarily broad search whose 623-line output was
  truncated; D10 was still independently settleable from DECISIONS and F8.
- **SUGGESTED FIX:** reject unrendered packet template text and provide the concrete Global
  DoD range (`goal-prompt.md:28-40`) alongside the D10 range.

### N3

- **NON-BLOCKING · WHAT:** the worker published the READY marker before its report/log
  evidence was stable. This reviewer first read a 326-line report whose full-suite row was
  `pending`; while review was active it became a 431-line report with a different suite
  disposition and five new suite logs. HEAD stayed `7583464`.
- **WHERE:** `agent-reports/trel-relay.md:1,150-185,414-428` and the board's
  `waiting_review` transition.
- **WHY:** heartbeat router §2.4 makes the board/marker the state. Mutating the handoff
  artifact after READY can generate stale or phantom findings and forced this review to
  reconcile the evidence twice.
- **SUGGESTED FIX:** finish and verify the report/log set before publishing READY; then
  freeze that round's artifacts, or put a report content hash in the handoff so reviewers
  can detect and reject a moving snapshot immediately.

## PACKET REVIEW

NON-CONFORMANT due to N1 and N2. N3 is a handoff-execution defect rather than packet text.
Otherwise, the worker packet has the required four
elements; base `1c9578a`, branch `lane/trel`, all three constant values/line numbers, D10/F8,
the no-provider rule, and the commit prefix are correct. Its mandatory deliverables fit the
declared writable surface. The `when it lands — or yours` language at lines 31-33 provides
a fallback and is not itself a defect.

## EVIDENCE CHECKED

- Board ticket: `waiting_review`, high risk, verifier route includes this Codex static
  review, cursor `packet-trel-2026-09-01`.
- Git: base `1c9578a` resolves; HEAD is `7583464`; log contains exactly
  `7583464 TREL: resolve maker CLI binaries from ACCEPTANCE_*_BINARY overrides`; working
  tree was clean. Diff is 8 files, 303 insertions / 7 deletions, all under
  `dialectical-engine/acceptance/`; the outside-acceptance diff check returned 0 and
  `git diff --check` emitted no diagnostics.
- Base constants checked with `git show 1c9578a`: Claude line 27, Grok line 12, Codex line
  15 exactly match D10. Patched absent-key resolvers return those unchanged literals.
- Independent static probe: traced each production call graph into the three start
  functions and applied JavaScript argument-evaluation order to the blank-key throwing arm
  (B1). No package test or provider process was run by this reviewer.
- Provider-spend boundary: the new Claude/Grok default-command tests first set their env
  key to a temporary executable wrapper that execs `process.execPath` with local
  `fake-*-cli.mjs`; Codex has no default-command spawn test; the remaining new start tests
  use `testOnlyCommand`. Static inspection found no new live provider path in the tests.
- RED log `red1-integration.log`: exit 1, 2 failed / 23 passed (25); both failures are the
  new env-override spawn assertions at the base's absent Claude/Grok defaults. RED2: exit 1,
  15 failed / 37 passed (52), on the missing resolver exports/functions.
- GREEN logs: base cluster 34/34; patched cluster runs 1-3 each 52/52 with exit 0
  (durations 9.73s, 9.80s, 9.37s). Mutant logs match the report: M1 1/19 failed, M2 5/52,
  M3 4/52, M4 1/19, M5 52/52 green.
- Later evidence that landed during review: blast-radius runs 1-3 each exit 1 with the same
  2 failed / 92 passed (94), namely `adversarial-corpus` DB-01 and `dual-maker-proof`;
  worker base attribution is recorded at report lines 201-228. Final cluster is 52/52,
  `FINAL_EXIT=0`.
- Typecheck log: `TYPECHECK_EXIT=0`, 0 reported TypeScript errors. The patched full-suite
  log is explicitly aborted and has no final exit/passed-total; full-suite status was not
  verified (B2). The report/log mutation after READY was observed and reconciled (N3).

## PREDICTIONS

I expect another lens may accept the worker's “test seam outranks the override” wording and
M4 result without trying a blank value, because the non-throwing override arm is green. I
also expect a source-focused lens may treat the later blast-radius runs as a substitute for
the packet's abandoned full suite. I would check eager argument evaluation at the three
start functions first, then reconcile every `## SUITES` row against an existing
exit-bearing log.
